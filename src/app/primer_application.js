import { LifecycleScope } from '../runtime/lifecycle_scope.js';

function aggregateErrors(errors, message) {
    if (errors.length === 1) return errors[0];
    if (typeof AggregateError === 'function') return new AggregateError(errors, message);
    const aggregate = new Error(message);
    aggregate.name = 'AggregateError';
    aggregate.errors = errors;
    return aggregate;
}

function optionalFunction(value, name) {
    if (value !== null && value !== undefined && typeof value !== 'function') {
        throw new TypeError(`PrimerApplication ${name} must be a function`);
    }
    return value || null;
}

function validateWatcher(watcher) {
    if (!watcher || typeof watcher !== 'object' || typeof watcher.id !== 'string' || !watcher.id) {
        throw new TypeError('PrimerApplication watchers require an id');
    }
    if (typeof watcher.match !== 'function' || typeof watcher.callback !== 'function') {
        throw new TypeError(`PrimerApplication watcher "${watcher.id}" requires match and callback functions`);
    }
    return Object.freeze({
        id: watcher.id,
        match: watcher.match,
        callback: watcher.callback,
        debounce: watcher.debounce || 0
    });
}

/**
 * Owns one complete Primer++ page activation.
 *
 * The controller deliberately knows nothing about Gemini selectors or panel
 * implementation. main.js supplies those policies; this class owns their
 * timers, listeners, DOMWatcher registrations, and teardown ordering.
 */
export class PrimerApplication {
    constructor({
        registry,
        domWatcher,
        watchers = [],
        documentRef = globalThis.document,
        windowRef = globalThis.window,
        timers = globalThis,
        createScope = options => new LifecycleScope(options),
        poll = null,
        pollInterval = 5000,
        beforeStart = null,
        afterStart = null,
        afterStop = null,
        onVisible = null,
        onHidden = null,
        onPageHide = null,
        isReady = null,
        onReady = null,
        readyTimeout = 10000,
        readyPollInterval = 16,
        now = () => Date.now(),
        onError = null
    } = {}) {
        if (!registry || typeof registry.init !== 'function' || typeof registry.destroy !== 'function') {
            throw new TypeError('PrimerApplication requires a lifecycle registry');
        }
        if (!domWatcher || typeof domWatcher.init !== 'function' ||
            typeof domWatcher.register !== 'function' ||
            typeof domWatcher.unregister !== 'function' ||
            typeof domWatcher.destroy !== 'function') {
            throw new TypeError('PrimerApplication requires a DOMWatcher-like object');
        }
        if (!documentRef || typeof documentRef.addEventListener !== 'function') {
            throw new TypeError('PrimerApplication requires a document EventTarget');
        }
        if (!windowRef || typeof windowRef.addEventListener !== 'function') {
            throw new TypeError('PrimerApplication requires a window EventTarget');
        }
        if (typeof createScope !== 'function') {
            throw new TypeError('PrimerApplication createScope must be a function');
        }
        if (typeof now !== 'function') {
            throw new TypeError('PrimerApplication now must be a function');
        }

        this.registry = registry;
        this.domWatcher = domWatcher;
        this.watchers = watchers.map(validateWatcher);
        this.document = documentRef;
        this.window = windowRef;
        this.timers = timers;
        this._createScope = createScope;
        this._poll = optionalFunction(poll, 'poll');
        this._beforeStart = optionalFunction(beforeStart, 'beforeStart');
        this._afterStart = optionalFunction(afterStart, 'afterStart');
        this._afterStop = optionalFunction(afterStop, 'afterStop');
        this._onVisible = optionalFunction(onVisible, 'onVisible');
        this._onHidden = optionalFunction(onHidden, 'onHidden');
        this._onPageHide = optionalFunction(onPageHide, 'onPageHide');
        this._isReady = optionalFunction(isReady, 'isReady');
        this._onReady = optionalFunction(onReady, 'onReady');
        this._onError = optionalFunction(onError, 'onError');
        this._now = now;
        this.pollInterval = Math.max(1, Number(pollInterval) || 1);
        this.readyTimeout = Math.max(0, Number(readyTimeout) || 0);
        this.readyPollInterval = Math.max(1, Number(readyPollInterval) || 1);

        this.state = 'stopped';
        this._scope = null;
        this._startPromise = null;
        this._stopPromise = null;
        this._cancelPoll = null;
    }

    get scope() {
        return this._scope;
    }

    start() {
        if (this._stopPromise) {
            return this._stopPromise.then(() => this.start());
        }
        if (this.state === 'started') return Promise.resolve(this);
        if (this._startPromise) return this._startPromise;

        this.state = 'starting';
        const pending = this._startInternal()
            .then(() => {
                this.state = 'started';
                return this;
            })
            .catch(async error => {
                const cleanupErrors = await this._cleanupAfterFailedStart(error);
                this.state = 'stopped';
                if (cleanupErrors.length) error.cleanupErrors = cleanupErrors;
                throw error;
            })
            .finally(() => {
                this._startPromise = null;
            });
        this._startPromise = pending;
        return pending;
    }

