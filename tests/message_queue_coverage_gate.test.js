const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const adaptersModule = import('../src/features/message_queue/legacy_adapters.js');
const outboxModule = import('../src/features/message_queue/outbox.js');

class CoverageTimers {
    constructor() {
        this.nextId = 1;
        this.scheduled = new Map();
    }

    set(callback, delay) {
        const id = this.nextId++;
        this.scheduled.set(id, { callback, delay });
        return id;
    }

    clear(id) {
        this.scheduled.delete(id);
    }

    async delay() {}
}

async function createOutboxHarness() {
    const { createMessageQueueOutbox } = await outboxModule;
    const storage = {};
    const context = {
        storageKey: 'gemini_message_queue_coverage@example.test',
        routeKey: 'https://gemini.google.com/app/coverage',
        visible: true
    };
    const composer = { editor: {}, text: '' };
    const timers = new CoverageTimers();
    const calls = { commits: 0, errors: [] };
    const repository = {
        read(key, fallback) {
            return Object.prototype.hasOwnProperty.call(storage, key)
                ? structuredClone(storage[key])
                : fallback;
        },
        write(key, value) {
            storage[key] = structuredClone(value);
        }
    };
    const delivery = {
        inspect: () => ({ editorReady: true }),
        stage(text) {
            composer.text = String(text).trim();
            return { ok: true, baseline: { editor: composer.editor, text: composer.text } };
        },
        verifyStage: () => ({ ok: true }),
        prepareCommit() {
            return () => { calls.commits += 1; };
        }
    };
    const outbox = createMessageQueueOutbox({
        repository,
        delivery,
        timers,
        getContext: () => context,
        now: () => '2026-08-01T00:00:00.000Z',
        makeIdPrefix: () => 'coverage',
        reportError: message => calls.errors.push(message)
    });
    return { calls, composer, context, delivery, outbox, storage, timers };
}

function begin(outbox, text = 'coverage message') {
    assert.equal(outbox.start(), true);
    assert.equal(outbox.enqueue(text, { id: 'coverage-item' }), true);
    assert.equal(outbox.resume(), true);
    return outbox.processNext(outbox.session);
}

describe('Message Queue source coverage gate', () => {
    it('normalizes nullish legacy staging text and a missing baseline text field', async () => {
        const { createLegacyQueueDelivery } = await adaptersModule;
        const editor = {
            value: '',
            dispatchEvent: () => true,
            focus() {}
        };
        const delivery = createLegacyQueueDelivery({
            environment: {
                Event: class {
                    constructor(type, options) {
                        this.type = type;
                        this.options = options;
                    }
                }
            },
            adapter: {
                getActiveToolMode: () => null,
                getInputEditor: () => editor,
                getSendButton: () => null,
                isSendButtonElement: () => false
            }
        });

        const staged = delivery.stage(null);
        assert.equal(staged.ok, true);
        assert.equal(staged.baseline.text, '');
        assert.deepEqual(delivery.verifyStage({ editor }), { ok: true, reason: '' });
    });

    it('rejects stale cancellation and context changes before the outbox starts', async () => {
        const { outbox } = await createOutboxHarness();

        assert.equal(outbox.cancelStaleAttempt(), false);
        assert.equal(outbox.changeContext(), false);
    });

    it('guards committed runs and defaults blank cancellation reasons', async () => {
        const { outbox } = await createOutboxHarness();
        assert.equal(outbox.start(), true);
        assert.equal(outbox.enqueue('cancel coverage', { id: 'coverage-item' }), true);
        const run = {
            session: outbox._captureSession(),
            itemId: 'coverage-item',
            commitStarted: true
        };
        outbox.activeRun = run;

        assert.equal(outbox._cancelRun(run, 'ignored after commit'), false);
        assert.equal(outbox.activeRun, run);

        run.commitStarted = false;
        assert.equal(outbox._cancelRun(run, '   '), false);
        const snapshot = outbox.getSnapshot();
        assert.equal(snapshot.items[0].status, 'cancelled');
        assert.equal(snapshot.lastError, 'Queue send cancelled: composer changed');
        assert.deepEqual(outbox.getRuntimeState().activeRun, null);
    });

    it('contains invalidation and route drift immediately after stage and commit preparation', async () => {
        for (const boundary of ['stage-invalidation', 'stage-drift', 'commit-invalidation', 'commit-drift']) {
            const harness = await createOutboxHarness();
            const originalStage = harness.delivery.stage.bind(harness.delivery);

            if (boundary === 'stage-invalidation') {
                harness.delivery.stage = text => {
                    const staged = originalStage(text);
                    harness.outbox.pause();
                    return staged;
                };
            } else if (boundary === 'stage-drift') {
                harness.delivery.stage = text => {
                    const staged = originalStage(text);
                    harness.context.routeKey = 'https://gemini.google.com/app/stage-drift';
                    return staged;
                };
            } else if (boundary === 'commit-invalidation') {
                harness.delivery.prepareCommit = () => {
                    harness.outbox.pause();
                    return () => { harness.calls.commits += 1; };
                };
            } else {
                harness.delivery.prepareCommit = () => {
                    harness.context.routeKey = 'https://gemini.google.com/app/commit-drift';
                    return () => { harness.calls.commits += 1; };
                };
            }

            assert.equal(await begin(harness.outbox), false, boundary);
            assert.equal(harness.calls.commits, 0, boundary);
            assert.equal(harness.outbox.getSnapshot().paused, true, boundary);
            if (boundary.endsWith('drift')) {
                assert.equal(harness.outbox.getSnapshot().items[0].status, 'cancelled', boundary);
                assert.equal(
                    harness.outbox.getSnapshot().lastError,
                    'Queue send cancelled: route changed',
                    boundary
                );
            }
        }
    });
});
