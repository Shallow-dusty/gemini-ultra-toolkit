const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let storage;
let GLOBAL_STORAGE_KEYS;
let LEGACY_STORAGE_KEYS;
let STORAGE_ENVELOPE_FORMAT;
let STORAGE_SLOTS;
let STORAGE_SCOPE_KIND;
let MemoryStorageAdapter;
let ReadOnlyStorageScopeError;
let RevisionConflictError;
let StoragePort;
let StorageRepository;
let StorageValidationError;
let UnsupportedSchemaVersionError;
let createGlobalScope;
let createInspectionScope;
let createMigrationPlan;
let createMemoryStoragePort;
let createScopedRepository;
let createSessionScope;
let createStorageEnvelope;
let cloneStorageValue;
let isStorageEnvelope;
let isWritableStorageScope;
let resolveStorageKey;

before(async () => {
    storage = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'storage', 'index.js')).href);
    ({
        GLOBAL_STORAGE_KEYS,
        LEGACY_STORAGE_KEYS,
        STORAGE_ENVELOPE_FORMAT,
        STORAGE_SLOTS,
        STORAGE_SCOPE_KIND,
        MemoryStorageAdapter,
        ReadOnlyStorageScopeError,
        RevisionConflictError,
        StoragePort,
        StorageRepository,
        StorageValidationError,
        UnsupportedSchemaVersionError,
        createGlobalScope,
        createInspectionScope,
        createMigrationPlan,
        createMemoryStoragePort,
        createScopedRepository,
        createSessionScope,
        createStorageEnvelope,
        cloneStorageValue,
        isStorageEnvelope,
        isWritableStorageScope,
        resolveStorageKey
    } = storage);
});

describe('storage cloning', () => {
    it('uses the structured clone boundary without sharing caller references', () => {
        assert.equal(cloneStorageValue(undefined), undefined);
        assert.equal(cloneStorageValue(null), null);
        const input = { nested: { count: 1 } };
        const cloned = cloneStorageValue(input);
        assert.deepEqual(cloned, input);
        assert.notEqual(cloned, input);
        assert.notEqual(cloned.nested, input.nested);
    });

    it('faithfully clones every fallback type, cycle, and null prototype', () => {
        const structuredCloneDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
        Object.defineProperty(globalThis, 'structuredClone', {
            value: undefined,
            configurable: true,
            writable: true
        });
        try {
            const date = new Date('2026-08-01T00:00:00.000Z');
            const expression = /primer/giu;
            const arrayBuffer = new Uint8Array([1, 2, 3]).buffer;
            const typed = new Uint16Array([4, 5]);
            const viewBuffer = new Uint8Array([9, 8, 7, 6]).buffer;
            const view = new DataView(viewBuffer, 1, 2);
            const cyclic = { name: 'cycle' };
            cyclic.self = cyclic;
            const map = new Map([[cyclic, new Set([cyclic])]]);
            const nullPrototype = Object.create(null);
            nullPrototype.value = 7;
            const input = {
                date,
                expression,
                arrayBuffer,
                typed,
                view,
                map,
                list: [1, null, { ok: true }],
                nullPrototype
            };

            const cloned = cloneStorageValue(input);
            assert.notEqual(cloned, input);
            assert.equal(cloned.date.getTime(), date.getTime());
            assert.notEqual(cloned.date, date);
            assert.equal(cloned.expression.source, 'primer');
            assert.equal(cloned.expression.flags, expression.flags);
            assert.deepEqual([...new Uint8Array(cloned.arrayBuffer)], [1, 2, 3]);
            assert.notEqual(cloned.arrayBuffer, arrayBuffer);
            assert.deepEqual([...cloned.typed], [4, 5]);
            assert.notEqual(cloned.typed, typed);
            assert.deepEqual([cloned.view.getUint8(0), cloned.view.getUint8(1)], [8, 7]);
            const [[clonedKey, clonedSet]] = cloned.map;
            assert.equal(clonedKey.self, clonedKey);
            assert.equal([...clonedSet][0], clonedKey);
            assert.notEqual(cloned.list, input.list);
            assert.equal(Object.getPrototypeOf(cloned.nullPrototype), null);
            assert.equal(cloned.nullPrototype.value, 7);
            assert.equal(cloneStorageValue(3), 3);

            assert.throws(() => cloneStorageValue(() => {}), /structured-cloneable/);
            assert.throws(() => cloneStorageValue(Symbol('value')), /structured-cloneable/);
            assert.throws(() => cloneStorageValue({ bad() {} }), /structured-cloneable/);
            const symbolKeyed = { valid: true };
            symbolKeyed[Symbol('hidden')] = 1;
            assert.throws(() => cloneStorageValue(symbolKeyed), /structured-cloneable/);
        } finally {
            Object.defineProperty(globalThis, 'structuredClone', structuredCloneDescriptor);
        }
    });
});

