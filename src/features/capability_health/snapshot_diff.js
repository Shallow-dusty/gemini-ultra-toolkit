import { deepFreeze, isRecord } from './contract.js';

function featureComparable(feature) {
    return {
        version: feature.version,
        status: feature.status,
        action: feature.action,
        reason: feature.reason,
        selectorHealth: feature.selectorHealth,
        nativeCapability: feature.nativeCapability
    };
}

function changedFields(before, after) {
    return Object.keys(featureComparable(after)).filter(key =>
        JSON.stringify(featureComparable(before)[key]) !== JSON.stringify(featureComparable(after)[key])
    );
}

export function diffCapabilitySnapshots(previous, next) {
    if (!isRecord(next) || !Array.isArray(next.features)) {
        throw new TypeError('next must be a capability health snapshot');
    }
    if (previous != null && (!isRecord(previous) || !Array.isArray(previous.features))) {
        throw new TypeError('previous must be null or a capability health snapshot');
    }
    const before = new Map((previous?.features || []).map(feature => [feature.id, feature]));
    const after = new Map(next.features.map(feature => [feature.id, feature]));
    const added = [...after.keys()].filter(id => !before.has(id)).sort();
    const removed = [...before.keys()].filter(id => !after.has(id)).sort();
    const updated = [...after.keys()]
        .filter(id => before.has(id))
        .map(id => ({ id, changes: changedFields(before.get(id), after.get(id)) }))
        .filter(change => change.changes.length > 0)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(change => Object.freeze({
            id: change.id,
            fromStatus: before.get(change.id).status,
            toStatus: after.get(change.id).status,
            changes: Object.freeze(change.changes)
        }));
    return deepFreeze({
        changed: added.length > 0 || removed.length > 0 || updated.length > 0,
        fromGeneration: previous?.generation ?? null,
        toGeneration: next.generation ?? null,
        added,
        removed,
        updated
    });
}
