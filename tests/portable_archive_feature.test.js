const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let archiveApi;
before(async () => {
    archiveApi = await import(pathToFileURL(path.join(
        __dirname,
        '..',
        'src',
        'features',
        'portable_archive',
        'index.js'
    )).href);
});

const CREATED_AT = '2026-08-01T00:00:00.000Z';

function baseInput(overrides = {}) {
    return {
        createdAt: CREATED_AT,
        source: { app: 'Primer++', version: '13.0.0' },
        sections: {
            chats: [
                { id: 'chat-1', title: 'First', messages: [{ role: 'user', text: 'hello' }] },
                { id: 'chat-2', title: 'Second', messages: [] }
            ],
            annotations: [{ id: 'note-1', chatId: 'chat-1', body: 'remember' }],
            collections: [{ id: 'collection-1', name: 'Research' }],
            recipes: [{ id: 'recipe-1', name: 'Summarize', prompt: 'Summarize {{text}}' }],
            preferences: { locale: 'zh-CN', compact: true }
        },
        ...overrides
    };
}

async function makeArchive(input = baseInput(), options = {}) {
    return archiveApi.createPortableArchive(input, options);
}

function expectCode(code) {
    return error => error instanceof archiveApi.PortableArchiveError && error.code === code;
}

describe('portable canonical values and checksum primitives', () => {
    it('exports the stable format contract and canonicalizes keys without sharing references', () => {
        assert.equal(archiveApi.PORTABLE_ARCHIVE_FORMAT, 'primer-pp.portable-archive');
        assert.equal(archiveApi.PORTABLE_ARCHIVE_SCHEMA_VERSION, 1);
        assert.equal(archiveApi.PORTABLE_ARCHIVE_CHECKSUM_ALGORITHM, 'SHA-256');
        assert.deepEqual(archiveApi.PORTABLE_ARCHIVE_SECTIONS, [
            'chats', 'annotations', 'collections', 'recipes', 'preferences', 'insights', 'queue'
        ]);
        assert.deepEqual(archiveApi.RESTORE_CONFLICT_STRATEGIES, ['skip', 'replace', 'rename']);
        assert.equal(Object.isFrozen(archiveApi.PORTABLE_ARCHIVE_LIMITS), true);

        const original = { z: [{ b: 2, a: 1 }], a: '好' };
        const clone = archiveApi.clonePortableValue(original);
        assert.notEqual(clone, original);
        assert.notEqual(clone.z, original.z);
        clone.z[0].a = 9;
        assert.equal(original.z[0].a, 1);
        assert.equal(
            archiveApi.deterministicStringify(original),
            '{"a":"好","z":[{"a":1,"b":2}]}'
        );
        assert.equal(archiveApi.utf8ByteLength('A好'), 4);

        const nullPrototype = Object.create(null);
        nullPrototype.value = true;
        assert.deepEqual(archiveApi.clonePortableValue(nullPrototype), { value: true });
    });

    it('detects credential-like field names without rejecting ordinary token metrics', () => {
        for (const key of [
            'password', 'client_secret', 'accessToken', 'refresh-token', 'apiKey',
            'privateKey', 'sessionToken', 'totpSecret', 'otp_seed', 'cookieJar', 'Authorization'
        ]) {
            assert.equal(archiveApi.isSensitiveFieldName(key), true, key);
        }
        for (const key of ['tokenCount', 'secretary', 'cookiePreference', 'prompt', 'authoredBy']) {
            assert.equal(archiveApi.isSensitiveFieldName(key), false, key);
        }
    });

    it('rejects or strips sensitive fields and unmistakably sensitive string values', () => {
        assert.throws(
            () => archiveApi.clonePortableValue({ nested: { password: 'never-log-me' } }),
            expectCode('SENSITIVE_FIELD')
        );
        assert.throws(
            () => archiveApi.clonePortableValue('otpauth://totp/example', { sensitivePolicy: 'strip' }),
            expectCode('SENSITIVE_FIELD')
        );
        assert.deepEqual(
            archiveApi.clonePortableValue({
                ok: 'keep',
                password: 'drop',
                list: ['safe', 'Bearer abc', { note: 'safe', totp: 'drop' }],
                privateMaterial: '-----BEGIN PRIVATE KEY-----x'
            }, { sensitivePolicy: 'strip' }),
            { list: ['safe', { note: 'safe' }], ok: 'keep' }
        );
        assert.throws(
            () => archiveApi.clonePortableValue({}, { sensitivePolicy: 'redact' }),
            expectCode('INVALID_ARGUMENT')
        );
    });

    it('rejects non-JSON, unsafe, circular and excessively deep values', () => {
        for (const value of [undefined, 1n, Symbol('x'), () => {}, Number.NaN, Infinity, new Date()]) {
            assert.throws(() => archiveApi.clonePortableValue(value), error => (
                error.code === 'INVALID_VALUE'
            ));
        }
        const circular = {};
        circular.self = circular;
        assert.throws(() => archiveApi.clonePortableValue(circular), expectCode('INVALID_VALUE'));

        const unsafe = JSON.parse('{"__proto__":{"polluted":true}}');
        assert.throws(() => archiveApi.clonePortableValue(unsafe), expectCode('INVALID_VALUE'));

        let deep = {};
        for (let index = 0; index < 66; index += 1) deep = { child: deep };
        assert.throws(() => archiveApi.clonePortableValue(deep), expectCode('LIMIT_DEPTH'));
    });

    it('validates limits and reports precise byte and entry limit failures', () => {
        assert.deepEqual(archiveApi.normalizeArchiveLimits(), archiveApi.PORTABLE_ARCHIVE_LIMITS);
        assert.deepEqual(archiveApi.normalizeArchiveLimits({ maxBytes: 12, maxEntries: 0 }), {
            maxBytes: 12,
            maxEntries: 0
        });
        for (const limits of [null, [], { maxBytes: 0 }, { maxBytes: 1.2 }, { maxEntries: -1 }, { maxEntries: 2.5 }]) {
            assert.throws(() => archiveApi.normalizeArchiveLimits(limits), expectCode('INVALID_ARGUMENT'));
        }
    });

    it('calculates a real SHA-256 digest and contains provider failures', async () => {
        assert.equal(
            await archiveApi.sha256Checksum('abc'),
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        );
        await assert.rejects(
            archiveApi.sha256Checksum('x', null),
            expectCode('CHECKSUM_UNAVAILABLE')
        );
        await assert.rejects(
            archiveApi.sha256Checksum('x', { subtle: { async digest() { throw new Error('provider down'); } } }),
            error => error.code === 'CHECKSUM_FAILURE' && error.cause.message === 'provider down'
        );
        await assert.rejects(
            archiveApi.sha256Checksum('x', { subtle: { async digest() { return new Uint8Array(1); } } }),
            expectCode('CHECKSUM_FAILURE')
        );
        const passthrough = new archiveApi.PortableArchiveError('UPSTREAM', 'already classified');
        await assert.rejects(
            archiveApi.sha256Checksum('x', { subtle: { async digest() { throw passthrough; } } }),
            error => error === passthrough
        );
    });
});