    async _startInternal() {
        const scope = this._createScope({
            label: 'primer-application',
            timers: this.timers,
            onError: error => this._report(error, 'scope cleanup')
        });
        if (!scope || typeof scope.dispose !== 'function' || typeof scope.listen !== 'function' ||
            typeof scope.interval !== 'function' || typeof scope.timeout !== 'function') {
            throw new TypeError('PrimerApplication createScope() returned an incompatible scope');
        }
        this._scope = scope;

        await this._beforeStart?.(scope);
        await this.registry.init();

        this.domWatcher.init();
        scope.defer(() => this.domWatcher.destroy(), 'DOMWatcher');
        for (const watcher of this.watchers) {
            this.domWatcher.register(watcher.id, watcher);
            scope.defer(() => this.domWatcher.unregister(watcher.id), `DOMWatcher:${watcher.id}`);
        }

        scope.listen(this.document, 'visibilitychange', () => this._handleVisibility(scope));
        scope.listen(this.window, 'pagehide', event => {
            this._invokeBackground(this._onPageHide, 'pagehide', event, scope);
        });

        await this._poll?.();
        if (this.document.visibilityState !== 'hidden') this._resumePolling(scope);
        await this._afterStart?.(scope);
        this._scheduleReady(scope);
    }

    stop(reason = 'Primer application stopped') {
        if (this.state === 'stopped' && !this._startPromise) return Promise.resolve(this);
        if (this._stopPromise) return this._stopPromise;
        if (this._startPromise) {
            const pending = this._startPromise
                .catch(() => undefined)
                .then(async () => {
                    if (this.state === 'stopped') return this;
                    this.state = 'stopping';
                    return this._stopInternal(reason);
                })
                .finally(() => {
                    this.state = 'stopped';
                    this._stopPromise = null;
                });
            this._stopPromise = pending;
            return pending;
        }

        this.state = 'stopping';
        const pending = this._stopInternal(reason)
            .finally(() => {
                this.state = 'stopped';
                this._stopPromise = null;
            });
        this._stopPromise = pending;
        return pending;
    }

    async _stopInternal(reason) {
        const errors = [];
        const scope = this._scope;
        this._scope = null;
        this._cancelPoll = null;

        if (scope) {
            try {
                await scope.dispose(reason);
            } catch (error) {
                errors.push(error);
            }
        }
        try {
            await this.registry.destroy(reason);
        } catch (error) {
            errors.push(error);
        }
        try {
            await this._afterStop?.(reason);
        } catch (error) {
            errors.push(error);
        }

        if (errors.length) throw aggregateErrors(errors, 'Primer application teardown failed');
        return this;
    }

    async _cleanupAfterFailedStart(reason) {
        const errors = [];
        const scope = this._scope;
        this._scope = null;
        this._cancelPoll = null;
        if (scope) {
            try {
                await scope.dispose(reason);
            } catch (error) {
                errors.push(error);
            }
        }
        try {
            await this.registry.destroy('Primer application start failed');
        } catch (error) {
            errors.push(error);
        }
        try {
            await this._afterStop?.('Primer application start failed');
        } catch (error) {
            errors.push(error);
        }
        return errors;
    }

    _resumePolling(scope) {
        if (!this._poll || this._cancelPoll || !scope.active) return;
        const release = scope.interval(() => {
            this._invokeBackground(this._poll, 'poll');
        }, this.pollInterval);
        let cancel = null;
        cancel = () => {
            if (this._cancelPoll === cancel) this._cancelPoll = null;
            return release();
        };
        this._cancelPoll = cancel;
    }

    _pausePolling() {
        const cancel = this._cancelPoll;
        this._cancelPoll = null;
        if (cancel) cancel();
    }

    _handleVisibility(scope) {
        if (!scope.active) return;
        if (this.document.visibilityState === 'visible') {
            this._resumePolling(scope);
            this._invokeBackground(async () => {
                await this._poll?.();
                await this._onVisible?.(scope);
            }, 'visibility visible');
        } else {
            this._pausePolling();
            this._invokeBackground(this._onHidden, 'visibility hidden', scope);
        }
    }

    _scheduleReady(scope) {
        if (!this._onReady) return;
        const startedAt = this._now();
        const check = () => {
            if (!scope.active) return;
            let ready = true;
            try {
                ready = !this._isReady || this._isReady();
            } catch (error) {
                ready = false;
                this._report(error, 'readiness probe');
            }
            if (ready || this._now() - startedAt >= this.readyTimeout) {
                this._invokeBackground(this._onReady, 'ready', scope);
                return;
            }
            scope.timeout(check, this.readyPollInterval);
        };
        scope.timeout(check, 0);
    }

    _invokeBackground(callback, phase, ...args) {
        if (!callback) return;
        Promise.resolve()
            .then(() => callback(...args))
            .catch(error => this._report(error, phase));
    }

    _report(error, phase) {
        if (!this._onError) return;
        try {
            this._onError(error, phase);
        } catch (_ignored) {
            // Reporting cannot interfere with app teardown or background work.
        }
    }
}
