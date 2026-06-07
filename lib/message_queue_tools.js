const MAX_TITLE_LENGTH = 80;
const MAX_TEXT_LENGTH = 12000;
const MAX_ERROR_LENGTH = 240;
const STATUSES = new Set(['queued', 'sending', 'sent', 'failed', 'cancelled']);

function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function cleanText(value) {
    return toText(value).trim();
}

function limitedText(value, maxLength) {
    return cleanText(value).slice(0, maxLength);
}

function nowIso(opts = {}) {
    return cleanText(opts.nowIso) || new Date().toISOString();
}

function deriveTitle(text) {
    const firstLine = cleanText(text).split(/\r?\n/)[0];
    return firstLine.slice(0, MAX_TITLE_LENGTH);
}

function normalizeStatus(value, opts = {}) {
    const status = cleanText(value);
    if (status === 'sending' && opts.recoverSending) return 'queued';
    return STATUSES.has(status) ? status : 'queued';
}

function normalizeQueueItem(raw, index = 0, opts = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const text = limitedText(source.text === undefined ? source.content : source.text, MAX_TEXT_LENGTH);
    if (!text) return null;
    const now = nowIso(opts);
    const createdAt = cleanText(source.createdAt) || now;
    const updatedAt = cleanText(source.updatedAt) || createdAt;

    return {
        id: cleanText(source.id) || `q_${index}`,
        title: limitedText(source.title, MAX_TITLE_LENGTH) || deriveTitle(text),
        text,
        status: normalizeStatus(source.status, opts),
        createdAt,
        updatedAt,
        sentAt: cleanText(source.sentAt),
        error: limitedText(source.error, MAX_ERROR_LENGTH)
    };
}

function normalizeQueueData(raw, opts = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const rawItems = Array.isArray(source.items) ? source.items : [];
    const items = rawItems
        .map((item, index) => normalizeQueueItem(item, index, opts))
        .filter(Boolean);
    const activeId = cleanText(source.activeId);
    const activeExists = activeId && items.some(item => item.id === activeId && item.status === 'sending');

    return {
        paused: source.paused === false ? false : true,
        activeId: activeExists ? activeId : '',
        lastError: limitedText(source.lastError, MAX_ERROR_LENGTH),
        items
    };
}

function createQueueItem(text, opts = {}) {
    const content = limitedText(text, MAX_TEXT_LENGTH);
    if (!content) return null;
    const now = nowIso(opts);
    return {
        id: cleanText(opts.id) || `q_${Date.now()}`,
        title: limitedText(opts.title, MAX_TITLE_LENGTH) || deriveTitle(content),
        text: content,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        sentAt: '',
        error: ''
    };
}

function addQueueItem(data, text, opts = {}) {
    const state = normalizeQueueData(data, opts);
    const item = createQueueItem(text, opts);
    if (!item) return state;
    if (opts.position === 'front') state.items.unshift(item);
    else state.items.push(item);
    state.lastError = '';
    return state;
}

function addQueueItems(data, entries, opts = {}) {
    const state = normalizeQueueData(data, opts);
    const source = Array.isArray(entries) ? entries : [entries];
    const idPrefix = cleanText(opts.idPrefix) || `q_${Date.now()}`;
    const items = [];

    source.forEach((entry, index) => {
        const raw = entry && typeof entry === 'object' ? entry : { text: entry };
        const id = cleanText(raw.id) || `${idPrefix}_${index + 1}`;
        const item = createQueueItem(raw.text === undefined ? raw.content : raw.text, {
            ...opts,
            id,
            title: raw.title
        });
        if (item) items.push(item);
    });

    if (items.length === 0) return { data: state, added: 0, items: [] };
    if (opts.position === 'front') state.items.unshift(...items);
    else state.items.push(...items);
    state.lastError = '';
    return { data: state, added: items.length, items };
}

function updateQueueItem(data, id, updates = {}, opts = {}) {
    const state = normalizeQueueData(data, opts);
    const item = state.items.find(entry => entry.id === cleanText(id));
    if (!item) return state;
    const hasTitleUpdate = updates.title !== undefined;
    const nextTitle = hasTitleUpdate ? limitedText(updates.title, MAX_TITLE_LENGTH) : '';
    if (updates.text !== undefined) {
        const text = limitedText(updates.text, MAX_TEXT_LENGTH);
        if (text) {
            item.text = text;
            item.title = hasTitleUpdate ? (nextTitle || deriveTitle(text)) : item.title;
        }
    }
    if (hasTitleUpdate && updates.text === undefined) {
        item.title = nextTitle || deriveTitle(item.text);
    }
    item.updatedAt = nowIso(opts);
    return state;
}

