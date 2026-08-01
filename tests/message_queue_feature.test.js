const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const featureModule = import('../src/features/message_queue/outbox.js');

class FakeTimers {
    constructor() {
        this.nextId = 1;
        this.scheduled = new Map();
        this.cleared = [];
        this.delayImpl = async () => {};
        this.lastCallback = null;
    }

    set(callback, delay) {
        const id = this.nextId++;
        this.scheduled.set(id, { callback, delay });
        this.lastCallback = callback;
        return id;
    }

    clear(id) {
        this.cleared.push(id);
        this.scheduled.delete(id);
    }

    delay(ms) {
        return this.delayImpl(ms);
    }

    run(id = [...this.scheduled.keys()].at(-1)) {
        const entry = this.scheduled.get(id);
        if (!entry) return false;
        this.scheduled.delete(id);
        entry.callback();
        return true;
    }

    deferDelay() {
        let release;
        this.delayImpl = () => new Promise(resolve => { release = resolve; });
        return () => release();
    }
}

function createTestDelivery(overrides = {}, composer = { editor: {}, text: '' }) {
    return {
        inspect: () => ({ editorReady: true }),
        stage(text) {
            composer.text = String(text).trim();
            return { ok: true, baseline: { editor: composer.editor, text: composer.text } };
        },
        verifyStage(baseline) {
            if (baseline.editor !== composer.editor) {
                return { ok: false, reason: 'Queue send cancelled: composer editor changed' };
            }
            if (baseline.text !== composer.text) {
                return { ok: false, reason: 'Queue send cancelled: composer text changed' };
            }
            return { ok: true };
        },
        prepareCommit: () => () => {},
        ...overrides
    };
}

async function createHarness(overrides = {}) {
    const { createMessageQueueOutbox } = await featureModule;
    const storage = { ...(overrides.storage || {}) };
    const context = {
        storageKey: 'gemini_message_queue_first@example.com',
        routeKey: 'https://gemini.google.com/app/one',
        visible: true,
        ...(overrides.context || {})
    };
    const timers = overrides.timers || new FakeTimers();
    const notifications = [];
    const errors = [];
    const calls = { commits: 0, inspected: 0, staged: [] };
    const composer = overrides.composer || { editor: {}, text: '' };
    let prefix = 0;
    const repository = overrides.repository || {
        read(key, fallback) {
            return Object.prototype.hasOwnProperty.call(storage, key)
                ? structuredClone(storage[key])
                : fallback;
        },
        write(key, value) {
            storage[key] = structuredClone(value);
        }
    };
    const delivery = createTestDelivery(overrides.delivery || {
        inspect() {
            calls.inspected += 1;
            return { editorReady: true };
        },
        stage(text) {
            calls.staged.push(text);
            composer.text = String(text).trim();
            return { ok: true, baseline: { editor: composer.editor, text: composer.text } };
        },
        verifyStage(baseline) {
            if (baseline.editor !== composer.editor) {
                return { ok: false, reason: 'Queue send cancelled: composer editor changed' };
            }
            if (baseline.text !== composer.text) {
                return { ok: false, reason: 'Queue send cancelled: composer text changed' };
            }
            return { ok: true };
        },
        prepareCommit() {
            return () => { calls.commits += 1; };
        }
    }, composer);
    const outbox = createMessageQueueOutbox({
        repository,
        delivery,
        timers,
        getContext: overrides.getContext || (() => context),
        now: overrides.now || (() => '2026-08-01T00:00:00.000Z'),
        makeIdPrefix: overrides.makeIdPrefix || (() => `test_${++prefix}`),
        notify: overrides.notify || ((snapshot, runtime) => notifications.push({ snapshot, runtime })),
        reportError: overrides.reportError || (message => errors.push(message)),
        startDelayMs: overrides.startDelayMs,
        sendReadyDelayMs: overrides.sendReadyDelayMs
    });
    return { calls, composer, context, delivery, errors, notifications, outbox, repository, storage, timers };
}

async function begin(outbox, entries = ['first']) {
    outbox.start();
    outbox.enqueueEntries(entries, { idPrefix: 'entry' });
    outbox.resume();
    const session = outbox.session;
    return { pending: outbox.processNext(session), session };
}

