const assert = require('node:assert/strict');
const { before, describe, it } = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let api;
let resumeApi;
let dialogApi;
before(async () => {
    const base = path.join(__dirname, '..', 'src', 'features', 'portable_archive');
    api = await import(pathToFileURL(path.join(base, 'index.js')).href);
    resumeApi = await import(pathToFileURL(path.join(base, 'restore_resume.js')).href);
    dialogApi = await import(pathToFileURL(path.join(base, 'restore_dialog_execution.js')).href);
});

const CHECKSUM = 'c'.repeat(64);

function action(section) {
    return {
        section,
        action: 'insert',
        incomingIdentity: `${section}-1`,
        targetIdentity: `${section}-1`,
        identityPatch: null,
        value: { id: `${section}-1` }
    };
}

function restorePlan(names = ['chats']) {
    const sections = api.PORTABLE_ARCHIVE_SECTIONS.filter(name => names.includes(name)).map(name => ({
        name,
        summary: { total: 1, insert: 1, skip: 0, replace: 0, rename: 0 },
        actions: [action(name)]
    }));
    return {
        dryRun: true,
        strategy: 'replace',
        archiveChecksum: CHECKSUM,
        summary: { total: sections.length, insert: sections.length, skip: 0, replace: 0, rename: 0 },
        sections
    };
}

function rolledBackResult(names = ['chats']) {
    return {
        status: 'rolled-back',
        selectedSections: [...names],
        summary: { rolledBackSections: names.length, rollbackFailedSections: 0 },
        sections: names.map(name => ({ name, status: 'rolled-back' })),
        journal: [
            ...names.map(section => ({ phase: 'apply', status: 'started', section })),
            ...[...names].reverse().map(section => ({ phase: 'rollback', status: 'completed', section }))
        ],
        rollbackErrors: []
    };
}

function port(overrides = {}) {
    return {
        async snapshot() { return { before: true }; },
        async apply() { return { applied: true }; },
        async rollback() { return { restored: true }; },
        ...overrides
    };
}

function expectCode(code) {
    return error => error?.code === code;
}

function lifecycleCoordinator(options = {}) {
    let generation = 1;
    let started = true;
    const coordinator = api.createPortableRestoreCoordinator({
        getIntegrations: async () => new Map(),
        contributors: options.contributors,
        executor: options.executor,
        createExecutor: options.createExecutor,
        isReadOnly: options.isReadOnly,
        requireStarted() {
            if (!started) throw new api.PortableArchiveFeatureError('NOT_STARTED', 'stopped');
            return generation;
        },
        assertCurrent(value) {
            if (!started || value !== generation) {
                throw new api.PortableArchiveFeatureError('OPERATION_CANCELLED', 'changed');
            }
        }
    });
    return {
        coordinator,
        bump() { generation += 1; coordinator.reset('generation-change'); },
        stop() { started = false; generation += 1; coordinator.reset('feature-stop'); }
    };
}

