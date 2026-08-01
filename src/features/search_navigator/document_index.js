import { cloneValue, fail } from './contracts.js';
import { compileFields } from './text.js';

/** Compile one normalized chat into immutable searchable document records. */
export function compileChat(chat) {
    const snapshot = freezeChat(chat);
    const documents = [{
        kind: 'chat',
        chatId: snapshot.id,
        messageId: null,
        ordinal: null,
        role: null,
        metadata: snapshot.metadata,
        fields: compileFields({
            title: snapshot.title,
            tags: snapshot.tags.join(' • '),
            annotation: snapshot.annotations.join('\n')
        })
    }];
    snapshot.messages.forEach((message, ordinal) => {
        const metadata = Object.freeze({
            timestamp: message.metadata.timestamp ?? snapshot.metadata.timestamp,
            model: message.metadata.model || snapshot.metadata.model,
            source: message.metadata.source || snapshot.metadata.source
        });
        documents.push({
            kind: 'message',
            chatId: snapshot.id,
            messageId: message.id,
            ordinal,
            role: message.role,
            metadata,
            fields: compileFields({
                content: message.content,
                annotation: message.annotations.join('\n')
            })
        });
    });
    return Object.freeze({
        chat: snapshot,
        documents: Object.freeze(documents.map(document => Object.freeze(document)))
    });
}

function freezeChat(chat) {
    const messages = chat.messages.map(message => Object.freeze({
        ...message,
        metadata: Object.freeze({ ...message.metadata }),
        annotations: Object.freeze(message.annotations.slice())
    }));
    return Object.freeze({
        ...chat,
        metadata: Object.freeze({ ...chat.metadata }),
        tags: Object.freeze(chat.tags.slice()),
        annotations: Object.freeze(chat.annotations.slice()),
        messages: Object.freeze(messages)
    });
}

/** Session-partitioned mutable index; callers provide already-normalized records. */
export class SearchDocumentIndex {
    constructor(limits) {
        this.limits = limits;
        this.sessions = new Map();
    }

    getStats(sessionKey) {
        const state = this._state(sessionKey, false);
        const chats = state?.chats.size || 0;
        const messages = state?.messageCount || 0;
        return { chats, messages, documents: chats + messages };
    }

    getRevision(sessionKey) {
        return this._state(sessionKey, false)?.revision || 0;
    }

    snapshotChats(sessionKey) {
        const state = this._state(sessionKey, false);
        return {
            revision: state?.revision || 0,
            chats: [...(state?.chats.values() || [])].map(compiled => cloneValue(compiled.chat))
        };
    }

    upsertChat(sessionKey, chat) {
        const state = this._state(sessionKey, true);
        const previous = state.chats.get(chat.id);
        if (!previous && state.chats.size >= this.limits.maxChats) {
            fail('LIMIT_EXCEEDED', 'Session contains too many chats', {
                limit: this.limits.maxChats
            });
        }
        const nextTotal = state.messageCount -
            (previous?.chat.messages.length || 0) + chat.messages.length;
        if (nextTotal > this.limits.maxTotalMessages) {
            fail('LIMIT_EXCEEDED', 'Session contains too many messages', {
                limit: this.limits.maxTotalMessages
            });
        }
        state.chats.set(chat.id, compileChat(chat));
        state.messageCount = nextTotal;
        state.revision += 1;
    }

    upsertMessage(sessionKey, chatId, message) {
        const state = this._state(sessionKey, false);
        const compiled = state?.chats.get(chatId);
        if (!compiled) fail('NOT_FOUND', `Chat ${chatId} is not indexed`, { chatId });
        const existingIndex = compiled.chat.messages.findIndex(item => item.id === message.id);
        if (existingIndex < 0 && compiled.chat.messages.length >= this.limits.maxMessagesPerChat) {
            fail('LIMIT_EXCEEDED', `Chat ${chatId} contains too many messages`, {
                limit: this.limits.maxMessagesPerChat
            });
        }
        if (existingIndex < 0 && state.messageCount >= this.limits.maxTotalMessages) {
            fail('LIMIT_EXCEEDED', 'Session contains too many messages', {
                limit: this.limits.maxTotalMessages
            });
        }
        const nextChat = cloneValue(compiled.chat);
        if (existingIndex >= 0) nextChat.messages[existingIndex] = message;
        else nextChat.messages.push(message);
        state.chats.set(chatId, compileChat(nextChat));
        if (existingIndex < 0) state.messageCount += 1;
        state.revision += 1;
        return existingIndex >= 0 ? existingIndex : nextChat.messages.length - 1;
    }