describe('storage keys and scopes', () => {
    it('preserves every existing global key exactly', () => {
        assert.deepEqual(GLOBAL_STORAGE_KEYS, {
            PANEL_POSITION: 'gemini_panel_pos',
            USER_REGISTRY: 'gemini_user_registry',
            THEME: 'gemini_current_theme',
            RESET_HOUR: 'gemini_reset_hour',
            QUOTA_LIMIT: 'gemini_quota_limit',
            ENABLED_MODULES: 'gemini_enabled_modules',
            PENDING_ENABLED_MODULES: 'gemini_enabled_modules_pending',
            LOCALE: 'gemini_locale',
            DEBUG_ENABLED: 'gemini_debug_enabled',
            LOG_LEVEL: 'gemini_log_level',
            LOGS: 'gemini_logs_store',
            ONBOARDING_SEEN: 'gemini_onboarding_seen',
            ONBOARDING_LANGUAGE: 'gemini_onboarding_lang',
            TOUR_SEEN: 'gemini_tour_seen',
            UI_TWEAKS: 'gemini_ui_tweaks',
            DEFAULT_MODEL: 'gemini_default_model'
        });
        assert.deepEqual(LEGACY_STORAGE_KEYS, {
            CHAT_MAP: 'gemini_count_chats_map',
            SESSION_COUNT: 'gemini_count_session',
            TOTAL_COUNT: 'gemini_count_total',
            INTERACTION_COUNT: 'gemini_interaction_count',
            VIEW_MODE: 'gemini_view_mode',
            PANEL_POSITION: 'gemini_panel_position',
            PANEL_POSITION_V64: 'gemini_panel_pos_v64'
        });
        assert.deepEqual(STORAGE_SCOPE_KIND, {
            GLOBAL: 'global',
            SESSION: 'session',
            INSPECTION: 'inspection'
        });
    });

    it('reproduces current per-user key policies without renaming data', () => {
        const guest = createSessionScope();
        const email = createSessionScope('person@example.test');
        const named = createSessionScope('LocalProfile');

        assert.throws(
            () => resolveStorageKey(STORAGE_SLOTS.COUNTER, guest),
            /in-memory only for user Guest/
        );
        assert.equal(resolveStorageKey(STORAGE_SLOTS.COUNTER, email), 'gemini_store_person@example.test');
        assert.equal(resolveStorageKey(STORAGE_SLOTS.FOLDERS, guest), 'gemini_folders_data');
        assert.equal(resolveStorageKey(STORAGE_SLOTS.FOLDERS, email), 'gemini_folders_data_person@example.test');
        assert.equal(resolveStorageKey(STORAGE_SLOTS.FOLDERS, named), 'gemini_folders_data_LocalProfile');
        assert.equal(resolveStorageKey(STORAGE_SLOTS.PROMPT_VAULT, email), 'gemini_prompt_vault_person@example.test');
        assert.equal(resolveStorageKey(STORAGE_SLOTS.MESSAGE_QUEUE, email), 'gemini_message_queue_person@example.test');
        assert.equal(resolveStorageKey(STORAGE_SLOTS.CHAT_NOTES, email), 'gemini_chat_notes_person@example.test');
        assert.equal(resolveStorageKey(STORAGE_SLOTS.CHAT_NOTES, named), 'gemini_chat_notes');
        assert.throws(() => resolveStorageKey('missing', guest), /Unknown user storage slot/);
        assert.throws(() => resolveStorageKey(STORAGE_SLOTS.FOLDERS, createGlobalScope()), /Storage target user id/);
    });

    it('keeps writable session identity separate from read-only inspection identity', () => {
        const session = createSessionScope('active@example.test');
        const inspection = createInspectionScope(session, 'other@example.test');
        const global = createGlobalScope();

        assert.equal(isWritableStorageScope(session), true);
        assert.equal(isWritableStorageScope(inspection), false);
        assert.equal(isWritableStorageScope(global), true);
        assert.equal(isWritableStorageScope({ ...global, readOnly: true }), false);
        assert.equal(isWritableStorageScope({ ...session, readOnly: true }), false);
        assert.equal(isWritableStorageScope({ ...session, targetUserId: 'different@example.test' }), false);
        assert.equal(isWritableStorageScope({ kind: 'unknown', readOnly: false }), false);
        assert.equal(isWritableStorageScope(null), false);
        assert.equal(inspection.sessionUserId, 'active@example.test');
        assert.equal(inspection.targetUserId, 'other@example.test');
        assert.equal(Object.isFrozen(inspection), true);
        assert.equal(createSessionScope('  trimmed@example.test  ').sessionUserId, 'trimmed@example.test');
        assert.equal(createInspectionScope('active@example.test', 'other@example.test').sessionUserId, 'active@example.test');
        for (const invalid of [null, '', '   ']) {
            assert.throws(() => createSessionScope(invalid), /Session user id/);
        }
        assert.throws(() => createInspectionScope(null, 'other@example.test'), /Session user id/);
        assert.throws(() => createInspectionScope(session, ''), /Inspection target user id/);
    });
});

