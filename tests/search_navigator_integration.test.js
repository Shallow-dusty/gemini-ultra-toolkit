const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let feature;
let ui;
let ModuleHost;
let quoteFacade;

before(async () => {
    feature = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'features', 'search_navigator', 'index.js'
    )).href);
    ui = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'ui', 'index.js')).href);
    ({ ModuleHost } = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'runtime', 'module_host.js'
    )).href));
    quoteFacade = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'modules', 'quote_reply.js'
    )).href);
});

class FakeEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.key = init.key;
        this.altKey = Boolean(init.altKey);
        this.shiftKey = Boolean(init.shiftKey);
        this.target = init.target || null;
        this.clientX = init.clientX;
        this.clientY = init.clientY;
        this.defaultPrevented = false;
        this.propagationStopped = false;
    }

    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
}

class FakeEventTarget {
    constructor() { this._listeners = new Map(); }
    addEventListener(type, listener) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) { this._listeners.get(type)?.delete(listener); }
    dispatchEvent(event) {
        if (!event.target) {
            try { event.target = this; } catch {}
        }
        try { event.currentTarget = this; } catch {}
        for (const listener of [...(this._listeners.get(event.type) || [])]) listener.call(this, event);
        return !event.defaultPrevented;
    }
    listenerCount(type) { return this._listeners.get(type)?.size || 0; }
}

class FakeElement extends FakeEventTarget {
    constructor(tagName, ownerDocument) {
        super();
        this.nodeType = 1;
        this.tagName = tagName.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.parentNode = null;
        this.parentElement = null;
        this.children = [];
        this.attributes = new Map();
        this.className = '';
        this.id = '';
        this.type = '';
        this.hidden = false;
        this.disabled = false;
        this.style = {};
        this._textContent = '';
    }

    get textContent() {
        return this.children.length ? this.children.map(child => child.textContent).join('') : this._textContent;
    }
    set textContent(value) {
        this.replaceChildren();
        this._textContent = String(value ?? '');
    }
    get isConnected() {
        let node = this;
        while (node) {
            if (node === this.ownerDocument) return true;
            node = node.parentNode;
        }
        return false;
    }
    setAttribute(name, value) {
        this.attributes.set(String(name), String(value));
        if (name === 'id') this.id = String(value);
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...nodes) {
        for (const node of nodes) {
            node.remove?.();
            node.parentNode = this;
            node.parentElement = this;
            this.children.push(node);
        }
    }
    appendChild(node) { this.append(node); return node; }
    removeChild(node) {
        const index = this.children.indexOf(node);
        if (index >= 0) this.children.splice(index, 1);
        node.parentNode = null;
        node.parentElement = null;
        return node;
    }
    replaceChildren(...nodes) {
        for (const child of this.children) {
            child.parentNode = null;
            child.parentElement = null;
        }
        this.children = [];
        this._textContent = '';
        this.append(...nodes);
    }
    remove() { this.parentNode?.removeChild(this); }
    contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
    focus() { this.ownerDocument.activeElement = this; }
    click() { if (!this.disabled) this.dispatchEvent(new FakeEvent('click')); }
    _descendants() { return this.children.flatMap(child => [child, ...child._descendants()]); }
    querySelectorAll(selector) {
        const selectors = selector.split(',').map(value => value.trim());
        return this._descendants().filter(node => selectors.some(value => {
            if (value.startsWith('#')) return node.id === value.slice(1);
            if (value.startsWith('.')) return node.className.split(/\s+/u).includes(value.slice(1));
            if (value.startsWith('[')) {
                const match = value.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/u);
                return Boolean(match && node.hasAttribute(match[1]) &&
                    (match[2] === undefined || node.getAttribute(match[1]) === match[2]));
            }
            return node.tagName === value.toUpperCase();
        }));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeDocument extends FakeEventTarget {
    constructor() {
        super();
        this.nodeType = 9;
        this.ownerDocument = this;
        this.body = new FakeElement('body', this);
        this.body.parentNode = this;
        this.activeElement = this.body;
        this.defaultView = {
            Event: FakeEvent,
            innerWidth: 800,
            innerHeight: 600,
            getSelection: () => null
        };
    }
    createElement(tagName) { return new FakeElement(tagName, this); }
    querySelector(selector) { return this.body.querySelector(selector); }
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
}

class FakeDialogManager {
    constructor(document) {
        this.document = document;
        this.calls = [];
    }
    open(options) {
        this.calls.push(options);
        const element = this.document.createElement('section');
        element.append(options.content);
        this.document.body.append(element);
        let open = true;
        const handle = {
            element,
            get open() { return open; },
            close: reason => {
                if (!open) return false;
                open = false;
                element.remove();
                options.onClose?.(reason, handle);
                return true;
            }
        };
        options.initialFocus?.focus();
        return handle;
    }
}

class FakeScheduler {
    constructor() { this.nextId = 1; this.tasks = new Map(); this.cancelled = []; }
    schedule = (callback, delay) => {
        const id = this.nextId++;
        this.tasks.set(id, { callback, delay });
        return id;
    };
    cancel = id => { this.cancelled.push(id); this.tasks.delete(id); };
    run(id) {
        const task = this.tasks.get(id);
        if (!task) return false;
        this.tasks.delete(id);
        task.callback();
        return true;
    }
    runAll() { for (const id of [...this.tasks.keys()]) this.run(id); }
}

function makeSelection(document, text = 'selected text') {
    const element = document.createElement('div');
    element.inChat = true;
    const textNode = { nodeType: 3, parentElement: element };
    return {
        isCollapsed: false,
        rangeCount: 1,
        toString: () => text,
        getRangeAt: () => ({ commonAncestorContainer: textNode }),
        element
    };
}

function mountInto(element) {
    return node => {
        element.append(node);
        return () => node.remove();
    };
}

function makeFixture(overrides = {}) {
    const document = overrides.document || new FakeDocument();
    const scheduler = overrides.scheduler || new FakeScheduler();
    const selection = overrides.selection || makeSelection(document);
    const editor = overrides.editor === undefined ? document.createElement('textarea') : overrides.editor;
    if (editor) {
        if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
            editor.value = '';
            editor.selectionStart = 0;
            editor.selectionEnd = 0;
        }
        document.body.append(editor);
    }
    const inserted = [];
    const jumps = [];
    const jumpOptions = [];
    const routes = [];
    const highlights = [];
    let currentChatId = 'chat-live';
    const adapter = {
        getInputEditor: () => editor,
        isInsideInputEditor: element => Boolean(element?.inEditor),
        isInsideChatContent: element => Boolean(element?.inChat),
        getChatId: () => currentChatId,
        getChatTitleText: () => 'Live title',
        getCurrentHref: () => 'https://gemini.google.com/app/chat-live',
        getMessageLocatorForNode: () => ({ kind: 'message', chatId: 'chat-live', messageId: 'message-live', ordinal: 2 }),
        insertComposerText: (text, options) => { inserted.push({ text, options }); return true; },
        jumpToMessage: async (locator, options) => {
            jumps.push(locator);
            jumpOptions.push(options);
            return true;
        },
        openChatLocator: async locator => {
            routes.push(locator);
            currentChatId = locator.chatId;
            return true;
        },
        waitForChatLocator: async locator => currentChatId === locator.chatId,
        highlightMessageLocator(locator, options) {
            const record = { locator, options, active: true };
            highlights.push(record);
            return () => { record.active = false; return true; };
        },
        ...overrides.adapter
    };
    const navigator = overrides.navigator || new feature.SearchNavigator({ session: 'account-a' });
    const dialogManager = overrides.dialogManager || new FakeDialogManager(document);
    const toasts = [];
    const toast = overrides.toast === null ? null : (overrides.toast || {
        show(message, options) { toasts.push({ message, options }); }
    });
    const controller = new feature.SearchNavigatorViewController({
        document,
        navigator,
        adapter,
        ui: { Button: ui.Button },
        dialogManager,
        mount: mountInto(document.body),
        overlayMount: mountInto(document.body),
        toast,
        schedule: scheduler.schedule,
        cancelSchedule: scheduler.cancel,
        quoteDelay: 5,
        quoteDismissDelay: 20,
        selectionProvider: () => selection,
        ...overrides.options
    });
    return {
        adapter, controller, dialogManager, document, editor, highlights, inserted,
        jumpOptions, jumps, navigator, routes, scheduler, selection, toast, toasts
    };
}

