const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let api;
let batchFacade;
let Core;
let themeState;

before(async () => {
    api = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'features', 'bulk_lifecycle', 'index.js')
    ).href);
    batchFacade = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'modules', 'batch_delete.js')
    ).href);
    ({ Core } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'core.js')).href));
    themeState = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'state.js')).href);
});

class FakeEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.key = options.key || '';
        this.shiftKey = Boolean(options.shiftKey);
        this.bubbles = Boolean(options.bubbles);
        this.target = options.target || null;
        this.defaultPrevented = false;
        this.propagationStopped = false;
    }

    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
}

class FakeEventTarget {
    constructor() { this.listeners = new Map(); }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) {
        this.listeners.get(type)?.delete(listener);
    }

    dispatchEvent(event) {
        if (!event.target) event.target = this;
        for (const listener of [...(this.listeners.get(event.type) || [])]) listener.call(this, event);
        return !event.defaultPrevented;
    }
}

function elementMatches(element, selector) {
    const value = selector.trim();
    if (!value) return false;
    if (value.startsWith('#')) return element.id === value.slice(1);
    if (value.startsWith('.')) return element.className.split(/\s+/).includes(value.slice(1));
    const role = value.match(/^\[role="([^"]+)"\]$/);
    if (role) return element.getAttribute('role') === role[1];
    if (value === 'a[href]') return element.tagName === 'A' && element.hasAttribute('href');
    const enabledTag = value.match(/^(button|input|select|textarea):not\(\[disabled\]\)$/);
    if (enabledTag) return element.tagName === enabledTag[1].toUpperCase() && !element.disabled;
    if (value === '[tabindex]:not([tabindex="-1"])') return element.tabIndex !== undefined && element.tabIndex !== -1;
    return element.tagName === value.toUpperCase();
}

class FakeElement extends FakeEventTarget {
    constructor(tagName, ownerDocument) {
        super();
        this.tagName = String(tagName).toUpperCase();
        this.ownerDocument = ownerDocument;
        this.nodeType = 1;
        this.children = [];
        this.parentNode = null;
        this.parentElement = null;
        this.attributes = new Map();
        const styleProperties = new Map();
        this.style = {
            cssText: '',
            setProperty(name, value) { styleProperties.set(name, String(value)); },
            getPropertyValue(name) { return styleProperties.get(name) || ''; }
        };
        this.className = '';
        this.id = '';
        this.textContent = '';
        this.title = '';
        this.type = '';
        this.value = '';
        this.checked = false;
        this.disabled = false;
        this.hidden = false;
        this.inert = false;
        this.tabIndex = undefined;
        this.clicked = 0;
    }

    get firstChild() { return this.children[0] || null; }
    get isConnected() {
        if (this === this.ownerDocument.body) return true;
        return Boolean(this.parentNode?.isConnected);
    }

    append(...nodes) {
        for (const node of nodes) {
            if (node.parentNode) node.remove();
            node.parentNode = this;
            node.parentElement = this;
            this.children.push(node);
        }
    }

    prepend(...nodes) {
        for (const node of [...nodes].reverse()) {
            if (node.parentNode) node.remove();
            node.parentNode = this;
            node.parentElement = this;
            this.children.unshift(node);
        }
    }

    replaceChildren(...nodes) {
        for (const child of this.children) {
            child.parentNode = null;
            child.parentElement = null;
        }
        this.children = [];
        this.append(...nodes);
    }

    remove() {
        if (!this.parentNode) return;
        const index = this.parentNode.children.indexOf(this);
        if (index >= 0) this.parentNode.children.splice(index, 1);
        this.parentNode = null;
        this.parentElement = null;
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }

    contains(node) {
        if (node === this) return true;
        return this.children.some(child => child.contains(node));
    }

    querySelectorAll(selector) {
        const selectors = selector.split(',');
        const matches = [];
        const visit = node => {
            for (const child of node.children) {
                if (selectors.some(candidate => elementMatches(child, candidate))) matches.push(child);
                visit(child);
            }
        };
        visit(this);
        return matches;
    }

    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

    click() {
        if (this.disabled) return;
        this.clicked += 1;
        this.dispatchEvent(new FakeEvent('click', { target: this }));
    }

    focus() { this.ownerDocument.activeElement = this; }

    closest(selector) {
        let current = this;
        while (current) {
            if (elementMatches(current, selector)) return current;
            current = current.parentElement;
        }
        return null;
    }
}

class FakeDocument extends FakeEventTarget {
    constructor() {
        super();
        this.body = new FakeElement('body', this);
        this.activeElement = this.body;
    }

    createElement(tagName) { return new FakeElement(tagName, this); }
    getElementById(id) { return this.body.querySelector(`#${id}`); }
    querySelector(selector) { return this.body.querySelector(selector); }
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
}

class FakeWindow extends FakeEventTarget {
    constructor(href = 'https://gemini.google.com/app') {
        super();
        this.location = { href };
        this.MouseEvent = FakeEvent;
    }
}

class FakeDialogs {
    constructor() {
        this.records = [];
        this.destroyed = false;
    }

    open(options) {
        let open = true;
        const handle = {
            id: options.id,
            element: options.content,
            get open() { return open; },
            close(reason = 'programmatic') {
                if (!open) return false;
                open = false;
                options.onClose?.(reason, handle);
                return true;
            }
        };
        this.records.push({ options, handle });
        options.initialFocus?.focus?.();
        return handle;
    }

    escape() {
        const record = [...this.records].reverse().find(candidate => candidate.handle.open);
        if (!record || record.options.closeOnEscape === false) return false;
        return record.handle.close('escape');
    }

    destroy() { this.destroyed = true; }
}

function descendants(root) {
    const items = [];
    const visit = node => {
        for (const child of node.children) {
            items.push(child);
            visit(child);
        }
    };
    visit(root);
    return items;
}

function byText(root, text, tag = null) {
    return descendants(root).find(element =>
        (!tag || element.tagName === tag.toUpperCase()) && element.textContent === text
    ) || null;
}

function allByTag(root, tag) {
    return descendants(root).filter(element => element.tagName === tag.toUpperCase());
}

function inputByType(root, type) {
    return allByTag(root, 'input').find(element => element.type === type) || null;
}

function conversation(id, title = `Title ${id}`, href = `/app/${id}`) {
    return { id, title, href };
}

function scope(overrides = {}) {
    return {
        kind: 'visible-sidebar',
        label: 'Visible sidebar',
        routeKey: '/app',
        sessionKey: 'user@example.com',
        ...overrides
    };
}

function snapshot(items, overrides = {}) {
    return api.createRunSnapshot({
        items,
        selectedIds: items.map(item => item.id),
        scope: scope(),
        capturedAt: '2026-08-01T00:00:00.000Z',
        ...overrides
    });
}

function archiveResult(items, overrides = {}) {
    const digest = overrides.digest || 'a'.repeat(64);
    return {
        accepted: true,
        checkpoint: {
            kind: 'portable-archive',
            id: `sha256:${digest}`,
            checksum: { algorithm: 'SHA-256', value: digest },
            itemCount: items.length,
            selectedIds: items.map(item => item.id),
            createdAt: '2026-08-01T00:00:01.000Z',
            sizeBytes: 512,
            persisted: true,
            ...overrides
        }
    };
}

class TestAdapter {
    constructor(items = [conversation('a'), conversation('b')]) {
        this.items = new Map(items.map(item => [item.id, { ...item }]));
        this.scope = scope();
        this.deleteCalls = [];
        this.verifyErrors = new Map();
        this.deleteBehaviors = new Map();
        this.document = new FakeDocument();
        this.toolbarTarget = this.document.createElement('div');
        this.document.body.append(this.toolbarTarget);
        this.rowTargets = new Map(items.map(item => {
            const row = this.document.createElement('div');
            this.document.body.append(row);
            return [item.id, row];
        }));
        this.toolbarMountCount = 0;
        this.selectionMountCount = 0;
        this.routeListeners = new Set();
        this.sessionValues = [];
        this.mountAvailable = true;
        this.skipSelectionMount = new Set();
    }

    setSession(value) {
        this.sessionValues.push(value);
        this.scope.sessionKey = String(value ?? '');
    }

    getRunScope() { return { ...this.scope }; }
    listConversations() { return [...this.items.values()].map(item => ({ ...item })); }
    async getConversationSnapshot(id) {
        if (this.verifyErrors.has(id)) throw this.verifyErrors.get(id);
        const item = this.items.get(id);
        return item ? { ...item } : null;
    }

    async deleteConversation(item, options) {
        this.deleteCalls.push({ id: item.id, options });
        const behavior = this.deleteBehaviors.get(item.id);
        if (typeof behavior === 'function') return behavior(item, options, this);
        if (behavior instanceof Error) throw behavior;
        return behavior === undefined ? { deleted: true } : behavior;
    }

    mountToolbar(element) {
        if (!this.mountAvailable) return null;
        this.toolbarMountCount += 1;
        this.toolbarTarget.prepend(element);
        return {
            element,
            get isConnected() { return element.isConnected; },
            remove() { element.remove(); }
        };
    }

    mountSelectionControl(id, element) {
        if (this.skipSelectionMount.has(id)) return null;
        const target = this.rowTargets.get(id);
        if (!target) return null;
        this.selectionMountCount += 1;
        target.prepend(element);
        return {
            element,
            get isConnected() { return element.isConnected; },
            remove() { element.remove(); }
        };
    }

    subscribeRouteChange(listener) {
        this.routeListeners.add(listener);
        return () => this.routeListeners.delete(listener);
    }

    emitRoute() {
        for (const listener of [...this.routeListeners]) listener();
    }
}

