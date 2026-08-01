const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let annotations;

before(async () => {
    annotations = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'features', 'annotations', 'index.js')
    ).href);
});

const NOW = '2026-08-01T01:02:03.000Z';
const LATER = '2026-08-01T02:03:04.000Z';

function clone(value) {
    return structuredClone(value);
}

function makeAnnotation(overrides = {}) {
    return {
        id: 'a-1',
        conversation: { id: 'chat-1', title: 'Architecture Review', href: '/app/chat-1' },
        anchor: { kind: 'conversation' },
        body: 'Remember the storage boundary',
        tags: ['Architecture', 'Local'],
        status: 'active',
        pinned: false,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides
    };
}

function makeState(items = [makeAnnotation()]) {
    return {
        version: 2,
        annotations: Object.fromEntries(items.map(item => [item.id, clone(item)]))
    };
}

function createRepository(accountId, initial = undefined, overrides = {}) {
    let value = clone(initial);
    let flushCount = 0;
    const repository = {
        accountId,
        async get() {
            return clone(value);
        },
        async update(updater) {
            value = await updater(clone(value));
            return clone(value);
        },
        async flush() {
            flushCount += 1;
        },
        read() {
            return clone(value);
        },
        get flushCount() {
            return flushCount;
        },
        ...overrides
    };
    return repository;
}

