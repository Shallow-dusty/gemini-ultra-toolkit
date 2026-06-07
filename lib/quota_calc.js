/**
 * Quota calculation utilities for Primer++ for Gemini
 * Extracted for testability — source of truth for weighted quota logic
 */

const { MODEL_CONFIG } = require('./model_config.js');
const { getDayKey, parseLocalDate } = require('./date_utils.js');

/**
 * Calculate weighted quota usage from byModel counts
 * @param {Object} byModel - { flash: number, thinking: number, pro: number }
 * @param {Object} [config] - model config with multipliers (defaults to MODEL_CONFIG)
 * @returns {number} weighted quota value
 */
function getWeightedQuota(byModel, config = MODEL_CONFIG) {
    if (!byModel || typeof byModel !== 'object') return 0;
    return Object.keys(byModel).reduce((sum, key) => {
        const mult = config[key]?.multiplier ?? 1;
        return sum + ((byModel[key] || 0) * mult);
    }, 0);
}

/**
 * Ensure a daily entry has the byModel field (backward compat)
 * @param {Object} entry - daily count entry { messages, chats, byModel? }
 * @returns {Object} entry with byModel guaranteed
 */
function ensureByModel(entry) {
    if (!entry) return { messages: 0, chats: 0, byModel: { flash: 0, thinking: 0, pro: 0 } };
    if (!entry.byModel) {
        entry.byModel = { flash: 0, thinking: 0, pro: 0 };
    }
    return entry;
}

/**
 * Format quota label string
 * @param {number} rawCount - total raw message count
 * @param {number} weighted - weighted quota value
 * @param {number} limit - daily quota limit
 * @returns {string} formatted label
 */
function formatQuotaLabel(rawCount, weighted, limit) {
    const weightedStr = weighted % 1 === 0 ? String(weighted) : weighted.toFixed(1);
    return `${rawCount} msgs (${weightedStr} weighted) / ${limit}`;
}

/**
 * Calculate quota bar percentage and color
 * @param {number} weighted - weighted quota value
 * @param {number} limit - daily quota limit
 * @returns {{ pct: number, color: string }}
 */
function getQuotaBarState(weighted, limit) {
    const pct = limit > 0 ? Math.min((weighted / limit) * 100, 100) : 0;
    let color;
    if (pct < 60) color = '#34a853';
    else if (pct < 85) color = '#fbbc04';
    else color = '#ea4335';
    return { pct, color };
}

function normalizeResetHour(value) {
    const hour = Number(value);
    if (!Number.isFinite(hour)) return 0;
    return Math.max(0, Math.min(23, Math.floor(hour)));
}

function formatResetHour(hour) {
    return `${String(normalizeResetHour(hour)).padStart(2, '0')}:00`;
}

function formatQuotaWindowRemaining(minutes) {
    const total = Math.max(0, Math.ceil(Number(minutes) || 0));
    if (total === 0) return 'now';
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return `${hours}h ${mins}m`;
    if (hours) return `${hours}h`;
    return `${mins}m`;
}

function getQuotaWindowState(resetHour = 0, now) {
    const hour = normalizeResetHour(resetHour);
    let ref = now instanceof Date ? new Date(now.getTime()) : new Date(now || Date.now());
    if (Number.isNaN(ref.getTime())) ref = new Date();

    const dayKey = getDayKey(hour, ref);
    const windowStart = parseLocalDate(dayKey);
    windowStart.setHours(hour, 0, 0, 0);

    const windowEnd = new Date(windowStart.getTime());
    windowEnd.setDate(windowEnd.getDate() + 1);

    const remainingMinutes = Math.max(0, Math.ceil((windowEnd.getTime() - ref.getTime()) / 60000));
    const resetLabel = formatResetHour(hour);
    return {
        resetHour: hour,
        dayKey,
        windowStart,
        windowEnd,
        resetLabel,
        windowLabel: `${resetLabel}-${resetLabel}`,
        remainingMinutes,
        remainingLabel: formatQuotaWindowRemaining(remainingMinutes)
    };
}

module.exports = {
    getWeightedQuota,
    ensureByModel,
    formatQuotaLabel,
    getQuotaBarState,
    normalizeResetHour,
    formatResetHour,
    formatQuotaWindowRemaining,
    getQuotaWindowState
};