describe('MessageQueueOutbox contracts and lifecycle', () => {
    it('validates every injected boundary and supports the factory defaults', async () => {
        const {
            DEFAULT_QUEUE_START_DELAY_MS,
            DEFAULT_SEND_READY_DELAY_MS,
            MESSAGE_QUEUE_OUTBOX_CAPABILITY,
            MessageQueueOutbox,
            createMessageQueueOutbox
        } = await featureModule;
        assert.equal(MESSAGE_QUEUE_OUTBOX_CAPABILITY, 'message-queue.outbox');
        assert.throws(() => new MessageQueueOutbox(null), /options must be an object/);
        assert.throws(() => new MessageQueueOutbox([]), /options must be an object/);

        const valid = (await createHarness()).outbox;
        const options = {
            repository: valid.repository,
            delivery: valid.delivery,
            timers: valid.timers,
            getContext: valid.getContext,
            now: valid.now,
            makeIdPrefix: valid.makeIdPrefix
        };
        for (const [field, expected] of [
            ['repository', /repository must be an object/],
            ['delivery', /delivery adapter must be an object/],
            ['timers', /timers must be an object/]
        ]) {
            assert.throws(() => new MessageQueueOutbox({ ...options, [field]: null }), expected);
        }
        for (const [owner, methods] of [
            ['repository', ['read', 'write']],
            ['delivery', ['inspect', 'stage', 'verifyStage', 'prepareCommit']],
            ['timers', ['set', 'clear', 'delay']]
        ]) {
            for (const method of methods) {
                const boundary = Object.create(options[owner]);
                boundary[method] = null;
                assert.throws(
                    () => new MessageQueueOutbox({ ...options, [owner]: boundary }),
                    new RegExp(`${owner}.${method} must be a function`)
                );
            }
        }
        for (const field of ['getContext', 'now', 'makeIdPrefix']) {
            assert.throws(() => new MessageQueueOutbox({ ...options, [field]: null }), new RegExp(field));
        }
        assert.throws(() => new MessageQueueOutbox({ ...options, notify: 1 }), /notify must be a function/);
        assert.throws(() => new MessageQueueOutbox({ ...options, reportError: 1 }), /reportError must be a function/);
        for (const [field, value] of [['startDelayMs', -1], ['sendReadyDelayMs', Number.NaN]]) {
            assert.throws(() => new MessageQueueOutbox({ ...options, [field]: value }), /non-negative number/);
        }

        const defaults = createMessageQueueOutbox(options);
        assert.equal(defaults.startDelayMs, DEFAULT_QUEUE_START_DELAY_MS);
        assert.equal(defaults.sendReadyDelayMs, DEFAULT_SEND_READY_DELAY_MS);
        assert.equal(defaults.persist(), false);
        assert.equal(defaults._captureSession().storageKey, 'gemini_message_queue_first@example.com');
        assert.equal(defaults._schedule(0, null), false);
        assert.equal(defaults.pause(), false);
        assert.equal(defaults.start(), true);
        defaults.enqueue('will pause');
        defaults.delivery.inspect = () => ({ editorReady: false });
        defaults.resume();
        await defaults.processNext(defaults.session);
        assert.equal(defaults.data, undefined);
        assert.equal(defaults._pauseWithError(''), false);

        const staleRun = {};
        assert.equal(defaults._failRun(staleRun, 'stale'), false);
        defaults.activeRun = staleRun;
        staleRun.itemId = defaults.getSnapshot().items[0].id;
        assert.equal(defaults._failRun(staleRun, ''), false);
    });

    it('loads legacy state paused, isolates storage failures, and makes lifecycle transitions idempotent', async () => {
        const key = 'gemini_message_queue_first@example.com';
        const harness = await createHarness({
            storage: {
                [key]: {
                    paused: false,
                    activeId: 'legacy',
                    items: [{ id: 'legacy', text: 'legacy', status: 'sending' }]
                }
            }
        });
        const { outbox } = harness;
        assert.equal(outbox.stop(), false);
        assert.equal(outbox.start(), true);
        assert.equal(outbox.start(), false);
        assert.equal(outbox.getSnapshot().paused, true);
        assert.equal(outbox.getSnapshot().items[0].status, 'queued');
        assert.equal(Object.isFrozen(outbox.getRuntimeState()), true);
        assert.equal(harness.storage[key].paused, true);

        harness.context.storageKey = 'gemini_message_queue_second@example.com';
        assert.equal(outbox.changeContext(), true);
        assert.equal(outbox.loadedStorageKey, harness.context.storageKey);
        assert.equal(outbox.getSnapshot().items.length, 0);
        assert.equal(outbox.reload(), true);
        assert.equal(outbox.stop(), true);
        assert.equal(outbox.reload(), false);
        assert.equal(outbox.stop(), false);
        assert.equal(outbox.dispose(), true);
        assert.equal(outbox.dispose(), false);
        assert.equal(outbox.start(), false);

        const detached = await createHarness();
        assert.equal(detached.outbox.dispose(), true);
        const broken = await createHarness({
            repository: {
                read() { throw new Error('read failed'); },
                write() { throw new Error('write failed'); }
            },
            notify() { throw new Error('observer failed'); },
            reportError() { throw new Error('reporter failed'); }
        });
        assert.equal(broken.outbox.start(), true);
        assert.equal(broken.outbox.persist(), false);
        broken.outbox.enqueue('one');
        broken.delivery.inspect = () => { throw new Error('unsafe'); };
        broken.outbox.resume();
        await broken.outbox.processNext(broken.outbox.session);
        assert.equal(broken.outbox.getSnapshot().lastError, 'unsafe');

        const contextless = await createHarness({ getContext: () => null, now: () => ' ' });
        assert.equal(contextless.outbox.start(), true);
        assert.equal(contextless.outbox.loadedStorageKey, '');
        assert.equal(contextless.outbox.persist(), false);
    });

    it('exposes mutation capabilities and enforces pause, cancel, remove, reorder, and history boundaries', async () => {
        const { outbox, timers } = await createHarness();
        assert.equal(outbox.resume(), false);
        outbox.start();
        assert.equal(outbox.pause(), false);
        assert.equal(outbox.resume(), false);
        assert.equal(outbox.enqueue('   '), false);
        assert.equal(outbox.enqueue('one', { id: 'one' }), true);
        assert.equal(outbox.enqueue('two'), true);
        assert.equal(outbox.enqueueEntries([], { idPrefix: 'empty' }), 0);
        assert.equal(outbox.enqueueEntries([{ text: 'three', id: 'three' }, 'four']), 2);
        assert.equal(outbox.move('missing', 'up'), false);
        assert.equal(outbox.move('one', 'up'), false);
        assert.equal(outbox.move('one', 'down'), true);
        assert.equal(outbox.cancel('missing'), false);
        assert.equal(outbox.cancel('three'), true);
        assert.equal(outbox.remove('missing'), false);
        assert.equal(outbox.remove('three'), true);
        assert.equal(outbox.clearHistory(), false);

        assert.equal(outbox.resume(), true);
        assert.equal(outbox.resume(), false);
        const firstTimer = outbox.timer;
        assert.equal(outbox.setInterval(3200), true);
        assert.equal(timers.cleared.includes(firstTimer), true);
        assert.equal(outbox.setInterval(3200), false);
        assert.equal(outbox.pause(), true);
        assert.equal(outbox.setInterval(1600), true);

        const capability = outbox.getCapability();
        assert.equal(Object.isFrozen(capability), true);
        assert.equal(capability.enqueue('five', { id: 'five' }), true);
        assert.equal(capability.enqueueEntries(['six'], { idPrefix: 'cap' }), 1);
        assert.equal(capability.move('five', 'down'), true);
        assert.equal(capability.cancel('five'), true);
        assert.equal(capability.remove('five'), true);
        assert.equal(capability.cancel('cap_1'), true);
        assert.equal(capability.clearHistory(), true);
        assert.equal(capability.setInterval(1800), true);
        assert.equal(capability.resume(), true);
        assert.equal(capability.pause(), true);
        assert.equal(capability.getStats().queued > 0, true);
        assert.equal(capability.getSnapshot().paused, true);
    });
});

