export class BulkLifecycleError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'BulkLifecycleError';
        this.code = code;
        this.details = Object.freeze({ ...details });
    }
}

function requiredText(value, field) {
    const text = String(value ?? '').trim();
    if (!text) {
        throw new BulkLifecycleError(
            'INVALID_CONVERSATION',
            `Conversation ${field} must be a non-empty string`,
            { field }
        );
    }
    return text;
}

function optionalText(value) {
    return String(value ?? '').trim();
}

export function normalizeConversation(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BulkLifecycleError('INVALID_CONVERSATION', 'Conversation must be an object');
    }
    const id = requiredText(value.id, 'id');
    const title = requiredText(value.title, 'title');
    const href = optionalText(value.href);
    const fingerprint = JSON.stringify([id, title, href]);
    return Object.freeze({ id, title, href, fingerprint });
}

function normalizeScope(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BulkLifecycleError('INVALID_SCOPE', 'A visible run scope is required');
    }
    const kind = requiredText(value.kind, 'scope kind');
    const label = requiredText(value.label, 'scope label');
    const routeKey = optionalText(value.routeKey);
    const sessionKey = optionalText(value.sessionKey);
    return Object.freeze({ kind, label, routeKey, sessionKey });
}

export function sameRunScope(expected, current) {
    const left = normalizeScope(expected);
    const right = normalizeScope(current);
    return left.kind === right.kind &&
        left.routeKey === right.routeKey &&
        left.sessionKey === right.sessionKey;
}

export function conversationMatches(expected, current) {
    if (!current) return false;
    try {
        return normalizeConversation(expected).fingerprint === normalizeConversation(current).fingerprint;
    } catch (_invalid) {
        return false;
    }
}

export function confirmationPhrase(count) {
    if (!Number.isInteger(count) || count < 1) {
        throw new BulkLifecycleError('INVALID_COUNT', 'Confirmation count must be a positive integer');
    }
    return `DELETE ${count}`;
}

export function createRunSnapshot({ items, selectedIds, scope, capturedAt } = {}) {
    if (!Array.isArray(items) || !Array.isArray(selectedIds)) {
        throw new BulkLifecycleError('INVALID_SELECTION', 'Items and selectedIds must be arrays');
    }
    const byId = new Map();
    for (const value of items) {
        const item = normalizeConversation(value);
        if (byId.has(item.id)) {
            throw new BulkLifecycleError('DUPLICATE_CONVERSATION', `Duplicate conversation id: ${item.id}`);
        }
        byId.set(item.id, item);
    }

    const uniqueIds = [...new Set(selectedIds.map(value => requiredText(value, 'selected id')))];
    if (uniqueIds.length === 0) {
        throw new BulkLifecycleError('EMPTY_SELECTION', 'Select at least one conversation');
    }
    const selected = uniqueIds.map(id => {
        const item = byId.get(id);
        if (!item) {
            throw new BulkLifecycleError(
                'SELECTION_STALE',
                `Selected conversation is not in the captured item set: ${id}`,
                { id }
            );
        }
        return item;
    });

    const timestamp = requiredText(capturedAt, 'capturedAt');
    const normalizedScope = normalizeScope(scope);
    return Object.freeze({
        capturedAt: timestamp,
        scope: normalizedScope,
        items: Object.freeze(selected)
    });
}
