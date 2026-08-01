const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const rootDir = path.join(__dirname, '..');
let recipes;
let legacyModule;

before(async () => {
    recipes = await import(pathToFileURL(path.join(rootDir, 'src', 'features', 'recipes', 'index.js')).href);
    legacyModule = await import(pathToFileURL(path.join(rootDir, 'src', 'modules', 'prompt_vault.js')).href);
});

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

class MemoryStorage {
    constructor(entries = {}) {
        this.values = new Map(Object.entries(clone(entries)));
        this.sets = [];
        this.flushCount = 0;
        this.failNextKey = null;
    }

    async get(key, fallback) {
        return this.values.has(key) ? clone(this.values.get(key)) : clone(fallback);
    }

    async set(key, value) {
        if (this.failNextKey === key) {
            this.failNextKey = null;
            throw new Error(`write failed: ${key}`);
        }
        this.sets.push({ key, value: clone(value) });
        this.values.set(key, clone(value));
    }

    async flush() { this.flushCount += 1; }
}

class FakeEvent {
    constructor(type, init = {}) {
        this.type = type;
        Object.assign(this, init);
        this.key = init.key;
        this.shiftKey = Boolean(init.shiftKey);
        this.ctrlKey = Boolean(init.ctrlKey);
        this.metaKey = Boolean(init.metaKey);
        this.altKey = Boolean(init.altKey);
        this.target = init.target || null;
        this.currentTarget = null;
        this.defaultPrevented = false;
        this.propagationStopped = false;
    }

    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
}

class FakeEventTarget {
    constructor() { this._listeners = new Map(); }

    addEventListener(type, listener, options = {}) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(listener);
        options.signal?.addEventListener('abort', () => this.removeEventListener(type, listener), { once: true });
    }

    removeEventListener(type, listener) { this._listeners.get(type)?.delete(listener); }

    dispatchEvent(event) {
        if (!event.target) event.target = this;
        event.currentTarget = this;
        for (const listener of [...(this._listeners.get(event.type) || [])]) listener.call(this, event);
        return !event.defaultPrevented;
    }

    listenerCount(type) { return this._listeners.get(type)?.size || 0; }
}

class FakeElement extends FakeEventTarget {
    constructor(tagName, ownerDocument) {
        super();
        this.nodeType = 1;
        this.tagName = String(tagName).toUpperCase();
        this.ownerDocument = ownerDocument;
        this.parentNode = null;
        this.children = [];
        this.attributes = new Map();
        this.className = '';
        this.id = '';
        this.type = '';
        this.name = '';
        this.value = '';
        this.checked = false;
        this.required = false;
        this.disabled = false;
        this.files = [];
        this.selectionStart = 0;
        this.selectionEnd = 0;
        this._textContent = '';
        this.clicked = 0;
        this.focused = 0;
    }

    get firstChild() { return this.children[0] || null; }
    get childNodes() { return this.children; }
    get textContent() {
        return this.children.length ? this.children.map(child => child.textContent).join('') : this._textContent;
    }
    set textContent(value) {
        for (const child of this.children) child.parentNode = null;
        this.children = [];
        this._textContent = String(value ?? '');
    }

    setAttribute(name, value) {
        this.attributes.set(String(name), String(value));
        if (name === 'id') this.id = String(value);
        if (name === 'class') this.className = String(value);
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }

    append(...nodes) { for (const node of nodes) this.appendChild(node); }
    appendChild(node) {
        node.parentNode?.removeChild?.(node);
        node.parentNode = this;
        this.children.push(node);
        return node;
    }
    insertBefore(node, before) {
        node.parentNode?.removeChild?.(node);
        node.parentNode = this;
        const index = before ? this.children.indexOf(before) : -1;
        if (index < 0) this.children.push(node);
        else this.children.splice(index, 0, node);
        return node;
    }
    removeChild(node) {
        const index = this.children.indexOf(node);
        if (index >= 0) this.children.splice(index, 1);
        node.parentNode = null;
        return node;
    }
    remove() { this.parentNode?.removeChild?.(this); }
    focus() { this.focused += 1; this.ownerDocument.activeElement = this; }
    click() {
        if (this.disabled) return;
        this.clicked += 1;
        this.dispatchEvent(new FakeEvent('click'));
        if (this.type === 'submit') {
            let parent = this.parentNode;
            while (parent && parent.tagName !== 'FORM') parent = parent.parentNode;
            parent?.dispatchEvent(new FakeEvent('submit'));
        }
    }
    _descendants() { return this.children.flatMap(child => [child, ...child._descendants()]); }
    _matches(selector) {
        const value = selector.trim();
        if (value.startsWith('#')) return this.id === value.slice(1);
        if (value.startsWith('.')) return this.className.split(/\s+/).includes(value.slice(1));
        const attribute = value.match(/^([a-z]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/i);
        if (attribute) {
            if (attribute[1] && this.tagName !== attribute[1].toUpperCase()) return false;
            const propertyValue = this[attribute[2]];
            const actual = this.hasAttribute(attribute[2])
                ? this.getAttribute(attribute[2])
                : propertyValue === undefined || propertyValue === '' ? null : String(propertyValue);
            if (actual === null) return false;
            return attribute[3] === undefined || actual === attribute[3];
        }
        return this.tagName === value.toUpperCase();
    }
    querySelectorAll(selector) {
        const selectors = selector.split(',');
        return this._descendants().filter(node => selectors.some(candidate => node._matches(candidate)));
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
        this.documentElement = { lang: 'en' };
        this.title = 'Current Gemini chat';
        this.activeElement = this.body;
        this.created = [];
    }
    createElement(tagName) {
        const element = new FakeElement(tagName, this);
        this.created.push(element);
        return element;
    }
    getElementById(id) { return this.body._descendants().find(element => element.id === id) || null; }
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
    querySelector(selector) { return this.body.querySelector(selector); }
}

function createDialogUi(document) {
    const stack = [];
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const top = stack.at(-1);
        if (!top) return;
        event.preventDefault();
        top.close('escape');
    });
    return {
        openDialog({ id, ariaLabel, overlayClass, contentElement, initialFocus, onClose }) {
            const returnFocus = document.activeElement;
            const overlay = document.createElement('div');
            overlay.className = overlayClass || '';
            const element = document.createElement('section');
            element.className = contentElement.className;
            element.setAttribute('role', 'dialog');
            element.setAttribute('aria-modal', 'true');
            element.setAttribute('aria-label', ariaLabel);
            while (contentElement.firstChild) element.appendChild(contentElement.firstChild);
            overlay.appendChild(element);
            document.body.appendChild(overlay);
            let open = true;
            let handle;
            const close = reason => {
                if (!open) return false;
                open = false;
                const index = stack.indexOf(handle);
                if (index >= 0) stack.splice(index, 1);
                overlay.remove();
                onClose?.(reason, handle);
                returnFocus?.focus?.();
                return true;
            };
            handle = Object.freeze({
                id,
                element,
                overlay,
                get open() { return open; },
                close
            });
            overlay.addEventListener('click', event => {
                if (event.target === overlay && stack.at(-1) === handle) close('backdrop');
            });
            stack.push(handle);
            initialFocus?.focus?.();
            return handle;
        }
    };
}

class FakeReader extends FakeEventTarget {
    static result = '{}';
    readAsText(file) {
        this.file = file;
        this.result = FakeReader.result;
        this.dispatchEvent(new FakeEvent('load'));
    }
}

function tick() {
    return new Promise(resolve => setImmediate(resolve));
}

function makeAdapter(document) {
    const editor = document.createElement('textarea');
    const trailing = document.createElement('div');
    document.body.append(editor, trailing);
    return {
        editor,
        trailing,
        getInputEditor() { return editor; },
        getInputTrailingActions() { return trailing; },
        getChatTitleText() { return 'Adapter title'; },
        detectModelKey() { return 'gemini-2.5-pro'; }
    };
}

function facadeHarness({ entries = {}, capabilities = {}, adapter: suppliedAdapter } = {}) {
    const document = new FakeDocument();
    const storage = new MemoryStorage(entries);
    const adapter = suppliedAdapter || makeAdapter(document);
    const inserted = [];
    const ui = createDialogUi(document);
    let id = 0;
    const facade = recipes.createLegacyPromptVaultFacade({
        document,
        window: {
            Event: FakeEvent,
            InputEvent: FakeEvent,
            getSelection() { return { toString() { return 'selected text'; } }; }
        },
        adapter,
        storage,
        logger: { info() {} },
        clock() { return new Date('2026-08-01T12:34:56.000Z'); },
        idFactory() { id += 1; return `p_test_${id}`; },
        t(_zh, en) { return en; },
        Blob: class FakeBlob { constructor(parts, options) { this.parts = parts; this.options = options; } },
        URL: {
            created: [], revoked: [],
            createObjectURL(blob) { this.created.push(blob); return 'blob:recipes'; },
            revokeObjectURL(url) { this.revoked.push(url); }
        },
        FileReader: FakeReader,
        ui
    });
    facade.configureCapabilities({
        composer: { insertDraft(text) { inserted.push(text); return true; } },
        ...capabilities
    });
    return { facade, document, storage, adapter, inserted, ui };
}

