export const PORTABLE_ARCHIVE_FORMAT = 'primer-pp.portable-archive';
export const PORTABLE_ARCHIVE_SCHEMA_VERSION = 1;

export const PORTABLE_ARCHIVE_SECTIONS = Object.freeze([
    'chats',
    'annotations',
    'collections',
    'recipes',
    'preferences',
    'insights',
    'queue'
]);

export const PORTABLE_ARCHIVE_LIMITS = Object.freeze({
    maxBytes: 10 * 1024 * 1024,
    maxEntries: 10_000
});

export const PORTABLE_ARCHIVE_CHECKSUM_ALGORITHM = 'SHA-256';

export const RESTORE_CONFLICT_STRATEGIES = Object.freeze([
    'skip',
    'replace',
    'rename'
]);
