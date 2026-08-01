const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const transcriptTools = require('../lib/transcript_fidelity.js');
const transcriptExport = require('../lib/chat_transcript_export.js');

let captureCurrentTranscript;
let transcriptCaptureSignature;
let transcriptCaptureInternals;
let createCurrentChatExportController;
let createMultiChatExportController;
let createPortableArchive;
let parsePortableArchive;
let serializePortableArchive;

const CREATED_AT = '2026-08-01T00:00:00.000Z';

function canonicalCapture() {
    const structure = transcriptTools.buildMessageStructure([
        { type: 'code', text: '  const answer = 42;\n', language: 'js' },
        { type: 'math', text: 'x^2', notation: 'tex' },
        { type: 'citation', text: 'Source', href: 'https://example.test/source', sourceId: 's1' },
        { type: 'tool', text: 'Result', name: 'Search', status: 'done' }
    ]);
    return Object.freeze({
        messages: Object.freeze([Object.freeze({
            id: 'stable-1', role: 'model', text: 'Answer', structure
        })]),
        fidelity: transcriptTools.createFidelityReport({
            messages: 1, structuredMessages: 1, parts: 4,
            losses: ['VISIBLE_DOM_ONLY', 'PRESENTATION_NOT_PRESERVED']
        })
    });
}

function adapter(overrides = {}) {
    const capture = canonicalCapture();
    return {
        getCurrentConversationTranscript: () => capture,
        getCurrentConversationMessages: () => capture.messages,
        getChatTitleText: () => 'Canonical chat',
        detectModelKey: () => 'pro',
        getRichResponseProbeReport: () => ({
            responseRootCount: 1, codeBlockCount: 1, tableCount: 0,
            imageCount: 0, videoCount: 0, mediaCandidateCount: 0,
            linkCount: 1, citationCandidateCount: 1, richElementCount: 3,
            hasRichContent: true
        }),
        ...overrides
    };
}

function usage(geminiAdapter) {
    return {
        getSessionMetadata: () => ({
            chatId: 'chat-1', href: 'https://gemini.google.com/app/chat-1',
            origin: 'https://gemini.google.com', model: 'pro'
        }),
        getGeminiAdapter: () => geminiAdapter,
        now: () => CREATED_AT,
        getChatFilePrefix: () => 'canonical',
        getBulkFilePrefix: () => 'canonical-bulk',
        download() {}
    };
}

before(async () => {
    ({ captureCurrentTranscript, transcriptCaptureSignature, transcriptCaptureInternals } =
        await import('../src/features/portable_archive/transcript_capture.js'));
    ({ createCurrentChatExportController } =
        await import('../src/features/portable_archive/current_chat_export_controller.js'));
    ({ createMultiChatExportController } =
        await import('../src/features/portable_archive/multi_chat_export_controller.js'));
    ({ createPortableArchive, parsePortableArchive, serializePortableArchive } =
        await import('../src/features/portable_archive/archive.js'));
});

