const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
    FakeEvent,
    createFakeDom
} = require('./helpers/fake_dom.js');

let contracts;
let focusNavigation;
let liveIndexSync;
let locatorNavigation;
let queryApi;
let recordsApi;
let searchFilterForm;
let searchView;
let verticalFeature;
let viewContracts;

function sourceUrl(file) {
    return pathToFileURL(path.join(
        __dirname,
        '..',
        'src',
        'features',
        'search_navigator',
        file
    )).href;
}

before(async () => {
    [
        contracts,
        focusNavigation,
        liveIndexSync,
        locatorNavigation,
        queryApi,
        recordsApi,
        searchFilterForm,
        searchView,
        verticalFeature,
        viewContracts
    ] = await Promise.all([
        import(sourceUrl('contracts.js')),
        import(sourceUrl('focus_navigation.js')),
        import(sourceUrl('live_index_sync.js')),
        import(sourceUrl('locator_navigation.js')),
        import(sourceUrl('query.js')),
        import(sourceUrl('records.js')),
        import(sourceUrl('search_filter_form.js')),
        import(sourceUrl('search_view.js')),
        import(sourceUrl('vertical_feature.js')),
        import(sourceUrl('view_contracts.js'))
    ]);
});

function createUiStub(document) {
    return {
        Button(options = {}) {
            const element = document.createElement('button');
            element.textContent = options.label || '';
            element.type = options.type || 'button';
            element.disabled = Boolean(options.disabled);
            const listener = typeof options.onPress === 'function'
                ? event => options.onPress(event)
                : null;
            if (listener) element.addEventListener('click', listener);
            return {
                element,
                press(event = new FakeEvent('click', { target: element })) {
                    return options.onPress?.(event);
                },
                setDisabled(disabled) { element.disabled = Boolean(disabled); },
                destroy() {
                    if (listener) element.removeEventListener('click', listener);
                    element.remove();
                }
            };
        }
    };
}

function chatLocator(chatId = 'target') {
    return { kind: 'chat', chatId };
}

function messageLocator(chatId = 'target') {
    return { kind: 'message', chatId, messageId: 'message', ordinal: 0 };
}

function locatorView(adapter, overrides = {}) {
    const errors = [];
    const announcements = [];
    const highlights = [];
    const finished = [];
    return {
        adapter,
        messages: viewContracts.DEFAULT_MESSAGES,
        errors,
        announcements,
        highlights,
        finished,
        _announce(message) { announcements.push(message); },
        _showError(error) { errors.push(error); },
        _highlightSearchResult(locator, options) { highlights.push({ locator, options }); },
        _finishLocatorNavigation(controller) { finished.push(controller); },
        ...overrides
    };
}

function expectCode(code) {
    return error => error?.code === code;
}

