import { GLOBAL_KEYS } from './constants.js';
import { Logger } from './logger.js';
import { ModuleHost } from './runtime/module_host.js';

const LEGACY_OPTIONAL_CAPABILITY_ALIASES = Object.freeze({
    queue: Object.freeze([
        'message-queue.outbox',
        'message-queue.service',
        'message-queue'
    ])
});

const FALLBACK_STORAGE = Object.freeze({
    get(_key, fallback) { return fallback; },
    set() { return undefined; }
});

function requireStorage(storage) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new TypeError('ModuleRegistry storage must implement get() and set()');
    }
    return storage;
}

function normalizeCallbacks(callbacks) {
    const normalized = {};
    for (const name of [
        'onModuleEnabled',
        'onModuleDisabled',
        'onModulesChanged',
        'onModuleError'
    ]) {
        const callback = callbacks?.[name];
        if (callback !== undefined && callback !== null && typeof callback !== 'function') {
            throw new TypeError(`ModuleRegistry ${name} must be a function`);
        }
        normalized[name] = callback || null;
    }
    return normalized;
}

function createLegacyDescriptor(module) {
    const descriptor = {
        id: module.id,
        defaultEnabled: module.defaultEnabled === true
    };

    // Keep the original module object as the receiver. Several legacy modules
    // replace `this.state` during init/onUserChange, so registering a shallow
    // descriptor clone directly would split runtime state from the UI import.
    if (typeof module.init === 'function') {
        descriptor.start = context => module.init(context);
    }
    if (typeof module.destroy === 'function') {
        descriptor.stop = context => module.destroy(context);
    }
    if (typeof module.onUserChange === 'function') {
        descriptor.onSessionChange = (user, context) => module.onUserChange(user, context);
    }
    if (module.capabilities !== undefined) {
        if (!module.capabilities || typeof module.capabilities !== 'object' || Array.isArray(module.capabilities)) {
            throw new TypeError(`Module "${module.id}" capabilities must be an object`);
        }
        // ModuleHost treats a capability map as both declaration and static
        // provider. Values only become visible after start commits.
        descriptor.provides = { ...module.capabilities };
    }

    return descriptor;
}

/**
 * Compatibility registry for the v12 module objects.
 *
 * ModuleHost owns the actual lifecycle while this class preserves the public
 * `modules`, `enabledModules`, and `isEnabled()` surface consumed by the UI.
 * UI integration is injected by main.js, so the registry no longer imports a
 * shell or Gemini-native UI implementation in the opposite direction.
 */
export class ModuleRegistryController {
    constructor({
        storage = FALLBACK_STORAGE,
        logger = Logger,
        createHost = options => new ModuleHost(options)
    } = {}) {
        requireStorage(storage);
        if (typeof createHost !== 'function') {
            throw new TypeError('ModuleRegistry createHost must be a function');
        }

        this.modules = {};
        this.enabledModules = new Set();
        this.desiredModules = new Set();
        this.pendingDesiredModules = null;
        this.failedModules = new Set();
        this._storage = storage;
        this._logger = logger;
        this._createHost = createHost;
        this._callbacks = normalizeCallbacks({});
        this._host = null;
        this._initialized = false;
        this._operationTail = Promise.resolve();
    }

    get initialized() {
        return this._initialized;
    }

    get host() {
        return this._host;
    }

    configure(callbacks = {}) {
        this._callbacks = normalizeCallbacks(callbacks);
        return this;
    }

    configureRuntime({ storage } = {}) {
        if (this._initialized || this._host) {
            throw new Error('Cannot configure ModuleRegistry runtime after init()');
        }
        this._storage = requireStorage(storage);
        return this;
    }

    register(module) {
        if (!module || typeof module !== 'object' || typeof module.id !== 'string' || !module.id) {
            throw new TypeError('ModuleRegistry.register requires a module with an id');
        }
        if (this._initialized || this._host) {
            throw new Error('Cannot register modules after ModuleRegistry.init()');
        }
        if (this.modules[module.id] && this.modules[module.id] !== module) {
            throw new Error(`Module "${module.id}" is already registered`);
        }
        this.modules[module.id] = module;
        this._logger.debug('Module registered', { id: module.id });
        return module;
    }

    init(session = null) {
        return this._enqueue(() => this._init(session));
    }

