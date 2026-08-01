const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let api;
let archiveApi;
let contributorApi;
before(async () => {
    [api, archiveApi, contributorApi] = await Promise.all([
        import(pathToFileURL(path.join(
            __dirname, '..', 'src', 'app', 'preferences_archive_repository.js'
        )).href),
        import(pathToFileURL(path.join(
            __dirname, '..', 'src', 'features', 'portable_archive', 'index.js'
        )).href),
        import(pathToFileURL(path.join(
            __dirname, '..', 'src', 'features', 'preferences', 'restore_contributor.js'
        )).href)
    ]);
});

const GLOBAL_SCOPE = Object.freeze({ kind: 'global', readOnly: false });

function uiTweaks() {
    return {
        tabTitle: { enabled: false },
        ctrlEnter: { enabled: true },
        inputCounter: { enabled: true },
        chatWidth: { enabled: true, value: 900 },
        sidebarWidth: { enabled: false, value: 280 }
    };
}

function document(overrides = {}) {
    return {
        schemaVersion: 1,
        theme: 'auto',
        locale: 'en-US',
        defaultModel: 'pro',
        uiTweaks: uiTweaks(),
        enabledModules: ['counter', 'export'],
        ...structuredClone(overrides)
    };
}

function fieldPort(name, initial, events, overrides = {}) {
    let value = structuredClone(initial);
    const port = {
        async load() {
            events.push(`load:${name}`);
            if (overrides.load) return overrides.load(control);
            return structuredClone(value);
        },
        async save(next) {
            events.push(`save:${name}`);
            value = structuredClone(next);
            if (overrides.save) return overrides.save(control, next);
        }
    };
    if (overrides.withFlush) {
        port.flush = async () => {
            events.push(`flush:${name}`);
            return overrides.flush?.(control);
        };
    }
    const control = {
        get value() { return structuredClone(value); },
        set(valueToStore) { value = structuredClone(valueToStore); }
    };
    return { port, control };
}

function repositoryFixture({
    source = document(),
    scope = GLOBAL_SCOPE,
    includeEnabledModules = true,
    fieldOverrides = {},
    getScope
} = {}) {
    const events = [];
    let activeScope = structuredClone(scope);
    const controls = {};
    const options = {
        includeEnabledModules,
        async getScope() {
            events.push('scope');
            if (getScope) return getScope(scopeControl);
            return structuredClone(activeScope);
        }
    };
    const values = {
        theme: source.theme,
        locale: source.locale,
        defaultModel: source.defaultModel,
        uiTweaks: source.uiTweaks,
        enabledModules: source.enabledModules
    };
    const fields = includeEnabledModules
        ? api.PREFERENCES_ARCHIVE_FIELD_ORDER
        : api.PREFERENCES_ARCHIVE_FIELD_ORDER.slice(0, -1);
    for (const field of fields) {
        const created = fieldPort(field, values[field], events, fieldOverrides[field]);
        options[field] = created.port;
        controls[field] = created.control;
    }
    const scopeControl = {
        get value() { return structuredClone(activeScope); },
        set(value) { activeScope = structuredClone(value); }
    };
    return {
        options,
        events,
        controls,
        scope: scopeControl,
        create() { return api.createPreferencesArchiveRepository(options); }
    };
}

function expectCode(code, phase) {
    return (error) => {
        assert.equal(error?.code, code);
        if (phase !== undefined) assert.equal(error.phase, phase);
        return true;
    };
}

