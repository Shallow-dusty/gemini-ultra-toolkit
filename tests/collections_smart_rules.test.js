const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const NOW = '2026-08-01T00:00:00.000Z';
let collections;
let rulesSource;

before(async () => {
    [collections, rulesSource] = await Promise.all([
        import(pathToFileURL(path.join(__dirname, '..', 'src', 'features', 'collections', 'index.js')).href),
        import(pathToFileURL(path.join(__dirname, '..', 'src', 'features', 'collections', 'rules.js')).href)
    ]);
});

function clone(value) {
    return structuredClone(value);
}

function code(expected) {
    return error => error?.code === expected;
}

function collection(id, name, rules, ruleMode = 'all', parentId = null, position = 0) {
    return {
        id, name, parentId, position, tags: [], rules, ruleMode, color: null,
        collapsed: false, pinned: false, createdAt: NOW, updatedAt: NOW
    };
}

function state(memberships = []) {
    return {
        schema: 'primer-pp.collections',
        version: 1,
        sessionId: 'account-a',
        collections: [
            collection('projects', 'Projects', [
                { field: 'title', operator: 'contains', value: 'project', enabled: true, caseSensitive: false },
                { field: 'tag', operator: 'equals', value: 'AI', enabled: true, caseSensitive: false },
                { field: 'status', operator: 'equals', value: 'archived', enabled: true, caseSensitive: false }
            ]),
            collection('queued', 'Queued', [
                { field: 'status', operator: 'starts-with', value: 'queue', enabled: true, caseSensitive: false }
            ], 'any', null, 1),
            collection('exact', 'Exact URL', [
                { field: 'url', operator: 'equals', value: '/app/exact', enabled: true, caseSensitive: true }
            ], 'any', null, 2)
        ],
        memberships,
        native: {
            notebooks: { available: true, ownership: 'native', officialEntryPolicy: 'preserve', observedAt: NOW }
        }
    };
}

function mutableService(initial, options = {}) {
    let current = clone(initial);
    const writes = [];
    return {
        writes,
        read: () => clone(current),
        set: value => { current = clone(value); },
        async getSnapshot() { return clone(current); },
        async setManualMemberships(updates) {
            writes.push(clone(updates));
            if (options.writeError) throw options.writeError;
            for (const update of updates) {
                current = collections.setManualMembership(
                    current,
                    update.itemId,
                    update.collectionIds,
                    { sessionId: current.sessionId, nowIso: NOW }
                ).data;
            }
            return clone(updates);
        }
    };
}