describe('StoragePort', () => {
    it('isolates adapter, caller, read result and subscriber references', async () => {
        const seed = { nested: { count: 1 } };
        const adapter = new MemoryStorageAdapter({ sample: seed });
        const port = new StoragePort(adapter);
        seed.nested.count = 99;

        const firstRead = await port.get('sample');
        firstRead.nested.count = 2;
        assert.equal((await port.get('sample')).nested.count, 1);

        let observed;
        port.subscribe('sample', (event) => {
            observed = event;
            event.newValue.nested.count = 500;
        });
        const input = { nested: { count: 3 } };
        await port.set('sample', input);
        input.nested.count = 4;

        assert.equal(observed.oldValue.nested.count, 1);
        assert.equal((await port.get('sample')).nested.count, 3);
    });

    it('serializes async updates and remains usable after a failed update', async () => {
        const port = new StoragePort(new MemoryStorageAdapter({ count: 0 }));
        const increments = Array.from({ length: 8 }, (_, index) => port.update('count', async (value) => {
            await new Promise(resolve => setTimeout(resolve, index % 2));
            return value + 1;
        }));
        await Promise.all(increments);
        assert.equal(await port.get('count'), 8);

        await assert.rejects(port.update('count', () => { throw new Error('stop'); }), /stop/);
        await assert.rejects(port.flush(), /stop/);
        await port.update('count', value => value + 1);
        await port.flush();
        assert.equal(await port.get('count'), 9);
    });

    it('delivers isolated external events and supports unsubscribe', async () => {
        const adapter = new MemoryStorageAdapter();
        const port = new StoragePort(adapter);
        const events = [];
        const unsubscribe = port.subscribe('remote', event => events.push(event));

        const external = { list: ['a'] };
        await adapter.setExternal('remote', external);
        external.list.push('b');
        assert.equal(events.length, 1);
        assert.deepEqual(events[0].newValue, { list: ['a'] });
        assert.equal(events[0].source, 'external');

        unsubscribe();
        unsubscribe();
        await adapter.setExternal('remote', { list: ['c'] });
        assert.equal(events.length, 1);
    });

    it('isolates listeners from each other and contains listener failures', async () => {
        const port = new StoragePort(new MemoryStorageAdapter());
        let secondEvent;
        port.subscribe('shared', event => {
            event.newValue.changed = true;
            throw new Error('listener failed');
        });
        port.subscribe('shared', event => { secondEvent = event; });

        await port.set('shared', { changed: false });
        assert.deepEqual(secondEvent.newValue, { changed: false });
        assert.deepEqual(await port.get('shared'), { changed: false });
    });

    it('deduplicates a backend local echo while retaining the port notification', async () => {
        const values = new Map();
        const listeners = new Map();
        const adapter = {
            async get(key) { return values.get(key); },
            async set(key, value) {
                const oldValue = values.get(key);
                values.set(key, value);
                for (const listener of listeners.get(key) || []) {
                    listener({ oldValue, newValue: value, source: 'local' });
                }
            },
            subscribe(key, listener) {
                const set = listeners.get(key) || new Set();
                set.add(listener);
                listeners.set(key, set);
                return () => set.delete(listener);
            }
        };
        const port = new StoragePort(adapter);
        const events = [];
        port.subscribe('echo', event => events.push(event));

        await port.set('echo', { value: 1 });
        assert.equal(events.length, 1);
        assert.equal(events[0].source, 'local');
    });

    it('serializes per key without blocking unrelated keys', async () => {
        let releaseSlow;
        const slowGate = new Promise(resolve => { releaseSlow = resolve; });
        const values = new Map();
        const adapter = {
            async get(key) { return values.get(key); },
            async set(key, value) {
                if (key === 'slow') await slowGate;
                values.set(key, value);
            }
        };
        const port = new StoragePort(adapter);
        const slowWrite = port.set('slow', 1);
        const fastWrite = port.set('fast', 2);

        assert.equal(await fastWrite, 2);
        assert.equal(await port.get('fast'), 2);
        releaseSlow();
        await slowWrite;
    });

    it('clones fallback values and validates its public contract', async () => {
        const port = new StoragePort(new MemoryStorageAdapter());
        const fallback = { enabled: true };
        const value = await port.get('missing', fallback);
        value.enabled = false;
        assert.equal(fallback.enabled, true);

        for (const adapter of [null, {}, { get() {} }, { set() {} }]) {
            assert.throws(() => new StoragePort(adapter), /must implement/);
        }
        await assert.rejects(port.get(''), /non-empty string/);
        assert.throws(() => port.subscribe('key', null), /listener/);
        assert.throws(() => port.update('key', null), /updater/);

        const updated = await port.update('created', current => ({ ...current, count: current.count + 1 }), {
            defaultValue: { count: 0 }
        });
        assert.deepEqual(updated, { count: 1 });
    });

    it('reports fire-and-forget failures through flush without poisoning later writes', async () => {
        let failNext = true;
        const values = new Map();
        const adapter = {
            async get(key) { return values.get(key); },
            async set(key, value) {
                if (failNext) {
                    failNext = false;
                    throw new Error('persistence unavailable');
                }
                values.set(key, value);
            }
        };
        const port = new StoragePort(adapter);

        const ignored = port.set('value', 1);
        await assert.rejects(ignored, /persistence unavailable/);
        await port.set('value', 2);
        await assert.rejects(port.flush(), /persistence unavailable/);
        await port.flush();
        assert.equal(await port.get('value'), 2);
    });

    it('waits for writes queued while the adapter itself is flushing', async () => {
        let releaseFirstFlush;
        let markFlushStarted;
        const flushStarted = new Promise(resolve => { markFlushStarted = resolve; });
        const flushGate = new Promise(resolve => { releaseFirstFlush = resolve; });
        const values = new Map();
        let flushCount = 0;
        const adapter = {
            async get(key) { return values.get(key); },
            async set(key, value) { values.set(key, value); },
            async flush() {
                flushCount += 1;
                if (flushCount === 1) {
                    markFlushStarted();
                    await flushGate;
                }
            }
        };
        const port = new StoragePort(adapter);
        const flushing = port.flush();
        await flushStarted;
        const lateWrite = port.set('late', 7);
        releaseFirstFlush();

        await flushing;
        await lateWrite;
        assert.equal(flushCount, 2);
        assert.equal(await port.get('late'), 7);
    });

    it('normalizes backend event sources and contains rejected listener promises', async () => {
        const values = new Map();
        let backendListener;
        const adapter = {
            async get(key) { return values.get(key); },
            async set(key, value) { values.set(key, value); },
            subscribe(_key, listener) {
                backendListener = listener;
                return undefined;
            }
        };
        const port = new StoragePort(adapter);
        const events = [];
        const unsubscribe = port.subscribe('event', event => {
            events.push(event);
            return Promise.reject(new Error('observer rejected'));
        });

        backendListener({ remote: false, newValue: 1 });
        backendListener({ source: 'local-echo', newValue: 2 });
        backendListener();
        backendListener({ oldValue: 3, newValue: 4 });
        await Promise.resolve();
        assert.deepEqual(events.map(event => event.source), ['external', 'external']);
        assert.deepEqual(events.at(-1), {
            key: 'event',
            oldValue: 3,
            newValue: 4,
            source: 'external'
        });

        port._listeners.delete('event');
        unsubscribe();

        const plainValues = new Map();
        const noBackendSubscription = new StoragePort({
            async get(key) { return plainValues.get(key); },
            async set(key, value) { plainValues.set(key, value); }
        });
        const localEvents = [];
        const stopLocal = noBackendSubscription.subscribe('local-only', event => localEvents.push(event));
        await noBackendSubscription.set('local-only', 5);
        assert.deepEqual(localEvents.map(event => event.source), ['local']);
        stopLocal();
    });

    it('aggregates multiple write failures and supports adapters without flush', async () => {
        const adapter = {
            async get() { return undefined; },
            async set(_key, value) { throw new Error(`failed:${value}`); }
        };
        const port = new StoragePort(adapter);
        const writes = [port.set('first', 1), port.set('second', 2)];
        await Promise.allSettled(writes);
        await assert.rejects(
            port.flush(),
            error => error instanceof AggregateError
                && error.errors.map(item => item.message).sort().join(',') === 'failed:1,failed:2'
        );
        await port.flush();
    });

    it('exercises the in-memory factory and listener cleanup boundaries', async () => {
        const empty = createMemoryStoragePort();
        assert.equal(await empty.get('missing'), undefined);
        await empty.set('created', { value: 1 });
        assert.deepEqual(await empty.get('created'), { value: 1 });

        const adapter = new MemoryStorageAdapter({ initial: 1 });
        const port = new StoragePort(adapter);
        const first = port.subscribe('shared', () => undefined);
        const second = port.subscribe('shared', () => undefined);
        first();
        await adapter.setExternal('shared', 1);
        second();
        await adapter.setExternal('shared', 2);
        assert.equal(await adapter.get('initial'), 1);
    });
});

