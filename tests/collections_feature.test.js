const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let collections;

before(async () => {
    collections = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'features', 'collections', 'index.js')
    ).href);
});

const NOW = '2026-08-01T01:02:03.000Z';
const LATER = '2026-08-01T02:03:04.000Z';
const BASE_OPTIONS = Object.freeze({ sessionId: 'account-a', nowIso: NOW });

function clone(value) {
    return structuredClone(value);
}

function empty(sessionId = 'account-a') {
    return collections.createEmptyCollectionsState(sessionId);
}

function add(state, draft, options = {}) {
    return collections.createCollection(state, draft, { ...BASE_OPTIONS, ...options }).data;
}

function seededState() {
    let state = empty();
    state = add(state, {
        id: 'work', name: 'Work', tags: ['Important'], pinned: true,
        rules: [{ field: 'title', operator: 'contains', value: 'project' }]
    });
    state = add(state, {
        id: 'archive', name: 'Archive',
        rules: [{ field: 'url', operator: 'starts-with', value: '/app/archive', caseSensitive: true }]
    }, { nowIso: LATER });
    state = add(state, {
        id: 'research', name: 'Research', parentId: 'work', ruleMode: 'all',
        rules: [
            { field: 'title', operator: 'contains', value: 'Gemini' },
            { field: 'tag', operator: 'equals', value: 'AI' }
        ]
    });
    return state;
}

function createRepository(accountId, initial = undefined, overrides = {}) {
    let value = clone(initial);
    let flushCount = 0;
    const repository = {
        accountId,
        async get() { return clone(value); },
        async update(updater) {
            value = await updater(clone(value));
            return clone(value);
        },
        async flush() { flushCount += 1; },
        read() { return clone(value); },
        get flushCount() { return flushCount; },
        ...overrides
    };
    return repository;
}

function code(expected) {
    return error => error instanceof collections.CollectionsError && error.code === expected;
}

