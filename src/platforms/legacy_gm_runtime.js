/**
 * Explicit boundary around the legacy userscript GM_* host surface.
 *
 * Shared application code receives the returned ports and never reaches into
 * globalThis for storage, style, menu, or reload capabilities itself.  The
 * methods resolve lazily so the extension bootstrap can install its polyfill
 * before the application starts without coupling either bundle to the other.
 */

function requireHost(host) {
    if ((typeof host !== 'object' && typeof host !== 'function') || host === null) {
        throw new TypeError('Legacy GM runtime host must be an object');
    }
    return host;
}

function hostFunction(host, name) {
    const candidate = host[name];
    return typeof candidate === 'function' ? candidate.bind(host) : null;
}

export function createPersistedReloadHandler({ storage, key, value, reload, onError } = {}) {
    if (!storage || typeof storage.set !== 'function' || typeof storage.flush !== 'function') {
        throw new TypeError('Persisted reload storage must implement set() and flush()');
    }
    if (typeof reload !== 'function' || typeof onError !== 'function') {
        throw new TypeError('Persisted reload requires reload() and onError() functions');
    }
    return async function persistAndReload() {
        try {
            await storage.set(key, value);
            await storage.flush();
            reload();
            return true;
        } catch (error) {
            onError(error);
            return false;
        }
    };
}

export function createLegacyGmRuntime(host = globalThis) {
    const target = requireHost(host);
    const storage = Object.freeze({
        get(key, fallback) {
            const getValue = hostFunction(target, 'GM_getValue');
            return getValue ? getValue(key, fallback) : fallback;
        },
        set(key, value) {
            return hostFunction(target, 'GM_setValue')?.(key, value);
        },
        listValues() {
            const values = hostFunction(target, 'GM_listValues')?.();
            return Array.isArray(values) ? values : [];
        },
        addValueChangeListener(key, callback) {
            return hostFunction(target, 'GM_addValueChangeListener')?.(key, callback) ?? null;
        },
        removeValueChangeListener(id) {
            return hostFunction(target, 'GM_removeValueChangeListener')?.(id);
        },
        flush() {
            return hostFunction(target, '__flushGMPolyfill')?.() ?? Promise.resolve();
        }
    });

    return Object.freeze({
        storage,
        addStyle(css) {
            return hostFunction(target, 'GM_addStyle')?.(css) ?? null;
        },
        registerMenuCommand(label, handler) {
            return hostFunction(target, 'GM_registerMenuCommand')?.(label, handler) ?? null;
        },
        reload() {
            return typeof target.location?.reload === 'function'
                ? target.location.reload()
                : undefined;
        }
    });
}
