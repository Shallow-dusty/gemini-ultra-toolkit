import { PreferencesError, assertModuleId } from './catalog.js';

export const ENABLED_MODULES_STORAGE_KEY = 'gemini_enabled_modules';
export const GLOBAL_PREFERENCES_SCOPE = Object.freeze({ kind: 'global', readOnly: false });

function assertGlobalScope(scope) {
    if (!scope || scope.kind !== 'global' || scope.readOnly !== false
        || Object.prototype.hasOwnProperty.call(scope, 'sessionUserId')
        || Object.prototype.hasOwnProperty.call(scope, 'targetUserId')) {
        throw new PreferencesError(
            'INVALID_PREFERENCES_SCOPE',
            'Feature preferences require an account-independent writable global scope',
            { scope }
        );
    }
}

function assertPort(port) {
    for (const method of ['get', 'set', 'flush']) {
        if (!port || typeof port[method] !== 'function') {
            throw new PreferencesError('INVALID_STORAGE_PORT', `Preferences storage port must implement ${method}()`);
        }
    }
}

function normalizeEnabledIds(value, { allowMissing = false } = {}) {
    if (allowMissing && (value === undefined || value === null)) return null;
    if (!Array.isArray(value)) {
        throw new PreferencesError('INVALID_STORED_PREFERENCES', 'Enabled modules must be stored as an array', { value });
    }
    const result = value.map(id => assertModuleId(id, 'Enabled module id'));
    if (new Set(result).size !== result.length) {
        throw new PreferencesError('INVALID_STORED_PREFERENCES', 'Enabled modules contain duplicate ids', { value: result });
    }
    return result;
}

/** Raw-array adapter for exact compatibility with ModuleRegistry v12. */
export class GlobalPreferencesStorageAdapter {
    constructor({
        port,
        scope = GLOBAL_PREFERENCES_SCOPE,
        key = ENABLED_MODULES_STORAGE_KEY
    } = {}) {
        assertPort(port);
        assertGlobalScope(scope);
        if (key !== ENABLED_MODULES_STORAGE_KEY) {
            throw new PreferencesError('INVALID_PREFERENCES_KEY', 'The compatibility storage key cannot be changed', { key });
        }
        this.port = port;
        this.scope = GLOBAL_PREFERENCES_SCOPE;
        this.key = key;
    }

    async load() {
        const stored = await this.port.get(this.key);
        const normalized = normalizeEnabledIds(stored, { allowMissing: true });
        return normalized === null ? null : normalized.slice();
    }

    async save(enabledIds) {
        const normalized = normalizeEnabledIds(enabledIds);
        await this.port.set(this.key, normalized.slice());
        return normalized.slice();
    }

    flush() {
        return this.port.flush();
    }
}

export function createGlobalPreferencesStorageAdapter(port, options = {}) {
    return new GlobalPreferencesStorageAdapter({ ...options, port });
}
