const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let preferences;

before(async () => {
    const entry = pathToFileURL(path.join(__dirname, '..', 'src', 'features', 'preferences', 'index.js'));
    preferences = await import(entry.href);
});

function metadata(id, options = {}) {
    return {
        id,
        labelKey: `label.${id}`,
        descriptionKey: `description.${id}`,
        defaultEnabled: false,
        experimental: false,
        requires: [],
        conflicts: [],
        ...options
    };
}

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

class FakePreferencesStorage {
    constructor(value = null) {
        this.scope = Object.freeze({ kind: 'global', readOnly: false });
        this.value = clone(value);
        this.loads = 0;
        this.saves = [];
        this.flushes = 0;
        this.loadGate = null;
        this.saveFailure = null;
        this.flushFailure = null;
    }

    async load() {
        this.loads += 1;
        if (this.loadGate) await this.loadGate;
        return clone(this.value);
    }

    async save(value) {
        const call = this.saves.length + 1;
        this.saves.push(clone(value));
        const failure = this.saveFailure?.(call, value);
        if (failure) throw failure;
        this.value = clone(value);
        return clone(value);
    }

    async flush() {
        this.flushes += 1;
        const failure = this.flushFailure?.(this.flushes);
        if (failure) throw failure;
    }
}

function expectCode(error, code) {
    return error instanceof preferences.PreferencesError && error.code === code;
}