describe('annotations schema and anchors', () => {
    it('exports stable schema constants and creates isolated empty states', () => {
        assert.equal(annotations.ANNOTATIONS_SCHEMA, 'primer-pp.annotations');
        assert.equal(annotations.LEGACY_CHAT_NOTES_SCHEMA, 'primer-pp.chat-notes');
        assert.equal(annotations.ANNOTATIONS_SCHEMA_VERSION, 2);
        assert.deepEqual(annotations.ANNOTATION_STATUSES, ['active', 'resolved', 'archived']);

        const first = annotations.createEmptyAnnotationsState();
        const second = annotations.createEmptyAnnotationsState();
        first.annotations.changed = true;
        assert.deepEqual(second, { version: 2, annotations: {} });
    });

    it('uses conversation and stable message anchors without false diagnostics', () => {
        assert.deepEqual(
            annotations.resolveAnnotationAnchor(undefined, 'chat-1'),
            { kind: 'conversation', conversationId: 'chat-1' }
        );
        assert.deepEqual(
            annotations.resolveAnnotationAnchor({ kind: 'conversation', messageId: 'ignored' }, 'chat-1'),
            { kind: 'conversation', conversationId: 'chat-1' }
        );
        assert.deepEqual(
            annotations.resolveAnnotationAnchor({
                kind: 'message',
                stableId: ' msg-1 ',
                role: 'Gemini',
                ordinal: 4,
                excerpt: ' answer '
            }, 'chat-1'),
            {
                kind: 'message',
                conversationId: 'chat-1',
                messageId: 'msg-1',
                strategy: 'stable-id',
                role: 'assistant',
                ordinal: 4,
                excerpt: 'answer',
                diagnostics: []
            }
        );
    });

    it('creates diagnostic fallback anchors when Gemini exposes no stable message id', () => {
        const fallback = annotations.resolveAnnotationAnchor({
            kind: 'message', role: 'USER', ordinal: 0, excerpt: 'the selected passage'
        }, 'chat-1');
        assert.equal(fallback.kind, 'message');
        assert.equal(fallback.strategy, 'fallback');
        assert.equal(fallback.role, 'user');
        assert.equal(fallback.ordinal, 0);
        assert.match(fallback.fallbackKey, /^user:0:/);
        assert.deepEqual(fallback.diagnostics, ['MESSAGE_ID_UNAVAILABLE']);

        const weak = annotations.resolveAnnotationAnchor({ kind: 'message', role: 'other', ordinal: -1 }, 'chat-1');
        assert.equal(weak.role, 'unknown');
        assert.equal(weak.ordinal, null);
        assert.deepEqual(weak.diagnostics, ['MESSAGE_ID_UNAVAILABLE', 'WEAK_MESSAGE_ANCHOR']);
    });

    it('normalizes fields, aliases, tags, timestamps, and unsafe links', () => {
        const longTags = Array.from({ length: 40 }, (_, index) => ` Tag-${index} `);
        const annotation = annotations.normalizeAnnotation({
            chatId: ' chat-1 ',
            title: '',
            href: 'javascript:alert(1)',
            messageId: 'm-1',
            message: { role: 'model', ordinal: 2, excerpt: 'selection' },
            note: '  body text  ',
            tags: ['LOCAL', 'local', '', ...longTags],
            status: 'done',
            pinned: true,
            createdAt: 'bad-date',
            updatedAt: LATER
        }, { nowIso: NOW, idFactory: () => 'generated-id' });

        assert.equal(annotation.id, 'generated-id');
        assert.deepEqual(annotation.conversation, { id: 'chat-1', title: 'chat-1', href: '' });
        assert.equal(annotation.anchor.messageId, 'm-1');
        assert.equal(annotation.anchor.role, 'assistant');
        assert.equal(annotation.body, 'body text');
        assert.equal(annotation.status, 'resolved');
        assert.equal(annotation.pinned, true);
        assert.equal(annotation.createdAt, NOW);
        assert.equal(annotation.updatedAt, LATER);
        assert.equal(annotation.tags.length, 32);
        assert.equal(annotation.tags[0], 'LOCAL');

        const source = { ...makeAnnotation(), href: 'https://example.test/chat', tags: 'one', status: 'open' };
        delete source.conversation;
        source.conversationId = 'chat-2';
        const normalized = annotations.normalizeAnnotation(source, { now: () => new Date(NOW) });
        source.tags = 'mutated';
        assert.equal(normalized.conversation.href, 'https://example.test/chat');
        assert.deepEqual(normalized.tags, ['one']);
        assert.equal(normalized.status, 'active');

        const generated = annotations.normalizeAnnotation({ conversationId: 'generated-chat' }, { nowIso: NOW });
        assert.match(generated.id, /^annotation-[0-9a-f-]{36}$/);

        const dateClock = annotations.normalizeAnnotation(
            { conversationId: 'date-clock-chat', id: 'date-clock' },
            { now: () => new Date(NOW) }
        );
        assert.equal(dateClock.createdAt, NOW);
        assert.equal(dateClock.updatedAt, NOW);
    });

    it('returns typed errors for malformed annotations', () => {
        assert.throws(
            () => annotations.normalizeAnnotation(null),
            error => error instanceof annotations.AnnotationsDataError && error.code === 'INVALID_ANNOTATION'
        );
        assert.throws(
            () => annotations.normalizeAnnotation({ body: 'missing conversation' }),
            error => error.code === 'INVALID_FIELD'
        );
        assert.throws(
            () => annotations.normalizeAnnotation({ chatId: 'c', id: '' }, { nowIso: NOW, idFactory: () => '' }),
            /Annotation id/
        );
        assert.throws(
            () => annotations.normalizeAnnotation({ chatId: 'clock-required', id: 'clock-required' }),
            error => error.code === 'CLOCK_REQUIRED'
        );
        const deterministic = annotations.normalizeAnnotation({
            chatId: 'explicit-time',
            id: 'explicit-time',
            createdAt: NOW,
            updatedAt: LATER
        });
        assert.equal(deterministic.createdAt, NOW);
        assert.equal(deterministic.updatedAt, LATER);
    });
});

