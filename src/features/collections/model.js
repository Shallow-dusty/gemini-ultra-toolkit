import { cloneStorageValue } from '../../storage/clone.js';
import { fail } from './errors.js';
import { assertCollectionHierarchy, normalizeSiblingPositions } from './hierarchy.js';
import {
    RULE_FIELDS,
    RULE_OPERATORS,
    normalizeRules as normalizeRulesWithLimits,
    normalizeTags as normalizeTagsWithLimits
} from './rules.js';

export { RULE_FIELDS, RULE_OPERATORS };

export const COLLECTIONS_SCHEMA = 'primer-pp.collections';
export const COLLECTIONS_SCHEMA_VERSION = 1;
export const LEGACY_FOLDERS_SCHEMA = 'primer-pp.folders';
export const COLLECTIONS_EXPORT_FORMAT = 'primer-pp.collections.export';
export const COLLECTIONS_EXPORT_VERSION = 1;
export const ROOT_COLLECTION_ID = null;

export const COLLECTION_LIMITS = Object.freeze({
    maxCollections: 256,
    maxDepth: 8,
    maxIdLength: 160,
    maxNameLength: 160,
    maxTagsPerCollection: 32,
    maxTagLength: 64,
    maxRulesPerCollection: 32,
    maxRuleValueLength: 240,
    maxMembershipItems: 10000,
    maxMemberships: 20000,
    maxItemIdLength: 320,
    maxImportBytes: 4 * 1024 * 1024
});

export const SORT_FIELDS = Object.freeze(['manual', 'name', 'createdAt', 'updatedAt']);

const CREDENTIAL_FIELD = /^(?:password|passphrase|passcode|secret|totp|otp|cookie|authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret)$/i;

export function safeClone(value, label = 'Collections value') {
    try {
        return cloneStorageValue(value);
    } catch (error) {
        fail('NOT_CLONEABLE', `${label} must be structured-cloneable`, { label }, error);
    }
}

export function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

export function resolveCollectionLimits(overrides = {}) {
    if (!isRecord(overrides)) fail('INVALID_LIMITS', 'Collection limits must be an object');
    const limits = { ...COLLECTION_LIMITS };
    for (const [key, value] of Object.entries(overrides)) {
        if (!Object.prototype.hasOwnProperty.call(limits, key)) {
            fail('INVALID_LIMITS', `Unknown collection limit: ${key}`, { key });
        }
        if (!Number.isInteger(value) || value < 1) {
            fail('INVALID_LIMITS', `Collection limit ${key} must be a positive integer`, { key, value });
        }
        limits[key] = value;
    }
    return Object.freeze(limits);
}

export function normalizeSessionId(value) {
    const id = cleanText(value);
    if (!id) fail('INVALID_SESSION', 'Collections require a stable session identity');
    if (id.length > COLLECTION_LIMITS.maxIdLength) {
        fail('SESSION_ID_TOO_LONG', 'Collections session identity is too long');
    }
    return id;
}

export function sessionIdFromContext(session) {
    if (typeof session === 'string') return normalizeSessionId(session);
    if (!isRecord(session)) fail('INVALID_SESSION', 'Collections require a stable session identity');
    for (const key of Object.keys(session)) {
        if (CREDENTIAL_FIELD.test(key)) {
            fail('CREDENTIAL_MATERIAL', `Collections session cannot contain credential field ${key}`, { key });
        }
    }
    for (const candidate of [session.accountId, session.userId, session.id, session.email]) {
        if (cleanText(candidate)) return normalizeSessionId(candidate);
    }
    return normalizeSessionId('');
}

export function getNowIso(clock) {
    if (typeof clock !== 'function') fail('INVALID_CLOCK', 'Collections clock must be a function');
    const value = clock();
    const text = value instanceof Date ? value.toISOString() : cleanText(value);
    if (!text || !Number.isFinite(Date.parse(text))) {
        fail('INVALID_CLOCK', 'Collections clock must return an ISO-compatible timestamp');
    }
    return new Date(text).toISOString();
}

function normalizeStoredIso(value, fallback, field) {
    if (value === undefined || value === null || value === '') return fallback;
    const text = cleanText(value);
    if (!Number.isFinite(Date.parse(text))) fail('INVALID_TIMESTAMP', `${field} must be an ISO-compatible timestamp`, { field });
    return new Date(text).toISOString();
}