function expectCode(fn, code) {
    assert.throws(fn, error => error instanceof feature.SearchNavigatorError && error.code === code);
}

describe('Search & Navigator archive integration', () => {
    it('imports arrays, archive payloads and direct chat sections transactionally', () => {
        const navigator = new feature.SearchNavigator({ session: 'archive-user' });
        const source = [{ id: 'a', title: 'Alpha', messages: [{ id: 'm', content: 'needle' }] }];
        assert.deepEqual(navigator.importArchiveChats(source), {
            mode: 'merge', imported: 1, stats: { chats: 1, messages: 1, documents: 2 }
        });
        source[0].title = 'mutated';
        assert.equal(navigator.search('alpha').total, 1);

        assert.equal(navigator.importArchiveChats({ chats: [{ id: 'b', title: 'Beta' }] }).stats.chats, 2);
        const replaced = navigator.importArchiveChats({
            payload: { chats: [{ id: 'c', title: 'Gamma' }] }
        }, { mode: 'replace' });
        assert.equal(replaced.stats.chats, 1);
        assert.equal(navigator.search('alpha').total, 0);
        assert.equal(navigator.search('gamma').total, 1);

        expectCode(() => navigator.importArchiveChats(null), 'INVALID_ARCHIVE');
        expectCode(() => navigator.importArchiveChats({}), 'INVALID_ARCHIVE');
        expectCode(() => navigator.importArchiveChats([], { mode: 'append' }), 'INVALID_OPTIONS');
        navigator.importArchiveChats([{ id: 'safe', title: 'Safe' }]);
        expectCode(() => navigator.importArchiveChats([{ id: '' }]), 'INVALID_RECORD');
        assert.equal(navigator.search('safe').total, 1);
    });

    it('reports singular and plural archive imports through the mounted controller', () => {
        const fixture = makeFixture();
        fixture.controller.start();
        fixture.controller.indexArchive([]);
        fixture.controller.indexArchive([{ id: 'only', title: 'Only' }]);
        assert.match(fixture.toasts[0].message, /0 archived chats indexed/);
        assert.match(fixture.toasts[1].message, /1 archived chat indexed/);
        fixture.controller.stop();
    });
});

