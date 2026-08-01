const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const NOW = '2026-08-01T00:00:00.000Z';

let collections;
let archive;

before(async () => {
    [collections, archive] = await Promise.all([
        import(pathToFileURL(path.join(ROOT, 'src', 'features', 'collections', 'index.js')).href),
        import(pathToFileURL(path.join(ROOT, 'src', 'features', 'portable_archive', 'index.js')).href)
    ]);
});

function clone(value) {
    return structuredClone(value);
}

function collection(id, name = id, parentId = null, position = 0) {
    return {
        id,
        name,
        parentId,
        position,
        tags: [],
        rules: [],
        ruleMode: 'any',
        color: null,
        collapsed: false,
        pinned: false,
        createdAt: NOW,
        updatedAt: NOW
    };
}

function state(records = [], memberships = [], native = undefined, sessionId = 'account-a') {
    return collections.normalizeCollectionsState({
        schema: collections.COLLECTIONS_SCHEMA,
        version: collections.COLLECTIONS_SCHEMA_VERSION,
        sessionId,
        collections: records,
        memberships,
        native
    }, { sessionId, nowIso: NOW });
}

function action(kind, incomingId, value, targetId = incomingId) {
    return {
        section: 'collections',
        action: kind,
        incomingIdentity: incomingId,
        targetIdentity: targetId,
        identityPatch: kind === 'rename' ? { field: 'id', value: targetId } : null,
        value: clone(value)
    };
}

function context(actions, snapshot, signal = null) {
    return {
        section: 'collections',
        plan: { name: 'collections' },
        actions,
        snapshot,
        signal
    };
}

function rollbackContext(actions, snapshot) {
    return {
        section: 'collections',
        plan: { name: 'collections' },
        actions,
        snapshot,
        applyResult: null,
        failure: { code: 'TEST_FAILURE' }
    };
}

function repository(initial, options = {}) {
    let value = clone(initial);
    let flushes = 0;
    let updates = 0;
    const repo = {
        ...(options.ownerField === 'accountId' ? { accountId: options.owner ?? 'account-a' } : {}),
        ...(options.ownerField === 'targetUserId'
            ? { scope: { targetUserId: options.owner ?? 'account-a' } }
            : {}),
        ...(options.ownerField === 'sessionUserId'
            ? { scope: { sessionUserId: options.owner ?? 'account-a' } }
            : {}),
        ...(options.ownerField === 'none' ? {} : options.ownerField
            ? {}
            : { boundAccountId: options.owner ?? 'account-a' }),
        async get() {
            const output = clone(value);
            return options.envelope ? { format: 'primer-pp.storage', data: output } : output;
        },
        async update(updater) {
            updates += 1;
            value = clone(await updater(clone(value)));
            await options.afterCommit?.({ updates, value: clone(value) });
            return clone(value);
        },
        async flush() {
            flushes += 1;
            await options.onFlush?.({ flushes });
        },
        read() { return clone(value); },
        get flushes() { return flushes; },
        get updates() { return updates; }
    };
    return repo;
}

function contributorFor(repo, options = {}) {
    return collections.createCollectionsRestoreContributor({
        repository: repo,
        clock: () => NOW,
        ...options
    });
}

function collectionsCode(expected) {
    return error => error instanceof collections.CollectionsError && error.code === expected;
}

function restorePlan(actions) {
    const counts = { total: actions.length, insert: 0, skip: 0, replace: 0, rename: 0 };
    for (const item of actions) counts[item.action] += 1;
    return {
        dryRun: true,
        strategy: 'rename',
        archiveChecksum: 'a'.repeat(64),
        summary: clone(counts),
        sections: [{ name: 'collections', summary: clone(counts), actions: clone(actions) }]
    };
}

