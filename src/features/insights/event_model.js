export const INSIGHTS_FORMAT = 'primer-pp.insights';
export const INSIGHTS_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_INSIGHTS_EVENTS = 10_000;
export const MAX_INSIGHTS_EVENT_COUNT = 1_000_000_000;

export const INSIGHTS_EVENT_KIND = Object.freeze({
    MESSAGE: 'message',
    CHAT: 'chat',
    MODEL: 'model',
    TOOL: 'tool'
});

const EVENT_KINDS = new Set(Object.values(INSIGHTS_EVENT_KIND));
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_DIMENSION_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:+-]{0,79}$/u;

export function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
    return value;
}

export const INSIGHTS_SEMANTICS = deepFreeze({
    source: 'local-observation',
    persistence: 'local-only',
    measurement: 'estimated',
    estimated: true,
    localOnly: true,
    serverQuota: false,
    serverQuotaRemaining: null
});

export const NATIVE_USAGE_LIMITS_LINK = deepFreeze({
    id: 'gemini-native-usage-limits',
    href: 'https://gemini.google.com/app',
    path: '/usage',
    deepLink: 'https://gemini.google.com/usage',
    destination: 'gemini-native-settings',
    navigationPath: ['settings', 'usage-limits'],
    authority: 'gemini-server',
    helpHref: 'https://support.google.com/gemini/answer/16275805',
    opensExternal: false
});

export class InsightsError extends Error {
    constructor(message, code, options = {}) {
        super(message, options);
        // Keep the public diagnostic contract stable after production
        // minification; class identifiers are an implementation detail.
        this.name = 'InsightsError';
        this.code = code;
    }
}

export class CorruptInsightsStateError extends InsightsError {
    constructor(message = 'Insights state is malformed') {
        super(message, 'CORRUPT_INSIGHTS_STATE');
        this.name = 'CorruptInsightsStateError';
    }
}

export class FutureInsightsSchemaError extends InsightsError {
    constructor(storedVersion) {
        super(
            `Insights schema ${storedVersion} is newer than supported schema ${INSIGHTS_SCHEMA_VERSION}`,
            'FUTURE_INSIGHTS_SCHEMA'
        );
        this.name = 'FutureInsightsSchemaError';
        this.storedVersion = storedVersion;
        this.supportedVersion = INSIGHTS_SCHEMA_VERSION;
    }
}

export class InsightsLimitError extends InsightsError {
    constructor(limit, kind = 'events') {
        super(`Insights ${kind} limit exceeded (${limit})`, 'INSIGHTS_LIMIT_EXCEEDED');
        this.name = 'InsightsLimitError';
        this.limit = limit;
        this.limitKind = kind;
    }
}

export class InsightsReadOnlyError extends InsightsError {
    constructor() {
        super('Insights inspection scopes are read-only', 'INSIGHTS_READ_ONLY');
        this.name = 'InsightsReadOnlyError';
    }
}

