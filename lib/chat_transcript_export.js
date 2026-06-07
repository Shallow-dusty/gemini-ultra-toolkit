function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function cleanText(value) {
    return toText(value).trim();
}

function escapeHTML(value) {
    const replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return toText(value).replace(/[&<>"']/g, char => replacements[char]);
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

function getHTMLDocument(title, body) {
    return [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<title>${escapeHTML(title)}</title>`,
        '<style>',
        ':root{color-scheme:light dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;}',
        'body{margin:0;padding:32px;background:#f7f7f4;color:#202124;}',
        'main{max-width:960px;margin:0 auto;}',
        'h1{font-size:28px;margin:0 0 12px;}',
        'h2{font-size:20px;margin:28px 0 8px;}',
        'h3{font-size:16px;margin:18px 0 8px;}',
        '.meta{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0 0 24px;font-size:13px;color:#5f6368;}',
        '.meta dt{font-weight:650;color:#3c4043;}',
        '.meta dd{margin:0;overflow-wrap:anywhere;}',
        '.message,.chat{border:1px solid #dadce0;border-radius:8px;background:#fff;margin:16px 0;padding:16px;}',
        '.message-text{white-space:pre-wrap;overflow-wrap:anywhere;}',
        '.empty{color:#5f6368;font-style:italic;}',
        '.status{display:inline-block;border-radius:999px;padding:2px 8px;background:#e8f0fe;color:#174ea6;font-size:12px;text-transform:capitalize;}',
        '.status.failed{background:#fce8e6;color:#a50e0e;}',
        '.status.empty,.status.skipped{background:#f1f3f4;color:#3c4043;}',
        '@media (prefers-color-scheme:dark){body{background:#202124;color:#e8eaed}.message,.chat{background:#2b2c2f;border-color:#3c4043}.meta{color:#bdc1c6}.meta dt{color:#e8eaed}.empty{color:#bdc1c6}}',
        '</style>',
        '</head>',
        '<body>',
        body,
        '</body>',
        '</html>',
        ''
    ].join('\n');
}

function renderMetaItem(label, value) {
    return `<dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd>`;
}

function renderMessageHTML(message, index, headingTag) {
    const roleLabel = escapeHTML(`${index + 1}. ${getRoleLabel(message.role)}`);
    return [
        '<article class="message">',
        `<${headingTag}>${roleLabel}</${headingTag}>`,
        `<div class="message-text">${escapeHTML(message.text)}</div>`,
        '</article>'
    ].join('\n');
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

function exportTranscriptHTML(transcript, opts = {}) {
    const data = normalizeTranscript(transcript, opts);
    const sourceMeta = data.href ? renderMetaItem('Source', data.href) : '';
    const messages = data.messages.length === 0
        ? '<p class="empty">No visible messages captured.</p>'
        : data.messages.map((message, index) => renderMessageHTML(message, index, 'h2')).join('\n');
    const body = [
        '<main>',
        `<h1>${escapeHTML(data.title)}</h1>`,
        '<dl class="meta">',
        renderMetaItem('Chat ID', data.chatId || 'unknown'),
        renderMetaItem('Exported', data.exportedAt),
        sourceMeta,
        '</dl>',
        messages,
        '</main>'
    ].join('\n');
    return getHTMLDocument(data.title, body);
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

function renderBulkChatHTML(chat) {
    const sourceMeta = chat.href ? renderMetaItem('Source', chat.href) : '';
    const errorMeta = chat.error ? renderMetaItem('Error', chat.error) : '';
    const messages = chat.messages.length === 0
        ? `<p class="empty">${chat.status === 'failed' ? 'Transcript export failed.' : 'No visible messages captured.'}</p>`
        : chat.messages.map((message, index) => renderMessageHTML(message, index, 'h3')).join('\n');

    return [
        `<section class="chat">`,
        `<h2>${escapeHTML(`${chat.order}. ${chat.title}`)}</h2>`,
        '<dl class="meta">',
        renderMetaItem('Chat ID', chat.chatId || 'unknown'),
        `<dt>Status</dt><dd><span class="status ${escapeHTML(chat.status)}">${escapeHTML(chat.status)}</span></dd>`,
        sourceMeta,
        errorMeta,
        '</dl>',
        messages,
        '</section>'
    ].join('\n');
}

function exportBulkTranscriptHTML(bulkExport, opts = {}) {
    const data = normalizeBulkTranscriptExport(bulkExport, opts);
    const chats = data.chats.length === 0
        ? '<p class="empty">No chats selected.</p>'
        : data.chats.map(chat => renderBulkChatHTML(chat)).join('\n');
    const body = [
        '<main>',
        '<h1>Gemini Selected Chat Export</h1>',
        '<dl class="meta">',
        renderMetaItem('Exported', data.exportedAt),
        renderMetaItem('Chats', data.chatCount),
        renderMetaItem('Exported chats', data.exportedCount),
        renderMetaItem('Failed chats', data.failedCount),
        '</dl>',
        chats,
        '</main>'
    ].join('\n');
    return getHTMLDocument('Gemini Selected Chat Export', body);
}

module.exports = {
    exportBulkTranscriptHTML,
    exportBulkTranscriptJSON,
    exportBulkTranscriptMarkdown,
    exportBulkTranscriptText,
    exportTranscriptHTML,
    exportTranscriptJSON,
    exportTranscriptMarkdown,
    exportTranscriptText,
    normalizeMessage,
    normalizeBulkTranscriptExport,
    normalizeTranscript
};
