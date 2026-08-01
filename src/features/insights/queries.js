import { aggregateInsights } from './aggregation.js';
import {
    DEFAULT_MAX_INSIGHTS_EVENTS,
    INSIGHTS_SEMANTICS,
    NATIVE_USAGE_LIMITS_LINK,
    assertDayKey,
    clone,
    deepFreeze
} from './event_model.js';

const TREND_METRICS = new Set(['messages', 'chats', 'modelSelections', 'toolUses']);

function assertPositiveInteger(value, label) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`);
    return value;
}

function assertMetric(metric) {
    if (!TREND_METRICS.has(metric)) throw new TypeError(`Unsupported insights metric: ${metric}`);
    return metric;
}

function shiftDay(dayKey, offset) {
    assertDayKey(dayKey);
    const date = new Date(`${dayKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}

export function getInsightsDailySeries(state, {
    todayKey,
    days = 7,
    maxEvents = DEFAULT_MAX_INSIGHTS_EVENTS
} = {}) {
    assertDayKey(todayKey, 'todayKey');
    assertPositiveInteger(days, 'days');
    const summary = aggregateInsights(state, { maxEvents });
    const counts = new Map(summary.days.map(day => [day.dayKey, day.messages]));
    return deepFreeze(Array.from({ length: days }, (_, index) => {
        const dayKey = shiftDay(todayKey, index - (days - 1));
        const [, month, day] = dayKey.split('-');
        return {
            date: dayKey,
            label: `${Number(month)}/${Number(day)}`,
            messages: counts.get(dayKey) || 0
        };
    }));
}

export function createEstimatedUsageView({ messages, weighted, localTarget, window = null }) {
    for (const [label, value] of Object.entries({ messages, weighted, localTarget })) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            throw new TypeError(`${label} must be a non-negative finite number`);
        }
    }
    return deepFreeze({
        messages,
        weighted,
        localTarget,
        window: window == null ? null : clone(window),
        semantics: INSIGHTS_SEMANTICS,
        nativeUsageLimits: NATIVE_USAGE_LIMITS_LINK,
        label: 'Local estimate · not Gemini server quota'
    });
}

function sumMetricByDay(summary, metric, fromDay, toDay) {
    return summary.days
        .filter(day => day.dayKey >= fromDay && day.dayKey <= toDay)
        .reduce((sum, day) => sum + day[metric], 0);
}

export function calculateInsightsTrend(state, {
    todayKey,
    days = 7,
    metric = 'messages',
    maxEvents = DEFAULT_MAX_INSIGHTS_EVENTS
} = {}) {
    assertDayKey(todayKey, 'todayKey');
    assertPositiveInteger(days, 'days');
    assertMetric(metric);
    const summary = aggregateInsights(state, { maxEvents });
    const currentFrom = shiftDay(todayKey, -(days - 1));
    const previousTo = shiftDay(currentFrom, -1);
    const previousFrom = shiftDay(previousTo, -(days - 1));
    const current = sumMetricByDay(summary, metric, currentFrom, todayKey);
    const previous = sumMetricByDay(summary, metric, previousFrom, previousTo);
    const delta = current - previous;
    return deepFreeze({
        metric,
        days,
        currentWindow: { fromDay: currentFrom, toDay: todayKey },
        previousWindow: { fromDay: previousFrom, toDay: previousTo },
        current,
        previous,
        delta,
        percentChange: previous === 0 ? null : (delta / previous) * 100,
        direction: delta === 0 ? 'flat' : (delta > 0 ? 'up' : 'down'),
        semantics: INSIGHTS_SEMANTICS
    });
}

export function calculateInsightsStreak(state, {
    todayKey,
    metric = 'messages',
    maxEvents = DEFAULT_MAX_INSIGHTS_EVENTS
} = {}) {
    assertDayKey(todayKey, 'todayKey');
    assertMetric(metric);
    const summary = aggregateInsights(state, { maxEvents });
    const counts = new Map(summary.days.map(day => [day.dayKey, day[metric]]));
    const activeDays = [...counts.entries()]
        .filter(([, count]) => count > 0)
        .map(([day]) => day)
        .sort();
    let best = 0;
    let run = 0;
    let previous = null;
    for (const day of activeDays) {
        run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
        best = Math.max(best, run);
        previous = day;
    }
    let cursor = counts.get(todayKey) > 0 ? todayKey : shiftDay(todayKey, -1);
    let current = 0;
    while ((counts.get(cursor) || 0) > 0) {
        current += 1;
        cursor = shiftDay(cursor, -1);
    }
    return deepFreeze({ metric, current, best, semantics: INSIGHTS_SEMANTICS });
}