function recipeDraft(overrides = {}) {
    return {
        id: 'recipe-one',
        title: 'Recipe one',
        description: 'Research',
        variables: [{ name: 'topic', type: 'text', label: 'Topic', required: true }],
        steps: [{ id: 'step-1', title: 'Draft', template: 'Explain {{topic}}', permissions: ['composer.insert'] }],
        permissions: ['composer.insert'],
        provenance: { source: 'test', sourceId: 'recipe-one' },
        ...overrides
    };
}

describe('Recipes migration architecture', () => {
    it('keeps the legacy module thin and the domain free of browser, GM, and wall-clock globals', () => {
        const moduleSource = fs.readFileSync(path.join(rootDir, 'src', 'modules', 'prompt_vault.js'), 'utf8');
        const serviceSource = fs.readFileSync(path.join(rootDir, 'src', 'features', 'recipes', 'service.js'), 'utf8');
        const modelSource = fs.readFileSync(path.join(rootDir, 'src', 'features', 'recipes', 'model.js'), 'utf8');
        const facadeSource = fs.readFileSync(path.join(rootDir, 'src', 'features', 'recipes', 'legacy_facade.js'), 'utf8');
        assert.equal(moduleSource.split(/\r?\n/).length <= 10, true);
        assert.match(moduleSource, /createLegacyPromptVaultFacade/);
        assert.equal(legacyModule.PromptVaultModule.id, 'prompt-vault');
        assert.doesNotMatch(moduleSource + facadeSource,
            /import\s+\{[^}]*\b(?:NativeUI|PanelUI|CounterModule|MessageQueueModule)\b/);
        assert.doesNotMatch(serviceSource, /new Date|Date\.now|Math\.random|globalThis|document|GM_/);
        assert.doesNotMatch(modelSource, /globalThis|document|GM_/);
    });
});

describe('Legacy prompt repository migration', () => {
    it('migrates in place without changing the old key or raw payload and preserves custom fields', async () => {
        const keys = recipes.legacyStorageKeys('person@example.test');
        assert.deepEqual(keys, {
            legacy: 'gemini_prompt_vault_person@example.test',
            recipes: 'gemini_prompt_vault_person@example.test_recipes_v13'
        });
        assert.deepEqual(recipes.legacyStorageKeys('Guest'), {
            legacy: 'gemini_prompt_vault', recipes: 'gemini_prompt_vault_recipes_v13'
        });
        assert.deepEqual(recipes.legacyStorageKeys('  '), recipes.legacyStorageKeys('Guest'));

        const legacy = [{
            id: 'bad/id', name: 'Original', content: 'Hello {{User-Name}}',
            chainSteps: ['Then {{2nd}}'], category: 'Testing', shortcut: 'orig',
            favorite: true, createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z', customField: { keep: true }
        }, { id: 'empty', name: 'Empty', content: '' }];
        const storage = new MemoryStorage({ [keys.legacy]: legacy });
        const repository = recipes.createLegacyPromptRecipeRepository({
            storage, sessionId: 'person@example.test', clock: () => '2026-08-01T00:00:00.000Z'
        });
        const state = await repository.get();
        assert.deepEqual(storage.values.get(keys.legacy), legacy);
        assert.equal(state.records.length, 1);
        assert.match(state.records[0].id, /^legacy-/);
        assert.equal(state.records[0].versions[0].steps[0].template, 'Hello {{user_name}}');
        assert.equal(state.records[0].versions[0].steps[1].template.startsWith('Then {{legacy_'), true);
        assert.deepEqual(storage.values.get(keys.recipes), state);
        assert.equal(repository.boundAccountId, 'person@example.test');

        const service = recipes.createRecipeService({
            repositoryFactory: () => repository,
            clock: () => '2026-08-02T00:00:00.000Z',
            idFactory: () => 'unused-id'
        });
        await service.start('person@example.test');
        await service.api.revise(state.records[0].id, { title: 'Renamed' });
        const mirrored = storage.values.get(keys.legacy)[0];
        assert.equal(mirrored.id, 'bad/id');
        assert.equal(mirrored.content, 'Hello {{User-Name}}');
        assert.deepEqual(mirrored.customField, { keep: true });
        assert.equal(mirrored.name, 'Renamed');
        await service.stop();
        assert.equal(storage.flushCount, 1);
    });

    it('merges newly discovered legacy entries, serializes updates, and rolls back failed mirrors', async () => {
        const keys = recipes.legacyStorageKeys('a@example.test');
        const storage = new MemoryStorage({
            [keys.legacy]: [{ id: 'a', name: 'A', content: 'A' }]
        });
        const repository = new recipes.LegacyPromptRecipeRepository({
            storage, sessionId: 'a@example.test', clock: () => '2026-08-01T00:00:00.000Z'
        });
        const first = await repository.get();
        storage.values.set(keys.legacy, [
            storage.values.get(keys.legacy)[0],
            { id: 'b', name: 'B', content: 'B', unknown: 7 }
        ]);
        const merged = await repository.get();
        assert.deepEqual(merged.records.map(record => record.id), ['a', 'b']);
        assert.deepEqual((await repository.getLegacyPrompts()).map(prompt => prompt.id), ['a', 'b']);
        assert.equal(repository.getLegacyMetadata('missing'), null);
        await repository.setLegacyMetadata('a', { id: 'a', shortcut: 'new-shortcut' });
        assert.equal(repository.getLegacyMetadata('a').raw.shortcut, 'new-shortcut');
        await repository.removeLegacyMetadata('a');
        assert.equal(repository.getLegacyMetadata('a'), null);
        await repository.setLegacyMetadata('detached', { shortcut: 'first' });
        assert.equal(repository.getLegacyMetadata('detached').legacyId, 'detached');
        await repository.setLegacyMetadata('detached', { favorite: true });
        assert.equal(repository.getLegacyMetadata('detached').legacyId, 'detached');
        await assert.rejects(repository.update(null), /updater/);

        const beforeSidecar = clone(storage.values.get(keys.recipes));
        const beforeLegacy = clone(storage.values.get(keys.legacy));
        storage.failNextKey = keys.legacy;
        await assert.rejects(repository.update(state => ({ ...state, records: [] })), /write failed/);
        assert.deepEqual(storage.values.get(keys.recipes), beforeSidecar);
        assert.deepEqual(storage.values.get(keys.legacy), beforeLegacy);
        assert.deepEqual(first.records.map(record => record.id), ['a']);

        storage.values.set(keys.legacy, {});
        await assert.rejects(repository.getLegacyPrompts(), /must remain an array/);
        await assert.rejects(repository.get(), /must remain an array/);

        const alwaysFail = new recipes.LegacyPromptRecipeRepository({
            storage: { get: async (_key, fallback) => fallback, set: async () => { throw new Error('still failed'); } },
            sessionId: 'fail@example.test'
        });
        await alwaysFail._rollback({}, []);
    });

    it('validates adapters and conversion helpers, including duplicate and empty legacy prompts', () => {
        assert.throws(() => new recipes.LegacyPromptRecipeRepository(), /storage/);
        assert.throws(() => new recipes.LegacyPromptRecipeRepository({ storage: {}, clock() {} }), /storage/);
        assert.throws(() => new recipes.LegacyPromptRecipeRepository({ storage: new MemoryStorage(), clock: 1 }), /clock/);
        assert.equal(recipes.legacyPromptToRecipeDraft({ content: '' }, 0), null);
        assert.equal(recipes.legacyPromptToRecipeRecord({ content: '' }, 0), null);
        const usedIds = new Set(['same']);
        const draft = recipes.legacyPromptToRecipeDraft({ id: 'same', name: 'X', content: 'X' }, 0, {
            nowIso: 'invalid', usedIds
        });
        assert.equal(draft.id, 'same-2');
        assert.equal(recipes.legacyPromptToRecipeDraft({ id: 'fresh', name: 'Fresh', content: 'Fresh' }, 0).id, 'fresh');
        const placeholders = recipes.legacyPromptToRecipeDraft({
            id: 'placeholders', name: 'Placeholders', content: '{{x}} {{x}} {{a-b}} {{a_b}}'
        }, 0);
        assert.equal(new Set(placeholders.variables.map(variable => variable.name)).size, 3);
        assert.deepEqual(placeholders.variables.map(variable => variable.default).sort(),
            ['{{a-b}}', '{{a_b}}', '{{x}}']);
        const record = recipes.legacyPromptToRecipeRecord({ id: 'same', name: 'X', content: 'X' }, 0, {
            nowIso: '2026-01-01T00:00:00.000Z', usedIds
        });
        const plain = recipes.recipeRecordToLegacyPrompt(record);
        assert.equal(plain.id, 'same');
        assert.equal(plain.name, 'X');
        const withMetadata = recipes.recipeRecordToLegacyPrompt(record, {
            raw: [], original: null, legacyId: 'legacy-id'
        });
        assert.equal(withMetadata.id, 'legacy-id');
        const originalOnly = recipes.recipeRecordToLegacyPrompt(record, {
            raw: {}, original: { content: 'X' }
        });
        assert.equal(originalOnly.content, 'X');

        const noSourceRecord = recipes.normalizeRecipeRecord({
            id: 'no-source', currentVersion: 1,
            versions: [recipes.createRecipeVersion({
                ...recipeDraft({ id: 'no-source', description: '', provenance: { source: 'test' } })
            }, { id: 'no-source', now: '2026-01-01T00:00:00.000Z' })]
        });
        const noSource = recipes.recipeRecordToLegacyPrompt(noSourceRecord, { raw: {}, original: null });
        assert.equal(noSource.id, 'no-source');
        assert.equal(noSource.category, 'General');

        const defaultClockRepository = new recipes.LegacyPromptRecipeRepository({
            storage: new MemoryStorage({ gemini_prompt_vault: [{ id: 'clock', name: 'Clock', content: 'Now' }] })
        });
        return defaultClockRepository.get().then(state => assert.equal(state.records.length, 1));
    });
});

