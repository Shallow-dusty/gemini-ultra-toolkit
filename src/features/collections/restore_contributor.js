import { fail } from './errors.js';
import {
    getNowIso,
    isRecord,
    normalizeCollection,
    normalizeCollectionsState,
    normalizeId,
    normalizeItemId,
    normalizeSessionId,
    resolveCollectionLimits,
    safeClone
} from './model.js';

export const COLLECTIONS_RESTORE_SECTION = 'collections';

const EXECUTABLE_ACTIONS = Object.freeze(['insert', 'replace', 'rename']);

function assertMethod(port, method, label) {
    if (!port || typeof port[method] !== 'function') {
        throw new TypeError(`${label} must implement ${method}()`);
    }
}

function unwrapRepositoryResult(result) {
    return result?.format === 'primer-pp.storage' && Object.prototype.hasOwnProperty.call(result, 'data')
        ? result.data
        : result;
}

function declaredSessionId(repository) {
    return repository.boundAccountId
        ?? repository.accountId
        ?? repository.scope?.targetUserId
        ?? repository.scope?.sessionUserId;
}

function createServiceBackend(service) {
    const port = service?.api ?? service;
    for (const method of ['getSnapshot', 'importJson', 'setNotebooksAvailability', 'flush']) {
        assertMethod(port, method, 'Collections service');
    }
    return Object.freeze({
        owner: null,
        read: () => port.getSnapshot(),
        async replace(state) {
            await port.importJson(safeClone(state), { mode: 'replace' });
            const imported = await port.getSnapshot();
            if (JSON.stringify(imported.native) !== JSON.stringify(state.native)) {
                await port.setNotebooksAvailability(safeClone(state.native.notebooks));
            }
            await port.flush();
        }
    });
}

function createRepositoryBackend(repository) {
    for (const method of ['get', 'update', 'flush']) {
        assertMethod(repository, method, 'Collections repository');
    }
    return Object.freeze({
        owner: declaredSessionId(repository),
        read: () => repository.get(),
        async replace(state) {
            await repository.update(() => safeClone(state));
            await repository.flush();
        }
    });
}

function assertSignal(signal) {
    if (signal === null || signal === undefined) return;
    if (!signal || typeof signal !== 'object' || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
        fail('INVALID_ABORT_SIGNAL', 'Collections restore signal must implement AbortSignal');
    }
}

function throwIfAborted(signal) {
    assertSignal(signal);
    if (signal?.aborted) fail('RESTORE_ABORTED', 'Collections restore was aborted');
}

function assertContext(context, phase) {
    if (!isRecord(context)) fail('INVALID_RESTORE_CONTEXT', `Collections ${phase} context must be an object`);
    if (context.section !== COLLECTIONS_RESTORE_SECTION) {
        fail('INVALID_RESTORE_SECTION', `Collections contributor cannot handle ${String(context.section)}`);
    }
    if (!isRecord(context.plan)) fail('INVALID_RESTORE_CONTEXT', `Collections ${phase} plan must be an object`);
    if (!Array.isArray(context.actions)) {
        fail('INVALID_RESTORE_CONTEXT', `Collections ${phase} actions must be an array`);
    }
}

function normalizeAction(action, limits) {
    if (!isRecord(action) || !isRecord(action.value)) {
        fail('INVALID_RESTORE_ACTION', 'Collections restore actions must contain an object value');
    }
    if (action.section !== COLLECTIONS_RESTORE_SECTION || !EXECUTABLE_ACTIONS.includes(action.action)) {
        fail('INVALID_RESTORE_ACTION', 'Collections restore action is not executable', {
            section: action.section,
            action: action.action
        });
    }
    const incomingId = normalizeId(action.incomingIdentity, 'Incoming collection id', limits);
    const targetId = normalizeId(action.targetIdentity, 'Target collection id', limits);
    if (action.value.id !== undefined && normalizeId(action.value.id, 'Collection value id', limits) !== incomingId) {
        fail('RESTORE_IDENTITY_MISMATCH', 'Collection value id does not match incomingIdentity', {
            incomingId,
            valueId: action.value.id
        });
    }
    if (action.action === 'rename') {
        if (!isRecord(action.identityPatch) || action.identityPatch.field !== 'id' ||
            normalizeId(action.identityPatch.value, 'Renamed collection id', limits) !== targetId ||
            incomingId === targetId) {
            fail('INVALID_RESTORE_RENAME', 'Collection rename must patch id to a distinct targetIdentity');
        }
    } else if (action.identityPatch !== null || incomingId !== targetId) {
        fail('RESTORE_IDENTITY_MISMATCH', 'Insert and replace actions must retain the incoming collection id');
    }
    return {
        action: action.action,
        incomingId,
        targetId,
        value: safeClone(action.value)
    };
}