    async _init(session) {
        if (this._initialized) return this;

        const host = this._createHost({ session });
        for (const module of Object.values(this.modules)) {
            host.register(createLegacyDescriptor(module));
        }

        this._host = host;
        this.enabledModules.clear();
        this.failedModules.clear();

        const pending = this._readSaved(GLOBAL_KEYS.MODULES_PENDING);
        const saved = pending ?? this._readSaved();
        const desired = saved === null
            ? Object.values(this.modules).filter(module => module.defaultEnabled).map(module => module.id)
            : saved;
        this.desiredModules.clear();
        for (const id of desired) {
            if (this.modules[id]) this.desiredModules.add(id);
        }
        this.pendingDesiredModules = pending === null ? null : new Set(desired);
        if (pending !== null) {
            try {
                await this._storage.set(GLOBAL_KEYS.MODULES, [...this.desiredModules]);
                await this._storage.set(GLOBAL_KEYS.MODULES_PENDING, null);
                this.pendingDesiredModules = null;
            } catch (error) {
                this._reportError(null, 'pending module adoption', error);
            }
        }

        for (const id of this.desiredModules) {
            try {
                await host.start(id);
                this.enabledModules.add(id);
                this.failedModules.delete(id);
            } catch (error) {
                this.failedModules.add(id);
                this._reportError(id, 'init', error);
            }
        }

        await this._refreshOptionalCapabilities();
        this._initialized = true;
        this.save();
        this._emitChanged(null, 'init');
        return this;
    }

    isEnabled(id) {
        return this.enabledModules.has(id);
    }

    isDesired(id) {
        return this.desiredModules.has(id);
    }

    isFailed(id) {
        return this.failedModules.has(id);
    }

    toggle(id, enabled) {
        return this._enqueue(async () => {
            await this._init(null);
            const module = this.modules[id];
            if (!module) throw new Error(`Unknown module "${id}"`);

            const wasEnabled = this.enabledModules.has(id);
            const wasDesired = this.desiredModules.has(id);
            const wasFailed = this.failedModules.has(id);
            const shouldEnable = enabled === undefined ? !wasDesired : Boolean(enabled);
            if (shouldEnable && wasEnabled) return true;
            if (!shouldEnable && !wasEnabled && !wasDesired && !wasFailed) return false;

            if (shouldEnable) {
                return this._enable(module);
            }
            return this._disable(module);
        });
    }

    async _enable(module) {
        const { id } = module;
        this.desiredModules.add(id);
        this.failedModules.delete(id);
        try {
            await this._host.start(id);
            this.enabledModules.add(id);
            this.failedModules.delete(id);
            await this._refreshOptionalCapabilities();
            await this._callbacks.onModuleEnabled?.(module);
            this.save();
            this._logger.info('Module toggled', { id, enabled: true });
            this._emitChanged(id, 'toggle');
            return true;
        } catch (error) {
            this.enabledModules.delete(id);
            this.desiredModules.add(id);
            this.failedModules.add(id);
            let rollbackError = null;
            try {
                if (this._host.getState(id).state === 'started') {
                    await this._host.stop(id, 'enable callback failed');
                }
            } catch (rollbackFailure) {
                rollbackError = rollbackFailure;
            }
            if (rollbackError) error.rollbackError = rollbackError;
            await this._refreshOptionalCapabilities();
            this.save();
            this._reportError(id, 'enable', error);
            this._emitChanged(id, 'rollback');
            throw error;
        }
    }

    async _disable(module) {
        const { id } = module;
        const wasEnabled = this.enabledModules.has(id);
        try {
            if (wasEnabled) await this._host.stop(id, 'module disabled');
            this.enabledModules.delete(id);
            this.desiredModules.delete(id);
            this.failedModules.delete(id);
            await this._refreshOptionalCapabilities();
            await this._callbacks.onModuleDisabled?.(module);
            this.save();
            this._logger.info('Module toggled', { id, enabled: false });
            this._emitChanged(id, 'toggle');
            return false;
        } catch (error) {
            this.desiredModules.add(id);
            let rollbackError = null;
            if (wasEnabled) {
                try {
                    const state = this._host.getState(id).state;
                    if (state !== 'started') await this._host.start(id);
                    this.enabledModules.add(id);
                    this.failedModules.delete(id);
                } catch (rollbackFailure) {
                    rollbackError = rollbackFailure;
                    this.enabledModules.delete(id);
                    this.failedModules.add(id);
                }
            } else {
                this.enabledModules.delete(id);
                this.failedModules.add(id);
            }
            if (rollbackError) error.rollbackError = rollbackError;
            await this._refreshOptionalCapabilities();
            this.save();
            this._reportError(id, 'disable', error);
            this._emitChanged(id, 'rollback');
            throw error;
        }
    }

