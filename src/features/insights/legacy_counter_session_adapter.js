import {
    INSIGHTS_EVENT_KIND,
    INSIGHTS_SEMANTICS,
    NATIVE_USAGE_LIMITS_LINK,
    InsightsLimitError,
    createInsightsState,
    migrateLegacyCounterState
} from './index.js';
import {
    clone,
    legacyCounterStorageKey,
    nonNegativeInteger,
    normalizeChats,
    normalizeDailyCounts
} from './legacy_counter_state.js';
import {
    commitLegacyCounterEvents,
    hydrateLegacyCounterRecord,
    persistLegacyCounterRecord
} from './legacy_counter_repository.js';

export const legacyCounterSessionAdapter = Object.freeze({
    async _loadRecord(identity, { force = false, rawOverride } = {}) {
        if (!force && this._records.has(identity)) return this._records.get(identity);
        const key = legacyCounterStorageKey(identity);
        const raw = rawOverride !== undefined
            ? rawOverride
            : (key ? await this._deps.storage.get(key, null) : null);
        const record = hydrateLegacyCounterRecord({
            identity,
            raw,
            todayKey: this._todayKey(),
            maxEvents: this._deps.maxEvents,
            logger: this._deps.logger
        });
        this._records.set(identity, record);
        return record;
    },

    async loadDataForUser(targetUser) {
        if (!targetUser) return false;
        const active = this._deps.core.getCurrentUser() || this._activeIdentity || this._deps.tempUser;
        await this._ensureController(this._activeIdentity || active);
        if (active !== this._activeIdentity) {
            this._clearCidPoller();
            await this._controller.switchSession(active);
            this._activeIdentity = active;
            await this._loadRecord(active, { force: true });
        }
        const target = String(targetUser);
        await this._loadRecord(target, { force: target !== active });
        this._displayIdentity = target;
        this._syncPublicState();
        this._startStorageSubscription(target);
        this._emitChange(target === active ? 'session' : 'inspection');
        return true;
    },

    _startStorageSubscription(identity) {
        this._stopStorageSubscription();
        const release = this._deps.subscribeUserData(identity, raw => {
            Promise.resolve(this._replaceExternalRecord(identity, raw)).catch(error => {
                this._deps.logger?.warn?.('Counter external update rejected', { code: error?.code || error?.name });
            });
        });
        this._storageUnsubscribe = typeof release === 'function' ? release : null;
    },

    _stopStorageSubscription() {
        this._storageUnsubscribe?.();
        this._storageUnsubscribe = null;
    },

    async _replaceExternalRecord(identity, raw) {
        if (identity === this._activeIdentity && this._controller?.getPending().length) {
            await this._controller.flushPending();
        }
        await this._loadRecord(identity, { force: true, rawOverride: raw });
        if (identity === this._displayIdentity) {
            this._syncPublicState();
            this._emitChange('external');
        }
    },

    _syncPublicState() {
        const record = this._records.get(this._displayIdentity);
        if (!record) return;
        const ui = {
            viewMode: this.state.viewMode,
            isExpanded: this.state.isExpanded,
            resetStep: this.state.resetStep
        };
        Object.assign(this.state, clone(record.compatibility), ui, {
            usageSemantics: INSIGHTS_SEMANTICS,
            nativeUsageLimits: NATIVE_USAGE_LIMITS_LINK
        });
    },

    _publicSnapshot() {
        return {
            total: nonNegativeInteger(this.state.total),
            totalChatsCreated: nonNegativeInteger(this.state.totalChatsCreated),
            chats: normalizeChats(this.state.chats),
            dailyCounts: normalizeDailyCounts(this.state.dailyCounts)
        };
    },

    async _commitEvents({ sessionIdentity, events }) {
        return commitLegacyCounterEvents({
            record: this._records.get(sessionIdentity),
            events,
            maxEvents: this._deps.maxEvents,
            persist: candidate => this._persistRecord(candidate)
        });
    },

    async _persistRecord(record) {
        return persistLegacyCounterRecord({
            record,
            storage: this._deps.storage,
            tempUser: this._deps.tempUser
        });
    },

    async saveData() {
        if (!this._controller || this._displayIdentity !== this._activeIdentity) return false;
        const publicSnapshot = this._publicSnapshot();
        const record = this._records.get(this._activeIdentity);
        if (record.blockedError) throw record.blockedError;
        await this._controller.flushPending();
        const preserved = record.insights.events.filter(event =>
            event.kind === INSIGHTS_EVENT_KIND.MODEL || event.kind === INSIGHTS_EVENT_KIND.TOOL
        );
        const rebuilt = migrateLegacyCounterState(publicSnapshot, {
            todayKey: this._todayKey(),
            sessionIdentity: this._activeIdentity,
            maxEvents: this._deps.maxEvents,
            includeLifetimeRemainders: false
        });
        record.insights = createInsightsState([...rebuilt.events, ...preserved], { maxEvents: this._deps.maxEvents });
        record.compatibility = publicSnapshot;
        await this._persistRecord(record);
        this._syncPublicState();
        this._emitChange('save');
        return true;
    },

    _debouncedSave() {
        if (this._saveTimer) return;
        this._saveTimer = this._deps.timers.setTimeout(() => {
            this._saveTimer = null;
            Promise.resolve(this.saveData()).catch(error => {
                this._deps.logger?.warn?.('Failed to persist Counter Insights', { code: error?.code || error?.name });
            });
        }, 300);
    },

    flushPendingSave() {
        if (this._saveTimer) {
            this._deps.timers.clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        if (!this._controller) return Promise.resolve(false);
        return this._displayIdentity === this._activeIdentity
            ? this.saveData()
            : this._controller.flushPending();
    },

    _activeRecord() {
        return this._records.get(this._activeIdentity) || null;
    },

    _captureActiveEvent(kind, details = {}) {
        const record = this._activeRecord();
        const pending = this._controller?.getPending() || [];
        if (!record || !this._controller) throw new Error('Counter Insights is not started');
        if (record.insights.events.length + pending.length >= this._deps.maxEvents) {
            throw new InsightsLimitError(this._deps.maxEvents);
        }
        return this._controller.capture(kind, details);
    },

    _emitChange(reason) {
        const event = Object.freeze({ reason, state: clone(this.state) });
        try { this._deps.onChange?.(event); } catch { /* UI callbacks are isolated */ }
        for (const listener of [...this._listeners]) {
            try { listener(event); } catch { /* observers are isolated */ }
        }
    },

    getInsightsSnapshot() {
        const record = this._records.get(this._displayIdentity);
        return record ? clone(record.insights) : createInsightsState([], { maxEvents: this._deps.maxEvents });
    },

    isInspection() {
        return this._displayIdentity !== this._activeIdentity;
    }
});
