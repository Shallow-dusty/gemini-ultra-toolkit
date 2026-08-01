const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]));
    }
    return value;
}

function freezeValue(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freezeValue);
    return Object.freeze(value);
}

export function immutablePreferencesCopy(value) {
    return freezeValue(cloneValue(value));
}

export class PreferencesError extends Error {
    constructor(code, message, details = {}, cause = undefined) {
        super(message);
        this.name = 'PreferencesError';
        this.code = code;
        this.details = immutablePreferencesCopy(details);
        if (cause !== undefined) this.cause = cause;
    }
}

function catalogError(code, message, details = {}) {
    return new PreferencesError(code, message, details);
}

export function assertModuleId(value, label = 'Module id') {
    if (typeof value !== 'string' || !MODULE_ID_PATTERN.test(value)) {
        throw catalogError('INVALID_MODULE_ID', `${label} is invalid`, { value });
    }
    return value;
}

function assertTranslationKey(value, label, id) {
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
        throw catalogError('INVALID_METADATA', `${label} must be a non-empty, trimmed string`, { id, value });
    }
    return value;
}

function normalizeIdList(value, field, id) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw catalogError('INVALID_METADATA', `${field} must be an array`, { id, value });
    }
    const result = value.map(entry => assertModuleId(entry, `${field} entry`));
    if (new Set(result).size !== result.length) {
        throw catalogError('INVALID_METADATA', `${field} contains duplicate module ids`, { id, value: result });
    }
    if (result.includes(id)) {
        throw catalogError('INVALID_METADATA', `${field} cannot reference the module itself`, { id, field });
    }
    return result;
}

function normalizeMetadata(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw catalogError('INVALID_METADATA', 'Module metadata must be an object', { value: input });
    }
    const id = assertModuleId(input.id);
    for (const field of ['defaultEnabled', 'experimental']) {
        if (input[field] !== undefined && typeof input[field] !== 'boolean') {
            throw catalogError('INVALID_METADATA', `${field} must be a boolean`, { id, value: input[field] });
        }
    }
    return immutablePreferencesCopy({
        id,
        labelKey: assertTranslationKey(input.labelKey, 'labelKey', id),
        descriptionKey: assertTranslationKey(input.descriptionKey, 'descriptionKey', id),
        defaultEnabled: input.defaultEnabled === true,
        experimental: input.experimental === true,
        requires: normalizeIdList(input.requires, 'requires', id),
        conflicts: normalizeIdList(input.conflicts, 'conflicts', id)
    });
}

function descriptor(id, defaultEnabled, experimental = false) {
    return {
        id,
        labelKey: `preferences.modules.${id}.label`,
        descriptionKey: `preferences.modules.${id}.description`,
        defaultEnabled,
        experimental,
        requires: [],
        conflicts: []
    };
}

/**
 * Stable v12 ids keep the raw gemini_enabled_modules value downgrade-safe.
 * Labels deliberately live behind translation keys so v13 can rename the
 * visible product concepts without rewriting persisted ids.
 */
export const DEFAULT_MODULE_METADATA = immutablePreferencesCopy([
    descriptor('counter', true),
    descriptor('export', true),
    descriptor('folders', false),
    descriptor('prompt-vault', false),
    descriptor('message-queue', false, true),
    descriptor('default-model', false),
    descriptor('batch-delete', false, true),
    descriptor('quote-reply', false),
    descriptor('ui-tweaks', false),
    descriptor('chat-notes', false)
]);

export class PreferencesCatalog {
    constructor(metadata = DEFAULT_MODULE_METADATA) {
        if (!Array.isArray(metadata) || metadata.length === 0) {
            throw catalogError('INVALID_CATALOG', 'Preferences metadata must be a non-empty array');
        }
        this._items = metadata.map(normalizeMetadata);
        this._byId = new Map();
        for (const item of this._items) {
            if (this._byId.has(item.id)) {
                throw catalogError('DUPLICATE_MODULE', `Duplicate module metadata: ${item.id}`, { id: item.id });
            }
            this._byId.set(item.id, item);
        }
        this._validateReferences();
        this._validateDependencyGraph();
        this._validateDependencyClosures();
        Object.freeze(this._items);
    }

    get ids() {
        return this._items.map(item => item.id);
    }

    has(id) {
        return this._byId.has(id);
    }

    get(id) {
        const item = this._byId.get(id);
        if (!item) throw catalogError('UNKNOWN_MODULE', `Unknown module: ${String(id)}`, { id });
        return immutablePreferencesCopy(item);
    }

    list() {
        return this._items.map(item => immutablePreferencesCopy(item));
    }

    defaultEnabledIds() {
        return this._items.filter(item => item.defaultEnabled).map(item => item.id);
    }

    dependentsOf(id) {
        this.get(id);
        return this._items.filter(item => item.requires.includes(id)).map(item => item.id);
    }

    conflictsWith(id) {
        const item = this.get(id);
        return this._items
            .filter(candidate => item.conflicts.includes(candidate.id) || candidate.conflicts.includes(id))
            .map(candidate => candidate.id);
    }

    topological(ids) {
        if (!Array.isArray(ids)) throw catalogError('INVALID_MODULE_SET', 'Module set must be an array');
        const selected = new Set();
        for (const id of ids) {
            this.get(id);
            if (selected.has(id)) {
                throw catalogError('INVALID_MODULE_SET', 'Module set contains duplicate ids', { id });
            }
            selected.add(id);
        }

        const result = [];
        const visited = new Set();
        const visit = (id) => {
            if (visited.has(id)) return;
            visited.add(id);
            for (const dependency of this._byId.get(id).requires) {
                if (selected.has(dependency)) visit(dependency);
            }
            result.push(id);
        };
        this._items.forEach(item => {
            if (selected.has(item.id)) visit(item.id);
        });
        return result;
    }

    _validateReferences() {
        for (const item of this._items) {
            for (const [field, ids] of [['requires', item.requires], ['conflicts', item.conflicts]]) {
                for (const referencedId of ids) {
                    if (!this._byId.has(referencedId)) {
                        throw catalogError('UNKNOWN_METADATA_REFERENCE', `${item.id}.${field} references an unknown module`, {
                            id: item.id,
                            field,
                            referencedId
                        });
                    }
                }
            }
        }
    }

    _validateDependencyGraph() {
        const visiting = new Set();
        const visited = new Set();
        const visit = (id, path) => {
            if (visiting.has(id)) {
                throw catalogError('DEPENDENCY_CYCLE', 'Module dependency cycle detected', { path: [...path, id] });
            }
            if (visited.has(id)) return;
            visiting.add(id);
            for (const dependency of this._byId.get(id).requires) visit(dependency, [...path, id]);
            visiting.delete(id);
            visited.add(id);
        };
        this._items.forEach(item => visit(item.id, []));
    }

    _validateDependencyClosures() {
        const collect = (id, result) => {
            if (result.has(id)) return;
            result.add(id);
            this._byId.get(id).requires.forEach(dependency => collect(dependency, result));
        };
        for (const item of this._items) {
            const closure = new Set();
            collect(item.id, closure);
            for (const id of closure) {
                const conflict = this.conflictsWith(id).find(other => closure.has(other));
                if (conflict) {
                    throw catalogError('UNSATISFIABLE_DEPENDENCY', `${item.id} requires conflicting modules`, {
                        id: item.id,
                        conflict: [id, conflict]
                    });
                }
            }
        }
    }
}
