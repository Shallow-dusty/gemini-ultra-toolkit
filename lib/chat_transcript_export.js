function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function cleanText(value) {
    return toText(value).trim();
}

function normalizeRole(value) {
    const role = cleanText(value).toLowerCase();
    if (role === 'user' || role === 'assistant' || role === 'model' || role === 'system') return role;
    return 'message';
}

function normalizeMessage(raw, index = 0) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const text = cleanText(source.text === undefined ? source.content : source.text);
    if (!text) return null;
    return {
        id: cleanText(source.id) || `m_${index}`,
        role: normalizeRole(source.role),
        text,
        createdAt: cleanText(source.createdAt)
    };
}

function normalizeTranscript(raw, opts = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const rawMessages = Array.isArray(source.messages) ? source.messages : [];
    const messages = rawMessages
        .map((message, index) => normalizeMessage(message, index))
        .filter(Boolean);
    const exportedAt = cleanText(opts.nowIso) || cleanText(source.exportedAt) || new Date().toISOString();

    return {
        chatId: cleanText(source.chatId),
        title: cleanText(source.title) || 'Gemini conversation',
        href: cleanText(source.href),
        exportedAt,
        messages
    };
}

function getRoleLabel(role) {
    if (role === 'user') return 'User';
    if (role === 'assistant' || role === 'model') return 'Gemini';
    if (role === 'system') return 'System';
    return 'Message';
}

function exportTranscriptJSON(transcript, opts = {}) {
    return JSON.stringify(normalizeTranscript(transcript, opts), null, 2);
}

function exportTranscriptMarkdown(transcript, opts = {}) {
    const data = normalizeTranscript(transcript, opts);
    const lines = [
        `# ${data.title}`,
        '',
        `- Chat ID: ${data.chatId || 'unknown'}`,
        `- Exported: ${data.exportedAt}`
    ];
    if (data.href) lines.push(`- Source: ${data.href}`);
    lines.push('');

    if (data.messages.length === 0) {
        lines.push('_No visible messages captured._');
        lines.push('');
        return lines.join('\n');
    }

    data.messages.forEach((message, index) => {
        lines.push(`## ${index + 1}. ${getRoleLabel(message.role)}`);
        lines.push('');
        lines.push(message.text);
        lines.push('');
    });
    return lines.join('\n');
}

function exportTranscriptText(transcript, opts = {}) {
    const data = normalizeTranscript(transcript, opts);
    const lines = [
        data.title,
        `Chat ID: ${data.chatId || 'unknown'}`,
        `Exported: ${data.exportedAt}`
    ];
    if (data.href) lines.push(`Source: ${data.href}`);
    lines.push('');

    if (data.messages.length === 0) {
        lines.push('No visible messages captured.');
        return lines.join('\n');
    }

    data.messages.forEach((message, index) => {
        lines.push(`${index + 1}. ${getRoleLabel(message.role)}`);
        lines.push(message.text);
        lines.push('');
    });
    return lines.join('\n').trimEnd() + '\n';
}

module.exports = {
    exportTranscriptJSON,
    exportTranscriptMarkdown,
    exportTranscriptText,
    normalizeMessage,
    normalizeTranscript
};
