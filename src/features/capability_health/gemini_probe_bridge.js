import { CAPABILITY_STATUS, deepFreeze, isRecord } from './contract.js';

const ADAPTER_STATUSES = new Set(['available', 'degraded', 'unavailable']);
const NATIVE_QUALITIES = new Set(['available', 'degraded']);

function normalizeAdapterRecords(value) {
    const records = {};
    if (!Array.isArray(value)) return records;
    for (const record of value) {
        if (!isRecord(record) || typeof record.id !== 'string' || !ADAPTER_STATUSES.has(record.status)) continue;
        const id = record.id.trim();
        if (id) records[id] = record.status;
    }
    return records;
}

function normalizeNativeRecords(value) {
    const records = {};
    if (!Array.isArray(value)) return records;
    for (const record of value) {
        if (!isRecord(record) || typeof record.id !== 'string') continue;
        const owned = record.status === CAPABILITY_STATUS.NATIVE_OWNED && NATIVE_QUALITIES.has(record.quality);
        const unavailable = record.status === 'unavailable' && record.quality === 'unavailable';
        const id = record.id.trim();
        if (id && (owned || unavailable)) records[id] = { status: record.status, quality: record.quality };
    }
    return records;
}

function adapterVersionOf(report) {
    if (typeof report.adapterVersion === 'string' && report.adapterVersion.trim()) {
        return report.adapterVersion.trim();
    }
    return null;
}

function featureFact(feature, adapterCapabilities) {
    const direct = adapterCapabilities[feature.id];
    const dependencyStatuses = [...feature.selectors.required, ...feature.selectors.optional]
        .map(id => adapterCapabilities[id])
        .filter(Boolean);
    if (direct === 'unavailable') {
        return { status: CAPABILITY_STATUS.FAILED, reasonCode: 'GEMINI_SURFACE_UNAVAILABLE' };
    }
    if (direct === 'degraded' || dependencyStatuses.includes('degraded')) {
        return { status: CAPABILITY_STATUS.DEGRADED, reasonCode: 'GEMINI_SURFACE_DEGRADED' };
    }
    if (direct === 'available') {
        return { status: CAPABILITY_STATUS.AVAILABLE, reasonCode: 'GEMINI_SURFACE_AVAILABLE' };
    }
    return null;
}

function nativeFact(record) {
    const available = record.status === CAPABILITY_STATUS.NATIVE_OWNED;
    return {
        available,
        owned: available,
        reasonCode: available
            ? (record.quality === 'available' ? 'GEMINI_NATIVE_AVAILABLE' : 'GEMINI_NATIVE_DEGRADED')
            : 'GEMINI_NATIVE_UNAVAILABLE'
    };
}

export class GeminiCapabilityProbeBridge {
    constructor({ getCapabilityProbeReport, features } = {}) {
        if (typeof getCapabilityProbeReport !== 'function') {
            throw new TypeError('getCapabilityProbeReport must be a function');
        }
        if (!Array.isArray(features)) throw new TypeError('features must be an array');
        this.getCapabilityProbeReport = getCapabilityProbeReport;
        this.features = new Map(features.map(feature => [feature.id, feature]));
    }

    async capture() {
        try {
            const report = await this.getCapabilityProbeReport();
            if (!isRecord(report)) throw new TypeError('capability probe report must be an object');
            return deepFreeze({
                ok: true,
                adapterVersion: adapterVersionOf(report),
                adapterCapabilities: normalizeAdapterRecords(report.adapterCapabilities),
                nativeCapabilities: normalizeNativeRecords(report.nativeCapabilities)
            });
        } catch {
            return deepFreeze({ ok: false });
        }
    }

    toFeatureProbe(capture, request) {
        if (!capture?.ok) throw new Error('Gemini capability probe is unavailable');
        const selectors = {};
        for (const id of request.selectorIds) {
            const status = capture.adapterCapabilities[id];
            if (status) selectors[id] = status !== 'unavailable';
        }
        const features = {};
        for (const id of request.featureIds) {
            const descriptor = this.features.get(id);
            const fact = descriptor ? featureFact(descriptor, capture.adapterCapabilities) : null;
            if (fact) features[id] = fact;
        }
        return {
            ...(capture.adapterVersion ? { adapterVersion: capture.adapterVersion } : {}),
            selectorHealth: { selectors },
            features
        };
    }

    toNativeFacts(capture, request) {
        if (!capture?.ok) throw new Error('Gemini capability probe is unavailable');
        const facts = {};
        for (const id of request.nativeCapabilityIds) {
            const record = capture.nativeCapabilities[id];
            if (record) facts[id] = nativeFact(record);
        }
        return facts;
    }
}

export function createGeminiCapabilityProbeBridge(options) {
    return new GeminiCapabilityProbeBridge(options);
}
