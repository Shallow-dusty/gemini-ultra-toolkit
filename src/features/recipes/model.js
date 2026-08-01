import { cloneStorageValue } from '../../storage/clone.js';
import { fail } from './errors.js';

export const RECIPES_SCHEMA_VERSION = 1;
export const RECIPE_EXPORT_FORMAT = 'primer-pp.recipes';
export const RECIPE_EXPORT_VERSION = 1;

export const RECIPE_VARIABLE_TYPES = Object.freeze({
    TEXT: 'text',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    CHOICE: 'choice'
});

export const RECIPE_PERMISSIONS = Object.freeze({
    COMPOSER_INSERT: 'composer.insert',
    CONVERSATION_SEND: 'conversation.send',
    CONVERSATION_DELETE: 'conversation.delete',
    CLIPBOARD_READ: 'clipboard.read',
    FILE_DOWNLOAD: 'file.download',
    EXTERNAL_NAVIGATE: 'external.navigate'
});

export const DANGEROUS_RECIPE_PERMISSIONS = Object.freeze([
    RECIPE_PERMISSIONS.CONVERSATION_SEND,
    RECIPE_PERMISSIONS.CONVERSATION_DELETE,
    RECIPE_PERMISSIONS.CLIPBOARD_READ,
    RECIPE_PERMISSIONS.FILE_DOWNLOAD,
    RECIPE_PERMISSIONS.EXTERNAL_NAVIGATE
]);

export const RECIPE_IMPORT_STRATEGIES = Object.freeze({
    ERROR: 'error',
    SKIP: 'skip',
    REPLACE: 'replace',
    NEWER: 'newer',
    FORK: 'fork'
});

const VARIABLE_TYPES = new Set(Object.values(RECIPE_VARIABLE_TYPES));
const PERMISSIONS = new Set(Object.values(RECIPE_PERMISSIONS));
const IMPORT_STRATEGIES = new Set(Object.values(RECIPE_IMPORT_STRATEGIES));
const RECIPE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const VARIABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SOURCE_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const PLACEHOLDER_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function safeClone(value, label = 'Recipe value') {
    try {
        return cloneStorageValue(value);
    } catch (error) {
        fail('NOT_CLONEABLE', `${label} must be structured-cloneable`, { label }, error);
    }
}

function assertPlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        fail('INVALID_VALUE', `${label} must be an object`, { label });
    }
}

function assertOnlyKeys(value, allowed, label) {
    const unknown = Object.keys(value).filter(key => !allowed.has(key));
    if (unknown.length) {
        fail('UNKNOWN_FIELD', `${label} contains unknown fields: ${unknown.join(', ')}`, { label, unknown });
    }
}

function normalizeString(value, label, { required = false, max = 1000 } = {}) {
    if (value === undefined && !required) return '';
    if (typeof value !== 'string') fail('INVALID_VALUE', `${label} must be a string`, { label });
    const normalized = value.trim();
    if (required && !normalized) fail('INVALID_VALUE', `${label} cannot be empty`, { label });
    if (normalized.length > max) fail('INVALID_VALUE', `${label} is too long`, { label, max });
    return normalized;
}

export function normalizeRecipeId(value, label = 'Recipe id') {
    if (typeof value !== 'string' || !RECIPE_ID_PATTERN.test(value)) {
        fail('INVALID_RECIPE_ID', `${label} is invalid`, { label, value });
    }
    return value;
}

function normalizeTimestamp(value, label) {
    if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) {
        fail('INVALID_TIMESTAMP', `${label} must be an ISO-compatible timestamp`, { label });
    }
    return value;
}

function normalizeOptionalString(value, label, max) {
    if (value === undefined || value === null) return null;
    return normalizeString(value, label, { required: true, max });
}

function normalizeParent(value, label) {
    if (value === undefined || value === null) return null;
    assertPlainObject(value, label);
    assertOnlyKeys(value, new Set(['recipeId', 'version']), label);
    if (!Number.isInteger(value.version) || value.version < 1) {
        fail('INVALID_VERSION', `${label}.version must be a positive integer`, { label });
    }
    return Object.freeze({
        recipeId: normalizeRecipeId(value.recipeId, `${label}.recipeId`),
        version: value.version
    });
}

