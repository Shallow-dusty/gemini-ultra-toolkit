import { PreferencesError } from './catalog.js';

export function assertPreferencesStorageAdapter(adapter) {
    for (const method of ['load', 'save', 'flush']) {
        if (!adapter || typeof adapter[method] !== 'function') {
            throw new PreferencesError('INVALID_PERSISTENCE_ADAPTER', `Preferences adapter must implement ${method}()`);
        }
    }
    const scope = adapter.scope;
    if (!scope || scope.kind !== 'global' || scope.readOnly !== false
        || Object.prototype.hasOwnProperty.call(scope, 'sessionUserId')
        || Object.prototype.hasOwnProperty.call(scope, 'targetUserId')) {
        throw new PreferencesError(
            'INVALID_PERSISTENCE_SCOPE',
            'Feature preferences persistence must use an account-independent writable global scope',
            { scope }
        );
    }
}

export function normalizePreferencesRuntime(runtime) {
    if (runtime === null || runtime === undefined) {
        return Object.freeze({
            async enable() {},
            async disable() {}
        });
    }
    for (const method of ['enable', 'disable']) {
        if (typeof runtime[method] !== 'function') {
            throw new PreferencesError('INVALID_RUNTIME_ADAPTER', `Preferences runtime must implement ${method}()`);
        }
    }
    return runtime;
}

export function createModuleHostPreferencesRuntime(host) {
    if (!host || typeof host.start !== 'function' || typeof host.stop !== 'function') {
        throw new PreferencesError('INVALID_MODULE_HOST', 'ModuleHost bridge requires start() and stop()');
    }
    return Object.freeze({
        enable(id) { return host.start(id); },
        disable(id) { return host.stop(id, 'disabled by feature preferences'); }
    });
}
