import { TIMINGS } from '../constants.js';
import { Logger } from '../logger.js';
import { Core } from '../core.js';
import { NativeUI } from '../native_ui.js';
import { createIcon } from '../icons.js';
import { CounterModule } from './counter.js';

export const DefaultModelModule = {
    id: 'default-model',
    name: NativeUI.t('默认模型', 'Default Model'),
    description: NativeUI.t('新对话自动选择首选模型', 'Auto-select preferred model for new chats'),
    icon: '\uD83E\uDD16',
    iconId: 'settings',
    defaultEnabled: false,

    STORAGE_KEY: 'gemini_default_model',
    _preferredModel: 'pro',
    _lastUrl: '',
    _pollTimer: null,
    _switching: false,

    init() {
        let model;
        try { model = GM_getValue(this.STORAGE_KEY, 'pro'); }
        catch (e) { model = 'pro'; }
        this._preferredModel = model;
        this._lastUrl = location.href;
        this._startUrlWatcher();
        Logger.info('DefaultModelModule initialized', { preferred: this._preferredModel });
    },

    destroy() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        this._switching = false;
        this.removeNativeUI();
    },

    onUserChange() {},

    // --- \u539F\u751F UI \u6CE8\u5165 ---
    injectNativeUI() {
        const LOCK_ID = 'gc-model-lock';
        if (document.getElementById(LOCK_ID)) return;

        const modelBtn = NativeUI.getModelSwitch();
        if (!modelBtn) return;
        const parent = modelBtn.parentElement;
        if (!parent) return;

        const lock = document.createElement('span');
        lock.id = LOCK_ID;
        lock.className = 'gc-model-lock';
        lock.appendChild(createIcon('lock', 9));
        const modelLabel = this._preferredModel === 'flash' ? 'Fast' : this._preferredModel === 'thinking' ? 'Thinking' : 'Pro';
        lock.title = NativeUI.t('\u5DF2\u9501\u5B9A: ' + modelLabel, 'Locked: ' + modelLabel);
        parent.appendChild(lock);
    },

    removeNativeUI() {
        NativeUI.remove('gc-model-lock');
    },

    setPreferredModel(model) {
        this._preferredModel = model;
        try { GM_setValue(this.STORAGE_KEY, model); } catch (e) { /* silent */ }
        // \u5237\u65B0\u9501\u5B9A\u6307\u793A\u5668
        this.removeNativeUI();
        this.injectNativeUI();
        Logger.info('Default model set', { model });
    },

    _isNewChat() {
        const url = location.href;
        return (url.includes('/app') && !url.includes('/app/')) ||
               url.endsWith('/app') ||
               (url.match(/\/app\?[^/]*$/) !== null);
    },

    _startUrlWatcher() {
        if (this._pollTimer) return;  // Guard against duplicate
        this._pollTimer = setInterval(() => {
            const currentUrl = location.href;
            if (currentUrl !== this._lastUrl) {
                const wasChat = this._lastUrl.includes('/app/');
                this._lastUrl = currentUrl;
                if (this._isNewChat() || (!wasChat && this._isNewChat())) {
                    this._attemptModelSwitch();
                }
            }
        }, 800);
    },

    async _attemptModelSwitch() {
        if (this._switching) return;
        this._switching = true;
        try {
            await this._waitForElement('button.input-area-switch, [data-test-id="bard-mode-menu-button"]', 5000);
            const currentModel = this._detectCurrentModel();
            if (currentModel === this._preferredModel) {
                Logger.info('Already on preferred model', { model: currentModel });
                return;
            }
            const modeBtn = document.querySelector('button.input-area-switch') ||
                            document.querySelector('[data-test-id="bard-mode-menu-button"]');
            if (!modeBtn) return;
            modeBtn.click();
            await this._waitForElement('[data-test-id^="bard-mode-option-"]', TIMINGS.MODEL_MENU_TIMEOUT);

            const modelMap = { flash: 'fast', thinking: 'thinking', pro: 'pro' };
            const testId = 'bard-mode-option-' + (modelMap[this._preferredModel] || this._preferredModel);
            const option = document.querySelector('[data-test-id="' + testId + '"]');
            if (option) {
                option.click();
                Logger.info('Model switched', { from: currentModel, to: this._preferredModel });
            } else {
                document.body.click();
                Logger.warn('Model option not found', { testId });
            }
        } catch (e) {
            Logger.warn('Model switch failed', { error: e.message });
        } finally {
            this._switching = false;
        }
    },

    _detectCurrentModel() {
        const map = CounterModule.MODEL_DETECT_MAP;
        const modeBtn = document.querySelector('button.input-area-switch');
        if (modeBtn) {
            const text = modeBtn.textContent.trim();
            if (map[text]) return map[text];
        }
        const pill = document.querySelector('[data-test-id="bard-mode-menu-button"]');
        if (pill) {
            const full = pill.textContent.trim();
            const key = map[full] || map[full.split(/\s/)[0]];
            if (key) return key;
        }
        return 'flash';
    },

    _waitForElement(selector, timeout) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            const start = Date.now();
            let check = null;
            const cleanup = () => { if (check) clearInterval(check); };
            check = setInterval(() => {
                const found = document.querySelector(selector);
                if (found) { cleanup(); resolve(found); }
                else if (Date.now() - start > timeout) { cleanup(); reject(new Error('timeout')); }
            }, 200);
        });
    },

    _sleep(ms) {
        return Core.sleep(ms);
    },

    getOnboarding() {
        return {
            zh: {
                rant: 'Gemini \u6BCF\u6B21\u65B0\u5EFA\u5BF9\u8BDD\u90FD\u9ED8\u8BA4\u9009 Flash\u3002\u4F60\u660E\u660E\u60F3\u7528 Pro\uFF0C\u4F46\u5B83\u504F\u8981\u4F60\u6BCF\u6B21\u624B\u52A8\u5207\u3002\u8FD9\u5C31\u50CF\u4E00\u4E2A\u5496\u5561\u5E97\uFF0C\u4F60\u5929\u5929\u6765\u70B9\u7F8E\u5F0F\uFF0C\u4F46\u670D\u52A1\u5458\u6BCF\u6B21\u90FD\u95EE\u201C\u5148\u751F\uFF0C\u6765\u676F\u901F\u6EB6\u5496\u5561\u5427\uFF1F\u201D\u3002Google\uFF0C\u6C42\u6C42\u4F60\u8BB0\u4F4F\u7528\u6237\u7684\u9009\u62E9\uFF0C\u8FD9\u4E0D\u96BE\u5BF9\u5427\uFF1F',
                features: '\u81EA\u52A8\u5C06\u65B0\u5BF9\u8BDD\u5207\u6362\u5230\u4F60\u7684\u9996\u9009\u6A21\u578B\u3002\u6A21\u578B\u9009\u62E9\u6309\u94AE\u65C1\u663E\u793A \uD83D\uDD12 \u9501\u5B9A\u6807\u8BB0\u3002',
                guide: '1. \u5728\u8BBE\u7F6E\u4E2D\u9009\u62E9\u9996\u9009\u6A21\u578B (Fast/Thinking/Pro)\n2. \u65B0\u5EFA\u5BF9\u8BDD\u65F6\u81EA\u52A8\u5207\u6362\n3. \u770B\u5230 \uD83D\uDD12 \u8868\u793A\u5DF2\u9501\u5B9A'
            },
            en: {
                rant: "Gemini defaults to Flash for every new chat. You want Pro, but it insists on asking every time. It's like a coffee shop where you come daily for an americano, but the barista says 'instant coffee today, sir?' Google, please just remember the user's choice. It's not hard.",
                features: 'Automatically switches new conversations to your preferred model. Shows a \uD83D\uDD12 lock indicator next to the model switch button.',
                guide: '1. Select your preferred model in Settings (Fast/Thinking/Pro)\n2. New chats auto-switch to it\n3. The \uD83D\uDD12 icon confirms the lock is active'
            }
        };
    },

    renderToSettings(container) {
        const row = document.createElement('div');
        row.className = 'settings-row';
        const label = document.createElement('span');
        label.textContent = NativeUI.t('\uD83E\uDD16 \u9996\u9009\u6A21\u578B', '\uD83E\uDD16 Preferred Model');
        const select = document.createElement('select');
        select.style.cssText = 'background:var(--input-bg,rgba(255,255,255,0.1));color:var(--text-main);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:13px;';
        const models = [
            { value: 'flash', label: '3 Fast (Flash)' },
            { value: 'thinking', label: '3 Flash Thinking' },
            { value: 'pro', label: '3 Pro' }
        ];
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.value;
            opt.textContent = m.label;
            if (m.value === this._preferredModel) opt.selected = true;
            select.appendChild(opt);
        });
        select.addEventListener('change', () => {
            this.setPreferredModel(select.value);
        });
        row.appendChild(label);
        row.appendChild(select);
        container.appendChild(row);
    }
};