export function normalizeProvenance(value = {}, label = 'Recipe provenance') {
    assertPlainObject(value, label);
    assertOnlyKeys(value, new Set([
        'source', 'sourceId', 'sourceUrl', 'author', 'license', 'importedAt', 'parent', 'forkedFrom'
    ]), label);

    const source = value.source === undefined ? 'local' : value.source;
    if (typeof source !== 'string' || !SOURCE_PATTERN.test(source)) {
        fail('INVALID_PROVENANCE', `${label}.source is invalid`, { label });
    }

    return Object.freeze({
        source,
        sourceId: normalizeOptionalString(value.sourceId, `${label}.sourceId`, 256),
        sourceUrl: normalizeOptionalString(value.sourceUrl, `${label}.sourceUrl`, 2048),
        author: normalizeOptionalString(value.author, `${label}.author`, 200),
        license: normalizeOptionalString(value.license, `${label}.license`, 100),
        importedAt: value.importedAt === undefined || value.importedAt === null
            ? null
            : normalizeTimestamp(value.importedAt, `${label}.importedAt`),
        parent: normalizeParent(value.parent, `${label}.parent`),
        forkedFrom: normalizeParent(value.forkedFrom, `${label}.forkedFrom`)
    });
}

function validateVariableValue(variable, value, label) {
    if (variable.type === RECIPE_VARIABLE_TYPES.TEXT) {
        if (typeof value !== 'string') fail('INVALID_VARIABLE_VALUE', `${label} must be text`, { name: variable.name });
        return value;
    }
    if (variable.type === RECIPE_VARIABLE_TYPES.NUMBER) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            fail('INVALID_VARIABLE_VALUE', `${label} must be a finite number`, { name: variable.name });
        }
        return Object.is(value, -0) ? 0 : value;
    }
    if (variable.type === RECIPE_VARIABLE_TYPES.BOOLEAN) {
        if (typeof value !== 'boolean') fail('INVALID_VARIABLE_VALUE', `${label} must be boolean`, { name: variable.name });
        return value;
    }
    if (typeof value !== 'string' || !variable.options.includes(value)) {
        fail('INVALID_VARIABLE_VALUE', `${label} must be one of the declared choices`, { name: variable.name });
    }
    return value;
}

function normalizeVariable(value, index) {
    const label = `Variable ${index + 1}`;
    assertPlainObject(value, label);
    assertOnlyKeys(value, new Set(['name', 'type', 'label', 'description', 'required', 'default', 'options']), label);

    if (typeof value.name !== 'string' || !VARIABLE_NAME_PATTERN.test(value.name)) {
        fail('INVALID_VARIABLE', `${label}.name is invalid`, { index });
    }
    if (!VARIABLE_TYPES.has(value.type)) {
        fail('INVALID_VARIABLE', `${label}.type is unsupported`, { index, type: value.type });
    }
    if (value.required !== undefined && typeof value.required !== 'boolean') {
        fail('INVALID_VARIABLE', `${label}.required must be boolean`, { index });
    }

    let options = [];
    if (value.type === RECIPE_VARIABLE_TYPES.CHOICE) {
        if (!Array.isArray(value.options) || value.options.length === 0) {
            fail('INVALID_VARIABLE', `${label}.options must contain choices`, { index });
        }
        options = value.options.map((option, optionIndex) =>
            normalizeString(option, `${label}.options[${optionIndex}]`, { required: true, max: 200 })
        );
        if (new Set(options).size !== options.length) {
            fail('INVALID_VARIABLE', `${label}.options contains duplicates`, { index });
        }
    } else if (value.options !== undefined) {
        fail('INVALID_VARIABLE', `${label}.options is only valid for choice variables`, { index });
    }

    const variable = {
        name: value.name,
        type: value.type,
        label: normalizeString(value.label, `${label}.label`, { max: 200 }),
        description: normalizeString(value.description, `${label}.description`, { max: 1000 }),
        required: value.required === true
    };
    if (value.type === RECIPE_VARIABLE_TYPES.CHOICE) variable.options = Object.freeze(options);
    if (hasOwn(value, 'default')) {
        variable.default = validateVariableValue(variable, value.default, `${label}.default`);
    }
    return Object.freeze(variable);
}