describe('portable restore resume safety', () => {
    it('issues one identity-bound token only after complete reverse rollback and resumes only explicitly', async () => {
        const calls = [];
        let fail = true;
        const executor = api.createPortableRestoreExecutor({
            contributors: {
                chats: port({
                    async snapshot() { calls.push('snapshot:chats'); return { before: 'chats' }; },
                    async apply() { calls.push('apply:chats'); return { applied: 'chats' }; },
                    async rollback() { calls.push('rollback:chats'); return { restored: 'chats' }; }
                }),
                annotations: port({
                    async snapshot() { calls.push('snapshot:annotations'); return { before: 'annotations' }; },
                    async apply() {
                        calls.push('apply:annotations');
                        if (fail) throw new Error('first attempt failed');
                        return { applied: 'annotations' };
                    },
                    async rollback() { calls.push('rollback:annotations'); return { restored: 'annotations' }; }
                })
            }
        });
        const plan = restorePlan(['chats', 'annotations']);
        let failure;
        await assert.rejects(executor.execute(plan), error => {
            failure = error;
            assert.equal(error.code, 'RESTORE_EXECUTION_FAILED');
            assert.equal(error.resumeEligibility.eligible, true);
            assert.equal(error.resumeEligibility.rollbackComplete, true);
            assert.equal(error.resumeToken.archiveChecksum, CHECKSUM);
            assert.deepEqual(error.resumeToken.selectedSections, ['chats', 'annotations']);
            assert.deepEqual(error.resumeToken.rollbackState.map(item => item.status), ['rolled-back', 'rolled-back']);
            return true;
        });
        assert.deepEqual(calls, [
            'snapshot:chats', 'apply:chats', 'snapshot:annotations', 'apply:annotations',
            'rollback:annotations', 'rollback:chats'
        ]);
        assert.equal(executor.getResumeEligibility(failure.resumeToken).eligible, true);
        assert.equal(executor.getResumeEligibility(Object.freeze({})).reason, 'INVALID_TOKEN');
        assert.equal(executor.getResumeEligibility().eligible, true);
        await assert.rejects(executor.resume(failure.resumeToken, { sections: ['chats'] }), expectCode('RESUME_SELECTION_LOCKED'));
        assert.equal(executor.getResumeEligibility(failure.resumeToken).eligible, true);

        fail = false;
        const resumed = await executor.resume(failure.resumeToken);
        assert.equal(resumed.status, 'completed');
        assert.deepEqual(resumed.selectedSections, ['chats', 'annotations']);
        assert.equal(executor.getResumeEligibility(failure.resumeToken).reason, 'TOKEN_CONSUMED');
        await assert.rejects(executor.resume(failure.resumeToken), expectCode('RESTORE_RESUME_UNAVAILABLE'));
        await assert.rejects(executor.execute(plan), expectCode('RESTORE_ALREADY_EXECUTED'));
        assert.equal(calls.filter(call => call === 'apply:annotations').length, 2);
    });

    it('makes cancellation resumable only after rollback and consumes each failed-attempt token once', async () => {
        const controller = new AbortController();
        let attempts = 0;
        let rollbacks = 0;
        const executor = api.createPortableRestoreExecutor({
            contributors: {
                chats: port({
                    async apply() {
                        attempts += 1;
                        if (attempts === 1) {
                            controller.abort('user-cancel');
                            return { partiallyApplied: true };
                        }
                        return { applied: true };
                    },
                    async rollback() { rollbacks += 1; return { restored: true }; }
                })
            }
        });
        let token;
        await assert.rejects(executor.execute(restorePlan(), { signal: controller.signal }), error => {
            assert.equal(error.code, 'RESTORE_ABORTED');
            assert.equal(error.result.status, 'aborted');
            token = error.resumeToken;
            return error.resumeEligibility.eligible;
        });
        assert.equal(attempts, 1);
        assert.equal(rollbacks, 1);
        assert.equal((await executor.resume(token)).status, 'completed');
        assert.equal(attempts, 2);
        assert.equal(rollbacks, 1);
    });

    it('fails closed when rollback fails or the proof is incomplete', async () => {
        const executor = api.createPortableRestoreExecutor({
            contributors: {
                chats: port({
                    async apply() { throw new Error('apply failed'); },
                    async rollback() { throw new Error('rollback failed'); }
                })
            }
        });
        await assert.rejects(executor.execute(restorePlan()), error => {
            assert.equal(error.code, 'RESTORE_ROLLBACK_FAILED');
            assert.equal(error.resumeEligibility.eligible, false);
            assert.equal(error.resumeEligibility.reason, 'ROLLBACK_FAILED');
            assert.equal(error.resumeToken, null);
            return true;
        });
        await assert.rejects(executor.resume(null), expectCode('RESTORE_RESUME_UNAVAILABLE'));

        const incomplete = {
            status: 'rolled-back',
            selectedSections: ['chats'],
            summary: { rolledBackSections: 0, rollbackFailedSections: 0 },
            sections: [{ name: 'chats', status: 'rolled-back' }],
            journal: [{ phase: 'apply', status: 'started', section: 'chats' }],
            rollbackErrors: []
        };
        assert.deepEqual(
            resumeApi.assessPortableRestoreResume(incomplete, ['chats']).reason,
            'ROLLBACK_INCOMPLETE'
        );
        assert.equal(resumeApi.assessPortableRestoreResume({ ...incomplete, status: 'completed' }, ['chats']).eligible, false);
    });

    it('invalidates an outstanding executor token when a distinct normal execution starts', async () => {
        let fail = true;
        const executor = api.createPortableRestoreExecutor({
            contributors: {
                chats: port({ async apply() { if (fail) throw new Error('fail'); } }),
                annotations: port()
            }
        });
        const plan = restorePlan(['chats', 'annotations']);
        let token;
        await assert.rejects(executor.execute(plan, { sections: ['chats'] }), error => {
            token = error.resumeToken;
            return true;
        });
        fail = false;
        assert.equal((await executor.execute(plan, { sections: ['annotations'] })).status, 'completed');
        assert.equal(executor.getResumeEligibility(token).reason, 'NEW_EXECUTION');
        await assert.rejects(executor.resume(token), expectCode('RESTORE_RESUME_UNAVAILABLE'));
    });

    it('covers opaque store defaults, unsupported resumes, supersession, and generation mismatch', () => {
        assert.equal(resumeApi.assessPortableRestoreResume({}, []).reason, 'ROLLBACK_FAILED');
        const mismatched = rolledBackResult();
        mismatched.selectedSections = undefined;
        mismatched.journal = undefined;
        mismatched.sections = undefined;
        assert.equal(resumeApi.assessPortableRestoreResume(mismatched, ['chats']).eligible, false);

        const store = resumeApi.createPortableRestoreResumeStore();
        assert.equal(store.inspect().reason, 'NO_RESUME');
        const unsupported = store.issue({
            plan: restorePlan(), selectedSections: ['chats'], result: rolledBackResult()
        });
        assert.equal(unsupported.reason, 'RESUME_UNSUPPORTED');
        let invalidated = null;
        const first = store.issue({
            plan: restorePlan(),
            selectedSections: ['chats'],
            result: rolledBackResult(),
            generation: 1,
            resume() {},
            invalidateInner: reason => { invalidated = reason; }
        });
        const second = store.issue({
            plan: restorePlan(), selectedSections: ['chats'], result: rolledBackResult(), generation: 2, resume() {}
        });
        assert.equal(invalidated, 'SUPERSEDED');
        assert.equal(store.inspect(first.token).reason, 'SUPERSEDED');
        assert.throws(() => store.claim(second.token, 1), expectCode('RESTORE_RESUME_UNAVAILABLE'));
        assert.equal(store.inspect(second.token).reason, 'GENERATION_CHANGED');
        assert.equal(store.invalidate(), false);
    });

    it('rejects a second resume while an explicit resume is already running', async () => {
        let fail = true;
        let release;
        let entered;
        const enteredPromise = new Promise(resolve => { entered = resolve; });
        const executor = api.createPortableRestoreExecutor({
            contributors: {
                chats: port({
                    async apply() {
                        if (fail) throw new Error('fail');
                        entered();
                        await new Promise(resolve => { release = resolve; });
                        return { applied: true };
                    }
                })
            }
        });
        let token;
        await assert.rejects(executor.execute(restorePlan()), error => { token = error.resumeToken; return true; });
        fail = false;
        const pending = executor.resume(token);
        await enteredPromise;
        await assert.rejects(executor.resume(token), expectCode('RESTORE_IN_PROGRESS'));
        release();
        assert.equal((await pending).status, 'completed');
        assert.equal(executor.getResumeEligibility().reason, 'NO_RESUME');
    });
});

