const { before, beforeEach, after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

class FakeEvent {
    constructor(type, init = {}) {
        this.type = type;
        Object.assign(this, init);
        this.defaultPrevented = false;
        this.propagationStopped = false;
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
}

class FakeElement {
    constructor(tagName, ownerDocument, nodeType = 1) {
        this.tagName = nodeType === 3 ? '#TEXT' : String(tagName).toUpperCase();
        this.nodeType = nodeType;
        this.ownerDocument = ownerDocument;
        this.parentNode = null;
        this.children = [];
        this.attributes = new Map();
        this.style = { cssText: '' };
        this.className = '';
        this.id = '';
        this.value = '';
        this.type = '';
        this.disabled = false;
        this.readOnly = false;
        this.hidden = false;
        this.files = [];
        this.href = '';
        this.download = '';
        this.title = '';
        this.htmlFor = '';
        this.onclick = null;
        this.oninput = null;
        this.onchange = null;
        this._text = '';
        this._listeners = new Map();
    }

    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get firstChild() { return this.children[0] || null; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) {
        this._text = String(value ?? '');
        for (const child of this.children) child.parentNode = null;
        this.children = [];
    }

    setAttribute(name, value) {
        this.attributes.set(String(name), String(value));
        if (name === 'id') this.id = String(value);
        if (name === 'class') this.className = String(value);
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }

    appendChild(child) {
        child.parentNode?.removeChild?.(child);
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    append(...children) { for (const child of children) this.appendChild(child); }
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parentNode = null;
        return child;
    }
    replaceChildren(...children) {
        for (const child of this.children) child.parentNode = null;
        this.children = [];
        this._text = '';
        this.append(...children);
    }
    remove() { this.parentNode?.removeChild?.(this); }
    contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
    focus() { this.ownerDocument.activeElement = this; }
    addEventListener(type, listener) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) { this._listeners.get(type)?.delete(listener); }
    dispatchEvent(event) {
        event.target ||= this;
        for (const listener of this._listeners.get(event.type) || []) listener.call(this, event);
        return !event.defaultPrevented;
    }
    click() {
        this.ownerDocument.lastClicked = this;
        if (this.disabled) return undefined;
        return this.onclick?.(new FakeEvent('click', { target: this }));
    }
}

class FakeDocument {
    constructor() {
        this.nodeType = 9;
        this.title = 'Fallback title';
        this.activeElement = null;
        this.lastClicked = null;
        this.created = [];
        this.documentElement = new FakeElement('html', this);
        this.body = new FakeElement('body', this);
        this.documentElement.appendChild(this.body);
    }
    createElement(tagName) {
        const element = new FakeElement(tagName, this);
        this.created.push(element);
        return element;
    }
    createElementNS(_namespace, tagName) { return this.createElement(tagName); }
    createTextNode(text) {
        const node = new FakeElement('#text', this, 3);
        node.textContent = text;
        return node;
    }
    getElementById(id) { return walk(this.documentElement).find(node => node.id === id) || null; }
    querySelector(selector) {
        if (selector.startsWith('#')) return this.getElementById(selector.slice(1));
        return walk(this.documentElement).find(node => node.tagName === selector.toUpperCase()) || null;
    }
}

function walk(root) {
    return [root, ...root.children.flatMap(walk)];
}

function byTag(root, tagName) {
    return walk(root).filter(node => node.tagName === tagName.toUpperCase());
}

function byText(root, tagName, text) {
    return byTag(root, tagName).find(node => node.textContent.includes(text));
}

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function flushTasks() {
    return new Promise(resolve => setImmediate(resolve));
}

const savedGlobals = new Map();
let documentRef;
let currentUser;
let inspectingUser;
let currentChat;
let storage;
let toasts;
let confirmations;
let dialogs;
let selection;
let fileReadPromise;
let flushCalls;
let ChatNotesModule;
let Core;
let NativeUI;
let GeminiAdapter;
let annotations;

function saveGlobal(name) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
}

function setGlobal(name, value) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

before(async () => {
    for (const name of [
        'navigator', 'document', 'window', 'GM_getValue', 'GM_setValue',
        '__flushGMPolyfill', 'InputEvent', 'Event', 'FileReader'
    ]) saveGlobal(name);

    setGlobal('navigator', { language: 'en-US' });
    setGlobal('GM_getValue', (_key, fallback) => fallback);
    setGlobal('GM_setValue', () => undefined);
    setGlobal('document', new FakeDocument());
    setGlobal('window', { innerWidth: 1280, innerHeight: 720, location: { href: '' }, getSelection: () => null });
    setGlobal('InputEvent', FakeEvent);
    setGlobal('Event', FakeEvent);

    annotations = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'features', 'annotations', 'index.js')
    ).href);
    ({ ChatNotesModule } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'modules', 'chat_notes.js')
    ).href));
    ({ Core } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'core.js')).href));
    ({ NativeUI } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'native_ui.js')).href));
    ({ GeminiAdapter } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'adapters', 'gemini.js')).href));
});

