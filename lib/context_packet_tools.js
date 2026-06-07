const {
    normalizeBulkTranscriptExport,
    normalizeTranscript
} = require('./chat_transcript_export.js');

const MAX_TITLE_LENGTH = 120;
const MAX_NOTE_LENGTH = 1200;
const MAX_HREF_LENGTH = 600;
const MAX_SNIPPET_LENGTH = 2400;
const MAX_TRANSCRIPT_CHATS = 4;
const MAX_TRANSCRIPT_MESSAGES = 12;
const MAX_TRANSCRIPT_MESSAGE_LENGTH = 1200;
const TRANSCRIPT_ROLE_LABELS = {
    user: 'User',
    assistant: 'Gemini',
    model: 'Gemini',
    system: 'System'
};

function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function cleanText(value, fallback = '') {
    const text = toText(value).trim();
    return text || fallback;
}

function normalizeHref(value) {
    const href = cleanText(value, '').slice(0, MAX_HREF_LENGTH);
    if (!href) return '';
    return /^(javascript|data|vbscript):/i.test(href) ? '' : href;
}

function normalizeContextReference(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw;
    const chatId = cleanText(source.chatId || source.id, '');
    const note = cleanText(source.note, '').slice(0, MAX_NOTE_LENGTH);
    const title = cleanText(source.title, chatId || (note ? 'Untitled chat' : '')).slice(0, MAX_TITLE_LENGTH);
    const href = normalizeHref(source.href);
    if (!chatId && !title && !note) return null;
    return { chatId, title, href, note };
}

function normalizeTextSnippet(raw) {
    const source = raw && typeof raw === 'object' ? raw : { text: raw };
    const text = cleanText(source.text || source.snippet, '').slice(0, MAX_SNIPPET_LENGTH);
    if (!text) return null;
    const title = cleanText(source.title, 'Visible selection').slice(0, MAX_TITLE_LENGTH);
    const href = normalizeHref(source.href);
    return { title, href, text };
}

function formatTextSnippetPacket(raw, opts = {}) {
    const snippet = normalizeTextSnippet(raw);
    if (!snippet) return '';
    const label = cleanText(opts.label, 'Gemini visible text snippet');
    const lines = [
        `[${label}]`,
        `Source: ${snippet.title}`
    ];
    if (snippet.href) lines.push(`Link: ${snippet.href}`);
    lines.push('Snippet:');
    lines.push(snippet.text);
    return lines.join('\n');
}

function truncateTranscriptText(value) {
    const text = cleanText(value, '');
    if (text.length <= MAX_TRANSCRIPT_MESSAGE_LENGTH) return text;
    return text.slice(0, MAX_TRANSCRIPT_MESSAGE_LENGTH - 3).trimEnd() + '...';
}

function getTranscriptRoleLabel(role) {
    return TRANSCRIPT_ROLE_LABELS[role] || 'Message';
}

function normalizeTranscriptSnippet(raw, opts = {}) {
    const transcript = normalizeTranscript(raw, opts);
    const messages = transcript.messages
        .slice(0, MAX_TRANSCRIPT_MESSAGES)
        .map(message => ({
            ...message,
            text: truncateTranscriptText(message.text)
        }));
    if (messages.length === 0) return null;
    return {
        ...transcript,
        messages,
        totalMessages: transcript.messages.length
    };
}

function formatTranscriptSnippetPacket(raw, opts = {}) {
    const transcript = normalizeTranscriptSnippet(raw, opts);
    if (!transcript) return '';
    const label = cleanText(opts.label, 'Gemini transcript snippet packet');
    const lines = [
        `[${label}]`,
        `Title: ${transcript.title}`
    ];
    if (transcript.href) lines.push(`Link: ${transcript.href}`);
    if (transcript.chatId) lines.push(`Chat ID: ${transcript.chatId}`);
    lines.push(`Messages included: ${transcript.messages.length} of ${transcript.totalMessages}`);
    lines.push('Transcript snippets:');
    transcript.messages.forEach((message, index) => {
        lines.push('');
        lines.push(`${index + 1}. ${getTranscriptRoleLabel(message.role)}:`);
        lines.push(message.text);
    });
    return lines.join('\n');
}

function formatBulkTranscriptSnippetPacket(raw, opts = {}) {
    const bulk = normalizeBulkTranscriptExport(raw, opts);
    const eligibleChats = bulk.chats
        .filter(chat => chat.status === 'exported' && chat.messages.length > 0);
    const chats = eligibleChats.slice(0, MAX_TRANSCRIPT_CHATS);
    if (chats.length === 0) return '';
    const label = cleanText(opts.label, 'Gemini selected transcript snippet packet');
    const sections = chats.map((chat, index) => formatTranscriptSnippetPacket(chat, {
        ...opts,
        label: `${index + 1}. ${chat.title}`,
        nowIso: chat.exportedAt
    }));
    return [
        `[${label}]`,
        `Exported: ${bulk.exportedAt}`,
        `Chats included: ${chats.length} of ${eligibleChats.length}`,
        '',
        sections.join('\n\n')
    ].join('\n');
}

function formatContextReference(raw, opts = {}) {
    const ref = normalizeContextReference(raw);
    if (!ref) return '';
    const label = cleanText(opts.label, 'Gemini chat reference');
    const lines = [
        `[${label}]`,
        `Title: ${ref.title}`
    ];
    if (ref.href) lines.push(`Link: ${ref.href}`);
    if (ref.chatId) lines.push(`Chat ID: ${ref.chatId}`);
    if (ref.note && opts.includeNote !== false) {
        lines.push('Local note:');
        lines.push(ref.note);
    }
    return lines.join('\n');
}

function formatContextPacket(items, opts = {}) {
    const refs = (Array.isArray(items) ? items : [items])
        .map(normalizeContextReference)
        .filter(Boolean);
    if (refs.length === 0) return '';
    if (refs.length === 1) return formatContextReference(refs[0], opts);

    const label = cleanText(opts.label, 'Gemini context packet');
    const sections = refs.map((ref, index) => {
        return formatContextReference(ref, {
            ...opts,
            label: `${index + 1}. ${ref.title}`
        });
    });
    return [`[${label}]`, ...sections].join('\n\n');
}

module.exports = {
    formatBulkTranscriptSnippetPacket,
    formatContextPacket,
    formatContextReference,
    formatTextSnippetPacket,
    formatTranscriptSnippetPacket,
    normalizeTextSnippet,
    normalizeTranscriptSnippet,
    normalizeContextReference
};
