const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    exportTranscriptJSON,
    exportTranscriptMarkdown,
    exportTranscriptText,
    normalizeMessage,
    normalizeTranscript
} = require('../lib/chat_transcript_export.js');

describe('chat_transcript_export', () => {
    const nowIso = '2026-06-08T00:00:00.000Z';

    it('normalizes messages and drops empty entries', () => {
        assert.equal(normalizeMessage(null), null);
        assert.equal(normalizeMessage({ text: '   ' }), null);
        assert.deepEqual(normalizeMessage({ content: ' hello ', role: 'MODEL' }, 2), {
            id: 'm_2',
            role: 'model',
            text: 'hello',
            createdAt: ''
        });
        assert.equal(normalizeMessage({ id: 'x', text: 'ok', role: 'unknown', createdAt: 't' }).role, 'message');
        assert.equal(normalizeMessage({ text: 'ok', role: 'assistant' }).role, 'assistant');
        assert.equal(normalizeMessage({ text: 'ok', role: 'system' }).role, 'system');
    });

    it('normalizes transcript metadata with safe defaults', () => {
        const transcript = normalizeTranscript({
            chatId: ' c1 ',
            title: '  My Chat  ',
            href: '/app/c1',
            exportedAt: 'saved-time',
            messages: [
                { text: 'one', role: 'user' },
                { text: '' },
                'bad'
            ]
        });

        assert.equal(transcript.chatId, 'c1');
        assert.equal(transcript.title, 'My Chat');
        assert.equal(transcript.href, '/app/c1');
        assert.equal(transcript.exportedAt, 'saved-time');
        assert.deepEqual(transcript.messages.map(message => message.text), ['one']);

        const fallback = normalizeTranscript(null, { nowIso });
        assert.equal(fallback.title, 'Gemini conversation');
        assert.equal(fallback.exportedAt, nowIso);
        assert.deepEqual(fallback.messages, []);
        assert.deepEqual(normalizeTranscript({ messages: {} }, { nowIso }).messages, []);

        const generatedTime = normalizeTranscript({ title: 'Clock fallback', messages: [] });
        assert.match(generatedTime.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('exports normalized transcript JSON', () => {
        const json = exportTranscriptJSON({
            chatId: 'c1',
            title: 'Chat',
            messages: [{ id: 'u1', role: 'user', text: 'Question' }]
        }, { nowIso });
        const parsed = JSON.parse(json);

        assert.equal(parsed.chatId, 'c1');
        assert.equal(parsed.title, 'Chat');
        assert.equal(parsed.exportedAt, nowIso);
        assert.deepEqual(parsed.messages, [{
            id: 'u1',
            role: 'user',
            text: 'Question',
            createdAt: ''
        }]);
    });

    it('exports markdown with role labels, source, and empty-state text', () => {
        const markdown = exportTranscriptMarkdown({
            chatId: 'c1',
            title: 'Chat',
            href: '/app/c1',
            messages: [
                { role: 'user', text: 'Question' },
                { role: 'model', text: 'Answer' },
                { role: 'system', text: 'System note' },
                { role: 'other', text: 'Loose message' }
            ]
        }, { nowIso });

        assert.match(markdown, /^# Chat/);
        assert.ok(markdown.includes('- Source: /app/c1'));
        assert.ok(markdown.includes('## 1. User'));
        assert.ok(markdown.includes('## 2. Gemini'));
        assert.ok(markdown.includes('## 3. System'));
        assert.ok(markdown.includes('## 4. Message'));

        const empty = exportTranscriptMarkdown({ title: 'Empty', messages: [] }, { nowIso });
        assert.ok(empty.includes('_No visible messages captured._'));
    });

    it('exports plain text with metadata and trailing newline', () => {
        const text = exportTranscriptText({
            chatId: '',
            title: '',
            messages: [
                { role: 'assistant', text: 'Answer' }
            ]
        }, { nowIso });

        assert.ok(text.startsWith('Gemini conversation\nChat ID: unknown\n'));
        assert.ok(text.includes('1. Gemini\nAnswer'));
        assert.ok(text.endsWith('\n'));

        const empty = exportTranscriptText({ href: '/app/c1', messages: [] }, { nowIso });
        assert.ok(empty.includes('Source: /app/c1'));
        assert.ok(empty.includes('No visible messages captured.'));
    });
});
