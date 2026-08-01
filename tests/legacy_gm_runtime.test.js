const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let createLegacyGmRuntime;
let createPersistedReloadHandler;

before(async () => {
    ({ createLegacyGmRuntime, createPersistedReloadHandler } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'platforms', 'legacy_gm_runtime.js')
    ).href));
});

describe('legacy GM runtime boundary', () => {
    it('validates hosts and returns frozen no-op ports when capabilities are absent', async () => {
        for (const host of [null, 1, 'host']) {
            assert.throws(() => createLegacyGmRuntime(host), /host must be an object/);
        }

        const runtime = createLegacyGmRuntime({ location: {} });
        assert.equal(Object.isFrozen(runtime), true);
        assert.equal(Object.isFrozen(runtime.storage), true);
        assert.equal(runtime.storage.get('missing', 7), 7);
        assert.equal(runtime.storage.set('key', 1), undefined);
        assert.deepEqual(runtime.storage.listValues(), []);
        assert.equal(runtime.storage.addValueChangeListener('key', () => {}), null);
        assert.equal(runtime.storage.removeValueChangeListener(1), undefined);
        assert.equal(await runtime.storage.flush(), undefined);
        assert.equal(runtime.addStyle('body{}'), null);
        assert.equal(runtime.registerMenuCommand('Menu', () => {}), null);
        assert.equal(runtime.reload(), undefined);

        assert.equal(createLegacyGmRuntime().storage.get('missing', 'fallback'), 'fallback');
        assert.equal(createLegacyGmRuntime(function host() {}).storage.get('missing', 3), 3);
    });

    it('forwards every userscript capability lazily with its host receiver', async () => {
        const events = [];
        const host = {
            value: 'saved',
            GM_getValue(key, fallback) {
                events.push(`get:${this === host}:${key}:${fallback}`);
                return this.value;
            },
            GM_setValue(key, value) { events.push(`set:${this === host}:${key}:${value}`); },
            GM_listValues() { return ['one', 'two']; },
            GM_addValueChangeListener(key, callback) {
                events.push(`listen:${key}:${typeof callback}`);
                return 9;
            },
            GM_removeValueChangeListener(id) { events.push(`unlisten:${id}`); },
            __flushGMPolyfill() { events.push('flush'); return Promise.resolve('flushed'); },
            GM_addStyle(css) { events.push(`style:${css}`); return { css }; },
            GM_registerMenuCommand(label, handler) {
                events.push(`menu:${label}:${typeof handler}`);
                return 11;
            },
            location: { reload() { events.push(`reload:${this === host.location}`); return 'reloaded'; } }
        };
        const runtime = createLegacyGmRuntime(host);

        assert.equal(runtime.storage.get('key', 'fallback'), 'saved');
        runtime.storage.set('key', 2);
        assert.deepEqual(runtime.storage.listValues(), ['one', 'two']);
        assert.equal(runtime.storage.addValueChangeListener('key', () => {}), 9);
        runtime.storage.removeValueChangeListener(9);
        assert.equal(await runtime.storage.flush(), 'flushed');
        assert.deepEqual(runtime.addStyle('body{}'), { css: 'body{}' });
        assert.equal(runtime.registerMenuCommand('Tools', () => {}), 11);
        assert.equal(runtime.reload(), 'reloaded');
        assert.deepEqual(events, [
            'get:true:key:fallback', 'set:true:key:2', 'listen:key:function', 'unlisten:9',
            'flush', 'style:body{}', 'menu:Tools:function', 'reload:true'
        ]);

        host.GM_getValue = null;
        host.GM_listValues = () => ({ not: 'an array' });
        assert.equal(runtime.storage.get('key', 'new fallback'), 'new fallback');
        assert.deepEqual(runtime.storage.listValues(), []);
        host.location.reload = null;
        assert.equal(runtime.reload(), undefined);
    });
});

describe('persisted reload handler', () => {
    it('validates ports and waits for set plus flush before reloading', async () => {
        for (const storage of [null, {}, { set() {} }]) {
            assert.throws(() => createPersistedReloadHandler({
                storage, reload() {}, onError() {}
            }), /storage must implement/);
        }
        const storage = { set() {}, flush() {} };
        assert.throws(() => createPersistedReloadHandler({ storage, reload: null, onError() {} }), /reload/);
        assert.throws(() => createPersistedReloadHandler({ storage, reload() {}, onError: null }), /onError/);

        const events = [];
        let releaseSet;
        const handler = createPersistedReloadHandler({
            storage: {
                set(key, value) {
                    events.push(`set:${key}:${value}`);
                    return new Promise(resolve => { releaseSet = resolve; });
                },
                async flush() { events.push('flush'); }
            },
            key: 'position',
            value: { top: 1 },
            reload() { events.push('reload'); },
            onError(error) { events.push(`error:${error.message}`); }
        });
        const pending = handler();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(events, ['set:position:[object Object]']);
        releaseSet();
        assert.equal(await pending, true);
        assert.deepEqual(events, ['set:position:[object Object]', 'flush', 'reload']);
    });

    it('reports persistence failures and never reloads an uncommitted reset', async () => {
        const events = [];
        const handler = createPersistedReloadHandler({
            storage: {
                async set() { events.push('set'); },
                async flush() { events.push('flush'); throw new Error('write rejected'); }
            },
            key: 'position',
            value: null,
            reload() { events.push('reload'); },
            onError(error) { events.push(`error:${error.message}`); }
        });
        assert.equal(await handler(), false);
        assert.deepEqual(events, ['set', 'flush', 'error:write rejected']);
    });
});