describe('Collections smart rule preview', () => {
    it('loads direct source exports', async () => {
        assert.equal(typeof collections.createSmartRulePreview, 'function');
        assert.equal(typeof collections.createRulePreviewSession, 'function');
    });

    it('combines title, tag, and status locally across exact visible/archive ids', () => {
        const input = state([{ itemId: 'already', collectionIds: ['projects'] }]);
        const sources = {
            visible: [
                { id: 'shared', title: 'Visible Project', href: '/app/shared', tags: ['AI'] },
                { chatId: 'queued-only', title: 'Inbox', status: 'queued' },
                { itemId: 'exact-only', title: 'Exact', url: '/app/exact' },
                { id: 'not-matched', title: 'Project without labels' }
            ],
            archive: [
                { id: 'shared', title: 'Archived title', tags: ['AI'] },
                { id: 'archive-only', title: 'Project archive', tag: 'ai' },
                { id: 'already', title: 'Project done', tags: ['AI'] }
            ]
        };
        const before = clone(input);
        const preview = collections.createSmartRulePreview(input, sources, {
            sessionId: 'account-a', nowIso: NOW, archiveState: 'ready'
        });

        assert.deepEqual(preview.matchedChatIds, ['already', 'archive-only', 'exact-only', 'queued-only', 'shared']);
        assert.deepEqual(preview.visibleMatchedChatIds, ['exact-only', 'queued-only', 'shared']);
        assert.deepEqual(preview.archiveMatchedChatIds, ['already', 'archive-only', 'shared']);
        assert.deepEqual(preview.unchangedChatIds, ['already']);
        assert.deepEqual(preview.changes.map(change => change.itemId), ['archive-only', 'exact-only', 'queued-only', 'shared']);
        assert.equal(preview.matches.find(match => match.chatId === 'shared').matchedCollectionIds[0], 'projects');
        assert.equal(preview.semantics, 'local-memberships-only');
        assert.equal(preview.archiveState, 'ready');
        assert.equal(preview.candidateCount, 6);
        assert.deepEqual(input, before);
        assert.equal(
            collections.smartRulePreviewFingerprint(preview),
            collections.smartRulePreviewFingerprint(clone(preview))
        );
    });

    it('bounds and validates every local rule source before previewing', () => {
        assert.throws(() => collections.mergeRuleCandidates(null), code('INVALID_RULE_SOURCE'));
        assert.throws(() => collections.mergeRuleCandidates('bad'), code('INVALID_RULE_SOURCE'));
        assert.throws(() => collections.mergeRuleCandidates([]), code('INVALID_RULE_SOURCE'));
        assert.throws(() => collections.mergeRuleCandidates({ visible: {} }), code('INVALID_RULE_SOURCE'));
        assert.throws(() => collections.mergeRuleCandidates({ visible: [null] }), code('INVALID_RULE_CANDIDATE'));
        assert.throws(() => collections.mergeRuleCandidates({ visible: ['bad'] }), code('INVALID_RULE_CANDIDATE'));
        assert.throws(() => collections.mergeRuleCandidates({ visible: [[]] }), code('INVALID_RULE_CANDIDATE'));
        assert.throws(() => collections.mergeRuleCandidates({ visible: [{}] }), code('INVALID_ITEM_ID'));
        assert.throws(
            () => collections.mergeRuleCandidates({ visible: [{ id: 'a' }, { id: 'b' }] }, { limits: { maxMembershipItems: 1 } }),
            code('RULE_CANDIDATE_LIMIT')
        );
        assert.throws(
            () => collections.mergeRuleCandidates({ visible: [{ id: 'a' }], archive: [{ id: 'b' }] }, { limits: { maxMembershipItems: 1 } }),
            code('RULE_CANDIDATE_LIMIT')
        );
        assert.throws(
            () => collections.mergeRuleCandidates({ visible: [{ id: 'a', title: 'x'.repeat(9) }] }, { limits: { maxItemIdLength: 1 } }),
            code('RULE_CANDIDATE_LIMIT')
        );
        assert.throws(
            () => collections.mergeRuleCandidates({ visible: [{ id: 'a', tags: ['a', 'b'] }] }, { limits: { maxTagsPerCollection: 1 } }),
            code('RULE_CANDIDATE_LIMIT')
        );
        assert.throws(
            () => collections.mergeRuleCandidates({ visible: [{ id: 'a', status: 'long' }] }, { limits: { maxTagLength: 2 } }),
            code('RULE_CANDIDATE_LIMIT')
        );
        assert.throws(
            () => collections.createSmartRulePreview(state(), { visible: [], archive: [] }, {
                sessionId: 'account-a', nowIso: NOW, archiveState: 'failed'
            }),
            code('INVALID_ARCHIVE_STATE')
        );
        const defaults = collections.createSmartRulePreview(state(), { archive: [] });
        assert.equal(defaults.archiveState, 'unavailable');
        assert.equal(defaults.sessionId, 'account-a');
        const filled = collections.mergeRuleCandidates({
            visible: [{ id: 'filled' }],
            archive: [{ id: 'filled', title: 'Archive title', url: '/app/archive' }]
        });
        assert.equal(filled[0].title, 'Archive title');
        assert.equal(filled[0].url, '/app/archive');
        assert.deepEqual(rulesSource.normalizeRuleCandidateFields(null), { title: '', url: '', tags: [], statuses: [] });
        assert.deepEqual(rulesSource.normalizeRuleCandidateFields([]), { title: '', url: '', tags: [], statuses: [] });
        assert.equal(rulesSource.matchesCollectionRule(
            { field: 'title', operator: 'contains', value: 'Case', caseSensitive: true },
            { title: 'Case match', url: '', tags: [], statuses: [] }
        ), true);
        assert.deepEqual(rulesSource.matchingRuleCollectionIds([
            collection('z', 'Z', [{ field: 'title', operator: 'contains', value: 'x', enabled: true, caseSensitive: false }]),
            collection('a', 'A', [{ field: 'title', operator: 'contains', value: 'x', enabled: true, caseSensitive: false }])
        ], { title: 'x', url: '', tags: [], statuses: [] }), ['a', 'z']);
    });
});