export function normalizeId(value, label, limits = COLLECTION_LIMITS) {
    const id = cleanText(value);
    if (!id) fail('INVALID_ID', `${label} must be a non-empty string`, { label });
    if (id.length > limits.maxIdLength) fail('ID_TOO_LONG', `${label} exceeds the id limit`, { label });
    return id;
}

export function normalizeItemId(value, limits = COLLECTION_LIMITS) {
    const id = cleanText(value);
    if (!id) fail('INVALID_ITEM_ID', 'Membership item id must be a non-empty string');
    if (id.length > limits.maxItemIdLength) fail('ITEM_ID_TOO_LONG', 'Membership item id exceeds the limit');
    return id;
}

export function normalizeTags(value, limits = COLLECTION_LIMITS) {
    return normalizeTagsWithLimits(value, limits);
}

export function normalizeRules(value, limits = COLLECTION_LIMITS) {
    return normalizeRulesWithLimits(value, limits);
}

function normalizeName(value, limits) {
    const name = cleanText(value);
    if (!name) fail('INVALID_NAME', 'Collection name must be a non-empty string');
    if (name.length > limits.maxNameLength) fail('NAME_TOO_LONG', 'Collection name exceeds the length limit');
    return name;
}

export function normalizeCollection(raw, options = {}) {
    const limits = resolveCollectionLimits(options.limits);
    if (!isRecord(raw)) fail('INVALID_COLLECTION', 'Collection must be an object');
    const hasCreatedAt = raw.createdAt !== undefined && raw.createdAt !== null && raw.createdAt !== '';
    const now = options.nowIso ?? (hasCreatedAt ? null : getNowIso(options.clock));
    const createdAt = normalizeStoredIso(raw.createdAt, now, 'createdAt');
    const updatedAt = normalizeStoredIso(raw.updatedAt, createdAt, 'updatedAt');
    const parentId = raw.parentId === null || raw.parentId === undefined || raw.parentId === ''
        ? ROOT_COLLECTION_ID
        : normalizeId(raw.parentId, 'Parent collection id', limits);
    const position = raw.position === undefined ? 0 : raw.position;
    if (!Number.isInteger(position) || position < 0) fail('INVALID_POSITION', 'Collection position must be a non-negative integer');
    const ruleMode = raw.ruleMode === undefined ? 'any' : cleanText(raw.ruleMode);
    if (ruleMode !== 'any' && ruleMode !== 'all') fail('INVALID_RULE_MODE', 'Collection ruleMode must be any or all');
    return safeClone({
        id: normalizeId(raw.id, 'Collection id', limits),
        name: normalizeName(raw.name, limits),
        parentId,
        position,
        tags: normalizeTags(raw.tags, limits),
        rules: normalizeRules(raw.rules, limits),
        ruleMode,
        color: /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(cleanText(raw.color))
            ? cleanText(raw.color)
            : null,
        collapsed: raw.collapsed === true,
        pinned: raw.pinned === true,
        createdAt,
        updatedAt
    });
}

export function createNativeMetadata(raw = {}) {
    const notebooks = isRecord(raw?.notebooks) ? raw.notebooks : {};
    const observedAt = notebooks.observedAt === null || notebooks.observedAt === undefined
        ? null
        : normalizeStoredIso(notebooks.observedAt, null, 'native.notebooks.observedAt');
    return {
        notebooks: {
            available: notebooks.available === true,
            ownership: 'native',
            officialEntryPolicy: 'preserve',
            observedAt
        }
    };
}

export function createEmptyCollectionsState(sessionId, options = {}) {
    return {
        schema: COLLECTIONS_SCHEMA,
        version: COLLECTIONS_SCHEMA_VERSION,
        sessionId: normalizeSessionId(sessionId),
        collections: [],
        memberships: [],
        native: createNativeMetadata(options.native)
    };
}

