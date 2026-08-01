const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let api;
before(async () => {
    api = await import(pathToFileURL(path.join(
        __dirname,
        '..',
        'src',
        'features',
        'preferences',
        'restore_contributor.js'
    )).href);
});

const PLAN = Object.freeze({ name: 'preferences' });
const GLOBAL_SCOPE = Object.freeze({ kind: 'global', readOnly: false });

function uiTweaks(overrides = {}) {
    return {
        tabTitle: { enabled: false },
        ctrlEnter: { enabled: true },
        inputCounter: { enabled: true },
        chatWidth: { enabled: true, value: 900 },
        sidebarWidth: { enabled: false, value: 280 },
        ...structuredClone(overrides)
    };
}

function preferences(overrides = {}) {
    return {
        schemaVersion: 1,
        theme: 'auto',
        locale: 'en-US',
        defaultModel: 'pro',
        uiTweaks: uiTweaks(),
        ...structuredClone(overrides)
    };
}

function restoreAction(value, action = 'replace', overrides = {}) {
    return {
        section: 'preferences',
        action,
        incomingIdentity: 'preferences',
        targetIdentity: 'preferences',
        identityPatch: null,
        value: structuredClone(value),
        ...structuredClone(overrides)
    };
}

function context(actions, signal = null) {
    return { section: 'preferences', plan: PLAN, actions, signal };
}

function repositoryFixture(initial, options = {}) {
    let state = structuredClone(initial);
    let scope = structuredClone(options.scope || GLOBAL_SCOPE);
    const calls = [];
    const control = {
        calls,
        get state() { return structuredClone(state); },
        get scope() { return structuredClone(scope); },
        setState(value) { state = structuredClone(value); },
        setScope(value) { scope = structuredClone(value); }
    };
    const repository = {
        async getScope() {
            calls.push('scope');
            await options.onGetScope?.(control);
            return structuredClone(scope);
        },
        async load() {
            calls.push('load');
            await options.onLoad?.(control);
            return structuredClone(state);
        },
        async save(value) {
            calls.push('save');
            state = structuredClone(value);
            await options.onSave?.(control, value);
        },
        async flush() {
            calls.push('flush');
            await options.onFlush?.(control);
        }
    };
    return { repository, control };
}

function expectCode(code) {
    return error => error?.code === code;
}

async function takeSnapshot(contributor, signal = null) {
    return contributor.snapshot(context([restoreAction(preferences())], signal));
}