describe('storage migrations and envelopes', () => {
    it('migrates sequentially without mutating persisted input', () => {
        const original = { labels: ['one'] };
        const plan = createMigrationPlan(2, {
            0(data, context) {
                assert.deepEqual(context, { fromVersion: 0, toVersion: 1 });
                data.labels.push('two');
                return { ...data, enabled: true };
            },
            1(data) {
                data.count = data.labels.length;
                return data;
            }
        });

        assert.deepEqual(plan.migrate(original, 0), {
            labels: ['one', 'two'],
            enabled: true,
            count: 2
        });
        assert.deepEqual(original, { labels: ['one'] });
    });

    it('rejects missing, asynchronous and future migrations', () => {
        assert.throws(() => createMigrationPlan(2, { 0: value => value }).migrate({}, 0), /Missing migration 1/);
        assert.throws(() => createMigrationPlan(1, { 0: async value => value }).migrate({}, 0), /synchronous and pure/);
        assert.throws(() => createMigrationPlan(1).migrate({}, 2), /newer than supported/);
        assert.throws(() => createMigrationPlan(-1), /non-negative integer/);
        assert.throws(() => createMigrationPlan(1.5), /non-negative integer/);
        assert.throws(() => createMigrationPlan(1, { bad: value => value }), /source version/);
        assert.throws(() => createMigrationPlan(1, { 0: true }), /must be a function/);
        assert.throws(() => createMigrationPlan(1).migrate({}, -1), /Source schema version/);
        assert.throws(() => createMigrationPlan(1).migrate({}, '0'), /Source schema version/);
    });

    it('accepts Map steps, zero-step clones, and nullable migration results', () => {
        const source = { nested: { value: 1 } };
        const noOp = createMigrationPlan(0);
        const noOpResult = noOp.migrate(source, 0);
        assert.deepEqual(noOpResult, source);
        assert.notEqual(noOpResult, source);
        assert.notEqual(noOpResult.nested, source.nested);

        const mapPlan = createMigrationPlan(2, new Map([
            [0, () => null],
            [1, value => ({ previous: value })]
        ]));
        assert.deepEqual(mapPlan.migrate({ ignored: true }, 0), { previous: null });
        assert.equal(Object.isFrozen(mapPlan), true);
    });

    it('creates clone-isolated version and revision envelopes', () => {
        const input = { value: 1 };
        const envelope = createStorageEnvelope(input, 2, 4);
        input.value = 9;

        assert.equal(envelope.format, STORAGE_ENVELOPE_FORMAT);
        assert.equal(envelope.data.value, 1);
        assert.equal(isStorageEnvelope(envelope), true);
        for (const invalid of [
            null,
            false,
            'value',
            {},
            { format: STORAGE_ENVELOPE_FORMAT },
            { format: STORAGE_ENVELOPE_FORMAT, schemaVersion: -1 },
            { format: STORAGE_ENVELOPE_FORMAT, schemaVersion: 0, revision: '0' },
            { format: STORAGE_ENVELOPE_FORMAT, schemaVersion: 0, revision: -1 },
            { format: STORAGE_ENVELOPE_FORMAT, schemaVersion: 0, revision: 0 }
        ]) {
            assert.equal(isStorageEnvelope(invalid), false);
        }
        assert.throws(() => createStorageEnvelope({}, -1), /Schema version/);
        assert.throws(() => createStorageEnvelope({}, '1'), /Schema version/);
        assert.throws(() => createStorageEnvelope({}, 1, -1), /non-negative integer/);
        assert.throws(() => createStorageEnvelope({}, 1, '0'), /non-negative integer/);
    });
});

