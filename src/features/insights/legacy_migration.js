import {
    CorruptInsightsStateError,
    DEFAULT_MAX_INSIGHTS_EVENTS,
    FutureInsightsSchemaError,
    INSIGHTS_EVENT_KIND,
    INSIGHTS_FORMAT,
    INSIGHTS_SCHEMA_VERSION,
    InsightsLimitError,
    MAX_INSIGHTS_EVENT_COUNT,
    assertDayKey,
    createInsightsState,
    isRecord,
    loadInsightsState,
    normalizeDimension,
    normalizeEvent,
    normalizeIdentity,
    normalizeLimit
} from './event_model.js';

function readLegacyCount(record, key, path) {
    const value = record[key];
    if (value == null) return 0;
    if (!Number.isInteger(value) || value < 0) {
        throw new CorruptInsightsStateError(`${path} must be a non-negative integer`);
    }
    if (value > MAX_INSIGHTS_EVENT_COUNT) throw new InsightsLimitError(MAX_INSIGHTS_EVENT_COUNT, 'legacy-count');
    return value;
}

function legacyTimestamp(dayKey) {
    return `${assertDayKey(dayKey)}T12:00:00.000Z`;
}

function makeLegacyEvent({ id, kind, dayKey, sessionIdentity, count, model = null }) {
    return normalizeEvent({
        id,
        kind,
        occurredAt: legacyTimestamp(dayKey),
        dayKey,
        sessionIdentity,
        count,
        model,
        tool: null,
        origin: 'legacy-counter'
    });
}

export function migrateLegacyCounterState(raw, {
    todayKey,
    sessionIdentity = 'legacy-counter',
    maxEvents = DEFAULT_MAX_INSIGHTS_EVENTS,
    includeLifetimeRemainders = true
} = {}) {
    assertDayKey(todayKey, 'todayKey');
    const identity = normalizeIdentity(sessionIdentity);
    const limit = normalizeLimit(maxEvents);
    if (raw == null) return createInsightsState([], { maxEvents: limit });
    if (!isRecord(raw)) throw new CorruptInsightsStateError('Legacy Counter state must be an object');
    if (raw.format === INSIGHTS_FORMAT) return loadInsightsState(raw, { maxEvents: limit });
    if (Object.hasOwn(raw, 'format')) throw new CorruptInsightsStateError('Unknown persisted state format');
    if (Number.isInteger(raw.schemaVersion) && raw.schemaVersion > INSIGHTS_SCHEMA_VERSION) {
        throw new FutureInsightsSchemaError(raw.schemaVersion);
    }
    const dailyCounts = raw.dailyCounts == null ? {} : raw.dailyCounts;
    if (!isRecord(dailyCounts)) throw new CorruptInsightsStateError('Legacy dailyCounts must be an object');
    const events = [];
    let migratedMessages = 0;
    let migratedChats = 0;
    const push = event => {
        if (events.length >= limit) throw new InsightsLimitError(limit);
        events.push(event);
    };
    const days = Object.keys(dailyCounts).sort();
    for (const dayKey of days) {
        assertDayKey(dayKey, 'legacy dailyCounts key');
        const entry = dailyCounts[dayKey];
        if (!isRecord(entry)) throw new CorruptInsightsStateError(`Legacy dailyCounts.${dayKey} must be an object`);
        const messages = readLegacyCount(entry, 'messages', `dailyCounts.${dayKey}.messages`);
        const chats = readLegacyCount(entry, 'chats', `dailyCounts.${dayKey}.chats`);
        const byModel = entry.byModel == null ? {} : entry.byModel;
        if (!isRecord(byModel)) throw new CorruptInsightsStateError(`dailyCounts.${dayKey}.byModel must be an object`);
        let modeled = 0;
        for (const model of Object.keys(byModel).sort()) {
            const safeModel = normalizeDimension(model, `dailyCounts.${dayKey}.byModel key`, true);
            const count = readLegacyCount(byModel, model, `dailyCounts.${dayKey}.byModel.${model}`);
            modeled += count;
            if (count > 0) push(makeLegacyEvent({
                id: `legacy:${dayKey}:message:${safeModel}`,
                kind: INSIGHTS_EVENT_KIND.MESSAGE,
                dayKey,
                sessionIdentity: identity,
                count,
                model: safeModel
            }));
        }
        if (modeled > messages) {
            throw new CorruptInsightsStateError(`dailyCounts.${dayKey}.byModel exceeds messages`);
        }
        if (messages > modeled) push(makeLegacyEvent({
            id: `legacy:${dayKey}:message:unknown`,
            kind: INSIGHTS_EVENT_KIND.MESSAGE,
            dayKey,
            sessionIdentity: identity,
            count: messages - modeled
        }));
        if (chats > 0) push(makeLegacyEvent({
            id: `legacy:${dayKey}:chat`,
            kind: INSIGHTS_EVENT_KIND.CHAT,
            dayKey,
            sessionIdentity: identity,
            count: chats
        }));
        migratedMessages += messages;
        migratedChats += chats;
    }
    if (days.length === 0) {
        const session = readLegacyCount(raw, 'session', 'session');
        if (session > 0) {
            push(makeLegacyEvent({
                id: `legacy:${todayKey}:message:session`,
                kind: INSIGHTS_EVENT_KIND.MESSAGE,
                dayKey: todayKey,
                sessionIdentity: identity,
                count: session
            }));
            migratedMessages += session;
        }
    }
    const total = readLegacyCount(raw, 'total', 'total');
    if (includeLifetimeRemainders && total > migratedMessages) push(makeLegacyEvent({
        id: `legacy:${todayKey}:message:remainder`,
        kind: INSIGHTS_EVENT_KIND.MESSAGE,
        dayKey: todayKey,
        sessionIdentity: identity,
        count: total - migratedMessages
    }));
    const totalChatsCreated = readLegacyCount(raw, 'totalChatsCreated', 'totalChatsCreated');
    const chats = raw.chats == null ? {} : raw.chats;
    if (!isRecord(chats)) throw new CorruptInsightsStateError('Legacy chats must be an object');
    let chatMapCount = 0;
    for (const [chatId, countValue] of Object.entries(chats)) {
        if (typeof chatId !== 'string' || chatId === '') throw new CorruptInsightsStateError('Legacy chat id is invalid');
        const count = readLegacyCount(chats, chatId, `chats.${chatId}`);
        if (count > 0) chatMapCount += 1;
    }
    const legacyChatTotal = Math.max(totalChatsCreated, chatMapCount);
    if (includeLifetimeRemainders && legacyChatTotal > migratedChats) push(makeLegacyEvent({
        id: `legacy:${todayKey}:chat:remainder`,
        kind: INSIGHTS_EVENT_KIND.CHAT,
        dayKey: todayKey,
        sessionIdentity: identity,
        count: legacyChatTotal - migratedChats
    }));
    return createInsightsState(events, { maxEvents: limit });
}
