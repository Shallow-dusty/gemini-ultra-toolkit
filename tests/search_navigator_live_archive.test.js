const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');

let search;
let liveIndexSyncInternals;
let SearchDocumentIndex;

before(async () => {
    const [barrel, liveIndex, documentIndex] = await Promise.all([
        import('../src/features/search_navigator/index.js'),
        import('../src/features/search_navigator/live_index_sync.js'),
        import('../src/features/search_navigator/document_index.js')
    ]);
    search = barrel;
    liveIndexSyncInternals = liveIndex.liveIndexSyncInternals;
    SearchDocumentIndex = documentIndex.SearchDocumentIndex;
});

function expectCode(code) {
    return error => error?.code === code;
}

function restoreContext(actions = [], snapshot = undefined, signal = null, section = 'chats') {
    return { section, plan: { section }, actions, signal, ...(snapshot === undefined ? {} : { snapshot }) };
}

function action(type, incomingIdentity, value, targetIdentity = incomingIdentity, identityPatch = null) {
    return {
        section: 'chats',
        action: type,
        incomingIdentity,
        targetIdentity,
        identityPatch,
        value
    };
}

describe('Search production archive synchronizer', () => {
    it('performs a bounded initial rebuild and explicit incremental/session refreshes', async () => {
        const navigator = new search.SearchNavigator({ session: 'account-a' });
        navigator.rebuild([{ id: 'seed', title: 'Existing seed' }]);
        const archiveCalls = [];
        const archiveProvider = {
            async readChats(context) {
                archiveCalls.push(context);
                return {
                    payload: {
                        chats: [{
                            id: `archive-${archiveCalls.length}`,
                            title: 'Portable archive',
                            messages: [{ role: 'user', text: 'portable needle' }]
                        }]
                    }
                };
            }
        };
        let currentText = 'current needle';
        const adapter = {
            scanSidebarChatLinks: () => [{ id: 'visible', title: 'Visible chat' }],
            getChatId: () => 'current',
            getChatTitleText: () => 'Current chat',
            getCurrentConversationMessages: () => [{ id: 'm1', role: 'model', text: currentText }]
        };
        const timers = [];
        const cancelled = [];
        let observerCallbacks;
        let unobserved = 0;
        const statuses = [];
        const synchronizer = new search.SearchIndexSynchronizer({
            navigator,
            adapter,
            archiveProvider,
            document: { body: {} },
            observeChanges(callbacks) {
                observerCallbacks = callbacks;
                return () => { unobserved += 1; };
            },
            schedule(callback, delay) {
                const timer = { callback, delay };
                timers.push(timer);
                return timer;
            },
            cancelSchedule(timer) { cancelled.push(timer); },
            refreshDelay: 7,
            onStatus(status) { statuses.push(status); }
        });

        assert.equal(await synchronizer.start({ accountId: 'account-a' }), true);
        assert.equal(await synchronizer.start(), false);
        assert.equal(archiveCalls.length, 1);
        assert.equal(archiveCalls[0].signal instanceof AbortSignal, true);
        assert.equal(Object.isFrozen(archiveCalls[0]), true);
        assert.equal(navigator.search('portable').total, 2);
        assert.equal(navigator.search('current').total, 2);
        assert.equal(synchronizer.status.state, 'ready');
        assert.equal(statuses.at(-1).archive, 'ready');

        currentText = 'updated current message';
        observerCallbacks.onDomChange();
        observerCallbacks.onRouteChange();
        assert.equal(cancelled.length, 1);
        assert.equal(timers.at(-1).delay, 7);
        timers.at(-1).callback();
        await synchronizer.drain;
        assert.equal(archiveCalls.length, 1);
        assert.equal(navigator.search('updated').total, 1);

        const accountA = navigator.captureArchiveSnapshot();
        const sessionStatus = await synchronizer.changeSession({ targetUserId: 'account-b' });
        assert.equal(sessionStatus.refreshReason, 'session');
        assert.equal(archiveCalls.length, 2);
        assert.equal(navigator.search('archive').total, 1);
        navigator.changeSession('account-a');
        assert.deepEqual(navigator.captureArchiveSnapshot(), accountA);
        navigator.changeSession('account-b');

        assert.equal(synchronizer.stop(), true);
        assert.equal(unobserved, 1);
        assert.equal(synchronizer.notifyDOMChange(), false);
        assert.equal(synchronizer.notifyRouteChange(), false);
        assert.equal(synchronizer.stop(), false);
        await assert.rejects(synchronizer.refresh(), /not started/);
        navigator.dispose();
    });

    it('reports honest empty/degraded states and contains source failures', async () => {
        const emptyNavigator = new search.SearchNavigator();
        const empty = new search.SearchIndexSynchronizer({
            navigator: emptyNavigator,
            adapter: {},
            observeChanges: () => () => {}
        });
        await empty.start();
        assert.deepEqual(
            [empty.status.state, empty.status.reason, empty.status.archive],
            ['empty', 'archive-provider-unavailable', 'unavailable']
        );
        empty.stop();

        const failedNavigator = new search.SearchNavigator();
        const warnings = [];
        const failed = new search.SearchIndexSynchronizer({
            navigator: failedNavigator,
            adapter: {
                scanSidebarChatLinks() { throw new Error('sidebar changed'); },
                getChatId: () => null
            },
            archiveProvider: { async readChats() { throw new Error('storage offline'); } },
            observeChanges: () => () => {},
            logger: { warn(message) { warnings.push(message); } }
        });
        await failed.start();
        assert.deepEqual(
            [failed.status.state, failed.status.reason, failed.status.archive],
            ['empty', 'archive-provider-failed', 'failed']
        );
        assert.equal(warnings.length, 1);
        failed.stop();

        const adapterNavigator = new search.SearchNavigator();
        const adapterFailure = new search.SearchIndexSynchronizer({
            navigator: adapterNavigator,
            adapter: {
                scanSidebarChatLinks: () => 'not-an-array',
                getChatId() { throw new Error('route unavailable'); }
            },
            archiveProvider: { readChats: async () => [] },
            observeChanges: () => null
        });
        await adapterFailure.start();
        assert.equal(adapterFailure.status.reason, 'gemini-source-unavailable');
        adapterFailure.archiveState = 'invalid';
        await adapterFailure.refresh('manual');
        assert.equal(adapterFailure.status.archive, 'failed');
        adapterFailure.stop();

        emptyNavigator.dispose();
        failedNavigator.dispose();
        adapterNavigator.dispose();
    });

    it('aborts an in-flight provider read without mutating the index', async () => {
        const navigator = new search.SearchNavigator();
        let release;
        const provider = {
            readChats: () => new Promise(resolve => { release = resolve; })
        };
        const synchronizer = new search.SearchIndexSynchronizer({
            navigator,
            adapter: {},
            archiveProvider: provider,
            observeChanges: () => () => {}
        });
        const starting = synchronizer.start();
        await Promise.resolve();
        assert.equal(synchronizer.stop(), true);
        release([{ id: 'late', title: 'must not index' }]);
        await assert.rejects(starting, expectCode('REFRESH_ABORTED'));
        assert.equal(navigator.search('late').total, 0);
        navigator.dispose();
    });

    it('observes and releases only injected DOM and route surfaces', () => {
        const listeners = new Map();
        const removed = [];
        let observer;
        class FakeObserver {
            constructor(callback) { this.callback = callback; observer = this; }
            observe(target, options) { this.target = target; this.options = options; }
            disconnect() { this.disconnected = true; }
        }
        const body = {};
        const document = {
            body,
            defaultView: {
                MutationObserver: FakeObserver,
                addEventListener(name, callback) { listeners.set(name, callback); },
                removeEventListener(name, callback) { removed.push([name, callback]); }
            }
        };
        let dom = 0;
        let route = 0;
        const release = search.observeGeminiSearchChanges({
            document,
            onDomChange: () => { dom += 1; },
            onRouteChange: () => { route += 1; }
        });
        assert.equal(observer.target, body);
        assert.deepEqual(observer.options.attributeFilter, ['href', 'aria-label']);
        observer.callback([]);
        listeners.get('popstate')();
        listeners.get('hashchange')();
        assert.deepEqual([dom, route], [1, 2]);
        release();
        assert.equal(observer.disconnected, true);
        assert.equal(removed.length, 2);

        const releaseEmpty = search.observeGeminiSearchChanges({
            document: null,
            onDomChange() {},
            onRouteChange() {}
        });
        assert.doesNotThrow(releaseEmpty);
    });

    it('validates every injected production port and refresh options', async () => {
        const navigator = new search.SearchNavigator();
        assert.throws(() => new search.SearchIndexSynchronizer(), /SearchNavigator/);
        assert.throws(() => new search.SearchIndexSynchronizer({ navigator }), /Gemini adapter/);
        assert.throws(() => new search.SearchIndexSynchronizer({ navigator, adapter: {}, archiveProvider: {} }), /readChats/);
        for (const overrides of [
            { observeChanges: null }, { schedule: null }, { cancelSchedule: null }, { onStatus: null }
        ]) {
            assert.throws(() => new search.SearchIndexSynchronizer({ navigator, adapter: {}, ...overrides }), /ports/);
        }
        assert.throws(() => new search.SearchIndexSynchronizer({
            navigator, adapter: {}, refreshDelay: -1
        }), /refresh delay/);
        assert.deepEqual(search.withPortableMessageIds([
            { id: 'portable-message-1' }, {}
        ], { maxMessagesPerChat: 2 }), [
            { id: 'portable-message-1' }, { id: 'portable-message-2' }
        ]);

        const sync = new search.SearchIndexSynchronizer({
            navigator,
            adapter: {},
            observeChanges: () => () => {}
        });
        await assert.rejects(sync.changeSession('other'), expectCode('SYNC_NOT_STARTED'));
        await sync.start();
        const pending = sync.refresh('one', { full: false });
        sync.refresh('two', { full: true });
        await pending;
        sync.stop();
        navigator.dispose();
    });

    it('bounds and contains every live source normalization edge', () => {
        const limits = new search.SearchNavigator({
            limits: {
                maxChats: 2,
                maxMessagesPerChat: 2,
                maxTotalMessages: 2,
                maxTitleLength: 5,
                maxContentLength: 5,
                maxRoleLength: 3
            }
        }).limits;
        const makeReport = () => ({ adapterFailed: false, rejected: 0, truncated: false });
        const chat = (id, overrides = {}) => ({
            id,
            title: '',
            tags: [],
            annotations: [],
            messages: [],
            ...overrides
        });
        const message = id => ({ id, role: 'usr', content: id, annotations: [] });

        assert.deepEqual(liveIndexSyncInternals.withPortableMessageIds(null, limits), []);
        assert.deepEqual(liveIndexSyncInternals.withPortableMessageIds([
            {},
            { id: 'portable-message-1' },
            { messageId: null, id: 'fallback' },
            null,
            { messageId: '' }
        ], { ...limits, maxMessagesPerChat: 5 }), [
            { id: 'portable-message-1-imported' },
            { id: 'portable-message-1' },
            { messageId: null, id: 'fallback' },
            null,
            { messageId: '' }
        ]);

        const providerReport = makeReport();
        const providerChats = liveIndexSyncInternals.normalizeProviderChats([
            null,
            {
                id: 'kept',
                messages: [
                    { role: 'usr', text: 'one' },
                    { role: 'usr', text: 'two' },
                    { role: 'usr', text: 'three' }
                ]
            },
            { id: 'beyond-limit' }
        ], limits, providerReport);
        assert.deepEqual(providerChats.map(item => item.id), ['kept']);
        assert.deepEqual(providerReport, { adapterFailed: false, rejected: 1, truncated: true });
        const primitiveReport = makeReport();
        assert.deepEqual(
            liveIndexSyncInternals.normalizeProviderChats([42], limits, primitiveReport),
            []
        );
        assert.equal(primitiveReport.rejected, 1);

        const missingVisibleReport = makeReport();
        assert.deepEqual(liveIndexSyncInternals.readVisibleChats({}, limits, missingVisibleReport), []);
        const invalidVisibleReport = makeReport();
        const visible = liveIndexSyncInternals.readVisibleChats({
            scanSidebarChatLinks: () => [null, { id: 'visible', title: 42 }, { id: 'later' }]
        }, limits, invalidVisibleReport);
        assert.deepEqual(visible.map(item => [item.id, item.title]), [['visible', 'Untit']]);
        assert.deepEqual(invalidVisibleReport, { adapterFailed: false, rejected: 1, truncated: true });

        const absentCurrentReport = makeReport();
        assert.equal(liveIndexSyncInternals.readCurrentChat({}, limits, absentCurrentReport), null);
        const noMetadata = liveIndexSyncInternals.readCurrentChat({ getChatId: () => 'metadata-free' }, limits, makeReport());
        assert.deepEqual([noMetadata.title, noMetadata.messages], ['', []]);
        const metadataFailureReport = makeReport();
        const metadataFailure = liveIndexSyncInternals.readCurrentChat({
            getChatId: () => 'metadata-failure',
            getChatTitleText() { throw new Error('layout changed'); }
        }, limits, metadataFailureReport);
        assert.equal(metadataFailure.id, 'metadata-failure');
        assert.equal(metadataFailureReport.adapterFailed, true);
        const invalidMessagesReport = makeReport();
        liveIndexSyncInternals.readCurrentChat({
            getChatId: () => 'invalid-messages',
            getChatTitleText: () => 42,
            getCurrentConversationMessages: () => 'invalid'
        }, limits, invalidMessagesReport);
        assert.equal(invalidMessagesReport.adapterFailed, true);
        const boundedCurrentReport = makeReport();
        const boundedCurrent = liveIndexSyncInternals.readCurrentChat({
            getChatId: () => 'bounded-current',
            getChatTitleText: () => 'long title',
            getCurrentConversationMessages: () => [
                { messageId: null, id: 'one', role: null, content: null, text: 'long text' },
                { role: 42, content: 42 },
                { id: 'ignored', role: 'usr', text: 'ignored' }
            ]
        }, limits, boundedCurrentReport);
        assert.equal(boundedCurrent.title, 'long ');
        assert.deepEqual(boundedCurrent.messages.map(item => item.id), ['one', 'm_1']);
        assert.equal(boundedCurrentReport.truncated, true);
        const explosive = {};
        Object.defineProperty(explosive, 'messageId', {
            get() { throw new Error('detached node'); }
        });
        const rejectedCurrentReport = makeReport();
        assert.equal(liveIndexSyncInternals.readCurrentChat({
            getChatId: () => 'explosive',
            getCurrentConversationMessages: () => [explosive]
        }, limits, rejectedCurrentReport), null);
        assert.equal(rejectedCurrentReport.rejected, 1);

        const mergeReport = makeReport();
        const rich = chat('shared', {
            title: 'new', tags: ['tag'], annotations: ['note'], messages: [message('new')]
        });
        const emptyMetadata = chat('shared');
        const merged = liveIndexSyncInternals.boundedMergedChats(
            [chat('shared', {
                title: 'old', tags: ['old-tag'], annotations: ['old-note'], messages: [message('old')]
            })],
            [rich],
            [emptyMetadata],
            rich,
            limits,
            mergeReport
        );
        assert.deepEqual(merged[0], rich);
        const fullReport = makeReport();
        const current = chat('current');
        const evicted = liveIndexSyncInternals.boundedMergedChats(
            [chat('one'), chat('two')],
            [chat('three'), chat('four')],
            [],
            current,
            limits,
            fullReport
        );
        assert.deepEqual(evicted.map(item => item.id), ['one', 'two']);
        assert.equal(fullReport.truncated, true);
        const messageLimitReport = makeReport();
        const limited = liveIndexSyncInternals.boundedMergedChats([], [chat('messages', {
            messages: [message('one'), message('two'), message('three')]
        })], [], null, limits, messageLimitReport);
        assert.equal(limited[0].messages.length, 2);
        assert.equal(messageLimitReport.truncated, true);

        const stats = { chats: 1, messages: 1, documents: 2 };
        assert.equal(liveIndexSyncInternals.statusFor(stats, 'ready', makeReport(), 'manual').state, 'ready');
        for (const [report, reason] of [
            [{ adapterFailed: true, rejected: 0, truncated: false }, 'gemini-source-unavailable'],
            [{ adapterFailed: false, rejected: 1, truncated: false }, 'source-records-rejected'],
            [{ adapterFailed: false, rejected: 0, truncated: true }, 'source-truncated']
        ]) {
            assert.equal(liveIndexSyncInternals.statusFor(stats, 'ready', report, 'edge').reason, reason);
        }
        assert.equal(liveIndexSyncInternals.statusFor(
            { chats: 0, messages: 0, documents: 0 }, 'ready', makeReport(), 'empty'
        ).reason, 'archive-empty');
    });

    it('cancels queued refreshes and reports scheduled refresh failures', async () => {
        const navigator = new search.SearchNavigator();
        const timers = [];
        const cancelled = [];
        const warnings = [];
        let failStatus = false;
        const sync = new search.SearchIndexSynchronizer({
            navigator,
            adapter: {},
            observeChanges: () => () => {},
            schedule(callback) { timers.push(callback); return callback; },
            cancelSchedule(timer) { cancelled.push(timer); },
            onStatus() {
                if (failStatus) throw new Error('consumer unavailable');
            },
            logger: { warn(message, details) { warnings.push([message, details]); } }
        });
        await sync.start();
        sync.notifyDOMChange();
        await sync.changeSession('other');
        assert.equal(cancelled.length, 1);
        failStatus = true;
        sync.notifyRouteChange();
        const scheduled = timers.at(-1);
        scheduled();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(warnings.at(-1)[0], 'Search index refresh failed');
        sync.notifyDOMChange();
        assert.equal(sync.stop(), true);
        assert.equal(cancelled.length, 2);
        navigator.dispose();
    });

    it('preserves a queued full refresh while another provider read is active', async () => {
        const navigator = new search.SearchNavigator();
        const releases = [];
        let block = false;
        const sync = new search.SearchIndexSynchronizer({
            navigator,
            adapter: {},
            archiveProvider: {
                readChats: () => block
                    ? new Promise(resolve => { releases.push(resolve); })
                    : Promise.resolve([])
            },
            observeChanges: () => () => {}
        });
        await sync.start();
        block = true;
        const active = sync.refresh('active', { full: true });
        await new Promise(resolve => setImmediate(resolve));
        sync.refresh('queued-full', { full: true });
        sync.refresh('queued-incremental');
        releases.shift()([]);
        await new Promise(resolve => setImmediate(resolve));
        releases.shift()([]);
        await active;
        sync.stop();
        navigator.dispose();
    });
});

