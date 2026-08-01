import { archiveChatRecords, normalizeChat } from './records.js';
import { cloneValue, fail, isObject } from './contracts.js';

const ARCHIVE_STATES = new Set(['ready', 'unavailable', 'failed']);

function throwIfAborted(signal) {
    if (signal.aborted) fail('REFRESH_ABORTED', 'Search index refresh was aborted');
}

function truncate(value, limit, fallback = '') {
    return (typeof value === 'string' ? value : fallback).slice(0, limit);
}

export function withPortableMessageIds(messages, limits) {
    if (!Array.isArray(messages)) return [];
    const bounded = messages.slice(0, limits.maxMessagesPerChat);
    const explicit = new Set(bounded.flatMap(message => {
        if (!isObject(message)) return [];
        const value = message.messageId ?? message.id;
        return typeof value === 'string' && value.trim() ? [value.trim()] : [];
    }));
    return bounded.map((message, ordinal) => {
        if (!isObject(message)) return message;
        if (Object.hasOwn(message, 'messageId') || Object.hasOwn(message, 'id')) return message;
        let id = `portable-message-${ordinal + 1}`;
        while (explicit.has(id)) id = `${id}-imported`;
        explicit.add(id);
        return { ...message, id };
    });
}

function normalizeProviderChats(source, limits, report) {
    const records = archiveChatRecords(source);
    if (records.length > limits.maxChats) report.truncated = true;
    const chats = [];
    for (const [index, raw] of records.slice(0, limits.maxChats).entries()) {
        try {
            const record = isObject(raw)
                ? { ...raw, messages: withPortableMessageIds(raw.messages, limits) }
                : raw;
            if (Array.isArray(raw?.messages) && raw.messages.length > limits.maxMessagesPerChat) {
                report.truncated = true;
            }
            chats.push(normalizeChat(record, index, limits));
        } catch {
            report.rejected += 1;
        }
    }
    return chats;
}

function readVisibleChats(adapter, limits, report) {
    if (typeof adapter.scanSidebarChatLinks !== 'function') return [];
    let records;
    try {
        records = adapter.scanSidebarChatLinks();
    } catch {
        report.adapterFailed = true;
        return [];
    }
    if (!Array.isArray(records)) {
        report.adapterFailed = true;
        return [];
    }
    if (records.length > limits.maxChats) report.truncated = true;
    return records.slice(0, limits.maxChats).flatMap((record, index) => {
        try {
            return [normalizeChat({
                id: record?.id,
                title: truncate(record?.title, limits.maxTitleLength, 'Untitled'),
                source: truncate(record?.href, limits.maxMetadataLength),
                messages: []
            }, index, limits)];
        } catch {
            report.rejected += 1;
            return [];
        }
    });
}

function readCurrentChat(adapter, limits, report) {
    let id;
    try {
        id = adapter.getChatId?.();
    } catch {
        report.adapterFailed = true;
        return null;
    }
    if (typeof id !== 'string' || !id.trim()) return null;
    let title = '';
    let messages = [];
    let source = '';
    let model = '';
    try {
        title = adapter.getChatTitleText?.() || '';
        source = adapter.getCurrentHref?.() || '';
        model = adapter.detectModelKey?.() || '';
        const visible = adapter.getCurrentConversationMessages?.();
        if (visible !== undefined && !Array.isArray(visible)) report.adapterFailed = true;
        else if (Array.isArray(visible)) messages = visible;
    } catch {
        report.adapterFailed = true;
    }
    if (messages.length > limits.maxMessagesPerChat) report.truncated = true;
    try {
        return normalizeChat({
            id,
            title: truncate(title, limits.maxTitleLength),
            source: truncate(source, limits.maxMetadataLength),
            model: truncate(model, limits.maxMetadataLength),
            messages: messages.slice(0, limits.maxMessagesPerChat).map((message, ordinal) => ({
                id: truncate(message?.messageId ?? message?.id, 1_000, `m_${ordinal}`),
                role: truncate(message?.role, limits.maxRoleLength, 'unknown'),
                content: truncate(message?.content ?? message?.text, limits.maxContentLength)
            }))
        }, 0, limits);
    } catch {
        report.rejected += 1;
        return null;
    }
}

function mergeChat(existing, incoming, replaceMessages) {
    if (!existing) return incoming;
    return {
        ...existing,
        title: incoming.title || existing.title,
        tags: incoming.tags.length ? incoming.tags : existing.tags,
        annotations: incoming.annotations.length ? incoming.annotations : existing.annotations,
        messages: replaceMessages ? incoming.messages : existing.messages
    };
}