describe('portable restore coordinator resume generation and contributor refresh', () => {
    it('binds resume to generation and invalidates it on reset, stop, and a newly described plan', async () => {
        let shouldFail = true;
        const harness = lifecycleCoordinator({
            contributors: {
                chats: port({ async apply() { if (shouldFail) throw new Error('fail'); } })
            }
        });
        const plan = restorePlan();
        let token;
        await assert.rejects(harness.coordinator.execute(plan), error => {
            token = error.resumeToken;
            assert.equal(error.resumeEligibility.eligible, true);
            assert.equal(token.generation, 1);
            return true;
        });
        assert.equal(harness.coordinator.getResumeEligibility(token).eligible, true);
        harness.bump();
        assert.equal(harness.coordinator.getResumeEligibility(token).reason, 'generation-change');
        await assert.rejects(harness.coordinator.resume(token), expectCode('RESTORE_RESUME_UNAVAILABLE'));

        shouldFail = true;
        let nextToken;
        await assert.rejects(harness.coordinator.execute(plan), error => { nextToken = error.resumeToken; return true; });
        await harness.coordinator.describe(structuredClone(plan));
        assert.equal(harness.coordinator.getResumeEligibility(nextToken).reason, 'NEW_PLAN');

        harness.coordinator.reset('manual-reset');
        shouldFail = true;
        let stoppedToken;
        await assert.rejects(harness.coordinator.execute(plan), error => { stoppedToken = error.resumeToken; return true; });
        harness.stop();
        assert.equal(harness.coordinator.getResumeEligibility(stoppedToken).reason, 'feature-stop');
    });

    it('uses freshly resolved contributors for each normal selection and the exact executor for resume', async () => {
        const calls = [];
        let version = 'old';
        let failOld = true;
        const contributors = () => {
            const currentVersion = version;
            return ({
            chats: port({
                async apply() {
                    calls.push(`chats:${currentVersion}`);
                    if (failOld) throw new Error('retry me');
                }
            }),
            annotations: port({ async apply() { calls.push(`annotations:${currentVersion}`); } })
        }); };
        const harness = lifecycleCoordinator({ contributors });
        const plan = restorePlan(['chats', 'annotations']);
        let token;
        await assert.rejects(harness.coordinator.execute(plan, { sections: ['chats'] }), error => {
            token = error.resumeToken;
            return true;
        });
        version = 'new';
        assert.equal((await harness.coordinator.execute(plan, { sections: ['annotations'] })).status, 'completed');
        failOld = false;
        assert.equal((await harness.coordinator.resume(token)).status, 'completed');
        assert.deepEqual(calls, ['chats:old', 'annotations:new', 'chats:old']);
    });

    it('rejects resume misuse before consuming a valid token and blocks inspection sessions', async () => {
        let fail = true;
        const harness = lifecycleCoordinator({
            contributors: { chats: port({ async apply() { if (fail) throw new Error('fail'); } }) }
        });
        let token;
        await assert.rejects(harness.coordinator.execute(restorePlan()), error => { token = error.resumeToken; return true; });
        for (const options of [null, [], 'bad']) {
            await assert.rejects(harness.coordinator.resume(token, options), expectCode('INVALID_ARGUMENT'));
        }
        await assert.rejects(harness.coordinator.resume(token, { sections: ['chats'] }), expectCode('RESUME_SELECTION_LOCKED'));
        assert.equal(harness.coordinator.getResumeEligibility(token).eligible, true);
        fail = false;
        assert.equal((await harness.coordinator.resume(token)).status, 'completed');

        const inspection = lifecycleCoordinator({
            contributors: { chats: port() },
            isReadOnly: () => true
        });
        await assert.rejects(inspection.coordinator.resume(Object.freeze({})), expectCode('READ_ONLY_SESSION'));
    });

    it('drops resume metadata when generation changes during failure and contains hostile external errors', async () => {
        let generation = 1;
        let rejectExecution;
        let invalidations = 0;
        const external = {
            sections: ['chats'],
            async execute() { return new Promise((_resolve, reject) => { rejectExecution = reject; }); },
            invalidateResume() { invalidations += 1; }
        };
        const coordinator = api.createPortableRestoreCoordinator({
            getIntegrations: async () => new Map(),
            executor: external,
            requireStarted: () => generation,
            assertCurrent: value => {
                if (value !== generation) throw new api.PortableArchiveFeatureError('OPERATION_CANCELLED', 'changed');
            }
        });
        const pending = coordinator.execute(restorePlan());
        while (!rejectExecution) await Promise.resolve();
        generation += 1;
        const changed = new Error('changed while failing');
        changed.result = rolledBackResult();
        rejectExecution(changed);
        await assert.rejects(pending, error => {
            assert.equal(error.resumeEligibility.reason, 'GENERATION_CHANGED');
            assert.equal(error.resumeToken, null);
            return true;
        });
        assert.equal(invalidations, 1);
        coordinator.reset();
        assert.equal(invalidations, 2);

        let rejectUndefined;
        const undefinedCoordinator = api.createPortableRestoreCoordinator({
            getIntegrations: async () => new Map(),
            executor: { sections: ['chats'], async execute() {
                return new Promise((_resolve, reject) => { rejectUndefined = reject; });
            } },
            requireStarted: () => generation,
            assertCurrent: value => {
                if (value !== generation) throw new api.PortableArchiveFeatureError('OPERATION_CANCELLED', 'changed');
            }
        });
        const undefinedPending = undefinedCoordinator.execute(restorePlan());
        while (!rejectUndefined) await Promise.resolve();
        generation += 1;
        rejectUndefined(undefined);
        await assert.rejects(undefinedPending, error => error === undefined);

        async function rejectsWith(value) {
            const harness = lifecycleCoordinator({
                executor: { sections: ['chats'], async execute() { throw value; } }
            });
            await assert.rejects(harness.coordinator.execute(restorePlan()), error => error === value);
        }
        const frozen = new Error('frozen');
        frozen.result = rolledBackResult();
        Object.freeze(frozen);
        await rejectsWith(frozen);
        const missing = new Error('missing result');
        await rejectsWith(missing);
        const hostile = new Error('hostile');
        Object.defineProperty(hostile, 'result', { get() { throw new Error('blocked result'); } });
        await rejectsWith(hostile);
        const nestedFailure = new Error('nested result rejected');
        const malformed = new Error('malformed result');
        malformed.result = { get journal() { throw nestedFailure; } };
        await assert.rejects(
            lifecycleCoordinator({ executor: { sections: ['chats'], async execute() { throw malformed; } } })
                .coordinator.execute(restorePlan()),
            error => error === nestedFailure
        );
        const callable = function externalFailure() {};
        callable.result = rolledBackResult();
        await rejectsWith(callable);
        await assert.rejects(
            lifecycleCoordinator({ executor: { sections: ['chats'], async execute() { throw 'primitive'; } } })
                .coordinator.execute(restorePlan()),
            error => error === 'primitive'
        );
    });

    it('blocks a second coordinator resume while the first explicit resume remains active', async () => {
        let fail = true;
        let release;
        let entered;
        const enteredPromise = new Promise(resolve => { entered = resolve; });
        const harness = lifecycleCoordinator({
            contributors: {
                chats: port({
                    async apply() {
                        if (fail) throw new Error('fail');
                        entered();
                        await new Promise(resolve => { release = resolve; });
                    }
                })
            }
        });
        let token;
        await assert.rejects(harness.coordinator.execute(restorePlan()), error => { token = error.resumeToken; return true; });
        fail = false;
        const pending = harness.coordinator.resume(token);
        await enteredPromise;
        await assert.rejects(harness.coordinator.resume(token), expectCode('RESTORE_IN_PROGRESS'));
        release();
        assert.equal((await pending).status, 'completed');
    });
});