function createFeature(options = {}) {
    const document = options.document || new FakeDocument();
    const adapter = options.adapter || new TestAdapter();
    const dialogs = options.dialogs || new FakeDialogs();
    const feature = new api.BulkLifecycleFeature({
        document,
        adapter,
        dialogs,
        archiveCapability: options.archiveCapability || null,
        translate: options.translate || ((_zh, en) => en),
        now: options.now || (() => '2026-08-01T00:00:00.000Z')
    });
    return { feature, document, adapter, dialogs };
}

describe('bulk lifecycle immutable snapshot', () => {
    it('normalizes conversations, scopes, confirmation phrases, and exact snapshot matches', () => {
        assert.deepEqual(api.normalizeConversation({ id: ' a ', title: ' A ', href: ' /app/a ' }), {
            id: 'a',
            title: 'A',
            href: '/app/a',
            fingerprint: '["a","A","/app/a"]'
        });
        assert.equal(api.normalizeConversation({ id: 'no-href', title: 'No href' }).href, '');
        assert.equal(api.conversationMatches(conversation('a'), conversation('a')), true);
        assert.equal(api.conversationMatches(conversation('a'), conversation('a', 'Changed')), false);
        assert.equal(api.conversationMatches(conversation('a'), null), false);
        assert.equal(api.conversationMatches(conversation('a'), { id: '', title: '' }), false);
        assert.equal(api.sameRunScope(scope(), scope()), true);
        assert.equal(api.sameRunScope(scope(), scope({ kind: 'other' })), false);
        assert.equal(api.sameRunScope(scope(), scope({ routeKey: '/other' })), false);
        assert.equal(api.sameRunScope(scope(), scope({ sessionKey: 'other' })), false);
        assert.equal(api.confirmationPhrase(2), 'DELETE 2');
        assert.throws(() => api.confirmationPhrase(0), error => error.code === 'INVALID_COUNT');
        assert.throws(() => api.confirmationPhrase(1.5), error => error.code === 'INVALID_COUNT');

        const run = api.createRunSnapshot({
            items: [conversation('a'), conversation('b')],
            selectedIds: ['b', 'b'],
            scope: scope(),
            capturedAt: 'now'
        });
        assert.equal(Object.isFrozen(run), true);
        assert.deepEqual(run.items.map(item => item.id), ['b']);
        assert.equal(Object.isFrozen(run.items), true);
    });

    it('rejects malformed, duplicate, empty, and stale selections without repairing them', () => {
        for (const value of [null, [], 'bad']) {
            assert.throws(() => api.normalizeConversation(value), error => error.code === 'INVALID_CONVERSATION');
        }
        assert.throws(() => api.normalizeConversation({ id: '', title: 'A' }), /id/);
        assert.throws(() => api.normalizeConversation({ id: null, title: 'A' }), /id/);
        assert.throws(() => api.normalizeConversation({ id: 'a', title: '' }), /title/);
        assert.throws(() => api.createRunSnapshot(), error => error.code === 'INVALID_SELECTION');
        assert.throws(() => api.createRunSnapshot({ items: [], selectedIds: [], scope: scope(), capturedAt: 'now' }), error => error.code === 'EMPTY_SELECTION');
        assert.throws(() => api.createRunSnapshot({
            items: [conversation('a'), conversation('a')],
            selectedIds: ['a'], scope: scope(), capturedAt: 'now'
        }), error => error.code === 'DUPLICATE_CONVERSATION');
        assert.throws(() => api.createRunSnapshot({
            items: [conversation('a')], selectedIds: ['b'], scope: scope(), capturedAt: 'now'
        }), error => error.code === 'SELECTION_STALE' && error.details.id === 'b');
        assert.throws(() => api.createRunSnapshot({
            items: [conversation('a')], selectedIds: [' '], scope: scope(), capturedAt: 'now'
        }), /selected id/);
        assert.throws(() => api.createRunSnapshot({
            items: [conversation('a')], selectedIds: ['a'], scope: null, capturedAt: 'now'
        }), error => error.code === 'INVALID_SCOPE');
        assert.throws(() => api.createRunSnapshot({
            items: [conversation('a')], selectedIds: ['a'], scope: [], capturedAt: 'now'
        }), error => error.code === 'INVALID_SCOPE');
        assert.throws(() => api.createRunSnapshot({
            items: [conversation('a')], selectedIds: ['a'], scope: scope({ label: '' }), capturedAt: 'now'
        }), /scope label/);
        assert.throws(() => api.createRunSnapshot({
            items: [conversation('a')], selectedIds: ['a'], scope: scope(), capturedAt: ''
        }), /capturedAt/);
    });
});

describe('Bulk Lifecycle archive capability contract', () => {
    it('normalizes only bounded, explicit, duplicate-free selections', () => {
        const normalized = api.normalizeBulkArchiveSelection([
            { id: ' a ', title: ' A ', href: ' /app/a ', ignored: true }
        ]);
        assert.deepEqual(normalized, [{ id: 'a', title: 'A', href: '/app/a' }]);
        assert.equal(Object.isFrozen(normalized), true);
        assert.equal(Object.isFrozen(normalized[0]), true);
        assert.throws(() => api.normalizeBulkArchiveSelection([], { maxItems: 0 }), /maxItems/);
        for (const items of [null, [], [null], [{ id: '', title: 'A' }], [{ id: 'a', title: '' }]]) {
            assert.throws(() => api.normalizeBulkArchiveSelection(items), error =>
                error.code === 'INVALID_ARCHIVE_SELECTION');
        }
        assert.throws(() => api.normalizeBulkArchiveSelection([
            conversation('a'), conversation('a')
        ]), /Duplicate/);
        assert.throws(() => api.normalizeBulkArchiveSelection([
            conversation('a'), conversation('b')
        ], { maxItems: 1 }), error => error.code === 'ARCHIVE_SELECTION_LIMIT');
        const nullPrototype = Object.assign(Object.create(null), { id: 'plain', title: 'Plain' });
        assert.deepEqual(api.normalizeBulkArchiveSelection([nullPrototype]), [
            { id: 'plain', title: 'Plain', href: '' }
        ]);
        assert.throws(() => api.normalizeBulkArchiveSelection([
            { id: null, title: 'Missing id' }
        ]), /non-empty/);
    });

    it('requires a persisted checkpoint matching the exact selection', () => {
        const items = [conversation('a')];
        assert.equal(api.normalizeArchiveCapability(null), null);
        assert.equal(api.normalizeArchiveCapability(undefined), null);
        const capability = { archive() {} };
        assert.equal(api.normalizeArchiveCapability(capability), capability);
        for (const invalid of [{}, [], 'archive']) {
            assert.throws(() => api.normalizeArchiveCapability(invalid), /archive/);
        }

        const valid = api.verifyBulkArchiveCheckpoint(archiveResult(items), items);
        assert.equal(valid.id, `sha256:${'a'.repeat(64)}`);
        assert.equal(Object.isFrozen(valid.selectedIds), true);
        for (const invalid of [
            null,
            {},
            { accepted: false },
            archiveResult(items, { kind: 'other' }),
            archiveResult(items, { checksum: { algorithm: 'MD5', value: 'a'.repeat(64) } }),
            archiveResult(items, { id: 'wrong' }),
            archiveResult(items, { itemCount: 2 }),
            archiveResult(items, { selectedIds: ['other'] }),
            archiveResult(items, { createdAt: 'not-a-date' }),
            archiveResult(items, { sizeBytes: 0 }),
            archiveResult(items, { persisted: false })
        ]) {
            assert.throws(() => api.verifyBulkArchiveCheckpoint(invalid, items), error =>
                error.code === 'INVALID_ARCHIVE_CHECKPOINT');
        }
    });

    function providerHarness(overrides = {}) {
        let selected = [{ id: 'prior', title: 'Prior', href: '/app/prior' }];
        const downloads = [];
        const state = { available: true, generation: 1 };
        const controller = {
            bulkExporting: false,
            bulkCancelRequested: false,
            getSelectedBulkChats: () => selected.map(item => ({ ...item })),
            clearBulkSelection: () => { selected = []; },
            selectVisibleBulkChats: items => { selected = items.map(item => ({ ...item })); },
            collectSelectedTranscripts: async () => ({
                chats: selected.map(item => ({
                    chatId: item.id,
                    title: item.title,
                    status: 'exported',
                    messages: [{ role: 'user', text: item.title }]
                }))
            }),
            download: async (...args) => { downloads.push(args); },
            ...overrides.controller
        };
        const capability = api.createLegacyBulkArchiveCapability({
            controller,
            getSource: overrides.getSource || (() => ({ app: 'test' })),
            now: overrides.now || (() => '2026-08-01T00:00:00.000Z'),
            isAvailable: overrides.isAvailable || (() => state.available),
            getGeneration: overrides.getGeneration || (() => state.generation),
            maxItems: overrides.maxItems
        });
        return { capability, controller, downloads, state, getSelected: () => selected };
    }

    it('validates the legacy archive provider ports, context, signals, and capture results', async () => {
        const valid = providerHarness();
        const baseController = valid.controller;
        for (const method of [
            'getSelectedBulkChats', 'clearBulkSelection', 'selectVisibleBulkChats',
            'collectSelectedTranscripts', 'download'
        ]) {
            assert.throws(() => api.createLegacyBulkArchiveCapability({
                controller: { ...baseController, [method]: null },
                getSource() {}, now() {}, isAvailable() {}, getGeneration() {}
            }), new RegExp(method));
        }
        for (const [name, overrides] of [
            ['getSource', { getSource: null }],
            ['now', { now: null }],
            ['isAvailable', { isAvailable: null }],
            ['getGeneration', { getGeneration: null }]
        ]) {
            assert.throws(() => api.createLegacyBulkArchiveCapability({
                controller: baseController,
                getSource: () => ({}), now: () => 'now', isAvailable: () => true, getGeneration: () => 1,
                ...overrides
            }), new RegExp(name));
        }
        assert.throws(() => providerHarness({ maxItems: 0 }), /maxItems/);

        const items = [conversation('a')];
        const context = { scope: { kind: 'visible-sidebar' }, capturedAt: 'captured' };
        for (const badContext of [null, [], {}, { scope: null, capturedAt: 'x' },
            { scope: {}, capturedAt: 'x' }, { scope: { kind: 'x' }, capturedAt: '' }]) {
            await assert.rejects(valid.capability.archive(items, badContext), /context/);
        }
        for (const signal of [1, {}, { aborted: false }, {
            aborted: false, addEventListener() {}
        }]) {
            await assert.rejects(valid.capability.archive(items, { ...context, signal }), /AbortSignal/);
        }

        valid.controller.bulkExporting = true;
        await assert.rejects(valid.capability.archive(items, context), /already capturing/);
        valid.controller.bulkExporting = false;
        valid.state.available = false;
        await assert.rejects(valid.capability.archive(items, context), error => error.code === 'ARCHIVE_UNAVAILABLE');
        valid.state.available = true;
        valid.state.generation = 2;
        const generationMismatch = providerHarness({ getGeneration: (() => {
            let call = 0;
            return () => (++call === 1 ? 1 : 2);
        })() });
        await assert.rejects(generationMismatch.capability.archive(items, context), error =>
            error.code === 'ARCHIVE_UNAVAILABLE');

        for (const chats of [null, 'chats', [], [null], [{ chatId: 1 }], [
            { chatId: 'a' }, { chatId: 'a' }
        ], [{ chatId: 'a', status: 'failed' }], [{ chatId: 'other' }]]) {
            const broken = providerHarness({
                controller: { collectSelectedTranscripts: async () => ({ chats }) }
            });
            await assert.rejects(broken.capability.archive(items, context), /Archive capture/);
            assert.deepEqual(broken.getSelected().map(item => item.id), ['prior']);
        }
        const unavailable = providerHarness({
            controller: { collectSelectedTranscripts: async () => null }
        });
        await assert.rejects(unavailable.capability.archive(items, context), /capture was unavailable/);
    });

    it('persists one exact portable archive, restores selection, and honors cancellation without retry', async () => {
        const harness = providerHarness();
        const items = [conversation('a')];
        const context = { scope: { kind: 'visible-sidebar' }, capturedAt: 'captured', signal: null };
        const result = await harness.capability.archive(items, context);
        const checkpoint = api.verifyBulkArchiveCheckpoint(result, items);
        assert.equal(harness.downloads.length, 1);
        assert.deepEqual(harness.getSelected().map(item => item.id), ['prior']);
        assert.equal(checkpoint.persisted, true);

        const aborted = {
            aborted: true,
            reason: undefined,
            addEventListener() {},
            removeEventListener() {}
        };
        await assert.rejects(harness.capability.archive(items, {
            ...context, signal: aborted
        }), error => error.code === 'ABORTED');

        let cancelListener;
        const eagerSignal = {
            aborted: false,
            addEventListener(_type, listener) { cancelListener = listener; listener(); },
            removeEventListener(_type, listener) { assert.equal(listener, cancelListener); }
        };
        const eager = providerHarness();
        await eager.capability.archive(items, { ...context, signal: eagerSignal });
        assert.equal(eager.controller.bulkCancelRequested, true);

        const abortsBeforeCapture = {
            aborted: false,
            reason: 'before-capture',
            addEventListener() { this.aborted = true; },
            removeEventListener() {}
        };
        await assert.rejects(harness.capability.archive(items, {
            ...context,
            signal: abortsBeforeCapture
        }), error => error.code === 'ABORTED' && /before-capture/.test(error.message));

        const abortsDuringCapture = {
            aborted: false,
            reason: 'during-capture',
            addEventListener() {},
            removeEventListener() {}
        };
        const interrupted = providerHarness({
            controller: {
                collectSelectedTranscripts: async () => {
                    abortsDuringCapture.aborted = true;
                    return { chats: [{ chatId: 'a', status: 'exported', messages: [] }] };
                }
            }
        });
        await assert.rejects(interrupted.capability.archive(items, {
            ...context,
            signal: abortsDuringCapture
        }), error => error.code === 'ABORTED' && /during-capture/.test(error.message));
        assert.equal(interrupted.downloads.length, 0);

        const changesGeneration = providerHarness({
            controller: {
                collectSelectedTranscripts: async () => {
                    changesGeneration.state.generation += 1;
                    return { chats: [{ chatId: 'a', status: 'exported', messages: [] }] };
                }
            }
        });
        await assert.rejects(changesGeneration.capability.archive(items, context), error =>
            error.code === 'ARCHIVE_UNAVAILABLE');
        assert.equal(changesGeneration.downloads.length, 0);
    });
});

