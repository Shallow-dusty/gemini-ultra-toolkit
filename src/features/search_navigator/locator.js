import { fail, isObject } from './contracts.js';

function locatorId(value, name) {
    if (typeof value !== 'string' || !value.trim()) {
        fail('INVALID_LOCATOR', `${name} must be a non-empty string`, { field: name });
    }
    return value.trim();
}

export function createChatLocator(chatId) {
    return Object.freeze({ kind: 'chat', chatId: locatorId(chatId, 'chatId') });
}

export function createMessageLocator(chatId, messageId, ordinal) {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
        fail('INVALID_LOCATOR', 'ordinal must be a non-negative safe integer', {
            field: 'ordinal'
        });
    }
    return Object.freeze({
        kind: 'message',
        chatId: locatorId(chatId, 'chatId'),
        messageId: locatorId(messageId, 'messageId'),
        ordinal
    });
}

export function assertSearchLocator(locator) {
    if (!isObject(locator)) fail('INVALID_LOCATOR', 'Search locator must be an object');
    if (locator.kind === 'chat') return createChatLocator(locator.chatId);
    if (locator.kind === 'message') {
        return createMessageLocator(locator.chatId, locator.messageId, locator.ordinal);
    }
    fail('INVALID_LOCATOR', 'Search locator kind must be "chat" or "message"', {
        kind: locator.kind
    });
}

/** Convert a ranked index document into the stable public result/locator shape. */
export function createSearchResult(document, scored, snippet) {
    let locator;
    if (document.kind === 'chat') locator = createChatLocator(document.chatId);
    else if (document.kind === 'message') {
        locator = createMessageLocator(document.chatId, document.messageId, document.ordinal);
    } else {
        fail('INVALID_LOCATOR', `Unsupported search document kind: ${document.kind}`, {
            kind: document.kind
        });
    }
    return {
        kind: document.kind,
        chatId: document.chatId,
        messageId: document.messageId,
        role: document.role,
        timestamp: document.metadata.timestamp,
        model: document.metadata.model,
        source: document.metadata.source,
        score: scored.score,
        matchedFields: scored.matchedFields.slice(),
        snippet,
        locator
    };
}
