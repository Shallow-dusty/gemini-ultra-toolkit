import { calculateStreaks } from '../../../lib/counter_calc.js';

export function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function assertExportSessionAdapter(adapter) {
    if (!adapter || typeof adapter.getMetadata !== 'function') {
        throw new TypeError('Export sessionAdapter must implement getMetadata()');
    }
    for (const name of ['getUsageSnapshot', 'getUsageStreaks']) {
        if (adapter[name] !== undefined && typeof adapter[name] !== 'function') {
            throw new TypeError(`Export sessionAdapter.${name} must be a function`);
        }
    }
}

/**
 * Read-only compatibility adapter for the legacy local usage export.
 *
 * This intentionally reads the persisted schema directly instead of reaching
 * into the Counter module singleton. The archive/export vertical can therefore
 * be enabled, disabled, and tested independently from usage tracking.
 */
export function createDefaultExportSessionAdapter(options = {}) {
    const getCurrentUser = options.getCurrentUser ?? (() => 'Guest');
    const getChatId = options.getChatId ?? (() => null);
    return {
        getMetadata() {
            return {
                user: getCurrentUser(),
                chatId: getChatId(),
                href: globalThis.location?.href || '',
                origin: globalThis.location?.origin || 'https://gemini.google.com',
                locale: globalThis.navigator?.language || 'en',
                platform: 'gemini-web'
            };
        },

        getUsageSnapshot() {
            const user = getCurrentUser();
            if (!user || !user.includes('@')) return null;

            let value;
            try {
                value = globalThis.GM_getValue?.(`gemini_store_${user}`, null);
            } catch (_error) {
                return null;
            }
            if (!isPlainObject(value)) return null;

            return {
                total: Number.isFinite(value.total) ? value.total : 0,
                totalChatsCreated: Number.isFinite(value.totalChatsCreated) ? value.totalChatsCreated : 0,
                chats: isPlainObject(value.chats) ? value.chats : {},
                dailyCounts: isPlainObject(value.dailyCounts) ? value.dailyCounts : {}
            };
        },

        getUsageStreaks(snapshot) {
            let resetHour = 0;
            try {
                resetHour = globalThis.GM_getValue?.('gemini_reset_hour', 0) ?? 0;
            } catch (_error) {
                resetHour = 0;
            }
            return calculateStreaks(snapshot.dailyCounts, resetHour);
        }
    };
}
