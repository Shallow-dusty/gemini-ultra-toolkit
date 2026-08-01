import {
    cloneValue,
    fail,
    isObject,
    normalizeSessionKey,
    resolveLimits,
    SEARCH_NAVIGATOR_CAPABILITY,
    SEARCH_NAVIGATOR_MODULE_ID
} from './contracts.js';
import { normalizeArchiveImport } from './archive_import.js';
import { SearchDocumentIndex } from './document_index.js';
import { createSearchResult } from './locator.js';
import { buildSnippet, compareResults, scoreDocument } from './ranking.js';
import { normalizeChat, normalizeId, normalizeMessage } from './records.js';
import { normalizeSearchRequest, passesFilters } from './query.js';

/** Session-aware facade over the isolated index, query, ranking and locator domains. */
export class SearchNavigator {
    constructor({ session = null, limits = {} } = {}) {
        this.limits = resolveLimits(limits);
        this._sessionKey = normalizeSessionKey(session);
        this._index = new SearchDocumentIndex(this.limits);
        this._disposed = false;
    }

    changeSession(session) {
        this._assertActive();
        this._sessionKey = normalizeSessionKey(session);
        return this.getStats();
    }

    upsertChat(record) {
        this._assertActive();
        const chat = normalizeChat(record, 0, this.limits);
        this._index.upsertChat(this._sessionKey, chat);
        return { chatId: chat.id, messageCount: chat.messages.length };
    }

    upsertMessage(chatId, record) {
        this._assertActive();
        const id = normalizeId(chatId, 'chatId');
        const message = normalizeMessage(record, 'chat', 0, this.limits);
        const ordinal = this._index.upsertMessage(this._sessionKey, id, message);
        return { chatId: id, messageId: message.id, ordinal };
    }

    removeChat(chatId) {
        this._assertActive();
        return this._index.removeChat(this._sessionKey, normalizeId(chatId, 'chatId'));
    }

    removeMessage(chatId, messageId) {
        this._assertActive();
        return this._index.removeMessage(
            this._sessionKey,
            normalizeId(chatId, 'chatId'),
            normalizeId(messageId, 'messageId')
        );
    }

    rebuild(records) {
        this._assertActive();
        if (!Array.isArray(records)) fail('INVALID_RECORD', 'Rebuild input must be an array');
        const chats = records.map((record, index) => normalizeChat(record, index, this.limits));
        return this._index.rebuild(this._sessionKey, chats);
    }

    importArchiveChats(source, options) {
        this._assertActive();
        const archive = normalizeArchiveImport(source, options, this.limits);
        const stats = archive.mode === 'replace'
            ? this._index.rebuild(this._sessionKey, archive.chats)
            : this._index.merge(this._sessionKey, archive.chats);
        return { mode: archive.mode, imported: archive.chats.length, stats };
    }

    search(query, options) {
        this._assertActive();
        const request = normalizeSearchRequest(query, options, this.limits);
        if (request.tokens.length === 0) {
            return { query: request.query, tokens: [], total: 0, items: [] };
        }

        const candidates = [];
        for (const compiled of this._index.compiledChats(this._sessionKey)) {
            for (const document of compiled.documents) {
                if (!passesFilters(document, compiled.chat, request.options)) continue;
                const scored = scoreDocument(
                    document,
                    request.query,
                    request.tokens,
                    request.options.fields,
                    request.options.match
                );
                if (!scored) continue;
                candidates.push({
                    document,
                    result: createSearchResult(document, scored, null),
                    scored
                });
            }
        }
        candidates.sort((left, right) => compareResults(left.result, right.result));
        const page = candidates.slice(
            request.options.offset,
            request.options.offset + request.options.limit
        );
        const items = page.map(candidate => createSearchResult(
            candidate.document,
            candidate.scored,
            buildSnippet(
                candidate.document,
                candidate.scored.matchedFields,
                request.query,
                request.tokens,
                request.options.snippetLength
            )
        ));
        return cloneValue({
            query: request.query,
            tokens: request.tokens,
            total: candidates.length,
            items
        });
    }

    getStats() {
        this._assertActive();
        return this._index.getStats(this._sessionKey);
    }

    getArchiveChats() {
        this._assertActive();
        return this._index.snapshotChats(this._sessionKey).chats;
    }

    captureArchiveSnapshot() {
        this._assertActive();
        const snapshot = this._index.snapshotChats(this._sessionKey);
        return cloneValue({
            sessionKey: this._sessionKey,
            revision: snapshot.revision,
            chats: snapshot.chats
        });
    }

    restoreArchiveSnapshot(snapshot) {
        this._assertActive();
        if (!isObject(snapshot) ||
            (snapshot.sessionKey !== 'guest' &&
                (typeof snapshot.sessionKey !== 'string' || !snapshot.sessionKey.startsWith('account:') ||
                    snapshot.sessionKey.length === 'account:'.length)) ||
            !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 ||
            !Array.isArray(snapshot.chats)) {
            fail('INVALID_SNAPSHOT', 'Archive snapshot is malformed');
        }
        const chats = snapshot.chats.map((record, index) => normalizeChat(record, index, this.limits));
        return this._index.restore(snapshot.sessionKey, chats, snapshot.revision);
    }

    clearSession() {
        this._assertActive();
        return this._index.clear(this._sessionKey);
    }

    dispose() {
        if (this._disposed) return;
        this._index.dispose();
        this._disposed = true;
    }

    _assertActive() {
        if (this._disposed) fail('DISPOSED', 'Search navigator has been disposed');
    }
}

/** ModuleHost descriptor exposing the isolated domain service exactly once. */
export function createSearchNavigatorModule(options = {}) {
    if (!isObject(options)) fail('INVALID_OPTIONS', 'Module options must be an object');
    const limits = options.limits || {};
    const id = options.id || SEARCH_NAVIGATOR_MODULE_ID;
    return {
        id,
        defaultEnabled: options.defaultEnabled ?? true,
        provides: [SEARCH_NAVIGATOR_CAPABILITY],
        create(context) {
            const navigator = new SearchNavigator({ session: context.session, limits });
            context.provideCapability(SEARCH_NAVIGATOR_CAPABILITY, navigator);
            return {
                onSessionChange(nextSession) {
                    navigator.changeSession(nextSession);
                },
                stop() {
                    navigator.dispose();
                }
            };
        }
    };
}