export function normalizeVariables(value = []) {
    if (!Array.isArray(value)) fail('INVALID_VARIABLES', 'Recipe variables must be an array');
    const variables = value.map(normalizeVariable);
    const names = variables.map(variable => variable.name);
    if (new Set(names).size !== names.length) fail('INVALID_VARIABLES', 'Recipe variable names must be unique');
    return Object.freeze(variables);
}

function normalizePermissionList(value, label) {
    if (value === undefined) return Object.freeze([]);
    if (!Array.isArray(value)) fail('INVALID_PERMISSIONS', `${label} must be an array`, { label });
    const permissions = value.map((permission) => {
        if (typeof permission !== 'string' || !PERMISSIONS.has(permission)) {
            fail('INVALID_PERMISSION', `${label} contains an unsupported permission`, { label, permission });
        }
        return permission;
    });
    if (new Set(permissions).size !== permissions.length) {
        fail('INVALID_PERMISSIONS', `${label} contains duplicate permissions`, { label });
    }
    return Object.freeze(permissions.sort());
}

function templateVariableNames(template, label) {
    const names = [];
    const remainder = template.replace(PLACEHOLDER_PATTERN, (_match, name) => {
        names.push(name);
        return '';
    });
    if (remainder.includes('{{') || remainder.includes('}}')) {
        fail('INVALID_TEMPLATE', `${label} contains a malformed placeholder`, { label });
    }
    return names;
}

function normalizeStep(value, index, variableNames) {
    const label = `Step ${index + 1}`;
    assertPlainObject(value, label);
    assertOnlyKeys(value, new Set(['id', 'title', 'template', 'permissions']), label);
    const id = normalizeRecipeId(value.id, `${label}.id`);
    const title = normalizeString(value.title, `${label}.title`, { required: true, max: 200 });
    if (typeof value.template !== 'string' || !value.template.trim() || value.template.length > 50000) {
        fail('INVALID_TEMPLATE', `${label}.template must be non-empty and at most 50000 characters`, { label });
    }
    for (const name of templateVariableNames(value.template, `${label}.template`)) {
        if (!variableNames.has(name)) {
            fail('UNKNOWN_VARIABLE', `${label}.template references unknown variable ${name}`, { stepId: id, name });
        }
    }
    return Object.freeze({
        id,
        title,
        template: value.template,
        permissions: normalizePermissionList(value.permissions, `${label}.permissions`)
    });
}

export function normalizeSteps(value, variables) {
    if (!Array.isArray(value) || value.length === 0) {
        fail('INVALID_STEPS', 'Recipe steps must be a non-empty array');
    }
    const names = new Set(variables.map(variable => variable.name));
    const steps = value.map((step, index) => normalizeStep(step, index, names));
    const ids = steps.map(step => step.id);
    if (new Set(ids).size !== ids.length) fail('INVALID_STEPS', 'Recipe step ids must be unique');
    return Object.freeze(steps);
}

function permissionUnion(steps) {
    return Array.from(new Set(steps.flatMap(step => step.permissions))).sort();
}