describe('preferences metadata catalog', () => {
    it('publishes stable compatibility metadata as immutable copies', () => {
        const {
            DEFAULT_MODULE_METADATA,
            PreferencesCatalog,
            immutablePreferencesCopy,
            assertModuleId
        } = preferences;
        assert.deepEqual(DEFAULT_MODULE_METADATA.map(item => item.id), [
            'counter', 'export', 'folders', 'prompt-vault', 'message-queue',
            'default-model', 'batch-delete', 'quote-reply', 'ui-tweaks', 'chat-notes'
        ]);
        assert.deepEqual(
            DEFAULT_MODULE_METADATA.filter(item => item.defaultEnabled).map(item => item.id),
            ['counter', 'export']
        );
        assert.deepEqual(
            DEFAULT_MODULE_METADATA.filter(item => item.experimental).map(item => item.id),
            ['message-queue', 'batch-delete']
        );
        assert.ok(DEFAULT_MODULE_METADATA.every(item => (
            item.labelKey.endsWith('.label')
            && item.descriptionKey.endsWith('.description')
            && Array.isArray(item.requires)
            && Array.isArray(item.conflicts)
            && Object.isFrozen(item)
        )));

        const source = { nested: [{ count: 1 }], plain: true };
        const copied = immutablePreferencesCopy(source);
        source.nested[0].count = 9;
        assert.deepEqual(copied, { nested: [{ count: 1 }], plain: true });
        assert.equal(Object.isFrozen(copied.nested[0]), true);
        assert.equal(immutablePreferencesCopy(null), null);
        assert.equal(immutablePreferencesCopy('plain'), 'plain');
        assert.equal(assertModuleId('valid-id'), 'valid-id');

        const catalog = new PreferencesCatalog();
        const first = catalog.get('counter');
        assert.notEqual(first, catalog.get('counter'));
        assert.deepEqual(catalog.ids, DEFAULT_MODULE_METADATA.map(item => item.id));
        assert.deepEqual(catalog.defaultEnabledIds(), ['counter', 'export']);
        assert.equal(catalog.has('missing'), false);
        assert.equal(catalog.list().length, 10);

        const defaultsLists = new PreferencesCatalog([{
            id: 'minimal',
            labelKey: 'label.minimal',
            descriptionKey: 'description.minimal'
        }]);
        assert.deepEqual(defaultsLists.get('minimal').requires, []);
        assert.deepEqual(defaultsLists.get('minimal').conflicts, []);
    });

    it('rejects malformed descriptors, duplicate ids, and broken references', () => {
        const { PreferencesCatalog, assertModuleId } = preferences;
        for (const value of [null, [], 'bad']) {
            assert.throws(() => new PreferencesCatalog(value), error => expectCode(error, 'INVALID_CATALOG'));
        }
        for (const value of [null, [], 'bad']) {
            assert.throws(() => new PreferencesCatalog([value]), error => expectCode(error, 'INVALID_METADATA'));
        }
        for (const value of [null, '', 'Bad Id', ' leading', 'trailing ']) {
            assert.throws(() => assertModuleId(value), error => expectCode(error, 'INVALID_MODULE_ID'));
        }
        for (const bad of [
            { ...metadata('valid'), labelKey: '' },
            { ...metadata('valid'), labelKey: ' untrimmed' },
            { ...metadata('valid'), labelKey: 7 },
            { ...metadata('valid'), descriptionKey: '' },
            { ...metadata('valid'), defaultEnabled: 'yes' },
            { ...metadata('valid'), experimental: 1 },
            { ...metadata('valid'), requires: 'base' },
            { ...metadata('valid'), requires: ['Bad Id'] },
            { ...metadata('valid'), requires: ['base', 'base'] },
            { ...metadata('valid'), requires: ['valid'] },
            { ...metadata('valid'), conflicts: 'base' },
            { ...metadata('valid'), conflicts: ['valid'] }
        ]) {
            assert.throws(() => new PreferencesCatalog([bad]), error => (
                error.code === 'INVALID_METADATA' || error.code === 'INVALID_MODULE_ID'
            ));
        }

        assert.throws(
            () => new PreferencesCatalog([metadata('same'), metadata('same')]),
            error => expectCode(error, 'DUPLICATE_MODULE')
        );
        assert.throws(
            () => new PreferencesCatalog([metadata('one', { requires: ['missing'] })]),
            error => expectCode(error, 'UNKNOWN_METADATA_REFERENCE') && error.details.field === 'requires'
        );
        assert.throws(
            () => new PreferencesCatalog([metadata('one', { conflicts: ['missing'] })]),
            error => expectCode(error, 'UNKNOWN_METADATA_REFERENCE') && error.details.field === 'conflicts'
        );
    });

    it('detects dependency cycles and unsatisfiable dependency closures', () => {
        const { PreferencesCatalog } = preferences;
        assert.throws(
            () => new PreferencesCatalog([
                metadata('alpha', { requires: ['beta'] }),
                metadata('beta', { requires: ['alpha'] })
            ]),
            error => expectCode(error, 'DEPENDENCY_CYCLE') && error.details.path.length === 3
        );
        assert.throws(
            () => new PreferencesCatalog([
                metadata('alpha', { requires: ['beta', 'gamma'] }),
                metadata('beta', { conflicts: ['gamma'] }),
                metadata('gamma')
            ]),
            error => expectCode(error, 'UNSATISFIABLE_DEPENDENCY')
        );

        const diamond = new PreferencesCatalog([
            metadata('base'),
            metadata('left', { requires: ['base'] }),
            metadata('right', { requires: ['base'] }),
            metadata('top', { requires: ['left', 'right'] }),
            metadata('other', { conflicts: ['top'] })
        ]);
        assert.deepEqual(diamond.dependentsOf('base'), ['left', 'right']);
        assert.deepEqual(diamond.conflictsWith('top'), ['other']);
        assert.deepEqual(diamond.conflictsWith('other'), ['top']);
        assert.deepEqual(diamond.topological(['top', 'right', 'base', 'left']), ['base', 'left', 'right', 'top']);
        assert.throws(() => diamond.get('unknown'), error => expectCode(error, 'UNKNOWN_MODULE'));
        assert.throws(() => diamond.topological('top'), error => expectCode(error, 'INVALID_MODULE_SET'));
        assert.throws(() => diamond.topological(['top', 'top']), error => expectCode(error, 'INVALID_MODULE_SET'));
        assert.throws(() => diamond.topological(['unknown']), error => expectCode(error, 'UNKNOWN_MODULE'));
    });
});

