const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { pathToFileURL } = require('node:url');

const polyfillPath = path.join(
    __dirname,
    '..',
    'src',
    'platforms',
    'extension',
    'gm_polyfill.js'
);
const polyfillUrl = pathToFileURL(polyfillPath).href;
const contentUrl = pathToFileURL(path.join(
    __dirname,
    '..',
    'src',
    'platforms',
    'extension',
    'content.js'
)).href;
const backgroundUrl = pathToFileURL(path.join(
    __dirname,
    '..',
    'src',
    'platforms',
    'extension',
    'background.js'
)).href;
const manifestPath = path.join(
    __dirname,
    '..',
    'src',
    'platforms',
    'extension',
    'manifest.json'
);
let moduleSequence = 0;
const nativeStructuredClone = globalThis.structuredClone;

const managedGlobals = [
    'chrome', 'document', 'structuredClone',
    '__initGMPolyfill', '__flushGMPolyfill',
    'GM_getValue', 'GM_setValue', 'GM_listValues',
    'GM_addValueChangeListener', 'GM_removeValueChangeListener',
    'GM_addStyle', 'GM_registerMenuCommand',
    'GM_notification', 'GM_download', 'GM_xmlhttpRequest', 'GM_openInTab',
];
const originalGlobalDescriptors = new Map(managedGlobals.map(key => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
]));

function restoreManagedGlobals() {
    for (const [key, descriptor] of originalGlobalDescriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
    }
}

test.afterEach(() => restoreManagedGlobals());

function clone(value) {
    return value === undefined ? undefined : nativeStructuredClone(value);
}

function createChromeMock(initial = {}, options = {}) {
    const listeners = new Set();
    const state = clone(initial);
    const setCalls = [];
    let getCalls = 0;
    let addListenerCalls = 0;

    const emit = (changes, area = 'local') => {
        for (const listener of listeners) listener(clone(changes), area);
    };

    const local = {
        async get(key) {
            getCalls += 1;
            if (options.get) return options.get(key, state);
            return clone(state);
        },

        async set(update) {
            setCalls.push(clone(update));
            if (options.beforeSet) await options.beforeSet(update, setCalls.length);
            if (options.setError) throw options.setError;

            const changes = {};
            for (const [key, value] of Object.entries(update)) {
                const oldValue = clone(state[key]);
                const newValue = clone(value);
                state[key] = newValue;
                if (!isDeepStrictEqual(oldValue, newValue)) {
                    changes[key] = { oldValue, newValue: clone(newValue) };
                }
            }
            if (Object.keys(changes).length > 0) emit(changes);
        },
    };

    return {
        chrome: {
            storage: {
                local,
                onChanged: {
                    addListener(listener) {
                        addListenerCalls += 1;
                        listeners.add(listener);
                    },
                    removeListener(listener) {
                        listeners.delete(listener);
                    },
                },
            },
        },
        emit,
        state,
        setCalls,
        get getCalls() { return getCalls; },
        get addListenerCalls() { return addListenerCalls; },
    };
}

async function loadPolyfill(mock) {
    globalThis.chrome = mock.chrome;
    moduleSequence += 1;
    return import(`${polyfillUrl}?test=${moduleSequence}`);
}

async function importFresh(url, label) {
    moduleSequence += 1;
    return import(`${url}?${label}=${moduleSequence}`);
}

test('initialization preloads storage once and reads return detached snapshots', async () => {
    const mock = createChromeMock({
        settings: { nested: { enabled: true } },
    });
    const gm = await loadPolyfill(mock);

    const firstInit = gm.__initGMPolyfill();
    const secondInit = gm.__initGMPolyfill();
    assert.strictEqual(firstInit, secondInit);
    await firstInit;

    assert.equal(mock.getCalls, 1);
    assert.equal(mock.addListenerCalls, 1);
    assert.deepEqual(gm.GM_listValues(), ['settings']);

    const firstRead = gm.GM_getValue('settings');
    firstRead.nested.enabled = false;
    assert.deepEqual(gm.GM_getValue('settings'), {
        nested: { enabled: true },
    });

    const fallback = { nested: { value: 1 } };
    const fallbackRead = gm.GM_getValue('missing', fallback);
    fallbackRead.nested.value = 2;
    assert.equal(fallback.nested.value, 1);
});

