import { cloneValue, fail, isObject } from './contracts.js';
import { withPortableMessageIds } from './live_index_sync.js';
import { normalizeChat } from './records.js';

export const CHATS_RESTORE_SECTION = 'chats';

const EXECUTABLE_ACTIONS = new Set(['insert', 'replace', 'rename']);

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
    return value;
}

function assertSignal(signal) {
    if (signal == null) return null;
    if (!isObject(signal) || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' ||
        typeof signal.removeEventListener !== 'function') {
        fail('INVALID_ABORT_SIGNAL', 'Chats restore signal must implement AbortSignal');
    }
    return signal;
}

function throwIfAborted(signal) {
    if (assertSignal(signal)?.aborted) fail('RESTORE_ABORTED', 'Chats restore was aborted');
}

function assertContext(context, phase) {
    if (!isObject(context) || !isObject(context.plan) || !Array.isArray(context.actions)) {
        fail('INVALID_RESTORE_CONTEXT', `Chats ${phase} context is malformed`);
    }
    if (context.section !== CHATS_RESTORE_SECTION) {
        fail('INVALID_RESTORE_SECTION', `Chats contributor cannot handle ${String(context.section)}`);
    }
    return context;
}

function assertWritableScope(scope) {
    if (scope?.readOnly === true || scope?.kind === 'inspection' || scope?.mode === 'inspection') {
        fail('READ_ONLY_SESSION', 'Inspection scopes cannot restore the local chat archive');
    }
    return scope;
}

function validSessionKey(value) {
    return value === 'guest' || (typeof value === 'string' &&
        value.startsWith('account:') && value.length > 'account:'.length);
}

function normalizeSnapshot(value, limits) {
    if (!isObject(value) || value.section !== CHATS_RESTORE_SECTION ||
        !validSessionKey(value.sessionKey) || !Number.isSafeInteger(value.revision) ||
        value.revision < 0 || !Array.isArray(value.chats)) {
        fail('INVALID_CHATS_SNAPSHOT', 'Chats restore snapshot is malformed');
    }
    const chats = value.chats.map((chat, index) => normalizeChat(chat, index, limits));
    return deepFreeze({
        section: CHATS_RESTORE_SECTION,
        sessionKey: value.sessionKey,
        revision: value.revision,
        chats
    });
}

function actionIdentity(value) {
    if (Object.hasOwn(value, 'id')) return value.id;
    if (Object.hasOwn(value, 'chatId')) return value.chatId;
    return undefined;
}

function normalizeAction(raw, limits, ordinal) {
    if (!isObject(raw) || raw.section !== CHATS_RESTORE_SECTION ||
        !EXECUTABLE_ACTIONS.has(raw.action) || !isObject(raw.value) ||
        typeof raw.incomingIdentity !== 'string' || !raw.incomingIdentity ||
        raw.incomingIdentity.trim() !== raw.incomingIdentity ||
        typeof raw.targetIdentity !== 'string' || !raw.targetIdentity ||
        raw.targetIdentity.trim() !== raw.targetIdentity) {
        fail('INVALID_CHATS_ACTION', 'Chats restore action is malformed');
    }
    const valueIdentity = actionIdentity(raw.value);
    if (valueIdentity !== undefined && valueIdentity !== raw.incomingIdentity) {
        fail('CHATS_IDENTITY_MISMATCH', 'Chat value identity does not match incomingIdentity');
    }
    if (raw.action === 'rename') {
        if (!isObject(raw.identityPatch) || !['id', 'chatId'].includes(raw.identityPatch.field) ||
            raw.identityPatch.value !== raw.targetIdentity ||
            raw.incomingIdentity === raw.targetIdentity) {
            fail('INVALID_CHATS_RENAME', 'Chat rename must patch id or chatId to a distinct target');
        }
    } else if (raw.identityPatch !== null || raw.incomingIdentity !== raw.targetIdentity) {
        fail('CHATS_IDENTITY_MISMATCH', 'Chat insert and replace actions must retain identity');
    }
    const value = cloneValue(raw.value);
    return {
        action: raw.action,
        targetIdentity: raw.targetIdentity,
        chat: normalizeChat({
            ...value,
            id: raw.targetIdentity,
            chatId: raw.targetIdentity,
            messages: withPortableMessageIds(value.messages, limits)
        }, ordinal, limits)
    };
}