function removeQueueItem(data, id, opts = {}) {
    const state = normalizeQueueData(data, opts);
    const targetId = cleanText(id);
    state.items = state.items.filter(item => item.id !== targetId);
    if (state.activeId === targetId) state.activeId = '';
    return state;
}

function moveQueueItem(data, id, direction, opts = {}) {
    const state = normalizeQueueData(data, opts);
    const index = state.items.findIndex(item => item.id === cleanText(id));
    if (index === -1) return state;
    const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : Number(direction);
    if (!Number.isFinite(delta) || delta === 0) return state;
    const target = Math.max(0, Math.min(state.items.length - 1, index + delta));
    if (target === index) return state;
    const [item] = state.items.splice(index, 1);
    state.items.splice(target, 0, item);
    return state;
}

function setQueuePaused(data, paused, opts = {}) {
    const state = normalizeQueueData(data, opts);
    state.paused = paused === true;
    if (opts.lastError !== undefined) {
        state.lastError = limitedText(opts.lastError, MAX_ERROR_LENGTH);
    }
    return state;
}

function getNextQueuedItem(data) {
    return normalizeQueueData(data).items.find(item => item.status === 'queued') || null;
}

function markQueueItemSending(data, id, opts = {}) {
    const state = normalizeQueueData(data, opts);
    const item = state.items.find(entry => entry.id === cleanText(id));
    if (!item) return state;
    item.status = 'sending';
    item.error = '';
    item.updatedAt = nowIso(opts);
    state.paused = false;
    state.activeId = item.id;
    state.lastError = '';
    return state;
}

function markQueueItemSent(data, id, opts = {}) {
    const state = normalizeQueueData(data, opts);
    const item = state.items.find(entry => entry.id === cleanText(id));
    if (!item) return state;
    const now = nowIso(opts);
    item.status = 'sent';
    item.sentAt = now;
    item.updatedAt = now;
    item.error = '';
    if (state.activeId === item.id) state.activeId = '';
    return state;
}

function markQueueItemFailed(data, id, error, opts = {}) {
    const state = normalizeQueueData(data, opts);
    const item = state.items.find(entry => entry.id === cleanText(id));
    if (!item) return state;
    const message = limitedText(error, MAX_ERROR_LENGTH) || 'Queue send failed';
    item.status = opts.requeue === false ? 'failed' : 'queued';
    item.error = message;
    item.updatedAt = nowIso(opts);
    state.paused = true;
    state.lastError = message;
    if (state.activeId === item.id) state.activeId = '';
    return state;
}

function cancelQueueItem(data, id, opts = {}) {
    const state = normalizeQueueData(data, opts);
    const item = state.items.find(entry => entry.id === cleanText(id));
    if (!item) return state;
    item.status = 'cancelled';
    item.updatedAt = nowIso(opts);
    if (state.activeId === item.id) state.activeId = '';
    return state;
}

function clearQueueHistory(data, opts = {}) {
    const state = normalizeQueueData(data, opts);
    state.items = state.items.filter(item => !['sent', 'cancelled'].includes(item.status));
    return state;
}

function getQueueStats(data) {
    const state = normalizeQueueData(data);
    const stats = {
        total: state.items.length,
        queued: 0,
        sending: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        pending: 0,
        paused: state.paused
    };
    for (const item of state.items) {
        if (Object.prototype.hasOwnProperty.call(stats, item.status)) {
            stats[item.status] += 1;
        }
    }
    stats.pending = stats.queued + stats.sending;
    return stats;
}

function evaluateQueueSafety(context = {}) {
    if (context.toolModeActive) {
        const label = cleanText(context.toolModeLabel) || 'unknown tool mode';
        return { ok: false, reason: `Tool mode active: ${label}` };
    }
    if (context.editorReady === false) {
        return { ok: false, reason: 'Input editor unavailable' };
    }
    if (context.sendReady === false) {
        return { ok: false, reason: 'Send button unavailable' };
    }
    return { ok: true, reason: '' };
}

module.exports = {
    addQueueItem,
    addQueueItems,
    cancelQueueItem,
    clearQueueHistory,
    createQueueItem,
    evaluateQueueSafety,
    getNextQueuedItem,
    getQueueStats,
    markQueueItemFailed,
    markQueueItemSending,
    markQueueItemSent,
    moveQueueItem,
    normalizeQueueData,
    normalizeQueueItem,
    removeQueueItem,
    setQueuePaused,
    updateQueueItem
};