describe('archive creation and integrity validation', () => {
    it('creates a deterministic, selective, clone-safe archive with a recomputable manifest', async () => {
        const input = baseInput({ include: ['preferences', 'chats', 'annotations'] });
        const first = await makeArchive(input);
        const second = await makeArchive(input);

        assert.deepEqual(first, second);
        assert.deepEqual(Object.keys(first.payload), ['chats', 'annotations', 'preferences']);
        assert.deepEqual(first.manifest.sections, [
            { name: 'chats', itemCount: 2 },
            { name: 'annotations', itemCount: 1 },
            { name: 'preferences', itemCount: 1 }
        ]);
        assert.equal(first.manifest.totalEntries, 4);
        assert.equal(first.checksum.algorithm, 'SHA-256');
        assert.match(first.checksum.value, /^[a-f0-9]{64}$/);

        input.sections.chats[0].title = 'mutated input';
        assert.equal(first.payload.chats[0].title, 'First');
        first.payload.chats[0].title = 'mutated archive';
        assert.equal(input.sections.chats[0].title, 'mutated input');
    });

    it('uses present sections by default and creates requested missing sections as empty values', async () => {
        const present = await makeArchive({
            createdAt: CREATED_AT,
            source: 'Primer++ 13',
            sections: { collections: [{ name: 'One' }], chats: [] }
        });
        assert.deepEqual(Object.keys(present.payload), ['chats', 'collections']);

        const requested = await makeArchive({
            createdAt: '2026-08-01T08:00:00+08:00',
            source: { app: 'Primer++' },
            sections: {},
            include: ['recipes', 'preferences']
        });
        assert.equal(requested.createdAt, CREATED_AT);
        assert.deepEqual(requested.payload, { recipes: [], preferences: {} });
        assert.equal(requested.manifest.totalEntries, 1);

        let clockCalls = 0;
        const generatedTimestamp = await makeArchive(
            { source: 'Primer++', sections: {} },
            { clock: () => { clockCalls += 1; return CREATED_AT; } }
        );
        assert.equal(generatedTimestamp.createdAt, CREATED_AT);
        assert.equal(clockCalls, 1);

        const nullPrototypeInput = Object.assign(Object.create(null), {
            createdAt: CREATED_AT,
            source: 'Primer++',
            sections: Object.create(null)
        });
        assert.deepEqual((await makeArchive(nullPrototypeInput)).payload, {});
    });

    it('accepts optional insights and queue arrays without invalidating old five-section archives', async () => {
        const expanded = await makeArchive({
            createdAt: CREATED_AT,
            source: 'Primer++ 13',
            sections: {
                insights: [{ id: 'insight-1', kind: 'usage' }],
                queue: [{ id: 'queue-1', text: 'next prompt' }]
            }
        });
        assert.deepEqual(expanded.payload, {
            insights: [{ id: 'insight-1', kind: 'usage' }],
            queue: [{ id: 'queue-1', text: 'next prompt' }]
        });
        assert.deepEqual(expanded.manifest.sections, [
            { name: 'insights', itemCount: 1 },
            { name: 'queue', itemCount: 1 }
        ]);

        const oldFiveSection = await makeArchive(baseInput());
        assert.deepEqual(Object.keys(oldFiveSection.payload), [
            'chats', 'annotations', 'collections', 'recipes', 'preferences'
        ]);
        assert.equal((await archiveApi.validatePortableArchive(oldFiveSection)).valid, true);
    });

    it('can strip credential material before checksumming the archive', async () => {
        const archive = await makeArchive({
            createdAt: CREATED_AT,
            source: { app: 'Primer++', apiKey: 'drop' },
            sections: {
                chats: [{ id: 'safe', content: 'ok', password: 'drop' }],
                preferences: { locale: 'en', bearerToken: 'drop' }
            }
        }, { sensitivePolicy: 'strip' });
        assert.deepEqual(archive.source, { app: 'Primer++' });
        assert.deepEqual(archive.payload.chats, [{ content: 'ok', id: 'safe' }]);
        assert.deepEqual(archive.payload.preferences, { locale: 'en' });
        assert.equal((await archiveApi.validatePortableArchive(archive)).valid, true);
    });

    it('rejects invalid creation requests and section shapes with stable error codes', async () => {
        await assert.rejects(makeArchive(null), expectCode('INVALID_ARGUMENT'));
        await assert.rejects(makeArchive({ source: 'x' }), expectCode('INVALID_ARGUMENT'));
        await assert.rejects(
            makeArchive({ source: 'x', sections: {} }),
            error => expectCode('INVALID_ARGUMENT')(error) && /createdAt or options\.clock/.test(error.message)
        );
        await assert.rejects(
            makeArchive({ createdAt: CREATED_AT, source: 'x', sections: {} }, { clock: true }),
            expectCode('INVALID_ARGUMENT')
        );
        await assert.rejects(
            makeArchive({ source: 'x', sections: {} }, { clock: () => null }),
            expectCode('INVALID_ARGUMENT')
        );
        await assert.rejects(makeArchive({ source: '', sections: {} }), expectCode('INVALID_ARGUMENT'));
        await assert.rejects(makeArchive({ source: {}, sections: {} }), expectCode('INVALID_ARGUMENT'));
        await assert.rejects(makeArchive({ source: 'x', sections: { unknown: [] } }), expectCode('INVALID_SECTION'));
        await assert.rejects(
            makeArchive({ source: 'x', sections: {}, include: 'chats' }),
            expectCode('INVALID_ARGUMENT')
        );
        await assert.rejects(
            makeArchive({ source: 'x', sections: {}, include: ['chats', 'chats'] }),
            expectCode('INVALID_ARGUMENT')
        );
        await assert.rejects(
            makeArchive({ source: 'x', sections: {}, include: ['unknown'] }),
            expectCode('INVALID_SECTION')
        );
        await assert.rejects(
            makeArchive({ source: 'x', sections: { chats: {} } }),
            expectCode('INVALID_ARGUMENT')
        );
        await assert.rejects(
            makeArchive({ source: 'x', sections: { chats: ['not-an-object'] } }),
            expectCode('INVALID_ARGUMENT')
        );
        await assert.rejects(
            makeArchive({ source: 'x', sections: { preferences: [] } }),
            expectCode('INVALID_ARGUMENT')
        );
        await assert.rejects(
            makeArchive({ createdAt: 'not-a-date', source: 'x', sections: {} }),
            expectCode('INVALID_ARGUMENT')
        );
        await assert.rejects(
            makeArchive({ createdAt: 4, source: 'x', sections: {} }),
            expectCode('INVALID_ARGUMENT')
        );
        await assert.rejects(
            makeArchive({ createdAt: '', source: 'x', sections: {} }),
            expectCode('INVALID_ARGUMENT')
        );
    });

    it('enforces archive entry and final UTF-8 byte limits', async () => {
        await assert.rejects(
            makeArchive(baseInput({ include: ['chats'] }), { limits: { maxEntries: 1 } }),
            expectCode('LIMIT_ENTRIES')
        );
        await assert.rejects(
            makeArchive(baseInput({ include: [] }), { limits: { maxBytes: 1 } }),
            expectCode('LIMIT_BYTES')
        );
    });

    it('round-trips canonical text and returns an isolated validation report', async () => {
        const archive = await makeArchive();
        const text = await archiveApi.serializePortableArchive(archive);
        assert.equal(text, archiveApi.deterministicStringify(archive));
        const parsed = await archiveApi.parsePortableArchive(text);
        assert.equal(parsed.valid, true);
        assert.equal(parsed.checksumVerified, true);
        assert.equal(parsed.totalEntries, 6);
        assert.equal(parsed.sizeBytes, new TextEncoder().encode(text).byteLength);
        assert.deepEqual(parsed.archive, archive);
        parsed.archive.payload.chats[0].title = 'changed';
        assert.equal(archive.payload.chats[0].title, 'First');
    });

    it('rejects parse errors and oversized text before parsing', async () => {
        await assert.rejects(archiveApi.parsePortableArchive({}), expectCode('INVALID_ARGUMENT'));
        await assert.rejects(archiveApi.parsePortableArchive('{'), error => (
            error.code === 'PARSE_ERROR' && error.cause instanceof SyntaxError
        ));
        await assert.rejects(
            archiveApi.parsePortableArchive('{}', { limits: { maxBytes: 1 } }),
            expectCode('LIMIT_BYTES')
        );
    });

    it('detects content tampering after structural validation', async () => {
        const archive = await makeArchive();
        archive.payload.chats[0].title = 'tampered';
        archive.manifest.payloadBytes = archiveApi.utf8ByteLength(
            archiveApi.deterministicStringify(archive.payload)
        );
        await assert.rejects(
            archiveApi.validatePortableArchive(archive),
            expectCode('CHECKSUM_MISMATCH')
        );
    });

    it('rejects unsupported envelopes and malformed top-level structures', async () => {
        const valid = await makeArchive();
        const cases = [
            [{ ...valid, extra: true }, 'INVALID_ARCHIVE'],
            [{ ...valid, format: 'other' }, 'UNSUPPORTED_FORMAT'],
            [{ ...valid, schemaVersion: 99 }, 'UNSUPPORTED_SCHEMA_VERSION'],
            [{ ...valid, createdAt: null }, 'INVALID_ARCHIVE'],
            [{ ...valid, createdAt: '' }, 'INVALID_ARCHIVE'],
            [{ ...valid, createdAt: '2026-08-01' }, 'INVALID_ARCHIVE'],
            [{ ...valid, source: '' }, 'INVALID_ARCHIVE'],
            [{ ...valid, payload: [] }, 'INVALID_ARCHIVE'],
            [{ ...valid, payload: { other: [] } }, 'INVALID_ARCHIVE'],
            [{ ...valid, payload: { chats: {} } }, 'INVALID_ARCHIVE'],
            [{ ...valid, payload: { chats: [4] } }, 'INVALID_ARCHIVE'],
            [{ ...valid, payload: { preferences: [] } }, 'INVALID_ARCHIVE']
        ];
        for (const [candidate, code] of cases) {
            await assert.rejects(archiveApi.validatePortableArchive(candidate), expectCode(code));
        }
        await assert.rejects(archiveApi.validatePortableArchive([]), expectCode('INVALID_ARCHIVE'));
    });

    it('rejects malformed or inconsistent manifests', async () => {
        const valid = await makeArchive();
        const cases = [
            { ...valid, manifest: [] },
            { ...valid, manifest: { ...valid.manifest, extra: true } },
            { ...valid, manifest: { ...valid.manifest, sections: {} } },
            { ...valid, manifest: { ...valid.manifest, sections: [4] } },
            { ...valid, manifest: { ...valid.manifest, sections: [{ name: 'chats', itemCount: 2, extra: true }] } },
            { ...valid, manifest: { ...valid.manifest, totalEntries: 99 } }
        ];
        for (const candidate of cases) {
            await assert.rejects(archiveApi.validatePortableArchive(candidate), expectCode('INVALID_ARCHIVE'));
        }
    });

    it('rejects malformed checksums and enforces validation limits', async () => {
        const valid = await makeArchive();
        const checksumCases = [
            { ...valid, checksum: [] },
            { ...valid, checksum: { ...valid.checksum, extra: true } },
            { ...valid, checksum: { algorithm: 'MD5', value: valid.checksum.value } },
            { ...valid, checksum: { algorithm: 'SHA-256', value: 'ABC' } }
        ];
        for (const candidate of checksumCases) {
            await assert.rejects(archiveApi.validatePortableArchive(candidate), expectCode('INVALID_ARCHIVE'));
        }
        await assert.rejects(
            archiveApi.validatePortableArchive(valid, { limits: { maxEntries: 1 } }),
            expectCode('LIMIT_ENTRIES')
        );
        await assert.rejects(
            archiveApi.validatePortableArchive(valid, { limits: { maxBytes: 1 } }),
            expectCode('LIMIT_BYTES')
        );
    });
});

