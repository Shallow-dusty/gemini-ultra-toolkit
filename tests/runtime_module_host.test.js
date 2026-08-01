const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let ModuleHost;
let ModuleHostError;
before(async () => {
    const url = pathToFileURL(path.join(__dirname, '..', 'src', 'runtime', 'module_host.js'));
    ({ ModuleHost, ModuleHostError } = await import(url.href));
});

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function withWatchdog(promise, milliseconds = 100) {
    let handle;
    const timeout = new Promise((_, reject) => {
        handle = setTimeout(() => reject(new Error('operation timed out')), milliseconds);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(handle);
    }
}

describe('ModuleHost descriptor and capability contracts', () => {
    it('validates host options and module descriptors', () => {
        assert.throws(() => new ModuleHost({ createScope: null }), /createScope must be a function/);
        assert.throws(() => new ModuleHost({ onStateChange: 'bad' }), /onStateChange must be a function/);

        const host = new ModuleHost();
        for (const descriptor of [
            null,
            42,
            [],
            { id: 42, start() {} },
            { id: '', start() {} },
            { id: ' padded', start() {} },
            { id: 'Bad Id', start() {} },
            { id: 'empty' },
            { id: 'bad-default', defaultEnabled: 'yes', start() {} },
            { id: 'bad-provides', provides: 'x', start() {} },
            { id: 'bad-provides-name', provides: ['bad name'], start() {} },
            { id: 'duplicate-provides', provides: ['x', 'x'], start() {} },
            { id: 'bad-requires', requires: 'x', start() {} },
            { id: 'bad-requires-name', requires: [' bad'], start() {} },
            { id: 'bad-capabilities-null', capabilities: null, start() {} },
            { id: 'bad-capabilities-array', capabilities: [], start() {} }
        ]) {
            assert.throws(
                () => host.register(descriptor),
                error => error instanceof ModuleHostError && error.code === 'INVALID_DESCRIPTOR'
            );
        }
        for (const hook of ['create', 'start', 'stop', 'init', 'destroy', 'onSessionChange', 'onUserChange']) {
            assert.throws(
                () => host.register({ id: `bad-${hook.toLowerCase()}`, [hook]: true }),
                error => error.code === 'INVALID_DESCRIPTOR' && error.details.hook === hook
            );
        }

        const snapshots = [];
        const observed = new ModuleHost({ onStateChange(state) {
            snapshots.push(state);
            throw new Error('observer failure');
        } });
        const initial = observed.register({ id: 'valid_module', start() {} });
        assert.equal(observed.has('valid_module'), true);
        assert.equal(observed.has('missing'), false);
        assert.equal(initial.state, 'stopped');
        assert.equal(initial.enabled, false);
        assert.deepEqual(initial.provides, []);
        assert.deepEqual(initial.requires, []);
        assert.equal(snapshots.length, 1);
        assert.throws(
            () => observed.register({ id: 'valid_module', start() {} }),
            error => error.code === 'DUPLICATE_MODULE'
        );
        assert.throws(() => observed.getState('missing'), error => error.code === 'UNKNOWN_MODULE');
    });

    it('registers capabilities by owner and withdraws them on stop', async () => {
        const events = [];
        const service = { answer: 42 };
        const host = new ModuleHost({ session: { id: 'initial' } });
        host.register({
            id: 'provider',
            defaultEnabled: true,
            provides: ['data.read'],
            create(context) {
                assert.equal(context.id, 'provider');
                assert.equal(context.session.id, 'initial');
                assert.equal(context.signal.aborted, false);
                context.provideCapability('data.read', service);
                assert.equal(context.hasCapability('data.read'), true);
                assert.equal(context.getCapability('data.read'), service);
                assert.equal(context.requireCapability('data.read'), service);
                return {
                    start() { events.push('provider:start'); },
                    stop(contextWithReason) { events.push(`provider:stop:${contextWithReason.reason}`); }
                };
            }
        });
        host.register({
            id: 'consumer',
            requires: ['data.read'],
            create(context) {
                assert.equal(context.requireCapability('data.read'), service);
                assert.equal(context.hasCapability('data.read'), true);
                assert.equal(context.hasCapability('missing'), false);
                assert.equal(context.getCapability('data.read'), service);
                assert.equal(context.getCapability('missing'), undefined);
                return {
                    start() { events.push('consumer:start'); },
                    stop() { events.push('consumer:stop'); }
                };
            }
        });

        const started = await host.start('provider');
        assert.equal(started.state, 'started');
        assert.equal(started.generation, 1);
        assert.equal((await host.start('provider')).generation, 1);
        assert.equal(host.hasCapability('data.read'), true);
        assert.equal(host.getCapability('data.read'), service);
        assert.equal(host.getCapabilityOwner('data.read'), 'provider');
        assert.deepEqual(host.listCapabilities(), [{ name: 'data.read', owner: 'provider', value: service }]);

        await host.start('consumer');
        assert.deepEqual(host.list().map(state => state.id), ['provider', 'consumer']);
        await host.stop('consumer', 'test complete');
        await host.stop('provider', 'test complete');
        assert.equal(host.hasCapability('data.read'), false);
        assert.equal(host.getCapability('data.read'), undefined);
        assert.equal(host.getCapabilityOwner('data.read'), null);
        assert.deepEqual(events, [
            'provider:start',
            'consumer:start',
            'consumer:stop',
            'provider:stop:test complete'
        ]);
        assert.throws(
            () => host.requireCapability('data.read', 'test'),
            error => error.code === 'MISSING_CAPABILITY' && error.details.requestedBy === 'test'
        );
    });

    it('supports static capability maps and start-result lifecycles', async () => {
        const host = new ModuleHost();
        const events = [];
        host.register({
            id: 'static_provider',
            provides: { 'static.value': 7 }
        });
        await host.start('static_provider');
        assert.equal(host.getCapability('static.value'), 7);

        host.register({
            id: 'descriptor_provider',
            provides: ['descriptor.value'],
            capabilities: { 'descriptor.value': 8 }
        });
        await host.start('descriptor_provider');
        assert.equal(host.getCapability('descriptor.value'), 8);

        host.register({
            id: 'lifecycle_provider',
            provides: ['lifecycle.value'],
            create() {
                return { capabilities: { 'lifecycle.value': 10 } };
            }
        });
        await host.start('lifecycle_provider');
        assert.equal(host.getCapability('lifecycle.value'), 10);

        host.register({
            id: 'result_provider',
            provides: ['result.value'],
            create() {
                return {
                    start() {
                        return {
                            capabilities: { 'result.value': 9 },
                            stop() { events.push('result:stop'); }
                        };
                    },
                    stop() { events.push('lifecycle:stop'); }
                };
            }
        });
        await host.start('result_provider');
        assert.equal(host.getCapability('result.value'), 9);
        await host.stop('result_provider');
        assert.deepEqual(events, ['result:stop']);

        let cleanup = 0;
        host.register({
            id: 'cleanup_result',
            provides: { 'cleanup.ready': true },
            start() { return () => { cleanup += 1; }; }
        });
        await host.start('cleanup_result');
        await host.stop('cleanup_result');
        assert.equal(cleanup, 1);
    });

    it('returns structured failures for dependencies, conflicts, and capability contract violations', async () => {
        const missing = new ModuleHost();
        missing.register({ id: 'consumer', requires: ['missing.value'], start() {} });
        await assert.rejects(
            missing.start('consumer'),
            error => error.code === 'MISSING_CAPABILITY' &&
                error.details.missing[0] === 'missing.value'
        );
        assert.equal(missing.getState('consumer').state, 'failed');
        assert.equal((await missing.stop('consumer')).state, 'stopped');

        const conflict = new ModuleHost();
        conflict.register({ id: 'first', provides: { shared: 1 } });
        conflict.register({ id: 'second', provides: { shared: 2 } });
        await conflict.start('first');
        await assert.rejects(
            conflict.start('second'),
            error => error.code === 'CAPABILITY_CONFLICT' &&
                error.details.conflicts[0].owner === 'first'
        );

        const missingProvide = new ModuleHost();
        missingProvide.register({ id: 'silent', provides: ['declared'], start() {} });
        await assert.rejects(
            missingProvide.start('silent'),
            error => error.code === 'MISSING_PROVIDED_CAPABILITY'
        );

        const undeclared = new ModuleHost();
        undeclared.register({
            id: 'undeclared',
            provides: ['allowed'],
            create(context) {
                context.provide('other', 1);
                return {};
            }
        });
        await assert.rejects(undeclared.start('undeclared'), error => error.code === 'UNDECLARED_CAPABILITY');

        const duplicate = new ModuleHost();
        duplicate.register({
            id: 'duplicate',
            provides: ['value'],
            create(context) {
                context.provide('value', 1);
                context.provide('value', 2);
                return {};
            }
        });
        await assert.rejects(
            duplicate.start('duplicate'),
            error => error.code === 'DUPLICATE_CAPABILITY_VALUE'
        );

        const invalidLifecycle = new ModuleHost();
        invalidLifecycle.register({ id: 'invalid_lifecycle', create() { return 42; } });
        await assert.rejects(
            invalidLifecycle.start('invalid_lifecycle'),
            error => error.code === 'INVALID_LIFECYCLE'
        );

        const invalidLifecycleHook = new ModuleHost();
        invalidLifecycleHook.register({
            id: 'invalid_lifecycle_hook',
            create() { return { stop: true }; }
        });
        await assert.rejects(
            invalidLifecycleHook.start('invalid_lifecycle_hook'),
            error => error.code === 'INVALID_LIFECYCLE' && error.details.hook === 'stop'
        );

        const invalidStartResult = new ModuleHost();
        invalidStartResult.register({
            id: 'invalid_start_result',
            start() { return { stop: true }; }
        });
        await assert.rejects(
            invalidStartResult.start('invalid_start_result'),
            error => error.code === 'INVALID_LIFECYCLE' && error.details.hook === 'stop'
        );

        let createdRollback = 0;
        const missingAfterCreate = new ModuleHost();
        missingAfterCreate.register({
            id: 'missing_after_create',
            provides: ['created.value'],
            create() {
                return {
                    stop(context) {
                        assert.equal(context.failedStart, true);
                        createdRollback += 1;
                    }
                };
            }
        });
        await assert.rejects(
            missingAfterCreate.start('missing_after_create'),
            error => error.code === 'MISSING_PROVIDED_CAPABILITY'
        );
        assert.equal(createdRollback, 1);

        const invalidCapabilities = new ModuleHost();
        invalidCapabilities.register({
            id: 'invalid_caps',
            provides: ['value'],
            create() { return { capabilities: [] }; }
        });
        await assert.rejects(
            invalidCapabilities.start('invalid_caps'),
            error => error.code === 'INVALID_CAPABILITIES'
        );

        const invalidScope = new ModuleHost({ createScope: () => ({ dispose() {} }) });
        invalidScope.register({ id: 'invalid_scope', start() {} });
        await assert.rejects(invalidScope.start('invalid_scope'), error => error.code === 'INVALID_SCOPE');

        const blankFailure = new ModuleHost();
        blankFailure.register({
            id: 'blank_failure',
            start() {
                const error = new ModuleHostError('', '');
                error.name = '';
                throw error;
            }
        });
        await assert.rejects(blankFailure.start('blank_failure'));
        assert.deepEqual(blankFailure.getState('blank_failure').error, {
            name: 'Error',
            message: '',
            code: null
        });
    });
});

describe('ModuleHost lifecycle state machine', () => {
    it('rolls back a failed start and permits a clean retry', async () => {
        const host = new ModuleHost();
        const events = [];
        let attempts = 0;
        host.register({
            id: 'retryable',
            provides: ['retry.service'],
            create(context) {
                attempts += 1;
                context.provide('retry.service', { attempt: attempts });
                context.scope.defer(() => events.push(`cleanup:${attempts}`));
                return {
                    start() {
                        events.push(`start:${attempts}`);
                        if (attempts === 1) throw new Error('first start failed');
                    },
                    stop(contextWithReason) {
                        events.push(`stop:${attempts}:${contextWithReason.failedStart}`);
                    }
                };
            }
        });

        await assert.rejects(
            host.start('retryable'),
            error => error.code === 'START_FAILED' && error.cause.message === 'first start failed'
        );
        assert.equal(host.getState('retryable').state, 'failed');
        assert.equal(host.hasCapability('retry.service'), false);
        assert.deepEqual(events, ['start:1', 'stop:1:true', 'cleanup:1']);

        const retried = await host.start('retryable');
        assert.equal(retried.state, 'started');
        assert.equal(retried.generation, 1);
        assert.equal(host.getCapability('retry.service').attempt, 2);
        await host.stop('retryable');
        assert.deepEqual(events.slice(-3), ['start:2', 'stop:2:false', 'cleanup:2']);
    });

    it('surfaces rollback and stop cleanup failures without leaking resources or capabilities', async () => {
        const failedStart = new ModuleHost();
        failedStart.register({
            id: 'broken_start',
            provides: { 'broken.value': true },
            create(context) {
                context.scope.defer(() => { throw new Error('dispose rollback failed'); });
                return {
                    start() { throw new Error('start failed'); },
                    stop() { throw new Error('stop rollback failed'); }
                };
            }
        });
        await assert.rejects(
            failedStart.start('broken_start'),
            error => error.code === 'START_FAILED' && error.rollbackErrors.length === 2
        );
        assert.equal(failedStart.hasCapability('broken.value'), false);

        const failedStop = new ModuleHost();
        failedStop.register({
            id: 'broken_stop',
            provides: { 'active.value': true },
            create(context) {
                context.scope.defer(() => { throw new Error('dispose failed'); });
                return { stop() { throw new Error('stop failed'); } };
            }
        });
        await failedStop.start('broken_stop');
        await assert.rejects(
            failedStop.stop('broken_stop'),
            error => error.code === 'STOP_FAILED' && error.details.errors.length === 2
        );
        assert.equal(failedStop.hasCapability('active.value'), false);
        assert.equal(failedStop.getState('broken_stop').state, 'failed');
        assert.equal((await failedStop.stop('broken_stop')).state, 'stopped');
        assert.equal((await failedStop.stop('broken_stop')).state, 'stopped');

        const NativeAggregateError = globalThis.AggregateError;
        try {
            globalThis.AggregateError = undefined;
            const legacyAggregate = new ModuleHost();
            legacyAggregate.register({
                id: 'legacy_aggregate',
                create(context) {
                    context.scope.defer(() => { throw new Error('scope cleanup'); });
                    return { stop() { throw new Error('stop cleanup'); } };
                }
            });
            await legacyAggregate.start('legacy_aggregate');
            await assert.rejects(
                legacyAggregate.stop('legacy_aggregate'),
                error => error.code === 'STOP_FAILED' &&
                    error.cause.name === 'AggregateError' &&
                    error.cause.errors.length === 2
            );
        } finally {
            globalThis.AggregateError = NativeAggregateError;
        }
    });

    it('serializes start, stop, and toggle operations', async () => {
        const host = new ModuleHost();
        const gate = deferred();
        const events = [];
        host.register({
            id: 'slow',
            create() {
                return {
                    async start() {
                        events.push('slow:start:begin');
                        await gate.promise;
                        events.push('slow:start:end');
                    },
                    stop() { events.push('slow:stop'); }
                };
            }
        });
        host.register({ id: 'fast', start() { events.push('fast:start'); } });

        const slowStart = host.start('slow');
        const fastStart = host.start('fast');
        const slowStop = host.toggle('slow', false);
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(events, ['slow:start:begin']);

        gate.resolve();
        await Promise.all([slowStart, fastStart, slowStop]);
        assert.deepEqual(events, [
            'slow:start:begin',
            'slow:start:end',
            'fast:start',
            'slow:stop'
        ]);
        assert.equal(host.getState('slow').state, 'stopped');
        assert.equal(host.getState('fast').state, 'started');

        await host.toggle('fast');
        assert.equal(host.getState('fast').state, 'stopped');
        await host.toggle('fast');
        assert.equal(host.getState('fast').state, 'started');
    });

    it('rejects lifecycle-hook reentry immediately instead of self-waiting on the queue', async () => {
        const starting = new ModuleHost();
        let startCleanup = 0;
        starting.register({
            id: 'reentrant_start',
            provides: { 'reentrant.ready': true },
            create(context) {
                context.scope.defer(() => { startCleanup += 1; });
                return {
                    async start() {
                        assert.throws(
                            () => starting.register({ id: 'late_registration', start() {} }),
                            error => error.code === 'REENTRANT_OPERATION' &&
                                error.details.activeHook === 'start'
                        );
                        await starting.stop('reentrant_start');
                    }
                };
            }
        });
        await assert.rejects(
            withWatchdog(starting.start('reentrant_start')),
            error => error.code === 'REENTRANT_OPERATION' &&
                error.details.operation === 'stop' &&
                error.details.activeModuleId === 'reentrant_start'
        );
        assert.equal(starting.getState('reentrant_start').state, 'failed');
        assert.equal(starting.hasCapability('reentrant.ready'), false);
        assert.equal(startCleanup, 1);

        const stopping = new ModuleHost();
        stopping.register({ id: 'other_module', start() {} });
        stopping.register({
            id: 'reentrant_stop',
            start() {},
            async stop() {
                await stopping.start('other_module');
            }
        });
        await stopping.start('reentrant_stop');
        await assert.rejects(
            withWatchdog(stopping.stop('reentrant_stop')),
            error => error.code === 'STOP_FAILED' &&
                error.cause.code === 'REENTRANT_OPERATION' &&
                error.cause.details.activeHook === 'stop'
        );
        assert.equal(stopping.getState('reentrant_stop').state, 'failed');
        assert.equal(stopping.getState('other_module').state, 'stopped');

        const oldSession = { id: 'old' };
        const changing = new ModuleHost({ session: oldSession });
        changing.register({
            id: 'reentrant_session',
            start() {},
            async onSessionChange(_session, context) {
                if (!context.rollback) await changing.dispose();
            }
        });
        await changing.start('reentrant_session');
        await assert.rejects(
            withWatchdog(changing.changeSession({ id: 'new' })),
            error => error.code === 'SESSION_CHANGE_FAILED' &&
                error.cause.code === 'REENTRANT_OPERATION' &&
                error.cause.details.activeHook === 'onSessionChange'
        );
        assert.equal(changing.session, oldSession);
        assert.equal(changing.disposed, false);
        await changing.dispose();
    });

    it('starts default modules in capability dependency order', async () => {
        const host = new ModuleHost({ session: { id: 'before' } });
        const order = [];
        const sessionOrder = [];
        const stopOrder = [];
        let rejectSession = true;
        host.register({
            id: 'consumer',
            defaultEnabled: true,
            requires: ['provider.ready'],
            start() { order.push('consumer'); },
            onSessionChange(_session, context) {
                sessionOrder.push(`consumer:${context.rollback}`);
                if (rejectSession && !context.rollback) throw new Error('consumer rejected session');
            },
            stop() {
                stopOrder.push(`consumer:${host.hasCapability('provider.ready')}`);
            }
        });
        host.register({
            id: 'provider',
            defaultEnabled: true,
            provides: { 'provider.ready': true },
            start() { order.push('provider'); },
            onSessionChange(_session, context) {
                sessionOrder.push(`provider:${context.rollback}`);
            },
            stop() { stopOrder.push('provider'); }
        });
        host.register({ id: 'manual', start() { order.push('manual'); } });

        assert.deepEqual(await host.startDefaults(), ['provider', 'consumer']);
        assert.deepEqual(order, ['provider', 'consumer']);
        assert.deepEqual(await host.startDefaults(), []);
        await assert.rejects(
            host.stop('provider'),
            error => error.code === 'DEPENDENCY_IN_USE' &&
                error.details.dependents[0] === 'consumer'
        );
        assert.equal(host.getState('provider').state, 'started');

        await assert.rejects(
            host.changeSession({ id: 'rejected' }),
            error => error.code === 'SESSION_CHANGE_FAILED' && error.details.moduleId === 'consumer'
        );
        assert.deepEqual(sessionOrder, [
            'provider:false',
            'consumer:false',
            'consumer:true',
            'provider:true'
        ]);
        rejectSession = false;
        await host.changeSession({ id: 'after' });
        assert.deepEqual(sessionOrder.slice(-2), ['provider:false', 'consumer:false']);
        await host.dispose('dependency shutdown');
        assert.deepEqual(stopOrder, ['consumer:true', 'provider']);

        const blocked = new ModuleHost();
        blocked.register({
            id: 'blocked_default',
            defaultEnabled: true,
            requires: ['never.ready'],
            start() {}
        });
        await assert.rejects(
            blocked.startDefaults(),
            error => error.code === 'MISSING_CAPABILITY'
        );
    });

    it('changes sessions transactionally and rolls handlers back in reverse order', async () => {
        const oldSession = { id: 'old' };
        const newSession = { id: 'new' };
        const finalSession = { id: 'final' };
        const host = new ModuleHost({ session: oldSession });
        const events = [];
        let fail = true;

        host.register({
            id: 'first',
            onSessionChange(session, context) {
                events.push(`first:${session.id}:${context.rollback}`);
            }
        });
        host.register({
            id: 'second',
            onSessionChange(session, context) {
                events.push(`second:${session.id}:${context.rollback}`);
                if (fail && !context.rollback) throw new Error('session rejected');
            }
        });
        host.register({ id: 'stopped_session_module', onSessionChange() {} });
        host.register({ id: 'started_without_session_hook', start() {} });
        await host.start('first');
        await host.start('second');
        await host.start('started_without_session_hook');

        await assert.rejects(
            host.changeSession(newSession),
            error => error.code === 'SESSION_CHANGE_FAILED' && error.details.moduleId === 'second'
        );
        assert.equal(host.session, oldSession);
        assert.deepEqual(events, [
            'first:new:false',
            'second:new:false',
            'second:old:true',
            'first:old:true'
        ]);

        fail = false;
        await host.changeSession(finalSession);
        assert.equal(host.session, finalSession);
        assert.equal(await host.changeSession(finalSession), finalSession);

        const rollbackFailure = new ModuleHost({ session: oldSession });
        rollbackFailure.register({
            id: 'rollback_breaks',
            onSessionChange(_session, context) {
                if (context.rollback) throw new Error('rollback rejected');
            }
        });
        rollbackFailure.register({
            id: 'change_breaks',
            onSessionChange(_session, context) {
                if (!context.rollback) throw new Error('change rejected');
            }
        });
        await rollbackFailure.start('rollback_breaks');
        await rollbackFailure.start('change_breaks');
        await assert.rejects(
            rollbackFailure.changeSession(newSession),
            error => error.code === 'SESSION_CHANGE_FAILED' &&
                error.details.rollbackErrors.length === 1 &&
                error.details.rollbackErrors[0].moduleId === 'rollback_breaks'
        );
    });

    it('supports legacy lifecycle aliases during incremental migration', async () => {
        const host = new ModuleHost({ session: 'before' });
        const events = [];
        host.register({
            id: 'legacy',
            init(context) { events.push(`init:${context.session}`); },
            destroy(context) { events.push(`destroy:${context.reason}`); },
            onUserChange(user, context) { events.push(`user:${user}:${context.previousSession}`); }
        });
        await host.start('legacy');
        await host.changeSession('after');
        await host.stop('legacy', 'disabled');
        assert.deepEqual(events, ['init:before', 'user:after:before', 'destroy:disabled']);

        let cleanup = 0;
        host.register({ id: 'factory_cleanup', create() { return () => { cleanup += 1; }; } });
        await host.start('factory_cleanup');
        await host.stop('factory_cleanup');
        assert.equal(cleanup, 1);
    });

    it('disposes modules in reverse order and permanently closes the host', async () => {
        const events = [];
        const host = new ModuleHost();
        host.register({ id: 'first', stop() { events.push('first'); } });
        host.register({ id: 'second', stop() { events.push('second'); } });
        await host.start('first');
        await host.start('second');
        await host.dispose('shutdown');
        assert.deepEqual(events, ['second', 'first']);
        assert.equal(host.disposed, true);
        await host.dispose();
        assert.throws(() => host.register({ id: 'later', start() {} }), error => error.code === 'HOST_DISPOSED');
        await assert.rejects(host.start('first'), error => error.code === 'HOST_DISPOSED');

        const broken = new ModuleHost();
        broken.register({ id: 'one', stop() { throw new Error('one'); } });
        broken.register({ id: 'two', stop() { throw new Error('two'); } });
        await broken.start('one');
        await broken.start('two');
        await assert.rejects(broken.dispose(), error => error.name === 'AggregateError');
        assert.equal(broken.disposed, true);
    });
});