function controlElement(overrides = {}) {
    return {
        disabled: false,
        value: '',
        checked: false,
        style: { display: '' },
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = String(value); },
        ...overrides
    };
}

function dialogHarness(overrides = {}) {
    const token = Object.freeze({ token: true });
    const elements = {
        apply: controlElement(), cancel: controlElement(), close: controlElement(),
        confirmation: controlElement(), progress: controlElement(),
        resume: controlElement(), resumeConfirmation: controlElement(),
        resumeGroup: controlElement({ style: { display: 'none' } })
    };
    const checkbox = controlElement({ checked: true, value: 'chats' });
    const calls = [];
    const controller = dialogApi.wireRestoreDialogExecution({
        ...elements,
        checkboxes: new Map([['chats', checkbox]]),
        translate: (_zh, en) => en,
        appendJournal: message => calls.push(`journal:${message}`),
        renderResult: result => calls.push(`result:${result.status}`),
        applyRestore: overrides.applyRestore ?? (async () => ({ status: 'completed', sections: [] })),
        resumeRestore: overrides.resumeRestore ?? (async () => ({ status: 'completed', sections: [] })),
        getResumeEligibility: overrides.getResumeEligibility ?? (candidate => ({
            eligible: candidate === token, token: candidate
        })),
        cancelRestore: overrides.cancelRestore ?? (() => false),
        closeDialog: () => calls.push('close')
    });
    return { token, elements, checkbox, calls, controller };
}