describe('Collections portable restore contributor', () => {
    it('exports a strict repository-backed contributor and applies only selected, deduplicated actions', async () => {
        const initial = state(
            [collection('keep'), collection('replace-me', 'Before', null, 1)],
            [
                { itemId: 'chat-1', collectionIds: ['replace-me'] },
                { itemId: 'chat-old', collectionIds: ['replace-me'] }
            ]
        );
        const repo = repository(initial, { envelope: true });
        const contributor = contributorFor(repo, { sessionId: 'account-a' });
        assert.equal(collections.COLLECTIONS_RESTORE_SECTION, 'collections');
        assert.deepEqual(Object.keys(contributor).sort(), ['apply', 'rollback', 'snapshot']);
        assert.equal(Object.isFrozen(contributor), true);

        const snapshot = await contributor.snapshot(context([], null));
        snapshot.collections[0].name = 'caller mutation';
        assert.equal(repo.read().collections[0].name, 'keep');
        const before = await contributor.snapshot(context([], null));
        const renameParent = action(
            'rename',
            'source-parent',
            { ...collection('source-parent', 'Imported parent'), memberItemIds: ['chat-1', 'chat-1'] },
            'renamed-parent'
        );
        const insertChild = action(
            'insert',
            'child',
            collection('child', 'Imported child', 'source-parent')
        );
        const replace = action(
            'replace',
            'replace-me',
            { ...collection('replace-me', 'After'), memberItemIds: ['chat-3'] }
        );
        const actions = [renameParent, insertChild, clone(insertChild), replace];
        const result = await contributor.apply(context(actions, before));

        assert.deepEqual(result, {
            section: 'collections',
            applied: 3,
            deduplicated: 1,
            inserted: 1,
            replaced: 1,
            renamed: 1,
            collectionIds: ['child', 'renamed-parent', 'replace-me']
        });
        result.collectionIds.push('caller mutation');
        const applied = repo.read();
        assert.equal(applied.collections.find(item => item.id === 'keep').name, 'keep');
        assert.equal(applied.collections.find(item => item.id === 'replace-me').name, 'After');
        assert.equal(applied.collections.find(item => item.id === 'child').parentId, 'renamed-parent');
        assert.equal(applied.collections.some(item => item.id === 'source-parent'), false);
        assert.deepEqual(applied.memberships, [
            { itemId: 'chat-1', collectionIds: ['renamed-parent'] },
            { itemId: 'chat-3', collectionIds: ['replace-me'] }
        ]);

        const rolledBack = await contributor.rollback(rollbackContext(actions, before));
        assert.deepEqual(rolledBack, {
            section: 'collections',
            restoredCollections: 2,
            restoredMemberships: 2
        });
        assert.deepEqual(repo.read(), initial);
        assert.equal(repo.flushes, 2);
    });

    it('supports the existing service port and restores native metadata when its replace import preserves current native state', async () => {
        let current = state([collection('one')], [], {
            notebooks: { available: true, observedAt: NOW }
        });
        let nativeWrites = 0;
        let flushes = 0;
        const port = {
            async getSnapshot() { return clone(current); },
            async importJson(next) {
                current = state(next.collections, next.memberships, current.native, next.sessionId);
            },
            async setNotebooksAvailability(notebooks) {
                nativeWrites += 1;
                current = state(current.collections, current.memberships, { notebooks }, current.sessionId);
            },
            async flush() { flushes += 1; }
        };
        const contributor = collections.createCollectionsRestoreContributor({
            service: { api: port },
            clock: () => NOW
        });
        const target = state([collection('restored')]);
        const result = await contributor.rollback(rollbackContext([], target));
        assert.equal(result.restoredCollections, 1);
        assert.equal(nativeWrites, 1);
        assert.equal(flushes, 1);
        assert.deepEqual(current, target);

        const direct = collections.createCollectionsRestoreContributor({ service: port, clock: () => NOW });
        const directSnapshot = await direct.snapshot(context([], null));
        assert.deepEqual(directSnapshot, target);
    });

    it('infers every supported repository owner shape and falls back to it for empty storage', async () => {
        const initial = state([collection('owned')]);
        for (const ownerField of ['accountId', 'targetUserId', 'sessionUserId', 'none']) {
            const repo = repository(initial, { ownerField });
            const contributor = contributorFor(repo);
            assert.equal((await contributor.snapshot(context([], null))).sessionId, 'account-a');
        }

        const emptyRepo = repository(undefined, { ownerField: 'accountId' });
        const emptyContributor = contributorFor(emptyRepo);
        assert.deepEqual((await emptyContributor.snapshot(context([], null))).collections, []);

        const missingSessionPort = {
            async getSnapshot() { return undefined; },
            async importJson() {},
            async setNotebooksAvailability() {},
            async flush() {}
        };
        const missingSession = collections.createCollectionsRestoreContributor({
            service: missingSessionPort,
            clock: () => NOW
        });
        await assert.rejects(
            missingSession.snapshot(context([], null)),
            collectionsCode('INVALID_SESSION')
        );
    });

    it('rejects invalid factories, contexts, signals, identities, targets, duplicates, and cycles before committing', async () => {
        const initial = state([collection('existing'), collection('a'), collection('b', 'b', null, 2)]);
        const repo = repository(initial);
        const create = options => collections.createCollectionsRestoreContributor(options);
        assert.throws(() => create(), TypeError);
        assert.throws(() => create({ repository: repo, service: {}, clock: () => NOW }), TypeError);
        assert.throws(() => create({ repository: repo }), TypeError);
        for (const method of ['get', 'update', 'flush']) {
            assert.throws(
                () => create({ repository: { ...repo, [method]: null }, clock: () => NOW }),
                TypeError
            );
        }
        for (const method of ['getSnapshot', 'importJson', 'setNotebooksAvailability', 'flush']) {
            const service = {
                getSnapshot() {}, importJson() {}, setNotebooksAvailability() {}, flush() {}, [method]: null
            };
            assert.throws(() => create({ service, clock: () => NOW }), TypeError);
        }
        assert.throws(
            () => contributorFor(repository(initial, { owner: 'other' }), { sessionId: 'account-a' }),
            collectionsCode('SESSION_BOUNDARY')
        );

        const contributor = contributorFor(repo);
        await assert.rejects(contributor.snapshot(null), collectionsCode('INVALID_RESTORE_CONTEXT'));
        await assert.rejects(
            contributor.snapshot({ section: 'other', plan: {}, actions: [], signal: null }),
            collectionsCode('INVALID_RESTORE_SECTION')
        );
        await assert.rejects(
            contributor.snapshot({ section: 'collections', plan: null, actions: [], signal: null }),
            collectionsCode('INVALID_RESTORE_CONTEXT')
        );
        await assert.rejects(
            contributor.snapshot({ section: 'collections', plan: {}, actions: null, signal: null }),
            collectionsCode('INVALID_RESTORE_CONTEXT')
        );
        await assert.rejects(
            contributor.snapshot({ section: 'collections', plan: {}, actions: [], signal: {} }),
            collectionsCode('INVALID_ABORT_SIGNAL')
        );
        const aborted = new AbortController();
        aborted.abort();
        await assert.rejects(
            contributor.snapshot(context([], null, aborted.signal)),
            collectionsCode('RESTORE_ABORTED')
        );

        const before = await contributor.snapshot(context([], null));
        const rejects = async (actions, code) => {
            await assert.rejects(contributor.apply(context(actions, before)), collectionsCode(code));
            assert.deepEqual(repo.read(), initial);
        };
        await rejects([null], 'INVALID_RESTORE_ACTION');
        await rejects([{ ...action('insert', 'new', collection('new')), value: null }], 'INVALID_RESTORE_ACTION');
        await rejects([{ ...action('insert', 'new', collection('new')), section: 'other' }], 'INVALID_RESTORE_ACTION');
        await rejects([{ ...action('insert', 'new', collection('new')), action: 'skip' }], 'INVALID_RESTORE_ACTION');
        await rejects([action('insert', 'new', collection('different'))], 'RESTORE_IDENTITY_MISMATCH');
        await rejects([{ ...action('rename', 'new', collection('new'), 'renamed'), identityPatch: null }], 'INVALID_RESTORE_RENAME');
        await rejects([{
            ...action('rename', 'new', collection('new'), 'renamed'),
            identityPatch: { field: 'name', value: 'renamed' }
        }], 'INVALID_RESTORE_RENAME');
        await rejects([{
            ...action('rename', 'new', collection('new'), 'renamed'),
            identityPatch: { field: 'id', value: 'other' }
        }], 'INVALID_RESTORE_RENAME');
        await rejects([action('rename', 'new', collection('new'), 'new')], 'INVALID_RESTORE_RENAME');
        await rejects([{
            ...action('insert', 'new', collection('new')),
            identityPatch: { field: 'id', value: 'new' }
        }], 'RESTORE_IDENTITY_MISMATCH');
        await rejects([{
            ...action('insert', 'new', collection('new')),
            targetIdentity: 'other'
        }], 'RESTORE_IDENTITY_MISMATCH');
        await rejects([
            action('rename', 'source', collection('source'), 'target-one'),
            action('rename', 'source', collection('source'), 'target-two')
        ], 'DUPLICATE_RESTORE_IDENTITY');
        await rejects([
            action('insert', 'same', collection('same', 'One')),
            action('insert', 'same', collection('same', 'Two'))
        ], 'DUPLICATE_RESTORE_TARGET');
        await rejects([action('insert', 'existing', collection('existing'))], 'RESTORE_TARGET_EXISTS');
        await rejects([action('replace', 'missing', collection('missing'))], 'RESTORE_TARGET_NOT_FOUND');
        await rejects([action('insert', 'orphan', collection('orphan', 'orphan', 'missing'))], 'PARENT_NOT_FOUND');
        await rejects([action('insert', 'members', {
            ...collection('members'), memberItemIds: 'chat'
        })], 'INVALID_RESTORE_MEMBERSHIPS');
        await rejects([
            action('replace', 'a', collection('a', 'a', 'b')),
            action('replace', 'b', collection('b', 'b', 'a'))
        ], 'CYCLE_DETECTED');
    });

    it('detects snapshot races and write verification failures without exposing dependency mutations', async () => {
        const initial = state([collection('one')]);
        const repo = repository(initial);
        const contributor = contributorFor(repo);
        const before = await contributor.snapshot(context([], null));
        await repo.update(() => state([collection('one'), collection('external', 'external', null, 1)]));
        await assert.rejects(
            contributor.apply(context([action('insert', 'new', collection('new'))], before)),
            collectionsCode('RESTORE_STATE_CHANGED')
        );

        const lying = repository(initial);
        lying.update = async updater => {
            const next = await updater(lying.read());
            next.collections[0].name = 'dependency mutation';
            return next;
        };
        const guarded = contributorFor(lying);
        const guardedBefore = await guarded.snapshot(context([], null));
        await assert.rejects(
            guarded.apply(context([action('insert', 'new', collection('new'))], guardedBefore)),
            collectionsCode('RESTORE_VERIFY_FAILED')
        );
    });

    it('rolls back a partially committed apply failure through the focused portable executor integration', async () => {
        const initial = state([collection('existing')]);
        const repo = repository(initial, {
            async afterCommit({ updates }) {
                if (updates === 1) throw new Error('storage failed after commit');
            }
        });
        const contributor = contributorFor(repo);
        const incoming = action('insert', 'new', collection('new'));
        const executor = archive.createPortableRestoreExecutor({
            contributors: { collections: contributor }
        });

        await assert.rejects(executor.execute(restorePlan([incoming])), error => {
            assert.equal(error.code, 'RESTORE_EXECUTION_FAILED');
            assert.equal(error.result.sections[0].status, 'rolled-back');
            assert.equal(error.result.summary.rolledBackSections, 1);
            return true;
        });
        assert.deepEqual(repo.read(), initial);
        assert.equal(repo.updates, 2);
    });

    it('observes aborts that happen during persistence and lets the executor compensate without reusing the signal', async () => {
        const initial = state([collection('existing')]);
        const controller = new AbortController();
        const repo = repository(initial, {
            async afterCommit({ updates }) {
                if (updates === 1) controller.abort('route changed');
            }
        });
        const contributor = contributorFor(repo);
        const incoming = action('insert', 'new', collection('new'));
        const executor = archive.createPortableRestoreExecutor({
            contributors: { collections: contributor }
        });

        await assert.rejects(
            executor.execute(restorePlan([incoming]), { signal: controller.signal }),
            error => {
                assert.equal(error.code, 'RESTORE_ABORTED');
                assert.equal(error.result.status, 'aborted');
                assert.equal(error.result.sections[0].status, 'rolled-back');
                return true;
            }
        );
        assert.deepEqual(repo.read(), initial);
        assert.equal(repo.updates, 2);
    });
});