describe('SearchNavigatorViewController mounted search UI', () => {
    it('mounts once, exposes semantic states, supports result keyboard navigation, and restarts cleanly', async () => {
        const fixture = makeFixture();
        fixture.navigator.rebuild([
            { id: 'chat-a', title: 'Needle title' },
            { id: 'chat-b', messages: [{ id: 'm2', content: 'Needle body' }] }
        ]);
        assert.equal(fixture.controller.start(), true);
        assert.equal(fixture.controller.start(), false);
        assert.equal(fixture.document.listenerCount('pointerup'), 1);
        assert.equal(fixture.document.querySelectorAll('[data-search-navigator-launcher]').length, 1);
        fixture.controller.launcher.element.click();
        const state = fixture.controller.dialogState;
        assert.equal(state.form.getAttribute('role'), 'search');
        assert.equal(state.status.getAttribute('aria-live'), 'polite');
        assert.equal(fixture.document.activeElement, state.input);
        assert.equal(fixture.controller.openSearch(), fixture.controller.dialog);

        state.input.value = 'needle';
        const submit = new FakeEvent('submit');
        state.form.dispatchEvent(submit);
        assert.equal(submit.defaultPrevented, true);
        assert.equal(state.resultButtons.length, 2);
        assert.equal(state.results.hidden, false);
        assert.equal(state.resultNavigation.hidden, false);
        assert.equal(state.previousResult.element.disabled, false);
        state.nextResult.element.click();
        assert.equal(fixture.document.activeElement, state.resultButtons[0].element);
        state.nextResult.element.click();
        assert.equal(fixture.document.activeElement, state.resultButtons[1].element);
        state.previousResult.element.click();
        assert.equal(fixture.document.activeElement, state.resultButtons[0].element);
        assert.match(state.resultPosition.textContent, /Result 1 of 2/);
        assert.equal(state.empty.hidden, true);
        assert.match(state.status.textContent, /2 local results/);
        assert.equal(state.resultButtons[1].element.getAttribute('aria-label').includes('Needle body'), true);

        state.resultButtons[0].element.focus();
        const down = new FakeEvent('keydown', { key: 'ArrowDown' });
        state.results.dispatchEvent(down);
        assert.equal(fixture.document.activeElement, state.resultButtons[1].element);
        state.results.dispatchEvent(new FakeEvent('keydown', { key: 'Home' }));
        assert.equal(fixture.document.activeElement, state.resultButtons[0].element);
        state.results.dispatchEvent(new FakeEvent('keydown', { key: 'End' }));
        assert.equal(fixture.document.activeElement, state.resultButtons[1].element);
        state.results.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowUp' }));
        assert.equal(fixture.document.activeElement, state.resultButtons[0].element);
        state.results.dispatchEvent(new FakeEvent('keydown', { key: 'PageDown' }));
        assert.equal(fixture.document.activeElement, state.resultButtons[1].element);
        state.results.dispatchEvent(new FakeEvent('keydown', { key: 'PageUp' }));
        assert.equal(fixture.document.activeElement, state.resultButtons[0].element);
        const ignored = new FakeEvent('keydown', { key: 'Enter' });
        state.results.dispatchEvent(ignored);
        assert.equal(ignored.defaultPrevented, false);

        const semanticOpen = fixture.adapter.openChatLocator;
        fixture.adapter.openChatLocator = async () => false;
        state.resultButtons[0].element.click();
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(state.status.getAttribute('role'), 'alert');
        fixture.adapter.openChatLocator = semanticOpen;

        const firstResult = fixture.navigator.search('needle').items[0];
        fixture.controller.launcher.element.focus();
        await fixture.controller.jumpToResult(firstResult);
        assert.deepEqual(fixture.routes.at(-1), firstResult.locator);
        fixture.routes.at(-1).chatId = 'mutated';
        assert.equal(firstResult.locator.chatId, 'chat-a');
        assert.equal(fixture.controller.dialog, null);
        assert.equal(fixture.document.activeElement, fixture.controller.launcher.element);

        assert.equal(fixture.controller.stop(), true);
        assert.equal(fixture.controller.stop(), false);
        assert.equal(fixture.document.listenerCount('pointerup'), 0);
        assert.equal(fixture.controller.start(), true);
        assert.equal(fixture.document.querySelectorAll('[data-search-navigator-launcher]').length, 1);
        fixture.controller.stop();
    });

    it('exposes exact/include/exclude and composable metadata filters with focused clears', () => {
        const fixture = makeFixture();
        fixture.navigator.rebuild([
            {
                id: 'filter-a', title: 'Primary',
                messages: [{
                    id: 'stable-a', role: 'assistant', content: 'Needle target',
                    createdAt: '2026-08-01T12:00:00.000Z', model: 'Pro', source: 'Local Archive'
                }]
            },
            {
                id: 'filter-b', title: 'Secondary',
                messages: [{
                    id: 'stable-b', role: 'model', content: 'Needle target discard',
                    createdAt: '2026-08-01T18:00:00.000Z', model: 'Pro', source: 'Local Archive'
                }]
            }
        ]);
        fixture.controller.start();
        fixture.controller.openSearch();
        const state = fixture.controller.dialogState;
        const controls = state.filterForm.controls;
        const set = (key, value, type = 'input') => {
            controls.get(key).control.value = value;
            controls.get(key).control.dispatchEvent(new FakeEvent(type));
        };
        set('query', 'needle target');
        set('match', 'exact', 'change');
        set('exclude', 'discard');
        set('role', 'model', 'change');
        set('dateFrom', '2026-08-01');
        set('dateTo', '2026-08-01');
        set('models', ' pro, PRO ');
        set('sources', 'Local Archive');
        state.form.dispatchEvent(new FakeEvent('submit'));
        assert.equal(state.resultButtons.length, 1);
        assert.match(state.filterForm.filterStatus.textContent, /7 active filters/);
        assert.match(state.results.children[0].textContent, /assistant.*Pro.*Local Archive/);

        controls.get('models').clear.element.click();
        assert.equal(fixture.document.activeElement, controls.get('models').control);
        assert.match(state.filterForm.filterStatus.textContent, /6 active filters/);
        controls.get('exclude').clear.element.click();
        assert.equal(state.resultButtons.length, 2);
        assert.match(state.filterForm.filterStatus.textContent, /5 active filters/);

        controls.get('sources').control.focus();
        const clearSource = new FakeEvent('keydown', {
            key: 'Escape', target: controls.get('sources').control
        });
        state.form.dispatchEvent(clearSource);
        assert.equal(clearSource.defaultPrevented, true);
        assert.equal(controls.get('sources').control.value, '');
        assert.match(state.filterForm.filterStatus.textContent, /4 active filters/);
        const clearEverything = new FakeEvent('keydown', {
            key: 'Escape', target: controls.get('sources').control
        });
        state.form.dispatchEvent(clearEverything);
        assert.equal(clearEverything.defaultPrevented, true);
        assert.equal(controls.get('query').control.value, '');
        assert.equal(controls.get('match').control.value, 'all');
        assert.match(state.filterForm.filterStatus.textContent, /0 active filters/);
        assert.equal(fixture.document.activeElement, controls.get('query').control);
        fixture.controller.stop();
    });

    it('locates, highlights, semantically routes, restores focus, and cancels bounded navigation', async () => {
        const fixture = makeFixture();
        fixture.navigator.rebuild([
            { id: 'chat-live', messages: [{ id: 'stable-live', content: 'Current locator needle' }] },
            { id: 'chat-remote', messages: [{ id: 'stable-remote', content: 'Remote locator needle' }] },
            { id: 'chat-cancel', messages: [{ id: 'stable-cancel', content: 'Cancel locator needle' }] }
        ]);
        fixture.controller.start();
        fixture.controller.launcher.element.focus();
        fixture.controller.openSearch();
        const current = fixture.navigator.search('Current locator').items[0];
        await fixture.controller.jumpToResult(current);
        assert.deepEqual(fixture.jumps[0], current.locator);
        assert.equal(fixture.jumpOptions[0].requireStable, false);
        assert.equal(fixture.highlights[0].active, true);
        assert.equal(fixture.document.activeElement, fixture.controller.launcher.element);
        fixture.scheduler.runAll();
        assert.equal(fixture.highlights[0].active, false);

        fixture.controller.launcher.element.focus();
        fixture.controller.openSearch();
        const remote = fixture.navigator.search('Remote locator').items[0];
        await fixture.controller.jumpToResult(remote);
        assert.deepEqual(fixture.routes.at(-1), remote.locator);
        assert.equal(fixture.jumpOptions.at(-1).requireStable, true);
        assert.equal(fixture.highlights.at(-1).options.requireStable, true);

        fixture.controller.openSearch();
        const canceled = fixture.navigator.search('Cancel locator').items[0];
        fixture.adapter.waitForChatLocator = (_locator, { signal }) => new Promise(resolve => {
            signal.addEventListener('abort', () => resolve(false), { once: true });
        });
        const pending = fixture.controller.jumpToResult(canceled);
        await Promise.resolve();
        fixture.controller.resetSessionView();
        await assert.rejects(pending, error => error.code === 'JUMP_ABORTED');
        assert.equal(fixture.highlights.at(-1).active, false);
        fixture.controller.stop();
    });

    it('renders empty and error states without losing focus semantics', () => {
        const fixture = makeFixture({
            navigator: new feature.SearchNavigator({ limits: { maxQueryLength: 3 } })
        });
        fixture.controller.start();
        fixture.controller.openSearch();
        let response = fixture.controller._renderSearch('none');
        assert.equal(response, null);
        assert.equal(fixture.controller.dialogState.status.getAttribute('role'), 'alert');
        assert.equal(fixture.controller.dialogState.status.getAttribute('aria-live'), 'assertive');
        assert.equal(fixture.controller.dialogState.empty.hidden, true);

        response = fixture.controller._renderSearch('x');
        assert.equal(response.total, 0);
        assert.equal(fixture.controller.dialogState.empty.hidden, false);
        assert.equal(fixture.controller.dialogState.results.hidden, true);
        fixture.controller.dialogState.resultButtons = [];
        const key = new FakeEvent('keydown', { key: 'ArrowDown' });
        fixture.controller._moveResultFocus(key);
        assert.equal(key.defaultPrevented, false);
        fixture.controller.stop();
    });

    it('closes account-bound dialogs on session changes and handles calls without a dialog state', () => {
        const fixture = makeFixture();
        fixture.controller.start();
        assert.equal(fixture.controller._renderSearch('x'), null);
        fixture.controller.openSearch();
        fixture.navigator.upsertChat({ id: 'one', title: 'single' });
        fixture.controller._renderSearch('single');
        assert.match(fixture.controller.dialogState.status.textContent, /1 local result\./);
        fixture.controller.indexArchive([{ id: 'two', title: 'second' }]);
        assert.equal(fixture.controller.dialogState.status.getAttribute('role'), 'status');
        assert.equal(fixture.controller.dialogState.status.getAttribute('aria-live'), 'polite');
        assert.deepEqual(fixture.controller.changeSession('account-b'), {
            chats: 0, messages: 0, documents: 0
        });
        assert.equal(fixture.controller.dialog, null);
        fixture.controller._moveResultFocus(new FakeEvent('keydown', { key: 'ArrowDown' }));
        fixture.controller.stop();
    });

    it('reports archive indexing and every jump boundary explicitly', async () => {
        const fixture = makeFixture();
        fixture.controller.start();
        const report = fixture.controller.indexArchive([{ id: 'a', title: 'Alpha' }]);
        assert.equal(report.imported, 1);
        assert.match(fixture.toasts[0].message, /1 archived chat indexed/);
        expectCode(() => fixture.controller.indexArchive({}), 'INVALID_ARCHIVE');
        assert.equal(fixture.toasts.at(-1).options.tone, 'danger');

        const result = fixture.navigator.search('alpha').items[0];
        const semanticOpen = fixture.adapter.openChatLocator;
        fixture.adapter.openChatLocator = async () => false;
        await assert.rejects(
            fixture.controller.jumpToResult(result),
            error => error.code === 'JUMP_DEGRADED'
        );
        fixture.adapter.openChatLocator = semanticOpen;
        await fixture.controller.jumpToResult(result);
        await assert.rejects(
            fixture.controller.jumpToResult({ locator: null }),
            error => error.code === 'INVALID_LOCATOR'
        );
        fixture.adapter.getChatId = () => 'different-chat';
        fixture.adapter.openChatLocator = undefined;
        fixture.adapter.waitForChatLocator = undefined;
        await assert.rejects(
            fixture.controller.jumpToResult(result),
            error => error.code === 'JUMP_DEGRADED'
        );
        fixture.controller.stop();
    });

    it('validates vertical dependencies and pre-start calls', () => {
        const base = makeFixture();
        base.controller.stop();
        expectCode(() => base.controller.openSearch(), 'VIEW_NOT_STARTED');
        assert.throws(() => new feature.SearchNavigatorViewController(null), /options must be an object/);
        for (const options of [
            {},
            { navigator: {}, adapter: base.adapter, ui: { Button: ui.Button }, document: base.document },
            { navigator: base.navigator, adapter: {}, ui: { Button: ui.Button }, document: base.document },
            { navigator: base.navigator, adapter: base.adapter, ui: {}, document: base.document },
            { navigator: base.navigator, adapter: base.adapter, ui: { Button: ui.Button }, document: {} },
            { navigator: base.navigator, adapter: base.adapter, ui: { Button: ui.Button }, document: base.document },
            { navigator: base.navigator, adapter: base.adapter, ui: { Button: ui.Button }, document: base.document, enableLauncher: false, schedule: 1 },
            { navigator: base.navigator, adapter: base.adapter, ui: { Button: ui.Button }, document: base.document, enableLauncher: false, cancelSchedule: 1 },
            { navigator: base.navigator, adapter: base.adapter, ui: { Button: ui.Button }, document: base.document, enableLauncher: false, quoteDelay: -1 },
            { navigator: base.navigator, adapter: base.adapter, ui: { Button: ui.Button }, document: base.document, enableLauncher: false, maxSelectionLength: 1 }
        ]) assert.throws(() => new feature.SearchNavigatorViewController(options));

        const noMount = new feature.SearchNavigatorViewController({
            navigator: base.navigator,
            adapter: base.adapter,
            ui: { Button: ui.Button },
            document: base.document,
            dialogManager: base.dialogManager,
            enableQuote: false
        });
        assert.throws(() => noMount.start(), /mount is unavailable/);
        const invalidMount = new feature.SearchNavigatorViewController({
            navigator: base.navigator,
            adapter: base.adapter,
            ui: { Button: ui.Button },
            document: base.document,
            dialogManager: base.dialogManager,
            mount: {},
            enableQuote: false
        });
        assert.throws(() => invalidMount.start(), /must mount DOM nodes/);

        const noOverlay = new feature.SearchNavigatorViewController({
            navigator: base.navigator,
            adapter: base.adapter,
            ui: { Button: ui.Button },
            document: base.document,
            enableLauncher: false
        });
        assert.throws(() => noOverlay.start(), /mount is unavailable/);
        assert.throws(() => new feature.SearchNavigatorViewController({
            navigator: base.navigator,
            adapter: base.adapter,
            ui: { Button: ui.Button },
            document: base.document,
            enableLauncher: false,
            enableQuote: false,
            messages: []
        }), /messages must be an object/);
    });

    it('supports element mounts, mount callbacks without cleanup, global documents, and default selection providers', () => {
        const document = new FakeDocument();
        const selection = makeSelection(document);
        document.defaultView.getSelection = () => selection;
        const adapter = {
            getInputEditor: () => document.createElement('textarea'),
            isInsideInputEditor: () => false,
            isInsideChatContent: element => Boolean(element?.inChat)
        };
        const elementMounted = new feature.SearchNavigatorViewController({
            navigator: new feature.SearchNavigator(),
            adapter,
            ui: { Button: ui.Button },
            document,
            dialogManager: new FakeDialogManager(document),
            mount: document.body,
            overlayMount: document.body,
            quoteDismissDelay: 0
        });
        elementMounted.start();
        assert.equal(elementMounted.captureQuoteAnchor().text, 'selected text');
        elementMounted._showQuoteActions({ x: 1, y: 1 }, elementMounted.captureQuoteAnchor(), false);
        assert.ok(elementMounted.quoteActions);
        elementMounted.stop();

        const callbackMounted = new feature.SearchNavigatorViewController({
            navigator: new feature.SearchNavigator(),
            adapter,
            ui: { Button: ui.Button },
            document,
            dialogManager: new FakeDialogManager(document),
            mount: node => { document.body.append(node); },
            overlayMount: node => { document.body.append(node); },
            enableQuote: false
        });
        callbackMounted.start();
        callbackMounted.stop();

        const previous = globalThis.document;
        globalThis.document = document;
        try {
            const globalDocument = new feature.SearchNavigatorViewController({
                navigator: new feature.SearchNavigator(),
                adapter,
                ui: { Button: ui.Button },
                enableLauncher: false,
                enableQuote: false
            });
            assert.equal(globalDocument.start(), true);
            globalDocument.stop();
        } finally {
            globalThis.document = previous;
        }
    });

    it('renders a reusable details surface and exposes unavailable navigation as degraded', async () => {
        const fixture = makeFixture({
            adapter: {
                jumpToMessage: undefined,
                openMessageLocator: undefined,
                openChatLocator: undefined,
                waitForChatLocator: undefined
            }
        });
        fixture.controller.start();
        fixture.navigator.upsertChat({ id: 'local', title: 'Local needle' });
        const details = fixture.document.createElement('section');
        fixture.document.body.append(details);
        const content = fixture.controller.renderToDetailsPane(details);
        assert.equal(fixture.controller.renderToDetailsPane(details), content);
        const response = fixture.controller._renderSearch('needle');
        assert.equal(response.total, 1);
        assert.equal(
            fixture.controller.dialogState.status.getAttribute('data-capability-state'),
            'degraded'
        );
        assert.match(fixture.controller.dialogState.status.textContent, /Navigation is unavailable/);
        assert.equal(fixture.controller.dialogState.resultButtons[0].element.disabled, true);
        const key = new FakeEvent('keydown', { key: 'ArrowDown' });
        fixture.controller._moveResultFocus(key);
        assert.equal(key.defaultPrevented, false);
        await assert.rejects(
            fixture.controller.jumpToResult(response.items[0]),
            error => error.code === 'JUMP_DEGRADED'
        );
        assert.throws(() => fixture.controller.renderToDetailsPane({}), /must mount DOM nodes/);
        fixture.controller.changeSession('details-next');
        assert.equal(details.children.length, 0);
        fixture.controller.stop();
    });
});

