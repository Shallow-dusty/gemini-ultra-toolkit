const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let queueApi;
let recipesApi;
let restoreApi;

before(async () => {
    [queueApi, recipesApi, restoreApi] = await Promise.all([
        import(pathToFileURL(path.join(__dirname, '..', 'src', 'features', 'message_queue', 'index.js')).href),
        import(pathToFileURL(path.join(__dirname, '..', 'src', 'features', 'recipes', 'index.js')).href),
        import(pathToFileURL(path.join(
            __dirname, '..', 'src', 'features', 'portable_archive', 'restore_executor.js'
        )).href)
    ]);
});

const clone = value => structuredClone(value);
const CHECKSUM = 'a'.repeat(64);
const NOW = '2026-08-01T00:00:00.000Z';

function recipeRecord(id, title = id) {
    const version = recipesApi.createRecipeVersion({
        title,
        description: '',
        variables: [],
        steps: [{
            id: 'draft',
            title: 'Draft',
            template: `${title} body`,
            permissions: ['composer.insert']
        }],
        permissions: ['composer.insert'],
        provenance: { source: 'test' }
    }, { id, now: NOW, createdAt: NOW });
    return { id, currentVersion: 1, versions: [version] };
}

function recipeState(records = []) {
    return { schemaVersion: 1, ownerSessionId: 'restore@example.test', records };
}

class RecipeRepository {
    constructor(value) {
        this.value = clone(value);
        this.flushCount = 0;
        this.afterUpdate = null;
    }

    async get() { return clone(this.value); }

    async update(updater) {
        this.value = clone(await updater(clone(this.value)));
        this.afterUpdate?.();
        return clone(this.value);
    }

    async flush() { this.flushCount += 1; }
}

function queueItem(id, text = id, overrides = {}) {
    return {
        id,
        title: text,
        text,
        status: 'queued',
        createdAt: NOW,
        updatedAt: NOW,
        sentAt: '',
        error: '',
        ...overrides
    };
}

function queueState(items = [], overrides = {}) {
    return {
        paused: true,
        activeId: '',
        lastError: '',
        intervalMs: 1600,
        items,
        ...overrides
    };
}

class QueueRepository {
    constructor(storageKey, value) {
        this.storage = new Map([[storageKey, clone(value)]]);
        this.failNext = false;
        this.failOnItemId = null;
        this.writeCount = 0;
    }

    read(key, fallback) {
        return this.storage.has(key) ? clone(this.storage.get(key)) : fallback;
    }

    write(key, value) {
        this.writeCount += 1;
        if (this.failNext || value?.items?.some(item => item.id === this.failOnItemId)) {
            this.failNext = false;
            this.failOnItemId = null;
            throw new Error('queue repository failed');
        }
        this.storage.set(key, clone(value));
    }
}

function createQueueHarness(initial = queueState()) {
    const storageKey = 'gemini_message_queue_restore@example.test';
    const repository = new QueueRepository(storageKey, initial);
    const deliveryCalls = { inspect: 0, stage: 0, commit: 0 };
    const outbox = queueApi.createMessageQueueOutbox({
        repository,
        delivery: {
            inspect() { deliveryCalls.inspect += 1; return { editorReady: true }; },
            stage(text) {
                deliveryCalls.stage += 1;
                return { ok: true, baseline: { editor: deliveryCalls, text } };
            },
            verifyStage() { return { ok: true }; },
            prepareCommit() { return () => { deliveryCalls.commit += 1; }; }
        },
        timers: {
            set() { return 1; },
            clear() {},
            async delay() {}
        },
        getContext: () => ({ storageKey, routeKey: '/restore', visible: true }),
        now: () => NOW,
        makeIdPrefix: () => 'restore'
    });
    assert.equal(outbox.start(), true);
    return { deliveryCalls, outbox, repository, storageKey };
}

function restoreAction(section, action, value, targetIdentity = value.id) {
    return {
        section,
        action,
        incomingIdentity: value.id,
        targetIdentity,
        identityPatch: action === 'rename' ? { field: 'id', value: targetIdentity } : null,
        value: clone(value)
    };
}

