export const DEFAULT_MODEL_KEYS = Object.freeze(['flash', 'thinking', 'pro']);

export function normalizePreferredModel(value) {
    return DEFAULT_MODEL_KEYS.includes(value) ? value : 'pro';
}

export function chooseModelOption(options, preferredModel) {
    if (!Array.isArray(options)) return null;
    const matching = options.filter(option => option?.key === preferredModel && option.element);
    if (preferredModel === 'flash') {
        return matching.find(option => !/lite/i.test(option.label || '')) || matching[0] || null;
    }
    return matching[0] || null;
}
