import { THEMES } from '../../constants.js';
import { cloneStorageValue } from '../../storage/clone.js';
import { normalizeLocale } from '../../ui/locale.js';
import { PreferencesError, assertModuleId } from './catalog.js';
import { DEFAULT_MODEL_KEYS } from './default_model_schema.js';
import {
    UI_TWEAK_FEATURE_IDS,
    normalizeUiTweaks,
    uiPreferenceAcceptsValue
} from './ui_tweaks_schema.js';

export const PREFERENCES_RESTORE_SECTION = 'preferences';
export const PREFERENCES_PORTABLE_SCHEMA_VERSION = 1;

const EXECUTABLE_ACTIONS = Object.freeze(['insert', 'replace']);
const DOCUMENT_FIELDS = Object.freeze([
    'schemaVersion',
    'theme',
    'locale',
    'defaultModel',
    'uiTweaks',
    'enabledModules'
]);
const OBSOLETE_FIELDS = new Set(['hideGems', 'hideNotebooks']);
const THEME_KEYS = new Set(Object.keys(THEMES));
const WIDTH_LIMITS = Object.freeze({
    chatWidth: Object.freeze({ min: 400, max: 4000 }),
    sidebarWidth: Object.freeze({ min: 160, max: 800 })
});

function fail(code, message, details = {}) {
    throw new PreferencesError(code, message, details);
}

function isRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function clone(value, label) {
    try {
        return cloneStorageValue(value);
    } catch {
        fail('INVALID_PORTABLE_PREFERENCES', `${label} must be cloneable`);
    }
}

function exactFields(value, expected, label, code = 'INVALID_PORTABLE_PREFERENCES') {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((field, index) => field !== wanted[index])) {
        fail(code, `${label} has unexpected fields`, { actual, expected: wanted });
    }
}

function rejectObsoleteFields(value, label) {
    const field = Object.keys(value).find(key => OBSOLETE_FIELDS.has(key));
    if (field) {
        fail(
            'OBSOLETE_PREFERENCE_FIELD',
            `${label}.${field} is obsolete and cannot be restored`,
            { field }
        );
    }
}

function normalizeEnabledModules(value) {
    if (!Array.isArray(value)) {
        fail('INVALID_PORTABLE_PREFERENCES', 'enabledModules must be an array');
    }
    const modules = value.map((id) => {
        try {
            return assertModuleId(id, 'Enabled module id');
        } catch {
            fail('INVALID_PORTABLE_PREFERENCES', 'enabledModules contains an invalid module id');
        }
    });
    if (new Set(modules).size !== modules.length) {
        fail('INVALID_PORTABLE_PREFERENCES', 'enabledModules contains duplicate module ids');
    }
    return modules;
}

function normalizeUiTweaksDocument(value) {
    if (!isRecord(value)) fail('INVALID_PORTABLE_PREFERENCES', 'uiTweaks must be an object');
    rejectObsoleteFields(value, 'uiTweaks');
    exactFields(value, UI_TWEAK_FEATURE_IDS, 'uiTweaks');
    for (const id of UI_TWEAK_FEATURE_IDS) {
        const preference = value[id];
        if (!isRecord(preference)) {
            fail('INVALID_PORTABLE_PREFERENCES', `uiTweaks.${id} must be an object`);
        }
        const acceptsValue = uiPreferenceAcceptsValue(id);
        exactFields(preference, acceptsValue ? ['enabled', 'value'] : ['enabled'], `uiTweaks.${id}`);
        if (typeof preference.enabled !== 'boolean') {
            fail('INVALID_PORTABLE_PREFERENCES', `uiTweaks.${id}.enabled must be a boolean`);
        }
        if (acceptsValue) {
            const limits = WIDTH_LIMITS[id];
            if (!Number.isSafeInteger(preference.value)
                || preference.value < limits.min
                || preference.value > limits.max) {
                fail(
                    'INVALID_PORTABLE_PREFERENCES',
                    `uiTweaks.${id}.value is outside the supported width range`,
                    { id, min: limits.min, max: limits.max }
                );
            }
        }
    }
    return normalizeUiTweaks(value);
}

