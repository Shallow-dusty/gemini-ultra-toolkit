import { PORTABLE_ARCHIVE_SECTIONS } from './constants.js';
import { fail, isPlainObject } from './feature_contract.js';
import { createPortableRestoreExecutor } from './restore_executor.js';
import { validatePortableRestorePlan } from './restore_plan_validation.js';
import { createPortableRestoreResumeStore } from './restore_resume.js';

function sourceResolver(source, label) {
    if (source === undefined) return async () => ({});
    if (typeof source === 'function') return source;
    if (source instanceof Map || isPlainObject(source)) return async () => source;
    throw new TypeError(`${label} must be an object, Map, or function`);
}

function entries(value, label) {
    if (value instanceof Map) return [...value.entries()];
    if (isPlainObject(value)) return Object.entries(value);
    fail('INVALID_INTEGRATIONS', `${label} must resolve to an object or Map`);
}

function assertSection(name, label) {
    if (!PORTABLE_ARCHIVE_SECTIONS.includes(name)) {
        fail('INVALID_INTEGRATIONS', `Unknown ${label} section: ${String(name)}`, { section: name });
    }
}

export function normalizePortableArchiveIntegrations(value) {
    const normalized = new Map();
    for (const [name, integration] of entries(value, 'integrations')) {
        assertSection(name, 'integration');
        if (!isPlainObject(integration) || integration.section !== name) {
            fail('INVALID_INTEGRATIONS', `${name} integration must declare its section`, { section: name });
        }
        const keys = Object.keys(integration);
        if (keys.some(key => !['section', 'exportSection', 'contributor'].includes(key))) {
            fail('INVALID_INTEGRATIONS', `${name} integration has unsupported fields`, { section: name });
        }
        if (integration.exportSection !== undefined && typeof integration.exportSection !== 'function') {
            fail('INVALID_INTEGRATIONS', `${name}.exportSection must be a function`, { section: name });
        }
        if (integration.contributor !== undefined && !isPlainObject(integration.contributor)) {
            fail('INVALID_INTEGRATIONS', `${name}.contributor must be an object`, { section: name });
        }
        if (integration.exportSection === undefined && integration.contributor === undefined) {
            fail('INVALID_INTEGRATIONS', `${name} integration exposes no archive capability`, { section: name });
        }
        normalized.set(name, Object.freeze({ ...integration }));
    }
    return normalized;
}

export function createPortableIntegrationResolver(source) {
    const resolve = sourceResolver(source, 'integrations');
    return async function getIntegrations() {
        return normalizePortableArchiveIntegrations(await resolve());
    };
}

function normalizeContributors(value) {
    const normalized = {};
    for (const [name, contributor] of entries(value, 'contributors')) {
        assertSection(name, 'contributor');
        if (!isPlainObject(contributor)) {
            fail('INVALID_CONTRIBUTORS', `${name} contributor must be an object`, { section: name });
        }
        normalized[name] = contributor;
    }
    return normalized;
}

function executableCount(section) {
    return section.actions.filter(action => action.action !== 'skip').length;
}

function externalHasSection(executor, name) {
    if (!executor) return false;
    if (typeof executor.hasContributor === 'function') return executor.hasContributor(name) === true;
    return Array.isArray(executor.sections) && executor.sections.includes(name);
}

