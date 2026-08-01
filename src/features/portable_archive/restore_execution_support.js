import { PORTABLE_ARCHIVE_SECTIONS } from './constants.js';
import { clonePortableValue } from './canonical.js';
import { archiveError, PortableArchiveError } from './errors.js';
import { assertRestoreExactKeys, isRestoreRecord } from './restore_plan_validation.js';

export const RESTORE_CONTRIBUTOR_KEYS = Object.freeze(['snapshot', 'apply', 'rollback']);
const EXECUTE_OPTION_KEYS = Object.freeze(['sections', 'signal', 'onProgress']);

function assertProgress(value, path) {
    if (value !== undefined && typeof value !== 'function') {
        throw archiveError('INVALID_ARGUMENT', `${path} must be a function`);
    }
}

function captureContributors(input) {
    if (!isRestoreRecord(input)) {
        throw archiveError('INVALID_CONTRIBUTORS', 'contributors must be an object');
    }
    const contributors = new Map();
    for (const [section, contributor] of Object.entries(input)) {
        if (!PORTABLE_ARCHIVE_SECTIONS.includes(section)) {
            throw archiveError('INVALID_CONTRIBUTOR', `Unknown contributor section: ${section}`, { section });
        }
        if (!isRestoreRecord(contributor)) {
            throw archiveError('INVALID_CONTRIBUTOR', `${section} contributor must be an object`, { section });
        }
        assertRestoreExactKeys(
            contributor,
            RESTORE_CONTRIBUTOR_KEYS,
            'INVALID_CONTRIBUTOR',
            `$.contributors.${section}`
        );
        for (const method of RESTORE_CONTRIBUTOR_KEYS) {
            if (typeof contributor[method] !== 'function') {
                throw archiveError('INVALID_CONTRIBUTOR', `${section}.${method} must be a function`, {
                    section,
                    method
                });
            }
        }
        contributors.set(section, Object.freeze({
            snapshot: contributor.snapshot,
            apply: contributor.apply,
            rollback: contributor.rollback
        }));
    }
    return contributors;
}

export function prepareRestoreExecutorOptions(options) {
    if (!isRestoreRecord(options)) throw archiveError('INVALID_ARGUMENT', 'executor options must be an object');
    const expected = ['contributors', ...(Object.hasOwn(options, 'onProgress') ? ['onProgress'] : [])];
    assertRestoreExactKeys(options, expected, 'INVALID_ARGUMENT', '$.executorOptions');
    assertProgress(options.onProgress, 'onProgress');
    return { contributors: captureContributors(options.contributors), onProgress: options.onProgress };
}

function normalizeSignal(signal) {
    if (signal === undefined) return null;
    if (!signal || typeof signal !== 'object' || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
        throw archiveError('INVALID_ABORT_SIGNAL', 'signal must implement the AbortSignal contract');
    }
    return signal;
}

export function prepareRestoreExecuteOptions(options, defaultProgress) {
    if (!isRestoreRecord(options)) throw archiveError('INVALID_ARGUMENT', 'execute options must be an object');
    for (const key of Object.keys(options)) {
        if (!EXECUTE_OPTION_KEYS.includes(key)) {
            throw archiveError('INVALID_ARGUMENT', `Unknown execute option: ${key}`, { option: key });
        }
    }
    assertProgress(options.onProgress, 'onProgress');
    return {
        sections: options.sections,
        signal: normalizeSignal(options.signal),
        onProgress: options.onProgress ?? defaultProgress
    };
}

export function cloneRestorePortValue(value, path) {
    return clonePortableValue(value, { path });
}

export function cloneRestorePortResult(value, path) {
    return value === undefined ? null : cloneRestorePortValue(value, path);
}

function safeErrorMessage(error) {
    const message = typeof error?.message === 'string' && error.message ? error.message : 'Contributor failed';
    if (/^(?:otpauth:\/\/|bearer\s)|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(message)) {
        return 'Contributor failed with redacted sensitive details';
    }
    return message.slice(0, 1000);
}

export function describeRestoreError(error, phase, section = null) {
    return {
        name: typeof error?.name === 'string' && error.name ? error.name : 'Error',
        code: typeof error?.code === 'string' && error.code ? error.code : 'CONTRIBUTOR_FAILURE',
        message: safeErrorMessage(error),
        phase,
        section
    };
}

export function throwIfRestoreAborted(signal) {
    if (!signal?.aborted) return;
    const details = typeof signal.reason === 'string' && signal.reason
        ? { reason: signal.reason.slice(0, 500) }
        : {};
    throw archiveError('RESTORE_ABORTED', 'Portable restore execution was aborted', details);
}

export function createRestoreResult(plan, sections) {
    const actionCount = section => section.actions.filter(action => action.action !== 'skip').length;
    return {
        ok: false,
        status: 'running',
        archiveChecksum: plan.archiveChecksum,
        strategy: plan.strategy,
        selectedSections: sections.map(section => section.name),
        summary: {
            totalSections: sections.length,
            appliedSections: 0,
            skippedSections: 0,
            rolledBackSections: 0,
            rollbackFailedSections: 0,
            totalActions: sections.reduce((total, section) => total + actionCount(section), 0)
        },
        sections: sections.map(section => ({
            name: section.name,
            status: 'pending',
            actionCount: actionCount(section),
            result: null,
            rollbackResult: null
        })),
        journal: [],
        failure: null,
        rollbackErrors: [],
        progressErrors: []
    };
}

export function isolateRestoreResult(result) {
    return clonePortableValue(result, { path: '$.restoreResult' });
}

export function createRestoreProgressJournal(result, onProgress) {
    let sequence = 0;
    return async function publish(phase, status, section = null) {
        const entry = {
            sequence: ++sequence,
            phase,
            status,
            section,
            completedSections: result.summary.appliedSections + result.summary.skippedSections,
            totalSections: result.summary.totalSections
        };
        result.journal.push(entry);
        if (!onProgress) return;
        try {
            await onProgress(cloneRestorePortValue(entry, '$.progress'));
        } catch (error) {
            result.progressErrors.push(describeRestoreError(error, 'progress', section));
            result.journal.push({
                sequence: ++sequence,
                phase: 'progress',
                status: 'failed',
                section,
                completedSections: result.summary.appliedSections + result.summary.skippedSections,
                totalSections: result.summary.totalSections
            });
        }
    };
}

/** Failure with a clone-isolated journal/result suitable for UI or diagnostics. */
export class PortableRestoreExecutionError extends PortableArchiveError {
    constructor(code, message, result, cause) {
        const isolated = isolateRestoreResult(result);
        super(code, message, { result: isolated }, cause);
        this.name = 'PortableRestoreExecutionError';
        this.result = isolateRestoreResult(isolated);
    }
}
