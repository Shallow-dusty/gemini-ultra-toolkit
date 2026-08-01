import { extractGeminiChatId } from '../../../lib/gemini_url_tools.js';
import { SELECTORS } from './selectors.js';

export const sessionMethods = Object.freeze({
    detectUserEmail() {
        try {
            for (const element of document.querySelectorAll(SELECTORS.USER_AREAS)) {
                const label = element.getAttribute('aria-label') || element.getAttribute('alt') || '';
                const match = label.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
                if (match) return match[1];
            }
        } catch {
            // Account identity is optional until Gemini finishes mounting.
        }
        return null;
    },

    detectAccountTier() {
        try {
            const account = document.querySelector('a[aria-label*="Google Account" i], a[aria-label*="@" i]');
            if (account) {
                const text = (account.textContent || '').toUpperCase();
                if (text.includes('ULTRA')) return 'ultra';
                if (/\bPRO\b/.test(text)) return 'pro';
            }
            const pill = document.querySelector('button.gds-pillbox-button, button.pillbox-btn');
            if (pill) {
                const text = (pill.textContent || '').toUpperCase();
                if (text.includes('ULTRA')) return 'ultra';
                if (text.includes('PRO')) return 'pro';
            }
        } catch {
            // Account tier is advisory; unknown must remain the free baseline.
        }
        return 'free';
    },

    getCurrentHref() {
        try {
            return String(globalThis.location?.href || globalThis.window?.location?.href || '');
        } catch {
            return '';
        }
    },

    getChatId() {
        return extractGeminiChatId(this.getCurrentHref());
    },

    isNewChatUrl() {
        const href = this.getCurrentHref();
        try {
            const url = new URL(href);
            return url.pathname === '/app' || url.pathname === '/app/';
        } catch {
            return false;
        }
    }
});
