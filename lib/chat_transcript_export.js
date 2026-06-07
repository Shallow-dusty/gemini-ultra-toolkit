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

function normalizeBulkStatus(value, messages) {
    const status = cleanText(value).toLowerCase();
    if (status === 'exported' || status === 'empty' || status === 'failed' || status === 'skipped') return status;
    return messages.length > 0 ? 'exported' : 'empty';
}

function normalizeBulkTranscriptExport(raw, opts = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const exportedAt = cleanText(opts.nowIso) || cleanText(source.exportedAt) || new Date().toISOString();
    const rawChats = Array.isArray(source.chats) ? source.chats : [];
    const chats = rawChats.map((chat, index) => {
        const chatSource = chat && typeof chat === 'object' ? chat : {};
        const transcript = normalizeTranscript(chatSource, {
            nowIso: cleanText(chatSource.exportedAt) || exportedAt
        });
        return {
            ...transcript,
            status: normalizeBulkStatus(chatSource.status, transcript.messages),
            error: cleanText(chatSource.error),
            selectedTitle: cleanText(chatSource.selectedTitle),
            order: index + 1
        };
    });

    return {
        app: cleanText(source.app) || 'Primer++ for Gemini',
        format: 'selected-chat-transcripts',
        exportedAt,
        chatCount: chats.length,
        exportedCount: chats.filter(chat => chat.status === 'exported').length,
        failedCount: chats.filter(chat => chat.status === 'failed').length,
        chats
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

function exportBulkTranscriptJSON(bulkExport, opts = {}) {
    return JSON.stringify(normalizeBulkTranscriptExport(bulkExport, opts), null, 2);
}

function appendBulkChatMarkdown(lines, chat) {
    lines.push(`## ${chat.order}. ${chat.title}`);
    lines.push('');
    lines.push(`- Chat ID: ${chat.chatId || 'unknown'}`);
    lines.push(`- Status: ${chat.status}`);
    if (chat.href) lines.push(`- Source: ${chat.href}`);
    if (chat.error) lines.push(`- Error: ${chat.error}`);
    lines.push('');

    if (chat.messages.length === 0) {
        lines.push(chat.status === 'failed' ? '_Transcript export failed._' : '_No visible messages captured._');
        lines.push('');
        return;
    }

    chat.messages.forEach((message, index) => {
        lines.push(`### ${index + 1}. ${getRoleLabel(message.role)}`);
        lines.push('');
        lines.push(message.text);
        lines.push('');
    });
}

function exportBulkTranscriptMarkdown(bulkExport, opts = {}) {
    const data = normalizeBulkTranscriptExport(bulkExport, opts);
    const lines = [
        '# Gemini Selected Chat Export',
        '',
        `- Exported: ${data.exportedAt}`,
        `- Chats: ${data.chatCount}`,
        `- Exported chats: ${data.exportedCount}`,
        `- Failed chats: ${data.failedCount}`,
        ''
    ];

    if (data.chats.length === 0) {
        lines.push('_No chats selected._');
        lines.push('');
        return lines.join('\n');
    }

    data.chats.forEach(chat => appendBulkChatMarkdown(lines, chat));
    return lines.join('\n');
}

function appendBulkChatText(lines, chat) {
    lines.push(`${chat.order}. ${chat.title}`);
    lines.push(`Chat ID: ${chat.chatId || 'unknown'}`);
    lines.push(`Status: ${chat.status}`);
    if (chat.href) lines.push(`Source: ${chat.href}`);
    if (chat.error) lines.push(`Error: ${chat.error}`);
    lines.push('');

    if (chat.messages.length === 0) {
        lines.push(chat.status === 'failed' ? 'Transcript export failed.' : 'No visible messages captured.');
        lines.push('');
        return;
    }

    chat.messages.forEach((message, index) => {
        lines.push(`${index + 1}. ${getRoleLabel(message.role)}`);
        lines.push(message.text);
        lines.push('');
    });
}

function exportBulkTranscriptText(bulkExport, opts = {}) {
    const data = normalizeBulkTranscriptExport(bulkExport, opts);
    const lines = [
        'Gemini Selected Chat Export',
        `Exported: ${data.exportedAt}`,
        `Chats: ${data.chatCount}`,
        `Exported chats: ${data.exportedCount}`,
        `Failed chats: ${data.failedCount}`,
        ''
    ];

    if (data.chats.length === 0) {
        lines.push('No chats selected.');
        return lines.join('\n') + '\n';
    }

    data.chats.forEach(chat => appendBulkChatText(lines, chat));
    return lines.join('\n').trimEnd() + '\n';
}

module.exports = {
    exportBulkTranscriptJSON,
    exportBulkTranscriptMarkdown,
    exportBulkTranscriptText,
    exportTranscriptJSON,
    exportTranscriptMarkdown,
    exportTranscriptText,
    normalizeMessage,
    normalizeBulkTranscriptExport,
    normalizeTranscript
};
