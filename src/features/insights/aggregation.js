import {
    INSIGHTS_EVENT_KIND,
    INSIGHTS_SEMANTICS,
    NATIVE_USAGE_LIMITS_LINK,
    assertDayKey,
    deepFreeze,
    loadInsightsState
} from './event_model.js';

function createEmptyBucket(dayKey) {
    return {
        dayKey,
        messages: 0,
        chats: 0,
        modelSelections: 0,
        toolUses: 0,
        byModel: {},
        modelSelectionsByModel: {},
        byTool: {}
    };
}

function incrementMap(target, key, count) {
    const normalized = key || 'unknown';
    target[normalized] = (target[normalized] || 0) + count;
}

function addEventToBucket(bucket, event) {
    if (event.kind === INSIGHTS_EVENT_KIND.MESSAGE) {
        bucket.messages += event.count;
        incrementMap(bucket.byModel, event.model, event.count);
    } else if (event.kind === INSIGHTS_EVENT_KIND.CHAT) {
        bucket.chats += event.count;
    } else if (event.kind === INSIGHTS_EVENT_KIND.MODEL) {
        bucket.modelSelections += event.count;
        incrementMap(bucket.modelSelectionsByModel, event.model, event.count);
    } else {
        bucket.toolUses += event.count;
        incrementMap(bucket.byTool, event.tool, event.count);
    }
}

function normalizeTimestamp(value, label) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError(`${label} must be a valid timestamp`);
    return date.toISOString();
}

function normalizeWindow(options) {
    const from = options.from == null ? null : normalizeTimestamp(options.from, 'from');
    const to = options.to == null ? null : normalizeTimestamp(options.to, 'to');
    const fromDay = options.fromDay == null ? null : assertDayKey(options.fromDay, 'fromDay');
    const toDay = options.toDay == null ? null : assertDayKey(options.toDay, 'toDay');
    if (from && to && from >= to) throw new TypeError('from must be earlier than to');
    if (fromDay && toDay && fromDay > toDay) throw new TypeError('fromDay must not be after toDay');
    return { from, to, fromDay, toDay };
}

function eventInWindow(event, window) {
    if (window.from && event.occurredAt < window.from) return false;
    if (window.to && event.occurredAt >= window.to) return false;
    if (window.fromDay && event.dayKey < window.fromDay) return false;
    if (window.toDay && event.dayKey > window.toDay) return false;
    return true;
}

function sortMapObject(value) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function finalizeBucket(bucket) {
    return deepFreeze({
        ...bucket,
        byModel: sortMapObject(bucket.byModel),
        modelSelectionsByModel: sortMapObject(bucket.modelSelectionsByModel),
        byTool: sortMapObject(bucket.byTool)
    });
}

export function aggregateInsights(state, options = {}) {
    const current = loadInsightsState(state, options);
    const window = normalizeWindow(options);
    const totals = createEmptyBucket(null);
    const days = new Map();
    for (const event of current.events) {
        if (!eventInWindow(event, window)) continue;
        const day = days.get(event.dayKey) || createEmptyBucket(event.dayKey);
        addEventToBucket(day, event);
        addEventToBucket(totals, event);
        days.set(event.dayKey, day);
    }
    return deepFreeze({
        semantics: INSIGHTS_SEMANTICS,
        nativeUsageLimits: NATIVE_USAGE_LIMITS_LINK,
        window,
        totals: finalizeBucket(totals),
        days: Object.freeze([...days.values()]
            .sort((left, right) => left.dayKey.localeCompare(right.dayKey))
            .map(finalizeBucket))
    });
}

export function projectInsightsToCounterState(state, { maxEvents } = {}) {
    const options = maxEvents === undefined ? {} : { maxEvents };
    const summary = aggregateInsights(state, options);
    const dailyCounts = {};
    for (const day of summary.days) {
        dailyCounts[day.dayKey] = {
            messages: day.messages,
            chats: day.chats,
            byModel: { flash: 0, thinking: 0, pro: 0, ...day.byModel }
        };
    }
    return {
        total: summary.totals.messages,
        totalChatsCreated: summary.totals.chats,
        dailyCounts,
        usageSemantics: INSIGHTS_SEMANTICS,
        nativeUsageLimits: NATIVE_USAGE_LIMITS_LINK
    };
}
