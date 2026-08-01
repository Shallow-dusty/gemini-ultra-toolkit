import { INSIGHTS_SEMANTICS, NATIVE_USAGE_LIMITS_LINK } from './event_model.js';
import { aggregateInsights } from './aggregation.js';

export const DEFAULT_MODEL_COUNTS = Object.freeze({ flash: 0, thinking: 0, pro: 0 });

export function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function emptyPublicState() {
    return {
        total: 0,
        totalChatsCreated: 0,
        chats: {},
        dailyCounts: {},
        viewMode: 'today',
        isExpanded: false,
        resetStep: 0,
        usageSemantics: INSIGHTS_SEMANTICS,
        nativeUsageLimits: NATIVE_USAGE_LIMITS_LINK
    };
}

export function nonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function normalizeChats(value) {
    if (!isRecord(value)) return {};
    const result = {};
    for (const [id, count] of Object.entries(value)) {
        if (id && Number.isInteger(count) && count >= 0) result[id] = count;
    }
    return result;
}

export function normalizeDailyCounts(value) {
    if (!isRecord(value)) return {};
    const result = {};
    for (const [day, entry] of Object.entries(value)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isRecord(entry)) continue;
        const byModel = isRecord(entry.byModel) ? entry.byModel : {};
        result[day] = {
            messages: nonNegativeInteger(entry.messages),
            chats: nonNegativeInteger(entry.chats),
            byModel: {
                ...DEFAULT_MODEL_COUNTS,
                ...Object.fromEntries(Object.entries(byModel)
                    .filter(([key, count]) => key && Number.isInteger(count) && count >= 0))
            }
        };
    }
    return result;
}

export function projectLegacyCounterState(state) {
    const summary = aggregateInsights(state);
    const dailyCounts = {};
    for (const day of summary.days) {
        dailyCounts[day.dayKey] = {
            messages: day.messages,
            chats: day.chats,
            byModel: { ...DEFAULT_MODEL_COUNTS, ...day.byModel }
        };
    }
    return {
        total: summary.totals.messages,
        totalChatsCreated: summary.totals.chats,
        dailyCounts
    };
}

export function normalizeCompatibilityState(raw, projected) {
    const source = isRecord(raw) ? raw : {};
    const sourceDailyCounts = normalizeDailyCounts(source.dailyCounts);
    const useProjectedDays = Object.keys(sourceDailyCounts).length === 0
        && Object.keys(projected.dailyCounts).length > 0;
    return {
        total: Number.isInteger(source.total) && source.total >= 0 ? source.total : projected.total,
        totalChatsCreated: Number.isInteger(source.totalChatsCreated) && source.totalChatsCreated >= 0
            ? source.totalChatsCreated
            : projected.totalChatsCreated,
        chats: normalizeChats(source.chats),
        dailyCounts: useProjectedDays ? clone(projected.dailyCounts) : sourceDailyCounts
    };
}

export function nextInsightsSequence(state) {
    let next = state.events.length;
    for (const event of state.events) {
        const match = /^evt-[0-9a-z]+-([0-9a-z]+)$/i.exec(event.id);
        if (!match) continue;
        const sequence = Number.parseInt(match[1], 36);
        if (Number.isSafeInteger(sequence)) next = Math.max(next, sequence + 1);
    }
    return next;
}

export function legacyCounterStorageKey(identity) {
    return typeof identity === 'string' && identity.includes('@') ? `gemini_store_${identity}` : null;
}
