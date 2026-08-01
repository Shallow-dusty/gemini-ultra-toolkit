import {
    DEFAULT_DEGRADATION_POLICY,
    assertNonEmptyString,
    deepFreeze,
    isRecord,
    normalizeFeatures,
    normalizePolicy
} from './contract.js';
import { collectEvidence, normalizeNativeFact, readNativeFacts, selectObjectEntry } from './probe.js';
import { buildSelectorHealth, resolveFeature } from './report.js';
import { diffCapabilitySnapshots } from './snapshot_diff.js';

function normalizeTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('clock must return a valid date or timestamp');
    return date.toISOString();
}

export class CapabilityHealthMonitor {
    constructor({
        features,
        adapter = null,
        probe = null,
        nativeCapabilities = {},
        version = '1',
        adapterVersion = null,
        degradationPolicy = {},
        clock,
        notifyUnchanged = false
    } = {}) {
        if (adapter != null && !isRecord(adapter)) throw new TypeError('adapter must be an object');
        if (probe != null && typeof probe !== 'function') throw new TypeError('probe must be a function');
        if (typeof nativeCapabilities !== 'function' && !isRecord(nativeCapabilities) && !(nativeCapabilities instanceof Map)) {
            throw new TypeError('nativeCapabilities must be an object, Map, or function');
        }
        if (typeof clock !== 'function') throw new TypeError('clock must be a function');
        if (typeof notifyUnchanged !== 'boolean') throw new TypeError('notifyUnchanged must be a boolean');
        this.version = assertNonEmptyString(version, 'version');
        this.adapterVersion = adapterVersion == null ? null : assertNonEmptyString(adapterVersion, 'adapterVersion');
        this.degradationPolicy = normalizePolicy(DEFAULT_DEGRADATION_POLICY, degradationPolicy);
        this.features = normalizeFeatures(features, this.degradationPolicy);
        this.adapter = adapter;
        this.probe = probe;
        this.nativeCapabilities = nativeCapabilities;
        this.clock = clock;
        this.notifyUnchanged = notifyUnchanged;
        this.snapshot = null;
        this.listeners = new Set();
        this.generation = 0;
        this.queue = Promise.resolve();
    }

    getSnapshot() {
        return this.snapshot;
    }

    subscribe(listener, { emitCurrent = false } = {}) {
        if (typeof listener !== 'function') throw new TypeError('listener must be a function');
        if (typeof emitCurrent !== 'boolean') throw new TypeError('emitCurrent must be a boolean');
        this.listeners.add(listener);
        if (emitCurrent && this.snapshot) {
            const event = deepFreeze({
                snapshot: this.snapshot,
                previous: null,
                diff: diffCapabilitySnapshots(null, this.snapshot)
            });
            try { listener(event); } catch { /* observers are isolated */ }
        }
        return () => this.listeners.delete(listener);
    }

    refresh() {
        const operation = this.queue.then(() => this._refresh());
        this.queue = operation.catch(() => undefined);
        return operation;
    }

    async _refresh() {
        const generatedAt = normalizeTimestamp(this.clock());
        const selectorIds = [...new Set(this.features.flatMap(feature => [
            ...feature.selectors.required,
            ...feature.selectors.optional
        ]))].sort();
        const [evidence, native] = await Promise.all([
            collectEvidence({
                adapter: this.adapter,
                probe: this.probe,
                features: this.features,
                selectorIds,
                adapterVersion: this.adapterVersion
            }),
            readNativeFacts(this.nativeCapabilities, this.features)
        ]);
        const featureSnapshots = [];
        for (const feature of this.features) {
            let enabled = true;
            let enablementFailed = false;
            try {
                enabled = typeof feature.enabled === 'function'
                    ? Boolean(await feature.enabled())
                    : feature.enabled;
            } catch {
                enablementFailed = true;
            }
            const selectorHealth = buildSelectorHealth(feature, evidence.selectorFacts);
            const rawNativeFact = feature.nativeCapability
                ? selectObjectEntry(native.value, feature.nativeCapability)
                : undefined;
            const nativeFact = feature.nativeCapability ? normalizeNativeFact(rawNativeFact) : null;
            const resolution = resolveFeature(feature, {
                enabled,
                enablementFailed,
                featureProbeFailed: evidence.featureProbeFailed,
                selectorProbeFailed: evidence.selectorProbeFailed,
                nativeFactsFailed: native.failed,
                featureFact: evidence.featureFacts.get(feature.id) || null,
                nativeFact,
                selectorHealth
            });
            featureSnapshots.push(deepFreeze({
                id: feature.id,
                version: feature.version,
                checkedAt: generatedAt,
                status: resolution.status,
                action: resolution.action,
                reason: resolution.reason,
                selectorHealth,
                nativeCapability: feature.nativeCapability ? {
                    id: feature.nativeCapability,
                    policy: feature.nativePolicy,
                    available: nativeFact.available,
                    owned: nativeFact.owned,
                    version: nativeFact.version,
                    reasonCode: nativeFact.reasonCode
                } : null
            }));
        }
        const previous = this.snapshot;
        const snapshot = deepFreeze({
            schemaVersion: 1,
            version: this.version,
            adapterVersion: evidence.adapterVersion,
            generation: ++this.generation,
            generatedAt,
            features: featureSnapshots
        });
        const diff = diffCapabilitySnapshots(previous, snapshot);
        this.snapshot = snapshot;
        if (diff.changed || this.notifyUnchanged) {
            const event = deepFreeze({ snapshot, previous, diff });
            for (const listener of [...this.listeners]) {
                try { listener(event); } catch { /* observers are isolated */ }
            }
        }
        return snapshot;
    }
}

export function createCapabilityHealth(options) {
    return new CapabilityHealthMonitor(options);
}
