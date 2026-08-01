import { PreferencesError, immutablePreferencesCopy } from './catalog.js';

export function normalizeStoredPreferences(stored, catalog) {
    const source = stored === null ? catalog.defaultEnabledIds() : stored;
    if (!Array.isArray(source)) {
        throw new PreferencesError('INVALID_STORED_PREFERENCES', 'Persistence adapter load() must return an array or null');
    }
    const known = new Set();
    const unknown = [];
    const seen = new Set();
    for (const id of source) {
        if (typeof id !== 'string') {
            throw new PreferencesError('INVALID_STORED_PREFERENCES', 'Persistence adapter returned a non-string module id');
        }
        if (seen.has(id)) {
            throw new PreferencesError('INVALID_STORED_PREFERENCES', 'Persistence adapter returned duplicate module ids', { id });
        }
        seen.add(id);
        if (catalog.has(id)) known.add(id);
        else unknown.push(id);
    }
    return Object.freeze({ known, unknown: Object.freeze(unknown), usedDefaults: stored === null });
}

export function orderedPreferenceIds(catalog, ids) {
    return catalog.ids.filter(id => ids.has(id));
}

export function serializePreferences(catalog, enabled, unknown) {
    return [...orderedPreferenceIds(catalog, enabled), ...unknown];
}

export function createPreferencesSnapshot({ catalog, revision, enabled, unknown }) {
    const enabledIds = orderedPreferenceIds(catalog, enabled);
    const enabledSet = new Set(enabledIds);
    return immutablePreferencesCopy({
        revision,
        enabledIds,
        disabledIds: catalog.ids.filter(id => !enabledSet.has(id)),
        unknownIds: unknown.slice()
    });
}

export function preferenceArraysEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function preferenceErrorSummary(error) {
    return {
        name: String(error?.name || 'Error'),
        message: String(error?.message || error),
        code: error?.code || null
    };
}
