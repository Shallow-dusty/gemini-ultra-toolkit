import {
    DEFAULT_MAX_INSIGHTS_EVENTS,
    INSIGHTS_SEMANTICS,
    InsightsError,
    InsightsReadOnlyError,
    clone,
    deepFreeze,
    isRecord,
    loadInsightsState,
    normalizeEvent,
    normalizeLimit
} from './event_model.js';
import { captureSessionIdentity } from './ledger.js';

export const INSIGHTS_RESTORE_SECTION = 'insights';

const ACTIONS = new Set(['insert', 'replace', 'rename']);
const SERVER_QUOTA_FIELDS = Object.freeze([
    'serverQuota', 'serverQuotaRemaining', 'quota', 'quotaLimit', 'quotaRemaining'
]);

export class InsightsRestoreError extends InsightsError {
    constructor(code, message, details = {}, cause = undefined) {
        super(message, code, cause === undefined ? {} : { cause });
        this.details = deepFreeze(clone(details));
    }
}

function fail(code, message, details = {}, cause = undefined) {
    throw new InsightsRestoreError(code, message, details, cause);
}

function assertSignal(signal) {
    if (signal == null) return null;
    if (!isRecord(signal) || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
        fail('INVALID_ABORT_SIGNAL', 'signal must implement the AbortSignal contract');
    }
    return signal;
}

function throwIfAborted(signal) {
    if (!signal?.aborted) return;
    fail('RESTORE_ABORTED', 'Insights restore was aborted',
        typeof signal.reason === 'string' && signal.reason ? { reason: signal.reason.slice(0, 500) } : {});
}

function assertContext(context, phase) {
    if (!isRecord(context)) fail('INVALID_RESTORE_CONTEXT', `${phase} context must be an object`);
    if (context.section !== INSIGHTS_RESTORE_SECTION) {
        fail('INVALID_RESTORE_SECTION', `${phase} section must be insights`, { section: context.section });
    }
    if (!Array.isArray(context.actions)) fail('INVALID_RESTORE_CONTEXT', `${phase} actions must be an array`);
    return context;
}

function writableScope(raw) {
    const scope = captureSessionIdentity(raw);
    if (scope.readOnly) throw new InsightsReadOnlyError();
    return scope;
}

async function resolveRepository(repositoryForSession, identity) {
    const repository = await repositoryForSession(identity);
    if (!isRecord(repository) || typeof repository.read !== 'function' || typeof repository.write !== 'function') {
        fail('INVALID_INSIGHTS_REPOSITORY', 'Insights repository must implement read() and write()', {
            sessionIdentity: identity
        });
    }
    return repository;
}

function snapshotValue(value, maxEvents) {
    if (!isRecord(value) || value.section !== INSIGHTS_RESTORE_SECTION ||
        typeof value.sessionIdentity !== 'string' || !isRecord(value.state)) {
        fail('INVALID_INSIGHTS_SNAPSHOT', 'Insights restore snapshot is malformed');
    }
    const identity = captureSessionIdentity(value.sessionIdentity).sessionIdentity;
    const state = loadInsightsState(value.state, { maxEvents });
    assertStateIdentity(state, identity);
    return deepFreeze({
        section: INSIGHTS_RESTORE_SECTION,
        sessionIdentity: identity,
        state
    });
}

function assertStateIdentity(state, identity) {
    if (state.events.some(event => event.sessionIdentity !== identity)) {
        fail('INSIGHTS_SESSION_MISMATCH', 'Insights state contains events from another session');
    }
}

function assertLocalOnly(value) {
    const field = SERVER_QUOTA_FIELDS.find(name => Object.hasOwn(value, name));
    if (field) fail('SERVER_QUOTA_REJECTED', 'Insights restore cannot import server quota claims', { field });
}

function normalizeAction(action, sessionIdentity) {
    if (!isRecord(action) || action.section !== INSIGHTS_RESTORE_SECTION || !ACTIONS.has(action.action) ||
        typeof action.targetIdentity !== 'string' || action.targetIdentity.trim() !== action.targetIdentity ||
        !action.targetIdentity || !isRecord(action.value)) {
        fail('INVALID_INSIGHTS_ACTION', 'Insights restore action is malformed');
    }
    if (action.action === 'rename' && (!isRecord(action.identityPatch) ||
        action.identityPatch.field !== 'id' || action.identityPatch.value !== action.targetIdentity)) {
        fail('INVALID_INSIGHTS_ACTION', 'Insights rename action must patch the event id');
    }
    if (action.action !== 'rename' && action.identityPatch !== null) {
        fail('INVALID_INSIGHTS_ACTION', 'Only rename actions may include an identity patch');
    }
    assertLocalOnly(action.value);
    return normalizeEvent({
        ...clone(action.value),
        id: action.targetIdentity,
        sessionIdentity
    });
}