describe('Search coverage gate: focus, records, query, and live bridge', () => {
    it('moves backward from both an unknown and a known active control', () => {
        const { document } = createFakeDom();
        const first = document.createElement('button');
        const last = document.createElement('button');
        const outsider = document.createElement('button');
        const unknown = new FakeEvent('keydown', { key: 'ArrowLeft' });
        assert.equal(focusNavigation.moveRovingFocus(
            unknown,
            [first, last],
            outsider,
            { nextKey: 'ArrowRight', previousKey: 'ArrowLeft' }
        ), true);
        assert.equal(document.activeElement, last);
        assert.equal(unknown.defaultPrevented, true);

        const known = new FakeEvent('keydown', { key: 'ArrowLeft' });
        assert.equal(focusNavigation.moveRovingFocus(
            known,
            [first, last],
            first,
            { nextKey: ['ArrowRight'], previousKey: ['ArrowLeft'] }
        ), true);
        assert.equal(document.activeElement, last);
    });

    it('normalizes numeric timestamps and every optional current-chat metadata outcome', () => {
        const numeric = recordsApi.normalizeChat({
            id: 'numeric',
            timestamp: 123,
            messages: []
        }, 0, contracts.DEFAULT_SEARCH_LIMITS);
        assert.equal(numeric.metadata.timestamp, 123);

        const report = () => ({ adapterFailed: false, rejected: 0, truncated: false });
        const populated = liveIndexSync.liveIndexSyncInternals.readCurrentChat({
            getChatId: () => 'current',
            getChatTitleText: () => 'Current',
            getCurrentHref: () => 'https://gemini.google.com/app/current',
            detectModelKey: () => 'pro',
            getCurrentConversationMessages: () => []
        }, contracts.DEFAULT_SEARCH_LIMITS, report());
        assert.equal(populated.metadata.source, 'https://gemini.google.com/app/current');
        assert.equal(populated.metadata.model, 'pro');

        const empty = liveIndexSync.liveIndexSyncInternals.readCurrentChat({
            getChatId: () => 'empty-metadata',
            getCurrentHref: () => '',
            detectModelKey: () => '',
            getCurrentConversationMessages: () => []
        }, contracts.DEFAULT_SEARCH_LIMITS, report());
        assert.equal(empty.metadata.source, '');
        assert.equal(empty.metadata.model, '');
    });

    it('enforces excluded-term bounds and exercises source and date filter decisions', () => {
        assert.throws(() => queryApi.normalizeSearchRequest('x', {
            exclude: 'four'
        }, {
            ...contracts.DEFAULT_SEARCH_LIMITS,
            maxQueryLength: 3
        }), expectCode('LIMIT_EXCEEDED'));
        assert.throws(() => queryApi.normalizeSearchRequest('x', {
            exclude: 'a b'
        }, {
            ...contracts.DEFAULT_SEARCH_LIMITS,
            maxQueryTokens: 1
        }), expectCode('LIMIT_EXCEEDED'));

        const document = {
            kind: 'chat',
            role: '',
            metadata: { model: '', source: 'local archive', timestamp: 20 },
            fields: { title: { tokens: new Set() } }
        };
        const chat = { id: 'chat', tags: [] };
        const options = {
            kinds: ['chat'],
            chatIds: null,
            roles: null,
            models: null,
            sources: new Set(['local archive']),
            dateFrom: null,
            dateTo: null,
            excludedTokens: [],
            fields: ['title'],
            tags: null,
            tagMode: 'all'
        };
        assert.equal(queryApi.passesFilters(document, chat, options), true);
        assert.equal(queryApi.passesFilters(document, chat, {
            ...options, sources: new Set(['remote'])
        }), false);
        assert.equal(queryApi.passesFilters({
            ...document, metadata: { ...document.metadata, timestamp: null }
        }, chat, { ...options, dateFrom: 0 }), false);
        assert.equal(queryApi.passesFilters({
            ...document, metadata: { ...document.metadata, timestamp: null }
        }, chat, { ...options, dateTo: 30 }), false);
        assert.equal(queryApi.passesFilters(document, chat, { ...options, dateTo: 10 }), false);
        assert.equal(queryApi.passesFilters(document, chat, { ...options, dateTo: 30 }), true);
    });
});