describe('BulkLifecycleRunner', () => {
    it('validates injected boundaries and refuses invalid or concurrent runs', async () => {
        const valid = new TestAdapter([conversation('a')]);
        for (const method of ['getRunScope', 'getConversationSnapshot', 'deleteConversation']) {
            const adapter = Object.create(valid);
            adapter[method] = null;
            assert.throws(() => new api.BulkLifecycleRunner({ adapter }), new RegExp(method));
        }
        assert.throws(() => new api.BulkLifecycleRunner({ adapter: valid, archiveCapability: {} }), /archive/);
        assert.throws(() => new api.BulkLifecycleRunner({ adapter: valid, onChange: 1 }), /onChange/);

        const runner = new api.BulkLifecycleRunner({ adapter: valid });
        assert.equal(runner.active, false);
        assert.equal(runner.hasArchive, false);
        assert.equal(runner.report, null);
        assert.equal(runner.cancel(), false);
        await assert.rejects(runner.execute(null), error => error.code === 'INVALID_SNAPSHOT');
        await assert.rejects(
            runner.execute(snapshot([conversation('a')]), { archiveRequested: 'yes' }),
            /archiveRequested/
        );
        assert.equal(runner.setArchiveCapability(null), false);
        assert.throws(() => runner.setArchiveCapability({}), /archive/);
        const capability = { archive() {} };
        assert.equal(runner.setArchiveCapability(capability), true);
        assert.equal(runner.hasArchive, true);
        assert.equal(runner.setArchiveCapability(capability), false);
        assert.equal(runner.setArchiveCapability(null), true);

        let release;
        valid.deleteBehaviors.set('a', (_item, { signal }) => new Promise((resolve, reject) => {
            release = () => resolve(true);
            signal.addEventListener('abort', () => reject(Object.assign(new Error('stop'), { name: 'AbortError' })), { once: true });
        }));
        const first = runner.execute(snapshot([conversation('a')]));
        await new Promise(resolve => setImmediate(resolve));
        await assert.rejects(runner.execute(snapshot([conversation('a')])), error => error.code === 'RUN_ACTIVE');
        release();
        assert.equal((await first).phase, 'succeeded');
    });

    it('reports every failure class without retry and stops before the explicit remainder', async () => {
        const cases = [
            ['missing', adapter => adapter.items.delete('missing'), 'stale', 'snapshot-mismatch'],
            ['verify', adapter => adapter.verifyErrors.set('verify', new Error('verify failed')), 'failed', 'verify failed'],
            ['verify-string', adapter => adapter.verifyErrors.set('verify-string', 'string failure'), 'failed', 'string failure'],
            ['verify-null', adapter => adapter.verifyErrors.set('verify-null', null), 'failed', 'Snapshot verification failed'],
            ['false', adapter => adapter.deleteBehaviors.set('false', false), 'failed', 'delete-rejected'],
            ['object-false', adapter => adapter.deleteBehaviors.set('object-false', { deleted: false, error: 'native refused' }), 'failed', 'native refused'],
            ['object-stale', adapter => adapter.deleteBehaviors.set('object-stale', { stale: true }), 'stale', 'snapshot-mismatch'],
            ['throw', adapter => adapter.deleteBehaviors.set('throw', new Error('native failed')), 'failed', 'native failed']
        ];
        for (const [id, configure, status, message] of cases) {
            const adapter = new TestAdapter([conversation(id)]);
            configure(adapter);
            const reports = [];
            const report = await new api.BulkLifecycleRunner({
                adapter,
                onChange: value => reports.push(value)
            }).execute(snapshot([conversation(id)]));
            assert.equal(report.phase, 'failed');
            assert.equal(report.items[0].status, status);
            assert.equal(report.items[0].error, message);
            assert.ok(reports.length >= 3);
            assert.ok(adapter.deleteCalls.length <= 1);
        }

        const stop = new TestAdapter([conversation('ok'), conversation('blocked'), conversation('remainder')]);
        stop.deleteBehaviors.set('blocked', new Error('native failed'));
        const report = await new api.BulkLifecycleRunner({ adapter: stop })
            .execute(snapshot([conversation('ok'), conversation('blocked'), conversation('remainder')]));
        assert.equal(report.phase, 'partial-failure');
        assert.deepEqual(report.items.map(item => item.status), ['deleted', 'failed', 'skipped']);
        assert.deepEqual(stop.deleteCalls.map(call => call.id), ['ok', 'blocked']);
        assert.equal(report.items[2].error, 'stopped-after-failure');
    });

    it('archives once before deletion and blocks every delete when archive refuses or fails', async () => {
        const events = [];
        const adapter = new TestAdapter([conversation('a')]);
        adapter.deleteBehaviors.set('a', () => { events.push('delete'); return true; });
        const archive = {
            async archive(items, context) {
                events.push(`archive:${items.length}:${context.scope.kind}:${context.capturedAt}`);
                return archiveResult(items);
            }
        };
        const runner = new api.BulkLifecycleRunner({ adapter, archiveCapability: archive });
        assert.equal(runner.hasArchive, true);
        const success = await runner.execute(snapshot([conversation('a')]), { archiveRequested: true });
        assert.deepEqual(events, ['archive:1:visible-sidebar:2026-08-01T00:00:00.000Z', 'delete']);
        assert.equal(success.archive.status, 'created');
        assert.equal(success.archive.requested, true);
        assert.equal(success.archive.detail, `sha256:${'a'.repeat(64)}`);
        assert.deepEqual(success.archive.checkpoint.selectedIds, ['a']);
        assert.equal(Object.isFrozen(success.archive.checkpoint.checksum), true);

        const invalidCheckpoint = await new api.BulkLifecycleRunner({
            adapter: new TestAdapter([conversation('z')]),
            archiveCapability: { async archive() { return true; } }
        }).execute(snapshot([conversation('z')]), { archiveRequested: true });
        assert.equal(invalidCheckpoint.phase, 'blocked');
        assert.equal(invalidCheckpoint.archive.status, 'failed');

        for (const rejection of [false, { accepted: false }, new Error('archive offline')]) {
            const blockedAdapter = new TestAdapter([conversation('b')]);
            const capability = {
                async archive() {
                    if (rejection instanceof Error) throw rejection;
                    return rejection;
                }
            };
            const blocked = await new api.BulkLifecycleRunner({
                adapter: blockedAdapter,
                archiveCapability: capability
            }).execute(snapshot([conversation('b')]), { archiveRequested: true });
            assert.equal(blocked.phase, 'blocked');
            assert.equal(blocked.archive.status, 'failed');
            assert.equal(blocked.skipped, 1);
            assert.equal(blockedAdapter.deleteCalls.length, 0);
        }

        const unavailableAdapter = new TestAdapter([conversation('u')]);
        const unavailable = await new api.BulkLifecycleRunner({ adapter: unavailableAdapter })
            .execute(snapshot([conversation('u')]), { archiveRequested: true });
        assert.equal(unavailable.phase, 'blocked');
        assert.equal(unavailable.archive.status, 'unavailable');
        assert.equal(unavailable.archive.detail, 'archive-unavailable');
        assert.equal(unavailableAdapter.deleteCalls.length, 0);

        const declinedAdapter = new TestAdapter([conversation('d')]);
        const declined = await new api.BulkLifecycleRunner({ adapter: declinedAdapter, archiveCapability: archive })
            .execute(snapshot([conversation('d')]), { archiveRequested: false });
        assert.equal(declined.phase, 'succeeded');
        assert.equal(declined.archive.status, 'skipped');
        assert.equal(declined.archive.requested, false);
    });

    it('cancels on user, route, and session-scope changes, including during archive or deletion', async () => {
        const routeMismatch = new TestAdapter([conversation('a')]);
        routeMismatch.scope.routeKey = '/other';
        const mismatched = await new api.BulkLifecycleRunner({ adapter: routeMismatch })
            .execute(snapshot([conversation('a')]));
        assert.equal(mismatched.phase, 'cancelled');
        assert.equal(routeMismatch.deleteCalls.length, 0);

        const changedAfterVerify = new TestAdapter([conversation('a')]);
        changedAfterVerify.getConversationSnapshot = async function getConversationSnapshot(id) {
            this.scope.sessionKey = 'new-session';
            return { ...this.items.get(id) };
        };
        const changed = await new api.BulkLifecycleRunner({ adapter: changedAfterVerify })
            .execute(snapshot([conversation('a')]));
        assert.equal(changed.phase, 'cancelled');
        assert.equal(changedAfterVerify.deleteCalls.length, 0);

        let archiveStarted;
        const archiveGate = new Promise(resolve => { archiveStarted = resolve; });
        const archiveAdapter = new TestAdapter([conversation('a')]);
        const archiveRunner = new api.BulkLifecycleRunner({
            adapter: archiveAdapter,
            archiveCapability: {
                archive(_items, { signal }) {
                    archiveStarted();
                    return new Promise((_resolve, reject) => {
                        signal.addEventListener('abort', () => reject(Object.assign(new Error('cancel archive'), { name: 'AbortError' })), { once: true });
                    });
                }
            }
        });
        const archiveRun = archiveRunner.execute(snapshot([conversation('a')]), { archiveRequested: true });
        await archiveGate;
        assert.equal(archiveRunner.cancel('user-cancelled'), true);
        assert.equal((await archiveRun).phase, 'cancelled');
        assert.equal(archiveAdapter.deleteCalls.length, 0);

        const deleteAdapter = new TestAdapter([conversation('a'), conversation('b')]);
        let deleteStarted;
        const deleteGate = new Promise(resolve => { deleteStarted = resolve; });
        deleteAdapter.deleteBehaviors.set('a', (_item, { signal }) => {
            deleteStarted();
            return new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(Object.assign(new Error('cancel delete'), { code: 'ABORTED' })), { once: true });
            });
        });
        const deleteRunner = new api.BulkLifecycleRunner({ adapter: deleteAdapter });
        const deleteRun = deleteRunner.execute(snapshot([conversation('a'), conversation('b')]));
        await deleteGate;
        deleteRunner.cancel('');
        const cancelled = await deleteRun;
        assert.equal(cancelled.phase, 'cancelled');
        assert.deepEqual(cancelled.items.map(item => item.status), ['cancelled', 'cancelled']);
        assert.deepEqual(deleteAdapter.deleteCalls.map(call => call.id), ['a']);

        const namedAbort = new TestAdapter([conversation('a')]);
        const namedReport = await new api.BulkLifecycleRunner({
            adapter: namedAbort,
            archiveCapability: {
                async archive() { throw Object.assign(new Error('external abort'), { name: 'AbortError' }); }
            }
        }).execute(snapshot([conversation('a')]), { archiveRequested: true });
        assert.equal(namedReport.phase, 'cancelled');

        const codedReport = await new api.BulkLifecycleRunner({
            adapter: new TestAdapter([conversation('a')]),
            archiveCapability: {
                async archive() { throw Object.assign(new Error('coded abort'), { code: 'ABORTED' }); }
            }
        }).execute(snapshot([conversation('a')]), { archiveRequested: true });
        assert.equal(codedReport.phase, 'cancelled');

        const brokenScope = new TestAdapter([conversation('a')]);
        brokenScope.getRunScope = () => { throw new Error('scope probe failed'); };
        await assert.rejects(
            new api.BulkLifecycleRunner({ adapter: brokenScope }).execute(snapshot([conversation('a')])),
            /scope probe failed/
        );
    });

    it('stops remaining items when scope changes between successful deletions', async () => {
        const adapter = new TestAdapter([conversation('a'), conversation('b')]);
        adapter.deleteBehaviors.set('a', (_item, _options, owner) => {
            owner.scope.routeKey = '/changed';
            return true;
        });
        const report = await new api.BulkLifecycleRunner({ adapter })
            .execute(snapshot([conversation('a'), conversation('b')]));
        assert.equal(report.phase, 'cancelled');
        assert.equal(report.items[0].status, 'deleted');
        assert.equal(report.items[1].status, 'cancelled');
        assert.deepEqual(adapter.deleteCalls.map(call => call.id), ['a']);
    });
});

