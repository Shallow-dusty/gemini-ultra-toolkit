import { GeminiAdapter } from '../adapters/gemini.js';
import { Logger } from '../logger.js';
import { Button } from '../ui/components.js';
import {
    SearchIndexSynchronizer,
    SearchNavigator,
    SearchNavigatorError,
    SearchNavigatorViewController,
    createChatsPortableRestoreContributor
} from '../features/search_navigator/index.js';

function bodyMount(documentRef) {
    return node => {
        documentRef.body.append(node);
        return () => node.remove();
    };
}

function portableError(code, message) {
    throw new SearchNavigatorError(code, message);
}

function assertPortableSignal(signal) {
    if (signal == null) return null;
    if (!signal || typeof signal !== 'object' || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' ||
        typeof signal.removeEventListener !== 'function') {
        portableError('INVALID_ABORT_SIGNAL', 'Portable chats signal must implement AbortSignal');
    }
    if (signal.aborted) portableError('ARCHIVE_ABORTED', 'Portable chats operation was aborted');
    return signal;
}

/**
 * Compatibility facade for the v12 `quote-reply` toggle.
 *
 * The implementation now belongs to Search & Navigator. The facade retains
 * the original module id/storage key while injecting the Gemini boundary and
 * semantic UI component without reaching back into a shell singleton.
 */
