const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let archiveApi;
let restoreApi;
before(async () => {
    const featurePath = path.join(
        __dirname,
        '..',
        'src',
        'features',
        'portable_archive'
    );
    archiveApi = await import(pathToFileURL(path.join(featurePath, 'index.js')).href);
    restoreApi = await import(pathToFileURL(path.join(featurePath, 'restore_executor.js')).href);
});

const CHECKSUM = 'a'.repeat(64);
const SECTION_ORDER = ['chats', 'annotations', 'collections', 'recipes', 'preferences', 'insights', 'queue'];

function action(section, type = 'insert', suffix = '1') {
    const targetIdentity = type === 'rename' ? `${section}-${suffix}~imported` : `${section}-${suffix}`;
    return {
        section,
        action: type,
        incomingIdentity: `${section}-${suffix}`,
        targetIdentity,
        identityPatch: type === 'rename' ? { field: 'id', value: targetIdentity } : null,
        value: { id: `${section}-${suffix}`, value: suffix }
    };
}

function counts(actions) {
    const summary = { total: actions.length, insert: 0, skip: 0, replace: 0, rename: 0 };
    actions.forEach(item => { summary[item.action] += 1; });
    return summary;
}

function planFor(specification = { chats: ['insert'] }) {
    const sections = SECTION_ORDER.filter(name => Object.hasOwn(specification, name)).map(name => {
        const actions = specification[name].map((type, index) => action(name, type, String(index + 1)));
        return { name, summary: counts(actions), actions };
    });
    const summary = { total: 0, insert: 0, skip: 0, replace: 0, rename: 0 };
    sections.forEach(section => {
        Object.keys(summary).forEach(key => { summary[key] += section.summary[key]; });
    });
    return { dryRun: true, strategy: 'replace', archiveChecksum: CHECKSUM, summary, sections };
}

function expectCode(code) {
    return error => error instanceof archiveApi.PortableArchiveError && error.code === code;
}

function clone(value) {
    return structuredClone(value);
}

function port(overrides = {}) {
    return {
        async snapshot(context) { return { before: context.section }; },
        async apply(context) { return { applied: context.actions.length }; },
        async rollback(context) { return { restored: context.snapshot.before }; },
        ...overrides
    };
}

describe('portable restore plan validation', () => {
    it('validates a canonical plan and returns a deep isolated clone', () => {
        const input = planFor({ chats: ['skip', 'insert'], insights: ['insert'], queue: ['rename'] });
        const validated = archiveApi.validatePortableRestorePlan(input);
        assert.deepEqual(validated, input);
        assert.notEqual(validated, input);
        assert.notEqual(validated.sections, input.sections);
        input.sections[0].actions[0].value.id = 'mutated-input';
        assert.equal(validated.sections[0].actions[0].value.id, 'chats-1');
        validated.sections[0].actions[0].value.id = 'mutated-output';
        assert.equal(input.sections[0].actions[1].value.id, 'chats-2');
    });

    it('rejects malformed plan envelopes, sections, actions, patches, and summaries', () => {
        const cases = [];
        cases.push(null);
        cases.push({ ...planFor(), extra: true });
        cases.push({ ...planFor(), dryRun: false });
        cases.push({ ...planFor(), strategy: 'merge' });
        cases.push({ ...planFor(), archiveChecksum: 'ABC' });
        cases.push({ ...planFor(), sections: {} });

        const badSection = mutate => {
            const candidate = planFor();
            mutate(candidate.sections[0], candidate);
            cases.push(candidate);
        };
        badSection((section, plan) => { plan.sections[0] = null; });
        badSection(section => { section.extra = true; });
        badSection(section => { section.name = 'other'; });
        const duplicate = planFor({ chats: ['insert'], annotations: ['insert'] });
        duplicate.sections[1].name = 'chats';
        cases.push(duplicate);
        const unordered = planFor({ chats: ['insert'], annotations: ['insert'] });
        unordered.sections.reverse();
        cases.push(unordered);
        badSection(section => { section.actions = {}; });

        const badAction = mutate => badSection(section => mutate(section.actions[0], section));
        badAction((item, section) => { section.actions[0] = null; });
        badAction(item => { item.extra = true; });
        badAction(item => { item.section = 'annotations'; });
        badAction(item => { item.action = 'retry'; });
        badAction(item => { item.incomingIdentity = ''; });
        badAction(item => { item.targetIdentity = null; });
        badAction(item => { item.value = []; });
        const renameWithoutPatch = planFor({ chats: ['rename'] });
        renameWithoutPatch.sections[0].actions[0].identityPatch = null;
        cases.push(renameWithoutPatch);
        const renamePatchExtra = planFor({ chats: ['rename'] });
        renamePatchExtra.sections[0].actions[0].identityPatch.extra = true;
        cases.push(renamePatchExtra);
        const renamePatchField = planFor({ chats: ['rename'] });
        renamePatchField.sections[0].actions[0].identityPatch.field = '';
        cases.push(renamePatchField);
        const renamePatchValue = planFor({ chats: ['rename'] });
        renamePatchValue.sections[0].actions[0].identityPatch.value = '';
        cases.push(renamePatchValue);
        const renameMismatch = planFor({ chats: ['rename'] });
        renameMismatch.sections[0].actions[0].identityPatch.value = 'different';
        cases.push(renameMismatch);
        badAction(item => { item.identityPatch = { field: 'id', value: item.targetIdentity }; });

        badSection(section => { section.summary = []; });
        badSection(section => { section.summary.extra = 0; });
        badSection(section => { section.summary.insert = -1; });
        badSection(section => { section.summary.insert = 1.5; });
        badSection(section => { section.summary.total = 2; });
        badSection(section => { section.summary.insert = 0; section.summary.skip = 1; });
        const globalMismatch = planFor();
        globalMismatch.summary.insert = 0;
        globalMismatch.summary.skip = 1;
        cases.push(globalMismatch);

        for (const candidate of cases) {
            assert.throws(() => archiveApi.validatePortableRestorePlan(candidate), error => (
                ['INVALID_RESTORE_PLAN', 'INVALID_VALUE'].includes(error.code)
            ));
        }
    });
});

