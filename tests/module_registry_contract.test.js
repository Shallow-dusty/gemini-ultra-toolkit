const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let ModuleRegistryController;
let LegacyPromptVaultFacade;
let MESSAGE_QUEUE_OUTBOX_CAPABILITY;
let ExportModule;
let createBatchDeleteModule;
let BULK_LIFECYCLE_ARCHIVE_CAPABILITY;

before(async () => {
    ({ ModuleRegistryController } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'module_registry.js')
    ).href));
    ({ LegacyPromptVaultFacade } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'features', 'recipes', 'legacy_facade.js')
    ).href));
    ({ MESSAGE_QUEUE_OUTBOX_CAPABILITY } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'features', 'message_queue', 'outbox.js')
    ).href));
    ({ ExportModule } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'modules', 'export.js')
    ).href));
    ({ createBatchDeleteModule } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'modules', 'batch_delete.js')
    ).href));
    ({ BULK_LIFECYCLE_ARCHIVE_CAPABILITY } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'features', 'bulk_lifecycle', 'index.js')
    ).href));
});

function createLogger() {
    const events = [];
    return {
        events,
        debug(message, details) { events.push({ level: 'debug', message, details }); },
        info(message, details) { events.push({ level: 'info', message, details }); },
        error(message, details) { events.push({ level: 'error', message, details }); }
    };
}