function sameStringArray(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function normalizeRecipeVersion(value, { expectedId, expectedVersion } = {}) {
    assertPlainObject(value, 'Recipe version');
    assertOnlyKeys(value, new Set([
        'id', 'version', 'title', 'description', 'variables', 'steps', 'permissions',
        'provenance', 'createdAt', 'updatedAt'
    ]), 'Recipe version');

    const id = normalizeRecipeId(value.id);
    if (expectedId !== undefined && id !== expectedId) {
        fail('INVALID_RECIPE_ID', 'Stored recipe id does not match its record', { expectedId, id });
    }
    if (!Number.isInteger(value.version) || value.version < 1) {
        fail('INVALID_VERSION', 'Recipe version must be a positive integer', { id });
    }
    if (expectedVersion !== undefined && value.version !== expectedVersion) {
        fail('INVALID_VERSION', 'Recipe history must be contiguous', { id, expectedVersion, version: value.version });
    }

    const variables = normalizeVariables(value.variables);
    const steps = normalizeSteps(value.steps, variables);
    const requiredPermissions = permissionUnion(steps);
    const permissions = normalizePermissionList(value.permissions, 'Recipe permissions');
    if (!sameStringArray(permissions, requiredPermissions)) {
        fail('PERMISSION_MANIFEST_MISMATCH', 'Recipe permissions must exactly match step permissions', {
            declared: permissions,
            required: requiredPermissions
        });
    }

    return Object.freeze({
        id,
        version: value.version,
        title: normalizeString(value.title, 'Recipe title', { required: true, max: 200 }),
        description: normalizeString(value.description, 'Recipe description', { max: 5000 }),
        variables,
        steps,
        permissions,
        provenance: normalizeProvenance(value.provenance),
        createdAt: normalizeTimestamp(value.createdAt, 'Recipe createdAt'),
        updatedAt: normalizeTimestamp(value.updatedAt, 'Recipe updatedAt')
    });
}

export function createRecipeVersion(draft, { id, version = 1, now, createdAt = now, parent = null } = {}) {
    assertPlainObject(draft, 'Recipe draft');
    assertOnlyKeys(draft, new Set([
        'id', 'title', 'description', 'variables', 'steps', 'permissions', 'provenance'
    ]), 'Recipe draft');
    const recipeId = normalizeRecipeId(id === undefined ? draft.id : id);
    const provenance = { ...(draft.provenance || {}) };
    if (parent !== null) provenance.parent = parent;
    const variables = normalizeVariables(draft.variables);
    const steps = normalizeSteps(draft.steps, variables);
    const permissions = draft.permissions === undefined ? permissionUnion(steps) : draft.permissions;

    return normalizeRecipeVersion({
        id: recipeId,
        version,
        title: draft.title,
        description: draft.description,
        variables,
        steps,
        permissions,
        provenance,
        createdAt,
        updatedAt: now
    });
}

export function normalizeRecipeRecord(value) {
    assertPlainObject(value, 'Recipe record');
    assertOnlyKeys(value, new Set(['id', 'currentVersion', 'versions']), 'Recipe record');
    const id = normalizeRecipeId(value.id);
    if (!Array.isArray(value.versions) || value.versions.length === 0) {
        fail('INVALID_HISTORY', 'Recipe record must contain version history', { id });
    }
    const versions = value.versions.map((version, index) =>
        normalizeRecipeVersion(version, { expectedId: id, expectedVersion: index + 1 })
    );
    if (value.currentVersion !== versions.length) {
        fail('INVALID_HISTORY', 'Recipe currentVersion must point to the latest version', { id });
    }
    const createdAt = versions[0].createdAt;
    if (versions.some(version => version.createdAt !== createdAt)) {
        fail('INVALID_HISTORY', 'Recipe versions must preserve createdAt', { id });
    }
    return Object.freeze({ id, currentVersion: versions.length, versions: Object.freeze(versions) });
}

export function createEmptyRecipeState(ownerSessionId) {
    return {
        schemaVersion: RECIPES_SCHEMA_VERSION,
        ownerSessionId,
        records: []
    };
}

export function normalizeRecipeState(value, ownerSessionId) {
    if (value === undefined || value === null) return createEmptyRecipeState(ownerSessionId);
    assertPlainObject(value, 'Recipe state');
    assertOnlyKeys(value, new Set(['schemaVersion', 'ownerSessionId', 'records']), 'Recipe state');
    if (value.schemaVersion !== RECIPES_SCHEMA_VERSION) {
        fail('UNSUPPORTED_SCHEMA', 'Recipe state schema is unsupported', {
            stored: value.schemaVersion,
            supported: RECIPES_SCHEMA_VERSION
        });
    }
    if (value.ownerSessionId !== ownerSessionId) {
        fail('SESSION_MISMATCH', 'Recipe repository belongs to another account session', {
            expected: ownerSessionId,
            actual: value.ownerSessionId
        });
    }
    if (!Array.isArray(value.records)) fail('INVALID_STATE', 'Recipe state records must be an array');
    const records = value.records.map(normalizeRecipeRecord);
    const ids = records.map(record => record.id);
    if (new Set(ids).size !== ids.length) fail('INVALID_STATE', 'Recipe state contains duplicate ids');
    return { schemaVersion: RECIPES_SCHEMA_VERSION, ownerSessionId, records };
}

export function normalizeImportStrategy(value) {
    if (!IMPORT_STRATEGIES.has(value)) fail('INVALID_IMPORT_STRATEGY', 'Unsupported recipe import strategy', { value });
    return value;
}

export function normalizeRecipeExport(value) {
    assertPlainObject(value, 'Recipe export');
    assertOnlyKeys(value, new Set(['format', 'formatVersion', 'exportedAt', 'recipes']), 'Recipe export');
    if (value.format !== RECIPE_EXPORT_FORMAT) fail('INVALID_EXPORT', 'Not a Primer++ recipe export');
    if (value.formatVersion !== RECIPE_EXPORT_VERSION) {
        fail('UNSUPPORTED_EXPORT_VERSION', 'Recipe export version is unsupported', {
            stored: value.formatVersion,
            supported: RECIPE_EXPORT_VERSION
        });
    }
    normalizeTimestamp(value.exportedAt, 'Recipe export exportedAt');
    if (!Array.isArray(value.recipes)) fail('INVALID_EXPORT', 'Recipe export recipes must be an array');
    const recipes = value.recipes.map(normalizeRecipeRecord);
    const ids = recipes.map(record => record.id);
    if (new Set(ids).size !== ids.length) fail('INVALID_EXPORT', 'Recipe export contains duplicate ids');
    return { format: RECIPE_EXPORT_FORMAT, formatVersion: RECIPE_EXPORT_VERSION, exportedAt: value.exportedAt, recipes };
}

export function resolveVariableValues(variables, supplied = {}) {
    assertPlainObject(supplied, 'Recipe variable values');
    const known = new Set(variables.map(variable => variable.name));
    const unknown = Object.keys(supplied).filter(name => !known.has(name));
    if (unknown.length) fail('UNKNOWN_VARIABLE', `Unknown recipe variables: ${unknown.join(', ')}`, { unknown });

    const resolved = {};
    for (const variable of variables) {
        if (hasOwn(supplied, variable.name)) {
            resolved[variable.name] = validateVariableValue(variable, supplied[variable.name], `Variable ${variable.name}`);
        } else if (hasOwn(variable, 'default')) {
            resolved[variable.name] = safeClone(variable.default);
        } else if (variable.required) {
            fail('MISSING_VARIABLE', `Required recipe variable is missing: ${variable.name}`, { name: variable.name });
        } else {
            resolved[variable.name] = null;
        }
    }
    return resolved;
}

export function replaceTemplateVariables(template, values) {
    return template.replace(PLACEHOLDER_PATTERN, (_match, name) => {
        const value = values[name];
        if (value === null) return '';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value);
    });
}

const DIFF_FIELDS = Object.freeze([
    'title', 'description', 'variables', 'steps', 'permissions', 'provenance'
]);

function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function diffRecipeVersions(fromValue, toValue) {
    const from = normalizeRecipeVersion(fromValue);
    const to = normalizeRecipeVersion(toValue);
    const changes = [];
    for (const field of DIFF_FIELDS) {
        if (!sameValue(from[field], to[field])) {
            changes.push({ field, before: safeClone(from[field]), after: safeClone(to[field]) });
        }
    }
    return {
        from: { id: from.id, version: from.version },
        to: { id: to.id, version: to.version },
        changed: changes.length > 0,
        changes
    };
}

export function dangerousPermissions(permissions) {
    const dangerous = new Set(DANGEROUS_RECIPE_PERMISSIONS);
    return permissions.filter(permission => dangerous.has(permission));
}