beforeEach(async () => {
    await ChatNotesModule.destroy();
    documentRef = new FakeDocument();
    setGlobal('document', documentRef);
    currentUser = 'alpha@example.test';
    inspectingUser = currentUser;
    currentChat = { id: 'chat-1', title: 'Architecture', href: '/app/chat-1' };
    storage = new Map();
    toasts = [];
    confirmations = [];
    dialogs = [];
    selection = null;
    fileReadPromise = null;
    flushCalls = 0;

    setGlobal('GM_getValue', (key, fallback) => storage.has(key) ? clone(storage.get(key)) : fallback);
    setGlobal('GM_setValue', async (key, value) => { storage.set(key, clone(value)); });
    setGlobal('__flushGMPolyfill', async () => { flushCalls += 1; });
    setGlobal('window', {
        innerWidth: 1280,
        innerHeight: 720,
        location: { href: '' },
        getSelection: () => selection
    });
    setGlobal('FileReader', class {
        readAsText(file) {
            if (file.fail) {
                this.onerror?.(new Error('read failed'));
                return;
            }
            fileReadPromise = Promise.resolve(this.onload?.({ target: { result: file.content } }));
        }
    });

    Core.getCurrentUser = () => currentUser;
    Core.getInspectingUser = () => inspectingUser;
    Core.getTempUser = () => 'Guest';
    Core.getChatId = () => currentChat?.id || null;
    Core.scanSidebarChats = () => currentChat ? [clone(currentChat)] : [];
    NativeUI.t = (_zh, en) => en;
    NativeUI.showToast = message => { toasts.push(message); };
    NativeUI.showConfirm = (message, onConfirm, options) => {
        const record = { message, onConfirm, options };
        confirmations.push(record);
        return record;
    };
    NativeUI.openDialog = options => {
        const handle = {
            options,
            open: true,
            close(reason) { this.open = false; this.reason = reason; }
        };
        dialogs.push(handle);
        return handle;
    };
    GeminiAdapter.isInsideChatContent = () => true;
    GeminiAdapter.getInputEditor = () => null;
    GeminiAdapter.getMessageLocatorForNode = () => null;
    GeminiAdapter.getCurrentConversationMessages = () => [];
    GeminiAdapter.openMessageLocator = () => false;
    GeminiAdapter.getChatId = () => currentChat?.id || null;
});

after(async () => {
    await ChatNotesModule.destroy();
    for (const [name, descriptor] of savedGlobals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    }
});

describe('legacy annotations repository compatibility', () => {
    it('keeps exact old keys and a lossless v2 payload with a readable notes projection', async () => {
        assert.equal(annotations.LEGACY_ANNOTATIONS_STORAGE_KEY, 'gemini_chat_notes');
        assert.equal(annotations.resolveLegacyAnnotationsStorageKey('person@example.test'), 'gemini_chat_notes_person@example.test');
        assert.equal(annotations.resolveLegacyAnnotationsStorageKey('Guest'), 'gemini_chat_notes');
        assert.throws(() => annotations.resolveLegacyAnnotationsStorageKey(''), /account id/);

        storage.set('gemini_chat_notes_person@example.test', {
            notes: {
                c1: { title: 'Legacy', href: '/app/c1', note: 'old', pinned: true }
            }
        });
        const repository = annotations.createLegacyAnnotationsRepository({ accountId: 'person@example.test' });
        const feature = annotations.createAnnotationsFeature({
            repositoryForSession: async () => repository,
            now: () => '2026-08-01T00:00:00.000Z'
        });
        await feature.start({ session: 'person@example.test' });
        const migrated = feature.search()[0];
        assert.equal(migrated.body, 'old');
        assert.equal(migrated.pinned, true);
        await feature.upsert({
            conversation: { id: 'c1', title: 'Legacy', href: '/app/c1' },
            anchor: { kind: 'message', excerpt: 'selected' },
            body: 'message detail', tags: ['detail'], status: 'resolved'
        });

        const stored = storage.get(repository.key);
        assert.equal(stored.schema, 'primer-pp.annotations');
        assert.equal(stored.version, 2);
        assert.equal(Object.keys(stored.annotations).length, 2);
        assert.equal(stored.notes.c1.note, 'old');
        assert.equal(stored.notes.c1.pinned, true);
        stored.annotations[Object.keys(stored.annotations)[0]].body = 'mutated';
        assert.notEqual(feature.search()[0].body, 'mutated');
        await feature.stop();
        assert.equal(flushCalls, 1);
    });

    it('projects the best conversation record and validates/recovers repository operations', async () => {
        const state = {
            version: 2,
            annotations: {
                message: {
                    id: 'message', conversation: { id: 'c', title: 'Message', href: '/m' },
                    anchor: annotations.resolveAnnotationAnchor({ kind: 'message', excerpt: 'x' }, 'c'),
                    body: 'message', tags: [], status: 'active', pinned: false,
                    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T03:00:00.000Z'
                },
                older: {
                    id: 'older', conversation: { id: 'c', title: 'Old conversation', href: '/old' },
                    anchor: { kind: 'conversation', conversationId: 'c' },
                    body: 'old', tags: [], status: 'active', pinned: true,
                    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T01:00:00.000Z'
                },
                newer: {
                    id: 'newer', conversation: { id: 'c', title: 'New conversation', href: '/new' },
                    anchor: { kind: 'conversation', conversationId: 'c' },
                    body: 'new', tags: [], status: 'archived', pinned: false,
                    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T02:00:00.000Z'
                }
            }
        };
        const projected = annotations.createLegacyNotesProjection(state);
        assert.equal(projected.notes.c.note, 'new');
        assert.equal(projected.notes.c.title, 'New conversation');

        assert.throws(() => annotations.createLegacyAnnotationsRepository(), /account id/);
        assert.throws(
            () => annotations.createLegacyAnnotationsRepository({ accountId: 'a', getValue: null, setValue: null }),
            /GM get\/set/
        );
        assert.throws(
            () => annotations.createLegacyAnnotationsRepository({ accountId: 'a', flush: 1 }),
            /flush must be a function/
        );
        const repository = annotations.createLegacyAnnotationsRepository({ accountId: 'Guest', flush: undefined });
        assert.throws(() => repository.update(null), /updater/);

        await assert.rejects(repository.update(() => { throw new Error('first failed'); }), /first failed/);
        const recovered = await repository.update(() => ({
            version: 2,
            annotations: { one: { ...state.annotations.newer, id: 'one' } }
        }));
        assert.equal(recovered.notes.c.note, 'new');
        await repository.flush();
    });
});

