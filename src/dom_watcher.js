import { Logger } from './logger.js';

const DEFAULT_ATTRIBUTE_FILTER = Object.freeze(['aria-label', 'alt', 'class']);

function normalizeAttributeFilter(value) {
    if (!Array.isArray(value) || value.some(name => typeof name !== 'string' || !name)) {
        throw new TypeError('DOMWatcher attributeFilter must be an array of non-empty strings');
    }
    return Object.freeze(Array.from(new Set(value)));
}

export const DOMWatcher = {
    _observer: null,
    _handlers: [],
    _timers: {},
    _attributeFilter: DEFAULT_ATTRIBUTE_FILTER,

    configure({ attributeFilter = DEFAULT_ATTRIBUTE_FILTER } = {}) {
        if (this._observer) throw new Error('Cannot configure DOMWatcher after init()');
        this._attributeFilter = normalizeAttributeFilter(attributeFilter);
        return this;
    },

    init() {
        if (this._observer) return;
        this._observer = new MutationObserver(mutations => {
            for (const h of [...this._handlers]) {
                try {
                    if (mutations.some(m => h.match(m))) {
                        if (!this._handlers.includes(h)) continue;
                        clearTimeout(this._timers[h.id]);
                        const timer = setTimeout(() => {
                            // unregister()/destroy() may run while a debounced
                            // callback is pending. Only the current registration
                            // is allowed to execute.
                            if (this._timers[h.id] !== timer) return;
                            delete this._timers[h.id];
                            if (!this._handlers.includes(h)) return;
                            try { h.callback(); }
                            catch (e) { /* isolate callback failures too */ }
                        }, h.debounce || 0);
                        this._timers[h.id] = timer;
                    }
                } catch (e) { /* silent — don't let one handler break others */ }
            }
        });
        this._observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [...this._attributeFilter]
        });
        Logger.debug('DOMWatcher initialized');
    },

    register(id, { match, callback, debounce = 0 }) {
        this.unregister(id);
        this._handlers.push({ id, match, callback, debounce });
        Logger.debug('DOMWatcher handler registered', { id, debounce });
    },

    unregister(id) {
        this._handlers = this._handlers.filter(h => h.id !== id);
        clearTimeout(this._timers[id]);
        delete this._timers[id];
    },

    destroy() {
        this._observer?.disconnect();
        this._observer = null;
        Object.values(this._timers).forEach(clearTimeout);
        this._handlers = [];
        this._timers = {};
    }
};
