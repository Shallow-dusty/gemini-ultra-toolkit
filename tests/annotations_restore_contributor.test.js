const assert = require('node:assert/strict');
const { before, describe, it } = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let annotations;
let archive;

before(async () => {
    annotations = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'features', 'annotations', 'index.js'
    )).href);
    archive = await import(pathToFileURL(path.join(
        __dirname, '..', 'src', 'features', 'portable_archive', 'index.js'
    )).href);
});

const NOW = '2026-08-01T00:00:00.000Z';

function note(id, body = id) {
    return {
        id,
        conversation: { id: `chat-${id}`, title: `Chat ${id}`, href: `/app/chat-${id}` },
        anchor: { kind: 'conversation', conversationId: `chat-${id}` },
        body,
        tags: [],
        status: 'active',
        pinned: false,
        createdAt: NOW,
        updatedAt: NOW
    };
}

function state(...records) {
    return { version: 2, annotations: Object.fromEntries(records.map(record => [record.id, record])) };
}

function clone(value) {
    return structuredClone(value);
}

function repository(owner = 'account-a', initial = state(note('existing'))) {
    let stored = clone(initial);
    let flushes = 0;
    return {
        accountId: owner,
        async get() { return clone(stored); },
        async update(updater) {
            stored = clone(await updater(clone(stored)));
            return clone(stored);
        },
        async flush() { flushes += 1; },
        read() { return clone(stored); },
        get flushes() { return flushes; }
    };
}

function context(actions = [], snapshot = undefined, signal = undefined) {
    return { section: 'annotations', plan: { dryRun: true }, actions, snapshot, signal };
}

function action(kind, incoming, target = incoming, value = note(incoming)) {
    return {
        section: 'annotations',
        action: kind,
        incomingIdentity: incoming,
        targetIdentity: target,
        identityPatch: kind === 'rename' ? { field: 'id', value: target } : null,
        value
    };
}

function expectCode(code) {
    return error => error?.code === code;
}