/** Owns restore execution, cancellation, retry prevention, and contributor discovery. */
export function createPortableRestoreCoordinator(options = {}) {
    const resolveContributors = sourceResolver(options.contributors, 'contributors');
    if (typeof options.getIntegrations !== 'function') throw new TypeError('getIntegrations must be a function');
    if (typeof options.requireStarted !== 'function') throw new TypeError('requireStarted must be a function');
    if (typeof options.assertCurrent !== 'function') throw new TypeError('assertCurrent must be a function');
    if (options.isReadOnly !== undefined && typeof options.isReadOnly !== 'function') {
        throw new TypeError('isReadOnly must be a function');
    }
    if (options.executor !== undefined && typeof options.executor?.execute !== 'function') {
        throw new TypeError('executor must implement execute()');
    }
    if (options.createExecutor !== undefined && typeof options.createExecutor !== 'function') {
        throw new TypeError('createExecutor must be a function');
    }

    const isReadOnly = options.isReadOnly ?? (() => false);
    const createExecutor = options.createExecutor ?? createPortableRestoreExecutor;
    const externalExecutor = options.executor ?? null;
    let active = null;
    let observedPlan = null;
    const attempted = new Set();
    const resumes = createPortableRestoreResumeStore();

    async function contributorSnapshot() {
        const integrations = await options.getIntegrations();
        const explicit = normalizeContributors(await resolveContributors());
        for (const [name, integration] of integrations) {
            if (integration.contributor !== undefined && explicit[name] === undefined) {
                explicit[name] = integration.contributor;
            }
        }
        return explicit;
    }

    async function describe(planValue) {
        if (observedPlan !== null && observedPlan !== planValue) resumes.invalidate('NEW_PLAN');
        observedPlan = planValue;
        const plan = validatePortableRestorePlan(planValue);
        const contributors = await contributorSnapshot();
        return {
            plan,
            contributors,
            sections: plan.sections.map(section => {
                const actionCount = executableCount(section);
                const available = actionCount > 0 && (
                    contributors[section.name] !== undefined
                    || externalHasSection(options.executor, section.name)
                );
                return {
                    name: section.name,
                    actionCount,
                    available,
                    reason: actionCount === 0
                        ? 'NO_CHANGES'
                        : available ? null : 'MISSING_CONTRIBUTOR'
                };
            })
        };
    }

    function selectedSections(description, requested) {
        if (requested !== undefined && !Array.isArray(requested)) {
            fail('INVALID_SELECTION', 'Restore sections must be an array');
        }
        const names = requested ?? description.sections.map(section => section.name);
        if (!names.length || new Set(names).size !== names.length) {
            fail('INVALID_SELECTION', 'Select at least one unique restore section');
        }
        const selected = names.map(name => description.sections.find(section => section.name === name));
        if (selected.some(section => !section)) {
            fail('INVALID_SELECTION', 'Restore selection contains an unknown section');
        }
        const unavailable = selected.find(section => !section.available);
        if (unavailable) {
            fail('SECTION_UNAVAILABLE', `Restore section is unavailable: ${unavailable.name}`, {
                section: unavailable.name,
                reason: unavailable.reason
            });
        }
        return selected.map(section => section.name);
    }

    function claim(plan, names) {
        const keys = names.map(name => `${plan.archiveChecksum}\u0000${name}`);
        const repeated = keys.find(key => attempted.has(key));
        if (repeated) fail('RESTORE_ALREADY_EXECUTED', 'Restore selection has already been attempted');
        keys.forEach(key => attempted.add(key));
    }

    function validateExecuteOptions(executeOptions, resumeMode = false) {
        if (!isPlainObject(executeOptions)) fail('INVALID_ARGUMENT', 'Restore execute options must be an object');
        if (resumeMode && Object.hasOwn(executeOptions, 'sections')) {
            fail('RESUME_SELECTION_LOCKED', 'Resume uses the section selection bound to its token');
        }
        const signal = executeOptions.signal;
        if (signal !== undefined && (!signal || typeof signal.addEventListener !== 'function')) {
            fail('INVALID_ABORT_SIGNAL', 'Restore signal must implement AbortSignal');
        }
    }

    function setResumeMetadata(error, eligibility) {
        if (!error || (typeof error !== 'object' && typeof error !== 'function')) return;
        try {
            error.resumeEligibility = eligibility;
            error.resumeToken = eligibility.token;
        } catch { /* A frozen external error remains safely non-resumable. */ }
    }

    function captureResume(error, executor, plan, names, generation) {
        try {
            options.assertCurrent(generation);
        } catch {
            executor.invalidateResume?.('GENERATION_CHANGED');
            resumes.invalidate('GENERATION_CHANGED');
            setResumeMetadata(error, Object.freeze({ eligible: false, reason: 'GENERATION_CHANGED', token: null }));
            return;
        }
        let result;
        try { result = error?.result; }
        catch { return; }
        if (!result) return;
        const innerToken = error.resumeToken;
        const eligibility = resumes.issue({
            plan,
            selectedSections: names,
            result,
            generation,
            innerToken,
            resume: typeof executor.resume === 'function'
                ? (token, runOptions) => executor.resume(token, runOptions)
                : undefined,
            invalidateInner: reason => executor.invalidateResume?.(reason)
        });
        setResumeMetadata(error, eligibility);
    }

    async function run(executor, plan, names, generation, executeOptions, invoke) {
        const controller = new AbortController();
        const externalSignal = executeOptions.signal;
        const forwardAbort = () => controller.abort(externalSignal.reason);
        if (externalSignal?.aborted) forwardAbort();
        else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
        active = { controller };
        const cleanup = () => {
            active = null;
            externalSignal?.removeEventListener?.('abort', forwardAbort);
        };
        try {
            const result = await invoke(controller.signal);
            options.assertCurrent(generation);
            cleanup();
            return result;
        } catch (error) {
            cleanup();
            captureResume(error, executor, plan, names, generation);
            throw error;
        }
    }

    async function execute(planValue, executeOptions = {}) {
        const generation = options.requireStarted();
        validateExecuteOptions(executeOptions);
        if (active) fail('RESTORE_IN_PROGRESS', 'A restore execution is already in progress');
        if (isReadOnly()) fail('READ_ONLY_SESSION', 'Inspection sessions cannot restore archives');
        const description = await describe(planValue);
        options.assertCurrent(generation);
        const names = selectedSections(description, executeOptions.sections);
        claim(description.plan, names);
        const executor = externalExecutor ?? createExecutor({ contributors: description.contributors });

        return run(executor, description.plan, names, generation, executeOptions, signal => (
            executor.execute(description.plan, {
                sections: names,
                signal,
                onProgress: executeOptions.onProgress
            })
        ));
    }

    async function resume(token, executeOptions = {}) {
        const generation = options.requireStarted();
        validateExecuteOptions(executeOptions, true);
        if (active) fail('RESTORE_IN_PROGRESS', 'A restore execution is already in progress');
        if (isReadOnly()) fail('READ_ONLY_SESSION', 'Inspection sessions cannot restore archives');
        const record = resumes.claim(token, generation);
        options.assertCurrent(generation);
        const executor = { resume: record.resume, invalidateResume: record.invalidateInner };
        return run(executor, record.plan, record.selectedSections, generation, executeOptions, signal => (
            record.resume(record.innerToken, { signal, onProgress: executeOptions.onProgress })
        ));
    }

    function cancel(reason = 'cancelled') {
        if (!active || active.controller.signal.aborted) return false;
        active.controller.abort(reason);
        return true;
    }

    function reset(reason) {
        const cancelled = cancel(reason);
        resumes.invalidate(reason || 'RESET');
        externalExecutor?.invalidateResume?.(reason || 'RESET');
        observedPlan = null;
        attempted.clear();
        return cancelled;
    }

    return Object.freeze({
        get running() { return active !== null; },
        describe,
        execute,
        resume,
        getResumeEligibility: resumes.inspect,
        invalidateResume: resumes.invalidate,
        cancel,
        reset
    });
}
