const { afterEach, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let PrimerApplication;
let appExports;

before(async () => {
    const root = path.join(__dirname, '..', 'src', 'app');
    appExports = await import(pathToFileURL(path.join(root, 'index.js')).href);
    ({ PrimerApplication } = await import(pathToFileURL(
        path.join(root, 'primer_application.js')
    ).href));
});

afterEach(() => {
    // Tests that exercise the AggregateError fallback restore it themselves.
    assert.notEqual(globalThis.AggregateError, undefined);
});

function createTargets(visibilityState = 'visible') {
    const documentRef = new EventTarget();
    documentRef.visibilityState = visibilityState;
    return { documentRef, windowRef: new EventTarget() };
}

function createScope(overrides = {}) {
    const deferred = [];
    const intervals = [];
    const timeouts = [];
    const scope = {
        active: true,
        deferred,
        intervals,
        timeouts,
        defer(callback) {
            deferred.push(callback);
            return () => callback();
        },
        listen(target, type, callback) {
            target.addEventListener(type, callback);
            deferred.push(() => target.removeEventListener(type, callback));
            return () => target.removeEventListener(type, callback);
        },
        interval(callback, delay) {
            const entry = { callback, delay, released: false };
            intervals.push(entry);
            return () => {
                entry.released = true;
                return 'released';
            };
        },
        timeout(callback, delay) {
            const entry = { callback, delay };
            timeouts.push(entry);
            return () => undefined;
        },
        async dispose(reason) {
            scope.active = false;
            scope.reason = reason;
            while (deferred.length) await deferred.pop()();
        }
    };
    return Object.assign(scope, overrides);
}

function createDependencies(overrides = {}) {
    const { documentRef, windowRef } = createTargets();
    return {
        registry: { async init() {}, async destroy() {} },
        domWatcher: { init() {}, register() {}, unregister() {}, destroy() {} },
        documentRef,
        windowRef,
        createScope: () => createScope(),
        ...overrides
    };
}

function deferredPromise() {
    let resolve;
    let reject;
    const promise = new Promise((accept, decline) => {
        resolve = accept;
        reject = decline;
    });
    return { promise, resolve, reject };
}

function flushTasks() {
    return new Promise(resolve => setImmediate(resolve));
}

describe('app direct ESM coverage gate', () => {
    it('exports the public application and portable-archive contracts from the ESM index', () => {
        assert.equal(appExports.PrimerApplication, PrimerApplication);
        assert.equal(typeof appExports.createPortableArchiveWiring, 'function');
        assert.equal(typeof appExports.PortableArchiveWiringError, 'function');
    });

    it('rejects every malformed constructor boundary and normalizes optional values', () => {
        const valid = createDependencies();
        const badRegistries = [
            null,
            {},
            { init() {} }
        ];
        for (const registry of badRegistries) {
            assert.throws(() => new PrimerApplication({ ...valid, registry }), /lifecycle registry/);
        }

        const badWatchers = [
            null,
            {},
            { init() {} },
            { init() {}, register() {} },
            { init() {}, register() {}, unregister() {} }
        ];
        for (const domWatcher of badWatchers) {
            assert.throws(() => new PrimerApplication({ ...valid, domWatcher }), /DOMWatcher-like/);
        }

        assert.throws(() => new PrimerApplication({ ...valid, documentRef: null }), /document EventTarget/);
        assert.throws(() => new PrimerApplication({ ...valid, documentRef: {} }), /document EventTarget/);
        assert.throws(() => new PrimerApplication({ ...valid, windowRef: null }), /window EventTarget/);
        assert.throws(() => new PrimerApplication({ ...valid, windowRef: {} }), /window EventTarget/);
        assert.throws(() => new PrimerApplication({ ...valid, createScope: 1 }), /createScope/);
        assert.throws(() => new PrimerApplication({ ...valid, now: 1 }), /now/);
        assert.throws(() => new PrimerApplication({ ...valid, poll: 'later' }), /poll must be a function/);

        for (const watcher of [null, 'watcher', {}, { id: 1 }, { id: '' }]) {
            assert.throws(() => new PrimerApplication({ ...valid, watchers: [watcher] }), /require an id/);
        }
        assert.throws(() => new PrimerApplication({
            ...valid,
            watchers: [{ id: 'missing-match', callback() {} }]
        }), /requires match and callback/);
        assert.throws(() => new PrimerApplication({
            ...valid,
            watchers: [{ id: 'missing-callback', match() {} }]
        }), /requires match and callback/);

        const app = new PrimerApplication({
            ...valid,
            watchers: [{ id: 'zero-debounce', match() {}, callback() {}, debounce: 0 }],
            pollInterval: 'invalid',
            readyTimeout: 'invalid',
            readyPollInterval: 0
        });
        assert.equal(app.pollInterval, 1);
        assert.equal(app.readyTimeout, 0);
        assert.equal(app.readyPollInterval, 1);
        assert.equal(app.watchers[0].debounce, 0);
        assert.equal(app.scope, null);
    });

    it('rejects each incompatible scope shape and cleans failed allocation', async () => {
        const shapes = [
            null,
            {},
            { dispose() {} },
            { dispose() {}, listen() {} },
            { dispose() {}, listen() {}, interval() {} }
        ];
        for (const scope of shapes) {
            let destroys = 0;
            const app = new PrimerApplication(createDependencies({
                createScope: () => scope,
                registry: { async init() {}, async destroy() { destroys += 1; } }
            }));
            await assert.rejects(app.start(), /incompatible scope/);
            assert.equal(app.state, 'stopped');
            assert.equal(destroys, 1);
        }
    });

    it('serializes stop-during-start and a restart requested during teardown', async () => {
        const startGate = deferredPromise();
        const stopGate = deferredPromise();
        let starts = 0;
        let firstScope = true;
        const app = new PrimerApplication(createDependencies({
            beforeStart: () => startGate.promise,
            registry: {
                async init() { starts += 1; },
                async destroy() {}
            },
            createScope: () => createScope({
                async dispose(reason) {
                    this.active = false;
                    if (firstScope) {
                        firstScope = false;
                        await stopGate.promise;
                    }
                    this.reason = reason;
                }
            })
        }));

        const starting = app.start();
        const stopping = app.stop('during-start');
        assert.equal(app.stop('same-stop'), stopping);
        startGate.resolve();
        await starting;
        assert.equal(app.state, 'started');
        const restarting = app.start();
        stopGate.resolve();
        assert.equal(await stopping, app);
        assert.equal(await restarting, app);
        assert.equal(starts, 2);
        assert.equal(await app.start(), app);
        await app.stop();
        assert.equal(await app.stop(), app);
    });

    it('lets stop absorb a failed in-flight start without starting teardown twice', async () => {
        const gate = deferredPromise();
        let destroys = 0;
        const app = new PrimerApplication(createDependencies({
            beforeStart: () => gate.promise,
            registry: {
                async init() {},
                async destroy() { destroys += 1; }
            }
        }));
        const starting = app.start();
        const stopping = app.stop('failed-start');
        gate.reject(new Error('startup rejected'));
        await assert.rejects(starting, /startup rejected/);
        assert.equal(await stopping, app);
        assert.equal(destroys, 1);
    });

    it('attaches failed-start cleanup errors and contains scope error reporting', async () => {
        const reports = [];
        let scopeOptions;
        const app = new PrimerApplication(createDependencies({
            createScope(options) {
                scopeOptions = options;
                return createScope({ async dispose() { throw new Error('scope cleanup'); } });
            },
            beforeStart() { throw new Error('start failed'); },
            registry: {
                async init() {},
                async destroy() { throw new Error('registry cleanup'); }
            },
            afterStop() { throw new Error('after cleanup'); },
            onError(error, phase) {
                reports.push(`${phase}:${error.message}`);
                throw new Error('reporter failed');
            }
        }));

        await assert.rejects(app.start(), error => {
            assert.equal(error.message, 'start failed');
            assert.deepEqual(error.cleanupErrors.map(item => item.message), [
                'scope cleanup', 'registry cleanup', 'after cleanup'
            ]);
            return true;
        });
        scopeOptions.onError(new Error('deferred failed'));
        app._report(new Error('ignored'), 'direct');
        assert.deepEqual(reports, ['scope cleanup:deferred failed', 'direct:ignored']);

        const silent = new PrimerApplication(createDependencies());
        silent._report(new Error('no listener'), 'silent');
        silent._invokeBackground(null, 'absent');
    });

    it('returns one teardown error, aggregates several, and supports the AggregateError fallback', async () => {
        const single = new PrimerApplication(createDependencies({
            createScope: () => createScope({ async dispose() { throw new Error('only failure'); } })
        }));
        await single.start();
        await assert.rejects(single.stop(), error => error.message === 'only failure');

        const multiple = new PrimerApplication(createDependencies({
            createScope: () => createScope({ async dispose() { throw new Error('scope failure'); } }),
            registry: { async init() {}, async destroy() { throw new Error('registry failure'); } },
            afterStop() { throw new Error('hook failure'); }
        }));
        await multiple.start();
        await assert.rejects(multiple.stop(), error => {
            assert.equal(error instanceof AggregateError, true);
            assert.equal(error.errors.length, 3);
            return true;
        });

        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'AggregateError');
        Object.defineProperty(globalThis, 'AggregateError', { configurable: true, value: undefined });
        try {
            const fallback = new PrimerApplication(createDependencies({
                createScope: () => createScope({ async dispose() { throw new Error('scope fallback'); } }),
                registry: { async init() {}, async destroy() { throw new Error('registry fallback'); } }
            }));
            await fallback.start();
            await assert.rejects(fallback.stop(), error => {
                assert.equal(error.name, 'AggregateError');
                assert.deepEqual(error.errors.map(item => item.message), [
                    'scope fallback', 'registry fallback'
                ]);
                return true;
            });
        } finally {
            if (descriptor) Object.defineProperty(globalThis, 'AggregateError', descriptor);
            else delete globalThis.AggregateError;
        }
    });

    it('covers polling cancellation, inactive visibility, and both visibility background paths', async () => {
        const events = [];
        const scope = createScope();
        const deps = createDependencies({
            createScope: () => scope,
            poll() { events.push('poll'); },
            onVisible() { events.push('visible'); },
            onHidden() { events.push('hidden'); }
        });
        const app = new PrimerApplication(deps);
        app._resumePolling({ active: false });
        await app.start();
        assert.equal(scope.intervals.length, 1);
        scope.intervals[0].callback();
        await flushTasks();
        assert.deepEqual(events, ['poll', 'poll']);

        const matchingCancel = app._cancelPoll;
        assert.equal(matchingCancel(), 'released');
        app._resumePolling(scope);
        const savedCancel = app._cancelPoll;
        app._cancelPoll = () => undefined;
        assert.equal(savedCancel(), 'released');
        app._pausePolling();
        app._pausePolling();
        app._handleVisibility({ active: false });

        deps.documentRef.visibilityState = 'hidden';
        app._handleVisibility(scope);
        await flushTasks();
        deps.documentRef.visibilityState = 'visible';
        app._handleVisibility(scope);
        await flushTasks();
        assert.deepEqual(events.slice(-3), ['hidden', 'poll', 'visible']);
        await app.stop();

        const noPoll = new PrimerApplication(createDependencies());
        noPoll._resumePolling(createScope());
    });

    it('covers ready success, timeout, retry, inactive, and throwing readiness probes', async () => {
        const reports = [];
        const scope = createScope();
        let clock = 0;
        let readyCalls = 0;
        const app = new PrimerApplication(createDependencies({
            createScope: () => scope,
            now: () => clock,
            readyTimeout: 5,
            readyPollInterval: 2,
            isReady() {
                readyCalls += 1;
                if (readyCalls === 1) throw new Error('probe failed');
                return false;
            },
            onReady() { readyCalls += 10; },
            onError(error, phase) { reports.push(`${phase}:${error.message}`); }
        }));
        await app.start();
        const first = scope.timeouts.shift();
        first.callback();
        assert.deepEqual(reports, ['readiness probe:probe failed']);
        const retry = scope.timeouts.shift();
        clock = 5;
        retry.callback();
        await flushTasks();
        assert.equal(readyCalls, 12);

        app._scheduleReady({ active: false, timeout(callback) { callback(); } });
        await app.stop();

        const immediateScope = createScope();
        let immediate = 0;
        const immediateApp = new PrimerApplication(createDependencies({
            createScope: () => immediateScope,
            onReady() { immediate += 1; }
        }));
        await immediateApp.start();
        immediateScope.timeouts.shift().callback();
        await flushTasks();
        assert.equal(immediate, 1);
        await immediateApp.stop();
    });
});