describe('dry-run restore planning', () => {
    it('plans inserts and skips conflicts without mutating either side', async () => {
        const archive = await makeArchive(baseInput({ include: ['chats', 'preferences'] }));
        const existing = {
            chats: [{ id: 'chat-1', title: 'existing' }],
            preferences: { locale: 'en' }
        };
        const beforeArchive = structuredClone(archive);
        const beforeExisting = structuredClone(existing);
        const plan = await archiveApi.planPortableArchiveRestore(archive, existing);

        assert.equal(plan.dryRun, true);
        assert.equal(plan.strategy, 'skip');
        assert.equal(plan.archiveChecksum, archive.checksum.value);
        assert.deepEqual(plan.summary, { total: 3, insert: 1, skip: 2, replace: 0, rename: 0 });
        assert.deepEqual(plan.sections.map(section => section.name), ['chats', 'preferences']);
        assert.deepEqual(plan.sections[0].actions.map(action => action.action), ['skip', 'insert']);
        assert.equal(plan.sections[0].actions[0].targetIdentity, 'chat-1');
        assert.equal(plan.sections[0].actions[1].targetIdentity, 'chat-2');
        assert.equal(plan.sections[1].actions[0].targetIdentity, 'preferences');
        assert.deepEqual(archive, beforeArchive);
        assert.deepEqual(existing, beforeExisting);

        plan.sections[0].actions[0].value.title = 'plan-only';
        assert.equal(archive.payload.chats[0].title, 'First');
    });

    it('plans replace actions for every conflicting identity type', async () => {
        const archive = await makeArchive({
            createdAt: CREATED_AT,
            source: 'Primer++',
            sections: {
                chats: [
                    { chatId: 'c1', title: 'chat' },
                    { key: 'k1', title: 'keyed' },
                    { slug: 's1', title: 'slugged' },
                    { name: 'named', title: 'named' },
                    { id: 42, title: 'numeric' }
                ]
            }
        });
        const existing = {
            chats: [
                { chatId: 'c1' }, { key: 'k1' }, { slug: 's1' }, { name: 'named' }, { id: 42 }
            ]
        };
        const plan = await archiveApi.planPortableArchiveRestore(archive, existing, { strategy: 'replace' });
        assert.deepEqual(plan.summary, { total: 5, insert: 0, skip: 0, replace: 5, rename: 0 });
        assert.equal(plan.sections[0].actions.every(action => action.identityPatch === null), true);
    });

    it('plans deterministic renames, including suffixes and anonymous content identities', async () => {
        const anonymous = { title: 'same body' };
        const archive = await makeArchive({
            createdAt: CREATED_AT,
            source: 'Primer++',
            sections: {
                collections: [{ id: 'same' }, anonymous, anonymous],
                preferences: { locale: 'zh-CN' }
            }
        });
        const existing = {
            collections: [{ id: 'same' }, { id: 'same~imported' }, anonymous],
            preferences: { locale: 'en' }
        };
        const plan = await archiveApi.planPortableArchiveRestore(archive, existing, { strategy: 'rename' });
        const collectionActions = plan.sections[0].actions;
        assert.equal(collectionActions[0].targetIdentity, 'same~imported-2');
        assert.deepEqual(collectionActions[0].identityPatch, { field: 'id', value: 'same~imported-2' });
        assert.match(collectionActions[1].incomingIdentity, /^content:[a-f0-9]{8}$/);
        assert.match(collectionActions[1].targetIdentity, /~imported$/);
        assert.match(collectionActions[2].targetIdentity, /~imported-2$/);
        assert.deepEqual(plan.sections[1].actions[0].identityPatch, {
            field: 'id',
            value: 'preferences~imported'
        });
        assert.deepEqual(plan.summary, { total: 4, insert: 0, skip: 0, replace: 0, rename: 4 });
    });

    it('treats an empty preferences target and missing sections as inserts', async () => {
        const archive = await makeArchive(baseInput({ include: ['annotations', 'preferences'] }));
        const plan = await archiveApi.planPortableArchiveRestore(archive, { preferences: {} });
        assert.deepEqual(plan.summary, { total: 2, insert: 2, skip: 0, replace: 0, rename: 0 });
    });

    it('rejects unsafe plans, invalid target shapes and excessive existing entries', async () => {
        const archive = await makeArchive(baseInput({ include: ['chats'] }));
        await assert.rejects(
            archiveApi.planPortableArchiveRestore(archive, {}, { strategy: 'merge' }),
            expectCode('INVALID_CONFLICT_STRATEGY')
        );
        for (const existing of [
            [],
            { other: [] },
            { chats: {} },
            { chats: [4] },
            { preferences: [] },
            { chats: [{ password: 'never' }] }
        ]) {
            await assert.rejects(archiveApi.planPortableArchiveRestore(archive, existing), error => (
                ['INVALID_ARGUMENT', 'INVALID_SECTION', 'SENSITIVE_FIELD'].includes(error.code)
            ));
        }
        await assert.rejects(
            archiveApi.planPortableArchiveRestore(archive, { chats: [{ id: '1' }, { id: '2' }] }, {
                limits: { maxEntries: 1 }
            }),
            expectCode('LIMIT_ENTRIES')
        );
    });
});
