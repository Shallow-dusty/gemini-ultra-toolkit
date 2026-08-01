import { aggregateInsights } from './aggregation.js';
import {
    DEFAULT_MAX_INSIGHTS_EVENTS,
    InsightsReadOnlyError,
    appendInsightsEvent,
    clone,
    createDayKeyResolver,
    createInsightsEvent,
    deepFreeze,
    isRecord,
    loadInsightsState,
    normalizeIdentity,
    normalizeLimit
} from './event_model.js';

export function captureSessionIdentity(scopeOrIdentity) {
    if (typeof scopeOrIdentity === 'string') {
        const identity = normalizeIdentity(scopeOrIdentity);
        return deepFreeze({
            sessionIdentity: identity,
            targetIdentity: identity,
            mode: 'session',
            readOnly: false
        });
    }
    if (!isRecord(scopeOrIdentity)) throw new TypeError('session scope is required');
    const sessionIdentity = normalizeIdentity(
        scopeOrIdentity.sessionIdentity ?? scopeOrIdentity.sessionUserId,
        'scope session identity'
    );
    const targetIdentity = normalizeIdentity(
        scopeOrIdentity.targetIdentity ?? scopeOrIdentity.targetUserId ?? sessionIdentity,
        'scope target identity'
    );
    const inspection = scopeOrIdentity.kind === 'inspection'
        || scopeOrIdentity.mode === 'inspection'
        || scopeOrIdentity.readOnly === true;
    return deepFreeze({
        sessionIdentity,
        targetIdentity,
        mode: inspection ? 'inspection' : 'session',
        readOnly: inspection
    });
}

export class InsightsLedger {
    constructor({
        state = null,
        scope,
        sessionIdentity,
        clock,
        resolveDayKey = createDayKeyResolver(),
        maxEvents = DEFAULT_MAX_INSIGHTS_EVENTS
    } = {}) {
        this.identity = captureSessionIdentity(scope ?? sessionIdentity);
        if (typeof clock !== 'function') throw new TypeError('clock must be a function');
        if (typeof resolveDayKey !== 'function') throw new TypeError('resolveDayKey must be a function');
        this.clock = clock;
        this.resolveDayKey = resolveDayKey;
        this.maxEvents = normalizeLimit(maxEvents);
        this.state = loadInsightsState(state, { maxEvents: this.maxEvents });
        this.sequence = this.state.events.length;
    }

    get readOnly() { return this.identity.readOnly; }

    getState() { return clone(this.state); }

    record(kind, details = {}) {
        if (this.readOnly) throw new InsightsReadOnlyError();
        if (!isRecord(details)) throw new TypeError('event details must be an object');
        const event = createInsightsEvent({
            ...details,
            kind,
            sessionIdentity: this.identity.sessionIdentity
        }, {
            clock: this.clock,
            resolveDayKey: this.resolveDayKey,
            sequence: this.sequence++
        });
        this.state = appendInsightsEvent(this.state, event, { maxEvents: this.maxEvents });
        return clone(event);
    }

    summarize(options = {}) {
        return aggregateInsights(this.state, { ...options, maxEvents: this.maxEvents });
    }
}