function applyActions(state, actions, identity, maxEvents, signal) {
    const events = state.events.map(event => clone(event));
    for (const rawAction of actions) {
        throwIfAborted(signal);
        const action = clone(rawAction);
        const event = normalizeAction(action, identity);
        const index = events.findIndex(existing => existing.id === action.targetIdentity);
        if (action.action === 'replace') {
            if (index < 0) fail('STALE_INSIGHTS_ACTION', 'Insights replace target no longer exists', {
                targetIdentity: action.targetIdentity
            });
            events[index] = event;
        } else {
            if (index >= 0) fail('STALE_INSIGHTS_ACTION', 'Insights insert target already exists', {
                targetIdentity: action.targetIdentity
            });
            events.push(event);
        }
    }
    return loadInsightsState({
        format: state.format,
        schemaVersion: state.schemaVersion,
        semantics: INSIGHTS_SEMANTICS,
        events
    }, { maxEvents });
}

function sameState(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

async function readState(repository, identity, signal, maxEvents, reason) {
    const raw = await repository.read(Object.freeze({ sessionIdentity: identity, signal, reason }));
    throwIfAborted(signal);
    const state = loadInsightsState(raw, { maxEvents });
    assertStateIdentity(state, identity);
    return state;
}

async function writeState(repository, identity, state, signal, reason) {
    throwIfAborted(signal);
    await repository.write(clone(state), Object.freeze({ sessionIdentity: identity, signal, reason }));
    throwIfAborted(signal);
}

/** Pure section port for Portable Restore; composition injects all session and persistence access. */
export function createInsightsPortableRestoreContributor({
    getScope,
    repositoryForSession,
    maxEvents = DEFAULT_MAX_INSIGHTS_EVENTS
} = {}) {
    if (typeof getScope !== 'function') throw new TypeError('getScope must be a function');
    if (typeof repositoryForSession !== 'function') throw new TypeError('repositoryForSession must be a function');
    const eventLimit = normalizeLimit(maxEvents);

    async function snapshot(context) {
        const input = assertContext(context, 'snapshot');
        const signal = assertSignal(input.signal);
        throwIfAborted(signal);
        const scope = writableScope(await getScope());
        const repository = await resolveRepository(repositoryForSession, scope.sessionIdentity);
        const state = await readState(repository, scope.sessionIdentity, signal, eventLimit, 'portable-restore-snapshot');
        return deepFreeze({ section: INSIGHTS_RESTORE_SECTION, sessionIdentity: scope.sessionIdentity, state });
    }

    async function apply(context) {
        const input = assertContext(context, 'apply');
        const signal = assertSignal(input.signal);
        throwIfAborted(signal);
        const before = snapshotValue(input.snapshot, eventLimit);
        const scope = writableScope(await getScope());
        if (scope.sessionIdentity !== before.sessionIdentity) {
            fail('INSIGHTS_SESSION_CHANGED', 'Insights restore cannot cross session boundaries');
        }
        const repository = await resolveRepository(repositoryForSession, before.sessionIdentity);
        const current = await readState(
            repository, before.sessionIdentity, signal, eventLimit, 'portable-restore-verify'
        );
        if (!sameState(current, before.state)) fail('STALE_INSIGHTS_SNAPSHOT', 'Insights changed after restore snapshot');
        const next = applyActions(current, input.actions, before.sessionIdentity, eventLimit, signal);
        if (input.actions.length === 0) return deepFreeze({
            section: INSIGHTS_RESTORE_SECTION,
            applied: 0,
            eventCount: next.events.length,
            semantics: INSIGHTS_SEMANTICS
        });

        try {
            await writeState(repository, before.sessionIdentity, next, signal, 'portable-restore-apply');
        } catch (error) {
            let rollbackError = null;
            try {
                await writeState(
                    repository, before.sessionIdentity, before.state, null, 'portable-restore-apply-rollback'
                );
            } catch (failure) {
                rollbackError = failure;
            }
            const wrapped = error instanceof InsightsRestoreError
                ? error
                : new InsightsRestoreError('INSIGHTS_RESTORE_APPLY_FAILED', 'Unable to apply Insights restore', {}, error);
            if (rollbackError) wrapped.rollbackError = rollbackError;
            throw wrapped;
        }
        return deepFreeze({
            section: INSIGHTS_RESTORE_SECTION,
            applied: input.actions.length,
            eventCount: next.events.length,
            semantics: INSIGHTS_SEMANTICS
        });
    }

    async function rollback(context) {
        const input = assertContext(context, 'rollback');
        const before = snapshotValue(input.snapshot, eventLimit);
        const repository = await resolveRepository(repositoryForSession, before.sessionIdentity);
        await writeState(repository, before.sessionIdentity, before.state, null, 'portable-restore-rollback');
        return deepFreeze({
            section: INSIGHTS_RESTORE_SECTION,
            restored: true,
            eventCount: before.state.events.length,
            semantics: INSIGHTS_SEMANTICS
        });
    }

    return Object.freeze({ snapshot, apply, rollback });
}