function normalizeMemberships(value, collectionIds, limits) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) fail('INVALID_MEMBERSHIPS', 'Collection memberships must be an array');
    if (value.length > limits.maxMembershipItems) fail('MEMBERSHIP_ITEM_LIMIT', 'Membership item count exceeds the limit');
    const records = [];
    const seenItems = new Set();
    let linkCount = 0;
    for (const raw of value) {
        if (!isRecord(raw)) fail('INVALID_MEMBERSHIP', 'Membership entry must be an object');
        const itemId = normalizeItemId(raw.itemId, limits);
        if (seenItems.has(itemId)) fail('DUPLICATE_MEMBERSHIP_ITEM', `Duplicate membership item: ${itemId}`, { itemId });
        seenItems.add(itemId);
        if (!Array.isArray(raw.collectionIds)) fail('INVALID_MEMBERSHIP', 'Membership collectionIds must be an array', { itemId });
        const ids = [];
        const seen = new Set();
        for (const valueId of raw.collectionIds) {
            const id = normalizeId(valueId, 'Membership collection id', limits);
            if (!collectionIds.has(id)) fail('COLLECTION_NOT_FOUND', `Membership references missing collection: ${id}`, { id, itemId });
            if (!seen.has(id)) {
                seen.add(id);
                ids.push(id);
                linkCount += 1;
                if (linkCount > limits.maxMemberships) fail('MEMBERSHIP_LIMIT', 'Total memberships exceed the limit');
            }
        }
        if (ids.length) records.push({ itemId, collectionIds: ids.sort() });
    }
    return records.sort((left, right) => left.itemId.localeCompare(right.itemId));
}

function legacyRule(rule) {
    if (!isRecord(rule)) return null;
    const value = cleanText(rule.value);
    if (!value) return null;
    if (rule.type === 'regex') {
        return { field: 'title', operator: 'contains', value, caseSensitive: false, enabled: false, legacyType: 'regex' };
    }
    return { field: 'title', operator: 'contains', value, caseSensitive: false, enabled: true };
}

export function migrateLegacyFolders(raw, options = {}) {
    const limits = resolveCollectionLimits(options.limits);
    const sessionId = normalizeSessionId(options.sessionId);
    if (!isRecord(raw)) fail('INVALID_LEGACY_FOLDERS', 'Legacy folders data must be an object');
    const folders = isRecord(raw.folders) ? raw.folders : {};
    const folderById = new Map();
    for (const [rawId, folder] of Object.entries(folders)) {
        const id = normalizeId(rawId, 'Legacy folder id', limits);
        if (folderById.has(id)) fail('DUPLICATE_COLLECTION_ID', `Legacy folder ids collide after normalization: ${id}`, { id });
        folderById.set(id, folder);
    }
    const ids = [...folderById.keys()];
    if (ids.length > limits.maxCollections) fail('COLLECTION_LIMIT', 'Legacy folder count exceeds the collection limit');
    const ordered = [];
    const seen = new Set();
    const sourceOrder = Array.isArray(raw.folderOrder) ? raw.folderOrder : ids;
    for (const value of [...sourceOrder, ...ids]) {
        const id = cleanText(value);
        if (folderById.has(id) && !seen.has(id)) {
            seen.add(id);
            ordered.push(id);
        }
    }
    const now = options.nowIso ?? getNowIso(options.clock);
    const validLegacyIds = new Set(ordered);
    const collections = ordered.map((id, position) => {
        const source = folderById.get(id);
        const folder = isRecord(source) ? source : {};
        const rules = Array.isArray(folder.collectionRules)
            ? normalizeRules(folder.collectionRules, limits)
            : (Array.isArray(folder.rules) ? folder.rules.map(legacyRule).filter(Boolean) : []);
        const candidateParentId = cleanText(folder.parentId);
        return normalizeCollection({
            id,
            name: cleanText(folder.name) || `Folder ${position + 1}`,
            parentId: candidateParentId && validLegacyIds.has(candidateParentId) ? candidateParentId : null,
            position,
            tags: folder.tags,
            rules,
            ruleMode: folder.ruleMode,
            color: folder.color,
            collapsed: folder.collapsed,
            pinned: folder.pinned,
            createdAt: folder.createdAt ?? now,
            updatedAt: folder.updatedAt ?? folder.createdAt ?? now
        }, { limits, nowIso: now });
    });
    const validIds = new Set(collections.map(collection => collection.id));
    const membershipMap = new Map();
    const chatToCollections = isRecord(raw.chatToCollections) ? raw.chatToCollections : {};
    for (const [rawItemId, rawCollectionIds] of Object.entries(chatToCollections)) {
        const itemId = cleanText(rawItemId);
        if (!itemId || !Array.isArray(rawCollectionIds)) continue;
        const idsForItem = rawCollectionIds.map(cleanText).filter(id => validIds.has(id));
        if (idsForItem.length) membershipMap.set(itemId, [...new Set(idsForItem)]);
    }
    const chatToFolder = isRecord(raw.chatToFolder) ? raw.chatToFolder : {};
    for (const [rawItemId, rawCollectionId] of Object.entries(chatToFolder)) {
        const itemId = cleanText(rawItemId);
        const collectionId = cleanText(rawCollectionId);
        if (itemId && validIds.has(collectionId) && !membershipMap.has(itemId)) membershipMap.set(itemId, [collectionId]);
    }
    const memberships = [...membershipMap.entries()].map(([itemId, collectionIds]) => ({ itemId, collectionIds }));
    return normalizeCollectionsState({
        schema: COLLECTIONS_SCHEMA,
        version: COLLECTIONS_SCHEMA_VERSION,
        sessionId,
        collections,
        memberships,
        native: options.native
    }, { sessionId, limits, nowIso: now });
}

