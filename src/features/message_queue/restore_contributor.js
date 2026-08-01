import queueTools from '../../../lib/message_queue_tools.js';
import { cloneStorageValue } from '../../storage/clone.js';

const { normalizeQueueData } = queueTools;

export const MESSAGE_QUEUE_RESTORE_SECTION = 'queue';

const ACTIONS = new Set(['insert', 'replace', 'rename']);
const FALLBACK_TIMESTAMP = '1970-01-01T00:00:00.000Z';

function restoreFailure(code, message, details = {}) {
    const error = new Error(message);
    error.name = 'MessageQueueRestoreError';
    error.code = code;
    error.details = details;
    throw error;
}

function clone(value) {
    try {
        return cloneStorageValue(value);
    } catch (error) {
        restoreFailure('INVALID_RESTORE_VALUE', 'Queue restore values must be cloneable', { cause: error.message });
    }
}

function requireObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        restoreFailure('INVALID_RESTORE_PORT', `${label} must be an object`);
    }
    return value;
}

function requireMethod(owner, name, label) {
    if (typeof owner[name] !== 'function') {
        restoreFailure('INVALID_RESTORE_PORT', `${label}.${name} must be a function`);
    }
}

function assertSignal(signal) {
    if (signal === undefined || signal === null) return;
    if (!signal || typeof signal !== 'object' || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
        restoreFailure('INVALID_ABORT_SIGNAL', 'Message Queue restore signal must implement AbortSignal');
    }
}

function throwIfAborted(signal) {
    assertSignal(signal);
    if (!signal?.aborted) return;
    const error = new Error('Message Queue restore was aborted');
    error.name = 'AbortError';
    error.code = 'RESTORE_ABORTED';
    throw error;
}

function normalizeContext(context, phase) {
    const value = requireObject(context, `Message Queue ${phase} context`);
    if (value.section !== MESSAGE_QUEUE_RESTORE_SECTION ||
        !value.plan || typeof value.plan !== 'object' || Array.isArray(value.plan) ||
        !Array.isArray(value.actions)) {
        restoreFailure('INVALID_RESTORE_CONTEXT', `Message Queue ${phase} context is invalid`);
    }
    return value;
}

function normalizeState(value, forcePaused = true) {
    const state = normalizeQueueData(clone(value), {
        nowIso: FALLBACK_TIMESTAMP,
        recoverSending: true
    });
    if (forcePaused) {
        state.paused = true;
        state.activeId = '';
    }
    const ids = state.items.map(item => item.id);
    if (new Set(ids).size !== ids.length) {
        restoreFailure('INVALID_QUEUE_STATE', 'Queue restore state contains duplicate ids');
    }
    return state;
}

function normalizeSnapshot(value) {
    const snapshot = requireObject(clone(value), 'Message Queue restore snapshot');
    if (typeof snapshot.storageKey !== 'string' || !snapshot.storageKey) {
        restoreFailure('INVALID_RESTORE_SNAPSHOT', 'Queue restore snapshot requires a storage key');
    }
    return { storageKey: snapshot.storageKey, state: normalizeState(snapshot.state) };
}

function normalizeAction(action) {
    const value = requireObject(clone(action), 'Message Queue restore action');
    if (value.section !== MESSAGE_QUEUE_RESTORE_SECTION || !ACTIONS.has(value.action)) {
        restoreFailure('INVALID_RESTORE_ACTION', 'Message Queue restore action is unsupported');
    }
    if (typeof value.targetIdentity !== 'string' || !value.targetIdentity) {
        restoreFailure('INVALID_RESTORE_ACTION', 'Message Queue restore action requires a target identity');
    }
    if (value.action === 'rename' && value.identityPatch?.field !== 'id') {
        restoreFailure('INVALID_RESTORE_ACTION', 'Queue items can only rename the id identity');
    }
    const source = requireObject(clone(value.value), 'Message Queue restore item');
    const incoming = normalizeQueueData({ items: [source] }, {
        nowIso: FALLBACK_TIMESTAMP,
        recoverSending: true
    }).items[0];
    if (!incoming) restoreFailure('INVALID_RESTORE_ACTION', 'Queue restore item requires text');
    if (incoming.id !== value.incomingIdentity) {
        restoreFailure('INVALID_RESTORE_ACTION', 'Queue item id does not match its incoming identity');
    }
    if (value.action !== 'rename' && (value.identityPatch !== null || value.targetIdentity !== value.incomingIdentity)) {
        restoreFailure('INVALID_RESTORE_ACTION', 'Queue insert and replace actions must preserve identity');
    }
    if (value.action === 'rename' && value.targetIdentity === value.incomingIdentity) {
        restoreFailure('INVALID_RESTORE_ACTION', 'Queue rename requires a distinct target identity');
    }
    const normalized = { ...incoming, id: value.targetIdentity };
    return { action: value.action, item: normalized };
}

