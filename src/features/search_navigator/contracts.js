export const DEFAULT_SEARCH_LIMITS = Object.freeze({
    maxChats: 5_000,
    maxMessagesPerChat: 2_000,
    maxTotalMessages: 50_000,
    maxTitleLength: 1_000,
    maxContentLength: 100_000,
    maxTagsPerChat: 100,
    maxTagLength: 256,
    maxAnnotationsPerRecord: 100,
    maxAnnotationLength: 10_000,
    maxRoleLength: 64,
    maxMetadataLength: 2_048,
    maxQueryLength: 500,
    maxQueryTokens: 500,
    maxResults: 100,
    maxOffset: 100_000,
    maxSnippetLength: 500
});

export const SEARCH_NAVIGATOR_MODULE_ID = 'search-navigator';
export const SEARCH_NAVIGATOR_VIEW_MODULE_ID = 'search-navigator-view';
export const SEARCH_NAVIGATOR_CAPABILITY = 'search.navigator';
export const SEARCH_NAVIGATOR_SEMANTICS = Object.freeze({
    recordAliases: 'first-own-property',
    importDuplicates: 'reject-within-payload-replace-existing-on-merge',
    filters: 'non-empty-known-options',
    tagMatching: 'nfkc-case-insensitive',
    idAndRoleMatching: 'trimmed-case-sensitive',
    snapshots: 'frozen-internal-defensive-public-clone'
});

const LIMIT_KEYS = Object.freeze(Object.keys(DEFAULT_SEARCH_LIMITS));

/** Stable domain error for validation, limits, lookup and lifecycle failures. */
export class SearchNavigatorError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'SearchNavigatorError';
        this.code = code;
        this.details = cloneValue(details);
    }
}

export function fail(code, message, details) {
    throw new SearchNavigatorError(code, message, details);
}

export function cloneValue(value) {
    if (value === undefined || value === null || typeof value !== 'object') return value;
    if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

export function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function resolveLimits(overrides = {}) {
    if (!isObject(overrides)) fail('INVALID_OPTIONS', 'Search limits must be an object');
    for (const key of Object.keys(overrides)) {
        if (!LIMIT_KEYS.includes(key)) {
            fail('INVALID_OPTIONS', `Unknown search limit: ${key}`, { option: key });
        }
        if (!Number.isSafeInteger(overrides[key]) || overrides[key] <= 0) {
            fail('INVALID_OPTIONS', `Search limit ${key} must be a positive safe integer`, { option: key });
        }
        if (key === 'maxSnippetLength' && overrides[key] < 3) {
            fail('INVALID_OPTIONS', 'maxSnippetLength must reserve room for snippet content and ellipses', {
                option: key
            });
        }
    }
    return Object.freeze({ ...DEFAULT_SEARCH_LIMITS, ...overrides });
}

export function normalizeSessionKey(session) {
    if (session === undefined || session === null) return 'guest';
    let identity = session;
    if (isObject(session)) {
        identity = session.targetUserId ?? session.sessionId ?? session.accountId ??
            session.userId ?? session.email ?? session.id ?? session.sessionUserId;
    }
    if (typeof identity !== 'string' || !identity.trim()) {
        fail('INVALID_SESSION', 'Session must contain a non-empty stable identity');
    }
    return `account:${identity.trim()}`;
}
