import { fail } from './errors.js';
import { getCollectionTree, resolveMembership } from './operations.js';

export function normalizeSidebarChats(rawChats) {
    if (!Array.isArray(rawChats)) fail('INVALID_CHAT_SOURCE', 'Collections sidebar adapter must return an array');
    return rawChats.map(raw => {
        const id = String(raw?.id ?? '').trim();
        if (!id) return null;
        return {
            id,
            title: String(raw.title ?? '').trim() || id,
            href: String(raw.href ?? raw.url ?? '').trim(),
            tags: Array.isArray(raw.tags) ? raw.tags.map(tag => String(tag ?? '').trim()).filter(Boolean) : [],
            statuses: Array.isArray(raw.statuses)
                ? raw.statuses.map(status => String(status ?? '').trim()).filter(Boolean)
                : (String(raw.status ?? '').trim() ? [String(raw.status).trim()] : []),
            element: raw.element ?? null
        };
    }).filter(Boolean);
}

export function buildCollectionsPresentation(snapshot, chats, options = {}) {
    const query = String(options.query ?? '').trim().toLocaleLowerCase();
    const presentedChats = chats.map(chat => {
        const membership = resolveMembership(snapshot, chat, { sessionId: snapshot.sessionId });
        return {
            ...chat,
            manualCollectionIds: membership.manual,
            collectionIds: membership.collectionIds,
            matchesQuery: !query || chat.title.toLocaleLowerCase().includes(query)
        };
    });
    return {
        state: snapshot,
        tree: getCollectionTree(snapshot, {}, { sessionId: snapshot.sessionId }),
        chats: presentedChats,
        query: String(options.query ?? ''),
        editing: snapshot.collections.find(collection => collection.id === options.editingId) ?? null,
        status: options.status ?? '',
        error: options.error ?? '',
        canUndo: options.canUndo === true,
        rulePreview: options.rulePreview ?? null,
        focusKey: options.focusKey
    };
}

export function collectionsInTreeOrder(tree, output = []) {
    for (const collection of tree) {
        output.push(collection);
        collectionsInTreeOrder(collection.children, output);
    }
    return output;
}