describe('global raw-array persistence adapter', () => {
    it('requires the exact account-independent key, scope, and port interface', () => {
        const { GlobalPreferencesStorageAdapter, GLOBAL_PREFERENCES_SCOPE } = preferences;
        for (const port of [null, {}, { get() {} }, { get() {}, set() {} }]) {
            assert.throws(() => new GlobalPreferencesStorageAdapter({ port }), error => expectCode(error, 'INVALID_STORAGE_PORT'));
        }
        const port = { get() {}, set() {}, flush() {} };
        for (const scope of [
            null,
            { kind: 'session', readOnly: false },
            { kind: 'global', readOnly: true },
            { kind: 'global', readOnly: false, sessionUserId: 'person' },
            { kind: 'global', readOnly: false, targetUserId: 'person' }
        ]) {
            assert.throws(
                () => new GlobalPreferencesStorageAdapter({ port, scope }),
                error => expectCode(error, 'INVALID_PREFERENCES_SCOPE')
            );
        }
        assert.throws(
            () => new GlobalPreferencesStorageAdapter({ port, key: 'renamed' }),
            error => expectCode(error, 'INVALID_PREFERENCES_KEY')
        );
        assert.deepEqual(GLOBAL_PREFERENCES_SCOPE, { kind: 'global', readOnly: false });
        assert.equal(Object.isFrozen(GLOBAL_PREFERENCES_SCOPE), true);
    });

    it('loads, saves, clones, and flushes the legacy array value', async () => {
        const {
            ENABLED_MODULES_STORAGE_KEY,
            GlobalPreferencesStorageAdapter,
            createGlobalPreferencesStorageAdapter
        } = preferences;
        const values = new Map();
        const calls = [];
        const port = {
            async get(key) { calls.push(['get', key]); return clone(values.get(key)); },
            async set(key, value) { calls.push(['set', key, clone(value)]); values.set(key, clone(value)); },
            async flush() { calls.push(['flush']); }
        };
        const adapter = createGlobalPreferencesStorageAdapter(port);
        assert.ok(adapter instanceof GlobalPreferencesStorageAdapter);
        assert.equal(adapter.key, 'gemini_enabled_modules');
        assert.equal(await adapter.load(), null);
        values.set(ENABLED_MODULES_STORAGE_KEY, null);
        assert.equal(await adapter.load(), null);

        const input = ['counter', 'future-module'];
        const saved = await adapter.save(input);
        input.push('mutated');
        saved.push('also-mutated');
        assert.deepEqual(await adapter.load(), ['counter', 'future-module']);
        const loaded = await adapter.load();
        loaded.push('caller-mutated');
        assert.deepEqual(await adapter.load(), ['counter', 'future-module']);
        await adapter.flush();
        assert.deepEqual(calls.at(-1), ['flush']);
    });

    it('rejects malformed raw storage and save inputs', async () => {
        const { GlobalPreferencesStorageAdapter } = preferences;
        let value;
        const adapter = new GlobalPreferencesStorageAdapter({
            port: {
                async get() { return value; },
                async set(_key, next) { value = next; },
                async flush() {}
            }
        });
        for (const bad of [{}, 'counter', 1]) {
            value = bad;
            await assert.rejects(adapter.load(), error => expectCode(error, 'INVALID_STORED_PREFERENCES'));
        }
        value = ['counter', 'counter'];
        await assert.rejects(adapter.load(), error => expectCode(error, 'INVALID_STORED_PREFERENCES'));
        value = ['Bad Id'];
        await assert.rejects(adapter.load(), error => expectCode(error, 'INVALID_MODULE_ID'));
        await assert.rejects(adapter.save('counter'), error => expectCode(error, 'INVALID_STORED_PREFERENCES'));
    });
});

