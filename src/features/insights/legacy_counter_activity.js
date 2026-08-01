import { INSIGHTS_EVENT_KIND } from './event_model.js';
import { DEFAULT_MODEL_COUNTS } from './legacy_counter_state.js';

export const legacyCounterActivity = Object.freeze({
    attemptIncrement() {
        const currentUser = this._deps.core.getCurrentUser();
        if (!currentUser || !this._controller) return false;
        if (this._deps.core.getInspectingUser() !== currentUser) return false;
        if (currentUser !== this._activeIdentity) {
            void this.loadDataForUser(currentUser);
            return false;
        }
        const now = this._deps.now();
        if (now - this.lastCountTime < this.COOLDOWN) return false;
        const occurredAt = new Date(now).toISOString();
        this._captureActiveEvent(INSIGHTS_EVENT_KIND.MESSAGE, {
            model: this.currentModel,
            occurredAt
        });
        const record = this._activeRecord();
        record.compatibility.total += 1;
        const today = this._todayKey();
        if (!record.compatibility.dailyCounts[today]) {
            record.compatibility.dailyCounts[today] = {
                messages: 0,
                chats: 0,
                byModel: { ...DEFAULT_MODEL_COUNTS }
            };
        }
        const todayEntry = record.compatibility.dailyCounts[today];
        todayEntry.messages += 1;
        todayEntry.byModel[this.currentModel] = (todayEntry.byModel[this.currentModel] || 0) + 1;
        this.lastCountTime = now;

        const chatId = this._deps.core.getChatId();
        if (chatId) this._recordResolvedChat(record, chatId, occurredAt);
        else this._pollForChat(this._activeIdentity, occurredAt);
        this._syncPublicState();
        this._emitChange('message');
        this._debouncedSave();
        return true;
    },

    _recordResolvedChat(record, chatId, occurredAt) {
        const created = !record.compatibility.chats[chatId];
        record.compatibility.chats[chatId] = (record.compatibility.chats[chatId] || 0) + 1;
        if (!created) return false;
        this._captureActiveEvent(INSIGHTS_EVENT_KIND.CHAT, { occurredAt });
        record.compatibility.totalChatsCreated += 1;
        const dayKey = this._resolveDayKey()(occurredAt);
        if (!record.compatibility.dailyCounts[dayKey]) {
            record.compatibility.dailyCounts[dayKey] = {
                messages: 0,
                chats: 0,
                byModel: { ...DEFAULT_MODEL_COUNTS }
            };
        }
        record.compatibility.dailyCounts[dayKey].chats += 1;
        return true;
    },

    _pollForChat(identity, occurredAt) {
        this._clearCidPoller();
        let attempts = 0;
        this._cidPoller = this._deps.timers.setInterval(() => {
            attempts += 1;
            if (identity !== this._activeIdentity) {
                this._clearCidPoller();
                return;
            }
            const chatId = this._deps.core.getChatId();
            if (chatId) {
                this._recordResolvedChat(this._activeRecord(), chatId, occurredAt);
                this._clearCidPoller();
                this._syncPublicState();
                this._emitChange('chat');
                this._debouncedSave();
            } else if (attempts >= 20) {
                this._clearCidPoller();
                this._debouncedSave();
            }
        }, 500);
    },

    _clearCidPoller() {
        if (!this._cidPoller) return;
        this._deps.timers.clearInterval(this._cidPoller);
        this._cidPoller = null;
    },

    recordToolUse(tool, details = {}) {
        if (this.isInspection()) return false;
        this._captureActiveEvent(INSIGHTS_EVENT_KIND.TOOL, { ...details, tool });
        this._emitChange('tool');
        this._debouncedSave();
        return true;
    }
});