describe('MessageQueueOutbox delivery transaction', () => {
    it('sends once, serializes duplicate processors, and waits for an explicit next schedule', async () => {
        const harness = await createHarness();
        const { outbox, timers } = harness;
        outbox.start();
        outbox.enqueueEntries(['first'], { idPrefix: 'send' });
        outbox.resume();
        const session = outbox.session;
        const first = outbox.processNext(session);
        const duplicate = outbox.processNext(session);
        assert.equal(await duplicate, false);
        assert.equal(await first, true);
        assert.equal(harness.calls.commits, 1);
        assert.equal(outbox.getSnapshot().items[0].status, 'sent');
        assert.notEqual(outbox.timer, null);
        assert.equal(timers.run(outbox.timer), true);
        await Promise.resolve();
        assert.equal(harness.calls.commits, 1);
        assert.equal(outbox.getSnapshot().paused, false);
    });

    it('pauses without automatic retry for every safety, stage, delay, and commit failure', async () => {
        const cases = [
            {
                expected: 'Tool mode active: Canvas',
                delivery: {
                    inspect: () => ({ toolModeActive: true, toolModeLabel: 'Canvas' }),
                    stage: () => ({ ok: true }),
                    prepareCommit: () => () => {}
                }
            },
            {
                expected: 'Queue safety check failed',
                delivery: {
                    inspect() { throw ''; },
                    stage: () => ({ ok: true }),
                    prepareCommit: () => () => {}
                }
            },
            {
                expected: 'Input editor unavailable',
                delivery: {
                    inspect: () => ({ editorReady: true }),
                    stage: () => false,
                    prepareCommit: () => () => {}
                }
            },
            {
                expected: 'staging denied',
                delivery: {
                    inspect: () => ({ editorReady: true }),
                    stage: () => ({ ok: false, reason: ' staging denied ' }),
                    prepareCommit: () => () => {}
                }
            },
            {
                expected: 'Queue editor staging failed',
                delivery: {
                    inspect: () => ({ editorReady: true }),
                    stage() { throw ''; },
                    prepareCommit: () => () => {}
                }
            },
            {
                expected: 'Queue send delay failed',
                timers: Object.assign(new FakeTimers(), {
                    delayImpl: async () => { throw ''; }
                })
            },
            {
                expected: 'Send button unavailable',
                delivery: {
                    inspect: () => ({ editorReady: true }),
                    prepareCommit() { throw ''; }
                }
            },
            {
                expected: 'Send button unavailable',
                delivery: {
                    inspect: () => ({ editorReady: true }),
                    prepareCommit: () => null
                }
            },
            {
                expected: 'click failed',
                delivery: {
                    inspect: () => ({ editorReady: true }),
                    prepareCommit: () => () => { throw new Error('click failed'); }
                }
            },
            {
                expected: 'Queue send failed',
                delivery: {
                    inspect: () => ({ editorReady: true }),
                    prepareCommit: () => () => false
                }
            }
        ];

        for (const specification of cases) {
            const harness = await createHarness(specification);
            const transaction = await begin(harness.outbox);
            assert.equal(await transaction.pending, false, specification.expected);
            assert.equal(harness.outbox.getSnapshot().paused, true);
            assert.equal(harness.outbox.getSnapshot().items[0].status, 'queued');
            assert.equal(harness.outbox.getSnapshot().lastError, specification.expected);
            assert.equal(harness.outbox.timer, null);
            assert.equal(harness.outbox.resume(), true, 'retry remains explicit');
        }
    });

    it('cancels account, session, route, and visibility drift before commit', async () => {
        const reasons = {
            account: 'Queue send cancelled: session changed',
            session: 'Queue send cancelled: session changed',
            route: 'Queue send cancelled: route changed',
            visibility: 'Queue send cancelled: page hidden'
        };
        for (const transition of Object.keys(reasons)) {
            const harness = await createHarness();
            const release = harness.timers.deferDelay();
            const { pending, session } = await begin(harness.outbox);
            assert.equal(harness.outbox.getSnapshot().items[0].status, 'sending');
            if (transition === 'account') {
                harness.context.storageKey = 'gemini_message_queue_second@example.com';
                harness.outbox.changeContext();
            } else if (transition === 'session') {
                harness.outbox.session = { ...session };
            } else if (transition === 'route') {
                harness.context.routeKey = 'https://gemini.google.com/app/two';
            } else {
                harness.context.visible = false;
            }
            release();
            assert.equal(await pending, false);
            assert.equal(harness.calls.commits, 0);
            assert.equal(harness.outbox.getSnapshot().paused, true);
            const cancelledState = transition === 'account'
                ? harness.storage['gemini_message_queue_first@example.com']
                : harness.outbox.getSnapshot();
            assert.equal(cancelledState.items[0].status, 'cancelled');
            assert.equal(cancelledState.lastError, reasons[transition]);
            assert.equal(harness.outbox.timer, null);
        }
    });

    it('keeps Primer staging as the baseline and cancels fake-composer text or editor drift', async () => {
        for (const drift of ['text', 'editor']) {
            const harness = await createHarness();
            const release = harness.timers.deferDelay();
            const { pending } = await begin(harness.outbox, ['Primer staged text']);
            await Promise.resolve();
            assert.equal(harness.composer.text, 'Primer staged text');
            if (drift === 'text') harness.composer.text = 'user replacement';
            else harness.composer.editor = {};
            release();
            assert.equal(await pending, false);
            const state = harness.outbox.getSnapshot();
            assert.equal(harness.calls.commits, 0);
            assert.equal(state.items[0].status, 'cancelled');
            assert.equal(state.lastError, `Queue send cancelled: composer ${drift} changed`);
            assert.equal(harness.outbox.resume(), false, 'cancelled work is never retried');
        }
    });

    it('cancels unverifiable composer baselines without sending or retrying', async () => {
        const cases = [
            {
                expected: 'Queue send cancelled: composer baseline unavailable',
                delivery: { stage: () => ({ ok: true }) }
            },
            {
                expected: 'Queue send cancelled: composer baseline unavailable',
                delivery: { stage: () => ({ ok: true, baseline: [] }) }
            },
            {
                expected: 'Queue send cancelled: composer changed',
                delivery: { verifyStage: () => false }
            },
            {
                expected: 'custom composer drift',
                delivery: { verifyStage: () => ({ ok: false, reason: ' custom composer drift ' }) }
            },
            {
                expected: 'Queue send cancelled: composer verification failed',
                delivery: { verifyStage() { throw ''; } }
            }
        ];
        for (const specification of cases) {
            const harness = await createHarness(specification);
            const { pending } = await begin(harness.outbox);
            assert.equal(await pending, false);
            const state = harness.outbox.getSnapshot();
            assert.equal(harness.calls.commits, 0);
            assert.equal(state.items[0].status, 'cancelled');
            assert.equal(state.lastError, specification.expected);
            assert.equal(harness.outbox.resume(), false);
        }
    });

    it('defines active cancellation, removal, reordering, and stale-failure boundaries', async () => {
        const cancelHarness = await createHarness();
        let release = cancelHarness.timers.deferDelay();
        let transaction = await begin(cancelHarness.outbox, ['cancel me', 'later']);
        const activeId = cancelHarness.outbox.activeRun.itemId;
        assert.equal(cancelHarness.outbox.move(activeId, 'down'), false);
        assert.equal(cancelHarness.outbox.cancel(activeId), true);
        release();
        assert.equal(await transaction.pending, false);
        assert.equal(cancelHarness.outbox.getSnapshot().items[0].status, 'cancelled');

        const removeHarness = await createHarness();
        release = removeHarness.timers.deferDelay();
        transaction = await begin(removeHarness.outbox, ['remove me']);
        const removedId = removeHarness.outbox.activeRun.itemId;
        assert.equal(removeHarness.outbox.remove(removedId), true);
        release();
        assert.equal(await transaction.pending, false);
        assert.equal(removeHarness.outbox.getSnapshot().items.length, 0);
    });

    it('marks a committed item sent exactly once across synchronous suspension boundaries', async () => {
        for (const action of ['pause', 'cancel', 'remove', 'route-stale']) {
            let outbox;
            const delivery = {
                inspect: () => ({ editorReady: true }),
                prepareCommit: () => () => {
                    if (action === 'pause') outbox.pause();
                    if (action === 'cancel') outbox.cancel(outbox.activeRun.itemId);
                    if (action === 'remove') outbox.remove(outbox.activeRun.itemId);
                    if (action === 'route-stale') outbox.getContext().routeKey = 'changed';
                }
            };
            const harness = await createHarness({ delivery });
            outbox = harness.outbox;
            const { pending } = await begin(outbox);
            assert.equal(await pending, true);
            assert.equal(outbox.getSnapshot().items[0].status, 'sent');
            assert.equal(outbox.getSnapshot().paused, true);
            assert.equal(outbox.timer, null);
        }
    });

    it('contains stale scheduled callbacks for both retained and invalidated sessions', async () => {
        const harness = await createHarness();
        harness.outbox.start();
        harness.outbox.enqueue('one');
        harness.outbox.resume();
        const callback = harness.timers.lastCallback;
        harness.context.routeKey = 'stale';
        callback();
        assert.equal(harness.outbox.getSnapshot().paused, true);

        harness.context.routeKey = 'https://gemini.google.com/app/one';
        harness.outbox.resume();
        const invalidated = harness.timers.lastCallback;
        harness.outbox.pause();
        invalidated();
        assert.equal(harness.outbox.getSnapshot().paused, true);
    });
});
