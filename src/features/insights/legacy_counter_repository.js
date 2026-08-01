import {
    INSIGHTS_SEMANTICS,
    NATIVE_USAGE_LIMITS_LINK,
    createInsightsState,
    loadInsightsState
} from './event_model.js';
import { migrateLegacyCounterState } from './legacy_migration.js';
import {
    clone,
    legacyCounterStorageKey,
    normalizeCompatibilityState,
    projectLegacyCounterState
} from './legacy_counter_state.js';

export function hydrateLegacyCounterRecord({ identity, raw, todayKey, maxEvents, logger }) {
    let insights;
    let blockedError = null;
    try {
        insights = raw?.insights
            ? loadInsightsState(raw.insights, { maxEvents })
            : migrateLegacyCounterState(raw, { todayKey, sessionIdentity: identity, maxEvents });
    } catch (error) {
        blockedError = error;
        insights = createInsightsState([], { maxEvents });
        logger?.warn?.('Counter storage was not overwritten after an invalid load', {
            code: error?.code || error?.name || 'UNKNOWN'
        });
    }
    return {
        identity,
        insights,
        compatibility: normalizeCompatibilityState(raw, projectLegacyCounterState(insights)),
        blockedError
    };
}

export async function persistLegacyCounterRecord({ record, storage, tempUser }) {
    if (record.blockedError) throw record.blockedError;
    const key = legacyCounterStorageKey(record.identity);
    if (!key || record.identity === tempUser) return false;
    await storage.set(key, {
        ...clone(record.compatibility),
        insights: clone(record.insights),
        usageSemantics: INSIGHTS_SEMANTICS,
        nativeUsageLimits: NATIVE_USAGE_LIMITS_LINK
    });
    return true;
}

export async function commitLegacyCounterEvents({ record, events, maxEvents, persist }) {
    if (!record) throw new Error('Counter session record is unavailable');
    if (record.blockedError) throw record.blockedError;
    const nextInsights = createInsightsState([...record.insights.events, ...events], { maxEvents });
    await persist({ ...record, insights: nextInsights });
    record.insights = nextInsights;
    return nextInsights;
}