describe('Annotations service and legacy module lifecycle', () => {
    it('enforces read-only and expected-session write contexts', async () => {
        const repository = annotations.createLegacyAnnotationsRepository({ accountId: 'alpha@example.test' });
        const feature = annotations.createAnnotationsFeature({ repositoryForSession: async () => repository });
        await feature.start({ session: { accountId: 'alpha@example.test', kind: 'inspection' } });
        assert.equal(feature.isReadOnly(), true);
        await assert.rejects(
            feature.upsert({ conversationId: 'c', body: 'blocked' }),
            error => error.code === 'READ_ONLY_SESSION'
        );
        await feature.onSessionChange({ userId: 'alpha@example.test', readOnly: false });
        assert.equal(feature.isReadOnly(), false);
        await assert.rejects(
            feature.upsert({ conversationId: 'c', body: 'blocked' }, { sessionId: 'other' }),
            error => error.code === 'SESSION_CHANGED'
        );
        await assert.rejects(
            feature.upsert({ conversationId: 'c', body: 'blocked' }, { mode: 'inspection' }),
            error => error.code === 'READ_ONLY_SESSION'
        );
        await feature.upsert({ conversationId: 'c', body: 'saved' }, { accountId: 'alpha@example.test' });
        await assert.rejects(
            feature.remove(feature.search()[0].id, { readOnly: true }),
            error => error.code === 'READ_ONLY_SESSION'
        );
    });

    it('migrates old per-account data and switches without mixing sessions', async () => {
        storage.set('gemini_chat_notes_alpha@example.test', {
            notes: { 'chat-1': { title: 'Alpha', href: '/app/chat-1', note: 'alpha note', pinned: true } }
        });
        storage.set('gemini_chat_notes_beta@example.test', {
            notes: { 'chat-2': { title: 'Beta', href: '/app/chat-2', note: 'beta note', pinned: false } }
        });
        await ChatNotesModule.init({ session: { userId: 'alpha@example.test' } });
        assert.equal(ChatNotesModule.id, 'chat-notes');
        assert.equal(ChatNotesModule.name, 'Annotations');
        assert.equal(ChatNotesModule.legacyName, 'Chat Notes');
        assert.equal(ChatNotesModule._getStorageKey(), 'gemini_chat_notes_alpha@example.test');
        assert.equal(ChatNotesModule.injectNativeUI(), true);
        assert.equal(ChatNotesModule.data.notes['chat-1'].note, 'alpha note');

        currentUser = 'beta@example.test';
        currentChat = { id: 'chat-2', title: 'Beta', href: '/app/chat-2' };
        inspectingUser = currentUser;
        await ChatNotesModule.onUserChange(currentUser);
        assert.equal(ChatNotesModule.data.notes['chat-2'].note, 'beta note');
        assert.equal(ChatNotesModule.data.notes['chat-1'], undefined);
        assert.equal(flushCalls, 1);

        currentUser = 'alpha@example.test';
        inspectingUser = currentUser;
        await ChatNotesModule.loadData(currentUser);
        assert.equal(ChatNotesModule.data.notes['chat-1'].note, 'alpha note');
        await ChatNotesModule.destroy();
        assert.equal(ChatNotesModule.injectNativeUI(), false);
        assert.deepEqual(ChatNotesModule.data, { notes: {} });
    });

    it('exposes a frozen session-bound archive integration without leaking repositories', async () => {
        currentUser = 'alpha@example.test';
        inspectingUser = currentUser;
        await ChatNotesModule.init({ session: currentUser });
        const integration = ChatNotesModule.getPortableArchiveIntegration();
        assert.equal(Object.isFrozen(integration), true);
        assert.deepEqual(Object.keys(integration), ['section', 'exportSection', 'contributor']);
        assert.equal(Object.hasOwn(integration, 'repository'), false);
        assert.equal(Array.isArray(await integration.exportSection()), true);
        const restoreContext = { section: 'annotations', plan: {}, actions: [] };
        assert.equal((await integration.contributor.snapshot(restoreContext)).sessionId, currentUser);

        inspectingUser = 'other@example.test';
        const inspection = ChatNotesModule.getPortableArchiveIntegration();
        assert.equal(Array.isArray(await inspection.exportSection()), true);
        await assert.rejects(
            inspection.contributor.snapshot(restoreContext),
            error => error.code === 'READ_ONLY_SESSION'
        );

        inspectingUser = 'beta@example.test';
        currentUser = 'beta@example.test';
        await ChatNotesModule.onUserChange(currentUser);
        await assert.rejects(integration.exportSection(), error => error.code === 'SESSION_CHANGED');
        await assert.rejects(
            integration.contributor.snapshot(restoreContext),
            error => error.code === 'SESSION_CHANGED'
        );
        await ChatNotesModule.destroy();
        assert.throws(
            () => ChatNotesModule.getPortableArchiveIntegration(),
            error => error.code === 'NOT_STARTED'
        );
    });

    it('cancels old continuations and flushes them before reading the next account', async () => {
        let releaseWrite;
        let writeEntered;
        const entered = new Promise(resolve => { writeEntered = resolve; });
        setGlobal('GM_setValue', async (key, value) => {
            if (key.includes('alpha@')) {
                writeEntered();
                await new Promise(resolve => { releaseWrite = resolve; });
            }
            storage.set(key, clone(value));
        });
        await ChatNotesModule.init({ session: currentUser });
        const pendingWrite = ChatNotesModule._service.upsert({ conversationId: 'chat-1', body: 'old write' });
        await entered;
        currentUser = 'beta@example.test';
        inspectingUser = currentUser;
        const switching = ChatNotesModule.onUserChange(currentUser);
        await Promise.resolve();
        assert.throws(
            () => ChatNotesModule._service.getSessionId(),
            error => error.code === 'NOT_STARTED'
        );
        releaseWrite();
        await assert.rejects(pendingWrite, error => error.code === 'SESSION_CHANGED');
        await switching;
        assert.equal(ChatNotesModule._service.getSessionId(), 'beta@example.test');
        assert.equal(ChatNotesModule._service.search().length, 0);
        assert.equal(storage.get('gemini_chat_notes_alpha@example.test').notes['chat-1'].note, 'old write');
    });
});

