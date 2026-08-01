import { fail } from './errors.js';
import {
    COLLECTION_LIMITS,
    ROOT_COLLECTION_ID,
    SORT_FIELDS,
    getNowIso,
    isRecord,
    normalizeCollection,
    normalizeCollectionsState,
    normalizeId,
    normalizeItemId,
    normalizeSessionId,
    resolveCollectionLimits,
    safeClone
} from './model.js';
import { matchingRuleCollectionIds, normalizeRuleCandidateFields } from './rules.js';

function optionsFor(state, options = {}) {
    return {
        sessionId: normalizeSessionId(options.sessionId ?? state?.sessionId),
        limits: options.limits,
        ...(options.nowIso ? { nowIso: options.nowIso } : {}),
        ...(options.clock ? { clock: options.clock } : {})
    };
}

function currentState(state, options = {}) {
    return normalizeCollectionsState(state, optionsFor(state, options));
}

function collectionById(state, rawId, limits = COLLECTION_LIMITS) {
    const id = normalizeId(rawId, 'Collection id', limits);
    const collection = state.collections.find(item => item.id === id);
    if (!collection) fail('COLLECTION_NOT_FOUND', `Collection not found: ${id}`, { id });
    return collection;
}

function normalizeParentId(value, limits) {
    return value === null || value === undefined || value === ''
        ? ROOT_COLLECTION_ID
        : normalizeId(value, 'Parent collection id', limits);
}

function siblingList(state, parentId, excludedId = null) {
    return state.collections
        .filter(item => item.parentId === parentId && item.id !== excludedId)
        .sort((left, right) => left.position - right.position);
}

function applySiblingOrder(collections, parentId, ids) {
    const positions = new Map(ids.map((id, position) => [id, position]));
    for (const collection of collections) {
        if (collection.parentId === parentId && positions.has(collection.id)) {
            collection.position = positions.get(collection.id);
        }
    }
}

function nowFromOptions(options) {
    return options.nowIso ?? getNowIso(options.clock);
}

function generatedId(factory, context, limits) {
    if (typeof factory !== 'function') fail('ID_FACTORY_REQUIRED', 'Collection idFactory is required when no id is supplied');
    return normalizeId(factory(safeClone(context, 'Collection id context')), 'Generated collection id', limits);
}

export function listCollections(state, query = {}, options = {}) {
    const current = currentState(state, options);
    if (!isRecord(query)) fail('INVALID_QUERY', 'Collection list query must be an object');
    const limits = resolveCollectionLimits(options.limits);
    const parentId = normalizeParentId(query.parentId, limits);
    if (parentId !== null) collectionById(current, parentId, limits);
    const sortBy = query.sortBy ?? 'manual';
    const direction = query.direction ?? 'asc';
    if (!SORT_FIELDS.includes(sortBy)) fail('INVALID_SORT', `Unsupported collection sort: ${sortBy}`, { sortBy });
    if (direction !== 'asc' && direction !== 'desc') fail('INVALID_SORT_DIRECTION', 'Collection sort direction must be asc or desc');
    const multiplier = direction === 'asc' ? 1 : -1;
    const result = current.collections.filter(item => item.parentId === parentId);
    result.sort((left, right) => {
        let compared;
        if (sortBy === 'manual') compared = left.position - right.position;
        else compared = String(left[sortBy]).localeCompare(String(right[sortBy]));
        return multiplier * compared || left.id.localeCompare(right.id);
    });
    return safeClone(result);
}

export function getCollectionTree(state, query = {}, options = {}) {
    const current = currentState(state, options);
    const visit = parentId => listCollections(current, { ...query, parentId }, options)
        .map(collection => ({ ...collection, children: visit(collection.id) }));
    return safeClone(visit(ROOT_COLLECTION_ID));
}