describe('Legacy runtime compatibility adapters', () => {
    it('adapts GM storage, locale, session, timestamps, ids, and optional capabilities', async () => {
        const scope = {};
        const fallbackStorage = recipes.createLegacyGMStorage(scope);
        assert.equal(fallbackStorage.get('x', 4), 4);
        assert.equal(fallbackStorage.set('x', 1), undefined);
        assert.equal(fallbackStorage.flush(), undefined);

        const calls = [];
        const storage = recipes.createLegacyGMStorage({
            GM_getValue(key, fallback) { calls.push(['get', key]); return fallback + 1; },
            GM_setValue(key, value) { calls.push(['set', key, value]); return 'set'; },
            __flushGMPolyfill() { calls.push(['flush']); return Promise.resolve('flushed'); }
        });
        assert.equal(storage.get('x', 1), 2);
        assert.equal(storage.set('x', 3), 'set');
        assert.equal(await storage.flush(), 'flushed');
        assert.equal(calls.length, 3);

        const oldDocument = globalThis.document;
        const oldNavigator = globalThis.navigator;
        Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'zh-CN' } } });
        assert.equal(recipes.defaultLegacyTranslate('中', 'EN'), '中');
        Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'en' } } });
        assert.equal(recipes.defaultLegacyTranslate('中', 'EN'), 'EN');
        delete globalThis.document;
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'zh-TW' } });
        assert.equal(recipes.defaultLegacyTranslate('中', 'EN'), '中');
        delete globalThis.navigator;
        assert.equal(recipes.defaultLegacyTranslate('中', 'EN'), 'EN');
        if (oldDocument !== undefined) Object.defineProperty(globalThis, 'document', { configurable: true, value: oldDocument });
        if (oldNavigator !== undefined) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: oldNavigator });

        assert.equal(recipes.resolveLegacySession(' x@example.test '), 'x@example.test');
        assert.equal(recipes.resolveLegacySession(null, () => 'fallback'), 'fallback');
        assert.equal(recipes.resolveLegacySession(null, () => ''), 'Guest');
        assert.equal(recipes.toIsoTimestamp(() => new Date('2026-08-01T00:00:00Z')), '2026-08-01T00:00:00.000Z');
        assert.equal(recipes.toIsoTimestamp(() => '2026-08-01T00:00:00Z'), '2026-08-01T00:00:00.000Z');
        assert.throws(() => recipes.toIsoTimestamp(() => 'bad'), /valid timestamp/);
        assert.equal(recipes.defaultLegacyClock() instanceof Date, true);
        assert.match(recipes.defaultLegacyIdFactory(), /^p_\d+$/);

        const capabilities = recipes.contextCapabilities({
            getCapability(name) {
                if (name === 'message-queue.service') throw new Error('disabled');
                if (name === 'message-queue') return 'queue';
                if (name === 'ui.notifications') return 'notifications';
                return undefined;
            }
        });
        assert.deepEqual(capabilities, { queue: 'queue', notifications: 'notifications', shell: undefined });
        assert.deepEqual(recipes.contextCapabilities(), { queue: undefined, notifications: undefined, shell: undefined });
    });
});