describe('Search coverage gate: locator navigation outcomes', () => {
    it('resolves locator ports and capability decisions without assuming a current chat', () => {
        const open = () => true;
        const jump = () => true;
        assert.equal(locatorNavigation.resolveLocatorPort({ openMessageLocator: open, jumpToMessage: jump }), open);
        assert.equal(locatorNavigation.resolveLocatorPort({ jumpToMessage: jump }), jump);
        assert.equal(locatorNavigation.resolveLocatorPort({}), null);
        assert.equal(locatorNavigation.canOpenSearchLocator({}, null), false);
        assert.equal(locatorNavigation.canOpenSearchLocator({ jumpToMessage: jump }, null), true);

        const throwing = {
            getChatId() { throw new Error('route detached'); },
            jumpToMessage: jump
        };
        assert.equal(locatorNavigation.canOpenSearchLocator(throwing, {
            locator: messageLocator()
        }), false);
        assert.equal(locatorNavigation.canOpenSearchLocator({
            getChatId: () => 'target'
        }, chatLocator()), true);
        assert.equal(locatorNavigation.canOpenSearchLocator({
            getChatId: () => 'target'
        }, messageLocator()), false);
        assert.equal(locatorNavigation.canOpenSearchLocator({
            getChatId: () => 'target', jumpToMessage: jump
        }, messageLocator()), true);
        assert.equal(locatorNavigation.canOpenSearchLocator({
            getChatId: () => 'other',
            openChatLocator: open,
            waitForChatLocator: open
        }, chatLocator()), true);
        assert.equal(locatorNavigation.canOpenSearchLocator({
            getChatId: () => 'other',
            openChatLocator: open,
            waitForChatLocator: open
        }, messageLocator()), false);
    });

    it('uses the direct message path when the current route is unknowable', async () => {
        const calls = [];
        const view = locatorView({
            getChatId: () => null,
            openMessageLocator: async locator => { calls.push(locator); return true; }
        }, {
            _finishLocatorNavigation: undefined,
            dialog: {
                open: true,
                close(reason) { calls.push(reason); this.open = false; }
            }
        });
        assert.equal(await locatorNavigation.jumpToResult(view, {
            locator: messageLocator()
        }), true);
        assert.equal(calls[0].messageId, 'message');
        assert.equal(calls.at(-1), 'jump');
        assert.equal(view.highlights[0].options.requireStable, false);
    });

    it('propagates an abrupt navigation-finalizer failure after a successful jump', async () => {
        const finalizerFailure = new Error('navigation finalizer failed');
        const view = locatorView({
            getChatId: () => 'target'
        }, {
            _finishLocatorNavigation() { throw finalizerFailure; }
        });

        await assert.rejects(
            locatorNavigation.jumpToResult(view, { locator: chatLocator() }),
            error => error === finalizerFailure
        );
    });

    it('finalizes success, navigation failure, and error-render failure after async validation', async () => {
        const success = locatorView({ getChatId: () => 'target' });
        assert.equal(await locatorNavigation.jumpToResult(success, { locator: chatLocator() }), true);
        assert.deepEqual(success.finished, [null]);

        const navigationFailure = locatorView({
            getChatId: () => 'target',
            openMessageLocator: async () => false
        });
        await assert.rejects(
            locatorNavigation.jumpToResult(navigationFailure, { locator: messageLocator() }),
            expectCode('JUMP_FAILED')
        );
        assert.deepEqual(navigationFailure.finished, [null]);

        const renderFailure = new Error('error renderer failed');
        const errorRender = locatorView({
            getChatId: () => 'target',
            openMessageLocator: async () => false
        }, {
            _showError() { throw renderFailure; }
        });
        await assert.rejects(
            locatorNavigation.jumpToResult(errorRender, { locator: messageLocator() }),
            error => error === renderFailure
        );
        assert.deepEqual(errorRender.finished, [null]);

        let began = 0;
        const invalid = locatorView({}, {
            _beginLocatorNavigation() { began += 1; }
        });
        const rejection = locatorNavigation.jumpToResult(invalid, { locator: null });
        assert.equal(rejection instanceof Promise, true);
        await assert.rejects(rejection, expectCode('INVALID_LOCATOR'));
        assert.equal(began, 0);
        assert.deepEqual(invalid.finished, []);
    });

    it('reports both stable and same-chat message lookup failures', async () => {
        const sameChat = locatorView({
            getChatId: () => 'target',
            openMessageLocator: async () => false
        });
        await assert.rejects(
            locatorNavigation.jumpToResult(sameChat, { locator: messageLocator() }),
            expectCode('JUMP_FAILED')
        );

        let current = null;
        const crossed = locatorView({
            getChatId: () => current,
            openMessageLocator: async () => false,
            openChatLocator: async locator => { current = locator.chatId; return true; },
            waitForChatLocator: async () => true
        });
        await assert.rejects(
            locatorNavigation.jumpToResult(crossed, { locator: messageLocator() }),
            expectCode('JUMP_DEGRADED')
        );

        const unavailable = locatorView({ getChatId: () => 'target' });
        await assert.rejects(
            locatorNavigation.jumpToResult(unavailable, { locator: messageLocator() }),
            expectCode('JUMP_UNAVAILABLE')
        );
    });

    it('distinguishes degraded and aborted failures while opening a chat', async () => {
        const openedFalse = locatorView({
            getChatId: () => 'other',
            openChatLocator: async () => false,
            waitForChatLocator: async () => true
        });
        await assert.rejects(
            locatorNavigation.jumpToResult(openedFalse, { locator: chatLocator() }),
            expectCode('JUMP_DEGRADED')
        );

        let openController;
        const openAborted = locatorView({
            getChatId: () => 'other',
            openChatLocator: async () => { openController.abort(); return false; },
            waitForChatLocator: async () => true
        }, {
            _beginLocatorNavigation() {
                openController = new AbortController();
                return openController;
            }
        });
        await assert.rejects(
            locatorNavigation.jumpToResult(openAborted, { locator: chatLocator() }),
            expectCode('JUMP_ABORTED')
        );

        const waitFailed = locatorView({
            getChatId: () => 'other',
            openChatLocator: async () => true,
            waitForChatLocator: async () => false
        });
        await assert.rejects(
            locatorNavigation.jumpToResult(waitFailed, { locator: chatLocator() }),
            expectCode('JUMP_DEGRADED')
        );

        let waitController;
        const waitAborted = locatorView({
            getChatId: () => 'other',
            openChatLocator: async () => true,
            waitForChatLocator: async () => { waitController.abort(); return false; }
        }, {
            _beginLocatorNavigation() {
                waitController = new AbortController();
                return waitController;
            }
        });
        await assert.rejects(
            locatorNavigation.jumpToResult(waitAborted, { locator: chatLocator() }),
            expectCode('JUMP_ABORTED')
        );
    });

    it('wraps unexpected same-chat and cross-chat adapter failures with stable codes', async () => {
        const local = locatorView({
            getChatId: () => 'target',
            openMessageLocator: async () => { throw new Error('detached message'); }
        });
        await assert.rejects(
            locatorNavigation.jumpToResult(local, { locator: messageLocator() }),
            expectCode('JUMP_FAILED')
        );
        assert.equal(local.errors[0].code, 'JUMP_FAILED');

        const remote = locatorView({
            getChatId: () => 'other',
            openChatLocator: async () => { throw new Error('route rejected'); },
            waitForChatLocator: async () => true
        });
        await assert.rejects(
            locatorNavigation.jumpToResult(remote, { locator: chatLocator() }),
            expectCode('JUMP_DEGRADED')
        );
        assert.equal(remote.errors[0].code, 'JUMP_DEGRADED');
    });
});

