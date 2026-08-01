import { PORTABLE_ARCHIVE_SECTIONS, RESTORE_CONFLICT_STRATEGIES } from './constants.js';
import { clonePortableValue } from './canonical.js';
import { archiveError } from './errors.js';

export const RESTORE_SUMMARY_KEYS = Object.freeze(['total', 'insert', 'skip', 'replace', 'rename']);
export const RESTORE_ACTION_NAMES = Object.freeze(['insert', 'skip', 'replace', 'rename']);

const PLAN_KEYS = Object.freeze(['dryRun', 'strategy', 'archiveChecksum', 'summary', 'sections']);
const SECTION_KEYS = Object.freeze(['name', 'summary', 'actions']);
const ACTION_KEYS = Object.freeze([
    'section', 'action', 'incomingIdentity', 'targetIdentity', 'identityPatch', 'value'
]);

export function isRestoreRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function assertRestoreExactKeys(value, expected, code, path) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        throw archiveError(code, `Unexpected fields at ${path}`, { path, expected: wanted, actual });
    }
}

function invalidPlan(message, details = {}) {
    throw archiveError('INVALID_RESTORE_PLAN', message, details);
}

function assertSummary(summary, path, expected = null) {
    if (!isRestoreRecord(summary)) invalidPlan(`${path} must be an object`, { path });
    assertRestoreExactKeys(summary, RESTORE_SUMMARY_KEYS, 'INVALID_RESTORE_PLAN', path);
    for (const key of RESTORE_SUMMARY_KEYS) {
        if (!Number.isSafeInteger(summary[key]) || summary[key] < 0) {
            invalidPlan(`${path}.${key} must be a non-negative safe integer`, { path, key });
        }
    }
    if (summary.total !== summary.insert + summary.skip + summary.replace + summary.rename) {
        invalidPlan(`${path} counts do not add up`, { path });
    }
    if (expected && RESTORE_SUMMARY_KEYS.some(key => summary[key] !== expected[key])) {
        invalidPlan(`${path} does not match its actions`, { path });
    }
}

function assertIdentity(value, path) {
    if (typeof value !== 'string' || !value) invalidPlan(`${path} must be a non-empty string`, { path });
}

function validateAction(action, sectionName, path) {
    if (!isRestoreRecord(action)) invalidPlan(`${path} must be an object`, { path });
    assertRestoreExactKeys(action, ACTION_KEYS, 'INVALID_RESTORE_PLAN', path);
    if (action.section !== sectionName) invalidPlan(`${path}.section does not match its parent`, { path });
    if (!RESTORE_ACTION_NAMES.includes(action.action)) {
        invalidPlan(`${path}.action is unknown`, { path, action: action.action });
    }
    assertIdentity(action.incomingIdentity, `${path}.incomingIdentity`);
    assertIdentity(action.targetIdentity, `${path}.targetIdentity`);
    if (!isRestoreRecord(action.value)) invalidPlan(`${path}.value must be a plain object`, { path });
    if (action.action === 'rename') {
        if (!isRestoreRecord(action.identityPatch)) {
            invalidPlan(`${path}.identityPatch is required for rename`, { path });
        }
        assertRestoreExactKeys(action.identityPatch, ['field', 'value'], 'INVALID_RESTORE_PLAN', `${path}.identityPatch`);
        assertIdentity(action.identityPatch.field, `${path}.identityPatch.field`);
        assertIdentity(action.identityPatch.value, `${path}.identityPatch.value`);
        if (action.identityPatch.value !== action.targetIdentity) {
            invalidPlan(`${path}.identityPatch must match targetIdentity`, { path });
        }
    } else if (action.identityPatch !== null) {
        invalidPlan(`${path}.identityPatch is only valid for rename`, { path });
    }
}

/** Validate and isolate a dry-run restore plan before any contributor is called. */
export function validatePortableRestorePlan(input) {
    const plan = clonePortableValue(input, { path: '$.restorePlan' });
    if (!isRestoreRecord(plan)) invalidPlan('Restore plan must be an object');
    assertRestoreExactKeys(plan, PLAN_KEYS, 'INVALID_RESTORE_PLAN', '$.restorePlan');
    if (plan.dryRun !== true) invalidPlan('Restore plan must be a validated dry-run plan');
    if (!RESTORE_CONFLICT_STRATEGIES.includes(plan.strategy)) {
        invalidPlan('Restore plan has an unknown conflict strategy', { strategy: plan.strategy });
    }
    if (typeof plan.archiveChecksum !== 'string' || !/^[a-f0-9]{64}$/.test(plan.archiveChecksum)) {
        invalidPlan('Restore plan archiveChecksum must be a lowercase SHA-256 digest');
    }
    if (!Array.isArray(plan.sections)) invalidPlan('Restore plan sections must be an array');

    const seen = new Set();
    let lastOrder = -1;
    const total = { total: 0, insert: 0, skip: 0, replace: 0, rename: 0 };
    for (let sectionIndex = 0; sectionIndex < plan.sections.length; sectionIndex += 1) {
        const section = plan.sections[sectionIndex];
        const path = `$.restorePlan.sections[${sectionIndex}]`;
        if (!isRestoreRecord(section)) invalidPlan(`${path} must be an object`, { path });
        assertRestoreExactKeys(section, SECTION_KEYS, 'INVALID_RESTORE_PLAN', path);
        const order = PORTABLE_ARCHIVE_SECTIONS.indexOf(section.name);
        if (order < 0) invalidPlan(`${path}.name is unknown`, { section: section.name });
        if (seen.has(section.name)) invalidPlan('Restore plan contains duplicate sections', { section: section.name });
        if (order <= lastOrder) invalidPlan('Restore plan sections are not in canonical order');
        seen.add(section.name);
        lastOrder = order;
        if (!Array.isArray(section.actions)) invalidPlan(`${path}.actions must be an array`, { path });

        const expected = { total: section.actions.length, insert: 0, skip: 0, replace: 0, rename: 0 };
        section.actions.forEach((action, actionIndex) => {
            validateAction(action, section.name, `${path}.actions[${actionIndex}]`);
            expected[action.action] += 1;
        });
        assertSummary(section.summary, `${path}.summary`, expected);
        for (const key of RESTORE_SUMMARY_KEYS) total[key] += section.summary[key];
    }
    assertSummary(plan.summary, '$.restorePlan.summary', total);
    return plan;
}

export function selectPortableRestoreSections(plan, requested) {
    const available = plan.sections.map(section => section.name);
    const sections = requested === undefined ? available : requested;
    if (!Array.isArray(sections)) throw archiveError('INVALID_SELECTION', 'sections must be an array');
    if (sections.length === 0) throw archiveError('NO_SECTIONS', 'Select at least one restore section');
    if (new Set(sections).size !== sections.length) {
        throw archiveError('INVALID_SELECTION', 'Restore selection contains duplicate sections', { sections });
    }
    for (const section of sections) {
        if (!PORTABLE_ARCHIVE_SECTIONS.includes(section)) {
            throw archiveError('INVALID_SELECTION', `Unknown restore section: ${String(section)}`, { section });
        }
        if (!available.includes(section)) {
            throw archiveError('SECTION_NOT_IN_PLAN', `Restore section is not present in the plan: ${section}`, {
                section
            });
        }
    }
    return plan.sections.filter(section => sections.includes(section.name));
}