describe('Preferences portable schema', () => {
    it('canonicalizes clone-isolated current state and optional module ids', () => {
        const source = preferences({
            theme: 'cyber',
            locale: 'zh_cn',
            defaultModel: 'flash',
            enabledModules: ['counter', 'message-queue']
        });
        const normalized = api.normalizePortablePreferences(source);
        assert.deepEqual(normalized, preferences({
            theme: 'cyber',
            locale: 'zh-CN',
            defaultModel: 'flash',
            enabledModules: ['counter', 'message-queue']
        }));
        normalized.uiTweaks.chatWidth.value = 1200;
        normalized.enabledModules.push('export');
        assert.equal(source.uiTweaks.chatWidth.value, 900);
        assert.deepEqual(source.enabledModules, ['counter', 'message-queue']);
        assert.equal(api.PREFERENCES_PORTABLE_SCHEMA_VERSION, 1);
        assert.equal(api.PREFERENCES_RESTORE_SECTION, 'preferences');
        assert.equal(Object.isFrozen(api.preferencesRestoreContributorInternals), true);
    });

    it('rejects non-documents, unknown fields, obsolete fields, and unsupported versions', () => {
        for (const value of [null, [], 'preferences']) {
            assert.throws(() => api.normalizePortablePreferences(value), expectCode('INVALID_PORTABLE_PREFERENCES'));
        }
        assert.throws(
            () => api.normalizePortablePreferences({ ...preferences(), density: 'compact' }),
            expectCode('INVALID_PORTABLE_PREFERENCES')
        );
        assert.throws(
            () => api.normalizePortablePreferences({ ...preferences(), hideGems: true }),
            expectCode('OBSOLETE_PREFERENCE_FIELD')
        );
        assert.throws(
            () => api.normalizePortablePreferences({ ...preferences(), schemaVersion: 2 }),
            expectCode('UNSUPPORTED_PREFERENCES_SCHEMA')
        );
        const missing = preferences();
        delete missing.theme;
        assert.throws(() => api.normalizePortablePreferences(missing), expectCode('INVALID_PORTABLE_PREFERENCES'));
        assert.throws(
            () => api.normalizePortablePreferences({ ...preferences(), uiTweaks: () => {} }),
            expectCode('INVALID_PORTABLE_PREFERENCES')
        );
    });

    it('validates theme, locale, model, and enabled module schema', () => {
        assert.throws(
            () => api.normalizePortablePreferences(preferences({ theme: 'gemini' })),
            expectCode('INVALID_PORTABLE_PREFERENCES')
        );
        assert.throws(
            () => api.normalizePortablePreferences(preferences({ locale: 'not a locale!' })),
            expectCode('INVALID_PORTABLE_PREFERENCES')
        );
        assert.throws(
            () => api.normalizePortablePreferences(preferences({ defaultModel: 'ultra' })),
            expectCode('INVALID_PORTABLE_PREFERENCES')
        );
        for (const enabledModules of ['counter', ['bad id'], ['counter', 'counter']]) {
            assert.throws(
                () => api.normalizePortablePreferences(preferences({ enabledModules })),
                expectCode('INVALID_PORTABLE_PREFERENCES')
            );
        }
    });

    it('strictly validates every UI toggle and width boundary', () => {
        assert.throws(
            () => api.normalizePortablePreferences(preferences({ uiTweaks: null })),
            expectCode('INVALID_PORTABLE_PREFERENCES')
        );
        assert.throws(
            () => api.normalizePortablePreferences(preferences({
                uiTweaks: { ...uiTweaks(), hideNotebooks: { enabled: true } }
            })),
            expectCode('OBSOLETE_PREFERENCE_FIELD')
        );
        const missing = uiTweaks();
        delete missing.tabTitle;
        assert.throws(
            () => api.normalizePortablePreferences(preferences({ uiTweaks: missing })),
            expectCode('INVALID_PORTABLE_PREFERENCES')
        );
        for (const bad of [null, { enabled: false, extra: true }, { enabled: 'yes' }]) {
            assert.throws(
                () => api.normalizePortablePreferences(preferences({
                    uiTweaks: uiTweaks({ tabTitle: bad })
                })),
                expectCode('INVALID_PORTABLE_PREFERENCES')
            );
        }
        for (const value of [899.5, 399, 4001]) {
            assert.throws(
                () => api.normalizePortablePreferences(preferences({
                    uiTweaks: uiTweaks({ chatWidth: { enabled: true, value } })
                })),
                expectCode('INVALID_PORTABLE_PREFERENCES')
            );
        }
        for (const value of [159, 801]) {
            assert.throws(
                () => api.normalizePortablePreferences(preferences({
                    uiTweaks: uiTweaks({ sidebarWidth: { enabled: true, value } })
                })),
                expectCode('INVALID_PORTABLE_PREFERENCES')
            );
        }
        assert.equal(api.normalizePortablePreferences(preferences({
            uiTweaks: uiTweaks({
                chatWidth: { enabled: true, value: 400 },
                sidebarWidth: { enabled: true, value: 800 }
            })
        })).uiTweaks.sidebarWidth.value, 800);
    });
});

