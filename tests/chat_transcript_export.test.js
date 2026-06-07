const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    exportBulkTranscriptHTML,
    exportBulkTranscriptJSON,
    exportBulkTranscriptMarkdown,
    exportBulkTranscriptText,
    exportTranscriptHTML,
    exportTranscriptJSON,
    exportTranscriptMarkdown,
    exportTranscriptText,
    normalizeBulkTranscriptExport,
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

    it('exports escaped standalone HTML for current transcripts', () => {
        const html = exportTranscriptHTML({
            chatId: 'c&1',
            title: 'Chat <unsafe>',
            href: '/app/c1?x=<tag>',
            messages: [
                { role: 'user', text: 'Question & context' },
                { role: 'model', text: '<script>alert("x")</script>\nAnswer with \'quote\'' }
            ]
        }, { nowIso });

        assert.match(html, /^<!doctype html>/);
        assert.ok(html.includes('<title>Chat &lt;unsafe&gt;</title>'));
        assert.ok(html.includes('<h1>Chat &lt;unsafe&gt;</h1>'));
        assert.ok(html.includes('<dt>Chat ID</dt><dd>c&amp;1</dd>'));
        assert.ok(html.includes('<dt>Source</dt><dd>/app/c1?x=&lt;tag&gt;</dd>'));
        assert.ok(html.includes('<h2>1. User</h2>'));
        assert.ok(html.includes('Question &amp; context'));
        assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
        assert.ok(html.includes('&#39;quote&#39;'));
        assert.doesNotMatch(html, /<script>/);

        const empty = exportTranscriptHTML({ title: 'Empty', messages: [] }, { nowIso });
        assert.ok(empty.includes('No visible messages captured.'));
        assert.doesNotMatch(empty, /<dt>Source<\/dt>/);
    });

    it('normalizes selected-chat bulk exports with statuses and counts', () => {
        const bulk = normalizeBulkTranscriptExport({
            app: ' Primer++ ',
            exportedAt: 'saved-time',
            chats: [
                { chatId: ' c1 ', title: 'One', status: 'exported', messages: [{ text: 'Captured' }] },
                { chatId: 'c2', title: 'Two', status: 'empty', messages: [] },
                { chatId: 'c3', title: 'Three', status: 'failed', error: 'Timeout', messages: [] },
                { chatId: 'c4', title: 'Four', status: 'skipped', messages: [] },
                { chatId: 'c5', title: 'Five', status: 'unknown', selectedTitle: 'Sidebar Five', messages: [{ text: 'Fallback exported' }] },
                { chatId: 'c6', title: 'Six', status: 'unknown', messages: [] },
                'bad'
            ]
        });

        assert.equal(bulk.app, 'Primer++');
        assert.equal(bulk.format, 'selected-chat-transcripts');
        assert.equal(bulk.exportedAt, 'saved-time');
        assert.equal(bulk.chatCount, 7);
        assert.equal(bulk.exportedCount, 2);
        assert.equal(bulk.failedCount, 1);
        assert.deepEqual(bulk.chats.map(chat => chat.status), [
            'exported',
            'empty',
            'failed',
            'skipped',
            'exported',
            'empty',
            'empty'
        ]);
        assert.equal(bulk.chats[4].selectedTitle, 'Sidebar Five');
        assert.equal(bulk.chats[6].title, 'Gemini conversation');
        assert.equal(bulk.chats[0].order, 1);

        const fallback = normalizeBulkTranscriptExport(null, { nowIso });
        assert.equal(fallback.app, 'Primer++ for Gemini');
        assert.equal(fallback.exportedAt, nowIso);
        assert.deepEqual(fallback.chats, []);

        const generatedTime = normalizeBulkTranscriptExport({ chats: {} });
        assert.match(generatedTime.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('exports selected-chat bulk JSON', () => {
        const json = exportBulkTranscriptJSON({
            chats: [
                { chatId: 'c1', title: 'One', messages: [{ role: 'user', text: 'Question' }] }
            ]
        }, { nowIso });
        const parsed = JSON.parse(json);

        assert.equal(parsed.format, 'selected-chat-transcripts');
        assert.equal(parsed.exportedAt, nowIso);
        assert.equal(parsed.chatCount, 1);
        assert.equal(parsed.chats[0].messages[0].text, 'Question');
    });

    it('exports selected-chat bulk markdown with empty and failed states', () => {
        const markdown = exportBulkTranscriptMarkdown({
            exportedAt: 'saved-time',
            chats: [
                {
                    chatId: 'c1',
                    title: 'One',
                    href: '/app/c1',
                    messages: [
                        { role: 'user', text: 'Question' },
                        { role: 'model', text: 'Answer' }
                    ]
                },
                { chatId: 'c2', title: 'Two', status: 'failed', error: 'Timeout', messages: [] },
                { title: 'Three', messages: [] }
            ]
        });

        assert.match(markdown, /^# Gemini Selected Chat Export/);
        assert.ok(markdown.includes('- Chats: 3'));
        assert.ok(markdown.includes('- Failed chats: 1'));
        assert.ok(markdown.includes('## 1. One'));
        assert.ok(markdown.includes('- Source: /app/c1'));
        assert.ok(markdown.includes('### 1. User'));
        assert.ok(markdown.includes('### 2. Gemini'));
        assert.ok(markdown.includes('- Chat ID: unknown'));
        assert.ok(markdown.includes('- Error: Timeout'));
        assert.ok(markdown.includes('_Transcript export failed._'));
        assert.ok(markdown.includes('_No visible messages captured._'));

        const empty = exportBulkTranscriptMarkdown({ chats: [] }, { nowIso });
        assert.ok(empty.includes('_No chats selected._'));
    });

    it('exports selected-chat bulk plain text with trailing newline', () => {
        const text = exportBulkTranscriptText({
            chats: [
                {
                    chatId: 'c1',
                    title: 'One',
                    href: '/app/c1',
                    messages: [{ role: 'assistant', text: 'Answer' }]
                },
                { chatId: 'c2', title: 'Two', status: 'failed', error: 'Timeout', messages: [] },
                { title: 'Three', messages: [] }
            ]
        }, { nowIso });

        assert.ok(text.startsWith('Gemini Selected Chat Export\nExported: 2026-06-08T00:00:00.000Z\n'));
        assert.ok(text.includes('1. One\nChat ID: c1\nStatus: exported\nSource: /app/c1'));
        assert.ok(text.includes('Chat ID: unknown'));
        assert.ok(text.includes('1. Gemini\nAnswer'));
        assert.ok(text.includes('Error: Timeout'));
        assert.ok(text.includes('Transcript export failed.'));
        assert.ok(text.includes('No visible messages captured.'));
        assert.ok(text.endsWith('\n'));

        const empty = exportBulkTranscriptText({ chats: [] }, { nowIso });
        assert.ok(empty.includes('No chats selected.'));
        assert.ok(empty.endsWith('\n'));
    });

    it('exports escaped standalone HTML for selected-chat bulk transcripts', () => {
        const html = exportBulkTranscriptHTML({
            chats: [
                {
                    chatId: 'c1',
                    title: 'One <alpha>',
                    href: '/app/c1',
                    messages: [{ role: 'assistant', text: 'Answer & details' }]
                },
                { chatId: 'c2', title: 'Two', status: 'failed', error: 'Timed <out>', messages: [] },
                { title: 'Three', messages: [] }
            ]
        }, { nowIso });

        assert.match(html, /^<!doctype html>/);
        assert.ok(html.includes('<title>Gemini Selected Chat Export</title>'));
        assert.ok(html.includes('<dt>Chats</dt><dd>3</dd>'));
        assert.ok(html.includes('<dt>Failed chats</dt><dd>1</dd>'));
        assert.ok(html.includes('<h2>1. One &lt;alpha&gt;</h2>'));
        assert.ok(html.includes('<span class="status exported">exported</span>'));
        assert.ok(html.includes('<h3>1. Gemini</h3>'));
        assert.ok(html.includes('Answer &amp; details'));
        assert.ok(html.includes('<span class="status failed">failed</span>'));
        assert.ok(html.includes('<dt>Error</dt><dd>Timed &lt;out&gt;</dd>'));
        assert.ok(html.includes('Transcript export failed.'));
        assert.ok(html.includes('<span class="status empty">empty</span>'));
        assert.ok(html.includes('No visible messages captured.'));

        const empty = exportBulkTranscriptHTML({ chats: [] }, { nowIso });
        assert.ok(empty.includes('No chats selected.'));
    });
});