describe('portable restore resume dialog interaction', () => {
    it('never resumes automatically and requires a second exact RESUME confirmation', async () => {
        let resumeCalls = 0;
        const harness = dialogHarness({
            async applyRestore({ onProgress }) {
                await onProgress({ phase: 'rollback', status: 'completed', section: 'chats' });
                const error = new Error('failed');
                error.result = { status: 'rolled-back', sections: [], rollbackErrors: [] };
                error.resumeEligibility = { eligible: true, token: harness.token };
                throw error;
            },
            async resumeRestore(_token, { onProgress }) {
                resumeCalls += 1;
                await onProgress({ phase: 'execution', status: 'completed', section: null });
                return { status: 'completed', sections: [] };
            }
        });
        const { elements } = harness;
        assert.equal(harness.controller.running, false);
        assert.equal(await elements.apply.onclick(), null);
        elements.confirmation.value = 'RESTORE';
        elements.confirmation.oninput();
        assert.equal(elements.apply.disabled, false);
        assert.equal(await elements.apply.onclick(), null);
        assert.equal(resumeCalls, 0);
        assert.equal(elements.resumeGroup.style.display, '');
        assert.match(elements.progress.textContent, /rollback completed/);
        elements.resumeConfirmation.value = 'resume';
        elements.resumeConfirmation.oninput();
        assert.equal(elements.resume.disabled, true);
        elements.resumeConfirmation.value = 'RESUME';
        elements.resumeConfirmation.oninput();
        assert.equal(elements.resume.disabled, false);
        assert.equal((await elements.resume.onclick()).status, 'completed');
        assert.equal(resumeCalls, 1);
        assert.equal(elements.resumeGroup.style.display, 'none');
        assert.equal(await elements.resume.onclick(), null);
    });

    it('blocks expired and rollback-failed resumes while preserving cancel and close behavior', async () => {
        let valid = true;
        const rollbackError = new Error('apply failed');
        rollbackError.result = {
            status: 'rollback-failed',
            sections: [],
            rollbackErrors: [{ section: 'chats', message: 'failed' }]
        };
        rollbackError.resumeEligibility = { eligible: false, reason: 'ROLLBACK_FAILED', token: null };
        const failed = dialogHarness({ async applyRestore() { throw rollbackError; } });
        failed.elements.confirmation.value = 'RESTORE';
        failed.elements.confirmation.oninput();
        await failed.elements.apply.onclick();
        assert.match(failed.elements.progress.textContent, /resume is blocked/);
        assert.equal(failed.elements.resumeGroup.style.display, 'none');

        const expired = dialogHarness({
            async applyRestore() {
                const error = new Error('failed');
                error.result = { status: 'rolled-back', sections: [], rollbackErrors: [] };
                error.resumeEligibility = { eligible: true, token: expired.token };
                throw error;
            },
            getResumeEligibility(candidate) { return { eligible: valid && candidate === expired.token, token: candidate }; },
            cancelRestore() { return true; }
        });
        expired.elements.confirmation.value = 'RESTORE';
        expired.elements.confirmation.oninput();
        await expired.elements.apply.onclick();
        valid = false;
        expired.elements.resumeConfirmation.value = 'RESUME';
        expired.elements.resumeConfirmation.oninput();
        assert.equal(await expired.elements.resume.onclick(), null);
        assert.equal(expired.elements.progress.textContent, 'Resume token is no longer valid.');
        assert.equal(expired.elements.cancel.onclick(), true);
        assert.equal(expired.elements.progress.textContent, 'Cancelling and rolling back…');
        expired.elements.close.onclick();
        assert.deepEqual(expired.calls.at(-1), 'close');
    });

    it('discovers eligibility from a token fallback and keeps Close inert during active work', async () => {
        let release;
        let started;
        const startedPromise = new Promise(resolve => { started = resolve; });
        const harness = dialogHarness({
            async applyRestore() {
                started();
                await new Promise(resolve => { release = resolve; });
                const error = new Error('failed');
                error.result = { status: 'rolled-back', sections: [], rollbackErrors: [] };
                error.resumeToken = harness.token;
                throw error;
            }
        });
        harness.elements.confirmation.value = 'RESTORE';
        harness.elements.confirmation.oninput();
        const pending = harness.elements.apply.onclick();
        await startedPromise;
        assert.equal(harness.controller.running, true);
        harness.elements.close.onclick();
        assert.equal(harness.calls.includes('close'), false);
        release();
        await pending;
        assert.equal(harness.elements.resumeGroup.style.display, '');

        const primitive = dialogHarness({ async applyRestore() { throw null; } });
        primitive.elements.confirmation.value = 'RESTORE';
        primitive.elements.confirmation.oninput();
        await primitive.elements.apply.onclick();
        assert.equal(primitive.elements.progress.textContent, 'null');

        for (const [failure, message] of [[new Error('plain failure'), 'plain failure'], [undefined, 'undefined']]) {
            const generic = dialogHarness({ async applyRestore() { throw failure; } });
            generic.elements.confirmation.value = 'RESTORE';
            generic.elements.confirmation.oninput();
            await generic.elements.apply.onclick();
            assert.equal(generic.elements.progress.textContent, message);
        }
    });
});
