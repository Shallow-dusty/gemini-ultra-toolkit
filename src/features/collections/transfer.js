import { fail } from './errors.js';
import {
    COLLECTIONS_EXPORT_FORMAT,
    COLLECTIONS_EXPORT_VERSION,
    COLLECTIONS_SCHEMA,
    COLLECTIONS_SCHEMA_VERSION,
    LEGACY_FOLDERS_SCHEMA,
    assertImportSize,
    getNowIso,
    isRecord,
    migrateLegacyFolders,
    normalizeCollectionsState,
    normalizeId,
    normalizeSessionId,
    parseJson,
    resolveCollectionLimits,
    safeClone
} from './model.js';

const CREDENTIAL_FIELD = /^(?:password|passphrase|passcode|secret|totp|otp|cookie|authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret)$/i;

function assertNoCredentialFields(value, path = '$', seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
        if (CREDENTIAL_FIELD.test(key)) fail('CREDENTIAL_MATERIAL', `Credential material is not accepted at ${path}.${key}`, { path: `${path}.${key}` });
        assertNoCredentialFields(child, `${path}.${key}`, seen);
    }
}

function domainOptions(state, options = {}) {
    return {
        sessionId: normalizeSessionId(options.sessionId ?? state?.sessionId),
        limits: resolveCollectionLimits(options.limits),
        ...(options.nowIso ? { nowIso: options.nowIso } : {}),
        ...(options.clock ? { clock: options.clock } : {})
    };
}

export function createCollectionsExport(state, options = {}) {
    const normalizedOptions = domainOptions(state, options);
    const current = normalizeCollectionsState(state, normalizedOptions);
    const exportedAt = options.nowIso ?? getNowIso(options.clock);
    return safeClone({
        format: COLLECTIONS_EXPORT_FORMAT,
        formatVersion: COLLECTIONS_EXPORT_VERSION,
        schemaVersion: COLLECTIONS_SCHEMA_VERSION,
        exportedAt,
        // Session ids deliberately stay out of portable files.
        collections: [...current.collections].sort((left, right) => left.id.localeCompare(right.id)),
        memberships: current.memberships,
        native: {
            notebooks: {
                ownership: 'native',
                officialEntryPolicy: 'preserve'
            }
        }
    });
}

export function serializeCollectionsExport(state, options = {}) {
    return JSON.stringify(createCollectionsExport(state, options), null, 2);
}

export function parseCollectionsImport(input, options = {}) {
    const sessionId = normalizeSessionId(options.sessionId);
    const limits = resolveCollectionLimits(options.limits);
    assertImportSize(input, limits);
    const raw = parseJson(input);
    assertNoCredentialFields(raw);
    if (!isRecord(raw)) fail('INVALID_IMPORT', 'Collections import must contain an object');

    if (raw.format === COLLECTIONS_EXPORT_FORMAT) {
        if (raw.formatVersion !== COLLECTIONS_EXPORT_VERSION) {
            fail('UNSUPPORTED_EXPORT_VERSION', `Unsupported collections export version: ${raw.formatVersion}`, { version: raw.formatVersion });
        }
        return normalizeCollectionsState({
            schema: COLLECTIONS_SCHEMA,
            version: raw.schemaVersion ?? COLLECTIONS_SCHEMA_VERSION,
            sessionId,
            collections: raw.collections,
            memberships: raw.memberships,
            native: raw.native
        }, { sessionId, limits, nowIso: options.nowIso, clock: options.clock });
    }

    if (raw.schema === LEGACY_FOLDERS_SCHEMA || (isRecord(raw.folders) && raw.collections === undefined)) {
        return migrateLegacyFolders(raw, { sessionId, limits, nowIso: options.nowIso, clock: options.clock });
    }

    if (raw.schema === COLLECTIONS_SCHEMA || Array.isArray(raw.collections)) {
        const sourceSessionId = raw.sessionId;
        if (sourceSessionId !== undefined && normalizeSessionId(sourceSessionId) !== sessionId && options.allowCrossSession !== true) {
            fail('IMPORT_SESSION_MISMATCH', 'Collections import belongs to another session', {
                expected: sessionId,
                actual: sourceSessionId
            });
        }
        return normalizeCollectionsState({ ...raw, sessionId }, {
            sessionId,
            limits,
            nowIso: options.nowIso,
            clock: options.clock
        });
    }

    fail('UNRECOGNIZED_IMPORT', 'Collections import format is not recognized');
}

