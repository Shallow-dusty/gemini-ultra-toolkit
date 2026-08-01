const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let insights;
const FIXED_CLOCK = () => '2026-08-01T00:00:00.000Z';
before(async () => {
    const entry = pathToFileURL(path.join(__dirname, '..', 'src', 'features', 'insights', 'index.js'));
    insights = await import(entry.href);
});

function createDomainEvent(payload, options = {}) {
    return insights.createInsightsEvent(payload, { clock: FIXED_CLOCK, ...options });
}

function event(kind, dayKey, count = 1, extras = {}) {
    return {
        id: `${kind}-${dayKey}-${extras.model || extras.tool || 'none'}-${count}`,
        kind,
        occurredAt: `${dayKey}T12:00:00.000Z`,
        dayKey,
        sessionIdentity: 'session-a',
        count,
        model: null,
        tool: null,
        origin: 'observed',
        ...extras
    };
}

describe('Insights events and state', () => {
    it('keeps public error names stable when class identifiers are minified', () => {
        const errors = [
            new insights.InsightsError('base', 'BASE'),
            new insights.CorruptInsightsStateError(),
            new insights.FutureInsightsSchemaError(2),
            new insights.InsightsLimitError(1),
            new insights.InsightsReadOnlyError()
        ];
        assert.deepEqual(errors.map(error => error.name), [
            'InsightsError',
            'CorruptInsightsStateError',
            'FutureInsightsSchemaError',
            'InsightsLimitError',
            'InsightsReadOnlyError'
        ]);
    });

    it('creates deterministic privacy-bounded events with reset-window day keys', () => {
        const resolveDayKey = insights.createDayKeyResolver({ resetHour: 4, utcOffsetMinutes: 480 });
        const early = createDomainEvent({
            kind: 'message',
            sessionIdentity: 'person@example.test',
            model: 'gemini-3-pro',
            tool: 'deep-research',
            count: 2
        }, {
            clock: () => '2026-08-01T19:30:00.000Z',
            resolveDayKey,
            sequence: 7
        });
        assert.equal(early.dayKey, '2026-08-01');
        assert.equal(early.occurredAt, '2026-08-01T19:30:00.000Z');
        assert.equal(early.sessionIdentity, 'person@example.test');
        assert.equal(early.id.endsWith('-7'), true);
        assert.equal(Object.isFrozen(early), true);

        const later = createDomainEvent({
            kind: 'tool', sessionIdentity: 's', tool: 'canvas', occurredAt: new Date('2026-08-01T20:00:00Z')
        }, { resolveDayKey, sequence: 0 });
        assert.equal(later.dayKey, '2026-08-02');

        assert.throws(() => insights.createDayKeyResolver({ resetHour: -1 }), /resetHour/);
        assert.throws(() => insights.createDayKeyResolver({ utcOffsetMinutes: 900 }), /utcOffsetMinutes/);
        assert.throws(() => resolveDayKey('bad'), insights.CorruptInsightsStateError);
        assert.throws(() => createDomainEvent({ kind: 'unknown', sessionIdentity: 's' }), /Unknown/);
        assert.throws(() => createDomainEvent({ kind: 'model', sessionIdentity: 's' }), /model is required/);
        assert.throws(() => createDomainEvent({ kind: 'tool', sessionIdentity: 's' }), /tool is required/);
        assert.throws(() => createDomainEvent({ kind: 'message', sessionIdentity: 's', model: 'has spaces' }), /model is invalid/);
        assert.throws(() => createDomainEvent({ kind: 'message', sessionIdentity: 's', count: 0 }), /positive integer/);
        assert.throws(
            () => createDomainEvent({ kind: 'message', sessionIdentity: 's', count: 3 }, { maxCount: 2 }),
            insights.InsightsLimitError
        );
        assert.throws(() => insights.createInsightsEvent({ kind: 'message', sessionIdentity: 's' }), /clock/);
        assert.throws(() => createDomainEvent({ kind: 'message', sessionIdentity: 's' }, { clock: null }), /clock/);
        assert.throws(() => createDomainEvent({ kind: 'message', sessionIdentity: 's' }, { resolveDayKey: null }), /resolveDayKey/);
        assert.throws(() => createDomainEvent({ kind: 'message', sessionIdentity: 's' }, { sequence: -1 }), /sequence/);
        assert.throws(
            () => createDomainEvent({ kind: 'message', sessionIdentity: 's', occurredAt: 'bad' }),
            insights.CorruptInsightsStateError
        );
        assert.throws(() => insights.assertDayKey('2026-02-30'), /calendar date/);
        assert.throws(() => insights.assertDayKey('2026/01/01'), /YYYY-MM-DD/);
    });

    it('loads clone-safe schema state and rejects corrupt, future, duplicate, and oversized data', () => {
        const inputEvent = event('message', '2026-08-01', 2, { model: 'flash' });
        const state = insights.createInsightsState([inputEvent]);
        inputEvent.count = 99;
        assert.equal(state.events[0].count, 2);
        assert.equal(state.semantics.estimated, true);
        assert.equal(state.semantics.localOnly, true);
        assert.equal(state.semantics.serverQuota, false);
        assert.equal(state.semantics.serverQuotaRemaining, null);
        assert.equal(Object.isFrozen(state.events), true);

        const loaded = insights.loadInsightsState(JSON.parse(JSON.stringify(state)));
        assert.notEqual(loaded, state);
        assert.deepEqual(loaded, state);
        assert.deepEqual(insights.loadInsightsState(null).events, []);
        const defaultedEvent = { ...event('chat', '2026-08-01') };
        delete defaultedEvent.count;
        delete defaultedEvent.origin;
        const defaulted = insights.createInsightsState([defaultedEvent]);
        assert.equal(defaulted.events[0].count, 1);
        assert.equal(defaulted.events[0].origin, 'observed');
        assert.throws(() => insights.createInsightsState([], { maxEvents: 0 }), /maxEvents/);
        assert.throws(() => insights.loadInsightsState('bad'), insights.CorruptInsightsStateError);
        assert.throws(
            () => insights.loadInsightsState({ format: 'other', schemaVersion: 1, events: [] }),
            /Unknown insights state format/
        );
        assert.throws(
            () => insights.loadInsightsState({ format: insights.INSIGHTS_FORMAT, schemaVersion: 0, events: [] }),
            /schema version/
        );
        assert.throws(
            () => insights.loadInsightsState({ format: insights.INSIGHTS_FORMAT, schemaVersion: 2, events: [] }),
            error => error instanceof insights.FutureInsightsSchemaError && error.storedVersion === 2 && error.supportedVersion === 1
        );
        assert.throws(
            () => insights.loadInsightsState({ format: insights.INSIGHTS_FORMAT, schemaVersion: 1, events: {} }),
            /events must be an array/
        );
        assert.throws(
            () => insights.loadInsightsState({
                format: insights.INSIGHTS_FORMAT,
                schemaVersion: 1,
                events: [event('chat', '2026-08-01'), event('chat', '2026-08-02')]
            }, { maxEvents: 1 }),
            insights.InsightsLimitError
        );
        assert.throws(() => insights.createInsightsState([event('message', '2026-08-01')], { maxEvents: 0 }), /positive/);
        assert.throws(
            () => insights.createInsightsState([event('message', '2026-08-01')], { maxEvents: 1 }) &&
                insights.appendInsightsEvent(insights.createInsightsState([event('message', '2026-08-01')]), event('chat', '2026-08-01'), { maxEvents: 1 }),
            insights.InsightsLimitError
        );
        const duplicate = event('message', '2026-08-01');
        assert.throws(() => insights.createInsightsState([duplicate, duplicate]), /Duplicate event id/);
        assert.throws(() => insights.createInsightsState([null]), /event must be an object/);
        assert.throws(
            () => insights.createInsightsState([{ ...duplicate, id: '' }]),
            insights.CorruptInsightsStateError
        );
        assert.throws(
            () => insights.createInsightsState([{ ...duplicate, sessionIdentity: '' }]),
            insights.CorruptInsightsStateError
        );
        assert.throws(() => insights.createInsightsState([{ ...duplicate, dayKey: 'bad' }]), /dayKey/);
        assert.throws(() => insights.createInsightsState([{ ...duplicate, occurredAt: 'bad' }]), /occurredAt/);
        const cyclic = { format: insights.INSIGHTS_FORMAT, schemaVersion: 1, events: [] };
        cyclic.self = cyclic;
        assert.throws(() => insights.loadInsightsState(cyclic), /clone-safe/);
    });
});