/** Validate and canonicalize the Preferences portable archive v1 document. */
export function normalizePortablePreferences(value) {
    const source = clone(value, 'Portable preferences');
    if (!isRecord(source)) fail('INVALID_PORTABLE_PREFERENCES', 'Portable preferences must be an object');
    rejectObsoleteFields(source, 'preferences');
    const expected = DOCUMENT_FIELDS.filter(field => field !== 'enabledModules' || Object.hasOwn(source, field));
    exactFields(source, expected, 'preferences');
    if (source.schemaVersion !== PREFERENCES_PORTABLE_SCHEMA_VERSION) {
        fail('UNSUPPORTED_PREFERENCES_SCHEMA', 'Unsupported portable Preferences schema version', {
            schemaVersion: source.schemaVersion
        });
    }
    if (!THEME_KEYS.has(source.theme)) {
        fail('INVALID_PORTABLE_PREFERENCES', 'theme is not supported', { theme: source.theme });
    }
    let locale;
    try {
        locale = normalizeLocale(source.locale);
    } catch {
        fail('INVALID_PORTABLE_PREFERENCES', 'locale is not supported');
    }
    if (!DEFAULT_MODEL_KEYS.includes(source.defaultModel)) {
        fail('INVALID_PORTABLE_PREFERENCES', 'defaultModel is not supported', {
            defaultModel: source.defaultModel
        });
    }
    const result = {
        schemaVersion: PREFERENCES_PORTABLE_SCHEMA_VERSION,
        theme: source.theme,
        locale,
        defaultModel: source.defaultModel,
        uiTweaks: normalizeUiTweaksDocument(source.uiTweaks)
    };
    if (Object.hasOwn(source, 'enabledModules')) {
        result.enabledModules = normalizeEnabledModules(source.enabledModules);
    }
    return result;
}

function normalizeScope(value) {
    const scope = clone(value, 'Preferences restore scope');
    if (!isRecord(scope)) fail('INVALID_PREFERENCES_SCOPE', 'Preferences restore scope must be an object');
    if (scope.kind === 'global') {
        exactFields(scope, ['kind', 'readOnly'], 'Preferences restore scope', 'INVALID_PREFERENCES_SCOPE');
    } else if (scope.kind === 'session' || scope.kind === 'inspection') {
        exactFields(
            scope,
            ['kind', 'sessionUserId', 'targetUserId', 'readOnly'],
            'Preferences restore scope',
            'INVALID_PREFERENCES_SCOPE'
        );
        for (const field of ['sessionUserId', 'targetUserId']) {
            if (typeof scope[field] !== 'string' || !scope[field].trim()) {
                fail('INVALID_PREFERENCES_SCOPE', `${field} must be a non-empty string`);
            }
            scope[field] = scope[field].trim();
        }
    } else {
        fail('INVALID_PREFERENCES_SCOPE', 'Preferences restore scope kind is unsupported', {
            kind: scope.kind
        });
    }
    if (typeof scope.readOnly !== 'boolean') {
        fail('INVALID_PREFERENCES_SCOPE', 'Preferences restore scope readOnly must be a boolean');
    }
    if (scope.kind === 'inspection' && scope.readOnly !== true) {
        fail('INVALID_PREFERENCES_SCOPE', 'Inspection scope must be read-only');
    }
    return scope;
}

function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function assertSameScope(expected, actual) {
    const same = expected.kind === actual.kind
        && expected.readOnly === actual.readOnly
        && expected.sessionUserId === actual.sessionUserId
        && expected.targetUserId === actual.targetUserId;
    if (!same) {
        fail('SESSION_BOUNDARY', 'Preferences restore scope changed during the operation', {
            expected,
            actual
        });
    }
}

function assertWritableScope(scope) {
    if (scope.readOnly || scope.kind === 'inspection') {
        fail('READ_ONLY_SESSION', 'Preferences inspection scopes are read-only');
    }
    if (scope.kind === 'session' && scope.sessionUserId !== scope.targetUserId) {
        fail('SESSION_BOUNDARY', 'Preferences restore cannot write another session');
    }
}