describe('SearchNavigator quote anchors and safe composer insertion', () => {
    it('captures a current-page message anchor and inserts quote or packet without submitting', () => {
        const fixture = makeFixture();
        fixture.controller.start();
        const anchor = fixture.controller.captureQuoteAnchor();
        assert.deepEqual(anchor.locator, {
            kind: 'message', chatId: 'chat-live', messageId: 'message-live', ordinal: 2
        });
        assert.equal(anchor.text, 'selected text');
        fixture.controller.insertQuoteAnchor(anchor, { mode: 'quote' });
        fixture.controller.insertQuoteAnchor(anchor, { mode: 'packet' });
        assert.equal(fixture.inserted.length, 2);
        assert.equal(fixture.inserted[0].text, '> selected text\n\n');
        assert.deepEqual(fixture.inserted[0].options, {
            source: 'search-navigator', submit: false, focus: true
        });
        assert.match(fixture.inserted[1].text, /Selected Gemini text snippet/);
        assert.match(fixture.inserted[1].text, /selected text/);
        assert.equal(fixture.toasts.length, 2);

        expectCode(() => fixture.controller.insertQuoteAnchor(null), 'INVALID_QUOTE_ANCHOR');
        expectCode(() => fixture.controller.insertQuoteAnchor({ text: 'x' }, { mode: 'send' }), 'INVALID_OPTIONS');
        fixture.adapter.insertComposerText = () => false;
        expectCode(() => fixture.controller.insertQuoteAnchor(anchor), 'COMPOSER_UNAVAILABLE');
        fixture.controller.stop();
    });

    it('shows one pointer/keyboard toolbar with roving focus, dismissal, and no duplicates', () => {
        const fixture = makeFixture();
        const returnFocus = fixture.document.createElement('button');
        fixture.document.body.append(returnFocus);
        returnFocus.focus();
        fixture.controller.start();
        const pointer = new FakeEvent('pointerup', { clientX: 790, clientY: 5 });
        fixture.document.dispatchEvent(pointer);
        assert.equal(fixture.scheduler.tasks.size, 1);
        fixture.scheduler.runAll();
        assert.ok(fixture.controller.quoteActions);
        assert.equal(fixture.controller.quoteActions.element.getAttribute('role'), 'toolbar');
        assert.equal(fixture.controller.quoteActions.element.style.left, '560px');
        assert.equal(fixture.controller.quoteActions.element.style.top, '8px');
        assert.equal(fixture.scheduler.tasks.size, 1);

        const inside = new FakeEvent('pointerdown', { target: fixture.controller.quoteActions.quote.element });
        fixture.document.dispatchEvent(inside);
        assert.ok(fixture.controller.quoteActions);
        const right = new FakeEvent('keydown', { key: 'ArrowRight' });
        fixture.controller.quoteActions.element.dispatchEvent(right);
        assert.equal(fixture.document.activeElement, fixture.controller.quoteActions.quote.element);
        fixture.controller.quoteActions.element.dispatchEvent(new FakeEvent('keydown', { key: 'End' }));
        assert.equal(fixture.document.activeElement, fixture.controller.quoteActions.packet.element);
        fixture.controller.quoteActions.element.dispatchEvent(new FakeEvent('keydown', { key: 'Home' }));
        assert.equal(fixture.document.activeElement, fixture.controller.quoteActions.quote.element);
        fixture.controller.quoteActions.element.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowLeft' }));
        assert.equal(fixture.document.activeElement, fixture.controller.quoteActions.packet.element);
        const ignored = new FakeEvent('keydown', { key: 'Tab' });
        fixture.controller.quoteActions.element.dispatchEvent(ignored);
        assert.equal(ignored.defaultPrevented, false);

        const escape = new FakeEvent('keydown', { key: 'Escape' });
        fixture.document.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
        assert.equal(escape.propagationStopped, true);
        assert.equal(fixture.controller.quoteActions, null);
        assert.equal(fixture.document.activeElement, returnFocus);

        const shortcut = new FakeEvent('keydown', { key: 'Q', altKey: true, shiftKey: true });
        fixture.document.dispatchEvent(shortcut);
        assert.equal(shortcut.defaultPrevented, true);
        assert.equal(fixture.document.activeElement, fixture.controller.quoteActions.quote.element);
        fixture.controller.quoteActions.quote.element.click();
        assert.equal(fixture.controller.quoteActions, null);
        assert.equal(fixture.inserted.length, 1);

        fixture.document.dispatchEvent(new FakeEvent('pointerup', { clientX: 20, clientY: 100 }));
        fixture.document.dispatchEvent(new FakeEvent('pointerup', { clientX: 30, clientY: 110 }));
        assert.equal(fixture.scheduler.cancelled.length > 0, true);
        fixture.scheduler.runAll();
        fixture.document.dispatchEvent(new FakeEvent('pointerdown', { target: fixture.document.body }));
        assert.equal(fixture.controller.quoteActions, null);
        fixture.controller.stop();
    });

    it('handles unavailable anchors, action failures, packet activation, viewport fallbacks, and timed dismissal', () => {
        const fixture = makeFixture();
        fixture.controller.start();
        const ordinary = new FakeEvent('keydown', { key: 'a' });
        fixture.document.dispatchEvent(ordinary);
        assert.equal(ordinary.defaultPrevented, false);
        fixture.controller.selectionProvider = () => null;
        const shortcut = new FakeEvent('keydown', { key: null, altKey: true, shiftKey: true });
        fixture.document.dispatchEvent(shortcut);
        assert.equal(shortcut.defaultPrevented, false);
        fixture.document.dispatchEvent(new FakeEvent('keydown', { key: 'q', altKey: true, shiftKey: true }));

        fixture.controller.selectionProvider = () => fixture.selection;
        fixture.document.defaultView = null;
        const anchor = fixture.controller.captureQuoteAnchor();
        fixture.adapter.insertComposerText = () => false;
        fixture.controller._showQuoteActions({ x: 2, y: 2 }, anchor, false);
        fixture.controller.quoteActions.quote.element.click();
        assert.equal(fixture.toasts.at(-1).options.tone, 'danger');
        fixture.controller._showQuoteActions({ x: 2, y: 2 }, anchor, false);
        fixture.controller.quoteActions.packet.element.click();
        assert.equal(fixture.toasts.at(-1).options.tone, 'danger');

        fixture.adapter.insertComposerText = (text, options) => {
            fixture.inserted.push({ text, options });
            return true;
        };
        fixture.controller._showQuoteActions({ x: 2, y: 2 }, anchor, false);
        fixture.controller.quoteActions.packet.element.click();
        assert.match(fixture.inserted.at(-1).text, /Selected Gemini text snippet/);

        fixture.controller._showQuoteActions({ x: 2, y: 2 }, anchor, false);
        const timer = fixture.controller.quoteTimer;
        fixture.scheduler.run(timer);
        assert.equal(fixture.controller.quoteActions, null);
        fixture.document.dispatchEvent(new FakeEvent('pointerup'));
        fixture.controller.stop();
    });

    it('rejects unsafe or irrelevant selections and supports chat-level fallbacks', () => {
        const fixture = makeFixture();
        const setSelection = selection => { fixture.controller.selectionProvider = () => selection; };
        fixture.controller.selectionProvider = () => { throw new Error('blocked'); };
        assert.equal(fixture.controller.captureQuoteAnchor(), null);
        for (const selection of [
            null,
            { isCollapsed: true, rangeCount: 1, toString: () => 'text' },
            { isCollapsed: false, rangeCount: 0, toString: () => 'text' },
            { isCollapsed: false, rangeCount: 1, toString: () => ' ' },
            { isCollapsed: false, rangeCount: 1, toString: () => 'x'.repeat(2401), getRangeAt() {} },
            { isCollapsed: false, rangeCount: 1, toString: () => 'text', getRangeAt() { throw new Error('bad range'); } },
            { isCollapsed: false, rangeCount: 1, toString: () => 'text', getRangeAt: () => ({ commonAncestorContainer: null }) }
        ]) {
            setSelection(selection);
            assert.equal(fixture.controller.captureQuoteAnchor(), null);
        }

        const insideEditor = makeSelection(fixture.document);
        insideEditor.element.inEditor = true;
        setSelection(insideEditor);
        assert.equal(fixture.controller.captureQuoteAnchor(), null);
        const outside = makeSelection(fixture.document);
        outside.element.inChat = false;
        setSelection(outside);
        assert.equal(fixture.controller.captureQuoteAnchor(), null);
        const owned = makeSelection(fixture.document);
        fixture.controller.start();
        owned.getRangeAt = () => ({ commonAncestorContainer: fixture.controller.launcher.element });
        setSelection(owned);
        assert.equal(fixture.controller.captureQuoteAnchor(), null);

        fixture.controller._showQuoteActions({ x: 2, y: 2 }, fixture.selection, false);
        const quoteOwned = makeSelection(fixture.document);
        quoteOwned.getRangeAt = () => ({ commonAncestorContainer: fixture.controller.quoteActions.element });
        setSelection(quoteOwned);
        assert.equal(fixture.controller.captureQuoteAnchor(), null);
        fixture.controller._removeQuoteActions(false);
        fixture.controller.openSearch();
        const dialogOwned = makeSelection(fixture.document);
        dialogOwned.getRangeAt = () => ({ commonAncestorContainer: fixture.controller.dialog.element });
        setSelection(dialogOwned);
        assert.equal(fixture.controller.captureQuoteAnchor(), null);
        fixture.controller.dialog.close('test');

        const valid = makeSelection(fixture.document, 'chat quote');
        setSelection(valid);
        delete fixture.adapter.getMessageLocatorForNode;
        fixture.adapter.getChatId = () => '';
        const anchor = fixture.controller.captureQuoteAnchor();
        assert.deepEqual(anchor.locator, { kind: 'chat', chatId: null });
        fixture.controller.stop();
    });

    it('falls back to controlled text and contenteditable insertion and dispatches input only', () => {
        const inputFixture = makeFixture({ adapter: { insertComposerText: undefined } });
        inputFixture.editor.value = 'ab';
        inputFixture.editor.selectionStart = 1;
        inputFixture.editor.selectionEnd = 2;
        let inputEvents = 0;
        inputFixture.editor.addEventListener('input', () => { inputEvents += 1; });
        assert.equal(inputFixture.controller._insertComposerText('X'), true);
        assert.equal(inputFixture.editor.value, 'aX');
        assert.equal(inputFixture.editor.selectionStart, 2);
        assert.equal(inputEvents, 1);
        inputFixture.editor.selectionStart = undefined;
        inputFixture.editor.selectionEnd = undefined;
        assert.equal(inputFixture.controller._insertComposerText('Y'), true);
        assert.equal(inputFixture.editor.value, 'aXY');

        const globalEventDocument = new FakeDocument();
        globalEventDocument.defaultView.Event = undefined;
        const globalEventFixture = makeFixture({
            document: globalEventDocument,
            adapter: { insertComposerText: undefined }
        });
        assert.equal(globalEventFixture.controller._insertComposerText('event'), true);

        const document = new FakeDocument();
        const contentEditor = document.createElement('div');
        document.body.append(contentEditor);
        const contentFixture = makeFixture({
            document,
            editor: contentEditor,
            adapter: { insertComposerText: undefined }
        });
        assert.equal(contentFixture.controller._insertComposerText('one\n\nthree'), true);
        assert.equal(contentEditor.children.length, 3);
        assert.equal(contentEditor.children[1].children[0].tagName, 'BR');

        const missingFixture = makeFixture({ editor: null, adapter: { insertComposerText: undefined } });
        assert.equal(missingFixture.controller._insertComposerText('x'), false);
        assert.equal(feature.formatQuoteText('a\r\nb'), '> a\n> b\n\n');
    });
});