describe('Collections model contracts', () => {
    it('publishes bounded schemas and isolated native-owned empty state', () => {
        assert.equal(collections.COLLECTIONS_SCHEMA, 'primer-pp.collections');
        assert.equal(collections.COLLECTIONS_SCHEMA_VERSION, 1);
        assert.equal(collections.LEGACY_FOLDERS_SCHEMA, 'primer-pp.folders');
        assert.deepEqual(collections.RULE_FIELDS, ['title', 'url', 'tag', 'status']);
        assert.deepEqual(collections.RULE_OPERATORS, ['contains', 'equals', 'starts-with']);
        assert.deepEqual(collections.SORT_FIELDS, ['manual', 'name', 'createdAt', 'updatedAt']);

        const first = empty();
        const second = empty();
        first.collections.push({ id: 'mutation' });
        assert.equal(second.collections.length, 0);
        assert.deepEqual(second.native.notebooks, {
            available: false,
            ownership: 'native',
            officialEntryPolicy: 'preserve',
            observedAt: null
        });
    });

    it('normalizes limits, session identities, clocks, ids, and clone failures', () => {
        assert.equal(collections.resolveCollectionLimits({ maxDepth: 3 }).maxDepth, 3);
        assert.throws(() => collections.resolveCollectionLimits(null), code('INVALID_LIMITS'));
        assert.throws(() => collections.resolveCollectionLimits({ unknown: 1 }), code('INVALID_LIMITS'));
        assert.throws(() => collections.resolveCollectionLimits({ maxDepth: 0 }), code('INVALID_LIMITS'));
        assert.equal(collections.normalizeSessionId(' account '), 'account');
        assert.equal(collections.sessionIdFromContext({ accountId: '', userId: ' user ' }), 'user');
        assert.equal(collections.sessionIdFromContext({ id: 'id' }), 'id');
        assert.equal(collections.sessionIdFromContext({ email: 'mail@example.test' }), 'mail@example.test');
        assert.throws(() => collections.normalizeSessionId(''), code('INVALID_SESSION'));
        assert.throws(() => collections.normalizeSessionId('x'.repeat(161)), code('SESSION_ID_TOO_LONG'));
        assert.throws(() => collections.sessionIdFromContext(null), code('INVALID_SESSION'));
        assert.throws(() => collections.sessionIdFromContext({}), code('INVALID_SESSION'));
        assert.throws(() => collections.sessionIdFromContext({ userId: 'u', accessToken: 'no' }), code('CREDENTIAL_MATERIAL'));

        assert.equal(collections.getNowIso(() => new Date(NOW)), NOW);
        assert.equal(collections.getNowIso(() => NOW), NOW);
        assert.throws(() => collections.getNowIso(), code('INVALID_CLOCK'));
        assert.throws(() => collections.getNowIso(1), code('INVALID_CLOCK'));
        assert.throws(() => collections.getNowIso(() => 'bad'), code('INVALID_CLOCK'));
        assert.equal(collections.normalizeId(' id ', 'id').trim(), 'id');
        assert.throws(() => collections.normalizeId('', 'id'), code('INVALID_ID'));
        assert.throws(
            () => collections.normalizeId('too-long', 'id', { ...collections.COLLECTION_LIMITS, maxIdLength: 2 }),
            code('ID_TOO_LONG')
        );
        assert.equal(collections.normalizeItemId(' item '), 'item');
        assert.throws(() => collections.normalizeItemId(''), code('INVALID_ITEM_ID'));
        assert.throws(
            () => collections.normalizeItemId('long', { ...collections.COLLECTION_LIMITS, maxItemIdLength: 2 }),
            code('ITEM_ID_TOO_LONG')
        );
        assert.throws(() => collections.safeClone(() => {}), code('NOT_CLONEABLE'));
    });

    it('validates tags, rules, collection fields, timestamps, and native invariants', () => {
        assert.deepEqual(collections.normalizeTags(null), []);
        assert.deepEqual(collections.normalizeTags([' One ', 'one', 'Two']), ['One', 'Two']);
        assert.throws(() => collections.normalizeTags('one'), code('INVALID_TAGS'));
        assert.throws(() => collections.normalizeTags(['']), code('INVALID_TAG'));
        assert.throws(
            () => collections.normalizeTags(['long'], { ...collections.COLLECTION_LIMITS, maxTagLength: 2 }),
            code('TAG_TOO_LONG')
        );
        assert.throws(
            () => collections.normalizeTags(['a', 'b'], { ...collections.COLLECTION_LIMITS, maxTagsPerCollection: 1 }),
            code('TAG_LIMIT')
        );

        const rules = collections.normalizeRules([
            { field: 'title', operator: 'contains', value: ' Work ' },
            { field: 'tag', operator: 'equals', value: 'AI', caseSensitive: true, enabled: false, legacyType: 'regex' }
        ]);
        assert.equal(rules[0].value, 'Work');
        assert.equal(rules[1].enabled, false);
        assert.equal(rules[1].legacyType, 'regex');
        assert.deepEqual(collections.normalizeRules(undefined), []);
        assert.throws(() => collections.normalizeRules({}), code('INVALID_RULES'));
        assert.throws(() => collections.normalizeRules([null]), code('INVALID_RULE'));
        assert.throws(() => collections.normalizeRules([{ field: 'body', operator: 'contains', value: 'x' }]), code('INVALID_RULE_FIELD'));
        assert.throws(() => collections.normalizeRules([{ field: 'title', operator: 'regex', value: 'x' }]), code('INVALID_RULE_OPERATOR'));
        assert.throws(() => collections.normalizeRules([{ field: 'title', operator: 'contains', value: '' }]), code('INVALID_RULE_VALUE'));
        assert.throws(
            () => collections.normalizeRules([{ field: 'title', operator: 'contains', value: 'long' }], { ...collections.COLLECTION_LIMITS, maxRuleValueLength: 2 }),
            code('RULE_VALUE_TOO_LONG')
        );
        assert.throws(
            () => collections.normalizeRules([
                { field: 'title', operator: 'contains', value: 'a' },
                { field: 'title', operator: 'contains', value: 'b' }
            ], { ...collections.COLLECTION_LIMITS, maxRulesPerCollection: 1 }),
            code('RULE_LIMIT')
        );

        const normalized = collections.normalizeCollection({
            id: 'c', name: ' C ', parentId: '', position: 2, color: '#abc',
            tags: [], rules: [], ruleMode: 'all', collapsed: true, pinned: true,
            createdAt: NOW, updatedAt: LATER
        }, { nowIso: NOW });
        assert.equal(normalized.parentId, null);
        assert.equal(normalized.ruleMode, 'all');
        assert.equal(normalized.color, '#abc');
        assert.equal(collections.normalizeCollection({ id: 'invalid-color', name: 'Invalid color', color: '#12345' }, { nowIso: NOW }).color, null);
        assert.equal(normalized.collapsed, true);
        assert.equal(normalized.pinned, true);
        assert.equal(collections.normalizeCollection({ id: 'clocked', name: 'Clocked' }, { clock: () => NOW }).createdAt, NOW);
        assert.throws(() => collections.normalizeCollection(null, { nowIso: NOW }), code('INVALID_COLLECTION'));
        assert.throws(() => collections.normalizeCollection({ id: 'c', name: '' }, { nowIso: NOW }), code('INVALID_NAME'));
        assert.throws(
            () => collections.normalizeCollection({ id: 'c', name: 'long' }, { nowIso: NOW, limits: { maxNameLength: 2 } }),
            code('NAME_TOO_LONG')
        );
        assert.throws(() => collections.normalizeCollection({ id: 'c', name: 'C', position: -1 }, { nowIso: NOW }), code('INVALID_POSITION'));
        assert.throws(() => collections.normalizeCollection({ id: 'c', name: 'C', ruleMode: 'none' }, { nowIso: NOW }), code('INVALID_RULE_MODE'));
        assert.throws(() => collections.normalizeCollection({ id: 'c', name: 'C', createdAt: 'bad' }, { nowIso: NOW }), code('INVALID_TIMESTAMP'));

        assert.deepEqual(collections.createNativeMetadata({ notebooks: {
            available: true, ownership: 'extension', officialEntryPolicy: 'hide', observedAt: NOW
        } }).notebooks, {
            available: true, ownership: 'native', officialEntryPolicy: 'preserve', observedAt: NOW
        });
    });
});

