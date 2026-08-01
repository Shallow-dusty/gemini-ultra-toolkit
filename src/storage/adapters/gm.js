import { cloneStorageValue } from '../clone.js';
import { createPendingWriteTracker } from './pending_writes.js';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
    return value;
}

export function createGMStorageAdapter(api = {}) {
    const getValue = requireFunction(api.getValue, 'getValue');
    const setValue = requireFunction(api.setValue, 'setValue');
    const tracker = createPendingWriteTracker();

    return Object.freeze({
        async get(key) {
            return cloneStorageValue(await getValue(key, undefined));
        },

        set(key, value) {
            const write = Promise.resolve().then(() => setValue(key, cloneStorageValue(value)));
            return tracker.track(write);
        },

        delete: typeof api.deleteValue === 'function'
            ? key => tracker.track(Promise.resolve().then(() => api.deleteValue(key)))
            : undefined,

        async list() {
            if (typeof api.listValues !== 'function') return [];
            const keys = await api.listValues();
            if (!Array.isArray(keys)) throw new TypeError('listValues must return an array');
            return [...keys];
        },

        subscribe(key, listener) {
            requireFunction(listener, 'listener');
            if (typeof api.addValueChangeListener !== 'function') return undefined;
            const id = api.addValueChangeListener(key, (name, oldValue, newValue, remote) => {
                listener({
                    key: name,
                    oldValue: cloneStorageValue(oldValue),
                    newValue: cloneStorageValue(newValue),
                    source: remote ? 'external' : 'local-echo',
                    remote: Boolean(remote)
                });
            });
            let active = true;
            return () => {
                if (!active) return;
                active = false;
                if (typeof api.removeValueChangeListener === 'function' && id !== undefined) {
                    api.removeValueChangeListener(id);
                }
            };
        },

        flush() {
            return tracker.flush();
        }
    });
}