function assertSignal(signal) {
    if (signal === null || signal === undefined) return;
    if (!signal || typeof signal !== 'object' || typeof signal.aborted !== 'boolean'
        || typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function') {
        fail('INVALID_ABORT_SIGNAL', 'Preferences restore signal must implement AbortSignal');
    }
}

function throwIfAborted(signal) {
    assertSignal(signal);
    if (!signal?.aborted) return;
    fail('RESTORE_ABORTED', 'Preferences restore was aborted');
}

function assertContext(context, phase) {
    if (!isRecord(context)) {
        fail('INVALID_RESTORE_CONTEXT', `Preferences ${phase} context must be an object`);
    }
    if (context.section !== PREFERENCES_RESTORE_SECTION) {
        fail('INVALID_RESTORE_SECTION', `Preferences contributor cannot handle ${String(context.section)}`);
    }
    if (!isRecord(context.plan) || !Array.isArray(context.actions)) {
        fail('INVALID_RESTORE_CONTEXT', `Preferences ${phase} context is invalid`);
    }
}

function normalizeSnapshot(value) {
    const snapshot = clone(value, 'Preferences restore snapshot');
    if (!isRecord(snapshot)) fail('INVALID_RESTORE_SNAPSHOT', 'Preferences snapshot must be an object');
    exactFields(
        snapshot,
        ['scope', 'preferences'],
        'Preferences restore snapshot',
        'INVALID_RESTORE_SNAPSHOT'
    );
    return {
        scope: normalizeScope(snapshot.scope),
        preferences: snapshot.preferences === null
            ? null
            : normalizePortablePreferences(snapshot.preferences)
    };
}

function normalizeAction(value, before) {
    const action = clone(value, 'Preferences restore action');
    if (!isRecord(action) || !isRecord(action.value)) {
        fail('INVALID_RESTORE_ACTION', 'Preferences restore action must contain an object value');
    }
    exactFields(action, [
        'section',
        'action',
        'incomingIdentity',
        'targetIdentity',
        'identityPatch',
        'value'
    ], 'Preferences restore action', 'INVALID_RESTORE_ACTION');
    if (action.section !== PREFERENCES_RESTORE_SECTION
        || !EXECUTABLE_ACTIONS.includes(action.action)) {
        fail('INVALID_RESTORE_ACTION', 'Preferences restore action is not executable', {
            section: action.section,
            action: action.action
        });
    }
    if (action.incomingIdentity !== PREFERENCES_RESTORE_SECTION
        || action.targetIdentity !== PREFERENCES_RESTORE_SECTION
        || action.identityPatch !== null) {
        fail('RESTORE_IDENTITY_MISMATCH', 'Preferences is a singleton and cannot be renamed');
    }
    if (action.action === 'insert' && before !== null) {
        fail('RESTORE_PLAN_STALE', 'Preferences already exist for an insert action');
    }
    if (action.action === 'replace' && before === null) {
        fail('RESTORE_PLAN_STALE', 'Preferences no longer exist for a replace action');
    }
    const preferences = normalizePortablePreferences(action.value);
    if (before !== null
        && !Object.hasOwn(preferences, 'enabledModules')
        && Object.hasOwn(before, 'enabledModules')) {
        preferences.enabledModules = clone(before.enabledModules, 'Enabled modules');
    }
    return { action: action.action, preferences };
}

