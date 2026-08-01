import { SearchNavigatorError } from './contracts.js';

export const DEFAULT_MESSAGES = Object.freeze({
    launcher: 'Search & navigate',
    dialogTitle: 'Search chats',
    searchLabel: 'Include words or an exact phrase',
    searchAction: 'Search',
    matchLabel: 'Match mode',
    matchAll: 'All included terms',
    matchAny: 'Any included term',
    matchExact: 'Exact phrase',
    excludeLabel: 'Exclude terms',
    roleLabel: 'Role',
    roleAny: 'Any role',
    roleUser: 'User',
    roleModel: 'Gemini',
    roleSystem: 'System',
    dateFromLabel: 'From date',
    dateToLabel: 'To date',
    modelLabel: 'Models (comma separated)',
    sourceLabel: 'Sources (comma separated)',
    clearField: label => `Clear ${label}`,
    clearAll: 'Clear all search fields',
    activeFilters: count => `${count} active filter${count === 1 ? '' : 's'}.`,
    initial: 'Enter a query to search your local archive.',
    indexReady: (chats, messages) => `${chats} local chat${chats === 1 ? '' : 's'} and ${messages} message${messages === 1 ? '' : 's'} are indexed.`,
    indexDegraded: 'Search coverage is partial because the local archive provider is unavailable.',
    indexFailed: 'Search coverage is partial because the local archive provider could not be read.',
    indexEmpty: 'This account has no chats in the local Search archive.',
    indexEmptyDegraded: 'The Search index is empty and the local archive provider is unavailable.',
    indexEmptyFailed: 'The Search index is empty because the local archive provider could not be read.',
    empty: 'No matching chats or messages.',
    results: count => `${count} local result${count === 1 ? '' : 's'}.`,
    openChat: 'Open chat',
    openMessage: 'Open message',
    jumpUnavailable: 'This Gemini view cannot locate that message yet.',
    jumpFailed: 'The matching message could not be opened.',
    jumpDegraded: 'Navigation is unavailable in this Gemini view.',
    jumpAborted: 'Navigation was canceled.',
    navigating: 'Opening the matching conversation…',
    previousResult: 'Previous result',
    nextResult: 'Next result',
    currentResult: (current, total) => `Result ${current} of ${total}.`,
    quoteToolbar: 'Quote selected Gemini text',
    quote: 'Quote',
    packet: 'Context packet',
    quoteInserted: 'Quote inserted into the composer. Review it before sending.',
    packetInserted: 'Context packet inserted into the composer. Review it before sending.',
    composerUnavailable: 'The Gemini composer is not available.',
    imported: count => `${count} archived chat${count === 1 ? '' : 's'} indexed.`
});

export function invalidDependency(message) {
    throw new SearchNavigatorError('INVALID_DEPENDENCY', message);
}

export function ownFunction(target, name) {
    return target && typeof target[name] === 'function';
}

export function cloneViewValue(value) {
    return globalThis.structuredClone(value);
}

export function mountWith(mount, node, name) {
    if (typeof mount === 'function') {
        const unmount = mount(node);
        return typeof unmount === 'function' ? unmount : () => node.remove();
    }
    if (!mount || typeof mount.append !== 'function') invalidDependency(`${name} must mount DOM nodes`);
    mount.append(node);
    return () => node.remove();
}

export function resolveMessages(overrides = {}) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        invalidDependency('Search navigator messages must be an object');
    }
    return Object.freeze({ ...DEFAULT_MESSAGES, ...overrides });
}

export function textMessage(messages, key, ...args) {
    const value = messages[key];
    return typeof value === 'function' ? String(value(...args)) : String(value);
}

export function ensureText(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

export function requireControllerDependencies(options) {
    const navigator = options.navigator;
    if (!navigator || !ownFunction(navigator, 'search') ||
        !ownFunction(navigator, 'importArchiveChats') ||
        !ownFunction(navigator, 'changeSession') ||
        !ownFunction(navigator, 'getStats')) {
        invalidDependency('SearchNavigatorViewController requires a search navigator service');
    }
    const adapter = options.adapter;
    if (!adapter || !ownFunction(adapter, 'getInputEditor') ||
        !ownFunction(adapter, 'isInsideInputEditor') ||
        !ownFunction(adapter, 'isInsideChatContent')) {
        invalidDependency('SearchNavigatorViewController requires a Gemini adapter boundary');
    }
    const ui = options.ui;
    if (!ui || typeof ui.Button !== 'function') {
        invalidDependency('SearchNavigatorViewController requires injected UI components');
    }
    const documentRef = options.document || globalThis.document;
    if (!documentRef || !ownFunction(documentRef, 'createElement') ||
        !ownFunction(documentRef, 'addEventListener') ||
        !ownFunction(documentRef, 'removeEventListener')) {
        invalidDependency('SearchNavigatorViewController requires a DOM document');
    }
    if (options.enableLauncher !== false &&
        (!options.dialogManager || !ownFunction(options.dialogManager, 'open'))) {
        invalidDependency('A dialog manager is required when the search launcher is enabled');
    }
    if (typeof options.schedule !== 'undefined' && typeof options.schedule !== 'function') {
        invalidDependency('schedule must be a function');
    }
    if (typeof options.cancelSchedule !== 'undefined' && typeof options.cancelSchedule !== 'function') {
        invalidDependency('cancelSchedule must be a function');
    }
    return { navigator, adapter, ui, documentRef };
}

export function announce(view, message, tone = 'default') {
    if (view.toast && ownFunction(view.toast, 'show')) view.toast.show(message, { tone });
    if (view.dialogState) {
        view.dialogState.status.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
        view.dialogState.status.setAttribute('aria-live', tone === 'danger' ? 'assertive' : 'polite');
        view.dialogState.status.textContent = message;
    }
}

export function showError(view, error) {
    const message = ensureText(error?.message, String(error));
    announce(view, message, 'danger');
}
