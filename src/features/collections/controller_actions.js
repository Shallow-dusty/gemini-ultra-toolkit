import { fail } from './errors.js';
import { normalizeCollection } from './model.js';
import { listCollections, resolveMembership } from './operations.js';

export async function submitCollectionAction({ service, snapshot, editingId, draft }) {
    if (!editingId) return service.create(draft);
    const existing = snapshot.collections.find(collection => collection.id === editingId);
    if (!existing) fail('COLLECTION_NOT_FOUND', `Collection not found: ${editingId}`, { id: editingId });
    const candidate = normalizeCollection({ ...existing, ...draft }, { nowIso: existing.updatedAt });
    let result = existing;
    if (candidate.parentId !== existing.parentId) {
        const siblings = snapshot.collections.filter(value => value.parentId === candidate.parentId && value.id !== editingId);
        result = await service.move(editingId, { parentId: candidate.parentId, index: siblings.length });
    }
    const comparable = value => JSON.stringify({
        name: value.name,
        tags: value.tags,
        color: value.color,
        rules: value.rules,
        ruleMode: value.ruleMode
    });
    if (comparable(candidate) !== comparable(existing)) {
        result = await service.update(editingId, {
            name: candidate.name,
            tags: candidate.tags,
            color: candidate.color,
            rules: candidate.rules,
            ruleMode: candidate.ruleMode
        });
    }
    return result;
}

export async function moveCollectionAction({ service, snapshot, id, placement }) {
    if (typeof placement === 'number') {
        const collection = snapshot.collections.find(value => value.id === id);
        if (!collection) fail('COLLECTION_NOT_FOUND', `Collection not found: ${id}`, { id });
        const siblings = listCollections(snapshot, { parentId: collection.parentId }, { sessionId: snapshot.sessionId });
        const index = siblings.findIndex(value => value.id === id);
        const target = Math.max(0, Math.min(index + placement, siblings.length - 1));
        if (target === index) return collection;
        return service.move(id, { parentId: collection.parentId, index: target });
    }
    const target = snapshot.collections.find(value => value.id === placement.targetId);
    if (!target) fail('COLLECTION_NOT_FOUND', `Collection not found: ${placement.targetId}`);
    const siblings = listCollections(snapshot, { parentId: target.parentId }, { sessionId: snapshot.sessionId })
        .filter(value => value.id !== id);
    let index = siblings.findIndex(value => value.id === target.id);
    if (placement.position === 'after') index += 1;
    return service.move(id, { parentId: target.parentId, index });
}

export function nextManualMembershipIds({ snapshot, chatId, collectionId, removeCollectionId = null }) {
    const resolved = resolveMembership(snapshot, { itemId: chatId }, { sessionId: snapshot.sessionId });
    const ids = new Set(resolved.manual);
    if (removeCollectionId) ids.delete(removeCollectionId);
    else if (collectionId) ids.add(collectionId);
    else ids.clear();
    return [...ids];
}

export async function assignChatAction({ service, snapshot, chatId, collectionId, removeCollectionId = null }) {
    return service.setManualMembership(chatId, nextManualMembershipIds({
        snapshot, chatId, collectionId, removeCollectionId
    }));
}
