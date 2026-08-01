import { createLogger, filterLogs } from '../lib/debug_logger.js';
import { GLOBAL_KEYS } from './constants.js';

export { createLogger, filterLogs };

const FALLBACK_STORAGE = Object.freeze({
    get(_key, fallback) { return fallback; },
    set() { return undefined; }
});

let runtimeStorage = FALLBACK_STORAGE;

function requireStorage(storage) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new TypeError('Logger storage port must implement get() and set()');
    }
    return storage;
}

function read(key, fallback) {
    try {
        return runtimeStorage.get(key, fallback);
    } catch (_error) {
        return fallback;
    }
}

function write(key, value) {
    try {
        return runtimeStorage.set(key, value);
    } catch (_error) {
        return undefined;
    }
}

function createRuntimeLogger() {
    return createLogger({
        level: read(GLOBAL_KEYS.LOG_LEVEL, 'info'),
        store: {
            get: () => {
                const entries = read(GLOBAL_KEYS.LOGS, []);
                return Array.isArray(entries) ? entries : [];
            },
            set: value => write(GLOBAL_KEYS.LOGS, value)
        },
        onLevelChange: level => write(GLOBAL_KEYS.LOG_LEVEL, level),
        sink: (level, message, data) => {
            const output = level === 'error' ? console.error
                : level === 'warn' ? console.warn
                    : level === 'debug' ? console.debug
                        : console.log;
            output(`[Gemini] ${message}`, data || '');
        }
    });
}

let activeLogger = createRuntimeLogger();

// Stable compatibility facade. Existing imports and tests may retain or patch
// this object while configureLoggerRuntime replaces only its backing logger.
export const Logger = {
    log(...args) { return activeLogger.log(...args); },
    error(...args) { return activeLogger.error(...args); },
    warn(...args) { return activeLogger.warn(...args); },
    info(...args) { return activeLogger.info(...args); },
    debug(...args) { return activeLogger.debug(...args); },
    getLevel(...args) { return activeLogger.getLevel(...args); },
    setLevel(...args) { return activeLogger.setLevel(...args); },
    getEntries(...args) { return activeLogger.getEntries(...args); },
    clear(...args) { return activeLogger.clear(...args); },
    subscribe(...args) { return activeLogger.subscribe(...args); },
    export(...args) { return activeLogger.export(...args); }
};

export function configureLoggerRuntime({ storage } = {}) {
    runtimeStorage = requireStorage(storage);
    activeLogger = createRuntimeLogger();
    Logger.info('Logger initialized', { level: Logger.getLevel() });
    return Logger;
}

export function isDebugEnabled() {
    return read(GLOBAL_KEYS.DEBUG, false);
}

export function setDebugEnabled(value) {
    return write(GLOBAL_KEYS.DEBUG, value);
}