describe('Preferences archive repository factory contract', () => {
    it('requires explicit aggregate ports and rejects unknown factory options', () => {
        for (const options of [null, [], 'options']) {
            assert.throws(() => api.createPreferencesArchiveRepository(options), TypeError);
        }
        assert.throws(
            () => api.createPreferencesArchiveRepository({ unknown: true }),
            /Unknown Preferences archive repository option/
        );
        assert.throws(() => api.createPreferencesArchiveRepository({}), /requires getScope/);
        assert.throws(
            () => api.createPreferencesArchiveRepository({ getScope() {}, includeEnabledModules: 'yes' }),
            /includeEnabledModules must be a boolean/
        );
        assert.throws(
            () => api.createPreferencesArchiveRepository({ getScope() {}, theme: [] }),
            /theme port must implement/
        );
        const fixture = repositoryFixture();
        fixture.options.theme.flush = true;
        assert.throws(
            () => api.createPreferencesArchiveRepository(fixture.options),
            /theme port flush must be a function/
        );
    });

    it('defaults to required enabledModules and permits only an explicit opt-out', async () => {
        const complete = repositoryFixture();
        delete complete.options.includeEnabledModules;
        assert.deepEqual((await complete.create().load()).enabledModules, ['counter', 'export']);

        const missing = repositoryFixture();
        delete missing.options.enabledModules;
        assert.throws(() => missing.create(), /enabledModules port must implement/);

        const excluded = repositoryFixture({ includeEnabledModules: false });
        const repository = excluded.create();
        const loaded = await repository.load();
        assert.equal(Object.hasOwn(loaded, 'enabledModules'), false);
        const withoutModules = document();
        delete withoutModules.enabledModules;
        assert.deepEqual(await repository.save(withoutModules), withoutModules);
        await assert.rejects(
            repository.save(document()),
            expectCode('UNSUPPORTED_ENABLED_MODULES', 'save:validate')
        );
        await assert.rejects(
            complete.create().save(withoutModules),
            expectCode('MISSING_ENABLED_MODULES', 'save:validate')
        );
    });

    it('returns the frozen minimal repository and accepts class-backed field ports', async () => {
        class Port {
            constructor(value) { this.value = value; }
            load() { return structuredClone(this.value); }
            save(value) { this.value = structuredClone(value); }
        }
        const source = document();
        const repository = api.createPreferencesArchiveRepository({
            getScope: () => GLOBAL_SCOPE,
            theme: new Port(source.theme),
            locale: new Port(source.locale),
            defaultModel: new Port(source.defaultModel),
            uiTweaks: new Port(source.uiTweaks),
            enabledModules: new Port(source.enabledModules)
        });
        assert.equal(Object.isFrozen(repository), true);
        assert.equal(Object.isFrozen(api.PREFERENCES_ARCHIVE_FIELD_ORDER), true);
        assert.deepEqual(Object.keys(repository), ['getScope', 'load', 'save', 'flush']);
        assert.deepEqual(await repository.load(), source);
    });
});