describe('Prompt Vault facade integration', () => {
    it('validates compatibility dependencies and lazily adopts the runtime document', async () => {
        assert.throws(() => recipes.createLegacyPromptVaultFacade({ adapter: null }), /adapter/);
        assert.throws(() => recipes.createLegacyPromptVaultFacade({ storage: null }), /storage/);
        assert.throws(() => recipes.createLegacyPromptVaultFacade({ storage: { get() {} } }), /storage/);
        assert.throws(() => recipes.createLegacyPromptVaultFacade({ clock: 1 }), /clock/);
        assert.throws(() => recipes.createLegacyPromptVaultFacade({ t: 1 }), /translator/);
        assert.throws(() => recipes.createLegacyPromptVaultFacade({ idFactory: 1 }), /idFactory/);

        const document = new FakeDocument();
        const adapter = makeAdapter(document);
        const facade = recipes.createLegacyPromptVaultFacade({
            document: null,
            window: null,
            adapter,
            storage: new MemoryStorage(),
            clock: () => '2026-08-01T00:00:00.000Z',
            idFactory: () => 'id',
            t: (_z, en) => en,
            logger: null
        });
        assert.equal(facade.recipes, null);
        assert.deepEqual(facade.getCapabilityStatus(), {
            status: 'unavailable',
            reasonCode: 'FEATURE_INACTIVE',
            missing: ['ui.notifications', 'ui.shell']
        });
        assert.equal(facade._getStorageKey(), 'gemini_prompt_vault');
        facade._context = { session: 'context@example.test' };
        assert.equal(facade._getStorageKey(), 'gemini_prompt_vault_context@example.test');
        assert.throws(() => facade.configureCapabilities(null), /capabilities/);
        assert.throws(() => facade.configureCapabilities([]), /capabilities/);
        assert.throws(() => facade._requireStarted(), /not started/);
        await facade.init({ session: 'lazy@example.test', document, window: { Event: FakeEvent, InputEvent: FakeEvent } });
        assert.equal(await facade.init(), facade);
        assert.equal(facade.document, document);
        assert.equal(facade.window.Event, FakeEvent);
        await facade.destroy();

        const missingDocument = recipes.createLegacyPromptVaultFacade({
            document: null, adapter: {}, storage: new MemoryStorage(),
            clock: () => '2026-08-01T00:00:00.000Z', idFactory: () => 'id', t: (_z, en) => en
        });
        await assert.rejects(missingDocument.init({ session: 'missing@example.test' }), /document/);
    });

    it('keeps the legacy key/API while rendering every quick insert as a non-sending Recipe draft', async () => {
        const key = recipes.legacyStorageKeys('a@example.test').legacy;
        const raw = [{
            id: 'legacy-one', name: 'Legacy one', category: 'General',
            content: 'Hello {{date}} {{custom}}', shortcut: 'hello',
            favorite: false, usedCount: 0, privateExtension: 'keep'
        }];
        const { facade, storage, inserted } = facadeHarness({ entries: { [key]: raw } });
        await facade.init({ session: 'a@example.test' });
        assert.equal(facade.id, 'prompt-vault');
        assert.equal(facade.STORAGE_KEY, 'gemini_prompt_vault');
        assert.equal(facade._getStorageKey(), key);
        assert.equal(facade.recipes, facade._service.api);
        assert.equal(facade._prompts.length, 1);
        assert.equal((await facade.recipes.render('legacy-one', {
            date: '2026-08-01', custom: 'value'
        })).autoSend, false);
        assert.equal(await facade.insertPrompt(raw[0].content, 'legacy-one'), true);
        assert.match(inserted[0], /\{\{custom\}\}$/);
        assert.equal(await facade.insertPrompt(raw[0].content, 'legacy-one', { custom: 'world' }), true);
        assert.match(inserted[1], /^Hello 2026-/);
        assert.match(inserted[1], /world$/);
        assert.equal(storage.values.get(key)[0].usedCount, 2);
        assert.equal(storage.values.get(key)[0].privateExtension, 'keep');
        assert.equal(await facade.insertPrompt('plain fallback'), true);
        assert.equal(inserted.at(-1), 'plain fallback');
        assert.equal(await facade.insertPrompt(undefined), true);
        assert.equal(inserted.at(-1), '');
        assert.equal(await facade.addPrompt('Blank', '', 'General', ''), null);

        const created = await facade.addPrompt('Second', 'Second body', 'Work', 'second');
        assert.equal(created.version, 1);
        const id = created.provenance.sourceId;
        await facade.updatePrompt(id, { shortcut: 'metadata-only' });
        assert.equal((await facade.recipes.get(created.id)).version, 1);
        await facade.updatePrompt(id, { content: 'Second body v2' });
        assert.equal((await facade.recipes.get(created.id)).version, 2);
        assert.equal(await facade.updatePrompt('missing', {}), null);
        assert.equal(await facade.togglePromptFavorite('missing'), false);
        assert.equal(await facade.togglePromptFavorite(id), true);
        assert.equal(await facade._updateLegacyMetadata('missing', {}), false);
        await facade._save();
        assert.equal(storage.flushCount, 1);

        assert.equal(await facade.deletePrompt('missing'), false);
        assert.equal(await facade.undoDeletePrompt(), false);
        assert.equal(await facade.deletePrompt(id), true);
        assert.equal(await facade.undoDeletePrompt(), true);
        assert.equal((await facade.recipes.get(created.id)).version, 2);
        assert.equal(facade.getOnboarding().en.guide.includes('never sends'), true);
        await facade.destroy();
    });

    it('shows required-variable and permission previews before explicit queue handoff', async () => {
        const queued = [];
        const notices = [];
        const queue = {
            enqueueEntries(entries, options) { queued.push({ entries, options }); return entries.length; }
        };
        const { facade, document, inserted } = facadeHarness({
            capabilities: { queue, notifications: { show(message) { notices.push(message); } } }
        });
        await facade.init({ session: 'queue@example.test' });
        await facade.recipes.create(recipeDraft());
        await facade._syncLegacyView();

        assert.equal(await facade.insertPrompt('unused', 'recipe-one'), false);
        let dialog = document.querySelector('[role="dialog"]');
        assert.match(dialog.textContent, /never sends/);
        const topic = dialog.querySelector('input');
        topic.value = 'Saturn';
        dialog.querySelector('button[type="submit"]').click();
        await tick();
        assert.deepEqual(inserted, ['Explain Saturn']);

        const prompt = facade._prompts.find(item => item.id === 'recipe-one');
        assert.equal(await facade.queuePrompt(prompt), false);
        dialog = document.querySelector('[role="dialog"]');
        dialog.querySelector('input').value = 'Mars';
        dialog.querySelector('button[type="submit"]').click();
        await tick();
        dialog = document.querySelector('[role="dialog"]');
        assert.match(dialog.textContent, /local queue/);
        dialog.querySelectorAll('button')[0].click();
        assert.equal(await facade.queuePrompt(prompt, { topic: 'Jupiter' }), true);
        assert.equal(queued.length, 0);
        dialog = document.querySelector('[role="dialog"]');
        assert.match(dialog.textContent, /local queue/);
        assert.match(dialog.textContent, /conversation\.send/);
        dialog.querySelector('button').querySelector;
        const confirm = dialog.querySelectorAll('button').find(button => button.textContent.includes('Confirm queue'));
        confirm.click();
        await tick();
        assert.equal(queued.length, 1);
        assert.equal(queued[0].entries[0].text, 'Explain Jupiter');
        assert.match(queued[0].options.idPrefix, /^pv_recipe-one_20260801123456000$/);
        assert.equal(notices.at(-1), 'Queued 1 item(s)');

        facade.configureCapabilities({ queue: null });
        assert.equal(await facade.queuePrompt(prompt, { topic: 'No queue' }), false);
        assert.equal(notices.at(-1), 'Enable Message Queue first');
        assert.equal(await facade._confirmQueueHandoff({ autoSend: false, recipeId: 'x', steps: [] }, 'x'), false);
        await assert.rejects(facade._confirmQueueHandoff({ autoSend: true, steps: [] }, 'x'), /non-sending/);

        const singlyQueued = [];
        facade.configureCapabilities({ queue: { enqueue(entry) { singlyQueued.push(entry); } } });
        assert.equal(await facade._confirmQueueHandoff({
            autoSend: false, recipeId: 'recipe-one',
            steps: [{ title: 'One', prompt: 'A' }, { title: 'Two', prompt: 'B' }]
        }, 'missing'), 2);
        assert.equal(singlyQueued.length, 2);
        facade.configureCapabilities({ queue: {} });
        await assert.rejects(facade._confirmQueueHandoff({
            autoSend: false, recipeId: 'recipe-one', steps: [{ title: 'One', prompt: 'A' }]
        }, 'missing'), /must implement/);
        await facade.destroy();
    });

    it('rolls back failed creates and keeps generated legacy ids unique', async () => {
        const { facade, storage } = facadeHarness();
        await facade.init({ session: 'failure@example.test' });
        const keys = recipes.legacyStorageKeys('failure@example.test');
        storage.failNextKey = keys.recipes;
        await assert.rejects(facade.addPrompt('', 'Will fail', '', ''), /write failed/);
        assert.equal(facade._activeRepository().getLegacyMetadata('p_test_1'), null);

        const document = new FakeDocument();
        const adapter = makeAdapter(document);
        const constant = recipes.createLegacyPromptVaultFacade({
            document, window: { Event: FakeEvent, InputEvent: FakeEvent }, adapter,
            storage: new MemoryStorage(), logger: null,
            clock: () => '2026-08-01T00:00:00.000Z', idFactory: () => 'same-id', t: (_z, en) => en
        });
        await constant.init({ session: 'ids@example.test' });
        const first = await constant.addPrompt('', 'First', '', '');
        const second = await constant.addPrompt('', 'Second', '', '');
        assert.equal(first.provenance.sourceId, 'same-id');
        assert.equal(second.provenance.sourceId, 'same-id_2');
        await constant._markUsed('missing');
        await constant.destroy();
        await facade.destroy();
    });

    it('isolates account data, flushes switches, and survives start-stop-start without duplicate native UI', async () => {
        const keyA = recipes.legacyStorageKeys('a@example.test').legacy;
        const keyB = recipes.legacyStorageKeys('b@example.test').legacy;
        const { facade, storage, document, adapter } = facadeHarness({ entries: {
            [keyA]: [{ id: 'a', name: 'A', content: 'Account A', shortcut: 'a' }],
            [keyB]: [{ id: 'b', name: 'B', content: 'Account B', shortcut: 'b' }]
        }, capabilities: { composer: null } });
        await facade.init({
            session: 'a@example.test',
            getCapability(name) { return name === 'ui.shell' ? { openModule() {} } : undefined; }
        });
        assert.deepEqual(facade.getCapabilityStatus(), {
            status: 'degraded',
            reasonCode: 'OPTIONAL_CAPABILITIES_UNAVAILABLE',
            missing: ['ui.notifications']
        });
        facade.injectNativeUI();
        facade.injectNativeUI();
        assert.equal(document.querySelectorAll('#gc-vault-native').length, 1);
        assert.equal(adapter.editor.listenerCount('keydown'), 1);
        assert.deepEqual(facade._prompts.map(prompt => prompt.id), ['a']);
        facade._packetSelected.add('a');
        await facade.onUserChange('b@example.test');
        assert.deepEqual(facade._prompts.map(prompt => prompt.id), ['b']);
        assert.equal(facade._packetSelected.size, 0);
        assert.equal(storage.flushCount, 1);
        await facade.onUserChange('a@example.test');
        assert.deepEqual(facade._prompts.map(prompt => prompt.id), ['a']);

        adapter.editor.value = '/a';
        adapter.editor.dispatchEvent(new FakeEvent('keydown', { key: 'Tab' }));
        await tick();
        assert.equal(adapter.editor.value, 'Account A');
        facade._toast('fallback status');
        const fallback = document.getElementById('primer-recipes-live');
        assert.equal(fallback.getAttribute('data-capability-state'), 'degraded');
        assert.equal(fallback.getAttribute('data-missing-capability'), 'ui.notifications');
        facade.removeNativeUI();
        assert.equal(document.getElementById('primer-recipes-live'), null);
        facade.injectNativeUI();
        facade._toast('second fallback');
        await facade.destroy();
        assert.equal(document.querySelectorAll('#gc-vault-native').length, 0);
        assert.equal(document.getElementById('primer-recipes-live'), null);
        assert.equal(adapter.editor.listenerCount('keydown'), 0);
        assert.equal(facade.getCapabilityStatus().status, 'unavailable');
        await facade.init({ session: 'a@example.test' });
        const notices = [];
        facade.configureCapabilities({ notifications: { show(message) { notices.push(message); } } });
        assert.deepEqual(facade.getCapabilityStatus(), {
            status: 'available', reasonCode: null, missing: []
        });
        facade.injectNativeUI();
        facade._toast('native notice');
        assert.deepEqual(notices, ['native notice']);
        assert.equal(document.getElementById('primer-recipes-live'), null);
        assert.equal(document.querySelectorAll('#gc-vault-native').length, 1);
        assert.equal(adapter.editor.listenerCount('keydown'), 1);
        await facade.destroy();
        const inactiveStatus = facade.getCapabilityStatus();
        assert.equal(inactiveStatus.status, 'unavailable');
        assert.equal(inactiveStatus.reasonCode, 'FEATURE_INACTIVE');
        assert.equal(Object.isFrozen(inactiveStatus), true);
        assert.equal(Object.isFrozen(inactiveStatus.missing), true);
    });

    it('exposes a clone-isolated account-bound portable archive integration and invalidates it safely', async () => {
        const keyA = recipes.legacyStorageKeys('archive-a@example.test').legacy;
        const keyB = recipes.legacyStorageKeys('archive-b@example.test').legacy;
        const { facade } = facadeHarness({ entries: {
            [keyA]: [{ id: 'archive-a', name: 'Archive A', content: 'A body' }],
            [keyB]: [{ id: 'archive-b', name: 'Archive B', content: 'B body' }]
        } });
        assert.throws(
            () => facade.getPortableArchiveIntegration(),
            error => error.code === 'FEATURE_INACTIVE'
        );
        await facade.init({ session: 'archive-a@example.test' });
        const integration = facade.getPortableArchiveIntegration();
        assert.deepEqual(Object.keys(integration), ['section', 'exportSection', 'contributor']);
        assert.equal(integration.section, 'recipes');
        assert.equal(Object.isFrozen(integration), true);
        assert.equal(Object.isFrozen(integration.contributor), true);
        assert.deepEqual(Object.keys(integration.contributor), ['snapshot', 'apply', 'rollback']);

        const exported = await integration.exportSection();
        assert.deepEqual(exported.map(record => record.id), ['archive-a']);
        exported[0].versions[0].title = 'caller mutation';
        assert.equal((await facade.recipes.get('archive-a')).title, 'Archive A');
        await assert.rejects(
            integration.exportSection({ signal: { aborted: false } }),
            error => error.code === 'INVALID_ABORT_SIGNAL'
        );
        const abortController = new AbortController();
        abortController.abort();
        await assert.rejects(
            integration.exportSection({ signal: abortController.signal }),
            error => error.code === 'RESTORE_ABORTED'
        );
        const snapshotContext = { section: 'recipes', plan: {}, actions: [], signal: null };
        const snapshot = await integration.contributor.snapshot(snapshotContext);
        snapshot.records[0].versions[0].title = 'snapshot mutation';
        assert.equal((await facade.recipes.get('archive-a')).title, 'Archive A');

        await facade.onUserChange('archive-b@example.test');
        await assert.rejects(integration.exportSection(), error => error.code === 'SESSION_CHANGED');
        await assert.rejects(
            integration.contributor.snapshot(snapshotContext),
            error => error.code === 'SESSION_CHANGED'
        );
        const second = facade.getPortableArchiveIntegration();
        assert.deepEqual((await second.exportSection()).map(record => record.id), ['archive-b']);
        await facade.destroy();
        await assert.rejects(second.exportSection(), error => error.code === 'FEATURE_INACTIVE');
        await assert.rejects(
            second.contributor.snapshot(snapshotContext),
            error => error.code === 'FEATURE_INACTIVE'
        );
        assert.throws(
            () => facade.getPortableArchiveIntegration(),
            error => error.code === 'FEATURE_INACTIVE'
        );
    });

    it('renders an accessible manager and preserves legacy packet/import/export entry points', async () => {
        const shellCalls = [];
        const { facade, document, adapter, inserted } = facadeHarness({
            capabilities: { shell: { openModule(id) { shellCalls.push(id); } } }
        });
        await facade.init({ session: 'ui@example.test' });
        const created = await facade.addPrompt('UI prompt', 'UI body', 'UI', 'ui');
        await facade.updatePrompt(created.provenance.sourceId, { content: 'UI body v2' });
        const pane = document.createElement('main');
        document.body.appendChild(pane);
        const section = await facade.renderToDetailsPane(pane);
        assert.equal(section.tagName, 'SECTION');
        assert.match(section.textContent, /Version 2/);
        assert.match(section.textContent, /Provenance/);
        assert.match(section.textContent, /Changed fields/);
        assert.equal(section.querySelectorAll('button').length >= 7, true);

        const io = facade._appendPromptIORow(pane);
        assert.equal(io.getAttribute('role'), 'group');
        assert.equal(await facade._insertSelectedPromptPacket(), false);
        facade._packetSelected.add(created.provenance.sourceId);
        assert.equal(facade._getSelectedPromptPacketItems().length, 1);
        assert.equal(await facade._insertSelectedPromptPacket(), true);
        assert.equal(facade._togglePromptPacketSelection(created.provenance.sourceId), false);
        assert.equal(facade._togglePromptPacketSelection(created.provenance.sourceId), true);
        assert.equal(facade._getTemplateVariables().model, 'gemini-2.5-pro');
        assert.equal(facade._insertTextIntoEditor('wrapper text'), true);
        assert.equal(inserted.at(-1), 'wrapper text');
        adapter.editor.value = 'clear me';
        assert.equal(facade._clearEditor(adapter.editor), adapter.editor);
        assert.equal(adapter.editor.value, '');
        const contentEditable = document.createElement('div');
        delete contentEditable.value;
        contentEditable.textContent = 'clear me';
        facade._clearEditor(contentEditable);
        assert.equal(contentEditable.textContent, '');
        facade._bindSlashExpansion();
        assert.equal(facade._queueCapability(), null);

        facade.injectNativeUI();
        const trigger = document.getElementById('gc-vault-native');
        trigger.click();
        assert.equal(trigger.getAttribute('aria-expanded'), 'true');
        const menu = document.getElementById('gc-vault-menu');
        assert.equal(menu.getAttribute('role'), 'menu');
        menu.querySelectorAll('button')[0].click();
        await tick();
        trigger.click();
        const manage = document.getElementById('gc-vault-menu').querySelectorAll('button').at(-1);
        manage.click();
        assert.deepEqual(shellCalls, ['prompt-vault']);
        facade.configureCapabilities({ shell: null });
        trigger.click();
        document.getElementById('gc-vault-menu').querySelectorAll('button').at(-1).click();
        assert.equal(pane.focused, 1);
        facade._toggleQuickMenu(trigger);
        facade._toggleQuickMenu(trigger);
        trigger.click();
        trigger.click();
        assert.equal(trigger.getAttribute('aria-expanded'), 'false');
        facade.removeNativeUI();
        facade.removeNativeUI();

        const exported = await facade.exportData();
        assert.equal(exported.format, 'primer-pp.recipes');
        const imported = await facade.importData({
            schema: 'primer-pp.prompt-vault', version: 1,
            prompts: [{ id: 'legacy-import', name: 'Imported', content: 'Imported body' }]
        });
        assert.deepEqual(imported, { strategy: 'legacy', imported: 1 });
        await facade._exportPrompts();
        assert.equal(facade.URL.created.length, 1);
        assert.deepEqual(facade.URL.revoked, ['blob:recipes']);
        await facade.destroy();
    });

    it('routes manager actions through the compatibility API and closes tracked editors cleanly', async () => {
        const { facade, document, inserted } = facadeHarness();
        assert.equal(facade._mountedPane, null);
        assert.equal(facade._dialogs.size, 0);
        await facade.init({ session: 'actions@example.test' });
        const created = await facade.addPrompt('Managed', 'Managed body', 'General', 'managed');
        const pane = document.createElement('main');
        document.body.appendChild(pane);
        await facade.renderToDetailsPane(pane);
        assert.equal(facade._mountedPane, pane);
        const editButton = pane.querySelectorAll('button').find(button => button.textContent === 'Edit');
        editButton.click();
        await tick();
        assert.equal(facade._dialogs.size, 1);
        facade._closeDialogs('test');

        const directEditor = facade.showPromptEditor(null);
        directEditor.close('test');
        const trackedDialog = { close() {} };
        assert.equal(facade._trackDialog(trackedDialog), trackedDialog);
        facade._dialogs.delete(trackedDialog);

        const createDialog = await facade._handleManagerAction({ type: 'create' });
        let fields = createDialog.dialog.querySelectorAll('input,textarea');
        fields.find(field => field.name === 'name').value = 'Created from manager';
        fields.find(field => field.name === 'content').value = 'Created body for {{audience}}';
        createDialog.dialog.querySelectorAll('button').find(button => button.textContent === 'Add variable').click();
        fields = createDialog.dialog.querySelectorAll('input,textarea');
        fields.find(field => field.name === 'variableName').value = 'audience';
        fields.find(field => field.name === 'variableLabel').value = 'Audience';
        fields.find(field => field.name === 'variableRequired').checked = true;
        createDialog.dialog.querySelector('button[type="submit"]').click();
        await tick();
        assert.equal(facade._prompts.some(prompt => prompt.name === 'Created from manager'), true);
        const createdFromManager = (await facade.recipes.list()).find(recipe => recipe.title === 'Created from manager');
        assert.deepEqual(createdFromManager.variables.map(variable => variable.name), ['audience']);

        const editDialog = await facade._handleManagerAction({ type: 'edit', id: created.id });
        fields = editDialog.dialog.querySelectorAll('input,textarea');
        fields.find(field => field.name === 'content').value = 'Managed body v2';
        editDialog.dialog.querySelector('button[type="submit"]').click();
        await tick();
        assert.equal((await facade.recipes.get(created.id)).version, 2);
        const variableEdit = await facade._handleManagerAction({ type: 'edit', id: createdFromManager.id });
        const variableName = variableEdit.dialog.querySelectorAll('input').find(field => field.name === 'variableName');
        assert.equal(variableName.value, 'audience');
        variableEdit.dialog.querySelectorAll('input,textarea').find(field => field.name === 'content').value =
            'Updated for {{audience}}';
        variableEdit.dialog.querySelector('button[type="submit"]').click();
        await tick();
        assert.equal((await facade.recipes.get(createdFromManager.id)).version, 2);

        assert.equal(await facade._handleManagerAction({ type: 'insert', id: created.id }), true);
        assert.match(inserted.at(-1), /Managed body v2/);
        assert.equal(await facade._handleManagerAction({ type: 'queue-preview', id: created.id }), false);
        assert.equal(await facade._handleManagerAction({ type: 'unknown', id: created.id }), undefined);
        const picker = await facade._handleManagerAction({ type: 'import' });
        assert.equal(picker, undefined);
        await facade._handleManagerAction({ type: 'export' });

        await facade.recipes.create(recipeDraft({ id: 'domain-only', provenance: { source: 'test' } }));
        const fallbackEditor = await facade._handleManagerAction({ type: 'edit', id: 'domain-only' });
        assert.match(fallbackEditor.dialog.textContent, /Edit Prompt/);
        fallbackEditor.close('test');
        assert.equal(await facade._handleManagerAction({ type: 'delete', id: created.id }), true);
        await facade.destroy();
    });
});

