import { extractGeminiChatId } from '../../../lib/gemini_url_tools.js';
import { firstMatch } from './dom.js';
import { SELECTORS } from './selectors.js';

function wait(delay) {
    return new Promise(resolve => globalThis.setTimeout(resolve, delay));
}

export const sidebarMethods = Object.freeze({
    getSidebar() {
        return firstMatch(document, SELECTORS.SIDEBAR);
    },

    getSidebarOverflowContainer() {
        const sidebar = this.getSidebar();
        return sidebar ? (sidebar.querySelector(SELECTORS.SIDEBAR_OVERFLOW) || sidebar) : null;
    },

    scanSidebarChatLinks() {
        const items = [];
        for (const element of document.querySelectorAll(SELECTORS.CHAT_LINK)) {
            const href = element.getAttribute('href');
            const id = extractGeminiChatId(href);
            if (!id) continue;
            const titleNode = [...element.querySelectorAll('span, div')].find(node => (
                !node.closest?.('[data-primer-sidebar-control]') && node.textContent?.trim()
            ));
            const title = (
                element.getAttribute('aria-label')
                || titleNode?.textContent
                || element.textContent
                || ''
            ).trim() || 'Untitled';
            items.push({ id, title, element, href });
        }
        return items;
    },

    openChatLocator(locator) {
        const chatId = typeof locator === 'string' ? locator : locator?.chatId;
        if (typeof chatId !== 'string' || !chatId.trim()) return false;
        if (this.getChatId?.() === chatId) return true;
        const match = this.scanSidebarChatLinks().find(item => item.id === chatId);
        if (!match?.element || typeof match.element.click !== 'function') return false;
        match.element.click();
        return true;
    },

    async waitForChatLocator(locator, options = {}) {
        const chatId = typeof locator === 'string' ? locator : locator?.chatId;
        if (typeof chatId !== 'string' || !chatId.trim()) return false;
        const attempts = Number.isSafeInteger(options.attempts) && options.attempts > 0
            ? options.attempts : 80;
        const interval = Number.isFinite(options.interval) && options.interval >= 0
            ? options.interval : 50;
        const sleep = typeof options.sleep === 'function' ? options.sleep : wait;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            if (options.signal?.aborted) return false;
            if (this.getChatId?.() === chatId) {
                if (typeof locator === 'string' || locator?.kind === 'chat') return true;
                if (this.hasMessageLocator?.(locator, { requireStable: true })) return true;
            }
            if (attempt + 1 < attempts) await sleep(interval);
        }
        return false;
    },

    getChatLinkCount() {
        return this.scanSidebarChatLinks().length;
    },

    getChatRowMoreButton(chatElement) {
        if (!chatElement) return null;
        const row = chatElement.closest(SELECTORS.CHAT_ROW_WRAPPER)
            || chatElement.closest('mat-list-item, [role="listitem"]')
            || chatElement.parentElement;
        if (!row) return null;
        return row.querySelector(SELECTORS.CHAT_ROW_MORE_BTN)
            || row.querySelector('button[data-test-id*="menu"], button[aria-label*="more" i], button[aria-label*="options" i], button[aria-label*="更多" i], button[aria-label*="その他" i], button[aria-label*="더보기" i]');
    }
});
