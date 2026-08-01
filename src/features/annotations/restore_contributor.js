import { cloneStorageValue } from '../../storage/clone.js';
import { migrateAnnotationsData, normalizeAnnotation } from './domain.js';
import { AnnotationsFeatureError } from './feature.js';

export const ANNOTATIONS_RESTORE_SECTION = 'annotations';

const EXECUTABLE_ACTIONS = new Set(['insert', 'replace', 'rename']);

function fail(code, message) {
    throw new AnnotationsFeatureError(code, message);
}

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sessionId(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) fail('SESSION_BOUNDARY', 'Annotations restore requires a session identity');
    return normalized;
}

function assertSignal(signal) {
    if (signal === undefined || signal === null) return;
    if (!isRecord(signal) || typeof signal.aborted !== 'boolean'
        || typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function') {
        fail('INVALID_ABORT_SIGNAL', 'Annotations restore signal must implement AbortSignal');
    }
}

function throwIfAborted(signal) {
    assertSignal(signal);
    if (signal?.aborted) fail('RESTORE_ABORTED', 'Annotations restore was aborted');
}

function assertContext(context, phase) {
    if (!isRecord(context) || context.section !== ANNOTATIONS_RESTORE_SECTION
        || !isRecord(context.plan) || !Array.isArray(context.actions)) {
        fail('INVALID_RESTORE_CONTEXT', `Annotations ${phase} context is invalid`);
    }
    return context;
}

function unwrapRepositoryResult(value) {
    return value?.format === 'primer-pp.storage' && Object.hasOwn(value, 'data') ? value.data : value;
}

function stateFrom(value) {
    return migrateAnnotationsData(unwrapRepositoryResult(value));
}

