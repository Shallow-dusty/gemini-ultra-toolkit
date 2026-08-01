import { LifecycleScope } from './lifecycle_scope.js';
import {
    assertCapabilitySlots, assertDependencies, assertNoStartedDependents,
    createModuleContext, removeOwnedCapabilities, stageCapabilityMap
} from './module_capabilities.js';
import { findLifecycleHook, normalizeDescriptor, normalizeLifecycle } from './module_descriptor.js';
import { ModuleHostError, collectErrors } from './module_host_error.js';
import { ModuleOperationQueue } from './module_operation_queue.js';
import { createModuleRecord, createModuleState } from './module_state.js';

export { ModuleHostError } from './module_host_error.js';

/**
 * Serial, capability-aware lifecycle host.
 *
 * Supports factory lifecycles, direct hooks, legacy aliases, dependencies and
 * capability publication without coupling modules to the application shell.
 */
export class ModuleHost {
    constructor({
        session = null,
        createScope = options => new LifecycleScope(options),
        onStateChange = null
    } = {}) {
        if (typeof createScope !== 'function') {
            throw new TypeError('ModuleHost createScope must be a function');
        }
        if (onStateChange !== null && typeof onStateChange !== 'function') {
            throw new TypeError('ModuleHost onStateChange must be a function');
        }

        this.session = session;
        this._createScope = createScope;
        this._onStateChange = onStateChange;
        this._modules = new Map();
        this._capabilities = new Map();
        this._activationOrder = [];
        this._disposed = false;
        this._operations = new ModuleOperationQueue(() => this._assertHostActive());
    }

    get disposed() {
        return this._disposed;
    }

    register(descriptor) {
        this._operations.assertCanRun('register', null);
        this._assertHostActive();
        const normalized = normalizeDescriptor(descriptor);
        if (this._modules.has(normalized.id)) {
            throw new ModuleHostError(
                'DUPLICATE_MODULE',
                `Module "${normalized.id}" is already registered`,
                { moduleId: normalized.id }
            );
        }

        this._modules.set(normalized.id, createModuleRecord(normalized));
        this._emit(normalized.id);
        return this.getState(normalized.id);
    }

    has(id) {
        return this._modules.has(id);
    }

    getState(id) {
        const record = this._getRecord(id);
        return createModuleState(record);
    }

    list() {
        return Array.from(this._modules.keys(), id => this.getState(id));
    }

    hasCapability(name) {
        return this._capabilities.has(name);
    }

    getCapability(name) {
        return this._capabilities.get(name)?.value;
    }

    requireCapability(name, requestedBy = null) {
        if (!this._capabilities.has(name)) {
            throw new ModuleHostError(
                'MISSING_CAPABILITY',
                `Required capability "${name}" is not available`,
                { capability: name, requestedBy }
            );
        }
        return this._capabilities.get(name).value;
    }

    getCapabilityOwner(name) {
        return this._capabilities.get(name)?.owner || null;
    }

    listCapabilities() {
        return Array.from(this._capabilities, ([name, entry]) => Object.freeze({
            name,
            owner: entry.owner,
            value: entry.value
        }));
    }

    start(id) {
        return this._operations.schedule('start', id, () => this._startRecord(this._getRecord(id)));
    }

    stop(id, reason = 'module stopped') {
        return this._operations.schedule('stop', id, () => this._stopRecord(this._getRecord(id), reason));
    }

    toggle(id, enabled) {
        return this._operations.schedule('toggle', id, async () => {
            const record = this._getRecord(id);
            const shouldEnable = enabled === undefined ? record.state !== 'started' : Boolean(enabled);
            return shouldEnable
                ? this._startRecord(record)
                : this._stopRecord(record, 'module disabled');
        });
    }

    startDefaults() {
        return this._operations.schedule('startDefaults', null, async () => {
            const pending = Array.from(this._modules.values())
                .filter(record => record.descriptor.defaultEnabled && record.state !== 'started');
            const started = [];

            while (pending.length > 0) {
                const index = pending.findIndex(record =>
                    record.descriptor.requires.every(name => this._capabilities.has(name))
                );
                const next = pending.splice(index >= 0 ? index : 0, 1)[0];
                await this._startRecord(next);
                started.push(next.descriptor.id);
            }
            return started;
        });
    }

    changeSession(nextSession) {
        return this._operations.schedule('changeSession', null, () => this._changeSession(nextSession));
    }

