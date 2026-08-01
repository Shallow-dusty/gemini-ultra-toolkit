const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let api;
let locatorInternals;

before(async () => {
    api = await import(pathToFileURL(path.join(
        __dirname,
        '..',
        'src',
        'features',
        'search_navigator',
        'index.js'
    )).href);
    locatorInternals = await import(pathToFileURL(path.join(
        __dirname,
        '..',
        'src',
        'features',
        'search_navigator',
        'locator.js'
    )).href);
});

function sampleRecords() {
    return [
        {
            chatId: 'chat-a',
            title: 'Neural Search Handbook',
            createdAt: '2026-07-15T12:00:00.000Z',
            model: 'Pro',
            source: 'Local Archive',
            tags: ['Research', 'CJK'],
            annotations: [{ text: 'Pinned reference' }],
            messages: [
                {
                    messageId: 'message-a1',
                    role: 'user',
                    createdAt: '2026-07-16T12:00:00.000Z',
                    model: 'Flash',
                    source: 'Visible DOM',
                    content: `A long preface ${'x'.repeat(90)} semantic retrieval with embeddings ${'y'.repeat(90)}`,
                    annotation: 'Needs a follow-up'
                },
                {
                    id: 'message-a2',
                    role: 'assistant',
                    text: '人工智能检索，也支持カタカナ和한글。',
                    annotations: null
                }
            ]
        },
        {
            id: 'chat-b',
            title: 'Cooking notes',
            createdAt: '2026-06-01T00:00:00.000Z',
            model: 'Flash',
            source: 'Imported JSON',
            tags: ['Personal'],
            annotation: null,
            messages: [{ id: 'message-b1', role: 'assistant', content: 'Neural flavor pairing is only a metaphor.' }]
        }
    ];
}

function expectCode(fn, code) {
    assert.throws(fn, error => error instanceof api.SearchNavigatorError && error.code === code);
}

