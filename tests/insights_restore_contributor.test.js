const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let insights;
let archive;
before(async () => {
    const root = path.join(__dirname, '..', 'src', 'features');
    insights = await import(pathToFileURL(path.join(root, 'insights', 'index.js')).href);
    archive = await import(pathToFileURL(path.join(root, 'portable_archive', 'index.js')).href);
});

function event(id, sessionIdentity = 'source@example.test', patch = {}) {
    return {
        id,
        kind: 'message',
        occurredAt: '2026-08-01T00:00:00.000Z',
        dayKey: '2026-08-01',
        sessionIdentity,
        count: 1,
        model: null,
        tool: null,
        origin: 'observed',
        ...patch
    };
}

function state(events = []) {
    return insights.createInsightsState(events);
}

function action(name, id, value = event(id), identityPatch = null) {
    return {
        section: 'insights',
        action: name,
        incomingIdentity: value.id,
        targetIdentity: id,
        identityPatch,
        value
    };
}

function context(actions, extra = {}) {
    return { section: 'insights', plan: {}, actions, signal: null, ...extra };
}

function createStore(initial = {}) {
    const values = new Map(Object.entries(initial).map(([id, value]) => [id, structuredClone(value)]));
    const calls = [];
    let readHook = null;
    let writeHook = null;
    return {
        values,
        calls,
        setReadHook(value) { readHook = value; },
        setWriteHook(value) { writeHook = value; },
        repositoryForSession(identity) {
            return {
                async read(portContext) {
                    calls.push(['read', identity, portContext]);
                    if (readHook) return readHook(identity, portContext, values);
                    return values.get(identity) ?? state();
                },
                async write(next, portContext) {
                    calls.push(['write', identity, structuredClone(next), portContext]);
                    if (writeHook) return writeHook(identity, next, portContext, values);
                    values.set(identity, structuredClone(next));
                }
            };
        }
    };
}

function expectCode(error, code) {
    return error?.code === code;
}

