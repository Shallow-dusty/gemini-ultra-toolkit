import { CAPABILITY_STATUS, isRecord } from './contract.js';

const REASON_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const PROBE_STATUSES = new Set([
    CAPABILITY_STATUS.AVAILABLE,
    CAPABILITY_STATUS.DEGRADED,
    CAPABILITY_STATUS.FAILED
]);

function normalizeReasonCode(value) {
    return typeof value === 'string' && REASON_CODE_PATTERN.test(value) ? value : null;
}

export function normalizeNativeFact(raw) {
    if (typeof raw === 'boolean') {
        return Object.freeze({ available: raw, owned: raw, version: null, reasonCode: null });
    }
    if (!isRecord(raw)) {
        return Object.freeze({ available: false, owned: false, version: null, reasonCode: null });
    }
    const available = Boolean(raw.available ?? raw.owned);
    const owned = Boolean(raw.owned ?? available);
    return Object.freeze({
        available,
        owned,
        version: typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : null,
        reasonCode: normalizeReasonCode(raw.reasonCode)
    });
}

function normalizeFeatureProbeFact(raw) {
    if (!isRecord(raw)) return null;
    let status = raw.status;
    if (!PROBE_STATUSES.has(status)) {
        if (raw.failed === true || raw.available === false) status = CAPABILITY_STATUS.FAILED;
        else if (raw.degraded === true) status = CAPABILITY_STATUS.DEGRADED;
        else if (raw.available === true) status = CAPABILITY_STATUS.AVAILABLE;
        else return null;
    }
    return Object.freeze({ status, reasonCode: normalizeReasonCode(raw.reasonCode) });
}

function extractSelectorFacts(report) {
    const facts = new Map();
    let provided = false;
    if (!isRecord(report)) return { provided, facts };
    if (Array.isArray(report.checks)) {
        provided = true;
        for (const check of report.checks) {
            if (!isRecord(check) || typeof check.id !== 'string' || typeof check.ok !== 'boolean') continue;
            const id = check.id.trim();
            if (id) facts.set(id, check.ok);
        }
    }
    if (isRecord(report.selectors)) {
        provided = true;
        for (const [id, ok] of Object.entries(report.selectors)) {
            if (id.trim() && typeof ok === 'boolean') facts.set(id.trim(), ok);
        }
    }
    return { provided, facts };
}

function mergeSelectorFacts(target, source) {
    for (const [id, ok] of source) target.set(id, ok);
}

export function selectObjectEntry(source, key) {
    if (source instanceof Map) return source.get(key);
    if (isRecord(source) && Object.hasOwn(source, key)) return source[key];
    return undefined;
}

export async function readNativeFacts(source, features) {
    if (typeof source !== 'function') return { failed: false, value: source };
    try {
        const value = await source(Object.freeze({
            featureIds: Object.freeze(features.map(feature => feature.id)),
            nativeCapabilityIds: Object.freeze(features
                .map(feature => feature.nativeCapability)
                .filter(Boolean)
                .filter((id, index, values) => values.indexOf(id) === index)
                .sort())
        }));
        return { failed: false, value: isRecord(value) || value instanceof Map ? value : {} };
    } catch {
        return { failed: true, value: {} };
    }
}

export async function collectEvidence({ adapter, probe, features, selectorIds, adapterVersion }) {
    const selectorFacts = new Map();
    const featureFacts = new Map();
    let selectorSourceAttempted = false;
    let selectorSourceSucceeded = false;
    let featureProbeFailed = false;
    let reportedAdapterVersion = adapterVersion;

    if (adapter && typeof adapter.getSelectorHealthReport === 'function') {
        selectorSourceAttempted = true;
        try {
            const extracted = extractSelectorFacts(await adapter.getSelectorHealthReport());
            selectorSourceSucceeded = true;
            mergeSelectorFacts(selectorFacts, extracted.facts);
        } catch {
            // Structural evidence is optional; a probe may still provide it.
        }
    }

    if (probe) {
        try {
            const report = await probe(Object.freeze({
                featureIds: Object.freeze(features.map(feature => feature.id)),
                selectorIds: Object.freeze([...selectorIds])
            }));
            if (!isRecord(report)) throw new TypeError('probe result must be an object');
            if (Object.hasOwn(report, 'selectorHealth')) {
                selectorSourceAttempted = true;
                const extracted = extractSelectorFacts(report.selectorHealth);
                selectorSourceSucceeded = selectorSourceSucceeded || extracted.provided;
                mergeSelectorFacts(selectorFacts, extracted.facts);
            }
            const rawFeatures = report.features;
            if (isRecord(rawFeatures) || rawFeatures instanceof Map) {
                for (const feature of features) {
                    const fact = normalizeFeatureProbeFact(selectObjectEntry(rawFeatures, feature.id));
                    if (fact) featureFacts.set(feature.id, fact);
                }
            }
            if (typeof report.adapterVersion === 'string' && report.adapterVersion.trim()) {
                reportedAdapterVersion = report.adapterVersion.trim();
            }
        } catch {
            featureProbeFailed = true;
        }
    }

    return {
        selectorFacts,
        featureFacts,
        featureProbeFailed,
        selectorProbeFailed: selectorIds.length > 0 && (!selectorSourceAttempted || !selectorSourceSucceeded),
        adapterVersion: reportedAdapterVersion
    };
}