export function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertPositiveInteger(value, label) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`);
    return value;
}

export function normalizeLimit(value, label = 'maxEvents') {
    return assertPositiveInteger(value, label);
}

export function normalizeIdentity(value, label = 'sessionIdentity') {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value.trim();
}

export function normalizeDimension(value, label, required = false) {
    if (value == null || value === '') {
        if (required) throw new CorruptInsightsStateError(`${label} is required`);
        return null;
    }
    if (typeof value !== 'string' || !SAFE_DIMENSION_PATTERN.test(value.trim())) {
        throw new CorruptInsightsStateError(`${label} is invalid`);
    }
    return value.trim();
}

function normalizeTimestamp(value, label = 'occurredAt') {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new CorruptInsightsStateError(`${label} must be a valid timestamp`);
    return date.toISOString();
}

export function assertDayKey(value, label = 'dayKey') {
    if (typeof value !== 'string' || !DAY_KEY_PATTERN.test(value)) {
        throw new CorruptInsightsStateError(`${label} must use YYYY-MM-DD`);
    }
    const normalized = new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10);
    if (normalized !== value) throw new CorruptInsightsStateError(`${label} is not a calendar date`);
    return value;
}

export function createDayKeyResolver({ resetHour = 0, utcOffsetMinutes = 0 } = {}) {
    if (!Number.isInteger(resetHour) || resetHour < 0 || resetHour > 23) {
        throw new TypeError('resetHour must be an integer from 0 to 23');
    }
    if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -840 || utcOffsetMinutes > 840) {
        throw new TypeError('utcOffsetMinutes must be an integer from -840 to 840');
    }
    return value => {
        const timestamp = new Date(value).getTime();
        if (Number.isNaN(timestamp)) throw new CorruptInsightsStateError('Cannot resolve a day for an invalid timestamp');
        const shifted = timestamp + (utcOffsetMinutes * 60_000) - (resetHour * 3_600_000);
        return new Date(shifted).toISOString().slice(0, 10);
    };
}

export function normalizeEvent(raw, { maxCount = MAX_INSIGHTS_EVENT_COUNT } = {}) {
    if (!isRecord(raw)) throw new CorruptInsightsStateError('Insights event must be an object');
    let id;
    let sessionIdentity;
    try {
        id = normalizeIdentity(raw.id, 'event.id');
        sessionIdentity = normalizeIdentity(raw.sessionIdentity);
    } catch {
        throw new CorruptInsightsStateError('Insights event identity is malformed');
    }
    if (!EVENT_KINDS.has(raw.kind)) throw new CorruptInsightsStateError(`Unknown insights event kind: ${String(raw.kind)}`);
    const occurredAt = normalizeTimestamp(raw.occurredAt);
    const dayKey = assertDayKey(raw.dayKey);
    const count = raw.count == null ? 1 : raw.count;
    if (!Number.isInteger(count) || count < 1) throw new CorruptInsightsStateError('event.count must be a positive integer');
    if (count > maxCount) throw new InsightsLimitError(maxCount, 'event-count');
    const model = normalizeDimension(raw.model, 'event.model', raw.kind === INSIGHTS_EVENT_KIND.MODEL);
    const tool = normalizeDimension(raw.tool, 'event.tool', raw.kind === INSIGHTS_EVENT_KIND.TOOL);
    const origin = raw.origin == null ? 'observed' : normalizeDimension(raw.origin, 'event.origin', true);
    return deepFreeze({ id, kind: raw.kind, occurredAt, dayKey, sessionIdentity, count, model, tool, origin });
}

export function createInsightsEvent({
    kind,
    sessionIdentity,
    model = null,
    tool = null,
    count = 1,
    occurredAt,
    origin = 'observed'
}, {
    clock,
    resolveDayKey = createDayKeyResolver(),
    sequence = 0,
    maxCount = MAX_INSIGHTS_EVENT_COUNT
} = {}) {
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    if (typeof resolveDayKey !== 'function') throw new TypeError('resolveDayKey must be a function');
    if (!Number.isInteger(sequence) || sequence < 0) throw new TypeError('sequence must be a non-negative integer');
    const timestamp = normalizeTimestamp(occurredAt ?? clock());
    const dayKey = assertDayKey(resolveDayKey(timestamp), 'resolved dayKey');
    return normalizeEvent({
        id: `evt-${new Date(timestamp).getTime().toString(36)}-${sequence.toString(36)}`,
        kind,
        occurredAt: timestamp,
        dayKey,
        sessionIdentity,
        count,
        model,
        tool,
        origin
    }, { maxCount });
}

function normalizeStateShape(raw, maxEvents) {
    if (!isRecord(raw)) throw new CorruptInsightsStateError();
    if (raw.format !== INSIGHTS_FORMAT) throw new CorruptInsightsStateError('Unknown insights state format');
    if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) {
        throw new CorruptInsightsStateError('Insights schema version is malformed');
    }
    if (raw.schemaVersion > INSIGHTS_SCHEMA_VERSION) throw new FutureInsightsSchemaError(raw.schemaVersion);
    if (!Array.isArray(raw.events)) throw new CorruptInsightsStateError('Insights events must be an array');
    if (raw.events.length > maxEvents) throw new InsightsLimitError(maxEvents);
    const events = raw.events.map(event => normalizeEvent(event));
    const ids = new Set();
    for (const event of events) {
        if (ids.has(event.id)) throw new CorruptInsightsStateError(`Duplicate event id: ${event.id}`);
        ids.add(event.id);
    }
    return deepFreeze({
        format: INSIGHTS_FORMAT,
        schemaVersion: INSIGHTS_SCHEMA_VERSION,
        semantics: INSIGHTS_SEMANTICS,
        events: Object.freeze(events)
    });
}

export function createInsightsState(events = [], { maxEvents = DEFAULT_MAX_INSIGHTS_EVENTS } = {}) {
    normalizeLimit(maxEvents);
    return normalizeStateShape({
        format: INSIGHTS_FORMAT,
        schemaVersion: INSIGHTS_SCHEMA_VERSION,
        events
    }, maxEvents);
}

export function loadInsightsState(raw, options = {}) {
    if (raw == null) return createInsightsState([], options);
    const maxEvents = normalizeLimit(options.maxEvents ?? DEFAULT_MAX_INSIGHTS_EVENTS);
    let isolated;
    try {
        isolated = clone(raw);
    } catch {
        throw new CorruptInsightsStateError('Insights state must be clone-safe');
    }
    return normalizeStateShape(isolated, maxEvents);
}

export function appendInsightsEvent(state, event, { maxEvents = DEFAULT_MAX_INSIGHTS_EVENTS } = {}) {
    const limit = normalizeLimit(maxEvents);
    const current = loadInsightsState(state, { maxEvents: limit });
    if (current.events.length >= limit) throw new InsightsLimitError(limit);
    return createInsightsState([...current.events, normalizeEvent(event)], { maxEvents: limit });
}
