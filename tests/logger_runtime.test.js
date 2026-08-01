const { before, after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let runtime;
const originalConsole = {};
const output = [];

before(async () => {
    for (const name of ['error', 'warn', 'debug', 'log']) {
        originalConsole[name] = console[name];
        console[name] = (...args) => output.push([name, ...args]);
    }
    runtime = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'logger.js')).href);
});

after(() => {
    Object.assign(console, originalConsole);
});

describe('logger runtime port', () => {
    it('keeps the compatibility facade usable before and after explicit configuration', async () => {
        runtime.Logger.log('info', 'fallback logger');
        await new Promise(resolve => setImmediate(resolve));

        for (const storage of [undefined, null, {}, { get() {}, set: true }]) {
            assert.throws(() => runtime.configureLoggerRuntime({ storage }), /storage port must implement/);
        }

        const throwing = {
            get() { throw new Error('read rejected'); },
            set() { throw new Error('write rejected'); }
        };
        assert.equal(runtime.configureLoggerRuntime({ storage: throwing }), runtime.Logger);
        assert.equal(runtime.isDebugEnabled(), false);
        assert.equal(runtime.setDebugEnabled(true), undefined);
        runtime.Logger.error('contained write');
        await new Promise(resolve => setImmediate(resolve));

        const values = new Map([
            ['gemini_log_level', 'debug'],
            ['gemini_logs_store', 'corrupt'],
            ['gemini_debug_enabled', true]
        ]);
        const writes = [];
        const storage = {
            get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
            set(key, value) { values.set(key, value); writes.push([key, value]); }
        };
        runtime.configureLoggerRuntime({ storage });
        assert.deepEqual(runtime.Logger.getEntries().map(entry => entry.msg), ['Logger initialized']);
        await new Promise(resolve => setImmediate(resolve));

        values.set('gemini_logs_store', []);
        runtime.configureLoggerRuntime({ storage });
        const received = [];
        const unsubscribe = runtime.Logger.subscribe(entry => received.push(entry.msg));
        runtime.Logger.error('error message');
        runtime.Logger.warn('warn message', { detail: 1 });
        runtime.Logger.info('info message');
        runtime.Logger.debug('debug message');
        runtime.Logger.log('custom', 'custom message');
        assert.equal(runtime.Logger.getLevel(), 'debug');
        runtime.Logger.setLevel('warn');
        assert.equal(runtime.Logger.getLevel(), 'warn');
        assert.equal(unsubscribe(), true);
        runtime.Logger.info('after unsubscribe');
        const exported = runtime.Logger.export();
        assert.equal(exported.level, 'warn');
        assert.ok(exported.entries.length >= 7);
        assert.deepEqual(received, [
            'error message', 'warn message', 'info message', 'debug message',
            'custom message', 'Log level updated'
        ]);
        assert.equal(runtime.isDebugEnabled(), true);
        assert.equal(runtime.setDebugEnabled(false), undefined);
        assert.equal(values.get('gemini_debug_enabled'), false);
        runtime.Logger.clear();
        assert.equal(runtime.Logger.getEntries().at(-1).msg, 'Logs cleared');
        await new Promise(resolve => setImmediate(resolve));

        assert.ok(writes.some(([key]) => key === 'gemini_log_level'));
        assert.ok(writes.some(([key]) => key === 'gemini_logs_store'));
        assert.ok(output.some(([name]) => name === 'error'));
        assert.ok(output.some(([name]) => name === 'warn'));
        assert.ok(output.some(([name]) => name === 'debug'));
        assert.ok(output.some(([name]) => name === 'log'));
    });
});