describe('Preferences restore scope and factory contracts', () => {
    it('requires the aggregate repository contract while accepting class-backed ports', () => {
        assert.throws(() => api.createPreferencesRestoreContributor(), /repository must be an object/);
        assert.throws(
            () => api.createPreferencesRestoreContributor({ repository: [] }),
            /repository must be an object/
        );
        assert.throws(
            () => api.createPreferencesRestoreContributor({ repository: { getScope() {} } }),
            /implement load\(\)/
        );
        class Repository {
            getScope() { return GLOBAL_SCOPE; }
            load() { return preferences(); }
            save() {}
            flush() {}
        }
        assert.deepEqual(Object.keys(api.createPreferencesRestoreContributor({
            repository: new Repository()
        })), ['snapshot', 'apply', 'rollback']);
    });

    it('normalizes supported scopes and rejects malformed or unsafe scope claims', () => {
        const normalize = api.preferencesRestoreContributorInternals.normalizeScope;
        assert.deepEqual(normalize(GLOBAL_SCOPE), GLOBAL_SCOPE);
        assert.deepEqual(normalize({
            kind: 'session', sessionUserId: ' active ', targetUserId: ' active ', readOnly: false
        }), {
            kind: 'session', sessionUserId: 'active', targetUserId: 'active', readOnly: false
        });
        assert.deepEqual(normalize({
            kind: 'inspection', sessionUserId: 'active', targetUserId: 'other', readOnly: true
        }), {
            kind: 'inspection', sessionUserId: 'active', targetUserId: 'other', readOnly: true
        });
        for (const scope of [
            null,
            { kind: 'global', readOnly: false, targetUserId: 'x' },
            { kind: 'unknown', readOnly: false },
            { kind: 'global', readOnly: 'no' },
            { kind: 'inspection', sessionUserId: 'a', targetUserId: 'b', readOnly: false },
            { kind: 'session', sessionUserId: '', targetUserId: 'a', readOnly: false },
            { kind: 'session', sessionUserId: 'a', targetUserId: 4, readOnly: false }
        ]) {
            assert.throws(() => normalize(scope), expectCode('INVALID_PREFERENCES_SCOPE'));
        }
    });

    it('validates contexts and AbortSignal before repository access', async () => {
        const fixture = repositoryFixture(preferences());
        const contributor = api.createPreferencesRestoreContributor({ repository: fixture.repository });
        await assert.rejects(contributor.snapshot(null), expectCode('INVALID_RESTORE_CONTEXT'));
        await assert.rejects(
            contributor.snapshot({ section: 'queue', plan: PLAN, actions: [] }),
            expectCode('INVALID_RESTORE_SECTION')
        );
        await assert.rejects(
            contributor.snapshot({ section: 'preferences', plan: [], actions: [] }),
            expectCode('INVALID_RESTORE_CONTEXT')
        );
        await assert.rejects(
            contributor.snapshot(context([], { aborted: false })),
            expectCode('INVALID_ABORT_SIGNAL')
        );
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(takeSnapshot(contributor, controller.signal), expectCode('RESTORE_ABORTED'));
        assert.deepEqual(fixture.control.calls, []);
    });

    it('allows inspection snapshots but prevents writes without causing a compensating write', async () => {
        const fixture = repositoryFixture(preferences(), {
            scope: {
                kind: 'inspection', sessionUserId: 'owner', targetUserId: 'other', readOnly: true
            }
        });
        const contributor = api.createPreferencesRestoreContributor({ repository: fixture.repository });
        const snapshot = await takeSnapshot(contributor);
        await assert.rejects(
            contributor.apply({ ...context([restoreAction(preferences({ theme: 'paper' }))]), snapshot }),
            expectCode('READ_ONLY_SESSION')
        );
        const rollback = await contributor.rollback({
            section: 'preferences', plan: PLAN, actions: [], snapshot, applyResult: null, failure: {}
        });
        assert.deepEqual(rollback, { section: 'preferences', restored: false });
        assert.equal(fixture.control.calls.includes('save'), false);
    });

    it('detects session switches during reads and cross-session write claims', async () => {
        let switched = false;
        const changing = repositoryFixture(preferences(), {
            scope: { kind: 'session', sessionUserId: 'a', targetUserId: 'a', readOnly: false },
            onLoad(control) {
                if (!switched) {
                    switched = true;
                    control.setScope({
                        kind: 'session', sessionUserId: 'b', targetUserId: 'b', readOnly: false
                    });
                }
            }
        });
        await assert.rejects(
            takeSnapshot(api.createPreferencesRestoreContributor({ repository: changing.repository })),
            expectCode('SESSION_BOUNDARY')
        );

        const crossed = repositoryFixture(preferences(), {
            scope: { kind: 'session', sessionUserId: 'a', targetUserId: 'b', readOnly: false }
        });
        const contributor = api.createPreferencesRestoreContributor({ repository: crossed.repository });
        const snapshot = await takeSnapshot(contributor);
        await assert.rejects(
            contributor.apply({ ...context([restoreAction(preferences({ theme: 'paper' }))]), snapshot }),
            expectCode('SESSION_BOUNDARY')
        );
    });
});

