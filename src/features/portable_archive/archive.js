import {
    PORTABLE_ARCHIVE_CHECKSUM_ALGORITHM,
    PORTABLE_ARCHIVE_FORMAT,
    PORTABLE_ARCHIVE_SCHEMA_VERSION,
    PORTABLE_ARCHIVE_SECTIONS
} from './constants.js';
import {
    assertExactKeys,
    clonePortableValue,
    enforceByteLimit,
    enforceEntryLimit,
    normalizeArchiveLimits,
    sha256Checksum,
    stringifyClonedPortableValue,
    utf8ByteLength
} from './canonical.js';
import { archiveError } from './errors.js';

const LIST_SECTIONS = new Set(PORTABLE_ARCHIVE_SECTIONS.filter(name => name !== 'preferences'));

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function normalizeCreatedAt(createdAt, clock) {
    if (clock !== undefined && typeof clock !== 'function') {
        throw archiveError('INVALID_ARGUMENT', 'clock must be a function');
    }
    const value = createdAt ?? clock?.();
    if (typeof value !== 'string' || !value) {
        throw archiveError(
            'INVALID_ARGUMENT',
            'createdAt must be an ISO date-time string; pass createdAt or options.clock explicitly'
        );
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        throw archiveError('INVALID_ARGUMENT', 'createdAt must be an ISO date-time string', { createdAt: value });
    }
    return date.toISOString();
}

function assertCanonicalCreatedAt(value) {
    if (typeof value !== 'string' || !value) {
        throw archiveError('INVALID_ARCHIVE', 'createdAt must be an ISO date-time string');
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
        throw archiveError('INVALID_ARCHIVE', 'createdAt must use canonical ISO format', { createdAt: value });
    }
}

function assertSource(source, code) {
    const validString = typeof source === 'string' && source.trim().length > 0;
    const validObject = isPlainObject(source) && Object.keys(source).length > 0;
    if (!validString && !validObject) {
        throw archiveError(code, 'source must be a non-empty string or object');
    }
}

function normalizeInclude(include, sections) {
    const requested = include === undefined
        ? PORTABLE_ARCHIVE_SECTIONS.filter(name => Object.hasOwn(sections, name))
        : include;
    if (!Array.isArray(requested)) {
        throw archiveError('INVALID_ARGUMENT', 'include must be an array');
    }
    if (new Set(requested).size !== requested.length) {
        throw archiveError('INVALID_ARGUMENT', 'include contains duplicate sections', { include: requested });
    }
    for (const name of requested) {
        if (!PORTABLE_ARCHIVE_SECTIONS.includes(name)) {
            throw archiveError('INVALID_SECTION', `Unknown archive section: ${String(name)}`, { section: name });
        }
    }
    return PORTABLE_ARCHIVE_SECTIONS.filter(name => requested.includes(name));
}

function assertKnownSectionKeys(sections, code) {
    for (const name of Object.keys(sections)) {
        if (!PORTABLE_ARCHIVE_SECTIONS.includes(name)) {
            throw archiveError(code, `Unknown archive section: ${name}`, { section: name });
        }
    }
}

function assertSectionShape(name, value, code) {
    if (LIST_SECTIONS.has(name)) {
        if (!Array.isArray(value)) {
            throw archiveError(code, `${name} must be an array`, { section: name });
        }
        for (let index = 0; index < value.length; index += 1) {
            if (!isPlainObject(value[index])) {
                throw archiveError(code, `${name}[${index}] must be a plain object`, {
                    section: name,
                    index
                });
            }
        }
        return;
    }
    if (!isPlainObject(value)) {
        throw archiveError(code, 'preferences must be a plain object', { section: name });
    }
}

function sectionEntryCount(name, value) {
    return LIST_SECTIONS.has(name) ? value.length : 1;
}

function buildManifest(payload) {
    const sections = PORTABLE_ARCHIVE_SECTIONS
        .filter(name => Object.hasOwn(payload, name))
        .map(name => Object.freeze({ name, itemCount: sectionEntryCount(name, payload[name]) }));
    return {
        sections,
        totalEntries: sections.reduce((total, section) => total + section.itemCount, 0),
        payloadBytes: utf8ByteLength(stringifyClonedPortableValue(payload))
    };
}

function assertManifest(actual, expected) {
    if (!isPlainObject(actual)) {
        throw archiveError('INVALID_ARCHIVE', 'manifest must be an object');
    }
    assertExactKeys(actual, ['sections', 'totalEntries', 'payloadBytes'], '$.manifest');
    if (!Array.isArray(actual.sections)) {
        throw archiveError('INVALID_ARCHIVE', 'manifest.sections must be an array');
    }
    for (let index = 0; index < actual.sections.length; index += 1) {
        const section = actual.sections[index];
        if (!isPlainObject(section)) {
            throw archiveError('INVALID_ARCHIVE', `manifest.sections[${index}] must be an object`);
        }
        assertExactKeys(section, ['name', 'itemCount'], `$.manifest.sections[${index}]`);
    }
    if (stringifyClonedPortableValue(actual) !== stringifyClonedPortableValue(expected)) {
        throw archiveError('INVALID_ARCHIVE', 'manifest does not match the archive payload');
    }
}

function checksumInput(archive) {
    const unsigned = {
        format: archive.format,
        schemaVersion: archive.schemaVersion,
        createdAt: archive.createdAt,
        source: archive.source,
        manifest: archive.manifest,
        payload: archive.payload
    };
    return stringifyClonedPortableValue(unsigned);
}