describe('Preferences aggregate load and save', () => {
    it('loads in fixed order, canonicalizes values, and returns isolated state', async () => {
        const fixture = repositoryFixture({ source: document({ locale: 'zh_cn' }) });
        const repository = fixture.create();
        const loaded = await repository.load();
        assert.equal(loaded.locale, 'zh-CN');
        assert.deepEqual(
            fixture.events.filter(event => event.startsWith('load:')),
            ['load:theme', 'load:locale', 'load:defaultModel', 'load:uiTweaks', 'load:enabledModules']
        );
        loaded.uiTweaks.chatWidth.value = 1200;
        loaded.enabledModules.push('folders');
        assert.equal(fixture.controls.uiTweaks.value.chatWidth.value, 900);
        assert.deepEqual(fixture.controls.enabledModules.value, ['counter', 'export']);
        const scope = await repository.getScope();
        scope.readOnly = true;
        assert.equal((await repository.getScope()).readOnly, false);
    });

    it('saves and verifies each field in auditable order without sharing references', async () => {
        const fixture = repositoryFixture();
        const repository = fixture.create();
        const incoming = document({
            theme: 'paper',
            locale: 'zh-CN',
            defaultModel: 'thinking',
            enabledModules: ['counter']
        });
        const result = await repository.save(incoming);
        assert.deepEqual(result, incoming);
        assert.deepEqual(
            fixture.events.filter(event => /^(?:save|load):/.test(event)),
            [
                'save:theme', 'load:theme',
                'save:locale', 'load:locale',
                'save:defaultModel', 'load:defaultModel',
                'save:uiTweaks', 'load:uiTweaks',
                'save:enabledModules', 'load:enabledModules'
            ]
        );
        incoming.uiTweaks.chatWidth.value = 1400;
        incoming.enabledModules.push('export');
        assert.equal(fixture.controls.uiTweaks.value.chatWidth.value, 900);
        assert.deepEqual(fixture.controls.enabledModules.value, ['counter']);
    });

    it('rejects invalid documents before the first field write', async () => {
        const fixture = repositoryFixture();
        const repository = fixture.create();
        await assert.rejects(
            repository.save({ ...document(), density: 'compact' }),
            (error) => error.code === 'INVALID_PORTABLE_PREFERENCES'
                && error.phase === 'save:validate'
                && error.cause?.code === 'INVALID_PORTABLE_PREFERENCES'
        );
        assert.equal(fixture.events.some(event => event.startsWith('save:')), false);
    });

    it('reports field load/save/verification failures with exact phases', async () => {
        const loadFailure = repositoryFixture({
            fieldOverrides: { locale: { load() { throw new Error('locale unavailable'); } } }
        });
        await assert.rejects(
            loadFailure.create().load(),
            (error) => error.code === 'PREFERENCES_ARCHIVE_LOAD_FAILED'
                && error.phase === 'load:locale'
                && error.cause.message === 'locale unavailable'
        );

        const saveFailure = repositoryFixture({
            fieldOverrides: { defaultModel: { save() { throw new Error('model write failed'); } } }
        });
        await assert.rejects(
            saveFailure.create().save(document()),
            expectCode('PREFERENCES_ARCHIVE_SAVE_FAILED', 'save:defaultModel')
        );
        assert.deepEqual(saveFailure.controls.theme.value, 'auto');

        const verifyReadFailure = repositoryFixture({
            fieldOverrides: {
                theme: {
                    load(control) {
                        if (control.value === 'paper') throw new Error('cannot reread theme');
                        return control.value;
                    }
                }
            }
        });
        await assert.rejects(
            verifyReadFailure.create().save(document({ theme: 'paper' })),
            expectCode('PREFERENCES_ARCHIVE_VERIFY_FAILED', 'save:theme:verify')
        );

        const mismatch = repositoryFixture({
            fieldOverrides: { theme: { save(control) { control.set('auto'); } } }
        });
        await assert.rejects(
            mismatch.create().save(document({ theme: 'paper' })),
            expectCode('PREFERENCES_ARCHIVE_VERIFY_FAILED', 'save:theme:verify')
        );

        const classified = new api.PreferencesArchiveRepositoryError(
            'CLASSIFIED_WRITE',
            'classified write failure',
            { phase: 'field-port' }
        );
        const classifiedSave = repositoryFixture({
            fieldOverrides: { theme: { save() { throw classified; } } }
        });
        await assert.rejects(classifiedSave.create().save(document()), error => (
            error.code === 'PREFERENCES_ARCHIVE_SAVE_FAILED'
                && error.phase === 'save:theme'
                && error.cause === classified
        ));
        const exactPhase = new api.PreferencesArchiveRepositoryError(
            'EXACT_WRITE',
            'exact write failure',
            { phase: 'save:theme' }
        );
        const exactSave = repositoryFixture({
            fieldOverrides: { theme: { save() { throw exactPhase; } } }
        });
        await assert.rejects(exactSave.create().save(document()), error => error === exactPhase);

        const classifiedVerify = repositoryFixture({
            fieldOverrides: {
                theme: {
                    load(control) {
                        return control.value === 'paper' ? () => {} : control.value;
                    }
                }
            }
        });
        await assert.rejects(
            classifiedVerify.create().save(document({ theme: 'paper' })),
            expectCode('PREFERENCES_ARCHIVE_CLONE_FAILED', 'save:theme:verify')
        );
    });

    it('contains scope-provider, clone, and aggregate validation failures', async () => {
        const scopeFailure = repositoryFixture({ getScope() { throw new Error('identity down'); } });
        await assert.rejects(
            scopeFailure.create().getScope(),
            (error) => error.code === 'PREFERENCES_SCOPE_FAILED'
                && error.phase === 'scope'
                && error.cause.message === 'identity down'
        );

        const uncloneable = repositoryFixture({
            fieldOverrides: { theme: { load() { return () => {}; } } }
        });
        await assert.rejects(
            uncloneable.create().load(),
            expectCode('PREFERENCES_ARCHIVE_CLONE_FAILED', 'load:theme')
        );

        const invalid = repositoryFixture({ source: document({ theme: 'unsupported' }) });
        await assert.rejects(
            invalid.create().load(),
            (error) => error.code === 'INVALID_PORTABLE_PREFERENCES'
                && error.phase === 'load:validate'
        );
    });
});