    removeChat(sessionKey, chatId) {
        const state = this._state(sessionKey, false);
        const compiled = state?.chats.get(chatId);
        if (!compiled) return false;
        state.chats.delete(chatId);
        state.messageCount -= compiled.chat.messages.length;
        state.revision += 1;
        return true;
    }

    removeMessage(sessionKey, chatId, messageId) {
        const state = this._state(sessionKey, false);
        const compiled = state?.chats.get(chatId);
        if (!compiled) return false;
        const index = compiled.chat.messages.findIndex(message => message.id === messageId);
        if (index < 0) return false;
        const nextChat = cloneValue(compiled.chat);
        nextChat.messages.splice(index, 1);
        state.chats.set(chatId, compileChat(nextChat));
        state.messageCount -= 1;
        state.revision += 1;
        return true;
    }

    rebuild(sessionKey, chats) {
        if (chats.length > this.limits.maxChats) {
            fail('LIMIT_EXCEEDED', 'Rebuild contains too many chats', {
                limit: this.limits.maxChats
            });
        }
        const compiledChats = new Map();
        let messageCount = 0;
        for (const chat of chats) {
            if (compiledChats.has(chat.id)) {
                fail('DUPLICATE_ID', `Duplicate chat id: ${chat.id}`, { chatId: chat.id });
            }
            messageCount += chat.messages.length;
            if (messageCount > this.limits.maxTotalMessages) {
                fail('LIMIT_EXCEEDED', 'Rebuild contains too many messages', {
                    limit: this.limits.maxTotalMessages
                });
            }
            compiledChats.set(chat.id, compileChat(chat));
        }
        const revision = this.getRevision(sessionKey) + 1;
        this.sessions.set(sessionKey, { chats: compiledChats, messageCount, revision });
        return this.getStats(sessionKey);
    }

    restore(sessionKey, chats, revision) {
        if (!Number.isSafeInteger(revision) || revision < 0) {
            fail('INVALID_SNAPSHOT', 'Archive snapshot revision must be a non-negative safe integer');
        }
        this.rebuild(sessionKey, chats);
        this.sessions.get(sessionKey).revision = revision;
        return this.getStats(sessionKey);
    }

    merge(sessionKey, incoming) {
        const current = this._state(sessionKey, false);
        const merged = new Map();
        for (const compiled of current?.chats.values() || []) {
            merged.set(compiled.chat.id, cloneValue(compiled.chat));
        }
        const incomingIds = new Set();
        for (const chat of incoming) {
            if (incomingIds.has(chat.id)) {
                fail('DUPLICATE_ID', `Duplicate chat id in archive: ${chat.id}`, {
                    chatId: chat.id
                });
            }
            incomingIds.add(chat.id);
            merged.set(chat.id, chat);
        }
        return this.rebuild(sessionKey, [...merged.values()]);
    }

    compiledChats(sessionKey) {
        return this._state(sessionKey, false)?.chats.values() || [];
    }

    clear(sessionKey) {
        const state = this._state(sessionKey, false);
        if (!state || state.chats.size === 0) return false;
        state.chats.clear();
        state.messageCount = 0;
        state.revision += 1;
        return true;
    }

    dispose() {
        this.sessions.clear();
    }

    _state(sessionKey, create) {
        let state = this.sessions.get(sessionKey);
        if (!state && create) {
            state = { chats: new Map(), messageCount: 0, revision: 0 };
            this.sessions.set(sessionKey, state);
        }
        return state;
    }
}
