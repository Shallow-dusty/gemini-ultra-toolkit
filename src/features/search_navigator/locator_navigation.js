import { SearchNavigatorError } from './contracts.js';
import { assertSearchLocator } from './locator.js';
import { cloneViewValue, textMessage } from './view_contracts.js';

export function resolveLocatorPort(adapter) {
    if (typeof adapter.openMessageLocator === 'function') return adapter.openMessageLocator;
    if (typeof adapter.jumpToMessage === 'function') return adapter.jumpToMessage;
    return null;
}

function currentChatId(adapter) {
    try {
        const value = adapter.getChatId?.();
        return typeof value === 'string' && value.trim() ? value.trim() : null;
    } catch {
        return null;
    }
}

function crossChatPorts(adapter) {
    return {
        open: typeof adapter.openChatLocator === 'function' ? adapter.openChatLocator : null,
        wait: typeof adapter.waitForChatLocator === 'function' ? adapter.waitForChatLocator : null
    };
}

export function canOpenSearchLocator(adapter, candidate = null) {
    const jump = resolveLocatorPort(adapter);
    if (!candidate) return jump !== null;
    const locator = assertSearchLocator(candidate.locator || candidate);
    const current = currentChatId(adapter);
    if (current === locator.chatId) return locator.kind === 'chat' || jump !== null;
    const navigation = crossChatPorts(adapter);
    return Boolean(navigation.open && navigation.wait && (locator.kind === 'chat' || jump));
}

function navigationError(view, code, messageKey) {
    return new SearchNavigatorError(code, textMessage(view.messages, messageKey));
}

async function navigateToChat(view, locator, signal) {
    const navigation = crossChatPorts(view.adapter);
    if (!navigation.open || !navigation.wait) {
        throw navigationError(view, 'JUMP_DEGRADED', 'jumpDegraded');
    }
    const opened = await navigation.open.call(view.adapter, cloneViewValue(locator));
    if (!opened || signal?.aborted) {
        throw navigationError(
            view,
            signal?.aborted ? 'JUMP_ABORTED' : 'JUMP_DEGRADED',
            signal?.aborted ? 'jumpAborted' : 'jumpDegraded'
        );
    }
    const ready = await navigation.wait.call(view.adapter, cloneViewValue(locator), { signal });
    if (!ready || currentChatId(view.adapter) !== locator.chatId) {
        throw navigationError(
            view,
            signal?.aborted ? 'JUMP_ABORTED' : 'JUMP_DEGRADED',
            signal?.aborted ? 'jumpAborted' : 'jumpDegraded'
        );
    }
}

async function locateMessage(view, locator, requireStable) {
    const jump = resolveLocatorPort(view.adapter);
    if (!jump) throw navigationError(view, 'JUMP_UNAVAILABLE', 'jumpUnavailable');
    const outcome = await jump.call(view.adapter, cloneViewValue(locator), { requireStable });
    if (outcome === false) {
        throw navigationError(
            view,
            requireStable ? 'JUMP_DEGRADED' : 'JUMP_FAILED',
            requireStable ? 'jumpDegraded' : 'jumpFailed'
        );
    }
    view._highlightSearchResult?.(locator, { requireStable });
}

async function executeJump(view, locator, controller) {
    const signal = controller?.signal || null;
    const current = currentChatId(view.adapter);
    let crossedChat = current !== null && current !== locator.chatId;
    try {
        view._announce?.(textMessage(view.messages, 'navigating'));
        if (current === null && locator.kind === 'message') {
            const direct = resolveLocatorPort(view.adapter);
            if (direct && await direct.call(view.adapter, cloneViewValue(locator)) !== false) {
                view._highlightSearchResult?.(locator, { requireStable: false });
                crossedChat = false;
            } else {
                crossedChat = true;
            }
        }
        if (current === locator.chatId) crossedChat = false;
        if (crossedChat || (current === null && locator.kind === 'chat')) {
            await navigateToChat(view, locator, signal);
            crossedChat = true;
        }
        if (locator.kind === 'message' && !(current === null && !crossedChat)) {
            await locateMessage(view, locator, crossedChat);
        }
        if (view.dialog?.open) view.dialog.close('jump');
        return true;
    } catch (error) {
        const failure = error instanceof SearchNavigatorError
            ? error
            : navigationError(
                view,
                crossedChat ? 'JUMP_DEGRADED' : 'JUMP_FAILED',
                crossedChat ? 'jumpDegraded' : 'jumpFailed'
        );
        view._showError?.(failure);
        throw failure;
    }
}

export async function jumpToResult(view, result) {
    const locator = assertSearchLocator(result?.locator);
    const controller = view._beginLocatorNavigation?.() || null;
    return executeJump(view, locator, controller).finally(() => {
        view._finishLocatorNavigation?.(controller);
    });
}