function boundedMergedChats(existing, archive, visible, current, limits, report) {
    const records = new Map(existing.map(chat => [chat.id, chat]));
    for (const chat of archive) records.set(chat.id, mergeChat(records.get(chat.id), chat, true));
    for (const chat of visible) records.set(chat.id, mergeChat(records.get(chat.id), chat, false));
    if (current) {
        if (!records.has(current.id) && records.size >= limits.maxChats) {
            records.delete([...records.keys()].at(-1));
            report.truncated = true;
        }
        records.set(current.id, mergeChat(records.get(current.id), current, true));
    }
    const output = [];
    let messageCount = 0;
    for (const chat of records.values()) {
        if (output.length >= limits.maxChats) {
            report.truncated = true;
            break;
        }
        const remaining = Math.max(0, limits.maxTotalMessages - messageCount);
        const messages = chat.messages.slice(0, remaining);
        if (messages.length !== chat.messages.length) report.truncated = true;
        output.push({ ...chat, messages });
        messageCount += messages.length;
    }
    return output;
}

function statusFor(stats, archiveState, report, reason) {
    const degraded = archiveState !== 'ready' || report.adapterFailed || report.rejected > 0 || report.truncated;
    let statusReason = null;
    if (archiveState === 'unavailable') statusReason = 'archive-provider-unavailable';
    else if (archiveState === 'failed') statusReason = 'archive-provider-failed';
    else if (report.adapterFailed) statusReason = 'gemini-source-unavailable';
    else if (report.rejected > 0) statusReason = 'source-records-rejected';
    else if (report.truncated) statusReason = 'source-truncated';
    else if (stats.documents === 0) statusReason = 'archive-empty';
    return Object.freeze({
        state: stats.documents === 0 ? 'empty' : (degraded ? 'degraded' : 'ready'),
        reason: statusReason,
        refreshReason: reason,
        archive: archiveState,
        truncated: report.truncated,
        rejected: report.rejected,
        ...stats
    });
}

/** Observe only the mounted Gemini DOM and route events; no navigation or background crawl. */
export function observeGeminiSearchChanges({ document, onDomChange, onRouteChange }) {
    const windowRef = document?.defaultView || null;
    const Observer = windowRef?.MutationObserver || globalThis.MutationObserver;
    const observer = typeof Observer === 'function' && document?.body
        ? new Observer(() => onDomChange())
        : null;
    observer?.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['href', 'aria-label']
    });
    windowRef?.addEventListener?.('popstate', onRouteChange);
    windowRef?.addEventListener?.('hashchange', onRouteChange);
    return () => {
        observer?.disconnect();
        windowRef?.removeEventListener?.('popstate', onRouteChange);
        windowRef?.removeEventListener?.('hashchange', onRouteChange);
    };
}

/** Bounded, account-partitioned production source bridge for Search & Navigator. */
export class SearchIndexSynchronizer {
    constructor({
        navigator,
        adapter,
        archiveProvider = null,
        document = null,
        observeChanges = observeGeminiSearchChanges,
        schedule = globalThis.setTimeout,
        cancelSchedule = globalThis.clearTimeout,
        refreshDelay = 120,
        onStatus = () => {},
        logger = null
    } = {}) {
        if (!navigator || typeof navigator.captureArchiveSnapshot !== 'function' ||
            typeof navigator.rebuild !== 'function' || typeof navigator.changeSession !== 'function') {
            throw new TypeError('Search synchronizer requires a SearchNavigator');
        }
        if (!adapter || typeof adapter !== 'object') throw new TypeError('Search synchronizer requires a Gemini adapter');
        if (archiveProvider !== null && typeof archiveProvider?.readChats !== 'function') {
            throw new TypeError('Search archive provider must implement readChats()');
        }
        if (typeof observeChanges !== 'function' || typeof schedule !== 'function' ||
            typeof cancelSchedule !== 'function' || typeof onStatus !== 'function') {
            throw new TypeError('Search synchronizer lifecycle ports must be functions');
        }
        if (!Number.isSafeInteger(refreshDelay) || refreshDelay < 0) {
            throw new TypeError('Search refresh delay must be a non-negative safe integer');
        }
        this.navigator = navigator;
        this.adapter = adapter;
        this.archiveProvider = archiveProvider;
        this.document = document;
        this.observeChanges = observeChanges;
        this.schedule = schedule;
        this.cancelSchedule = cancelSchedule;
        this.refreshDelay = refreshDelay;
        this.onStatus = onStatus;
        this.logger = logger;
        this.scope = null;
        this.started = false;
        this.timer = null;
        this.unobserve = null;
        this.controller = null;
        this.pending = null;
        this.drain = null;
        this.archiveState = archiveProvider ? 'ready' : 'unavailable';
        this.status = statusFor(navigator.getStats(), this.archiveState, {
            adapterFailed: false, rejected: 0, truncated: false
        }, 'idle');
    }

