import { PORTABLE_ARCHIVE_SECTIONS, RESTORE_CONFLICT_STRATEGIES } from './constants.js';
import {
    clonePortableValue,
    enforceEntryLimit,
    normalizeArchiveLimits,
    stringifyClonedPortableValue
} from './canonical.js';
import { portableArchiveInternals, validatePortableArchive } from './archive.js';
import { archiveError } from './errors.js';

const IDENTITY_FIELDS = Object.freeze(['id', 'chatId', 'key', 'slug', 'name']);

function fingerprint(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

function deriveIdentity(value) {
    for (const field of IDENTITY_FIELDS) {
        const candidate = value[field];
        if ((typeof candidate === 'string' && candidate.trim()) ||
            (typeof candidate === 'number' && Number.isFinite(candidate))) {
            const normalized = String(candidate);
            return {
                field,
                value: normalized,
                key: `${field}\u0000${normalized}`
            };
        }
    }
    const canonical = stringifyClonedPortableValue(value);
    return {
        field: null,
        value: `content:${fingerprint(canonical)}`,
        key: `content\u0000${canonical}`
    };
}

function nextRename(identity, occupied) {
    const field = identity.field ?? 'id';
    const base = `${identity.value}~imported`;
    let suffix = 1;
    let value = base;
    while (occupied.has(`${field}\u0000${value}`)) {
        suffix += 1;
        value = `${base}-${suffix}`;
    }
    return { field, value, key: `${field}\u0000${value}` };
}

function assertConflictStrategy(strategy) {
    if (!RESTORE_CONFLICT_STRATEGIES.includes(strategy)) {
        throw archiveError(
            'INVALID_CONFLICT_STRATEGY',
            `Unknown restore conflict strategy: ${String(strategy)}`,
            { strategy }
        );
    }
}

function normalizeExistingSections(existing) {
    if (!portableArchiveInternals.isPlainObject(existing)) {
        throw archiveError('INVALID_ARGUMENT', 'existing sections must be an object');
    }
    for (const name of Object.keys(existing)) {
        if (!PORTABLE_ARCHIVE_SECTIONS.includes(name)) {
            throw archiveError('INVALID_SECTION', `Unknown existing section: ${name}`, { section: name });
        }
    }
    return clonePortableValue(existing, { sensitivePolicy: 'reject', path: '$.existing' });
}

function existingItems(name, value) {
    if (value === undefined) return [];
    if (name === 'preferences') {
        if (!portableArchiveInternals.isPlainObject(value)) {
            throw archiveError('INVALID_ARGUMENT', 'existing preferences must be an object');
        }
        return Object.keys(value).length > 0 ? [{ identity: {
            field: null,
            value: 'preferences',
            key: 'singleton\u0000preferences'
        } }] : [];
    }
    if (!Array.isArray(value)) {
        throw archiveError('INVALID_ARGUMENT', `existing ${name} must be an array`, { section: name });
    }
    return value.map((item, index) => {
        if (!portableArchiveInternals.isPlainObject(item)) {
            throw archiveError('INVALID_ARGUMENT', `existing ${name}[${index}] must be a plain object`, {
                section: name,
                index
            });
        }
        return { identity: deriveIdentity(item) };
    });
}

function incomingItems(name, value) {
    if (name === 'preferences') {
        return [{
            value,
            identity: { field: null, value: 'preferences', key: 'singleton\u0000preferences' }
        }];
    }
    return value.map(item => ({ value: item, identity: deriveIdentity(item) }));
}

function emptyCounts() {
    return { total: 0, insert: 0, skip: 0, replace: 0, rename: 0 };
}

function addCounts(target, source) {
    for (const key of Object.keys(target)) target[key] += source[key];
}

export async function planPortableArchiveRestore(archive, existing = {}, options = {}) {
    const strategy = options.strategy ?? 'skip';
    assertConflictStrategy(strategy);
    const limits = normalizeArchiveLimits(options.limits);
    const validation = await validatePortableArchive(archive, options);
    const current = normalizeExistingSections(existing);

    const currentCount = PORTABLE_ARCHIVE_SECTIONS.reduce((total, name) => (
        total + existingItems(name, current[name]).length
    ), 0);
    enforceEntryLimit(currentCount, limits, 'existing data');

    const summary = emptyCounts();
    const sections = [];
    for (const name of PORTABLE_ARCHIVE_SECTIONS) {
        if (!Object.hasOwn(validation.archive.payload, name)) continue;
        const occupied = new Set(existingItems(name, current[name]).map(item => item.identity.key));
        const sectionSummary = emptyCounts();
        const actions = [];

        for (const item of incomingItems(name, validation.archive.payload[name])) {
            const conflict = occupied.has(item.identity.key);
            let action = 'insert';
            let target = item.identity;
            let identityPatch = null;
            if (conflict) {
                action = strategy;
                if (strategy === 'rename') {
                    target = nextRename(item.identity, occupied);
                    identityPatch = { field: target.field, value: target.value };
                }
            }
            if (action !== 'skip') occupied.add(target.key);
            sectionSummary.total += 1;
            sectionSummary[action] += 1;
            actions.push({
                section: name,
                action,
                incomingIdentity: item.identity.value,
                targetIdentity: target.value,
                identityPatch,
                value: clonePortableValue(item.value, { path: `$.plan.${name}` })
            });
        }

        addCounts(summary, sectionSummary);
        sections.push({ name, summary: sectionSummary, actions });
    }

    return {
        dryRun: true,
        strategy,
        archiveChecksum: validation.archive.checksum.value,
        summary,
        sections
    };
}

export const portableRestorePlanInternals = Object.freeze({
    deriveIdentity,
    fingerprint,
    nextRename
});
