import {
    DEFAULT_MAX_INSIGHTS_EVENTS,
    InsightsError,
    InsightsLimitError,
    InsightsReadOnlyError,
    createDayKeyResolver,
    createInsightsEvent
} from './event_model.js';
import { captureSessionIdentity } from './ledger.js';

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
    return value;
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class InsightsFlushError extends InsightsError {
    constructor(cause) {
        super('Unable to flush pending Insights events', 'INSIGHTS_FLUSH_FAILED', { cause });
    }
}

export class InsightsSessionTransitionError extends InsightsError {
    constructor() {
        super('Insights session transition is already in progress', 'INSIGHTS_SESSION_TRANSITION');
    }
}

export class InsightsSessionController {
    constructor({
        initialScope,
        sessionIdentity,
        flush,
        clock,
        resolveDayKey = createDayKeyResolver(),
        maxPendingEvents = DEFAULT_MAX_INSIGHTS_EVENTS,
        initialSequence = 0
    } = {}) {
        if (typeof flush !== 'function') throw new TypeError('flush must be a function');
        if (typeof clock !== 'function') throw new TypeError('clock must be a function');
        if (typeof resolveDayKey !== 'function') throw new TypeError('resolveDayKey must be a function');
        if (!Number.isInteger(maxPendingEvents) || maxPendingEvents < 1) {
            throw new TypeError('maxPendingEvents must be a positive integer');
        }
        if (!Number.isInteger(initialSequence) || initialSequence < 0) {
            throw new TypeError('initialSequence must be a non-negative integer');
        }
        this.identity = captureSessionIdentity(initialScope ?? sessionIdentity);
        this.flushEvents = flush;
        this.clock = clock;
        this.resolveDayKey = resolveDayKey;
        this.maxPendingEvents = maxPendingEvents;
        this.pending = [];
        this.sequence = initialSequence;
        this.queue = Promise.resolve();
        this.transitioning = false;
    }

    get readOnly() { return this.identity.readOnly; }

    getIdentity() { return clone(this.identity); }

    getPending() { return clone(this.pending); }

    capture(kind, details = {}) {
        if (this.transitioning) throw new InsightsSessionTransitionError();
        if (this.readOnly) throw new InsightsReadOnlyError();
        if (!isRecord(details)) throw new TypeError('event details must be an object');
        if (this.pending.length >= this.maxPendingEvents) throw new InsightsLimitError(this.maxPendingEvents, 'pending-events');
        const event = createInsightsEvent({
            ...details,
            kind,
            sessionIdentity: this.identity.sessionIdentity
        }, {
            clock: this.clock,
            resolveDayKey: this.resolveDayKey,
            sequence: this.sequence++
        });
        this.pending.push(event);
        return clone(event);
    }

    flushPending() {
        const operation = this.queue.then(() => this._flushPending());
        this.queue = operation.catch(() => undefined);
        return operation;
    }

    switchSession(nextScopeOrIdentity) {
        if (this.transitioning) return Promise.reject(new InsightsSessionTransitionError());
        const nextIdentity = captureSessionIdentity(nextScopeOrIdentity);
        this.transitioning = true;
        const operation = this.queue.then(async () => {
            try {
                await this._flushPending();
                this.identity = nextIdentity;
                return this.getIdentity();
            } finally {
                this.transitioning = false;
            }
        });
        this.queue = operation.catch(() => undefined);
        return operation;
    }

    enterInspection(targetIdentity) {
        return this.switchSession({
            kind: 'inspection',
            sessionIdentity: this.identity.sessionIdentity,
            targetIdentity,
            readOnly: true
        });
    }

    returnToSession() {
        return this.switchSession(this.identity.sessionIdentity);
    }

    async _flushPending() {
        if (this.pending.length === 0) return Object.freeze({ flushed: 0, sessionIdentity: this.identity.sessionIdentity });
        const batch = this.pending.slice();
        const request = deepFreeze({
            sessionIdentity: this.identity.sessionIdentity,
            events: clone(batch)
        });
        try {
            await this.flushEvents(request);
        } catch (error) {
            throw new InsightsFlushError(error);
        }
        this.pending.splice(0, batch.length);
        return Object.freeze({ flushed: batch.length, sessionIdentity: request.sessionIdentity });
    }
}

export function createInsightsSessionController(options) {
    return new InsightsSessionController(options);
}