describe('feature preference planning', () => {
    it('loads defaults globally, preserves unknown ids, and returns clone-safe snapshots', async () => {
        const { FeaturePreferencesService } = preferences;
        const emptyStorage = new FakePreferencesStorage();
        const service = new FeaturePreferencesService({ storage: emptyStorage });
        assert.equal(service.ready, false);
        assert.throws(() => service.snapshot(), error => expectCode(error, 'NOT_READY'));
        assert.throws(() => service.isEnabled('counter'), error => expectCode(error, 'NOT_READY'));
        assert.throws(() => service.preview({}), error => expectCode(error, 'NOT_READY'));
        await assert.rejects(service.apply({}), error => expectCode(error, 'NOT_READY'));
        await assert.rejects(service.rollback({}), error => expectCode(error, 'NOT_READY'));

        const snapshot = await service.load();
        assert.deepEqual(snapshot.enabledIds, ['counter', 'export']);
        assert.deepEqual(emptyStorage.saves, [['counter', 'export']]);
        assert.equal(emptyStorage.flushes, 1);
        assert.equal(service.isEnabled('counter'), true);
        assert.equal(service.isEnabled('folders'), false);
        assert.throws(() => service.isEnabled('unknown'), error => expectCode(error, 'UNKNOWN_MODULE'));
        assert.equal(Object.isFrozen(snapshot), true);
        assert.equal(Object.isFrozen(snapshot.enabledIds), true);

        const withUnknown = new FeaturePreferencesService({
            storage: new FakePreferencesStorage(['future-module', 'export'])
        });
        const unknownSnapshot = await withUnknown.load();
        assert.deepEqual(unknownSnapshot.enabledIds, ['export']);
        assert.deepEqual(unknownSnapshot.unknownIds, ['future-module']);
        assert.notEqual(withUnknown.metadata, withUnknown.metadata);
        assert.equal(Object.isFrozen(withUnknown.metadata[0]), true);
    });

    it('validates persistence and runtime interfaces plus loaded values', async () => {
        const { FeaturePreferencesService, PreferencesCatalog } = preferences;
        for (const storage of [null, {}, { load() {} }, { load() {}, save() {} }]) {
            assert.throws(() => new FeaturePreferencesService({ storage }), error => (
                expectCode(error, 'INVALID_PERSISTENCE_ADAPTER')
            ));
        }
        for (const scope of [
            null,
            { kind: 'session', readOnly: false },
            { kind: 'global', readOnly: true },
            { kind: 'global', readOnly: false, sessionUserId: 'person' },
            { kind: 'global', readOnly: false, targetUserId: 'person' }
        ]) {
            assert.throws(
                () => new FeaturePreferencesService({
                    storage: { load() {}, save() {}, flush() {}, scope }
                }),
                error => expectCode(error, 'INVALID_PERSISTENCE_SCOPE')
            );
        }
        const storage = new FakePreferencesStorage([]);
        for (const runtime of [{}, { enable() {} }, { disable() {} }]) {
            assert.throws(() => new FeaturePreferencesService({ storage, runtime }), error => (
                expectCode(error, 'INVALID_RUNTIME_ADAPTER')
            ));
        }

        const catalog = new PreferencesCatalog([metadata('only')]);
        const withCatalog = new FeaturePreferencesService({ metadata: catalog, storage });
        assert.deepEqual(withCatalog.metadata.map(item => item.id), ['only']);

        for (const value of [{}, [7], ['counter', 'counter']]) {
            const invalid = new FeaturePreferencesService({ storage: new FakePreferencesStorage(value) });
            await assert.rejects(invalid.load(), error => expectCode(error, 'INVALID_STORED_PREFERENCES'));
            assert.equal(invalid.ready, false);
        }
    });

    it('validates changes and policy options', async () => {
        const { FeaturePreferencesService } = preferences;
        const service = new FeaturePreferencesService({ storage: new FakePreferencesStorage([]) });
        await service.load();
        for (const changes of [null, [], 'counter']) {
            assert.throws(() => service.preview(changes), error => expectCode(error, 'INVALID_CHANGESET'));
        }
        assert.throws(() => service.preview({ unknown: true }), error => expectCode(error, 'UNKNOWN_MODULE'));
        assert.throws(() => service.preview({ counter: 'yes' }), error => expectCode(error, 'INVALID_CHANGESET'));
        for (const options of [null, [], 'reject']) {
            assert.throws(() => service.preview({}, options), error => expectCode(error, 'INVALID_PLAN_OPTIONS'));
        }
        for (const options of [
            { dependencyPolicy: 'disable' },
            { dependentPolicy: 'enable' },
            { conflictPolicy: 'enable' },
            { extraPolicy: 'reject' }
        ]) {
            assert.throws(() => service.preview({}, options), error => expectCode(error, 'INVALID_PLAN_OPTIONS'));
        }
    });

    it('auto-enables dependency closures in topological order', async () => {
        const { FeaturePreferencesService } = preferences;
        const modules = [
            metadata('base'),
            metadata('alpha', { requires: ['base'] }),
            metadata('leaf', { requires: ['alpha'] })
        ];
        const service = new FeaturePreferencesService({ metadata: modules, storage: new FakePreferencesStorage([]) });
        await service.load();
        const plan = service.preview({ leaf: true });
        assert.deepEqual(plan.after.enabledIds, ['base', 'alpha', 'leaf']);
        assert.deepEqual(plan.autoEnabledIds, ['base', 'alpha']);
        assert.deepEqual(plan.autoDisabledIds, []);
        assert.deepEqual(plan.operations, [
            { id: 'base', enabled: true },
            { id: 'alpha', enabled: true },
            { id: 'leaf', enabled: true }
        ]);
        assert.equal(Object.isFrozen(plan.operations[0]), true);

        assert.throws(
            () => service.preview({ leaf: true }, { dependencyPolicy: 'reject' }),
            error => expectCode(error, 'DEPENDENCY_REQUIRED')
        );
        assert.throws(
            () => service.preview({ base: false, leaf: true }),
            error => expectCode(error, 'DEPENDENCY_BLOCKED')
        );
    });

    it('cascades dependent disables or rejects them by policy', async () => {
        const { FeaturePreferencesService } = preferences;
        const modules = [
            metadata('base'),
            metadata('alpha', { requires: ['base'] }),
            metadata('leaf', { requires: ['alpha'] })
        ];
        const service = new FeaturePreferencesService({
            metadata: modules,
            storage: new FakePreferencesStorage(['base', 'alpha', 'leaf'])
        });
        await service.load();
        const plan = service.preview({ base: false });
        assert.deepEqual(plan.after.enabledIds, []);
        assert.deepEqual(plan.autoDisabledIds, ['alpha', 'leaf']);
        assert.deepEqual(plan.operations, [
            { id: 'leaf', enabled: false },
            { id: 'alpha', enabled: false },
            { id: 'base', enabled: false }
        ]);
        assert.throws(
            () => service.preview({ base: false }, { dependentPolicy: 'reject' }),
            error => expectCode(error, 'DEPENDENT_ENABLED')
        );
        assert.throws(
            () => service.preview({ base: false, leaf: true }),
            error => expectCode(error, 'DEPENDENT_BLOCKED')
        );
    });

    it('resolves conflicts deterministically and protects explicit dependency closures', async () => {
        const { FeaturePreferencesService } = preferences;
        const modules = [
            metadata('base'),
            metadata('alpha', { requires: ['base'], conflicts: ['beta'] }),
            metadata('leaf', { requires: ['alpha'] }),
            metadata('beta')
        ];
        const service = new FeaturePreferencesService({
            metadata: modules,
            storage: new FakePreferencesStorage(['beta'])
        });
        await service.load();
        const plan = service.preview({ leaf: true });
        assert.deepEqual(plan.after.enabledIds, ['base', 'alpha', 'leaf']);
        assert.deepEqual(plan.autoEnabledIds, ['base', 'alpha']);
        assert.deepEqual(plan.autoDisabledIds, ['beta']);
        assert.deepEqual(plan.operations, [
            { id: 'beta', enabled: false },
            { id: 'base', enabled: true },
            { id: 'alpha', enabled: true },
            { id: 'leaf', enabled: true }
        ]);
        assert.throws(
            () => service.preview({ leaf: true }, { conflictPolicy: 'reject' }),
            error => expectCode(error, 'MODULE_CONFLICT')
        );
        assert.throws(
            () => service.preview({ alpha: true, beta: true }),
            error => expectCode(error, 'MODULE_CONFLICT')
        );

        const legacyConflict = new FeaturePreferencesService({
            metadata: modules,
            storage: new FakePreferencesStorage(['alpha', 'beta'])
        });
        await legacyConflict.load();
        assert.deepEqual(legacyConflict.preview({}).after.enabledIds, ['base', 'alpha']);

        const breakCatalog = [
            metadata('alpha', { conflicts: ['beta', 'gamma'] }),
            metadata('beta'),
            metadata('gamma')
        ];
        const protectedLater = new FeaturePreferencesService({
            metadata: breakCatalog,
            storage: new FakePreferencesStorage(['alpha', 'gamma'])
        });
        await protectedLater.load();
        const protectedPlan = protectedLater.preview({ beta: true });
        assert.deepEqual(protectedPlan.after.enabledIds, ['beta', 'gamma']);
        assert.deepEqual(protectedPlan.autoDisabledIds, ['alpha']);
    });
});

