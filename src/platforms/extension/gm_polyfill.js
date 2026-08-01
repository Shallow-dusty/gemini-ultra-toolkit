/**
 * GM_* API polyfill for the browser-extension environment.
 *
 * Reads remain synchronous, matching the legacy GM_* API used by the shared
 * application. Values are cloned at the cache boundary so callers cannot
 * mutate persisted state without going through GM_setValue(). Writes are
 * serialized; GM_setValue() returns its write promise for new callers, while
 * legacy fire-and-forget callers can use __flushGMPolyfill() at lifecycle
 * boundaries to observe any storage failure.
 */

const _cache = Object.create(null);
const _persistedCache = Object.create(null);
const _changeListeners = new Map();
const _pendingLocalChanges = new Map();
const _keyVersions = new Map();

let _nextListenerId = 1;
let _initPromise = null;
let _storageListenerRegistered = false;
let _initializing = false;
let _bufferedChanges = [];
let _writeTail = Promise.resolve();
let _writeFailures = [];

function _clone(value) {
    if (value === undefined || value === null || typeof value !== 'object') {
        return value;
    }

    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }

    // Extension storage accepts JSON-compatible values. This fallback keeps
    // the same no-shared-reference contract in older test/browser runtimes.
    return JSON.parse(JSON.stringify(value));
}

function _storageEqual(left, right) {
    if (Object.is(left, right)) return true;
    if (left === null || right === null) return false;
    if (typeof left !== 'object' || typeof right !== 'object') return false;

    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }
        return left.every((value, index) => _storageEqual(value, right[index]));
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every((key, index) => (
        key === rightKeys[index] && _storageEqual(left[key], right[key])
    ));
}

function _setCachedValue(key, value) {
    if (value === undefined) {
        delete _cache[key];
        return;
    }
    _cache[key] = _clone(value);
}

function _setPersistedValue(key, value) {
    if (value === undefined) {
        delete _persistedCache[key];
        return;
    }
    _persistedCache[key] = _clone(value);
}

function _fireListeners(key, oldValue, newValue, remote) {
    for (const [, entry] of _changeListeners) {
        if (entry.key !== key) continue;
        try {
            // Each listener receives its own snapshot. A listener cannot
            // corrupt the cache or the arguments observed by another listener.
            entry.cb(key, _clone(oldValue), _clone(newValue), remote);
        } catch (e) { /* listener failures must not break storage delivery */ }
    }
}

function _enqueueLocalChange(key, change) {
    const queue = _pendingLocalChanges.get(key) || [];
    queue.push(change);
    _pendingLocalChanges.set(key, queue);
}

function _removeLocalChange(key, change) {
    const queue = _pendingLocalChanges.get(key);
    if (!queue) return;
    const index = queue.indexOf(change);
    if (index !== -1) queue.splice(index, 1);
    if (queue.length === 0) _pendingLocalChanges.delete(key);
}

function _consumeLocalEcho(key, oldValue, newValue) {
    const queue = _pendingLocalChanges.get(key);
    if (!queue) return null;

    const index = queue.findIndex((change) => (
        _storageEqual(change.oldValue, oldValue)
        && _storageEqual(change.newValue, newValue)
    ));
    if (index === -1) return null;

    const [change] = queue.splice(index, 1);
    if (queue.length === 0) _pendingLocalChanges.delete(key);
    return change;
}

function _applyStorageChanges(changes, area) {
    if (area !== 'local') return;

    for (const [key, change] of Object.entries(changes)) {
        const oldValue = change?.oldValue;
        const newValue = change?.newValue;
        const localEcho = _consumeLocalEcho(key, oldValue, newValue);

        if (localEcho) {
            _setPersistedValue(key, newValue);
            // A later same-tab write may already be in the optimistic cache.
            // Only restore this value when this echo belongs to the latest
            // write for the key. The local listener was notified at set time.
            if (_keyVersions.get(key) === localEcho.version) {
                _setCachedValue(key, newValue);
            }
            continue;
        }

        // A different context can update this key while our serialized set()
        // is in flight. Rebase the pending marker across that confirmed
        // transition so the later remote->local Chrome echo is still consumed
        // as the echo of our already-notified optimistic write.
        for (const pending of _pendingLocalChanges.get(key) || []) {
            if (_storageEqual(pending.oldValue, oldValue)
                && !_storageEqual(pending.newValue, newValue)) {
                pending.oldValue = _clone(newValue);
            }
        }
        _setPersistedValue(key, newValue);
        _setCachedValue(key, newValue);
        _fireListeners(key, oldValue, newValue, true);
    }
}