describe('Accessible Recipes UI primitives', () => {
    it('authors every variable type and reports invalid variable definitions before save', () => {
        const document = new FakeDocument();
        const container = document.createElement('main');
        const editor = recipes.createLegacyVariableEditor({
            document,
            container,
            variables: [
                { name: 'flag', type: 'boolean', required: true, default: false },
                { name: 'count', type: 'number', default: 3 },
                { name: 'title', type: 'text', default: 'Hello' },
                { name: 'tone', type: 'choice', options: ['brief', 'full'], default: 'brief' }
            ]
        });
        assert.match(container.textContent, /Template variables/);
        assert.deepEqual(editor.read().map(variable => variable.default), [false, 3, 'Hello', 'brief']);

        const types = container.querySelectorAll('select');
        const defaults = container.querySelectorAll('input').filter(input => input.name === 'variableDefault');
        types[2].value = 'boolean';
        defaults[2].value = 'true';
        types[2].dispatchEvent(new FakeEvent('change'));
        assert.equal(defaults[2].type, 'checkbox');
        assert.equal(defaults[2].checked, true);
        types[2].value = 'number';
        types[2].dispatchEvent(new FakeEvent('change'));
        assert.equal(defaults[2].type, 'number');
        types[2].value = 'text';
        types[2].dispatchEvent(new FakeEvent('change'));
        assert.equal(defaults[2].type, 'text');

        const invalidNumber = recipes.createLegacyVariableEditor({ document, container, variables: [
            { name: 'count', type: 'number', default: 1 }
        ] });
        invalidNumber.read();
        const numberControls = container.querySelectorAll('input').slice(-7);
        numberControls.find(input => input.name === 'variableDefault').value = 'not-a-number';
        assert.throws(() => invalidNumber.read(), /finite numbers/);

        const invalidChoice = recipes.createLegacyVariableEditor({ document, container, variables: [
            { name: 'mode', type: 'choice', options: ['a'], default: 'a' }
        ] });
        const choiceInputs = container.querySelectorAll('input').slice(-7);
        choiceInputs.find(input => input.name === 'variableDefault').value = 'b';
        assert.throws(() => invalidChoice.read(), /declared option/);
        choiceInputs.find(input => input.name === 'variableHasDefault').checked = false;
        choiceInputs.find(input => input.name === 'variableOptions').value = '';
        assert.throws(() => invalidChoice.read(), /requires options/);

        const invalidNames = recipes.createLegacyVariableEditor({ document, container });
        invalidNames.add({});
        assert.throws(() => invalidNames.read(), /\(empty\)/);
        const nameInput = container.querySelectorAll('input').at(-7);
        nameInput.value = 'same';
        invalidNames.add({ name: 'same', type: 'text' });
        assert.throws(() => invalidNames.read(), /unique/);
        const remove = container.querySelectorAll('button').filter(button => button.textContent === 'Remove variable').at(-1);
        remove.click();
        remove.click();
        assert.equal(invalidNames.read().length, 1);
    });

    it('renders empty and full semantic managers and dispatches real-button actions', () => {
        const document = new FakeDocument();
        const container = document.createElement('main');
        assert.throws(() => recipes.renderRecipesManager(), /document/);
        assert.throws(() => recipes.renderRecipesManager({ document, container: {} }), /container/);
        assert.throws(() => recipes.renderRecipesManager({ document, container, items: {}, onAction() {} }), /items/);
        assert.throws(() => recipes.renderRecipesManager({ document, container, onAction: null }), /onAction/);
        const actions = [];
        recipes.renderRecipesManager({ document, container, items: [], onAction: action => actions.push(action), t: (_z, e) => e });
        assert.match(container.textContent, /No recipes yet/);
        container.querySelectorAll('button')[0].click();
        assert.deepEqual(actions, [{ type: 'create' }]);

        const version = {
            ...recipeDraft(), version: 2,
            variables: [
                { name: 'topic', type: 'text', required: true },
                { name: 'optional', type: 'text', required: false }
            ],
            createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
            permissions: ['composer.insert'], provenance: {
                source: 'test', sourceId: 'old', importedAt: '2026-08-01T00:00:00.000Z',
                forkedFrom: { recipeId: 'parent', version: 1 }, parent: { recipeId: 'recipe-one', version: 1 }
            }
        };
        recipes.renderRecipesManager({
            document, container,
            items: [{ recipe: version, history: [version, { ...version, version: 1 }], diff: {
                changed: true, changes: [
                    { field: 'title', before: 'Old', after: 'New' },
                    { field: 'variables', before: [], after: version.variables },
                    { field: 'steps', before: [], after: version.steps },
                    { field: 'description', before: '', after: undefined },
                    { field: 'provenance', before: {}, after: version.provenance },
                    { field: 'permissions', before: [], after: { explicit: true } }
                ]
            } }],
            onAction: action => actions.push(action), t: (_z, e) => e
        });
        assert.match(container.textContent, /Variables/);
        assert.match(container.textContent, /Ordered steps/);
        assert.match(container.textContent, /Imported/);
        assert.match(container.textContent, /Forked from/);
        assert.match(container.textContent, /Parent version/);
        assert.match(container.textContent, /Old → New/);
        assert.match(container.textContent, /topic:text/);
        assert.match(container.textContent, /step-1: Explain \{\{topic\}\}/);
        assert.match(container.textContent, /unknown → test · parent recipe-one@v1 · fork parent@v1/);
        assert.match(container.textContent, /\[\] → \{"explicit":true\}/);
        container.querySelectorAll('button').at(-1).click();
        assert.equal(actions.at(-1).type, 'delete');
    });

    it('uses modal semantics for variables, queue permission review, and versioned editing', () => {
        const document = new FakeDocument();
        const ui = createDialogUi(document);
        const submitted = [];
        const recipe = recipeDraft({
            variables: [
                { name: 'text', type: 'text', required: true, default: 'default text' },
                { name: 'number', type: 'number', required: false, default: 3 },
                { name: 'flag', type: 'boolean', required: false, default: false },
                { name: 'choice', type: 'choice', options: ['a', 'b'], required: false }
            ]
        });
        assert.throws(() => recipes.openRecipeVariablesDialog(), /recipe/);
        assert.throws(() => recipes.openRecipeVariablesDialog({ document, recipe, onSubmit: null }), /onSubmit/);
        assert.throws(() => recipes.openRecipeVariablesDialog({
            document, ui: null, recipe, onSubmit() {}
        }), /shared NativeUI/);
        assert.throws(() => recipes.openRecipeVariablesDialog({
            document, ui: {}, recipe, onSubmit() {}
        }), /shared NativeUI/);
        const variableDialog = recipes.openRecipeVariablesDialog({
            document, ui, recipe, initialValues: { text: 'seed', flag: true, choice: 'b' },
            onSubmit: values => submitted.push(values), t: (_z, e) => e
        });
        assert.equal(variableDialog.dialog.getAttribute('role'), 'dialog');
        assert.equal(variableDialog.dialog.getAttribute('aria-modal'), 'true');
        const controls = variableDialog.dialog.querySelectorAll('input,select');
        controls.find(control => control.name === 'number').value = '7';
        variableDialog.dialog.querySelector('button[type="submit"]').click();
        assert.deepEqual(submitted[0], { text: 'seed', number: 7, flag: true, choice: 'b' });
        assert.equal(variableDialog.open, false);
        assert.equal(variableDialog.close('again'), false);

        assert.throws(() => recipes.openQueuePermissionPreview({ document, plan: {}, onConfirm() {} }), /non-sending/);
        assert.throws(() => recipes.openQueuePermissionPreview({
            document, plan: { autoSend: false, steps: [], permissions: [] }, onConfirm: null
        }), /onConfirm/);
        let confirmed = 0;
        const preview = recipes.openQueuePermissionPreview({
            document,
            ui,
            plan: { autoSend: false, permissions: ['composer.insert', 'conversation.send'], steps: [{ title: 'One' }] },
            onConfirm() { confirmed += 1; }, t: (_z, e) => e
        });
        preview.dialog.querySelectorAll('button').at(-1).click();
        assert.equal(confirmed, 1);

        assert.throws(() => recipes.openLegacyRecipeEditor({ document }), /onSave/);
        const saves = [];
        const editor = recipes.openLegacyRecipeEditor({ document, ui, onSave: value => saves.push(value), t: (_z, e) => e });
        editor.dialog.querySelector('button[type="submit"]').click();
        assert.equal(saves.length, 0);
        const fields = editor.dialog.querySelectorAll('input,textarea');
        fields.find(field => field.name === 'name').value = 'Created';
        fields.find(field => field.name === 'content').value = 'First';
        fields.find(field => field.name === 'chainSteps').value = 'Second\n---\nThird';
        editor.dialog.querySelector('button[type="submit"]').click();
        assert.deepEqual(saves[0].chainSteps, ['Second', 'Third']);
        assert.deepEqual(saves[0].recipeVariables, []);

        const typed = recipes.openLegacyRecipeEditor({ document, ui, onSave: value => saves.push(value), t: (_z, e) => e });
        let typedFields = typed.dialog.querySelectorAll('input,textarea,select');
        typedFields.find(field => field.name === 'name').value = 'Typed';
        typedFields.find(field => field.name === 'content').value = 'Hello {{tone}}';
        typed.dialog.querySelectorAll('button').find(item => item.textContent === 'Add variable').click();
        typedFields = typed.dialog.querySelectorAll('input,textarea,select');
        typedFields.find(field => field.name === 'variableName').value = 'tone';
        typedFields.find(field => field.name === 'variableLabel').value = 'Tone';
        typedFields.find(field => field.name === 'variableDescription').value = 'Writing tone';
        const type = typedFields.find(field => field.name === 'variableType');
        type.value = 'choice';
        type.dispatchEvent(new FakeEvent('change'));
        typedFields.find(field => field.name === 'variableOptions').value = 'brief, detailed, brief';
        typedFields.find(field => field.name === 'variableHasDefault').checked = true;
        typedFields.find(field => field.name === 'variableDefault').value = 'brief';
        typed.dialog.querySelector('button[type="submit"]').click();
        assert.deepEqual(saves.at(-1).recipeVariables, [{
            name: 'tone', type: 'choice', label: 'Tone', description: 'Writing tone', required: false,
            default: 'brief', options: ['brief', 'detailed']
        }]);

        const invalid = recipes.openLegacyRecipeEditor({ document, ui, onSave: value => saves.push(value), t: (_z, e) => e });
        let invalidFields = invalid.dialog.querySelectorAll('input,textarea,select');
        invalidFields.find(field => field.name === 'name').value = 'Invalid';
        invalidFields.find(field => field.name === 'content').value = 'Body';
        invalid.dialog.querySelectorAll('button').find(item => item.textContent === 'Add variable').click();
        invalidFields = invalid.dialog.querySelectorAll('input,textarea,select');
        invalidFields.find(field => field.name === 'variableName').value = 'bad-name';
        invalid.dialog.querySelector('button[type="submit"]').click();
        assert.match(invalid.dialog.querySelector('[role="alert"]').textContent, /Invalid variable name/);
        assert.equal(invalid.open, true);
        invalid.dialog.querySelectorAll('button').find(item => item.textContent === 'Remove variable').click();
        invalid.dialog.querySelector('button[type="submit"]').click();
        assert.equal(invalid.open, false);

        const existing = recipes.openLegacyRecipeEditor({
            document,
            ui,
            existing: { name: 'Existing', category: 'Work', shortcut: 'x', content: 'Body', chainSteps: ['Next'] },
            onSave: value => saves.push(value), t: (_z, e) => e
        });
        assert.match(existing.dialog.textContent, /Edit Prompt/);
        document.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
        assert.equal(existing.open, false);

        const backdrop = recipes.openLegacyRecipeEditor({ document, ui, onSave() {}, t: (_z, e) => e });
        backdrop.overlay.dispatchEvent(new FakeEvent('click', { target: backdrop.overlay }));
        assert.equal(backdrop.open, false);
        const buttonClose = recipes.openLegacyRecipeEditor({
            document, mount: document.body, ui, onSave() {}, t: (_z, e) => e
        });
        buttonClose.dialog.querySelectorAll('button')[0].click();
        assert.equal(buttonClose.open, false);
        assert.throws(() => recipes.openLegacyRecipeEditor({ document, mount: {}, onSave() {} }), /mount/);
    });
});

