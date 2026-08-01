import { TEMP_USER, GLOBAL_KEYS } from './constants.js';

// --- Mutable shared state ---
let currentUser = TEMP_USER;
let inspectingUser = TEMP_USER;
let currentTheme = 'glass';
let storageListenerId = null;

export function configureStateRuntime({ storage } = {}) {
    if (!storage || typeof storage.get !== 'function') {
        throw new TypeError('State storage port must implement get()');
    }
    try {
        currentTheme = storage.get(GLOBAL_KEYS.THEME, 'glass');
    } catch (_error) {
        currentTheme = 'glass';
    }
    return currentTheme;
}

export function getCurrentUser() { return currentUser; }
export function setCurrentUser(u) { currentUser = u; }

export function getInspectingUser() { return inspectingUser; }
export function setInspectingUser(u) { inspectingUser = u; }

export function getCurrentTheme() { return currentTheme; }
export function setCurrentTheme(t) { currentTheme = t; }

export function getStorageListenerId() { return storageListenerId; }
export function setStorageListenerId(id) { storageListenerId = id; }
