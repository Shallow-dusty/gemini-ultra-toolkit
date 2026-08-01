import { PORTABLE_ARCHIVE_SECTIONS } from './constants.js';
import { utf8ByteLength } from './canonical.js';

export const DEFAULT_SELECTION = Object.freeze(['chats']);
export const DIALOG_IDS = Object.freeze({
    preview: 'gc-portable-archive-preview',
    restore: 'gc-portable-archive-restore-plan'
});
export const SECTION_LABELS = Object.freeze({
    chats: Object.freeze(['对话', 'Chats']),
    annotations: Object.freeze(['批注', 'Annotations']),
    collections: Object.freeze(['收藏集', 'Collections']),
    recipes: Object.freeze(['配方', 'Recipes']),
    preferences: Object.freeze(['偏好设置', 'Preferences']),
    insights: Object.freeze(['洞察', 'Insights']),
    queue: Object.freeze(['队列', 'Queue'])
});

export class PortableArchiveFeatureError extends Error {
    constructor(code, message, details = {}, cause = undefined) {
        super(message);
        this.name = 'PortableArchiveFeatureError';
        this.code = code;
        this.details = details;
        if (cause !== undefined) this.cause = cause;
    }
}

export function fail(code, message, details = {}, cause = undefined) {
    throw new PortableArchiveFeatureError(code, message, details, cause);
}

export function assertFunction(value, name, optional = false) {
    if (optional && value === undefined) return;
    if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

export function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function normalizeSelection(selection) {
    if (!Array.isArray(selection)) fail('INVALID_SELECTION', 'Archive selection must be an array');
    if (selection.length === 0) fail('NO_SECTIONS', 'Select at least one archive section');
    if (new Set(selection).size !== selection.length) {
        fail('INVALID_SELECTION', 'Archive selection contains duplicate sections', { selection });
    }
    for (const name of selection) {
        if (!PORTABLE_ARCHIVE_SECTIONS.includes(name)) {
            fail('INVALID_SELECTION', `Unknown archive section: ${String(name)}`, { section: name });
        }
    }
    return PORTABLE_ARCHIVE_SECTIONS.filter(name => selection.includes(name));
}

export function archivePreview(archive, serialized) {
    return {
        format: archive.format,
        schemaVersion: archive.schemaVersion,
        createdAt: archive.createdAt,
        checksum: archive.checksum.value,
        sizeBytes: utf8ByteLength(serialized),
        totalEntries: archive.manifest.totalEntries,
        sections: archive.manifest.sections.map(section => ({ ...section })),
        source: structuredClone(archive.source)
    };
}

export function defaultFilename(archive) {
    const day = archive.createdAt.slice(0, 10);
    return `primer-pp-archive-${day}-${archive.checksum.value.slice(0, 8)}.json`;
}
