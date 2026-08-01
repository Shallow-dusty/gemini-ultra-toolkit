import { cloneStorageValue } from '../../storage/clone.js';
import {
    ANNOTATIONS_SCHEMA,
    ANNOTATIONS_SCHEMA_VERSION,
    migrateAnnotationsData
} from './domain.js';

export const LEGACY_ANNOTATIONS_STORAGE_KEY = 'gemini_chat_notes';

function requireAccountId(value) {
    const accountId = typeof value === 'string' ? value.trim() : '';
    if (!accountId) throw new TypeError('Annotations account id must be a non-empty string');
    return accountId;
}

export function resolveLegacyAnnotationsStorageKey(accountId) {
    const normalized = requireAccountId(accountId);
    return normalized.includes('@')
        ? `${LEGACY_ANNOTATIONS_STORAGE_KEY}_${normalized}`
        : LEGACY_ANNOTATIONS_STORAGE_KEY;
}

/**
 * Keep a legacy `notes` projection beside the lossless v2 collection. Older
 * Primer++ builds can still read conversation notes while v13 retains message
 * anchors, tags and statuses in `annotations`.
 */
export function createLegacyNotesProjection(state, options = {}) {
    const current = migrateAnnotationsData(state, options);
    const notes = {};
    const chosen = new Map();
    for (const annotation of Object.values(current.annotations)) {
        const chatId = annotation.conversation.id;
        const previous = chosen.get(chatId);
        const shouldReplace = !previous
            || (annotation.anchor.kind === 'conversation' && previous.anchor.kind !== 'conversation')
            || (annotation.anchor.kind === previous.anchor.kind && annotation.updatedAt > previous.updatedAt);
        if (!shouldReplace) continue;
        chosen.set(chatId, annotation);
        notes[chatId] = {
            chatId,
            title: annotation.conversation.title,
            href: annotation.conversation.href,
            note: annotation.body,
            pinned: annotation.pinned,
            createdAt: annotation.createdAt,
            updatedAt: annotation.updatedAt
        };
    }
    return cloneStorageValue({
        schema: ANNOTATIONS_SCHEMA,
        version: ANNOTATIONS_SCHEMA_VERSION,
        annotations: current.annotations,
        notes
    });
}

/** Async repository over the original per-account GM_* key. */
export function createLegacyAnnotationsRepository({
    accountId,
    getValue = globalThis.GM_getValue,
    setValue = globalThis.GM_setValue,
    flush = globalThis.__flushGMPolyfill
} = {}) {
    const normalizedAccountId = requireAccountId(accountId);
    if (typeof getValue !== 'function' || typeof setValue !== 'function') {
        throw new TypeError('Legacy annotations repository requires GM get/set functions');
    }
    if (flush !== undefined && typeof flush !== 'function') {
        throw new TypeError('Legacy annotations repository flush must be a function');
    }
    const key = resolveLegacyAnnotationsStorageKey(normalizedAccountId);
    let tail = Promise.resolve();

    async function get() {
        return cloneStorageValue(await getValue(key, null));
    }

    function update(updater) {
        if (typeof updater !== 'function') throw new TypeError('Annotations repository updater must be a function');
        const run = tail.then(async () => {
            const current = await get();
            const next = await updater(cloneStorageValue(current));
            const compatible = createLegacyNotesProjection(next);
            await setValue(key, cloneStorageValue(compatible));
            return cloneStorageValue(compatible);
        });
        tail = run.catch(() => undefined);
        return run;
    }

    return Object.freeze({
        accountId: normalizedAccountId,
        boundAccountId: normalizedAccountId,
        key,
        get,
        update,
        async flush() {
            await tail;
            if (flush) await flush();
        }
    });
}