function makeRawGemini(document, rawItems = [conversation('a')]) {
    const target = document.createElement('div');
    document.body.append(target);
    const menu = document.createElement('button');
    const deleteButton = document.createElement('button');
    const dialog = document.createElement('div');
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    const confirm = document.createElement('button');
    confirm.textContent = 'Delete';
    dialog.append(cancel, confirm);
    const values = rawItems.map(item => {
        const element = document.createElement('a');
        element.setAttribute('href', item.href);
        document.body.append(element);
        return { ...item, element };
    });
    return {
        values,
        target,
        menu,
        deleteButton,
        dialog,
        cancel,
        confirm,
        scanSidebarChatLinks() { return this.values; },
        getSidebarOverflowContainer() { return this.target; },
        getChatRowMoreButton() { return this.menu; },
        getDeleteMenuItem() { return this.deleteButton; },
        getConfirmDialog() { return this.dialog; },
        getDialogConfirmButton() { return this.confirm; }
    };
}

function createManualTimers() {
    let next = 1;
    const entries = new Map();
    return {
        entries,
        setTimeout(callback) { const id = next++; entries.set(id, callback); return id; },
        clearTimeout(id) { entries.delete(id); },
        runNext() {
            const entry = entries.entries().next().value;
            if (!entry) return false;
            entries.delete(entry[0]);
            entry[1]();
            return true;
        }
    };
}

