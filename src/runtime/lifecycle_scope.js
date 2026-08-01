/** Own disposable resources acquired lazily during one module activation. */
export class LifecycleScope {
    constructor({
        label = 'lifecycle',
        timers = globalThis,
        AbortController: AbortControllerConstructor = globalThis.AbortController,
        parentSignal = null,
        onError = null
    } = {}) {
        if (typeof AbortControllerConstructor !== 'function') {
            throw new TypeError('LifecycleScope requires an AbortController implementation');
        }
        if (onError !== null && typeof onError !== 'function') {
            throw new TypeError('LifecycleScope onError must be a function');
        }

        this.label = String(label || 'lifecycle');
        this._timers = timers;
        this._controller = new AbortControllerConstructor();
        this._onError = onError;
        this._records = [];
        this._state = 'active';
        this._disposeReason = undefined;
        this._disposePromise = null;

        if (parentSignal) this.linkSignal(parentSignal);
    }

    get signal() {
        return this._controller.signal;
    }
    get state() {
        return this._state;
    }
    get active() {
        return this._state === 'active';
    }
    get disposed() {
        return this._state === 'disposed';
    }
    get disposeReason() {
        return this._disposeReason;
    }
    get size() {
        return this._records.reduce((count, record) => count + Number(record.active), 0);
    }

    assertActive() {
        if (!this.active) {
            throw new Error(`LifecycleScope "${this.label}" is ${this._state}`);
        }
    }

    _track(cleanup, label) {
        this.assertActive();
        if (typeof cleanup !== 'function') {
            throw new TypeError('Lifecycle cleanup must be a function');
        }

        const record = {
            active: true,
            cleanup,
            label: String(label || 'cleanup')
        };
        this._records.push(record);

        const release = () => this._release(record);
        release.record = record;
        return release;
    }

    _forget(record) {
        const index = this._records.indexOf(record);
        if (index >= 0) this._records.splice(index, 1);
    }

    _release(record) {
        if (!record.active) return undefined;
        record.active = false;
        this._forget(record);
        return record.cleanup();
    }

    _report(error) {
        if (!this._onError) return;
        try {
            this._onError(error, this);
        } catch (_ignored) {
            // Error reporting must never create another unhandled failure.
        }
    }

    /** Register an arbitrary sync or async cleanup. Returns an idempotent releaser. */
    defer(cleanup, label = 'deferred cleanup') {
        return this._track(cleanup, label);
    }

    /** Track an EventTarget listener. */
    listen(target, type, listener, options) {
        this.assertActive();
        if (!target || typeof target.addEventListener !== 'function' ||
            typeof target.removeEventListener !== 'function') {
            throw new TypeError('LifecycleScope.listen requires an EventTarget-like object');
        }
        if (typeof listener !== 'function' &&
            (!listener || typeof listener.handleEvent !== 'function')) {
            throw new TypeError('LifecycleScope.listen requires an event listener');
        }

        target.addEventListener(type, listener, options);
        return this._track(
            () => target.removeEventListener(type, listener, options),
            `listener:${String(type)}`
        );
    }

    /** Alias matching the browser primitive while still returning a releaser. */
    addEventListener(target, type, listener, options) {
        return this.listen(target, type, listener, options);
    }

    /** Track a one-shot timer. The returned function cancels it early. */
    timeout(callback, delay = 0, ...args) {
        this.assertActive();
        if (typeof callback !== 'function') {
            throw new TypeError('LifecycleScope.timeout requires a callback');
        }
        if (!this._timers || typeof this._timers.setTimeout !== 'function' ||
            typeof this._timers.clearTimeout !== 'function') {
            throw new TypeError('LifecycleScope timers do not support setTimeout/clearTimeout');
        }

        let release;
        const wrapped = (...callbackArgs) => {
            const record = release.record;
            if (!record.active) return;
            record.active = false;
            this._forget(record);
            if (this.active) callback(...callbackArgs);
        };
        const handle = this._timers.setTimeout(wrapped, delay, ...args);
        release = this._track(() => this._timers.clearTimeout(handle), 'timeout');
        release.handle = handle;
        return release;
    }

