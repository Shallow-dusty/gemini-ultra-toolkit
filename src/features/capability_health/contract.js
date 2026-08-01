const FEATURE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const NATIVE_POLICIES = new Set(['prefer-native', 'augment', 'ignore']);

export const CAPABILITY_STATUS = Object.freeze({
    AVAILABLE: 'available',
    DEGRADED: 'degraded',
    NATIVE_OWNED: 'native-owned',
    DISABLED: 'disabled',
    FAILED: 'failed'
});

export const CAPABILITY_ACTION = Object.freeze({
    RUN: 'run',
    RUN_DEGRADED: 'run-degraded',
    DELEGATE_NATIVE: 'delegate-native',
    SKIP: 'skip',
    DISABLE: 'disable'
});

export const DEFAULT_DEGRADATION_POLICY = Object.freeze({
    onMissingRequired: CAPABILITY_STATUS.FAILED,
    onMissingOptional: CAPABILITY_STATUS.DEGRADED,
    onProbeFailure: CAPABILITY_STATUS.FAILED,
    onSelectorProbeFailure: CAPABILITY_STATUS.FAILED,
    onNativeFactsFailure: CAPABILITY_STATUS.DEGRADED
});

const POLICY_VALUES = Object.freeze({
    onMissingRequired: new Set([CAPABILITY_STATUS.FAILED, CAPABILITY_STATUS.DEGRADED]),
    onMissingOptional: new Set([CAPABILITY_STATUS.DEGRADED, CAPABILITY_STATUS.AVAILABLE]),
    onProbeFailure: new Set([CAPABILITY_STATUS.FAILED, CAPABILITY_STATUS.DEGRADED]),
    onSelectorProbeFailure: new Set([CAPABILITY_STATUS.FAILED, CAPABILITY_STATUS.DEGRADED]),
    onNativeFactsFailure: new Set([CAPABILITY_STATUS.DEGRADED, CAPABILITY_STATUS.AVAILABLE])
});

export function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
    return value;
}

export function assertNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value.trim();
}

function normalizeStringList(value, label) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    const normalized = value.map((item, index) => assertNonEmptyString(item, `${label}[${index}]`));
    if (new Set(normalized).size !== normalized.length) {
        throw new TypeError(`${label} must not contain duplicates`);
    }
    return normalized.sort((left, right) => left.localeCompare(right));
}

export function normalizePolicy(base, overrides, label = 'degradationPolicy') {
    if (overrides != null && !isRecord(overrides)) {
        throw new TypeError(`${label} must be an object`);
    }
    const result = { ...base };
    for (const [key, value] of Object.entries(overrides || {})) {
        if (!Object.hasOwn(POLICY_VALUES, key)) throw new TypeError(`Unknown ${label} option: ${key}`);
        if (!POLICY_VALUES[key].has(value)) throw new TypeError(`${label}.${key} has an unsupported status`);
        result[key] = value;
    }
    return Object.freeze(result);
}

function normalizeFeature(feature, defaultPolicy) {
    if (!isRecord(feature)) throw new TypeError('Each feature must be an object');
    const id = assertNonEmptyString(feature.id, 'feature.id');
    if (!FEATURE_ID_PATTERN.test(id)) throw new TypeError(`Invalid feature id: ${id}`);
    const version = feature.version == null ? '0' : assertNonEmptyString(feature.version, `${id}.version`);
    if (feature.enabled != null && typeof feature.enabled !== 'boolean' && typeof feature.enabled !== 'function') {
        throw new TypeError(`${id}.enabled must be a boolean or function`);
    }
    const required = normalizeStringList(feature.selectors?.required, `${id}.selectors.required`);
    const optional = normalizeStringList(feature.selectors?.optional, `${id}.selectors.optional`);
    const overlap = required.find(selector => optional.includes(selector));
    if (overlap) throw new TypeError(`${id} selector ${overlap} cannot be both required and optional`);
    const nativeCapability = feature.nativeCapability == null
        ? null
        : assertNonEmptyString(feature.nativeCapability, `${id}.nativeCapability`);
    const nativePolicy = feature.nativePolicy || (nativeCapability ? 'prefer-native' : 'ignore');
    if (!NATIVE_POLICIES.has(nativePolicy)) throw new TypeError(`${id}.nativePolicy is unsupported`);
    if (!nativeCapability && nativePolicy !== 'ignore') {
        throw new TypeError(`${id}.nativePolicy requires nativeCapability`);
    }
    return Object.freeze({
        id,
        version,
        enabled: feature.enabled ?? true,
        selectors: Object.freeze({ required: Object.freeze(required), optional: Object.freeze(optional) }),
        nativeCapability,
        nativePolicy,
        degradationPolicy: normalizePolicy(defaultPolicy, feature.degradationPolicy, `${id}.degradationPolicy`)
    });
}

export function normalizeFeatures(features, defaultPolicy) {
    if (!Array.isArray(features)) throw new TypeError('features must be an array');
    const normalized = features.map(feature => normalizeFeature(feature, defaultPolicy));
    const ids = normalized.map(feature => feature.id);
    if (new Set(ids).size !== ids.length) throw new TypeError('Feature ids must be unique');
    return Object.freeze(normalized.sort((left, right) => left.id.localeCompare(right.id)));
}
