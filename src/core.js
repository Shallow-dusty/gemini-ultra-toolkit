import { TEMP_USER, GLOBAL_KEYS, THEMES, THEME_COMPAT_ALIASES, PANEL_ID } from './constants.js';
import {
    getCurrentUser, setCurrentUser,
    getInspectingUser, setInspectingUser,
    getCurrentTheme, setCurrentTheme,
    getStorageListenerId, setStorageListenerId
} from './state.js';
import { GeminiAdapter } from './adapters/gemini.js';

const FALLBACK_STORAGE = Object.freeze({});

let runtimeStorage = FALLBACK_STORAGE;

export function configureCoreRuntime({ storage } = {}) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new TypeError('Core storage port must implement get() and set()');
    }
    runtimeStorage = storage;
    return Core;
}

export const Core = {
    // --- User management ---
    registerUser(userId) {
        if (!userId || userId === TEMP_USER || !userId.includes('@')) return;
        let registry;
        try {
            const stored = runtimeStorage.get(GLOBAL_KEYS.REGISTRY, []);
            registry = Array.isArray(stored) ? stored.slice() : [];
        } catch (e) { registry = []; }
        if (!registry.includes(userId)) {
            registry.push(userId);
            try { runtimeStorage.set(GLOBAL_KEYS.REGISTRY, registry); } catch (e) { /* silent */ }
        }
    },

    getAllUsers() {
        try {
            const registry = runtimeStorage.get(GLOBAL_KEYS.REGISTRY, []);
            return Array.isArray(registry) ? registry : [];
        } catch (e) { return []; }
    },

    detectUser() {
        return GeminiAdapter.detectUserEmail();
    },

    getCurrentUser() { return getCurrentUser(); },
    getInspectingUser() { return getInspectingUser(); },
    setInspectingUser(user) { setInspectingUser(user); },
    getTempUser() { return TEMP_USER; },

    // --- Theme management ---
    _autoThemeQuery: null,
    _autoThemeHandler: null,
    _autoThemeObserver: null,
    _autoThemeRoots: new Map(),

    _themeFromToken(value) {
        const token = String(value || '').toLowerCase();
        const hasDark = /(^|[\s_-])dark($|[\s_-])/.test(token);
        const hasLight = /(^|[\s_-])light($|[\s_-])/.test(token);
        if (hasDark === hasLight) return null;
        return hasLight ? 'paper' : 'glass';
    },

    _isPrimerThemeRoot(el) {
        try {
            return el?.getAttribute?.('data-primer-theme-root') === 'true';
        } catch (e) {
            return false;
        }
    },

    _getHostThemeCandidates() {
        const candidates = [];
        const add = (el) => {
            if (!el || candidates.includes(el) || this._isPrimerThemeRoot(el)) return;
            candidates.push(el);
        };

        try {
            add(document.documentElement);
            add(document.body);
            for (const child of Array.from(document.body?.children || []).slice(0, 12)) add(child);

            // The element at the visual centre is the best available signal
            // when Gemini paints its surface below body/html.
            const centre = document.elementFromPoint?.(
                Math.max(0, (window.innerWidth || 0) / 2),
                Math.max(0, (window.innerHeight || 0) / 2)
            );
            let current = centre;
            for (let depth = 0; current && depth < 6; depth++, current = current.parentElement) add(current);
        } catch (e) { /* incomplete DOM — use the candidates already found */ }
        return candidates;
    },

    _themeFromBackground(value) {
        const match = String(value || '').match(
            /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i
        );
        if (!match) return null;
        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        if (!Number.isFinite(alpha) || alpha < 0.08) return null;
        const [r, g, b] = match.slice(1, 4).map(Number);
        if (![r, g, b].every(Number.isFinite)) return null;
        // Perceived luminance is more stable than checking one channel and
        // correctly classifies Gemini's current rgb(0, 0, 0) dark surface.
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return luminance >= 0.52 ? 'paper' : 'glass';
    },

    /**
     * Prefer Gemini's rendered theme over the operating-system preference.
     * Current Gemini exposes body.dark-theme/theme-host plus computed
     * color-scheme; the wider attribute list keeps this resilient to host
     * rewrites without depending on a private component selector.
     */
    _detectHostTheme() {
        const candidates = this._getHostThemeCandidates();
        const themeAttrs = ['data-theme', 'data-color-scheme', 'theme', 'color-scheme'];

        for (const el of candidates) {
            for (const name of themeAttrs) {
                const resolved = this._themeFromToken(el.getAttribute?.(name));
                if (resolved) return resolved;
            }
            const classTheme = this._themeFromToken(
                typeof el.className === 'string' ? el.className : el.getAttribute?.('class')
            );
            if (classTheme) return classTheme;
        }

        try {
            const metaTheme = this._themeFromToken(
                document.querySelector?.('meta[name="color-scheme"]')?.getAttribute?.('content')
            );
            if (metaTheme) return metaTheme;
        } catch (e) { /* optional host hint */ }

        // color-scheme is a stronger declaration than background. Values such
        // as "light dark" are deliberately treated as ambiguous.
        for (const el of candidates) {
            try {
                const scheme = this._themeFromToken(window.getComputedStyle?.(el)?.colorScheme);
                if (scheme) return scheme;
            } catch (e) { /* continue to rendered background */ }
        }
        for (const el of candidates) {
            try {
                const background = this._themeFromBackground(
                    window.getComputedStyle?.(el)?.backgroundColor
                );
                if (background) return background;
            } catch (e) { /* try the next host surface */ }
        }
        return null;
    },

    /** Resolve 'auto' from Gemini first; system preference is only a fallback. */
    resolveTheme(key) {
        if (key !== 'auto') return key;
        const hostTheme = this._detectHostTheme();
        if (hostTheme) return hostTheme;
        try {
            return window.matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'glass';
        } catch (e) {
            return 'glass';
        }
    },

    getTheme() { return getCurrentTheme(); },
    setTheme(key) {
        if (THEMES[key]) {
            setCurrentTheme(key);
            try { runtimeStorage.set(GLOBAL_KEYS.THEME, key); } catch (e) { /* silent */ }
            this._updateAutoListener(key);
            try {
                for (const root of document.querySelectorAll?.('[data-primer-theme-root="true"]') || []) {
                    this.applyTheme(root, key);
                }
            } catch (e) { /* document may be unavailable during teardown */ }
        }
    },
    getThemes() { return THEMES; },
    applyTheme(el, themeKey) {
        if (!el?.style?.setProperty) return;
        // Never claim or mutate Gemini's host roots. All theme state belongs
        // to a Primer++ panel, modal, toast, or other explicitly-owned root.
        try {
            if (el === document.documentElement || el === document.body) return;
        } catch (e) { /* document may be incomplete in a test harness */ }
        const resolved = this.resolveTheme(themeKey);
        if (!THEMES[resolved]) return;
        const vars = THEMES[resolved].vars;
        for (const [key, val] of Object.entries(vars)) {
            el.style.setProperty(key, val);
            const compatName = THEME_COMPAT_ALIASES[key];
            if (compatName) el.style.setProperty(compatName, `var(${key})`);
        }
        el.style.setProperty('color-scheme', resolved === 'paper' ? 'light' : 'dark');
        el.setAttribute?.('data-primer-theme-root', 'true');
        el.setAttribute?.('data-primer-theme', resolved);

        if (themeKey === 'auto') this._autoThemeRoots.set(el, themeKey);
        else this._autoThemeRoots.delete(el);
    },

    _refreshAutoThemeRoots() {
        for (const [el] of this._autoThemeRoots) {
            if (!el || el.isConnected === false) {
                this._autoThemeRoots.delete(el);
                continue;
            }
            this.applyTheme(el, 'auto');
        }
    },

    _observeHostTheme() {
        if (typeof MutationObserver === 'undefined') return;
        try {
            this._autoThemeObserver = new MutationObserver((mutations) => {
                // body children can be replaced during Gemini navigation.
                if (mutations.some(m => m.type === 'childList')) this._observeHostThemeTargets();
                if (mutations.some(m => !this._isPrimerThemeRoot(m.target))) {
                    this._refreshAutoThemeRoots();
                }
            });
            this._observeHostThemeTargets();
        } catch (e) {
            this._autoThemeObserver?.disconnect?.();
            this._autoThemeObserver = null;
        }
    },

    _observeHostThemeTargets() {
        if (!this._autoThemeObserver) return;
        const attributes = {
            attributes: true,
            attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'theme', 'color-scheme']
        };
        for (const el of this._getHostThemeCandidates()) {
            const options = el === document.body ? { ...attributes, childList: true } : attributes;
            try { this._autoThemeObserver.observe(el, options); } catch (e) { /* detached target */ }
        }
    },

    /** Watch Gemini's theme signals; matchMedia remains a fallback signal. */
    _updateAutoListener(key) {
        if (this._autoThemeQuery && this._autoThemeHandler) {
            try {
                if (this._autoThemeQuery.removeEventListener) {
                    this._autoThemeQuery.removeEventListener('change', this._autoThemeHandler);
                } else {
                    this._autoThemeQuery.removeListener?.(this._autoThemeHandler);
                }
            } catch (e) { /* stale media query */ }
        }
        this._autoThemeQuery = null;
        this._autoThemeHandler = null;
        this._autoThemeObserver?.disconnect?.();
        this._autoThemeObserver = null;
        if (key !== 'auto') return;

        this._observeHostTheme();
        try {
            this._autoThemeQuery = window.matchMedia('(prefers-color-scheme: light)');
            this._autoThemeHandler = () => this._refreshAutoThemeRoots();
            if (this._autoThemeQuery.addEventListener) {
                this._autoThemeQuery.addEventListener('change', this._autoThemeHandler);
            } else {
                this._autoThemeQuery.addListener?.(this._autoThemeHandler);
            }
        } catch (e) { /* host observer can still drive Auto */ }

        // Include a pre-existing panel even when the listener is restarted
        // after a settings change.
        try {
            const panel = document.getElementById(PANEL_ID);
            if (panel) this.applyTheme(panel, 'auto');
        } catch (e) { /* panel not mounted */ }
    },

    // --- Storage listener ---
    setupStorageListener(targetUser, callback) {
        const lid = getStorageListenerId();
        if (lid) {
            try { runtimeStorage.removeValueChangeListener?.(lid); } catch (e) { /* silent */ }
            setStorageListenerId(null);
        }
        if (!targetUser || targetUser === TEMP_USER) return;

        const storageKey = `gemini_store_${targetUser}`;
        try {
            const newId = runtimeStorage.addValueChangeListener?.(storageKey, (name, oldVal, newVal, remote) => {
                if (remote && newVal && callback) {
                    try { callback(newVal); } catch (e) { /* silent */ }
                }
            });
            setStorageListenerId(newId ?? null);
        } catch (e) { /* silent */ }
    },

    // --- Shared utilities ---
    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    },

    _sidebarCache: null,
    _sidebarCacheTime: 0,

    scanSidebarChats(forceRefresh = false) {
        const now = Date.now();
        // Cheap probe up front: the live link count drives both cache
        // validation and the rescan. The count check catches the races the
        // TTL alone cannot:
        //   1. Initial load: cache was seeded with [] while Gemini was still
        //      wiring up the sidebar; chat links appear inside the TTL but
        //      the old length===0 cache path kept returning empty.
        //   2. Incremental load / virtual scroll: new chats are appended
        //      while the cached first element is still connected, so the
        //      previous `isConnected` probe missed the growth.
        const liveCount = GeminiAdapter.getChatLinkCount();
        if (!forceRefresh && this._sidebarCache &&
            now - this._sidebarCacheTime < 2000 &&
            this._sidebarCache.length === liveCount &&
            (this._sidebarCache.length === 0 || this._sidebarCache[0].element?.isConnected)) {
            return this._sidebarCache;
        }
        const items = GeminiAdapter.scanSidebarChatLinks();
        this._sidebarCache = items;
        this._sidebarCacheTime = now;
        return items;
    },

    invalidateSidebarCache() {
        this._sidebarCache = null;
        this._sidebarCacheTime = 0;
    },

    // --- URL utilities ---
    getChatId() { return GeminiAdapter.getChatId(); },

    // --- Date utilities ---
    getDayKey(resetHour = 0) {
        const now = new Date();
        if (now.getHours() < resetHour) {
            now.setDate(now.getDate() - 1);
        }
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
};