    dispose(reason = 'module host disposed') {
        return this._operations.schedule('dispose', null, async () => {
            if (this._disposed) return;
            const errors = [];
            const records = this._activationOrder.slice().reverse();
            for (const record of records) {
                try {
                    await this._stopRecord(record, reason);
                } catch (error) {
                    errors.push(error);
                }
            }
            this._activationOrder = [];
            this._disposed = true;
            if (errors.length) throw collectErrors(errors);
        }, true);
    }

    _assertHostActive() {
        if (this._disposed) {
            throw new ModuleHostError('HOST_DISPOSED', 'ModuleHost has been disposed');
        }
    }

    _getRecord(id) {
        const record = this._modules.get(id);
        if (!record) {
            throw new ModuleHostError('UNKNOWN_MODULE', `Unknown module "${id}"`, { moduleId: id });
        }
        return record;
    }

    _emit(id) {
        if (!this._onStateChange) return;
        try {
            this._onStateChange(this.getState(id));
        } catch (_ignored) {
            // Observers cannot interfere with lifecycle transitions.
        }
    }

    _setState(record, state, error = null) {
        record.state = state;
        record.lastError = error;
        this._emit(record.descriptor.id);
    }

    async _startRecord(record) {
        if (record.state === 'started') return this.getState(record.descriptor.id);

        this._setState(record, 'starting');
        const rollbackErrors = [];

        try {
            assertDependencies(record, this._capabilities);
            assertCapabilitySlots(record, this._capabilities);

            const scope = this._createScope({ label: `module:${record.descriptor.id}` });
            if (!scope || typeof scope.dispose !== 'function' || !scope.signal) {
                throw new ModuleHostError(
                    'INVALID_SCOPE',
                    'createScope() must return a LifecycleScope-like object',
                    { moduleId: record.descriptor.id }
                );
            }
            record.scope = scope;

            const staged = new Map();
            record.context = createModuleContext(this, record, scope, staged, this.session);
            if (record.descriptor.staticProvides) {
                stageCapabilityMap(record, staged, record.descriptor.staticProvides, 'provides');
            }
            if (record.descriptor.capabilities) {
                stageCapabilityMap(record, staged, record.descriptor.capabilities, 'capabilities');
            }

            record.lifecycle = typeof record.descriptor.create === 'function'
                ? normalizeLifecycle(await this._operations.runHook(
                    record,
                    'create',
                    () => record.descriptor.create(record.context)
                ), record.descriptor.id)
                : record.descriptor;
            if (record.lifecycle.capabilities) {
                stageCapabilityMap(record, staged, record.lifecycle.capabilities, 'lifecycle.capabilities');
            }

            const startHook = findLifecycleHook(record, 'start');
            if (startHook) {
                const result = await this._operations.runHook(
                    record,
                    startHook.alias,
                    () => startHook.fn.call(startHook.source, record.context)
                );
                if (typeof result === 'function') {
                    scope.defer(result, 'module start cleanup');
                } else if (result && typeof result === 'object') {
                    record.startResult = normalizeLifecycle(result, record.descriptor.id);
                    if (record.startResult.capabilities) {
                        stageCapabilityMap(
                            record,
                            staged,
                            record.startResult.capabilities,
                            'start result capabilities'
                        );
                    }
                }
            }

            const missingProvided = record.descriptor.provides.filter(name => !staged.has(name));
            if (missingProvided.length) {
                throw new ModuleHostError(
                    'MISSING_PROVIDED_CAPABILITY',
                    `Module "${record.descriptor.id}" did not register declared capabilities: ${missingProvided.join(', ')}`,
                    { moduleId: record.descriptor.id, missing: missingProvided }
                );
            }

            assertCapabilitySlots(record, this._capabilities);
            for (const [name, value] of staged) {
                this._capabilities.set(name, { owner: record.descriptor.id, value });
            }
            this._activationOrder.push(record);
            record.generation += 1;
            this._setState(record, 'started');
            return this.getState(record.descriptor.id);
        } catch (error) {
            if (record.lifecycle) {
                const stopHook = findLifecycleHook(record, 'stop');
                if (stopHook) {
                    try {
                        await this._operations.runHook(
                            record,
                            stopHook.alias,
                            () => stopHook.fn.call(stopHook.source, {
                                ...record.context,
                                reason: 'start failed',
                                failedStart: true
                            })
                        );
                    } catch (rollbackError) {
                        rollbackErrors.push(rollbackError);
                    }
                }
            }
            removeOwnedCapabilities(this._capabilities, record.descriptor.id);
            if (record.scope) {
                try {
                    await this._operations.runHook(
                        record,
                        'scope cleanup',
                        () => record.scope.dispose(error)
                    );
                } catch (rollbackError) {
                    rollbackErrors.push(rollbackError);
                }
            }

            const failure = error instanceof ModuleHostError
                ? error
                : new ModuleHostError(
                    'START_FAILED',
                    `Module "${record.descriptor.id}" failed to start`,
                    { moduleId: record.descriptor.id },
                    error
                );
            if (rollbackErrors.length) failure.rollbackErrors = rollbackErrors;
            record.scope = null;
            record.lifecycle = null;
            record.startResult = null;
            record.context = null;
            this._setState(record, 'failed', failure);
            throw failure;
        }
    }

