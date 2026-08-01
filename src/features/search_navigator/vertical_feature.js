import {
    SEARCH_NAVIGATOR_CAPABILITY,
    SEARCH_NAVIGATOR_VIEW_MODULE_ID
} from './contracts.js';
import {
    announce,
    invalidDependency,
    mountWith,
    requireControllerDependencies,
    resolveMessages,
    showError,
    textMessage
} from './view_contracts.js';
import {
    openSearch
} from './search_dialog.js';
import { jumpToResult } from './locator_navigation.js';
import {
    destroySearchView,
    mountSearchView,
    moveResultFocus,
    renderIndexAvailability,
    renderSearch
} from './search_view.js';
import { captureQuoteAnchor } from './quote_anchor.js';
import { insertComposerText, insertQuoteAnchor } from './composer_quote.js';
import {
    clearPointerTimer,
    handleDocumentKeydown,
    handlePointerDown,
    handlePointerUp,
    ownsNode,
    removeQuoteActions,
    showQuoteActions
} from './quote_toolbar.js';

export { formatQuoteText } from './composer_quote.js';

/**
 * Browser-facing coordinator for the Search & Navigator vertical.
 *
 * DOM rendering, quote capture, composer insertion and focus behavior live in
 * dedicated collaborators. This class owns only lifecycle and public API
 * compatibility for consumers that already hold a controller instance.
 */
export class SearchNavigatorViewController {
    constructor(options = {}) {
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            invalidDependency('SearchNavigatorViewController options must be an object');
        }
        const dependencies = requireControllerDependencies(options);
        this.navigator = dependencies.navigator;
        this.adapter = dependencies.adapter;
        this.ui = dependencies.ui;
        this.document = dependencies.documentRef;
        this.dialogManager = options.dialogManager || null;
        this.mount = options.mount || null;
        this.overlayMount = options.overlayMount || this.mount;
        this.toast = options.toast || null;
        this.messages = resolveMessages(options.messages || {});
        this.indexStatus = Object.freeze({
            state: 'empty',
            reason: 'not-indexed',
            archive: 'unavailable',
            chats: 0,
            messages: 0,
            documents: 0
        });
        this.enableLauncher = options.enableLauncher !== false;
        this.enableQuote = options.enableQuote !== false;
        this.schedule = options.schedule || globalThis.setTimeout;
        this.cancelSchedule = options.cancelSchedule || globalThis.clearTimeout;
        this.quoteDelay = options.quoteDelay ?? 50;
        this.quoteDismissDelay = options.quoteDismissDelay ?? 8_000;
        this.highlightDuration = options.highlightDuration ?? 1_600;
        this.maxSelectionLength = options.maxSelectionLength ?? 2_400;
        this.selectionProvider = options.selectionProvider ||
            (() => this.document.defaultView?.getSelection?.());
        if (!Number.isFinite(this.quoteDelay) || this.quoteDelay < 0 ||
            !Number.isFinite(this.quoteDismissDelay) || this.quoteDismissDelay < 0 ||
            !Number.isSafeInteger(this.highlightDuration) || this.highlightDuration < 0 ||
            !Number.isSafeInteger(this.maxSelectionLength) || this.maxSelectionLength < 2) {
            invalidDependency('Quote timing and selection limits must be non-negative bounded numbers');
        }