describe('Search & Navigator ModuleHost vertical descriptor', () => {
    it('consumes one domain capability and publishes view plus quote without a competing index', async () => {
        const fixture = makeFixture();
        const domainDescriptor = feature.createSearchNavigatorModule({ defaultEnabled: true });
        const descriptor = feature.createSearchNavigatorFeatureModule({
            document: fixture.document,
            adapter: fixture.adapter,
            ui: { Button: ui.Button },
            dialogManager: fixture.dialogManager,
            mount: mountInto(fixture.document.body),
            overlayMount: mountInto(fixture.document.body),
            toast: fixture.toast,
            schedule: fixture.scheduler.schedule,
            cancelSchedule: fixture.scheduler.cancel,
            quoteDelay: 0,
            quoteDismissDelay: 0,
            selectionProvider: () => fixture.selection,
            initialArchive: [{ id: 'seed', title: 'Seed chat' }],
            defaultEnabled: true
        });
        assert.equal(descriptor.id, 'search-navigator-view');
        assert.deepEqual(descriptor.requires, ['search.navigator']);
        assert.deepEqual(descriptor.provides, ['search.navigator.view', 'quote.reply']);
        assert.equal(descriptor.defaultEnabled, true);
        const capabilities = new Map();
        const domainLifecycle = domainDescriptor.create({
            session: 'one',
            provideCapability(name, value) { capabilities.set(name, value); }
        });
        const lifecycle = descriptor.create({
            requireCapability(name) { return capabilities.get(name); },
            provideCapability(name, value) { capabilities.set(name, value); }
        });
        lifecycle.start();
        const navigator = capabilities.get('search.navigator');
        const view = capabilities.get('search.navigator.view');
        const quote = capabilities.get('quote.reply');
        assert.equal(navigator.search('seed').total, 1);
        assert.equal(view.started, true);
        assert.equal(quote.capture().text, 'selected text');
        quote.insert({ text: 'manual' }, { mode: 'quote' });
        assert.equal(fixture.inserted.at(-1).options.submit, false);

        domainLifecycle.onSessionChange('two');
        lifecycle.onSessionChange('two');
        assert.equal(navigator.search('seed').total, 0);
        lifecycle.stop();
        assert.equal(view.started, false);
        assert.deepEqual(navigator.getStats(), { chats: 0, messages: 0, documents: 0 });
        domainLifecycle.stop();
        expectCode(() => navigator.getStats(), 'DISPOSED');
    });

    it('validates descriptor options and supports custom ids without seed archives', async () => {
        assert.throws(() => feature.createSearchNavigatorFeatureModule(null), /options must be an object/);
        const fixture = makeFixture();
        const descriptor = feature.createSearchNavigatorFeatureModule({
            id: 'navigator_custom',
            document: fixture.document,
            adapter: fixture.adapter,
            ui: { Button: ui.Button },
            dialogManager: fixture.dialogManager,
            mount: mountInto(fixture.document.body),
            overlayMount: mountInto(fixture.document.body),
            enableQuote: false
        });
        assert.equal(descriptor.defaultEnabled, false);
        const navigator = new feature.SearchNavigator();
        const provided = new Map();
        const lifecycle = descriptor.create({
            requireCapability(name) {
                assert.equal(name, 'search.navigator');
                return navigator;
            },
            provideCapability(name, value) { provided.set(name, value); }
        });
        lifecycle.start();
        assert.deepEqual(navigator.getStats(), {
            chats: 0, messages: 0, documents: 0
        });
        assert.equal(provided.get('search.navigator.view').started, true);
        lifecycle.stop();
        navigator.dispose();
    });

    it('integrates both descriptors through ModuleHost without duplicate providers', async () => {
        const fixture = makeFixture();
        const host = new ModuleHost({ session: 'host-one' });
        host.register(feature.createSearchNavigatorModule());
        host.register(feature.createSearchNavigatorFeatureModule({
            document: fixture.document,
            adapter: fixture.adapter,
            ui: { Button: ui.Button },
            dialogManager: fixture.dialogManager,
            mount: mountInto(fixture.document.body),
            overlayMount: mountInto(fixture.document.body),
            enableQuote: false
        }));
        await host.start('search-navigator');
        await host.start('search-navigator-view');
        const navigator = host.requireCapability('search.navigator');
        assert.equal(host.requireCapability('search.navigator.view').navigator, navigator);
        await host.changeSession('host-two');
        assert.deepEqual(navigator.getStats(), { chats: 0, messages: 0, documents: 0 });
        await host.dispose();
        expectCode(() => navigator.getStats(), 'DISPOSED');
    });
});