export async function createPortableArchive(input, options = {}) {
    if (!isPlainObject(input)) {
        throw archiveError('INVALID_ARGUMENT', 'archive input must be an object');
    }
    const limits = normalizeArchiveLimits(options.limits);
    const sensitivePolicy = options.sensitivePolicy ?? 'reject';
    if (!isPlainObject(input.sections)) {
        throw archiveError('INVALID_ARGUMENT', 'sections must be an object');
    }
    assertKnownSectionKeys(input.sections, 'INVALID_SECTION');

    const include = normalizeInclude(input.include, input.sections);
    const source = clonePortableValue(input.source, { sensitivePolicy, path: '$.source' });
    assertSource(source, 'INVALID_ARGUMENT');
    const payload = {};
    for (const name of include) {
        const fallback = name === 'preferences' ? {} : [];
        const value = clonePortableValue(input.sections[name] ?? fallback, {
            sensitivePolicy,
            path: `$.sections.${name}`
        });
        assertSectionShape(name, value, 'INVALID_ARGUMENT');
        payload[name] = value;
    }

    const manifest = buildManifest(payload);
    enforceEntryLimit(manifest.totalEntries, limits);
    const unsigned = {
        format: PORTABLE_ARCHIVE_FORMAT,
        schemaVersion: PORTABLE_ARCHIVE_SCHEMA_VERSION,
        createdAt: normalizeCreatedAt(input.createdAt, options.clock),
        source,
        manifest,
        payload
    };
    const checksumValue = await sha256Checksum(
        stringifyClonedPortableValue(unsigned),
        options.cryptoProvider
    );
    const archive = {
        ...unsigned,
        checksum: {
            algorithm: PORTABLE_ARCHIVE_CHECKSUM_ALGORITHM,
            value: checksumValue
        }
    };
    enforceByteLimit(stringifyClonedPortableValue(archive), limits);
    return archive;
}

export async function validatePortableArchive(input, options = {}) {
    const limits = normalizeArchiveLimits(options.limits);
    const archive = clonePortableValue(input, { sensitivePolicy: 'reject', path: '$' });
    if (!isPlainObject(archive)) {
        throw archiveError('INVALID_ARCHIVE', 'archive must be an object');
    }
    assertExactKeys(
        archive,
        ['format', 'schemaVersion', 'createdAt', 'source', 'manifest', 'payload', 'checksum'],
        '$'
    );
    if (archive.format !== PORTABLE_ARCHIVE_FORMAT) {
        throw archiveError('UNSUPPORTED_FORMAT', `Unsupported archive format: ${String(archive.format)}`, {
            format: archive.format
        });
    }
    if (archive.schemaVersion !== PORTABLE_ARCHIVE_SCHEMA_VERSION) {
        throw archiveError(
            'UNSUPPORTED_SCHEMA_VERSION',
            `Unsupported archive schema version: ${String(archive.schemaVersion)}`,
            { schemaVersion: archive.schemaVersion }
        );
    }
    assertCanonicalCreatedAt(archive.createdAt);
    assertSource(archive.source, 'INVALID_ARCHIVE');
    if (!isPlainObject(archive.payload)) {
        throw archiveError('INVALID_ARCHIVE', 'payload must be an object');
    }
    assertKnownSectionKeys(archive.payload, 'INVALID_ARCHIVE');
    for (const name of Object.keys(archive.payload)) {
        assertSectionShape(name, archive.payload[name], 'INVALID_ARCHIVE');
    }

    const expectedManifest = buildManifest(archive.payload);
    assertManifest(archive.manifest, expectedManifest);
    enforceEntryLimit(expectedManifest.totalEntries, limits);

    if (!isPlainObject(archive.checksum)) {
        throw archiveError('INVALID_ARCHIVE', 'checksum must be an object');
    }
    assertExactKeys(archive.checksum, ['algorithm', 'value'], '$.checksum');
    if (archive.checksum.algorithm !== PORTABLE_ARCHIVE_CHECKSUM_ALGORITHM ||
        typeof archive.checksum.value !== 'string' ||
        !/^[a-f0-9]{64}$/.test(archive.checksum.value)) {
        throw archiveError('INVALID_ARCHIVE', 'checksum must be a lowercase SHA-256 digest');
    }
    const expectedChecksum = await sha256Checksum(checksumInput(archive), options.cryptoProvider);
    if (archive.checksum.value !== expectedChecksum) {
        throw archiveError('CHECKSUM_MISMATCH', 'Archive checksum does not match its contents', {
            expected: expectedChecksum,
            actual: archive.checksum.value
        });
    }

    const canonical = stringifyClonedPortableValue(archive);
    const sizeBytes = enforceByteLimit(canonical, limits);
    return {
        valid: true,
        checksumVerified: true,
        sizeBytes,
        totalEntries: expectedManifest.totalEntries,
        archive
    };
}

export async function serializePortableArchive(archive, options = {}) {
    const validation = await validatePortableArchive(archive, options);
    return stringifyClonedPortableValue(validation.archive);
}

export async function parsePortableArchive(text, options = {}) {
    if (typeof text !== 'string') {
        throw archiveError('INVALID_ARGUMENT', 'archive text must be a string');
    }
    const limits = normalizeArchiveLimits(options.limits);
    enforceByteLimit(text, limits, 'archive text');
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw archiveError('PARSE_ERROR', 'Archive text is not valid JSON', {}, error);
    }
    return validatePortableArchive(parsed, options);
}

export const portableArchiveInternals = Object.freeze({
    buildManifest,
    checksumInput,
    isPlainObject,
    normalizeInclude,
    sectionEntryCount
});