test('changes arriving during preload are replayed after the snapshot', async () => {
    let releaseGet;
    const getGate = new Promise((resolve) => { releaseGet = resolve; });
    const mock = createChromeMock({}, {
        async get() {
            await getGate;
            return { theme: 'old' };
        },
    });
    const gm = await loadPolyfill(mock);
    const events = [];
    gm.GM_addValueChangeListener('theme', (...args) => events.push(args));

    const init = gm.__initGMPolyfill();
    mock.emit({ theme: { oldValue: 'old', newValue: 'new' } });
    releaseGet();
    await init;

    assert.equal(gm.GM_getValue('theme'), 'new');
    assert.deepEqual(events, [['theme', 'old', 'new', true]]);
});

test('initialization failure can retry without duplicating the storage listener', async () => {
    let attempts = 0;
    const mock = createChromeMock({}, {
        async get() {
            attempts += 1;
            if (attempts === 1) throw new Error('preload failed');
            return { recovered: { value: 2 } };
        },
    });
    const gm = await loadPolyfill(mock);

    await assert.rejects(gm.__initGMPolyfill(), /preload failed/);
    assert.equal(mock.addListenerCalls, 1);

    // Populate the optimistic cache between attempts. The successful preload
    // must clear this stale entry before installing the recovered snapshot.
    await gm.GM_setValue('stale', { value: 1 });
    await gm.__initGMPolyfill();
    assert.equal(mock.addListenerCalls, 1);
    assert.deepEqual(gm.GM_listValues(), ['recovered']);
    assert.deepEqual(gm.GM_getValue('recovered'), { value: 2 });
});

test('a null preload is treated as an empty storage snapshot', async () => {
    const mock = createChromeMock({}, { get: async () => null });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();
    assert.deepEqual(gm.GM_listValues(), []);
});

test('JSON fallback still isolates supported extension-storage values', async () => {
    const mock = createChromeMock({ nested: { list: [1, 2] } });
    globalThis.structuredClone = undefined;
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();

    const value = gm.GM_getValue('nested');
    value.list.push(3);
    assert.deepEqual(gm.GM_getValue('nested'), { list: [1, 2] });
    await gm.GM_setValue('nested', { list: [4] });
    assert.deepEqual(mock.state.nested, { list: [4] });
});

test('writes are cloned, serialized, immediately readable, and flush waits', async () => {
    let releaseFirstWrite;
    const firstWriteGate = new Promise((resolve) => { releaseFirstWrite = resolve; });
    const mock = createChromeMock({}, {
        async beforeSet(_update, callNumber) {
            if (callNumber === 1) await firstWriteGate;
        },
    });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();

    const firstValue = { order: 1, nested: { stable: true } };
    const firstWrite = gm.GM_setValue('queue', firstValue);
    const secondWrite = gm.GM_setValue('queue', { order: 2 });
    firstValue.nested.stable = false;

    assert.ok(firstWrite instanceof Promise);
    assert.deepEqual(gm.GM_getValue('queue'), { order: 2 });

    await Promise.resolve();
    assert.equal(mock.setCalls.length, 1);
    assert.deepEqual(mock.setCalls[0], {
        queue: { order: 1, nested: { stable: true } },
    });

    let flushed = false;
    const flush = gm.__flushGMPolyfill().then(() => { flushed = true; });
    await Promise.resolve();
    assert.equal(flushed, false);

    releaseFirstWrite();
    await Promise.all([firstWrite, secondWrite, flush]);
    assert.equal(mock.setCalls.length, 2);
    assert.deepEqual(mock.state.queue, { order: 2 });
});

