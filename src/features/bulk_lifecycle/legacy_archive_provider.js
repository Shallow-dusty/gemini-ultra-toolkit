import {
    createPortableArchive,
    serializePortableArchive,
    utf8ByteLength
} from '../portable_archive/index.js';
import {
    BULK_LIFECYCLE_ARCHIVE_MAX_ITEMS,
    normalizeBulkArchiveSelection
} from './archive_capability.js';

function assertFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function abortError(reason = 'archive operation cancelled') {
    return Object.assign(new Error(String(reason)), { name: 'AbortError', code: 'ABORTED' });
}

function assertSignal(signal) {
    if (signal === undefined || signal === null) return null;
    if (typeof signal !== 'object' || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
        throw new TypeError('Bulk archive signal must implement AbortSignal');
    }
    return signal;
}

function assertContext(context) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
        throw new TypeError('Bulk archive context must be an object');
    }
    if (!context.scope || typeof context.scope !== 'object' || typeof context.scope.kind !== 'string' ||
        typeof context.capturedAt !== 'string' || !context.capturedAt) {
        throw new TypeError('Bulk archive context requires scope and capturedAt');
    }
}

function validateCapturedChats(chats, selection) {
    if (!Array.isArray(chats) || chats.length !== selection.length) {
        throw new Error('Archive capture did not return every explicitly selected conversation');
    }
    const byId = new Map();
    for (const chat of chats) {
        if (!chat || typeof chat !== 'object' || typeof chat.chatId !== 'string' || byId.has(chat.chatId)) {
            throw new Error('Archive capture returned an invalid or duplicate conversation');
        }
        if (chat.status === 'failed') throw new Error(`Archive capture failed for conversation ${chat.chatId}`);
        byId.set(chat.chatId, chat);
    }
    return selection.map(item => {
        const chat = byId.get(item.id);
        if (!chat) throw new Error(`Archive capture is missing conversation ${item.id}`);
        return chat;
    });
}

async function collectExplicitChats(controller, selection, signal) {
    if (controller.bulkExporting) throw new Error('Archive provider is already capturing conversations');
    const previous = controller.getSelectedBulkChats();
    const cancel = () => { controller.bulkCancelRequested = true; };
    controller.clearBulkSelection();
    controller.selectVisibleBulkChats(selection);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
        if (signal?.aborted) throw abortError(signal.reason);
        const result = await controller.collectSelectedTranscripts();
        if (signal?.aborted) throw abortError(signal.reason);
        if (!result || !Array.isArray(result.chats)) throw new Error('Archive capture was unavailable');
        return validateCapturedChats(result.chats, selection);
    } finally {
        signal?.removeEventListener('abort', cancel);
        controller.clearBulkSelection();
        controller.selectVisibleBulkChats(previous);
    }
}

export function createLegacyBulkArchiveCapability({
    controller,
    getSource,
    now,
    isAvailable,
    getGeneration,
    maxItems = BULK_LIFECYCLE_ARCHIVE_MAX_ITEMS
} = {}) {
    for (const method of [
        'getSelectedBulkChats',
        'clearBulkSelection',
        'selectVisibleBulkChats',
        'collectSelectedTranscripts',
        'download'
    ]) {
        if (!controller || typeof controller[method] !== 'function') {
            throw new TypeError(`Bulk archive controller requires ${method}()`);
        }
    }
    assertFunction(getSource, 'Bulk archive getSource');
    assertFunction(now, 'Bulk archive now');
    assertFunction(isAvailable, 'Bulk archive isAvailable');
    assertFunction(getGeneration, 'Bulk archive getGeneration');
    normalizeBulkArchiveSelection([{ id: 'contract', title: 'contract' }], { maxItems });

    function assertLive(generation, signal) {
        if (signal?.aborted) throw abortError(signal.reason);
        if (!isAvailable() || getGeneration() !== generation) {
            throw Object.assign(new Error('Archive provider is unavailable'), { code: 'ARCHIVE_UNAVAILABLE' });
        }
    }

    return Object.freeze({
        async archive(items, context = {}) {
            assertContext(context);
            const signal = assertSignal(context.signal);
            const selection = normalizeBulkArchiveSelection(items, { maxItems });
            const generation = getGeneration();
            assertLive(generation, signal);
            const chats = await collectExplicitChats(controller, selection, signal);
            assertLive(generation, signal);
            const createdAt = String(now());
            const source = await getSource();
            const archive = await createPortableArchive({
                createdAt,
                source: {
                    ...source,
                    capture: 'explicit-bulk-lifecycle',
                    selectionCount: selection.length,
                    scopeKind: context.scope.kind,
                    capturedAt: context.capturedAt
                },
                sections: { chats },
                include: ['chats']
            });
            assertLive(generation, signal);
            const serialized = await serializePortableArchive(archive);
            const digest = archive.checksum.value;
            const filename = `primer-pp-bulk-archive-${archive.createdAt.slice(0, 10)}-${digest.slice(0, 8)}.json`;
            await controller.download(serialized, filename, 'application/json');
            assertLive(generation, signal);
            return Object.freeze({
                accepted: true,
                checkpoint: Object.freeze({
                    kind: 'portable-archive',
                    id: `sha256:${digest}`,
                    checksum: Object.freeze({ ...archive.checksum }),
                    itemCount: selection.length,
                    selectedIds: Object.freeze(selection.map(item => item.id)),
                    createdAt: archive.createdAt,
                    sizeBytes: utf8ByteLength(serialized),
                    persisted: true
                })
            });
        }
    });
}