describe('Preferences restore transaction behavior', () => {
    it('compares session scope by fields after portable canonicalization reorders keys', async () => {
        const scope = { kind: 'session', sessionUserId: 'owner', targetUserId: 'owner', readOnly: false };
        const fixture = repositoryFixture(preferences(), { scope });
        const contributor = api.createPreferencesRestoreContributor({ repository: fixture.repository });
        const snapshot = await takeSnapshot(contributor);
        snapshot.scope = {
            kind: snapshot.scope.kind,
            readOnly: snapshot.scope.readOnly,
            sessionUserId: snapshot.scope.sessionUserId,
            targetUserId: snapshot.scope.targetUserId
        };
        const result = await contributor.apply({
            ...context([restoreAction(preferences({ theme: 'paper' }))]),
            snapshot
        });
        assert.equal(result.action, 'replace');
        assert.equal(fixture.control.state.theme, 'paper');
    });

    it('replaces the singleton, preserves unavailable module state, verifies, and isolates clones', async () => {
        const original = preferences({ enabledModules: ['counter', 'export'] });
        const fixture = repositoryFixture(original);
        const contributor = api.createPreferencesRestoreContributor({ repository: fixture.repository });
        const snapshot = await takeSnapshot(contributor);
        snapshot.preferences.theme = 'paper';
        assert.equal(fixture.control.state.theme, 'auto');
        const safeSnapshot = await takeSnapshot(contributor);
        const incoming = preferences({ theme: 'glass', locale: 'zh-CN', defaultModel: 'thinking' });
        const action = restoreAction(incoming);
        const result = await contributor.apply({ ...context([action]), snapshot: safeSnapshot });
        assert.deepEqual(result, {
            section: 'preferences',
            action: 'replace',
            fields: ['theme', 'locale', 'defaultModel', 'uiTweaks', 'enabledModules']
        });
        assert.deepEqual(fixture.control.state, {
            ...incoming,
            enabledModules: ['counter', 'export']
        });
        action.value.theme = 'cyber';
        assert.equal(fixture.control.state.theme, 'glass');
        assert.equal(fixture.control.calls.filter(call => call === 'flush').length, 1);
    });

    it('supports first-time insert and exact rollback to absence', async () => {
        const fixture = repositoryFixture(null);
        const contributor = api.createPreferencesRestoreContributor({ repository: fixture.repository });
        const snapshot = await takeSnapshot(contributor);
        const result = await contributor.apply({
            ...context([restoreAction(preferences({ theme: 'paper' }), 'insert')]),
            snapshot
        });
        assert.equal(result.action, 'insert');
        assert.equal(fixture.control.state.theme, 'paper');
        const rollback = await contributor.rollback({
            section: 'preferences', plan: PLAN, actions: [], snapshot, applyResult: result, failure: {}
        });
        assert.deepEqual(rollback, { section: 'preferences', restored: true, fieldCount: 0 });
        assert.equal(fixture.control.state, null);
    });

    it('rejects stale snapshots, stale action kinds, unsupported rename, and malformed actions', async () => {
        const fixture = repositoryFixture(preferences());
        const contributor = api.createPreferencesRestoreContributor({ repository: fixture.repository });
        const snapshot = await takeSnapshot(contributor);
        fixture.control.setState(preferences({ theme: 'paper' }));
        await assert.rejects(
            contributor.apply({ ...context([restoreAction(preferences())]), snapshot }),
            expectCode('RESTORE_STATE_CHANGED')
        );
        fixture.control.setState(preferences());
        const current = await takeSnapshot(contributor);
        for (const actions of [[], [restoreAction(preferences()), restoreAction(preferences())]]) {
            await assert.rejects(
                contributor.apply({ ...context(actions), snapshot: current }),
                expectCode('INVALID_RESTORE_ACTION')
            );
        }
        for (const action of [
            null,
            { ...restoreAction(preferences()), extra: true },
            restoreAction(preferences(), 'skip'),
            restoreAction(preferences(), 'replace', { section: 'queue' }),
            restoreAction(preferences(), 'replace', { targetIdentity: 'preferences~imported' }),
            restoreAction(preferences(), 'insert')
        ]) {
            await assert.rejects(
                contributor.apply({ ...context([action]), snapshot: current }),
                error => ['INVALID_RESTORE_ACTION', 'RESTORE_IDENTITY_MISMATCH', 'RESTORE_PLAN_STALE'].includes(error.code)
            );
        }
        fixture.control.setState(null);
        const absent = await takeSnapshot(contributor);
        await assert.rejects(
            contributor.apply({ ...context([restoreAction(preferences(), 'replace')]), snapshot: absent }),
            expectCode('RESTORE_PLAN_STALE')
        );
    });

    it('detects scope changes around writes and persistence verification failures', async () => {
        let saveCount = 0;
        const switching = repositoryFixture(preferences(), {
            scope: { kind: 'session', sessionUserId: 'a', targetUserId: 'a', readOnly: false },
            onSave(control) {
                saveCount += 1;
                if (saveCount === 1) {
                    control.setScope({
                        kind: 'session', sessionUserId: 'b', targetUserId: 'b', readOnly: false
                    });
                }
            }
        });
        const switchingContributor = api.createPreferencesRestoreContributor({ repository: switching.repository });
        const switchingSnapshot = await takeSnapshot(switchingContributor);
        await assert.rejects(
            switchingContributor.apply({
                ...context([restoreAction(preferences({ theme: 'paper' }))]),
                snapshot: switchingSnapshot
            }),
            expectCode('SESSION_BOUNDARY')
        );

        const corrupting = repositoryFixture(preferences(), {
            onFlush(control) { control.setState(preferences({ theme: 'cyber' })); }
        });
        const corruptingContributor = api.createPreferencesRestoreContributor({ repository: corrupting.repository });
        const corruptingSnapshot = await takeSnapshot(corruptingContributor);
        await assert.rejects(
            corruptingContributor.apply({
                ...context([restoreAction(preferences({ theme: 'paper' }))]),
                snapshot: corruptingSnapshot
            }),
            expectCode('RESTORE_VERIFY_FAILED')
        );
    });

    it('rolls back changed state and rejects malformed snapshots or changed rollback scopes', async () => {
        const fixture = repositoryFixture(preferences());
        const contributor = api.createPreferencesRestoreContributor({ repository: fixture.repository });
        const snapshot = await takeSnapshot(contributor);
        fixture.control.setState(preferences({ theme: 'paper' }));
        const result = await contributor.rollback({
            section: 'preferences', plan: PLAN, actions: [], snapshot, applyResult: null, failure: {}
        });
        assert.equal(result.restored, true);
        assert.equal(result.fieldCount, 5);
        assert.equal(fixture.control.state.theme, 'auto');
        await assert.rejects(
            contributor.rollback({ section: 'preferences', plan: PLAN, actions: [], snapshot: [] }),
            expectCode('INVALID_RESTORE_SNAPSHOT')
        );
        await assert.rejects(
            contributor.rollback({
                section: 'preferences', plan: PLAN, actions: [],
                snapshot: { ...snapshot, extra: true }
            }),
            expectCode('INVALID_RESTORE_SNAPSHOT')
        );
        fixture.control.setScope({ kind: 'global', readOnly: true });
        await assert.rejects(
            contributor.rollback({ section: 'preferences', plan: PLAN, actions: [], snapshot }),
            expectCode('SESSION_BOUNDARY')
        );
    });
});

