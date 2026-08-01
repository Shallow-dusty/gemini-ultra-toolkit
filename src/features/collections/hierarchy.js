import { fail } from './errors.js';

export function normalizeSiblingPositions(collections) {
    const groups = new Map();
    collections.forEach((collection, sourceIndex) => {
        const key = collection.parentId ?? '';
        const siblings = groups.get(key) ?? [];
        siblings.push({ collection, sourceIndex });
        groups.set(key, siblings);
    });
    for (const siblings of groups.values()) {
        siblings.sort((left, right) => left.collection.position - right.collection.position || left.sourceIndex - right.sourceIndex);
        siblings.forEach(({ collection }, position) => { collection.position = position; });
    }
}

export function assertCollectionHierarchy(collections, limits) {
    const byId = new Map(collections.map(collection => [collection.id, collection]));
    if (byId.size !== collections.length) fail('DUPLICATE_COLLECTION_ID', 'Collection ids must be unique');
    const siblingNames = new Map();
    for (const collection of collections) {
        if (collection.parentId !== null && !byId.has(collection.parentId)) {
            fail('PARENT_NOT_FOUND', `Parent collection not found: ${collection.parentId}`, { id: collection.id, parentId: collection.parentId });
        }
        if (collection.parentId === collection.id) fail('CYCLE_DETECTED', `Collection cannot parent itself: ${collection.id}`, { id: collection.id });
        const parentKey = collection.parentId ?? '';
        const nameKey = collection.name.normalize('NFKC').toLocaleLowerCase();
        const names = siblingNames.get(parentKey) ?? new Map();
        const duplicateId = names.get(nameKey);
        if (duplicateId) {
            fail(
                'DUPLICATE_COLLECTION_NAME',
                `A collection named "${collection.name}" already exists at this level`,
                { id: collection.id, duplicateId, parentId: collection.parentId, name: collection.name }
            );
        }
        names.set(nameKey, collection.id);
        siblingNames.set(parentKey, names);
    }
    const depthCache = new Map();
    const depthOf = (id, visiting = new Set()) => {
        if (depthCache.has(id)) return depthCache.get(id);
        if (visiting.has(id)) fail('CYCLE_DETECTED', `Collection hierarchy contains a cycle at ${id}`, { id });
        visiting.add(id);
        const parentId = byId.get(id).parentId;
        const depth = parentId === null ? 1 : depthOf(parentId, visiting) + 1;
        visiting.delete(id);
        if (depth > limits.maxDepth) fail('DEPTH_LIMIT', `Collection hierarchy exceeds depth ${limits.maxDepth}`, { id, depth });
        depthCache.set(id, depth);
        return depth;
    };
    for (const id of byId.keys()) depthOf(id);
}