export function normalizeCollectionsState(raw, options = {}) {
    const limits = resolveCollectionLimits(options.limits);
    const sessionId = normalizeSessionId(options.sessionId);
    if (raw === undefined || raw === null) return createEmptyCollectionsState(sessionId, options);
    if (!isRecord(raw)) fail('INVALID_STATE', 'Collections state must be an object');
    if (raw.schema === LEGACY_FOLDERS_SCHEMA || (isRecord(raw.folders) && raw.collections === undefined)) {
        return migrateLegacyFolders(raw, { ...options, sessionId, limits });
    }
    if (raw.schema !== undefined && raw.schema !== COLLECTIONS_SCHEMA) {
        fail('UNRECOGNIZED_SCHEMA', `Unsupported collections schema: ${raw.schema}`, { schema: raw.schema });
    }
    const version = raw.version ?? raw.schemaVersion;
    if (!Number.isInteger(version) || version < 1) fail('INVALID_VERSION', 'Collections version must be a positive integer');
    if (version > COLLECTIONS_SCHEMA_VERSION) fail('UNSUPPORTED_VERSION', `Collections version ${version} is newer than supported`, { version });
    if (raw.sessionId !== undefined && normalizeSessionId(raw.sessionId) !== sessionId) {
        fail('SESSION_MISMATCH', 'Collections state belongs to another session', { expected: sessionId, actual: raw.sessionId });
    }
    if (!Array.isArray(raw.collections)) fail('INVALID_COLLECTIONS', 'Collections state must contain a collections array');
    if (raw.collections.length > limits.maxCollections) fail('COLLECTION_LIMIT', 'Collection count exceeds the limit');
    const collections = raw.collections.map(collection => normalizeCollection(collection, {
        limits,
        ...(options.nowIso ? { nowIso: options.nowIso } : {}),
        ...(options.clock ? { clock: options.clock } : {})
    }));
    assertCollectionHierarchy(collections, limits);
    normalizeSiblingPositions(collections);
    const collectionIds = new Set(collections.map(collection => collection.id));
    const memberships = normalizeMemberships(raw.memberships, collectionIds, limits);
    return safeClone({
        schema: COLLECTIONS_SCHEMA,
        version: COLLECTIONS_SCHEMA_VERSION,
        sessionId,
        collections,
        memberships,
        native: createNativeMetadata(raw.native)
    });
}

export function assertImportSize(input, limits = COLLECTION_LIMITS) {
    if (typeof input === 'string' && new TextEncoder().encode(input).byteLength > limits.maxImportBytes) {
        fail('IMPORT_TOO_LARGE', 'Collections import exceeds the configured size limit');
    }
}

export function parseJson(input) {
    if (typeof input !== 'string') return safeClone(input, 'Collections import');
    try {
        return JSON.parse(input);
    } catch (error) {
        fail('INVALID_JSON', 'Collections import is not valid JSON', {}, error);
    }
}