    async start(scope = null) {
        if (this.started) return false;
        this.started = true;
        this.scope = cloneValue(scope);
        try {
            this.unobserve = this.observeChanges({
                document: this.document,
                onDomChange: () => this.notifyDOMChange(),
                onRouteChange: () => this.notifyRouteChange()
            }) || null;
            await this.refresh('initial', { full: true });
            return true;
        } catch (error) {
            this.stop();
            throw error;
        }
    }

    stop() {
        if (!this.started) return false;
        this.started = false;
        if (this.timer !== null) this.cancelSchedule(this.timer);
        this.timer = null;
        this.pending = null;
        this.controller?.abort();
        this.controller = null;
        this.unobserve?.();
        this.unobserve = null;
        return true;
    }

    async changeSession(scope) {
        if (!this.started) fail('SYNC_NOT_STARTED', 'Search synchronizer is not started');
        if (this.timer !== null) this.cancelSchedule(this.timer);
        this.timer = null;
        this.scope = cloneValue(scope);
        this.navigator.changeSession(scope);
        return this.refresh('session', { full: true });
    }

    notifyDOMChange() { return this._schedule('dom'); }
    notifyRouteChange() { return this._schedule('route'); }

    _schedule(reason) {
        if (!this.started) return false;
        if (this.timer !== null) this.cancelSchedule(this.timer);
        this.timer = this.schedule(() => {
            this.timer = null;
            this.refresh(reason).catch(error => this.logger?.warn?.('Search index refresh failed', {
                reason,
                error: String(error)
            }));
        }, this.refreshDelay);
        return true;
    }

    refresh(reason = 'manual', { full = false } = {}) {
        if (!this.started) return Promise.reject(new Error('Search synchronizer is not started'));
        this.pending = { reason: String(reason), full: Boolean(full) || Boolean(this.pending?.full) };
        if (!this.drain) this.drain = this._drain();
        return this.drain;
    }

    async _drain() {
        let result = this.status;
        try {
            while (this.started && this.pending) {
                const request = this.pending;
                this.pending = null;
                result = await this._refreshOnce(request);
            }
            return result;
        } finally {
            this.drain = null;
        }
    }

    async _refreshOnce({ reason, full }) {
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const { signal } = controller;
        const report = { adapterFailed: false, rejected: 0, truncated: false };
        const existing = this.navigator.getArchiveChats();
        let archive = [];
        if (full && this.archiveProvider) {
            try {
                const source = await this.archiveProvider.readChats(Object.freeze({
                    session: cloneValue(this.scope),
                    signal,
                    limits: this.navigator.limits
                }));
                throwIfAborted(signal);
                archive = normalizeProviderChats(source, this.navigator.limits, report);
                this.archiveState = 'ready';
            } catch (error) {
                if (signal.aborted) throw error;
                this.archiveState = 'failed';
                this.logger?.warn?.('Search archive provider is unavailable', { error: String(error) });
            }
        }
        if (!ARCHIVE_STATES.has(this.archiveState)) this.archiveState = 'failed';
        const visible = readVisibleChats(this.adapter, this.navigator.limits, report);
        const current = readCurrentChat(this.adapter, this.navigator.limits, report);
        const merged = boundedMergedChats(
            existing, archive, visible, current, this.navigator.limits, report
        );
        throwIfAborted(signal);
        if (JSON.stringify(existing) !== JSON.stringify(merged)) this.navigator.rebuild(merged);
        const next = statusFor(this.navigator.getStats(), this.archiveState, report, reason);
        this.status = next;
        this.onStatus(next);
        return cloneValue(next);
    }
}

export const liveIndexSyncInternals = Object.freeze({
    boundedMergedChats,
    normalizeProviderChats,
    readCurrentChat,
    readVisibleChats,
    statusFor,
    withPortableMessageIds
});