describe('Chats portable restore contributor', () => {
    it('applies selective insert/replace/rename actions and rolls back exactly', async () => {
        const navigator = new search.SearchNavigator({ session: 'account-a' });
        navigator.rebuild([
            { id: 'replace-me', title: 'Before' },
            { id: 'keep-me', title: 'Keep' }
        ]);
        const contributor = search.createChatsPortableRestoreContributor({ navigator });
        assert.equal(Object.isFrozen(contributor), true);
        assert.deepEqual(Object.keys(contributor), ['snapshot', 'apply', 'rollback']);
        const before = await contributor.snapshot(restoreContext());
        assert.equal(Object.isFrozen(before), true);
        const actions = [
            action('replace', 'replace-me', { id: 'replace-me', title: 'After' }),
            action('insert', 'inserted', {
                id: 'inserted',
                title: 'Inserted',
                messages: [{ role: 'user', text: 'message without id' }]
            }),
            action('rename', 'imported', { chatId: 'imported', title: 'Renamed' }, 'imported~imported', {
                field: 'chatId', value: 'imported~imported'
            })
        ];
        const result = await contributor.apply(restoreContext(actions, structuredClone(before)));
        assert.deepEqual(result, {
            section: 'chats',
            applied: 3,
            inserted: 1,
            replaced: 1,
            renamed: 1,
            chats: 4,
            semantics: 'local-search-archive-only'
        });
        assert.equal(navigator.search('After').total, 1);
        assert.equal(navigator.search('without').items[0].messageId, 'portable-message-1');
        assert.equal(navigator.search('Renamed').items[0].chatId, 'imported~imported');
        assert.equal(navigator.search('Keep').total, 1);

        const rolledBack = await contributor.rollback({
            section: 'chats', plan: {}, actions, snapshot: before, applyResult: result, failure: {}
        });
        assert.deepEqual(rolledBack, {
            section: 'chats', restored: true, chats: 2, revision: before.revision,
            semantics: 'local-search-archive-only'
        });
        assert.deepEqual(navigator.captureArchiveSnapshot(), {
            sessionKey: before.sessionKey,
            revision: before.revision,
            chats: before.chats
        });

        const empty = await contributor.snapshot(restoreContext());
        const noActions = await contributor.apply(restoreContext([], empty));
        assert.deepEqual(noActions, {
            section: 'chats', applied: 0, chats: 2, semantics: 'local-search-archive-only'
        });
        navigator.dispose();
    });

    it('rejects malformed contexts, signals, snapshots, scopes and actions', async () => {
        const navigator = new search.SearchNavigator({ session: 'account-a' });
        navigator.rebuild([{ id: 'existing' }]);
        assert.throws(() => search.createChatsPortableRestoreContributor(), /SearchNavigator/);
        assert.throws(() => search.createChatsPortableRestoreContributor({ navigator, getScope: null }), /ports/);
        assert.throws(() => search.createChatsPortableRestoreContributor({ navigator, assertCurrent: null }), /ports/);
        const contributor = search.createChatsPortableRestoreContributor({ navigator });
        await assert.rejects(contributor.snapshot(null), expectCode('INVALID_RESTORE_CONTEXT'));
        await assert.rejects(
            contributor.snapshot({ section: 'chats', plan: null, actions: [], signal: null }),
            expectCode('INVALID_RESTORE_CONTEXT')
        );
        await assert.rejects(contributor.snapshot(restoreContext([], undefined, null, 'queue')), expectCode('INVALID_RESTORE_SECTION'));
        await assert.rejects(contributor.snapshot(restoreContext([], undefined, {})), expectCode('INVALID_ABORT_SIGNAL'));
        const aborted = new AbortController();
        aborted.abort();
        await assert.rejects(contributor.snapshot(restoreContext([], undefined, aborted.signal)), expectCode('RESTORE_ABORTED'));

        const readOnly = search.createChatsPortableRestoreContributor({
            navigator,
            getScope: () => ({ kind: 'inspection', readOnly: true })
        });
        await assert.rejects(readOnly.snapshot(restoreContext()), expectCode('READ_ONLY_SESSION'));
        for (const scope of [{ kind: 'inspection' }, { mode: 'inspection' }]) {
            const inspection = search.createChatsPortableRestoreContributor({
                navigator,
                getScope: () => scope
            });
            await assert.rejects(inspection.snapshot(restoreContext()), expectCode('READ_ONLY_SESSION'));
        }
        const before = await contributor.snapshot(restoreContext());
        for (const malformed of [
            null,
            { section: 'chats', sessionKey: '', revision: 0, chats: [] },
            { section: 'chats', sessionKey: 'account:a', revision: -1, chats: [] },
            { section: 'chats', sessionKey: 'account:a', revision: 0, chats: null }
        ]) {
            await assert.rejects(contributor.apply(restoreContext([], malformed)), expectCode('INVALID_CHATS_SNAPSHOT'));
        }

        const invalidActions = [
            {},
            action('skip', 'x', { id: 'x' }),
            action('insert', 'x', { id: 'other' }),
            action('insert', 'x', { id: 'x' }, 'other'),
            action('insert', 'x', { id: 'x' }, 'x', {}),
            action('rename', 'x', { id: 'x' }, 'y', null),
            action('rename', 'x', { id: 'x' }, 'x', { field: 'id', value: 'x' }),
            action('rename', 'x', { id: 'x' }, 'y', { field: 'name', value: 'y' }),
            action('rename', 'x', { id: 'x' }, 'y', { field: 'id', value: 'other' })
        ];
        for (const invalid of invalidActions) {
            await assert.rejects(
                contributor.apply(restoreContext([invalid], before)),
                error => ['INVALID_CHATS_ACTION', 'CHATS_IDENTITY_MISMATCH', 'INVALID_CHATS_RENAME'].includes(error.code)
            );
        }
        await assert.rejects(
            contributor.apply(restoreContext([action('replace', 'missing', { id: 'missing' })], before)),
            expectCode('STALE_CHATS_ACTION')
        );
        await assert.rejects(
            contributor.apply(restoreContext([action('insert', 'existing', { id: 'existing' })], before)),
            expectCode('STALE_CHATS_ACTION')
        );
        const identityFree = await contributor.snapshot(restoreContext());
        const inserted = await contributor.apply(restoreContext([
            action('insert', 'identity-free', { title: 'Identity free' })
        ], identityFree));
        assert.equal(inserted.inserted, 1);
        assert.equal(navigator.search('Identity free').total, 1);

        assert.throws(() => navigator.restoreArchiveSnapshot({
            sessionKey: 'account:account-a', revision: 0, chats: null
        }), expectCode('INVALID_SNAPSHOT'));
        const documentIndex = new SearchDocumentIndex(search.DEFAULT_SEARCH_LIMITS);
        assert.throws(() => documentIndex.restore('guest', [], -1), expectCode('INVALID_SNAPSHOT'));
        navigator.dispose();
    });

    it('detects revision/session drift and compensates aborts after mutation', async () => {
        const navigator = new search.SearchNavigator({ session: 'account-a' });
        navigator.rebuild([{ id: 'before', title: 'Before' }]);
        const contributor = search.createChatsPortableRestoreContributor({ navigator });
        const stale = await contributor.snapshot(restoreContext());
        navigator.upsertChat({ id: 'other' });
        await assert.rejects(contributor.apply(restoreContext([], stale)), expectCode('STALE_CHATS_SNAPSHOT'));

        const current = await contributor.snapshot(restoreContext());
        navigator.changeSession('account-b');
        await assert.rejects(contributor.apply(restoreContext([], current)), expectCode('SESSION_CHANGED'));
        navigator.changeSession('account-a');

        const before = await contributor.snapshot(restoreContext());
        const controller = new AbortController();
        const rebuild = navigator.rebuild.bind(navigator);
        navigator.rebuild = records => {
            const result = rebuild(records);
            controller.abort();
            return result;
        };
        await assert.rejects(
            contributor.apply(restoreContext([
                action('insert', 'new', { id: 'new', title: 'New' })
            ], before, controller.signal)),
            expectCode('RESTORE_ABORTED')
        );
        navigator.rebuild = rebuild;
        assert.deepEqual(navigator.captureArchiveSnapshot(), {
            sessionKey: before.sessionKey, revision: before.revision, chats: before.chats
        });

        navigator.changeSession('account-b');
        await contributor.rollback({ section: 'chats', plan: {}, actions: [], snapshot: before });
        navigator.changeSession('account-a');
        assert.deepEqual(navigator.captureArchiveSnapshot().chats, before.chats);
        navigator.dispose();
    });
});
