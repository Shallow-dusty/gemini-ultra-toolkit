import { deepFreeze } from './contract.js';
import { createGeminiCapabilityProbeBridge } from './gemini_probe_bridge.js';
import { createCapabilityHealth } from './monitor.js';
import { diffCapabilitySnapshots } from './snapshot_diff.js';

export class GeminiCapabilityHealthService {
    constructor({
        getCapabilityProbeReport,
        features,
        clock,
        version = '1',
        adapterVersion = null,
        degradationPolicy = {},
        notifyUnchanged = false
    } = {}) {
        this.activeCapture = null;
        this.bridge = null;
        this.monitor = createCapabilityHealth({
            features,
            clock,
            version,
            adapterVersion,
            degradationPolicy,
            notifyUnchanged,
            probe: request => this.bridge.toFeatureProbe(this.activeCapture, request),
            nativeCapabilities: request => this.bridge.toNativeFacts(this.activeCapture, request)
        });
        this.bridge = createGeminiCapabilityProbeBridge({
            getCapabilityProbeReport,
            features: this.monitor.features
        });
        this.notifyUnchanged = notifyUnchanged;
        this.snapshot = null;
        this.listeners = new Set();
        this.started = false;
        this.epoch = 0;
        this.queue = Promise.resolve();
        this.startPromise = null;
    }

    isStarted() {
        return this.started;
    }

    getSnapshot() {
        return this.snapshot;
    }

    subscribe(listener, { emitCurrent = false } = {}) {
        if (typeof listener !== 'function') throw new TypeError('listener must be a function');
        if (typeof emitCurrent !== 'boolean') throw new TypeError('emitCurrent must be a boolean');
        this.listeners.add(listener);
        if (emitCurrent && this.snapshot) this._notify(listener, this.snapshot, null);
        return () => this.listeners.delete(listener);
    }

    start() {
        if (this.started) return this.startPromise || Promise.resolve(this.snapshot);
        this.started = true;
        const epoch = ++this.epoch;
        const operation = this._enqueue(epoch);
        this.startPromise = operation;
        const clear = () => {
            if (this.startPromise === operation) this.startPromise = null;
        };
        operation.then(clear, clear);
        return operation;
    }

    refresh() {
        if (!this.started) return Promise.reject(new Error('Capability health service is not started'));
        return this._enqueue(this.epoch);
    }

    stop() {
        if (!this.started) return false;
        this.started = false;
        this.epoch += 1;
        this.startPromise = null;
        return true;
    }

    _enqueue(epoch) {
        const operation = this.queue.then(() => this._refresh(epoch));
        this.queue = operation.catch(() => undefined);
        return operation;
    }

    async _refresh(epoch) {
        const capture = await this.bridge.capture();
        if (!this.started || epoch !== this.epoch) return null;
        this.activeCapture = capture;
        let snapshot;
        try {
            snapshot = await this.monitor.refresh();
        } finally {
            this.activeCapture = null;
        }
        if (!this.started || epoch !== this.epoch) return null;
        const previous = this.snapshot;
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

    _notify(listener, snapshot, previous) {
        const event = deepFreeze({
            snapshot,
            previous,
            diff: diffCapabilitySnapshots(previous, snapshot)
        });
        try { listener(event); } catch { /* observers are isolated */ }
    }
}

export function createGeminiCapabilityHealthService(options) {
    return new GeminiCapabilityHealthService(options);
}
