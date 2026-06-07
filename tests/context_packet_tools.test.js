const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    formatContextPacket,
    formatContextReference,
    formatTextSnippetPacket,
    normalizeTextSnippet,
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
});
