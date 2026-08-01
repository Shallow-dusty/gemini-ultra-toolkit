import { fail, isObject } from './contracts.js';
import { archiveChatRecords, normalizeChat } from './records.js';

/** Validate an archive envelope and normalize every chat before any index mutation. */
export function normalizeArchiveImport(source, options, limits) {
    const resolved = options === undefined ? {} : options;
    if (!isObject(resolved)) fail('INVALID_OPTIONS', 'Archive import options must be an object');
    for (const key of Object.keys(resolved)) {
        if (key !== 'mode') {
            fail('INVALID_OPTIONS', `Unknown archive import option: ${key}`, { option: key });
        }
    }
    const mode = resolved.mode ?? 'merge';
    if (mode !== 'merge' && mode !== 'replace') {
        fail('INVALID_OPTIONS', 'Archive import mode must be "merge" or "replace"', {
            option: 'mode'
        });
    }
    const records = archiveChatRecords(source);
    return {
        mode,
        chats: records.map((record, index) => normalizeChat(record, index, limits))
    };
}