        this.started = false;
        this.launcher = null;
        this.launcherUnmount = null;
        this.dialog = null;
        this.dialogState = null;
        this.quoteActions = null;
        this.quoteTimer = null;
        this._pointerTimer = null;
        this._locatorNavigation = null;
        this._highlightTimer = null;
        this._highlightCleanup = null;
        this._onPointerUp = event => this._handlePointerUp(event);
        this._onPointerDown = event => this._handlePointerDown(event);
        this._onDocumentKeydown = event => this._handleDocumentKeydown(event);
    }

    start() {
        if (this.started) return false;
        this.started = true;
        try {
            if (this.enableLauncher) {
                if (!this.mount) invalidDependency('Search launcher mount is unavailable');
                this.launcher = this.ui.Button({
                    document: this.document,
                    label: textMessage(this.messages, 'launcher'),
                    onPress: () => this.openSearch(this.launcher.element)
                });
                this.launcher.element.setAttribute('data-search-navigator-launcher', '');
                this.launcherUnmount = mountWith(
                    this.mount,
                    this.launcher.element,
                    'Search launcher mount'
                );
            }
            if (this.enableQuote) {
                if (!this.overlayMount) invalidDependency('Quote action mount is unavailable');
                this.document.addEventListener('pointerup', this._onPointerUp, true);
                this.document.addEventListener('pointerdown', this._onPointerDown, true);
                this.document.addEventListener('keydown', this._onDocumentKeydown, true);
            }
            return true;
        } catch (error) {
            this.stop();
            throw error;
        }
    }

    stop() {
        if (!this.started) return false;
        this._cancelLocatorNavigation();
        this._clearSearchHighlight();
        this._clearPointerTimer();
        this._removeQuoteActions(false);
        if (this.dialog?.open) this.dialog.close('feature-stop');
        this.dialog = null;
        this._destroyDialogState();
        if (this.enableQuote) {
            this.document.removeEventListener('pointerup', this._onPointerUp, true);
            this.document.removeEventListener('pointerdown', this._onPointerDown, true);
            this.document.removeEventListener('keydown', this._onDocumentKeydown, true);
        }
        this.launcherUnmount?.();
        this.launcherUnmount = null;
        this.launcher?.destroy();
        this.launcher = null;
        this.started = false;
        return true;
    }

    changeSession(session) {
        this.resetSessionView();
        this.navigator.changeSession(session);
        return this.navigator.getStats();
    }

    resetSessionView() {
        this._cancelLocatorNavigation();
        this._clearSearchHighlight();
        this._removeQuoteActions(false);
        if (this.dialog?.open) this.dialog.close('session-change');
        else this._destroyDialogState();
    }

    indexArchive(source, options) {
        try {
            const report = this.navigator.importArchiveChats(source, options);
            this._announce(textMessage(this.messages, 'imported', report.imported), 'success');
            return report;
        } catch (error) {
            this._showError(error);
            throw error;
        }
    }

    setIndexStatus(status) {
        if (!status || typeof status !== 'object' || Array.isArray(status) ||
            !['ready', 'degraded', 'empty'].includes(status.state)) {
            invalidDependency('Search index status is malformed');
        }
        this.indexStatus = Object.freeze({
            reason: null,
            archive: 'unavailable',
            chats: 0,
            messages: 0,
            documents: 0,
            ...status
        });
        if (this.dialogState?.lastQuery) {
            renderSearch(
                this,
                this.dialogState.lastQuery,
                this.dialogState.lastOptions,
                this.dialogState.lastFilterCount
            );
        }
        else renderIndexAvailability(this);
        return { ...this.indexStatus };
    }

    openSearch(trigger = null) { return openSearch(this, trigger); }
    renderToDetailsPane(container) { return mountSearchView(this, container); }
    _destroyDialogState() { return destroySearchView(this); }
    _renderSearch(query) { return renderSearch(this, query); }
    _moveResultFocus(event) { return moveResultFocus(this, event); }
    jumpToResult(result) { return jumpToResult(this, result); }
    _beginLocatorNavigation() {
        this._cancelLocatorNavigation();
        this._locatorNavigation = new AbortController();
        return this._locatorNavigation;
    }
    _finishLocatorNavigation(controller) {
        if (this._locatorNavigation !== controller) return false;
        this._locatorNavigation = null;
        return true;
    }
    _cancelLocatorNavigation() {
        if (!this._locatorNavigation) return false;
        this._locatorNavigation.abort();
        this._locatorNavigation = null;
        return true;
    }
    _highlightSearchResult(locator, options) {
        this._clearSearchHighlight();
        const cleanup = this.adapter.highlightMessageLocator?.(locator, options);
        if (typeof cleanup !== 'function') return false;
        this._highlightCleanup = cleanup;
        if (this.highlightDuration === 0) return this._clearSearchHighlight();
        this._highlightTimer = this.schedule(
            () => this._clearSearchHighlight(),
            this.highlightDuration
        );
        return true;
    }
    _clearSearchHighlight() {
        if (this._highlightTimer !== null) this.cancelSchedule(this._highlightTimer);
        this._highlightTimer = null;
        const cleanup = this._highlightCleanup;
        this._highlightCleanup = null;
        return typeof cleanup === 'function' ? cleanup() : false;
    }
    captureQuoteAnchor() { return captureQuoteAnchor(this); }
    insertQuoteAnchor(anchor, options) { return insertQuoteAnchor(this, anchor, options); }
    _insertComposerText(text) { return insertComposerText(this, text); }
    _handlePointerUp(event) { return handlePointerUp(this, event); }
    _handlePointerDown(event) { return handlePointerDown(this, event); }
    _handleDocumentKeydown(event) { return handleDocumentKeydown(this, event); }
    _showQuoteActions(point, anchor, focusFirst) {
        return showQuoteActions(this, point, anchor, focusFirst);
    }
    _removeQuoteActions(restoreFocus) { return removeQuoteActions(this, restoreFocus); }
    _clearPointerTimer() { return clearPointerTimer(this); }
    _ownsNode(node) { return ownsNode(this, node); }
    _announce(message, tone = 'default') { return announce(this, message, tone); }
    _showError(error) { return showError(this, error); }
}

export function createSearchNavigatorFeatureModule(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        invalidDependency('Search navigator feature options must be an object');
    }
    const id = options.id || SEARCH_NAVIGATOR_VIEW_MODULE_ID;
    const capabilityNames = Object.freeze([
        'search.navigator.view',
        'quote.reply'
    ]);
    return {
        id,
        defaultEnabled: options.defaultEnabled ?? false,
        requires: [SEARCH_NAVIGATOR_CAPABILITY],
        provides: capabilityNames,
        create(context) {
            const navigator = context.requireCapability(SEARCH_NAVIGATOR_CAPABILITY);
            const view = new SearchNavigatorViewController({ ...options, navigator });
            context.provideCapability('search.navigator.view', view);
            context.provideCapability('quote.reply', Object.freeze({
                capture: () => view.captureQuoteAnchor(),
                insert: (anchor, insertOptions) => view.insertQuoteAnchor(anchor, insertOptions)
            }));
            return {
                start() {
                    if (options.initialArchive !== undefined) {
                        navigator.importArchiveChats(options.initialArchive);
                    }
                    view.start();
                },
                onSessionChange() {
                    view.resetSessionView();
                },
                stop() {
                    view.stop();
                }
            };
        }
    };
}