describe('Insights aggregation, trend, and streak', () => {
    const state = () => insights.createInsightsState([
        event('message', '2026-07-24', 2, { model: 'flash' }),
        event('message', '2026-07-25', 1),
        event('message', '2026-07-30', 1, { model: 'pro' }),
        event('message', '2026-07-31', 2, { model: 'flash' }),
        event('chat', '2026-07-31', 1),
        event('model', '2026-07-31', 1, { model: 'pro' }),
        event('tool', '2026-07-31', 3, { tool: 'canvas' }),
        event('message', '2026-08-01', 3, { model: 'pro' })
    ]);

    it('aggregates by exact window, day, model, and tool without claiming quota authority', () => {
        const summary = insights.aggregateInsights(state());
        assert.equal(summary.totals.messages, 9);
        assert.equal(summary.totals.chats, 1);
        assert.equal(summary.totals.modelSelections, 1);
        assert.equal(summary.totals.toolUses, 3);
        assert.deepEqual(summary.totals.byModel, { flash: 4, pro: 4, unknown: 1 });
        assert.deepEqual(summary.totals.byTool, { canvas: 3 });
        assert.deepEqual(summary.totals.modelSelectionsByModel, { pro: 1 });
        assert.deepEqual(summary.days.map(day => day.dayKey), [
            '2026-07-24', '2026-07-25', '2026-07-30', '2026-07-31', '2026-08-01'
        ]);
        assert.equal(summary.nativeUsageLimits.href, 'https://gemini.google.com/app');
        assert.deepEqual(summary.nativeUsageLimits.navigationPath, ['settings', 'usage-limits']);
        assert.equal(summary.nativeUsageLimits.authority, 'gemini-server');
        assert.equal(summary.semantics.serverQuota, false);
        assert.equal('quotaRemaining' in summary.totals, false);

        const byDay = insights.aggregateInsights(state(), { fromDay: '2026-07-31', toDay: '2026-07-31' });
        assert.equal(byDay.totals.messages, 2);
        assert.equal(byDay.totals.toolUses, 3);
        const exact = insights.aggregateInsights(state(), {
            from: '2026-07-31T13:00:00Z', to: '2026-08-02T00:00:00Z'
        });
        assert.equal(exact.totals.messages, 3);
        assert.equal(insights.aggregateInsights(state(), {
            from: new Date('2026-07-31T13:00:00Z')
        }).totals.messages, 3);
        assert.equal(insights.aggregateInsights(state(), { to: '2026-07-31T00:00:00Z' }).totals.messages, 4);
        assert.throws(() => insights.aggregateInsights(state(), { from: 'not-a-date' }), /valid timestamp/);
        assert.throws(() => insights.aggregateInsights(state(), { from: '2026-08-02', to: '2026-08-01' }), /earlier/);
        assert.throws(() => insights.aggregateInsights(state(), { fromDay: '2026-08-02', toDay: '2026-08-01' }), /after/);
    });

    it('calculates equal-window trends and activity streaks with deterministic today keys', () => {
        const up = insights.calculateInsightsTrend(state(), { todayKey: '2026-08-01', days: 2 });
        assert.equal(up.current, 5);
        assert.equal(up.previous, 1);
        assert.equal(up.delta, 4);
        assert.equal(up.percentChange, 400);
        assert.equal(up.direction, 'up');
        const down = insights.calculateInsightsTrend(state(), { todayKey: '2026-07-26', days: 2 });
        assert.equal(down.direction, 'down');
        const flat = insights.calculateInsightsTrend(insights.createInsightsState(), { todayKey: '2026-08-01', days: 1 });
        assert.equal(flat.direction, 'flat');
        assert.equal(flat.percentChange, null);
        const tools = insights.calculateInsightsTrend(state(), { todayKey: '2026-07-31', days: 1, metric: 'toolUses' });
        assert.equal(tools.current, 3);

        const streak = insights.calculateInsightsStreak(state(), { todayKey: '2026-08-01' });
        assert.deepEqual({ current: streak.current, best: streak.best }, { current: 3, best: 3 });
        const yesterday = insights.calculateInsightsStreak(state(), { todayKey: '2026-08-02' });
        assert.equal(yesterday.current, 3);
        assert.equal(insights.calculateInsightsStreak(insights.createInsightsState(), { todayKey: '2026-08-01' }).best, 0);
        assert.throws(() => insights.calculateInsightsTrend(state(), { todayKey: '2026-08-01', days: 0 }), /days/);
        assert.throws(() => insights.calculateInsightsTrend(state(), { todayKey: '2026-08-01', metric: 'quota' }), /Unsupported/);
        assert.throws(() => insights.calculateInsightsStreak(state(), { todayKey: 'bad' }), /todayKey/);
    });
});

