const RTL_LANGUAGES = new Set(['ar', 'fa', 'he', 'ur']);

export const DEFAULT_UI_MESSAGES = Object.freeze({
    en: Object.freeze({
        'dialog.close': 'Close dialog',
        'toast.dismiss': 'Dismiss notification',
        'toast.region': 'Notifications'
    }),
    'zh-CN': Object.freeze({
        'dialog.close': '关闭对话框',
        'toast.dismiss': '关闭通知',
        'toast.region': '通知'
    })
});

function requireString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value.trim();
}

export function normalizeLocale(locale) {
    const raw = requireString(locale, 'Locale').replace(/_/g, '-');
    try {
        return Intl.getCanonicalLocales(raw)[0];
    } catch {
        throw new RangeError(`Invalid locale: ${locale}`);
    }
}

function languageOf(locale) {
    return normalizeLocale(locale).split('-')[0];
}

function normalizeCatalog(catalog, label = 'Message catalog') {
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
        throw new TypeError(`${label} must be an object`);
    }
    const normalized = Object.create(null);
    for (const [key, value] of Object.entries(catalog)) {
        requireString(key, 'Message key');
        if (typeof value !== 'string') throw new TypeError(`Message "${key}" must be a string`);
        normalized[key] = value;
    }
    return normalized;
}

function interpolate(message, params) {
    if (params == null) return message;
    if (typeof params !== 'object' || Array.isArray(params)) {
        throw new TypeError('Translation params must be an object');
    }
    return message.replace(/\{([A-Za-z0-9_.-]+)\}/g, (token, name) => (
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : token
    ));
}

export function createLocaleStore(options = {}) {
    let locale = normalizeLocale(options.initialLocale || 'en');
    const fallbackLocale = normalizeLocale(options.fallbackLocale || 'en');
    const catalogs = new Map();
    const listeners = new Set();

    const initialMessages = options.messages || DEFAULT_UI_MESSAGES;
    if (typeof initialMessages !== 'object' || Array.isArray(initialMessages)) {
        throw new TypeError('Locale messages must be an object keyed by locale');
    }
    for (const [messageLocale, catalog] of Object.entries(initialMessages)) {
        catalogs.set(normalizeLocale(messageLocale), normalizeCatalog(catalog, `Catalog for ${messageLocale}`));
    }

    function localeCandidates(requestedLocale = locale) {
        const normalized = normalizeLocale(requestedLocale);
        const fallbackLanguage = languageOf(fallbackLocale);
        return [...new Set([normalized, languageOf(normalized), fallbackLocale, fallbackLanguage])];
    }

    function lookup(key, requestedLocale = locale) {
        for (const candidate of localeCandidates(requestedLocale)) {
            const catalog = catalogs.get(candidate);
            if (catalog && Object.prototype.hasOwnProperty.call(catalog, key)) return catalog[key];
        }
        return undefined;
    }

    function snapshot(previousLocale = null) {
        return Object.freeze({
            locale,
            previousLocale,
            fallbackLocale,
            direction: RTL_LANGUAGES.has(languageOf(locale)) ? 'rtl' : 'ltr'
        });
    }

    const api = {
        get locale() { return locale; },
        get fallbackLocale() { return fallbackLocale; },
        get direction() { return RTL_LANGUAGES.has(languageOf(locale)) ? 'rtl' : 'ltr'; },
        setLocale(nextLocale) {
            const normalized = normalizeLocale(nextLocale);
            if (normalized === locale) return false;
            const previousLocale = locale;
            locale = normalized;
            const nextSnapshot = snapshot(previousLocale);
            for (const listener of [...listeners]) listener(nextSnapshot);
            return true;
        },
        addMessages(messageLocale, catalog, addOptions = {}) {
            const normalizedLocale = normalizeLocale(messageLocale);
            const incoming = normalizeCatalog(catalog, `Catalog for ${normalizedLocale}`);
            const existing = addOptions.replace ? null : catalogs.get(normalizedLocale);
            catalogs.set(normalizedLocale, Object.assign(Object.create(null), existing || {}, incoming));
        },
        has(key, requestedLocale = locale) {
            requireString(key, 'Message key');
            return lookup(key, requestedLocale) !== undefined;
        },
        t(key, params = {}, fallback) {
            const normalizedKey = requireString(key, 'Message key');
            const message = lookup(normalizedKey);
            const resolved = message === undefined
                ? (typeof fallback === 'string' ? fallback : normalizedKey)
                : message;
            return interpolate(resolved, params);
        },
        subscribe(listener) {
            if (typeof listener !== 'function') throw new TypeError('Locale listener must be a function');
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getSnapshot() { return snapshot(); }
    };
    return Object.freeze(api);
}
