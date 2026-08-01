import { cloneStorageValue } from './clone.js';

function assertStorageKey(key) {
    if (typeof key !== 'string' || key.length === 0) {
        throw new TypeError('Storage key must be a non-empty string');
    }
}

function assertAdapter(adapter) {
    if (!adapter || typeof adapter.get !== 'function' || typeof adapter.set !== 'function') {
        throw new TypeError('StoragePort adapter must implement async get(key) and set(key, value)');
    }
}

/**
 * Async, clone-isolated storage boundary.
 *
 * Adapter contract:
 * - get(key) -> value | undefined
 * - set(key, value) -> void
 * - subscribe?(key, listener) -> unsubscribe. Local storage echoes must be
 *   marked source="local" (or remote=false); unmarked events are external.
 * - flush?() -> void
 *
 * Mutations are serialized per StoragePort instance, so update() cannot lose a
 * concurrent mutation from the same application context.
 */
export class StoragePort {
    constructor(adapter) {
        assertAdapter(adapter);
        this._adapter = adapter;
        this._tails = new Map();
        this._operationVersion = 0;
        this._unflushedErrors = [];
        this._listeners = new Map();
        this._adapterUnsubscribers = new Map();
    }

    async get(key, defaultValue = undefined) {
        assertStorageKey(key);
        await (this._tails.get(key) || Promise.resolve());
        const stored = await this._adapter.get(key);
        return cloneStorageValue(stored === undefined ? defaultValue : stored);
    }

    set(key, value) {
        assertStorageKey(key);
        const isolatedValue = cloneStorageValue(value);
        return this._enqueue(key, async () => {
            const oldValue = await this._adapter.get(key);
            await this._adapter.set(key, cloneStorageValue(isolatedValue));
            this._emit(key, oldValue, isolatedValue, 'local');
            return cloneStorageValue(isolatedValue);
        });
    }

    update(key, updater, options = {}) {
        assertStorageKey(key);
        if (typeof updater !== 'function') throw new TypeError('Storage updater must be a function');
        const defaultValue = cloneStorageValue(options.defaultValue);

        return this._enqueue(key, async () => {
            const stored = await this._adapter.get(key);
            const currentValue = stored === undefined ? defaultValue : stored;
            const nextValue = await updater(cloneStorageValue(currentValue));
            const isolatedNext = cloneStorageValue(nextValue);
            await this._adapter.set(key, cloneStorageValue(isolatedNext));
            this._emit(key, currentValue, isolatedNext, 'local');
            return cloneStorageValue(isolatedNext);
        });
    }

    subscribe(key, listener) {
        assertStorageKey(key);
        if (typeof listener !== 'function') throw new TypeError('Storage listener must be a function');

        let listeners = this._listeners.get(key);
        if (!listeners) {
            listeners = new Set();
            this._listeners.set(key, listeners);
            this._attachAdapterSubscription(key);
        }
        listeners.add(listener);

        let active = true;
        return () => {
            if (!active) return;
            active = false;
            const current = this._listeners.get(key);
            if (!current) return;
            current.delete(listener);
            if (current.size === 0) {
                this._listeners.delete(key);
                const unsubscribe = this._adapterUnsubscribers.get(key);
                this._adapterUnsubscribers.delete(key);
                if (typeof unsubscribe === 'function') unsubscribe();
            }
        };
    }

    async flush() {
        // Writes can be queued while an earlier tail or adapter flush is
        // resolving. Keep draining until both boundaries remain stable.
        while (true) {
            await this._drainTails();
            const observedVersion = this._operationVersion;
            if (typeof this._adapter.flush === 'function') await this._adapter.flush();
            await this._drainTails();
            if (observedVersion === this._operationVersion) break;
        }

        const errors = this._unflushedErrors.splice(0);
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, 'Multiple storage writes failed');
    }

    _enqueue(key, operation) {
        this._operationVersion += 1;
        const previous = this._tails.get(key) || Promise.resolve();
        const run = previous.then(operation, operation);
        // A failed operation must not poison later writes or flush().
        const settled = run.then(
            () => undefined,
            (error) => { this._unflushedErrors.push(error); }
        );
        this._tails.set(key, settled);
        settled.then(() => {
            if (this._tails.get(key) === settled) this._tails.delete(key);
        });
        return run;
    }

    async _drainTails() {
        while (true) {
            const observed = [...this._tails.entries()];
            await Promise.all(observed.map(([, tail]) => tail));
            if (observed.length === this._tails.size
                && observed.every(([key, tail]) => this._tails.get(key) === tail)) {
                return;
            }
            if (this._tails.size === 0) return;
        }
    }

    _attachAdapterSubscription(key) {
        if (typeof this._adapter.subscribe !== 'function') return;
        const unsubscribe = this._adapter.subscribe(key, (event = {}) => {
            const source = event.source || (event.remote === false ? 'local' : 'external');
            // set()/update() publish exactly once after persistence succeeds.
            // Ignore the storage backend's echo of that same local write.
            if (source === 'local' || source === 'local-echo') return;
            this._emit(key, event.oldValue, event.newValue, source);
        });
        if (typeof unsubscribe === 'function') this._adapterUnsubscribers.set(key, unsubscribe);
    }

    _emit(key, oldValue, newValue, source) {
        const listeners = this._listeners.get(key);
        if (!listeners) return;

        for (const listener of [...listeners]) {
            try {
                const result = listener({
                    key,
                    oldValue: cloneStorageValue(oldValue),
                    newValue: cloneStorageValue(newValue),
                    source
                });
                if (result && typeof result.catch === 'function') result.catch(() => {});
            } catch {
                // Storage writes must not fail because one UI subscriber failed.
            }
        }
    }
}

/** Deterministic adapter for unit tests and isolated in-memory sessions. */
export class MemoryStorageAdapter {
    constructor(initialValues = {}) {
        this._values = new Map();
        this._listeners = new Map();
        for (const [key, value] of Object.entries(initialValues)) {
            this._values.set(key, cloneStorageValue(value));
        }
    }

    async get(key) {
        return this._values.has(key) ? cloneStorageValue(this._values.get(key)) : undefined;
    }

    async set(key, value) {
        this._values.set(key, cloneStorageValue(value));
    }

    subscribe(key, listener) {
        let listeners = this._listeners.get(key);
        if (!listeners) {
            listeners = new Set();
            this._listeners.set(key, listeners);
        }
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) this._listeners.delete(key);
        };
    }

    async setExternal(key, value) {
        const oldValue = this._values.has(key) ? this._values.get(key) : undefined;
        const isolated = cloneStorageValue(value);
        this._values.set(key, isolated);
        for (const listener of [...(this._listeners.get(key) || [])]) {
            listener({
                oldValue: cloneStorageValue(oldValue),
                newValue: cloneStorageValue(isolated),
                source: 'external'
            });
        }
    }

    async flush() {}
}

export function createMemoryStoragePort(initialValues = {}) {
    return new StoragePort(new MemoryStorageAdapter(initialValues));
}