function createBackend(repository) {
    if (!repository || typeof repository !== 'object' || Array.isArray(repository)) {
        throw new TypeError('Preferences aggregate repository must be an object');
    }
    for (const method of ['getScope', 'load', 'save', 'flush']) {
        if (typeof repository[method] !== 'function') {
            throw new TypeError(`Preferences aggregate repository must implement ${method}()`);
        }
    }

    async function scope() {
        return normalizeScope(await repository.getScope());
    }

    async function read(signal = null) {
        throwIfAborted(signal);
        const before = await scope();
        throwIfAborted(signal);
        const loaded = await repository.load();
        throwIfAborted(signal);
        const after = await scope();
        assertSameScope(before, after);
        throwIfAborted(signal);
        return {
            scope: before,
            preferences: loaded === null ? null : normalizePortablePreferences(loaded)
        };
    }

    async function replace(expectedScope, preferences, signal = null) {
        throwIfAborted(signal);
        const before = await scope();
        assertSameScope(expectedScope, before);
        assertWritableScope(before);
        throwIfAborted(signal);
        await repository.save(clone(preferences, 'Preferences restore value'));
        throwIfAborted(signal);
        assertSameScope(expectedScope, await scope());
        await repository.flush();
        throwIfAborted(signal);
        const restored = await read(signal);
        assertSameScope(expectedScope, restored.scope);
        if (!sameValue(preferences, restored.preferences)) {
            fail('RESTORE_VERIFY_FAILED', 'Preferences storage did not retain the restored value');
        }
        return restored.preferences;
    }

    return Object.freeze({ read, replace });
}

function contributorFromBackend(backend) {
    async function snapshot(context) {
        assertContext(context, 'snapshot');
        return clone(await backend.read(context.signal), 'Preferences restore snapshot result');
    }

    async function apply(context) {
        assertContext(context, 'apply');
        throwIfAborted(context.signal);
        const before = normalizeSnapshot(context.snapshot);
        const current = await backend.read(context.signal);
        assertSameScope(before.scope, current.scope);
        if (!sameValue(before.preferences, current.preferences)) {
            fail('RESTORE_STATE_CHANGED', 'Preferences changed after the restore snapshot was taken');
        }
        if (context.actions.length !== 1) {
            fail('INVALID_RESTORE_ACTION', 'Preferences restore requires exactly one singleton action');
        }
        assertWritableScope(current.scope);
        const prepared = normalizeAction(context.actions[0], current.preferences);
        throwIfAborted(context.signal);
        const restored = await backend.replace(current.scope, prepared.preferences, context.signal);
        throwIfAborted(context.signal);
        return clone({
            section: PREFERENCES_RESTORE_SECTION,
            action: prepared.action,
            fields: Object.keys(restored).filter(field => field !== 'schemaVersion')
        }, 'Preferences restore result');
    }

    async function rollback(context) {
        assertContext(context, 'rollback');
        const target = normalizeSnapshot(context.snapshot);
        const current = await backend.read();
        assertSameScope(target.scope, current.scope);
        if (sameValue(target.preferences, current.preferences)) {
            return { section: PREFERENCES_RESTORE_SECTION, restored: false };
        }
        const restored = await backend.replace(target.scope, target.preferences);
        return {
            section: PREFERENCES_RESTORE_SECTION,
            restored: true,
            fieldCount: restored === null ? 0 : Object.keys(restored).length
        };
    }

    return Object.freeze({ snapshot, apply, rollback });
}

/** Build the pure Preferences restore contributor around one aggregate repository port. */
export function createPreferencesRestoreContributor({ repository } = {}) {
    return contributorFromBackend(createBackend(repository));
}

/**
 * Hide the aggregate repository behind the feature-owned archive integration.
 * App composition may aggregate real theme/locale/model/UI/module stores into
 * the injected repository; this layer never invents values for missing stores.
 */
export function createPreferencesPortableArchivePort({ repository } = {}) {
    const backend = createBackend(repository);
    const contributor = contributorFromBackend(backend);
    const integration = Object.freeze({
        section: PREFERENCES_RESTORE_SECTION,
        async exportSection(options = {}) {
            if (!isRecord(options) || Object.keys(options).some(key => key !== 'signal')) {
                fail('INVALID_EXPORT_OPTIONS', 'Preferences export options are invalid');
            }
            const state = await backend.read(options.signal);
            if (state.preferences === null) {
                fail('PREFERENCES_NOT_FOUND', 'No portable Preferences state is available');
            }
            return clone(state.preferences, 'Portable Preferences export');
        },
        contributor
    });
    return Object.freeze({
        getPortableArchiveIntegration() {
            return integration;
        }
    });
}

export const preferencesRestoreContributorInternals = Object.freeze({
    DOCUMENT_FIELDS,
    EXECUTABLE_ACTIONS,
    WIDTH_LIMITS,
    normalizeScope
});