describe('Insights portable restore contributor contract', () => {
    it('validates construction, exact contributor keys, contexts, signals, repositories, and inspection mode', async () => {
        assert.throws(() => insights.createInsightsPortableRestoreContributor(), /getScope/);
        assert.throws(() => insights.createInsightsPortableRestoreContributor({ getScope() {} }), /repositoryForSession/);
        assert.throws(() => insights.createInsightsPortableRestoreContributor({
            getScope() {}, repositoryForSession() {}, maxEvents: 0
        }), /maxEvents/);

        const store = createStore({ user: state() });
        let scope = 'user';
        const contributor = insights.createInsightsPortableRestoreContributor({
            getScope: () => scope,
            repositoryForSession: id => store.repositoryForSession(id)
        });
        assert.deepEqual(Object.keys(contributor), ['snapshot', 'apply', 'rollback']);
        assert.equal(Object.isFrozen(contributor), true);
        assert.equal(insights.INSIGHTS_RESTORE_SECTION, 'insights');

        await assert.rejects(contributor.snapshot(null), error => expectCode(error, 'INVALID_RESTORE_CONTEXT'));
        await assert.rejects(
            contributor.snapshot({ section: 'queue', actions: [], signal: null }),
            error => expectCode(error, 'INVALID_RESTORE_SECTION') && error.details.section === 'queue'
        );
        await assert.rejects(
            contributor.snapshot({ section: 'insights', actions: null, signal: null }),
            error => expectCode(error, 'INVALID_RESTORE_CONTEXT')
        );
        await assert.rejects(
            contributor.snapshot(context([], { signal: {} })),
            error => expectCode(error, 'INVALID_ABORT_SIGNAL')
        );

        const aborted = new AbortController();
        aborted.abort('stop now');
        await assert.rejects(
            contributor.snapshot(context([], { signal: aborted.signal })),
            error => expectCode(error, 'RESTORE_ABORTED') && error.details.reason === 'stop now'
        );
        const noStringReason = new AbortController();
        noStringReason.abort(new Error('private reason'));
        await assert.rejects(
            contributor.snapshot(context([], { signal: noStringReason.signal })),
            error => expectCode(error, 'RESTORE_ABORTED') && Object.keys(error.details).length === 0
        );

        scope = { kind: 'inspection', sessionIdentity: 'user', targetIdentity: 'other', readOnly: true };
        await assert.rejects(contributor.snapshot(context([])), error => error.code === 'INSIGHTS_READ_ONLY');
        scope = 'user';
        const invalidRepository = insights.createInsightsPortableRestoreContributor({
            getScope: () => scope,
            repositoryForSession: () => ({ read() {} })
        });
        await assert.rejects(
            invalidRepository.snapshot(context([])),
            error => expectCode(error, 'INVALID_INSIGHTS_REPOSITORY') && error.details.sessionIdentity === 'user'
        );
    });

    it('applies only selected insert, replace, and rename actions with clone and session isolation', async () => {
        const identity = 'current@example.test';
        const original = state([event('a', identity), event('b', identity)]);
        const store = createStore({ [identity]: original });
        const contributor = insights.createInsightsPortableRestoreContributor({
            getScope: () => ({ sessionIdentity: identity, targetIdentity: identity }),
            repositoryForSession: id => store.repositoryForSession(id)
        });
        const actions = [
            action('replace', 'a', event('a', 'foreign@example.test', { count: 2 })),
            action('insert', 'c', event('c', 'foreign@example.test')),
            action('rename', 'd', event('old-d', 'foreign@example.test'), { field: 'id', value: 'd' })
        ];
        const untouched = structuredClone(actions);
        const snapshot = await contributor.snapshot(context(actions));
        assert.equal(Object.isFrozen(snapshot), true);
        assert.equal(Object.isFrozen(snapshot.state.events), true);
        assert.notEqual(snapshot.state, store.values.get(identity));

        store.setWriteHook((id, next, portContext, values) => {
            assert.equal(Object.isFrozen(portContext), true);
            values.set(id, structuredClone(next));
            next.events[0].count = 999;
        });
        const result = await contributor.apply(context(actions, { snapshot: structuredClone(snapshot) }));
        assert.deepEqual(actions, untouched);
        assert.equal(Object.isFrozen(result), true);
        assert.deepEqual(result, {
            section: 'insights', applied: 3, eventCount: 4, semantics: insights.INSIGHTS_SEMANTICS
        });
        const restored = store.values.get(identity);
        assert.deepEqual(restored.events.map(item => item.id), ['a', 'b', 'c', 'd']);
        assert.equal(restored.events[0].count, 2);
        assert.ok(restored.events.every(item => item.sessionIdentity === identity));
        assert.equal(restored.semantics.serverQuota, false);
        assert.equal(restored.semantics.serverQuotaRemaining, null);
        assert.equal(store.calls.filter(call => call[0] === 'write').length, 1);

        const emptySnapshot = await contributor.snapshot(context([]));
        const writesBefore = store.calls.filter(call => call[0] === 'write').length;
        const empty = await contributor.apply(context([], { snapshot: emptySnapshot }));
        assert.equal(empty.applied, 0);
        assert.equal(store.calls.filter(call => call[0] === 'write').length, writesBefore);
    });

    it('rejects malformed, quota-bearing, stale, cross-session, and mutated-snapshot actions before persistence', async () => {
        const store = createStore({ first: state([event('existing', 'first')]), second: state() });
        let scope = 'first';
        const contributor = insights.createInsightsPortableRestoreContributor({
            getScope: () => scope,
            repositoryForSession: id => store.repositoryForSession(id)
        });
        const snapshot = await contributor.snapshot(context([]));

        const invalidActions = [
            null,
            { ...action('insert', 'new'), section: 'queue' },
            action('skip', 'new'),
            { ...action('insert', 'new'), targetIdentity: 1 },
            { ...action('insert', ' new'), targetIdentity: ' new' },
            { ...action('insert', 'new'), targetIdentity: '' },
            { ...action('insert', 'new'), value: [] },
            action('rename', 'renamed', event('old'), null),
            action('rename', 'renamed', event('old'), { field: 'chatId', value: 'renamed' }),
            action('rename', 'renamed', event('old'), { field: 'id', value: 'other' }),
            { ...action('insert', 'new'), identityPatch: { field: 'id', value: 'new' } }
        ];
        for (const invalid of invalidActions) {
            await assert.rejects(
                contributor.apply(context([invalid], { snapshot })),
                error => expectCode(error, 'INVALID_INSIGHTS_ACTION')
            );
        }

        await assert.rejects(
            contributor.apply(context([action('insert', 'quota', {
                ...event('quota'), serverQuotaRemaining: 7
            })], { snapshot })),
            error => expectCode(error, 'SERVER_QUOTA_REJECTED') && error.details.field === 'serverQuotaRemaining'
        );
        await assert.rejects(
            contributor.apply(context([action('insert', 'existing')], { snapshot })),
            error => expectCode(error, 'STALE_INSIGHTS_ACTION')
        );
        await assert.rejects(
            contributor.apply(context([action('replace', 'missing')], { snapshot })),
            error => expectCode(error, 'STALE_INSIGHTS_ACTION')
        );
        await assert.rejects(
            contributor.apply(context([action('insert', 'bad-event', { ...event('bad-event'), kind: 'quota' })], { snapshot })),
            /Unknown insights event kind/
        );

        const foreignSnapshot = structuredClone(snapshot);
        foreignSnapshot.state.events[0].sessionIdentity = 'second';
        await assert.rejects(
            contributor.apply(context([], { snapshot: foreignSnapshot })),
            error => expectCode(error, 'INSIGHTS_SESSION_MISMATCH')
        );

        store.values.set('first', state([event('foreign', 'second')]));
        await assert.rejects(
            contributor.snapshot(context([])),
            error => expectCode(error, 'INSIGHTS_SESSION_MISMATCH')
        );
        store.values.set('first', state([event('existing', 'first')]));

        scope = 'second';
        await assert.rejects(
            contributor.apply(context([], { snapshot })),
            error => expectCode(error, 'INSIGHTS_SESSION_CHANGED')
        );
        scope = 'first';
        store.values.set('first', state([event('existing', 'first'), event('late', 'first')]));
        await assert.rejects(
            contributor.apply(context([], { snapshot })),
            error => expectCode(error, 'STALE_INSIGHTS_SNAPSHOT')
        );

        for (const malformed of [null, {}, { section: 'queue', sessionIdentity: 'first', state: state() },
            { section: 'insights', sessionIdentity: '', state: state() }]) {
            await assert.rejects(
                contributor.apply(context([], { snapshot: malformed })),
                error => error.code === 'INVALID_INSIGHTS_SNAPSHOT' || error instanceof TypeError
            );
        }
        assert.equal(store.calls.filter(call => call[0] === 'write').length, 0);
    });

    it('restores partial writes on failure or abort and reports a failed immediate compensation', async () => {
        const identity = 'user';
        const original = state([event('before', identity)]);
        const store = createStore({ [identity]: original });
        const contributor = insights.createInsightsPortableRestoreContributor({
            getScope: () => identity,
            repositoryForSession: id => store.repositoryForSession(id)
        });
        const snapshot = await contributor.snapshot(context([]));
        let writes = 0;
        store.setWriteHook((id, next, _portContext, values) => {
            writes += 1;
            if (writes === 1) {
                values.set(id, structuredClone(next));
                throw new Error('partial storage failure');
            }
            if (writes === 2) throw new Error('immediate rollback failed');
            values.set(id, structuredClone(next));
        });
        await assert.rejects(
            contributor.apply(context([action('insert', 'after')], { snapshot })),
            error => expectCode(error, 'INSIGHTS_RESTORE_APPLY_FAILED') &&
                error.cause.message === 'partial storage failure' &&
                error.rollbackError.message === 'immediate rollback failed'
        );
        const rollback = await contributor.rollback({
            section: 'insights', plan: {}, actions: [action('insert', 'after')],
            snapshot, applyResult: null, failure: {}
        });
        assert.equal(rollback.restored, true);
        assert.deepEqual(store.values.get(identity), original);

        const abortingStore = createStore({ [identity]: original });
        const controller = new AbortController();
        abortingStore.setWriteHook((id, next, _portContext, values) => {
            values.set(id, structuredClone(next));
            controller.abort('cancelled after write');
        });
        const aborting = insights.createInsightsPortableRestoreContributor({
            getScope: () => identity,
            repositoryForSession: id => abortingStore.repositoryForSession(id)
        });
        const abortSnapshot = await aborting.snapshot(context([], { signal: controller.signal }));
        await assert.rejects(
            aborting.apply(context([action('insert', 'after')], {
                snapshot: abortSnapshot,
                signal: controller.signal
            })),
            error => expectCode(error, 'RESTORE_ABORTED')
        );
        assert.deepEqual(abortingStore.values.get(identity), original);
    });
});

