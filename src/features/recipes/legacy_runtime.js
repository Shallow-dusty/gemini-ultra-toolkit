import { Core } from '../../core.js';

/** Compatibility-only defaults. The Recipes domain receives all of these as injected values. */
export function defaultLegacyTranslate(zh, en) {
    const language = globalThis.document?.documentElement?.lang || globalThis.navigator?.language || '';
    return String(language).toLowerCase().startsWith('zh') ? zh : en;
}

export function createLegacyGMStorage(scope = globalThis) {
    return {
        get(key, fallback) {
            return typeof scope.GM_getValue === 'function' ? scope.GM_getValue(key, fallback) : fallback;
        },
        set(key, value) {
            return typeof scope.GM_setValue === 'function' ? scope.GM_setValue(key, value) : undefined;
        },
        flush() {
            return typeof scope.__flushGMPolyfill === 'function' ? scope.__flushGMPolyfill() : undefined;
        }
    };
}

export function defaultLegacyClock() {
    return new Date();
}

export function defaultLegacyIdFactory() {
    return `p_${Date.now()}`;
}

export function resolveLegacySession(value, getCurrentUser = Core.getCurrentUser?.bind(Core)) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return getCurrentUser?.() || 'Guest';
}

export function toIsoTimestamp(clock) {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('Prompt Vault clock must return a valid timestamp');
    return date.toISOString();
}

function optionalCapability(context, names) {
    for (const name of names) {
        try {
            const value = context?.getCapability?.(name);
            if (value !== undefined) return value;
        } catch { /* optional capability */ }
    }
    return undefined;
}

export function contextCapabilities(context) {
    return {
        queue: optionalCapability(context, ['message-queue.outbox', 'message-queue.service', 'message-queue']),
        notifications: optionalCapability(context, ['ui.notifications']),
        shell: optionalCapability(context, ['ui.shell'])
    };
}
