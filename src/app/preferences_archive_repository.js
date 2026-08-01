import { normalizePortablePreferences } from '../features/preferences/restore_contributor.js';
import { cloneStorageValue } from '../storage/clone.js';

export const PREFERENCES_ARCHIVE_FIELD_ORDER = Object.freeze([
    'theme',
    'locale',
    'defaultModel',
    'uiTweaks',
    'enabledModules'
]);

const OPTION_FIELDS = Object.freeze([
    'getScope',
    ...PREFERENCES_ARCHIVE_FIELD_ORDER,
    'includeEnabledModules'
]);

export class PreferencesArchiveRepositoryError extends Error {
    constructor(code, message, { phase, cause, failures = [] } = {}) {
        super(message);
        this.name = 'PreferencesArchiveRepositoryError';
        this.code = code;
        this.phase = phase;
        this.failures = failures.map(failure => Object.freeze({ ...failure }));
        if (cause !== undefined) this.cause = cause;
    }
}

function fail(code, message, phase, cause, failures) {
    throw new PreferencesArchiveRepositoryError(code, message, {
        phase,
        cause,
        failures
    });
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value, phase) {
    try {
        return cloneStorageValue(value);
    } catch (cause) {
        fail('PREFERENCES_ARCHIVE_CLONE_FAILED', 'Preferences archive value is not cloneable', phase, cause);
    }
}

function operationOptions(value, phase) {
    if (!isObject(value) || Object.keys(value).some(key => key !== 'signal')) {
        fail('INVALID_PREFERENCES_ARCHIVE_OPTIONS', 'Repository operation options are invalid', phase);
    }
    return value;
}

function throwIfAborted(signal, phase) {
    if (signal === undefined || signal === null) return;
    if (!isObject(signal) || typeof signal.aborted !== 'boolean'
        || typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function') {
        fail('INVALID_ABORT_SIGNAL', 'signal must implement AbortSignal', phase);
    }
    if (!signal.aborted) return;
    const error = new PreferencesArchiveRepositoryError(
        'RESTORE_ABORTED',
        'Preferences archive repository operation was aborted',
        { phase }
    );
    error.name = 'AbortError';
    throw error;
}

function normalizeScope(value, phase) {
    const scope = clone(value, phase);
    if (!isObject(scope) || !['global', 'session', 'inspection'].includes(scope.kind)
        || typeof scope.readOnly !== 'boolean') {
        fail('INVALID_PREFERENCES_SCOPE', 'Preferences archive scope is invalid', phase);
    }
    if (scope.kind === 'global') {
        if (Object.keys(scope).sort().join(',') !== 'kind,readOnly') {
            fail('INVALID_PREFERENCES_SCOPE', 'Global Preferences scope has unexpected fields', phase);
        }
        return scope;
    }
    if (Object.keys(scope).sort().join(',') !== 'kind,readOnly,sessionUserId,targetUserId') {
        fail('INVALID_PREFERENCES_SCOPE', 'Session Preferences scope has unexpected fields', phase);
    }
    for (const field of ['sessionUserId', 'targetUserId']) {
        if (typeof scope[field] !== 'string' || !scope[field].trim()) {
            fail('INVALID_PREFERENCES_SCOPE', `${field} must be a non-empty string`, phase);
        }
        scope[field] = scope[field].trim();
    }
    if (scope.kind === 'inspection' && scope.readOnly !== true) {
        fail('INVALID_PREFERENCES_SCOPE', 'Inspection Preferences scope must be read-only', phase);
    }
    return scope;
}

function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function assertSameScope(expected, actual, phase) {
    if (!sameValue(expected, actual)) {
        fail('PREFERENCES_SCOPE_CHANGED', 'Preferences scope changed during repository operation', phase);
    }
}

function assertWritableScope(scope, phase) {
    if (scope.readOnly || scope.kind === 'inspection') {
        fail('READ_ONLY_SESSION', 'Preferences inspection scope is read-only', phase);
    }
    if (scope.kind === 'session' && scope.sessionUserId !== scope.targetUserId) {
        fail('SESSION_BOUNDARY', 'Preferences repository cannot write another session', phase);
    }
}

function assertFactoryOptions(options) {
    if (!isObject(options)) throw new TypeError('Preferences archive repository options must be an object');
    const unknown = Object.keys(options).find(key => !OPTION_FIELDS.includes(key));
    if (unknown) throw new TypeError(`Unknown Preferences archive repository option: ${unknown}`);
    if (typeof options.getScope !== 'function') {
        throw new TypeError('Preferences archive repository requires getScope()');
    }
    const includeEnabledModules = options.includeEnabledModules ?? true;
    if (typeof includeEnabledModules !== 'boolean') {
        throw new TypeError('includeEnabledModules must be a boolean');
    }
    const fields = includeEnabledModules
        ? PREFERENCES_ARCHIVE_FIELD_ORDER
        : PREFERENCES_ARCHIVE_FIELD_ORDER.slice(0, -1);
    for (const field of fields) {
        const port = options[field];
        if (!isObject(port) || typeof port.load !== 'function' || typeof port.save !== 'function') {
            throw new TypeError(`Preferences ${field} port must implement load() and save()`);
        }
        if (port.flush !== undefined && typeof port.flush !== 'function') {
            throw new TypeError(`Preferences ${field} port flush must be a function`);
        }
    }
    return { fields: [...fields], includeEnabledModules };
}

