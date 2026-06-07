import { TIMINGS, GLOBAL_KEYS, TEMP_USER } from '../constants.js';
import { Logger } from '../logger.js';
import { Core } from '../core.js';
import { ModuleRegistry } from '../module_registry.js';
import { PanelUI } from '../panel_ui.js';
import { NativeUI } from '../native_ui.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { calculateStreaks, getLast7DaysData, ensureTodayEntry } from '../../lib/counter_calc.js';

export const CounterModule = {
    id: 'counter',
    name: NativeUI.t('消息计数器', 'Message Counter'),
    description: NativeUI.t('统计消息数量、热力图、配额追踪', 'Message stats, heatmap & quota tracking'),
    icon: '\uD83D\uDCCA',
    defaultEnabled: true,

    // --- Module private constants ---
    COOLDOWN: TIMINGS.COUNTER_COOLDOWN,
    MODEL_CONFIG: {
        flash: { label: '3 Flash', multiplier: 0, color: '#34a853' },
        thinking: { label: '3 Flash Thinking', multiplier: 0.33, color: '#fbbc04' },
        pro: { label: '3 Pro', multiplier: 1, color: '#ea4335' }
    },
    // Model detection moved to GeminiAdapter.detectModelKey (v12). The previous
    // MODEL_DETECT_MAP lived here; lib/model_config.js still ships an identical
    // map alongside MODEL_CONFIG so the sync test can verify the multiplier
    // contract \u2014 see lib/model_config.js for the authoritative source.

    // --- Module private state ---
    resetHour: 0,
    quotaLimit: 50,
    currentModel: 'flash',
    accountType: 'free',
    lastDisplayedVal: -1,
    lastCountTime: 0,

    state: {
        total: 0,
        totalChatsCreated: 0,
        chats: {},
        dailyCounts: {},
        viewMode: 'today',
        isExpanded: false,
        resetStep: 0
    },

    // --- Lifecycle ---
    init() {
        try { this.resetHour = GM_getValue(GLOBAL_KEYS.RESET_HOUR, 0); } catch (e) { this.resetHour = 0; }
        try { this.quotaLimit = GM_getValue(GLOBAL_KEYS.QUOTA, 50); } catch (e) { this.quotaLimit = 50; }
        this.bindEvents();
        Logger.info('CounterModule initialized');
    },

    destroy() {
        if (this._boundKeyHandler) {
            document.removeEventListener('keydown', this._boundKeyHandler, true);
            this._boundKeyHandler = null;
        }
        if (this._boundClickHandler) {
            document.removeEventListener('click', this._boundClickHandler, true);
            this._boundClickHandler = null;
        }
        if (this._cidPoller) {
            clearInterval(this._cidPoller);
            this._cidPoller = null;
        }
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
            this.saveData();
        }
        Core.setupStorageListener(null, null);
        Logger.info('CounterModule destroyed');
    },

    onUserChange(user) {
        this.loadDataForUser(user);
    },

    _boundKeyHandler: null,
    _boundClickHandler: null,
    _cidPoller: null,

    bindEvents() {
        if (this._boundKeyHandler && this._boundClickHandler) return;
        if (this._cidPoller) {
            clearInterval(this._cidPoller);
            this._cidPoller = null;
        }
        if (this._boundKeyHandler) {
            document.removeEventListener('keydown', this._boundKeyHandler, true);
            this._boundKeyHandler = null;
        }
        if (this._boundClickHandler) {
            document.removeEventListener('click', this._boundClickHandler, true);
            this._boundClickHandler = null;
        }

        this._boundKeyHandler = (e) => {
            if (!ModuleRegistry.isEnabled('counter')) return;
            if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.originalEvent?.isComposing) return;
            const act = document.activeElement;
            if (GeminiAdapter.isInsideInputEditor(act)) {
                setTimeout(() => this.attemptIncrement(), 50);
            }
        };

        this._boundClickHandler = (e) => {
            if (!ModuleRegistry.isEnabled('counter')) return;
            const sendBtn = GeminiAdapter.getClosestSendButton(e.target);
            if (sendBtn) {
                this.attemptIncrement();
            }
        };

        document.addEventListener('keydown', this._boundKeyHandler, true);
        document.addEventListener('click', this._boundClickHandler, true);
    },

    // --- Data management ---
    loadDataForUser(targetUser) {
        if (!targetUser) return;

        Core.setupStorageListener(targetUser, (newVal) => {
            this.state.total = newVal.total || 0;
            this.state.totalChatsCreated = newVal.totalChatsCreated || 0;
            this.state.chats = newVal.chats || {};
            this.state.dailyCounts = newVal.dailyCounts || {};
            PanelUI.update();
        });

        if (targetUser === TEMP_USER) {
            Object.assign(this.state, { total: 0, totalChatsCreated: 0, chats: {}, dailyCounts: {}, viewMode: 'today', isExpanded: false, resetStep: 0 });
            return;
        }

        const storageKey = `gemini_store_${targetUser}`;
        let savedData;
        try { savedData = GM_getValue(storageKey, null); }
        catch (e) { savedData = null; }
        if (savedData && typeof savedData === 'object') {
            this.state.total = (typeof savedData.total === 'number' ? savedData.total : 0);
            this.state.totalChatsCreated = (typeof savedData.totalChatsCreated === 'number' ? savedData.totalChatsCreated : 0);
            this.state.chats = (typeof savedData.chats === 'object' && savedData.chats ? savedData.chats : {});
            this.state.dailyCounts = (typeof savedData.dailyCounts === 'object' && savedData.dailyCounts ? savedData.dailyCounts : {});
            if (savedData.session && Object.keys(this.state.dailyCounts).length === 0) {
                const today = Core.getDayKey(this.resetHour);
                this.state.dailyCounts[today] = { messages: savedData.session, chats: 0 };
            }
        } else {
            Object.assign(this.state, { total: 0, totalChatsCreated: 0, chats: {}, dailyCounts: {}, viewMode: 'today', isExpanded: false, resetStep: 0 });
        }
        Logger.debug('Loaded user data', {
            user: targetUser,
            total: this.state.total,
            totalChatsCreated: this.state.totalChatsCreated,
            days: Object.keys(this.state.dailyCounts).length
        });
    },

    _saveTimer: null,

    saveData() {
        const user = Core.getCurrentUser();
        if (!user || !user.includes('@')) return;
        const storageKey = `gemini_store_${user}`;
        try {
            GM_setValue(storageKey, {
                total: this.state.total,
                totalChatsCreated: this.state.totalChatsCreated,
                chats: this.state.chats,
                dailyCounts: this.state.dailyCounts
            });
        } catch (e) {
            // Counter data is the core state — silent failure means lost
            // messages that the user counted but were never persisted. Surface
            // via the debug panel so storage-quota / extension-disabled errors
            // become diagnosable.
            Logger.warn('Failed to persist counter data', { user: user.split('@')[0], error: String(e) });
        }
    },

    /** Debounced save — coalesces multiple rapid state changes into one GM_setValue */
    _debouncedSave() {
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this.saveData();
        }, 300);
    },

    /** Immediately persist any pending counter state. Safe to call from pagehide/beforeunload. */
    flushPendingSave() {
        if (!this._saveTimer) return;
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        this.saveData();
    },

    // --- Counting logic ---
    ensureTodayEntry() {
        const today = Core.getDayKey(this.resetHour);
        return ensureTodayEntry(this.state.dailyCounts, today);
    },

    getTodayMessages() {
        const today = Core.getDayKey(this.resetHour);
        return this.state.dailyCounts[today]?.messages || 0;
    },

    getTodayByModel() {
        const today = Core.getDayKey(this.resetHour);
        return this.state.dailyCounts[today]?.byModel || { flash: 0, thinking: 0, pro: 0 };
    },

    getWeightedQuota() {
        const bm = this.getTodayByModel();
        return Object.keys(bm).reduce((sum, key) => {
            const mult = this.MODEL_CONFIG[key]?.multiplier ?? 1;
            return sum + (bm[key] * mult);
        }, 0);
    },

    attemptIncrement() {
        const now = Date.now();
        if (now - this.lastCountTime < this.COOLDOWN) return;

        // Guard: while user is viewing another profile (read-only mode), cm.state
        // is loaded with that profile's data. Incrementing here would corrupt
        // that profile in memory AND, on saveData(), overwrite the *current*
        // user's storage with the foreign profile's totals. Snap the panel back
        // to the current user before recording the message.
        const currentUser = Core.getCurrentUser();
        if (Core.getInspectingUser() !== currentUser) {
            Core.setInspectingUser(currentUser);
            this.loadDataForUser(currentUser);
        }

        const today = this.ensureTodayEntry();
        this.state.total++;
        this.state.dailyCounts[today].messages++;
        const model = this.currentModel || 'flash';
        if (this.state.dailyCounts[today].byModel) {
            this.state.dailyCounts[today].byModel[model] = (this.state.dailyCounts[today].byModel[model] || 0) + 1;
        }
        this.lastCountTime = now;

        const cid = Core.getChatId();

        if (cid) {
            if (!this.state.chats[cid]) {
                this.state.totalChatsCreated++;
                this.state.dailyCounts[today].chats++;
            }
            this.state.chats[cid] = (this.state.chats[cid] || 0) + 1;
            this._debouncedSave();
            PanelUI.update();
        } else {
            this._debouncedSave();
            PanelUI.update();
            let attempts = 0;
            const capturedDay = today; // pin day bucket at send time
            if (this._cidPoller) clearInterval(this._cidPoller);
            this._cidPoller = setInterval(() => {
                attempts++;
                const newCid = Core.getChatId();
                if (newCid) {
                    clearInterval(this._cidPoller);
                    this._cidPoller = null;
                    if (!this.state.chats[newCid]) {
                        this.state.totalChatsCreated++;
                        this.ensureTodayEntry(); // ensure structure exists
                        if (this.state.dailyCounts[capturedDay]) {
                            this.state.dailyCounts[capturedDay].chats++;
                        }
                    }
                    this.state.chats[newCid] = (this.state.chats[newCid] || 0) + 1;
                    this._debouncedSave();
                    PanelUI.update();
                } else if (attempts >= 20) {
                    clearInterval(this._cidPoller);
                    this._cidPoller = null;
                    this._debouncedSave();
                }
            }, 500);
        }
    },

    // --- Model detection ---
    detectModel() {
        // adapter returns a normalized internal key, or null if undetermined
        const key = GeminiAdapter.detectModelKey();
        return key || this.currentModel;
    },

    detectAccountType() {
        return GeminiAdapter.detectAccountTier();
    },

    // --- Statistics (delegating to lib pure functions) ---
    calculateStreaks() {
        return calculateStreaks(this.state.dailyCounts, this.resetHour);
    },

    getLast7DaysData() {
        return getLast7DaysData(this.state.dailyCounts, this.resetHour);
    },

    // --- Reset logic ---
    handleReset() {
        const user = Core.getCurrentUser();
        if (Core.getInspectingUser() !== user) return;

        if (this.state.resetStep === 0) {
            this.state.resetStep = 1;
            PanelUI.update();
            return;
        }

        if (this.state.viewMode === 'today') {
            const today = Core.getDayKey(this.resetHour);
            if (this.state.dailyCounts[today]) {
                this.state.dailyCounts[today].messages = 0;
                this.state.dailyCounts[today].byModel = { flash: 0, thinking: 0, pro: 0 };
            }
        } else if (this.state.viewMode === 'chat') {
            const cid = Core.getChatId();
            if (cid) this.state.chats[cid] = 0;
        } else if (this.state.viewMode === 'total') {
            if (this.state.resetStep === 1) {
                this.state.resetStep = 2;
                PanelUI.update();
                return;
            }
            this.state.total = 0;
            this.state.chats = {};
            this.state.dailyCounts = {};
            this.state.totalChatsCreated = 0;
        }

        this.state.resetStep = 0;
        this.saveData();
        PanelUI.update();
    }
};
