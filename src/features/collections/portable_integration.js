import { fail } from './errors.js';
import { safeClone } from './model.js';
import {
    COLLECTIONS_RESTORE_SECTION,
    createCollectionsRestoreContributor
} from './restore_contributor.js';

function sessionScope(session) {
    return session && typeof session === 'object' && !Array.isArray(session) &&
        session.scope && typeof session.scope === 'object' && !Array.isArray(session.scope)
        ? session.scope
        : session;
}

/** Resolve a host/storage session into the identity Collections can bind. */
export function resolveCollectionsSessionAccess(session, temporarySessionId = 'Guest') {
    const value = session || temporarySessionId;
    const scope = sessionScope(value);
    const objectScope = scope && typeof scope === 'object' && !Array.isArray(scope);
    const target = objectScope && typeof scope.targetUserId === 'string' && scope.targetUserId.trim()
        ? scope.targetUserId.trim()
        : value;
    const readOnly = objectScope && (
        scope.readOnly === true || scope.kind === 'inspection' || scope.mode === 'inspection' || (
            typeof scope.sessionUserId === 'string' && typeof scope.targetUserId === 'string' &&
            scope.sessionUserId !== scope.targetUserId
        )
    );
    return Object.freeze({ controllerSession: target, readOnly: readOnly === true });
}

function assertArchiveSignal(signal) {
    if (signal === null || signal === undefined) return;
    if (!signal || typeof signal !== 'object' || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
        fail('INVALID_ABORT_SIGNAL', 'Collections archive signal must implement AbortSignal');
    }
}

function throwIfArchiveAborted(signal) {
    assertArchiveSignal(signal);
    if (signal?.aborted) fail('RESTORE_ABORTED', 'Collections archive operation was aborted');
}

function archiveCollectionRecords(snapshot) {
    const members = new Map(snapshot.collections.map(collection => [collection.id, []]));
    for (const membership of snapshot.memberships) {
        for (const collectionId of membership.collectionIds) {
            members.get(collectionId).push(membership.itemId);
        }
    }
    return [...snapshot.collections]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(collection => {
            const memberItemIds = members.get(collection.id).sort();
            return safeClone(memberItemIds.length ? { ...collection, memberItemIds } : collection);
        });
}

/**
 * Keep the production archive port session-bound without exposing the
 * underlying service or repository to composition code.
 */
export function createCollectionsPortableIntegrationManager({
    getRuntime,
    getClock
} = {}) {
    if (typeof getRuntime !== 'function') throw new TypeError('Collections archive getRuntime must be a function');
    if (typeof getClock !== 'function') throw new TypeError('Collections archive getClock must be a function');
    let generation = 0;
    let binding = null;

    function invalidate() {
        generation += 1;
        binding = null;
    }

    function bind(access, force = false) {
        const runtime = getRuntime();
        if (!runtime?.controller.active || !runtime.controller.sessionId) {
            fail('SERVICE_INACTIVE', 'Collections archive integration requires an active session');
        }
        const next = Object.freeze({
            sessionId: runtime.controller.sessionId,
            readOnly: access?.readOnly === true
        });
        const changed = force || !binding || binding.sessionId !== next.sessionId ||
            binding.readOnly !== next.readOnly;
        if (changed) generation += 1;
        binding = next;
    }

    function assertCurrent(token, writable) {
        const runtime = getRuntime();
        if (!runtime?.controller.active || !binding) {
            fail('SERVICE_INACTIVE', 'Collections archive integration requires an active session');
        }
        if (token.generation !== generation || token.sessionId !== binding.sessionId ||
            token.sessionId !== runtime.controller.sessionId) {
            fail('SESSION_CHANGED', 'Collections session changed after archive integration was captured');
        }
        if (writable && binding.readOnly) {
            fail('READ_ONLY_SESSION', 'Collections inspection sessions cannot restore portable archives');
        }
        return runtime;
    }

    function getIntegration() {
        const runtime = assertCurrent({ generation, sessionId: binding?.sessionId }, false);
        const token = Object.freeze({ generation, sessionId: binding.sessionId });
        const delegate = createCollectionsRestoreContributor({ service: runtime.service, clock: getClock(runtime) });
        const invoke = async (method, context) => {
            const current = assertCurrent(token, true);
            const result = await delegate[method](context);
            if (method !== 'snapshot') await current.controller.refresh();
            assertCurrent(token, true);
            return result;
        };
        const contributor = Object.freeze({
            snapshot: context => invoke('snapshot', context),
            apply: context => invoke('apply', context),
            rollback: context => invoke('rollback', context)
        });
        const exportSection = async ({ signal = null } = {}) => {
            const current = assertCurrent(token, false);
            throwIfArchiveAborted(signal);
            const snapshot = await current.service.getSnapshot();
            throwIfArchiveAborted(signal);
            assertCurrent(token, false);
            return archiveCollectionRecords(snapshot);
        };
        return Object.freeze({ section: COLLECTIONS_RESTORE_SECTION, exportSection, contributor });
    }

    return Object.freeze({ bind, getIntegration, invalidate });
}