describe('transactional apply and rollback', () => {
    it('bridges ModuleHost without coupling the preferences service to it', async () => {
        const { createModuleHostPreferencesRuntime } = preferences;
        for (const host of [null, {}, { start() {} }]) {
            assert.throws(() => createModuleHostPreferencesRuntime(host), error => expectCode(error, 'INVALID_MODULE_HOST'));
        }
        const calls = [];
        const bridge = createModuleHostPreferencesRuntime({
            start(id) { calls.push(['start', id]); return `started:${id}`; },
            stop(id, reason) { calls.push(['stop', id, reason]); return `stopped:${id}`; }
        });
        assert.equal(await bridge.enable('counter'), 'started:counter');
        assert.equal(await bridge.disable('counter'), 'stopped:counter');
        assert.deepEqual(calls, [
            ['start', 'counter'],
            ['stop', 'counter', 'disabled by feature preferences']
        ]);
        assert.equal(Object.isFrozen(bridge), true);
    });

    it('applies cloned plans, persists unknown ids, and rolls back cloned receipts', async () => {
        const { FeaturePreferencesService } = preferences;
        const storage = new FakePreferencesStorage(['counter', 'future-module']);
        const runtimeCalls = [];
        const service = new FeaturePreferencesService({
            storage,
            runtime: {
                async enable(id) { runtimeCalls.push(['enable', id]); },
                async disable(id) { runtimeCalls.push(['disable', id]); }
            }
        });
        await service.load();
        const plan = service.preview({ counter: false, folders: true });
        const receipt = await service.apply(structuredClone(plan));
        assert.deepEqual(runtimeCalls, [['disable', 'counter'], ['enable', 'folders']]);
        assert.deepEqual(storage.value, ['folders', 'future-module']);
        assert.deepEqual(service.snapshot().enabledIds, ['folders']);
        assert.equal(receipt.revisionBefore, 1);
        assert.equal(receipt.revisionAfter, 2);
        assert.equal(Object.isFrozen(receipt), true);

        const rollbackReceipt = await service.rollback(structuredClone(receipt));
        assert.deepEqual(runtimeCalls, [
            ['disable', 'counter'], ['enable', 'folders'],
            ['disable', 'folders'], ['enable', 'counter']
        ]);
        assert.deepEqual(storage.value, ['counter', 'future-module']);
        assert.deepEqual(service.snapshot().enabledIds, ['counter']);
        assert.equal(rollbackReceipt.revisionAfter, 3);
        await assert.rejects(service.rollback(receipt), error => expectCode(error, 'UNKNOWN_RECEIPT'));
        await assert.rejects(service.apply(plan), error => expectCode(error, 'UNKNOWN_PLAN'));
    });

    it('rejects foreign, unknown, and stale plans and receipts', async () => {
        const { FeaturePreferencesService } = preferences;
        const first = new FeaturePreferencesService({ storage: new FakePreferencesStorage([]) });
        const second = new FeaturePreferencesService({ storage: new FakePreferencesStorage([]) });
        await first.load();
        await second.load();
        const foreign = first.preview({ counter: true });
        await assert.rejects(second.apply(foreign), error => expectCode(error, 'FOREIGN_PLAN'));
        await assert.rejects(first.apply(null), error => expectCode(error, 'FOREIGN_PLAN'));
        await assert.rejects(
            first.apply({ kind: foreign.kind, serviceId: foreign.serviceId, id: 'missing' }),
            error => expectCode(error, 'UNKNOWN_PLAN')
        );

        const stale = first.preview({ counter: true });
        const winning = first.preview({ export: true });
        const receipt = await first.apply(winning);
        await assert.rejects(first.apply(stale), error => expectCode(error, 'STALE_PLAN'));
        await assert.rejects(second.rollback(receipt), error => expectCode(error, 'FOREIGN_RECEIPT'));
        await assert.rejects(first.rollback(null), error => expectCode(error, 'FOREIGN_RECEIPT'));
        await assert.rejects(
            first.rollback({ kind: receipt.kind, serviceId: receipt.serviceId, id: 'missing' }),
            error => expectCode(error, 'UNKNOWN_RECEIPT')
        );

        const next = first.preview({ counter: true });
        await first.apply(next);
        await assert.rejects(first.rollback(receipt), error => expectCode(error, 'STALE_RECEIPT'));
    });

    it('invalidates plans on reload and persists no-op plans', async () => {
        const { FeaturePreferencesService } = preferences;
        const storage = new FakePreferencesStorage(['counter']);
        const service = new FeaturePreferencesService({ storage });
        await service.load();
        const stale = service.preview({ export: true });
        await service.load();
        await assert.rejects(service.apply(stale), error => expectCode(error, 'STALE_PLAN'));

        const noOp = service.preview({ counter: true });
        assert.deepEqual(noOp.operations, []);
        await service.apply(noOp);
        assert.deepEqual(storage.saves.at(-1), ['counter']);
    });

    it('serializes transactions and restores runtime after an operation failure', async () => {
        const { FeaturePreferencesService } = preferences;
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const storage = new FakePreferencesStorage([]);
        const calls = [];
        const service = new FeaturePreferencesService({
            storage,
            runtime: {
                async enable(id) {
                    calls.push(['enable', id]);
                    if (id === 'counter') await gate;
                    if (id === 'export') throw new Error('runtime failed');
                },
                async disable(id) { calls.push(['disable', id]); }
            }
        });
        await service.load();
        const plan = service.preview({ counter: true, export: true });
        const applying = service.apply(plan);
        await new Promise(resolve => setImmediate(resolve));
        await assert.rejects(service.apply(plan), error => expectCode(error, 'PREFERENCES_BUSY'));
        release();
        await assert.rejects(applying, error => (
            expectCode(error, 'APPLY_FAILED')
            && error.cause.message === 'runtime failed'
            && error.details.rollbackErrors.length === 0
        ));
        assert.deepEqual(calls, [
            ['enable', 'counter'],
            ['enable', 'export'],
            ['disable', 'counter']
        ]);
        assert.deepEqual(service.snapshot().enabledIds, []);
        assert.equal(storage.saves.length, 0);

        const primitiveFailure = new FeaturePreferencesService({
            storage: new FakePreferencesStorage([]),
            runtime: {
                async enable() { throw 'primitive failure'; },
                async disable() {}
            }
        });
        await primitiveFailure.load();
        await assert.rejects(
            primitiveFailure.apply(primitiveFailure.preview({ counter: true })),
            error => (
                expectCode(error, 'APPLY_FAILED')
                && error.details.cause.name === 'Error'
                && error.details.cause.message === 'primitive failure'
            )
        );
    });

    it('restores persistence and reports rollback failures after save or flush errors', async () => {
        const { FeaturePreferencesService } = preferences;

        const saveStorage = new FakePreferencesStorage([]);
        saveStorage.saveFailure = call => call === 1 ? new Error('target save failed') : null;
        const saveCalls = [];
        const saveService = new FeaturePreferencesService({
            storage: saveStorage,
            runtime: {
                async enable(id) { saveCalls.push(['enable', id]); },
                async disable(id) { saveCalls.push(['disable', id]); }
            }
        });
        await saveService.load();
        await assert.rejects(saveService.apply(saveService.preview({ counter: true })), error => (
            expectCode(error, 'APPLY_FAILED') && error.details.rollbackErrors.length === 0
        ));
        assert.deepEqual(saveCalls, [['enable', 'counter'], ['disable', 'counter']]);
        assert.deepEqual(saveStorage.value, []);

        const flushStorage = new FakePreferencesStorage([]);
        flushStorage.flushFailure = call => call === 1 ? new Error('target flush failed') : null;
        const flushService = new FeaturePreferencesService({ storage: flushStorage });
        await flushService.load();
        await assert.rejects(flushService.apply(flushService.preview({ export: true })), error => (
            expectCode(error, 'APPLY_FAILED') && error.details.rollbackErrors.length === 0
        ));
        assert.deepEqual(flushStorage.value, []);
        assert.equal(flushStorage.flushes, 2);

        const brokenStorage = new FakePreferencesStorage([]);
        brokenStorage.saveFailure = call => call >= 2 ? new Error(`save ${call}`) : null;
        brokenStorage.flushFailure = () => new Error('flush rollback');
        const brokenCalls = [];
        const brokenService = new FeaturePreferencesService({
            storage: brokenStorage,
            runtime: {
                async enable(id) { brokenCalls.push(['enable', id]); },
                async disable(id) { brokenCalls.push(['disable', id]); throw new Error('runtime rollback'); }
            }
        });
        await brokenService.load();
        await assert.rejects(brokenService.apply(brokenService.preview({ folders: true })), error => (
            expectCode(error, 'APPLY_FAILED') && error.details.rollbackErrors.length === 3
        ));
        assert.deepEqual(brokenCalls, [['enable', 'folders'], ['disable', 'folders']]);
        assert.deepEqual(brokenService.snapshot().enabledIds, []);
    });

    it('rejects concurrent loads and recovers from load failure', async () => {
        const { FeaturePreferencesService } = preferences;
        let release;
        const storage = new FakePreferencesStorage([]);
        storage.loadGate = new Promise(resolve => { release = resolve; });
        const service = new FeaturePreferencesService({ storage });
        const loading = service.load();
        await assert.rejects(service.load(), error => expectCode(error, 'PREFERENCES_BUSY'));
        release();
        await loading;

        const failingStorage = new FakePreferencesStorage(null);
        failingStorage.saveFailure = () => new Error('cannot persist defaults');
        const failing = new FeaturePreferencesService({ storage: failingStorage });
        await assert.rejects(failing.load(), /cannot persist defaults/);
        assert.equal(failing.ready, false);
        failingStorage.saveFailure = null;
        await failing.load();
        assert.equal(failing.ready, true);
    });
});
