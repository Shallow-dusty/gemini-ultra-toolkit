import { TIMINGS } from '../constants.js';
import { Logger } from '../logger.js';
import { Core } from '../core.js';
import { DOMWatcher } from '../dom_watcher.js';
import { NativeUI } from '../native_ui.js';
import { GeminiAdapter } from '../adapters/gemini.js';

export const UITweaksModule = {
    id: 'ui-tweaks',
    name: NativeUI.t('UI 自定义', 'UI Tweaks'),
    description: NativeUI.t('Tab 标题 / 快捷键 / 布局调整', 'Tab title / hotkeys / layout tweaks'),
    icon: '\uD83C\uDFA8',
    defaultEnabled: false,

    STORAGE_KEY: 'gemini_ui_tweaks',
    _styleEl: null,
    _titleObserver: null,
    _keyHandler: null,

    features: {
        tabTitle: { enabled: false, label: NativeUI.t('Tab 标题同步对话名', 'Sync tab title with chat name') },
        ctrlEnter: { enabled: false, label: NativeUI.t('Ctrl+Enter 才发送', 'Ctrl+Enter to send') },
        chatWidth: { enabled: false, label: NativeUI.t('聊天区宽度', 'Chat area width'), value: 900 },
        sidebarWidth: { enabled: false, label: NativeUI.t('侧栏宽度', 'Sidebar width'), value: 280 },
        hideGems: { enabled: false, label: NativeUI.t('隐藏 Gems 入口', 'Hide Gems entry') }
    },

    init() {
        let saved;
        try { saved = GM_getValue(this.STORAGE_KEY, null); }
        catch (e) { saved = null; }
        if (saved) {
            Object.keys(saved).forEach(k => {
                if (this.features[k]) {
                    this.features[k].enabled = saved[k].enabled;
                    if (saved[k].value !== undefined) this.features[k].value = saved[k].value;
                }
            });
        }
        this._applyAll();
        Logger.info('UITweaksModule initialized', { features: Object.keys(this.features).filter(k => this.features[k].enabled) });
    },

    destroy() {
        if (this._styleEl) { this._styleEl.remove(); this._styleEl = null; }
        DOMWatcher.unregister('uitweaks-tabtitle');
        if (this._titleDebounce) { clearTimeout(this._titleDebounce); this._titleDebounce = null; }
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler, true);
            this._keyHandler = null;
        }
        // Restore title
        document.title = 'Google Gemini';
        this.removeNativeUI();
    },

    onUserChange() {},

    // --- \u539F\u751F UI \u6CE8\u5165 ---
    injectNativeUI() {
        // Only inject Ctrl+Enter hint when that mode is active
        if (!this.features.ctrlEnter.enabled) return;

        const HINT_ID = 'gc-tweaks-send-hint';
        if (document.getElementById(HINT_ID)) return;

        const inputArea = NativeUI.getInputArea();
        if (!inputArea) return;

        const pos = getComputedStyle(inputArea).position;
        if (pos === 'static' || pos === '') inputArea.style.position = 'relative';

        const hint = document.createElement('div');
        hint.id = HINT_ID;
        hint.className = 'gc-send-hint';
        hint.textContent = 'Ctrl+Enter \u21B5';
        inputArea.appendChild(hint);
    },

    removeNativeUI() {
        NativeUI.remove('gc-tweaks-send-hint');
    },

    _getStatusText() {
        const items = [];
        if (this.features.ctrlEnter.enabled) items.push('Ctrl+Enter: ON');
        if (this.features.tabTitle.enabled) items.push('Tab Title: ON');
        if (this.features.chatWidth.enabled) items.push('Chat Width: ' + this.features.chatWidth.value + 'px');
        if (this.features.sidebarWidth.enabled) items.push('Sidebar: ' + this.features.sidebarWidth.value + 'px');
        if (this.features.hideGems.enabled) items.push('Hide Gems: ON');
        return items.length > 0 ? items.join(' | ') : 'All tweaks off';
    },

    _save() {
        try { GM_setValue(this.STORAGE_KEY, this.features); } catch (e) { /* silent */ }
    },

    _applyAll() {
        this._applyCSS();
        this._applyTabTitle();
        this._applyCtrlEnter();
    },

    _applyCSS() {
        if (this._styleEl) this._styleEl.remove();
        const rules = [];

        // Coerce stored values to plain integers in a safe range — storage can
        // be tampered from devtools, and the raw value is spliced into a CSS
        // rule below, so any non-numeric content would let an attacker escape
        // out of the declaration.
        const clampPx = (v, fallback, min, max) => {
            const n = Math.floor(Number(v));
            return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
        };

        if (this.features.chatWidth.enabled) {
            const w = clampPx(this.features.chatWidth.value, 900, 400, 4000);
            rules.push('main .conversation-container, main .chat-window { max-width: ' + w + 'px !important; }');
        }
        if (this.features.sidebarWidth.enabled) {
            const w = clampPx(this.features.sidebarWidth.value, 280, 160, 800);
            // bard-sidenav still present in v12. Add nav[aria-label="Side Navigation"]
            // as a forward-compatible alternate selector for safety.
            rules.push('bard-sidenav, nav[aria-label="Side Navigation"] { width: ' + w + 'px !important; min-width: ' + w + 'px !important; }');
        }
        if (this.features.hideGems.enabled) {
            rules.push('a[href*="/gems/"] { display: none !important; }');
        }

        if (rules.length > 0) {
            const style = document.createElement('style');
            style.textContent = rules.join('\n');
            document.head.appendChild(style);
            this._styleEl = style;
        }
    },

    _applyTabTitle() {
        DOMWatcher.unregister('uitweaks-tabtitle');
        if (this._titleDebounce) { clearTimeout(this._titleDebounce); this._titleDebounce = null; }
        if (!this.features.tabTitle.enabled) return;

        const updateTitle = () => {
            // adapter handles v11/v12 differences AND defaults to first user message.
            const text = GeminiAdapter.getChatTitleText();
            if (text) {
                const desired = text + (text.length === 50 ? '... - Gemini' : ' - Gemini');
                if (document.title !== desired) document.title = desired;
            }
        };

        // Initial update
        updateTitle();

        // Watch for DOM changes via DOMWatcher
        DOMWatcher.register('uitweaks-tabtitle', {
            match: (m) => {
                // Respond to childList/characterData changes in the chat area
                if (m.type === 'characterData') return true;
                if (m.type === 'childList') {
                    const target = m.target;
                    if (!target || !target.closest) return true;
                    return !!target.closest('main, .chat-container, [role="main"]');
                }
                return false;
            },
            callback: updateTitle,
            debounce: TIMINGS.TITLE_DEBOUNCE
        });
    },

    _applyCtrlEnter() {
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler, true);
            this._keyHandler = null;
        }
        if (!this.features.ctrlEnter.enabled) return;

        this._keyHandler = (e) => {
            if (e.key !== 'Enter') return;
            const target = e.target;
            // Only intercept in the editor
            if (!target.closest('.ql-editor, [contenteditable="true"]')) return;
            if (e.isComposing) return; // IME

            if (!e.ctrlKey && !e.metaKey) {
                // Plain Enter - block send, allow browser default (newline in contenteditable)
                e.stopPropagation();
                e.stopImmediatePropagation();
            } else {
                // Ctrl+Enter or Meta+Enter - trigger send
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const sendBtn = GeminiAdapter.getSendButton();
                if (sendBtn && !sendBtn.disabled) {
                    sendBtn.click();
                }
            }
        };
        document.addEventListener('keydown', this._keyHandler, true);
    },

    toggleFeature(key) {
        if (!this.features[key]) return;
        this.features[key].enabled = !this.features[key].enabled;
        this._save();
        this._applyAll();
        this.removeNativeUI();
        this.injectNativeUI();
    },

    setFeatureValue(key, value) {
        if (!this.features[key]) return;
        this.features[key].value = value;
        this._save();
        this._applyAll();
    },

    getOnboarding() {
        return {
            zh: {
                rant: 'Gemini \u4E0D\u652F\u6301 Ctrl+Enter \u53D1\u9001\uFF0CEnter \u76F4\u63A5\u53D1\u9001\u610F\u5473\u7740\u4F60\u6C38\u8FDC\u4E0D\u80FD\u5728\u6D88\u606F\u91CC\u6362\u884C\u2014\u2014\u9664\u975E\u4F60\u77E5\u9053 Shift+Enter \u8FD9\u4E2A\u9690\u85CF\u5FEB\u6377\u952E\u3002\u6D4F\u89C8\u5668\u6807\u7B7E\u9875\u6807\u9898\u6C38\u8FDC\u663E\u793A\u201CGemini\u201D\uFF0C\u5F00\u4E86 10 \u4E2A\u5BF9\u8BDD\u6807\u7B7E\uFF1F\u5168\u662F Gemini - Gemini - Gemini\u3002Google \u7684 UX \u56E2\u961F\u662F\u4E0D\u662F\u89C9\u5F97\u7528\u6237\u53EA\u7528\u4E00\u4E2A\u6807\u7B7E\u9875\uFF1F',
                features: '\u4E09\u4E2A\u5FAE\u8C03\u5F00\u5173\uFF1ACtrl+Enter \u53D1\u9001\u3001\u6807\u7B7E\u9875\u663E\u793A\u5BF9\u8BDD\u6807\u9898\u3001\u5E03\u5C40\u4F18\u5316\u3002\u8F93\u5165\u6846\u65C1 3 \u4E2A\u5C0F\u5706\u70B9\u663E\u793A\u5F53\u524D\u72B6\u6001\u3002',
                guide: '1. \u5728\u8BBE\u7F6E\u4E2D\u5F00\u542F\u9700\u8981\u7684\u8C03\u6574\u9879\n2. \u8F93\u5165\u6846\u53F3\u4E0B\u89D2\u7684\u5C0F\u5706\u70B9\u6307\u793A\u54EA\u4E9B\u8C03\u6574\u5DF2\u751F\u6548\n3. \u4EAE\u84DD\u8272=\u5DF2\u542F\u7528'
            },
            en: {
                rant: "Gemini doesn't support Ctrl+Enter to send. Enter sends immediately, meaning you can never add newlines \u2014 unless you know the secret Shift+Enter shortcut. Browser tab title always shows 'Gemini' \u2014 open 10 chat tabs? All 'Gemini - Gemini - Gemini'. Does the UX team think users only use one tab?",
                features: 'Three micro-tweaks: Ctrl+Enter to send, tab title shows conversation name, layout adjustments. Three tiny dots near the input area show current status.',
                guide: '1. Enable desired tweaks in Settings\n2. Dots at the bottom-right of the input area indicate active tweaks\n3. Blue = enabled'
            }
        };
    },

    renderToSettings(container) {
        Object.keys(this.features).forEach(key => {
            const feat = this.features[key];
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 0;';

            const labelEl = document.createElement('span');
            labelEl.style.cssText = 'font-size:13px;color:var(--text-main);';
            labelEl.textContent = feat.label;
            row.appendChild(labelEl);

            const rightSide = document.createElement('div');
            rightSide.style.cssText = 'display:flex;align-items:center;gap:8px;';

            // Value input for features that have values
            if (feat.value !== undefined) {
                const input = document.createElement('input');
                input.type = 'number';
                input.value = feat.value;
                input.style.cssText = 'width:60px;background:var(--input-bg,rgba(255,255,255,0.1));color:var(--text-main);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-size:12px;text-align:center;';
                input.onchange = () => {
                    const v = parseInt(input.value, 10);
                    if (v > 0) this.setFeatureValue(key, v);
                };
                const unit = document.createElement('span');
                unit.style.cssText = 'font-size:11px;color:var(--text-sub);';
                unit.textContent = 'px';
                rightSide.appendChild(input);
                rightSide.appendChild(unit);
            }

            // Toggle switch
            const toggle = document.createElement('div');
            toggle.className = 'toggle-switch ' + (feat.enabled ? 'on' : '');
            toggle.onclick = () => {
                this.toggleFeature(key);
                toggle.classList.toggle('on');
            };
            rightSide.appendChild(toggle);

            row.appendChild(rightSide);
            container.appendChild(row);
        });
    }
};