function _onStorageChanged(changes, area) {
    if (_initializing) {
        _bufferedChanges.push({ changes: _clone(changes), area });
        return;
    }
    _applyStorageChanges(changes, area);
}

function _ensureStorageListener() {
    if (_storageListenerRegistered) return;
    chrome.storage.onChanged.addListener(_onStorageChanged);
    _storageListenerRegistered = true;
}

export function __initGMPolyfill() {
    if (_initPromise) return _initPromise;

    _initializing = true;
    _bufferedChanges = [];
    _ensureStorageListener();

    _initPromise = (async () => {
        try {
            const data = await chrome.storage.local.get(null);

            for (const key of Object.keys(_cache)) delete _cache[key];
            for (const key of Object.keys(_persistedCache)) delete _persistedCache[key];
            for (const [key, value] of Object.entries(data || {})) {
                _setCachedValue(key, value);
                _setPersistedValue(key, value);
            }

            const buffered = _bufferedChanges;
            _bufferedChanges = [];
            _initializing = false;
            for (const event of buffered) {
                _applyStorageChanges(event.changes, event.area);
            }
        } catch (error) {
            _initializing = false;
            _bufferedChanges = [];
            _initPromise = null;
            throw error;
        }
    })();

    return _initPromise;
}

export function GM_getValue(key, defaultValue) {
    return _clone(key in _cache ? _cache[key] : defaultValue);
}

export function GM_setValue(key, value) {
    const oldValue = key in _cache ? _clone(_cache[key]) : undefined;
    const newValue = _clone(value);
    const version = (_keyVersions.get(key) || 0) + 1;
    _keyVersions.set(key, version);

    _setCachedValue(key, newValue);
    _fireListeners(key, oldValue, newValue, false);

    const operation = _writeTail.then(async () => {
        const localChange = {
            // A previous failed write remains in the optimistic read cache but
            // never reached Chrome. Match the echo against the last confirmed
            // storage value so a same-key retry is not reported as remote.
            oldValue: key in _persistedCache ? _clone(_persistedCache[key]) : undefined,
            newValue: _clone(newValue),
            version,
        };

        // Chrome does not emit onChanged when the stored value is unchanged.
        if (!_storageEqual(localChange.oldValue, newValue)) {
            _enqueueLocalChange(key, localChange);
        }

        try {
            await chrome.storage.local.set({ [key]: _clone(newValue) });
            _setPersistedValue(key, newValue);
        } catch (error) {
            _removeLocalChange(key, localChange);
            throw error;
        }
    });

    // Attaching the rejection handler here keeps legacy fire-and-forget calls
    // from producing unhandled rejections. The returned operation still
    // rejects for callers that explicitly await it, and flush reports it too.
    _writeTail = operation.catch((error) => {
        _writeFailures.push(error);
    });

    return operation;
}

export async function __flushGMPolyfill() {
    // Include writes queued while an earlier write was being awaited.
    while (true) {
        const pending = _writeTail;
        await pending;
        if (pending === _writeTail) break;
    }

    if (_writeFailures.length > 0) {
        const failures = _writeFailures;
        _writeFailures = [];
        if (failures.length === 1) throw failures[0];

        const error = new Error(`${failures.length} extension storage writes failed`);
        error.name = 'AggregateError';
        error.errors = failures;
        throw error;
    }
}

export function GM_listValues() {
    return Object.keys(_cache);
}

export function GM_addValueChangeListener(key, cb) {
    if (typeof cb !== 'function') {
        throw new TypeError('GM_addValueChangeListener callback must be a function');
    }
    const id = _nextListenerId++;
    _changeListeners.set(id, { key, cb });
    return id;
}

export function GM_removeValueChangeListener(id) {
    _changeListeners.delete(id);
}

export function GM_addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return style;
}

export function GM_registerMenuCommand(_name, _fn) {
    // No-op in extension: context menus are handled by background.js.
}