test('local writes and their cloned storage echo notify once; remote changes notify once', async () => {
    const mock = createChromeMock({ settings: { count: 0 } });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();

    const firstListenerEvents = [];
    const secondListenerEvents = [];
    const firstId = gm.GM_addValueChangeListener('settings', (_key, _oldValue, newValue, remote) => {
        firstListenerEvents.push({ newValue: clone(newValue), remote });
        newValue.count = 999;
    });
    const secondId = gm.GM_addValueChangeListener('settings', (_key, _oldValue, newValue, remote) => {
        secondListenerEvents.push({ newValue, remote });
    });

    await gm.GM_setValue('settings', { count: 1 });
    await gm.__flushGMPolyfill();

    assert.deepEqual(firstListenerEvents, [
        { newValue: { count: 1 }, remote: false },
    ]);
    assert.deepEqual(secondListenerEvents, [
        { newValue: { count: 1 }, remote: false },
    ]);
    assert.deepEqual(gm.GM_getValue('settings'), { count: 1 });

    gm.GM_removeValueChangeListener(firstId);
    mock.emit({
        settings: {
            oldValue: { count: 1 },
            newValue: { count: 2 },
        },
    });

    assert.equal(firstListenerEvents.length, 1);
    assert.deepEqual(secondListenerEvents[1], {
        newValue: { count: 2 },
        remote: true,
    });
    assert.deepEqual(gm.GM_getValue('settings'), { count: 2 });
    gm.GM_removeValueChangeListener(secondId);
    gm.GM_removeValueChangeListener(secondId);
    mock.emit({ settings: { oldValue: { count: 2 }, newValue: { count: 3 } } });
    assert.equal(secondListenerEvents.length, 2);
    assert.throws(
        () => gm.GM_addValueChangeListener('settings', null),
        /callback must be a function/
    );
});

test('listener filtering, listener failures, and non-local storage areas are isolated', async () => {
    const mock = createChromeMock({ target: 0 });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();

    const events = [];
    gm.GM_addValueChangeListener('other', () => events.push('wrong-key'));
    gm.GM_addValueChangeListener('target', () => { throw new Error('listener failed'); });
    gm.GM_addValueChangeListener('target', (_key, _old, value, remote) => {
        events.push({ value, remote });
    });

    await gm.GM_setValue('target', 1);
    mock.emit({ target: { oldValue: 1, newValue: 2 } }, 'sync');

    assert.deepEqual(events, [{ value: 1, remote: false }]);
    assert.equal(gm.GM_getValue('target'), 1);
});

test('an unmatched remote event is not mistaken for a pending local array write', async () => {
    let releaseWrite;
    const gate = new Promise(resolve => { releaseWrite = resolve; });
    const mock = createChromeMock({ list: null }, {
        async beforeSet() { await gate; },
    });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();
    const events = [];
    gm.GM_addValueChangeListener('list', (_key, oldValue, newValue, remote) => {
        events.push({ oldValue, newValue, remote });
    });

    const write = gm.GM_setValue('list', [1, 2]);
    await Promise.resolve();
    mock.emit({ list: { oldValue: null, newValue: { remote: true } } });
    mock.emit({ list: { oldValue: null, newValue: [1] } });
    mock.emit({ list: { oldValue: { remoteOld: true }, newValue: [1, 2] } });

    assert.deepEqual(events.slice(0, 4), [
        { oldValue: null, newValue: [1, 2], remote: false },
        { oldValue: null, newValue: { remote: true }, remote: true },
        { oldValue: null, newValue: [1], remote: true },
        { oldValue: { remoteOld: true }, newValue: [1, 2], remote: true },
    ]);

    releaseWrite();
    await write;
    await gm.__flushGMPolyfill();
    assert.deepEqual(gm.GM_getValue('list'), [1, 2]);
});

test('an interleaved remote same-key write rebases the pending local echo marker', async () => {
    let releaseWrite;
    const gate = new Promise(resolve => { releaseWrite = resolve; });
    const mock = createChromeMock({ race: 'base' }, {
        async beforeSet() { await gate; },
    });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();
    const events = [];
    gm.GM_addValueChangeListener('race', (_key, oldValue, newValue, remote) => {
        events.push({ oldValue, newValue, remote });
    });

    const localWrite = gm.GM_setValue('race', 'local');
    await Promise.resolve();
    mock.state.race = 'remote';
    mock.emit({ race: { oldValue: 'base', newValue: 'remote' } });
    releaseWrite();
    await localWrite;
    await gm.__flushGMPolyfill();

    assert.deepEqual(events, [
        { oldValue: 'base', newValue: 'local', remote: false },
        { oldValue: 'base', newValue: 'remote', remote: true },
    ]);
    assert.equal(mock.state.race, 'local');
    assert.equal(gm.GM_getValue('race'), 'local');
});