function createStorage(initial = null) {
    const values = new Map();
    if (initial !== null) values.set('gemini_enabled_modules', initial);
    const writes = [];
    return {
        writes,
        get(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
        set(key, next) {
            values.set(key, next);
            writes.push({ key, value: Array.isArray(next) ? [...next] : next });
        },
        setValue(next) { values.set('gemini_enabled_modules', next); },
        get value() { return values.get('gemini_enabled_modules') ?? null; },
        get pending() { return values.get('gemini_enabled_modules_pending') ?? null; }
    };
}

function createFakeHost({ events = [], behavior = {} } = {}) {
    const descriptors = new Map();
    const states = new Map();
    return {
        descriptors,
        states,
        register(descriptor) {
            events.push(`register:${descriptor.id}`);
            if (behavior.register) behavior.register(descriptor);
            descriptors.set(descriptor.id, descriptor);
            states.set(descriptor.id, 'stopped');
        },
        async start(id) {
            events.push(`start:${id}`);
            if (behavior.start) await behavior.start(id, this);
            states.set(id, 'started');
            const descriptor = descriptors.get(id);
            await descriptor.start?.({ id });
            return { id, state: 'started' };
        },
        async stop(id, reason) {
            events.push(`stop:${id}:${reason}`);
            if (behavior.stop) await behavior.stop(id, reason, this);
            states.set(id, 'stopped');
            const descriptor = descriptors.get(id);
            await descriptor.stop?.({ id, reason });
            return { id, state: 'stopped' };
        },
        getState(id) { return { id, state: states.get(id) }; },
        async changeSession(user) {
            events.push(`session:${user}`);
            if (behavior.changeSession) await behavior.changeSession(user, this);
            for (const descriptor of descriptors.values()) {
                if (states.get(descriptor.id) === 'started') {
                    await descriptor.onSessionChange?.(user, { id: descriptor.id });
                }
            }
        },
        async dispose(reason) {
            events.push(`dispose:${reason}`);
            if (behavior.dispose) await behavior.dispose(reason, this);
            for (const id of states.keys()) states.set(id, 'stopped');
        },
        list() {
            return Array.from(states, ([id, state]) => ({ id, state }));
        }
    };
}

function createRegistry({ saved = null, storage, logger, host, behavior } = {}) {
    const actualStorage = storage || createStorage(saved);
    const actualLogger = logger || createLogger();
    const actualHost = host || createFakeHost({ behavior });
    const registry = new ModuleRegistryController({
        storage: actualStorage,
        logger: actualLogger,
        createHost: () => actualHost
    });
    return { registry, storage: actualStorage, logger: actualLogger, host: actualHost };
}

describe('ModuleRegistryController validation and compatibility descriptors', () => {
    it('validates constructor, callbacks, modules, duplicates, and registration timing', async () => {
        assert.throws(() => new ModuleRegistryController({ storage: null }), /storage must implement/);
        assert.throws(() => new ModuleRegistryController({ storage: {} }), /storage must implement/);
        assert.throws(() => new ModuleRegistryController({
            storage: { get() {}, set: 1 }
        }), /storage must implement/);
        assert.throws(() => new ModuleRegistryController({
            storage: { get() {}, set() {} }, createHost: null
        }), /createHost must be a function/);

        const { registry } = createRegistry();
        assert.equal(registry.initialized, false);
        assert.equal(registry.host, null);
        for (const storage of [null, {}, { get() {}, set: true }]) {
            assert.throws(() => registry.configureRuntime({ storage }), /storage must implement/);
        }
        const replacementStorage = createStorage([]);
        assert.equal(registry.configureRuntime({ storage: replacementStorage }), registry);
        assert.equal(registry.configure(), registry);
        for (const name of ['onModuleEnabled', 'onModuleDisabled', 'onModulesChanged', 'onModuleError']) {
            assert.throws(() => registry.configure({ [name]: 1 }), new RegExp(name));
            assert.equal(registry.configure({ [name]: null }), registry);
        }

        for (const module of [null, 'x', {}, { id: '' }, { id: 1 }]) {
            assert.throws(() => registry.register(module), /requires a module with an id/);
        }
        const module = { id: 'one' };
        assert.equal(registry.register(module), module);
        assert.equal(registry.register(module), module, 'same object registration is idempotent');
        assert.throws(() => registry.register({ id: 'one' }), /already registered/);
        assert.deepEqual(registry.getAll(), [module]);

        await registry.init();
        assert.equal(registry.initialized, true);
        assert.throws(() => registry.configureRuntime({ storage: replacementStorage }), /after init/);
        assert.throws(() => registry.register({ id: 'late' }), /after ModuleRegistry.init/);
        assert.equal(await registry.init(), registry);
    });

    it('keeps legacy module receivers and maps optional lifecycle hooks', async () => {
        const events = [];
        const { registry, host } = createRegistry({ saved: ['full', 'plain'] });
        const full = {
            id: 'full',
            defaultEnabled: true,
            init(context) { events.push(`init:${this === full}:${context.id}`); },
            destroy(context) { events.push(`destroy:${this === full}:${context.reason}`); },
            onUserChange(user, context) { events.push(`user:${this === full}:${user}:${context.id}`); }
        };
        const plain = { id: 'plain', defaultEnabled: false };
        registry.register(full);
        registry.register(plain);
        await registry.init('guest');

        assert.equal(host.descriptors.get('full').defaultEnabled, true);
        assert.equal(host.descriptors.get('plain').defaultEnabled, false);
        assert.equal('start' in host.descriptors.get('plain'), false);
        assert.equal('stop' in host.descriptors.get('plain'), false);
        assert.equal('onSessionChange' in host.descriptors.get('plain'), false);
        await registry.notifyUserChange('signed');
        await registry.toggle('full', false);
        assert.deepEqual(events, [
            'init:true:full',
            'user:true:signed:full',
            'destroy:true:module disabled'
        ]);
    });

    it('rejects malformed legacy capability maps before host activation', async () => {
        for (const capabilities of [null, 'queue', []]) {
            const { registry } = createRegistry();
            registry.register({ id: 'invalid-capabilities', init() {}, capabilities });
            await assert.rejects(registry.init(), /capabilities must be an object/);
            assert.equal(registry.host, null);
            assert.equal(registry.initialized, false);
        }
    });
});

describe('ModuleRegistryController optional legacy capabilities', () => {
    it('connects the real Export and Bulk Lifecycle facades without stale providers or a hard dependency', async () => {
        const previousDocument = globalThis.document;
        const document = {
            body: {},
            createElement() { return {}; },
            getElementById() { return null; }
        };
        globalThis.document = document;
        const adapter = {
            listConversations: () => [],
            getRunScope: () => ({ kind: 'visible-sidebar', label: 'Visible', routeKey: '/app', sessionKey: 'one' }),
            getConversationSnapshot: async () => null,
            deleteConversation: async () => false,
            mountToolbar: () => null,
            mountSelectionControl: () => null,
            subscribeRouteChange: () => () => {}
        };
        const batch = createBatchDeleteModule({
            document,
            adapter,
            dialogs: { open() {} },
            translate: (_zh, en) => en,
            now: () => '2026-08-01T00:00:00.000Z'
        });
        const registry = new ModuleRegistryController({
            storage: createStorage(['export', 'batch-delete']),
            logger: createLogger()
        });
        registry.register(ExportModule);
        registry.register(batch);
        try {
            await registry.init();
            const provider = ExportModule.capabilities[BULK_LIFECYCLE_ARCHIVE_CAPABILITY];
            assert.equal(registry.host.getCapability(BULK_LIFECYCLE_ARCHIVE_CAPABILITY), provider);
            assert.equal(batch._archiveCapability, provider);
            assert.equal(batch.controller.controller.hasArchive, true);

            assert.equal(await registry.toggle('export', false), false);
            assert.equal(registry.host.getCapability(BULK_LIFECYCLE_ARCHIVE_CAPABILITY), undefined);
            assert.equal(batch._archiveCapability, null);
            assert.equal(batch.controller.controller.hasArchive, false);
            await assert.rejects(provider.archive([{ id: 'a', title: 'A' }], {
                signal: new AbortController().signal,
                scope: { kind: 'visible-sidebar' },
                capturedAt: '2026-08-01T00:00:00.000Z'
            }), error => error.code === 'ARCHIVE_UNAVAILABLE');

            assert.equal(await registry.toggle('export', true), true);
            assert.equal(batch._archiveCapability, provider);
            assert.equal(batch.controller.controller.hasArchive, true);
            assert.equal(ExportModule.capabilities[BULK_LIFECYCLE_ARCHIVE_CAPABILITY], provider);
        } finally {
            await registry.destroy('bulk archive integration complete');
            assert.equal(batch._archiveCapability, null);
            if (previousDocument === undefined) delete globalThis.document;
            else globalThis.document = previousDocument;
        }
    });

    it('connects Queue to Recipes across disabled, enabled, stopped, and re-enabled states without stale providers', async () => {
        const storage = createStorage(['prompt-vault']);
        const logger = createLogger();
        const registry = new ModuleRegistryController({ storage, logger });
        const queued = [];
        let queueStarted = false;
        const queueCapability = Object.freeze({
            enqueueEntries(entries) {
                if (!queueStarted) throw new Error('stale queue provider');
                queued.push(...entries);
                return entries.length;
            }
        });
        const queue = {
            id: 'message-queue',
            capabilities: { [MESSAGE_QUEUE_OUTBOX_CAPABILITY]: queueCapability },
            init() { queueStarted = true; },
            destroy() { queueStarted = false; }
        };

        // Reuse the production facade's capability merge and queue accessor,
        // while keeping the lifecycle fixture independent from browser DOM.
        const recipe = Object.create(LegacyPromptVaultFacade.prototype);
        Object.assign(recipe, {
            id: 'prompt-vault',
            defaultEnabled: true,
            _capabilities: {},
            initialQueue: 'unset',
            init(context) {
                this.initialQueue = context.getCapability(MESSAGE_QUEUE_OUTBOX_CAPABILITY);
            },
            destroy() {},
            async handoff(entries) {
                const provider = this._queueCapability();
                if (!provider) return false;
                return provider.enqueueEntries(entries, { idPrefix: 'recipe' });
            }
        });

        registry.register(recipe);
        registry.register(queue);
        await registry.init();
        assert.equal(recipe.initialQueue, undefined, 'queue is optional and starts later in catalog order');
        assert.equal(recipe._queueCapability(), null);
        assert.equal(await recipe.handoff([{ text: 'unavailable' }]), false);

        assert.equal(await registry.toggle('message-queue', true), true);
        assert.equal(registry.host.getCapability(MESSAGE_QUEUE_OUTBOX_CAPABILITY), queueCapability);
        assert.equal(recipe._queueCapability(), queueCapability);
        assert.equal(await recipe.handoff([{ text: 'first' }]), 1);
        assert.deepEqual(queued.map(entry => entry.text), ['first']);

        const firstProvider = recipe._queueCapability();
        assert.equal(await registry.toggle('message-queue', false), false);
        assert.equal(registry.host.getCapability(MESSAGE_QUEUE_OUTBOX_CAPABILITY), undefined);
        assert.equal(recipe._queueCapability(), null);
        assert.equal(await recipe.handoff([{ text: 'must-not-queue' }]), false);
        assert.deepEqual(queued.map(entry => entry.text), ['first']);
        assert.notEqual(recipe._queueCapability(), firstProvider);

        assert.equal(await registry.toggle('message-queue', true), true);
        assert.equal(recipe._queueCapability(), queueCapability);
        assert.equal(await recipe.handoff([{ text: 'second' }]), 1);
        assert.deepEqual(queued.map(entry => entry.text), ['first', 'second']);

        await registry.destroy('capability test complete');
        assert.equal(recipe._queueCapability(), null);
        assert.equal(queueStarted, false);
    });

    it('filters inactive owners, supports legacy aliases, and isolates snapshot/consumer failures', async () => {
        const logger = createLogger();
        const { registry } = createRegistry({ logger });
        const configured = [];
        registry.register({
            id: 'consumer',
            configureCapabilities(capabilities) { configured.push(capabilities); }
        });
        registry.register({
            id: 'broken-consumer',
            configureCapabilities() { throw new Error('consumer rejected capabilities'); }
        });
        registry.enabledModules.add('provider');
        registry._host = {
            listCapabilities: () => [
                null,
                {},
                { name: 1, value: 'ignored' },
                { name: 'message-queue.outbox', owner: 'disabled-provider', value: 'stale' },
                { name: 'message-queue.service', owner: 'provider', value: 'service' },
                { name: 'unowned.value', value: 7 }
            ]
        };
        const snapshot = await registry._refreshOptionalCapabilities();
        assert.equal(snapshot.queue, 'service');
        assert.equal(snapshot['message-queue.service'], 'service');
        assert.equal(snapshot['message-queue.outbox'], undefined);
        assert.equal(snapshot['unowned.value'], 7);
        assert.equal(Object.isFrozen(snapshot), true);
        assert.equal(configured.at(-1).queue, 'service');
        assert.ok(logger.events.some(event =>
            event.level === 'error' && event.details.id === 'broken-consumer' && event.message.includes('capabilities')));

        registry._host = { listCapabilities: () => ({}) };
        assert.deepEqual(await registry._refreshOptionalCapabilities(), { queue: null });
        registry._host = { listCapabilities() { throw new Error('snapshot unavailable'); } };
        assert.deepEqual(await registry._refreshOptionalCapabilities(), { queue: null });
        assert.ok(logger.events.some(event => event.message.includes('capability snapshot')));
    });
});

describe('ModuleRegistryController initialization and persistence', () => {
    it('uses defaults only when no valid saved value exists and filters legacy keys', async () => {
        const changed = [];
        const { registry, storage } = createRegistry({ saved: null });
        registry.register({ id: 'default', defaultEnabled: true });
        registry.register({ id: 'off', defaultEnabled: false });
        registry.configure({ onModulesChanged: event => changed.push(event) });
        await registry.init();
        assert.equal(registry.isEnabled('default'), true);
        assert.equal(registry.isEnabled('off'), false);
        assert.deepEqual(storage.value, ['default']);
        assert.equal(changed[0].reason, 'init');
        assert.equal(changed[0].enabled, null);
        assert.deepEqual([...changed[0].enabledModules], ['default']);

        const filtered = createRegistry({ saved: ['off', 'missing', 'off', 1, null] });
        filtered.registry.register({ id: 'default', defaultEnabled: true });
        filtered.registry.register({ id: 'off', defaultEnabled: false });
        await filtered.registry.init();
        assert.equal(filtered.registry.isEnabled('default'), false);
        assert.equal(filtered.registry.isEnabled('off'), true);
        assert.deepEqual(filtered.storage.value, ['off']);
    });

    it('treats malformed saved values as explicitly empty and storage failures as defaults', async () => {
        const malformed = createRegistry({ saved: { no: 'array' } });
        malformed.registry.register({ id: 'default', defaultEnabled: true });
        await malformed.registry.init();
        assert.equal(malformed.registry.isEnabled('default'), false);

        for (const saved of [undefined, null]) {
            const storage = createStorage(saved);
            const fx = createRegistry({ storage });
            fx.registry.register({ id: 'default', defaultEnabled: true });
            await fx.registry.init();
            assert.equal(fx.registry.isEnabled('default'), true);
        }

        const readFailure = createRegistry({
            storage: {
                get() { throw new Error('read blocked'); },
                set() { throw new Error('write blocked'); }
            }
        });
        readFailure.registry.register({ id: 'default', defaultEnabled: true });
        await readFailure.registry.init();
        assert.equal(readFailure.registry.isEnabled('default'), true);
        assert.doesNotThrow(() => readFailure.registry.save());
    });

    it('contains per-module default startup failures and reports observer failures safely', async () => {
        const callbackEvents = [];
        const host = createFakeHost({
            behavior: { start(id) { if (id === 'bad') throw new Error('bad default'); } }
        });
        const { registry, logger, storage } = createRegistry({ saved: ['bad', 'good'], host });
        registry.register({ id: 'bad' });
        registry.register({ id: 'good' });
        registry.configure({
            onModulesChanged(event) {
                callbackEvents.push(event.reason);
                throw new Error('render failed');
            },
            onModuleError(event) {
                callbackEvents.push(`${event.phase}:${event.id}`);
                throw new Error('report failed');
            }
        });
        await registry.init();
        assert.equal(registry.isEnabled('bad'), false);
        assert.equal(registry.isDesired('bad'), true);
        assert.equal(registry.isFailed('bad'), true);
        assert.equal(registry.isEnabled('good'), true);
        assert.equal(registry.isDesired('good'), true);
        assert.equal(registry.isFailed('good'), false);
        assert.deepEqual(storage.value, ['bad', 'good']);
        assert.deepEqual(callbackEvents, ['init:bad', 'init']);
        assert.match(logger.events.find(event => event.level === 'error').message, /Module init failed/);
    });

    it('uses a harmless fallback or an explicitly configured storage port', async () => {
        const fallback = new ModuleRegistryController();
        fallback.register({ id: 'plain', defaultEnabled: true, init() {} });
        await fallback.init();
        assert.equal(fallback.isEnabled('plain'), true);
        await fallback.destroy();

        const storage = createStorage(['injected']);
        const injected = new ModuleRegistryController();
        injected.configureRuntime({ storage });
        injected.register({ id: 'injected', init() {} });
        await injected.init();
        assert.equal(injected.isEnabled('injected'), true);
        assert.deepEqual(storage.value, ['injected']);
        await injected.destroy();
    });

    it('clears failed desired state on explicit disable and does not retry after restart', async () => {
        let attempts = 0;
        const storage = createStorage(['fragile']);
        const first = createRegistry({
            storage,
            behavior: { start() { attempts += 1; throw new Error('startup failed'); } }
        });
        first.registry.register({ id: 'fragile' });
        await first.registry.init();
        assert.equal(attempts, 1);
        assert.equal(first.registry.isEnabled('fragile'), false);
        assert.equal(first.registry.isDesired('fragile'), true);
        assert.equal(first.registry.isFailed('fragile'), true);

        assert.equal(await first.registry.toggle('fragile', false), false);
        assert.equal(first.registry.isDesired('fragile'), false);
        assert.equal(first.registry.isFailed('fragile'), false);
        assert.deepEqual(storage.value, []);

        const restarted = createRegistry({ storage, behavior: { start() { attempts += 1; } } });
        restarted.registry.register({ id: 'fragile' });
        await restarted.registry.init();
        assert.equal(attempts, 1);
        assert.equal(restarted.registry.isEnabled('fragile'), false);
    });

    it('retries a failed desired module when explicitly enabled', async () => {
        let attempts = 0;
        const { registry, storage } = createRegistry({
            saved: ['fragile'],
            behavior: {
                start() {
                    attempts += 1;
                    if (attempts === 1) throw new Error('first start failed');
                }
            }
        });
        registry.register({ id: 'fragile' });
        await registry.init();
        assert.equal(registry.isFailed('fragile'), true);

        assert.equal(await registry.toggle('fragile', true), true);
        assert.equal(attempts, 2);
        assert.equal(registry.isEnabled('fragile'), true);
        assert.equal(registry.isDesired('fragile'), true);
        assert.equal(registry.isFailed('fragile'), false);
        assert.deepEqual(storage.value, ['fragile']);
    });

    it('restores failed desired state when an inactive disable observer rejects', async () => {
        const { registry, storage } = createRegistry({
            saved: ['fragile'],
            behavior: { start() { throw new Error('startup failed'); } }
        });
        registry.register({ id: 'fragile' });
        registry.configure({ onModuleDisabled() { throw new Error('observer rejected disable'); } });
        await registry.init();

        await assert.rejects(registry.toggle('fragile', false), /observer rejected disable/);
        assert.equal(registry.isEnabled('fragile'), false);
        assert.equal(registry.isDesired('fragile'), true);
        assert.equal(registry.isFailed('fragile'), true);
        assert.deepEqual(storage.value, ['fragile']);
    });
});

describe('ModuleRegistryController serialized toggles and rollback', () => {
    it('serializes concurrent requests and supports implicit, explicit, and no-op toggles', async () => {
        const events = [];
        let releaseStart;
        const gate = new Promise(resolve => { releaseStart = resolve; });
        let gateFirstStart = true;
        const host = createFakeHost({
            events,
            behavior: {
                async start(id) {
                    if (id === 'serial' && gateFirstStart) {
                        gateFirstStart = false;
                        events.push('start-wait');
                        await gate;
                    }
                }
            }
        });
        const { registry } = createRegistry({ host });
        registry.register({ id: 'serial' });
        await registry.init();

        const enable = registry.toggle('serial');
        const disable = registry.toggle('serial', false);
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(events.slice(-2), ['start:serial', 'start-wait']);
        releaseStart();
        assert.equal(await enable, true);
        assert.equal(await disable, false);
        assert.equal(registry.isEnabled('serial'), false);
        assert.equal(await registry.toggle('serial', false), false);
        assert.equal(await registry.toggle('serial', true), true);
        assert.equal(await registry.toggle('serial', true), true);
        await assert.rejects(registry.toggle('missing', true), /Unknown module/);
    });

    it('rolls a failed enable callback back, including rollback-stop failure details', async () => {
        let stopFails = false;
        const host = createFakeHost({
            behavior: {
                stop(_id, _reason, instance) {
                    if (stopFails) {
                        instance.states.set('fragile', 'failed');
                        throw new Error('rollback stop failed');
                    }
                }
            }
        });
        const errors = [];
        const { registry, storage } = createRegistry({ host });
        registry.register({ id: 'fragile' });
        registry.configure({
            onModuleEnabled() { throw new Error('UI inject failed'); },
            onModuleError(event) { errors.push(event); }
        });
        await registry.init();

        const first = await registry.toggle('fragile', true).catch(error => error);
        assert.match(first.message, /UI inject failed/);
        assert.equal(host.getState('fragile').state, 'stopped');
        assert.equal(registry.isEnabled('fragile'), false);
        assert.equal(registry.isDesired('fragile'), true);
        assert.equal(registry.isFailed('fragile'), true);
        assert.deepEqual(storage.value, ['fragile']);

        stopFails = true;
        const second = await registry.toggle('fragile', true).catch(error => error);
        assert.match(second.rollbackError.message, /rollback stop failed/);
        assert.equal(registry.isEnabled('fragile'), false);
        assert.equal(errors.length, 2);
    });

    it('rolls host start failures back when no stop is necessary', async () => {
        const host = createFakeHost({
            behavior: { start() { throw new Error('host start failed'); } }
        });
        const { registry } = createRegistry({ host });
        registry.register({ id: 'fragile' });
        await registry.init();
        const error = await registry.toggle('fragile', true).catch(value => value);
        assert.match(error.message, /host start failed/);
        assert.equal(registry.isEnabled('fragile'), false);
    });

    it('rolls a failed disable callback back to started', async () => {
        const host = createFakeHost();
        const errors = [];
        const { registry, storage } = createRegistry({ saved: ['active'], host });
        registry.register({ id: 'active' });
        registry.configure({
            onModuleDisabled() { throw new Error('UI teardown failed'); },
            onModuleError(event) { errors.push(event); }
        });
        await registry.init();
        const error = await registry.toggle('active', false).catch(value => value);
        assert.match(error.message, /UI teardown failed/);
        assert.equal(registry.isEnabled('active'), true);
        assert.equal(host.getState('active').state, 'started');
        assert.deepEqual(storage.value, ['active']);
        assert.equal(errors[0].phase, 'disable');
    });

    it('preserves enabled state after host stop failure and exposes restart rollback failure', async () => {
        let stopMode = 'throw-started';
        const host = createFakeHost({
            behavior: {
                stop(_id, _reason, instance) {
                    if (stopMode === 'throw-started') throw new Error('stop failed');
                    if (stopMode === 'throw-failed') {
                        instance.states.set('active', 'failed');
                        throw new Error('stop failed badly');
                    }
                },
                start() {
                    if (stopMode === 'throw-failed') throw new Error('restart failed');
                }
            }
        });
        const { registry } = createRegistry({ saved: ['active'], host });
        registry.register({ id: 'active' });
        await registry.init();

        const first = await registry.toggle('active', false).catch(error => error);
        assert.match(first.message, /stop failed/);
        assert.equal(registry.isEnabled('active'), true);

        stopMode = 'throw-failed';
        const second = await registry.toggle('active', false).catch(error => error);
        assert.match(second.rollbackError.message, /restart failed/);
        assert.equal(registry.isEnabled('active'), false);
    });
});

describe('ModuleRegistryController session, destroy, and callback isolation', () => {
    it('stages desired module ids without mutating the active map and adopts them on the next init', async () => {
        const storage = createStorage(['one']);
        const { registry, host } = createRegistry({ storage });
        registry.register({ id: 'one' });
        registry.register({ id: 'two' });
        await registry.init();

        const receipt = await registry.stageDesiredModules(['two']);
        assert.deepEqual(receipt, { desiredModules: ['two'], reloadRequired: true });
        assert.equal(Object.isFrozen(receipt), true);
        assert.equal(Object.isFrozen(receipt.desiredModules), true);
        assert.deepEqual([...registry.desiredModules], ['one']);
        assert.deepEqual(registry.getDesiredModulesPreference(), ['two']);
        assert.deepEqual(storage.pending, ['two']);
        assert.equal(host.getState('one').state, 'started');
        assert.equal(host.getState('two').state, 'stopped');

        await assert.rejects(registry.stageDesiredModules(null), /must be an array/);
        await assert.rejects(registry.stageDesiredModules(['missing']), /Unknown staged module/);
        await assert.rejects(registry.stageDesiredModules(['two', 'two']), /Duplicate staged module/);
        assert.deepEqual(registry.getDesiredModulesPreference(), ['two']);

        await registry.destroy('reload');
        await registry.init();
        assert.deepEqual([...registry.desiredModules], ['two']);
        assert.deepEqual(registry.getDesiredModulesPreference(), ['two']);
        assert.equal(storage.pending, null);
        assert.deepEqual(storage.value, ['two']);
        assert.equal(host.getState('one').state, 'stopped');
        assert.equal(host.getState('two').state, 'started');
    });

    it('keeps the prior pending preference when staging persistence fails', async () => {
        const storage = createStorage(['one']);
        const originalSet = storage.set;
        const { registry } = createRegistry({ storage });
        registry.register({ id: 'one' });
        registry.register({ id: 'two' });
        await registry.init();
        await registry.stageDesiredModules(['two']);
        storage.set = (key, value) => {
            if (key === 'gemini_enabled_modules_pending') throw new Error('pending write failed');
            return originalSet.call(storage, key, value);
        };
        await assert.rejects(registry.stageDesiredModules(['one']), /pending write failed/);
        assert.deepEqual(registry.getDesiredModulesPreference(), ['two']);
        assert.deepEqual(storage.pending, ['two']);
    });

    it('does not clear a pending map until adoption persistence succeeds', async () => {
        for (const failingKey of ['gemini_enabled_modules', 'gemini_enabled_modules_pending']) {
            const storage = createStorage(['one']);
            storage.set('gemini_enabled_modules_pending', ['two']);
            const originalSet = storage.set;
            storage.set = (key, value) => {
                if (key === failingKey) throw new Error(`failed:${key}`);
                return originalSet.call(storage, key, value);
            };
            const logger = createLogger();
            const { registry, host } = createRegistry({ storage, logger });
            registry.register({ id: 'one' });
            registry.register({ id: 'two' });
            await registry.init();
            assert.deepEqual([...registry.desiredModules], ['two']);
            assert.deepEqual(registry.getDesiredModulesPreference(), ['two']);
            assert.deepEqual(storage.pending, ['two']);
            assert.equal(host.getState('two').state, 'started');
            assert.match(logger.events.find(event => event.level === 'error').message, /pending module adoption/);
        }
    });

    it('returns session changes and serializes them through the host', async () => {
        const { registry, host } = createRegistry();
        const users = [];
        registry.register({ id: 'one', defaultEnabled: true, onUserChange(user) { users.push(user); } });
        assert.equal(await registry.notifyUserChange('signed'), 'signed');
        assert.equal(host.descriptors.size, 1);
        assert.equal(registry.initialized, true);
        assert.deepEqual(users, ['signed']);
    });

    it('destroys empty and active registries and resets state even when disposal rejects', async () => {
        const empty = createRegistry();
        await empty.registry.destroy();
        assert.equal(empty.registry.initialized, false);
        assert.deepEqual([...empty.registry.enabledModules], []);

        const changes = [];
        const activeHost = createFakeHost({
            behavior: { dispose() { throw new Error('dispose failed'); } }
        });
        const active = createRegistry({ saved: ['one'], host: activeHost });
        active.registry.register({ id: 'one' });
        active.registry.configure({ onModulesChanged: event => changes.push(event) });
        await active.registry.init();
        await assert.rejects(active.registry.destroy('shutdown'), /dispose failed/);
        assert.equal(active.registry.host, null);
        assert.equal(active.registry.initialized, false);
        assert.deepEqual([...active.registry.enabledModules], []);
        assert.equal(changes.at(-1).reason, 'destroy');
    });

    it('emits stable toggle payloads and isolates change/error observers', async () => {
        const changes = [];
        const errors = [];
        const host = createFakeHost({ behavior: { start() { throw new Error('bad'); } } });
        const { registry } = createRegistry({ host });
        registry.register({ id: 'one' });
        registry.configure({
            onModulesChanged(event) { changes.push(event); },
            onModuleError(event) { errors.push(event); }
        });
        await registry.init();
        await registry.toggle('one', true).catch(() => {});
        assert.equal(changes.at(-1).id, 'one');
        assert.equal(changes.at(-1).enabled, false);
        assert.equal(changes.at(-1).reason, 'rollback');
        assert.equal(errors.at(-1).phase, 'enable');

        registry.configure({});
        registry._emitChanged('one', 'manual');
        registry._reportError('one', 'manual', new Error('manual'));
    });
});
