import { GLOBAL_KEYS } from '../../constants.js';
import {
    captureSessionIdentity,
    createDayKeyResolver,
    createInsightsSessionController
} from './index.js';
import { nextInsightsSequence } from './legacy_counter_state.js';

export const legacyCounterLifecycle = Object.freeze({
    async init(context = {}) {
        if (this._started) return this;
        this._started = true;
        try {
            const resetHour = await this._deps.storage.get(GLOBAL_KEYS.RESET_HOUR, 0);
            const quotaLimit = await this._deps.storage.get(GLOBAL_KEYS.QUOTA, 50);
            this.resetHour = Number.isInteger(resetHour) && resetHour >= 0 && resetHour <= 23 ? resetHour : 0;
            this.quotaLimit = typeof quotaLimit === 'number' && Number.isFinite(quotaLimit) && quotaLimit >= 0
                ? quotaLimit
                : 50;
            const active = this._deps.core.getCurrentUser() || context.session || this._deps.tempUser;
            await this._ensureController(active);
            await this.loadDataForUser(this._deps.core.getInspectingUser() || active);
            this.bindEvents();
            this._deps.logger?.info?.('Counter Insights started');
            return this;
        } catch (error) {
            this._started = false;
            this._unbindEvents();
            this._controller = null;
            throw error;
        }
    },

    async destroy() {
        if (!this._started) return;
        this._started = false;
        this._unbindEvents();
        this._clearCidPoller();
        if (this._saveTimer) {
            this._deps.timers.clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        try {
            await this._controller?.flushPending();
        } finally {
            this._stopStorageSubscription();
            this._controller = null;
        }
        this._deps.logger?.info?.('Counter Insights stopped');
    },

    onUserChange(user) {
        return this.loadDataForUser(user);
    },

    bindEvents() {
        if (this._boundKeyHandler || this._boundClickHandler || !this._deps.document) return;
        this._boundKeyHandler = event => {
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.originalEvent?.isComposing) return;
            if (this._deps.adapter.isInsideInputEditor(this._deps.document.activeElement)) {
                this._deps.timers.setTimeout(() => this.attemptIncrement(), 50);
            }
        };
        this._boundClickHandler = event => {
            if (this._deps.adapter.getClosestSendButton(event.target)) this.attemptIncrement();
        };
        this._deps.document.addEventListener('keydown', this._boundKeyHandler, true);
        this._deps.document.addEventListener('click', this._boundClickHandler, true);
    },

    _unbindEvents() {
        if (this._boundKeyHandler && this._deps.document) {
            this._deps.document.removeEventListener('keydown', this._boundKeyHandler, true);
        }
        if (this._boundClickHandler && this._deps.document) {
            this._deps.document.removeEventListener('click', this._boundClickHandler, true);
        }
        this._boundKeyHandler = null;
        this._boundClickHandler = null;
    },

    _todayKey() {
        return this._deps.core.getDayKey(this.resetHour);
    },

    _resolveDayKey() {
        if (this._deps.resolveDayKey) return this._deps.resolveDayKey;
        const offset = -new Date(this._deps.now()).getTimezoneOffset();
        return createDayKeyResolver({ resetHour: this.resetHour, utcOffsetMinutes: offset });
    },

    async _ensureController(identity) {
        const captured = captureSessionIdentity(identity);
        const record = await this._loadRecord(captured.sessionIdentity);
        this._activeIdentity = captured.sessionIdentity;
        if (!this._controller) {
            this._controller = createInsightsSessionController({
                sessionIdentity: captured.sessionIdentity,
                flush: request => this._commitEvents(request),
                clock: () => new Date(this._deps.now()),
                resolveDayKey: this._resolveDayKey(),
                maxPendingEvents: this._deps.maxEvents,
                initialSequence: nextInsightsSequence(record.insights)
            });
        }
        return record;
    }
});