describe('injected Gemini bulk lifecycle adapter', () => {
    it('validates its boundary and exposes only normalized snapshots and explicit scope', () => {
        const document = new FakeDocument();
        const window = new FakeWindow();
        const gemini = makeRawGemini(document);
        for (const method of [
            'scanSidebarChatLinks', 'getSidebarOverflowContainer', 'getChatRowMoreButton',
            'getDeleteMenuItem', 'getConfirmDialog', 'getDialogConfirmButton'
        ]) {
            const invalid = { ...gemini, [method]: null };
            assert.throws(() => api.createGeminiBulkLifecycleAdapter({ gemini: invalid, document, window }), new RegExp(method));
        }
        assert.throws(() => api.createGeminiBulkLifecycleAdapter({ gemini, document: null, window }), /document/);
        assert.throws(() => api.createGeminiBulkLifecycleAdapter({ gemini, document, window: null }), /window/);
        assert.throws(() => api.createGeminiBulkLifecycleAdapter({ gemini, document, window, wait: 1 }), /wait/);
        assert.throws(() => api.createGeminiBulkLifecycleAdapter({
            gemini, document, window, deleteVerificationAttempts: 0
        }), /deleteVerificationAttempts/);

        const adapter = api.createGeminiBulkLifecycleAdapter({ gemini, document, window, wait: async () => {} });
        assert.deepEqual(adapter.listConversations()[0], api.normalizeConversation(conversation('a')));
        assert.equal(adapter.getConversationSnapshot('missing'), null);
        assert.equal(adapter.getRunScope().routeKey, 'https://gemini.google.com/app');
        adapter.setSession({ accountId: 'account' });
        assert.equal(adapter.getRunScope().sessionKey, 'account');
        adapter.setSession({ userId: 'user' });
        assert.equal(adapter.getRunScope().sessionKey, 'user');
        adapter.setSession({ email: 'mail' });
        assert.equal(adapter.getRunScope().sessionKey, 'mail');
        adapter.setSession({ id: 'id' });
        assert.equal(adapter.getRunScope().sessionKey, 'id');
        adapter.setSession({});
        assert.equal(adapter.getRunScope().sessionKey, '');
        adapter.setSession('primitive');
        assert.equal(adapter.getRunScope().sessionKey, 'primitive');
        adapter.setSession(null);
        assert.equal(adapter.getRunScope().sessionKey, '');

        const noLocation = new FakeWindow();
        noLocation.location = null;
        assert.equal(api.createGeminiBulkLifecycleAdapter({
            gemini, document, window: noLocation, wait: async () => {}
        }).getRunScope().routeKey, '');
    });

    it('owns toolbar, selection controls, and removable route subscriptions', () => {
        const document = new FakeDocument();
        const window = new FakeWindow();
        const gemini = makeRawGemini(document);
        gemini.confirm.addEventListener('click', () => { gemini.values = []; });
        const adapter = api.createGeminiBulkLifecycleAdapter({ gemini, document, window, wait: async () => {} });
        const toolbar = document.createElement('div');
        const toolbarMount = adapter.mountToolbar(toolbar);
        assert.equal(toolbarMount.isConnected, true);
        toolbarMount.remove();
        assert.equal(toolbarMount.isConnected, false);
        gemini.target = null;
        assert.equal(adapter.mountToolbar(document.createElement('div')), null);
        gemini.target = document.createElement('div');

        const checkbox = document.createElement('label');
        const selectionMount = adapter.mountSelectionControl('a', checkbox);
        assert.equal(selectionMount.isConnected, true);
        selectionMount.remove();
        assert.equal(selectionMount.isConnected, false);
        assert.equal(adapter.mountSelectionControl('missing', document.createElement('label')), null);
        gemini.values[0].element = null;
        assert.equal(adapter.mountSelectionControl('a', document.createElement('label')), null);

        assert.throws(() => adapter.subscribeRouteChange(null), /listener/);
        let routes = 0;
        const unsubscribe = adapter.subscribeRouteChange(() => { routes += 1; });
        window.dispatchEvent(new FakeEvent('popstate'));
        window.dispatchEvent(new FakeEvent('hashchange'));
        assert.equal(routes, 2);
        unsubscribe();
        window.dispatchEvent(new FakeEvent('popstate'));
        assert.equal(routes, 2);
    });

    it('performs one guarded native delete and rechecks the snapshot immediately before confirm', async () => {
        const document = new FakeDocument();
        const window = new FakeWindow();
        const gemini = makeRawGemini(document);
        gemini.confirm.addEventListener('click', () => { gemini.values = []; });
        const adapter = api.createGeminiBulkLifecycleAdapter({ gemini, document, window, wait: async () => {} });
        adapter.setSession('user@example.com');
        const expected = conversation('a');
        const runScope = adapter.getRunScope();
        const result = await adapter.deleteConversation(expected, { signal: new AbortController().signal, scope: runScope });
        assert.deepEqual(result, { deleted: true });
        assert.equal(gemini.menu.clicked, 1);
        assert.equal(gemini.deleteButton.clicked, 1);
        assert.equal(gemini.confirm.clicked, 1);

        assert.deepEqual(await adapter.deleteConversation(conversation('missing'), { scope: runScope }), { stale: true });
        gemini.values = [{ ...conversation('a'), element: document.createElement('a') }];
        assert.deepEqual(await adapter.deleteConversation(conversation('a', 'Changed'), { scope: runScope }), { stale: true });
        assert.deepEqual(await adapter.deleteConversation(expected, { scope: { ...runScope, routeKey: '/other' } }), { stale: true });
        assert.deepEqual(await adapter.deleteConversation(expected, { scope: { ...runScope, kind: 'other' } }), { stale: true });
        assert.deepEqual(await adapter.deleteConversation(expected, { scope: { ...runScope, sessionKey: 'other' } }), { stale: true });

        let scans = 0;
        gemini.scanSidebarChatLinks = () => {
            scans += 1;
            if (scans >= 2) return [{ ...gemini.values[0], title: 'Changed' }];
            return gemini.values;
        };
        const stale = await adapter.deleteConversation(expected, { scope: runScope });
        assert.deepEqual(stale, { stale: true });
        assert.equal(gemini.cancel.clicked, 1);
    });

    it('never retries missing native actions and dismisses transient UI on every failure', async () => {
        const scenarios = [
            ['getChatRowMoreButton', null, /menu button/],
            ['getDeleteMenuItem', null, /menu item/],
            ['getConfirmDialog', null, /dialog/],
            ['getDialogConfirmButton', null, /confirmation button/]
        ];
        for (const [method, value, pattern] of scenarios) {
            const document = new FakeDocument();
            let bodyClicks = 0;
            document.body.click = () => { bodyClicks += 1; };
            const window = new FakeWindow();
            const gemini = makeRawGemini(document);
            const blank = document.createElement('button');
            gemini.dialog.replaceChildren(blank);
            gemini[method] = () => value;
            const adapter = api.createGeminiBulkLifecycleAdapter({ gemini, document, window, wait: async () => {} });
            await assert.rejects(
                adapter.deleteConversation(conversation('a'), { scope: adapter.getRunScope() }),
                pattern
            );
            assert.equal(bodyClicks, 1);
        }

        const document = new FakeDocument();
        const window = new FakeWindow();
        const gemini = makeRawGemini(document);
        gemini.confirm.addEventListener('click', () => { gemini.values = []; });
        const nested = document.createElement('span');
        const button = document.createElement('button');
        button.append(nested);
        gemini.menu = nested;
        const adapter = api.createGeminiBulkLifecycleAdapter({ gemini, document, window, wait: async () => {} });
        await adapter.deleteConversation(conversation('a'), { scope: adapter.getRunScope() });
        assert.equal(button.clicked, 1);

        let plainClicks = 0;
        gemini.values = makeRawGemini(document).values;
        gemini.menu = { click() { plainClicks += 1; } };
        await adapter.deleteConversation(conversation('a'), { scope: adapter.getRunScope() });
        assert.equal(plainClicks, 1);

        const mouseDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'MouseEvent');
        Object.defineProperty(globalThis, 'MouseEvent', { configurable: true, value: FakeEvent });
        window.MouseEvent = null;
        gemini.values = makeRawGemini(document).values;
        await adapter.deleteConversation(conversation('a'), { scope: adapter.getRunScope() });
        if (mouseDescriptor) Object.defineProperty(globalThis, 'MouseEvent', mouseDescriptor);
        else delete globalThis.MouseEvent;
    });

    it('rejects a native confirmation that leaves the conversation visible and never retries', async () => {
        const document = new FakeDocument();
        const window = new FakeWindow();
        const gemini = makeRawGemini(document);
        let waits = 0;
        const adapter = api.createGeminiBulkLifecycleAdapter({
            gemini,
            document,
            window,
            wait: async () => { waits += 1; },
            deleteVerificationAttempts: 3
        });
        await assert.rejects(
            adapter.deleteConversation(conversation('a'), { scope: adapter.getRunScope() }),
            /remained after delete confirmation/
        );
        assert.equal(gemini.confirm.clicked, 1);
        assert.equal(waits, 6, 'three setup waits plus three bounded verification waits');
    });

    it('uses abortable waits so cancellation before native confirmation cannot click confirm', async () => {
        const document = new FakeDocument();
        const window = new FakeWindow();
        const gemini = makeRawGemini(document);
        gemini.confirm.addEventListener('click', () => { gemini.values = []; });
        const timers = createManualTimers();
        const adapter = api.createGeminiBulkLifecycleAdapter({ gemini, document, window, timers });
        const controller = new AbortController();
        const aborted = adapter.deleteConversation(conversation('a'), {
            signal: controller.signal,
            scope: adapter.getRunScope()
        });
        assert.equal(timers.entries.size, 1);
        controller.abort('route-changed');
        await assert.rejects(aborted, error => error.name === 'AbortError' && error.code === 'ABORTED');
        assert.equal(timers.entries.size, 0);
        assert.equal(gemini.confirm.clicked, 0);

        const successController = new AbortController();
        const success = adapter.deleteConversation(conversation('a'), {
            signal: successController.signal,
            scope: adapter.getRunScope()
        });
        for (let index = 0; index < 4; index += 1) {
            assert.equal(timers.runNext(), true);
            await new Promise(resolve => setImmediate(resolve));
        }
        assert.deepEqual(await success, { deleted: true });

        const already = new AbortController();
        already.abort('session-changed');
        await assert.rejects(
            adapter.deleteConversation(conversation('a'), { signal: already.signal, scope: adapter.getRunScope() }),
            /session-changed/
        );
        await assert.rejects(
            adapter.deleteConversation(conversation('a'), {
                signal: { aborted: true, reason: '' },
                scope: adapter.getRunScope()
            }),
            /Operation cancelled/
        );
    });
});

