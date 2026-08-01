const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let archiveApi;
let preferencesApi;
before(async () => {
    [archiveApi, preferencesApi] = await Promise.all([
        import(pathToFileURL(path.join(
            __dirname, '..', 'src', 'features', 'portable_archive', 'index.js'
        )).href),
        import(pathToFileURL(path.join(
            __dirname, '..', 'src', 'features', 'preferences', 'restore_contributor.js'
        )).href)
    ]);
});

const CREATED_AT = '2026-08-01T00:00:00.000Z';
const GLOBAL_SCOPE = Object.freeze({ kind: 'global', readOnly: false });

function preferences(theme = 'auto') {
    return {
        schemaVersion: 1,
        theme,
        locale: 'en-US',
        defaultModel: 'pro',
        uiTweaks: {
            tabTitle: { enabled: false },
            ctrlEnter: { enabled: true },
            inputCounter: { enabled: true },
            chatWidth: { enabled: true, value: 900 },
            sidebarWidth: { enabled: false, value: 280 }
        },
        enabledModules: ['counter', 'export']
    };
}

function repositoryFixture(initial, { afterSave } = {}) {
    let state = structuredClone(initial);
    const repository = {
        getScope() { return structuredClone(GLOBAL_SCOPE); },
        load() { return structuredClone(state); },
        async save(value) {
            state = structuredClone(value);
            await afterSave?.();
        },
        flush() {}
    };
    return { repository, get state() { return structuredClone(state); } };
}

async function planFor(sections, existing, strategy = 'replace') {
    const archive = await archiveApi.createPortableArchive({
        createdAt: CREATED_AT,
        source: { app: 'Primer++', version: '13.0.0' },
        sections
    });
    return archiveApi.planPortableArchiveRestore(archive, existing, { strategy });
}

describe('Preferences contributor with the portable restore executor', () => {
    it('executes only the selected Preferences section from a multi-section plan', async () => {
        const fixture = repositoryFixture(preferences('auto'));
        let insightsCalls = 0;
        const plan = await planFor({
            preferences: preferences('paper'),
            insights: [{ id: 'insight-1', kind: 'usage' }]
        }, {
            preferences: preferences('auto'),
            insights: []
        });
        const executor = archiveApi.createPortableRestoreExecutor({
            contributors: {
                preferences: preferencesApi.createPreferencesRestoreContributor({
                    repository: fixture.repository
                }),
                insights: {
                    async snapshot() { insightsCalls += 1; return {}; },
                    async apply() { insightsCalls += 1; },
                    async rollback() { insightsCalls += 1; }
                }
            }
        });
        const result = await executor.execute(plan, { sections: ['preferences'] });
        assert.equal(result.ok, true);
        assert.equal(result.status, 'completed');
        assert.deepEqual(result.selectedSections, ['preferences']);
        assert.equal(fixture.state.theme, 'paper');
        assert.equal(insightsCalls, 0);
    });

    it('fully restores Preferences when a later section fails', async () => {
        const fixture = repositoryFixture(preferences('auto'));
        const plan = await planFor({
            preferences: preferences('paper'),
            insights: [{ id: 'insight-1', kind: 'usage' }]
        }, {
            preferences: preferences('auto'),
            insights: []
        });
        const executor = archiveApi.createPortableRestoreExecutor({
            contributors: {
                preferences: preferencesApi.createPreferencesRestoreContributor({
                    repository: fixture.repository
                }),
                insights: {
                    async snapshot() { return { before: [] }; },
                    async apply() {
                        const error = new Error('later section failed');
                        error.code = 'INSIGHTS_WRITE_FAILED';
                        throw error;
                    },
                    async rollback() { return { restored: true }; }
                }
            }
        });
        await assert.rejects(executor.execute(plan), (error) => {
            assert.equal(error.code, 'RESTORE_EXECUTION_FAILED');
            assert.equal(error.result.status, 'rolled-back');
            assert.equal(error.result.summary.rolledBackSections, 2);
            assert.equal(
                error.result.sections.find(section => section.name === 'preferences').status,
                'rolled-back'
            );
            return true;
        });
        assert.deepEqual(fixture.state, preferences('auto'));
    });

    it('rolls back a completed write when AbortSignal fires inside apply', async () => {
        const controller = new AbortController();
        let saveCount = 0;
        const fixture = repositoryFixture(preferences('auto'), {
            afterSave() {
                saveCount += 1;
                if (saveCount === 1) controller.abort('stop after write');
            }
        });
        const plan = await planFor(
            { preferences: preferences('cyber') },
            { preferences: preferences('auto') }
        );
        const executor = archiveApi.createPortableRestoreExecutor({
            contributors: {
                preferences: preferencesApi.createPreferencesRestoreContributor({
                    repository: fixture.repository
                })
            }
        });
        await assert.rejects(executor.execute(plan, { signal: controller.signal }), (error) => {
            assert.equal(error.code, 'RESTORE_ABORTED');
            assert.equal(error.result.status, 'aborted');
            assert.equal(error.result.summary.rolledBackSections, 1);
            return true;
        });
        assert.equal(saveCount, 2);
        assert.deepEqual(fixture.state, preferences('auto'));
    });
});
