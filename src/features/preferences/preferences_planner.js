import { PreferencesError, immutablePreferencesCopy } from './catalog.js';
import { orderedPreferenceIds } from './preferences_state.js';

const POLICY_VALUES = Object.freeze({
    dependencyPolicy: Object.freeze(['enable', 'reject']),
    dependentPolicy: Object.freeze(['disable', 'reject']),
    conflictPolicy: Object.freeze(['disable', 'reject'])
});

export const DEFAULT_PREFERENCE_POLICIES = Object.freeze({
    dependencyPolicy: 'enable',
    dependentPolicy: 'disable',
    conflictPolicy: 'disable'
});

function normalizePolicies(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new PreferencesError('INVALID_PLAN_OPTIONS', 'Plan options must be an object');
    }
    const result = { ...DEFAULT_PREFERENCE_POLICIES };
    for (const [key, value] of Object.entries(options)) {
        if (!Object.prototype.hasOwnProperty.call(POLICY_VALUES, key) || !POLICY_VALUES[key].includes(value)) {
            throw new PreferencesError('INVALID_PLAN_OPTIONS', `Invalid ${key} policy`, { key, value });
        }
        result[key] = value;
    }
    return Object.freeze(result);
}

function normalizeChanges(changes, catalog) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw new PreferencesError('INVALID_CHANGESET', 'Feature changes must be an object of module booleans');
    }
    const result = new Map();
    for (const [id, enabled] of Object.entries(changes)) {
        if (!catalog.has(id)) throw new PreferencesError('UNKNOWN_MODULE', `Unknown module: ${id}`, { id });
        if (typeof enabled !== 'boolean') {
            throw new PreferencesError('INVALID_CHANGESET', 'Feature change values must be booleans', { id, value: enabled });
        }
        result.set(id, enabled);
    }
    return result;
}

export class PreferencesPlanner {
    constructor(catalog) {
        this.catalog = catalog;
    }

    preview({ before, unknown, changes, options }) {
        const requested = normalizeChanges(changes, this.catalog);
        const policies = normalizePolicies(options);
        const target = new Set(before);
        const explicitEnabled = new Set();
        const explicitDisabled = new Set();
        const autoEnabled = new Set();
        const autoDisabled = new Set();
        const protectedIds = new Set();

        for (const [id, enabled] of requested) {
            (enabled ? explicitEnabled : explicitDisabled).add(id);
            if (enabled) target.add(id);
            else target.delete(id);
        }
        for (const id of explicitDisabled) {
            this._disableWithDependents(id, target, { policies, explicitEnabled, protectedIds, autoDisabled });
        }
        for (const id of explicitEnabled) {
            this._enableWithDependencies(id, target, {
                policies,
                explicitDisabled,
                autoEnabled,
                protectedIds,
                protect: true
            });
        }
        for (const id of this.catalog.ids) {
            if (!target.has(id)) continue;
            this._enableWithDependencies(id, target, {
                policies,
                explicitDisabled,
                autoEnabled,
                protectedIds,
                protect: protectedIds.has(id)
            });
        }
        this._resolveConflicts(target, { policies, explicitEnabled, protectedIds, autoDisabled });

        return this.create({
            before,
            after: target,
            unknownBefore: unknown,
            unknownAfter: unknown,
            requested: Object.fromEntries(requested),
            policies,
            autoEnabled,
            autoDisabled
        });
    }

    create({ before, after, unknownBefore, unknownAfter, requested, policies, autoEnabled, autoDisabled }) {
        const beforeIds = orderedPreferenceIds(this.catalog, before);
        const afterIds = orderedPreferenceIds(this.catalog, after);
        const disableOrder = this.catalog.topological(beforeIds).reverse().filter(id => !after.has(id));
        const enableOrder = this.catalog.topological(afterIds).filter(id => !before.has(id));
        return immutablePreferencesCopy({
            before: { enabledIds: beforeIds, unknownIds: unknownBefore.slice() },
            after: { enabledIds: afterIds, unknownIds: unknownAfter.slice() },
            requested,
            policies,
            autoEnabledIds: orderedPreferenceIds(
                this.catalog,
                new Set([...autoEnabled].filter(id => after.has(id) && !before.has(id)))
            ),
            autoDisabledIds: orderedPreferenceIds(
                this.catalog,
                new Set([...autoDisabled].filter(id => before.has(id) && !after.has(id)))
            ),
            operations: [
                ...disableOrder.map(id => ({ id, enabled: false })),
                ...enableOrder.map(id => ({ id, enabled: true }))
            ]
        });
    }

    _enableWithDependencies(id, target, context) {
        if (context.protect) context.protectedIds.add(id);
        for (const dependency of this.catalog.get(id).requires) {
            if (context.explicitDisabled.has(dependency)) {
                throw new PreferencesError('DEPENDENCY_BLOCKED', `${id} requires explicitly disabled ${dependency}`, { id, dependency });
            }
            if (!target.has(dependency)) {
                if (context.policies.dependencyPolicy === 'reject') {
                    throw new PreferencesError('DEPENDENCY_REQUIRED', `${id} requires ${dependency}`, { id, dependency });
                }
                target.add(dependency);
                context.autoEnabled.add(dependency);
            }
            this._enableWithDependencies(dependency, target, context);
        }
    }

    _disableWithDependents(id, target, context) {
        for (const dependent of this.catalog.dependentsOf(id)) {
            if (!target.has(dependent)) continue;
            if (context.explicitEnabled.has(dependent) || context.protectedIds.has(dependent)) {
                throw new PreferencesError('DEPENDENT_BLOCKED', `${id} is required by protected ${dependent}`, { id, dependent });
            }
            if (context.policies.dependentPolicy === 'reject') {
                throw new PreferencesError('DEPENDENT_ENABLED', `${id} is required by enabled ${dependent}`, { id, dependent });
            }
            this._disableWithDependents(dependent, target, context);
            target.delete(dependent);
            context.autoDisabled.add(dependent);
        }
        target.delete(id);
    }

    _resolveConflicts(target, context) {
        for (const id of this.catalog.ids) {
            if (!target.has(id)) continue;
            for (const conflict of this.catalog.conflictsWith(id)) {
                if (!target.has(id)) break;
                if (!target.has(conflict)) continue;
                if (context.policies.conflictPolicy === 'reject') {
                    throw new PreferencesError('MODULE_CONFLICT', `${id} conflicts with ${conflict}`, { modules: [id, conflict] });
                }
                const idProtected = context.protectedIds.has(id);
                const conflictProtected = context.protectedIds.has(conflict);
                if (idProtected && conflictProtected) {
                    throw new PreferencesError('MODULE_CONFLICT', 'Explicit feature choices conflict', { modules: [id, conflict] });
                }
                const loser = idProtected ? conflict : conflictProtected ? id : conflict;
                this._disableWithDependents(loser, target, context);
                context.autoDisabled.add(loser);
            }
        }
    }
}