describe('Search coverage gate: filter and result view callbacks', () => {
    it('executes clear-all, escape fallback, role normalization, and missing-control guards', () => {
        const { document } = createFakeDom();
        const changes = [];
        const submissions = [];
        const state = searchFilterForm.createSearchForm({
            document,
            ui: createUiStub(document),
            messages: viewContracts.DEFAULT_MESSAGES
        }, {
            onSubmit: request => submissions.push(request),
            onChange: () => changes.push('change')
        });

        state.controls.get('query').control.value = 'needle';
        assert.equal(state.clearAll.press(), true);
        assert.equal(state.controls.get('query').control.value, '');
        assert.deepEqual(changes, ['change']);

        state.controls.get('match').control.value = '';
        state.controls.get('role').control.value = 'model';
        assert.deepEqual(searchFilterForm.readSearchForm(state).options.roles, ['model', 'assistant']);
        assert.equal(searchFilterForm.readSearchForm(state).options.match, 'all');
        state.controls.get('role').control.value = 'user';
        assert.deepEqual(searchFilterForm.readSearchForm(state).options.roles, ['user']);

        const ordinary = new FakeEvent('keydown', {
            key: 'Enter',
            target: state.controls.get('query').control
        });
        state.form.dispatchEvent(ordinary);
        assert.equal(ordinary.defaultPrevented, false);

        const queryClear = state.controls.get('query').clear;
        state.controls.delete('query');
        assert.equal(queryClear.press(), false);
        state.destroy();
        assert.deepEqual(submissions, []);
    });

    it('runs focus listeners and every relative-result fallback against mounted state', () => {
        const { document } = createFakeDom();
        const result = {
            kind: 'message',
            chatId: 'chat',
            messageId: 'message',
            role: 'assistant',
            model: 'pro',
            source: 'archive',
            snippet: { text: 'needle' },
            locator: messageLocator('chat')
        };
        const view = {
            document,
            ui: createUiStub(document),
            messages: viewContracts.DEFAULT_MESSAGES,
            adapter: {
                getChatId: () => 'chat',
                openMessageLocator: async () => true
            },
            navigator: {
                search: () => ({ query: 'needle', tokens: ['needle'], total: 1, items: [result] }),
                getStats: () => ({ chats: 1, messages: 1, documents: 2 })
            },
            indexStatus: {
                state: 'ready', archive: 'ready', chats: 1, messages: 1, documents: 2
            },
            dialogState: null
        };

        const state = searchView.createSearchContent(view);
        state.filterForm.controls.get('query').control.value = 'stale';
        assert.equal(state.filterForm.clearAll.press(), true);
        view.dialogState = state;
        assert.equal(searchView.renderSearch(view, 'needle', {}).total, 1);
        assert.equal(searchView.renderSearch(view, 'needle', null).total, 1);
        assert.equal(searchView.renderSearch(view, 'needle', 'raw-options').total, 1);

        const button = state.resultButtons[0].element;
        button.dispatchEvent(new FakeEvent('focus', { target: button }));
        assert.equal(state.activeResultIndex, 0);
        button.disabled = true;
        button.dispatchEvent(new FakeEvent('focus', { target: button }));
        button.disabled = false;
        view.dialogState = null;
        button.dispatchEvent(new FakeEvent('focus', { target: button }));

        view.dialogState = state;
        document.activeElement = document.body;
        assert.equal(searchView.focusRelativeResult(view, -1), true);
        document.activeElement = document.body;
        assert.equal(searchView.focusRelativeResult(view, 1), true);
        state.resultButtons = [];
        assert.equal(searchView.focusRelativeResult(view, 1), false);
        view.dialogState = null;
        assert.equal(searchView.focusRelativeResult(view, -1), false);
        state.filterForm.destroy();
    });

    it('handles missing highlight cleanup and zero-duration cleanup immediately', () => {
        const highlight = verticalFeature.SearchNavigatorViewController.prototype._highlightSearchResult;
        const clear = verticalFeature.SearchNavigatorViewController.prototype._clearSearchHighlight;
        const missing = {
            adapter: { highlightMessageLocator: () => null },
            _clearSearchHighlight: clear,
            _highlightTimer: null,
            _highlightCleanup: null,
            highlightDuration: 10,
            cancelSchedule() {}
        };
        assert.equal(highlight.call(missing, messageLocator(), {}), false);

        let cleaned = 0;
        const immediate = {
            adapter: { highlightMessageLocator: () => () => { cleaned += 1; return true; } },
            _clearSearchHighlight: clear,
            _highlightTimer: null,
            _highlightCleanup: null,
            highlightDuration: 0,
            cancelSchedule() {}
        };
        assert.equal(highlight.call(immediate, messageLocator(), {}), true);
        assert.equal(cleaned, 1);
    });
});