describe('annotations migrations and data operations', () => {
    it('migrates empty and legacy Chat Notes data without mutating the source', () => {
        assert.deepEqual(annotations.migrateAnnotationsData(null), { version: 2, annotations: {} });
        const legacy = {
            schema: 'primer-pp.chat-notes',
            version: 1,
            notes: {
                c1: {
                    title: 'Legacy', href: '/app/c1', note: 'old note', pinned: true,
                    createdAt: NOW, updatedAt: LATER
                },
                '': { note: 'invalid' }
            }
        };
        const migrated = annotations.migrateAnnotationsData(legacy, { nowIso: NOW });
        legacy.notes.c1.note = 'mutated';
        const item = Object.values(migrated.annotations)[0];
        assert.equal(Object.keys(migrated.annotations).length, 1);
        assert.equal(item.conversation.id, 'c1');
        assert.equal(item.body, 'old note');
        assert.equal(item.anchor.kind, 'conversation');
        assert.equal(item.pinned, true);

        const oddLegacy = annotations.migrateAnnotationsData({
            schema: 'primer-pp.chat-notes',
            notes: { c2: 'not-an-object' }
        }, { nowIso: NOW });
        assert.equal(Object.values(oddLegacy.annotations)[0].conversation.id, 'c2');
        assert.deepEqual(
            annotations.migrateAnnotationsData({ schema: 'primer-pp.chat-notes', notes: 'bad' }),
            { version: 2, annotations: {} }
        );
    });

    it('migrates v1 arrays and maps legacy statuses and message locators', () => {
        const migrated = annotations.migrateAnnotationsData({
            schema: 'primer-pp.annotations',
            version: 1,
            annotations: [{
                id: 'old-1', chatId: 'c1', title: 'Old', href: '/app/c1',
                note: 'note', status: 'closed', messageId: 'message-1',
                message: { role: 'assistant', ordinal: 3, excerpt: 'answer' },
                createdAt: NOW, updatedAt: NOW
            }]
        }, { nowIso: NOW });
        assert.equal(migrated.annotations['old-1'].body, 'note');
        assert.equal(migrated.annotations['old-1'].status, 'resolved');
        assert.equal(migrated.annotations['old-1'].anchor.messageId, 'message-1');

        const mapped = annotations.migrateAnnotationsData({
            schemaVersion: 1,
            annotations: {
                keyed: { conversationId: 'c2', body: 'mapped' }
            }
        }, { nowIso: NOW });
        assert.equal(mapped.annotations.keyed.conversation.id, 'c2');

        const inferred = annotations.migrateAnnotationsData({
            annotations: [{ id: 'inferred', conversationId: 'c3', note: 'inferred v1' }]
        }, { nowIso: NOW });
        assert.equal(inferred.annotations.inferred.body, 'inferred v1');
    });

    it('normalizes current collections and reports schema failures', () => {
        const normalized = annotations.migrateAnnotationsData({
            version: 2,
            annotations: { a: { ...makeAnnotation(), id: undefined } }
        }, { nowIso: NOW });
        assert.equal(normalized.annotations.a.id, 'a');

        assert.throws(() => annotations.migrateAnnotationsData('bad'), error => error.code === 'UNRECOGNIZED_SCHEMA');
        assert.throws(
            () => annotations.migrateAnnotationsData({ schema: 'other', version: 1, annotations: [] }),
            /Unsupported annotations schema/
        );
        assert.throws(
            () => annotations.migrateAnnotationsData({ schema: 'primer-pp.annotations', version: 0, annotations: [] }),
            error => error.code === 'INVALID_VERSION'
        );
        assert.throws(
            () => annotations.migrateAnnotationsData({ schema: 'primer-pp.annotations' }),
            error => error.code === 'INVALID_VERSION'
        );
        assert.throws(
            () => annotations.migrateAnnotationsData({ schema: 'primer-pp.annotations', version: 3, annotations: [] }),
            error => error instanceof annotations.UnsupportedAnnotationsVersionError && error.version === 3
        );
        assert.throws(
            () => annotations.migrateAnnotationsData({ version: 2 }),
            error => error.code === 'INVALID_COLLECTION'
        );
        assert.throws(
            () => annotations.migrateAnnotationsData({ version: 2, annotations: 'bad' }),
            error => error.code === 'INVALID_COLLECTION'
        );
        assert.throws(
            () => annotations.migrateAnnotationsData({ version: 2, annotations: [null] }),
            error => error.code === 'INVALID_ANNOTATION'
        );
    });

    it('upserts and deletes annotations with clone isolation and preserved creation data', () => {
        const source = makeAnnotation();
        const created = annotations.upsertAnnotation(
            annotations.createEmptyAnnotationsState(),
            source,
            { nowIso: NOW }
        );
        source.body = 'mutated';
        assert.equal(created.annotations['a-1'].body, 'Remember the storage boundary');

        const updated = annotations.upsertAnnotation(created, {
            id: 'a-1',
            body: 'Updated',
            tags: ['Reviewed'],
            conversation: { title: 'Renamed' },
            anchor: { kind: 'message', role: 'system', excerpt: 'source' }
        }, { nowIso: LATER });
        assert.equal(updated.annotations['a-1'].createdAt, NOW);
        assert.equal(updated.annotations['a-1'].updatedAt, LATER);
        assert.equal(updated.annotations['a-1'].conversation.id, 'chat-1');
        assert.equal(updated.annotations['a-1'].conversation.title, 'Renamed');
        assert.equal(updated.annotations['a-1'].anchor.strategy, 'fallback');
        assert.equal(created.annotations['a-1'].body, 'Remember the storage boundary');

        const noConversationPatch = annotations.upsertAnnotation(updated, {
            id: 'a-1', body: 'No relationship changes'
        }, { nowIso: LATER });
        assert.equal(noConversationPatch.annotations['a-1'].conversation.title, 'Renamed');
        assert.equal(noConversationPatch.annotations['a-1'].anchor.strategy, 'fallback');

        const deleted = annotations.deleteAnnotation(updated, 'a-1', { nowIso: LATER });
        assert.deepEqual(deleted.annotations, {});
        assert.throws(() => annotations.deleteAnnotation(updated, ''), /Annotation id/);
        assert.throws(() => annotations.upsertAnnotation(updated, null), /Annotation must be an object/);
    });

    it('filters by text, tags, status, pins, anchor kind, conversation, and stable ordering', () => {
        const state = makeState([
            makeAnnotation({ id: 'b', pinned: true, updatedAt: NOW }),
            makeAnnotation({
                id: 'a', body: 'Second topic', tags: ['Local', 'Search'], status: 'resolved',
                pinned: true, updatedAt: NOW,
                conversation: { id: 'chat-2', title: 'Search Work', href: '/app/chat-2' },
                anchor: annotations.resolveAnnotationAnchor({ kind: 'message', role: 'user', excerpt: 'Needle excerpt' }, 'chat-2')
            }),
            makeAnnotation({
                id: 'c', body: 'Archived', tags: ['Other'], status: 'archived',
                pinned: false, updatedAt: LATER
            })
        ]);

        assert.deepEqual(annotations.searchAnnotations(state).map(item => item.id), ['a', 'b', 'c']);
        assert.deepEqual(annotations.searchAnnotations(state, { query: 'needle' }).map(item => item.id), ['a']);
        assert.deepEqual(annotations.searchAnnotations(state, { tags: ['local', 'search'] }).map(item => item.id), ['a']);
        assert.deepEqual(annotations.searchAnnotations(state, { tags: ['missing', 'other'], tagMode: 'any' }).map(item => item.id), ['c']);
        assert.deepEqual(annotations.searchAnnotations(state, { status: ['resolved'], pinned: true }).map(item => item.id), ['a']);
        assert.deepEqual(annotations.searchAnnotations(state, { anchorKind: 'message', conversationId: 'chat-2' }).map(item => item.id), ['a']);
        assert.deepEqual(annotations.searchAnnotations(state, { conversationId: 'chat-2' }).map(item => item.id), ['a']);
        assert.deepEqual(annotations.searchAnnotations(state, { status: 'unknown', pinned: false }), []);
        assert.throws(() => annotations.searchAnnotations(state, 'bad'), /filters must be an object/);

        const pinnedFirst = makeAnnotation({ id: 'pinned', pinned: true });
        const plainSecond = makeAnnotation({ id: 'plain', pinned: false });
        assert.deepEqual(
            annotations.searchAnnotations(makeState([pinnedFirst, plainSecond])).map(item => item.id),
            ['pinned', 'plain']
        );
        assert.deepEqual(
            annotations.searchAnnotations(makeState([plainSecond, pinnedFirst])).map(item => item.id),
            ['pinned', 'plain']
        );

        const results = annotations.searchAnnotations(state, { query: 'Architecture' });
        results[0].body = 'mutated';
        assert.notEqual(state.annotations.b.body, 'mutated');
    });
});