function applyActions(state, actions) {
    const next = normalizeState(state);
    const applied = [];
    for (const { action, item } of actions.map(normalizeAction)) {
        const index = next.items.findIndex(candidate => candidate.id === item.id);
        if (action === 'replace') {
            if (index < 0) restoreFailure('RESTORE_PLAN_STALE', `Queue item no longer exists: ${item.id}`);
            next.items[index] = item;
        } else {
            if (index >= 0) restoreFailure('RESTORE_PLAN_STALE', `Queue item already exists: ${item.id}`);
            next.items.push(item);
        }
        applied.push(item.id);
    }
    return { state: normalizeState(next), applied };
}

/**
 * Build the Queue contributor from a paused outbox and its persistence port.
 * It can replace local state, but never calls resume(), processNext(), or retry.
 */
export function createMessageQueueRestoreContributor(options = {}) {
    const value = requireObject(options, 'Message Queue restore options');
    const outbox = requireObject(value.outbox, 'Message Queue restore outbox');
    const repository = requireObject(value.repository, 'Message Queue restore repository');
    for (const method of ['getSnapshot', 'getRuntimeState', 'start', 'stop']) {
        requireMethod(outbox, method, 'outbox');
    }
    requireMethod(repository, 'write', 'repository');

    function readPausedSnapshot() {
        const runtime = requireObject(outbox.getRuntimeState(), 'Message Queue runtime state');
        const state = normalizeState(outbox.getSnapshot(), false);
        if (runtime.started !== true || typeof runtime.loadedStorageKey !== 'string' || !runtime.loadedStorageKey) {
            restoreFailure('QUEUE_RESTORE_INACTIVE', 'Message Queue must be started before restore');
        }
        if (!state.paused || runtime.activeRun || runtime.timer !== null || runtime.session !== null) {
            restoreFailure('QUEUE_RESTORE_REQUIRES_PAUSE', 'Pause Message Queue before restore');
        }
        return { storageKey: runtime.loadedStorageKey, state };
    }

    function assertSameStorageKey(expected) {
        const actual = outbox.getRuntimeState().loadedStorageKey;
        if (actual !== expected) {
            restoreFailure('QUEUE_ACCOUNT_CHANGED', 'Message Queue account changed during restore', {
                expected,
                actual
            });
        }
    }

    async function restartAfterFailure(primaryError) {
        if (outbox.getRuntimeState().started === true) throw primaryError;
        try {
            if (await outbox.start() === false) {
                throw new Error('Message Queue restart returned false');
            }
        } catch (restartError) {
            const failure = new Error('Message Queue could not restart after restore failure');
            failure.name = 'MessageQueueRestoreError';
            failure.code = 'QUEUE_RECOVERY_FAILED';
            failure.details = {
                primaryCode: typeof primaryError?.code === 'string' ? primaryError.code : null,
                restartMessage: restartError?.message || String(restartError)
            };
            failure.cause = primaryError;
            throw failure;
        }
        throw primaryError;
    }

    async function replaceStoredState(snapshot, signal = null) {
        try {
            throwIfAborted(signal);
            assertSameStorageKey(snapshot.storageKey);
            const runtime = outbox.getRuntimeState();
            if (runtime.started === true && await outbox.stop() === false) {
                restoreFailure('QUEUE_RESTORE_INACTIVE', 'Message Queue became inactive during restore');
            }
            throwIfAborted(signal);
            assertSameStorageKey(snapshot.storageKey);
            await repository.write(snapshot.storageKey, clone(snapshot.state));
            throwIfAborted(signal);
            if (outbox.getRuntimeState().started !== true && await outbox.start() === false) {
                restoreFailure('QUEUE_RESTORE_INACTIVE', 'Message Queue became inactive during restore');
            }
            throwIfAborted(signal);
            return normalizeState(outbox.getSnapshot());
        } catch (error) {
            return restartAfterFailure(error);
        }
    }

    async function snapshot(context) {
        const { signal } = normalizeContext(context, 'snapshot');
        throwIfAborted(signal);
        const result = readPausedSnapshot();
        throwIfAborted(signal);
        return clone(result);
    }

    async function apply(context) {
        const { actions, snapshot: snapshotValue, signal } = normalizeContext(context, 'apply');
        throwIfAborted(signal);
        const before = normalizeSnapshot(snapshotValue);
        assertSameStorageKey(before.storageKey);
        const current = readPausedSnapshot();
        if (JSON.stringify(current.state) !== JSON.stringify(before.state)) {
            restoreFailure('RESTORE_STATE_CHANGED', 'Message Queue changed after the restore snapshot');
        }
        const result = applyActions(current.state, actions);
        const restored = await replaceStoredState({ storageKey: current.storageKey, state: result.state }, signal);
        return { applied: result.applied.length, ids: clone(result.applied), paused: restored.paused };
    }

    async function rollback(context) {
        const { snapshot: snapshotValue } = normalizeContext(context, 'rollback');
        const snapshot = normalizeSnapshot(snapshotValue);
        const restored = await replaceStoredState(snapshot);
        return { restored: restored.items.length, paused: restored.paused };
    }

    return Object.freeze({ snapshot, apply, rollback });
}