describe('Insights legacy migration', () => {
    it('purely migrates Counter totals, daily models, and chats using the supplied today key', () => {
        const legacy = {
            total: 10,
            totalChatsCreated: 4,
            session: 99,
            chats: { privateChatId: 3, anotherPrivateId: 0 },
            dailyCounts: {
                '2026-07-31': { messages: 3, chats: 1, byModel: { flash: 2, pro: 1 } },
                '2026-08-01': { messages: 4, chats: 1, byModel: { flash: 1 } }
            }
        };
        const original = JSON.parse(JSON.stringify(legacy));
        const migrated = insights.migrateLegacyCounterState(legacy, {
            todayKey: '2026-08-02', sessionIdentity: 'legacy@example.test'
        });
        assert.deepEqual(legacy, original);
        const summary = insights.aggregateInsights(migrated);
        assert.equal(summary.totals.messages, 10);
        assert.equal(summary.totals.chats, 4);
        assert.deepEqual(summary.totals.byModel, { flash: 3, pro: 1, unknown: 6 });
        assert.equal(migrated.events.every(item => item.sessionIdentity === 'legacy@example.test'), true);
        assert.equal(migrated.events.every(item => item.origin === 'legacy-counter'), true);
        assert.equal(migrated.events.some(item => item.dayKey === '2026-08-02'), true);
        assert.doesNotMatch(JSON.stringify(migrated), /privateChatId|anotherPrivateId/);
    });

    it('supports session fallback, existing Insights states, empty input, and migration limits', () => {
        const session = insights.migrateLegacyCounterState({ session: 3, total: 3 }, { todayKey: '2026-08-01' });
        assert.equal(insights.aggregateInsights(session).totals.messages, 3);
        assert.equal(session.events[0].dayKey, '2026-08-01');
        assert.deepEqual(insights.migrateLegacyCounterState(null, { todayKey: '2026-08-01' }).events, []);
        const withoutModels = insights.migrateLegacyCounterState({
            dailyCounts: { '2026-08-01': { messages: 2 } }
        }, { todayKey: '2026-08-01' });
        assert.equal(insights.aggregateInsights(withoutModels).totals.byModel.unknown, 2);
        const existing = insights.createInsightsState([event('chat', '2026-08-01')]);
        assert.deepEqual(insights.migrateLegacyCounterState(existing, { todayKey: '2026-08-02' }), existing);
        assert.throws(
            () => insights.migrateLegacyCounterState({ total: 2, totalChatsCreated: 1 }, { todayKey: '2026-08-01', maxEvents: 1 }),
            insights.InsightsLimitError
        );
    });

    it('rejects malformed legacy and future data instead of guessing', () => {
        const migrate = raw => insights.migrateLegacyCounterState(raw, { todayKey: '2026-08-01' });
        assert.throws(() => migrate([]), /must be an object/);
        assert.throws(() => migrate({ format: 'other' }), /persisted state format/);
        assert.throws(() => migrate({ schemaVersion: 9 }), insights.FutureInsightsSchemaError);
        assert.throws(() => migrate({ dailyCounts: [] }), /dailyCounts/);
        assert.throws(() => migrate({ dailyCounts: { bad: {} } }), /dailyCounts key/);
        assert.throws(() => migrate({ dailyCounts: { '2026-08-01': null } }), /must be an object/);
        assert.throws(() => migrate({ dailyCounts: { '2026-08-01': { messages: -1 } } }), /non-negative/);
        assert.throws(() => migrate({ dailyCounts: { '2026-08-01': { messages: 1, byModel: [] } } }), /byModel/);
        assert.throws(
            () => migrate({ dailyCounts: { '2026-08-01': { messages: 1, byModel: { flash: 2 } } } }),
            /exceeds messages/
        );
        assert.throws(() => migrate({ chats: [] }), /chats must be an object/);
        assert.throws(() => migrate({ chats: { '': 1 } }), /chat id/);
        assert.throws(() => migrate({ chats: { a: 1.5 } }), /non-negative integer/);
        assert.throws(
            () => migrate({ total: insights.MAX_INSIGHTS_EVENT_COUNT + 1 }),
            insights.InsightsLimitError
        );
    });
});