export function createQuoteReplyModule(initialOptions = {}) {
    let options = { ...initialOptions };
    let runtime = null;
    let starting = null;

    return {
        id: 'quote-reply',
        key: 'quote-reply',
        toggleId: 'quote-reply',
        name: '搜索与导航 / Search & Navigator',
        legacyName: '引用回复 / Quote Reply',
        description: '搜索本地归档、定位消息并引用所选内容 / Search local archives, locate messages, and quote selected text',
        icon: '\uD83D\uDD0E',
        defaultEnabled: false,

        configure(nextOptions = {}) {
            if (runtime || starting) throw new Error('Cannot configure Quote Reply while it is running');
            if (!nextOptions || typeof nextOptions !== 'object' || Array.isArray(nextOptions)) {
                throw new TypeError('Quote Reply configuration must be an object');
            }
            options = { ...options, ...nextOptions };
            return this;
        },

        async init(context = {}) {
            if (runtime || starting) return false;
            const operation = (async () => {
                const documentRef = options.document || globalThis.document;
                const adapter = options.adapter || GeminiAdapter;
                const logger = options.logger || Logger;
                const session = context.session ?? null;
                const navigator = new SearchNavigator({
                    session,
                    limits: options.limits || {}
                });
                const view = new SearchNavigatorViewController({
                    ...options,
                    document: documentRef,
                    navigator,
                    adapter,
                    ui: options.ui || { Button },
                    overlayMount: options.overlayMount || bodyMount(documentRef),
                    enableLauncher: false,
                    enableQuote: true
                });
                const synchronizer = new SearchIndexSynchronizer({
                    navigator,
                    adapter,
                    archiveProvider: options.archiveProvider || null,
                    document: documentRef,
                    observeChanges: options.observeChanges,
                    schedule: options.refreshSchedule || options.schedule,
                    cancelSchedule: options.cancelRefreshSchedule || options.cancelSchedule,
                    refreshDelay: options.refreshDelay ?? 120,
                    onStatus: status => view.setIndexStatus(status),
                    logger
                });
                try {
                    if (options.initialArchive !== undefined) {
                        navigator.importArchiveChats(options.initialArchive, options.importOptions);
                    }
                    view.start();
                    await synchronizer.start(session);
                    const capability = createSharedCapability(navigator, view, synchronizer);
                    runtime = {
                        navigator,
                        view,
                        capability,
                        synchronizer,
                        detailsContainer: null,
                        session,
                        generation: 0,
                        portableIntegration: null
                    };
                    logger.info('Search & Navigator compatibility facade started');
                    return true;
                } catch (error) {
                    synchronizer.stop();
                    view.stop();
                    navigator.dispose();
                    throw error;
                }
            })();
            starting = operation;
            try {
                return await operation;
            } finally {
                starting = null;
            }
        },

        destroy() {
            if (!runtime) return false;
            const current = runtime;
            runtime = null;
            current.generation += 1;
            current.synchronizer.stop();
            current.view.stop();
            current.navigator.dispose();
            return true;
        },

        onUserChange(session) {
            if (!runtime) return null;
            return (async () => {
                const current = runtime;
                current.generation += 1;
                current.portableIntegration = null;
                current.session = session;
                current.view.resetSessionView();
                await current.synchronizer.changeSession(session);
                if (runtime === current && current.detailsContainer) {
                    current.view.renderToDetailsPane(current.detailsContainer);
                }
                return current.navigator.getStats();
            })();
        },

        onDOMChange() {
            return runtime?.synchronizer.notifyDOMChange() || false;
        },

        onRouteChange() {
            return runtime?.synchronizer.notifyRouteChange() || false;
        },

        renderToDetailsPane(container) {
            if (!runtime) return null;
            runtime.detailsContainer = container;
            return runtime.view.renderToDetailsPane(container);
        },

        search(query, searchOptions) {
            return runtime?.capability.search(query, searchOptions) || null;
        },

        indexArchive(source, importOptions) {
            if (!runtime) return null;
            return runtime.capability.importArchiveChats(source, importOptions);
        },

        getPortableArchiveIntegration() {
            if (!runtime) return null;
            if (runtime.portableIntegration) return runtime.portableIntegration;
            const owner = runtime;
            const generation = owner.generation;
            const assertCurrent = () => {
                if (!runtime) portableError('FEATURE_INACTIVE', 'Search & Navigator is not active');
                if (runtime !== owner || owner.generation !== generation) {
                    portableError('SESSION_CHANGED', 'Portable chats port belongs to another account session');
                }
            };
            const contributor = createChatsPortableRestoreContributor({
                navigator: owner.navigator,
                getScope: () => owner.session,
                assertCurrent
            });
            const exportSection = async (exportOptions = {}) => {
                if (!exportOptions || typeof exportOptions !== 'object' || Array.isArray(exportOptions) ||
                    Object.keys(exportOptions).some(key => key !== 'signal')) {
                    portableError('INVALID_EXPORT_OPTIONS', 'Portable chats export options are malformed');
                }
                assertCurrent();
                const signal = assertPortableSignal(exportOptions.signal);
                const chats = owner.navigator.getArchiveChats();
                assertPortableSignal(signal);
                assertCurrent();
                return chats;
            };
            owner.portableIntegration = Object.freeze({
                section: 'chats',
                exportSection,
                contributor
            });
            return owner.portableIntegration;
        },

        _insertQuote(text) {
            if (!runtime) return false;
            return runtime.view.insertQuoteAnchor({ text, title: '', href: '' }, { mode: 'quote' });
        },

        _insertSnippetPacket(text) {
            if (!runtime) return false;
            return runtime.view.insertQuoteAnchor({
                text,
                title: runtime.view.adapter.getChatTitleText?.() || '',
                href: runtime.view.adapter.getCurrentHref?.() || ''
            }, { mode: 'packet' });
        },

        _insertEditorText(text) {
            if (!runtime) return false;
            return runtime.view._insertComposerText(text);
        },

        get controller() {
            return runtime?.view || null;
        },

        get navigator() {
            return runtime?.navigator || null;
        },

        get capability() {
            return runtime?.capability || null;
        }
    };
}

function createSharedCapability(navigator, view, synchronizer) {
    return Object.freeze({
        search: (query, options) => navigator.search(query, options),
        importArchiveChats: (source, options) => {
            const result = view.indexArchive(source, options);
            synchronizer.refresh('archive-import').catch(() => {});
            return result;
        },
        getStats: () => navigator.getStats(),
        getIndexStatus: () => ({ ...synchronizer.status }),
        captureQuoteAnchor: () => view.captureQuoteAnchor(),
        insertQuoteAnchor: (anchor, options) => view.insertQuoteAnchor(anchor, options),
        jumpToResult: result => view.jumpToResult(result)
    });
}

export const QuoteReplyModule = createQuoteReplyModule();