export function createCollection(state, draft, options = {}) {
    const current = currentState(state, options);
    if (!isRecord(draft)) fail('INVALID_COLLECTION', 'Collection draft must be an object');
    const limits = resolveCollectionLimits(options.limits);
    if (current.collections.length >= limits.maxCollections) fail('COLLECTION_LIMIT', 'Collection count exceeds the limit');
    const now = nowFromOptions(options);
    const parentId = normalizeParentId(draft.parentId, limits);
    if (parentId !== null) collectionById(current, parentId, limits);
    const position = siblingList(current, parentId).length;
    const candidate = normalizeCollection({ ...draft, id: 'x', parentId, position, createdAt: now, updatedAt: now }, {
        limits,
        nowIso: now
    });
    const nameKey = candidate.name.normalize('NFKC').toLocaleLowerCase();
    const duplicate = current.collections.find(item => item.parentId === parentId && item.name.normalize('NFKC').toLocaleLowerCase() === nameKey);
    if (duplicate) {
        fail('DUPLICATE_COLLECTION_NAME', `A collection named "${candidate.name}" already exists at this level`, {
            duplicateId: duplicate.id, parentId, name: candidate.name
        });
    }
    const id = draft.id === undefined
        ? generatedId(options.idFactory, { kind: 'create', sessionId: current.sessionId, name: candidate.name }, limits)
        : normalizeId(draft.id, 'Collection id', limits);
    if (current.collections.some(item => item.id === id)) fail('COLLECTION_EXISTS', `Collection already exists: ${id}`, { id });
    const collection = { ...candidate, id };
    const data = normalizeCollectionsState({
        ...current,
        collections: [...current.collections, collection]
    }, { sessionId: current.sessionId, limits, nowIso: now });
    return safeClone({ data, collection: data.collections.find(item => item.id === id) });
}

const UPDATE_FIELDS = new Set(['name', 'tags', 'rules', 'ruleMode', 'color', 'collapsed', 'pinned']);

export function updateCollection(state, rawId, patch, options = {}) {
    const current = currentState(state, options);
    const limits = resolveCollectionLimits(options.limits);
    const existing = collectionById(current, rawId, limits);
    if (!isRecord(patch)) fail('INVALID_PATCH', 'Collection patch must be an object');
    const unknown = Object.keys(patch).filter(key => !UPDATE_FIELDS.has(key));
    if (unknown.length) fail('UNKNOWN_FIELD', `Collection patch contains unknown fields: ${unknown.join(', ')}`, { unknown });
    if (Object.keys(patch).length === 0) fail('NO_CHANGES', 'Collection patch cannot be empty');
    const now = nowFromOptions(options);
    const candidate = normalizeCollection({ ...existing, ...safeClone(patch), updatedAt: now }, { limits, nowIso: now });
    const comparable = value => JSON.stringify({ ...value, updatedAt: existing.updatedAt });
    if (comparable(candidate) === comparable(existing)) fail('NO_CHANGES', 'Collection patch does not change data');
    const data = normalizeCollectionsState({
        ...current,
        collections: current.collections.map(item => item.id === existing.id ? candidate : item)
    }, { sessionId: current.sessionId, limits, nowIso: now });
    return safeClone({ data, collection: data.collections.find(item => item.id === existing.id) });
}

function isDescendant(state, ancestorId, candidateId) {
    let currentId = candidateId;
    while (currentId !== null) {
        if (currentId === ancestorId) return true;
        currentId = state.collections.find(item => item.id === currentId)?.parentId ?? null;
    }
    return false;
}

export function moveCollection(state, rawId, placement = {}, options = {}) {
    const current = currentState(state, options);
    if (!isRecord(placement)) fail('INVALID_MOVE', 'Collection placement must be an object');
    const limits = resolveCollectionLimits(options.limits);
    const existing = collectionById(current, rawId, limits);
    const parentId = placement.parentId === undefined
        ? existing.parentId
        : normalizeParentId(placement.parentId, limits);
    if (parentId !== null) collectionById(current, parentId, limits);
    if (parentId === existing.id || isDescendant(current, existing.id, parentId)) {
        fail('CYCLE_DETECTED', `Moving ${existing.id} below ${parentId} would create a cycle`, { id: existing.id, parentId });
    }
    const targetSiblings = siblingList(current, parentId, existing.id);
    const index = placement.index === undefined ? targetSiblings.length : placement.index;
    if (!Number.isInteger(index) || index < 0 || index > targetSiblings.length) {
        fail('INVALID_MOVE_INDEX', 'Collection move index is outside the sibling range', { index });
    }
    const next = safeClone(current);
    const moved = next.collections.find(item => item.id === existing.id);
    const previousParentId = moved.parentId;
    moved.parentId = parentId;
    moved.updatedAt = nowFromOptions(options);

    const oldIds = siblingList(next, previousParentId, moved.id).map(item => item.id);
    applySiblingOrder(next.collections, previousParentId, oldIds);
    const targetIds = siblingList(next, parentId, moved.id).map(item => item.id);
    targetIds.splice(index, 0, moved.id);
    applySiblingOrder(next.collections, parentId, targetIds);

    const data = normalizeCollectionsState(next, {
        sessionId: current.sessionId,
        limits,
        nowIso: moved.updatedAt
    });
    return safeClone({ data, collection: data.collections.find(item => item.id === moved.id) });
}