describe('Preferences scope and abort boundaries', () => {
    it('normalizes session scopes and validates malformed scope shapes', async () => {
        const session = repositoryFixture({
            scope: {
                kind: 'session', sessionUserId: ' active ', targetUserId: ' active ', readOnly: false
            }
        });
        assert.deepEqual(await session.create().getScope(), {
            kind: 'session', sessionUserId: 'active', targetUserId: 'active', readOnly: false
        });
        for (const scope of [
            null,
            { kind: 'unknown', readOnly: false },
            { kind: 'global', readOnly: false, targetUserId: 'x' },
            { kind: 'global', readOnly: 'no' },
            { kind: 'session', sessionUserId: '', targetUserId: 'a', readOnly: false },
            { kind: 'session', sessionUserId: 'a', targetUserId: 4, readOnly: false },
            { kind: 'session', sessionUserId: 'a', targetUserId: 'a', readOnly: false, extra: true },
            { kind: 'inspection', sessionUserId: 'a', targetUserId: 'b', readOnly: false }
        ]) {
            const fixture = repositoryFixture({ scope });
            await assert.rejects(fixture.create().getScope(), expectCode('INVALID_PREFERENCES_SCOPE', 'scope'));
        }
    });

    it('allows read-only inspection loads but rejects inspection and cross-session saves', async () => {
        for (const scope of [
            { kind: 'global', readOnly: true },
            { kind: 'inspection', sessionUserId: 'a', targetUserId: 'b', readOnly: true },
            { kind: 'session', sessionUserId: 'a', targetUserId: 'b', readOnly: false }
        ]) {
            const fixture = repositoryFixture({ scope });
            const repository = fixture.create();
            assert.equal((await repository.load()).theme, 'auto');
            await assert.rejects(
                repository.save(document({ theme: 'paper' })),
                error => ['READ_ONLY_SESSION', 'SESSION_BOUNDARY'].includes(error.code)
                    && error.phase === 'save:scope'
            );
            assert.equal(fixture.events.some(event => event.startsWith('save:')), false);
        }
    });

    it('invalidates load, save, and pending flush when the active scope changes', async () => {
        let loadScopeCalls = 0;
        const loadDrift = repositoryFixture({
            scope: { kind: 'session', sessionUserId: 'a', targetUserId: 'a', readOnly: false },
            getScope(control) {
                loadScopeCalls += 1;
                if (loadScopeCalls === 3) control.set({
                    kind: 'session', sessionUserId: 'b', targetUserId: 'b', readOnly: false
                });
                return control.value;
            }
        });
        await assert.rejects(
            loadDrift.create().load(),
            expectCode('PREFERENCES_SCOPE_CHANGED', 'load:theme')
        );

        let saveScopeCalls = 0;
        const saveDrift = repositoryFixture({
            scope: { kind: 'session', sessionUserId: 'a', targetUserId: 'a', readOnly: false },
            getScope(control) {
                saveScopeCalls += 1;
                if (saveScopeCalls === 3) control.set({
                    kind: 'session', sessionUserId: 'b', targetUserId: 'b', readOnly: false
                });
                return control.value;
            }
        });
        await assert.rejects(
            saveDrift.create().save(document({ theme: 'paper' })),
            expectCode('PREFERENCES_SCOPE_CHANGED', 'save:theme')
        );

        const flushDrift = repositoryFixture({
            scope: { kind: 'session', sessionUserId: 'a', targetUserId: 'a', readOnly: false }
        });
        const repository = flushDrift.create();
        await repository.save(document({ theme: 'paper' }));
        flushDrift.scope.set({
            kind: 'session', sessionUserId: 'b', targetUserId: 'b', readOnly: false
        });
        await assert.rejects(
            repository.flush(),
            expectCode('PREFERENCES_SCOPE_CHANGED', 'flush:scope')
        );
    });

    it('validates AbortSignal and honors cancellation before and during operations', async () => {
        const fixture = repositoryFixture();
        const repository = fixture.create();
        await assert.rejects(
            repository.getScope({ signal: { aborted: false } }),
            expectCode('INVALID_ABORT_SIGNAL', 'scope')
        );
        await assert.rejects(
            repository.load(null),
            expectCode('INVALID_PREFERENCES_ARCHIVE_OPTIONS', 'load')
        );
        await assert.rejects(
            repository.save(document(), { extra: true }),
            expectCode('INVALID_PREFERENCES_ARCHIVE_OPTIONS', 'save')
        );
        const already = new AbortController();
        already.abort();
        await assert.rejects(repository.getScope({ signal: already.signal }), (error) => (
            error.name === 'AbortError' && error.code === 'RESTORE_ABORTED'
        ));

        const controller = new AbortController();
        const aborting = repositoryFixture({
            getScope() {
                controller.abort();
                return GLOBAL_SCOPE;
            }
        }).create();
        await assert.rejects(
            aborting.getScope({ signal: controller.signal }),
            expectCode('RESTORE_ABORTED', 'scope')
        );
    });
});

