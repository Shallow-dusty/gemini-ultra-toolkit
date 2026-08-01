import { firstMatch } from './dom.js';
import { SELECTORS } from './selectors.js';

export function normalizeModelText(text) {
    if (typeof text !== 'string' || !text) return null;
    const normalized = text.toLowerCase().trim();
    if (normalized.includes('thinking') || normalized.includes('思考') || normalized.includes('사고')) return 'thinking';
    if (/\bpro\b/.test(normalized) || normalized.includes('专业') || normalized.includes('プロ') || normalized.includes('프로')) return 'pro';
    if (normalized.includes('flash') || normalized.includes('fast') || normalized.includes('快速') || normalized.includes('高速') || normalized.includes('빠른')) return 'flash';
    return null;
}

export const modelMethods = Object.freeze({
    getModelSwitch() {
        return firstMatch(document, SELECTORS.MODE_BTN);
    },

    getModelSwitchLabel() {
        const button = this.getModelSwitch();
        if (!button) return '';
        const label = button.querySelector(SELECTORS.MODE_BTN_LABEL);
        return (label?.textContent || button.textContent || '').trim();
    },

    detectModelKey() {
        try {
            const labelKey = normalizeModelText(this.getModelSwitchLabel());
            if (labelKey) return labelKey;
            const active = document.querySelector('gem-menu-item[data-active="true"], .bard-mode-list-button.is-selected');
            return normalizeModelText(active?.textContent || '');
        } catch {
            return null;
        }
    },

    getModelMenuOptions() {
        return Array.from(document.querySelectorAll(SELECTORS.MODE_MENU_ITEM), element => {
            const label = (element.textContent || '').trim();
            return {
                key: normalizeModelText(label),
                label,
                dataModeId: element.getAttribute('data-mode-id'),
                active: element.getAttribute('data-active') === 'true' || element.classList?.contains('selected') || false,
                element
            };
        });
    },

    findModelMenuItem(internalKey) {
        const options = this.getModelMenuOptions();
        if (internalKey === 'flash') {
            const exact = options.find(option => option.key === 'flash' && !/lite/i.test(option.label));
            if (exact) return exact.element;
        }
        return options.find(option => option.key === internalKey)?.element || null;
    }
});
