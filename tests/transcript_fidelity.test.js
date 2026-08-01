const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const tools = require('../lib/transcript_fidelity.js');

describe('canonical transcript fidelity schema', () => {
    it('sanitizes public URLs without retaining credentials, queries, or fragments', () => {
        assert.deepEqual(tools.sanitizePublicHref(null), { href: '', lossy: false });
        assert.deepEqual(tools.sanitizePublicHref(''), { href: '', lossy: false });
        assert.deepEqual(tools.sanitizePublicHref('/docs', 'https://example.test/root'), {
            href: 'https://example.test/docs', lossy: false
        });
        assert.deepEqual(
            tools.sanitizePublicHref('https://user:pass@example.test/docs?q=secret#part'),
            { href: 'https://example.test/docs', lossy: true }
        );
        assert.deepEqual(tools.sanitizePublicHref('javascript:alert(1)'), { href: '', lossy: true });
        assert.deepEqual(tools.sanitizePublicHref('not a url'), { href: '', lossy: true });
        const long = `https://example.test/${'a'.repeat(tools.TRANSCRIPT_LIMITS.maxHrefCharacters)}`;
        const bounded = tools.sanitizePublicHref(long);
        assert.equal(bounded.lossy, true);
        assert.ok(bounded.href.length <= tools.TRANSCRIPT_LIMITS.maxHrefCharacters);
    });

    it('normalizes every structured part through a bounded allowlist', () => {
        assert.equal(tools.normalizeTranscriptPart(null), null);
        assert.equal(tools.normalizeTranscriptPart(new Date()), null);
        assert.equal(tools.normalizeTranscriptPart({ type: 'unknown', text: 'x' }), null);
        assert.equal(tools.normalizeTranscriptPart({ type: 'link' }), null);
        assert.deepEqual(tools.normalizeTranscriptPart({
            type: 'code', text: '  const x = 1;\r\n', language: 'js'
        }), { type: 'code', text: '  const x = 1;\n', language: 'js' });
        assert.deepEqual(tools.normalizeTranscriptPart({
            type: 'code', text: 'x', language: 'Bearer should-not-leak'
        }), { type: 'code', text: 'x' });
        assert.deepEqual(tools.normalizeTranscriptPart({ type: 'code', text: 42, language: 'js' }), {
            type: 'code', language: 'js'
        });
        const nullPrototype = Object.assign(Object.create(null), { type: 'code', text: 'safe' });
        assert.deepEqual(tools.normalizeTranscriptPart(nullPrototype), { type: 'code', text: 'safe' });
        assert.deepEqual(tools.normalizeTranscriptPart({ type: 'math', text: ' x ', notation: 'tex' }), {
            type: 'math', text: 'x', notation: 'tex'
        });
        assert.deepEqual(tools.normalizeTranscriptPart({ type: 'math', text: 'x', notation: 'other' }), {
            type: 'math', text: 'x', notation: 'rendered-text'
        });
        assert.deepEqual(tools.normalizeTranscriptPart({
            type: 'link', text: ' Docs ', href: 'https://example.test/docs?tracking=1'
        }), { type: 'link', text: 'Docs', href: 'https://example.test/docs' });
        assert.deepEqual(tools.normalizeTranscriptPart({
            type: 'citation', text: 'One', href: 'https://example.test/one', sourceId: 'source-1'
        }), {
            type: 'citation', text: 'One', href: 'https://example.test/one', sourceId: 'source-1'
        });
        assert.deepEqual(tools.normalizeTranscriptPart({
            type: 'source', sourceId: 'source-2'
        }), { type: 'source', sourceId: 'source-2' });
        assert.deepEqual(tools.normalizeTranscriptPart({
            type: 'tool', text: 'Result', name: 'Search', status: 'done'
        }), { type: 'tool', text: 'Result', name: 'Search', status: 'done' });
    });

    it('builds clone-safe bounded structures and rejects untagged inputs', () => {
        assert.equal(tools.buildMessageStructure(null), null);
        assert.equal(tools.buildMessageStructure([]), null);
        const parts = Array.from({ length: tools.TRANSCRIPT_LIMITS.maxPartsPerMessage + 2 },
            (_value, index) => ({ type: 'code', text: String(index) }));
        const structure = tools.buildMessageStructure(parts);
        assert.equal(structure.parts.length, tools.TRANSCRIPT_LIMITS.maxPartsPerMessage);
        assert.equal(Object.isFrozen(structure), true);
        assert.deepEqual(structuredClone(structure), JSON.parse(JSON.stringify(structure)));
        assert.equal(tools.normalizeMessageStructure(null), null);
        assert.equal(tools.normalizeMessageStructure({ format: 'wrong', schemaVersion: 1, parts }), null);
        assert.equal(tools.normalizeMessageStructure({
            format: tools.MESSAGE_STRUCTURE_FORMAT, schemaVersion: 2, parts
        }), null);
        assert.equal(tools.normalizeMessageStructure({
            format: tools.MESSAGE_STRUCTURE_FORMAT, schemaVersion: 1, parts: null
        }), null);
        assert.equal(tools.normalizeMessageStructure(structure).parts.length,
            tools.TRANSCRIPT_LIMITS.maxPartsPerMessage);
    });

    it('canonicalizes loss codes, counts, capture methods, and observed bounds', () => {
        const complete = tools.createFidelityReport();
        assert.equal(complete.status, 'complete');
        assert.equal(complete.captureMethod, 'visible-dom');
        assert.equal(Object.isFrozen(complete.preserved), true);
        const partial = tools.createFidelityReport({
            captureMethod: 'legacy-text',
            messages: 2,
            structuredMessages: -1,
            parts: 3.5,
            losses: [
                'VISIBLE_DOM_ONLY',
                { code: 'VISIBLE_DOM_ONLY', count: 2 },
                { code: 'PRESENTATION_NOT_PRESERVED', count: 0 },
                { code: 'UNKNOWN', count: 10 },
                null
            ]
        });
        assert.equal(partial.status, 'partial');
        assert.equal(partial.captureMethod, 'legacy-text');
        assert.deepEqual(partial.observed, { messages: 2, structuredMessages: 0, parts: 0 });
        assert.deepEqual(partial.losses, [
            { code: 'PRESENTATION_NOT_PRESERVED', count: 1 },
            { code: 'VISIBLE_DOM_ONLY', count: 3 }
        ]);
        assert.equal(tools.createFidelityReport({ captureMethod: 'unknown', losses: null }).captureMethod,
            'visible-dom');
    });

    it('normalizes only tagged reports and curated transcript metadata', () => {
        assert.equal(tools.normalizeFidelityReport(null), null);
        assert.equal(tools.normalizeFidelityReport({ format: 'wrong', schemaVersion: 1 }), null);
        assert.equal(tools.normalizeFidelityReport({
            format: tools.TRANSCRIPT_FIDELITY_FORMAT, schemaVersion: 2
        }), null);
        const report = tools.createFidelityReport({
            messages: 1, structuredMessages: 1, parts: 2,
            losses: ['NON_ALLOWLIST_METADATA_OMITTED']
        });
        assert.deepEqual(tools.normalizeFidelityReport(report), report);
        assert.equal(tools.appendFidelityLoss(null, 'VISIBLE_DOM_ONLY'), null);
        const extended = tools.appendFidelityLoss(report, 'URL_METADATA_STRIPPED', 2);
        assert.equal(extended.losses.find(loss => loss.code === 'URL_METADATA_STRIPPED').count, 2);
        assert.deepEqual(extended.observed, report.observed);
        const noObserved = tools.normalizeFidelityReport({
            format: tools.TRANSCRIPT_FIDELITY_FORMAT,
            schemaVersion: tools.TRANSCRIPT_SCHEMA_VERSION,
            captureMethod: 'bad',
            observed: null,
            losses: []
        });
        assert.deepEqual(noObserved.observed, { messages: 0, structuredMessages: 0, parts: 0 });

        assert.equal(tools.normalizeTranscriptMetadata(null), null);
        assert.deepEqual(tools.normalizeTranscriptMetadata({
            captureMethod: 'legacy-text',
            visibleMessageCount: 4,
            model: ' Gemini Pro ',
            richResponse: {
                responseRootCount: 1,
                codeBlockCount: 2,
                tableCount: 3,
                imageCount: 4,
                videoCount: 5,
                mediaCandidateCount: 6,
                linkCount: 7,
                citationCandidateCount: 8,
                richElementCount: 9,
                hasRichContent: true
            }
        }), {
            captureMethod: 'legacy-text',
            visibleMessageCount: 4,
            model: 'Gemini Pro',
            richResponse: {
                responseRootCount: 1,
                codeBlockCount: 2,
                tableCount: 3,
                imageCount: 4,
                videoCount: 5,
                mediaCandidateCount: 6,
                linkCount: 7,
                citationCandidateCount: 8,
                richElementCount: 9,
                hasRichContent: true
            }
        });
        assert.deepEqual(tools.normalizeTranscriptMetadata({
            captureMethod: 'bad', visibleMessageCount: -1,
            model: 'otpauth://totp/blocked', richResponse: null
        }), {
            captureMethod: 'visible-dom', visibleMessageCount: 0, model: null, richResponse: null
        });
    });
});
