const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let LifecycleScope;
let RuntimeIndex;
before(async () => {
    const url = pathToFileURL(path.join(__dirname, '..', 'src', 'runtime', 'lifecycle_scope.js'));
    ({ LifecycleScope } = await import(url.href));
    const indexUrl = pathToFileURL(path.join(__dirname, '..', 'src', 'runtime', 'index.js'));
    RuntimeIndex = await import(indexUrl.href);
});

function createTimers() {
    let nextHandle = 1;
    const timeouts = new Map();
    const intervals = new Map();
    return {
        timeouts,
        intervals,
        clearedTimeouts: [],
        clearedIntervals: [],
        setTimeout(callback, delay, ...args) {
            const handle = nextHandle++;
            timeouts.set(handle, { callback, delay, args });
            return handle;
        },
        clearTimeout(handle) {
            this.clearedTimeouts.push(handle);
            timeouts.delete(handle);
        },
        setInterval(callback, delay, ...args) {
            const handle = nextHandle++;
            intervals.set(handle, { callback, delay, args });
            return handle;
        },
        clearInterval(handle) {
            this.clearedIntervals.push(handle);
            intervals.delete(handle);
        }
    };
}

describe('LifecycleScope', () => {
    it('validates dependencies and reports state without creating resources', () => {
        assert.throws(
            () => new LifecycleScope({ AbortController: null }),
            /requires an AbortController/
        );
        assert.throws(
            () => new LifecycleScope({ onError: 'bad' }),
            /onError must be a function/
        );

        const scope = new LifecycleScope({ label: '' });
        assert.equal(scope.label, 'lifecycle');
        assert.equal(scope.state, 'active');
        assert.equal(scope.active, true);
        assert.equal(scope.disposed, false);
        assert.equal(scope.disposeReason, undefined);
        assert.equal(scope.size, 0);
        assert.equal(scope.signal.aborted, false);
        assert.equal(RuntimeIndex.LifecycleScope, LifecycleScope);
        assert.equal(typeof RuntimeIndex.ModuleHost, 'function');
        assert.equal(typeof RuntimeIndex.ModuleHostError, 'function');

        assert.throws(() => scope.defer(null), /cleanup must be a function/);
        const release = scope.defer(() => undefined, '');
        assert.equal(release.record.label, 'cleanup');
        release();
    });

    it('owns listeners and permits idempotent early release', async () => {
        const scope = new LifecycleScope({ label: 'events' });
        const target = new EventTarget();
        let calls = 0;
        const listener = () => { calls += 1; };

        const remove = scope.listen(target, 'ping', listener, { capture: false });
        assert.equal(scope.size, 1);
        target.dispatchEvent(new Event('ping'));
        assert.equal(calls, 1);

        assert.equal(remove(), undefined);
        assert.equal(remove(), undefined);
        assert.equal(scope.size, 0);
        target.dispatchEvent(new Event('ping'));
        assert.equal(calls, 1);

        const handled = { handleEvent() { calls += 1; } };
        scope.addEventListener(target, 'pong', handled);
        await scope.dispose('done');
        target.dispatchEvent(new Event('pong'));
        assert.equal(calls, 1);

        assert.throws(() => new LifecycleScope().listen({}, 'x', listener), /EventTarget-like/);
        assert.throws(() => new LifecycleScope().listen(target, 'x', {}), /event listener/);
    });

    it('owns one-shot and repeating timers', async () => {
        const timers = createTimers();
        const scope = new LifecycleScope({ timers });
        const calls = [];
        const cancelTimeout = scope.timeout((...args) => calls.push(['timeout', ...args]), 25, 'a');
        const cancelInterval = scope.interval((...args) => calls.push(['interval', ...args]), 50, 'b');

        assert.equal(timers.timeouts.get(cancelTimeout.handle).delay, 25);
        assert.deepEqual(timers.timeouts.get(cancelTimeout.handle).args, ['a']);
        assert.equal(timers.intervals.get(cancelInterval.handle).delay, 50);
        assert.equal(scope.size, 2);

        const timeout = timers.timeouts.get(cancelTimeout.handle);
        timeout.callback(...timeout.args);
        assert.deepEqual(calls, [['timeout', 'a']]);
        assert.equal(scope.size, 1);

        const interval = timers.intervals.get(cancelInterval.handle);
        interval.callback(...interval.args);
        interval.callback(...interval.args);
        assert.deepEqual(calls, [['timeout', 'a'], ['interval', 'b'], ['interval', 'b']]);

        await scope.dispose();
        interval.callback(...interval.args);
        assert.equal(calls.length, 3);
        assert.deepEqual(timers.clearedIntervals, [cancelInterval.handle]);
        assert.deepEqual(timers.clearedTimeouts, []);

        const earlyTimers = createTimers();
        const early = new LifecycleScope({ timers: earlyTimers });
        const cancel = early.timeout(() => {}, 1);
        const cancelledTimeout = earlyTimers.timeouts.get(cancel.handle);
        cancel();
        cancelledTimeout.callback();
        assert.deepEqual(earlyTimers.clearedTimeouts, [cancel.handle]);

        assert.throws(() => new LifecycleScope().timeout(null), /requires a callback/);
        assert.throws(() => new LifecycleScope({ timers: {} }).timeout(() => {}), /do not support/);
        assert.throws(() => new LifecycleScope().interval(null), /requires a callback/);
        assert.throws(() => new LifecycleScope({ timers: {} }).interval(() => {}), /do not support/);
    });

    it('owns observers and all supported subscription shapes', async () => {
        const scope = new LifecycleScope();
        const actions = [];
        const observer = {
            observe(target, options) { actions.push(['observe', target, options]); },
            disconnect() { actions.push(['disconnect']); }
        };
        const target = {};
        assert.equal(scope.observe(observer, target, { subtree: true }), observer);
        assert.deepEqual(actions[0], ['observe', target, { subtree: true }]);
        const detachedObserver = { disconnect() { actions.push(['detached']); } };
        assert.equal(scope.observe(detachedObserver), detachedObserver);

        let functionCleanup = 0;
        let unsubscribed = 0;
        let disposed = 0;
        let closed = 0;
        scope.subscription(() => { functionCleanup += 1; });
        scope.subscription({ unsubscribe() { unsubscribed += 1; } });
        scope.subscription({ dispose() { disposed += 1; } });
        const releaseClose = scope.subscription({ close() { closed += 1; } });
        releaseClose();

        let subscribeArgs;
        scope.subscribe((...args) => {
            subscribeArgs = args;
            return { unsubscribe() { unsubscribed += 10; } };
        }, 'topic', 2);

        await scope.dispose();
        assert.deepEqual(subscribeArgs, ['topic', 2]);
        assert.equal(functionCleanup, 1);
        assert.equal(unsubscribed, 11);
        assert.equal(disposed, 1);
        assert.equal(closed, 1);
        assert.deepEqual(actions.at(-2), ['detached']);
        assert.deepEqual(actions.at(-1), ['disconnect']);

        assert.throws(() => new LifecycleScope().observe({}), /disconnect/);
        assert.throws(
            () => new LifecycleScope().observe({ disconnect() {} }, {}),
            /does not implement observe/
        );
        assert.throws(() => new LifecycleScope().subscription({}), /cleanup function/);
        assert.throws(() => new LifecycleScope().subscribe(null), /subscribe function/);
    });

    it('disposes in LIFO order, awaits async work, aggregates failures, and is idempotent', async () => {
        const order = [];
        const scope = new LifecycleScope({ label: 'ordered' });
        scope.defer(() => order.push('first'));
        scope.defer(async () => {
            await Promise.resolve();
            order.push('second');
        });
        scope.defer(() => order.push('third'));

        const firstDispose = scope.dispose('shutdown');
        const secondDispose = scope.dispose('ignored');
        assert.equal(firstDispose, secondDispose);
        assert.equal(scope.state, 'disposing');
        assert.equal(scope.signal.aborted, true);
        await firstDispose;
        assert.deepEqual(order, ['third', 'second', 'first']);
        assert.equal(scope.state, 'disposed');
        assert.equal(scope.disposeReason, 'shutdown');
        assert.equal(scope.size, 0);
        assert.throws(() => scope.defer(() => {}), /is disposed/);

        const failing = new LifecycleScope({ label: 'failing' });
        failing.defer(() => { throw new Error('one'); });
        failing.defer(async () => { throw new Error('two'); });
        await assert.rejects(
            failing.dispose(),
            error => error.name === 'AggregateError' && error.errors.length === 2
        );
        assert.equal(failing.disposed, true);

        const single = new LifecycleScope();
        const expected = new Error('single');
        single.defer(() => { throw expected; });
        await assert.rejects(single.dispose(), error => error === expected);

        const concurrent = new LifecycleScope();
        const concurrentOrder = [];
        const releaseEarlier = concurrent.defer(() => concurrentOrder.push('earlier'));
        concurrent.defer(async () => {
            releaseEarlier();
            await Promise.resolve();
            concurrentOrder.push('later');
        });
        await concurrent.dispose();
        assert.deepEqual(concurrentOrder, ['later', 'earlier']);

        let releaseGate;
        const gate = new Promise(resolve => { releaseGate = resolve; });
        const reentrant = new LifecycleScope({ label: 'reentrant' });
        let nestedDispose;
        let cleanupCalls = 0;
        reentrant.signal.addEventListener('abort', () => {
            nestedDispose = reentrant.dispose('nested reason');
        }, { once: true });
        reentrant.defer(async () => {
            cleanupCalls += 1;
            await gate;
        });

        const outerDispose = reentrant.dispose('outer reason');
        assert.equal(nestedDispose, outerDispose);
        assert.equal(reentrant.dispose('third reason'), outerDispose);
        assert.equal(reentrant.disposeReason, 'outer reason');
        let settled = false;
        outerDispose.then(() => { settled = true; });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(settled, false);
        assert.equal(cleanupCalls, 1);
        releaseGate();
        await outerDispose;
        assert.equal(settled, true);
        assert.equal(cleanupCalls, 1);

        const NativeAggregateError = globalThis.AggregateError;
        try {
            globalThis.AggregateError = undefined;
            const legacyAggregate = new LifecycleScope({ label: 'legacy aggregate' });
            legacyAggregate.defer(() => { throw new Error('first'); });
            legacyAggregate.defer(() => { throw new Error('second'); });
            await assert.rejects(
                legacyAggregate.dispose(),
                error => error.name === 'AggregateError' && error.errors.length === 2
            );
        } finally {
            globalThis.AggregateError = NativeAggregateError;
        }
    });

    it('links AbortSignals, cascades to children, and isolates error reporting failures', async () => {
        const parent = new AbortController();
        const reported = [];
        const scope = new LifecycleScope({
            parentSignal: parent.signal,
            onError(error) {
                reported.push(error.message);
                throw new Error('reporter failed');
            }
        });
        scope.defer(() => { throw new Error('linked cleanup failed'); });
        parent.abort('parent stopped');
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(scope.disposed, true);
        assert.equal(scope.disposeReason, 'parent stopped');
        assert.deepEqual(reported, ['linked cleanup failed']);

        const root = new LifecycleScope();
        const child = root.child('child');
        const objectChild = root.child({ label: 'object child' });
        assert.equal(child.label, 'child');
        assert.equal(objectChild.label, 'object child');
        assert.equal(root.linkSignal(root.signal)(), undefined);
        await root.dispose('root stopped');
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(child.disposed, true);
        assert.equal(child.disposeReason, 'root stopped');
        assert.equal(objectChild.disposed, true);

        const detachedLinkSource = new AbortController();
        const detachedLink = new LifecycleScope();
        detachedLink.linkSignal(detachedLinkSource.signal)();
        detachedLinkSource.abort('detached');
        assert.equal(detachedLink.active, true);
        await detachedLink.dispose();

        const unreportedParent = new AbortController();
        const unreported = new LifecycleScope({ parentSignal: unreportedParent.signal });
        unreported.defer(() => { throw new Error('ignored linked cleanup'); });
        unreportedParent.abort('silent');
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(unreported.disposed, true);

        const alreadyAborted = new AbortController();
        alreadyAborted.abort('before construction');
        const prelinked = new LifecycleScope();
        const alreadyAbortedNoop = prelinked.linkSignal(alreadyAborted.signal);
        assert.equal(alreadyAbortedNoop(), undefined);
        await prelinked.dispose();
        const late = new LifecycleScope({ parentSignal: alreadyAborted.signal });
        await late.dispose();
        assert.equal(late.disposeReason, 'before construction');
        assert.throws(() => late.linkSignal(new AbortController().signal), /is disposed/);
        assert.throws(() => new LifecycleScope().linkSignal({}), /AbortSignal-like/);
    });

    it('supports AbortController implementations without abort reasons', async () => {
        class LegacyAbortController {
            constructor() {
                this.signal = new EventTarget();
                this.signal.aborted = false;
            }

            abort(...args) {
                if (args.length) throw new TypeError('reason not supported');
                this.signal.aborted = true;
                this.signal.dispatchEvent(new Event('abort'));
            }
        }

        const scope = new LifecycleScope({ AbortController: LegacyAbortController });
        await scope.dispose('legacy');
        assert.equal(scope.signal.aborted, true);
        assert.equal(scope.disposeReason, 'legacy');

        const abortFailure = new Error('abort failed');
        class BrokenAbortController {
            constructor() {
                this.signal = new EventTarget();
            }

            abort() {
                throw abortFailure;
            }
        }

        const broken = new LifecycleScope({ AbortController: BrokenAbortController });
        let cleanupCalls = 0;
        broken.defer(() => { cleanupCalls += 1; });
        await assert.rejects(broken.dispose('broken'), error => error === abortFailure);
        assert.equal(broken.disposed, true);
        assert.equal(cleanupCalls, 1);
    });
});
