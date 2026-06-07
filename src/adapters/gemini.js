/**
 * GeminiAdapter — centralizes Gemini web-app DOM coupling.
 *
 * Why it exists: Google occasionally restructures Gemini's frontend. Without an
 * adapter, every such change touches a dozen module files. With it, Gemini
 * markup changes should be contained here first. Every querySelector that
 * depends on Gemini's own markup MUST live here.
 *
 * Selector strategy: each accessor tries multiple selectors in priority order —
 * v12 primary → v11 fallback → role/aria fallback. This keeps the script
 * working when Google ships partial rollouts (some users see v11, some v12).
 *
 * Modules call high-level methods (getSidebar, getInputEditor, ...).
 * They never touch SELECTORS directly except for debug tooling.
 */

// ───────────────────────────────────────────────────────────────────────────
// Selector catalog (kept in one place for debugging/diagnostics)
// ───────────────────────────────────────────────────────────────────────────
const S = Object.freeze({
    // Sidebar
    SIDEBAR: [
        'nav[aria-label="Side Navigation"]',         // v12 aria
        'bard-sidenav',                              // v11/v12 web component
        '.sidenav-with-history-container',           // v11 fallback
        'nav[role="navigation"]'                     // last-ditch
    ],
    SIDEBAR_OVERFLOW: '.overflow-container',
    SIDEBAR_CONVERSATIONS_LIST: 'conversations-list[data-test-id="all-conversations"]',
    CHAT_LINK: 'a[href*="/app/"]',
    CHAT_ROW_WRAPPER: 'gem-nav-list-item[data-test-id="conversation"]',
    CHAT_ROW_MORE_BTN: 'button[aria-label^="More options for"]',

    // Input area
    INPUT_AREA: [
        'input-area-v2',                             // v11/v12 web component
        '.input-area-container',                     // v11/v12 fieldset
        'input-container'                            // v12 outer wrapper
    ],
    INPUT_EDITOR: 'div.ql-editor[contenteditable="true"]',
    INPUT_EDITOR_BY_ARIA: '[role="textbox"][aria-label="Enter a prompt for Gemini"]',
    INPUT_EDITOR_TARGET: 'textarea, div.ql-editor[contenteditable="true"], [role="textbox"][aria-label="Enter a prompt for Gemini"], [contenteditable="true"]',
    INPUT_TRAILING_ACTIONS: '.trailing-actions-wrapper',
    TOOL_MODE_CANDIDATE: 'button, [role="button"], [aria-pressed="true"], [data-active="true"]',
    SEND_BUTTON: [
        'button[aria-label="Send message"]',         // v12 primary
        'button.send-button',                        // v11 deprecated (kept for mixed-rollout)
        'button[aria-label*="Send" i]'               // i18n fallback
    ],

    // Mode picker
    MODE_BTN: [
        'button[aria-label="Open mode picker"]',     // v12 aria
        '[data-test-id="bard-mode-menu-button"]',    // v11/v12 data-test-id
        'button.input-area-switch'                   // v11/v12 class
    ],
    MODE_BTN_LABEL: '.picker-primary-text',
    MODE_MENU: '[data-test-id="gem-mode-menu"][role="menu"]',
    MODE_MENU_ITEM: '[role="menuitem"][data-test-id^="bard-mode-option-"], gem-menu-item[data-test-id^="bard-mode-option-"]',
    MODE_MENU_ITEM_ANY: '[role="menuitem"]',

    // Chat header (conversation actions menu button — v12 has no visible title)
    CHAT_HEADER_MORE_BTN: [
        'button[aria-label*="Open menu for conversation actions" i]'
    ],
    CHAT_HEADER_TITLE: [
        '.conversation-title-container',             // v11 (gone in v12)
        'h1.conversation-title',                     // v11
        '[data-test-id="conversation-title"]',       // v11
        'h1.cdk-visually-hidden'                     // v12 a11y-only fallback
    ],

    // User identification (account button bottom of sidebar / Google bar)
    USER_AREAS: 'a[aria-label*="@"], button[aria-label*="@"], div[aria-label*="帐号"], div[aria-label*="Account"], img[alt*="@"], img[aria-label*="@"]',

    // Conversation actions menu (after clicking row More button)
    MENU_PANEL: '.cdk-overlay-pane [role="menu"], .cdk-overlay-container [role="menu"], .mat-mdc-menu-panel',
    MENU_ITEM: '[role="menuitem"], mat-menu-item, button.mat-mdc-menu-item, .mat-menu-item',
    DELETE_BUTTON: 'button[data-test-id="delete-button"]',

    // Confirmation dialog
    DIALOG: 'mat-dialog-container, .mdc-dialog, [role="dialog"], [role="alertdialog"]',
    DIALOG_CONFIRM_BTNS: 'button.confirm-button, button[data-test-id*="confirm"], mat-dialog-actions button, .mdc-dialog__actions button, [role="dialog"] button, [role="alertdialog"] button',

    // Messages (in chat detail)
    USER_QUERY: 'user-query',
    MODEL_RESPONSE: 'model-response',
    MESSAGE_ACTIONS: 'message-actions',
    RESPONSE_CONTAINER: 'response-container',
    CONVERSATION_CONTAINER: '.conversation-container',
    USER_QUERY_TEXT: '.query-text, .user-query-text',
    CHAT_CONTENT_ROOT: 'main, [role="main"], user-query, model-response, response-container, .conversation-container',
    MAIN_CHAT_AREA: 'main, .chat-container, [role="main"]',

    // CSS targets for UI Tweaks. These are CSS rule selectors rather than
    // element lookup selectors, but still belong in the Gemini-owned catalog.
    UI_TWEAK_CHAT_WIDTH_TARGET: 'main .conversation-container, main .chat-window',
    UI_TWEAK_SIDEBAR_WIDTH_TARGET: 'bard-sidenav, nav[aria-label="Side Navigation"]',
    UI_TWEAK_GEMS_ENTRY: 'a[href*="/gems/"]',

    // Mutation-watch closest() roots (DOMWatcher zone matches)
    SIDEBAR_MUTATION_ROOT: 'nav[aria-label="Side Navigation"], bard-sidenav, bard-sidenav-container, .sidenav-with-history-container, nav[role="navigation"]',
    INPUT_MUTATION_ROOT: 'input-area-v2, .input-area-container, input-container',
    HEADER_MUTATION_ROOT: 'gem-icon-button, .conversation-title-container',
    MODEL_MUTATION_TARGET_MATCH: 'button.input-area-switch, [data-test-id="bard-mode-menu-button"], button[aria-label="Open mode picker"], gem-menu-item'
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
function firstMatch(root, list) {
    const arr = Array.isArray(list) ? list : [list];
    for (const sel of arr) {
        const el = root.querySelector(sel);
        if (el) return el;
    }
    return null;
}

function matchesAny(target, list) {
    if (!target || !target.matches) return false;
    const arr = Array.isArray(list) ? list : [list];
    for (const sel of arr) {
        try { if (target.matches(sel)) return true; } catch { /* invalid sel — skip */ }
    }
    return false;
}

function closestAny(target, list) {
    if (!target || !target.closest) return null;
    const arr = Array.isArray(list) ? list : [list];
    for (const sel of arr) {
        try { const el = target.closest(sel); if (el) return el; } catch { /* skip */ }
    }
    return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Model name normalization (mode picker text → internal key)
// ───────────────────────────────────────────────────────────────────────────
//
// v11 internal keys:        'flash' | 'thinking' | 'pro'
// v12 mode picker text:     "3.5 Flash", "3.1 Flash-Lite", "3.1 Pro", "Thinking level"
// Strategy: keyword match (case-insensitive). Order matters — check 'pro' and
// 'thinking' BEFORE 'flash' because "Flash-Lite Pro" would otherwise be mis-
// matched (currently no such option but defends against future menus).
function normalizeModelText(text) {
    if (!text || typeof text !== 'string') return null;
    const t = text.toLowerCase().trim();
    // Multi-language thinking detection
    if (t.includes('thinking') || t.includes('思考') || t.includes('사고')) return 'thinking';
    // Pro detection — exclude false positives. "Pro" alone is fine; "Improving" is unlikely text.
    if (/\bpro\b/.test(t) || t.includes('专业') || t.includes('プロ') || t.includes('프로')) return 'pro';
    // Flash (and Flash-Lite — same multiplier bucket)
    if (t.includes('flash') || t.includes('fast') || t.includes('快速') || t.includes('高速') || t.includes('빠른')) return 'flash';
    return null;
}

function matchToolModeLabel(text) {
    const t = (text || '').toLowerCase();
    if (t.includes('deep research')) return 'Deep Research';
    if (t.includes('canvas')) return 'Canvas';
    if (t.includes('spark')) return 'Spark';
    if (t.includes('audio overview')) return 'Audio Overview';
    if (/\bimage\b|imagen/.test(t)) return 'Image';
    if (/\bvideo\b|veo/.test(t)) return 'Video';
    return '';
}

function isActiveModeCandidate(el) {
    return el.getAttribute('aria-pressed') === 'true' ||
           el.getAttribute('aria-current') === 'true' ||
           el.getAttribute('data-active') === 'true' ||
           el.classList?.contains('active') ||
           el.classList?.contains('selected');
}

function cleanVisibleText(el) {
    return (el?.textContent || '').replace(/\s+\n/g, '\n').replace(/\n\s+/g, '\n').trim();
}

// ───────────────────────────────────────────────────────────────────────────
// Public adapter
// ───────────────────────────────────────────────────────────────────────────
export const GeminiAdapter = {
    SELECTORS: S,
    _normalizeModelText: normalizeModelText,

    // ─── Probe ──────────────────────────────────────────────────────────
    /** Is Gemini's core UI present? (sidebar OR input area visible) */
    isReady() {
        return !!(this.getSidebar() || this.getInputArea());
    },

    // ─── User detection ────────────────────────────────────────────────
    /**
     * Extract Gmail address from any visible Google account UI.
     * Returns null when no email is found yet.
     */
    detectUserEmail() {
        try {
            const candidates = document.querySelectorAll(S.USER_AREAS);
            for (const el of candidates) {
                const label = el.getAttribute('aria-label') || el.getAttribute('alt') || '';
                const match = label.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
                if (match && match[1]) return match[1];
            }
        } catch { /* swallow — caller handles null */ }
        return null;
    },

    /**
     * Detect account tier ('free' | 'pro' | 'ultra').
     * v12: the tier label sits inside the account block (sidebar bottom).
     * v11: a separate pillbox button.
     */
    detectAccountTier() {
        try {
            // v12: account button often contains a "Pro" / "Ultra" sibling
            const acctLink = document.querySelector('a[aria-label*="Google Account" i], a[aria-label*="@" i]');
            if (acctLink) {
                const text = (acctLink.textContent || '').toUpperCase();
                if (text.includes('ULTRA')) return 'ultra';
                if (/\bPRO\b/.test(text)) return 'pro';
            }
            // v11 fallback
            const pillboxBtn = document.querySelector('button.gds-pillbox-button, button.pillbox-btn');
            if (pillboxBtn) {
                const text = (pillboxBtn.textContent || '').toUpperCase();
                if (text.includes('ULTRA')) return 'ultra';
                if (text.includes('PRO')) return 'pro';
            }
        } catch { /* swallow */ }
        return 'free';
    },

    // ─── URL / Chat ID ─────────────────────────────────────────────────
    getChatId() {
        try {
            const m = window.location.pathname.match(/\/app\/([a-zA-Z0-9\-_]+)/);
            return m ? m[1] : null;
        } catch { return null; }
    },

    isNewChatUrl() {
        const url = location.href;
        return (url.includes('/app') && !url.includes('/app/')) ||
               url.endsWith('/app') ||
               (url.match(/\/app\?[^/]*$/) !== null);
    },

    // ─── Sidebar ───────────────────────────────────────────────────────
    getSidebar() {
        return firstMatch(document, S.SIDEBAR);
    },

    /**
     * The narrower container *inside* the sidebar that's safe to prepend
     * native UI into (folder filter bar, batch-delete toolbar).
     * Returns the sidebar itself when the overflow container is absent.
     */
    getSidebarOverflowContainer() {
        const sidebar = this.getSidebar();
        if (!sidebar) return null;
        return sidebar.querySelector(S.SIDEBAR_OVERFLOW) || sidebar;
    },

    /**
     * Scan every chat link in the sidebar.
     * @returns {Array<{id: string, title: string, element: HTMLElement, href: string}>}
     */
    scanSidebarChatLinks() {
        const items = [];
        const links = document.querySelectorAll(S.CHAT_LINK);
        for (const el of links) {
            const href = el.getAttribute('href') || '';
            const m = href.match(/\/app\/([a-zA-Z0-9\-_]+)/);
            if (!m) continue;
            let title = '';
            const textEl = el.querySelector('span, div');
            if (textEl) title = (textEl.textContent || '').trim();
            if (!title) title = 'Untitled';
            items.push({ id: m[1], title, element: el, href });
        }
        return items;
    },

    /** Live chat-link count, for cache validation in Core.scanSidebarChats. */
    getChatLinkCount() {
        return document.querySelectorAll(S.CHAT_LINK).length;
    },

    /**
     * v12: the row-level "More options for <title>" button is rendered in the
     * DOM persistently (CSS-hidden until hover). Resolves to that button for
     * a given chat link element. Falls back to v11 selectors.
     */
    getChatRowMoreButton(chatElement) {
        if (!chatElement) return null;
        // v12: it lives on the row wrapper (gem-nav-list-item)
        const row = chatElement.closest(S.CHAT_ROW_WRAPPER) ||
                    chatElement.closest('mat-list-item, [role="listitem"]') ||
                    chatElement.parentElement;
        if (!row) return null;
        return row.querySelector(S.CHAT_ROW_MORE_BTN) ||
               row.querySelector('button[data-test-id*="menu"], button[aria-label*="more" i], button[aria-label*="options" i], button[aria-label*="更多" i], button[aria-label*="その他" i], button[aria-label*="더보기" i]');
    },

    // ─── Input area ────────────────────────────────────────────────────
    getInputArea() {
        return firstMatch(document, S.INPUT_AREA);
    },

    getInputEditor() {
        return document.querySelector(S.INPUT_EDITOR) ||
               document.querySelector(S.INPUT_EDITOR_BY_ARIA);
    },

    /** prompt_vault inject point — wrapper that holds the trailing action buttons. */
    getInputTrailingActions() {
        return document.querySelector(S.INPUT_TRAILING_ACTIONS);
    },

    /**
     * Conservative automation guard for tool/mode chips in the input area.
     * Unknown Gemini DOM still returns inactive; this is a best-effort pause
     * signal, not proof that every future tool surface is detected.
     */
    getActiveToolMode() {
        const area = this.getInputArea();
        if (!area) return { active: false, label: '' };
        const candidates = area.querySelectorAll(S.TOOL_MODE_CANDIDATE);
        for (const el of candidates) {
            if (!isActiveModeCandidate(el)) continue;
            const label = matchToolModeLabel(`${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`);
            if (label) return { active: true, label };
        }
        return { active: false, label: '' };
    },

    getSendButton() {
        return firstMatch(document, S.SEND_BUTTON);
    },

    isInsideInputEditor(target) {
        return !!closestAny(target, S.INPUT_EDITOR_TARGET.split(', '));
    },

    isSendButtonElement(btn) {
        if (!btn || btn.disabled) return false;
        if (btn.classList?.contains('send-button')) return true;
        const label = (btn.getAttribute?.('aria-label') || '').trim();
        if (label === 'Send message' || label === 'Send') return true;
        if (/^send\s+(message|prompt)$/i.test(label)) return true;
        return label.includes('发送') ||
               label.includes('送信') ||
               label.includes('전송') ||
               label.includes('보내기');
    },

    getClosestSendButton(target) {
        const btn = closestAny(target, ['button']);
        return this.isSendButtonElement(btn) ? btn : null;
    },

    // ─── Chat header ───────────────────────────────────────────────────
    /**
     * Anchor element next to which export's 📤 button can be injected.
     * v12: the conversation actions menu button (top-right more_vert).
     * v11: the conversation title container.
     */
    getChatHeader() {
        // Prefer v12: the more_vert button's parent (gem-icon-button)
        const moreBtn = firstMatch(document, S.CHAT_HEADER_MORE_BTN);
        if (moreBtn) return moreBtn.parentElement || moreBtn;
        return firstMatch(document, S.CHAT_HEADER_TITLE);
    },

    /** The conversation title text used by ui_tweaks for tab title sync. */
    getChatTitleText() {
        // 1. visible title (v11 / when present in v12)
        const visible = document.querySelector('h1.conversation-title, [data-test-id="conversation-title"], span.conversation-title');
        if (visible && visible.textContent.trim()) return visible.textContent.trim();
        // 2. cdk-visually-hidden h1 (v12 a11y-only)
        const a11y = document.querySelector('h1.cdk-visually-hidden');
        if (a11y && a11y.textContent.trim()) {
            const txt = a11y.textContent.trim();
            // Filter the default "Conversation with Gemini" sentinel
            if (!/^Conversation with Gemini|^与\s*Gemini|Gemini\s*との|Gemini\s*와의/i.test(txt)) {
                return txt;
            }
        }
        // 3. first user message fallback
        const firstMsg = document.querySelector(S.USER_QUERY_TEXT);
        if (firstMsg && firstMsg.textContent.trim()) {
            return firstMsg.textContent.trim().substring(0, 50);
        }
        return '';
    },

    isInsideMainChatArea(target) {
        return !!closestAny(target, S.MAIN_CHAT_AREA.split(', '));
    },

    isInsideChatContent(target) {
        return !!closestAny(target, S.CHAT_CONTENT_ROOT.split(', '));
    },

    /**
     * Capture messages currently rendered in the visible conversation DOM.
     * This does not navigate historical chats; bulk cross-chat export should
     * build on this only after a separate navigation/smoke-tested workflow.
     */
    getCurrentConversationMessages() {
        const nodes = document.querySelectorAll(`${S.USER_QUERY}, ${S.MODEL_RESPONSE}`);
        const messages = [];
        nodes.forEach((node, index) => {
            const isUser = node.matches(S.USER_QUERY);
            const text = isUser
                ? cleanVisibleText(node.querySelector(S.USER_QUERY_TEXT) || node)
                : cleanVisibleText(node);
            if (!text) return;
            messages.push({
                id: `m_${index}`,
                role: isUser ? 'user' : 'model',
                text
            });
        });
        return messages;
    },

    // ─── Mode picker ───────────────────────────────────────────────────
    getModelSwitch() {
        return firstMatch(document, S.MODE_BTN);
    },

    /**
     * The displayed model name on the pill (e.g. "Flash", "Pro").
     * Prefers the dedicated .picker-primary-text node so we don't include
     * trailing "keyboard_arrow_down" text from the icon font.
     */
    getModelSwitchLabel() {
        const btn = this.getModelSwitch();
        if (!btn) return '';
        const labelEl = btn.querySelector(S.MODE_BTN_LABEL);
        return (labelEl ? labelEl.textContent : btn.textContent || '').trim();
    },

    /**
     * Detect current model as internal key ('flash' | 'thinking' | 'pro').
     * Returns null when undetermined (caller keeps previous value).
     */
    detectModelKey() {
        try {
            // Primary: pill label text
            const label = this.getModelSwitchLabel();
            if (label) {
                const key = normalizeModelText(label);
                if (key) return key;
            }
            // Fallback: the currently active menu item if menu is open
            const active = document.querySelector('gem-menu-item[data-active="true"], .bard-mode-list-button.is-selected');
            if (active) {
                const key = normalizeModelText(active.textContent || '');
                if (key) return key;
            }
        } catch { /* swallow */ }
        return null;
    },

    /**
     * After clicking the mode button, scrape menu items into a structured list.
     * `label` is the full textContent — sufficient for keyword-based model
     * detection in `normalizeModelText`. We don't try to split title vs subtitle
     * because the DOM structure (nested generic divs) is fragile and the
     * normalizer doesn't need that precision.
     * @returns {Array<{ key: string|null, label: string, dataModeId: string|null, active: boolean, element: HTMLElement }>}
     */
    getModelMenuOptions() {
        const items = document.querySelectorAll(S.MODE_MENU_ITEM);
        const result = [];
        items.forEach(it => {
            const label = (it.textContent || '').trim();
            result.push({
                key: normalizeModelText(label),
                label,
                dataModeId: it.getAttribute('data-mode-id'),
                active: it.getAttribute('data-active') === 'true' || it.classList.contains('selected'),
                element: it
            });
        });
        return result;
    },

    /**
     * Find a menu item whose label matches the given internal key.
     * Used by default_model.js to pick the right option after opening the menu.
     */
    findModelMenuItem(internalKey) {
        const opts = this.getModelMenuOptions();
        // Prefer exact non-Lite match for 'flash' (so "Flash" is preferred over "Flash-Lite")
        if (internalKey === 'flash') {
            const exact = opts.find(o => o.key === 'flash' && !/lite/i.test(o.label));
            if (exact) return exact.element;
        }
        const match = opts.find(o => o.key === internalKey);
        return match ? match.element : null;
    },

    // ─── Conversation actions menu (after row More click) ──────────────
    getMenuPanel() {
        return document.querySelector(S.MENU_PANEL);
    },

    /** Find the Delete menu item — prefers data-test-id, falls back to text. */
    getDeleteMenuItem() {
        const panel = this.getMenuPanel() || document;
        // v12: data-test-id wins
        const byTestId = panel.querySelector(S.DELETE_BUTTON);
        if (byTestId) return byTestId;
        // i18n text fallback
        const items = panel.querySelectorAll(S.MENU_ITEM);
        for (const item of items) {
            const t = (item.textContent || '').trim().toLowerCase();
            if (t.includes('delete') || t.includes('删除') || t.includes('削除') || t.includes('삭제')) {
                return item;
            }
        }
        return null;
    },

    // ─── Confirmation dialog ───────────────────────────────────────────
    getConfirmDialog() {
        return document.querySelector(S.DIALOG);
    },

    /** Pick the affirmative button (Delete / Confirm) inside a dialog. */
    getDialogConfirmButton(dialog) {
        const root = dialog || this.getConfirmDialog();
        if (!root) return null;
        const btns = root.querySelectorAll(S.DIALOG_CONFIRM_BTNS);
        for (const btn of btns) {
            const t = (btn.textContent || '').trim().toLowerCase();
            if (t.includes('delete') || t.includes('删除') || t.includes('削除') || t.includes('삭제') ||
                t.includes('confirm') || t.includes('确认') || t.includes('確認') || t.includes('확인')) {
                return btn;
            }
        }
        return null;
    },

    // ─── MutationObserver zone matchers ────────────────────────────────
    matchesSidebarMutation(m) {
        return m && m.type === 'childList' &&
               !!closestAny(m.target, S.SIDEBAR_MUTATION_ROOT.split(', '));
    },

    matchesInputAreaMutation(m) {
        return m && m.type === 'childList' &&
               !!closestAny(m.target, S.INPUT_MUTATION_ROOT.split(', '));
    },

    matchesHeaderMutation(m) {
        return m && m.type === 'childList' &&
               !!closestAny(m.target, S.HEADER_MUTATION_ROOT.split(', '));
    },

    matchesModelMutation(m) {
        if (!m) return false;
        if (m.type === 'attributes') {
            return matchesAny(m.target, S.MODEL_MUTATION_TARGET_MATCH.split(', '));
        }
        if (m.type === 'childList') {
            return !!closestAny(m.target, S.INPUT_MUTATION_ROOT.split(', '));
        }
        return false;
    },

    matchesFoldersSidebarMutation(m) {
        if (!m || !m.target) return false;
        return !!closestAny(m.target, [
            'bard-sidenav-container',
            'nav[aria-label="Side Navigation"]',
            'bard-sidenav',
            'nav[role="navigation"]'
        ]);
    },

    buildUITweakCssRules({ chatWidth, sidebarWidth, hideGems } = {}) {
        const rules = [];
        if (Number.isFinite(chatWidth)) {
            rules.push(`${S.UI_TWEAK_CHAT_WIDTH_TARGET} { max-width: ${chatWidth}px !important; }`);
        }
        if (Number.isFinite(sidebarWidth)) {
            rules.push(`${S.UI_TWEAK_SIDEBAR_WIDTH_TARGET} { width: ${sidebarWidth}px !important; min-width: ${sidebarWidth}px !important; }`);
        }
        if (hideGems) {
            rules.push(`${S.UI_TWEAK_GEMS_ENTRY} { display: none !important; }`);
        }
        return rules;
    },

    getSelectorHealthReport() {
        const checks = [
            { id: 'sidebar', label: 'Sidebar', ok: !!this.getSidebar() },
            { id: 'sidebar-overflow', label: 'Sidebar overflow', ok: !!this.getSidebarOverflowContainer() },
            { id: 'input-area', label: 'Input area', ok: !!this.getInputArea() },
            { id: 'input-editor', label: 'Input editor', ok: !!this.getInputEditor() },
            { id: 'input-actions', label: 'Input actions', ok: !!this.getInputTrailingActions() },
            { id: 'send-button', label: 'Send button', ok: !!this.getSendButton() },
            { id: 'chat-header', label: 'Chat header', ok: !!this.getChatHeader() },
            { id: 'model-switch', label: 'Model switch', ok: !!this.getModelSwitch() },
            { id: 'chat-links', label: 'Sidebar chat links', ok: this.getChatLinkCount() > 0, detail: String(this.getChatLinkCount()) }
        ];
        const passed = checks.filter(check => check.ok).length;
        return {
            ready: this.isReady(),
            passed,
            total: checks.length,
            failed: checks.filter(check => !check.ok).map(check => check.id),
            checks
        };
    }
};
