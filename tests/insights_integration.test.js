const { afterEach, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let CounterModule;
let configureCounterModule;
let insights;
let initialDefaultDependencies;

before(async () => {
    const root = path.join(__dirname, '..', 'src');
    ({ CounterModule, configureCounterModule } = await import(
        pathToFileURL(path.join(root, 'modules', 'counter.js')).href
    ));
    insights = await import(pathToFileURL(path.join(root, 'features', 'insights', 'index.js')).href);
    initialDefaultDependencies = CounterModule._deps;
});

afterEach(async () => {
    if (!CounterModule) return;
    try {
        await CounterModule.destroy();
    } catch {
        // Individual failure-path tests assert the error before cleanup.
    }
});

function copy(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

class FakeStorage {
    constructor(initial = {}) {
        this.values = new Map(Object.entries(copy(initial)));
        this.log = [];
        this.failSetFor = new Set();
        this.failGetFor = new Set();
    }

    async get(key, fallback) {
        this.log.push({ operation: 'get', key });
        if (this.failGetFor.has(key)) throw new Error(`get failed: ${key}`);
        return this.values.has(key) ? copy(this.values.get(key)) : copy(fallback);
    }

    async set(key, value) {
        this.log.push({ operation: 'set', key, value: copy(value) });
        if (this.failSetFor.has(key)) throw new Error(`set failed: ${key}`);
        this.values.set(key, copy(value));
    }
}

class FakeTimers {
    constructor() {
        this.nextId = 1;
        this.timeouts = new Map();
        this.intervals = new Map();
        this.clearedTimeouts = [];
        this.clearedIntervals = [];
    }

    setTimeout(callback, delay) {
        const id = this.nextId++;
        this.timeouts.set(id, { callback, delay });
        return id;
    }

    clearTimeout(id) {
        this.clearedTimeouts.push(id);
        this.timeouts.delete(id);
    }

    setInterval(callback, delay) {
        const id = this.nextId++;
        this.intervals.set(id, { callback, delay });
        return id;
    }

    clearInterval(id) {
        this.clearedIntervals.push(id);
        this.intervals.delete(id);
    }

    runTimeout(id) {
        const task = this.timeouts.get(id);
        if (!task) return false;
        this.timeouts.delete(id);
        task.callback();
        return true;
    }

    tickInterval(id, count = 1) {
        for (let index = 0; index < count; index += 1) {
            const task = this.intervals.get(id);
            if (!task) return false;
            task.callback();
        }
        return true;
    }
}

class FakeDocument {
    constructor() {
        this.activeElement = null;
        this.listeners = new Map();
        this.added = [];
        this.removed = [];
    }

    addEventListener(type, listener, capture) {
        this.added.push({ type, listener, capture });
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
    }

    removeEventListener(type, listener, capture) {
        this.removed.push({ type, listener, capture });
        this.listeners.get(type)?.delete(listener);
    }

    dispatch(type, event) {
        for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    }
}

function createLegacy({ total = 3, chats = 1, day = '2026-08-01' } = {}) {
    return {
        total,
        totalChatsCreated: chats,
        session: 99,
        chats: { 'legacy-chat': total },
        dailyCounts: {
            [day]: {
                messages: Math.min(total, 2),
                chats: Math.min(chats, 1),
                byModel: { flash: Math.min(total, 1), pro: total > 1 ? 1 : 0 }
            }
        }
    };
}

function createHarness({
    currentUser = 'active@example.test',
    inspectingUser = currentUser,
    chatId = 'chat-current',
    dayKey = '2026-08-01',
    now = Date.parse('2026-08-01T12:00:00.000Z'),
    initialStorage = {},
    storage = new FakeStorage(initialStorage),
    document = new FakeDocument(),
    timers = new FakeTimers(),
    maxEvents = 100,
    subscribeReturnsRelease = true,
    onChange = null,
    translate = (_zh, en) => en,
    resolveDayKey = timestamp => String(timestamp).slice(0, 10)
} = {}) {
    const runtime = { currentUser, inspectingUser, chatId, dayKey, now };
    const core = {
        getCurrentUser: () => runtime.currentUser,
        getInspectingUser: () => runtime.inspectingUser,
        setInspectingUser: user => { runtime.inspectingUser = user; },
        getChatId: () => runtime.chatId,
        getDayKey: () => runtime.dayKey
    };
    const adapter = {
        isInsideInputEditor: element => Boolean(element?.isEditor),
        getClosestSendButton: target => target?.sendButton || null,
        detectModelKey: () => 'detected-pro',
        detectAccountTier: () => 'advanced'
    };
    const logs = [];
    const logger = {
        info: (...args) => logs.push(['info', ...args]),
        warn: (...args) => logs.push(['warn', ...args])
    };
    const subscriptions = [];
    const released = [];
    const changes = [];
    const subscribeUserData = (identity, listener) => {
        const subscription = { identity, listener };
        subscriptions.push(subscription);
        return subscribeReturnsRelease
            ? () => released.push(identity)
            : undefined;
    };
    const dependencies = {
        core,
        adapter,
        logger,
        storage,
        document,
        timers,
        now: () => runtime.now,
        resolveDayKey,
        translate,
        subscribeUserData,
        onChange,
        tempUser: 'Guest',
        maxEvents
    };
    configureCounterModule(dependencies);
    return {
        adapter,
        changes,
        core,
        dependencies,
        document,
        logs,
        released,
        runtime,
        storage,
        subscriptions,
        timers
    };
}

function storageKey(identity) {
    return `gemini_store_${identity}`;
}

async function settle() {
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
}

function portableEvent(id, sessionIdentity, patch = {}) {
    return {
        id,
        kind: 'message',
        occurredAt: '2026-08-01T10:00:00.000Z',
        dayKey: '2026-08-01',
        sessionIdentity,
        count: 1,
        model: null,
        tool: null,
        origin: 'imported',
        ...patch
    };
}

function portableContext(actions, snapshot = undefined, signal = null) {
    return { section: 'insights', plan: {}, actions, signal, ...(snapshot ? { snapshot } : {}) };
}

describe('Counter Insights adapter', () => {
    it('keeps the legacy module contract while persisting an Insights envelope and local-only quota semantics', async () => {
        const identity = 'active@example.test';
        const legacy = createLegacy({ total: 5, chats: 2 });
        const harness = createHarness({
            currentUser: identity,
            initialStorage: {
                gemini_reset_hour: 4,
                gemini_quota_limit: 80,
                [storageKey(identity)]: legacy
            },
            onChange: event => harness.changes.push(event)
        });
        const observed = [];
        const unsubscribe = CounterModule.subscribe(event => observed.push(event));

        assert.equal(CounterModule.id, 'counter');
        assert.equal(CounterModule.defaultEnabled, true);
        assert.match(CounterModule.name, /Local Insights/);
        assert.match(CounterModule.description, /Local-only/);
        assert.equal(await CounterModule.init(), CounterModule);
        assert.equal(await CounterModule.init(), CounterModule);
        assert.equal(CounterModule.resetHour, 4);
        assert.equal(CounterModule.quotaLimit, 80);
        assert.equal(CounterModule.state.total, 5);
        assert.equal(CounterModule.state.totalChatsCreated, 2);
        assert.equal(CounterModule.state.dailyCounts['2026-08-01'].messages, 2);
        assert.equal(CounterModule.state.usageSemantics.serverQuota, false);
        assert.equal(CounterModule.state.nativeUsageLimits.path, '/usage');
        assert.equal(CounterModule.isInspection(), false);

        CounterModule.currentModel = 'pro';
        CounterModule.currentModel = 'pro';
        assert.equal(CounterModule.attemptIncrement(), true);
        assert.equal(CounterModule.attemptIncrement(), false);
        assert.equal(CounterModule.recordToolUse('canvas', { model: 'pro' }), true);
        assert.equal(CounterModule.state.total, 6);
        assert.equal(CounterModule.state.totalChatsCreated, 3);
        assert.equal(CounterModule.state.chats['chat-current'], 1);
        assert.equal(CounterModule.getTodayMessages(), 3);
        assert.equal(CounterModule.getTodayByModel().pro, 2);
        assert.equal(CounterModule.getWeightedQuota(), 2);
        assert.equal(CounterModule.detectModel(), 'detected-pro');
        assert.equal(CounterModule.detectAccountType(), 'advanced');
        assert.deepEqual(CounterModule.calculateStreaks(), { current: 1, best: 1 });
        assert.equal(CounterModule.getLast7DaysData().at(-1).messages, 6);

        const quotaWindow = CounterModule.getQuotaWindowState(new Date('2026-08-01T12:30:00'));
        assert.equal(quotaWindow.windowLabel, 'Local estimate · Usage Limits ↗');
        assert.equal(quotaWindow.semantics.measurement, 'estimated');
        assert.equal(quotaWindow.nativeUsageLimits.entry, '/usage');
        assert.equal(quotaWindow.nativeUsageLimits.deepLink, 'https://gemini.google.com/usage');
        assert.doesNotMatch(JSON.stringify(quotaWindow), /server balance/i);
        const display = CounterModule.getQuotaDisplayState(new Date('2026-08-01T12:30:00'));
        assert.equal(display.messages, 3);
        assert.equal(display.weighted, 2);
        assert.equal(display.localTarget, 80);
        assert.equal(display.semantics.serverQuota, false);
        assert.equal(display.semantics.serverQuotaRemaining, null);
        assert.match(display.label, /not Gemini server quota/);

        assert.equal(await CounterModule.flushPendingSave(), true);
        const stored = harness.storage.values.get(storageKey(identity));
        assert.equal(stored.total, 6);
        assert.equal(stored.totalChatsCreated, 3);
        assert.equal(stored.insights.format, insights.INSIGHTS_FORMAT);
        assert.equal(stored.insights.schemaVersion, insights.INSIGHTS_SCHEMA_VERSION);
        assert.equal(stored.usageSemantics.localOnly, true);
        assert.equal(stored.nativeUsageLimits.path, '/usage');
        const summary = insights.aggregateInsights(stored.insights);
        assert.equal(summary.totals.messages, 3);
        assert.equal(summary.totals.chats, 2);
        assert.equal(summary.totals.modelSelections, 1);
        assert.equal(summary.totals.toolUses, 1);
        assert.equal(CounterModule.getInsightsSnapshot().events.length, stored.insights.events.length);

        assert.equal(observed.some(event => event.reason === 'message'), true);
        assert.equal(harness.changes.some(event => event.reason === 'save'), true);
        unsubscribe();
        assert.equal(unsubscribe(), false);
    });

    it('keeps inspection state read-only and distinct from the active session', async () => {
        const active = 'active@example.test';
        const target = 'target@example.test';
        const harness = createHarness({
            currentUser: active,
            inspectingUser: target,
            initialStorage: {
                [storageKey(active)]: createLegacy({ total: 2 }),
                [storageKey(target)]: createLegacy({ total: 9, chats: 4 })
            }
        });
        await CounterModule.init();

        assert.equal(CounterModule.isInspection(), true);
        assert.equal(CounterModule.state.total, 9);
        assert.equal(await CounterModule.saveData(), false);
        assert.deepEqual(await CounterModule.flushPendingSave(), {
            flushed: 0,
            sessionIdentity: active
        });
        assert.equal(CounterModule.recordToolUse('canvas'), false);
        assert.equal(CounterModule.handleReset(), false);
        assert.equal(CounterModule.attemptIncrement(), false);
        const before = copy(CounterModule.state.dailyCounts);
        assert.equal(CounterModule.ensureTodayEntry(), '2026-08-01');
        assert.deepEqual(CounterModule.state.dailyCounts, before);
        assert.equal(CounterModule.getInsightsSnapshot().semantics.serverQuota, false);
        assert.equal(harness.storage.log.some(item => item.operation === 'set'), false);

        harness.runtime.inspectingUser = active;
        await CounterModule.onUserChange(active);
        assert.equal(CounterModule.isInspection(), false);
        assert.equal(CounterModule.state.total, 2);
        assert.equal(CounterModule.recordToolUse('deep-research'), true);
        await CounterModule.flushPendingSave();
        assert.equal(harness.storage.values.get(storageKey(active)).total, 2);
        assert.equal(harness.storage.values.get(storageKey(target)).total, 9);
        assert.deepEqual(harness.released, [target]);
    });

    it('exposes a clone-isolated session-bound portable archive port and invalidates it across lifecycle changes', async () => {
        const first = 'archive-first@example.test';
        const second = 'archive-second@example.test';
        const harness = createHarness({
            currentUser: first,
            inspectingUser: first,
            initialStorage: {
                [storageKey(first)]: createLegacy({ total: 2 }),
                [storageKey(second)]: createLegacy({ total: 1 })
            }
        });
        assert.throws(
            () => CounterModule.getPortableArchiveIntegration(),
            error => error.code === 'FEATURE_INACTIVE'
        );
        await CounterModule.init();
        assert.equal(CounterModule.attemptIncrement(), true);

        const integration = CounterModule.getPortableArchiveIntegration();
        assert.deepEqual(Object.keys(integration), ['section', 'exportSection', 'contributor']);
        assert.equal(integration.section, 'insights');
        assert.equal(Object.isFrozen(integration), true);
        assert.equal(Object.isFrozen(integration.contributor), true);
        assert.deepEqual(Object.keys(integration.contributor), ['snapshot', 'apply', 'rollback']);

        const exported = await integration.exportSection();
        assert.equal(new Set(exported.map(event => event.id)).size, exported.length);
        assert.equal(exported.every(event => event.sessionIdentity === first), true);
        assert.doesNotMatch(JSON.stringify(exported), /serverQuota|quotaRemaining|quotaLimit/);
        const originalCount = (await integration.exportSection())[0].count;
        exported[0].count = 999;
        assert.equal((await integration.exportSection())[0].count, originalCount);

        await assert.rejects(
            integration.exportSection({ signal: { aborted: false } }),
            error => error.code === 'INVALID_ABORT_SIGNAL'
        );
        const aborted = new AbortController();
        aborted.abort();
        await assert.rejects(
            integration.exportSection({ signal: aborted.signal }),
            error => error.code === 'RESTORE_ABORTED'
        );
        let abortReads = 0;
        const changesDuringExport = {
            get aborted() { abortReads += 1; return abortReads >= 4; },
            addEventListener() {},
            removeEventListener() {}
        };
        await assert.rejects(
            integration.exportSection({ signal: changesDuringExport }),
            error => error.code === 'RESTORE_ABORTED'
        );

        const cleanSnapshot = await integration.contributor.snapshot(portableContext([]));
        const mutableSnapshot = await integration.contributor.snapshot(portableContext([]));
        mutableSnapshot.state.events[0].count = 777;
        assert.notEqual((await integration.exportSection())[0].count, 777);
        const imported = portableEvent('foreign-id', 'foreign@example.test');
        const restoreAction = {
            section: 'insights',
            action: 'insert',
            incomingIdentity: imported.id,
            targetIdentity: 'portable-imported',
            identityPatch: null,
            value: imported
        };
        assert.deepEqual(
            await integration.contributor.apply(portableContext([restoreAction], cleanSnapshot)),
            {
                section: 'insights',
                applied: 1,
                eventCount: cleanSnapshot.state.events.length + 1,
                semantics: insights.INSIGHTS_SEMANTICS
            }
        );
        const restoredEvents = await integration.exportSection();
        assert.equal(restoredEvents.some(event => event.id === 'portable-imported'), true);
        assert.equal(restoredEvents.every(event => event.sessionIdentity === first), true);
        assert.doesNotMatch(JSON.stringify(restoredEvents), /serverQuota|quotaRemaining|quotaLimit/);
        const persisted = harness.storage.values.get(storageKey(first));
        assert.equal(persisted.insights.semantics.localOnly, true);
        assert.equal(persisted.insights.semantics.serverQuota, false);

        await integration.contributor.rollback({
            section: 'insights',
            plan: {},
            actions: [restoreAction],
            snapshot: cleanSnapshot,
            applyResult: null,
            failure: null
        });
        assert.equal((await integration.exportSection()).some(event => event.id === 'portable-imported'), false);

        harness.runtime.currentUser = second;
        harness.runtime.inspectingUser = second;
        await CounterModule.onUserChange(second);
        await assert.rejects(integration.exportSection(), error => error.code === 'SESSION_CHANGED');
        await assert.rejects(
            integration.contributor.snapshot(portableContext([])),
            error => error.code === 'SESSION_CHANGED'
        );
        const secondIntegration = CounterModule.getPortableArchiveIntegration();
        assert.equal((await secondIntegration.exportSection()).every(event => event.sessionIdentity === second), true);
        await CounterModule.destroy();
        await assert.rejects(secondIntegration.exportSection(), error => error.code === 'FEATURE_INACTIVE');
        await assert.rejects(
            secondIntegration.contributor.snapshot(portableContext([])),
            error => error.code === 'FEATURE_INACTIVE'
        );
        assert.throws(
            () => CounterModule.getPortableArchiveIntegration(),
            error => error.code === 'FEATURE_INACTIVE'
        );
    });

    it('allows inspection exports but rejects every restore path and foreign-session event state', async () => {
        const active = 'archive-active@example.test';
        const target = 'archive-target@example.test';
        const harness = createHarness({
            currentUser: active,
            inspectingUser: target,
            initialStorage: {
                [storageKey(active)]: createLegacy({ total: 1 }),
                [storageKey(target)]: createLegacy({ total: 3 })
            }
        });
        await CounterModule.init();
        const integration = CounterModule.getPortableArchiveIntegration();
        const exported = await integration.exportSection({ signal: null });
        assert.equal(exported.every(event => event.sessionIdentity === target), true);
        assert.doesNotMatch(JSON.stringify(exported), /serverQuota|quotaRemaining|quotaLimit/);
        await assert.rejects(
            integration.contributor.snapshot(portableContext([])),
            error => error.code === 'INSIGHTS_READ_ONLY'
        );
        const activeSnapshot = {
            section: 'insights',
            sessionIdentity: active,
            state: insights.createInsightsState([])
        };
        await assert.rejects(
            integration.contributor.apply(portableContext([], activeSnapshot)),
            error => error.code === 'INSIGHTS_READ_ONLY'
        );
        await assert.rejects(
            integration.contributor.rollback({
                section: 'insights', plan: {}, actions: [], snapshot: activeSnapshot,
                applyResult: null, failure: null
            }),
            error => error.code === 'INSIGHTS_READ_ONLY'
        );
        assert.equal(harness.storage.log.some(entry => entry.operation === 'set'), false);

        CounterModule._records.get(target).insights = insights.createInsightsState([
            portableEvent('foreign-session', 'other@example.test')
        ]);
        await assert.rejects(
            integration.exportSection(),
            error => error.code === 'INSIGHTS_SESSION_MISMATCH'
        );
    });

    it('flushes the old identity before switching and retries atomically after a storage failure', async () => {
        const first = 'first@example.test';
        const second = 'second@example.test';
        const harness = createHarness({
            currentUser: first,
            initialStorage: {
                [storageKey(first)]: createLegacy({ total: 1 }),
                [storageKey(second)]: createLegacy({ total: 7 })
            }
        });
        await CounterModule.init();
        assert.equal(CounterModule.attemptIncrement(), true);
        harness.runtime.currentUser = second;
        harness.runtime.inspectingUser = second;
        harness.storage.failSetFor.add(storageKey(first));

        await assert.rejects(
            CounterModule.loadDataForUser(second),
            error => error.code === 'INSIGHTS_FLUSH_FAILED' && error.cause.message.includes('set failed')
        );
        assert.equal(CounterModule._activeIdentity, first);
        assert.equal(CounterModule._controller.getIdentity().sessionIdentity, first);
        assert.equal(CounterModule._controller.getPending().length, 2);
        assert.equal(CounterModule._records.get(first).insights.events.length, 2);

        harness.storage.failSetFor.delete(storageKey(first));
        assert.equal(await CounterModule.loadDataForUser(second), true);
        assert.equal(CounterModule._activeIdentity, second);
        assert.equal(CounterModule.state.total, 7);
        const firstPayload = harness.storage.values.get(storageKey(first));
        assert.equal(firstPayload.total, 2);
        assert.equal(insights.aggregateInsights(firstPayload.insights).totals.messages, 2);
        const successfulOldWrite = harness.storage.log.findIndex(item =>
            item.operation === 'set' && item.key === storageKey(first) && item.value.insights.events.length === 4
        );
        const secondRead = harness.storage.log.findIndex(item =>
            item.operation === 'get' && item.key === storageKey(second)
        );
        assert.ok(successfulOldWrite > -1 && successfulOldWrite < secondRead);
    });

    it('keeps Guest data memory-only and survives a destroy/init lifecycle without duplicate event ids', async () => {
        const harness = createHarness({ currentUser: 'Guest', inspectingUser: 'Guest' });
        await CounterModule.init({ session: 'fallback@example.test' });
        assert.equal(CounterModule.attemptIncrement(), true);
        assert.equal(CounterModule.recordToolUse('canvas'), true);
        await CounterModule.flushPendingSave();
        assert.equal(harness.storage.log.some(item => item.operation === 'set'), false);
        assert.equal(CounterModule.state.total, 1);
        const firstIds = CounterModule.getInsightsSnapshot().events.map(event => event.id);

        await CounterModule.destroy();
        await CounterModule.destroy();
        assert.equal(CounterModule._controller, null);
        assert.equal(harness.document.removed.length, 2);
        await CounterModule.init();
        harness.runtime.now += 2_000;
        assert.equal(CounterModule.recordToolUse('search'), true);
        await CounterModule.flushPendingSave();
        const ids = CounterModule.getInsightsSnapshot().events.map(event => event.id);
        assert.equal(new Set(ids).size, ids.length);
        assert.equal(firstIds.every(id => ids.includes(id)), true);
        assert.equal(harness.document.added.length, 4);
    });

    it('binds keyboard and click sends once, and cleans up delayed chat discovery safely', async () => {
        const harness = createHarness({ chatId: null });
        await CounterModule.init();
        CounterModule.bindEvents();
        assert.equal(harness.document.added.length, 2);

        harness.document.activeElement = { isEditor: true };
        harness.document.dispatch('keydown', { key: 'Escape' });
        harness.document.dispatch('keydown', { key: 'Enter', shiftKey: true });
        harness.document.dispatch('keydown', { key: 'Enter', isComposing: true });
        harness.document.dispatch('keydown', { key: 'Enter', originalEvent: { isComposing: true } });
        harness.document.activeElement = { isEditor: false };
        harness.document.dispatch('keydown', { key: 'Enter' });
        assert.equal(harness.timers.timeouts.size, 0);
        harness.document.activeElement = { isEditor: true };
        harness.document.dispatch('keydown', { key: 'Enter' });
        const enterTimer = [...harness.timers.timeouts.keys()][0];
        assert.equal(harness.timers.timeouts.get(enterTimer).delay, 50);
        harness.timers.runTimeout(enterTimer);
        const firstPoller = CounterModule._cidPoller;
        assert.equal(harness.timers.intervals.get(firstPoller).delay, 500);
        harness.timers.tickInterval(firstPoller, 2);
        harness.runtime.chatId = 'late-chat';
        harness.runtime.now = Date.parse('2026-08-02T01:00:00.000Z');
        harness.timers.tickInterval(firstPoller);
        assert.equal(CounterModule.state.dailyCounts['2026-08-01'].chats, 1);
        assert.equal(CounterModule._cidPoller, null);

        harness.runtime.now += 2_000;
        harness.runtime.chatId = 'late-chat';
        harness.document.dispatch('click', { target: {} });
        harness.document.dispatch('click', { target: { sendButton: true } });
        assert.equal(CounterModule.state.chats['late-chat'], 2);
        await CounterModule.flushPendingSave();
        await CounterModule.destroy();
        assert.equal(harness.document.listeners.get('keydown').size, 0);
        assert.equal(harness.document.listeners.get('click').size, 0);
    });

    it('times out missing chats and cancels stale pollers when the active generation changes', async () => {
        const harness = createHarness({ chatId: null });
        await CounterModule.init();
        assert.equal(CounterModule.attemptIncrement(), true);
        const timedOut = CounterModule._cidPoller;
        harness.timers.tickInterval(timedOut, 20);
        assert.equal(CounterModule._cidPoller, null);
        assert.equal(CounterModule.state.totalChatsCreated, 0);

        harness.runtime.now += 2_000;
        assert.equal(CounterModule.attemptIncrement(), true);
        const stale = CounterModule._cidPoller;
        CounterModule._activeIdentity = 'different@example.test';
        harness.timers.tickInterval(stale);
        assert.equal(CounterModule._cidPoller, null);
    });

    it('supports today, chat, and total reset confirmations without mutating inspection data', async () => {
        const identity = 'reset@example.test';
        createHarness({
            currentUser: identity,
            chatId: 'legacy-chat',
            initialStorage: { [storageKey(identity)]: createLegacy({ total: 4, chats: 1 }) }
        });
        await CounterModule.init();

        CounterModule.state.viewMode = 'today';
        assert.equal(CounterModule.handleReset(), true);
        assert.equal(CounterModule.state.resetStep, 1);
        assert.equal(CounterModule.handleReset(), true);
        assert.equal(CounterModule.getTodayMessages(), 0);
        await CounterModule.flushPendingSave();

        CounterModule.state.viewMode = 'chat';
        CounterModule.handleReset();
        CounterModule.handleReset();
        assert.equal(CounterModule.state.chats['legacy-chat'], 0);
        await CounterModule.flushPendingSave();

        CounterModule.state.viewMode = 'total';
        CounterModule.handleReset();
        assert.equal(CounterModule.handleReset(), true);
        assert.equal(CounterModule.state.resetStep, 2);
        CounterModule.handleReset();
        assert.equal(CounterModule.state.total, 0);
        assert.equal(CounterModule.state.totalChatsCreated, 0);
        assert.deepEqual(CounterModule.state.chats, {});
        assert.deepEqual(CounterModule.state.dailyCounts, {});
        await CounterModule.flushPendingSave();
        assert.equal(insights.aggregateInsights(CounterModule.getInsightsSnapshot()).totals.messages, 0);
    });

    it('accepts external storage updates only after flushing active pending events', async () => {
        const identity = 'external@example.test';
        const harness = createHarness({
            currentUser: identity,
            initialStorage: { [storageKey(identity)]: createLegacy({ total: 1 }) }
        });
        await CounterModule.init();
        assert.equal(CounterModule.recordToolUse('canvas'), true);
        const external = createLegacy({ total: 8, chats: 2 });
        harness.subscriptions.at(-1).listener(external);
        await settle();
        assert.equal(CounterModule.state.total, 8);
        assert.equal(CounterModule._controller.getPending().length, 0);
        assert.equal(harness.storage.log.some(item => item.operation === 'set'), true);

        harness.subscriptions.at(-1).listener({ format: 'unknown' });
        await settle();
        assert.equal(harness.logs.some(entry =>
            entry[0] === 'warn' && entry[1] === 'Counter storage was not overwritten after an invalid load'
        ), true);

        await CounterModule._replaceExternalRecord('not-visible@example.test', null);
        assert.equal(CounterModule.state.total, 0);
    });

    it('normalizes compatibility data around a valid Insights ledger and blocks corrupt storage from overwrite', async () => {
        const identity = 'ledger@example.test';
        const state = insights.createInsightsState([
            insights.createInsightsEvent({
                kind: 'message', sessionIdentity: identity, model: 'flash', occurredAt: '2026-08-01T10:00:00Z'
            }, { clock: () => '2026-08-01T10:00:00Z', sequence: 35 })
        ]);
        const malformedCompatibility = {
            total: -1,
            totalChatsCreated: 'bad',
            chats: { good: 2, bad: -1, '': 4 },
            dailyCounts: {},
            insights: state
        };
        const harness = createHarness({
            currentUser: identity,
            initialStorage: { [storageKey(identity)]: malformedCompatibility }
        });
        await CounterModule.init();
        assert.equal(CounterModule.state.total, 1);
        assert.equal(CounterModule.state.totalChatsCreated, 0);
        assert.deepEqual(CounterModule.state.chats, { good: 2 });
        assert.equal(CounterModule.state.dailyCounts['2026-08-01'].messages, 1);
        assert.equal(CounterModule._controller.sequence, 36);

        const rawThatThrows = error => Object.defineProperty({}, 'insights', {
            get() { throw error; }
        });
        const named = await CounterModule._loadRecord('named@example.test', {
            force: true,
            rawOverride: rawThatThrows({ name: 'NamedStorageError' })
        });
        assert.equal(named.blockedError.name, 'NamedStorageError');
        const unknown = await CounterModule._loadRecord('unknown@example.test', {
            force: true,
            rawOverride: rawThatThrows({})
        });
        assert.deepEqual(unknown.blockedError, {});
        assert.equal(harness.logs.some(entry => entry.at(-1)?.code === 'UNKNOWN'), true);

        await CounterModule.destroy();
        const corruptIdentity = 'corrupt@example.test';
        harness.runtime.currentUser = corruptIdentity;
        harness.runtime.inspectingUser = corruptIdentity;
        harness.storage.values.set(storageKey(corruptIdentity), { format: 'unknown' });
        CounterModule.configure({ ...harness.dependencies, core: harness.core });
        await CounterModule.init();
        assert.equal(CounterModule.state.total, 0);
        assert.equal(CounterModule._records.get(corruptIdentity).blockedError.code, 'CORRUPT_INSIGHTS_STATE');
        assert.equal(CounterModule.attemptIncrement(), true);
        await assert.rejects(CounterModule.flushPendingSave(), error => error.code === 'CORRUPT_INSIGHTS_STATE');
        assert.equal(harness.storage.log.filter(item =>
            item.operation === 'set' && item.key === storageKey(corruptIdentity)
        ).length, 0);
    });

    it('isolates observer failures, validates dependencies, and handles init failure cleanup', async () => {
        const harness = createHarness({
            onChange: () => { throw new Error('UI observer failed'); }
        });
        CounterModule.subscribe(() => { throw new Error('subscriber failed'); });
        const normalEvents = [];
        CounterModule.subscribe(event => normalEvents.push(event.reason));
        await CounterModule.init();
        assert.equal(CounterModule.attemptIncrement(), true);
        assert.equal(normalEvents.includes('message'), true);
        assert.throws(() => CounterModule.configure({}), /while started/);
        assert.throws(() => CounterModule.subscribe(null), /listener/);
        await CounterModule.destroy();

        assert.throws(() => CounterModule.configure(null), /configuration/);
        const valid = harness.dependencies;
        for (const method of ['getCurrentUser', 'getInspectingUser', 'setInspectingUser', 'getChatId', 'getDayKey']) {
            const core = { ...valid.core };
            delete core[method];
            assert.throws(() => CounterModule.configure({ ...valid, core }), new RegExp(`core\\.${method}`));
        }
        for (const method of ['isInsideInputEditor', 'getClosestSendButton', 'detectModelKey', 'detectAccountTier']) {
            const adapter = { ...valid.adapter };
            delete adapter[method];
            assert.throws(() => CounterModule.configure({ ...valid, adapter }), new RegExp(`adapter\\.${method}`));
        }
        assert.throws(() => CounterModule.configure({ ...valid, storage: {} }), /storage/);
        const timerMethods = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'];
        for (const method of timerMethods) {
            const timers = Object.fromEntries(timerMethods.map(name => [name, valid.timers[name].bind(valid.timers)]));
            timers[method] = null;
            assert.throws(() => CounterModule.configure({ ...valid, timers }), new RegExp(`timers\\.${method}`));
        }
        for (const callback of ['now', 'translate', 'subscribeUserData']) {
            assert.throws(() => CounterModule.configure({ ...valid, [callback]: null }), new RegExp(callback));
        }
        assert.throws(() => CounterModule.configure({ ...valid, onChange: true }), /onChange/);
        assert.throws(() => CounterModule.configure({ ...valid, maxEvents: 0 }), /maxEvents/);

        const failing = createHarness();
        failing.storage.failGetFor.add('gemini_reset_hour');
        await assert.rejects(CounterModule.init(), /get failed/);
        assert.equal(CounterModule._started, false);
        assert.equal(CounterModule._controller, null);
        failing.storage.failGetFor.clear();
        await CounterModule.init();
        assert.equal(CounterModule._started, true);
    });

    it('exercises default storage fallbacks and optional document/subscription paths', async () => {
        const originalGet = globalThis.GM_getValue;
        const originalSet = globalThis.GM_setValue;
        const originalSetup = initialDefaultDependencies.core.setupStorageListener;
        try {
            delete globalThis.GM_getValue;
            delete globalThis.GM_setValue;
            assert.equal(initialDefaultDependencies.storage.get('missing', 17), 17);
            assert.equal(initialDefaultDependencies.storage.set('key', 1), undefined);
            globalThis.GM_getValue = (key, fallback) => `${key}:${fallback}`;
            let written;
            globalThis.GM_setValue = (key, value) => { written = [key, value]; return 'written'; };
            assert.equal(initialDefaultDependencies.storage.get('present', 3), 'present:3');
            assert.equal(initialDefaultDependencies.storage.set('key', 4), 'written');
            assert.deepEqual(written, ['key', 4]);
            const setupCalls = [];
            initialDefaultDependencies.core.setupStorageListener = (...args) => setupCalls.push(args);
            const release = initialDefaultDependencies.subscribeUserData('person@example.test', () => {});
            release();
            assert.deepEqual(setupCalls.map(call => call[0]), ['person@example.test', null]);
            assert.equal(initialDefaultDependencies.translate('中文', 'English'), 'English');
            assert.equal(typeof initialDefaultDependencies.now(), 'number');
        } finally {
            if (originalGet === undefined) delete globalThis.GM_getValue;
            else globalThis.GM_getValue = originalGet;
            if (originalSet === undefined) delete globalThis.GM_setValue;
            else globalThis.GM_setValue = originalSet;
            initialDefaultDependencies.core.setupStorageListener = originalSetup;
        }

        const harness = createHarness({ document: null, subscribeReturnsRelease: false });
        await CounterModule.init();
        CounterModule.bindEvents();
        assert.equal(CounterModule._boundKeyHandler, null);
        await CounterModule.loadDataForUser(null);
        assert.equal(CounterModule._storageUnsubscribe, null);
        await CounterModule.destroy();
        assert.equal(harness.released.length, 0);
    });

    it('covers feature projections, local-estimate validation, and controller sequence validation directly', () => {
        const state = insights.createInsightsState([
            insights.createInsightsEvent({
                kind: 'message',
                sessionIdentity: 'projection@example.test',
                model: 'custom-model',
                occurredAt: '2026-08-01T10:00:00Z'
            }, { clock: () => '2026-08-01T10:00:00Z' }),
            insights.createInsightsEvent({
                kind: 'chat',
                sessionIdentity: 'projection@example.test',
                occurredAt: '2026-08-01T10:01:00Z'
            }, { clock: () => '2026-08-01T10:01:00Z', sequence: 1 })
        ]);
        const projected = insights.projectInsightsToCounterState(state, { maxEvents: 10 });
        assert.deepEqual(insights.projectInsightsToCounterState(state), projected);
        assert.equal(projected.total, 1);
        assert.equal(projected.totalChatsCreated, 1);
        assert.deepEqual(projected.dailyCounts['2026-08-01'].byModel, {
            flash: 0, thinking: 0, pro: 0, 'custom-model': 1
        });
        assert.equal(projected.usageSemantics.serverQuota, false);
        assert.equal(projected.nativeUsageLimits.path, '/usage');

        const view = insights.createEstimatedUsageView({ messages: 0, weighted: 0, localTarget: 0 });
        assert.equal(view.window, null);
        for (const invalid of [
            { messages: -1, weighted: 0, localTarget: 0 },
            { messages: 0, weighted: Infinity, localTarget: 0 },
            { messages: 0, weighted: 0, localTarget: '50' }
        ]) {
            assert.throws(() => insights.createEstimatedUsageView(invalid), /non-negative finite number/);
        }
        assert.throws(() => new insights.InsightsSessionController({
            sessionIdentity: 'sequence@example.test',
            flush() {},
            clock: () => '2026-08-01T00:00:00Z',
            initialSequence: -1
        }), /initialSequence/);
    });

    it('uses deterministic init fallbacks and normalizes malformed public compatibility edits', async () => {
        const contextIdentity = 'context@example.test';
        const storage = new FakeStorage({ gemini_reset_hour: -1, gemini_quota_limit: 'bad' });
        const harness = createHarness({
            currentUser: null,
            inspectingUser: null,
            chatId: null,
            storage,
            resolveDayKey: null
        });
        await CounterModule.init({ session: contextIdentity });
        assert.equal(CounterModule._activeIdentity, contextIdentity);
        assert.equal(CounterModule.resetHour, 0);
        assert.equal(CounterModule.quotaLimit, 50);
        assert.equal(CounterModule.getTodayMessages(), 0);
        assert.deepEqual(CounterModule.getTodayByModel(), { flash: 0, thinking: 0, pro: 0 });
        assert.equal(CounterModule.ensureTodayEntry(), '2026-08-01');
        delete CounterModule.state.dailyCounts['2026-08-01'].byModel;
        CounterModule.ensureTodayEntry();
        assert.deepEqual(CounterModule.state.dailyCounts['2026-08-01'].byModel, {
            flash: 0, thinking: 0, pro: 0
        });
        CounterModule.state.dailyCounts['2026-08-01'].byModel.experimental = 2;
        assert.equal(CounterModule.getWeightedQuota(), 2);
        harness.adapter.detectModelKey = () => null;
        assert.equal(CounterModule.detectModel(), 'flash');
        CounterModule.currentModel = null;
        assert.equal(CounterModule.currentModel, 'flash');
        assert.equal(CounterModule.attemptIncrement(), false);
        CounterModule.resetHour = 4;
        assert.ok(CounterModule.getQuotaWindowState(new Date('2026-08-01T01:15:00')).remainingMs > 0);
        CounterModule.resetHour = 0;

        CounterModule.state.total = -1;
        CounterModule.state.totalChatsCreated = -1;
        CounterModule.state.chats = null;
        CounterModule.state.dailyCounts = {
            bad: {},
            '2026-07-30': null,
            '2026-07-31': { messages: -1, chats: -1, byModel: [] }
        };
        assert.equal(await CounterModule.saveData(), true);
        assert.equal(CounterModule.state.total, 0);
        assert.equal(CounterModule.state.totalChatsCreated, 0);
        assert.deepEqual(CounterModule.state.chats, {});
        assert.deepEqual(CounterModule.state.dailyCounts, {
            '2026-07-31': { messages: 0, chats: 0, byModel: { flash: 0, thinking: 0, pro: 0 } }
        });

        await CounterModule.destroy();
        harness.runtime.currentUser = null;
        harness.runtime.inspectingUser = null;
        CounterModule.configure({ ...harness.dependencies, core: harness.core });
        assert.equal(await CounterModule.loadDataForUser('Guest'), true);
        assert.equal(CounterModule._activeIdentity, 'Guest');
        CounterModule.configure({ ...harness.dependencies, core: harness.core });
        await CounterModule.init();
        assert.equal(CounterModule._activeIdentity, 'Guest');
    });

    it('covers cache misses, empty controllers, event limits, and temporary-email persistence guards', async () => {
        const harness = createHarness();
        assert.equal(await CounterModule.flushPendingSave(), false);
        assert.equal(CounterModule.getInsightsSnapshot().events.length, 0);
        assert.equal(CounterModule._activeRecord(), null);
        assert.equal(CounterModule._displayInsightsForAnalytics().events.length, 0);
        CounterModule._displayIdentity = 'missing@example.test';
        CounterModule._syncPublicState();
        await assert.rejects(
            CounterModule._commitEvents({ sessionIdentity: 'missing@example.test', events: [] }),
            /record is unavailable/
        );
        await assert.rejects(
            CounterModule._persistRecord({ identity: 'x@example.test', blockedError: new Error('blocked') }),
            /blocked/
        );
        assert.throws(() => CounterModule._captureActiveEvent('message'), /not started/);

        CounterModule.configure({ ...harness.dependencies, tempUser: 'temp@example.test' });
        assert.equal(await CounterModule._persistRecord({
            identity: 'temp@example.test',
            blockedError: null,
            compatibility: {},
            insights: insights.createInsightsState()
        }), false);

        const limited = createHarness({ maxEvents: 1, chatId: null });
        await CounterModule.init();
        assert.equal(CounterModule.attemptIncrement(), true);
        assert.throws(() => CounterModule.recordToolUse('canvas'), error => error.code === 'INSIGHTS_LIMIT_EXCEEDED');
        limited.storage.failSetFor.clear();
        await CounterModule.destroy();
    });

    it('runs debounced persistence callbacks and reports both save and external-update failures', async () => {
        const identity = 'debounce@example.test';
        const harness = createHarness({ currentUser: identity });
        await CounterModule.init();
        assert.equal(CounterModule.attemptIncrement(), true);
        const successfulTimer = CounterModule._saveTimer;
        assert.equal(harness.timers.runTimeout(successfulTimer), true);
        await settle();
        assert.equal(harness.storage.values.get(storageKey(identity)).total, 1);

        const originalSaveData = CounterModule.saveData;
        try {
            CounterModule.saveData = async () => { throw { name: 'NamedSaveError' }; };
            CounterModule._debouncedSave();
            harness.timers.runTimeout(CounterModule._saveTimer);
            await settle();
            assert.equal(harness.logs.some(entry => entry.at(-1)?.code === 'NamedSaveError'), true);
        } finally {
            CounterModule.saveData = originalSaveData;
        }

        harness.runtime.now += 2_000;
        assert.equal(CounterModule.recordToolUse('canvas'), true);
        harness.storage.failSetFor.add(storageKey(identity));
        const failingTimer = CounterModule._saveTimer;
        harness.timers.runTimeout(failingTimer);
        await settle();
        assert.equal(harness.logs.some(entry =>
            entry[0] === 'warn' && entry[1] === 'Failed to persist Counter Insights'
        ), true);

        harness.subscriptions.at(-1).listener(createLegacy({ total: 6 }));
        await settle();
        assert.equal(harness.logs.some(entry =>
            entry[0] === 'warn' && entry[1] === 'Counter external update rejected'
        ), true);
        const originalReplaceExternalRecord = CounterModule._replaceExternalRecord;
        try {
            CounterModule._replaceExternalRecord = async () => { throw { name: 'NamedExternalError' }; };
            harness.subscriptions.at(-1).listener(createLegacy({ total: 7 }));
            await settle();
            assert.equal(harness.logs.some(entry => entry.at(-1)?.code === 'NamedExternalError'), true);
        } finally {
            CounterModule._replaceExternalRecord = originalReplaceExternalRecord;
        }
        harness.storage.failSetFor.clear();
        await CounterModule.flushPendingSave();
    });

    it('routes injected and native-Core account mismatches without recording into the wrong identity', async () => {
        const first = 'route-first@example.test';
        const second = 'route-second@example.test';
        const harness = createHarness({ currentUser: first });
        await CounterModule.init();
        harness.runtime.currentUser = second;
        harness.runtime.inspectingUser = second;
        assert.equal(CounterModule.attemptIncrement(), false);
        await settle();
        assert.equal(CounterModule._activeIdentity, second);
        await CounterModule.destroy();

        const nativeCore = initialDefaultDependencies.core;
        const originals = Object.fromEntries(
            ['getCurrentUser', 'getInspectingUser', 'setInspectingUser', 'getChatId', 'getDayKey']
                .map(name => [name, nativeCore[name]])
        );
        const nativeRuntime = {
            current: first,
            inspecting: second,
            chatId: null,
            dayKey: '2026-08-01'
        };
        try {
            nativeCore.getCurrentUser = () => nativeRuntime.current;
            nativeCore.getInspectingUser = () => nativeRuntime.inspecting;
            nativeCore.setInspectingUser = identity => { nativeRuntime.inspecting = identity; };
            nativeCore.getChatId = () => nativeRuntime.chatId;
            nativeCore.getDayKey = () => nativeRuntime.dayKey;
            CounterModule.configure({ ...harness.dependencies, core: nativeCore });
            await CounterModule.init();
            assert.equal(CounterModule.isInspection(), true);
            assert.equal(CounterModule.attemptIncrement(), false);
            await settle();
            assert.equal(nativeRuntime.inspecting, first);
            assert.equal(CounterModule._displayIdentity, first);
        } finally {
            await CounterModule.destroy();
            Object.assign(nativeCore, originals);
        }
    });

    it('creates missing resolved-chat days and handles reset modes with no matching target', async () => {
        const harness = createHarness({
            chatId: 'new-day-chat',
            resolveDayKey: () => '2026-07-31'
        });
        await CounterModule.init();
        assert.equal(CounterModule.attemptIncrement(), true);
        assert.equal(CounterModule.state.dailyCounts['2026-07-31'].chats, 1);

        CounterModule.state.viewMode = 'today';
        delete CounterModule.state.dailyCounts['2026-08-01'];
        CounterModule.handleReset();
        CounterModule.handleReset();
        await settle();
        harness.runtime.chatId = null;
        CounterModule.state.viewMode = 'chat';
        CounterModule.handleReset();
        CounterModule.handleReset();
        await settle();
        CounterModule.state.viewMode = 'unknown';
        CounterModule.handleReset();
        CounterModule.handleReset();
        await settle();

        await CounterModule.destroy();
        assert.equal(CounterModule._displayInsightsForAnalytics().events.length > 0, true);
    });
});
