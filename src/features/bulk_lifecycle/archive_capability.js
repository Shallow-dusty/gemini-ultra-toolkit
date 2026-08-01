import { BulkLifecycleError } from './snapshot.js';

export const BULK_LIFECYCLE_ARCHIVE_CAPABILITY = 'archive.bulk-lifecycle';
export const BULK_LIFECYCLE_ARCHIVE_MAX_ITEMS = 100;

function fail(code, message, details = {}) {
    throw new BulkLifecycleError(code, message, details);
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function requiredText(value, field) {
    const text = String(value ?? '').trim();
    if (!text) fail('INVALID_ARCHIVE_SELECTION', `${field} must be a non-empty string`, { field });
    return text;
}

export function normalizeBulkArchiveSelection(items, { maxItems = BULK_LIFECYCLE_ARCHIVE_MAX_ITEMS } = {}) {
    if (!Number.isInteger(maxItems) || maxItems < 1) {
        throw new TypeError('Bulk archive maxItems must be a positive integer');
    }
    if (!Array.isArray(items) || items.length === 0) {
        fail('INVALID_ARCHIVE_SELECTION', 'Bulk archive requires an explicit non-empty selection');
    }
    if (items.length > maxItems) {
        fail('ARCHIVE_SELECTION_LIMIT', `Bulk archive is limited to ${maxItems} conversations`, {
            actual: items.length,
            maximum: maxItems
        });
    }

    const ids = new Set();
    const normalized = items.map((item, index) => {
        if (!isPlainObject(item)) {
            fail('INVALID_ARCHIVE_SELECTION', `Archive selection item ${index} must be an object`, { index });
        }
        const id = requiredText(item.id, `items[${index}].id`);
        if (ids.has(id)) fail('INVALID_ARCHIVE_SELECTION', `Duplicate archive selection id: ${id}`, { id });
        ids.add(id);
        return Object.freeze({
            id,
            title: requiredText(item.title, `items[${index}].title`),
            href: String(item.href ?? '').trim()
        });
    });
    return Object.freeze(normalized);
}

export function normalizeArchiveCapability(capability) {
    if (capability === null || capability === undefined) return null;
    if (!isPlainObject(capability) || typeof capability.archive !== 'function') {
        throw new TypeError('Archive capability must implement archive()');
    }
    return capability;
}

export function verifyBulkArchiveCheckpoint(result, items) {
    const selection = normalizeBulkArchiveSelection(items);
    if (!isPlainObject(result) || result.accepted !== true || !isPlainObject(result.checkpoint)) {
        fail('INVALID_ARCHIVE_CHECKPOINT', 'Archive provider must return an accepted checkpoint');
    }
    const checkpoint = result.checkpoint;
    const checksum = checkpoint.checksum;
    if (checkpoint.kind !== 'portable-archive' || !isPlainObject(checksum) ||
        checksum.algorithm !== 'SHA-256' || typeof checksum.value !== 'string' ||
        !/^[a-f0-9]{64}$/.test(checksum.value)) {
        fail('INVALID_ARCHIVE_CHECKPOINT', 'Archive checkpoint must contain a verifiable SHA-256 digest');
    }
    const expectedId = `sha256:${checksum.value}`;
    const selectedIds = selection.map(item => item.id);
    if (checkpoint.id !== expectedId || checkpoint.itemCount !== selection.length ||
        !Array.isArray(checkpoint.selectedIds) || checkpoint.selectedIds.length !== selectedIds.length ||
        checkpoint.selectedIds.some((id, index) => id !== selectedIds[index])) {
        fail('INVALID_ARCHIVE_CHECKPOINT', 'Archive checkpoint does not match the explicit selection');
    }
    const createdAt = new Date(checkpoint.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== checkpoint.createdAt ||
        !Number.isInteger(checkpoint.sizeBytes) || checkpoint.sizeBytes < 1 || checkpoint.persisted !== true) {
        fail('INVALID_ARCHIVE_CHECKPOINT', 'Archive checkpoint is incomplete or was not persisted');
    }
    return Object.freeze({
        kind: checkpoint.kind,
        id: checkpoint.id,
        checksum: Object.freeze({ algorithm: checksum.algorithm, value: checksum.value }),
        itemCount: checkpoint.itemCount,
        selectedIds: Object.freeze([...checkpoint.selectedIds]),
        createdAt: checkpoint.createdAt,
        sizeBytes: checkpoint.sizeBytes,
        persisted: true
    });
}