describe('Search & Navigator tokenization and deterministic retrieval', () => {
    it('normalizes compatibility text and tokenizes English plus CJK deterministically', () => {
        assert.equal(api.normalizeSearchText('  ＨＥＬＬＯ\nWorld  '), 'hello world');
        assert.equal(api.normalizeSearchText(null), '');
        assert.deepEqual(api.tokenizeSearchText('Hello, HELLO 2026'), ['hello', '2026']);
        assert.deepEqual(api.tokenizeSearchText('人工AI'), ['人', '工', '人工', 'ai']);
        assert.deepEqual(api.tokenizeSearchText('カナ 한글'), ['カ', 'ナ', 'カナ', '한', '글', '한글']);
        assert.deepEqual(api.tokenizeSearchText('...'), []);

        const projection = api.projectSearchText('  e\u0301  \uFB03  👩‍💻  ');
        assert.equal(projection.normalized, 'é ffi 👩‍💻');
        assert.deepEqual(projection.sourceSegments.slice(0, 4), [' ', ' ', 'e\u0301', ' ']);
        assert.equal(projection.offsets[0].start, 2);
        assert.equal(projection.offsets.at(-1).end, 9);
    });

    it('ranks weighted fields, returns context and emits stable locator descriptors', () => {
        const navigator = new api.SearchNavigator({ session: { accountId: 'account-a' } });
        navigator.rebuild(sampleRecords());

        const result = navigator.search('neural');
        assert.equal(result.total, 2);
        assert.equal(result.items[0].kind, 'chat');
        assert.equal(result.items[0].chatId, 'chat-a');
        assert.deepEqual(result.items[0].locator, { kind: 'chat', chatId: 'chat-a' });
        assert.equal(result.items[1].messageId, 'message-b1');
        assert.deepEqual(result.items[1].locator, {
            kind: 'message', chatId: 'chat-b', messageId: 'message-b1', ordinal: 0
        });

        const phrase = navigator.search('semantic retrieval', { fields: ['content'], snippetLength: 50 });
        assert.equal(phrase.total, 1);
        assert.equal(phrase.items[0].snippet.field, 'content');
        assert.equal(phrase.items[0].snippet.leadingEllipsis, true);
        assert.equal(phrase.items[0].snippet.trailingEllipsis, true);
        assert.match(phrase.items[0].snippet.text, /semantic retrieval/);

        const cjk = navigator.search('人工智能');
        assert.equal(cjk.total, 1);
        assert.equal(cjk.items[0].messageId, 'message-a2');
        assert.deepEqual(cjk.tokens, ['人', '工', '智', '能', '人工', '工智', '智能']);

        const fallback = navigator.search('retrieval semantic', {
            fields: ['content'],
            snippetLength: 24
        });
        assert.equal(fallback.total, 1);
        assert.match(fallback.items[0].snippet.text, /retrieval/);
    });

    it('maps normalized matches back to grapheme-bounded snippets including ellipses', () => {
        const navigator = new api.SearchNavigator();
        navigator.rebuild([{
            id: 'unicode',
            messages: [
                { id: 'nfkc', content: '👩‍💻 aa \uFB03 bb 👨‍👩‍👧‍👦' },
                { id: 'combining', content: 'xxxxx e\u0301 yyyyy' },
                { id: 'start', content: 'needle trailing context' },
                { id: 'end', content: 'leading context needle' },
                { id: 'short', content: 'tiny' }
            ]
        }]);
        const segmentCount = value => Array.from(
            new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(value)
        ).length;

        const nfkc = navigator.search('ffi', { fields: ['content'], snippetLength: 5 }).items[0].snippet;
        assert.match(nfkc.text, /\uFB03/u);
        assert.ok(segmentCount(nfkc.text) <= 5);
        assert.equal(nfkc.leadingEllipsis, true);
        assert.equal(nfkc.trailingEllipsis, true);

        const combining = navigator.search('é', { fields: ['content'], snippetLength: 4 }).items[0].snippet;
        assert.match(combining.text, /e\u0301/u);
        assert.ok(segmentCount(combining.text) <= 4);

        const leading = navigator.search('needle', {
            fields: ['content'], chatIds: ['unicode'], snippetLength: 8
        }).items.find(item => item.messageId === 'end').snippet;
        assert.equal(leading.leadingEllipsis, true);
        assert.equal(leading.trailingEllipsis, false);

        const trailing = navigator.search('needle', {
            fields: ['content'], chatIds: ['unicode'], snippetLength: 8
        }).items.find(item => item.messageId === 'start').snippet;
        assert.equal(trailing.leadingEllipsis, false);
        assert.equal(trailing.trailingEllipsis, true);

        const complete = navigator.search('tiny', {
            fields: ['content'], snippetLength: 8
        }).items[0].snippet;
        assert.deepEqual(complete, {
            field: 'content', text: 'tiny', leadingEllipsis: false, trailingEllipsis: false
        });
    });

    it('supports deterministic field, kind, account-local metadata and paging filters', () => {
        const navigator = new api.SearchNavigator({ session: 'account-a' });
        navigator.rebuild(sampleRecords());

        assert.equal(navigator.search('pinned', { fields: ['annotation'] }).items[0].chatId, 'chat-a');
        assert.equal(navigator.search('research', { fields: ['tags'] }).total, 1);
        assert.equal(navigator.search('neural', { fields: ['content'], kinds: ['message'] }).total, 1);
        assert.equal(navigator.search('neural', { chatIds: ['chat-b'] }).items[0].chatId, 'chat-b');
        assert.equal(navigator.search('neural', { roles: ['assistant'] }).total, 1);
        assert.equal(navigator.search('neural', { roles: ['user'] }).total, 0);
        assert.equal(navigator.search('neural', { tags: ['research', 'cjk'], tagMode: 'all' }).total, 1);
        assert.equal(navigator.search('neural', { tags: ['missing', 'personal'], tagMode: 'any' }).total, 1);
        assert.equal(navigator.search('neural', { tags: ['missing'], tagMode: 'all' }).total, 0);
        assert.equal(navigator.search('neural handbook', { match: 'all' }).total, 1);
        assert.equal(navigator.search('neural handbook', { match: 'any' }).total, 2);
        assert.equal(navigator.search('Neural Search', { match: 'exact' }).total, 1);
        assert.equal(navigator.search('Search Neural', { match: 'exact' }).total, 0);
        assert.equal(navigator.search('neural', { exclude: 'flavor' }).total, 1);
        assert.equal(navigator.search('neural', { exclude: ['handbook', 'metaphor'] }).total, 0);
        assert.equal(navigator.search('semantic', {
            roles: ['user'],
            dateFrom: '2026-07-16',
            dateTo: '2026-07-16',
            models: ['flash'],
            sources: ['visible dom']
        }).total, 1);
        assert.equal(navigator.search('neural', {
            dateFrom: '2026-07-01', models: ['PRO'], sources: ['LOCAL ARCHIVE']
        }).total, 1);
        assert.equal(navigator.search('neural', { dateFrom: '2027-01-01' }).total, 0);

        const page = navigator.search('neural', { kinds: ['chat', 'message', 'message'], offset: 1, limit: 1 });
        assert.equal(page.total, 2);
        assert.equal(page.items.length, 1);
        assert.equal(page.items[0].chatId, 'chat-b');
    });

    it('returns isolated inputs and outputs and handles empty indexes and queries', () => {
        const navigator = new api.SearchNavigator();
        const record = sampleRecords()[0];
        navigator.upsertChat(record);
        record.title = 'mutated';
        record.messages[0].content = 'mutated';

        const first = navigator.search('neural');
        first.items[0].chatId = 'mutated';
        first.items[0].locator.chatId = 'mutated';
        assert.equal(navigator.search('neural').items[0].chatId, 'chat-a');
        const compiled = [...navigator._index.compiledChats('guest')][0];
        assert.equal(Object.isFrozen(compiled), true);
        assert.equal(Object.isFrozen(compiled.chat.messages), true);
        assert.equal(Object.isFrozen(compiled.documents), true);
        assert.equal(Object.isFrozen(compiled.documents[0].fields), true);
        assert.equal(typeof compiled.documents[0].fields.title.tokens.add, 'undefined');
        assert.equal(compiled.documents[0].fields.title.tokens.has('neural'), true);
        assert.deepEqual(navigator.search(null), { query: '', tokens: [], total: 0, items: [] });
        assert.deepEqual(navigator.search(undefined), { query: '', tokens: [], total: 0, items: [] });
        assert.deepEqual(new api.SearchNavigator().search('missing'), {
            query: 'missing', tokens: ['missing'], total: 0, items: []
        });
    });

    it('uses deterministic tie breakers for equal chat and message scores', () => {
        const navigator = new api.SearchNavigator();
        navigator.rebuild([
            { id: 'a', tags: ['x'] },
            { id: 'z', tags: ['x'] },
            {
                id: 'tie',
                tags: ['x'],
                messages: [
                    { id: 'm1', content: 'x', annotation: 'x' },
                    { id: 'm2', content: 'x', annotation: 'x' }
                ]
            }
        ]);
        assert.deepEqual(
            navigator.search('x').items.map(item => [item.chatId, item.kind, item.messageId]),
            [
                ['a', 'chat', null],
                ['tie', 'chat', null],
                ['tie', 'message', 'm1'],
                ['tie', 'message', 'm2'],
                ['z', 'chat', null]
            ]
        );
    });

    it('keeps a JSON clone fallback for runtimes without structuredClone', () => {
        const original = globalThis.structuredClone;
        try {
            globalThis.structuredClone = undefined;
            const error = new api.SearchNavigatorError('TEST', 'clone', { nested: { value: 1 } });
            assert.deepEqual(error.details, { nested: { value: 1 } });
            assert.equal(new api.SearchNavigatorError('TEST', 'primitive', null).details, null);
        } finally {
            globalThis.structuredClone = original;
        }
    });
});