describe('Annotations panel integration and accessible interaction', () => {
    it('renders labeled controls and persists migrated conversation fields through real buttons', async () => {
        storage.set('gemini_chat_notes_alpha@example.test', {
            notes: { 'chat-1': { title: 'Architecture', href: '/app/chat-1', note: 'legacy body', pinned: false } }
        });
        await ChatNotesModule.init({ session: currentUser });
        const container = documentRef.createElement('section');
        documentRef.body.appendChild(container);
        ChatNotesModule.renderToDetailsPane(container);

        const labels = byTag(container, 'label');
        const controls = byTag(container, 'textarea').concat(byTag(container, 'input'), byTag(container, 'select'));
        assert.ok(labels.length >= 4);
        for (const control of controls) {
            assert.ok(control.id, `${control.tagName} must have an id`);
            assert.ok(labels.some(label => label.htmlFor === control.id), `${control.tagName} must have a real label`);
        }
        for (const button of byTag(container, 'button')) {
            assert.match(button.style.cssText, /min-width:44px;min-height:44px/);
            assert.ok(button.getAttribute('aria-label'));
        }
        assert.equal(walk(container).some(node => node.tagName === 'SPAN' && typeof node.onclick === 'function'), false);

        const textarea = byTag(container, 'textarea')[0];
        const tags = byTag(container, 'input').find(input => input.type === 'text');
        const status = byTag(container, 'select')[0];
        textarea.value = 'migrated and edited';
        tags.value = 'Architecture, Follow-up';
        status.value = 'resolved';
        await byText(container, 'button', 'Save annotation').click();
        const saved = ChatNotesModule._service.search({ conversationId: 'chat-1' })[0];
        assert.equal(saved.body, 'migrated and edited');
        assert.deepEqual(saved.tags, ['Architecture', 'Follow-up']);
        assert.equal(saved.status, 'resolved');
        assert.equal(storage.get('gemini_chat_notes_alpha@example.test').notes['chat-1'].note, 'migrated and edited');

        const refreshedSearch = byTag(container, 'input').find(input => input.type === 'search');
        refreshedSearch.value = 'follow-up';
        refreshedSearch.oninput();
        assert.ok(byText(container, 'button', 'migrated and edited'));
    });

    it('makes inspection mode visibly read-only and blocks every write route', async () => {
        await ChatNotesModule.init({ session: currentUser });
        inspectingUser = 'other@example.test';
        const container = documentRef.createElement('section');
        ChatNotesModule.renderToDetailsPane(container);
        assert.ok(walk(container).find(node => node.getAttribute?.('role') === 'status'));
        assert.equal(byTag(container, 'textarea')[0].readOnly, true);
        assert.equal(byTag(container, 'select')[0].disabled, true);
        assert.equal(byText(container, 'button', 'Save annotation').disabled, true);
        assert.equal(byText(container, 'button', 'Import annotations').disabled, true);

        const before = clone(storage);
        const result = await ChatNotesModule._mutate(context => ChatNotesModule._service.upsert({
            conversationId: 'chat-1', body: 'blocked'
        }, context));
        assert.equal(result, false);
        assert.equal(toasts.at(-1), 'Annotations are read-only while inspecting another account');
        assert.deepEqual([...storage], [...before]);
        ChatNotesModule._importAnnotations();
        assert.equal(toasts.at(-1), 'Annotations are read-only while inspecting another account');
        assert.equal(ChatNotesModule._openSelectionAnnotationDialog(currentChat), null);
    });

    it('captures stable message locators in a managed Escape/focus dialog', async () => {
        await ChatNotesModule.init({ session: currentUser });
        const selectedNode = documentRef.createElement('span');
        const textNode = documentRef.createTextNode('important selected answer');
        selectedNode.appendChild(textNode);
        GeminiAdapter.getMessageLocatorForNode = node => {
            assert.equal(node, selectedNode);
            return { kind: 'message', chatId: 'chat-1', messageId: 'message-stable-1', ordinal: 1 };
        };
        GeminiAdapter.getCurrentConversationMessages = () => [
            { id: 'first', role: 'user', text: 'question' },
            { id: 'message-stable-1', role: 'model', text: 'important selected answer' }
        ];
        selection = {
            isCollapsed: false,
            rangeCount: 1,
            toString: () => ' important selected answer ',
            getRangeAt: () => ({ commonAncestorContainer: textNode })
        };

        const handle = ChatNotesModule._openSelectionAnnotationDialog(currentChat);
        assert.equal(handle.options.closeOnEscape, true);
        assert.equal(handle.options.restoreFocus, true);
        assert.equal(handle.options.initialFocus.tagName, 'TEXTAREA');
        const modal = handle.options.contentElement;
        const textarea = byTag(modal, 'textarea')[0];
        const tags = byTag(modal, 'input')[0];
        textarea.value = 'why this matters';
        tags.value = 'Evidence, Review';
        await byText(modal, 'button', 'Save message annotation').click();
        assert.equal(handle.reason, 'save');
        const message = ChatNotesModule._service.search({ anchorKind: 'message' })[0];
        assert.equal(message.body, 'why this matters');
        assert.deepEqual(message.tags, ['Evidence', 'Review']);
        assert.equal(message.anchor.strategy, 'stable-id');
        assert.equal(message.anchor.messageId, 'message-stable-1');
        assert.equal(message.anchor.role, 'assistant');
        assert.equal(message.anchor.ordinal, 1);
        assert.equal(message.anchor.excerpt, 'important selected answer');
        assert.deepEqual(message.anchor.diagnostics, []);

        selection = { isCollapsed: true, rangeCount: 0, toString: () => '' };
        assert.equal(ChatNotesModule._openSelectionAnnotationDialog(currentChat), null);
        assert.equal(toasts.at(-1), 'Select text in the current conversation first');
    });

    it('opens stable message backlinks and degrades explicitly to conversation or unavailable states', async () => {
        await ChatNotesModule.init({ session: currentUser });
        await ChatNotesModule._service.upsert({
            id: 'stable-backlink',
            conversation: currentChat,
            anchor: {
                kind: 'message', messageId: 'stable-message', role: 'assistant', ordinal: 1, excerpt: 'stable excerpt'
            },
            body: 'Stable backlink'
        });
        await ChatNotesModule._service.upsert({
            id: 'fallback-backlink',
            conversation: { id: 'chat-2', title: 'Other chat', href: '/app/chat-2' },
            anchor: { kind: 'message', role: 'user', ordinal: 0, excerpt: 'fallback excerpt' },
            body: 'Fallback backlink'
        });
        await ChatNotesModule._service.upsert({
            id: 'missing-backlink',
            conversation: { id: 'chat-1', title: 'Current chat', href: '' },
            anchor: { kind: 'message', role: 'assistant', ordinal: 8, excerpt: 'missing excerpt' },
            body: 'Missing backlink'
        });

        const opened = [];
        GeminiAdapter.openMessageLocator = (locator, options) => {
            opened.push({ locator, options });
            return locator.messageId === 'stable-message';
        };
        const stableResults = documentRef.createElement('div');
        ChatNotesModule._renderSearchResults(stableResults, 'Stable backlink');
        const stableButton = byTag(stableResults, 'button')[0];
        assert.match(stableButton.textContent, /Jump to message/);
        assert.equal(await stableButton.click(), true);
        assert.deepEqual(opened[0], {
            locator: {
                kind: 'message', chatId: 'chat-1', messageId: 'stable-message', ordinal: 1
            },
            options: { requireStable: true }
        });
        assert.equal(window.location.href, '');

        const fallbackResults = documentRef.createElement('div');
        ChatNotesModule._renderSearchResults(fallbackResults, 'Fallback backlink');
        const fallbackButton = byTag(fallbackResults, 'button')[0];
        assert.match(fallbackButton.title, /MESSAGE_ID_UNAVAILABLE/);
        assert.equal(await fallbackButton.click(), true);
        assert.equal(window.location.href, '/app/chat-2');
        assert.equal(toasts.at(-1), 'Exact message location is unavailable; opened its conversation instead');

        const missingResults = documentRef.createElement('div');
        ChatNotesModule._renderSearchResults(missingResults, 'Missing backlink');
        const missingButton = byTag(missingResults, 'button')[0];
        assert.equal(missingButton.disabled, false);
        assert.equal(await missingButton.click(), false);
        assert.equal(toasts.at(-1), 'The saved message location is currently unavailable');

        GeminiAdapter.openMessageLocator = () => { throw new Error('locator host changed'); };
        GeminiAdapter.getChatId = () => { throw new Error('route unreadable'); };
        window.location.href = '';
        const fallback = ChatNotesModule._service.search({ query: 'Fallback backlink' })[0];
        assert.equal(ChatNotesModule._openAnnotationBacklink(fallback), true);
        assert.equal(window.location.href, '/app/chat-2');
        GeminiAdapter.openMessageLocator = () => false;
        GeminiAdapter.getChatId = undefined;
        window.location.href = '';
        assert.equal(ChatNotesModule._openAnnotationBacklink(fallback), true);
        assert.equal(window.location.href, '/app/chat-2');

        await ChatNotesModule._service.upsert({
            id: 'missing-conversation',
            conversation: { id: 'chat-3', title: 'Missing conversation', href: '' },
            anchor: { kind: 'conversation' },
            body: 'Missing conversation backlink'
        });
        const missingConversation = ChatNotesModule._service.search({ query: 'Missing conversation backlink' })[0];
        assert.equal(ChatNotesModule._openAnnotationBacklink(missingConversation), false);
        assert.equal(toasts.at(-1), 'The annotation conversation link is unavailable');
    });

    it('confirms deletion, renders empty states, pins, searches, and navigates semantically', async () => {
        await ChatNotesModule.init({ session: currentUser });
        await ChatNotesModule._service.upsert({
            id: 'one', conversation: currentChat, anchor: { kind: 'conversation' },
            body: 'pinned result', pinned: true
        });
        ChatNotesModule._syncCompatibilityData();
        const container = documentRef.createElement('section');
        ChatNotesModule.renderToDetailsPane(container);
        assert.ok(byText(container, 'button', 'Insert packet'));
        const navigate = byText(container, 'button', 'pinned result');
        await navigate.click();
        assert.equal(window.location.href, '/app/chat-1');

        await byText(container, 'button', 'Delete annotation').click();
        assert.equal(confirmations.length, 1);
        assert.equal(confirmations[0].options.danger, true);
        await confirmations[0].onConfirm();
        assert.equal(ChatNotesModule._service.search().length, 0);

        currentChat = null;
        const empty = documentRef.createElement('section');
        ChatNotesModule.renderToDetailsPane(empty);
        assert.match(empty.textContent, /Open a conversation/);
        assert.match(empty.textContent, /No pinned annotations/);
        const search = byTag(empty, 'input').find(input => input.type === 'search');
        search.value = 'missing';
        search.oninput();
        assert.match(empty.textContent, /No matching annotations/);
    });

    it('inserts explicit references through textarea and contenteditable editor fallbacks', async () => {
        await ChatNotesModule.init({ session: currentUser });
        const annotation = {
            id: 'ref', conversation: currentChat, anchor: { kind: 'conversation' },
            body: 'reference body', tags: [], status: 'active', pinned: true,
            createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z'
        };
        const editor = documentRef.createElement('textarea');
        editor.value = 'before after';
        editor.selectionStart = 7;
        editor.selectionEnd = 12;
        GeminiAdapter.getInputEditor = () => editor;
        ChatNotesModule._insertContextReference(annotation);
        assert.match(editor.value, /before \[Gemini chat reference\]/);

        const richEditor = documentRef.createElement('div');
        delete richEditor.value;
        GeminiAdapter.getInputEditor = () => richEditor;
        assert.equal(ChatNotesModule._insertTextIntoEditor('rich text'), true);
        assert.equal(byTag(richEditor, 'p')[0].textContent, 'rich text');

        const accepting = documentRef.createElement('textarea');
        accepting.value = '';
        accepting.dispatchEvent = event => {
            if (event.type === 'beforeinput') accepting.value = event.data;
            return true;
        };
        GeminiAdapter.getInputEditor = () => accepting;
        assert.equal(ChatNotesModule._insertTextIntoEditor('accepted'), true);
        assert.equal(accepting.value, 'accepted');

        GeminiAdapter.getInputEditor = () => null;
        assert.equal(ChatNotesModule._insertTextIntoEditor('missing'), false);
        ChatNotesModule._insertPinnedContextPacket([]);
    });

    it('exports and imports both v2 and legacy JSON through accessible file controls', async () => {
        await ChatNotesModule.init({ session: currentUser });
        await ChatNotesModule._service.upsert({ conversation: currentChat, body: 'export me', pinned: true });
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        let revoked;
        URL.createObjectURL = () => 'blob:test';
        URL.revokeObjectURL = value => { revoked = value; };
        try {
            ChatNotesModule._exportAnnotations();
            assert.equal(documentRef.lastClicked.tagName, 'A');
            assert.match(documentRef.lastClicked.download, /^primer-pp-annotations-/);
            assert.equal(revoked, 'blob:test');
        } finally {
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
        }

        ChatNotesModule._importAnnotations();
        const fileInput = documentRef.lastClicked;
        assert.equal(fileInput.type, 'file');
        assert.equal(fileInput.getAttribute('aria-label'), 'Choose annotations JSON file');
        fileInput.files = [{ content: JSON.stringify({
            schema: 'primer-pp.chat-notes', version: 1,
            notes: { imported: { title: 'Imported', note: 'legacy import', pinned: false } }
        }) }];
        fileInput.onchange({ target: fileInput });
        await fileReadPromise;
        await flushTasks();
        assert.equal(ChatNotesModule._service.search({ query: 'legacy import' }).length, 1);
        assert.equal(toasts.at(-1), 'Annotations imported');

        ChatNotesModule._importAnnotations();
        const failedInput = documentRef.lastClicked;
        failedInput.files = [{ fail: true }];
        failedInput.onchange({ target: failedInput });
        assert.equal(toasts.at(-1), 'Could not read annotation file');
        ChatNotesModule._importAnnotations();
        documentRef.lastClicked.onchange({ target: { files: [] } });
    });

    it('covers compatibility fallbacks without weakening semantics', async () => {
        assert.equal(ChatNotesModule._getStorageKey('Guest'), 'gemini_chat_notes');
        assert.equal(ChatNotesModule._getSessionId({ accountId: 'account' }), 'account');
        assert.equal(ChatNotesModule._getSessionId({ id: 'identity' }), 'identity');
        assert.equal(ChatNotesModule._getSessionId({}), 'Guest');
        assert.equal(ChatNotesModule._getSessionId('   '), 'Guest');
        assert.equal(ChatNotesModule._getSessionId(), currentUser);

        ChatNotesModule._repositories = null;
        const firstRepository = ChatNotesModule._createRepository('Guest');
        assert.equal(ChatNotesModule._createRepository('Guest'), firstRepository);
        ChatNotesModule._repositories = null;

        ChatNotesModule._syncCompatibilityData();
        assert.deepEqual(ChatNotesModule.data, { notes: {} });
        assert.deepEqual(ChatNotesModule._snapshot(), { version: 2, annotations: {} });
        assert.equal(await ChatNotesModule._mutate(() => { throw new Error('must not run'); }), false);
        await ChatNotesModule.onUserChange(currentUser);

        ChatNotesModule._showError({ code: 'SESSION_CHANGED' });
        assert.equal(toasts.at(-1), 'The account changed; please try again');
        ChatNotesModule._showError(new Error('unknown'));
        assert.equal(toasts.at(-1), 'Annotation operation failed');

        const disabled = ChatNotesModule._makeButton('Disabled', () => { throw new Error('must not click'); }, { disabled: true });
        assert.equal(disabled.click(), undefined);
        assert.equal(disabled.onclick(new FakeEvent('click', { target: disabled })), undefined);

        await ChatNotesModule.init({ session: currentUser });
        await ChatNotesModule.init({ session: currentUser });
        const container = documentRef.createElement('section');
        container.replaceChildren = undefined;
        documentRef.body.appendChild(container);
        ChatNotesModule.renderToDetailsPane(container);
        ChatNotesModule._refreshDetails();
        assert.match(container.textContent, /Annotations/);

        documentRef.title = 'Document fallback';
        Core.scanSidebarChats = () => [];
        assert.deepEqual(ChatNotesModule._getCurrentChatRef(), {
            id: 'chat-1', title: 'Document fallback', href: '/app/chat-1'
        });
        documentRef.title = '';
        assert.equal(ChatNotesModule._getCurrentChatRef().title, 'chat-1');
        Core.getChatId = () => null;
        assert.equal(ChatNotesModule._getCurrentChatRef(), null);
        Core.getChatId = () => currentChat.id;
        Core.scanSidebarChats = () => [clone(currentChat)];

        const editor = documentRef.createElement('textarea');
        editor.value = 'end';
        GeminiAdapter.getInputEditor = () => editor;
        ChatNotesModule._insertTextIntoEditor('!');
        assert.equal(editor.value, 'end!');
        ChatNotesModule._insertPinnedContextPacket([{
            chatId: 'chat-1', title: 'Architecture', href: '/app/chat-1', note: 'packet'
        }]);
        assert.match(editor.value, /Pinned Gemini context packet/);

        const pinContainer = documentRef.createElement('section');
        ChatNotesModule.renderToDetailsPane(pinContainer);
        await byText(pinContainer, 'button', '☆').click();
        assert.equal(ChatNotesModule._service.search({ pinned: true }).length, 1);
        const packetContainer = documentRef.createElement('section');
        ChatNotesModule.renderToDetailsPane(packetContainer);
        await byText(packetContainer, 'button', '★').click();
        assert.equal(ChatNotesModule._service.search({ pinned: true }).length, 0);
        const savedContainer = documentRef.createElement('section');
        ChatNotesModule.renderToDetailsPane(savedContainer);
        await byText(savedContainer, 'button', 'Save annotation').click();
        const repinnedContainer = documentRef.createElement('section');
        ChatNotesModule.renderToDetailsPane(repinnedContainer);
        await byText(repinnedContainer, 'button', '☆').click();
        ChatNotesModule.renderToDetailsPane(packetContainer);
        await byText(packetContainer, 'button', 'Insert packet').click();

        const search = byTag(packetContainer, 'input').find(input => input.type === 'search');
        search.value = 'Architecture';
        search.oninput();
        const directResults = documentRef.createElement('div');
        ChatNotesModule._renderSearchResults(directResults, 'Architecture');
        const resultButton = byTag(directResults, 'button')[0];
        assert.match(resultButton.style.cssText, /min-width:0/);
        assert.match(resultButton.style.cssText, /text-overflow:ellipsis/);
        assert.match(byTag(directResults, 'button')[1].style.cssText, /flex:0 0 44px/);
        await resultButton.click();
        await byTag(directResults, 'button')[1].click();
        assert.equal(window.location.href, '/app/chat-1');

        const fallbackResults = documentRef.createElement('div');
        fallbackResults.replaceChildren = undefined;
        ChatNotesModule._renderSearchResults(fallbackResults, '');
        assert.equal(fallbackResults.textContent, '');

        selection = null;
        assert.equal(ChatNotesModule._getVisibleSelection(), null);
        selection = { isCollapsed: false, rangeCount: 1, toString: () => '' };
        assert.equal(ChatNotesModule._getVisibleSelection(), null);
        selection = { isCollapsed: false, rangeCount: 0, toString: () => 'text' };
        assert.equal(ChatNotesModule._getVisibleSelection(), null);
        selection = {
            isCollapsed: false, rangeCount: 1, toString: () => 'text',
            getRangeAt: () => ({ commonAncestorContainer: null })
        };
        assert.equal(ChatNotesModule._getVisibleSelection(), null);
        const elementNode = documentRef.createElement('span');
        selection = {
            isCollapsed: false, rangeCount: 1, toString: () => 'element text',
            getRangeAt: () => ({ commonAncestorContainer: elementNode })
        };
        GeminiAdapter.isInsideChatContent = () => false;
        assert.equal(ChatNotesModule._getVisibleSelection(), null);
        GeminiAdapter.isInsideChatContent = () => true;
        GeminiAdapter.getMessageLocatorForNode = () => ({
            kind: 'message', chatId: 'chat-1', messageId: null, ordinal: 3
        });
        GeminiAdapter.getCurrentConversationMessages = () => { throw new Error('transcript unavailable'); };
        const degradedCapture = ChatNotesModule._captureVisibleSelection();
        assert.deepEqual(degradedCapture.anchor, {
            kind: 'message', messageId: null, role: 'unknown', ordinal: 3, excerpt: 'element text'
        });
        GeminiAdapter.getCurrentConversationMessages = () => [];
        assert.deepEqual(ChatNotesModule._captureVisibleSelection().anchor, {
            kind: 'message', messageId: null, role: 'unknown', ordinal: 3, excerpt: 'element text'
        });
        GeminiAdapter.getMessageLocatorForNode = () => ({
            kind: 'message', chatId: 'chat-1', messageId: 'stable-without-ordinal', ordinal: null
        });
        assert.deepEqual(ChatNotesModule._captureVisibleSelection().anchor, {
            kind: 'message', messageId: 'stable-without-ordinal', role: 'unknown', ordinal: null, excerpt: 'element text'
        });
        GeminiAdapter.getMessageLocatorForNode = () => { throw new Error('locator unavailable'); };
        assert.deepEqual(ChatNotesModule._captureVisibleSelection().anchor, {
            kind: 'message', role: 'unknown', excerpt: 'element text'
        });
        assert.equal(ChatNotesModule._getVisibleSelection(), 'element text');
        const dialog = ChatNotesModule._openSelectionAnnotationDialog(currentChat);
        await byText(dialog.options.contentElement, 'button', 'Cancel').click();
        assert.equal(dialog.reason, 'cancel');

        const selectionContainer = documentRef.createElement('section');
        ChatNotesModule.renderToDetailsPane(selectionContainer);
        await byText(selectionContainer, 'button', 'Annotate selection').click();
        assert.ok(dialogs.length >= 2);

        const onboarding = ChatNotesModule.getOnboarding();
        assert.match(onboarding.zh.features, /注释/);
        assert.match(onboarding.en.guide, /inspection|inspecting/i);

        await ChatNotesModule.destroy();
        ChatNotesModule._searchQuery = '';
        ChatNotesModule._detailsContainer = null;
        ChatNotesModule._renderPinnedAnnotations(documentRef.createElement('section'));
        ChatNotesModule._exportAnnotations();
        const noService = documentRef.createElement('section');
        ChatNotesModule.renderToDetailsPane(noService);
        assert.match(noService.textContent, /No pinned annotations/);
        await ChatNotesModule.loadData(currentUser);
        assert.equal(ChatNotesModule.injectNativeUI(), true);
    });

    it('contains invalid import errors and reports the non-import branch', async () => {
        await ChatNotesModule.init({ session: currentUser });
        ChatNotesModule._importAnnotations();
        const input = documentRef.lastClicked;
        input.files = [{ content: null }];
        input.onchange({ target: input });
        await fileReadPromise;
        await flushTasks();
        assert.equal(toasts.at(-1), 'Annotation operation failed');
        assert.equal(ChatNotesModule._service.search().length, 0);
    });
});
