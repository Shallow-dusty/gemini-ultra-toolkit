import { fail } from './contracts.js';
import { normalizeSearchText, tokenizeSearchText } from './text.js';

const SEARCH_FIELDS = Object.freeze(['title', 'content', 'tags', 'annotation']);
const SEARCH_KINDS = Object.freeze(['chat', 'message']);
const SEARCH_OPTION_KEYS = Object.freeze([
    'fields',
    'kinds',
    'chatIds',
    'roles',
    'tags',
    'models',
    'sources',
    'dateFrom',
    'dateTo',
    'exclude',
    'match',
    'tagMode',
    'limit',
    'offset',
    'snippetLength'
]);

function normalizeEnumList(value, name, allowed) {
    if (value === undefined) return allowed.slice();
    if (!Array.isArray(value) || value.length === 0) {
        fail('INVALID_OPTIONS', `${name} must be a non-empty array`, { option: name });
    }
    const normalized = [];
    for (const item of value) {
        if (!allowed.includes(item)) {
            fail('INVALID_OPTIONS', `Unsupported ${name} value: ${item}`, { option: name });
        }
        if (!normalized.includes(item)) normalized.push(item);
    }
    return normalized;
}

function normalizeFilterStrings(value, name) {
    if (value === undefined || value === null) return null;
    if (!Array.isArray(value) || value.length === 0) {
        fail('INVALID_OPTIONS', `${name} must be a non-empty array`, { option: name });
    }
    const values = value.map((item, index) => {
        if (typeof item !== 'string' || !item.trim()) {
            fail('INVALID_OPTIONS', `${name}[${index}] must be a non-empty string`, { option: name });
        }
        return item.trim();
    });
    return new Set(values);
}

function normalizeMetadataFilters(value, name) {
    const values = normalizeFilterStrings(value, name);
    return values && new Set([...values].map(normalizeSearchText));
}

function normalizeDateBoundary(value, name, endOfDay = false) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        fail('INVALID_OPTIONS', `${name} must be a date string`, { option: name });
    }
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(value);
    const source = dateOnly
        ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
        : value;
    const timestamp = Date.parse(source);
    if (!Number.isFinite(timestamp)) {
        fail('INVALID_OPTIONS', `${name} must be a valid date`, { option: name });
    }
    return timestamp;
}

function normalizeExcludedTokens(value, limits) {
    if (value === undefined || value === null || value === '') return [];
    const values = Array.isArray(value) ? value : [value];
    if (values.length === 0 || values.some(item => typeof item !== 'string' || !item.trim())) {
        fail('INVALID_OPTIONS', 'exclude must contain non-empty strings', { option: 'exclude' });
    }
    const source = values.join(' ');
    if (source.length > limits.maxQueryLength) {
        fail('LIMIT_EXCEEDED', 'Excluded terms are too long', { limit: limits.maxQueryLength });
    }
    const tokens = tokenizeSearchText(source);
    if (tokens.length > limits.maxQueryTokens) {
        fail('LIMIT_EXCEEDED', 'Excluded terms contain too many tokens', {
            limit: limits.maxQueryTokens
        });
    }
    return tokens;
}

function positiveIntegerOption(value, fallback, name, max, allowZero = false) {
    const resolved = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(resolved) || resolved < (allowZero ? 0 : 1) || resolved > max) {
        fail('INVALID_OPTIONS', `${name} is outside the supported range`, { option: name, max });
    }
    return resolved;
}