describe('Collections explicit rule preview session', () => {
    it('requires valid local dependencies and a preview before apply', async () => {
        assert.throws(() => collections.createRulePreviewSession(), /getSnapshot/);
        assert.throws(() => collections.createRulePreviewSession({ service: { getSnapshot() {} } }), /setManualMemberships/);
        const service = mutableService(state());
        assert.throws(() => collections.createRulePreviewSession({ service, archiveProvider: {} }), /readChats/);
        assert.throws(() => collections.createRulePreviewSession({ service, confirm: true }), /confirmation/);
        const session = collections.createRulePreviewSession({ service });
        assert.equal(session.getPreview(), null);
        assert.equal(session.clear(), false);
        await assert.rejects(session.apply([]), code('RULE_PREVIEW_REQUIRED'));
        await session.preview(service.read(), [{ id: 'default-confirm', title: 'Project', tags: ['AI'], status: 'archived' }]);
        assert.equal((await session.apply([{ id: 'default-confirm', title: 'Project', tags: ['AI'], status: 'archived' }])).cancelled, true);
    });

    it('keeps preview data clone-isolated and applies only after strong confirmation', async () => {
        const service = mutableService(state());
        let confirmation = '';
        let session;
        session = collections.createRulePreviewSession({
            service,
            confirm(message) {
                assert.equal(session.suppressesObserver, true);
                confirmation = message;
                return true;
            }
        });
        const preview = await session.preview(service.read(), [{
            id: 'visible', title: 'Project alpha', tags: ['AI'], status: 'archived'
        }]);
        preview.matches[0].chatId = 'caller-mutation';
        assert.equal(session.getPreview().matches[0].chatId, 'visible');
        assert.equal(session.clear(), true);
        await session.preview(service.read(), [{
            id: 'visible', title: 'Project alpha', tags: ['AI'], status: 'archived'
        }]);
        const result = await session.apply([{
            id: 'visible', title: 'Project alpha', tags: ['AI'], status: 'archived'
        }]);
        assert.deepEqual(result, { applied: 1, matched: 1, cancelled: false });
        assert.match(confirmation, /reviewed local collection change/);
        assert.match(confirmation, /never changes Gemini chats or Notebooks/);
        assert.deepEqual(service.read().memberships, [{ itemId: 'visible', collectionIds: ['projects'] }]);
        assert.equal(session.suppressesObserver, false);
        assert.equal(session.getPreview(), null);
    });

    it('supports archive envelopes, exact archive ids, cancellation, and no-change cleanup', async () => {
        const service = mutableService(state());
        const contexts = [];
        let calls = 0;
        const provider = {
            async readChats(context) {
                assert.equal(Object.isFrozen(context), true);
                contexts.push(context);
                calls += 1;
                return calls <= 2
                    ? { chats: [{ id: 'archive-id', title: 'Project archive', tags: ['AI'] }] }
                    : { payload: { chats: [{ id: 'archive-id', title: 'Project archive', tags: ['AI'] }] } };
            }
        };
        const cancelled = collections.createRulePreviewSession({ service, archiveProvider: provider, confirm: () => false });
        const preview = await cancelled.preview(service.read(), []);
        assert.deepEqual(preview.archiveMatchedChatIds, ['archive-id']);
        assert.equal((await cancelled.apply([])).cancelled, true);
        assert.equal(service.writes.length, 0);
        assert.equal(cancelled.getPreview(), null);

        service.set(state([{ itemId: 'archive-id', collectionIds: ['projects'] }]));
        const noChanges = collections.createRulePreviewSession({ service, archiveProvider: provider, confirm: () => {
            throw new Error('must not confirm');
        } });
        assert.equal((await noChanges.preview(service.read(), [])).changeCount, 0);
        assert.deepEqual(await noChanges.apply([]), { applied: 0, matched: 1, cancelled: false });
        assert.equal(noChanges.getPreview(), null);
        assert.equal(contexts.every(context => context.purpose === 'collections-rule-preview'), true);
    });

    it('fails closed on stale, malformed, unavailable, and failed archive/apply paths', async () => {
        const service = mutableService(state());
        let records = [{ id: 'archive', title: 'Project', tags: ['AI'] }];
        const provider = { readChats: async () => records };
        const stale = collections.createRulePreviewSession({ service, archiveProvider: provider, confirm: () => true });
        await stale.preview(service.read(), []);
        records = [];
        await assert.rejects(stale.apply([]), code('RULE_PREVIEW_STALE'));
        assert.equal(stale.suppressesObserver, false);
        assert.equal(stale.getPreview(), null);

        for (const invalid of [null, 'bad', {}, { chats: null }, { payload: {} }]) {
            const malformed = collections.createRulePreviewSession({
                service,
                archiveProvider: { readChats: async () => invalid }
            });
            await assert.rejects(malformed.preview(service.read(), []), code('INVALID_ARCHIVE_CHAT_SOURCE'));
        }
        const unavailable = collections.createRulePreviewSession({
            service,
            archiveProvider: { readChats: async () => { throw new Error('offline'); } }
        });
        await assert.rejects(unavailable.preview(service.read(), []), error => {
            assert.equal(error.code, 'ARCHIVE_SOURCE_UNAVAILABLE');
            assert.equal(error.cause.message, 'offline');
            return true;
        });
        await assert.rejects(
            collections.createRulePreviewSession({ service }).preview(service.read(), null),
            code('INVALID_RULE_SOURCE')
        );

        const writeFailure = collections.createRulePreviewSession({
            service: mutableService(state(), { writeError: new Error('storage failed') }),
            confirm: () => true
        });
        await writeFailure.preview(state(), [{ id: 'x', title: 'Project', tags: ['AI'], status: 'archived' }]);
        await assert.rejects(
            writeFailure.apply([{ id: 'x', title: 'Project', tags: ['AI'], status: 'archived' }]),
            /storage failed/
        );
        assert.equal(writeFailure.suppressesObserver, false);
        assert.equal(writeFailure.getPreview(), null);
    });
});