describe('Preferences archive integration façade', () => {
    it('exports frozen clone-safe integration without exposing the repository', async () => {
        const fixture = repositoryFixture(preferences({ theme: 'paper' }));
        const port = api.createPreferencesPortableArchivePort({ repository: fixture.repository });
        const integration = port.getPortableArchiveIntegration();
        assert.equal(Object.isFrozen(port), true);
        assert.equal(Object.isFrozen(integration), true);
        assert.equal(integration, port.getPortableArchiveIntegration());
        assert.deepEqual(Object.keys(port), ['getPortableArchiveIntegration']);
        assert.deepEqual(Object.keys(integration), ['section', 'exportSection', 'contributor']);
        const exported = await integration.exportSection();
        assert.equal((await integration.exportSection(Object.create(null))).theme, 'paper');
        exported.theme = 'cyber';
        assert.equal(fixture.control.state.theme, 'paper');
        assert.deepEqual(Object.keys(integration.contributor), ['snapshot', 'apply', 'rollback']);
    });

    it('validates export options, aborts, and refuses to invent missing state', async () => {
        const fixture = repositoryFixture(null);
        const integration = api.createPreferencesPortableArchivePort({
            repository: fixture.repository
        }).getPortableArchiveIntegration();
        await assert.rejects(integration.exportSection(null), expectCode('INVALID_EXPORT_OPTIONS'));
        await assert.rejects(
            integration.exportSection({ unknown: true }),
            expectCode('INVALID_EXPORT_OPTIONS')
        );
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
            integration.exportSection({ signal: controller.signal }),
            expectCode('RESTORE_ABORTED')
        );
        await assert.rejects(integration.exportSection(), expectCode('PREFERENCES_NOT_FOUND'));
    });
});