describe('Annotations portable restore contributor', () => {
    it('applies only selected repository actions and fully restores its snapshot', async () => {
        const repo = repository();
        const contributor = annotations.createAnnotationsRestoreContributor({ repository: repo });
        assert.equal(Object.isFrozen(contributor), true);
        assert.deepEqual(Object.keys(contributor), ['snapshot', 'apply', 'rollback']);

        const before = await contributor.snapshot(context());
        const actions = [
            action('insert', 'inserted'),
            action('replace', 'existing', 'existing', note('existing', 'replaced')),
            action('rename', 'incoming', 'renamed')
        ];
        const result = await contributor.apply(context(actions, before));
        assert.deepEqual(result, {
            section: 'annotations',
            applied: 3,
            inserted: 1,
            replaced: 1,
            renamed: 1,
            annotationIds: ['existing', 'inserted', 'renamed']
        });
        assert.deepEqual(Object.keys(repo.read().annotations).sort(), ['existing', 'inserted', 'renamed']);
        assert.equal(repo.read().annotations.existing.body, 'replaced');
        assert.equal(repo.flushes, 1);

        const rolledBack = await contributor.rollback(context(actions, before));
        assert.deepEqual(rolledBack, { section: 'annotations', restored: true, annotations: 1 });
        assert.deepEqual(repo.read(), state(note('existing')));
        assert.equal(repo.flushes, 2);
    });

    it('validates construction, contexts, signals, snapshots, identities, and stale plans', async () => {
        for (const options of [undefined, null, {}, { service: {}, repository: {} }]) {
            assert.throws(() => annotations.createAnnotationsRestoreContributor(options), TypeError);
        }
        for (const [key, value] of [['isCurrent', true], ['getSessionId', true], ['isReadOnly', true]]) {
            assert.throws(
                () => annotations.createAnnotationsRestoreContributor({ repository: repository(), [key]: value }),
                TypeError
            );
        }
        for (const invalid of [{}, { get() {} }]) {
            assert.throws(
                () => annotations.createAnnotationsRestoreContributor({ repository: invalid, sessionId: 'a' }),
                TypeError
            );
        }
        assert.throws(
            () => annotations.createAnnotationsRestoreContributor({ repository: repository(''), sessionId: '' }),
            expectCode('SESSION_BOUNDARY')
        );

        const repo = repository();
        const contributor = annotations.createAnnotationsRestoreContributor({ repository: repo });
        await assert.rejects(contributor.snapshot(null), expectCode('INVALID_RESTORE_CONTEXT'));
        await assert.rejects(
            contributor.snapshot({ section: 'other', plan: {}, actions: [] }),
            expectCode('INVALID_RESTORE_CONTEXT')
        );
        await assert.rejects(
            contributor.snapshot({ section: 'annotations', plan: [], actions: [] }),
            expectCode('INVALID_RESTORE_CONTEXT')
        );
        await assert.rejects(contributor.snapshot(context([], undefined, {})), expectCode('INVALID_ABORT_SIGNAL'));
        const aborted = new AbortController();
        aborted.abort('stop');
        await assert.rejects(contributor.snapshot(context([], undefined, aborted.signal)), expectCode('RESTORE_ABORTED'));

        const before = await contributor.snapshot(context());
        for (const invalid of [
            null,
            { ...action('insert', 'new'), section: 'other' },
            { ...action('insert', 'new'), action: 'skip' },
            { ...action('insert', 'new'), value: null },
            { ...action('insert', 'new'), incomingIdentity: '' },
            { ...action('insert', 'new'), targetIdentity: '' },
            { ...action('insert', 'new'), value: note('other') },
            { ...action('insert', 'new'), targetIdentity: 'other' },
            { ...action('insert', 'new'), identityPatch: { field: 'id', value: 'new' } },
            { ...action('rename', 'new', 'renamed'), identityPatch: null },
            { ...action('rename', 'new', 'new'), identityPatch: { field: 'id', value: 'new' } },
            { ...action('rename', 'new', 'renamed'), identityPatch: { field: 'other', value: 'renamed' } }
        ]) {
            await assert.rejects(contributor.apply(context([invalid], before)), error => Boolean(error?.code));
        }
        await assert.rejects(
            contributor.apply(context([action('insert', 'existing')], before)),
            expectCode('RESTORE_PLAN_STALE')
        );
        await assert.rejects(
            contributor.apply(context([action('replace', 'missing')], before)),
            expectCode('RESTORE_PLAN_STALE')
        );
        await assert.rejects(
            contributor.apply(context([action('insert', 'same'), action('insert', 'same')], before)),
            expectCode('DUPLICATE_RESTORE_TARGET')
        );
        await assert.rejects(
            contributor.apply(context([], { section: 'annotations', sessionId: 'other', state: state() })),
            expectCode('INVALID_RESTORE_SNAPSHOT')
        );
        await assert.rejects(
            contributor.apply(context([], { section: 'annotations', sessionId: 'account-a', state: [] })),
            expectCode('INVALID_RESTORE_SNAPSHOT')
        );

        await repo.update(raw => ({ ...raw, annotations: { ...raw.annotations, changed: note('changed') } }));
        await assert.rejects(contributor.apply(context([], before)), expectCode('RESTORE_STATE_CHANGED'));
    });

    it('enforces inspection and active-session boundaries, including after asynchronous reads', async () => {
        let active = 'account-a';
        let readOnly = true;
        let current = true;
        const repo = repository();
        const contributor = annotations.createAnnotationsRestoreContributor({
            repository: repo,
            getSessionId: () => active,
            isReadOnly: () => readOnly,
            isCurrent: () => current
        });
        await assert.rejects(contributor.snapshot(context()), expectCode('READ_ONLY_SESSION'));
        readOnly = false;
        const before = await contributor.snapshot(context());
        active = 'account-b';
        await assert.rejects(contributor.apply(context([], before)), expectCode('SESSION_CHANGED'));
        active = 'account-a';
        current = false;
        await assert.rejects(contributor.rollback(context([], before)), expectCode('SESSION_CHANGED'));

        let release;
        const slow = repository();
        slow.get = async () => {
            const value = slow.read();
            await new Promise(resolve => { release = resolve; });
            return value;
        };
        current = true;
        const delayed = annotations.createAnnotationsRestoreContributor({
            repository: slow,
            getSessionId: () => active,
            isCurrent: () => current
        });
        const pending = delayed.snapshot(context());
        while (!release) await Promise.resolve();
        current = false;
        release();
        await assert.rejects(pending, expectCode('SESSION_CHANGED'));
    });

    it('covers repository envelopes, scope owners, atomic drift, and persistence verification failures', async () => {
        assert.throws(
            () => annotations.createAnnotationsRestoreContributor({
                repository: { async get() {}, async update() {} },
                sessionId: 1
            }),
            expectCode('SESSION_BOUNDARY')
        );

        for (const scope of [{ targetUserId: 'scoped' }, { sessionUserId: 'scoped' }]) {
            const scoped = repository(undefined, state());
            delete scoped.accountId;
            scoped.scope = scope;
            const scopedContributor = annotations.createAnnotationsRestoreContributor({ repository: scoped });
            assert.equal((await scopedContributor.snapshot(context())).sessionId, 'scoped');
        }

        const envelopeRepo = repository('account-a', state());
        envelopeRepo.get = async () => ({ format: 'primer-pp.storage', data: state() });
        const envelopeContributor = annotations.createAnnotationsRestoreContributor({ repository: envelopeRepo });
        assert.deepEqual((await envelopeContributor.snapshot(context())).state, state());

        const noFlush = repository();
        delete noFlush.flush;
        const noFlushContributor = annotations.createAnnotationsRestoreContributor({ repository: noFlush });
        const noFlushBefore = await noFlushContributor.snapshot(context());
        assert.equal((await noFlushContributor.apply(context([], noFlushBefore))).applied, 0);

        const scopedReadOnly = repository();
        scopedReadOnly.scope = { readOnly: true };
        await assert.rejects(
            annotations.createAnnotationsRestoreContributor({ repository: scopedReadOnly }).snapshot(context()),
            expectCode('READ_ONLY_SESSION')
        );

        let stored = state(note('existing'));
        const atomicDrift = {
            accountId: 'account-a',
            async get() { return clone(stored); },
            async update(updater) {
                stored = state(note('existing'), note('drift'));
                stored = clone(await updater(clone(stored)));
                return clone(stored);
            }
        };
        const atomicContributor = annotations.createAnnotationsRestoreContributor({ repository: atomicDrift });
        const atomicBefore = await atomicContributor.snapshot(context());
        await assert.rejects(
            atomicContributor.apply(context([action('insert', 'new')], atomicBefore)),
            expectCode('RESTORE_STATE_CHANGED')
        );

        let serviceReads = 0;
        const service = {
            getSessionId() { return 'account-a'; },
            isReadOnly() { return false; },
            getSnapshot() {
                serviceReads += 1;
                return serviceReads < 3 ? state() : state(note('drift'));
            },
            async importJson() { throw new Error('must not import stale state'); }
        };
        const serviceContributor = annotations.createAnnotationsRestoreContributor({ service });
        const serviceBefore = await serviceContributor.snapshot(context());
        await assert.rejects(
            serviceContributor.apply(context([action('insert', 'new')], serviceBefore)),
            expectCode('RESTORE_STATE_CHANGED')
        );

        const expired = annotations.createAnnotationsRestoreContributor({
            repository: repository(),
            getSessionId() { throw new Error('stopped'); }
        });
        await assert.rejects(expired.snapshot(context()), expectCode('SESSION_CHANGED'));

        let ignored = state(note('existing'));
        const ignoringApply = {
            accountId: 'account-a',
            async get() { return clone(ignored); },
            async update(updater) { await updater(clone(ignored)); return clone(ignored); }
        };
        const ignoredContributor = annotations.createAnnotationsRestoreContributor({ repository: ignoringApply });
        const ignoredBefore = await ignoredContributor.snapshot(context());
        await assert.rejects(
            ignoredContributor.apply(context([action('insert', 'new')], ignoredBefore)),
            expectCode('RESTORE_VERIFY_FAILED')
        );

        let rollbackStored = state(note('before'));
        let ignoreWrites = false;
        const ignoringRollback = {
            accountId: 'account-a',
            async get() { return clone(rollbackStored); },
            async update(updater) {
                const next = clone(await updater(clone(rollbackStored)));
                if (!ignoreWrites) rollbackStored = next;
                return clone(rollbackStored);
            }
        };
        const rollbackContributor = annotations.createAnnotationsRestoreContributor({ repository: ignoringRollback });
        const rollbackBefore = await rollbackContributor.snapshot(context());
        rollbackStored = state(note('changed'));
        ignoreWrites = true;
        await assert.rejects(
            rollbackContributor.rollback(context([], rollbackBefore)),
            expectCode('RESTORE_VERIFY_FAILED')
        );
    });

    it('provides a service-backed frozen export integration and invalidates old ports on switch', async () => {
        const repositories = new Map([
            ['account-a', repository('account-a', state(note('b'), note('a')))],
            ['account-b', repository('account-b', state())]
        ]);
        const service = annotations.createAnnotationsFeature({
            repositoryForSession: async id => repositories.get(id),
            now: () => NOW
        });
        await service.start({ session: 'account-a' });
        let current = true;
        const integration = annotations.createAnnotationsPortableArchiveIntegration({
            service,
            isCurrent: () => current
        });
        assert.equal(Object.isFrozen(integration), true);
        assert.deepEqual(Object.keys(integration), ['section', 'exportSection', 'contributor']);
        assert.deepEqual((await integration.exportSection()).map(record => record.id), ['a', 'b']);
        const before = await integration.contributor.snapshot(context());
        assert.equal(before.sessionId, 'account-a');
        assert.deepEqual(
            await integration.contributor.apply(context([action('insert', 'new')], before)),
            {
                section: 'annotations', applied: 1, inserted: 1, replaced: 0, renamed: 0,
                annotationIds: ['new']
            }
        );
        await integration.contributor.rollback(context([], before));

        const aborted = new AbortController();
        aborted.abort();
        await assert.rejects(integration.exportSection({ signal: aborted.signal }), expectCode('RESTORE_ABORTED'));
        await service.onSessionChange({ accountId: 'account-b', kind: 'inspection' });
        await assert.rejects(integration.exportSection(), expectCode('SESSION_CHANGED'));
        await assert.rejects(integration.contributor.snapshot(context()), expectCode('SESSION_CHANGED'));

        const inspection = annotations.createAnnotationsPortableArchiveIntegration({ service });
        assert.deepEqual(await inspection.exportSection(), []);
        await assert.rejects(inspection.contributor.snapshot(context()), expectCode('READ_ONLY_SESSION'));
        current = false;
        await service.stop();
    });

    it('participates in executor compensation without retrying', async () => {
        const repo = repository();
        const contributor = annotations.createAnnotationsRestoreContributor({ repository: repo });
        let failures = 0;
        const executor = archive.createPortableRestoreExecutor({
            contributors: {
                annotations: contributor,
                collections: {
                    async snapshot() { return { before: true }; },
                    async apply() { failures += 1; throw Object.assign(new Error('later failed'), { code: 'LATER_FAILED' }); },
                    async rollback() { return { restored: true }; }
                }
            }
        });
        const plan = {
            dryRun: true,
            strategy: 'replace',
            archiveChecksum: 'a'.repeat(64),
            sections: [
                { name: 'annotations', actions: [action('insert', 'new')], summary: { total: 1, insert: 1, skip: 0, replace: 0, rename: 0 } },
                { name: 'collections', actions: [{ section: 'collections', action: 'insert', incomingIdentity: 'x', targetIdentity: 'x', identityPatch: null, value: {} }], summary: { total: 1, insert: 1, skip: 0, replace: 0, rename: 0 } }
            ],
            summary: { total: 2, insert: 2, skip: 0, replace: 0, rename: 0 }
        };
        await assert.rejects(
            executor.execute(plan),
            error => error.code === 'RESTORE_EXECUTION_FAILED'
                && error.cause?.code === 'LATER_FAILED'
                && error.result.status === 'rolled-back'
        );
        assert.equal(failures, 1);
        assert.deepEqual(repo.read(), state(note('existing')));
    });
});
