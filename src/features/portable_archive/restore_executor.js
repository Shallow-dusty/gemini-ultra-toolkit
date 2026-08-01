import { archiveError } from './errors.js';
import {
    RESTORE_ACTION_NAMES,
    RESTORE_SUMMARY_KEYS,
    isRestoreRecord,
    selectPortableRestoreSections,
    validatePortableRestorePlan
} from './restore_plan_validation.js';
import {
    RESTORE_CONTRIBUTOR_KEYS,
    PortableRestoreExecutionError,
    cloneRestorePortResult,
    cloneRestorePortValue,
    createRestoreProgressJournal,
    createRestoreResult,
    describeRestoreError,
    isolateRestoreResult,
    prepareRestoreExecuteOptions,
    prepareRestoreExecutorOptions,
    throwIfRestoreAborted
} from './restore_execution_support.js';
import { createPortableRestoreResumeStore } from './restore_resume.js';

export { validatePortableRestorePlan } from './restore_plan_validation.js';
export { PortableRestoreExecutionError } from './restore_execution_support.js';

function executableSections(selected, contributors) {
    const executable = new Map();
    for (const section of selected) {
        const actions = section.actions.filter(action => action.action !== 'skip');
        if (actions.length === 0) continue;
        const contributor = contributors.get(section.name);
        if (!contributor) {
            throw archiveError('MISSING_CONTRIBUTOR', `No restore contributor for ${section.name}`, {
                section: section.name
            });
        }
        executable.set(section.name, { contributor, actions });
    }
    return executable;
}

function claimSections(plan, selected, attempted) {
    const keys = selected.map(section => `${plan.archiveChecksum}\u0000${section.name}`);
    const repeated = selected.find((_section, index) => attempted.has(keys[index]));
    if (repeated) {
        throw archiveError('RESTORE_ALREADY_EXECUTED', `Restore section was already executed: ${repeated.name}`, {
            section: repeated.name,
            archiveChecksum: plan.archiveChecksum
        });
    }
    keys.forEach(key => attempted.add(key));
}

function snapshotContext(section, actions, signal) {
    return {
        section: section.name,
        plan: cloneRestorePortValue(section, `$.ports.${section.name}.plan`),
        actions: cloneRestorePortValue(actions, `$.ports.${section.name}.actions`),
        signal
    };
}

function rollbackContext(record, failure) {
    const { section, actions, snapshot, applyResult } = record;
    return {
        section: section.name,
        plan: cloneRestorePortValue(section, `$.ports.${section.name}.plan`),
        actions: cloneRestorePortValue(actions, `$.ports.${section.name}.actions`),
        snapshot: cloneRestorePortValue(snapshot, `$.ports.${section.name}.snapshot`),
        applyResult: cloneRestorePortValue(applyResult, `$.ports.${section.name}.applyResult`),
        failure: cloneRestorePortValue(failure, `$.ports.${section.name}.failure`)
    };
}

async function rollbackApplied(stack, states, result, failure, publish) {
    for (const record of [...stack].reverse()) {
        const state = states.get(record.section.name);
        state.status = 'rolling-back';
        await publish('rollback', 'started', record.section.name);
        try {
            const rolledBack = await record.contributor.rollback(rollbackContext(record, failure));
            state.rollbackResult = cloneRestorePortResult(
                rolledBack,
                `$.ports.${record.section.name}.rollbackResult`
            );
            state.status = 'rolled-back';
            result.summary.rolledBackSections += 1;
            await publish('rollback', 'completed', record.section.name);
        } catch (error) {
            result.rollbackErrors.push(describeRestoreError(error, 'rollback', record.section.name));
            state.status = 'rollback-failed';
            result.summary.rollbackFailedSections += 1;
            await publish('rollback', 'failed', record.section.name);
        }
    }
}

function finalizeFailure(result, states, error) {
    for (const state of states.values()) {
        if (state.status === 'pending') state.status = error?.code === 'RESTORE_ABORTED' ? 'cancelled' : 'not-run';
    }
    result.status = result.rollbackErrors.length
        ? 'rollback-failed'
        : error?.code === 'RESTORE_ABORTED'
            ? 'aborted'
            : 'rolled-back';
    return result.rollbackErrors.length
        ? 'RESTORE_ROLLBACK_FAILED'
        : error?.code === 'RESTORE_ABORTED'
            ? 'RESTORE_ABORTED'
            : 'RESTORE_EXECUTION_FAILED';
}