function sameState(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function requireMethod(owner, method, label) {
    if (typeof owner?.[method] !== 'function') {
        throw new TypeError(`${label} must implement ${method}()`);
    }
}

function repositoryOwner(repository) {
    return repository.boundAccountId
        ?? repository.accountId
        ?? repository.scope?.targetUserId
        ?? repository.scope?.sessionUserId;
}

function createRepositoryBackend(repository, options) {
    requireMethod(repository, 'get', 'Annotations repository');
    requireMethod(repository, 'update', 'Annotations repository');
    const flush = typeof repository.flush === 'function' ? () => repository.flush() : async () => {};
    const owner = sessionId(options.sessionId ?? repositoryOwner(repository));
    const currentSession = options.getSessionId ?? (() => owner);
    const readOnly = options.isReadOnly ?? (() => repository.scope?.readOnly === true);
    return Object.freeze({
        owner,
        currentSession,
        readOnly,
        read: () => repository.get(),
        async applyAtomic(before, next) {
            await repository.update(raw => {
                if (!sameState(stateFrom(raw), before)) {
                    fail('RESTORE_STATE_CHANGED', 'Annotations changed after the restore snapshot');
                }
                return cloneStorageValue(next);
            });
            await flush();
        },
        async replace(next) {
            await repository.update(() => cloneStorageValue(next));
            await flush();
        }
    });
}

function createServiceBackend(service, options) {
    for (const method of ['getSessionId', 'isReadOnly', 'getSnapshot', 'importJson']) {
        requireMethod(service, method, 'Annotations service');
    }
    const owner = sessionId(options.sessionId ?? service.getSessionId());
    const replace = async next => {
        await service.importJson(
            cloneStorageValue(next),
            { mode: 'replace', conflict: 'incoming' },
            { sessionId: owner }
        );
    };
    return Object.freeze({
        owner,
        currentSession: () => service.getSessionId(),
        readOnly: options.isReadOnly ?? (() => service.isReadOnly()),
        read: () => service.getSnapshot(),
        async applyAtomic(before, next) {
            if (!sameState(stateFrom(service.getSnapshot()), before)) {
                fail('RESTORE_STATE_CHANGED', 'Annotations changed after the restore snapshot');
            }
            await replace(next);
        },
        replace
    });
}

function normalizeAction(raw) {
    const action = cloneStorageValue(raw);
    if (!isRecord(action) || action.section !== ANNOTATIONS_RESTORE_SECTION
        || !EXECUTABLE_ACTIONS.has(action.action) || !isRecord(action.value)) {
        fail('INVALID_RESTORE_ACTION', 'Annotations restore action is not executable');
    }
    const incomingId = sessionId(action.incomingIdentity);
    const targetId = sessionId(action.targetIdentity);
    const incoming = normalizeAnnotation(action.value);
    if (incoming.id !== incomingId) {
        fail('RESTORE_IDENTITY_MISMATCH', 'Annotation id does not match incomingIdentity');
    }
    if (action.action === 'rename') {
        if (!isRecord(action.identityPatch) || action.identityPatch.field !== 'id'
            || action.identityPatch.value !== targetId || incomingId === targetId) {
            fail('INVALID_RESTORE_RENAME', 'Annotation rename must patch id to a distinct targetIdentity');
        }
    } else if (action.identityPatch !== null || incomingId !== targetId) {
        fail('RESTORE_IDENTITY_MISMATCH', 'Annotation insert and replace must preserve identity');
    }
    return Object.freeze({
        action: action.action,
        id: targetId,
        annotation: normalizeAnnotation({ ...incoming, id: targetId })
    });
}

function applyActions(state, actions, signal) {
    const annotations = cloneStorageValue(state.annotations);
    const seen = new Set();
    const counts = { insert: 0, replace: 0, rename: 0 };
    for (const raw of cloneStorageValue(actions)) {
        throwIfAborted(signal);
        const action = normalizeAction(raw);
        if (seen.has(action.id)) fail('DUPLICATE_RESTORE_TARGET', `Duplicate annotation target: ${action.id}`);
        seen.add(action.id);
        const exists = Object.hasOwn(annotations, action.id);
        if (action.action === 'replace' ? !exists : exists) {
            fail('RESTORE_PLAN_STALE', `Annotation restore target is stale: ${action.id}`);
        }
        annotations[action.id] = action.annotation;
        counts[action.action] += 1;
    }
    return {
        state: stateFrom({ version: state.version, annotations }),
        result: Object.freeze({
            section: ANNOTATIONS_RESTORE_SECTION,
            applied: seen.size,
            inserted: counts.insert,
            replaced: counts.replace,
            renamed: counts.rename,
            annotationIds: [...seen].sort()
        })
    };
}

/** Pure section port; persistence and active-session checks are injected. */
export function createAnnotationsRestoreContributor(options = {}) {
    if (!isRecord(options) || (options.service === undefined) === (options.repository === undefined)) {
        throw new TypeError('Inject exactly one Annotations service or repository');
    }
    if (options.isCurrent !== undefined && typeof options.isCurrent !== 'function') {
        throw new TypeError('Annotations isCurrent must be a function');
    }
    if (options.getSessionId !== undefined && typeof options.getSessionId !== 'function') {
        throw new TypeError('Annotations getSessionId must be a function');
    }
    if (options.isReadOnly !== undefined && typeof options.isReadOnly !== 'function') {
        throw new TypeError('Annotations isReadOnly must be a function');
    }
    const backend = options.service === undefined
        ? createRepositoryBackend(options.repository, options)
        : createServiceBackend(options.service, options);

    function assertActive() {
        let current;
        try {
            current = sessionId(backend.currentSession());
        } catch {
            fail('SESSION_CHANGED', 'Annotations restore port is no longer active');
        }
        if (current !== backend.owner || options.isCurrent?.() === false) {
            fail('SESSION_CHANGED', 'Annotations restore port belongs to an expired session');
        }
    }

    function assertWritable() {
        assertActive();
        if (backend.readOnly()) fail('READ_ONLY_SESSION', 'Annotations inspection sessions are read-only');
    }

    async function read(signal) {
        throwIfAborted(signal);
        assertActive();
        const state = stateFrom(await backend.read());
        assertActive();
        throwIfAborted(signal);
        return state;
    }

    async function snapshot(context) {
        const input = assertContext(context, 'snapshot');
        assertWritable();
        return Object.freeze({
            section: ANNOTATIONS_RESTORE_SECTION,
            sessionId: backend.owner,
            state: cloneStorageValue(await read(input.signal))
        });
    }

    function snapshotState(value) {
        if (!isRecord(value) || value.section !== ANNOTATIONS_RESTORE_SECTION
            || value.sessionId !== backend.owner || !isRecord(value.state)) {
            fail('INVALID_RESTORE_SNAPSHOT', 'Annotations restore snapshot is invalid');
        }
        return stateFrom(value.state);
    }

    async function apply(context) {
        const input = assertContext(context, 'apply');
        throwIfAborted(input.signal);
        assertWritable();
        const before = snapshotState(input.snapshot);
        const current = await read(input.signal);
        if (!sameState(current, before)) fail('RESTORE_STATE_CHANGED', 'Annotations changed after snapshot');
        const prepared = applyActions(current, input.actions, input.signal);
        assertWritable();
        await backend.applyAtomic(before, prepared.state);
        assertWritable();
        throwIfAborted(input.signal);
        if (!sameState(await read(input.signal), prepared.state)) {
            fail('RESTORE_VERIFY_FAILED', 'Annotations storage did not retain the restored state');
        }
        return cloneStorageValue(prepared.result);
    }

    async function rollback(context) {
        const input = assertContext(context, 'rollback');
        assertActive();
        const before = snapshotState(input.snapshot);
        await backend.replace(before);
        assertActive();
        if (!sameState(await read(null), before)) fail('RESTORE_VERIFY_FAILED', 'Annotations rollback verification failed');
        return Object.freeze({ section: ANNOTATIONS_RESTORE_SECTION, restored: true, annotations: Object.keys(before.annotations).length });
    }

    return Object.freeze({ snapshot, apply, rollback });
}

/** Session-bound export + restore integration without exposing persistence. */
export function createAnnotationsPortableArchiveIntegration({ service, isCurrent, isReadOnly } = {}) {
    const contributor = createAnnotationsRestoreContributor({ service, isCurrent, isReadOnly });
    const capturedSession = service.getSessionId();
    async function exportSection({ signal } = {}) {
        throwIfAborted(signal);
        if (service.getSessionId() !== capturedSession || isCurrent?.() === false) {
            fail('SESSION_CHANGED', 'Annotations archive integration belongs to an expired session');
        }
        const state = stateFrom(service.getSnapshot());
        throwIfAborted(signal);
        return Object.values(state.annotations)
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(annotation => cloneStorageValue(annotation));
    }
    return Object.freeze({ section: ANNOTATIONS_RESTORE_SECTION, exportSection, contributor });
}