describe('BulkLifecycleFeature semantic UI and lifecycle', () => {
    it('keeps selection, semantic view, and confirmation responsibilities independently testable', () => {
        assert.throws(() => new api.BulkSelectionState({ isRunActive: 1 }), /isRunActive/);
        const defaultSelection = new api.BulkSelectionState();
        assert.equal(defaultSelection.enter(), true);
        let active = false;
        const selection = new api.BulkSelectionState({ isRunActive: () => active });
        assert.equal(selection.enter(), true);
        selection.set(conversation('a'), true);
        assert.equal(selection.has('a'), true);
        assert.equal(selection.set(conversation('a'), false), false);
        assert.equal(selection.has('a'), false);
        assert.equal(selection.selectAll([conversation('a'), conversation('b')]), 2);
        assert.equal(selection.clear(), true);
        assert.equal(selection.clear(), false);
        selection.set(conversation('a'), true);
        assert.equal(selection.exit(), true);
        assert.equal(selection.mode, false);
        assert.equal(selection.size, 0);
        active = true;
        assert.equal(selection.enter(), false);
        assert.equal(selection.exit(), false);
        active = false;
        selection.set(conversation('a'), true);
        assert.equal(selection.remove('a'), true);
        selection.reset();

        const document = new FakeDocument();
        const dialogs = new FakeDialogs();
        assert.throws(() => new api.BulkLifecycleView({ document: null, translate: (_zh, en) => en }), /document/);
        assert.throws(() => new api.BulkLifecycleView({ document, translate: null }), /translate/);
        assert.throws(() => new api.BulkConfirmationFlow({ document: null, dialogs, translate: (_zh, en) => en }), /document/);
        assert.throws(() => new api.BulkConfirmationFlow({ document, dialogs: null, translate: (_zh, en) => en }), /dialog/);
        assert.throws(() => new api.BulkConfirmationFlow({ document, dialogs, translate: null }), /translate/);

        const view = new api.BulkLifecycleView({ document, translate: (_zh, en) => en });
        let choiceSelected = false;
        const choice = view.createChoice(conversation('choice'), {
            checked: false,
            disabled: false,
            onChange(selected) { choiceSelected = selected; }
        });
        assert.equal(choice.label.getAttribute('data-primer-sidebar-control'), 'bulk-lifecycle');
        const labelClick = new FakeEvent('click', { bubbles: true, target: choice.label });
        choice.label.dispatchEvent(labelClick);
        assert.equal(labelClick.propagationStopped, true);
        assert.equal(labelClick.defaultPrevented, true);
        assert.equal(choiceSelected, true);
        choice.input.checked = true;
        choiceSelected = false;
        const inputClick = new FakeEvent('click', { bubbles: true, target: choice.input });
        choice.input.dispatchEvent(inputClick);
        assert.equal(inputClick.propagationStopped, true);
        assert.equal(inputClick.defaultPrevented, true);
        assert.equal(choiceSelected, true);
        choiceSelected = false;
        const choiceChange = new FakeEvent('change', { bubbles: true, target: choice.input });
        choice.input.dispatchEvent(choiceChange);
        assert.equal(choiceChange.propagationStopped, true);
        assert.equal(choiceSelected, true);
        let cancelled = 0;
        const activeToolbar = view.createToolbar({
            selectionMode: true,
            active: true,
            selectedCount: 1
        }, {
            selectAll() {}, clear() {}, cancelRun() { cancelled += 1; }
        });
        byText(activeToolbar, 'Cancel current run', 'button').click();
        assert.equal(cancelled, 1);
        assert.equal(byText(activeToolbar, 'Exit', 'button'), null);

        const flow = new api.BulkConfirmationFlow({ document, dialogs, translate: (_zh, en) => en });
        flow.close('empty');
        const run = snapshot([conversation('a')]);
        const preview = flow.open(run, { hasArchive: false, onConfirm() {} });
        flow.close('close-preview');
        assert.equal(preview.open, false);
        const next = flow.open(run, { hasArchive: true, onConfirm() {} });
        const content = dialogs.records.at(-1).options.content;
        const phrase = inputByType(content, 'text');
        phrase.value = 'DELETE 1';
        phrase.dispatchEvent(new FakeEvent('input', { target: phrase }));
        byText(content, 'Continue to final confirmation', 'button').click();
        assert.equal(next.open, false);
        assert.ok(flow.confirmDialog.open);
        flow.close('close-final');
        assert.equal(flow.confirmDialog, null);
    });

    it('uses deterministic injectable localization without a shell singleton', () => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'zh-CN' } });
        assert.equal(api.defaultTranslate('中文', 'English'), '中文');
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en-US' } });
        assert.equal(api.defaultTranslate('中文', 'English'), 'English');
        if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
        else delete globalThis.navigator;
    });

    it('wires every toolbar and details action through the orchestrator', async () => {
        const { feature, document, adapter, dialogs } = createFeature();
        feature.start({ session: 'user@example.com' });
        assert.equal(feature.report, null);
        feature.mountNativeUI();
        byText(adapter.toolbarTarget, 'Manage visible conversations', 'button').click();
        byText(adapter.toolbarTarget, 'Select all visible', 'button').click();
        byText(adapter.toolbarTarget, 'Clear selection', 'button').click();
        byText(adapter.toolbarTarget, 'Select all visible', 'button').click();
        byText(adapter.toolbarTarget, 'Preview 2', 'button').click();
        assert.equal(dialogs.records.at(-1).options.title, 'Deletion preview');
        dialogs.escape();
        byText(adapter.toolbarTarget, 'Clear selection', 'button').click();
        byText(adapter.toolbarTarget, 'Exit', 'button').click();

        const container = document.createElement('div');
        document.body.append(container);
        feature.render(container);
        byText(container, 'Select all visible', 'button').click();
        byText(container, 'Deselect all', 'button').click();
        byText(container, 'Select all visible', 'button').click();
        byText(container, 'Preview 2', 'button').click();
        assert.equal(dialogs.records.at(-1).options.title, 'Deletion preview');
        dialogs.escape();

        const defaultNow = new api.BulkLifecycleFeature({
            document,
            adapter: new TestAdapter([conversation('z')]),
            dialogs: new FakeDialogs(),
            translate: (_zh, en) => en
        });
        defaultNow.start();
        defaultNow.selectAllVisible();
        assert.ok(defaultNow.openPreview());
        await defaultNow.stop();
        await feature.stop();
    });

    it('validates UI dependencies and supports idempotent start/stop', async () => {
        const document = new FakeDocument();
        const adapter = new TestAdapter();
        const dialogs = new FakeDialogs();
        assert.throws(() => new api.BulkLifecycleFeature({ document: null, adapter, dialogs }), /document/);
        for (const method of ['listConversations', 'getRunScope', 'mountToolbar', 'mountSelectionControl', 'subscribeRouteChange']) {
            const invalid = Object.create(adapter);
            invalid[method] = null;
            assert.throws(() => new api.BulkLifecycleFeature({ document, adapter: invalid, dialogs }), new RegExp(method));
        }
        assert.throws(() => new api.BulkLifecycleFeature({ document, adapter, dialogs: null }), /dialog/);
        assert.throws(() => new api.BulkLifecycleFeature({ document, adapter, dialogs, translate: null }), /options/);
        assert.throws(() => new api.BulkLifecycleFeature({ document, adapter, dialogs, now: null }), /options/);

        const feature = new api.BulkLifecycleFeature({ document, adapter, dialogs, translate: (_zh, en) => en });
        assert.equal(feature.started, false);
        assert.equal(await feature.whenIdle(), null);
        assert.equal(await feature.stop(), false);

        const noSubscription = createFeature();
        noSubscription.adapter.subscribeRouteChange = () => null;
        noSubscription.feature.start();
        assert.equal(await noSubscription.feature.stop(), true);
        assert.equal(feature.mountNativeUI(), false);
        assert.equal(feature.start({ session: 'one' }), true);
        assert.equal(feature.start({ session: 'two' }), false);
        assert.equal(feature.started, true);
        assert.deepEqual(adapter.sessionValues, ['one']);
        assert.equal(await feature.stop('done'), true);
        assert.equal(feature.started, false);
        assert.equal(adapter.routeListeners.size, 0);
        assert.equal(await feature.stop(), false);
    });

    it('mounts native controls once, uses semantic checkboxes, and remounts disconnected Gemini DOM', async () => {
        const { feature, adapter } = createFeature();
        feature.start({ session: 'user@example.com' });
        assert.equal(feature.mountNativeUI(), true);
        assert.equal(feature.mountNativeUI(), false);
        assert.equal(adapter.toolbarMountCount, 1);
        const enter = byText(adapter.toolbarTarget, 'Manage visible conversations', 'button');
        assert.equal(enter.type, 'button');
        enter.click();
        assert.equal(adapter.toolbarMountCount, 2);
        assert.equal(adapter.selectionMountCount, 2);
        const rowCheckbox = allByTag(adapter.rowTargets.get('a'), 'input')[0];
        assert.equal(rowCheckbox.type, 'checkbox');
        assert.match(rowCheckbox.getAttribute('aria-label'), /Select conversation/);
        rowCheckbox.checked = true;
        rowCheckbox.dispatchEvent(new FakeEvent('change', { target: rowCheckbox }));
        assert.deepEqual(feature.selectedIds, ['a']);
        const toolbar = adapter.toolbarTarget.firstChild;
        toolbar.remove();
        assert.equal(feature.mountNativeUI(), true);
        assert.ok(adapter.toolbarMountCount >= 4);
        assert.equal(feature.unmountNativeUI(), true);
        assert.equal(feature.unmountNativeUI(), false);

        adapter.mountAvailable = false;
        assert.equal(feature.mountNativeUI(), false);
        adapter.mountAvailable = true;
        adapter.skipSelectionMount.add('b');
        assert.equal(feature.mountNativeUI(), true);
        feature.clearSelection();
        assert.equal(feature.exitSelectionMode(), true);
        assert.equal(feature.enterSelectionMode(), true);
        await feature.stop();
    });

    it('renders explicit current scope, semantic selection, empty state, and replaces repeated mounts', async () => {
        const { feature, document, adapter } = createFeature();
        feature.start({ session: 'user@example.com' });
        const container = document.createElement('div');
        document.body.append(container);
        assert.throws(() => feature.render(null), /container/);
        const first = feature.render(container);
        assert.match(first.textContent + descendants(first).map(item => item.textContent).join(' '), /Selection scope/);
        assert.equal(allByTag(first, 'fieldset').length, 1);
        assert.equal(allByTag(first, 'label').length, 2);
        assert.equal(allByTag(first, 'input').every(input => input.type === 'checkbox'), true);
        const second = feature.render(container);
        assert.equal(container.children.length, 1);
        assert.notEqual(first, second);

        adapter.items.clear();
        const empty = feature.render(container);
        assert.ok(byText(empty, 'No conversations are in this scope.', 'p'));
        const selectAll = byText(empty, 'Select all visible', 'button');
        assert.equal(selectAll.disabled, true);
        await feature.stop();
        assert.equal(container.children.length, 0);
    });

    it('requires an exact phrase and a safe second confirmation with focus and Escape restoration semantics', async () => {
        const { feature, document, dialogs } = createFeature();
        feature.start({ session: 'user@example.com' });
        const container = document.createElement('div');
        document.body.append(container);
        const root = feature.render(container);
        const firstCheckbox = allByTag(root, 'input')[0];
        firstCheckbox.checked = true;
        firstCheckbox.dispatchEvent(new FakeEvent('change', { target: firstCheckbox }));
        const preview = feature.openPreview();
        assert.equal(preview, feature.openPreview());
        const previewRecord = dialogs.records.at(-1);
        assert.equal(previewRecord.options.title, 'Deletion preview');
        assert.equal(previewRecord.options.closeOnEscape, true);
        assert.equal(previewRecord.options.restoreFocus, true);
        const phraseInput = inputByType(previewRecord.options.content, 'text');
        assert.equal(document.activeElement, phraseInput);
        const continueButton = byText(previewRecord.options.content, 'Continue to final confirmation', 'button');
        assert.equal(continueButton.disabled, true);
        phraseInput.value = 'DELETE';
        phraseInput.dispatchEvent(new FakeEvent('input', { target: phraseInput }));
        assert.equal(continueButton.disabled, true);
        continueButton.disabled = false;
        continueButton.click();
        assert.equal(dialogs.records.length, 1, 'handler still refuses a wrong phrase');
        phraseInput.value = 'DELETE 1';
        phraseInput.dispatchEvent(new FakeEvent('input', { target: phraseInput }));
        continueButton.click();
        const finalRecord = dialogs.records.at(-1);
        assert.equal(finalRecord.options.title, 'Irreversible final confirmation');
        assert.equal(finalRecord.options.closeOnBackdrop, false);
        assert.equal(document.activeElement.textContent, 'Go back');
        assert.equal(dialogs.escape(), true);
        assert.equal(finalRecord.handle.open, false);

        const again = feature.openPreview();
        assert.equal(again.open, true);
        assert.equal(dialogs.escape(), true);
        assert.equal(again.open, false);
        await feature.stop();
    });

    it('honors the explicit archive-first choice instead of invoking an available provider implicitly', async () => {
        let archiveCalls = 0;
        const { feature, dialogs } = createFeature({
            archiveCapability: {
                async archive(items) { archiveCalls += 1; return archiveResult(items); }
            }
        });
        feature.start({ session: 'user@example.com' });
        feature.selectAllVisible();
        const preview = feature.openPreview();
        const content = dialogs.records.at(-1).options.content;
        const archiveChoice = inputByType(content, 'checkbox');
        archiveChoice.checked = false;
        const phrase = inputByType(content, 'text');
        phrase.value = 'DELETE 2';
        phrase.dispatchEvent(new FakeEvent('input', { target: phrase }));
        byText(content, 'Continue to final confirmation', 'button').click();
        const finalContent = dialogs.records.at(-1).options.content;
        assert.match(finalContent.textContent + descendants(finalContent).map(item => item.textContent).join(' '), /do not archive/);
        byText(finalContent, 'Delete now', 'button').click();
        const report = await feature.whenIdle();
        assert.equal(report.archive.status, 'skipped');
        assert.equal(archiveCalls, 0);
        assert.equal(preview.open, false);
        await feature.stop();
    });

    it('runs successfully without archive, keeps failed selections, and publishes per-item partial failure', async () => {
        const { feature, document, adapter, dialogs } = createFeature();
        adapter.deleteBehaviors.set('b', new Error('blocked by Gemini'));
        feature.start({ session: 'user@example.com' });
        feature.selectAllVisible();
        const container = document.createElement('div');
        document.body.append(container);
        feature.render(container);
        const preview = feature.openPreview();
        const previewContent = dialogs.records.at(-1).options.content;
        assert.match(descendants(previewContent).map(item => item.textContent).join(' '), /No archive capability/);
        const unavailableArchive = inputByType(previewContent, 'checkbox');
        assert.equal(unavailableArchive.checked, false);
        assert.equal(unavailableArchive.disabled, true);
        const phrase = inputByType(previewContent, 'text');
        phrase.value = 'DELETE 2';
        phrase.dispatchEvent(new FakeEvent('input', { target: phrase }));
        byText(previewContent, 'Continue to final confirmation', 'button').click();
        const finalContent = dialogs.records.at(-1).options.content;
        byText(finalContent, 'Delete now', 'button').click();
        const report = await feature.whenIdle();
        assert.equal(report.phase, 'partial-failure');
        assert.equal(report.archive.status, 'unavailable');
        assert.deepEqual(feature.selectedIds, ['b']);
        assert.deepEqual(adapter.deleteCalls.map(call => call.id), ['a', 'b']);
        const rendered = container.firstChild;
        const summary = descendants(rendered).find(element => element.getAttribute('role') === 'alert');
        assert.match(summary.textContent, /failed 1/);
        assert.match(descendants(rendered).map(item => item.textContent).join(' '), /blocked by Gemini/);
        assert.equal(preview.open, false);
        await feature.stop();
    });

    it('archives before a successful run and aborts active work on route or session changes', async () => {
        const events = [];
        const archiveCapability = {
            async archive(items) { events.push('archive'); return archiveResult(items); }
        };
        const { feature, adapter, dialogs } = createFeature({ archiveCapability });
        adapter.deleteBehaviors.set('a', () => { events.push('delete'); return true; });
        feature.start({ session: 'user@example.com' });
        feature.enterSelectionMode();
        feature.mountNativeUI();
        feature.selectAllVisible();
        let preview = feature.openPreview();
        let content = dialogs.records.at(-1).options.content;
        assert.match(descendants(content).map(item => item.textContent).join(' '), /archive will be created/i);
        const archiveChoice = inputByType(content, 'checkbox');
        assert.equal(archiveChoice.checked, true);
        assert.equal(archiveChoice.disabled, false);
        let phrase = inputByType(content, 'text');
        phrase.value = 'DELETE 2';
        phrase.dispatchEvent(new FakeEvent('input', { target: phrase }));
        byText(content, 'Continue to final confirmation', 'button').click();
        byText(dialogs.records.at(-1).options.content, 'Delete now', 'button').click();
        assert.equal((await feature.whenIdle()).phase, 'succeeded');
        assert.deepEqual(events.slice(0, 2), ['archive', 'delete']);

        feature.selectAllVisible();
        preview = feature.openPreview();
        assert.equal(preview.open, true);
        adapter.emitRoute();
        assert.equal(preview.open, false);
        assert.deepEqual(feature.selectedIds, []);

        feature.selectAllVisible();
        preview = feature.openPreview();
        await feature.changeSession('second@example.com');
        assert.equal(preview.open, false);
        assert.deepEqual(feature.selectedIds, []);
        assert.equal(adapter.sessionValues.at(-1), 'second@example.com');
        await feature.stop();
    });

    it('cancels an in-flight run from semantic Cancel control and prevents selection mode changes while active', async () => {
        const { feature, document, adapter, dialogs } = createFeature();
        let started;
        const gate = new Promise(resolve => { started = resolve; });
        adapter.deleteBehaviors.set('a', (_item, { signal }) => {
            started();
            return new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(Object.assign(new Error('stop'), { name: 'AbortError' })), { once: true });
            });
        });
        feature.start({ session: 'user@example.com' });
        feature.enterSelectionMode();
        feature.mountNativeUI();
        feature.selectAllVisible();
        const container = document.createElement('div');
        document.body.append(container);
        feature.render(container);
        const previewContent = (feature.openPreview(), dialogs.records.at(-1).options.content);
        const phrase = inputByType(previewContent, 'text');
        phrase.value = 'DELETE 2';
        phrase.dispatchEvent(new FakeEvent('input', { target: phrase }));
        byText(previewContent, 'Continue to final confirmation', 'button').click();
        byText(dialogs.records.at(-1).options.content, 'Delete now', 'button').click();
        await gate;
        assert.equal(feature.enterSelectionMode(), false);
        assert.equal(feature.exitSelectionMode(), false);
        assert.equal(feature.openPreview(), null);
        const activeRun = feature.whenIdle();
        assert.equal(feature._startRun(snapshot([conversation('a')])), activeRun);
        const activeRoot = container.firstChild;
        const cancel = byText(activeRoot, 'Cancel current run', 'button');
        byText(adapter.toolbarTarget, 'Cancel current run', 'button').click();
        cancel.click();
        assert.equal((await feature.whenIdle()).phase, 'cancelled');
        await feature.stop();
    });

    it('awaits cancellation before session replacement or module stop', async () => {
        for (const action of ['session', 'stop']) {
            const { feature, adapter } = createFeature();
            let started;
            const gate = new Promise(resolve => { started = resolve; });
            adapter.deleteBehaviors.set('a', (_item, { signal }) => {
                started();
                return new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })), { once: true });
                });
            });
            feature.start({ session: 'old' });
            feature.selectAllVisible();
            const run = feature._startRun(feature.selection.capture({
                scope: adapter.getRunScope(),
                capturedAt: 'now'
            }));
            await gate;
            if (action === 'session') {
                assert.equal(await feature.changeSession('new'), 'new');
                assert.equal(adapter.sessionValues.at(-1), 'new');
                await feature.stop();
            } else {
                assert.equal(await feature.stop('disabled'), true);
            }
            assert.equal((await run).phase, 'cancelled');
        }
    });
});