test('remote deletion removes the key and restores default-value semantics', async () => {
    const mock = createChromeMock({ saved: { value: 1 } });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();

    const events = [];
    gm.GM_addValueChangeListener('saved', (...args) => events.push(args));
    mock.emit({
        saved: {
            oldValue: { value: 1 },
            newValue: undefined,
        },
    });

    assert.deepEqual(gm.GM_listValues(), []);
    assert.deepEqual(gm.GM_getValue('saved', { fallback: true }), {
        fallback: true,
    });
    assert.deepEqual(events, [[
        'saved',
        { value: 1 },
        undefined,
        true,
    ]]);
});

test('write failures reject the direct operation and are observable through flush', async () => {
    const failure = new Error('storage unavailable');
    const mock = createChromeMock({}, { setError: failure });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();

    const operation = gm.GM_setValue('key', { optimistic: true });
    await assert.rejects(operation, /storage unavailable/);
    await assert.rejects(gm.__flushGMPolyfill(), /storage unavailable/);

    // Flush consumes the reported failures and remains usable for lifecycle
    // boundaries after the failure has already been handled.
    await gm.__flushGMPolyfill();
    assert.deepEqual(gm.GM_getValue('key'), { optimistic: true });
});

test('same-key retry after a failed write consumes its local echo without a remote duplicate', async () => {
    let attempts = 0;
    const mock = createChromeMock({}, {
        async beforeSet() {
            attempts += 1;
            if (attempts === 1) throw new Error('first write failed');
        },
    });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();
    const events = [];
    gm.GM_addValueChangeListener('retry', (_key, oldValue, newValue, remote) => {
        events.push({ oldValue, newValue, remote });
    });

    await assert.rejects(gm.GM_setValue('retry', 'first'), /first write failed/);
    await assert.rejects(gm.__flushGMPolyfill(), /first write failed/);
    await gm.GM_setValue('retry', 'second');
    await gm.__flushGMPolyfill();

    assert.deepEqual(events, [
        { oldValue: undefined, newValue: 'first', remote: false },
        { oldValue: 'first', newValue: 'second', remote: false },
    ]);
    assert.equal(gm.GM_getValue('retry'), 'second');
    assert.equal(mock.state.retry, 'second');
});

test('same-value retry after a failed write still tracks the persisted-storage echo', async () => {
    let attempts = 0;
    const mock = createChromeMock({}, {
        async beforeSet() {
            attempts += 1;
            if (attempts === 1) throw new Error('first write failed');
        },
    });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();
    const events = [];
    gm.GM_addValueChangeListener('retry', (_key, oldValue, newValue, remote) => {
        events.push({ oldValue, newValue, remote });
    });

    await assert.rejects(gm.GM_setValue('retry', 'same'), /first write failed/);
    await assert.rejects(gm.__flushGMPolyfill(), /first write failed/);
    await gm.GM_setValue('retry', 'same');
    await gm.__flushGMPolyfill();

    assert.deepEqual(events, [
        { oldValue: undefined, newValue: 'same', remote: false },
        { oldValue: 'same', newValue: 'same', remote: false },
    ]);
    assert.equal(mock.state.retry, 'same');
});

test('flush aggregates multiple failures, consumes them, and later writes recover', async () => {
    let call = 0;
    const mock = createChromeMock({ same: 1 }, {
        async beforeSet() {
            call += 1;
            if (call <= 2) throw new Error(`write ${call} failed`);
        },
    });
    const gm = await loadPolyfill(mock);
    await gm.__initGMPolyfill();

    const first = gm.GM_setValue('same', 1);
    const second = gm.GM_setValue('other', [1, 2]);
    const settled = await Promise.allSettled([first, second]);
    assert.deepEqual(settled.map(result => result.status), ['rejected', 'rejected']);

    await assert.rejects(gm.__flushGMPolyfill(), error => {
        assert.equal(error.name, 'AggregateError');
        assert.equal(error.errors.length, 2);
        assert.match(error.message, /2 extension storage writes failed/);
        return true;
    });
    await gm.__flushGMPolyfill();

    await gm.GM_setValue('recovered', { ok: true });
    await gm.__flushGMPolyfill();
    assert.deepEqual(mock.state.recovered, { ok: true });
});