function normalizeParentId(value, identityMap, limits) {
    if (value === null || value === undefined || value === '') return null;
    const sourceId = normalizeId(value, 'Parent collection id', limits);
    return identityMap.get(sourceId) ?? sourceId;
}

function normalizeMemberItemIds(value, limits) {
    if (value === undefined) return null;
    if (!Array.isArray(value)) {
        fail('INVALID_RESTORE_MEMBERSHIPS', 'Collection memberItemIds must be an array');
    }
    return [...new Set(value.map(itemId => normalizeItemId(itemId, limits)))].sort();
}

function prepareActions(actions, state, options, signal) {
    const isolatedActions = safeClone(actions, 'Collections restore actions');
    const normalizedActions = [];
    const identityMap = new Map();
    for (const action of isolatedActions) {
        throwIfAborted(signal);
        const normalized = normalizeAction(action, options.limits);
        const mapped = identityMap.get(normalized.incomingId);
        if (mapped !== undefined && mapped !== normalized.targetId) {
            fail('DUPLICATE_RESTORE_IDENTITY', 'One incoming collection id maps to multiple targets', {
                incomingId: normalized.incomingId
            });
        }
        identityMap.set(normalized.incomingId, normalized.targetId);
        normalizedActions.push(normalized);
    }

    const unique = new Map();
    let deduplicated = 0;
    for (const action of normalizedActions) {
        throwIfAborted(signal);
        const collection = normalizeCollection({
            ...action.value,
            id: action.targetId,
            parentId: normalizeParentId(action.value.parentId, identityMap, options.limits)
        }, { limits: options.limits, nowIso: options.nowIso });
        const memberItemIds = normalizeMemberItemIds(action.value.memberItemIds, options.limits);
        const signature = JSON.stringify({ action: action.action, collection, memberItemIds });
        const previous = unique.get(action.targetId);
        if (previous) {
            if (previous.signature !== signature) {
                fail('DUPLICATE_RESTORE_TARGET', 'Conflicting collection actions share one target id', {
                    targetId: action.targetId
                });
            }
            deduplicated += 1;
            continue;
        }
        unique.set(action.targetId, { ...action, collection, memberItemIds, signature });
    }

    const collections = safeClone(state.collections);
    const counts = { insert: 0, replace: 0, rename: 0 };
    for (const action of unique.values()) {
        throwIfAborted(signal);
        const existingIndex = collections.findIndex(collection => collection.id === action.targetId);
        if (action.action === 'replace') {
            if (existingIndex < 0) {
                fail('RESTORE_TARGET_NOT_FOUND', `Collection replace target does not exist: ${action.targetId}`);
            }
            collections[existingIndex] = action.collection;
        } else {
            if (existingIndex >= 0) {
                fail('RESTORE_TARGET_EXISTS', `Collection restore target already exists: ${action.targetId}`);
            }
            collections.push(action.collection);
        }
        counts[action.action] += 1;
    }

    const membershipMap = new Map(state.memberships.map(membership => [
        membership.itemId,
        new Set(membership.collectionIds)
    ]));
    for (const action of unique.values()) {
        if (action.memberItemIds === null) continue;
        for (const ids of membershipMap.values()) ids.delete(action.targetId);
        for (const itemId of action.memberItemIds) {
            const ids = membershipMap.get(itemId) ?? new Set();
            ids.add(action.targetId);
            membershipMap.set(itemId, ids);
        }
    }
    const memberships = [...membershipMap]
        .map(([itemId, collectionIds]) => ({ itemId, collectionIds: [...collectionIds] }))
        .filter(membership => membership.collectionIds.length > 0);

    const data = normalizeCollectionsState({ ...state, collections, memberships }, {
        sessionId: state.sessionId,
        limits: options.limits,
        nowIso: options.nowIso
    });
    return {
        data,
        result: {
            section: COLLECTIONS_RESTORE_SECTION,
            applied: unique.size,
            deduplicated,
            inserted: counts.insert,
            replaced: counts.replace,
            renamed: counts.rename,
            collectionIds: [...unique.keys()].sort()
        }
    };
}

