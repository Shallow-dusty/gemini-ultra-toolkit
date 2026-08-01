export const UI_TWEAK_FEATURE_IDS = Object.freeze([
    'tabTitle',
    'ctrlEnter',
    'inputCounter',
    'chatWidth',
    'sidebarWidth'
]);

const VALUE_LIMITS = Object.freeze({
    chatWidth: Object.freeze({ fallback: 900, min: 400, max: 4000 }),
    sidebarWidth: Object.freeze({ fallback: 280, min: 160, max: 800 })
});

export const DEFAULT_UI_TWEAKS = Object.freeze({
    tabTitle: Object.freeze({ enabled: false }),
    ctrlEnter: Object.freeze({ enabled: false }),
    inputCounter: Object.freeze({ enabled: false }),
    chatWidth: Object.freeze({ enabled: false, value: 900 }),
    sidebarWidth: Object.freeze({ enabled: false, value: 280 })
});

function clampValue(id, value) {
    const limits = VALUE_LIMITS[id];
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= limits.min && number <= limits.max
        ? number
        : limits.fallback;
}

export function uiPreferenceAcceptsValue(id) {
    return Object.prototype.hasOwnProperty.call(VALUE_LIMITS, id);
}

export function normalizeUiTweaks(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = {};
    for (const id of UI_TWEAK_FEATURE_IDS) {
        const saved = source[id];
        result[id] = { enabled: saved?.enabled === true };
        if (uiPreferenceAcceptsValue(id)) result[id].value = clampValue(id, saved?.value);
    }
    return result;
}
