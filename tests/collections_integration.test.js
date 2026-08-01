const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const NOW = '2026-08-01T00:00:00.000Z';

class FakeEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.defaultPrevented = false;
        this.propagationStopped = false;
        Object.assign(this, init);
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
}

class FakeClassList {
    constructor(element) { this.element = element; }
    _values() { return this.element.className.split(/\s+/).filter(Boolean); }
    contains(value) { return this._values().includes(value); }
    add(...values) { this.element.className = [...new Set([...this._values(), ...values])].join(' '); }
    remove(...values) { this.element.className = this._values().filter(value => !values.includes(value)).join(' '); }
}

class FakeElement {
    constructor(tagName, ownerDocument, nodeType = 1) {
        this.tagName = nodeType === 3 ? '#TEXT' : String(tagName).toUpperCase();
        this.nodeType = nodeType;
        this.ownerDocument = ownerDocument;
        this.parentNode = null;
        this.children = [];
        this.attributes = new Map();
        this.dataset = {};
        this.style = { cssText: '', display: '', background: '' };
        this.className = '';
        this.classList = new FakeClassList(this);
        this.id = '';
        this.type = '';
        this.value = '';
        this.name = '';
        this.disabled = false;
        this.selected = false;
        this.required = false;
        this.hidden = false;
        this.draggable = false;
        this.files = [];
        this.href = '';
        this.download = '';
        this.title = '';
        this._text = '';
        this._listeners = new Map();
    }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get firstChild() { return this.children[0] ?? null; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) {
        this._text = String(value ?? '');
        for (const child of this.children) child.parentNode = null;
        this.children = [];
    }
    setAttribute(name, value) {
        const text = String(value);
        this.attributes.set(name, text);
        if (name === 'id') this.id = text;
        if (name === 'class') this.className = text;
        if (name === 'draggable') this.draggable = text === 'true';
        if (name.startsWith('data-')) {
            const key = name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
            this.dataset[key] = text;
        }
    }
    getAttribute(name) {
        if (name === 'draggable' && this.attributes.has(name)) return this.attributes.get(name);
        return this.attributes.get(name) ?? null;
    }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) {
        this.attributes.delete(name);
        if (name === 'draggable') this.draggable = false;
    }
    appendChild(child) {
        child.parentNode?.removeChild?.(child);
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    append(...children) { for (const child of children) this.appendChild(child); }
    prepend(child) {
        child.parentNode?.removeChild?.(child);
        child.parentNode = this;
        this.children.unshift(child);
        return child;
    }
    insertBefore(child, reference) {
        child.parentNode?.removeChild?.(child);
        child.parentNode = this;
        const index = this.children.indexOf(reference);
        if (index < 0) this.children.push(child);
        else this.children.splice(index, 0, child);
        return child;
    }
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
        for (const listener of this._listeners.get(event.type) ?? []) listener.call(this, event);
        const property = this[`on${event.type}`];
        if (typeof property === 'function') property.call(this, event);
        return !event.defaultPrevented;
    }
    click() {
        if (this.disabled) return undefined;
        this.clickCount = (this.clickCount ?? 0) + 1;
        this.ownerDocument.activeElement = this;
        return this.onclick?.(new FakeEvent('click', { target: this }));
    }
    querySelectorAll(selector) { return walk(this).filter(element => matches(element, selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

class FakeDocument {
    constructor() {
        this.nodeType = 9;
        this.activeElement = null;
        this.created = [];
        this.documentElement = new FakeElement('html', this);
        this.head = new FakeElement('head', this);
        this.body = new FakeElement('body', this);
        this.documentElement.append(this.head, this.body);
    }
    createElement(tagName) {
        const element = new FakeElement(tagName, this);
        this.created.push(element);
        return element;
    }
    createTextNode(text) {
        const node = new FakeElement('#text', this, 3);
        node.textContent = text;
        return node;
    }
    getElementById(id) { return walk(this.documentElement).find(element => element.id === id) ?? null; }
    querySelectorAll(selector) { return walk(this.documentElement).filter(element => matches(element, selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

function walk(rootNode) {
    return [rootNode, ...rootNode.children.flatMap(walk)];
}

function matches(element, selector) {
    if (selector.startsWith('#')) return element.id === selector.slice(1);
    if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
    const data = selector.match(/^\[data-([a-z-]+)(?:="([^"]+)")?\]$/);
    if (data) {
        const key = data[1].replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
        return Object.prototype.hasOwnProperty.call(element.dataset, key)
            && (data[2] === undefined || element.dataset[key] === data[2]);
    }
    return element.tagName === selector.toUpperCase();
}

function byText(rootNode, tagName, text) {
    return walk(rootNode).find(element => element.tagName === tagName.toUpperCase() && element.textContent.includes(text));
}

function dataTransfer() {
    const values = new Map();
    return {
        setData(type, value) { values.set(type, String(value)); },
        getData(type) { return values.get(type) ?? ''; }
    };
}

class FakeScheduler {
    constructor() {
        this.next = 1;
        this.tasks = new Map();
        this.cancelled = [];
        this.schedule = (callback, delay) => {
            const id = this.next++;
            this.tasks.set(id, { callback, delay });
            return id;
        };
        this.cancel = id => {
            this.cancelled.push(id);
            this.tasks.delete(id);
        };
    }
    async run(id) {
        const task = this.tasks.get(id);
        this.tasks.delete(id);
        return task?.callback();
    }
    async runAll() {
        for (const id of [...this.tasks.keys()]) await this.run(id);
    }
}

class FakeObserver {
    constructor() { this.entries = new Map(); this.unregistered = []; }
    register(id, config) { this.entries.set(id, config); }
    unregister(id) { this.unregistered.push(id); this.entries.delete(id); }
}

class MemoryStorage {
    constructor(entries = []) { this.values = new Map(entries); this.sets = []; this.flushes = 0; }
    get(key, fallback) { return structuredClone(this.values.has(key) ? this.values.get(key) : fallback); }
    set(key, value) { this.values.set(key, structuredClone(value)); this.sets.push(key); }
    flush() { this.flushes += 1; }
}

let collections;
let folders;
let foldersRuntime;
let viewSupport;

before(async () => {
    [collections, folders, foldersRuntime, viewSupport] = await Promise.all([
        import(pathToFileURL(path.join(root, 'src/features/collections/index.js')).href),
        import(pathToFileURL(path.join(root, 'src/modules/folders.js')).href),
        import(pathToFileURL(path.join(root, 'src/features/collections/folders_runtime.js')).href),
        import(pathToFileURL(path.join(root, 'src/features/collections/view_support.js')).href)
    ]);
});

function code(expected) {
    return error => error?.code === expected;
}

function stateFixture(sessionId = 'account-a') {
    return {
        schema: collections.COLLECTIONS_SCHEMA,
        version: 1,
        sessionId,
        collections: [
            {
                id: 'root', name: 'Research', parentId: null, position: 0,
                tags: ['work'], color: '#8ab4f8', collapsed: false, pinned: true,
                rules: [{ field: 'title', operator: 'contains', value: 'paper', enabled: true, caseSensitive: false }],
                ruleMode: 'any', createdAt: NOW, updatedAt: NOW
            },
            {
                id: 'child', name: 'Reading', parentId: 'root', position: 0,
                tags: ['read'], color: '#81c995', collapsed: false, pinned: false,
                rules: [], ruleMode: 'any', createdAt: NOW, updatedAt: NOW
            }
        ],
        memberships: [{ itemId: 'chat-1', collectionIds: ['root', 'child'] }],
        native: { notebooks: { available: true, ownership: 'native', officialEntryPolicy: 'preserve', observedAt: NOW } }
    };
}

function makeControllerFixture({ legacy, notebooks = true, confirm = true } = {}) {
    const document = new FakeDocument();
    const sidebar = document.createElement('nav');
    document.body.appendChild(sidebar);
    const chatElement1 = document.createElement('a');
    const chatElement2 = document.createElement('a');
    sidebar.append(chatElement1, chatElement2);
    const chats = [
        { id: 'chat-1', title: 'Existing paper', href: '/app/chat-1', element: chatElement1 },
        { id: 'chat-2', title: 'New paper', href: '/app/chat-2', element: chatElement2 }
    ];
    const storage = new MemoryStorage(legacy ? [['gemini_folders_data_account-a', legacy]] : []);
    const repositories = new Map();
    const service = collections.createCollectionsService({
        repositoryForSession(sessionId) {
            const repository = collections.createLegacyCollectionsRepository({ storage, sessionId, clock: () => NOW });
            repositories.set(sessionId, repository);
            return repository;
        },
        clock: () => NOW,
        idFactory: (() => { let index = 0; return () => `generated-${index++}`; })()
    });
    const view = collections.createCollectionsView({ document, translate: (_zh, en) => en });
    const observer = new FakeObserver();
    const scheduler = new FakeScheduler();
    const opened = [];
    const adapter = {
        scanSidebarChats: () => chats,
        getSidebarContainer: () => sidebar,
        matchesSidebarMutation: mutation => mutation.native === true,
        openChat: chat => { opened.push(chat.id); return true; },
        getNotebooksAvailability: () => notebooks
    };
    const toasts = [];
    const downloads = [];
    const imports = [];
    const ui = {
        confirm: async () => confirm,
        toast: (message, options) => toasts.push({ message, options }),
        downloadText: async (filename, text, type) => downloads.push({ filename, text, type }),
        pickTextFile: async options => { imports.push(options); return null; }
    };
    const controller = collections.createCollectionsController({
        service, view, adapter, observer, ui, clock: () => NOW,
        schedule: scheduler.schedule, cancelSchedule: scheduler.cancel, initialDelay: 25
    });
    return { document, sidebar, chats, storage, repositories, service, view, observer, scheduler, adapter, ui, controller, opened, toasts, downloads, imports };
}

describe('legacy Folders storage bridge', () => {
    it('keeps the exact legacy key policy and validates repository boundaries', async () => {
        assert.equal(collections.legacyStorageKey('Guest'), 'gemini_folders_data');
        assert.equal(collections.legacyStorageKey('person@example.test'), 'gemini_folders_data_person@example.test');
        assert.equal(collections.legacyStorageKey('temp', { temporarySessionId: 'temp', baseKey: 'old' }), 'old');
        assert.throws(() => collections.createLegacyCollectionsRepository(), TypeError);

        const storage = new MemoryStorage();
        const repository = collections.createLegacyCollectionsRepository({ storage, sessionId: 'Guest', clock: () => NOW });
        assert.equal(repository.storageKey, 'gemini_folders_data');
        assert.equal((await repository.get()).sessionId, 'Guest');
        await assert.rejects(repository.update(null), code('INVALID_UPDATER'));
        await repository.flush();
        assert.equal(storage.flushes, 1);
    });

    it('migrates old data and round-trips nested, tagged, multi-membership state without dropping extensions', async () => {
        const legacy = {
            schema: 'primer-pp.folders', version: 7, customTop: { retained: true },
            folders: {
                root: { name: 'Research', color: '#8ab4f8', customFolder: 42 },
                child: { name: 'Reading', parentId: 'root', tags: ['read'], collectionRules: [], ruleMode: 'all' }
            },
            folderOrder: ['root', 'child'],
            chatToFolder: { fallback: 'root' },
            chatToCollections: { multi: ['root', 'child'] }
        };
        const migrated = collections.readCollectionsFromLegacy(legacy, { sessionId: 'account-a', nowIso: NOW });
        assert.equal(migrated.collections[1].parentId, 'root');
        assert.deepEqual(migrated.collections[1].tags, ['read']);
        assert.deepEqual(migrated.memberships, [
            { itemId: 'fallback', collectionIds: ['root'] },
            { itemId: 'multi', collectionIds: ['child', 'root'] }
        ]);

        const output = collections.writeCollectionsToLegacy(migrated, legacy, { sessionId: 'account-a', nowIso: NOW });
        assert.equal(output.schema, 'primer-pp.folders');
        assert.equal(output.version, 7);
        assert.deepEqual(output.customTop, { retained: true });
        assert.equal(output.folders.root.customFolder, 42);
        assert.equal(output.folders.child.parentId, 'root');
        assert.deepEqual(output.chatToCollections.multi, ['child', 'root']);
        assert.equal(output.chatToFolder.multi, 'child');
        assert.equal(output.collectionsState.native.notebooks.officialEntryPolicy, 'preserve');

        const envelopeRead = collections.readCollectionsFromLegacy(output, { sessionId: 'account-a', nowIso: NOW });
        assert.deepEqual(envelopeRead, migrated);
        assert.deepEqual(
            collections.readCollectionsFromLegacy(stateFixture(), { sessionId: 'account-a', nowIso: NOW }),
            collections.normalizeCollectionsState(stateFixture(), { sessionId: 'account-a', nowIso: NOW })
        );
        assert.throws(() => collections.readCollectionsFromLegacy('bad', { sessionId: 'account-a' }), code('INVALID_LEGACY_STORAGE'));
    });

    it('persists service updates back into the old key and preserves legacy unknown data', async () => {
        const legacy = {
            customTop: 'keep', folders: { old: { name: 'Old', custom: 'keep' } },
            folderOrder: ['old'], chatToFolder: { chat: 'old' }
        };
        const storage = new MemoryStorage([['gemini_folders_data_account-a', legacy]]);
        const repository = collections.createLegacyCollectionsRepository({ storage, sessionId: 'account-a', clock: () => NOW });
        const updated = await repository.update(state => ({
            ...state,
            collections: state.collections.map(collection => ({ ...collection, name: 'Updated' }))
        }));
        assert.equal(updated.collections[0].name, 'Updated');
        const raw = storage.values.get('gemini_folders_data_account-a');
        assert.equal(raw.customTop, 'keep');
        assert.equal(raw.folders.old.custom, 'keep');
        assert.equal(raw.folders.old.name, 'Updated');
        assert.equal(raw.collectionsState.sessionId, 'account-a');
    });

    it('covers legacy fallbacks, regex projection, malformed membership skips, and optional flush', async () => {
        const regexState = stateFixture();
        regexState.collections[0].rules = [
            { field: 'title', operator: 'contains', value: 'legacy', enabled: false, caseSensitive: false, legacyType: 'regex' },
            { field: 'url', operator: 'contains', value: '/safe', enabled: true, caseSensitive: false }
        ];
        const projected = collections.writeCollectionsToLegacy(regexState, null);
        assert.deepEqual(projected.folders.root.rules, [{ type: 'regex', value: 'legacy' }]);
        assert.equal(projected.version, 1);
        assert.equal(projected.collectionsState.sessionId, 'account-a');

        const migrated = collections.readCollectionsFromLegacy({
            folders: { root: { name: 'Root' } },
            folderOrder: ['root'],
            chatToCollections: { bad: 'root', ' ': ['root'], good: ['missing', 'root'] }
        }, { sessionId: 'account-a', nowIso: NOW });
        assert.deepEqual(migrated.memberships, [{ itemId: 'good', collectionIds: ['root'] }]);
        assert.throws(() => collections.normalizeRules([
            { field: null, operator: 'contains', value: 'x' }
        ]), code('INVALID_RULE_FIELD'));

        const storage = {
            get: (_key, fallback) => fallback,
            set: () => undefined
        };
        const repository = collections.createLegacyCollectionsRepository({ storage, sessionId: 'account-a', clock: () => NOW });
        await repository.flush();
    });
});

describe('Collections presentation normalization', () => {
    it('normalizes partial sidebar records and derives default and filtered presentations', () => {
        const element = { marker: true };
        const chats = collections.normalizeSidebarChats([
            null,
            { id: '  ' },
            { id: ' alpha ', title: ' ', url: ' /alpha ', tags: [' one ', '', null], statuses: [' local ', null] },
            { id: 'beta', title: 'Beta', href: '/beta', tags: null, status: ' archived ', element },
            { id: 'gamma' }
        ]);
        assert.deepEqual(chats.map(chat => chat.statuses), [['local'], ['archived'], []]);
        assert.deepEqual(chats.map(chat => ({
            id: chat.id, title: chat.title, href: chat.href, tags: chat.tags, element: chat.element
        })), [
            { id: 'alpha', title: 'alpha', href: '/alpha', tags: ['one'], element: null },
            { id: 'beta', title: 'Beta', href: '/beta', tags: [], element },
            { id: 'gamma', title: 'gamma', href: '', tags: [], element: null }
        ]);

        const state = stateFixture();
        const defaults = collections.buildCollectionsPresentation(state, chats);
        assert.equal(defaults.query, '');
        assert.equal(defaults.editing, null);
        assert.equal(defaults.status, '');
        assert.equal(defaults.error, '');
        assert.equal(defaults.canUndo, false);
        assert.equal(defaults.chats.every(chat => chat.matchesQuery), true);

        const filtered = collections.buildCollectionsPresentation(state, chats, {
            query: 'alpha', editingId: 'root', status: 'ok', error: 'bad', canUndo: true, focusKey: 'x'
        });
        assert.equal(filtered.editing.id, 'root');
        assert.equal(filtered.chats[0].matchesQuery, true);
        assert.equal(filtered.chats[1].matchesQuery, false);
        assert.deepEqual(collections.collectionsInTreeOrder(filtered.tree).map(value => value.id), ['root', 'child']);
        assert.deepEqual(collections.collectionsInTreeOrder([], []), []);
    });
});

describe('Collections view semantics and lifecycle', () => {
    it('parses drafts and validates document, translator, handlers, and mount state', () => {
        assert.deepEqual(collections.parseTagsDraft(' one, ,two '), ['one', 'two']);
        assert.deepEqual(collections.parseTagsDraft(null), []);
        assert.deepEqual(collections.parseRulesDraft(''), []);
        assert.deepEqual(collections.parseRulesDraft(null), []);
        const rule = [{ field: 'title', operator: 'contains', value: 'paper' }];
        assert.deepEqual(collections.parseRulesDraft(JSON.stringify(rule))[0].value, 'paper');
        assert.match(collections.formatRulesDraft(rule), /paper/);
        assert.equal(collections.formatRulesDraft([]), '');
        assert.equal(collections.formatRulesDraft(null), '');
        assert.throws(() => collections.parseRulesDraft('{'), code('INVALID_RULES_JSON'));
        assert.deepEqual(collections.flattenCollectionTree([{ id: 'a', children: [{ id: 'b', children: [] }] }]).map(value => value.depth), [1, 2]);
        assert.throws(() => collections.createCollectionsView(), TypeError);
        assert.throws(() => collections.createCollectionsView({ document: new FakeDocument(), translate: true }), TypeError);

        const document = new FakeDocument();
        const view = collections.createCollectionsView({ document });
        assert.equal(view.translate('中文', 'English'), 'English');
        assert.equal(view.handlers.onSubmit(), undefined);
        assert.throws(() => view.mount(null), TypeError);
        assert.throws(() => view.mount(document.body, { onSubmit: true }), TypeError);
        assert.throws(() => view.render({}), /mounted/);
        assert.equal(view.removeStyles(), false);
        assert.equal(view.unmount(), false);
        assert.deepEqual([...viewSupport.descendantsOf([{ id: 'a', children: [] }], 'missing')], []);

        const bodyOnlyDocument = new FakeDocument();
        bodyOnlyDocument.head = null;
        const bodyOnlyView = collections.createCollectionsView({ document: bodyOnlyDocument });
        assert.equal(bodyOnlyView.ensureStyles().parentNode, bodyOnlyDocument.body);
    });

    it('renders semantic nested controls, restores focus, handles keyboard and form submissions', () => {
        const document = new FakeDocument();
        const view = collections.createCollectionsView({ document, translate: (_zh, en) => en });
        const calls = [];
        const handlers = Object.fromEntries([
            'onSubmit', 'onCancelEdit', 'onEdit', 'onDelete', 'onToggle', 'onMove', 'onAssignChat',
            'onOpenChat', 'onSearch', 'onFilter', 'onExport', 'onImport', 'onAutoClassify',
            'onApplyRulePreview', 'onCancelRulePreview', 'onUndo', 'onPin'
        ].map(name => [name, (...args) => calls.push([name, ...args])]));
        assert.equal(view.mount(document.body, handlers), true);
        assert.equal(view.mount(document.body, handlers), false);
        assert.ok(document.getElementById('gc-collections-styles'));
        assert.equal(view.ensureStyles(), document.getElementById('gc-collections-styles'));

        const state = stateFixture();
        const tree = collections.getCollectionTree(state, {}, { sessionId: 'account-a', nowIso: NOW });
        const model = {
            state, tree, query: '', editing: null, status: 'Ready', error: '', canUndo: true,
            chats: [
                { id: 'chat-1', title: 'Existing', collectionIds: ['root', 'child'], manualCollectionIds: ['root', 'child'], matchesQuery: true },
                { id: 'chat-2', title: 'Unassigned', collectionIds: [], manualCollectionIds: [], matchesQuery: true }
            ]
        };
        view.render(model);
        assert.equal(view.root.getAttribute('aria-label'), 'Collections');
        assert.equal(view.root.querySelector('[role="tree"]'), null);
        const treeElement = walk(view.root).find(element => element.getAttribute('role') === 'tree');
        assert.ok(treeElement);
        assert.ok(byText(view.root, 'button', 'Create collection'));
        assert.ok(byText(view.root, 'button', 'Undo'));
        assert.ok(byText(view.root, 'h3', 'Unassigned'));

        for (const label of ['Preview rules', 'Export', 'Import', 'Undo']) byText(view.root, 'button', label).click();
        assert.deepEqual(calls.slice(-4).map(call => call[0]), ['onAutoClassify', 'onExport', 'onImport', 'onUndo']);

        const rows = view.root.querySelectorAll('.gf-folder-row');
        const rootRow = rows.find(row => row.dataset.collectionId === 'root');
        const childRow = rows.find(row => row.dataset.collectionId === 'child');
        byText(rootRow, 'button', 'Research').click();
        walk(rootRow).find(element => element.getAttribute('aria-label') === 'Move up').click();
        walk(rootRow).find(element => element.getAttribute('aria-label') === 'Move down').click();
        walk(rootRow).find(element => element.getAttribute('aria-label') === 'Unpin').click();
        byText(rootRow, 'button', 'Edit').click();
        byText(rootRow, 'button', 'Delete').click();
        byText(rootRow, 'button', 'Existing').click();
        byText(rootRow, 'button', 'Remove').click();
        assert.ok(calls.some(call => call[0] === 'onOpenChat'));
        assert.ok(calls.some(call => call[0] === 'onAssignChat' && call[3] === 'root'));

        const collectionTransfer = dataTransfer();
        childRow.ondragstart(new FakeEvent('dragstart', { dataTransfer: collectionTransfer }));
        rootRow.ondragover(new FakeEvent('dragover', { dataTransfer: collectionTransfer }));
        rootRow.ondrop(new FakeEvent('drop', { dataTransfer: collectionTransfer }));
        childRow.ondragend();
        assert.ok(calls.some(call => call[0] === 'onMove' && call[1] === 'child' && call[2].targetId === 'root'));

        view.dragState.chatId = 'chat-2';
        rootRow.ondrop(new FakeEvent('drop', { dataTransfer: dataTransfer() }));
        view.dragState.chatId = null;
        const chatTransfer = dataTransfer();
        chatTransfer.setData('text/plain', 'chat-fallback');
        rootRow.ondrop(new FakeEvent('drop', { dataTransfer: chatTransfer }));
        const fallbackCollectionTransfer = dataTransfer();
        fallbackCollectionTransfer.setData('application/x-primer-collection', 'root');
        childRow.ondrop(new FakeEvent('drop', { dataTransfer: fallbackCollectionTransfer }));
        rootRow.ondragstart();
        rootRow.ondragend();
        rootRow.ondragover();
        rootRow.ondrop();

        const search = walk(view.root).find(element => element.type === 'search');
        search.value = 'paper';
        search.dispatchEvent(new FakeEvent('input', { target: search }));
        assert.deepEqual(calls.at(-1), ['onSearch', 'paper']);

        const form = walk(view.root).find(element => element.tagName === 'FORM');
        const controls = Object.fromEntries(walk(form).filter(element => element.name).map(element => [element.name, element]));
        controls.name.value = 'Created';
        controls.parentId.value = 'root';
        controls.tags.value = 'a, b';
        controls.color.value = '#f28b82';
        controls.ruleMode.value = 'all';
        controls.rules.value = '[{"field":"tag","operator":"equals","value":"a"}]';
        form.onsubmit(new FakeEvent('submit'));
        assert.equal(calls.at(-1)[0], 'onSubmit');
        assert.deepEqual(calls.at(-1)[2].tags, ['a', 'b']);
        assert.equal(calls.at(-1)[2].ruleMode, 'all');

        const matches = Array.from({ length: 101 }, (_, index) => ({
            chatId: `chat-${index}`,
            matchedCollectionIds: ['root']
        }));
        view.render({
            ...model,
            rulePreview: {
                matchCount: 101, changeCount: 1, matches,
                visibleMatchedChatIds: ['chat-0'], archiveMatchedChatIds: ['chat-1']
            }
        });
        byText(view.root, 'button', 'Confirm 1 local changes').click();
        byText(view.root, 'button', 'Clear preview').click();
        assert.deepEqual(calls.slice(-2).map(call => call[0]), ['onApplyRulePreview', 'onCancelRulePreview']);
        assert.ok(byText(view.root, 'p', '1 more matches'));
        view.render({
            ...model,
            rulePreview: {
                matchCount: 0, changeCount: 0, matches: [],
                visibleMatchedChatIds: [], archiveMatchedChatIds: []
            }
        });
        assert.equal(byText(view.root, 'button', 'Confirm 0 local changes'), undefined);

        const focusables = view.root.querySelectorAll('[data-tree-focus]');
        focusables[0].focus();
        view.root.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowDown' }));
        assert.equal(document.activeElement, focusables[1]);
        view.root.dispatchEvent(new FakeEvent('keydown', { key: 'End' }));
        assert.equal(document.activeElement, focusables.at(-1));
        view.root.dispatchEvent(new FakeEvent('keydown', { key: 'Home' }));
        assert.equal(document.activeElement, focusables[0]);
        view.root.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowUp' }));
        assert.equal(document.activeElement, focusables[0]);
        view.root.dispatchEvent(new FakeEvent('keydown', { key: 'x' }));

        const editModel = { ...model, editing: state.collections[0], focusKey: 'collection-root', error: 'Broken', canUndo: false };
        view.render(editModel);
        assert.equal(document.activeElement.dataset.focusKey, 'collection-root');
        assert.equal(walk(view.root).find(element => element.getAttribute('role') === 'alert').textContent, 'Broken');
        assert.ok(byText(view.root, 'button', 'Cancel'));
        byText(view.root, 'button', 'Cancel').click();
        const editForm = walk(view.root).find(element => element.tagName === 'FORM');
        editForm.onsubmit();
        assert.equal(calls.at(-1)[1], 'root');
        const detachedFocusEvent = new FakeEvent('keydown', { key: 'ArrowDown' });
        view.tree.moveFocus(view.root, document.body, detachedFocusEvent);
        assert.equal(detachedFocusEvent.defaultPrevented, true);
        view.tree.moveFocus(null, null, new FakeEvent('keydown', { key: 'ArrowDown' }));

        view.render({
            ...model,
            state: { ...state, native: { notebooks: { ...state.native.notebooks, available: false } } },
            tree: [], chats: [], status: '', error: '', canUndo: false, editing: null, focusKey: null
        });
        assert.ok(byText(view.root, 'p', 'No collections yet'));
        assert.equal(walk(view.root).find(element => element.getAttribute('role') === 'status').textContent, '');

        const other = document.createElement('div');
        document.body.appendChild(other);
        assert.equal(view.mount(other, handlers), true);
        assert.equal(view.root.parentNode, other);
        assert.equal(view.unmount(), true);
        assert.equal(view.removeStyles(), true);
    });

    it('owns sidebar filters, dots, visibility, and drag listeners across repeated mounts', () => {
        const document = new FakeDocument();
        const view = collections.createCollectionsView({ document, translate: (_zh, en) => en });
        assert.equal(view.renderSidebar({ container: null, collections: [], chats: [], activeFilter: null }), false);
        const sidebar = document.createElement('nav');
        document.body.appendChild(sidebar);
        const rowA = document.createElement('a');
        const rowB = document.createElement('a');
        rowB.setAttribute('draggable', 'false');
        rowA.appendChild(document.createElement('span'));
        const duplicate = document.createElement('span');
        duplicate.className = 'gf-sidebar-dot';
        rowA.appendChild(duplicate);
        const extraDuplicate = document.createElement('span');
        extraDuplicate.className = 'gf-sidebar-dot';
        rowA.appendChild(extraDuplicate);
        const staleDot = document.createElement('span');
        staleDot.className = 'gf-sidebar-dot';
        rowB.appendChild(staleDot);
        sidebar.append(rowA, rowB);
        const filters = [];
        const assignments = [];
        let detachedDotRemoved = false;
        const detachedDot = {
            classList: { contains: value => value === 'gf-sidebar-dot' },
            remove() { detachedDotRemoved = true; }
        };
        const chats = [
            { id: 'a', element: rowA, collectionIds: ['root'] },
            { id: 'b', element: rowB, collectionIds: [] },
            {
                id: 'custom',
                element: {
                    children: undefined,
                    firstChild: null,
                    style: { display: '' },
                    getAttribute: () => null,
                    setAttribute: () => undefined,
                    removeAttribute: () => undefined,
                    addEventListener: () => undefined,
                    removeEventListener: () => undefined
                },
                collectionIds: []
            },
            {
                id: 'custom-dot',
                element: {
                    children: [detachedDot],
                    firstChild: detachedDot,
                    style: { display: '' },
                    getAttribute: () => null,
                    setAttribute: () => undefined,
                    removeAttribute: () => undefined,
                    addEventListener: () => undefined,
                    removeEventListener: () => undefined
                },
                collectionIds: []
            },
            { id: 'missing', element: null, collectionIds: [] }
        ];
        const collectionsList = [{ id: 'root', name: 'Root', color: null }];
        assert.equal(view.renderSidebar({
            container: sidebar, collections: collectionsList, chats, activeFilter: 'root',
            onFilter: id => filters.push(id), onAssignChat: (...args) => assignments.push(args)
        }), true);
        assert.equal(document.querySelectorAll('.gf-sidebar-dot').length, 1);
        assert.equal(rowA.firstChild.title, 'Root');
        assert.equal(rowB.style.display, 'none');
        assert.equal(detachedDotRemoved, true);
        const bar = document.getElementById('gc-folder-filter');
        byText(bar, 'button', 'All').click();
        assert.equal(filters.at(-1), null);
        byText(bar, 'button', 'Root').click();
        assert.equal(filters.at(-1), 'root');
        const transfer = dataTransfer();
        rowB.dispatchEvent(new FakeEvent('dragstart', { dataTransfer: transfer }));
        const rootFilter = byText(bar, 'button', 'Root');
        rootFilter.dispatchEvent(new FakeEvent('dragover', { dataTransfer: transfer }));
        rootFilter.dispatchEvent(new FakeEvent('drop', { dataTransfer: transfer }));
        assert.deepEqual(assignments.at(-1), ['b', 'root']);
        rowB.dispatchEvent(new FakeEvent('dragend'));
        const fallbackTransfer = dataTransfer();
        fallbackTransfer.setData('text/plain', 'fallback-chat');
        rootFilter.ondrop(new FakeEvent('drop', { dataTransfer: fallbackTransfer }));
        assert.deepEqual(assignments.at(-1), ['fallback-chat', 'root']);
        rootFilter.ondragover();
        rootFilter.ondrop();
        rowA.dispatchEvent(new FakeEvent('dragstart'));
        rowA.dispatchEvent(new FakeEvent('dragend'));

        view.renderSidebar({
            container: sidebar, collections: collectionsList, chats, activeFilter: null,
            onFilter: id => filters.push(id), onAssignChat: (...args) => assignments.push(args)
        });
        assert.equal(document.querySelectorAll('#gc-folder-filter').length, 1);
        view.clearSidebar();
        assert.equal(rowA.getAttribute('draggable'), null);
        assert.equal(rowB.getAttribute('draggable'), 'false');
        assert.equal(rowB.style.display, '');
        assert.equal(document.querySelectorAll('.gf-sidebar-dot').length, 0);
    });
});

describe('Collections controller vertical orchestration', () => {
    it('requires explicit clock and injected service, view, adapter, observer, UI, and scheduler contracts', async () => {
        const fixture = makeControllerFixture();
        const base = {
            service: fixture.service,
            view: fixture.view,
            adapter: fixture.adapter,
            observer: fixture.observer,
            ui: fixture.ui,
            clock: () => NOW
        };
        assert.throws(() => collections.createCollectionsController(), /service/);
        assert.throws(() => collections.createCollectionsController({ ...base, service: {} }), /start/);
        assert.throws(() => collections.createCollectionsController({ ...base, view: {} }), /mount/);
        assert.throws(() => collections.createCollectionsController({ ...base, adapter: {} }), /scanSidebarChats/);
        assert.throws(() => collections.createCollectionsController({ ...base, observer: {} }), /register/);
        assert.throws(() => collections.createCollectionsController({ ...base, ui: { confirm: true } }), /confirm/);
        assert.throws(() => collections.createCollectionsController({ ...base, clock: undefined }), /clock/);
        assert.throws(() => collections.createCollectionsController({ ...base, schedule: true }), /scheduler/);
        assert.throws(() => collections.createCollectionsController({ ...base, cancelSchedule: true }), /scheduler/);
        assert.throws(() => collections.createCollectionsController({ ...base, initialDelay: -1 }), /initialDelay/);
        const defaults = collections.createCollectionsController({ ...base, ui: undefined });
        assert.equal(defaults.ui.confirm(), true);
        assert.equal(defaults.ui.toast(), undefined);
        assert.equal(defaults.ui.downloadText(), undefined);
        assert.equal(defaults.ui.pickTextFile(), null);
        assert.equal(await defaults.start('account-a'), true);
        assert.equal(await defaults.stop(), true);
    });

    it('migrates, mounts, edits nested collections, manages multi-membership, rules, filters, transfer, and undo', async () => {
        const legacy = collections.writeCollectionsToLegacy(stateFixture(), { customTop: 'keep' }, {
            sessionId: 'account-a', nowIso: NOW
        });
        const fixture = makeControllerFixture({ legacy });
        const { controller, document, view, observer, scheduler, storage, downloads, opened, toasts } = fixture;
        assert.equal(controller.getSnapshot(), null);
        assert.deepEqual(controller.getLegacyData(), { folders: {}, chatToFolder: {}, folderOrder: [] });
        assert.equal(await controller.refresh(), false);
        assert.equal(controller._render(), false);
        assert.equal(controller._renderSidebar(), false);
        const details = document.createElement('main');
        document.body.appendChild(details);
        assert.equal(controller.mount(details), true);

        assert.equal(await controller.start('account-a'), true);
        assert.equal(await controller.start('account-a'), false);
        await assert.rejects(controller.start('account-b'), code('ALREADY_STARTED'));
        assert.equal(controller.getSnapshot().native.notebooks.ownership, 'native');
        assert.equal(controller.getSnapshot().native.notebooks.officialEntryPolicy, 'preserve');
        assert.ok(observer.entries.has('folders-sidebar'));
        assert.equal(scheduler.tasks.size, 1);
        assert.ok(document.getElementById('gc-collections-view'));
        assert.ok(document.getElementById('gc-folder-filter'));
        assert.equal(await controller.submit(null, {
            name: ' research ', parentId: null, tags: [], color: '#8ab4f8', rules: [], ruleMode: 'any'
        }), null);
        assert.match(controller.error, /already exists at this level/i);
        assert.match(walk(view.root).find(element => element.getAttribute('role') === 'alert').textContent, /already exists/i);
        const cycleSource = controller.getSnapshot().collections.find(value => value.id === 'root');
        assert.equal(await controller.submit('root', {
            name: cycleSource.name, parentId: 'child', tags: cycleSource.tags, color: cycleSource.color,
            rules: cycleSource.rules, ruleMode: cycleSource.ruleMode
        }), null);
        assert.match(controller.error, /cycle/i);
        assert.match(walk(view.root).find(element => element.getAttribute('role') === 'alert').textContent, /cycle/i);
        const liveFilter = byText(document.getElementById('gc-folder-filter'), 'button', 'Research');
        liveFilter.click();
        const liveTransfer = dataTransfer();
        fixture.chats[1].element.dispatchEvent(new FakeEvent('dragstart', { dataTransfer: liveTransfer }));
        liveFilter.dispatchEvent(new FakeEvent('drop', { dataTransfer: liveTransfer }));
        fixture.chats[1].element.dispatchEvent(new FakeEvent('dragend'));
        await fixture.service.flush();
        assert.equal(await controller.refresh(), true);
        assert.ok(controller.getLegacyData().folders.root);
        const rootBefore = controller.getSnapshot().collections.find(value => value.id === 'root');
        assert.equal((await controller.submit('root', {
            name: rootBefore.name,
            parentId: rootBefore.parentId,
            tags: rootBefore.tags,
            color: rootBefore.color,
            rules: rootBefore.rules,
            ruleMode: rootBefore.ruleMode
        })).id, 'root');
        assert.equal(await controller.submit('missing', {
            name: 'Missing', parentId: null, tags: [], color: '#8ab4f8', rules: [], ruleMode: 'any'
        }), null);
        assert.equal((await controller.move('root', -1)).id, 'root');
        assert.equal(await controller.move('root', { targetId: 'missing', position: 'before' }), null);

        const created = await controller.submit(null, {
            name: 'Nested', parentId: 'root', tags: ['new'], color: '#f28b82',
            rules: [{ field: 'url', operator: 'contains', value: '/app/' }], ruleMode: 'all'
        });
        assert.equal(created.id, 'generated-0');
        assert.equal(controller.getSnapshot().collections.find(value => value.id === created.id).parentId, 'root');
        assert.equal(controller.edit('missing'), false);
        assert.equal(controller.edit(created.id), true);
        assert.equal(controller.cancelEdit(), true);
        assert.equal(controller.cancelEdit(), false);

        const existing = controller.getSnapshot().collections.find(value => value.id === created.id);
        await controller.submit(created.id, {
            name: 'Moved & tagged', parentId: 'child', tags: ['new', 'deep'], color: '#fdd663',
            rules: existing.rules, ruleMode: existing.ruleMode
        });
        let revised = controller.getSnapshot().collections.find(value => value.id === created.id);
        assert.equal(revised.parentId, 'child');
        assert.equal(revised.name, 'Moved & tagged');
        assert.deepEqual(revised.tags, ['new', 'deep']);
        await controller.submit(created.id, {
            name: revised.name, parentId: 'root', tags: revised.tags, color: revised.color,
            rules: revised.rules, ruleMode: revised.ruleMode
        });
        revised = controller.getSnapshot().collections.find(value => value.id === created.id);
        assert.equal(revised.parentId, 'root');
        await controller.toggle(created.id, true);
        await controller.pin(created.id, true);
        assert.equal(controller.getSnapshot().collections.find(value => value.id === created.id).collapsed, true);
        assert.equal(controller.getSnapshot().collections.find(value => value.id === created.id).pinned, true);

        assert.ok(await controller.move(created.id, -1));
        assert.ok(await controller.move(created.id, { targetId: 'root', position: 'after' }));
        assert.equal(await controller.move('missing', 1), null);
        assert.match(controller.error, /not found/i);
        assert.equal(toasts.at(-1).options.tone, 'danger');

        await controller.assignChat('chat-2', 'root');
        await controller.assignChat('chat-2', 'child');
        assert.deepEqual(controller.getSnapshot().memberships.find(value => value.itemId === 'chat-2').collectionIds, ['child', 'root']);
        await controller.assignChat('chat-2', null, 'root');
        assert.deepEqual(controller.getSnapshot().memberships.find(value => value.itemId === 'chat-2').collectionIds, ['child']);
        await controller.assignChat('chat-2', null);
        assert.equal(controller.getSnapshot().memberships.some(value => value.itemId === 'chat-2'), false);
        const temporarilyHidden = fixture.chats.shift();
        const rulePreview = await controller.autoClassify();
        assert.deepEqual(rulePreview.matchedChatIds, ['chat-2']);
        assert.equal(controller.getSnapshot().memberships.some(value => value.itemId === 'chat-2'), false);
        assert.equal(controller.cancelRulePreview(), true);
        assert.equal((await controller.previewRules()).matchCount, 1);
        assert.equal((await controller.applyRulePreview()).applied, 1);
        assert.deepEqual(controller.getSnapshot().memberships.find(value => value.itemId === 'chat-2').collectionIds, ['generated-0', 'root']);
        assert.equal(controller.getSnapshot().native.notebooks.officialEntryPolicy, 'preserve');
        assert.ok(await controller.undo());
        assert.equal(controller.getSnapshot().memberships.some(value => value.itemId === 'chat-2'), false);
        assert.equal((await controller.previewRules()).changeCount, 1);
        assert.equal((await controller.applyRulePreview()).applied, 1);
        fixture.chats.unshift(temporarilyHidden);
        assert.equal(controller.cancelRulePreview(), false);

        assert.equal(controller.setSearch('paper'), 'paper');
        assert.equal(controller.setFilter('root'), 'root');
        assert.equal(controller.openChat({ id: 'chat-1', title: 'Safe', element: null }), true);
        assert.deepEqual(opened, ['chat-1']);
        const exported = await controller.exportData();
        assert.match(exported, /primer-pp.collections.export/);
        assert.match(downloads[0].filename, /^primer-pp-collections-2026-08-01/);
        assert.equal(downloads[0].type, 'application/json');
        assert.equal(exported.includes('account-a'), false);
        assert.equal(await controller.importData(), null);

        const beforeDelete = controller.getSnapshot();
        controller.setFilter('child');
        assert.ok(await controller.remove('child'));
        assert.equal(controller.getSnapshot().collections.some(value => value.id === 'child'), false);
        assert.equal(controller.activeFilter, null);
        assert.ok(await controller.undo());
        assert.deepEqual(controller.getSnapshot().collections.map(value => value.id).sort(), beforeDelete.collections.map(value => value.id).sort());
        assert.equal(await controller.undo(), null);
        assert.equal(await controller.remove('missing'), null);

        const watcher = observer.entries.get('folders-sidebar');
        assert.equal(watcher.match({ native: true }), true);
        assert.equal(watcher.match({ native: false }), false);
        controller.rulePreview.suppressesObserver = true;
        assert.equal(watcher.callback(), false);
        assert.equal(scheduler.tasks.size, 1);
        controller.rulePreview.suppressesObserver = false;
        watcher.callback();
        watcher.callback();
        assert.equal(scheduler.tasks.size, 1);
        await scheduler.runAll();
        assert.equal(storage.values.get('gemini_folders_data_account-a').customTop, 'keep');
        assert.equal(controller.active, true);

        const handlers = controller._handlers();
        const handlerCreated = await handlers.onSubmit(null, {
            name: 'Handler-created', parentId: null, tags: [], color: '#8ab4f8', rules: [], ruleMode: 'any'
        });
        assert.equal(handlers.onEdit(handlerCreated.id), true);
        assert.equal(handlers.onCancelEdit(), true);
        await handlers.onToggle(handlerCreated.id, true);
        await handlers.onPin(handlerCreated.id, true);
        await handlers.onMove(handlerCreated.id, -1);
        await handlers.onAssignChat('handler-chat', handlerCreated.id);
        assert.equal(handlers.onOpenChat({ id: 'handler-open' }), true);
        assert.equal(handlers.onSearch('handler'), 'handler');
        assert.equal(handlers.onFilter(handlerCreated.id), handlerCreated.id);
        await handlers.onExport();
        assert.equal(await handlers.onImport(), null);
        await handlers.onAutoClassify();
        await handlers.onApplyRulePreview();
        handlers.onCancelRulePreview();
        await handlers.onDelete(handlerCreated.id);
        await handlers.onUndo();
        assert.equal(await controller.assignChats(null, handlerCreated.id), 0);
        assert.equal(controller.setSearch(null), '');
        controller._showError(null);
        assert.equal(controller.error, 'Collections operation failed');
    });

    it('isolates sessions, handles cancellation/errors, and makes observer/timer/mount teardown restart-safe', async () => {
        const cancelled = makeControllerFixture({ confirm: false, notebooks: false });
        const { controller, scheduler, observer, document, storage } = cancelled;
        await controller.start('account-a');
        controller.mount(document.body);
        const id = await controller.submit(null, {
            name: 'Only A', parentId: null, tags: [], color: '#8ab4f8',
            rules: [{ field: 'title', operator: 'contains', value: 'paper' }], ruleMode: 'any'
        });
        assert.equal((await controller.previewRules()).changeCount, 2);
        assert.equal((await controller.applyRulePreview()).cancelled, true);
        assert.equal(controller.status, 'Rule application cancelled');
        assert.equal(await controller.remove(id.id), null);
        assert.equal(controller.getSnapshot().collections.some(value => value.id === id.id), true);
        assert.equal(controller.getSnapshot().native.notebooks.available, false);

        assert.equal(await controller.changeSession('account-a'), false);
        assert.equal(await controller.changeSession('account-b'), true);
        assert.equal(controller.getSnapshot().collections.length, 0);
        assert.equal(storage.values.get('gemini_folders_data_account-a').collectionsState.collections.length, 1);
        await controller.submit(null, {
            name: 'Only B', parentId: null, tags: [], color: '#81c995', rules: [], ruleMode: 'any'
        });
        assert.equal(controller.getSnapshot().collections[0].name, 'Only B');

        controller.scheduleRefresh(10);
        const stale = [...scheduler.tasks.values()][0].callback;
        assert.equal(await controller.stop(), true);
        await stale();
        assert.equal(controller.active, false);
        assert.equal(observer.entries.size, 0);
        assert.equal(document.getElementById('gc-folder-filter'), null);
        assert.equal(document.getElementById('gc-collections-view'), null);
        assert.equal(document.getElementById('gc-collections-styles'), null);
        assert.equal(await controller.stop(), false);
        assert.equal(controller.scheduleRefresh(), false);
        assert.equal(await controller.refresh(), false);
        assert.equal(await controller.changeSession('account-a'), true);
        assert.equal(controller.getSnapshot().collections[0].name, 'Only A');
        assert.equal(await controller.stop(), true);
    });

    it('contains startup, refresh, transfer, navigation, and scheduled callback failures in visible error state', async () => {
        const broken = makeControllerFixture();
        const serviceStop = broken.service.stop.bind(broken.service);
        let rollbackFailureObserved = false;
        broken.service.stop = async () => {
            await serviceStop();
            rollbackFailureObserved = true;
            throw new Error('rollback failed');
        };
        broken.adapter.scanSidebarChats = () => ({ invalid: true });
        await assert.rejects(broken.controller.start('account-a'), code('INVALID_CHAT_SOURCE'));
        assert.equal(broken.controller.active, false);
        assert.equal(rollbackFailureObserved, true);
        await assert.rejects(broken.service.getSnapshot(), code('SERVICE_INACTIVE'));
        broken.service.stop = serviceStop;
        broken.adapter.scanSidebarChats = () => [];
        assert.equal(await broken.controller.start('account-a'), true);
        broken.controller.mount(broken.document.body);

        broken.adapter.scanSidebarChats = () => { throw new Error('scan failed'); };
        assert.equal(await broken.controller.refresh().catch(() => false), false);
        broken.controller.scheduleRefresh(0);
        await broken.scheduler.runAll();
        assert.equal(broken.controller.error, 'scan failed');
        assert.equal(broken.toasts.at(-1).options.tone, 'danger');
        broken.adapter.scanSidebarChats = () => [];

        broken.controller.clock = () => 'invalid';
        assert.equal(await broken.controller.exportData(), null);
        assert.match(broken.controller.error, /Invalid time value/);
        broken.controller.clock = () => NOW;
        broken.controller.ui.pickTextFile = async () => '{bad';
        assert.equal(await broken.controller.importData(), null);
        assert.match(broken.controller.error, /valid JSON/);
        broken.controller.ui.pickTextFile = async () => { throw new Error('picker failed'); };
        assert.equal(await broken.controller.importData(), null);
        assert.equal(broken.controller.error, 'picker failed');
        const removable = await broken.controller.submit(null, {
            name: 'Confirm target', parentId: null, tags: [], color: '#8ab4f8', rules: [], ruleMode: 'any'
        });
        broken.controller.ui.confirm = async () => { throw new Error('confirm failed'); };
        assert.equal(await broken.controller.remove(removable.id), null);
        assert.equal(broken.controller.error, 'confirm failed');
        broken.adapter.openChat = () => { throw new Error('navigation failed'); };
        assert.equal(broken.controller.openChat({ id: 'x' }), false);
        assert.equal(broken.controller.error, 'navigation failed');
        broken.controller.setSearch('stale');
        broken.service.stop = async () => { await serviceStop(); throw new Error('stop flush failed'); };
        await assert.rejects(broken.controller.stop(), /stop flush failed/);
        assert.equal(broken.controller.getSnapshot(), null);
        assert.equal(broken.controller.query, '');
        assert.equal(broken.controller.error, '');
    });
});

describe('Folders compatibility facade', () => {
    it('delegates legacy entry points to one Collections runtime without singleton UI dependencies', async () => {
        assert.throws(() => new folders.FoldersCompatibilityModule({ runtimeFactory: true }), /runtimeFactory/);
        assert.throws(() => new folders.FoldersCompatibilityModule({ sessionProvider: true }), /sessionProvider/);
        const neverStarted = folders.createFoldersCompatibilityModule({
            runtimeFactory: () => { throw new Error('must stay lazy'); },
            logger: {}
        });
        assert.deepEqual(neverStarted.data, { folders: {}, chatToFolder: {}, folderOrder: [] });
        assert.equal(await neverStarted.destroy(), false);

        const fixture = makeControllerFixture();
        const runtime = {
            controller: fixture.controller,
            service: fixture.service,
            view: fixture.view,
            adapter: fixture.adapter,
            observer: fixture.observer,
            ui: fixture.ui
        };
        const logEntries = [];
        let receivedOptions;
        const module = folders.createFoldersCompatibilityModule({
            runtimeFactory(options) { receivedOptions = options; return runtime; },
            runtimeOptions: { first: 1 },
            sessionProvider: () => 'account-a',
            logger: { info: (...args) => logEntries.push(args) }
        });
        assert.equal(module.id, 'folders');
        assert.equal(module.iconId, 'folder');
        assert.equal(module.defaultEnabled, false);
        assert.equal(module.STORAGE_KEY, 'gemini_folders_data');
        assert.equal(typeof folders.FoldersModule._sessionProvider(), 'string');
        assert.equal(module.configure({ second: 2 }), module);
        assert.equal(await module.init(), true);
        assert.deepEqual(receivedOptions, { first: 1, second: 2 });
        assert.throws(() => module.configure({ active: true }), /active/);

        assert.equal(module.renderToDetailsPane(fixture.document.body), true);
        assert.equal(await module.loadData(), true);
        await module.saveData();
        assert.ok(fixture.storage.flushes > 0);

        assert.deepEqual(foldersRuntime.legacyRulesToCollections(null), []);
        assert.deepEqual(foldersRuntime.legacyRulesToCollections([{ type: 'regex' }, null]), []);
        const modernRule = { field: 'title', operator: 'contains', value: 'paper' };
        const parentId = await module.createFolder('  Parent  ', '', null, ['legacy'], [
            modernRule,
            { type: 'regex', value: '^unsafe$' },
            { type: 'keyword', value: 'safe' },
            { type: 'keyword', value: ' ' }
        ]);
        const childId = await module.createFolder(null, '#81c995', parentId);
        assert.equal(await module.createFolder('Invalid parent', '#81c995', 'missing'), null);
        assert.equal(module.data.folders[parentId].name, 'Parent');
        assert.equal(module.data.folders[childId].name, 'New Folder');
        assert.equal((await module.renameFolder(parentId, 'Renamed')).id, parentId);
        assert.equal((await module.setFolderColor(parentId, '#f28b82')).id, parentId);
        assert.equal((await module.setFolderRules(parentId, [{ type: 'keyword', value: 'renamed' }])).id, parentId);
        assert.equal((await module._updateFolder(childId, {
            parentId: parentId,
            tags: ['child'],
            ruleMode: 'all'
        })).id, childId);
        assert.equal(await module.renameFolder('missing', 'Nope'), null);
        assert.equal(await module.toggleFolderCollapse('missing'), null);
        assert.equal(await module.toggleFolderPin('missing'), null);
        assert.ok(await module.toggleFolderCollapse(parentId));
        assert.ok(await module.toggleFolderPin(parentId));

        await module.moveChatToFolder('facade-chat', parentId);
        assert.deepEqual(module.getFolderStats(parentId), { chatCount: 1 });
        assert.ok(await module.reorderFolder(childId, parentId, 'before'));
        module._batchSelected.add('batch-a');
        module._batchSelected.add('batch-b');
        assert.equal(await module.batchMoveToFolder(parentId), 2);
        assert.equal(module._batchSelected.size, 0);
        assert.equal(await module.undoLastFolderAction() !== null, true);
        assert.equal(module.getFolderStats(parentId).chatCount, 1);
        assert.equal(await module.batchMoveToFolder(parentId), 0);

        assert.match(await module._exportFolders(), /primer-pp.collections.export/);
        assert.equal(await module._importFolders(), null);
        assert.equal(typeof await module.autoClassify(), 'number');
        assert.equal((await module.previewRules()).semantics, 'local-memberships-only');
        assert.equal(module.clearRulePreview(), true);
        await module.previewRules();
        assert.equal(typeof (await module.applyRules()).applied, 'number');
        assert.equal(module.clearRulePreview(), false);
        fixture.controller.rulePreview.archiveProvider = { readChats: async () => { throw new Error('offline'); } };
        assert.equal(await module.autoClassify(), null);
        fixture.controller.rulePreview.archiveProvider = null;
        assert.equal(module.scanSidebarChats().length, 2);
        assert.equal(await module.markSidebarChats(), true);
        assert.equal(module._scheduleSidebarRefresh(5), true);
        assert.equal(module.startObserver(), true);
        assert.ok(module.injectStyles());
        assert.equal(await module.injectNativeUI(), true);
        assert.equal(module.removeNativeUI(), undefined);
        assert.equal(module._applyFilter(parentId), parentId);
        assert.equal(await module._refreshFilterBar(), true);
        assert.equal(module.showFolderModal(parentId), true);
        assert.equal(module.showFolderModal(null), true);
        assert.equal(module.showFolderModal('missing'), false);
        const onboarding = module.getOnboarding();
        assert.match(onboarding.en.features, /Nested collections/);
        assert.match(onboarding.zh.rant, /Notebooks/);
        assert.equal(onboarding.legacyCopy.title.length > 0, true);

        assert.equal(await module.onUserChange('account-b'), true);
        assert.equal(module.data.folderOrder.length, 0);
        assert.equal(await module.onUserChange('account-a'), true);
        assert.equal(module.data.folders[parentId].name, 'Renamed');
        assert.equal(await module.deleteFolder('missing'), null);
        assert.equal(await module.destroy(), true);
        assert.deepEqual(module.getFolderStats(parentId), { chatCount: 0 });
        assert.equal(await module.destroy(), false);
        assert.equal(logEntries.length >= 2, true);
    });

    it('publishes a frozen session-bound portable integration with read-only inspection export', async () => {
        const fixture = makeControllerFixture();
        const runtime = {
            controller: fixture.controller,
            service: fixture.service,
            view: fixture.view,
            adapter: fixture.adapter,
            clock: () => NOW
        };
        const module = folders.createFoldersCompatibilityModule({
            runtimeFactory: () => runtime,
            sessionProvider: () => 'account-a',
            logger: {}
        });
        assert.throws(() => module.getPortableArchiveIntegration(), code('SERVICE_INACTIVE'));
        assert.deepEqual(collections.resolveCollectionsSessionAccess(null, 'Temp'), {
            controllerSession: 'Temp', readOnly: false
        });
        assert.deepEqual(collections.resolveCollectionsSessionAccess('account-a'), {
            controllerSession: 'account-a', readOnly: false
        });
        assert.deepEqual(collections.resolveCollectionsSessionAccess({
            accountId: 'ignored', mode: 'inspection'
        }), { controllerSession: { accountId: 'ignored', mode: 'inspection' }, readOnly: true });
        assert.deepEqual(collections.resolveCollectionsSessionAccess({
            accountId: 'ignored', sessionUserId: 'one', targetUserId: 'one'
        }), { controllerSession: 'one', readOnly: false });
        assert.deepEqual(collections.resolveCollectionsSessionAccess({
            scope: { kind: 'inspection', sessionUserId: 'one', targetUserId: 'two', readOnly: true }
        }), { controllerSession: 'two', readOnly: true });
        assert.throws(() => collections.createCollectionsPortableIntegrationManager(), /getRuntime/);
        assert.throws(() => collections.createCollectionsPortableIntegrationManager({
            getRuntime() {}
        }), /getClock/);
        const inactiveManager = collections.createCollectionsPortableIntegrationManager({
            getRuntime: () => ({ controller: { active: false, sessionId: null } }),
            getClock: () => () => NOW
        });
        assert.throws(() => inactiveManager.bind({ readOnly: false }), code('SERVICE_INACTIVE'));

        assert.equal(await module.init(), true);
        const rootId = await module.createFolder('Portable root', '#8ab4f8');
        const emptyId = await module.createFolder('No members', '#81c995');
        await module.moveChatToFolder('chat-z', rootId);
        const integration = module.getPortableArchiveIntegration();
        assert.equal(Object.isFrozen(integration), true);
        assert.equal(Object.isFrozen(integration.contributor), true);
        assert.deepEqual(Object.keys(integration).sort(), ['contributor', 'exportSection', 'section']);
        assert.deepEqual(Object.keys(integration.contributor).sort(), ['apply', 'rollback', 'snapshot']);
        assert.equal(integration.section, 'collections');
        assert.equal(Object.hasOwn(integration, 'service'), false);
        assert.equal(Object.hasOwn(integration, 'repository'), false);
        await assert.rejects(integration.exportSection({ signal: {} }), code('INVALID_ABORT_SIGNAL'));
        const aborted = new AbortController();
        aborted.abort();
        await assert.rejects(integration.exportSection({ signal: aborted.signal }), code('RESTORE_ABORTED'));
        const records = await integration.exportSection();
        assert.deepEqual(records.map(record => record.id), [...records.map(record => record.id)].sort());
        assert.deepEqual(records.find(record => record.id === rootId).memberItemIds, ['chat-z']);
        assert.equal(Object.hasOwn(records.find(record => record.id === emptyId), 'memberItemIds'), false);
        records[0].name = 'caller mutation';
        assert.equal((await fixture.service.getSnapshot()).collections.find(
            record => record.id === records[0].id
        ).name === 'caller mutation', false);

        const restoreContext = (actions, snapshot, signal = null) => ({
            section: 'collections', plan: { name: 'collections' }, actions, snapshot, signal
        });
        const before = await integration.contributor.snapshot(restoreContext([], null));
        const incoming = {
            ...records.find(record => record.id === rootId),
            id: 'portable-insert',
            name: 'Portable insert',
            memberItemIds: ['chat-portable']
        };
        const insert = {
            section: 'collections', action: 'insert', incomingIdentity: 'portable-insert',
            targetIdentity: 'portable-insert', identityPatch: null, value: incoming
        };
        assert.equal((await integration.contributor.apply(restoreContext([insert], before))).inserted, 1);
        const applied = await fixture.service.getSnapshot();
        assert.equal(applied.collections.some(record => record.id === 'portable-insert'), true);
        assert.equal(fixture.controller.snapshot.collections.some(record => record.id === 'portable-insert'), true);
        assert.deepEqual(
            applied.memberships.find(record => record.itemId === 'chat-portable').collectionIds,
            ['portable-insert']
        );
        await integration.contributor.rollback({
            section: 'collections', plan: { name: 'collections' }, actions: [insert], snapshot: before,
            applyResult: null, failure: { code: 'TEST' }
        });
        assert.equal((await fixture.service.getSnapshot()).collections.some(
            record => record.id === 'portable-insert'
        ), false);
        assert.equal(fixture.controller.snapshot.collections.some(record => record.id === 'portable-insert'), false);

        assert.equal(await module.onUserChange('account-a'), false);
        assert.equal((await integration.exportSection()).length, 2);
        assert.equal(await module.onUserChange('account-b'), true);
        await assert.rejects(integration.exportSection(), code('SESSION_CHANGED'));
        await assert.rejects(
            integration.contributor.snapshot(restoreContext([], null)),
            code('SESSION_CHANGED')
        );

        const accountB = module.getPortableArchiveIntegration();
        assert.deepEqual(await accountB.exportSection(), []);
        assert.equal(await module.onUserChange({
            accountId: 'account-b', kind: 'inspection', readOnly: false
        }), false);
        await assert.rejects(accountB.exportSection(), code('SESSION_CHANGED'));
        const inspection = module.getPortableArchiveIntegration();
        assert.deepEqual(await inspection.exportSection(), []);
        for (const method of ['snapshot', 'apply', 'rollback']) {
            await assert.rejects(
                inspection.contributor[method](restoreContext([], null)),
                code('READ_ONLY_SESSION')
            );
        }

        assert.equal(await module.onUserChange({
            scope: {
                kind: 'inspection', sessionUserId: 'account-b', targetUserId: 'account-c', readOnly: true
            }
        }), true);
        const nestedInspection = module.getPortableArchiveIntegration();
        assert.deepEqual(await nestedInspection.exportSection(), []);
        assert.equal(await module.destroy(), true);
        await assert.rejects(nestedInspection.exportSection(), code('SERVICE_INACTIVE'));
        assert.equal(await module.init({ session: 'account-c' }), true);
        await assert.rejects(nestedInspection.exportSection(), code('SESSION_CHANGED'));
        assert.equal(await module.destroy(), true);

        for (const runtimeOptions of [{ clock: () => NOW }, {}]) {
            const fallbackFixture = makeControllerFixture();
            const fallbackModule = folders.createFoldersCompatibilityModule({
                runtimeFactory: () => ({
                    controller: fallbackFixture.controller,
                    service: fallbackFixture.service,
                    view: fallbackFixture.view,
                    adapter: fallbackFixture.adapter
                }),
                runtimeOptions,
                sessionProvider: () => 'account-a',
                logger: {}
            });
            await fallbackModule.init();
            const fallbackIntegration = fallbackModule.getPortableArchiveIntegration();
            assert.equal(fallbackIntegration.section, 'collections');
            assert.equal((await fallbackIntegration.contributor.snapshot({
                section: 'collections', plan: { name: 'collections' }, actions: [], signal: null
            })).sessionId, 'account-a');
            await fallbackModule.destroy();
        }
    });

    it('keeps localized metadata lazy and falls back to the temporary session', async () => {
        const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'zh-CN' } });
        try {
            const fixture = makeControllerFixture();
            const module = new folders.FoldersCompatibilityModule({
                runtimeFactory: () => ({
                    controller: fixture.controller,
                    service: fixture.service,
                    view: fixture.view,
                    adapter: fixture.adapter
                }),
                sessionProvider: () => '',
                logger: {}
            });
            assert.equal(module.name, '集合');
            assert.equal(await module.init({ session: '' }), true);
            assert.equal(fixture.controller.sessionId, 'Guest');
            assert.equal(await module.onUserChange(''), false);
            assert.equal(await module.destroy(), true);
            delete globalThis.navigator;
            const neutral = new folders.FoldersCompatibilityModule({ logger: {} });
            assert.equal(neutral.name, 'Collections');
        } finally {
            if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
            else delete globalThis.navigator;
        }
    });
});

describe('Default Folders runtime composition', () => {
    it('composes browser boundaries, safe navigation, native probes, file transfer, and GM persistence', async () => {
        const globalKeys = [
            'document', 'navigator', 'GM_getValue', 'GM_setValue', '__flushGMPolyfill',
            'confirm', 'location', 'URL', 'FileReader'
        ];
        const descriptors = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
        const [{ Core }, { GeminiAdapter }, { DOMWatcher }] = await Promise.all([
            import(pathToFileURL(path.join(root, 'src/core.js')).href),
            import(pathToFileURL(path.join(root, 'src/adapters/gemini.js')).href),
            import(pathToFileURL(path.join(root, 'src/dom_watcher.js')).href)
        ]);
        const originals = {
            scan: Core.scanSidebarChats,
            container: GeminiAdapter.getSidebarOverflowContainer,
            mutation: GeminiAdapter.matchesFoldersSidebarMutation,
            capabilities: GeminiAdapter.getCapabilityProbeReport
        };
        const document = new FakeDocument();
        const sidebar = document.createElement('nav');
        const chatElement = document.createElement('a');
        sidebar.appendChild(chatElement);
        document.body.appendChild(sidebar);
        const scheduler = new FakeScheduler();
        const rawStorage = new Map();
        let flushes = 0;
        const loggerCalls = [];
        const objectUrls = [];
        const revokedUrls = [];
        const navigatorValue = { language: 'en-US' };
        const gmGet = (key, fallback) => rawStorage.has(key) ? structuredClone(rawStorage.get(key)) : fallback;
        const gmSet = (key, value) => rawStorage.set(key, structuredClone(value));
        const gmFlush = () => { flushes += 1; };

        const define = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        define('document', document);
        define('navigator', navigatorValue);
        define('GM_getValue', gmGet);
        define('GM_setValue', gmSet);
        define('__flushGMPolyfill', gmFlush);
        define('confirm', message => message === 'yes');
        define('location', { href: '' });
        define('URL', {
            createObjectURL(blob) { objectUrls.push(blob); return 'blob:test'; },
            revokeObjectURL(url) { revokedUrls.push(url); }
        });
        Core.scanSidebarChats = () => [{ id: 'default-chat', title: 'Default chat', href: '/app/default', element: chatElement }];
        GeminiAdapter.getSidebarOverflowContainer = () => sidebar;
        GeminiAdapter.matchesFoldersSidebarMutation = mutation => mutation?.native === true;
        GeminiAdapter.getCapabilityProbeReport = () => ({
            nativeCapabilities: [{ id: 'notebooks', status: 'native-owned', quality: 'available' }]
        });

        try {
            const localArchiveProvider = { readChats: async () => [] };
            const runtime = foldersRuntime.createDefaultFoldersRuntime({
                logger: {
                    info: message => loggerCalls.push(['info', message]),
                    warn: message => loggerCalls.push(['warn', message])
                },
                archiveProvider: localArchiveProvider,
                schedule: scheduler.schedule,
                cancelSchedule: scheduler.cancel
            });
            assert.equal(runtime.observer, DOMWatcher);
            assert.equal(runtime.controller.rulePreview.archiveProvider, localArchiveProvider);
            assert.equal(runtime.adapter.scanSidebarChats()[0].id, 'default-chat');
            assert.equal(runtime.adapter.getSidebarContainer(), sidebar);
            assert.equal(runtime.adapter.matchesSidebarMutation({ native: true }), true);
            assert.equal(runtime.view.translate('中文', 'English'), 'English');
            navigatorValue.language = 'zh-CN';
            assert.equal(runtime.view.translate('中文', 'English'), '中文');
            navigatorValue.language = 'en-US';
            delete globalThis.navigator;
            assert.equal(runtime.view.translate('中文', 'English'), 'English');
            define('navigator', navigatorValue);

            assert.equal(await runtime.controller.start('Guest'), true);
            assert.equal(runtime.controller.getSnapshot().native.notebooks.available, true);
            const generated = await runtime.controller.submit(null, {
                name: 'Default runtime', parentId: null, tags: [], color: '#8ab4f8', rules: [], ruleMode: 'any'
            });
            assert.match(generated.id, /^folder_\d+_0$/);
            assert.ok(rawStorage.has('gemini_folders_data'));
            await runtime.service.flush();
            assert.equal(flushes > 0, true);

            assert.equal(runtime.adapter.getNotebooksAvailability(), true);
            GeminiAdapter.getCapabilityProbeReport = () => ({ nativeCapabilities: [{ id: 'notebooks', status: 'native-owned', quality: 'degraded' }] });
            assert.equal(runtime.adapter.getNotebooksAvailability(), true);
            GeminiAdapter.getCapabilityProbeReport = () => ({ nativeCapabilities: [{ id: 'notebooks', status: 'native-owned', quality: 'unavailable' }] });
            assert.equal(runtime.adapter.getNotebooksAvailability(), false);
            GeminiAdapter.getCapabilityProbeReport = () => ({ nativeCapabilities: [{ id: 'notebooks', status: 'available', quality: 'available' }] });
            assert.equal(runtime.adapter.getNotebooksAvailability(), false);
            GeminiAdapter.getCapabilityProbeReport = () => ({ nativeCapabilities: [] });
            assert.equal(runtime.adapter.getNotebooksAvailability(), false);
            GeminiAdapter.getCapabilityProbeReport = () => { throw new Error('probe failed'); };
            assert.equal(runtime.adapter.getNotebooksAvailability(), false);

            let elementClicks = 0;
            assert.equal(runtime.adapter.openChat({ element: { click() { elementClicks += 1; } } }), true);
            assert.equal(elementClicks, 1);
            assert.equal(runtime.adapter.openChat({ href: '/app/safe' }), true);
            assert.equal(globalThis.location.href, '/app/safe');
            assert.equal(runtime.adapter.openChat({ href: ' javascript:alert(1) ' }), false);
            assert.equal(runtime.adapter.openChat({ href: '' }), false);
            assert.equal(runtime.adapter.openChat({}), false);
            const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
            delete globalThis.location;
            assert.equal(runtime.adapter.openChat({ href: '/app/no-location' }), false);
            Object.defineProperty(globalThis, 'location', locationDescriptor);

            assert.equal(runtime.storage.get('missing', 'fallback'), 'fallback');
            delete globalThis.GM_getValue;
            assert.equal(runtime.storage.get('missing', 'fallback'), 'fallback');
            define('GM_getValue', gmGet);
            runtime.storage.set('manual', { ok: true });
            assert.deepEqual(rawStorage.get('manual'), { ok: true });
            delete globalThis.GM_setValue;
            assert.throws(() => runtime.storage.set('manual', 2), /unavailable/);
            define('GM_setValue', gmSet);
            runtime.storage.flush();
            delete globalThis.__flushGMPolyfill;
            assert.equal(runtime.storage.flush(), undefined);
            define('__flushGMPolyfill', gmFlush);

            assert.equal(runtime.ui.confirm('yes'), true);
            assert.equal(runtime.ui.confirm('no'), false);
            delete globalThis.confirm;
            assert.equal(runtime.ui.confirm('yes'), false);
            define('confirm', message => message === 'yes');
            runtime.ui.toast('ok', { tone: 'success' });
            runtime.ui.toast('bad', { tone: 'danger' });
            assert.deepEqual(loggerCalls.slice(-2).map(entry => entry[0]), ['info', 'warn']);

            runtime.ui.downloadText('collections.json', '{}', 'application/json');
            const anchor = document.created.filter(element => element.tagName === 'A').at(-1);
            assert.equal(anchor.download, 'collections.json');
            assert.equal(anchor.href, 'blob:test');
            assert.equal(anchor.clickCount, 1);
            assert.equal(objectUrls.length, 1);
            assert.deepEqual(revokedUrls, ['blob:test']);

            const cancelled = runtime.ui.pickTextFile();
            let input = document.created.filter(element => element.type === 'file').at(-1);
            assert.equal(input.accept, '.json');
            input.oncancel();
            assert.equal(await cancelled, null);

            const missingFile = runtime.ui.pickTextFile({ accept: '.txt' });
            input = document.created.filter(element => element.type === 'file').at(-1);
            assert.equal(input.accept, '.txt');
            input.onchange({ target: { files: [] } });
            assert.equal(await missingFile, null);

            define('FileReader', class {
                readAsText(file) { this.onload({ target: { result: file.text } }); }
            });
            const loaded = runtime.ui.pickTextFile({ accept: '.json' });
            input = document.created.filter(element => element.type === 'file').at(-1);
            input.onchange({ target: { files: [{ text: '{"ok":true}' }] } });
            assert.equal(await loaded, '{"ok":true}');

            define('FileReader', class {
                readAsText() { this.onload({ target: { result: null } }); }
            });
            const loadedEmpty = runtime.ui.pickTextFile();
            input = document.created.filter(element => element.type === 'file').at(-1);
            input.onchange({ target: { files: [{}] } });
            assert.equal(await loadedEmpty, '');

            const readFailure = new Error('reader failed');
            define('FileReader', class {
                constructor() { this.error = readFailure; }
                readAsText() { this.onerror(); }
            });
            const failed = runtime.ui.pickTextFile();
            input = document.created.filter(element => element.type === 'file').at(-1);
            input.onchange({ target: { files: [{}] } });
            await assert.rejects(failed, readFailure);

            define('FileReader', class {
                constructor() { this.error = null; }
                readAsText() { this.onerror(); }
            });
            const failedWithoutDetail = runtime.ui.pickTextFile();
            input = document.created.filter(element => element.type === 'file').at(-1);
            input.onchange({ target: { files: [{}] } });
            await assert.rejects(failedWithoutDetail, /Unable to read collections file/);

            assert.equal(await runtime.controller.stop(), true);

            const customStorage = new MemoryStorage();
            const customAdapter = {
                scanSidebarChats: () => [], getSidebarContainer: () => null,
                matchesSidebarMutation: () => false, openChat: () => false,
                getNotebooksAvailability: () => false
            };
            const customObserver = new FakeObserver();
            const customUi = { confirm: () => true, toast: () => {}, downloadText: () => {}, pickTextFile: () => null };
            const customRuntime = foldersRuntime.createDefaultFoldersRuntime({
                clock: () => NOW,
                storage: customStorage,
                document,
                translate: (zh) => zh,
                idFactory: () => 'custom-id',
                adapter: customAdapter,
                observer: customObserver,
                ui: customUi,
                schedule: scheduler.schedule,
                cancelSchedule: scheduler.cancel,
                initialDelay: 0
            });
            assert.equal(customRuntime.storage, customStorage);
            assert.equal(customRuntime.adapter, customAdapter);
            assert.equal(customRuntime.observer, customObserver);
            assert.equal(customRuntime.ui, customUi);
            assert.equal(customRuntime.view.translate('自定义', 'Custom'), '自定义');

            const quietRuntime = foldersRuntime.createDefaultFoldersRuntime({
                clock: () => NOW,
                storage: customStorage,
                document,
                adapter: customAdapter,
                observer: customObserver,
                logger: {},
                schedule: scheduler.schedule,
                cancelSchedule: scheduler.cancel,
                initialDelay: 0
            });
            assert.equal(quietRuntime.ui.toast('quiet', {}), undefined);
            const loggerDefaultRuntime = foldersRuntime.createDefaultFoldersRuntime({
                clock: () => NOW,
                storage: customStorage,
                document,
                adapter: customAdapter,
                observer: customObserver,
                schedule: scheduler.schedule,
                cancelSchedule: scheduler.cancel,
                initialDelay: 0
            });
            assert.ok(loggerDefaultRuntime.ui);
        } finally {
            DOMWatcher.unregister('folders-sidebar');
            Core.scanSidebarChats = originals.scan;
            GeminiAdapter.getSidebarOverflowContainer = originals.container;
            GeminiAdapter.matchesFoldersSidebarMutation = originals.mutation;
            GeminiAdapter.getCapabilityProbeReport = originals.capabilities;
            for (const [key, descriptor] of descriptors) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else delete globalThis[key];
            }
        }
    });
});