    notifyUserChange(user) {
        return this._enqueue(async () => {
            // Initialize from a neutral host session so the first explicit
            // notification still reaches every legacy onUserChange hook.
            await this._init(null);
            await this._host.changeSession(user);
            await this._refreshOptionalCapabilities();
            return user;
        });
    }

    stageDesiredModules(ids) {
        return this._enqueue(async () => {
            if (!Array.isArray(ids)) throw new TypeError('Staged module ids must be an array');
            const seen = new Set();
            const normalized = ids.map(id => {
                if (typeof id !== 'string' || !this.modules[id]) {
                    throw new TypeError(`Unknown staged module id: ${String(id)}`);
                }
                if (seen.has(id)) throw new TypeError(`Duplicate staged module id: ${id}`);
                seen.add(id);
                return id;
            });
            await this._storage.set(GLOBAL_KEYS.MODULES_PENDING, normalized);
            this.pendingDesiredModules = new Set(normalized);
            return Object.freeze({
                desiredModules: Object.freeze([...normalized]),
                reloadRequired: true
            });
        });
    }

    getDesiredModulesPreference() {
        return [...(this.pendingDesiredModules || this.desiredModules)];
    }

    destroy(reason = 'registry stopped') {
        return this._enqueue(async () => {
            if (!this._host) {
                this._initialized = false;
                this.enabledModules.clear();
                this.failedModules.clear();
                await this._refreshOptionalCapabilities();
                return;
            }

            const host = this._host;
            try {
                await host.dispose(reason);
            } finally {
                this._host = null;
                this._initialized = false;
                this.enabledModules.clear();
                this.failedModules.clear();
                await this._refreshOptionalCapabilities();
                this._emitChanged(null, 'destroy');
            }
        });
    }

    save() {
        try {
            this._storage.set(GLOBAL_KEYS.MODULES, Array.from(this.desiredModules));
        } catch (_ignored) {
            // Storage failure must not make the runtime lifecycle inconsistent.
        }
    }

    _readSaved(key = GLOBAL_KEYS.MODULES) {
        let saved = null;
        try {
            saved = this._storage.get(key, null);
        } catch (_ignored) {
            return null;
        }
        if (saved === null || saved === undefined) return null;
        if (!Array.isArray(saved)) return [];
        return Array.from(new Set(saved.filter(id => typeof id === 'string')));
    }

    _emitChanged(id, reason) {
        const callback = this._callbacks.onModulesChanged;
        if (!callback) return;
        try {
            callback({
                id,
                reason,
                enabled: id ? this.enabledModules.has(id) : null,
                enabledModules: new Set(this.enabledModules)
            });
        } catch (_ignored) {
            // Rendering observers cannot corrupt lifecycle state.
        }
    }

    _reportError(id, phase, error) {
        this._logger.error(`Module ${phase} failed`, { id, error: String(error) });
        try {
            this._callbacks.onModuleError?.({ id, phase, error });
        } catch (_ignored) {
            // Error reporting must never replace the original failure.
        }
    }

    _readHostCapabilities() {
        if (!this._host || typeof this._host.listCapabilities !== 'function') return {};
        let entries;
        try {
            entries = this._host.listCapabilities();
        } catch (error) {
            this._reportError(null, 'capability snapshot', error);
            return {};
        }
        if (!Array.isArray(entries)) return {};

        const capabilities = {};
        for (const entry of entries) {
            if (!entry || typeof entry.name !== 'string') continue;
            if (entry.owner && !this.enabledModules.has(entry.owner)) continue;
            capabilities[entry.name] = entry.value;
        }
        return capabilities;
    }

    async _refreshOptionalCapabilities() {
        const capabilities = this._readHostCapabilities();
        for (const [alias, names] of Object.entries(LEGACY_OPTIONAL_CAPABILITY_ALIASES)) {
            const match = names.find(name => Object.hasOwn(capabilities, name));
            capabilities[alias] = match ? capabilities[match] : null;
        }
        const snapshot = Object.freeze({ ...capabilities });

        for (const module of Object.values(this.modules)) {
            if (typeof module.configureCapabilities !== 'function') continue;
            try {
                await module.configureCapabilities(snapshot);
            } catch (error) {
                this._reportError(module.id, 'capabilities', error);
            }
        }
        return snapshot;
    }

    _enqueue(operation) {
        const run = this._operationTail.then(operation);
        this._operationTail = run.catch(() => undefined);
        return run;
    }

    getAll() {
        return Object.values(this.modules);
    }
}

export const ModuleRegistry = new ModuleRegistryController();