/** Build a single-flight transactional executor from section-owned ports. */
export function createPortableRestoreExecutor(options = {}) {
    const prepared = prepareRestoreExecutorOptions(options);
    const attempted = new Set();
    const resumes = createPortableRestoreResumeStore();
    let running = false;

    async function run(plan, execution, selected) {
        const executable = executableSections(selected, prepared.contributors);
        running = true;

        const result = createRestoreResult(plan, selected);
        const states = new Map(result.sections.map(section => [section.name, section]));
        const rollbackStack = [];
        const publish = createRestoreProgressJournal(result, execution.onProgress);
        let activeSection = null;
        let activePhase = 'execution';

        try {
            throwIfRestoreAborted(execution.signal);
            await publish('execution', 'started');
            for (const section of selected) {
                activeSection = section.name;
                const state = states.get(section.name);
                const executableSection = executable.get(section.name);
                if (!executableSection) {
                    state.status = 'skipped';
                    result.summary.skippedSections += 1;
                    await publish('section', 'skipped', section.name);
                    throwIfRestoreAborted(execution.signal);
                    continue;
                }

                const { contributor, actions } = executableSection;
                activePhase = 'snapshot';
                state.status = 'snapshotting';
                await publish('snapshot', 'started', section.name);
                throwIfRestoreAborted(execution.signal);
                const context = snapshotContext(section, actions, execution.signal);
                const snapshotValue = await contributor.snapshot(context);
                if (snapshotValue === undefined) {
                    throw archiveError('INVALID_CONTRIBUTOR_RESULT', `${section.name}.snapshot returned undefined`, {
                        section: section.name
                    });
                }
                const snapshot = cloneRestorePortValue(snapshotValue, `$.ports.${section.name}.snapshot`);
                await publish('snapshot', 'completed', section.name);
                throwIfRestoreAborted(execution.signal);

                activePhase = 'apply';
                state.status = 'applying';
                const record = { section, actions, contributor, snapshot, applyResult: null };
                rollbackStack.push(record);
                await publish('apply', 'started', section.name);
                const applied = await contributor.apply({
                    ...snapshotContext(section, actions, execution.signal),
                    snapshot: cloneRestorePortValue(snapshot, `$.ports.${section.name}.snapshot`)
                });
                record.applyResult = cloneRestorePortResult(applied, `$.ports.${section.name}.applyResult`);
                state.result = cloneRestorePortValue(record.applyResult, `$.results.${section.name}`);
                state.status = 'applied';
                result.summary.appliedSections += 1;
                await publish('apply', 'completed', section.name);
                activePhase = 'abort';
                throwIfRestoreAborted(execution.signal);
            }

            result.ok = true;
            result.status = 'completed';
            activeSection = null;
            activePhase = 'execution';
            await publish('execution', 'completed');
            const isolated = isolateRestoreResult(result);
            running = false;
            return isolated;
        } catch (error) {
            const failure = describeRestoreError(error, activePhase, activeSection);
            result.failure = failure;
            const failedState = activeSection ? states.get(activeSection) : null;
            if (failedState && !['applied', 'skipped'].includes(failedState.status)) failedState.status = 'failed';
            await rollbackApplied(rollbackStack, states, result, failure, publish);
            const code = finalizeFailure(result, states, error);
            await publish('execution', 'failed');
            const executionFailure = new PortableRestoreExecutionError(
                code,
                'Portable restore execution failed',
                result,
                error
            );
            const resumeEligibility = resumes.issue({
                plan,
                selectedSections: selected.map(section => section.name),
                result,
                resume
            });
            executionFailure.resumeEligibility = resumeEligibility;
            executionFailure.resumeToken = resumeEligibility.token;
            running = false;
            throw executionFailure;
        }
    }

    async function execute(inputPlan, executeOptions = {}) {
        if (running) throw archiveError('RESTORE_IN_PROGRESS', 'A restore execution is already in progress');
        const plan = validatePortableRestorePlan(inputPlan);
        const execution = prepareRestoreExecuteOptions(executeOptions, prepared.onProgress);
        const selected = selectPortableRestoreSections(plan, execution.sections);
        claimSections(plan, selected, attempted);
        resumes.invalidate('NEW_EXECUTION');
        return run(plan, execution, selected);
    }

    async function resume(token, executeOptions = {}) {
        if (running) throw archiveError('RESTORE_IN_PROGRESS', 'A restore execution is already in progress');
        if (isRestoreRecord(executeOptions) && Object.hasOwn(executeOptions, 'sections')) {
            throw archiveError('RESUME_SELECTION_LOCKED', 'Resume uses the section selection bound to its token');
        }
        const execution = prepareRestoreExecuteOptions(executeOptions, prepared.onProgress);
        const record = resumes.claim(token);
        execution.sections = [...record.selectedSections];
        const plan = validatePortableRestorePlan(record.plan);
        const selected = selectPortableRestoreSections(plan, execution.sections);
        return run(plan, execution, selected);
    }

    return Object.freeze({
        get running() { return running; },
        execute,
        resume,
        getResumeEligibility: resumes.inspect,
        invalidateResume: resumes.invalidate
    });
}

export const portableRestoreExecutorInternals = Object.freeze({
    ACTION_NAMES: RESTORE_ACTION_NAMES,
    CONTRIBUTOR_KEYS: RESTORE_CONTRIBUTOR_KEYS,
    SUMMARY_KEYS: RESTORE_SUMMARY_KEYS,
    describeError: describeRestoreError,
    isPlainObject: isRestoreRecord,
    selectPlanSections: selectPortableRestoreSections
});
