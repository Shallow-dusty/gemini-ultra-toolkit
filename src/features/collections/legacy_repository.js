import { fail } from './errors.js';
import {
    COLLECTIONS_SCHEMA,
    LEGACY_FOLDERS_SCHEMA,
    createEmptyCollectionsState,
    isRecord,
    migrateLegacyFolders,
    normalizeCollectionsState,
    normalizeSessionId,
    safeClone
} from './model.js';

export const LEGACY_FOLDERS_KEY = 'gemini_folders_data';
export const LEGACY_COLLECTIONS_FIELD = 'collectionsState';

const RESERVED_TOP_LEVEL = new Set([
    'schema', 'version', 'folders', 'chatToFolder', 'folderOrder',
    'chatToCollections', LEGACY_COLLECTIONS_FIELD
]);

function legacyRule(rule) {
    if (rule.legacyType === 'regex') return { type: 'regex', value: rule.value };
    if (rule.enabled && rule.field === 'title' && rule.operator === 'contains') {
        return { type: 'keyword', value: rule.value };
    }
    return null;
}

function collectionOrder(state) {
    const children = new Map();
    for (const collection of state.collections) {
        const group = children.get(collection.parentId) ?? [];
        group.push(collection);
        children.set(collection.parentId, group);
    }
    for (const group of children.values()) {
        // Normalized collection state guarantees unique sibling positions.
        group.sort((left, right) => left.position - right.position);
    }
    const ordered = [];
    const visit = parentId => {
        for (const collection of children.get(parentId) ?? []) {
            ordered.push(collection);
            visit(collection.id);
        }
    };
    visit(null);
    return ordered;
}

export function legacyStorageKey(sessionId, options = {}) {
    const id = normalizeSessionId(sessionId);
    const temporarySessionId = options.temporarySessionId ?? 'Guest';
    const baseKey = options.baseKey ?? LEGACY_FOLDERS_KEY;
    return id === temporarySessionId ? baseKey : `${baseKey}_${id}`;
}

export function readCollectionsFromLegacy(raw, options = {}) {
    const sessionId = normalizeSessionId(options.sessionId);
    if (raw === undefined || raw === null) return createEmptyCollectionsState(sessionId, options);
    if (!isRecord(raw)) fail('INVALID_LEGACY_STORAGE', 'Legacy folders storage must contain an object');
    if (isRecord(raw[LEGACY_COLLECTIONS_FIELD])) {
        return normalizeCollectionsState(raw[LEGACY_COLLECTIONS_FIELD], { ...options, sessionId });
    }
    if (raw.schema === COLLECTIONS_SCHEMA || Array.isArray(raw.collections)) {
        return normalizeCollectionsState(raw, { ...options, sessionId });
    }
    return migrateLegacyFolders(raw, { ...options, sessionId });
}

export function writeCollectionsToLegacy(state, previousRaw = {}, options = {}) {
    const sessionId = normalizeSessionId(options.sessionId ?? state?.sessionId);
    const current = normalizeCollectionsState(state, { ...options, sessionId });
    const previous = isRecord(previousRaw) ? safeClone(previousRaw, 'Legacy folders storage') : {};
    const previousFolders = isRecord(previous.folders) ? previous.folders : {};
    const output = {};

    for (const [key, value] of Object.entries(previous)) {
        if (!RESERVED_TOP_LEVEL.has(key)) output[key] = value;
    }

    output.schema = LEGACY_FOLDERS_SCHEMA;
    output.version = Number.isInteger(previous.version) && previous.version > 0 ? previous.version : 1;
    output.folders = {};
    output.chatToFolder = {};
    output.chatToCollections = {};
    output.folderOrder = [];

    for (const collection of collectionOrder(current)) {
        const oldFolder = isRecord(previousFolders[collection.id]) ? previousFolders[collection.id] : {};
        output.folders[collection.id] = {
            ...oldFolder,
            name: collection.name,
            color: collection.color,
            collapsed: collection.collapsed,
            pinned: collection.pinned,
            rules: collection.rules.map(legacyRule).filter(Boolean),
            parentId: collection.parentId,
            tags: safeClone(collection.tags),
            collectionRules: safeClone(collection.rules),
            ruleMode: collection.ruleMode,
            createdAt: collection.createdAt,
            updatedAt: collection.updatedAt
        };
        output.folderOrder.push(collection.id);
    }

    for (const membership of current.memberships) {
        output.chatToCollections[membership.itemId] = safeClone(membership.collectionIds);
        if (membership.collectionIds.length) output.chatToFolder[membership.itemId] = membership.collectionIds[0];
    }
    output[LEGACY_COLLECTIONS_FIELD] = safeClone(current);
    return safeClone(output);
}

export function createLegacyCollectionsRepository({
    storage,
    sessionId,
    key = LEGACY_FOLDERS_KEY,
    temporarySessionId = 'Guest',
    clock,
    limits
} = {}) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new TypeError('Legacy collections storage must implement get() and set()');
    }
    const owner = normalizeSessionId(sessionId);
    const storageKey = legacyStorageKey(owner, { baseKey: key, temporarySessionId });
    const domainOptions = { sessionId: owner, clock, limits };

    return Object.freeze({
        boundAccountId: owner,
        storageKey,
        scope: Object.freeze({ readOnly: false, sessionUserId: owner }),
        async get() {
            const raw = await storage.get(storageKey, null);
            return readCollectionsFromLegacy(raw, domainOptions);
        },
        async update(updater) {
            if (typeof updater !== 'function') fail('INVALID_UPDATER', 'Collections repository update requires a function');
            const raw = await storage.get(storageKey, null);
            const current = readCollectionsFromLegacy(raw, domainOptions);
            const next = await updater(safeClone(current));
            const normalized = normalizeCollectionsState(next, domainOptions);
            await storage.set(storageKey, writeCollectionsToLegacy(normalized, raw, domainOptions));
            return safeClone(normalized);
        },
        async flush() {
            if (typeof storage.flush === 'function') await storage.flush();
        }
    });
}
