import { CAPABILITY_ACTION, CAPABILITY_STATUS } from './contract.js';

export function buildSelectorHealth(feature, selectorFacts) {
    const requiredSet = new Set(feature.selectors.required);
    const ids = [...feature.selectors.required, ...feature.selectors.optional]
        .sort((left, right) => left.localeCompare(right));
    const checks = ids.map(id => Object.freeze({
        id,
        required: requiredSet.has(id),
        ok: selectorFacts.get(id) === true
    }));
    const failedRequired = checks.filter(check => check.required && !check.ok).map(check => check.id);
    const failedOptional = checks.filter(check => !check.required && !check.ok).map(check => check.id);
    return Object.freeze({
        passed: checks.filter(check => check.ok).length,
        total: checks.length,
        failedRequired: Object.freeze(failedRequired),
        failedOptional: Object.freeze(failedOptional),
        checks: Object.freeze(checks)
    });
}

function actionForStatus(status) {
    switch (status) {
        case CAPABILITY_STATUS.AVAILABLE: return CAPABILITY_ACTION.RUN;
        case CAPABILITY_STATUS.DEGRADED: return CAPABILITY_ACTION.RUN_DEGRADED;
        case CAPABILITY_STATUS.NATIVE_OWNED: return CAPABILITY_ACTION.DELEGATE_NATIVE;
        case CAPABILITY_STATUS.DISABLED: return CAPABILITY_ACTION.SKIP;
        default: return CAPABILITY_ACTION.DISABLE;
    }
}

function makeResolution(status, code, extra = {}) {
    return {
        status,
        action: actionForStatus(status),
        reason: Object.freeze({ code, ...extra })
    };
}

export function resolveFeature(feature, context) {
    const {
        enabled,
        enablementFailed,
        featureProbeFailed,
        selectorProbeFailed,
        nativeFactsFailed,
        featureFact,
        nativeFact,
        selectorHealth
    } = context;
    const policy = feature.degradationPolicy;

    if (enablementFailed) return makeResolution(CAPABILITY_STATUS.FAILED, 'ENABLEMENT_CHECK_FAILED');
    if (!enabled) return makeResolution(CAPABILITY_STATUS.DISABLED, 'DISABLED_BY_CONFIGURATION');
    if (feature.nativePolicy === 'prefer-native' && nativeFact?.available && nativeFact.owned) {
        return makeResolution(CAPABILITY_STATUS.NATIVE_OWNED, 'NATIVE_CAPABILITY_AVAILABLE', {
            nativeCapability: feature.nativeCapability
        });
    }
    if (featureProbeFailed) return makeResolution(policy.onProbeFailure, 'FEATURE_PROBE_UNAVAILABLE');
    if (featureFact?.status === CAPABILITY_STATUS.FAILED) {
        return makeResolution(CAPABILITY_STATUS.FAILED, 'FEATURE_PROBE_FAILED', {
            ...(featureFact.reasonCode ? { sourceCode: featureFact.reasonCode } : {})
        });
    }
    if (feature.selectors.required.length > 0 && selectorProbeFailed) {
        return makeResolution(policy.onSelectorProbeFailure, 'SELECTOR_PROBE_UNAVAILABLE');
    }
    if (selectorHealth.failedRequired.length > 0) {
        return makeResolution(policy.onMissingRequired, 'REQUIRED_SELECTOR_MISSING', {
            selectors: Object.freeze([...selectorHealth.failedRequired])
        });
    }
    if (feature.nativeCapability && feature.nativePolicy !== 'ignore' && nativeFactsFailed) {
        return makeResolution(policy.onNativeFactsFailure, 'NATIVE_FACTS_UNAVAILABLE');
    }
    if (featureFact?.status === CAPABILITY_STATUS.DEGRADED) {
        return makeResolution(CAPABILITY_STATUS.DEGRADED, 'FEATURE_PROBE_DEGRADED', {
            ...(featureFact.reasonCode ? { sourceCode: featureFact.reasonCode } : {})
        });
    }
    if (selectorHealth.failedOptional.length > 0) {
        const status = policy.onMissingOptional;
        return makeResolution(status, status === CAPABILITY_STATUS.AVAILABLE
            ? 'OPTIONAL_SELECTOR_GAP_ACCEPTED'
            : 'OPTIONAL_SELECTOR_MISSING', {
            selectors: Object.freeze([...selectorHealth.failedOptional])
        });
    }
    return makeResolution(CAPABILITY_STATUS.AVAILABLE, 'HEALTHY');
}