function normalizeSearchOptions(options, limits) {
    if (options === undefined) options = {};
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        fail('INVALID_OPTIONS', 'Search options must be an object');
    }
    for (const key of Object.keys(options)) {
        if (!SEARCH_OPTION_KEYS.includes(key)) {
            fail('INVALID_OPTIONS', `Unknown search option: ${key}`, { option: key });
        }
    }
    const match = options.match ?? 'all';
    const tagMode = options.tagMode ?? 'all';
    if (!['all', 'any', 'exact'].includes(match)) {
        fail('INVALID_OPTIONS', 'match must be "all", "any", or "exact"', { option: 'match' });
    }
    if (!['all', 'any'].includes(tagMode)) {
        fail('INVALID_OPTIONS', 'tagMode must be "all" or "any"', { option: 'tagMode' });
    }
    const tags = normalizeFilterStrings(options.tags, 'tags');
    const dateFrom = normalizeDateBoundary(options.dateFrom, 'dateFrom');
    const dateTo = normalizeDateBoundary(options.dateTo, 'dateTo', true);
    if (dateFrom !== null && dateTo !== null && dateFrom > dateTo) {
        fail('INVALID_OPTIONS', 'dateFrom must not be after dateTo', { option: 'dateFrom' });
    }
    const snippetLength = positiveIntegerOption(
        options.snippetLength,
        Math.min(160, limits.maxSnippetLength),
        'snippetLength',
        limits.maxSnippetLength
    );
    if (snippetLength < 3) {
        fail('INVALID_OPTIONS', 'snippetLength must be at least 3', { option: 'snippetLength' });
    }
    return {
        fields: normalizeEnumList(options.fields, 'fields', SEARCH_FIELDS),
        kinds: normalizeEnumList(options.kinds, 'kinds', SEARCH_KINDS),
        chatIds: normalizeFilterStrings(options.chatIds, 'chatIds'),
        roles: normalizeFilterStrings(options.roles, 'roles'),
        tags: tags && new Set([...tags].map(normalizeSearchText)),
        models: normalizeMetadataFilters(options.models, 'models'),
        sources: normalizeMetadataFilters(options.sources, 'sources'),
        dateFrom,
        dateTo,
        excludedTokens: normalizeExcludedTokens(options.exclude, limits),
        match,
        tagMode,
        limit: positiveIntegerOption(options.limit, Math.min(20, limits.maxResults), 'limit', limits.maxResults),
        offset: positiveIntegerOption(options.offset, 0, 'offset', limits.maxOffset, true),
        snippetLength
    };
}

export function normalizeSearchRequest(query, options, limits) {
    const source = query === undefined || query === null ? '' : query;
    if (typeof source !== 'string') fail('INVALID_QUERY', 'Search query must be a string or null');
    if (source.length > limits.maxQueryLength) {
        fail('LIMIT_EXCEEDED', 'Search query is too long', { limit: limits.maxQueryLength });
    }
    const normalizedQuery = normalizeSearchText(source);
    const queryTokens = tokenizeSearchText(normalizedQuery);
    if (queryTokens.length > limits.maxQueryTokens) {
        fail('LIMIT_EXCEEDED', 'Search query contains too many tokens', { limit: limits.maxQueryTokens });
    }
    return {
        query: normalizedQuery,
        tokens: queryTokens,
        options: normalizeSearchOptions(options, limits)
    };
}

export function passesFilters(document, chat, options) {
    if (!options.kinds.includes(document.kind)) return false;
    if (options.chatIds && !options.chatIds.has(chat.id)) return false;
    if (options.roles && (document.kind !== 'message' || !options.roles.has(document.role))) return false;
    if (options.models && !options.models.has(normalizeSearchText(document.metadata.model))) return false;
    if (options.sources && !options.sources.has(normalizeSearchText(document.metadata.source))) return false;
    if ((options.dateFrom !== null || options.dateTo !== null) && document.metadata.timestamp === null) return false;
    if (options.dateFrom !== null && document.metadata.timestamp < options.dateFrom) return false;
    if (options.dateTo !== null && document.metadata.timestamp > options.dateTo) return false;
    if (options.excludedTokens.some(token => options.fields.some(field =>
        document.fields[field]?.tokens.has(token)))) return false;
    if (options.tags) {
        const chatTags = new Set(chat.tags.map(normalizeSearchText));
        const matches = [...options.tags].map(tag => chatTags.has(tag));
        if (options.tagMode === 'all' ? !matches.every(Boolean) : !matches.some(Boolean)) return false;
    }
    return true;
}
