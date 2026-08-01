import { PORTABLE_ARCHIVE_LIMITS } from './constants.js';
import { archiveError, PortableArchiveError } from './errors.js';

const MAX_NESTING_DEPTH = 64;
const OMIT = Symbol('omit-sensitive-value');
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SENSITIVE_KEY_NAMES = new Set([
    'authorization',
    'cookie',
    'cookies',
    'credential',
    'credentials',
    'password',
    'passwd',
    'passphrase',
    'pwd',
    'secret',
    'token',
    'totp'
]);

function normalizeSensitiveKey(key) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveFieldName(key) {
    const normalized = normalizeSensitiveKey(String(key));
    if (SENSITIVE_KEY_NAMES.has(normalized)) return true;
    return /(?:apikey|privatekey|clientsecret|password|passwd|passphrase|accesstoken|refreshtoken|authtoken|sessiontoken|idtoken|bearertoken|totpsecret|otpseed|cookiejar)$/.test(normalized);
}

function isSensitiveString(value) {
    return /^otpauth:\/\//i.test(value) ||
        /^bearer\s+\S+/i.test(value) ||
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value);
}

function assertSensitivePolicy(policy) {
    if (policy !== 'reject' && policy !== 'strip') {
        throw archiveError(
            'INVALID_ARGUMENT',
            'sensitivePolicy must be "reject" or "strip"',
            { sensitivePolicy: policy }
        );
    }
}

function sensitiveResult(policy, path) {
    if (policy === 'strip') return OMIT;
    throw archiveError(
        'SENSITIVE_FIELD',
        `Sensitive data is not allowed at ${path}`,
        { path }
    );
}

function cloneJson(value, state, path, depth) {
    if (typeof value === 'string') {
        return isSensitiveString(value) ? sensitiveResult(state.policy, path) : value;
    }
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return value;
        throw archiveError('INVALID_VALUE', `Non-finite number at ${path}`, { path });
    }
    if (typeof value !== 'object') {
        throw archiveError(
            'INVALID_VALUE',
            `Value at ${path} is not JSON-compatible`,
            { path, type: typeof value }
        );
    }
    if (depth > MAX_NESTING_DEPTH) {
        throw archiveError(
            'LIMIT_DEPTH',
            `Archive data exceeds ${MAX_NESTING_DEPTH} nested containers`,
            { path, maxDepth: MAX_NESTING_DEPTH }
        );
    }
    if (state.ancestors.has(value)) {
        throw archiveError('INVALID_VALUE', `Circular value at ${path}`, { path });
    }

    state.ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            const result = [];
            for (let index = 0; index < value.length; index += 1) {
                const cloned = cloneJson(value[index], state, `${path}[${index}]`, depth + 1);
                if (cloned !== OMIT) result.push(cloned);
            }
            return result;
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw archiveError(
                'INVALID_VALUE',
                `Value at ${path} must be a plain object`,
                { path }
            );
        }

        const result = {};
        for (const key of Object.keys(value).sort()) {
            const childPath = `${path}.${key}`;
            if (FORBIDDEN_KEYS.has(key)) {
                throw archiveError('INVALID_VALUE', `Unsafe object key at ${childPath}`, { path: childPath });
            }
            if (isSensitiveFieldName(key)) {
                if (state.policy === 'reject') sensitiveResult(state.policy, childPath);
                continue;
            }
            const cloned = cloneJson(value[key], state, childPath, depth + 1);
            if (cloned !== OMIT) result[key] = cloned;
        }
        return result;
    } finally {
        state.ancestors.delete(value);
    }
}

export function clonePortableValue(value, { sensitivePolicy = 'reject', path = '$' } = {}) {
    assertSensitivePolicy(sensitivePolicy);
    const result = cloneJson(value, { policy: sensitivePolicy, ancestors: new WeakSet() }, path, 0);
    if (result === OMIT) {
        throw archiveError('SENSITIVE_FIELD', 'The root value cannot be stripped', { path });
    }
    return result;
}

function canonicalStringifyValue(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(canonicalStringifyValue).join(',')}]`;
    }
    return `{${Object.keys(value).sort().map(key => (
        `${JSON.stringify(key)}:${canonicalStringifyValue(value[key])}`
    )).join(',')}}`;
}

export function deterministicStringify(value, options = {}) {
    const clone = clonePortableValue(value, options);
    return canonicalStringifyValue(clone);
}

export function stringifyClonedPortableValue(value) {
    return canonicalStringifyValue(value);
}

export function utf8ByteLength(text) {
    return new TextEncoder().encode(text).byteLength;
}

export function normalizeArchiveLimits(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw archiveError('INVALID_ARGUMENT', 'limits must be an object');
    }
    const limits = {
        maxBytes: input.maxBytes ?? PORTABLE_ARCHIVE_LIMITS.maxBytes,
        maxEntries: input.maxEntries ?? PORTABLE_ARCHIVE_LIMITS.maxEntries
    };
    if (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1) {
        throw archiveError('INVALID_ARGUMENT', 'maxBytes must be a positive safe integer', {
            maxBytes: limits.maxBytes
        });
    }
    if (!Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 0) {
        throw archiveError('INVALID_ARGUMENT', 'maxEntries must be a non-negative safe integer', {
            maxEntries: limits.maxEntries
        });
    }
    return limits;
}

export function enforceByteLimit(text, limits, scope = 'archive') {
    const sizeBytes = utf8ByteLength(text);
    if (sizeBytes > limits.maxBytes) {
        throw archiveError(
            'LIMIT_BYTES',
            `${scope} exceeds the ${limits.maxBytes} byte limit`,
            { scope, maxBytes: limits.maxBytes, sizeBytes }
        );
    }
    return sizeBytes;
}

export function enforceEntryLimit(totalEntries, limits, scope = 'archive') {
    if (totalEntries > limits.maxEntries) {
        throw archiveError(
            'LIMIT_ENTRIES',
            `${scope} exceeds the ${limits.maxEntries} entry limit`,
            { scope, maxEntries: limits.maxEntries, totalEntries }
        );
    }
}

export async function sha256Checksum(text, cryptoProvider = globalThis.crypto) {
    if (!cryptoProvider?.subtle || typeof cryptoProvider.subtle.digest !== 'function') {
        throw archiveError('CHECKSUM_UNAVAILABLE', 'SHA-256 is unavailable in this environment');
    }
    try {
        const digest = await cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(text));
        const bytes = new Uint8Array(digest);
        if (bytes.byteLength !== 32) throw new Error('SHA-256 returned an invalid digest length');
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (error) {
        if (error instanceof PortableArchiveError) throw error;
        throw archiveError('CHECKSUM_FAILURE', 'Failed to calculate archive checksum', {}, error);
    }
}

export function assertExactKeys(value, expected, path) {
    const actual = Object.keys(value).sort();
    const sortedExpected = [...expected].sort();
    if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
        throw archiveError('INVALID_ARCHIVE', `Unexpected fields at ${path}`, {
            path,
            expected: sortedExpected,
            actual
        });
    }
}