describe('StorageRepository', () => {
    const migrations = {
        0: value => ({ items: value.items || [], enabled: true }),
        1: value => ({ ...value, label: value.label || 'default' })
    };

    it('validates every constructor boundary and accepts a prepared migration plan', () => {
        const methods = ['get', 'set', 'update', 'subscribe', 'flush'];
        const partial = {};
        for (const method of methods) {
            assert.throws(
                () => new StorageRepository({
                    port: { ...partial },
                    key: 'key',
                    scope: createGlobalScope(),
                    schemaVersion: 0
                }),
                new RegExp(`${method}\\(\\)`)
            );
            partial[method] = () => {};
        }

        const port = new StoragePort(new MemoryStorageAdapter());
        for (const key of [null, '']) {
            assert.throws(
                () => new StorageRepository({ port, key, scope: createGlobalScope(), schemaVersion: 0 }),
                /key is required/
            );
        }
        for (const schemaVersion of [-1, '0']) {
            assert.throws(
                () => new StorageRepository({ port, key: 'key', scope: createGlobalScope(), schemaVersion }),
                /Schema version/
            );
        }
        for (const legacyVersion of [-1, '0']) {
            assert.throws(
                () => new StorageRepository({
                    port,
                    key: 'key',
                    scope: createGlobalScope(),
                    schemaVersion: 0,
                    legacyVersion
                }),
                /Schema version/
            );
        }
        for (const scope of [null, {}, { kind: 1 }]) {
            assert.throws(
                () => new StorageRepository({ port, key: 'key', scope, schemaVersion: 0 }),
                /scope is required/
            );
        }
        assert.throws(
            () => new StorageRepository({
                port,
                key: 'key',
                scope: createGlobalScope(),
                schemaVersion: 0,
                validate: true
            }),
            /validator/
        );

        const migrationPlan = createMigrationPlan(0);
        const repository = new StorageRepository({
            port,
            key: 'key',
            scope: createGlobalScope(),
            schemaVersion: 0,
            migrations: migrationPlan
        });
        assert.equal(repository.migrationPlan, migrationPlan);
    });

    it('reads legacy values through pure migrations and envelopes the next write', async () => {
        const key = 'gemini_chat_notes_person@example.test';
        const legacy = { items: ['legacy'] };
        const adapter = new MemoryStorageAdapter({ [key]: legacy });
        const port = new StoragePort(adapter);
        const repository = createScopedRepository({
            port,
            slot: STORAGE_SLOTS.CHAT_NOTES,
            scope: createSessionScope('person@example.test'),
            schemaVersion: 2,
            migrations,
            defaultValue: { items: [] }
        });

        const first = await repository.getSnapshot();
        assert.deepEqual(first, createStorageEnvelope({
            items: ['legacy'],
            enabled: true,
            label: 'default'
        }, 2, 0));
        assert.deepEqual(legacy, { items: ['legacy'] });
        assert.equal(isStorageEnvelope(await adapter.get(key)), false, 'read migration must not mutate persistence');

        const written = await repository.update(data => {
            data.items.push('new');
            return data;
        }, { expectedRevision: 0 });
        assert.equal(written.revision, 1);
        assert.deepEqual(written.data.items, ['legacy', 'new']);
        assert.equal(isStorageEnvelope(await adapter.get(key)), true);
        await repository.flush();
    });

    it('detects stale writers while serializing successful updates', async () => {
        const repository = createScopedRepository({
            port: new StoragePort(new MemoryStorageAdapter()),
            slot: STORAGE_SLOTS.COUNTER,
            scope: createSessionScope('active@example.test'),
            schemaVersion: 0,
            defaultValue: { count: 0 }
        });

        const first = await repository.set({ count: 1 }, { expectedRevision: 0 });
        assert.equal(first.revision, 1);
        await assert.rejects(
            repository.update(data => ({ count: data.count + 1 }), { expectedRevision: 0 }),
            error => error instanceof RevisionConflictError && error.expected === 0 && error.actual === 1
        );
        assert.deepEqual(await repository.get(), { count: 1 });
    });

    it('rejects invalid updater and expected-revision contracts before persistence', async () => {
        const adapter = new MemoryStorageAdapter();
        const repository = new StorageRepository({
            port: new StoragePort(adapter),
            key: 'global-setting',
            scope: createGlobalScope(),
            schemaVersion: 0,
            defaultValue: { count: 0 }
        });

        await assert.rejects(repository.update(null), /updater/);
        for (const expectedRevision of [-1, '0']) {
            await assert.rejects(repository.set({ count: 1 }, { expectedRevision }), /Expected revision/);
            await assert.rejects(repository.update(value => value, { expectedRevision }), /Expected revision/);
        }
        assert.equal(await adapter.get('global-setting'), undefined);
    });

    it('supports explicitly global repositories without conflating them with profiles', async () => {
        const repository = new storage.StorageRepository({
            port: new StoragePort(new MemoryStorageAdapter()),
            key: GLOBAL_STORAGE_KEYS.THEME,
            scope: createGlobalScope(),
            schemaVersion: 0,
            defaultValue: 'glass'
        });

        assert.equal(await repository.get(), 'glass');
        const saved = await repository.set('paper');
        assert.equal(saved.revision, 1);
        assert.equal(await repository.get(), 'paper');
    });

    it('allows inspection reads and subscriptions but rejects all inspection writes', async () => {
        const target = 'other@example.test';
        const key = `gemini_store_${target}`;
        const adapter = new MemoryStorageAdapter({
            [key]: createStorageEnvelope({ count: 2 }, 0, 3)
        });
        const repository = createScopedRepository({
            port: new StoragePort(adapter),
            slot: STORAGE_SLOTS.COUNTER,
            scope: createInspectionScope('active@example.test', target),
            schemaVersion: 0,
            defaultValue: { count: 0 }
        });

        assert.deepEqual(await repository.get(), { count: 2 });
        await assert.rejects(repository.set({ count: 3 }), ReadOnlyStorageScopeError);
        await assert.rejects(repository.update(data => data), ReadOnlyStorageScopeError);

        let notification;
        repository.subscribe((snapshot, metadata) => {
            notification = { snapshot, metadata };
            snapshot.data.count = 999;
        });
        await adapter.setExternal(key, createStorageEnvelope({ count: 4 }, 0, 4));
        assert.equal(notification.metadata.source, 'external');
        assert.equal(notification.metadata.previous.revision, 3);
        assert.deepEqual(await repository.get(), { count: 4 });
    });

    it('validates subscribers and routes malformed snapshots or listener failures to onError', async () => {
        const key = 'global-subscription';
        const adapter = new MemoryStorageAdapter({
            [key]: createStorageEnvelope({ count: 1 }, 0, 1)
        });
        const repository = new StorageRepository({
            port: new StoragePort(adapter),
            key,
            scope: createGlobalScope(),
            schemaVersion: 0
        });
        assert.throws(() => repository.subscribe(null), /listener/);

        const errors = [];
        const stopErrors = repository.subscribe(() => {}, { onError: error => errors.push(error) });
        const stopDefault = repository.subscribe(() => { throw new Error('consumer failed'); }, { onError: 'ignored' });
        await adapter.setExternal(key, {
            format: STORAGE_ENVELOPE_FORMAT,
            schemaVersion: 'bad',
            revision: 2,
            data: { count: 2 }
        });
        assert.equal(errors.length, 1);
        assert.match(errors[0].message, /Malformed Primer/);

        await adapter.setExternal(key, createStorageEnvelope({ count: 3 }, 0, 3));
        assert.equal(errors.length, 2, 'the malformed previous snapshot is also rejected');
        await adapter.setExternal(key, createStorageEnvelope({ count: 4 }, 0, 4));
        assert.equal(errors.length, 2);
        stopErrors();
        stopDefault();
    });

    it('rejects malformed and unsupported future envelopes', async () => {
        const scope = createSessionScope('active@example.test');
        const key = resolveStorageKey(STORAGE_SLOTS.COUNTER, scope);
        const malformed = new StoragePort(new MemoryStorageAdapter({
            [key]: { format: STORAGE_ENVELOPE_FORMAT, schemaVersion: 'bad', revision: 0, data: {} }
        }));
        const malformedRepo = createScopedRepository({
            port: malformed,
            slot: STORAGE_SLOTS.COUNTER,
            scope,
            schemaVersion: 0
        });
        await assert.rejects(malformedRepo.get(), /Malformed Primer\+\+ storage envelope/);

        const future = new StoragePort(new MemoryStorageAdapter({
            [key]: createStorageEnvelope({}, 3, 1)
        }));
        const futureRepo = createScopedRepository({
            port: future,
            slot: STORAGE_SLOTS.COUNTER,
            scope,
            schemaVersion: 2,
            migrations: { 0: value => value, 1: value => value }
        });
        await assert.rejects(futureRepo.get(), UnsupportedSchemaVersionError);
        await assert.rejects(
            futureRepo.get(),
            error => error.stored === 3 && error.supported === 2
        );
    });

    it('does not overwrite legacy data when a migration fails', async () => {
        const scope = createSessionScope('active@example.test');
        const key = resolveStorageKey(STORAGE_SLOTS.COUNTER, scope);
        const legacy = { count: 1 };
        const adapter = new MemoryStorageAdapter({ [key]: legacy });
        const repository = createScopedRepository({
            port: new StoragePort(adapter),
            slot: STORAGE_SLOTS.COUNTER,
            scope,
            schemaVersion: 2,
            migrations: { 0: value => value }
        });

        await assert.rejects(repository.update(value => value), /Missing migration 1/);
        assert.deepEqual(await adapter.get(key), legacy);
    });

    it('validates migrated and updated values before persistence', async () => {
        const scope = createSessionScope('active@example.test');
        const key = resolveStorageKey(STORAGE_SLOTS.COUNTER, scope);
        const initial = createStorageEnvelope({ count: 1 }, 0, 1);
        const adapter = new MemoryStorageAdapter({ [key]: initial });
        const repository = createScopedRepository({
            port: new StoragePort(adapter),
            slot: STORAGE_SLOTS.COUNTER,
            scope,
            schemaVersion: 0,
            validate(value, context) {
                assert.deepEqual(context, { key, schemaVersion: 0 });
                const valid = Number.isInteger(value.count) && value.count >= 0;
                value.count = 999;
                return valid;
            }
        });

        assert.deepEqual(await repository.get(), { count: 1 }, 'validator receives an isolated clone');
        await assert.rejects(repository.set({ count: -1 }), StorageValidationError);
        await assert.rejects(repository.update(() => ({ count: -2 })), StorageValidationError);
        assert.deepEqual(await adapter.get(key), initial);

        const asyncValidator = createScopedRepository({
            port: new StoragePort(adapter),
            slot: STORAGE_SLOTS.COUNTER,
            scope,
            schemaVersion: 0,
            validate: async () => true
        });
        await assert.rejects(asyncValidator.get(), /validator must be synchronous and pure/);
    });

    it('validates defaults on missing values and external deletion events', async () => {
        const adapter = new MemoryStorageAdapter();
        const invalidDefault = new StorageRepository({
            port: new StoragePort(adapter),
            key: 'validated-default',
            scope: createGlobalScope(),
            schemaVersion: 0,
            defaultValue: { count: -1 },
            validate: value => Number.isInteger(value.count) && value.count >= 0
        });
        await assert.rejects(invalidDefault.get(), StorageValidationError);

        const key = 'validated-deletion';
        await adapter.set(key, createStorageEnvelope({ count: 1 }, 0, 1));
        const deletionRepository = new StorageRepository({
            port: new StoragePort(adapter),
            key,
            scope: createGlobalScope(),
            schemaVersion: 0,
            defaultValue: { count: -1 },
            validate: value => Number.isInteger(value.count) && value.count >= 0
        });
        const errors = [];
        let notifications = 0;
        const unsubscribe = deletionRepository.subscribe(
            () => { notifications += 1; },
            { onError: error => errors.push(error) }
        );

        await adapter.setExternal(key, undefined);
        assert.equal(notifications, 0);
        assert.equal(errors.length, 1);
        assert.ok(errors[0] instanceof StorageValidationError);
        unsubscribe();
    });
});
