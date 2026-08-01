import {
    INSIGHTS_SEMANTICS,
    NATIVE_USAGE_LIMITS_LINK,
    calculateInsightsStreak,
    createEstimatedUsageView,
    createInsightsState,
    getInsightsDailySeries
} from './index.js';
import { DEFAULT_MODEL_COUNTS } from './legacy_counter_state.js';

export const legacyCounterMetrics = Object.freeze({
    ensureTodayEntry() {
        const today = this._todayKey();
        if (this.isInspection()) return today;
        if (!this.state.dailyCounts[today]) {
            this.state.dailyCounts[today] = { messages: 0, chats: 0, byModel: { ...DEFAULT_MODEL_COUNTS } };
        }
        if (!this.state.dailyCounts[today].byModel) {
            this.state.dailyCounts[today].byModel = { ...DEFAULT_MODEL_COUNTS };
        }
        return today;
    },

    getTodayMessages() {
        return this.state.dailyCounts[this._todayKey()]?.messages || 0;
    },

    getTodayByModel() {
        return this.state.dailyCounts[this._todayKey()]?.byModel || { ...DEFAULT_MODEL_COUNTS };
    },

    getWeightedQuota() {
        const byModel = this.getTodayByModel();
        return Object.keys(byModel).reduce((sum, key) =>
            sum + (byModel[key] * (this.MODEL_CONFIG[key]?.multiplier ?? 1)), 0);
    },

    getQuotaWindowState(now = new Date(this._deps.now())) {
        const reference = new Date(now);
        const hour = reference.getHours();
        const reset = this.resetHour;
        const windowStart = new Date(reference.getTime());
        windowStart.setHours(reset, 0, 0, 0);
        if (hour < reset) windowStart.setDate(windowStart.getDate() - 1);
        const windowEnd = new Date(windowStart.getTime());
        windowEnd.setDate(windowEnd.getDate() + 1);
        const remainingMs = Math.max(0, windowEnd.getTime() - reference.getTime());
        const hours = Math.floor(remainingMs / 3_600_000);
        const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);
        return {
            dayKey: this._todayKey(),
            resetHour: reset,
            windowLabel: 'Local estimate · Usage Limits ↗',
            remainingMs,
            remainingLabel: `${hours}h ${minutes}m`,
            semantics: INSIGHTS_SEMANTICS,
            nativeUsageLimits: { ...NATIVE_USAGE_LIMITS_LINK, entry: '/usage' }
        };
    },

    getQuotaDisplayState(now) {
        return createEstimatedUsageView({
            messages: this.getTodayMessages(),
            weighted: this.getWeightedQuota(),
            localTarget: this.quotaLimit,
            window: this.getQuotaWindowState(now)
        });
    },

    detectModel() {
        return this._deps.adapter.detectModelKey() || this.currentModel;
    },

    detectAccountType() {
        return this._deps.adapter.detectAccountTier();
    },

    _displayInsightsForAnalytics() {
        const record = this._records.get(this._displayIdentity);
        if (!record) return createInsightsState([], { maxEvents: this._deps.maxEvents });
        if (this._displayIdentity !== this._activeIdentity || !this._controller) return record.insights;
        return createInsightsState(
            [...record.insights.events, ...this._controller.getPending()],
            { maxEvents: this._deps.maxEvents }
        );
    },

    calculateStreaks() {
        const result = calculateInsightsStreak(this._displayInsightsForAnalytics(), {
            todayKey: this._todayKey(),
            maxEvents: this._deps.maxEvents
        });
        return { current: result.current, best: result.best };
    },

    getLast7DaysData() {
        return getInsightsDailySeries(this._displayInsightsForAnalytics(), {
            todayKey: this._todayKey(),
            days: 7,
            maxEvents: this._deps.maxEvents
        }).map(item => ({ ...item }));
    },

    handleReset() {
        if (this.isInspection()) return false;
        if (this.state.resetStep === 0) {
            this.state.resetStep = 1;
            this._emitChange('reset-confirm');
            return true;
        }
        if (this.state.viewMode === 'today') {
            const today = this._todayKey();
            if (this.state.dailyCounts[today]) {
                this.state.dailyCounts[today].messages = 0;
                this.state.dailyCounts[today].byModel = { ...DEFAULT_MODEL_COUNTS };
            }
        } else if (this.state.viewMode === 'chat') {
            const chatId = this._deps.core.getChatId();
            if (chatId) this.state.chats[chatId] = 0;
        } else if (this.state.viewMode === 'total') {
            if (this.state.resetStep === 1) {
                this.state.resetStep = 2;
                this._emitChange('reset-confirm-total');
                return true;
            }
            this.state.total = 0;
            this.state.chats = {};
            this.state.dailyCounts = {};
            this.state.totalChatsCreated = 0;
        }
        this.state.resetStep = 0;
        void this.saveData();
        this._emitChange('reset');
        return true;
    }
});