describe('Controller helpers and transfer boundary', () => {
    it('combines steps and creates queue records without execution authority', () => {
        assert.equal(recipes.combineRecipePlanSteps({ steps: [] }), '');
        assert.equal(recipes.combineRecipePlanSteps({ steps: [{ prompt: 'one' }] }), 'one');
        assert.equal(recipes.combineRecipePlanSteps({ steps: [{ prompt: 'one' }, { prompt: 'two' }] }),
            'Step 1\none\n\n---\n\nStep 2\ntwo');
        assert.deepEqual(recipes.recipePlanQueueEntries({ recipeId: 'r', steps: [{ title: 'One', prompt: 'x' }] }), [{
            title: 'One', text: 'x', promptId: 'r', stepIndex: 1, totalSteps: 1
        }]);
        assert.equal(recipes.recipePlanQueueEntries({
            recipeId: 'r', steps: [{ title: 'Step', prompt: 'x' }, { title: 'Step', prompt: 'y' }]
        })[1].title, 'Step 2/2');
    });

    it('handles adapter failures and every safe draft insertion fallback without submitting', async () => {
        const document = new FakeDocument();
        const toasts = [];
        const base = {
            document,
            window: { Event: FakeEvent, InputEvent: FakeEvent, getSelection() { throw new Error('selection'); } },
            adapter: {
                getInputEditor() { return null; },
                getChatTitleText() { throw new Error('title'); },
                detectModelKey() { throw new Error('model'); }
            },
            t: (_z, en) => en,
            timestamp: () => '2026-08-01T00:00:00.000Z',
            service: () => ({ api: {
                get: async () => recipeDraft({ variables: [] }),
                render: async () => ({ autoSend: true, steps: [] })
            } }),
            capabilities: () => ({}),
            prompts: () => [],
            packetSelection: () => new Set(),
            mountedPane: () => null,
            recipeIdForPrompt: async id => id,
            markUsed: async () => {},
            toast: message => toasts.push(message),
            trackDialog() {}, releaseDialog() {}
        };
        const controller = recipes.createLegacyRecipeComposerController(base);
        assert.equal(controller.templateVariables().chat_title, 'Current Gemini chat');
        document.title = '';
        assert.equal(controller.templateVariables().chat_title, '');
        document.title = 'Current Gemini chat';
        const missingTitle = recipes.createLegacyRecipeComposerController({
            ...base, adapter: {}, window: {}, document: new FakeDocument()
        });
        assert.equal(missingTitle.templateVariables().chat_title, 'Current Gemini chat');
        missingTitle.dependencies.document.title = '';
        assert.equal(missingTitle.templateVariables().chat_title, '');
        assert.equal(controller.insertText('missing'), false);
        assert.equal(toasts.at(-1), 'Gemini input box not found');
        await assert.rejects(controller.insertPrompt('x', 'recipe-one'), /never auto-send/);
        assert.equal(await controller.insertPrompt(undefined), false);
        assert.equal(await controller.insertSelectedPromptPacket(), false);

        const acceptedEditor = document.createElement('textarea');
        acceptedEditor.addEventListener('beforeinput', event => { acceptedEditor.value += event.data; });
        const accepted = recipes.createLegacyRecipeComposerController({
            ...base, adapter: { getInputEditor: () => acceptedEditor },
            capabilities: () => ({ composer: { insertDraft() { return false; } } })
        });
        assert.equal(accepted.insertText('blocked'), false);
        accepted.dependencies.capabilities = () => ({});
        assert.equal(accepted.insertText('accepted'), true);
        assert.equal(acceptedEditor.value, 'accepted');

        const contentEditable = document.createElement('div');
        delete contentEditable.value;
        const oldEvent = globalThis.Event;
        const oldInputEvent = globalThis.InputEvent;
        Object.defineProperty(globalThis, 'Event', { configurable: true, value: undefined });
        Object.defineProperty(globalThis, 'InputEvent', { configurable: true, value: undefined });
        const contentController = recipes.createLegacyRecipeComposerController({
            ...base, window: {}, adapter: { getInputEditor: () => contentEditable }
        });
        assert.equal(contentController.insertText('paragraph'), true);
        assert.equal(contentEditable.querySelector('p').textContent, 'paragraph');
        Object.defineProperty(globalThis, 'Event', { configurable: true, value: oldEvent });
        if (oldInputEvent === undefined) delete globalThis.InputEvent;
        else Object.defineProperty(globalThis, 'InputEvent', { configurable: true, value: oldInputEvent });

        const selectionEditor = document.createElement('textarea');
        selectionEditor.value = 'ab';
        selectionEditor.selectionStart = null;
        selectionEditor.selectionEnd = null;
        const selectionController = recipes.createLegacyRecipeComposerController({
            ...base, window: { Event: FakeEvent }, adapter: { getInputEditor: () => selectionEditor }
        });
        assert.equal(selectionController.insertText('c'), true);
        assert.equal(selectionEditor.value, 'abc');
    });

    it('covers quick-menu, mounted-pane, toast, and slash-expansion fallback routes', async () => {
        const document = new FakeDocument();
        const editor = document.createElement('div');
        delete editor.value;
        const trailing = document.createElement('div');
        document.body.append(editor, trailing);
        let activeEditor = null;
        const toasts = [];
        const inserted = [];
        const pane = document.createElement('main');
        const prompt = { id: 'cn', name: '!!!', content: '正文', category: 'General', shortcut: '' };
        const slashPrompt = { id: 'slash', name: 'Slash', content: '展开', category: 'General', shortcut: 'x' };
        const dependencies = {
            document,
            window: { Event: FakeEvent, InputEvent: FakeEvent },
            adapter: {
                getInputEditor() { return activeEditor; },
                getInputTrailingActions() { return trailing; }
            },
            t: (_z, en) => en,
            timestamp: () => '2026-08-01T00:00:00.000Z',
            service: () => ({ api: {
                get: async () => recipeDraft({ id: 'cn', variables: [] }),
                render: async () => ({ autoSend: false, recipeId: 'cn', steps: [{ title: 'One', prompt: '正文' }] })
            } }),
            capabilities: () => ({ composer: { insertDraft(text) { inserted.push(text); return true; } } }),
            prompts: () => [prompt, slashPrompt],
            packetSelection: () => new Set(),
            mountedPane: () => pane,
            recipeIdForPrompt: async () => 'cn',
            markUsed: async () => {},
            toast: message => toasts.push(message),
            trackDialog() {}, releaseDialog() {}
        };
        const controller = recipes.createLegacyRecipeComposerController(dependencies);
        controller.bindSlashExpansion();
        controller.injectNativeUI();
        assert.equal(editor.listenerCount('keydown'), 0);
        const trigger = document.getElementById('gc-vault-native');
        trigger.click();
        document.getElementById('gc-vault-menu').querySelectorAll('button')[0].click();
        await tick();
        assert.deepEqual(inserted, ['正文']);

        trigger.click();
        document.getElementById('gc-vault-menu').querySelectorAll('button').at(-1).click();
        assert.equal(pane.focused, 1);
        dependencies.mountedPane = () => null;
        trigger.click();
        document.getElementById('gc-vault-menu').querySelectorAll('button').at(-1).click();
        assert.match(toasts.at(-1), /details panel/);
        trigger.click();
        controller.toggleQuickMenu(trigger);
        assert.equal(trigger.getAttribute('aria-expanded'), 'false');

        activeEditor = editor;
        controller.bindSlashExpansion();
        controller.bindSlashExpansion();
        editor.dispatchEvent(new FakeEvent('keydown', { key: 'Enter' }));
        editor.dispatchEvent(new FakeEvent('keydown', { key: 'Tab' }));
        editor.textContent = '/missing';
        editor.dispatchEvent(new FakeEvent('keydown', { key: 'Tab' }));
        editor.textContent = '/';
        editor.dispatchEvent(new FakeEvent('keydown', { key: 'Tab', shiftKey: true }));
        const secondEditor = document.createElement('div');
        delete secondEditor.value;
        secondEditor.textContent = '/x';
        activeEditor = secondEditor;
        controller.bindSlashExpansion();
        secondEditor.dispatchEvent(new FakeEvent('keydown', { key: 'Tab' }));
        await tick();
        assert.equal(secondEditor.textContent, '');
        trigger.click();
        controller.removeNativeUI();

        const noTrailing = recipes.createLegacyRecipeComposerController({
            ...dependencies,
            adapter: { getInputEditor: () => null, getInputTrailingActions: () => null }
        });
        noTrailing.injectNativeUI();
    });

    it('supports portable fork import and file-picker success/failure/no-file paths', async () => {
        const { facade, document } = facadeHarness();
        await facade.init({ session: 'transfer@example.test' });
        await facade.recipes.create(recipeDraft());
        const envelope = await facade.exportData();
        const report = await facade.importData(envelope);
        assert.deepEqual(report.forked, [{ fromId: 'recipe-one', toId: 'p_test_1' }]);

        FakeReader.result = JSON.stringify({
            schema: 'primer-pp.prompt-vault', version: 1,
            prompts: [{ id: 'from-file', name: 'From file', content: 'File body' }]
        });
        facade._importPrompts();
        let picker = document.created.filter(element => element.type === 'file').at(-1);
        picker.dispatchEvent(new FakeEvent('change', { target: picker }));
        picker.files = [{}];
        picker.dispatchEvent(new FakeEvent('change', { target: picker }));
        await tick();
        assert.equal(facade._prompts.some(prompt => prompt.name === 'From file'), true);

        FakeReader.result = '{bad';
        facade._importPrompts();
        picker = document.created.filter(element => element.type === 'file').at(-1);
        picker.files = [{}];
        picker.dispatchEvent(new FakeEvent('change', { target: picker }));
        await tick();
        assert.match(document.getElementById('primer-recipes-live').textContent, /Import failed/);
        await facade.destroy();
    });
});