describe('legacy Batch Delete facade', () => {
    it('retains the old id/toggle while delegating lifecycle and UI to Bulk Lifecycle', async () => {
        const document = new FakeDocument();
        const adapter = new TestAdapter([conversation('a')]);
        const dialogs = new FakeDialogs();
        const module = api.createBatchDeleteModule({
            document,
            adapter,
            dialogs,
            translate: (_zh, en) => en,
            now: () => 'now',
            archiveCapability: null
        });
        assert.equal(module.id, 'batch-delete');
        assert.equal(batchFacade.BatchDeleteModule.id, 'batch-delete');
        assert.equal(batchFacade.createBatchDeleteModule, api.createBatchDeleteModule);
        assert.equal(module.key, 'batch-delete');
        assert.equal(module.toggleId, 'batch-delete');
        assert.equal(module.defaultEnabled, false);
        assert.match(module.name, /Bulk Lifecycle/);
        assert.equal(module.controller, null);
        assert.deepEqual(module._scanChats(), []);
        assert.equal(module._batchDelete(), null);
        assert.equal(module.injectNativeUI(), false);
        assert.equal(module.removeNativeUI(), false);
        assert.equal(module.renderToDetailsPane(document.createElement('div')), null);
        assert.equal(module._deleting, false);
        assert.deepEqual([...module._selected], []);
        assert.equal(module.onUserChange('before-start'), 'before-start');
        assert.throws(() => module.configure(null), /configuration/);
        assert.throws(() => module.configure([]), /configuration/);
        assert.equal(module.configure({}), module);
        assert.equal(module.configure({ archiveCapability: null }), module);
        assert.equal(await module.init({ session: 'one' }), true);
        assert.equal(await module.init({ session: 'two' }), false);
        assert.throws(() => module.configure({}), /running/);
        assert.ok(module.controller);
        assert.equal(module.injectNativeUI(), true);
        assert.equal(module.injectNativeUI(), false);
        assert.equal(module._scanChats().length, 1);
        const container = document.createElement('div');
        document.body.append(container);
        assert.ok(module.renderToDetailsPane(container));
        module.controller.selectAllVisible();
        assert.deepEqual([...module._selected], ['a']);
        assert.ok(module._batchDelete());
        assert.equal(await module.onUserChange('two'), 'two');
        assert.equal(module.removeNativeUI(), true);
        assert.equal(await module.destroy({ reason: 'test' }), true);
        assert.equal(await module.destroy(), false);
        assert.match(module.getOnboarding().zh.features, /归档/);
        assert.match(module.getOnboarding().en.features, /snapshot/);
    });

    it('accepts archive capability from context or host lookup and cleans owned dialog roots', async () => {
        const archive = { async archive() { return true; } };
        for (const context of [
            { session: 'one', archiveCapability: archive },
            { session: 'two', getCapability(name) { assert.equal(name, 'archive.bulk-lifecycle'); return archive; } },
            { session: 'three', getCapability() { return null; } }
        ]) {
            const document = new FakeDocument();
            const adapter = new TestAdapter([conversation('a')]);
            const module = api.createBatchDeleteModule({ document, adapter, translate: (_zh, en) => en });
            assert.equal(await module.init(context), true);
            assert.equal(document.body.children.some(child => child.id === 'primer-bulk-lifecycle-dialog-root'), true);
            assert.equal(await module.destroy(), true);
            assert.equal(document.body.children.some(child => child.id === 'primer-bulk-lifecycle-dialog-root'), false);
        }
    });

    it('refreshes and clears the raw archive capability without retaining a stale provider', async () => {
        const document = new FakeDocument();
        const adapter = new TestAdapter([conversation('a')]);
        const dialogs = new FakeDialogs();
        const module = api.createBatchDeleteModule({
            document,
            adapter,
            dialogs,
            translate: (_zh, en) => en,
            now: () => 'now'
        });
        assert.throws(() => module.configureCapabilities(null), /capabilities/);
        assert.throws(() => module.configureCapabilities([]), /capabilities/);
        await module.init({ session: 'one' });
        assert.equal(module.controller.controller.hasArchive, false);
        const capability = { async archive(items) { return archiveResult(items); } };
        assert.equal(module.configureCapabilities({
            [api.BULK_LIFECYCLE_ARCHIVE_CAPABILITY]: capability
        }), module);
        assert.equal(module._archiveCapability, capability);
        assert.equal(module.controller.controller.hasArchive, true);
        module.controller.selectAllVisible();
        const preview = module.controller.openPreview();
        assert.equal(preview.open, true);

        module.configureCapabilities({});
        assert.equal(preview.open, false, 'provider removal closes a stale confirmation');
        assert.equal(module._archiveCapability, null);
        assert.equal(module.controller.controller.hasArchive, false);
        assert.equal(module.configureCapabilities({}), module, 'repeated clear is idempotent');

        module.configureCapabilities({ [api.BULK_LIFECYCLE_ARCHIVE_CAPABILITY]: capability });
        assert.equal(module.controller.controller.hasArchive, true);
        await module.destroy();
        module.configureCapabilities({});
        assert.equal(module._archiveCapability, null);
    });

    it('can build the injected Gemini boundary and rolls back partial startup', async () => {
        const document = new FakeDocument();
        const window = new FakeWindow();
        const gemini = makeRawGemini(document);
        const dialogs = new FakeDialogs();
        const module = api.createBatchDeleteModule({
            document,
            window,
            gemini,
            dialogs,
            wait: async () => {},
            translate: (_zh, en) => en
        });
        assert.equal(await module.init({ session: 'one' }), true);
        assert.equal(module._scanChats().length, 1);
        assert.equal(await module.destroy(), true);

        const failingAdapter = new TestAdapter();
        failingAdapter.subscribeRouteChange = () => { throw new Error('route subscribe failed'); };
        const failing = api.createBatchDeleteModule({ document, adapter: failingAdapter, translate: (_zh, en) => en });
        await assert.rejects(failing.init({}), /route subscribe failed/);
        assert.equal(failing.controller, null);
        assert.equal(document.body.children.some(child => child.id === 'primer-bulk-lifecycle-dialog-root'), false);
    });

    it('uses browser globals only at the facade composition boundary and reports active deletion compatibly', async () => {
        const previousDocument = globalThis.document;
        const previousWindow = globalThis.window;
        const document = new FakeDocument();
        const window = new FakeWindow();
        globalThis.document = document;
        globalThis.window = window;
        try {
            const dialogs = new FakeDialogs();
            const defaults = api.createBatchDeleteModule({ dialogs, translate: (_zh, en) => en });
            assert.equal(await defaults.init({ session: 'global' }), true);
            assert.deepEqual(defaults._scanChats(), []);
            await defaults.destroy();

            const adapter = new TestAdapter([conversation('a')]);
            let started;
            const gate = new Promise(resolve => { started = resolve; });
            adapter.deleteBehaviors.set('a', (_item, { signal }) => {
                started();
                return new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })), { once: true });
                });
            });
            const module = api.createBatchDeleteModule({ document, adapter, dialogs, translate: (_zh, en) => en });
            await module.init({ session: 'one' });
            module.controller.selectAllVisible();
            const run = module.controller._startRun(module.controller.selection.capture({
                scope: adapter.getRunScope(), capturedAt: 'now'
            }));
            await gate;
            assert.equal(module._deleting, true);
            module.controller.controller.cancel('test');
            await run;
            await module.destroy();
        } finally {
            if (previousDocument === undefined) delete globalThis.document;
            else globalThis.document = previousDocument;
            if (previousWindow === undefined) delete globalThis.window;
            else globalThis.window = previousWindow;
        }
    });

    it('themes only the owned dialog host and tracks Auto roots across light/dark refreshes', async () => {
        const previousDocument = globalThis.document;
        const previousWindow = globalThis.window;
        const originalResolveTheme = Core.resolveTheme;
        const document = new FakeDocument();
        const window = new FakeWindow();
        globalThis.document = document;
        globalThis.window = window;
        const createOwned = async theme => {
            themeState.setCurrentTheme(theme);
            const module = api.createBatchDeleteModule({
                document,
                adapter: new TestAdapter([]),
                translate: (_zh, en) => en
            });
            await module.init();
            const host = document.body.children.find(child => child.id === 'primer-bulk-lifecycle-dialog-root');
            assert.equal(host.getAttribute('data-primer-owned'), '');
            return { module, host };
        };
        try {
            const light = await createOwned('paper');
            assert.equal(light.host.getAttribute('data-primer-theme'), 'paper');
            assert.equal(light.host.style.getPropertyValue('color-scheme'), 'light');
            assert.equal(document.body.getAttribute('data-primer-theme'), null);
            await light.module.destroy();

            const dark = await createOwned('glass');
            assert.equal(dark.host.getAttribute('data-primer-theme'), 'glass');
            assert.equal(dark.host.style.getPropertyValue('color-scheme'), 'dark');
            await dark.module.destroy();

            let resolved = 'paper';
            Core.resolveTheme = key => key === 'auto' ? resolved : key;
            const automatic = await createOwned('auto');
            assert.equal(Core._autoThemeRoots.has(automatic.host), true);
            assert.equal(automatic.host.getAttribute('data-primer-theme'), 'paper');
            resolved = 'glass';
            Core._refreshAutoThemeRoots();
            assert.equal(automatic.host.getAttribute('data-primer-theme'), 'glass');
            await automatic.module.destroy();
            assert.equal(Core._autoThemeRoots.has(automatic.host), false);
        } finally {
            Core.resolveTheme = originalResolveTheme;
            Core._autoThemeRoots.clear();
            themeState.setCurrentTheme('glass');
            if (previousDocument === undefined) delete globalThis.document;
            else globalThis.document = previousDocument;
            if (previousWindow === undefined) delete globalThis.window;
            else globalThis.window = previousWindow;
        }
    });
});