describe('Collections normalization and legacy migration', () => {
    it('normalizes positions, memberships, and clone isolation', () => {
        const raw = {
            schema: 'primer-pp.collections', version: 1, sessionId: 'account-a',
            collections: [
                { id: 'b', name: 'B', parentId: null, position: 5, createdAt: NOW, updatedAt: NOW },
                { id: 'a', name: 'A', parentId: null, position: 1, createdAt: NOW, updatedAt: NOW }
            ],
            memberships: [{ itemId: 'chat', collectionIds: ['b', 'a', 'a'] }],
            native: { notebooks: { available: true, observedAt: NOW, ownership: 'extension' } }
        };
        const state = collections.normalizeCollectionsState(raw, BASE_OPTIONS);
        raw.collections[0].name = 'mutated';
        assert.deepEqual(state.collections.map(item => [item.id, item.position]), [['b', 1], ['a', 0]]);
        assert.deepEqual(state.memberships, [{ itemId: 'chat', collectionIds: ['a', 'b'] }]);
        assert.equal(state.collections[0].name, 'B');
        assert.equal(state.native.notebooks.ownership, 'native');
        assert.equal(state.native.notebooks.officialEntryPolicy, 'preserve');
    });

    it('migrates legacy Folders purely and disables unsafe regex rules', () => {
        const legacy = {
            schema: 'primer-pp.folders', version: 1,
            folders: {
                work: {
                    name: 'Work', color: '#123456', pinned: true, collapsed: true,
                    createdAt: NOW,
                    rules: [
                        { type: 'keyword', value: ' project ' },
                        { type: 'regex', value: '^secret' },
                        { type: 'keyword', value: '' },
                        null
                    ]
                },
                raw: 'legacy malformed folder'
            },
            folderOrder: ['missing', 'work', 'work'],
            chatToFolder: { chat1: 'work', chat2: 'missing', '': 'work' }
        };
        const before = clone(legacy);
        const state = collections.migrateLegacyFolders(legacy, BASE_OPTIONS);
        assert.deepEqual(legacy, before);
        assert.deepEqual(state.collections.map(item => item.id), ['work', 'raw']);
        assert.equal(state.collections[0].rules[0].enabled, true);
        assert.equal(state.collections[0].rules[1].enabled, false);
        assert.equal(state.collections[0].rules[1].legacyType, 'regex');
        assert.deepEqual(state.memberships, [{ itemId: 'chat1', collectionIds: ['work'] }]);
        assert.equal(state.collections[1].name, 'Folder 2');
        assert.equal(state.collections[0].color, '#123456');
        assert.throws(() => collections.migrateLegacyFolders(null, BASE_OPTIONS), code('INVALID_LEGACY_FOLDERS'));
        assert.deepEqual(
            collections.migrateLegacyFolders({ folders: 'bad' }, { sessionId: 'account-a', clock: () => NOW }).collections,
            []
        );
        assert.throws(
            () => collections.migrateLegacyFolders({ folders: { a: {}, b: {} } }, {
                ...BASE_OPTIONS, limits: { maxCollections: 1 }
            }),
            code('COLLECTION_LIMIT')
        );
        assert.equal(collections.migrateLegacyFolders({
            folders: { ' trimmed ': { name: 'Trimmed' } },
            folderOrder: [' trimmed ']
        }, BASE_OPTIONS).collections[0].id, 'trimmed');
        assert.throws(() => collections.migrateLegacyFolders({
            folders: { a: {}, ' a ': {} }
        }, BASE_OPTIONS), code('DUPLICATE_COLLECTION_ID'));
    });

    it('reports malformed schemas, hierarchy cycles, missing parents, depth, and membership limits', () => {
        const normalize = (raw, options = {}) => collections.normalizeCollectionsState(raw, { ...BASE_OPTIONS, ...options });
        assert.deepEqual(normalize(undefined), empty());
        assert.equal(normalize({ folders: { inferred: { name: 'Inferred' } } }).collections[0].id, 'inferred');
        assert.equal(normalize({ schema: 'primer-pp.folders', folders: {} }).collections.length, 0);
        assert.equal(collections.normalizeCollectionsState({ schemaVersion: 1, collections: [] }, {
            sessionId: 'account-a', clock: () => NOW
        }).version, 1);
        assert.throws(() => normalize('bad'), code('INVALID_STATE'));
        assert.throws(() => normalize({ schema: 'other', version: 1, collections: [] }), code('UNRECOGNIZED_SCHEMA'));
        assert.throws(() => normalize({ version: 0, collections: [] }), code('INVALID_VERSION'));
        assert.throws(() => normalize({ version: 2, collections: [] }), code('UNSUPPORTED_VERSION'));
        assert.throws(() => normalize({ version: 1, sessionId: 'other', collections: [] }), code('SESSION_MISMATCH'));
        assert.throws(() => normalize({ version: 1, collections: {} }), code('INVALID_COLLECTIONS'));
        assert.throws(
            () => normalize({ version: 1, collections: [{ id: 'a', name: 'A' }, { id: 'a', name: 'Again' }] }),
            code('DUPLICATE_COLLECTION_ID')
        );
        assert.throws(
            () => normalize({ version: 1, collections: [{ id: 'a', name: 'A', parentId: 'missing' }] }),
            code('PARENT_NOT_FOUND')
        );
        assert.throws(
            () => normalize({ version: 1, collections: [{ id: 'a', name: 'A', parentId: 'a' }] }),
            code('CYCLE_DETECTED')
        );
        assert.throws(
            () => normalize({ version: 1, collections: [
                { id: 'a', name: 'A', parentId: 'b' },
                { id: 'b', name: 'B', parentId: 'a' }
            ] }),
            code('CYCLE_DETECTED')
        );
        assert.throws(
            () => normalize({ version: 1, collections: [
                { id: 'a', name: 'A' },
                { id: 'b', name: 'B', parentId: 'a' }
            ] }, { limits: { maxDepth: 1 } }),
            code('DEPTH_LIMIT')
        );
        assert.throws(
            () => normalize({ version: 1, collections: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, { limits: { maxCollections: 1 } }),
            code('COLLECTION_LIMIT')
        );
        const base = { version: 1, collections: [{ id: 'a', name: 'A' }] };
        assert.throws(() => normalize({ ...base, memberships: {} }), code('INVALID_MEMBERSHIPS'));
        assert.throws(() => normalize({ ...base, memberships: [null] }), code('INVALID_MEMBERSHIP'));
        assert.throws(() => normalize({ ...base, memberships: [{ itemId: 'x', collectionIds: 'a' }] }), code('INVALID_MEMBERSHIP'));
        assert.throws(() => normalize({ ...base, memberships: [{ itemId: 'x', collectionIds: ['missing'] }] }), code('COLLECTION_NOT_FOUND'));
        assert.throws(() => normalize({ ...base, memberships: [
            { itemId: 'x', collectionIds: ['a'] }, { itemId: 'x', collectionIds: ['a'] }
        ] }), code('DUPLICATE_MEMBERSHIP_ITEM'));
        assert.throws(
            () => normalize({ ...base, memberships: [
                { itemId: 'x', collectionIds: ['a'] }, { itemId: 'y', collectionIds: ['a'] }
            ] }, { limits: { maxMembershipItems: 1 } }),
            code('MEMBERSHIP_ITEM_LIMIT')
        );
        assert.throws(
            () => normalize({
                version: 1,
                collections: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
                memberships: [{ itemId: 'x', collectionIds: ['a', 'b'] }]
            }, { limits: { maxMemberships: 1 } }),
            code('MEMBERSHIP_LIMIT')
        );
    });
});

describe('Collections hierarchy and membership operations', () => {
    it('creates, updates, and clones records with deterministic ids and clocks', () => {
        const source = { name: 'Generated', tags: ['One'] };
        const created = collections.createCollection(empty(), source, {
            ...BASE_OPTIONS,
            idFactory: context => `generated-${context.kind}`
        });
        source.tags[0] = 'mutated';
        assert.equal(created.collection.id, 'generated-create');
        assert.deepEqual(created.collection.tags, ['One']);
        assert.equal(created.collection.createdAt, NOW);
        assert.throws(() => collections.createCollection(empty(), { name: 'No id' }, BASE_OPTIONS), code('ID_FACTORY_REQUIRED'));
        assert.throws(() => collections.createCollection(created.data, { id: 'generated-create', name: 'Duplicate' }, BASE_OPTIONS), code('COLLECTION_EXISTS'));
        assert.throws(() => collections.createCollection(empty(), null, BASE_OPTIONS), code('INVALID_COLLECTION'));
        assert.throws(() => collections.createCollection(empty(), { id: 'x', name: 'X', parentId: 'missing' }, BASE_OPTIONS), code('COLLECTION_NOT_FOUND'));
        assert.throws(
            () => collections.createCollection(created.data, { id: 'another', name: 'A' }, { ...BASE_OPTIONS, limits: { maxCollections: 1 } }),
            code('COLLECTION_LIMIT')
        );

        const updated = collections.updateCollection(created.data, created.collection.id, {
            name: 'Updated', tags: ['Two'], rules: [{ field: 'tag', operator: 'equals', value: 'Two' }],
            ruleMode: 'all', color: 'bad', collapsed: true, pinned: true
        }, { ...BASE_OPTIONS, nowIso: LATER });
        assert.equal(updated.collection.name, 'Updated');
        assert.equal(updated.collection.updatedAt, LATER);
        assert.equal(updated.collection.createdAt, NOW);
        assert.equal(updated.collection.color, null);
        assert.throws(() => collections.updateCollection(updated.data, 'missing', { name: 'X' }, BASE_OPTIONS), code('COLLECTION_NOT_FOUND'));
        assert.throws(() => collections.updateCollection(updated.data, updated.collection.id, null, BASE_OPTIONS), code('INVALID_PATCH'));
        assert.throws(() => collections.updateCollection(updated.data, updated.collection.id, { parentId: null }, BASE_OPTIONS), code('UNKNOWN_FIELD'));
        assert.throws(() => collections.updateCollection(updated.data, updated.collection.id, {}, BASE_OPTIONS), code('NO_CHANGES'));
        assert.throws(() => collections.updateCollection(updated.data, updated.collection.id, { name: 'Updated' }, BASE_OPTIONS), code('NO_CHANGES'));
    });

    it('sorts siblings, renders trees, reorders, reparents, and blocks cycles/depth overflow', () => {
        let state = seededState();
        assert.deepEqual(collections.listCollections(state).map(item => item.id), ['work', 'archive']);
        assert.deepEqual(
            collections.listCollections(state, {}, { sessionId: 'account-a', clock: () => NOW }).map(item => item.id),
            ['work', 'archive']
        );
        assert.deepEqual(collections.listCollections(state, {}, BASE_OPTIONS).map(item => item.id), ['work', 'archive']);
        assert.deepEqual(collections.listCollections(state, { sortBy: 'name' }, BASE_OPTIONS).map(item => item.id), ['archive', 'work']);
        assert.deepEqual(collections.listCollections(state, { sortBy: 'name', direction: 'desc' }, BASE_OPTIONS).map(item => item.id), ['work', 'archive']);
        assert.deepEqual(collections.listCollections(state, { sortBy: 'createdAt' }, BASE_OPTIONS).map(item => item.id), ['work', 'archive']);
        assert.deepEqual(collections.listCollections(state, { sortBy: 'updatedAt', direction: 'desc' }, BASE_OPTIONS).map(item => item.id), ['archive', 'work']);
        assert.deepEqual(collections.listCollections(state, { parentId: 'work' }, BASE_OPTIONS).map(item => item.id), ['research']);
        assert.equal(collections.getCollectionTree(state, {}, BASE_OPTIONS)[0].children[0].id, 'research');
        assert.throws(() => collections.listCollections(state, 'bad', BASE_OPTIONS), code('INVALID_QUERY'));
        assert.throws(() => collections.listCollections(state, { parentId: 'missing' }, BASE_OPTIONS), code('COLLECTION_NOT_FOUND'));
        assert.throws(() => collections.listCollections(state, { sortBy: 'size' }, BASE_OPTIONS), code('INVALID_SORT'));
        assert.throws(() => collections.listCollections(state, { direction: 'sideways' }, BASE_OPTIONS), code('INVALID_SORT_DIRECTION'));

        let moved = collections.moveCollection(state, 'archive', { index: 0 }, { ...BASE_OPTIONS, nowIso: LATER });
        state = moved.data;
        assert.deepEqual(collections.listCollections(state, {}, BASE_OPTIONS).map(item => item.id), ['archive', 'work']);
        moved = collections.moveCollection(state, 'research', { parentId: null, index: 1 }, BASE_OPTIONS);
        state = moved.data;
        assert.equal(moved.collection.parentId, null);
        assert.deepEqual(collections.listCollections(state, {}, BASE_OPTIONS).map(item => item.id), ['archive', 'research', 'work']);
        state = collections.moveCollection(state, 'research', { parentId: 'work' }, BASE_OPTIONS).data;
        assert.throws(() => collections.moveCollection(state, 'work', { parentId: 'research' }, BASE_OPTIONS), code('CYCLE_DETECTED'));
        assert.throws(() => collections.moveCollection(state, 'work', { parentId: 'work' }, BASE_OPTIONS), code('CYCLE_DETECTED'));
        assert.throws(() => collections.moveCollection(state, 'work', { parentId: 'missing' }, BASE_OPTIONS), code('COLLECTION_NOT_FOUND'));
        assert.throws(() => collections.moveCollection(state, 'work', 'bad', BASE_OPTIONS), code('INVALID_MOVE'));
        assert.throws(() => collections.moveCollection(state, 'archive', { index: 99 }, BASE_OPTIONS), code('INVALID_MOVE_INDEX'));
        assert.throws(
            () => collections.moveCollection(state, 'archive', { parentId: 'research' }, { ...BASE_OPTIONS, limits: { maxDepth: 2 } }),
            code('DEPTH_LIMIT')
        );

        let ties = empty();
        ties = collections.createCollection(ties, { id: 'z', name: 'Zed' }, {
            sessionId: 'account-a', clock: () => NOW
        }).data;
        ties = add(ties, { id: 'a', name: 'Alpha' });
        assert.deepEqual(collections.listCollections(ties, { sortBy: 'createdAt' }, BASE_OPTIONS).map(item => item.id), ['a', 'z']);
        assert.throws(() => add(ties, { id: 'duplicate', name: ' alpha ' }), code('DUPLICATE_COLLECTION_NAME'));
        assert.throws(() => collections.updateCollection(ties, 'z', { name: 'Ａｌｐｈａ' }, BASE_OPTIONS), code('DUPLICATE_COLLECTION_NAME'));
        ties = add(ties, { id: 'nested-alpha', name: 'Alpha', parentId: 'z' });
        assert.throws(
            () => collections.moveCollection(ties, 'nested-alpha', { parentId: null }, BASE_OPTIONS),
            code('DUPLICATE_COLLECTION_NAME')
        );
    });

    it('removes leaves or cascades subtrees and cleans manual memberships', () => {
        let state = seededState();
        state = collections.setManualMembership(state, 'chat-1', ['work', 'research'], BASE_OPTIONS).data;
        assert.throws(() => collections.removeCollection(state, 'work', {}, BASE_OPTIONS), code('COLLECTION_NOT_EMPTY'));
        assert.throws(() => collections.removeCollection(state, 'work', null, BASE_OPTIONS), code('INVALID_REMOVE'));
        const leaf = collections.removeCollection(state, 'archive', {}, BASE_OPTIONS);
        assert.deepEqual(leaf.removedIds, ['archive']);
        const cascade = collections.removeCollection(state, 'work', { cascade: true }, BASE_OPTIONS);
        assert.deepEqual(cascade.removedIds, ['research', 'work']);
        assert.equal(cascade.data.collections.length, 1);
        assert.equal(cascade.data.memberships.length, 0);
    });

    it('combines multi-collection manual membership with safe any/all rules', () => {
        let state = seededState();
        state = add(state, {
            id: 'disabled', name: 'Disabled',
            rules: [{ field: 'title', operator: 'contains', value: 'project', enabled: false }]
        });
        state = add(state, {
            id: 'exact', name: 'Exact',
            rules: [{ field: 'url', operator: 'equals', value: '/APP/ONE' }]
        });
        const assigned = collections.setManualMembership(state, 'chat-1', ['archive', 'work', 'work'], BASE_OPTIONS);
        state = assigned.data;
        assert.deepEqual(assigned.membership.collectionIds, ['archive', 'work']);
        const result = collections.resolveMembership(state, {
            id: 'chat-1', title: 'Gemini project plan', href: '/app/one', tags: ['AI']
        }, BASE_OPTIONS);
        assert.deepEqual(result.manual, ['archive', 'work']);
        assert.deepEqual(result.rule.sort(), ['exact', 'research', 'work']);
        assert.deepEqual(new Set(result.collectionIds), new Set(['archive', 'work', 'exact', 'research']));

        state = collections.setManualMembership(state, 'chat-1', [], BASE_OPTIONS).data;
        state = collections.setManualMembership(state, 'clocked', ['work'], {
            sessionId: 'account-a', clock: () => NOW
        }).data;
        assert.equal(collections.resolveMembership(state, { chatId: 'chat-1' }, BASE_OPTIONS).manual.length, 0);
        assert.throws(() => collections.setManualMembership(state, '', [], BASE_OPTIONS), code('INVALID_ITEM_ID'));
        assert.throws(() => collections.setManualMembership(state, 'chat', 'work', BASE_OPTIONS), code('INVALID_MEMBERSHIP'));
        assert.throws(() => collections.setManualMembership(state, 'chat', ['missing'], BASE_OPTIONS), code('COLLECTION_NOT_FOUND'));
        assert.throws(() => collections.resolveMembership(state, null, BASE_OPTIONS), code('INVALID_MEMBERSHIP_CANDIDATE'));
        assert.throws(() => collections.resolveMembership(state, {}, BASE_OPTIONS), code('INVALID_ITEM_ID'));
    });

    it('records Notebooks availability without accepting ownership or entry suppression', () => {
        const updated = collections.setNotebooksAvailability(empty(), {
            available: true,
            ownership: 'extension',
            officialEntryPolicy: 'hide',
            observedAt: NOW
        }, BASE_OPTIONS);
        assert.deepEqual(updated.notebooks, {
            available: true,
            ownership: 'native',
            officialEntryPolicy: 'preserve',
            observedAt: NOW
        });
        assert.throws(() => collections.setNotebooksAvailability(empty(), { available: 'yes' }, BASE_OPTIONS), code('INVALID_NATIVE_AVAILABILITY'));
    });
});

describe('Collections portable import and merge', () => {
    it('exports deterministic account-free JSON and parses portable and legacy inputs', () => {
        const state = seededState();
        const payload = collections.createCollectionsExport(state, BASE_OPTIONS);
        assert.equal(payload.format, 'primer-pp.collections.export');
        assert.equal(payload.exportedAt, NOW);
        assert.deepEqual(payload.collections.map(item => item.id), ['archive', 'research', 'work']);
        assert.equal(JSON.stringify(payload).includes('account-a'), false);
        assert.deepEqual(payload.native.notebooks, { ownership: 'native', officialEntryPolicy: 'preserve' });
        payload.collections[0].name = 'mutated';
        assert.notEqual(state.collections.find(item => item.id === 'archive').name, 'mutated');
        assert.throws(() => collections.createCollectionsExport(state), code('INVALID_CLOCK'));
        assert.equal(collections.createCollectionsExport(state, { clock: () => NOW }).exportedAt, NOW);

        const json = collections.serializeCollectionsExport(state, BASE_OPTIONS);
        const parsed = collections.parseCollectionsImport(json, BASE_OPTIONS);
        assert.equal(parsed.collections.length, 3);
        assert.equal(collections.parseCollectionsImport({
            format: 'primer-pp.collections.export',
            formatVersion: 1,
            collections: [],
            memberships: []
        }, BASE_OPTIONS).version, 1);
        const legacy = collections.parseCollectionsImport({ folders: { old: { name: 'Old' } } }, BASE_OPTIONS);
        assert.equal(legacy.collections[0].id, 'old');

        let branched = empty();
        branched = add(branched, { id: 'r1', name: 'R1' });
        branched = add(branched, { id: 'r2', name: 'R2' });
        branched = add(branched, { id: 'z-child', name: 'Z', parentId: 'r1' });
        branched = add(branched, { id: 'a-child', name: 'A', parentId: 'r2' });
        assert.equal(collections.importCollections(
            empty(),
            collections.createCollectionsExport(branched, BASE_OPTIONS),
            { conflict: 'skip' },
            BASE_OPTIONS
        ).data.collections.length, 4);
    });

    it('rejects malformed, oversized, credential-bearing, future, and cross-session imports', () => {
        assert.throws(() => collections.parseCollectionsImport('{bad', BASE_OPTIONS), code('INVALID_JSON'));
        assert.throws(
            () => collections.parseCollectionsImport(' '.repeat(64), { ...BASE_OPTIONS, limits: { maxImportBytes: 8 } }),
            code('IMPORT_TOO_LARGE')
        );
        assert.throws(() => collections.parseCollectionsImport(null, BASE_OPTIONS), code('INVALID_IMPORT'));
        assert.throws(
            () => collections.parseCollectionsImport({ password: 'no', version: 1, collections: [] }, BASE_OPTIONS),
            code('CREDENTIAL_MATERIAL')
        );
        assert.throws(
            () => collections.parseCollectionsImport({
                format: 'primer-pp.collections.export', formatVersion: 2, collections: []
            }, BASE_OPTIONS),
            code('UNSUPPORTED_EXPORT_VERSION')
        );
        assert.throws(() => collections.parseCollectionsImport({ unknown: true }, BASE_OPTIONS), code('UNRECOGNIZED_IMPORT'));
        const foreign = { schema: 'primer-pp.collections', version: 1, sessionId: 'other', collections: [] };
        assert.throws(() => collections.parseCollectionsImport(foreign, BASE_OPTIONS), code('IMPORT_SESSION_MISMATCH'));
        assert.equal(collections.parseCollectionsImport(foreign, { ...BASE_OPTIONS, allowCrossSession: true }).sessionId, 'account-a');
    });

    it('merges with explicit conflict policies and remaps membership on rename', () => {
        let existing = empty();
        existing = add(existing, { id: 'same', name: 'Existing' });
        existing = collections.setManualMembership(existing, 'chat-existing', ['same'], BASE_OPTIONS).data;
        let incoming = empty();
        incoming = add(incoming, { id: 'same', name: 'Incoming' });
        incoming = add(incoming, { id: 'child', name: 'Child', parentId: 'same' });
        incoming = collections.setManualMembership(incoming, 'chat-imported', ['same', 'child'], BASE_OPTIONS).data;
        const portable = collections.createCollectionsExport(incoming, BASE_OPTIONS);

        assert.throws(() => collections.importCollections(existing, portable, {}, BASE_OPTIONS), code('IMPORT_CONFLICT'));
        const skipped = collections.importCollections(existing, portable, { conflict: 'skip' }, BASE_OPTIONS);
        assert.deepEqual(skipped.report.skipped, ['same']);
        assert.equal(skipped.data.collections.find(item => item.id === 'same').name, 'Existing');
        assert.equal(skipped.data.collections.find(item => item.id === 'child').parentId, 'same');

        const overwritten = collections.importCollections(existing, portable, { conflict: 'incoming' }, BASE_OPTIONS);
        assert.equal(overwritten.data.collections.find(item => item.id === 'same').name, 'Incoming');
        assert.deepEqual(overwritten.report.replaced, ['same']);

        const renamed = collections.importCollections(existing, portable, { conflict: 'rename' }, {
            ...BASE_OPTIONS,
            idFactory: () => 'same-imported'
        });
        assert.deepEqual(renamed.report.renamed, [{ fromId: 'same', toId: 'same-imported' }]);
        assert.equal(renamed.data.collections.find(item => item.id === 'child').parentId, 'same-imported');
        assert.deepEqual(
            renamed.data.memberships.find(item => item.itemId === 'chat-imported').collectionIds,
            ['child', 'same-imported']
        );
        assert.equal(renamed.report.importedMemberships, 2);

        assert.throws(
            () => collections.importCollections(existing, portable, { conflict: 'rename' }, BASE_OPTIONS),
            code('ID_FACTORY_REQUIRED')
        );
        assert.throws(
            () => collections.importCollections(existing, portable, { conflict: 'rename' }, { ...BASE_OPTIONS, idFactory: () => 'same' }),
            code('ID_FACTORY_COLLISION')
        );

        let doubleExisting = add(empty(), { id: 'one', name: 'One' });
        doubleExisting = add(doubleExisting, { id: 'two', name: 'Two' });
        let doubleIncoming = add(empty(), { id: 'one', name: 'Incoming One' });
        doubleIncoming = add(doubleIncoming, { id: 'two', name: 'Incoming Two' });
        assert.throws(() => collections.importCollections(
            doubleExisting,
            collections.createCollectionsExport(doubleIncoming, BASE_OPTIONS),
            { conflict: 'rename' },
            { ...BASE_OPTIONS, idFactory: () => 'one-imported' }
        ), code('ID_FACTORY_COLLISION'));
    });

    it('replaces data while retaining local native facts and validates import options', () => {
        const existing = collections.setNotebooksAvailability(seededState(), { available: true, observedAt: NOW }, BASE_OPTIONS).data;
        let incoming = empty();
        incoming = add(incoming, { id: 'new', name: 'New' });
        incoming = collections.setManualMembership(incoming, 'chat', ['new'], BASE_OPTIONS).data;
        const replacement = collections.importCollections(
            existing,
            collections.createCollectionsExport(incoming, BASE_OPTIONS),
            { mode: 'replace', conflict: 'skip' },
            BASE_OPTIONS
        );
        assert.deepEqual(replacement.data.collections.map(item => item.id), ['new']);
        assert.equal(replacement.data.native.notebooks.available, true);
        assert.deepEqual(replacement.report.imported, ['new']);
        assert.equal(replacement.report.importedMemberships, 1);
        assert.throws(() => collections.importCollections(existing, {}, { mode: 'append' }, BASE_OPTIONS), code('INVALID_IMPORT_MODE'));
        assert.throws(() => collections.importCollections(existing, {}, { conflict: 'random' }, BASE_OPTIONS), code('INVALID_CONFLICT_POLICY'));
    });
});

describe('Session-bound Collections service and ModuleHost descriptor', () => {
    it('runs CRUD, queries, native metadata, transfer, flush, and account switching', async () => {
        const repos = new Map([
            ['account-a', createRepository('account-a')],
            ['account-b', createRepository('account-b')]
        ]);
        let sequence = 0;
        const service = collections.createCollectionsService({
            repositoryForSession: async id => repos.get(id),
            clock: () => NOW,
            idFactory: () => `generated-${++sequence}`
        });

        assert.equal(await service.start({ userId: 'account-a' }), 'account-a');
        assert.equal(await service.start('account-a'), 'account-a');
        assert.equal(await service.getSessionId(), 'account-a');
        const created = await service.create({ name: 'One' });
        await service.create({ id: 'child', name: 'Child', parentId: created.id });
        assert.equal((await service.tree())[0].children[0].id, 'child');
        assert.equal((await service.list({ parentId: created.id }))[0].id, 'child');
        assert.equal((await service.update(created.id, { name: 'Renamed' })).name, 'Renamed');
        assert.equal((await service.move('child', { parentId: null })).parentId, null);
        await service.setManualMembership('chat', [created.id]);
        assert.deepEqual(await service.setManualMemberships([
            { itemId: 'batch-a', collectionIds: [created.id] },
            { itemId: 'batch-b', collectionIds: [created.id] }
        ]), [
            { itemId: 'batch-a', collectionIds: [created.id] },
            { itemId: 'batch-b', collectionIds: [created.id] }
        ]);
        assert.throws(() => service.setManualMemberships(null), code('INVALID_MEMBERSHIP_BATCH'));
        assert.throws(() => service.setManualMemberships([null]), code('INVALID_MEMBERSHIP_BATCH'));
        assert.deepEqual((await service.resolveMembership({ id: 'chat' })).manual, [created.id]);
        assert.equal((await service.setNotebooksAvailability({ available: true })).ownership, 'native');
        const objectExport = await service.exportObject();
        const jsonExport = await service.exportJson();
        assert.equal(objectExport.format, 'primer-pp.collections.export');
        assert.equal(JSON.parse(jsonExport).format, objectExport.format);
        await service.remove('child');
        const report = await service.importJson(jsonExport, { mode: 'replace' });
        assert.equal(report.imported.length, 2);
        const snapshot = await service.getSnapshot();
        snapshot.collections[0].name = 'mutated';
        assert.notEqual((await service.getSnapshot()).collections[0].name, 'mutated');
        await service.flush();

        assert.equal(await service.switchSession({ accountId: 'account-b' }), 'account-b');
        assert.equal((await service.getSnapshot()).collections.length, 0);
        assert.equal(repos.get('account-a').flushCount, 2);
        assert.equal(await service.switchSession('account-b'), 'account-b');
        await service.stop();
        assert.equal(repos.get('account-b').flushCount, 1);
        await service.stop();
        await assert.rejects(service.getSnapshot(), code('SERVICE_INACTIVE'));
    });

    it('validates construction, lifecycle, repositories, ownership, and envelope results', async () => {
        assert.throws(() => collections.createCollectionsService(), /repositoryForSession/);
        assert.throws(() => collections.createCollectionsService({ repositoryForSession() {}, clock: 1 }), /clock/);
        assert.throws(() => collections.createCollectionsService({ repositoryForSession() {}, idFactory: 1 }), /idFactory/);

        const invalidRepo = collections.createCollectionsService({ repositoryForSession: async () => ({}) });
        await assert.rejects(invalidRepo.start('a'), code('INVALID_REPOSITORY'));
        const throwingFactory = collections.createCollectionsService({ repositoryForSession: async () => { throw new Error('no'); } });
        await assert.rejects(throwingFactory.start('a'), error => error.code === 'REPOSITORY_FACTORY_FAILED' && error.cause.message === 'no');
        const readOnly = collections.createCollectionsService({
            repositoryForSession: async () => createRepository(undefined, undefined, { scope: { readOnly: true } })
        });
        await assert.rejects(readOnly.start('a'), code('READ_ONLY_SESSION'));
        const mismatch = collections.createCollectionsService({ repositoryForSession: async () => createRepository('other') });
        await assert.rejects(mismatch.start('a'), code('SESSION_BOUNDARY'));
        const scopeMismatch = collections.createCollectionsService({
            repositoryForSession: async () => createRepository(undefined, undefined, {
                scope: { readOnly: false, targetUserId: 'a', sessionUserId: 'other' }
            })
        });
        await assert.rejects(scopeMismatch.start('a'), code('SESSION_BOUNDARY'));

        const scopedRepo = createRepository(undefined, undefined, {
            scope: { readOnly: false, sessionUserId: 'scoped' }
        });
        const defaultClock = collections.createCollectionsService({
            repositoryForSession: async () => scopedRepo
        });
        await defaultClock.start('scoped');
        assert.equal((await defaultClock.getSnapshot()).sessionId, 'scoped');

        const shared = createRepository(undefined);
        const reused = collections.createCollectionsService({ repositoryForSession: async () => shared, clock: () => NOW });
        await reused.start('a');
        await assert.rejects(reused.switchSession('b'), code('SESSION_BOUNDARY'));
        await assert.rejects(reused.start('b'), code('ALREADY_STARTED'));

        let stored;
        const envelopeRepo = createRepository('envelope', undefined, {
            async update(updater) {
                stored = await updater(clone(stored));
                return { format: 'primer-pp.storage', schemaVersion: 1, revision: 1, data: clone(stored) };
            },
            async get() { return clone(stored); }
        });
        const envelope = collections.createCollectionsService({
            repositoryForSession: async () => envelopeRepo,
            clock: () => NOW,
            idFactory: () => 'id'
        });
        await envelope.start('envelope');
        assert.equal((await envelope.create({ name: 'Envelope' })).id, 'id');
    });

    it('exposes a UI-free ModuleHost lifecycle and capability', async () => {
        assert.throws(
            () => collections.createCollectionsModule({ defaultEnabled: 'yes', repositoryForSession() {} }),
            /defaultEnabled/
        );
        const repo = createRepository('account');
        const descriptor = collections.createCollectionsModule({
            defaultEnabled: true,
            repositoryForSession: async () => repo,
            clock: () => NOW,
            idFactory: () => 'id'
        });
        assert.equal(descriptor.id, 'collections');
        assert.equal(descriptor.defaultEnabled, true);
        assert.deepEqual(descriptor.provides, ['collections.service']);
        assert.doesNotMatch(JSON.stringify(descriptor), /mount|selector|DOM/i);
        let capability;
        const lifecycle = descriptor.create({
            session: 'account',
            provideCapability(name, value) { capability = { name, value }; }
        });
        await lifecycle.start();
        assert.equal(capability.name, 'collections.service');
        assert.equal(await capability.value.getSessionId(), 'account');
        await lifecycle.onSessionChange('account');
        await lifecycle.stop();
    });
});