describe('Insights ledger and session controller', () => {
    it('captures session identity, keeps inspection read-only, and returns detached state', () => {
        const session = insights.captureSessionIdentity('person@example.test');
        assert.deepEqual(session, {
            sessionIdentity: 'person@example.test',
            targetIdentity: 'person@example.test',
            mode: 'session',
            readOnly: false
        });
        const inspection = insights.captureSessionIdentity({
            kind: 'inspection', sessionUserId: 'active@example.test', targetUserId: 'other@example.test', readOnly: true
        });
        assert.equal(inspection.mode, 'inspection');
        assert.equal(inspection.targetIdentity, 'other@example.test');
        const objectSession = insights.captureSessionIdentity({ sessionIdentity: 'object@example.test' });
        assert.equal(objectSession.mode, 'session');
        assert.equal(objectSession.targetIdentity, 'object@example.test');
        assert.equal(insights.captureSessionIdentity({
            mode: 'inspection', sessionIdentity: 'a', targetIdentity: 'b'
        }).readOnly, true);
        assert.equal(insights.captureSessionIdentity({
            sessionIdentity: 'a', targetIdentity: 'b', readOnly: true
        }).readOnly, true);
        assert.throws(() => insights.captureSessionIdentity(null), /required/);
        assert.throws(() => insights.captureSessionIdentity(''), /sessionIdentity/);

        const ledger = new insights.InsightsLedger({
            sessionIdentity: 'person@example.test',
            clock: () => '2026-08-01T00:00:00Z'
        });
        ledger.record('message', { model: 'flash' });
        ledger.record('chat');
        ledger.record('model', { model: 'pro' });
        ledger.record('tool', { tool: 'canvas' });
        const detached = ledger.getState();
        detached.events.length = 0;
        assert.equal(ledger.getState().events.length, 4);
        assert.equal(ledger.summarize().totals.messages, 1);
        assert.throws(() => ledger.record('message', 'bad'), /details/);

        const readOnly = new insights.InsightsLedger({ scope: inspection, clock: FIXED_CLOCK });
        assert.equal(readOnly.readOnly, true);
        assert.throws(() => readOnly.record('message'), insights.InsightsReadOnlyError);
        assert.throws(() => new insights.InsightsLedger({ sessionIdentity: 'x', clock: null }), /clock/);
        assert.throws(() => new insights.InsightsLedger({
            sessionIdentity: 'x', clock: FIXED_CLOCK, resolveDayKey: null
        }), /resolveDayKey/);
        assert.throws(() => new insights.InsightsLedger({ sessionIdentity: 'clock-required' }), /clock/);
        const explicitClock = new insights.InsightsLedger({ sessionIdentity: 'explicit-clock', clock: FIXED_CLOCK });
        assert.equal(explicitClock.record('chat').kind, 'chat');
    });

    it('flushes captured identity before switching sessions and enforces inspection mode', async () => {
        const flushed = [];
        const controller = insights.createInsightsSessionController({
            sessionIdentity: 'first@example.test',
            clock: () => '2026-08-01T00:00:00Z',
            flush(request) {
                flushed.push(request);
                assert.equal(Object.isFrozen(request), true);
                assert.equal(Object.isFrozen(request.events), true);
            }
        });
        const firstEvent = controller.capture('message', { model: 'flash' });
        assert.equal(firstEvent.sessionIdentity, 'first@example.test');
        const switched = await controller.switchSession('second@example.test');
        assert.equal(flushed.length, 1);
        assert.equal(flushed[0].sessionIdentity, 'first@example.test');
        assert.equal(controller.getPending().length, 0);
        assert.equal(switched.sessionIdentity, 'second@example.test');
        assert.deepEqual(await controller.flushPending(), { flushed: 0, sessionIdentity: 'second@example.test' });

        controller.capture('tool', { tool: 'canvas' });
        await controller.enterInspection('other@example.test');
        assert.equal(controller.readOnly, true);
        assert.equal(controller.getIdentity().targetIdentity, 'other@example.test');
        assert.throws(() => controller.capture('message'), insights.InsightsReadOnlyError);
        await controller.returnToSession();
        assert.equal(controller.readOnly, false);
        assert.equal(controller.getIdentity().sessionIdentity, 'second@example.test');
    });

    it('retains pending events and the old identity after failed or overlapping transitions', async () => {
        let release;
        let rejectFlush = true;
        const gate = new Promise(resolve => { release = resolve; });
        const controller = new insights.InsightsSessionController({
            sessionIdentity: 'old@example.test',
            clock: FIXED_CLOCK,
            flush: async () => {
                await gate;
                if (rejectFlush) throw new Error('storage unavailable');
            }
        });
        controller.capture('chat');
        const switching = controller.switchSession('new@example.test');
        assert.throws(() => controller.capture('message'), insights.InsightsSessionTransitionError);
        await assert.rejects(controller.switchSession('third@example.test'), insights.InsightsSessionTransitionError);
        release();
        await assert.rejects(
            switching,
            error => error instanceof insights.InsightsFlushError && error.cause.message === 'storage unavailable'
        );
        assert.equal(controller.getIdentity().sessionIdentity, 'old@example.test');
        assert.equal(controller.getPending().length, 1);
        rejectFlush = false;
        await controller.switchSession('new@example.test');
        assert.equal(controller.getIdentity().sessionIdentity, 'new@example.test');

        assert.throws(
            () => new insights.InsightsSessionController({ sessionIdentity: 'x', flush: null, clock: FIXED_CLOCK }),
            /flush/
        );
        assert.throws(
            () => new insights.InsightsSessionController({ sessionIdentity: 'x', flush() {}, clock: null }),
            /clock/
        );
        assert.throws(
            () => new insights.InsightsSessionController({
                sessionIdentity: 'x', flush() {}, clock: FIXED_CLOCK, resolveDayKey: null
            }),
            /resolveDayKey/
        );
        assert.throws(
            () => new insights.InsightsSessionController({
                sessionIdentity: 'x', flush() {}, clock: FIXED_CLOCK, maxPendingEvents: 0
            }),
            /maxPendingEvents/
        );
        const limited = new insights.InsightsSessionController({
            sessionIdentity: 'x', flush() {}, clock: FIXED_CLOCK, maxPendingEvents: 1
        });
        limited.capture('chat');
        assert.throws(() => limited.capture('chat', 'bad'), /details/);
        assert.throws(() => limited.capture('chat'), insights.InsightsLimitError);
    });
});