function applyActions(chats, actions, limits, signal) {
    const next = cloneValue(chats);
    const counts = { insert: 0, replace: 0, rename: 0 };
    for (const [ordinal, raw] of cloneValue(actions).entries()) {
        throwIfAborted(signal);
        const action = normalizeAction(raw, limits, ordinal);
        const index = next.findIndex(chat => chat.id === action.targetIdentity);
        if (action.action === 'replace') {
            if (index < 0) fail('STALE_CHATS_ACTION', 'Chat replace target no longer exists', {
                targetIdentity: action.targetIdentity
            });
            next[index] = action.chat;
        } else {
            if (index >= 0) fail('STALE_CHATS_ACTION', 'Chat restore target already exists', {
                targetIdentity: action.targetIdentity
            });
            next.push(action.chat);
        }
        counts[action.action] += 1;
    }
    return { chats: next, counts };
}

function sameSnapshot(left, right) {
    return left.sessionKey === right.sessionKey && left.revision === right.revision &&
        JSON.stringify(left.chats) === JSON.stringify(right.chats);
}

/**
 * Restore portable `chats` into the local Search archive only.
 *
 * This contributor never navigates Gemini and never creates, sends, renames,
 * or deletes a native Gemini conversation.
 */
export function createChatsPortableRestoreContributor({
    navigator,
    getScope = () => null,
    assertCurrent = () => {}
} = {}) {
    if (!navigator || typeof navigator.captureArchiveSnapshot !== 'function' ||
        typeof navigator.restoreArchiveSnapshot !== 'function' ||
        typeof navigator.rebuild !== 'function') {
        throw new TypeError('Chats restore requires a SearchNavigator');
    }
    if (typeof getScope !== 'function' || typeof assertCurrent !== 'function') {
        throw new TypeError('Chats restore lifecycle ports must be functions');
    }

    async function writableScope() {
        assertCurrent();
        const scope = assertWritableScope(await getScope());
        assertCurrent();
        return scope;
    }

    async function snapshot(context) {
        const input = assertContext(context, 'snapshot');
        const signal = assertSignal(input.signal);
        throwIfAborted(signal);
        await writableScope();
        const current = navigator.captureArchiveSnapshot();
        throwIfAborted(signal);
        assertCurrent();
        return normalizeSnapshot({ section: CHATS_RESTORE_SECTION, ...current }, navigator.limits);
    }

    async function apply(context) {
        const input = assertContext(context, 'apply');
        const signal = assertSignal(input.signal);
        throwIfAborted(signal);
        const before = normalizeSnapshot(input.snapshot, navigator.limits);
        await writableScope();
        const current = normalizeSnapshot({
            section: CHATS_RESTORE_SECTION,
            ...navigator.captureArchiveSnapshot()
        }, navigator.limits);
        if (current.sessionKey !== before.sessionKey) {
            fail('SESSION_CHANGED', 'Chats restore cannot cross account sessions');
        }
        if (!sameSnapshot(current, before)) {
            fail('STALE_CHATS_SNAPSHOT', 'Local chat archive changed after the restore snapshot');
        }
        const prepared = applyActions(current.chats, input.actions, navigator.limits, signal);
        if (input.actions.length === 0) return deepFreeze({
            section: CHATS_RESTORE_SECTION,
            applied: 0,
            chats: current.chats.length,
            semantics: 'local-search-archive-only'
        });

        let mutated = false;
        try {
            navigator.rebuild(prepared.chats);
            mutated = true;
            throwIfAborted(signal);
            assertCurrent();
        } catch (error) {
            if (mutated) navigator.restoreArchiveSnapshot(before);
            throw error;
        }
        return deepFreeze({
            section: CHATS_RESTORE_SECTION,
            applied: input.actions.length,
            inserted: prepared.counts.insert,
            replaced: prepared.counts.replace,
            renamed: prepared.counts.rename,
            chats: prepared.chats.length,
            semantics: 'local-search-archive-only'
        });
    }

    async function rollback(context) {
        const input = assertContext(context, 'rollback');
        const before = normalizeSnapshot(input.snapshot, navigator.limits);
        await writableScope();
        navigator.restoreArchiveSnapshot(before);
        assertCurrent();
        return deepFreeze({
            section: CHATS_RESTORE_SECTION,
            restored: true,
            chats: before.chats.length,
            revision: before.revision,
            semantics: 'local-search-archive-only'
        });
    }

    return Object.freeze({ snapshot, apply, rollback });
}

export const chatsRestoreContributorInternals = Object.freeze({
    applyActions,
    normalizeAction,
    normalizeSnapshot,
    sameSnapshot
});