function restorePlan(sections) {
    const summary = { total: 0, insert: 0, skip: 0, replace: 0, rename: 0 };
    const normalized = sections.map(({ name, actions }) => {
        const sectionSummary = { total: actions.length, insert: 0, skip: 0, replace: 0, rename: 0 };
        for (const action of actions) {
            sectionSummary[action.action] += 1;
            summary[action.action] += 1;
            summary.total += 1;
        }
        return { name, summary: sectionSummary, actions };
    });
    return { dryRun: true, strategy: 'replace', archiveChecksum: CHECKSUM, summary, sections: normalized };
}

function contributorContext(section, actions, snapshot, signal = undefined) {
    return { section, plan: {}, actions, snapshot, signal };
}

describe('Recipes restore contributor', () => {
    it('applies selected insert/replace/rename actions atomically and restores its isolated snapshot', async () => {
        const original = recipeState([recipeRecord('keep'), recipeRecord('replace', 'old')]);
        const repository = new RecipeRepository(original);
        const contributor = recipesApi.createRecipesRestoreContributor({ repository });
        assert.equal(recipesApi.RECIPES_RESTORE_SECTION, 'recipes');
        assert.deepEqual(Object.keys(contributor), ['snapshot', 'apply', 'rollback']);

        const actions = [
            restoreAction('recipes', 'insert', recipeRecord('inserted')),
            restoreAction('recipes', 'replace', recipeRecord('replace', 'new')),
            restoreAction('recipes', 'rename', recipeRecord('foreign'), 'foreign~imported')
        ];
        const snapshot = await contributor.snapshot(contributorContext('recipes', actions));
        snapshot.records[0].versions[0].title = 'caller mutation';
        assert.equal(repository.value.records[0].versions[0].title, 'keep');
        const cleanSnapshot = await contributor.snapshot(contributorContext('recipes', actions));

        assert.deepEqual(await contributor.apply(contributorContext('recipes', actions, cleanSnapshot)), {
            applied: 3,
            ids: ['inserted', 'replace', 'foreign~imported']
        });
        assert.deepEqual(repository.value.records.map(record => record.id), [
            'keep', 'replace', 'inserted', 'foreign~imported'
        ]);
        assert.equal(repository.value.records[1].versions[0].title, 'new');
        assert.equal(repository.value.records.at(-1).versions[0].id, 'foreign~imported');

        assert.deepEqual(await contributor.rollback(contributorContext('recipes', actions, cleanSnapshot)), {
            restored: 2
        });
        assert.deepEqual(repository.value, original);
        assert.equal(repository.flushCount, 2);
    });

    it('rejects invalid ports, stale plans, invalid actions, account drift, and aborts', async () => {
        assert.throws(() => recipesApi.createRecipesRestoreContributor(null), /options must be an object/);
        assert.throws(() => recipesApi.createRecipesRestoreContributor({}), /repository must be an object/);
        for (const method of ['get', 'update', 'flush']) {
            const repository = { get() {}, update() {}, flush() {} };
            delete repository[method];
            assert.throws(() => recipesApi.createRecipesRestoreContributor({ repository }), new RegExp(method));
        }

        const repository = new RecipeRepository(recipeState([recipeRecord('exists')]));
        const contributor = recipesApi.createRecipesRestoreContributor({ repository });
        const base = await contributor.snapshot(contributorContext('recipes', []));
        await assert.rejects(contributor.snapshot(null), error => error.code === 'INVALID_RESTORE_PORT');
        await assert.rejects(contributor.snapshot(contributorContext('queue', [])), error => (
            error.code === 'INVALID_RESTORE_CONTEXT'
        ));
        await assert.rejects(
            contributor.snapshot({ section: 'recipes', plan: [], actions: [] }),
            error => error.code === 'INVALID_RESTORE_CONTEXT'
        );
        const ownerless = new RecipeRepository({ schemaVersion: 1, records: [] });
        await assert.rejects(
            recipesApi.createRecipesRestoreContributor({ repository: ownerless }).snapshot(
                contributorContext('recipes', [])
            ),
            error => error.code === 'INVALID_RESTORE_SNAPSHOT'
        );

        await assert.rejects(
            contributor.snapshot(contributorContext('recipes', [], undefined, { aborted: false })),
            error => error.code === 'INVALID_ABORT_SIGNAL'
        );
        const abortedController = new AbortController();
        abortedController.abort();
        await assert.rejects(
            contributor.snapshot(contributorContext('recipes', [], undefined, abortedController.signal)),
            error => error.code === 'RESTORE_ABORTED'
        );
        const invalidActions = [
            { ...restoreAction('recipes', 'insert', recipeRecord('new')), section: 'queue' },
            { ...restoreAction('recipes', 'insert', recipeRecord('new')), action: 'skip' },
            { ...restoreAction('recipes', 'insert', recipeRecord('new')), targetIdentity: '' },
            { ...restoreAction('recipes', 'rename', recipeRecord('new'), 'renamed'), identityPatch: { field: 'name', value: 'renamed' } },
            { ...restoreAction('recipes', 'insert', recipeRecord('new')), targetIdentity: 'different' },
            { ...restoreAction('recipes', 'insert', recipeRecord('new')), incomingIdentity: 'different' },
            { ...restoreAction('recipes', 'insert', recipeRecord('new')), identityPatch: { field: 'id', value: 'new' } },
            restoreAction('recipes', 'rename', recipeRecord('new'))
        ];
        for (const action of invalidActions) {
            await assert.rejects(
                contributor.apply(contributorContext('recipes', [action], base)),
                error => error.code === 'INVALID_RESTORE_ACTION'
            );
        }
        await assert.rejects(
            contributor.apply(contributorContext('recipes', [
                restoreAction('recipes', 'insert', recipeRecord('exists'))
            ], base)),
            error => error.code === 'RESTORE_PLAN_STALE'
        );
        await assert.rejects(
            contributor.apply(contributorContext('recipes', [
                restoreAction('recipes', 'replace', recipeRecord('missing'))
            ], base)),
            error => error.code === 'RESTORE_PLAN_STALE'
        );

        repository.value.ownerSessionId = 'other@example.test';
        await assert.rejects(
            contributor.apply(contributorContext('recipes', [], base)),
            error => error.code === 'SESSION_MISMATCH'
        );
        repository.value = clone(base);
        repository.value.records[0].versions[0].title = 'concurrent change';
        await assert.rejects(
            contributor.apply(contributorContext('recipes', [], base)),
            error => error.code === 'RESTORE_STATE_CHANGED'
        );
        repository.value = clone(base);
        const controller = new AbortController();
        repository.afterUpdate = () => controller.abort();
        await assert.rejects(
            contributor.apply(contributorContext('recipes', [], base, controller.signal)),
            error => error.code === 'RESTORE_ABORTED'
        );
        repository.afterUpdate = null;
        await contributor.rollback(contributorContext('recipes', [], base));
    });
});