describe('portable restore contributor and execution contracts', () => {
    it('rejects malformed executor, contributor, execute, selection, and signal contracts', async () => {
        for (const options of [null, {}, { contributors: {}, extra: true }, { contributors: null }]) {
            assert.throws(() => archiveApi.createPortableRestoreExecutor(options), error => (
                ['INVALID_ARGUMENT', 'INVALID_CONTRIBUTORS'].includes(error.code)
            ));
        }
        assert.throws(
            () => archiveApi.createPortableRestoreExecutor({ contributors: { other: port() } }),
            expectCode('INVALID_CONTRIBUTOR')
        );
        assert.throws(
            () => archiveApi.createPortableRestoreExecutor({ contributors: { chats: null } }),
            expectCode('INVALID_CONTRIBUTOR')
        );
        assert.throws(
            () => archiveApi.createPortableRestoreExecutor({ contributors: { chats: { ...port(), extra() {} } } }),
            expectCode('INVALID_CONTRIBUTOR')
        );
        for (const method of ['snapshot', 'apply', 'rollback']) {
            assert.throws(
                () => archiveApi.createPortableRestoreExecutor({
                    contributors: { chats: { ...port(), [method]: null } }
                }),
                expectCode('INVALID_CONTRIBUTOR')
            );
        }
        assert.throws(
            () => archiveApi.createPortableRestoreExecutor({ contributors: {}, onProgress: true }),
            expectCode('INVALID_ARGUMENT')
        );
        const nullPrototypeOptions = Object.assign(Object.create(null), { contributors: {} });
        assert.equal(
            archiveApi.createPortableRestoreExecutor(nullPrototypeOptions).running,
            false
        );

        const executor = archiveApi.createPortableRestoreExecutor({ contributors: { chats: port() } });
        const plan = planFor();
        for (const options of [
            null,
            { extra: true },
            { onProgress: true },
            { signal: {} },
            { signal: { aborted: false, addEventListener() {} } },
            { sections: 'chats' },
            { sections: [] },
            { sections: ['chats', 'chats'] },
            { sections: ['other'] },
            { sections: ['annotations'] }
        ]) {
            await assert.rejects(executor.execute(plan, options), error => (
                ['INVALID_ARGUMENT', 'INVALID_ABORT_SIGNAL', 'INVALID_SELECTION', 'NO_SECTIONS', 'SECTION_NOT_IN_PLAN']
                    .includes(error.code)
            ));
        }
        const missing = archiveApi.createPortableRestoreExecutor({ contributors: {} });
        await assert.rejects(missing.execute(plan), expectCode('MISSING_CONTRIBUTOR'));
    });

    it('executes selected sections in order with skip handling, progress, and clone isolation', async () => {
        const calls = [];
        const progress = [];
        let throwProgress = true;
        let executor;
        const chats = port({
            async snapshot(context) {
                calls.push(`snapshot:${context.section}`);
                assert.equal(context.actions.length, 1);
                context.plan.actions[0].value.id = 'port-plan-mutation';
                return { rows: [{ id: 'before' }] };
            },
            async apply(context) {
                calls.push(`apply:${context.section}`);
                assert.equal(executor.running, true);
                context.actions[0].value.id = 'port-action-mutation';
                context.snapshot.rows[0].id = 'port-snapshot-mutation';
                return { count: 1 };
            }
        });
        const queue = port({ async apply() { calls.push('apply:queue'); } });
        executor = archiveApi.createPortableRestoreExecutor({
            contributors: { chats, queue },
            onProgress(event) {
                progress.push(event);
                event.phase = 'mutated-observer-copy';
                if (throwProgress) {
                    throwProgress = false;
                    throw new Error('observer failed');
                }
            }
        });
        const plan = planFor({ chats: ['skip', 'insert'], insights: ['skip'], queue: ['rename'] });
        const before = clone(plan);
        const first = await executor.execute(plan, { sections: ['chats', 'insights'] });

        assert.equal(executor.running, false);
        assert.deepEqual(calls, ['snapshot:chats', 'apply:chats']);
        assert.deepEqual(plan, before);
        assert.equal(first.ok, true);
        assert.equal(first.status, 'completed');
        assert.deepEqual(first.selectedSections, ['chats', 'insights']);
        assert.deepEqual(first.summary, {
            totalSections: 2,
            appliedSections: 1,
            skippedSections: 1,
            rolledBackSections: 0,
            rollbackFailedSections: 0,
            totalActions: 1
        });
        assert.deepEqual(first.sections.map(item => item.status), ['applied', 'skipped']);
        assert.deepEqual(first.sections[0].result, { count: 1 });
        assert.equal(first.progressErrors.length, 1);
        assert.equal(first.journal[0].phase, 'execution');
        assert.equal(progress[0].phase, 'mutated-observer-copy');

        first.sections[0].result.count = 99;
        const disjoint = await executor.execute(plan, { sections: ['queue'] });
        assert.equal(disjoint.sections[0].result, null);
        assert.deepEqual(calls, ['snapshot:chats', 'apply:chats', 'apply:queue']);
        await assert.rejects(executor.execute(plan, { sections: ['chats'] }), expectCode('RESTORE_ALREADY_EXECUTED'));
    });

    it('prevents concurrent execution and captures contributor functions at construction', async () => {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let originalCalls = 0;
        const contributor = port({
            async apply() {
                originalCalls += 1;
                await gate;
                return { done: true };
            }
        });
        const executor = archiveApi.createPortableRestoreExecutor({ contributors: { chats: contributor } });
        contributor.apply = () => { throw new Error('mutated dependency'); };
        const running = executor.execute(planFor());
        assert.equal(executor.running, true);
        await assert.rejects(executor.execute(planFor()), expectCode('RESTORE_IN_PROGRESS'));
        release();
        assert.equal((await running).ok, true);
        assert.equal(originalCalls, 1);
    });

    it('rolls back the failing section and earlier sections in reverse order and aggregates rollback errors', async () => {
        const calls = [];
        const plan = planFor({ chats: ['insert'], annotations: ['replace'], collections: ['insert'] });
        const executor = archiveApi.createPortableRestoreExecutor({
            contributors: {
                chats: port({
                    async snapshot() { calls.push('snapshot:chats'); return { rows: ['before-chat'] }; },
                    async apply() { calls.push('apply:chats'); return { receipt: 'chat-applied' }; },
                    async rollback(context) {
                        calls.push('rollback:chats');
                        assert.deepEqual(context.applyResult, { receipt: 'chat-applied' });
                        const error = new Error('rollback refused');
                        error.code = 'ROLLBACK_REFUSED';
                        throw error;
                    }
                }),
                annotations: port({
                    async snapshot() { calls.push('snapshot:annotations'); return { rows: ['before-note'] }; },
                    async apply() {
                        calls.push('apply:annotations');
                        throw new Error('Bearer should-not-leak');
                    },
                    async rollback(context) {
                        calls.push('rollback:annotations');
                        context.snapshot.rows[0] = 'mutated-port-copy';
                        assert.equal(context.applyResult, null);
                        assert.equal(context.failure.message, 'Contributor failed with redacted sensitive details');
                        return { restored: 1 };
                    }
                }),
                collections: port({ async apply() { calls.push('apply:collections'); } })
            }
        });

        await assert.rejects(executor.execute(plan), error => {
            assert.equal(error instanceof archiveApi.PortableRestoreExecutionError, true);
            assert.equal(error.code, 'RESTORE_ROLLBACK_FAILED');
            assert.equal(error.cause.message, 'Bearer should-not-leak');
            assert.equal(error.result.status, 'rollback-failed');
            assert.equal(error.result.failure.message, 'Contributor failed with redacted sensitive details');
            assert.deepEqual(error.result.sections.map(item => item.status), [
                'rollback-failed', 'rolled-back', 'not-run'
            ]);
            assert.equal(error.result.rollbackErrors.length, 1);
            assert.equal(error.result.rollbackErrors[0].code, 'ROLLBACK_REFUSED');
            assert.equal(error.result.sections[1].rollbackResult.restored, 1);
            error.result.rollbackErrors[0].code = 'mutated-output';
            assert.equal(error.details.result.rollbackErrors[0].code, 'ROLLBACK_REFUSED');
            return true;
        });
        assert.deepEqual(calls, [
            'snapshot:chats',
            'apply:chats',
            'snapshot:annotations',
            'apply:annotations',
            'rollback:annotations',
            'rollback:chats'
        ]);
    });

    it('honors AbortSignal before and during execution and still rolls back without the aborted signal', async () => {
        const preAborted = new AbortController();
        preAborted.abort('before-start');
        const before = archiveApi.createPortableRestoreExecutor({ contributors: { chats: port() } });
        await assert.rejects(before.execute(planFor(), { signal: preAborted.signal }), error => {
            assert.equal(error.code, 'RESTORE_ABORTED');
            assert.equal(error.result.status, 'aborted');
            assert.equal(error.result.sections[0].status, 'cancelled');
            assert.equal(error.cause.details.reason, 'before-start');
            return true;
        });

        const controller = new AbortController();
        let rollbackContext;
        const during = archiveApi.createPortableRestoreExecutor({
            contributors: {
                chats: port({
                    async apply({ signal }) {
                        assert.equal(signal, controller.signal);
                        controller.abort(new Error('route changed'));
                        return { applied: true };
                    },
                    async rollback(context) {
                        rollbackContext = context;
                    }
                })
            }
        });
        await assert.rejects(during.execute(planFor(), { signal: controller.signal }), error => {
            assert.equal(error.code, 'RESTORE_ABORTED');
            assert.equal(error.result.status, 'aborted');
            assert.equal(error.result.sections[0].status, 'rolled-back');
            return true;
        });
        assert.equal(Object.hasOwn(rollbackContext, 'signal'), false);
        assert.deepEqual(rollbackContext.applyResult, { applied: true });
    });

    it('contains snapshot and result contract failures and never retries any port', async () => {
        const counts = { snapshot: 0, apply: 0, rollback: 0 };
        const undefinedSnapshot = archiveApi.createPortableRestoreExecutor({
            contributors: {
                chats: port({
                    async snapshot() { counts.snapshot += 1; return undefined; },
                    async apply() { counts.apply += 1; },
                    async rollback() { counts.rollback += 1; }
                })
            }
        });
        await assert.rejects(undefinedSnapshot.execute(planFor()), error => {
            assert.equal(error.code, 'RESTORE_EXECUTION_FAILED');
            assert.equal(error.result.sections[0].status, 'failed');
            assert.equal(error.result.rollbackErrors.length, 0);
            return true;
        });
        assert.deepEqual(counts, { snapshot: 1, apply: 0, rollback: 0 });

        const sensitiveResult = archiveApi.createPortableRestoreExecutor({
            contributors: {
                chats: port({
                    async apply() { counts.apply += 1; return { password: 'not-exportable' }; },
                    async rollback() { counts.rollback += 1; }
                })
            }
        });
        await assert.rejects(sensitiveResult.execute(planFor()), error => {
            assert.equal(error.code, 'RESTORE_EXECUTION_FAILED');
            assert.equal(error.result.sections[0].status, 'rolled-back');
            return true;
        });
        assert.deepEqual(counts, { snapshot: 1, apply: 1, rollback: 1 });

        assert.deepEqual(
            restoreApi.portableRestoreExecutorInternals.describeError({}, 'snapshot'),
            {
                name: 'Error',
                code: 'CONTRIBUTOR_FAILURE',
                message: 'Contributor failed',
                phase: 'snapshot',
                section: null
            }
        );
    });
});
