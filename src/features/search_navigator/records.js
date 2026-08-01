import { fail, isObject } from './contracts.js';

function requireObject(value, path) {
    if (!isObject(value)) fail('INVALID_RECORD', `${path} must be an object`, { path });
    return value;
}

function readAlias(record, names) {
    for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(record, name)) return record[name];
    }
    return undefined;
}

function readMetadataAlias(record, names) {
    const direct = readAlias(record, names);
    if (direct !== undefined) return direct;
    return isObject(record.metadata) ? readAlias(record.metadata, names) : undefined;
}

export function normalizeId(value, path) {
    if (typeof value !== 'string' || !value.trim()) {
        fail('INVALID_RECORD', `${path} must be a non-empty string`, { path });
    }
    return value.trim();
}

function normalizeNullableText(value, path, maxLength) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') fail('INVALID_RECORD', `${path} must be a string or null`, { path });
    if (value.length > maxLength) {
        fail('LIMIT_EXCEEDED', `${path} exceeds its length limit`, { path, limit: maxLength });
    }
    return value;
}

function normalizeMetadataText(value, path, maxLength) {
    return normalizeNullableText(value, path, maxLength).trim();
}

function normalizeTimestamp(value, path) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' && typeof value !== 'number') {
        fail('INVALID_RECORD', `${path} must be an ISO date string, timestamp, or null`, { path });
    }
    const timestamp = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(timestamp)) {
        fail('INVALID_RECORD', `${path} must be a valid date`, { path });
    }
    return timestamp;
}

function normalizeSearchMetadata(record, path, limits) {
    return {
        timestamp: normalizeTimestamp(
            readMetadataAlias(record, ['timestamp', 'createdAt', 'updatedAt', 'exportedAt', 'date']),
            `${path}.timestamp`
        ),
        model: normalizeMetadataText(
            readMetadataAlias(record, ['model', 'modelKey']),
            `${path}.model`,
            limits.maxMetadataLength
        ),
        source: normalizeMetadataText(
            readMetadataAlias(record, ['source', 'href', 'url']),
            `${path}.source`,
            limits.maxMetadataLength
        )
    };
}

function normalizeTextList(value, path, { maxItems, maxLength, allowObjectText = false }) {
    if (value === undefined || value === null) return [];
    const items = typeof value === 'string' ? [value] : value;
    if (!Array.isArray(items)) fail('INVALID_RECORD', `${path} must be a string, array, or null`, { path });
    if (items.length > maxItems) {
        fail('LIMIT_EXCEEDED', `${path} contains too many items`, { path, limit: maxItems });
    }
    return items.map((item, index) => {
        const text = allowObjectText && isObject(item) ? item.text : item;
        const itemPath = `${path}[${index}]`;
        if (typeof text !== 'string') fail('INVALID_RECORD', `${itemPath} must contain text`, { path: itemPath });
        if (text.length > maxLength) {
            fail('LIMIT_EXCEEDED', `${itemPath} exceeds its length limit`, { path: itemPath, limit: maxLength });
        }
        return text;
    });
}

export function normalizeMessage(record, chatPath, ordinal, limits) {
    const path = `${chatPath}.messages[${ordinal}]`;
    requireObject(record, path);
    const id = normalizeId(readAlias(record, ['messageId', 'id']), `${path}.id`);
    const role = normalizeNullableText(record.role, `${path}.role`, limits.maxRoleLength) || 'unknown';
    return {
        id,
        role,
        content: normalizeNullableText(
            readAlias(record, ['content', 'text']),
            `${path}.content`,
            limits.maxContentLength
        ),
        annotations: normalizeTextList(readAlias(record, ['annotations', 'annotation']), `${path}.annotations`, {
            maxItems: limits.maxAnnotationsPerRecord,
            maxLength: limits.maxAnnotationLength,
            allowObjectText: true
        }),
        metadata: normalizeSearchMetadata(record, path, limits)
    };
}

export function normalizeChat(record, index, limits) {
    const path = `records[${index}]`;
    requireObject(record, path);
    const id = normalizeId(readAlias(record, ['chatId', 'id']), `${path}.id`);
    const messages = record.messages ?? [];
    if (!Array.isArray(messages)) {
        fail('INVALID_RECORD', `${path}.messages must be an array or null`, { path: `${path}.messages` });
    }
    if (messages.length > limits.maxMessagesPerChat) {
        fail('LIMIT_EXCEEDED', `${path}.messages contains too many messages`, {
            path: `${path}.messages`,
            limit: limits.maxMessagesPerChat
        });
    }
    const normalizedMessages = messages.map((message, ordinal) =>
        normalizeMessage(message, path, ordinal, limits));
    const messageIds = new Set();
    for (const message of normalizedMessages) {
        if (messageIds.has(message.id)) {
            fail('DUPLICATE_ID', `Duplicate message id in chat ${id}`, {
                chatId: id,
                messageId: message.id
            });
        }
        messageIds.add(message.id);
    }
    return {
        id,
        title: normalizeNullableText(record.title, `${path}.title`, limits.maxTitleLength),
        tags: normalizeTextList(record.tags, `${path}.tags`, {
            maxItems: limits.maxTagsPerChat,
            maxLength: limits.maxTagLength
        }),
        annotations: normalizeTextList(readAlias(record, ['annotations', 'annotation']), `${path}.annotations`, {
            maxItems: limits.maxAnnotationsPerRecord,
            maxLength: limits.maxAnnotationLength,
            allowObjectText: true
        }),
        metadata: normalizeSearchMetadata(record, path, limits),
        messages: normalizedMessages
    };
}

export function archiveChatRecords(source) {
    if (Array.isArray(source)) return source;
    if (!isObject(source)) fail('INVALID_ARCHIVE', 'Archive chats must be an array or archive object');
    if (Object.prototype.hasOwnProperty.call(source, 'chats')) {
        if (Array.isArray(source.chats)) return source.chats;
        fail('INVALID_ARCHIVE', 'Archive chats must be an array');
    }
    if (Object.prototype.hasOwnProperty.call(source, 'payload')) {
        if (isObject(source.payload) && Array.isArray(source.payload.chats)) {
            return source.payload.chats;
        }
        fail('INVALID_ARCHIVE', 'Archive payload does not contain a chats array');
    }
    fail('INVALID_ARCHIVE', 'Archive does not contain a chats array');
}
