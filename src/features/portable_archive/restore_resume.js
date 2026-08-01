import { clonePortableValue } from './canonical.js';
import { archiveError } from './errors.js';

const SAFE_SECTION_STATES = new Set(['cancelled', 'failed', 'not-run', 'rolled-back', 'skipped']);

function sameValues(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function rollbackState(result) {
    return Object.freeze((result.sections || []).map(section => Object.freeze({
        name: section.name,
        status: section.status,
        rolledBack: section.status === 'rolled-back'
    })));
}

/** Proves that no write from a failed attempt remains before a resume is offered. */
export function assessPortableRestoreResume(result, selectedSections) {
    const applyStarted = (result.journal || [])
        .filter(entry => entry.phase === 'apply' && entry.status === 'started')
        .map(entry => entry.section);
    const rollbackCompleted = (result.journal || [])
        .filter(entry => entry.phase === 'rollback' && entry.status === 'completed')
        .map(entry => entry.section);
    const states = rollbackState(result);
    const statusRecoverable = ['aborted', 'rolled-back'].includes(result.status);
    const selectionMatches = sameValues(result.selectedSections || [], selectedSections);
    const reverseRollback = sameValues(rollbackCompleted, [...applyStarted].reverse());
    const summariesMatch = result.summary?.rolledBackSections === rollbackCompleted.length
        && result.summary?.rollbackFailedSections === 0;
    const sectionsSafe = states.length === selectedSections.length
        && states.every(section => SAFE_SECTION_STATES.has(section.status));
    const noRollbackErrors = Array.isArray(result.rollbackErrors) && result.rollbackErrors.length === 0;
    const rollbackComplete = selectionMatches && reverseRollback && summariesMatch && sectionsSafe && noRollbackErrors;
    const eligible = statusRecoverable && rollbackComplete;
    const reason = eligible
        ? null
        : noRollbackErrors && result.summary?.rollbackFailedSections === 0
            ? 'ROLLBACK_INCOMPLETE'
            : 'ROLLBACK_FAILED';
    return Object.freeze({ eligible, reason, rollbackComplete, rollbackState: states });
}

function publicEligibility(record, eligible = true, reason = null) {
    if (!record) return Object.freeze({ eligible: false, reason: reason ?? 'NO_RESUME', token: null });
    return Object.freeze({
        eligible,
        reason,
        token: eligible ? record.token : null,
        archiveChecksum: record.archiveChecksum,
        selectedSections: Object.freeze([...record.selectedSections]),
        rollbackComplete: record.rollbackComplete,
        rollbackState: record.rollbackState,
        generation: record.generation ?? null
    });
}

/** Identity-bound, single-use resume records; cloned/forged tokens cannot be used. */
export function createPortableRestoreResumeStore() {
    const records = new WeakMap();
    let current = null;

    function invalidate(reason = 'RESUME_INVALIDATED') {
        if (!current) return false;
        current.state = 'invalidated';
        current.reason = reason;
        current.invalidateInner?.(reason);
        current = null;
        return true;
    }

    function issue({ plan, selectedSections, result, generation, innerToken, resume, invalidateInner }) {
        invalidate('SUPERSEDED');
        const assessment = assessPortableRestoreResume(result, selectedSections);
        if (!assessment.eligible || (innerToken === undefined && resume === undefined)) {
            const reason = assessment.reason ?? 'RESUME_UNSUPPORTED';
            return publicEligibility({
                token: null,
                archiveChecksum: plan.archiveChecksum,
                selectedSections,
                rollbackComplete: assessment.rollbackComplete,
                rollbackState: assessment.rollbackState,
                generation
            }, false, reason);
        }
        const token = Object.freeze({
            kind: 'primer-pp.portable-restore-resume',
            archiveChecksum: plan.archiveChecksum,
            selectedSections: Object.freeze([...selectedSections]),
            rollbackComplete: true,
            rollbackState: assessment.rollbackState,
            generation: generation ?? null
        });
        const record = {
            token,
            state: 'active',
            reason: null,
            archiveChecksum: plan.archiveChecksum,
            selectedSections: [...selectedSections],
            rollbackComplete: true,
            rollbackState: assessment.rollbackState,
            generation,
            plan: clonePortableValue(plan, { path: '$.resume.plan' }),
            innerToken,
            resume,
            invalidateInner
        };
        records.set(token, record);
        current = record;
        return publicEligibility(record);
    }

    function inspect(token = current?.token) {
        if (!token || typeof token !== 'object') return publicEligibility(null, false);
        const record = records.get(token);
        if (!record) return publicEligibility(null, false, 'INVALID_TOKEN');
        return record.state === 'active'
            ? publicEligibility(record)
            : publicEligibility(record, false, record.reason);
    }

    function claim(token, generation) {
        const record = token && typeof token === 'object' ? records.get(token) : null;
        if (!record || record !== current || record.state !== 'active') {
            throw archiveError('RESTORE_RESUME_UNAVAILABLE', 'Restore resume token is invalid or no longer active');
        }
        if (record.generation !== undefined && record.generation !== generation) {
            invalidate('GENERATION_CHANGED');
            throw archiveError('RESTORE_RESUME_UNAVAILABLE', 'Restore resume token belongs to an earlier feature generation');
        }
        record.state = 'consumed';
        record.reason = 'TOKEN_CONSUMED';
        current = null;
        return record;
    }

    return Object.freeze({ issue, inspect, claim, invalidate });
}