test('style and menu-command shims keep the existing extension call surface', async () => {
    const mock = createChromeMock();
    const gm = await loadPolyfill(mock);
    const appended = [];
    globalThis.document = {
        createElement(tagName) { return { tagName, textContent: '' }; },
        head: { appendChild(node) { appended.push(node); } },
    };

    const style = gm.GM_addStyle('.primer { display: block; }');
    assert.equal(style.tagName, 'style');
    assert.equal(style.textContent, '.primer { display: block; }');
    assert.deepEqual(appended, [style]);
    assert.equal(gm.GM_registerMenuCommand('Ignored', () => {}), undefined);

    delete globalThis.document;
});

test('content entry exposes the complete supported GM surface and no privileged extras', async () => {
    const mock = createChromeMock({ ready: true });
    globalThis.chrome = mock.chrome;
    for (const name of ['GM_notification', 'GM_download', 'GM_xmlhttpRequest', 'GM_openInTab']) {
        delete globalThis[name];
    }

    await importFresh(contentUrl, 'content');

    for (const name of [
        '__initGMPolyfill', '__flushGMPolyfill',
        'GM_getValue', 'GM_setValue', 'GM_listValues',
        'GM_addValueChangeListener', 'GM_removeValueChangeListener',
        'GM_addStyle', 'GM_registerMenuCommand',
    ]) {
        assert.equal(typeof globalThis[name], 'function', `${name} must be exposed`);
    }
    for (const name of ['GM_notification', 'GM_download', 'GM_xmlhttpRequest', 'GM_openInTab']) {
        assert.equal(globalThis[name], undefined, `${name} must stay outside the extension contract`);
    }

    await globalThis.__initGMPolyfill();
    assert.equal(globalThis.GM_getValue('ready'), true);
    await globalThis.__flushGMPolyfill();
});

test('background registers its two listeners and resets position only for its menu item', async () => {
    let onInstalled;
    let onClicked;
    const menuCreates = [];
    const storageWrites = [];
    globalThis.chrome = {
        runtime: {
            onInstalled: {
                addListener(listener) { onInstalled = listener; },
            },
        },
        contextMenus: {
            create(options) { menuCreates.push(clone(options)); },
            onClicked: {
                addListener(listener) { onClicked = listener; },
            },
        },
        storage: {
            local: {
                set(update) {
                    storageWrites.push(clone(update));
                    return Promise.resolve();
                },
            },
        },
    };

    await importFresh(backgroundUrl, 'background');
    assert.equal(typeof onInstalled, 'function');
    assert.equal(typeof onClicked, 'function');

    onInstalled();
    assert.deepEqual(menuCreates, [{
        id: 'gemini-reset-position',
        title: 'Reset Panel Position',
        contexts: ['action'],
    }]);

    onClicked({ menuItemId: 'unrelated' });
    assert.deepEqual(storageWrites, []);
    onClicked({ menuItemId: 'gemini-reset-position' });
    assert.deepEqual(storageWrites, [{
        gemini_panel_pos: {
            top: '20px',
            left: 'auto',
            bottom: 'auto',
            right: '220px',
        },
    }]);
});

test('manifest grants only the storage and context-menu capabilities the platform implements', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.deepEqual([...manifest.permissions].sort(), ['contextMenus', 'storage']);
    assert.equal(manifest.host_permissions, undefined);
    assert.equal(manifest.optional_permissions, undefined);
    assert.deepEqual(manifest.content_scripts[0].matches, ['https://gemini.google.com/*']);
    assert.equal(manifest.content_scripts[0].run_at, 'document_idle');
    assert.equal(manifest.background.service_worker, 'background.js');
    assert.deepEqual(manifest.background.scripts, ['background.js']);
    assert.equal(manifest.action.default_title, 'Primer++ for Gemini™');
});

test('test cleanup is idempotent', () => {
    globalThis.GM_download = () => {};
    restoreManagedGlobals();
    restoreManagedGlobals();
    assert.deepEqual(
        Object.getOwnPropertyDescriptor(globalThis, 'GM_download'),
        originalGlobalDescriptors.get('GM_download')
    );
});
