import { cloneStorageValue } from '../../storage/clone.js';

export const LEGACY_PREFERENCE_KEYS = Object.freeze({
    DEFAULT_MODEL: 'gemini_default_model',
    UI_TWEAKS: 'gemini_ui_tweaks'
});

export class PreferencePersistenceError extends Error {
    constructor(message, cause = undefined) {
        super(message);
        this.name = 'PreferencePersistenceError';
        if (cause !== undefined) this.cause = cause;
    }
}

function assertStorage(storage) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new TypeError('Legacy preference storage must implement get() and set()');
    }
}

/**
 * The only compatibility boundary allowed to know about GM_* globals.
 * Controllers receive the returned storage object through dependency injection.
 */
export function createGlobalGmPreferencesStorage(globalObject = globalThis) {
    if (!globalObject || typeof globalObject !== 'object') {
        throw new TypeError('A global object is required for GM preference storage');
    }
    return Object.freeze({
        get(key, fallback) {
            const getter = globalObject.GM_getValue;
            if (typeof getter !== 'function') return cloneStorageValue(fallback);
            return cloneStorageValue(getter(key, cloneStorageValue(fallback)));
        },
        set(key, value) {
            const setter = globalObject.GM_setValue;
            if (typeof setter !== 'function') {
                throw new PreferencePersistenceError('GM_setValue is unavailable');
            }
            return setter(key, cloneStorageValue(value));
        }
    });
}

/** Raw-key repository; intentionally does not envelope values used by v12. */
export function createLegacyPreferenceRepository({
    key,
    storage,
    defaultValue,
    normalize,
    onReadError = () => {}
} = {}) {
    if (typeof key !== 'string' || key.length === 0) throw new TypeError('Legacy preference key is required');
    assertStorage(storage);
    if (typeof normalize !== 'function') throw new TypeError('Legacy preference normalizer is required');
    if (typeof onReadError !== 'function') throw new TypeError('onReadError must be a function');
    const isolatedDefault = cloneStorageValue(defaultValue);

    return Object.freeze({
        key,
        scope: Object.freeze({ kind: 'global', readOnly: false }),
        async load() {
            try {
                const stored = await storage.get(key, cloneStorageValue(isolatedDefault));
                return cloneStorageValue(normalize(stored ?? isolatedDefault));
            } catch (error) {
                try { onReadError(error); }
                catch { /* diagnostics must not make a fallback read fail */ }
                return cloneStorageValue(normalize(isolatedDefault));
            }
        },
        async save(value) {
            const normalized = cloneStorageValue(normalize(cloneStorageValue(value)));
            try {
                await storage.set(key, cloneStorageValue(normalized));
            } catch (error) {
                throw new PreferencePersistenceError(`Failed to persist ${key}`, error);
            }
            return cloneStorageValue(normalized);
        }
    });
}
