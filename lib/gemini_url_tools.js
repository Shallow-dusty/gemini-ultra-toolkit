const NON_CHAT_APP_IDS = new Set([
    'download'
]);

function cleanText(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function parseGeminiUrl(value) {
    const raw = cleanText(value);
    if (!raw) return null;
    try {
        return new URL(raw, 'https://gemini.google.com');
    } catch {
        return null;
    }
}

function extractGeminiChatId(value) {
    const url = parseGeminiUrl(value);
    if (!url) return null;
    if (url.hostname !== 'gemini.google.com') return null;
    const match = url.pathname.match(/^\/app\/([a-zA-Z0-9_-]+)$/);
    if (!match) return null;
    const id = match[1];
    if (NON_CHAT_APP_IDS.has(id.toLowerCase())) return null;
    return id;
}

function isGeminiConversationHref(value) {
    return !!extractGeminiChatId(value);
}

module.exports = {
    extractGeminiChatId,
    isGeminiConversationHref
};