describe('Search & Navigator incremental and session lifecycle', () => {
    it('upserts, replaces and removes chats and messages without stale ordinals', () => {
        const navigator = new api.SearchNavigator({ session: { userId: 'account-a' } });
        assert.deepEqual(navigator.getStats(), { chats: 0, messages: 0, documents: 0 });
        assert.deepEqual(navigator.upsertChat({ id: 'c', title: null, messages: [] }), {
            chatId: 'c', messageCount: 0
        });
        assert.deepEqual(navigator.upsertChat({ id: 'c', title: 'new', messages: [] }), {
            chatId: 'c', messageCount: 0
        });
        assert.deepEqual(navigator.upsertMessage('c', { id: 'm1', content: 'first' }), {
            chatId: 'c', messageId: 'm1', ordinal: 0
        });
        assert.deepEqual(navigator.upsertMessage('c', { id: 'm2', text: 'second' }), {
            chatId: 'c', messageId: 'm2', ordinal: 1
        });
        assert.deepEqual(navigator.upsertMessage('c', { id: 'm1', content: 'updated first' }), {
            chatId: 'c', messageId: 'm1', ordinal: 0
        });
        assert.equal(navigator.search('first').total, 1);
        assert.equal(navigator.search('updated').items[0].locator.ordinal, 0);
        assert.deepEqual(navigator.getStats(), { chats: 1, messages: 2, documents: 3 });

        assert.equal(navigator.removeMessage('c', 'm1'), true);
        assert.equal(navigator.search('second').items[0].locator.ordinal, 0);
        assert.equal(navigator.removeMessage('c', 'missing'), false);
        assert.equal(navigator.removeMessage('missing', 'm2'), false);
        assert.equal(navigator.removeChat('missing'), false);
        assert.equal(navigator.removeChat('c'), true);
        assert.deepEqual(navigator.getStats(), { chats: 0, messages: 0, documents: 0 });
    });

    it('rebuilds transactionally and preserves independent account partitions', () => {
        const navigator = new api.SearchNavigator({ session: { email: 'a@example.test' } });
        navigator.rebuild([{ id: 'a', title: 'alpha' }]);
        expectCode(() => navigator.rebuild([{ id: 'broken' }, { id: 'broken' }]), 'DUPLICATE_ID');
        assert.equal(navigator.search('alpha').total, 1);

        navigator.changeSession({ id: 'b' });
        assert.deepEqual(navigator.getStats(), { chats: 0, messages: 0, documents: 0 });
        navigator.rebuild([{ id: 'b', title: 'beta' }]);
        assert.equal(navigator.search('alpha').total, 0);
        assert.equal(navigator.search('beta').total, 1);

        navigator.changeSession({ sessionId: 'a@example.test' });
        assert.equal(navigator.search('alpha').total, 1);
        assert.equal(navigator.clearSession(), true);
        assert.equal(navigator.clearSession(), false);
        assert.deepEqual(navigator.getStats(), { chats: 0, messages: 0, documents: 0 });
    });

    it('defines archive duplicate, replacement and canonical-alias behavior transactionally', () => {
        const navigator = new api.SearchNavigator();
        navigator.rebuild([{ id: 'same', title: 'before' }]);
        expectCode(() => navigator.importArchiveChats([
            { id: 'duplicate', title: 'one' },
            { chatId: 'duplicate', title: 'two' }
        ]), 'DUPLICATE_ID');
        assert.equal(navigator.search('before').total, 1);

        const merged = navigator.importArchiveChats([{ id: 'same', title: 'after' }]);
        assert.equal(merged.imported, 1);
        assert.equal(navigator.search('before').total, 0);
        assert.equal(navigator.search('after').total, 1);

        navigator.rebuild([{
            id: 'aliases',
            annotations: null,
            annotation: 'ignored canonical fallback',
            messages: [{ id: 'message', content: null, text: 'ignored text fallback' }]
        }]);
        assert.equal(navigator.search('ignored').total, 0);
        expectCode(() => navigator.upsertChat({ chatId: null, id: 'fallback' }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({
            id: 'chat',
            messages: [{ messageId: null, id: 'fallback' }]
        }), 'INVALID_RECORD');
        assert.equal(api.SEARCH_NAVIGATOR_SEMANTICS.recordAliases, 'first-own-property');
        assert.equal(api.SEARCH_NAVIGATOR_SEMANTICS.importDuplicates,
            'reject-within-payload-replace-existing-on-merge');
    });

    it('disposes idempotently and rejects subsequent operations', () => {
        const navigator = new api.SearchNavigator({ session: { id: 'dispose-me' } });
        navigator.upsertChat({ id: 'c' });
        navigator.dispose();
        navigator.dispose();
        expectCode(() => navigator.getStats(), 'DISPOSED');
        expectCode(() => navigator.search('x'), 'DISPOSED');
        expectCode(() => navigator.changeSession('other'), 'DISPOSED');
    });
});

describe('Search & Navigator validation and bounded indexing', () => {
    it('rejects invalid sessions, records and duplicate identifiers with stable codes', () => {
        expectCode(() => new api.SearchNavigator({ session: {} }), 'INVALID_SESSION');
        expectCode(() => new api.SearchNavigator({ session: 42 }), 'INVALID_SESSION');
        expectCode(() => new api.SearchNavigator({ limits: [] }), 'INVALID_OPTIONS');
        expectCode(() => new api.SearchNavigator({ limits: { unknown: 1 } }), 'INVALID_OPTIONS');
        expectCode(() => new api.SearchNavigator({ limits: { maxChats: 0 } }), 'INVALID_OPTIONS');
        expectCode(() => new api.SearchNavigator({ limits: { maxSnippetLength: 2 } }), 'INVALID_OPTIONS');

        const navigator = new api.SearchNavigator();
        expectCode(() => navigator.rebuild(null), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat(null), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ title: 'missing id' }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ id: 'c', title: 1 }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ id: 'c', tags: {} }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ id: 'c', tags: [1] }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ id: 'c', annotation: [{}] }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ id: 'c', createdAt: 'not-a-date' }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ id: 'c', source: {} }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ id: 'c', messages: [{ id: 'm', timestamp: {} }] }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ id: 'c', messages: {} }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ id: 'c', messages: [null] }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({ id: 'c', messages: [{ content: 'missing id' }] }), 'INVALID_RECORD');
        expectCode(() => navigator.upsertChat({
            id: 'c', messages: [{ id: 'same' }, { id: 'same' }]
        }), 'DUPLICATE_ID');
        expectCode(() => navigator.upsertMessage('missing', { id: 'm' }), 'NOT_FOUND');
        expectCode(() => navigator.removeChat(''), 'INVALID_RECORD');
        expectCode(() => navigator.removeMessage('c', ''), 'INVALID_RECORD');
    });

    it('enforces record, collection and query limits before mutating state', () => {
        const limits = {
            maxChats: 1,
            maxMessagesPerChat: 1,
            maxTotalMessages: 1,
            maxTitleLength: 3,
            maxContentLength: 4,
            maxTagsPerChat: 1,
            maxTagLength: 2,
            maxAnnotationsPerRecord: 1,
            maxAnnotationLength: 3,
            maxRoleLength: 3,
            maxMetadataLength: 3,
            maxQueryLength: 3,
            maxQueryTokens: 2,
            maxResults: 1,
            maxOffset: 1,
            maxSnippetLength: 3
        };
        const navigator = new api.SearchNavigator({ limits });
        expectCode(() => navigator.upsertChat({ id: 'c', title: 'long' }), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.upsertChat({ id: 'c', tags: ['a', 'b'] }), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.upsertChat({ id: 'c', tags: ['long'] }), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.upsertChat({ id: 'c', annotation: ['long'] }), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.upsertChat({ id: 'c', annotation: ['a', 'b'] }), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.upsertChat({ id: 'c', messages: [{ id: 'm1' }, { id: 'm2' }] }), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.upsertChat({ id: 'c', model: 'long' }), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.upsertChat({ id: 'c', messages: [{ id: 'm', content: '12345' }] }), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.upsertChat({ id: 'c', messages: [{ id: 'm', role: 'long' }] }), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.rebuild([{ id: 'a' }, { id: 'b' }]), 'LIMIT_EXCEEDED');

        navigator.upsertChat({ id: 'c', messages: [{ id: 'm', content: 'ok' }] });
        expectCode(() => navigator.upsertChat({ id: 'd' }), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.upsertMessage('c', { id: 'm2' }), 'LIMIT_EXCEEDED');
        navigator.upsertMessage('c', { id: 'm', content: 'new' });
        assert.equal(navigator.search('new').total, 1);
        expectCode(() => navigator.search('long'), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.search('人工'), 'LIMIT_EXCEEDED');
        expectCode(() => navigator.search(2), 'INVALID_QUERY');
        expectCode(() => navigator.search('new', { limit: 2 }), 'INVALID_OPTIONS');
        expectCode(() => navigator.search('new', { offset: 2 }), 'INVALID_OPTIONS');
        expectCode(() => navigator.search('new', { snippetLength: 4 }), 'INVALID_OPTIONS');

        const totalBound = new api.SearchNavigator({ limits: {
            maxChats: 2, maxMessagesPerChat: 2, maxTotalMessages: 1
        } });
        totalBound.upsertChat({ id: 'a', messages: [{ id: 'm1' }] });
        expectCode(() => totalBound.upsertChat({ id: 'b', messages: [{ id: 'm2' }] }), 'LIMIT_EXCEEDED');
        expectCode(() => totalBound.upsertMessage('a', { id: 'm2' }), 'LIMIT_EXCEEDED');
        expectCode(() => totalBound.rebuild([{
            id: 'a', messages: [{ id: 'm1' }, { id: 'm2' }]
        }]), 'LIMIT_EXCEEDED');
    });

    it('validates all filter options and keeps error details clone-safe', () => {
        const navigator = new api.SearchNavigator();
        for (const options of [
            null,
            { match: 'none' },
            { tagMode: 'none' },
            { fields: [] },
            { fields: ['bad'] },
            { kinds: 'chat' },
            { kinds: ['bad'] },
            { chatIds: 'a' },
            { chatIds: [] },
            { chatIds: [''] },
            { roles: [] },
            { roles: [1] },
            { models: [] },
            { models: [1] },
            { sources: [] },
            { dateFrom: 1 },
            { dateFrom: 'not-a-date' },
            { dateFrom: '2026-08-02', dateTo: '2026-08-01' },
            { exclude: [] },
            { exclude: [''] },
            { exclude: [1] },
            { tags: [] },
            { tags: {} },
            { unknown: true },
            { limit: 0 },
            { offset: -1 },
            { snippetLength: 0 },
            { snippetLength: 2 }
        ]) {
            expectCode(() => navigator.search('x', options), 'INVALID_OPTIONS');
        }
        try {
            navigator.search('x', { fields: ['bad'] });
        } catch (error) {
            error.details.option = 'mutated';
            assert.equal(error.code, 'INVALID_OPTIONS');
        }
    });

    it('validates archive options, envelope precedence, public locators and barrel exports', () => {
        const navigator = new api.SearchNavigator();
        for (const options of [null, [], { mode: 'append' }, { mode: 'merge', unknown: true }]) {
            expectCode(() => navigator.importArchiveChats([], options), 'INVALID_OPTIONS');
        }
        for (const source of [
            { chats: null, payload: { chats: [] } },
            { payload: null }
        ]) expectCode(() => navigator.importArchiveChats(source), 'INVALID_ARCHIVE');

        assert.deepEqual(api.createChatLocator(' chat '), { kind: 'chat', chatId: 'chat' });
        assert.deepEqual(api.createMessageLocator('chat', 'message', 0), {
            kind: 'message', chatId: 'chat', messageId: 'message', ordinal: 0
        });
        assert.deepEqual(api.assertSearchLocator({ kind: 'chat', chatId: 'chat' }), {
            kind: 'chat', chatId: 'chat'
        });
        for (const locator of [
            null,
            [],
            { kind: 'other' },
            { kind: 'chat', chatId: '' },
            { kind: 'message', chatId: 'c', messageId: '', ordinal: 0 },
            { kind: 'message', chatId: 'c', messageId: 'm', ordinal: -1 },
            { kind: 'message', chatId: 'c', messageId: 'm', ordinal: 0.5 }
        ]) expectCode(() => api.assertSearchLocator(locator), 'INVALID_LOCATOR');
        expectCode(() => locatorInternals.createSearchResult(
            { kind: 'branch', chatId: 'chat', messageId: null },
            { score: 1, matchedFields: [] },
            null
        ), 'INVALID_LOCATOR');

        assert.equal(api.SEARCH_NAVIGATOR_MODULE_ID, 'search-navigator');
        assert.equal(api.SEARCH_NAVIGATOR_VIEW_MODULE_ID, 'search-navigator-view');
        assert.equal(api.SEARCH_NAVIGATOR_CAPABILITY, 'search.navigator');
        assert.equal(typeof api.projectSearchText, 'function');
    });
});