describe('annotations JSON import and export', () => {
    it('exports a deterministic, account-free, clone-isolated open schema', () => {
        const state = makeState([
            makeAnnotation({ id: 'z' }),
            makeAnnotation({ id: 'a', conversation: { id: 'chat-2', title: 'Two', href: '/app/chat-2' } })
        ]);
        const payload = annotations.createAnnotationsExport(state, { nowIso: NOW });
        assert.equal(payload.schema, 'primer-pp.annotations');
        assert.equal(payload.version, 2);
        assert.equal(payload.exportedAt, NOW);
        assert.deepEqual(payload.annotations.map(item => item.id), ['a', 'z']);
        assert.equal(JSON.stringify(payload).includes('accountId'), false);

        payload.annotations[0].body = 'mutated';
        assert.notEqual(state.annotations.a.body, 'mutated');
        const json = annotations.serializeAnnotationsExport(state, { nowIso: NOW });
        assert.deepEqual(JSON.parse(json).annotations.map(item => item.id), ['a', 'z']);
    });

    it('parses current JSON, legacy objects, cycles, and rejects unsafe imports', () => {
        const json = annotations.serializeAnnotationsExport(makeState(), { nowIso: NOW });
        assert.equal(annotations.parseAnnotationsImport(json, { nowIso: NOW }).annotations['a-1'].body, 'Remember the storage boundary');

        const legacy = annotations.parseAnnotationsImport({ notes: { c1: { note: 'legacy' } } }, { nowIso: NOW });
        assert.equal(Object.values(legacy.annotations)[0].body, 'legacy');

        const cyclic = { version: 2, annotations: [makeAnnotation()], metadata: {} };
        cyclic.metadata.self = cyclic.metadata;
        assert.equal(annotations.parseAnnotationsImport(cyclic, { nowIso: NOW }).annotations['a-1'].id, 'a-1');

        assert.throws(
            () => annotations.parseAnnotationsImport('{bad'),
            error => error.code === 'INVALID_JSON' && error.cause instanceof SyntaxError
        );
        assert.throws(
            () => annotations.parseAnnotationsImport(' '.repeat(4 * 1024 * 1024 + 1)),
            error => error.code === 'IMPORT_TOO_LARGE'
        );
        assert.throws(
            () => annotations.parseAnnotationsImport({
                password: 'forbidden',
                version: 2,
                annotations: [makeAnnotation()]
            }),
            error => error instanceof annotations.CredentialMaterialError && error.path === '$.password'
        );
        assert.throws(
            () => annotations.parseAnnotationsImport({
                version: 2,
                annotations: [{ ...makeAnnotation(), metadata: { apiKey: 'forbidden' } }]
            }),
            error => error.code === 'CREDENTIAL_MATERIAL' && error.path.includes('apiKey')
        );
    });

    it('merges with explicit conflict policies or replaces the collection', () => {
        const existing = makeState([makeAnnotation({ id: 'same', body: 'existing', updatedAt: LATER })]);
        const incoming = {
            schema: 'primer-pp.annotations',
            version: 2,
            annotations: [
                makeAnnotation({ id: 'same', body: 'incoming-old', updatedAt: NOW }),
                makeAnnotation({ id: 'new', body: 'new', updatedAt: LATER })
            ]
        };

        const newer = annotations.importAnnotations(existing, incoming, { nowIso: LATER });
        assert.deepEqual({ imported: newer.imported, skipped: newer.skipped, replaced: newer.replaced }, {
            imported: 1, skipped: 1, replaced: 0
        });
        assert.equal(newer.data.annotations.same.body, 'existing');
        assert.equal(newer.data.annotations.new.body, 'new');

        const forced = annotations.importAnnotations(existing, incoming, { conflict: 'incoming', nowIso: LATER });
        assert.equal(forced.data.annotations.same.body, 'incoming-old');
        assert.equal(forced.replaced, 1);

        const kept = annotations.importAnnotations(existing, incoming, { conflict: 'existing', nowIso: LATER });
        assert.equal(kept.data.annotations.same.body, 'existing');
        assert.equal(kept.skipped, 1);

        const replaced = annotations.importAnnotations(existing, incoming, { mode: 'replace', nowIso: LATER });
        assert.deepEqual(Object.keys(replaced.data.annotations).sort(), ['new', 'same']);
        assert.equal(replaced.imported, 2);

        assert.throws(() => annotations.importAnnotations(existing, incoming, { mode: 'append' }), /mode must be merge or replace/);
        assert.throws(() => annotations.importAnnotations(existing, incoming, { conflict: 'random' }), /conflict policy/);
    });
});