function depthMap(collections) {
    const byId = new Map(collections.map(collection => [collection.id, collection]));
    const cache = new Map();
    const depth = id => {
        if (cache.has(id)) return cache.get(id);
        const parentId = byId.get(id).parentId;
        const value = parentId === null ? 1 : depth(parentId) + 1;
        cache.set(id, value);
        return value;
    };
    for (const id of byId.keys()) depth(id);
    return cache;
}

function nextPosition(collections, parentId, excludedId = null) {
    return collections.filter(item => item.parentId === parentId && item.id !== excludedId).length;
}

function createReport(mode, conflict) {
    return {
        mode,
        conflict,
        imported: [],
        replaced: [],
        skipped: [],
        renamed: [],
        importedMemberships: 0
    };
}

export function importCollections(state, input, importOptions = {}, options = {}) {
    const normalizedOptions = domainOptions(state, options);
    const limits = normalizedOptions.limits;
    const current = normalizeCollectionsState(state, normalizedOptions);
    const mode = importOptions.mode ?? 'merge';
    const conflict = importOptions.conflict ?? 'error';
    if (mode !== 'merge' && mode !== 'replace') fail('INVALID_IMPORT_MODE', 'Collection import mode must be merge or replace');
    if (!['error', 'skip', 'incoming', 'rename'].includes(conflict)) {
        fail('INVALID_CONFLICT_POLICY', 'Collection conflict policy must be error, skip, incoming, or rename');
    }
    const incoming = parseCollectionsImport(input, {
        ...options,
        sessionId: current.sessionId,
        limits,
        allowCrossSession: importOptions.allowCrossSession
    });
    const report = createReport(mode, conflict);

    if (mode === 'replace') {
        const data = normalizeCollectionsState({
            ...incoming,
            sessionId: current.sessionId,
            native: current.native
        }, normalizedOptions);
        report.imported = data.collections.map(collection => collection.id).sort();
        report.importedMemberships = data.memberships.reduce((total, entry) => total + entry.collectionIds.length, 0);
        return safeClone({ data, report });
    }

    const collections = safeClone(current.collections);
    const existingIds = new Set(collections.map(collection => collection.id));
    const idMap = new Map();
    const depths = depthMap(incoming.collections);
    const orderedIncoming = [...incoming.collections].sort((left, right) => depths.get(left.id) - depths.get(right.id)
        || left.position - right.position
        || left.id.localeCompare(right.id));

    for (const source of orderedIncoming) {
        let targetId = source.id;
        const existingIndex = collections.findIndex(item => item.id === targetId);
        if (existingIndex >= 0) {
            if (conflict === 'error') fail('IMPORT_CONFLICT', `Collection import conflicts with ${targetId}`, { id: targetId });
            if (conflict === 'skip') {
                idMap.set(source.id, targetId);
                report.skipped.push(targetId);
                continue;
            }
            if (conflict === 'rename') {
                if (typeof options.idFactory !== 'function') fail('ID_FACTORY_REQUIRED', 'Collection idFactory is required for rename conflicts');
                targetId = normalizeId(options.idFactory(safeClone({
                    kind: 'import-rename',
                    sessionId: current.sessionId,
                    sourceId: source.id
                })), 'Generated collection id', limits);
                if (existingIds.has(targetId)) {
                    fail('ID_FACTORY_COLLISION', `Generated collection id already exists: ${targetId}`, { id: targetId });
                }
                report.renamed.push({ fromId: source.id, toId: targetId });
            } else {
                report.replaced.push(targetId);
            }
        } else {
            report.imported.push(targetId);
        }

        idMap.set(source.id, targetId);
        const parentId = source.parentId === null ? null : idMap.get(source.parentId);
        const imported = {
            ...safeClone(source),
            id: targetId,
            parentId,
            position: nextPosition(collections, parentId, targetId)
        };
        if (existingIndex >= 0 && conflict === 'incoming') collections[existingIndex] = imported;
        else collections.push(imported);
        existingIds.add(targetId);
    }

    const membershipMap = new Map(current.memberships.map(entry => [entry.itemId, new Set(entry.collectionIds)]));
    for (const entry of incoming.memberships) {
        const target = membershipMap.get(entry.itemId) ?? new Set();
        for (const sourceId of entry.collectionIds) {
            const targetId = idMap.get(sourceId);
            if (!target.has(targetId)) {
                target.add(targetId);
                report.importedMemberships += 1;
            }
        }
        membershipMap.set(entry.itemId, target);
    }
    const memberships = [...membershipMap.entries()].map(([itemId, ids]) => ({
        itemId,
        collectionIds: [...ids]
    }));
    const data = normalizeCollectionsState({
        ...current,
        collections,
        memberships
    }, normalizedOptions);
    return safeClone({ data, report });
}