describe('Preferences aggregate flush', () => {
    it('awaits flush ports in field order and reports the flushed fields', async () => {
        let releaseTheme;
        const gate = new Promise(resolve => { releaseTheme = resolve; });
        const fixture = repositoryFixture({
            fieldOverrides: {
                theme: { withFlush: true, async flush() { await gate; } },
                locale: { withFlush: true },
                enabledModules: { withFlush: true }
            }
        });
        const repository = fixture.create();
        const pending = repository.flush();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(fixture.events.filter(event => event.startsWith('flush:')), ['flush:theme']);
        releaseTheme();
        assert.deepEqual(await pending, ['theme', 'locale', 'enabledModules']);
        assert.deepEqual(
            fixture.events.filter(event => event.startsWith('flush:')),
            ['flush:theme', 'flush:locale', 'flush:enabledModules']
        );
    });

    it('aggregates all field flush failures with auditable phases', async () => {
        const fixture = repositoryFixture({
            fieldOverrides: {
                theme: {
                    withFlush: true,
                    flush() {
                        const error = new Error('theme flush');
                        error.code = 'THEME_FLUSH';
                        throw error;
                    }
                },
                locale: { withFlush: true, flush() { throw 'locale flush'; } },
                uiTweaks: { withFlush: true }
            }
        });
        await assert.rejects(fixture.create().flush(), (error) => {
            assert.equal(error.code, 'PREFERENCES_ARCHIVE_FLUSH_FAILED');
            assert.equal(error.phase, 'flush');
            assert.deepEqual(error.failures.map(failure => failure.phase), ['flush:theme', 'flush:locale']);
            assert.equal(error.failures[0].name, 'Error');
            assert.equal(error.failures[0].code, 'THEME_FLUSH');
            assert.equal(error.failures[1].code, null);
            assert.equal(error.failures[1].message, 'locale flush');
            return true;
        });
        assert.equal(fixture.events.includes('flush:uiTweaks'), true);
    });

    it('detects scope drift and aborts between asynchronous flushes', async () => {
        const drift = repositoryFixture({
            scope: { kind: 'session', sessionUserId: 'a', targetUserId: 'a', readOnly: false },
            fieldOverrides: {
                theme: {
                    withFlush: true,
                    flush() {
                        drift.scope.set({
                            kind: 'session', sessionUserId: 'b', targetUserId: 'b', readOnly: false
                        });
                    }
                },
                locale: { withFlush: true }
            }
        });
        await assert.rejects(
            drift.create().flush(),
            expectCode('PREFERENCES_SCOPE_CHANGED', 'flush:theme')
        );
        assert.equal(drift.events.includes('flush:locale'), false);

        const controller = new AbortController();
        const aborted = repositoryFixture({
            fieldOverrides: {
                theme: { withFlush: true, flush() { controller.abort(); } },
                locale: { withFlush: true }
            }
        });
        await assert.rejects(
            aborted.create().flush({ signal: controller.signal }),
            expectCode('RESTORE_ABORTED', 'flush:theme')
        );
        assert.equal(aborted.events.includes('flush:locale'), false);
    });
});

describe('Preferences aggregate repository compensation integration', () => {
    it('lets the portable executor restore every earlier field after a later field fails', async () => {
        const before = document();
        const incoming = document({ theme: 'paper', locale: 'zh-CN', defaultModel: 'thinking' });
        const fixture = repositoryFixture({
            source: before,
            fieldOverrides: {
                locale: {
                    save(_control, value) {
                        if (value === 'zh-CN') throw new Error('locale write failed after mutation');
                    }
                }
            }
        });
        const repository = fixture.create();
        const archive = await archiveApi.createPortableArchive({
            createdAt: '2026-08-01T00:00:00.000Z',
            source: { app: 'Primer++', version: '13.0.0' },
            sections: { preferences: incoming }
        });
        const plan = await archiveApi.planPortableArchiveRestore(
            archive,
            { preferences: before },
            { strategy: 'replace' }
        );
        const executor = archiveApi.createPortableRestoreExecutor({
            contributors: {
                preferences: contributorApi.createPreferencesRestoreContributor({ repository })
            }
        });
        await assert.rejects(executor.execute(plan), (error) => {
            assert.equal(error.code, 'RESTORE_EXECUTION_FAILED');
            assert.equal(error.result.status, 'rolled-back');
            assert.equal(error.result.summary.rolledBackSections, 1);
            return true;
        });
        assert.deepEqual(await repository.load(), before);
        assert.equal(fixture.events.filter(event => event === 'save:theme').length, 2);
        assert.equal(fixture.events.filter(event => event === 'save:locale').length, 2);
    });
});