describe('Message Queue restore contributor', () => {
    it('applies only selected actions while paused and rolls back without delivery authority', async () => {
        const original = queueState([queueItem('keep'), queueItem('replace', 'old')]);
        const harness = createQueueHarness(original);
        const contributor = queueApi.createMessageQueueRestoreContributor(harness);
        assert.equal(queueApi.MESSAGE_QUEUE_RESTORE_SECTION, 'queue');
        assert.deepEqual(Object.keys(contributor), ['snapshot', 'apply', 'rollback']);
        const actions = [
            restoreAction('queue', 'insert', queueItem('inserted')),
            restoreAction('queue', 'replace', queueItem('replace', 'new', { status: 'sent', sentAt: NOW })),
            restoreAction('queue', 'rename', queueItem('foreign', 'foreign', { status: 'sending' }), 'foreign~imported')
        ];
        const snapshot = await contributor.snapshot(contributorContext('queue', actions));
        snapshot.state.items[0].text = 'caller mutation';
        assert.equal(harness.outbox.getSnapshot().items[0].text, 'keep');
        const cleanSnapshot = await contributor.snapshot(contributorContext('queue', actions));

        assert.deepEqual(await contributor.apply(contributorContext('queue', actions, cleanSnapshot)), {
            applied: 3,
            ids: ['inserted', 'replace', 'foreign~imported'],
            paused: true
        });
        const restored = harness.outbox.getSnapshot();
        assert.deepEqual(restored.items.map(item => item.id), ['keep', 'replace', 'inserted', 'foreign~imported']);
        assert.equal(restored.items[1].text, 'new');
        assert.equal(restored.items.at(-1).status, 'queued');
        assert.deepEqual(harness.deliveryCalls, { inspect: 0, stage: 0, commit: 0 });

        assert.deepEqual(await contributor.rollback(contributorContext('queue', actions, cleanSnapshot)), {
            restored: 2,
            paused: true
        });
        assert.deepEqual(harness.outbox.getSnapshot(), original);
        assert.deepEqual(harness.deliveryCalls, { inspect: 0, stage: 0, commit: 0 });
    });

    it('restarts the paused outbox after a failed write so executor rollback can compensate', async () => {
        const original = queueState([queueItem('keep')]);
        const harness = createQueueHarness(original);
        const contributor = queueApi.createMessageQueueRestoreContributor(harness);
        const actions = [restoreAction('queue', 'insert', queueItem('incoming'))];
        const snapshot = await contributor.snapshot(contributorContext('queue', actions));
        harness.repository.failOnItemId = 'incoming';

        await assert.rejects(
            contributor.apply(contributorContext('queue', actions, snapshot)),
            /queue repository failed/
        );
        assert.equal(harness.outbox.getRuntimeState().started, true);
        assert.deepEqual(harness.outbox.getSnapshot(), original);

        assert.deepEqual(await contributor.rollback(contributorContext('queue', actions, snapshot)), {
            restored: 1,
            paused: true
        });
        assert.deepEqual(harness.outbox.getSnapshot(), original);
        assert.deepEqual(harness.deliveryCalls, { inspect: 0, stage: 0, commit: 0 });
    });

    it('rejects unsafe runtime state, invalid inputs, stale plans, account drift, and failed reloads', async () => {
        assert.throws(() => queueApi.createMessageQueueRestoreContributor(null), /options must be an object/);
        assert.throws(() => queueApi.createMessageQueueRestoreContributor({}), /outbox must be an object/);
        const harness = createQueueHarness(queueState([queueItem('exists')]));
        for (const method of ['getSnapshot', 'getRuntimeState', 'start', 'stop']) {
            const outbox = Object.create(harness.outbox);
            outbox[method] = undefined;
            assert.throws(
                () => queueApi.createMessageQueueRestoreContributor({ outbox, repository: harness.repository }),
                new RegExp(method)
            );
        }
        assert.throws(
            () => queueApi.createMessageQueueRestoreContributor({ outbox: harness.outbox, repository: {} }),
            /write/
        );

        const contributor = queueApi.createMessageQueueRestoreContributor(harness);
        const base = await contributor.snapshot(contributorContext('queue', []));
        await assert.rejects(contributor.snapshot(null), error => error.code === 'INVALID_RESTORE_PORT');
        await assert.rejects(contributor.snapshot(contributorContext('recipes', [])), error => (
            error.code === 'INVALID_RESTORE_CONTEXT'
        ));
        await assert.rejects(
            contributor.snapshot({ section: 'queue', plan: [], actions: [] }),
            error => error.code === 'INVALID_RESTORE_CONTEXT'
        );
        await assert.rejects(
            contributor.apply(contributorContext('queue', [], { state: queueState() })),
            error => error.code === 'INVALID_RESTORE_SNAPSHOT'
        );
        await assert.rejects(
            contributor.apply(contributorContext('queue', [{ value: Symbol('bad') }], base)),
            error => error.code === 'INVALID_RESTORE_VALUE'
        );

        const invalidActions = [
            { ...restoreAction('queue', 'insert', queueItem('new')), section: 'recipes' },
            { ...restoreAction('queue', 'insert', queueItem('new')), action: 'skip' },
            { ...restoreAction('queue', 'insert', queueItem('new')), targetIdentity: '' },
            { ...restoreAction('queue', 'rename', queueItem('new'), 'renamed'), identityPatch: { field: 'name', value: 'renamed' } },
            { ...restoreAction('queue', 'insert', queueItem('new')), targetIdentity: 'different' },
            { ...restoreAction('queue', 'insert', queueItem('new')), incomingIdentity: 'different' },
            { ...restoreAction('queue', 'insert', queueItem('new')), identityPatch: { field: 'id', value: 'new' } },
            restoreAction('queue', 'rename', queueItem('new')),
            restoreAction('queue', 'insert', { id: 'empty', text: '' })
        ];
        for (const action of invalidActions) {
            await assert.rejects(
                contributor.apply(contributorContext('queue', [action], base)),
                error => error.code === 'INVALID_RESTORE_ACTION'
            );
        }
        await assert.rejects(
            contributor.apply(contributorContext('queue', [
                restoreAction('queue', 'insert', queueItem('exists'))
            ], base)),
            error => error.code === 'RESTORE_PLAN_STALE'
        );
        await assert.rejects(
            contributor.apply(contributorContext('queue', [
                restoreAction('queue', 'replace', queueItem('missing'))
            ], base)),
            error => error.code === 'RESTORE_PLAN_STALE'
        );

        const duplicateHarness = createQueueHarness(queueState([queueItem('same'), queueItem('same')]));
        await assert.rejects(
            queueApi.createMessageQueueRestoreContributor(duplicateHarness).snapshot(
                contributorContext('queue', [])
            ),
            error => error.code === 'INVALID_QUEUE_STATE'
        );
        harness.outbox.loadedStorageKey = '';
        await assert.rejects(
            contributor.snapshot(contributorContext('queue', [])),
            error => error.code === 'QUEUE_RESTORE_INACTIVE'
        );
        harness.outbox.loadedStorageKey = harness.storageKey;
        harness.outbox.stop();
        await assert.rejects(
            contributor.snapshot(contributorContext('queue', [])),
            error => error.code === 'QUEUE_RESTORE_INACTIVE'
        );
        harness.outbox.start();
        for (const runtimePatch of [
            { activeRun: { itemId: 'exists' } },
            { timer: 1 },
            { session: {} }
        ]) {
            Object.assign(harness.outbox, runtimePatch);
            await assert.rejects(
                contributor.snapshot(contributorContext('queue', [])),
                error => error.code === 'QUEUE_RESTORE_REQUIRES_PAUSE'
            );
            Object.assign(harness.outbox, { activeRun: null, timer: null, session: null });
        }
        harness.outbox.state.paused = false;
        await assert.rejects(
            contributor.snapshot(contributorContext('queue', [])),
            error => error.code === 'QUEUE_RESTORE_REQUIRES_PAUSE'
        );
        harness.outbox.state.paused = true;

        harness.outbox.state.items[0].text = 'concurrent change';
        await assert.rejects(
            contributor.apply(contributorContext('queue', [], base)),
            error => error.code === 'RESTORE_STATE_CHANGED'
        );
        harness.outbox.state = clone(base.state);

        harness.outbox.loadedStorageKey = 'different-account';
        await assert.rejects(
            contributor.apply(contributorContext('queue', [], base)),
            error => error.code === 'QUEUE_ACCOUNT_CHANGED'
        );
        harness.outbox.loadedStorageKey = harness.storageKey;
        const originalStop = harness.outbox.stop;
        harness.outbox.stop = () => false;
        await assert.rejects(
            contributor.apply(contributorContext('queue', [], base)),
            error => error.code === 'QUEUE_RESTORE_INACTIVE'
        );
        harness.outbox.stop = originalStop;
        const originalStart = harness.outbox.start;
        harness.outbox.start = () => false;
        await assert.rejects(
            contributor.apply(contributorContext('queue', [], base)),
            error => error.code === 'QUEUE_RECOVERY_FAILED'
        );
        harness.outbox.start = originalStart;
        await contributor.rollback(contributorContext('queue', [], base));

        const plainFailure = createQueueHarness(queueState([queueItem('plain')]));
        const plainContributor = queueApi.createMessageQueueRestoreContributor(plainFailure);
        const plainBase = await plainContributor.snapshot(contributorContext('queue', []));
        plainFailure.repository.write = () => { throw new Error('plain write failure'); };
        plainFailure.outbox.start = () => { throw 'string restart failure'; };
        await assert.rejects(
            plainContributor.apply(contributorContext('queue', [
                restoreAction('queue', 'insert', queueItem('incoming'))
            ], plainBase)),
            error => error.code === 'QUEUE_RECOVERY_FAILED' &&
                error.details.primaryCode === null &&
                error.details.restartMessage === 'string restart failure'
        );
    });

    it('honors AbortSignal before and after persistence and permits compensation without a signal', async () => {
        const harness = createQueueHarness(queueState([queueItem('one')]));
        const contributor = queueApi.createMessageQueueRestoreContributor(harness);
        const base = await contributor.snapshot(contributorContext('queue', []));
        await assert.rejects(
            contributor.snapshot(contributorContext('queue', [], undefined, { aborted: false })),
            error => error.code === 'INVALID_ABORT_SIGNAL'
        );
        const abortedController = new AbortController();
        abortedController.abort();
        await assert.rejects(
            contributor.snapshot(contributorContext('queue', [], undefined, abortedController.signal)),
            error => error.code === 'RESTORE_ABORTED'
        );
        const controller = new AbortController();
        const originalWrite = harness.repository.write.bind(harness.repository);
        harness.repository.write = (key, value) => {
            originalWrite(key, value);
            controller.abort();
        };
        await assert.rejects(
            contributor.apply(contributorContext('queue', [
                restoreAction('queue', 'insert', queueItem('two'))
            ], base, controller.signal)),
            error => error.code === 'RESTORE_ABORTED'
        );
        harness.repository.write = originalWrite;
        await contributor.rollback(contributorContext('queue', [], base));
        assert.deepEqual(harness.outbox.getSnapshot().items.map(item => item.id), ['one']);
    });
});