function failureSummary(error, phase) {
    return {
        phase,
        name: String(error?.name || 'Error'),
        code: typeof error?.code === 'string' ? error.code : null,
        message: String(error?.message || error).slice(0, 500)
    };
}

/** Aggregate real Preferences field ports behind the portable repository contract. */
export function createPreferencesArchiveRepository(options = {}) {
    const { fields, includeEnabledModules } = assertFactoryOptions(options);
    let pendingScope = null;

    async function readScope(signal, phase) {
        throwIfAborted(signal, phase);
        let raw;
        try {
            raw = await options.getScope();
        } catch (cause) {
            fail('PREFERENCES_SCOPE_FAILED', 'Failed to resolve Preferences scope', phase, cause);
        }
        throwIfAborted(signal, phase);
        return normalizeScope(raw, phase);
    }

    async function assertBoundScope(expected, signal, phase) {
        const current = await readScope(signal, phase);
        assertSameScope(expected, current, phase);
        return current;
    }

    function validateDocument(value, phase) {
        let normalized;
        try {
            normalized = normalizePortablePreferences(value);
        } catch (cause) {
            fail('INVALID_PORTABLE_PREFERENCES', 'Preferences archive document is invalid', phase, cause);
        }
        const hasModules = Object.hasOwn(normalized, 'enabledModules');
        if (includeEnabledModules !== hasModules) {
            fail(
                includeEnabledModules ? 'MISSING_ENABLED_MODULES' : 'UNSUPPORTED_ENABLED_MODULES',
                includeEnabledModules
                    ? 'enabledModules is required by this Preferences repository'
                    : 'enabledModules was explicitly excluded from this Preferences repository',
                phase
            );
        }
        return normalized;
    }

    async function getScope(methodOptions = {}) {
        const { signal } = operationOptions(methodOptions, 'scope');
        return clone(await readScope(signal, 'scope'), 'scope');
    }

    async function load(methodOptions = {}) {
        const { signal } = operationOptions(methodOptions, 'load');
        const scope = await readScope(signal, 'load:scope');
        const document = { schemaVersion: 1 };
        for (const field of fields) {
            const phase = `load:${field}`;
            await assertBoundScope(scope, signal, phase);
            try {
                document[field] = clone(await options[field].load(), phase);
            } catch (cause) {
                if (cause instanceof PreferencesArchiveRepositoryError && cause.phase === phase) throw cause;
                fail('PREFERENCES_ARCHIVE_LOAD_FAILED', `Failed to load Preferences ${field}`, phase, cause);
            }
            await assertBoundScope(scope, signal, phase);
        }
        return clone(validateDocument(document, 'load:validate'), 'load:result');
    }

    async function save(value, methodOptions = {}) {
        const { signal } = operationOptions(methodOptions, 'save');
        const document = validateDocument(value, 'save:validate');
        const scope = await readScope(signal, 'save:scope');
        assertWritableScope(scope, 'save:scope');
        pendingScope = clone(scope, 'save:scope');
        for (const field of fields) {
            const phase = `save:${field}`;
            await assertBoundScope(scope, signal, phase);
            try {
                await options[field].save(clone(document[field], phase));
            } catch (cause) {
                if (cause instanceof PreferencesArchiveRepositoryError && cause.phase === phase) throw cause;
                fail('PREFERENCES_ARCHIVE_SAVE_FAILED', `Failed to save Preferences ${field}`, phase, cause);
            }
            await assertBoundScope(scope, signal, phase);
            let persisted;
            try {
                persisted = clone(await options[field].load(), `${phase}:verify`);
            } catch (cause) {
                if (cause instanceof PreferencesArchiveRepositoryError && cause.phase === `${phase}:verify`) throw cause;
                fail('PREFERENCES_ARCHIVE_VERIFY_FAILED', `Failed to verify Preferences ${field}`, `${phase}:verify`, cause);
            }
            if (!sameValue(document[field], persisted)) {
                fail('PREFERENCES_ARCHIVE_VERIFY_FAILED', `Preferences ${field} did not retain its value`, `${phase}:verify`);
            }
        }
        return clone(document, 'save:result');
    }

    async function flush(methodOptions = {}) {
        const { signal } = operationOptions(methodOptions, 'flush');
        const scope = pendingScope || await readScope(signal, 'flush:scope');
        await assertBoundScope(scope, signal, 'flush:scope');
        assertWritableScope(scope, 'flush:scope');
        const failures = [];
        for (const field of fields) {
            const port = options[field];
            if (!port.flush) continue;
            const phase = `flush:${field}`;
            throwIfAborted(signal, phase);
            await assertBoundScope(scope, signal, phase);
            try {
                await port.flush();
            } catch (error) {
                failures.push(failureSummary(error, phase));
            }
            await assertBoundScope(scope, signal, phase);
        }
        if (failures.length) {
            fail(
                'PREFERENCES_ARCHIVE_FLUSH_FAILED',
                'One or more Preferences field ports failed to flush',
                'flush',
                undefined,
                failures
            );
        }
        pendingScope = null;
        return fields.filter(field => typeof options[field].flush === 'function');
    }

    return Object.freeze({ getScope, load, save, flush });
}
