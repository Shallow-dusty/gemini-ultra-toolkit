/**
 * Extension content script — single-file entry.
 * Initializes GM_* polyfill (async), then runs main app.
 * esbuild bundles everything into one IIFE.
 */

import {
    __initGMPolyfill, __flushGMPolyfill,
    GM_getValue, GM_setValue, GM_listValues,
    GM_addValueChangeListener, GM_removeValueChangeListener,
    GM_addStyle, GM_registerMenuCommand
} from './gm_polyfill.js';

globalThis.__initGMPolyfill = __initGMPolyfill;
globalThis.__flushGMPolyfill = __flushGMPolyfill;
globalThis.GM_getValue = GM_getValue;
globalThis.GM_setValue = GM_setValue;
globalThis.GM_listValues = GM_listValues;
globalThis.GM_addValueChangeListener = GM_addValueChangeListener;
globalThis.GM_removeValueChangeListener = GM_removeValueChangeListener;
globalThis.GM_addStyle = GM_addStyle;
globalThis.GM_registerMenuCommand = GM_registerMenuCommand;