/**
 * Create the section-owned portable restore port for Collections.
 *
 * This factory intentionally knows nothing about panels, composition, or the
 * portable executor. Exactly one existing Collections service or repository is
 * injected, and every returned/accepted value is clone-isolated.
 */
export function createCollectionsRestoreContributor({
    service,
    repository,
    sessionId,
    clock,
    limits = {}
} = {}) {
    if ((service === undefined) === (repository === undefined)) {
        throw new TypeError('Inject exactly one Collections service or repository');
    }
    if (typeof clock !== 'function') throw new TypeError('Collections restore clock must be a function');
    const resolvedLimits = resolveCollectionLimits(limits);
    const explicitSessionId = sessionId === undefined ? null : normalizeSessionId(sessionId);
    const backend = service === undefined
        ? createRepositoryBackend(repository)
        : createServiceBackend(service);
    const owner = backend.owner === undefined || backend.owner === null
        ? null
        : normalizeSessionId(backend.owner);
    if (explicitSessionId !== null && owner !== null && explicitSessionId !== owner) {
        fail('SESSION_BOUNDARY', 'Collections restore repository belongs to another session', {
            expected: explicitSessionId,
            actual: owner
        });
    }

    function normalizeState(raw, expectedSessionId = null, nowIso = getNowIso(clock)) {
        const source = unwrapRepositoryResult(raw);
        const activeSessionId = normalizeSessionId(
            expectedSessionId ?? explicitSessionId ?? source?.sessionId ?? owner
        );
        return normalizeCollectionsState(source, {
            sessionId: activeSessionId,
            limits: resolvedLimits,
            nowIso
        });
    }

    async function readState(signal = null) {
        throwIfAborted(signal);
        const state = normalizeState(await backend.read());
        throwIfAborted(signal);
        return state;
    }

    async function replaceAndVerify(target) {
        await backend.replace(safeClone(target));
        const restored = normalizeState(await backend.read(), target.sessionId);
        if (JSON.stringify(restored) !== JSON.stringify(target)) {
            fail('RESTORE_VERIFY_FAILED', 'Collections storage did not retain the requested restore state');
        }
        return restored;
    }

    async function snapshot(context) {
        assertContext(context, 'snapshot');
        return safeClone(await readState(context.signal));
    }

    async function apply(context) {
        assertContext(context, 'apply');
        throwIfAborted(context.signal);
        const current = await readState(context.signal);
        const before = normalizeState(context.snapshot, current.sessionId);
        if (JSON.stringify(current) !== JSON.stringify(before)) {
            fail('RESTORE_STATE_CHANGED', 'Collections changed after the restore snapshot was taken');
        }
        const prepared = prepareActions(context.actions, current, {
            limits: resolvedLimits,
            nowIso: getNowIso(clock)
        }, context.signal);
        throwIfAborted(context.signal);
        await replaceAndVerify(prepared.data);
        throwIfAborted(context.signal);
        return safeClone(prepared.result);
    }

    async function rollback(context) {
        assertContext(context, 'rollback');
        const target = normalizeState(context.snapshot);
        const restored = await replaceAndVerify(target);
        return safeClone({
            section: COLLECTIONS_RESTORE_SECTION,
            restoredCollections: restored.collections.length,
            restoredMemberships: restored.memberships.reduce(
                (total, membership) => total + membership.collectionIds.length,
                0
            )
        });
    }

    return Object.freeze({ snapshot, apply, rollback });
}
