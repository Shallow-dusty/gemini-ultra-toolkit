import { getAdapterCapabilityStatus } from './adapter_capability.js';
import { DEFAULT_MODEL_KEYS, normalizePreferredModel } from './default_model_schema.js';
import { DefaultModelSwitcher } from './default_model_switcher.js';

function assertMethod(owner, method, label) {
    if (!owner || typeof owner[method] !== 'function') throw new TypeError(`${label} must implement ${method}()`);
}

function normalizeLogger(logger) {
    return Object.freeze({
        info: typeof logger?.info === 'function' ? logger.info.bind(logger) : () => {},
        warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : () => {}
    });
}

export class DefaultModelPreferenceController {
    constructor({
        repository,
        adapter,
        surface,
        scheduler,
        waitFor,
        logger = null,
        pollIntervalMs = 800,
        menuTimeoutMs = 2000,
        switcher = null
    } = {}) {
        for (const method of ['load', 'save']) assertMethod(repository, method, 'Default model repository');
        for (const method of [
            'getCapabilityProbeReport', 'getCurrentUrl', 'isNewChatUrl', 'getModelSwitch'
        ]) assertMethod(adapter, method, 'Default model adapter');
        for (const method of ['showModelIndicator', 'renderModelPreference']) {
            assertMethod(surface, method, 'Preferences UI surface');
        }
        for (const method of ['setInterval', 'clearInterval']) {
            assertMethod(scheduler, method, 'Default model scheduler');
        }
        if (typeof waitFor !== 'function') throw new TypeError('Default model waitFor must be a function');
        if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
            throw new RangeError('pollIntervalMs must be positive');
        }
        this.switcher = switcher || new DefaultModelSwitcher({
            adapter,
            surface,
            waitFor,
            logger,
            menuTimeoutMs
        });
        for (const method of ['apply', 'stop']) assertMethod(this.switcher, method, 'Default model switcher');
        this.repository = repository;
        this.adapter = adapter;
        this.surface = surface;
        this.scheduler = scheduler;
        this.waitFor = waitFor;
        this.logger = normalizeLogger(logger);
        this.pollIntervalMs = pollIntervalMs;
        this.preferredModel = 'pro';
        this.active = false;
        this._generation = 0;
        this._route = '';
        this._routeTimer = null;
        this._indicatorCleanup = null;
        this._indicatorOwner = null;
        this._switchPromise = null;
        this._lastAppliedKey = '';
        this._background = new Set();
        this._startPromise = null;
        this.capability = Object.freeze({
            id: 'preferences.default-model',
            get: () => this.preferredModel,
            set: model => this.setPreferredModel(model),
            apply: () => this.applyToCurrentNewChat(),
            status: () => this.getStatus()
        });
    }

    start() {
        if (this.active) return Promise.resolve(this.capability);
        if (this._startPromise) return this._startPromise;
        const generation = ++this._generation;
        const operation = (async () => {
            const preferredModel = normalizePreferredModel(await this.repository.load());
            if (generation !== this._generation) return this.capability;
            this.preferredModel = preferredModel;
            this.active = true;
            try {
                this._route = this.adapter.getCurrentUrl();
                this.refreshIndicator();
                this._routeTimer = this.scheduler.setInterval(() => this._checkRoute(), this.pollIntervalMs);
                if (this.adapter.isNewChatUrl()) this._queueAttempt();
            } catch (error) {
                this.active = false;
                this._generation += 1;
                this._teardown();
                throw error;
            }
            this.logger.info('Default model preference started', { preferredModel: this.preferredModel });
            return this.capability;
        })();
        const wrapped = operation.finally(() => {
            if (this._startPromise === wrapped) this._startPromise = null;
        });
        this._startPromise = wrapped;
        return wrapped;
    }

    async stop() {
        if (!this.active && !this._startPromise) return;
        const pendingStart = this._startPromise;
        this._generation += 1;
        if (pendingStart) await pendingStart.catch(() => {});
        if (!this.active) return;
        this.active = false;
        this._teardown();
    }

    onSessionChange() {
        if (!this.active) return false;
        this._route = this.adapter.getCurrentUrl();
        this._lastAppliedKey = '';
        this.refreshIndicator();
        if (this.adapter.isNewChatUrl()) this._queueAttempt();
        return true;
    }

    getStatus() {
        return Object.freeze({
            active: this.active,
            preferredModel: this.preferredModel,
            modelPicker: getAdapterCapabilityStatus(this.adapter, 'model-picker'),
            switching: this._switchPromise !== null
        });
    }

    async setPreferredModel(model) {
        const normalized = normalizePreferredModel(model);
        await this.repository.save(normalized);
        this.preferredModel = normalized;
        this._lastAppliedKey = '';
        if (this.active) {
            this.refreshIndicator();
            if (this.adapter.isNewChatUrl()) this._queueAttempt();
        }
        return normalized;
    }

    refreshIndicator() {
        if (!this.active || getAdapterCapabilityStatus(this.adapter, 'model-picker') === 'unavailable') {
            this.removeIndicator();
            return false;
        }
        const trigger = this.adapter.getModelSwitch();
        if (!trigger) {
            this.removeIndicator();
            return false;
        }
        if (this._indicatorOwner?.trigger === trigger
            && this._indicatorOwner.model === this.preferredModel
            && typeof this._indicatorCleanup === 'function') return true;
        this.removeIndicator();
        try {
            this._indicatorCleanup = this.surface.showModelIndicator(trigger, {
                model: this.preferredModel,
                label: `Preferred model: ${this.preferredModel}`
            });
            this._indicatorOwner = Object.freeze({ trigger, model: this.preferredModel });
            return true;
        } catch (error) {
            this.logger.warn('Default model indicator failed', { error: String(error) });
            this._indicatorCleanup = null;
            this._indicatorOwner = null;
            return false;
        }
    }

    removeIndicator() {
        if (typeof this._indicatorCleanup === 'function') this._indicatorCleanup();
        this._indicatorCleanup = null;
        this._indicatorOwner = null;
    }

    renderSettings(container) {
        return this.surface.renderModelPreference(container, {
            value: this.preferredModel,
            options: DEFAULT_MODEL_KEYS.slice(),
            onChange: model => this.setPreferredModel(model)
        });
    }

    applyToCurrentNewChat() {
        if (!this.active) return Promise.resolve(Object.freeze({ status: 'inactive' }));
        if (!this.adapter.isNewChatUrl()) return Promise.resolve(Object.freeze({ status: 'not-new-chat' }));
        const model = this.preferredModel;
        const operationKey = `${this.adapter.getCurrentUrl()}|${model}`;
        if (operationKey === this._lastAppliedKey) {
            return Promise.resolve(Object.freeze({ status: 'already-applied', model }));
        }
        if (this._switchPromise) return this._switchPromise;
        const generation = this._generation;
        const operation = this.switcher.apply({
            model,
            isCurrent: () => this.active && generation === this._generation
        }).then(result => {
            if (result.status === 'applied' || result.status === 'already-selected') {
                this._lastAppliedKey = operationKey;
            }
            return result;
        });
        const wrapped = operation.finally(() => {
            if (this._switchPromise !== wrapped) return;
            this._switchPromise = null;
            if (!this.active || !this.adapter.isNewChatUrl()) return;
            const desiredKey = `${this.adapter.getCurrentUrl()}|${this.preferredModel}`;
            if (desiredKey !== operationKey && desiredKey !== this._lastAppliedKey) this._queueAttempt();
        });
        this._switchPromise = wrapped;
        return wrapped;
    }

    async whenIdle() {
        while (this._background.size > 0) await Promise.allSettled([...this._background]);
        if (this._switchPromise) await this._switchPromise;
    }

    _checkRoute() {
        if (!this.active) return;
        const current = this.adapter.getCurrentUrl();
        if (current === this._route) return;
        this._route = current;
        this._lastAppliedKey = '';
        this.refreshIndicator();
        if (this.adapter.isNewChatUrl()) this._queueAttempt();
    }

    _queueAttempt() {
        const task = Promise.resolve()
            .then(() => this.applyToCurrentNewChat())
            .catch(error => {
                this.logger.warn('Default model background switch failed', { error: String(error) });
            })
            .finally(() => this._background.delete(task));
        this._background.add(task);
        return task;
    }

    _teardown() {
        if (this._routeTimer !== null) {
            this.scheduler.clearInterval(this._routeTimer);
            this._routeTimer = null;
        }
        this.switcher.stop();
        this._switchPromise = null;
        this._lastAppliedKey = '';
        this.removeIndicator();
    }
}
