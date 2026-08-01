import { fail } from './errors.js';
import { safeClone } from './model.js';
import { createSmartRulePreview, smartRulePreviewFingerprint } from './smart_rules.js';

function archiveRecords(source) {
    if (Array.isArray(source)) return source;
    if (!source || typeof source !== 'object') {
        fail('INVALID_ARCHIVE_CHAT_SOURCE', 'Local archive provider must return chats or an archive object');
    }
    if (Array.isArray(source.chats)) return source.chats;
    if (source.payload && typeof source.payload === 'object' && Array.isArray(source.payload.chats)) {
        return source.payload.chats;
    }
    fail('INVALID_ARCHIVE_CHAT_SOURCE', 'Local archive provider did not return a chats array');
}

function assertService(service) {
    for (const method of ['getSnapshot', 'setManualMemberships']) {
        if (!service || typeof service[method] !== 'function') {
            throw new TypeError(`Smart rule service must implement ${method}()`);
        }
    }
    return service;
}

export class RulePreviewSession {
    constructor({ service, archiveProvider = null, confirm = () => false, limits } = {}) {
        this.service = assertService(service);
        if (archiveProvider !== null && typeof archiveProvider?.readChats !== 'function') {
            throw new TypeError('Smart rule archive provider must implement readChats()');
        }
        if (typeof confirm !== 'function') throw new TypeError('Smart rule confirmation must be a function');
        this.archiveProvider = archiveProvider;
        this.confirm = confirm;
        this.limits = limits;
        this.previewValue = null;
        this.fingerprint = null;
        this.suppressesObserver = false;
    }

    getPreview() {
        return this.previewValue ? safeClone(this.previewValue) : null;
    }

    clear() {
        const existed = this.previewValue !== null;
        this.previewValue = null;
        this.fingerprint = null;
        return existed;
    }

    async preview(snapshot, visibleChats) {
        const source = await this._readSources(snapshot.sessionId, visibleChats);
        const preview = createSmartRulePreview(snapshot, source.records, {
            sessionId: snapshot.sessionId,
            limits: this.limits,
            archiveState: source.archiveState
        });
        this.previewValue = preview;
        this.fingerprint = smartRulePreviewFingerprint(preview);
        return this.getPreview();
    }

    async apply(visibleChats) {
        if (!this.previewValue) fail('RULE_PREVIEW_REQUIRED', 'Preview smart rules before applying local memberships');
        this.suppressesObserver = true;
        try {
            const snapshot = await this.service.getSnapshot();
            const source = await this._readSources(snapshot.sessionId, visibleChats);
            const current = createSmartRulePreview(snapshot, source.records, {
                sessionId: snapshot.sessionId,
                limits: this.limits,
                archiveState: source.archiveState
            });
            if (smartRulePreviewFingerprint(current) !== this.fingerprint) {
                fail('RULE_PREVIEW_STALE', 'Smart rule sources changed; review a fresh preview before applying');
            }
            if (!current.changes.length) {
                return { applied: 0, matched: current.matchCount, cancelled: false };
            }
            const accepted = await this.confirm(
                `Apply ${current.changeCount} reviewed local collection change${current.changeCount === 1 ? '' : 's'}? ` +
                'This updates Primer++ memberships only and never changes Gemini chats or Notebooks.'
            );
            if (!accepted) return { applied: 0, matched: current.matchCount, cancelled: true };
            await this.service.setManualMemberships(current.changes);
            return { applied: current.changeCount, matched: current.matchCount, cancelled: false };
        } finally {
            this.suppressesObserver = false;
            this.clear();
        }
    }

    async _readSources(sessionId, visibleChats) {
        if (!Array.isArray(visibleChats)) fail('INVALID_RULE_SOURCE', 'Visible rule candidates must be an array');
        if (!this.archiveProvider) {
            return { records: { visible: visibleChats, archive: [] }, archiveState: 'unavailable' };
        }
        let source;
        try {
            source = await this.archiveProvider.readChats(Object.freeze({
                sessionId,
                purpose: 'collections-rule-preview'
            }));
        } catch (error) {
            fail('ARCHIVE_SOURCE_UNAVAILABLE', 'Unable to read the local chat archive for rule preview', {}, error);
        }
        return {
            records: { visible: visibleChats, archive: archiveRecords(source) },
            archiveState: 'ready'
        };
    }
}

export function createRulePreviewSession(options) {
    return new RulePreviewSession(options);
}