    /** Track a repeating timer. The returned function cancels it early. */
    interval(callback, delay = 0, ...args) {
        this.assertActive();
        if (typeof callback !== 'function') {
            throw new TypeError('LifecycleScope.interval requires a callback');
        }
        if (!this._timers || typeof this._timers.setInterval !== 'function' ||
            typeof this._timers.clearInterval !== 'function') {
            throw new TypeError('LifecycleScope timers do not support setInterval/clearInterval');
        }

        const wrapped = (...callbackArgs) => {
            if (this.active) callback(...callbackArgs);
        };
        const handle = this._timers.setInterval(wrapped, delay, ...args);
        const release = this._track(() => this._timers.clearInterval(handle), 'interval');
        release.handle = handle;
        return release;
    }

    /** Track an observer, invoking observe() first when a target is supplied. */
    observe(observer, target, options) {
        this.assertActive();
        if (!observer || typeof observer.disconnect !== 'function') {
            throw new TypeError('LifecycleScope.observe requires an observer with disconnect()');
        }
        if (target !== undefined) {
            if (typeof observer.observe !== 'function') {
                throw new TypeError('Lifecycle observer does not implement observe()');
            }
            observer.observe(target, options);
        }
        this._track(() => observer.disconnect(), 'observer');
        return observer;
    }

    /** Track a pre-existing function or unsubscribe/dispose/close object. */
    subscription(subscription, label = 'subscription') {
        this.assertActive();
        let cleanup;
        if (typeof subscription === 'function') {
            cleanup = subscription;
        } else if (subscription && typeof subscription.unsubscribe === 'function') {
            cleanup = () => subscription.unsubscribe();
        } else if (subscription && typeof subscription.dispose === 'function') {
            cleanup = () => subscription.dispose();
        } else if (subscription && typeof subscription.close === 'function') {
            cleanup = () => subscription.close();
        } else {
            throw new TypeError('LifecycleScope.subscription requires a cleanup function or disposable object');
        }
        return this._track(cleanup, label);
    }

    /** Invoke a subscribe factory and immediately own the returned subscription. */
    subscribe(subscribe, ...args) {
        this.assertActive();
        if (typeof subscribe !== 'function') {
            throw new TypeError('LifecycleScope.subscribe requires a subscribe function');
        }
        return this.subscription(subscribe(...args));
    }

    /** Link disposal to another AbortSignal and return a detachable link. */
    linkSignal(signal) {
        this.assertActive();
        if (!signal || typeof signal.addEventListener !== 'function' ||
            typeof signal.removeEventListener !== 'function') {
            throw new TypeError('LifecycleScope.linkSignal requires an AbortSignal-like object');
        }
        if (signal === this.signal) return () => undefined;

        const abort = () => {
            this.dispose(signal.reason).catch(error => this._report(error));
        };
        if (signal.aborted) {
            abort();
            return () => undefined;
        }
        signal.addEventListener('abort', abort, { once: true });
        return this._track(
            () => signal.removeEventListener('abort', abort, { once: true }),
            'abort link'
        );
    }

    /** Create a child whose lifetime cannot outlive this scope. */
    child(options = {}) {
        this.assertActive();
        const normalized = typeof options === 'string' ? { label: options } : options;
        return new LifecycleScope({
            timers: this._timers,
            onError: this._onError,
            ...normalized,
            parentSignal: this.signal
        });
    }

    /** Abort and run cleanups in reverse order; concurrent calls share one promise. */
    dispose(reason) {
        if (this._disposePromise) return this._disposePromise;

        this._state = 'disposing';
        this._disposeReason = reason;
        const records = this._records.slice().reverse();
        this._records = [];
        for (const record of records) record.active = false;

        const errors = [];
        let beginCleanup;
        const cleanupGate = new Promise(resolve => {
            beginCleanup = resolve;
        });
        this._disposePromise = cleanupGate.then(async () => {
            for (const record of records) {
                try {
                    await record.cleanup();
                } catch (error) {
                    errors.push(error);
                }
            }

            this._state = 'disposed';
            if (errors.length === 1) throw errors[0];
            if (errors.length > 1) {
                if (typeof AggregateError === 'function') {
                    throw new AggregateError(errors, `LifecycleScope "${this.label}" cleanup failed`);
                }
                const aggregate = new Error(`LifecycleScope "${this.label}" cleanup failed`);
                aggregate.name = 'AggregateError';
                aggregate.errors = errors;
                throw aggregate;
            }
        });

        try {
            this._controller.abort(reason);
        } catch (_unsupportedReason) {
            try {
                this._controller.abort();
            } catch (abortError) {
                errors.push(abortError);
            }
        }
        beginCleanup();
        return this._disposePromise;
    }
}