describe('Search & Navigator ModuleHost contract', () => {
    it('publishes one capability, follows session changes and tears down cleanly', async () => {
        const descriptor = api.createSearchNavigatorModule({ defaultEnabled: false });
        assert.equal(descriptor.id, 'search-navigator');
        assert.equal(descriptor.defaultEnabled, false);
        const capabilities = new Map();
        const lifecycle = descriptor.create({
            session: { id: 'first' },
            provideCapability(name, value) { capabilities.set(name, value); }
        });
        const navigator = capabilities.get('search.navigator');
        navigator.upsertChat({ id: 'first-chat', title: 'first account' });
        lifecycle.onSessionChange({ id: 'second' });
        assert.equal(navigator.search('first').total, 0);
        navigator.upsertChat({ id: 'second-chat', title: 'second account' });
        lifecycle.onSessionChange({ id: 'first' });
        assert.equal(navigator.search('first').total, 1);
        lifecycle.stop();
        expectCode(() => navigator.getStats(), 'DISPOSED');
    });

    it('validates module options and defaults to enabled', () => {
        expectCode(() => api.createSearchNavigatorModule(null), 'INVALID_OPTIONS');
        assert.equal(api.createSearchNavigatorModule().defaultEnabled, true);
        assert.equal(api.createSearchNavigatorModule({ id: 'custom-search' }).id, 'custom-search');
    });
});
