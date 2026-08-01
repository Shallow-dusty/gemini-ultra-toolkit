import {
    InsightsError,
    InsightsReadOnlyError,
    clone,
    loadInsightsState
} from './event_model.js';
import { projectLegacyCounterState } from './legacy_counter_state.js';
import {
    INSIGHTS_RESTORE_SECTION,
    createInsightsPortableRestoreContributor
} from './portable_restore_contributor.js';

function fail(code, message) {
    throw new InsightsError(message, code);
}

function assertPortableSignal(signal) {
    if (signal == null) return;
    if (typeof signal !== 'object' || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
        fail('INVALID_ABORT_SIGNAL', 'Insights archive signal must implement AbortSignal');
    }
    if (signal.aborted) fail('RESTORE_ABORTED', 'Insights archive export was aborted');
}

function canonicalState(owner, identity) {
    const state = loadInsightsState(owner._displayInsightsForAnalytics(), {
        maxEvents: owner._deps.maxEvents
    });
    if (state.events.some(event => event.sessionIdentity !== identity)) {
        fail('INSIGHTS_SESSION_MISMATCH', 'Insights archive contains events from another session');
    }
    return state;
}

async function replaceState(owner, identity, nextValue) {
    const next = loadInsightsState(nextValue, { maxEvents: owner._deps.maxEvents });
    const record = owner._records.get(identity);
    const projected = projectLegacyCounterState(next);
    const compatibility = {
        ...clone(record.compatibility),
        ...projected,
        chats: clone(record.compatibility.chats)
    };
    await owner._persistRecord({ ...record, insights: next, compatibility });
    record.insights = next;
    record.compatibility = compatibility;
    owner._syncPublicState();
    owner._emitChange('portable-restore');
}

export const legacyCounterArchive = Object.freeze({
    getPortableArchiveIntegration() {
        if (!this._started) fail('FEATURE_INACTIVE', 'Insights are not active');
        const activeIdentity = this._activeIdentity;
        const displayIdentity = this._displayIdentity;
        const inspection = displayIdentity !== activeIdentity;
        const assertBound = () => {
            if (!this._started) fail('FEATURE_INACTIVE', 'Insights are not active');
            if (this._activeIdentity !== activeIdentity || this._displayIdentity !== displayIdentity) {
                fail('SESSION_CHANGED', 'Insights account changed after archive integration');
            }
        };
        const getScope = () => {
            assertBound();
            return {
                kind: inspection ? 'inspection' : 'session',
                sessionIdentity: activeIdentity,
                targetIdentity: displayIdentity,
                readOnly: inspection
            };
        };
        const repositoryForSession = identity => {
            assertBound();
            return {
                read: async () => {
                    await this._controller.flushPending();
                    assertBound();
                    return clone(canonicalState(this, identity));
                },
                write: async state => {
                    assertBound();
                    await replaceState(this, identity, state);
                    assertBound();
                }
            };
        };
        const port = createInsightsPortableRestoreContributor({
            getScope,
            repositoryForSession,
            maxEvents: this._deps.maxEvents
        });
        const invoke = method => async context => {
            assertBound();
            if (inspection && method === 'rollback') throw new InsightsReadOnlyError();
            const result = await port[method](context);
            assertBound();
            return clone(result);
        };
        const contributor = Object.freeze({
            snapshot: invoke('snapshot'),
            apply: invoke('apply'),
            rollback: invoke('rollback')
        });
        const exportSection = async ({ signal } = {}) => {
            assertPortableSignal(signal);
            assertBound();
            const events = clone(canonicalState(this, displayIdentity).events);
            assertPortableSignal(signal);
            assertBound();
            return events;
        };
        return Object.freeze({ section: INSIGHTS_RESTORE_SECTION, exportSection, contributor });
    }
});
