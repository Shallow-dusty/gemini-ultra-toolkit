import { TEMP_USER } from '../../constants.js';
import { Logger } from '../../logger.js';
import { Core } from '../../core.js';
import { GeminiAdapter } from '../../adapters/gemini.js';
import { DEFAULT_MAX_INSIGHTS_EVENTS } from './event_model.js';
import { isRecord } from './legacy_counter_state.js';

export function createDefaultCounterStorage(globalObject = globalThis) {
    return {
        get(key, fallback) {
            const getter = globalObject.GM_getValue;
            return typeof getter === 'function' ? getter(key, fallback) : fallback;
        },
        set(key, value) {
            const setter = globalObject.GM_setValue;
            return typeof setter === 'function' ? setter(key, value) : undefined;
        }
    };
}

export function createDefaultCounterDependencies(globalObject = globalThis) {
    return {
        core: Core,
        adapter: GeminiAdapter,
        logger: Logger,
        storage: createDefaultCounterStorage(globalObject),
        document: globalObject.document || null,
        timers: globalObject,
        now: () => Date.now(),
        resolveDayKey: null,
        translate: (_zh, en) => en,
        onChange: null,
        tempUser: TEMP_USER,
        maxEvents: DEFAULT_MAX_INSIGHTS_EVENTS,
        subscribeUserData(target, listener) {
            Core.setupStorageListener(target, listener);
            return () => Core.setupStorageListener(null, null);
        }
    };
}

export function validateCounterDependencies(dependencies) {
    for (const method of ['getCurrentUser', 'getInspectingUser', 'setInspectingUser', 'getChatId', 'getDayKey']) {
        if (typeof dependencies.core?.[method] !== 'function') throw new TypeError(`Counter core.${method} is required`);
    }
    for (const method of ['isInsideInputEditor', 'getClosestSendButton', 'detectModelKey', 'detectAccountTier']) {
        if (typeof dependencies.adapter?.[method] !== 'function') throw new TypeError(`Counter adapter.${method} is required`);
    }
    if (typeof dependencies.storage?.get !== 'function' || typeof dependencies.storage?.set !== 'function') {
        throw new TypeError('Counter storage must implement get() and set()');
    }
    for (const method of ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']) {
        if (typeof dependencies.timers?.[method] !== 'function') throw new TypeError(`Counter timers.${method} is required`);
    }
    for (const callback of ['now', 'translate', 'subscribeUserData']) {
        if (typeof dependencies[callback] !== 'function') throw new TypeError(`Counter ${callback} must be a function`);
    }
    if (dependencies.onChange != null && typeof dependencies.onChange !== 'function') {
        throw new TypeError('Counter onChange must be a function');
    }
    if (!Number.isInteger(dependencies.maxEvents) || dependencies.maxEvents < 1) {
        throw new TypeError('Counter maxEvents must be a positive integer');
    }
    return dependencies;
}