describe('Portable restore contributor integration', () => {
    it('compensates Queue and Recipes in reverse order without sending when Queue apply fails', async () => {
        const recipeOriginal = recipeState([recipeRecord('recipe-old')]);
        const recipeRepository = new RecipeRepository(recipeOriginal);
        const recipes = recipesApi.createRecipesRestoreContributor({ repository: recipeRepository });
        const queueOriginal = queueState([queueItem('queue-old')]);
        const queueHarness = createQueueHarness(queueOriginal);
        const queue = queueApi.createMessageQueueRestoreContributor(queueHarness);
        const executor = restoreApi.createPortableRestoreExecutor({ contributors: { recipes, queue } });
        const plan = restorePlan([
            { name: 'recipes', actions: [
                restoreAction('recipes', 'insert', recipeRecord('recipe-new'))
            ] },
            { name: 'queue', actions: [
                restoreAction('queue', 'insert', queueItem('queue-new'))
            ] }
        ]);
        queueHarness.repository.failOnItemId = 'queue-new';

        await assert.rejects(executor.execute(plan), error => {
            assert.equal(error.code, 'RESTORE_EXECUTION_FAILED');
            assert.equal(error.result.status, 'rolled-back');
            assert.deepEqual(error.result.sections.map(section => section.status), ['rolled-back', 'rolled-back']);
            return true;
        });
        assert.deepEqual(recipeRepository.value, recipeOriginal);
        assert.deepEqual(queueHarness.outbox.getSnapshot(), queueOriginal);
        assert.deepEqual(queueHarness.deliveryCalls, { inspect: 0, stage: 0, commit: 0 });
    });
});