describe('Insights contributor with Portable Restore executor', () => {
    it('rolls a successful selective Insights write back when a later section fails', async () => {
        const identity = 'target';
        const original = state([event('before', identity)]);
        const store = createStore({ [identity]: original });
        const contributor = insights.createInsightsPortableRestoreContributor({
            getScope: () => identity,
            repositoryForSession: id => store.repositoryForSession(id)
        });
        const queueCalls = [];
        const executor = archive.createPortableRestoreExecutor({
            contributors: {
                insights: contributor,
                queue: {
                    async snapshot() { queueCalls.push('snapshot'); return { before: [] }; },
                    async apply() { queueCalls.push('apply'); throw new Error('queue failed'); },
                    async rollback() { queueCalls.push('rollback'); return { restored: true }; }
                }
            }
        });
        const insightActions = [
            action('insert', 'imported', event('imported', 'foreign')),
            action('skip', 'skipped', event('skipped', 'foreign'))
        ];
        const queueAction = {
            section: 'queue', action: 'insert', incomingIdentity: 'q1', targetIdentity: 'q1',
            identityPatch: null, value: { id: 'q1' }
        };
        const plan = {
            dryRun: true,
            strategy: 'skip',
            archiveChecksum: 'a'.repeat(64),
            summary: { total: 3, insert: 2, skip: 1, replace: 0, rename: 0 },
            sections: [
                {
                    name: 'insights',
                    summary: { total: 2, insert: 1, skip: 1, replace: 0, rename: 0 },
                    actions: insightActions
                },
                {
                    name: 'queue',
                    summary: { total: 1, insert: 1, skip: 0, replace: 0, rename: 0 },
                    actions: [queueAction]
                }
            ]
        };

        await assert.rejects(executor.execute(plan), error => {
            assert.equal(error.code, 'RESTORE_EXECUTION_FAILED');
            assert.deepEqual(error.result.sections.map(section => section.status), ['rolled-back', 'rolled-back']);
            return true;
        });
        assert.deepEqual(queueCalls, ['snapshot', 'apply', 'rollback']);
        assert.deepEqual(store.values.get(identity), original);
        const writes = store.calls.filter(call => call[0] === 'write');
        assert.equal(writes.length, 2);
        assert.equal(writes[0][2].events.some(item => item.id === 'imported'), true);
        assert.equal(writes[0][2].events.some(item => item.id === 'skipped'), false);
        assert.equal(writes[1][3].reason, 'portable-restore-rollback');
    });
});
