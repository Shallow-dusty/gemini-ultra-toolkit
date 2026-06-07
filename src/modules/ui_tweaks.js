import { TIMINGS } from '../constants.js';
import { Logger } from '../logger.js';
import { Core } from '../core.js';
import { DOMWatcher } from '../dom_watcher.js';
import { NativeUI } from '../native_ui.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { formatInputStats } from '../../lib/input_stats_tools.js';

const STATUS_ID = 'gc-tweaks-status';
const SEND_HINT_ID = 'gc-tweaks-send-hint';
const INPUT_COUNTER_ID = 'gc-tweaks-input-counter';

export const UITweaksModule = {
    id: 'ui-tweaks',
    name: NativeUI.t('UI 自定义', 'UI Tweaks'),
    description: NativeUI.t('Tab 标题 / 快捷键 / 输入计数 / 布局调整', 'Tab title / hotkeys / input counter / layout tweaks'),
    icon: '\uD83C\uDFA8',
    defaultEnabled: false,

    STORAGE_KEY: 'gemini_ui_tweaks',
    _styleEl: null,
    _titleObserver: null,
    _keyHandler: null,
    _inputCounterEditor: null,
    _inputCounterHandler: null,

    features: {
        tabTitle: { enabled: false, label: NativeUI.t('Tab 标题同步对话名', 'Sync tab title with chat name') },
        ctrlEnter: { enabled: false, label: NativeUI.t('Ctrl+Enter 才发送', 'Ctrl+Enter to send') },
        inputCounter: { enabled: false, label: NativeUI.t('输入字数计数', 'Input counter') },
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
        if (!this.features.ctrlEnter.enabled && !this.features.inputCounter.enabled) return;
        const inputArea = NativeUI.getInputArea();
        if (!inputArea) return;

        const pos = getComputedStyle(inputArea).position;
        if (pos === 'static' || pos === '') inputArea.style.position = 'relative';
        const status = this._getInputStatusContainer(inputArea);

        if (this.features.ctrlEnter.enabled && !document.getElementById(SEND_HINT_ID)) {
            const hint = document.createElement('span');
            hint.id = SEND_HINT_ID;
            hint.className = 'gc-send-hint';
            hint.textContent = NativeUI.t('Ctrl+Enter \u21B5', 'Ctrl+Enter \u21B5');
            status.appendChild(hint);
        }

        if (this.features.inputCounter.enabled) {
            this._injectInputCounter(status);
        } else {
            this._removeInputCounter();
        }
    },

    removeNativeUI() {
        this._removeInputCounter();
        NativeUI.remove(STATUS_ID);
    },

    _getInputStatusContainer(inputArea) {
        let status = document.getElementById(STATUS_ID);
        if (!status) {
            status = document.createElement('div');
            status.id = STATUS_ID;
            status.className = 'gc-tweaks-status';
            inputArea.appendChild(status);
        } else if (status.parentElement !== inputArea) {
            inputArea.appendChild(status);
        }
        return status;
    },

    _getEditorText(editor) {
        if (!editor) return '';
        if ('value' in editor) return editor.value || '';
        return editor.textContent || '';
    },

    _injectInputCounter(status) {
        const editor = GeminiAdapter.getInputEditor();
        if (!editor) return;

        let counter = document.getElementById(INPUT_COUNTER_ID);
        if (!counter) {
            counter = document.createElement('span');
            counter.id = INPUT_COUNTER_ID;
            counter.className = 'gc-input-counter';
            counter.title = NativeUI.t('当前输入长度', 'Current input length');
            counter.setAttribute('aria-live', 'polite');
            status.appendChild(counter);
        } else if (counter.parentElement !== status) {
            status.appendChild(counter);
        }

        if (this._inputCounterEditor !== editor) {
            this._removeInputCounterListener();
            this._inputCounterEditor = editor;
            this._inputCounterHandler = () => this._updateInputCounter();
            editor.addEventListener('input', this._inputCounterHandler);
        }
        this._updateInputCounter();
    },

    _removeInputCounterListener() {
        if (this._inputCounterEditor && this._inputCounterHandler) {
            this._inputCounterEditor.removeEventListener('input', this._inputCounterHandler);
        }
        this._inputCounterEditor = null;
        this._inputCounterHandler = null;
    },

    _removeInputCounter() {
        this._removeInputCounterListener();
        NativeUI.remove(INPUT_COUNTER_ID);
    },

    _updateInputCounter() {
        const counter = document.getElementById(INPUT_COUNTER_ID);
        if (!counter || !this._inputCounterEditor) return;
        counter.textContent = formatInputStats(this._getEditorText(this._inputCounterEditor), {
            locale: NativeUI.isZH ? 'zh' : 'en'
        });
    },

    _getStatusText() {
        const items = [];
        if (this.features.ctrlEnter.enabled) items.push('Ctrl+Enter: ON');
        if (this.features.inputCounter.enabled) items.push('Input Counter: ON');
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

        rules.push(...GeminiAdapter.buildUITweakCssRules({
            chatWidth: this.features.chatWidth.enabled
                ? clampPx(this.features.chatWidth.value, 900, 400, 4000)
                : null,
            sidebarWidth: this.features.sidebarWidth.enabled
                ? clampPx(this.features.sidebarWidth.value, 280, 160, 800)
                : null,
            hideGems: this.features.hideGems.enabled
        }));

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
                    return GeminiAdapter.isInsideMainChatArea(target);
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
            if (!GeminiAdapter.isInsideInputEditor(target)) return;
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
                features: '\u591A\u4E2A\u5FAE\u8C03\u5F00\u5173\uFF1ACtrl+Enter \u53D1\u9001\u3001\u8F93\u5165\u5B57\u6570\u8BA1\u6570\u3001\u6807\u7B7E\u9875\u663E\u793A\u5BF9\u8BDD\u6807\u9898\u3001\u5E03\u5C40\u4F18\u5316\u3002\u8F93\u5165\u6846\u65C1\u53EF\u663E\u793A\u5FEB\u6377\u952E\u63D0\u793A\u548C\u672C\u5730\u5B57\u7B26/\u884C\u6570\u8BA1\u6570\u3002',
                guide: '1. \u5728\u8BBE\u7F6E\u4E2D\u5F00\u542F\u9700\u8981\u7684\u8C03\u6574\u9879\n2. \u5F00\u542F Ctrl+Enter \u540E\u4F1A\u5728\u8F93\u5165\u533A\u663E\u793A\u5FEB\u6377\u952E\u63D0\u793A\n3. \u5F00\u542F\u8F93\u5165\u8BA1\u6570\u540E\u4EC5\u7EDF\u8BA1\u5F53\u524D\u8F93\u5165\u6846\u6587\u672C'
            },
            en: {
                rant: "Gemini doesn't support Ctrl+Enter to send. Enter sends immediately, meaning you can never add newlines \u2014 unless you know the secret Shift+Enter shortcut. Browser tab title always shows 'Gemini' \u2014 open 10 chat tabs? All 'Gemini - Gemini - Gemini'. Does the UX team think users only use one tab?",
                features: 'Micro-tweaks for Ctrl+Enter send, composer input counts, tab title sync, and layout adjustments. The input area can show a shortcut hint and local character/line count.',
                guide: '1. Enable desired tweaks in Settings\n2. Ctrl+Enter shows a shortcut hint in the input area\n3. Input counter only counts the current composer text'
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
