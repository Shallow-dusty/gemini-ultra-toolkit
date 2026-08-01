const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let createGMStorageAdapter;
let createChromeStorageAdapter;
let sameChromeStorageValue;

before(async () => {
    ({ createGMStorageAdapter, createChromeStorageAdapter, sameChromeStorageValue } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'storage', 'adapters', 'index.js')
    ).href));
});

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((ok, fail) => {
        resolve = ok;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function createFakeChrome({ promiseMode = false } = {}) {
    const values = new Map();
    const changeListeners = new Set();
    const runtime = { lastError: null };
    let failMessage = null;

    function complete(callback, value) {
        if (promiseMode) {
            return failMessage
                ? Promise.reject(new Error(failMessage))
                : Promise.resolve(value);
        }
        if (failMessage) runtime.lastError = { message: failMessage };
        callback(value);
        runtime.lastError = null;
        return undefined;
    }

    const local = {
        get(keys, callback) {
            let result;
            if (keys === null) result = Object.fromEntries(values);
            else if (typeof keys === 'string') result = values.has(keys) ? { [keys]: structuredClone(values.get(keys)) } : {};
            else result = {};
            return complete(callback, result);
        },
        set(items, callback) {
            const changes = {};
            for (const [key, value] of Object.entries(items)) {
                changes[key] = {
                    oldValue: values.has(key) ? structuredClone(values.get(key)) : undefined,
                    newValue: structuredClone(value)
                };
                values.set(key, structuredClone(value));
            }
            if (!failMessage) {
                for (const listener of [...changeListeners]) listener(changes, 'local');
            }
            return complete(callback);
        },
        remove(key, callback) {
            values.delete(key);
            return complete(callback);
        }
    };

    return {
        chrome: {
            runtime,
            storage: {
                local,
                onChanged: {
                    addListener(listener) { changeListeners.add(listener); },
                    removeListener(listener) { changeListeners.delete(listener); }
                }
            }
        },
        values,
        emit(changes, area = 'local') {
            for (const listener of [...changeListeners]) listener(structuredClone(changes), area);
        },
        fail(message) { failMessage = message; },
        listenerCount() { return changeListeners.size; }
    };
}

describe('GM storage adapter', () => {
    it('wraps sync GM APIs, clones values and classifies change events', async () => {
        const values = new Map([['seed', { count: 1 }]]);
        const listeners = new Map();
        const removed = [];
        const adapter = createGMStorageAdapter({
            getValue(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
            setValue(key, value) { values.set(key, value); },
            deleteValue(key) { values.delete(key); },
            listValues() { return [...values.keys()]; },
            addValueChangeListener(key, listener) { listeners.set(7, { key, listener }); return 7; },
            removeValueChangeListener(id) { removed.push(id); listeners.delete(id); }
        });

        const read = await adapter.get('seed');
        read.count = 9;
        assert.deepEqual(values.get('seed'), { count: 1 });

        const input = { count: 2 };
        await adapter.set('next', input);
        input.count = 8;
        assert.deepEqual(values.get('next'), { count: 2 });
        assert.deepEqual((await adapter.list()).sort(), ['next', 'seed']);

        const events = [];
        const unsubscribe = adapter.subscribe('next', event => events.push(event));
        listeners.get(7).listener('next', { count: 1 }, { count: 2 }, false);
        listeners.get(7).listener('next', { count: 2 }, { count: 3 }, true);
        assert.deepEqual(events.map(event => event.source), ['local-echo', 'external']);
        events[0].newValue.count = 99;
        assert.deepEqual(events[1].oldValue, { count: 2 });
        unsubscribe();
        unsubscribe();
        assert.deepEqual(removed, [7]);

        await adapter.delete('next');
        assert.deepEqual(await adapter.list(), ['seed']);
        await adapter.flush();
    });

    it('waits for asynchronous writes, propagates failures and validates contracts', async () => {
        const gate = deferred();
        const adapter = createGMStorageAdapter({
            getValue() { return undefined; },
            setValue() { return gate.promise; }
        });
        const write = adapter.set('key', 1);
        let flushed = false;
        const flushing = adapter.flush().then(() => { flushed = true; });
        await Promise.resolve();
        assert.equal(flushed, false);
        gate.resolve();
        await Promise.all([write, flushing]);

        const broken = createGMStorageAdapter({
            getValue() { throw new Error('read failed'); },
            setValue() { return Promise.reject(new Error('write failed')); },
            listValues() { return 'bad'; }
        });
        await assert.rejects(broken.get('x'), /read failed/);
        await assert.rejects(broken.set('x', 1), /write failed/);
        await assert.rejects(broken.list(), /must return an array/);
        assert.equal(broken.subscribe('x', () => {}), undefined);
        assert.throws(() => broken.subscribe('x', null), /listener/);

        const noRemove = createGMStorageAdapter({
            getValue() {},
            setValue() {},
            addValueChangeListener() { return undefined; }
        });
        const stop = noRemove.subscribe('x', () => {});
        stop();
        assert.deepEqual(await noRemove.list(), []);
        assert.throws(() => createGMStorageAdapter(), /getValue/);
        assert.throws(() => createGMStorageAdapter({ getValue() {} }), /setValue/);
    });
});

describe('Chrome storage adapter', () => {
    it('compares every Chrome storage value shape used for echo deduplication', () => {
        assert.equal(sameChromeStorageValue(NaN, NaN), true);
        assert.equal(sameChromeStorageValue(1, 2), false);
        assert.equal(sameChromeStorageValue(null, {}), false);
        assert.equal(sameChromeStorageValue({}, []), false);
        assert.equal(sameChromeStorageValue(new Date(1), new Date(1)), true);
        assert.equal(sameChromeStorageValue(new Date(1), new Date(2)), false);
        assert.equal(sameChromeStorageValue(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
        assert.equal(sameChromeStorageValue(new Uint8Array([1]), new Uint8Array([1, 2])), false);
        assert.equal(sameChromeStorageValue(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
        assert.equal(sameChromeStorageValue(new Uint8Array([1]).buffer, new Uint8Array([1]).buffer), true);
        assert.equal(sameChromeStorageValue([1], [1]), true);
        assert.equal(sameChromeStorageValue([1], [1, 2]), false);
        assert.equal(sameChromeStorageValue([1], [2]), false);
        assert.equal(sameChromeStorageValue({ a: 1 }, { a: 1 }), true);
        assert.equal(sameChromeStorageValue({ a: 1 }, { a: 1, b: 2 }), false);
        assert.equal(sameChromeStorageValue({ a: 1 }, { b: 1 }), false);
        assert.equal(sameChromeStorageValue({ a: 1 }, { a: 2 }), false);
        const left = {};
        const right = {};
        left.self = left;
        right.self = right;
        assert.equal(sameChromeStorageValue(left, right), true);
    });

    for (const promiseMode of [false, true]) {
        it(`supports ${promiseMode ? 'Promise' : 'callback'} Chrome APIs with clone-safe local echo`, async () => {
            const fake = createFakeChrome({ promiseMode });
            const adapter = createChromeStorageAdapter(fake.chrome);
            const events = [];
            const unsubscribe = adapter.subscribe('profile', event => events.push(event));

            const input = { nested: { enabled: true }, bytes: new Uint8Array([1, 2]) };
            await adapter.set('profile', input);
            input.nested.enabled = false;
            assert.equal(events.length, 1);
            assert.equal(events[0].source, 'local-echo');

            const read = await adapter.get('profile');
            read.nested.enabled = false;
            assert.equal((await adapter.get('profile')).nested.enabled, true);
            assert.deepEqual(await adapter.list(), ['profile']);

            fake.emit({
                profile: {
                    oldValue: { nested: { enabled: true } },
                    newValue: { nested: { enabled: false } }
                }
            });
            assert.equal(events.at(-1).source, 'external');
            fake.emit({ profile: { newValue: {} } }, 'sync');
            assert.equal(events.length, 2);

            unsubscribe();
            unsubscribe();
            await adapter.delete('profile');
            assert.deepEqual(await adapter.list(), []);
            await adapter.flush();
            adapter.destroy();
            adapter.destroy();
            assert.equal(fake.listenerCount(), 0);
            await assert.rejects(adapter.set('profile', {}), /destroyed/);
            assert.throws(() => adapter.subscribe('profile', () => {}), /destroyed/);
        });
    }

    it('propagates runtime errors and removes failed local-echo markers', async () => {
        const fake = createFakeChrome();
        const adapter = createChromeStorageAdapter(fake.chrome);
        fake.fail('storage unavailable');
        await assert.rejects(adapter.get('key'), /storage unavailable/);
        await assert.rejects(adapter.set('key', { value: 1 }), /storage unavailable/);
        await assert.rejects(adapter.delete('key'), /storage unavailable/);
        await assert.rejects(adapter.list(), /storage unavailable/);
    });

    it('accepts Promise rejection and validates the Chrome surface', async () => {
        const fake = createFakeChrome({ promiseMode: true });
        const adapter = createChromeStorageAdapter(fake.chrome);
        fake.fail('promise unavailable');
        await assert.rejects(adapter.get('key'), /promise unavailable/);

        assert.throws(() => createChromeStorageAdapter(null), /chromeApi/);
        assert.throws(() => createChromeStorageAdapter({}), /storage/);
        assert.throws(() => createChromeStorageAdapter({ storage: {} }), /storage.local/);
        assert.throws(() => createChromeStorageAdapter({ storage: { local: {} } }), /local.get/);
        assert.throws(() => createChromeStorageAdapter({ storage: { local: { get() {} } } }), /local.set/);
    });

    it('handles direct returns, synchronous throws, duplicate completion and missing optional APIs', async () => {
        const changes = new Set();
        const direct = createChromeStorageAdapter({
            storage: {
                local: {
                    get(key) { return key === null ? {} : { [key]: 3 }; },
                    set() { return true; }
                },
                onChanged: { addListener(listener) { changes.add(listener); } }
            }
        });
        assert.equal(await direct.get('value'), 3);
        assert.deepEqual(await direct.list(), []);
        await direct.set('value', 4);
        assert.equal(direct.delete, undefined);
        assert.throws(() => direct.subscribe('value', null), /listener/);
        direct.destroy();

        const undefinedList = createChromeStorageAdapter({
            storage: {
                local: {
                    get(_key, callback) { callback(undefined); },
                    set(_items, callback) { callback(); }
                }
            }
        });
        assert.deepEqual(await undefinedList.list(), []);
        assert.equal(await undefinedList.get('missing'), undefined);

        const both = createChromeStorageAdapter({
            storage: {
                local: {
                    get(key, callback) { callback({ [key]: 5 }); return Promise.resolve({ [key]: 6 }); },
                    set(_items, callback) { callback(); return Promise.resolve(); }
                }
            }
        });
        assert.equal(await both.get('value'), 5);
        await both.set('value', 5);
        both.destroy();

        const throwing = createChromeStorageAdapter({
            storage: { local: { get() { throw new Error('sync read'); }, set() { throw new Error('sync write'); } } }
        });
        await assert.rejects(throwing.get('value'), /sync read/);
        await assert.rejects(throwing.set('value', 1), /sync write/);

        const runtime = { lastError: null };
        const messageLess = createChromeStorageAdapter({
            runtime,
            storage: {
                local: {
                    get(_key, callback) { runtime.lastError = {}; callback(); runtime.lastError = null; },
                    set(_items, callback) { callback(); }
                }
            }
        });
        await assert.rejects(messageLess.get('value'), /\[object Object\]/);
    });

    it('handles queued echoes, irrelevant changes and cleanup after a late failed echo', async () => {
        const changeListeners = new Set();
        const runtime = { lastError: null };
        let failAfterEcho = false;
        const chrome = {
            runtime,
            storage: {
                local: {
                    get(_key, callback) { callback({}); },
                    set(items, callback) {
                        if (failAfterEcho) {
                            for (const listener of changeListeners) {
                                const key = Object.keys(items)[0];
                                listener({ [key]: { newValue: items[key] } }, 'local');
                            }
                            runtime.lastError = { message: 'late failure' };
                            callback();
                            runtime.lastError = null;
                            return;
                        }
                        callback();
                    }
                },
                onChanged: {
                    addListener(listener) { changeListeners.add(listener); },
                    removeListener() {}
                }
            }
        };
        const adapter = createChromeStorageAdapter(chrome);
        const events = [];
        const stop = adapter.subscribe('queued', event => events.push(event));
        await adapter.set('queued', { value: 1 });
        await adapter.set('queued', { value: 2 });
        for (const listener of changeListeners) {
            listener(null, 'local');
            listener([], 'local');
            listener({ queued: { newValue: {} } }, 'sync');
            listener({ ignored: { newValue: {} } }, 'local');
            listener({ queued: { newValue: { value: 1 } } }, 'local');
            listener({ queued: { newValue: { value: 2 } } }, 'local');
        }
        assert.deepEqual(events.map(event => event.source), ['local-echo', 'local-echo']);
        stop();

        const stopLate = adapter.subscribe('late', () => {});
        failAfterEcho = true;
        await assert.rejects(adapter.set('late', { value: 3 }), /late failure/);
        stopLate();
        adapter.destroy();
        for (const listener of changeListeners) listener({ late: { newValue: 4 } }, 'local');
    });
});
