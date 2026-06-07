const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    formatBulkTranscriptSnippetPacket,
    formatContextPacket,
    formatContextReference,
    formatTextSnippetPacket,
    formatTranscriptSnippetPacket,
    normalizeTextSnippet,
    normalizeTranscriptSnippet,
    normalizeContextReference
} = require('../lib/context_packet_tools.js');

describe('context_packet_tools', () => {
    it('normalizes local chat references without unsafe hrefs', () => {
        assert.equal(normalizeContextReference(null), null);

        const ref = normalizeContextReference({
            id: 'chat-1',
            title: '  Architecture Review  ',
            href: 'javascript:alert(1)',
            note: '  reuse this conclusion  '
        });

        assert.deepEqual(ref, {
            chatId: 'chat-1',
            title: 'Architecture Review',
            href: '',
            note: 'reuse this conclusion'
        });
    });

    it('falls back to stable titles and truncates long fields', () => {
        const ref = normalizeContextReference({
            chatId: 'c1',
            title: '',
            href: '/app/' + 'x'.repeat(700),
            note: 'n'.repeat(1300)
        });

        assert.equal(ref.title, 'c1');
        assert.equal(ref.href.length, 600);
        assert.equal(ref.note.length, 1200);

        const noteOnly = normalizeContextReference({ title: '', note: 'body' });
        assert.equal(noteOnly.title, 'Untitled chat');

        assert.equal(normalizeContextReference({ href: '/app/no-content' }), null);
        assert.equal(normalizeContextReference({ chatId: 'c2' }).href, '');
    });

    it('formats a single reference with note content by default', () => {
        const text = formatContextReference({
            chatId: 'c1',
            title: 'Deploy Notes',
            href: '/app/c1',
            note: 'Use the rollback checklist.'
        });

        assert.equal(text, [
            '[Gemini chat reference]',
            'Title: Deploy Notes',
            'Link: /app/c1',
            'Chat ID: c1',
            'Local note:',
            'Use the rollback checklist.'
        ].join('\n'));
    });

    it('can omit notes and use custom labels', () => {
        const text = formatContextReference({
            chatId: 'c1',
            title: 'Deploy Notes',
            href: '/app/c1',
            note: 'secret local note'
        }, {
            includeNote: false,
            label: 'Pinned Gemini reference'
        });

        assert.equal(text, [
            '[Pinned Gemini reference]',
            'Title: Deploy Notes',
            'Link: /app/c1',
            'Chat ID: c1'
        ].join('\n'));
    });

    it('formats packets and drops invalid entries', () => {
        const packet = formatContextPacket([
            { chatId: 'a', title: 'Alpha', href: '/app/a', note: 'first' },
            null,
            { chatId: 'b', title: 'Beta', note: '' }
        ]);

        assert.equal(packet, [
            '[Gemini context packet]',
            '',
            '[1. Alpha]',
            'Title: Alpha',
            'Link: /app/a',
            'Chat ID: a',
            'Local note:',
            'first',
            '',
            '[2. Beta]',
            'Title: Beta',
            'Chat ID: b'
        ].join('\n'));

        assert.equal(formatContextPacket([], { label: 'Empty' }), '');
        assert.equal(formatContextPacket(null), '');
    });

    it('handles invalid references and single-item packets', () => {
        assert.equal(formatContextReference(null), '');
        assert.equal(formatContextPacket({ chatId: 'solo', title: 'Solo' }), [
            '[Gemini chat reference]',
            'Title: Solo',
            'Chat ID: solo'
        ].join('\n'));
    });

    it('formats explicit visible text snippet packets', () => {
        assert.equal(normalizeTextSnippet(null), null);
        assert.equal(normalizeTextSnippet(''), null);

        const snippet = normalizeTextSnippet({
            title: '  Current Chat  ',
            href: 'javascript:alert(1)',
            text: '  selected visible text  '
        });
        assert.deepEqual(snippet, {
            title: 'Current Chat',
            href: '',
            text: 'selected visible text'
        });

        const packet = formatTextSnippetPacket({
            title: '',
            href: '/app/c1',
            text: 'quoted passage'
        }, {
            label: 'Selected Gemini text snippet'
        });
        assert.equal(packet, [
            '[Selected Gemini text snippet]',
            'Source: Visible selection',
            'Link: /app/c1',
            'Snippet:',
            'quoted passage'
        ].join('\n'));

        const long = normalizeTextSnippet('x'.repeat(2500));
        assert.equal(long.text.length, 2400);
        assert.equal(formatTextSnippetPacket({ text: '' }), '');
    });

    it('formats bounded visible transcript snippet packets', () => {
        assert.equal(normalizeTranscriptSnippet({ messages: [] }), null);
        assert.equal(formatTranscriptSnippetPacket({ messages: [] }), '');

        const longText = 'x'.repeat(1300);
        const transcript = normalizeTranscriptSnippet({
            chatId: 'c1',
            title: 'Visible Chat',
            href: '/app/c1',
            messages: [
                { role: 'user', text: longText },
                { role: 'model', text: 'answer' },
                { role: 'assistant', text: 'assistant answer' },
                { role: 'system', text: 'system note' },
                { role: 'other', text: 'loose message' },
                { role: 'user', text: 'six' },
                { role: 'user', text: 'seven' },
                { role: 'user', text: 'eight' },
                { role: 'user', text: 'nine' },
                { role: 'user', text: 'ten' },
                { role: 'user', text: 'eleven' },
                { role: 'user', text: 'twelve' },
                { role: 'user', text: 'thirteen' }
            ]
        });

        assert.equal(transcript.messages.length, 12);
        assert.equal(transcript.totalMessages, 13);
        assert.equal(transcript.messages[0].text.length, 1200);
        assert.ok(transcript.messages[0].text.endsWith('...'));

        const packet = formatTranscriptSnippetPacket({
            chatId: 'c1',
            title: 'Visible Chat',
            href: '/app/c1',
            messages: [
                { role: 'user', text: 'question' },
                { role: 'model', text: 'answer' },
                { role: 'assistant', text: 'assistant answer' },
                { role: 'system', text: 'system note' },
                { role: 'other', text: 'loose message' }
            ]
        }, {
            label: 'Current Gemini transcript snippet packet'
        });

        assert.equal(packet, [
            '[Current Gemini transcript snippet packet]',
            'Title: Visible Chat',
            'Link: /app/c1',
            'Chat ID: c1',
            'Messages included: 5 of 5',
            'Transcript snippets:',
            '',
            '1. User:',
            'question',
            '',
            '2. Gemini:',
            'answer',
            '',
            '3. Gemini:',
            'assistant answer',
            '',
            '4. System:',
            'system note',
            '',
            '5. Message:',
            'loose message'
        ].join('\n'));

        const minimal = formatTranscriptSnippetPacket({
            title: '',
            messages: [{ role: 'user', text: 'one' }]
        });
        assert.doesNotMatch(minimal, /Link:/);
        assert.doesNotMatch(minimal, /Chat ID:/);
        assert.match(minimal, /^\[Gemini transcript snippet packet\]\nTitle: Gemini conversation/);
    });

    it('formats selected exported transcript packets from explicit bulk exports', () => {
        const packet = formatBulkTranscriptSnippetPacket({
            exportedAt: '2026-06-08T00:00:00.000Z',
            chats: [
                { chatId: 'c1', title: 'One', status: 'exported', messages: [{ role: 'user', text: 'q1' }] },
                { chatId: 'c2', title: 'Two', status: 'empty', messages: [] },
                { chatId: 'c3', title: 'Three', status: 'failed', error: 'Timeout', messages: [] },
                { chatId: 'c4', title: 'Four', status: 'exported', messages: [] },
                { chatId: 'c5', title: 'Five', messages: [{ role: 'model', text: 'a5' }] },
                { chatId: 'c6', title: 'Six', messages: [{ role: 'assistant', text: 'a6' }] },
                { chatId: 'c7', title: 'Seven', messages: [{ role: 'system', text: 's7' }] },
                { chatId: 'c8', title: 'Eight', messages: [{ role: 'user', text: 'q8' }] }
            ]
        }, {
            label: 'Selected Gemini transcript snippet packet'
        });

        assert.match(packet, /^\[Selected Gemini transcript snippet packet\]/);
        assert.ok(packet.includes('Exported: 2026-06-08T00:00:00.000Z'));
        assert.ok(packet.includes('Chats included: 4 of 5'));
        assert.ok(packet.includes('[1. One]'));
        assert.ok(packet.includes('[4. Seven]'));
        assert.doesNotMatch(packet, /\[5\. Eight\]/);
        assert.doesNotMatch(packet, /Timeout/);

        assert.equal(formatBulkTranscriptSnippetPacket({
            chats: [
                { chatId: 'empty', title: 'Empty', status: 'empty', messages: [] }
            ]
        }), '');
    });
});