    async _stopRecord(record, reason) {
        if (record.state === 'stopped') return this.getState(record.descriptor.id);
        if (record.state === 'failed' && !record.scope) {
            this._setState(record, 'stopped');
            return this.getState(record.descriptor.id);
        }

        assertNoStartedDependents(record, this._activationOrder);
        this._setState(record, 'stopping');
        const errors = [];
        const stopHook = findLifecycleHook(record, 'stop');
        if (stopHook) {
            try {
                const stopContext = createModuleContext(this, record, record.scope, new Map(), this.session, {
                    reason,
                    failedStart: false
                });
                await this._operations.runHook(
                    record,
                    stopHook.alias,
                    () => stopHook.fn.call(stopHook.source, stopContext)
                );
            } catch (error) {
                errors.push(error);
            }
        }

        this._activationOrder = this._activationOrder
            .filter(activeRecord => activeRecord !== record);
        removeOwnedCapabilities(this._capabilities, record.descriptor.id);
        if (record.scope) {
            try {
                await this._operations.runHook(
                    record,
                    'scope cleanup',
                    () => record.scope.dispose(reason)
                );
            } catch (error) {
                errors.push(error);
            }
        }

        record.scope = null;
        record.lifecycle = null;
        record.startResult = null;
        record.context = null;
        if (errors.length) {
            const failure = new ModuleHostError(
                'STOP_FAILED',
                `Module "${record.descriptor.id}" failed to stop cleanly`,
                { moduleId: record.descriptor.id, errors },
                collectErrors(errors)
            );
            this._setState(record, 'failed', failure);
            throw failure;
        }
        this._setState(record, 'stopped');
        return this.getState(record.descriptor.id);
    }

    async _changeSession(nextSession) {
        if (Object.is(nextSession, this.session)) return this.session;
        const previousSession = this.session;
        const attempted = [];
        let failingRecord = null;

        try {
            for (const record of this._activationOrder.slice()) {
                const hook = findLifecycleHook(record, 'session');
                if (!hook) continue;
                failingRecord = record;
                attempted.push({ record, hook });
                const context = createModuleContext(this, record, record.scope, new Map(), nextSession, {
                    previousSession,
                    nextSession,
                    rollback: false
                });
                await this._operations.runHook(
                    record,
                    hook.alias,
                    () => hook.fn.call(hook.source, nextSession, context)
                );
                failingRecord = null;
            }
            this.session = nextSession;
            for (const record of this._modules.values()) {
                if (record.lastError?.code === 'SESSION_CHANGE_FAILED') {
                    record.lastError = null;
                    this._emit(record.descriptor.id);
                }
            }
            return this.session;
        } catch (error) {
            const rollbackErrors = [];
            for (const { record, hook } of attempted.reverse()) {
                try {
                    const context = createModuleContext(this, record, record.scope, new Map(), previousSession, {
                        previousSession: nextSession,
                        nextSession: previousSession,
                        rollback: true
                    });
                    await this._operations.runHook(
                        record,
                        hook.alias,
                        () => hook.fn.call(hook.source, previousSession, context)
                    );
                } catch (rollbackError) {
                    rollbackErrors.push({ moduleId: record.descriptor.id, error: rollbackError });
                }
            }
            const failure = new ModuleHostError(
                'SESSION_CHANGE_FAILED',
                `Session change failed in module "${failingRecord.descriptor.id}"`,
                {
                    moduleId: failingRecord.descriptor.id,
                    previousSession,
                    nextSession,
                    rollbackErrors
                },
                error
            );
            failingRecord.lastError = failure;
            this._emit(failingRecord.descriptor.id);
            throw failure;
        }
    }
}