function descendantIds(state, rootId) {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const collection of state.collections) {
            if (collection.parentId !== null && ids.has(collection.parentId) && !ids.has(collection.id)) {
                ids.add(collection.id);
                changed = true;
            }
        }
    }
    return ids;
}

export function removeCollection(state, rawId, removeOptions = {}, options = {}) {
    const current = currentState(state, options);
    if (!isRecord(removeOptions)) fail('INVALID_REMOVE', 'Collection remove options must be an object');
    const limits = resolveCollectionLimits(options.limits);
    const existing = collectionById(current, rawId, limits);
    const children = current.collections.filter(item => item.parentId === existing.id);
    if (children.length && removeOptions.cascade !== true) {
        fail('COLLECTION_NOT_EMPTY', `Collection ${existing.id} contains child collections`, { id: existing.id, children: children.map(item => item.id) });
    }
    const removedIds = removeOptions.cascade === true ? descendantIds(current, existing.id) : new Set([existing.id]);
    const next = {
        ...current,
        collections: current.collections.filter(item => !removedIds.has(item.id)),
        memberships: current.memberships
            .map(item => ({ ...item, collectionIds: item.collectionIds.filter(id => !removedIds.has(id)) }))
            .filter(item => item.collectionIds.length)
    };
    const now = nowFromOptions(options);
    const data = normalizeCollectionsState(next, { sessionId: current.sessionId, limits, nowIso: now });
    return safeClone({ data, removedIds: [...removedIds].sort() });
}

export function setManualMembership(state, rawItemId, rawCollectionIds, options = {}) {
    const current = currentState(state, options);
    const limits = resolveCollectionLimits(options.limits);
    const itemId = normalizeItemId(rawItemId, limits);
    if (!Array.isArray(rawCollectionIds)) fail('INVALID_MEMBERSHIP', 'Manual membership collection ids must be an array');
    const collectionIds = [...new Set(rawCollectionIds.map(id => collectionById(current, id, limits).id))].sort();
    const memberships = current.memberships.filter(item => item.itemId !== itemId);
    if (collectionIds.length) memberships.push({ itemId, collectionIds });
    const data = normalizeCollectionsState({ ...current, memberships }, {
        sessionId: current.sessionId,
        limits,
        nowIso: options.nowIso ?? getNowIso(options.clock)
    });
    return safeClone({ data, membership: data.memberships.find(item => item.itemId === itemId) ?? null });
}

function normalizeCandidate(item, limits) {
    if (!isRecord(item)) fail('INVALID_MEMBERSHIP_CANDIDATE', 'Membership candidate must be an object');
    return {
        itemId: normalizeItemId(item.itemId ?? item.id ?? item.chatId, limits),
        ...normalizeRuleCandidateFields(item, limits)
    };
}

export function resolveMembership(state, item, options = {}) {
    const current = currentState(state, options);
    const limits = resolveCollectionLimits(options.limits);
    const candidate = normalizeCandidate(item, limits);
    const manual = current.memberships.find(entry => entry.itemId === candidate.itemId)?.collectionIds ?? [];
    const rule = matchingRuleCollectionIds(current.collections, candidate);
    return safeClone({
        itemId: candidate.itemId,
        manual: [...manual],
        rule,
        collectionIds: [...new Set([...manual, ...rule])]
    });
}

export function setNotebooksAvailability(state, availability, options = {}) {
    const current = currentState(state, options);
    if (!isRecord(availability) || typeof availability.available !== 'boolean') {
        fail('INVALID_NATIVE_AVAILABILITY', 'Notebooks availability must contain a boolean available field');
    }
    const observedAt = availability.observedAt ?? nowFromOptions(options);
    const data = normalizeCollectionsState({
        ...current,
        native: {
            notebooks: {
                available: availability.available,
                observedAt,
                // Caller input cannot reclassify or suppress Gemini's entry.
                ownership: 'native',
                officialEntryPolicy: 'preserve'
            }
        }
    }, { sessionId: current.sessionId, limits: options.limits, nowIso: observedAt });
    return safeClone({ data, notebooks: data.native.notebooks });
}
