const MAX_TITLE_LENGTH = 120;
const MAX_NOTE_LENGTH = 4000;

function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function cleanText(value, fallback = '') {
    const text = toText(value).trim();
    return text || fallback;
}

function normalizeHref(value) {
    const href = cleanText(value, '');
    if (!href) return '';
    return /^(javascript|data|vbscript):/i.test(href) ? '' : href;
}

function normalizeChatRef(chat) {
    const source = chat && typeof chat === 'object' ? chat : {};
    const chatId = cleanText(source.chatId || source.id, '');
    if (!chatId) return null;
    return {
        chatId,
        title: cleanText(source.title, chatId).slice(0, MAX_TITLE_LENGTH),
        href: normalizeHref(source.href)
    };
}

function normalizeNote(raw, opts = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const ref = normalizeChatRef(source);
    if (!ref) return null;
    const nowIso = opts.nowIso || new Date().toISOString();
    const createdAt = cleanText(source.createdAt, nowIso);
    return {
        chatId: ref.chatId,
        title: ref.title,
        href: ref.href,
        note: cleanText(source.note, '').slice(0, MAX_NOTE_LENGTH),
        pinned: source.pinned === true,
        createdAt,
        updatedAt: cleanText(source.updatedAt, createdAt)
    };
}

function normalizeNotesData(raw, opts = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const notes = {};
    for (const [chatId, note] of Object.entries(source.notes || {})) {
        const normalized = normalizeNote({ ...note, chatId }, opts);
        if (normalized) notes[normalized.chatId] = normalized;
    }
    return { notes };
}

function upsertChatNote(data, chat, updates = {}, opts = {}) {
    const state = normalizeNotesData(data, opts);
    const ref = normalizeChatRef(chat);
    if (!ref) return state;
    const chatSource = chat;
    const nowIso = opts.nowIso || new Date().toISOString();
    const existing = state.notes[ref.chatId];
    const title = cleanText(chatSource.title, existing?.title || ref.title);
    const href = normalizeHref(chatSource.href) || existing?.href || ref.href;
    const note = updates.note === undefined
        ? (existing?.note || '')
        : cleanText(updates.note, '').slice(0, MAX_NOTE_LENGTH);
    const pinned = updates.pinned === undefined ? !!existing?.pinned : updates.pinned === true;

    if (!note && !pinned) {
        delete state.notes[ref.chatId];
        return state;
    }

    state.notes[ref.chatId] = {
        chatId: ref.chatId,
        title,
        href,
        note,
        pinned,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso
    };
    return state;
}

function toggleChatPin(data, chat, opts = {}) {
    const state = normalizeNotesData(data, opts);
    const ref = normalizeChatRef(chat);
    if (!ref) return state;
    const existing = state.notes[ref.chatId];
    return upsertChatNote(state, ref, { pinned: !existing?.pinned }, opts);
}

function deleteChatNote(data, chatId, opts = {}) {
    const state = normalizeNotesData(data, opts);
    delete state.notes[cleanText(chatId, '')];
    return state;
}

function getPinnedNotes(data) {
    return Object.values(normalizeNotesData(data).notes)
        .filter(note => note.pinned)
        .sort((a, b) => {
            if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
            return a.title.localeCompare(b.title);
        });
}

function getNotesStats(data) {
    const notes = Object.values(normalizeNotesData(data).notes);
    return {
        total: notes.length,
        pinned: notes.filter(note => note.pinned).length,
        withNote: notes.filter(note => note.note).length
    };
}

module.exports = {
    deleteChatNote,
    getNotesStats,
    getPinnedNotes,
    normalizeChatRef,
    normalizeNote,
    normalizeNotesData,
    toggleChatPin,
    upsertChatNote
};