describe('session-bound annotations feature', () => {
    it('validates construction, sessions, repositories, and credential-free boundaries', async () => {
        assert.throws(() => annotations.createAnnotationsFeature(), /repositoryForSession/);
        assert.throws(() => annotations.createAnnotationsFeature({ repositoryForSession() {}, now: 1 }), /clock/);
        assert.throws(
            () => annotations.createAnnotationsFeature({ repositoryForSession() {}, idFactory: 1 }),
            /idFactory/
        );

        const invalidSession = annotations.createAnnotationsFeature({ repositoryForSession() {} });
        await assert.rejects(invalidSession.start({ session: null }), error => error.code === 'INVALID_SESSION');
        await assert.rejects(
            invalidSession.start({ session: { userId: 'a', accessToken: 'never' } }),
            error => error.code === 'CREDENTIAL_MATERIAL'
        );

        const invalidRepo = annotations.createAnnotationsFeature({ repositoryForSession: async () => ({}) });
        await assert.rejects(invalidRepo.start({ session: 'a' }), error => error.code === 'INVALID_REPOSITORY');

        const readOnly = annotations.createAnnotationsFeature({
            repositoryForSession: async () => ({
                scope: { readOnly: true, targetUserId: 'a' },
                get() {}, update() {}
            })
        });
        await assert.rejects(readOnly.start({ session: 'a' }), error => error.code === 'READ_ONLY_SESSION');

        const mismatched = annotations.createAnnotationsFeature({
            repositoryForSession: async () => createRepository('other')
        });
        await assert.rejects(mismatched.start({ session: { accountId: 'a' } }), error => error.code === 'SESSION_BOUNDARY');

        const wrongWritableScope = annotations.createAnnotationsFeature({
            repositoryForSession: async () => ({
                scope: { readOnly: false, targetUserId: 'a', sessionUserId: 'other' },
                async get() {}, async update() {}
            })
        });
        await assert.rejects(wrongWritableScope.start({ session: { id: 'a' } }), error => error.code === 'SESSION_BOUNDARY');

        const emptyObjectSession = annotations.createAnnotationsFeature({ repositoryForSession() {} });
        await assert.rejects(emptyObjectSession.start({ session: {} }), error => error.code === 'INVALID_SESSION');

        const scopedRepository = createRepository(undefined, undefined, {
            scope: { readOnly: false, sessionUserId: 'scoped' }
        });
        const defaultClock = annotations.createAnnotationsFeature({
            repositoryForSession: async () => scopedRepository
        });
        await defaultClock.start({ session: { accountId: null, userId: null, id: 'scoped' } });
        await defaultClock.upsert({ conversationId: 'clock-chat', body: 'uses default clock' });
        assert.match(defaultClock.search()[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('keeps data isolated while switching accounts and never exports identity', async () => {
        const repositories = new Map([
            ['alpha', createRepository('alpha')],
            ['beta', createRepository('beta')]
        ]);
        const feature = annotations.createAnnotationsFeature({
            repositoryForSession: async accountId => repositories.get(accountId),
            now: () => NOW,
            idFactory: () => 'created'
        });

        await assert.rejects(feature.onSessionChange('alpha'), error => error.code === 'NOT_STARTED');
        await feature.start({ session: { userId: 'alpha' } });
        assert.equal(feature.getSessionId(), 'alpha');
        await feature.upsert({ conversationId: 'alpha-chat', body: 'alpha only' });
        assert.equal(feature.search({ query: 'alpha only' }).length, 1);

        const snapshot = feature.getSnapshot();
        snapshot.annotations.created.body = 'mutated';
        assert.equal(feature.getSnapshot().annotations.created.body, 'alpha only');
        const exported = feature.exportJson({ nowIso: LATER });
        assert.equal(exported.includes('alpha only'), true);
        assert.equal(exported.includes('"alpha"'), false);

        await feature.onSessionChange({ accountId: 'beta' });
        assert.equal(feature.getSessionId(), 'beta');
        assert.equal(feature.search().length, 0);
        await feature.upsert({ id: 'beta-note', conversationId: 'beta-chat', body: 'beta only' });
        assert.equal(feature.search({ query: 'beta only' }).length, 1);
        assert.equal(repositories.get('alpha').read().annotations.created.body, 'alpha only');
        assert.equal(repositories.get('beta').read().annotations['beta-note'].body, 'beta only');

        const imported = await feature.importJson({
            version: 2,
            annotations: [makeAnnotation({ id: 'imported', conversation: { id: 'beta-chat' } })]
        });
        assert.equal(imported.imported, 1);
        await feature.remove('imported');
        assert.equal(feature.search({ query: 'Remember' }).length, 0);

        await feature.stop();
        assert.equal(repositories.get('beta').flushCount, 1);
        assert.throws(() => feature.getSnapshot(), error => error.code === 'NOT_STARTED');
        await feature.stop();
    });

    it('supports idempotent start and storage-envelope update results', async () => {
        let getCalls = 0;
        const repository = createRepository('a', undefined, {
            async get() {
                getCalls += 1;
                return undefined;
            },
            async update(updater) {
                const data = await updater(undefined);
                return { format: 'primer-pp.storage', schemaVersion: 2, revision: 1, data };
            }
        });
        const feature = annotations.createAnnotationsFeature({
            repositoryForSession: async () => repository,
            now: () => NOW,
            idFactory: () => 'id'
        });
        await feature.start({ session: 'a' });
        await feature.start({ session: 'a' });
        assert.equal(getCalls, 1);
        await feature.upsert({ conversationId: 'c', body: 'body' });
        assert.equal(feature.getSnapshot().annotations.id.body, 'body');
    });

    it('rejects repository reuse across accounts and superseded async bindings', async () => {
        const shared = createRepository(undefined);
        const feature = annotations.createAnnotationsFeature({
            repositoryForSession: async () => shared,
            now: () => NOW
        });
        await feature.start({ session: 'first' });
        await assert.rejects(feature.onSessionChange('second'), error => error.code === 'SESSION_BOUNDARY');

        let release;
        const slow = {
            accountId: 'slow',
            get: () => new Promise(resolve => { release = resolve; }),
            async update(updater) { return updater(undefined); }
        };
        const fast = createRepository('fast');
        const switching = annotations.createAnnotationsFeature({
            repositoryForSession: async id => id === 'slow' ? slow : fast,
            now: () => NOW
        });
        const start = switching.start({ session: 'slow' });
        while (!release) await Promise.resolve();
        switching.stop();
        release(undefined);
        await assert.rejects(start, error => error.code === 'SESSION_CHANGED');
    });

    it('cancels an old-account mutation when the active session changes', async () => {
        let releaseUpdate;
        let updaterEntered;
        const entered = new Promise(resolve => { updaterEntered = resolve; });
        const oldRepository = createRepository('old', undefined, {
            async update(updater) {
                updaterEntered();
                await new Promise(resolve => { releaseUpdate = resolve; });
                return updater(undefined);
            }
        });
        const nextRepository = createRepository('next');
        const feature = annotations.createAnnotationsFeature({
            repositoryForSession: async id => id === 'old' ? oldRepository : nextRepository,
            now: () => NOW,
            idFactory: () => 'id'
        });
        await feature.start({ session: 'old' });
        const pending = feature.upsert({ conversationId: 'old-chat', body: 'must cancel' });
        await entered;
        await feature.onSessionChange('next');
        releaseUpdate();
        await assert.rejects(pending, error => error.code === 'SESSION_CHANGED');
        assert.equal(feature.getSessionId(), 'next');
        assert.equal(feature.search().length, 0);
        assert.equal(oldRepository.read(), undefined);
    });

    it('exposes a ModuleHost-friendly lifecycle descriptor and capability', async () => {
        const repository = createRepository('account');
        const descriptor = annotations.createAnnotationsModule({
            repositoryForSession: async () => repository,
            now: () => NOW
        });
        assert.equal(descriptor.id, 'annotations');
        assert.equal(descriptor.defaultEnabled, false);
        assert.deepEqual(descriptor.provides, ['annotations.service']);
        const lifecycle = descriptor.create();
        let capability;
        await lifecycle.start({
            session: 'account',
            provideCapability(name, value) { capability = { name, value }; }
        });
        assert.equal(capability.name, 'annotations.service');
        assert.equal(capability.value.getSessionId(), 'account');
        await lifecycle.onSessionChange({ id: 'account' });
        await lifecycle.stop();
    });
});