describe('legacy Quote Reply facade', () => {
    it('retains the legacy id while mounting one shared Search & Navigator capability', async () => {
        const quote = quoteFacade;
        const document = new FakeDocument();
        const selection = makeSelection(document);
        const inserted = [];
        const adapter = {
            getInputEditor: () => document.createElement('textarea'),
            isInsideInputEditor: () => false,
            isInsideChatContent: () => true,
            getChatTitleText: () => 'Title',
            getCurrentHref: () => 'https://example.test',
            insertComposerText(text, options) { inserted.push({ text, options }); return true; }
        };
        const logs = [];
        const module = quote.createQuoteReplyModule({
            document,
            adapter,
            ui: { Button: ui.Button },
            logger: { info(message) { logs.push(message); } },
            selectionProvider: () => selection,
            schedule: () => 1,
            cancelSchedule() {}
        });
        assert.equal(module.id, 'quote-reply');
        assert.equal(module.key, 'quote-reply');
        assert.equal(module.toggleId, 'quote-reply');
        assert.equal(module.name, '搜索与导航 / Search & Navigator');
        assert.equal(module.legacyName, '引用回复 / Quote Reply');
        assert.equal(module.defaultEnabled, false);
        assert.equal(module.controller, null);
        assert.equal(module.navigator, null);
        assert.equal(module.capability, null);
        assert.equal(module.getPortableArchiveIntegration(), null);
        assert.equal(module.destroy(), false);
        assert.equal(module.onUserChange('nobody'), null);
        assert.equal(module.renderToDetailsPane(document.body), null);
        assert.equal(module.search('x'), null);
        assert.equal(module.indexArchive([]), null);
        assert.equal(module._insertQuote('x'), false);
        assert.equal(module._insertSnippetPacket('x'), false);
        assert.equal(module._insertEditorText('x'), false);
        assert.equal(module.onDOMChange(), false);
        assert.equal(module.onRouteChange(), false);
        assert.equal(module.configure(), module);
        assert.equal(module.configure({ quoteDelay: 0 }), module);
        assert.throws(() => module.configure(null), /configuration must be an object/);
        assert.equal(await module.init({ session: 'first' }), true);
        assert.equal(await module.init(), false);
        assert.ok(module.controller);
        assert.equal(module.controller.navigator, module.navigator);
        assert.ok(Object.isFrozen(module.capability));
        const firstIntegration = module.getPortableArchiveIntegration();
        assert.equal(Object.isFrozen(firstIntegration), true);
        assert.deepEqual(Object.keys(firstIntegration), ['section', 'exportSection', 'contributor']);
        assert.deepEqual(Object.keys(firstIntegration.contributor), ['snapshot', 'apply', 'rollback']);
        assert.deepEqual(await firstIntegration.exportSection({ signal: null }), []);
        assert.equal(module.getPortableArchiveIntegration(), firstIntegration);
        assert.throws(() => module.configure({}), /while it is running/);
        assert.deepEqual(await module.onUserChange('pre-details'), {
            chats: 0, messages: 0, documents: 0
        });
        await assert.rejects(firstIntegration.exportSection(), error => error.code === 'SESSION_CHANGED');
        const portable = module.getPortableArchiveIntegration();
        assert.deepEqual(
            await portable.exportSection({ signal: new AbortController().signal }),
            []
        );
        assert.equal(module.onDOMChange(), true);
        assert.equal(module.onRouteChange(), true);
        await assert.rejects(portable.exportSection(null), error => error.code === 'INVALID_EXPORT_OPTIONS');
        await assert.rejects(portable.exportSection({ signal: {} }), error => error.code === 'INVALID_ABORT_SIGNAL');
        const abortedExport = new AbortController();
        abortedExport.abort();
        await assert.rejects(
            portable.exportSection({ signal: abortedExport.signal }),
            error => error.code === 'ARCHIVE_ABORTED'
        );
        assert.equal(module.capability.captureQuoteAnchor().text, 'selected text');
        assert.equal(module.capability.insertQuoteAnchor({ text: 'capability quote' }), true);
        const toolbarAnchor = module.controller.captureQuoteAnchor();
        module.controller._showQuoteActions({ x: 10, y: 10 }, toolbarAnchor, false);
        assert.ok(module.controller.quoteActions.element.isConnected);
        module.controller._removeQuoteActions(false);
        const details = document.createElement('section');
        document.body.append(details);
        const content = module.renderToDetailsPane(details);
        assert.equal(module.renderToDetailsPane(details), content);
        assert.throws(() => module.controller.setIndexStatus(null), error => error.code === 'INVALID_DEPENDENCY');
        module.controller.setIndexStatus({ state: 'empty', archive: 'ready' });
        assert.match(module.controller.dialogState.status.textContent, /no chats/i);
        module.controller.setIndexStatus({ state: 'empty', archive: 'failed' });
        assert.match(module.controller.dialogState.status.textContent, /could not be read/i);
        module.controller.setIndexStatus({
            state: 'ready', archive: 'ready', chats: 1, messages: 1, documents: 2
        });
        assert.match(module.controller.dialogState.status.textContent, /1 local chat and 1 message/);
        module.controller.setIndexStatus({
            state: 'ready', archive: 'ready', chats: 2, messages: 2, documents: 4
        });
        assert.match(module.controller.dialogState.status.textContent, /2 local chats and 2 messages/);
        assert.equal(module.controller._renderSearch(null).query, '');
        assert.equal(module.indexArchive([{ id: 'archive', title: 'Shared needle' }]).imported, 1);
        assert.equal((await portable.exportSection()).at(0).id, 'archive');
        assert.equal(module.search('needle').total, 1);
        assert.deepEqual(module.capability.getStats(), { chats: 1, messages: 0, documents: 1 });
        module.controller._renderSearch('needle');
        module.controller.setIndexStatus({
            state: 'degraded', archive: 'failed', chats: 1, messages: 0, documents: 1
        });
        assert.match(module.controller.dialogState.status.textContent, /could not be read/i);
        module.controller._renderSearch('absent');
        assert.match(module.controller.dialogState.empty.textContent, /No matching/);
        module.controller._renderSearch('needle');
        assert.equal(
            module.controller.dialogState.status.getAttribute('data-capability-state'),
            'degraded'
        );
        await assert.rejects(
            module.capability.jumpToResult(module.search('needle').items[0]),
            error => error.code === 'JUMP_DEGRADED'
        );
        assert.equal(module._insertQuote('line'), true);
        assert.equal(module._insertSnippetPacket('packet'), true);
        assert.equal(module._insertEditorText('raw'), true);
        assert.equal(inserted.every(item => item.options.submit === false), true);
        assert.deepEqual(await module.onUserChange('second'), { chats: 0, messages: 0, documents: 0 });
        await assert.rejects(portable.exportSection(), error => error.code === 'SESSION_CHANGED');
        assert.equal(details.children.length, 1);
        assert.equal(logs.length, 1);
        const inactive = module.getPortableArchiveIntegration();
        assert.equal(module.destroy(), true);
        await assert.rejects(inactive.exportSection(), error => error.code === 'FEATURE_INACTIVE');
        assert.equal(module.controller, null);
        assert.equal(module.navigator, null);
        assert.equal(module.capability, null);
        assert.equal(module.destroy(), false);
    });

    it('uses production defaults and rolls back failed initial archive assembly', async () => {
        const previousDocument = globalThis.document;
        const document = new FakeDocument();
        globalThis.document = document;
        try {
            const defaults = quoteFacade.createQuoteReplyModule();
            assert.equal(await defaults.init(), true);
            defaults.controller._showQuoteActions(
                { x: 1, y: 1 },
                { text: 'manual', title: '', href: '' },
                false
            );
            assert.ok(defaults.controller.quoteActions.element.isConnected);
            assert.equal(defaults.destroy(), true);

            const metadataFree = quoteFacade.createQuoteReplyModule({
                document,
                adapter: {
                    getInputEditor: () => document.createElement('textarea'),
                    isInsideInputEditor: () => false,
                    isInsideChatContent: () => true,
                    insertComposerText: () => true
                },
                ui: { Button: ui.Button },
                logger: { info() {} }
            });
            assert.equal(await metadataFree.init(), true);
            assert.equal(metadataFree._insertSnippetPacket('without metadata'), true);
            metadataFree.destroy();

            const fixture = makeFixture();
            const broken = quoteFacade.createQuoteReplyModule({
                document: fixture.document,
                adapter: fixture.adapter,
                ui: { Button: ui.Button },
                logger: { info() {} },
                selectionProvider: () => fixture.selection,
                initialArchive: {},
                importOptions: { mode: 'merge' }
            });
            await assert.rejects(broken.init(), error => error.code === 'INVALID_ARCHIVE');
            assert.equal(broken.controller, null);
        } finally {
            globalThis.document = previousDocument;
        }
    });

    it('indexes visible/current Gemini data and refuses restore through inspection scopes', async () => {
        const document = new FakeDocument();
        const adapter = {
            getInputEditor: () => document.createElement('textarea'),
            isInsideInputEditor: () => false,
            isInsideChatContent: () => true,
            scanSidebarChatLinks: () => [{ id: 'sidebar-chat', title: 'Sidebar needle' }],
            getChatId: () => 'current-chat',
            getChatTitleText: () => 'Current title',
            getCurrentConversationMessages: () => [{ id: 'm1', role: 'user', text: 'Live message needle' }],
            insertComposerText: () => true
        };
        const module = quoteFacade.createQuoteReplyModule({
            document,
            adapter,
            ui: { Button: ui.Button },
            logger: { info() {} },
            observeChanges: () => () => {}
        });
        assert.equal(await module.init({
            session: {
                kind: 'inspection',
                sessionUserId: 'owner@example.test',
                targetUserId: 'inspected@example.test',
                readOnly: true
            }
        }), true);
        assert.equal(module.search('Sidebar').total, 1);
        assert.equal(module.search('Live').total, 1);
        assert.equal(module.capability.getIndexStatus().state, 'degraded');
        const integration = module.getPortableArchiveIntegration();
        assert.equal((await integration.exportSection()).length, 2);
        await assert.rejects(
            integration.contributor.snapshot({
                section: 'chats', plan: {}, actions: [], signal: null
            }),
            error => error.code === 'READ_ONLY_SESSION'
        );
        module.destroy();
    });
});
