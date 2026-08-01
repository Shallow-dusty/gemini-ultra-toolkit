import { conversationMatches, normalizeConversation } from './snapshot.js';

function sessionKey(value) {
    if (value && typeof value === 'object') {
        return String(value.accountId ?? value.userId ?? value.email ?? value.id ?? '').trim();
    }
    return String(value ?? '').trim();
}

function abortError(signal) {
    const error = new Error(String(signal.reason || 'Operation cancelled'));
    error.name = 'AbortError';
    error.code = 'ABORTED';
    return error;
}

function assertActive(signal) {
    if (signal?.aborted) throw abortError(signal);
}

function waitWithSignal(delay, signal, timers) {
    assertActive(signal);
    return new Promise((resolve, reject) => {
        const handle = timers.setTimeout(done, delay);
        function done() {
            signal?.removeEventListener('abort', abort);
            resolve();
        }
        function abort() {
            timers.clearTimeout(handle);
            signal.removeEventListener('abort', abort);
            reject(abortError(signal));
        }
        signal?.addEventListener('abort', abort, { once: true });
    });
}

export function createGeminiBulkLifecycleAdapter({
    gemini,
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
    timers = globalThis,
    wait = null,
    session = null,
    deleteVerificationAttempts = 10
} = {}) {
    for (const method of [
        'scanSidebarChatLinks',
        'getSidebarOverflowContainer',
        'getChatRowMoreButton',
        'getDeleteMenuItem',
        'getConfirmDialog',
        'getDialogConfirmButton'
    ]) {
        if (!gemini || typeof gemini[method] !== 'function') {
            throw new TypeError(`Gemini bulk lifecycle adapter requires ${method}()`);
        }
    }
    if (!documentRef || typeof documentRef.createElement !== 'function') {
        throw new TypeError('Gemini bulk lifecycle adapter requires a document');
    }
    if (!windowRef || typeof windowRef.addEventListener !== 'function') {
        throw new TypeError('Gemini bulk lifecycle adapter requires a window');
    }
    const pause = wait || ((delay, signal) => waitWithSignal(delay, signal, timers));
    if (typeof pause !== 'function') throw new TypeError('Gemini bulk lifecycle wait must be a function');
    if (!Number.isInteger(deleteVerificationAttempts) || deleteVerificationAttempts < 1) {
        throw new TypeError('Gemini bulk lifecycle deleteVerificationAttempts must be a positive integer');
    }

    let activeSession = sessionKey(session);

    function rawItems() {
        return gemini.scanSidebarChatLinks();
    }

    function findRaw(id) {
        return rawItems().find(item => String(item.id) === String(id)) || null;
    }

    function toSnapshot(item) {
        return item ? normalizeConversation(item) : null;
    }

    function currentRoute() {
        return String(windowRef.location?.href || '');
    }

    function dismissTransientUi() {
        const dialog = gemini.getConfirmDialog();
        const buttons = dialog ? [...dialog.querySelectorAll('button')] : [];
        const cancel = buttons.find(button => /cancel|取消|キャンセル|취소/i.test(button.textContent || ''));
        if (cancel) cancel.click();
        else documentRef.body?.click?.();
    }

    return Object.freeze({
        setSession(value) {
            activeSession = sessionKey(value);
        },

        getRunScope() {
            return Object.freeze({
                kind: 'visible-sidebar',
                label: 'Visible conversations in the current Gemini sidebar',
                routeKey: currentRoute(),
                sessionKey: activeSession
            });
        },

        listConversations() {
            return rawItems().map(toSnapshot);
        },

        getConversationSnapshot(id) {
            return toSnapshot(findRaw(id));
        },

        mountToolbar(element) {
            const target = gemini.getSidebarOverflowContainer();
            if (!target) return null;
            target.prepend(element);
            return Object.freeze({
                element,
                get isConnected() { return element.isConnected !== false; },
                remove() { element.remove(); }
            });
        },

        mountSelectionControl(id, element) {
            const item = findRaw(id);
            if (!item?.element) return null;
            item.element.prepend(element);
            return Object.freeze({
                element,
                get isConnected() { return element.isConnected !== false; },
                remove() { element.remove(); }
            });
        },

        subscribeRouteChange(listener) {
            if (typeof listener !== 'function') throw new TypeError('Route listener must be a function');
            windowRef.addEventListener('popstate', listener);
            windowRef.addEventListener('hashchange', listener);
            return () => {
                windowRef.removeEventListener('popstate', listener);
                windowRef.removeEventListener('hashchange', listener);
            };
        },

        async deleteConversation(expected, { signal, scope } = {}) {
            assertActive(signal);
            const raw = findRaw(expected.id);
            if (!raw || !conversationMatches(expected, raw)) return { stale: true };
            const sameScope = this.getRunScope();
            if (sameScope.kind !== scope?.kind ||
                sameScope.routeKey !== scope?.routeKey ||
                sameScope.sessionKey !== scope?.sessionKey) {
                return { stale: true };
            }

            try {
                const MouseEventConstructor = windowRef.MouseEvent || globalThis.MouseEvent;
                raw.element?.dispatchEvent?.(new MouseEventConstructor('mouseenter', { bubbles: true }));
                await pause(120, signal);
                assertActive(signal);
                const menuButton = gemini.getChatRowMoreButton(raw.element);
                if (!menuButton) throw new Error('Conversation menu button not found');
                (menuButton.closest?.('button') || menuButton).click();
                await pause(180, signal);
                assertActive(signal);
                const deleteButton = gemini.getDeleteMenuItem();
                if (!deleteButton) throw new Error('Delete menu item not found');
                deleteButton.click();
                await pause(180, signal);
                assertActive(signal);

                const latest = findRaw(expected.id);
                if (!latest || !conversationMatches(expected, latest)) {
                    dismissTransientUi();
                    return { stale: true };
                }
                const dialog = gemini.getConfirmDialog();
                if (!dialog) throw new Error('Delete confirmation dialog not found');
                const confirm = gemini.getDialogConfirmButton(dialog);
                if (!confirm) throw new Error('Delete confirmation button not found');
                assertActive(signal);
                confirm.click();
                for (let attempt = 0; attempt < deleteVerificationAttempts; attempt += 1) {
                    await pause(120, signal);
                    assertActive(signal);
                    if (!findRaw(expected.id)) return { deleted: true };
                }
                throw new Error('Conversation remained after delete confirmation');
            } catch (error) {
                dismissTransientUi();
                throw error;
            }
        }
    });
}
