import {
    normalizeRecipeRecord,
    normalizeRecipeState,
    safeClone
} from './model.js';

export const RECIPES_RESTORE_SECTION = 'recipes';

const ACTIONS = new Set(['insert', 'replace', 'rename']);

function restoreFailure(code, message, details = {}) {
    const error = new Error(message);
    error.name = 'RecipesRestoreError';
    error.code = code;
    error.details = details;
    throw error;
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
        restoreFailure('INVALID_ABORT_SIGNAL', 'Recipes restore signal must implement AbortSignal');
    }
}

function throwIfAborted(signal) {
    assertSignal(signal);
    if (!signal?.aborted) return;
    const error = new Error('Recipes restore was aborted');
    error.name = 'AbortError';
    error.code = 'RESTORE_ABORTED';
    throw error;
}

function normalizeSnapshot(value) {
    const snapshot = requireObject(safeClone(value, 'Recipes restore snapshot'), 'Recipes restore snapshot');
    if (typeof snapshot.ownerSessionId !== 'string' || !snapshot.ownerSessionId.trim()) {
        restoreFailure('INVALID_RESTORE_SNAPSHOT', 'Recipes restore snapshot requires an account owner');
    }
    return normalizeRecipeState(snapshot, snapshot.ownerSessionId);
}

function normalizeContext(context, phase) {
    const value = requireObject(context, `Recipes ${phase} context`);
    if (value.section !== RECIPES_RESTORE_SECTION ||
        !value.plan || typeof value.plan !== 'object' || Array.isArray(value.plan) ||
        !Array.isArray(value.actions)) {
        restoreFailure('INVALID_RESTORE_CONTEXT', `Recipes ${phase} context is invalid`);
    }
    return value;
}

function retargetRecord(record, targetId) {
    const source = safeClone(record, 'Recipe restore action');
    source.id = targetId;
    source.versions = source.versions.map(version => ({ ...version, id: targetId }));
    return normalizeRecipeRecord(source);
}

function normalizeAction(action) {
    const value = requireObject(safeClone(action, 'Recipe restore action'), 'Recipe restore action');
    if (value.section !== RECIPES_RESTORE_SECTION || !ACTIONS.has(value.action)) {
        restoreFailure('INVALID_RESTORE_ACTION', 'Recipes restore action is unsupported');
    }
    if (typeof value.targetIdentity !== 'string' || !value.targetIdentity) {
        restoreFailure('INVALID_RESTORE_ACTION', 'Recipes restore action requires a target identity');
    }
    if (value.action === 'rename' && value.identityPatch?.field !== 'id') {
        restoreFailure('INVALID_RESTORE_ACTION', 'Recipes can only rename the id identity');
    }
    const incoming = normalizeRecipeRecord(value.value);
    if (incoming.id !== value.incomingIdentity) {
        restoreFailure('INVALID_RESTORE_ACTION', 'Recipe record id does not match its incoming identity');
    }
    if (value.action !== 'rename' && (value.identityPatch !== null || value.targetIdentity !== value.incomingIdentity)) {
        restoreFailure('INVALID_RESTORE_ACTION', 'Recipe insert and replace actions must preserve identity');
    }
    if (value.action === 'rename' && value.targetIdentity === value.incomingIdentity) {
        restoreFailure('INVALID_RESTORE_ACTION', 'Recipe rename requires a distinct target identity');
    }
    const record = value.action === 'rename'
        ? retargetRecord(incoming, value.targetIdentity)
        : incoming;
    return { action: value.action, record };
}

function applyActions(state, actions) {
    const records = state.records.map(record => safeClone(record));
    const applied = [];
    for (const { action, record } of actions.map(normalizeAction)) {
        const index = records.findIndex(candidate => candidate.id === record.id);
        if (action === 'replace') {
            if (index < 0) restoreFailure('RESTORE_PLAN_STALE', `Recipe no longer exists: ${record.id}`);
            records[index] = record;
        } else {
            if (index >= 0) restoreFailure('RESTORE_PLAN_STALE', `Recipe already exists: ${record.id}`);
            records.push(record);
        }
        applied.push(record.id);
    }
    return {
        state: normalizeRecipeState({ ...state, records }, state.ownerSessionId),
        applied
    };
}

/**
 * Build the Recipes section contributor around an account-bound repository.
 * Repository updates are atomic, so partial per-action state is never exposed.
 */
export function createRecipesRestoreContributor(options = {}) {
    const value = requireObject(options, 'Recipes restore options');
    const repository = requireObject(value.repository, 'Recipes restore repository');
    for (const method of ['get', 'update', 'flush']) requireMethod(repository, method, 'repository');

    async function snapshot(context) {
        const { signal } = normalizeContext(context, 'snapshot');
        throwIfAborted(signal);
        const state = normalizeSnapshot(await repository.get());
        throwIfAborted(signal);
        return safeClone(state, 'Recipes restore snapshot result');
    }

    async function apply(context) {
        const { actions, snapshot: snapshotValue, signal } = normalizeContext(context, 'apply');
        throwIfAborted(signal);
        const before = normalizeSnapshot(snapshotValue);
        let result;
        await repository.update(raw => {
            throwIfAborted(signal);
            const current = normalizeRecipeState(raw, before.ownerSessionId);
            if (JSON.stringify(current) !== JSON.stringify(before)) {
                restoreFailure('RESTORE_STATE_CHANGED', 'Recipes changed after the restore snapshot');
            }
            result = applyActions(current, actions);
            return safeClone(result.state, 'Recipes restored state');
        });
        throwIfAborted(signal);
        await repository.flush();
        throwIfAborted(signal);
        return { applied: result.applied.length, ids: safeClone(result.applied) };
    }

    async function rollback(context) {
        const { snapshot: snapshotValue } = normalizeContext(context, 'rollback');
        const state = normalizeSnapshot(snapshotValue);
        await repository.update(raw => {
            normalizeRecipeState(raw, state.ownerSessionId);
            return safeClone(state, 'Recipes rollback state');
        });
        await repository.flush();
        return { restored: state.records.length };
    }

    return Object.freeze({ snapshot, apply, rollback });
}