describe('Archive canonical transcript fidelity', () => {
    it('prefers structured captures and explicitly labels text-only fallbacks', () => {
        assert.throws(() => captureCurrentTranscript(), /requires a Gemini adapter/);
        const capture = canonicalCapture();
        const resolved = captureCurrentTranscript(adapter());
        assert.deepEqual(resolved, capture);
        assert.equal(Object.isFrozen(resolved), true);

        const fallback = captureCurrentTranscript({
            getCurrentConversationTranscript: () => ({ messages: capture.messages, fidelity: null }),
            getCurrentConversationMessages: () => [{ id: 'legacy', role: 'user', text: 'Legacy' }]
        });
        assert.equal(fallback.messages[0].id, 'legacy');
        assert.equal(fallback.fidelity.captureMethod, 'legacy-text');
        assert.deepEqual(fallback.fidelity.losses.map(loss => loss.code), [
            'PRESENTATION_NOT_PRESERVED', 'STRUCTURED_CAPTURE_UNAVAILABLE', 'VISIBLE_DOM_ONLY'
        ]);
        assert.deepEqual(captureCurrentTranscript({
            getCurrentConversationTranscript: () => ({ messages: null, fidelity: capture.fidelity }),
            getCurrentConversationMessages: () => 'invalid'
        }).messages, []);
        assert.deepEqual(captureCurrentTranscript({}).messages, []);
        assert.equal(transcriptCaptureInternals.legacyFidelity([]).observed.messages, 0);
        assert.equal(transcriptCaptureSignature(null), '');
        const plain = [{ id: 'one', role: 'model', text: 'same' }];
        assert.equal(transcriptCaptureSignature(plain), transcriptCaptureSignature(structuredClone(plain)));
        assert.notEqual(transcriptCaptureSignature(plain),
            transcriptCaptureSignature([{ id: 'one', role: 'model', text: 'diff' }]));
        assert.notEqual(transcriptCaptureSignature(capture.messages),
            transcriptCaptureSignature([{ ...capture.messages[0], structure: transcriptTools.buildMessageStructure([
                { type: 'code', text: '  const answer = 43;\n', language: 'js' }
            ]) }]));
        assert.match(transcriptCaptureSignature([
            null,
            { id: 'raw', role: 'model', text: 'x', structure: { parts: [null, { type: 'unknown' }] } }
        ]), /^\[/);
        assert.doesNotMatch(transcriptCaptureSignature(capture.messages), /answer|Search|source/);
    });

    it('uses one tagged envelope for current and multi-chat captures', () => {
        const geminiAdapter = adapter();
        const session = usage(geminiAdapter);
        const transcript = createCurrentChatExportController({ usage: session }).getCurrentTranscript();
        assert.equal(transcript.format, transcriptTools.CHAT_TRANSCRIPT_FORMAT);
        assert.equal(transcript.schemaVersion, transcriptTools.TRANSCRIPT_SCHEMA_VERSION);
        assert.equal(transcript.messages[0].id, 'stable-1');
        assert.equal(transcript.messages[0].structure.parts[0].text, '  const answer = 42;\n');
        assert.equal(transcript.metadata.captureMethod, 'visible-dom');
        assert.equal(transcript.metadata.richResponse.citationCandidateCount, 1);
        assert.equal(transcript.fidelity.observed.parts, 4);

        const multi = createMultiChatExportController({
            usage: session, current: {}, monotonicNow: () => 0
        });
        const selected = multi.capture({ id: 'chat-1', title: 'Selected' }, CREATED_AT);
        assert.equal(selected.format, transcript.format);
        assert.equal(selected.schemaVersion, transcript.schemaVersion);
        assert.deepEqual(selected.messages, transcript.messages);
        assert.deepEqual(selected.fidelity, transcript.fidelity);
        assert.deepEqual(selected.metadata, transcript.metadata);

        const legacyAdapter = adapter({ getCurrentConversationTranscript: undefined });
        const legacyTranscript = createCurrentChatExportController({ usage: usage(legacyAdapter) })
            .getCurrentTranscript();
        assert.equal(legacyTranscript.metadata.captureMethod, 'legacy-text');

        const unsafeSession = usage(geminiAdapter);
        unsafeSession.getSessionMetadata = () => ({
            chatId: 'chat-1', model: 'pro',
            href: 'https://user:pass@gemini.google.com/app/chat-1?session=blocked#fragment'
        });
        const sanitized = createCurrentChatExportController({ usage: unsafeSession }).getCurrentTranscript();
        assert.equal(sanitized.href, 'https://gemini.google.com/app/chat-1');
        assert.equal(sanitized.fidelity.losses.find(loss => loss.code === 'URL_METADATA_STRIPPED').count, 1);
    });

    it('round-trips rich fields through parseable export and Portable Archive JSON', async () => {
        const transcript = createCurrentChatExportController({ usage: usage(adapter()) }).getCurrentTranscript();
        const exported = transcriptExport.exportTranscriptJSON(transcript, { nowIso: CREATED_AT });
        const parsedExport = JSON.parse(exported);
        assert.equal(parsedExport.format, transcriptTools.CHAT_TRANSCRIPT_FORMAT);
        assert.equal(parsedExport.messages[0].structure.parts[0].text, '  const answer = 42;\n');
        assert.equal(parsedExport.messages[0].structure.parts[1].type, 'math');
        assert.equal(parsedExport.messages[0].structure.parts[2].sourceId, 's1');
        assert.equal(parsedExport.messages[0].structure.parts[3].name, 'Search');
        assert.equal(parsedExport.fidelity.status, 'partial');
        assert.equal(parsedExport.metadata.richResponse.codeBlockCount, 1);

        const archive = await createPortableArchive({
            createdAt: CREATED_AT,
            source: { app: 'Primer++ fidelity test' },
            sections: { chats: [transcript] },
            include: ['chats']
        });
        const serialized = await serializePortableArchive(archive);
        const validation = await parsePortableArchive(serialized);
        const archived = validation.archive.payload.chats[0];
        assert.equal(archived.messages[0].structure.parts[0].text, '  const answer = 42;\n');
        assert.deepEqual(archived.fidelity, transcript.fidelity);
        assert.equal(await serializePortableArchive(validation.archive), serialized);
        assert.doesNotMatch(serialized, /credential|cookie|password|totp/i);
    });

    it('waits for late rich metadata to stabilize, not only flattened text length', async () => {
        let now = 0;
        let reads = 0;
        const first = [{ id: 'm1', role: 'model', text: 'Same answer' }];
        const rich = [{
            ...first[0],
            structure: transcriptTools.buildMessageStructure([
                { type: 'citation', text: 'Source', href: 'https://example.test/source', sourceId: 's1' }
            ])
        }];
        const geminiAdapter = adapter({
            getCurrentConversationMessages() {
                reads += 1;
                return reads === 1 ? first : rich;
            }
        });
        const multi = createMultiChatExportController({
            usage: usage(geminiAdapter),
            current: {},
            monotonicNow: () => now,
            sleep: async milliseconds => { now += milliseconds; }
        });
        assert.equal(await multi.waitForReady('chat-1', 2_000), true);
        assert.equal(reads, 4);
    });

    it('keeps legacy formatter output unchanged and drops malformed rich claims', () => {
        const legacy = transcriptExport.normalizeTranscript({
            title: 'Legacy',
            messages: [{ text: 'Text', structure: { format: 'wrong' } }],
            fidelity: { format: 'wrong' },
            metadata: 'wrong'
        }, { nowIso: CREATED_AT });
        assert.deepEqual(legacy, {
            chatId: '', title: 'Legacy', href: '', exportedAt: CREATED_AT,
            messages: [{ id: 'm_0', role: 'message', text: 'Text', createdAt: '' }]
        });
        const structureOnly = transcriptExport.normalizeMessage({
            role: 'model',
            text: '',
            structure: transcriptTools.buildMessageStructure([{ type: 'code', text: 'x' }])
        });
        assert.equal(structureOnly.text, '');
        assert.equal(structureOnly.structure.parts[0].type, 'code');
    });
});
