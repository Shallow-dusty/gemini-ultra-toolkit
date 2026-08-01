/**
 * Clone values at every storage boundary.
 *
 * Modern supported browsers expose structuredClone.  The fallback keeps the
 * port usable in test runners and older userscript hosts without silently
 * falling back to JSON (which would corrupt Dates, Maps, Sets and undefined).
 */
export function cloneStorageValue(value) {
    if (value === undefined || value === null) return value;

    if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
    }

    return cloneFallback(value, new WeakMap());
}
function cloneFallback(value, seen) {
    if (value === null || typeof value !== 'object') {
        if (typeof value === 'function' || typeof value === 'symbol') {
            throw new TypeError('Storage values must be structured-cloneable');
        }
        return value;
    }

    if (seen.has(value)) return seen.get(value);

    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof RegExp) return new RegExp(value.source, value.flags);
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) {
        if (value instanceof DataView) {
            const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
            return new DataView(buffer);
        }
        return new value.constructor(value);
    }

    if (value instanceof Map) {
        const result = new Map();
        seen.set(value, result);
        for (const [key, item] of value) {
            result.set(cloneFallback(key, seen), cloneFallback(item, seen));
        }
        return result;
    }

    if (value instanceof Set) {
        const result = new Set();
        seen.set(value, result);
        for (const item of value) result.add(cloneFallback(item, seen));
        return result;
    }

    const result = Array.isArray(value)
        ? []
        : Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype);
    seen.set(value, result);
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key === 'symbol') {
            throw new TypeError('Storage values must be structured-cloneable');
        }
        result[key] = cloneFallback(value[key], seen);
    }
    return result;
}
