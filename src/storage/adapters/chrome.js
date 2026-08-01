import { cloneStorageValue } from '../clone.js';
import { createPendingWriteTracker } from './pending_writes.js';

function requireObject(value, name) {
    if (!value || typeof value !== 'object') throw new TypeError(`${name} must be an object`);
    return value;
}

function requireMethod(value, name) {
    if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
    return value;
}

export function sameChromeStorageValue(left, right, seen = new WeakMap()) {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (left.constructor !== right.constructor) return false;
    if (left instanceof Date) return left.getTime() === right.getTime();
    if (ArrayBuffer.isView(left)) {
        if (left.byteLength !== right.byteLength) return false;
        const a = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
        const b = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
        return a.every((value, index) => value === b[index]);
    }
    if (left instanceof ArrayBuffer) {
        return sameChromeStorageValue(new Uint8Array(left), new Uint8Array(right), seen);
    }
    if (seen.get(left) === right) return true;
    seen.set(left, right);
    if (Array.isArray(left)) {
        return left.length === right.length && left.every((value, index) => sameChromeStorageValue(value, right[index], seen));
    }
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length
        && leftKeys.every((key, index) => key === rightKeys[index] && sameChromeStorageValue(left[key], right[key], seen));
}

function chromeCall(method, receiver, args, runtime) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            if (error) reject(error);
            else resolve(value);
        };
        const callback = value => {
            const lastError = runtime?.lastError;
            finish(lastError ? new Error(lastError.message || String(lastError)) : null, value);
        };
        let result;
        try {
            result = method.apply(receiver, [...args, callback]);
        } catch (error) {
            finish(error);
            return;
        }
        if (result && typeof result.then === 'function') {
            result.then(value => finish(null, value), error => finish(error));
        } else if (result !== undefined) {
            finish(null, result);
        }
    });
}

export function createChromeStorageAdapter(chromeApi, { areaName = 'local' } = {}) {
    const chrome = requireObject(chromeApi, 'chromeApi');
    const storage = requireObject(chrome.storage, 'chromeApi.storage');
    const area = requireObject(storage[areaName], `chromeApi.storage.${areaName}`);
    const get = requireMethod(area.get, `${areaName}.get`);
    const set = requireMethod(area.set, `${areaName}.set`);
    const tracker = createPendingWriteTracker();
    const localEchoes = new Map();
    const listeners = new Map();
    let destroyed = false;

    const onChanged = (changes, changedArea) => {
        if (destroyed || changedArea !== areaName || !changes || typeof changes !== 'object') return;
        for (const [key, change] of Object.entries(changes)) {
            const keyListeners = listeners.get(key);
            if (!keyListeners?.size) continue;
            const queue = localEchoes.get(key) || [];
            const localIndex = queue.findIndex(value => sameChromeStorageValue(value, change.newValue));
            const source = localIndex >= 0 ? 'local-echo' : 'external';
            if (localIndex >= 0) {
                queue.splice(localIndex, 1);
                if (queue.length === 0) localEchoes.delete(key);
            }
            const event = {
                key,
                oldValue: cloneStorageValue(change.oldValue),
                newValue: cloneStorageValue(change.newValue),
                source,
                remote: source === 'external'
            };
            for (const listener of [...keyListeners]) listener(cloneStorageValue(event));
        }
    };

    storage.onChanged?.addListener?.(onChanged);

    const adapter = {
        async get(key) {
            const result = await chromeCall(get, area, [key], chrome.runtime);
            return cloneStorageValue(result?.[key]);
        },

        set(key, value) {
            if (destroyed) return Promise.reject(new Error('Chrome storage adapter is destroyed'));
            const isolated = cloneStorageValue(value);
            const queue = localEchoes.get(key) || [];
            queue.push(cloneStorageValue(isolated));
            localEchoes.set(key, queue);
            const write = chromeCall(set, area, [{ [key]: isolated }], chrome.runtime).catch(error => {
                const current = localEchoes.get(key) || [];
                const index = current.findIndex(candidate => sameChromeStorageValue(candidate, isolated));
                if (index >= 0) current.splice(index, 1);
                if (current.length === 0) localEchoes.delete(key);
                throw error;
            });
            return tracker.track(write);
        },

        delete: typeof area.remove === 'function'
            ? key => tracker.track(chromeCall(area.remove, area, [key], chrome.runtime))
            : undefined,

        async list() {
            const result = await chromeCall(get, area, [null], chrome.runtime);
            return Object.keys(result || {});
        },

        subscribe(key, listener) {
            if (destroyed) throw new Error('Chrome storage adapter is destroyed');
            requireMethod(listener, 'listener');
            const keyListeners = listeners.get(key) || new Set();
            keyListeners.add(listener);
            listeners.set(key, keyListeners);
            let active = true;
            return () => {
                if (!active) return;
                active = false;
                keyListeners.delete(listener);
                if (keyListeners.size === 0) listeners.delete(key);
            };
        },

        flush() {
            return tracker.flush();
        },

        destroy() {
            if (destroyed) return;
            destroyed = true;
            listeners.clear();
            localEchoes.clear();
            storage.onChanged?.removeListener?.(onChanged);
        }
    };

    return Object.freeze(adapter);
}
