const MAX_TITLE_LENGTH = 120;
const MAX_NOTE_LENGTH = 1200;
const MAX_HREF_LENGTH = 600;
const MAX_SNIPPET_LENGTH = 2400;

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
    formatContextPacket,
    formatContextReference,
    formatTextSnippetPacket,
    normalizeTextSnippet,
    normalizeContextReference
};
