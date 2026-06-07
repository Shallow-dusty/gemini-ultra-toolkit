const { formatLocalDate } = require('./date_utils.js');

const DEFAULT_CATEGORY = 'General';
const MAX_NAME_LENGTH = 80;
const MAX_CATEGORY_LENGTH = 40;
const MAX_SHORTCUT_LENGTH = 32;

function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function cleanText(value, fallback = '') {
    const text = toText(value).trim();
    return text || fallback;
}

function normalizeShortcut(value, name = '') {
    const source = cleanText(value) || cleanText(name);
    return source
        .replace(/^\/+/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, MAX_SHORTCUT_LENGTH);
}

function normalizeUsedCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return 0;
    return Math.floor(count);
}

function normalizePrompt(raw, index = 0, opts = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const nowIso = opts.nowIso || new Date().toISOString();
    const name = cleanText(source.name, `Prompt ${index + 1}`).slice(0, MAX_NAME_LENGTH);
    const content = toText(source.content).trim();
    const category = cleanText(source.category, DEFAULT_CATEGORY).slice(0, MAX_CATEGORY_LENGTH);
    const createdAt = cleanText(source.createdAt, nowIso);

    return {
        id: cleanText(source.id, `p_${index}`),
        name,
        content,
        category,
        shortcut: normalizeShortcut(source.shortcut, name),
        favorite: source.favorite === true,
        createdAt,
        updatedAt: cleanText(source.updatedAt, createdAt),
        usedCount: normalizeUsedCount(source.usedCount),
        lastUsedAt: cleanText(source.lastUsedAt, '')
    };
}

function normalizePromptList(raw, opts = {}) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((prompt, index) => normalizePrompt(prompt, index, opts))
        .filter(prompt => prompt.content);
}

function comparePromptDisplay(a, b) {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    const aLast = a.lastUsedAt || '';
    const bLast = b.lastUsedAt || '';
    if (aLast !== bLast) return bLast.localeCompare(aLast);
    if (a.usedCount !== b.usedCount) return b.usedCount - a.usedCount;
    return a.name.localeCompare(b.name);
}

function sortPromptsForDisplay(prompts) {
    return normalizePromptList(prompts).sort(comparePromptDisplay);
}

function getQuickMenuSections(prompts, opts = {}) {
    const limit = Number.isFinite(Number(opts.limit)) ? Math.max(0, Math.floor(Number(opts.limit))) : 8;
    const sorted = sortPromptsForDisplay(prompts);
    const seen = new Set();
    const sections = [];

    function addSection(label, candidates) {
        if (seen.size >= limit) return;
        const picked = [];
        for (const prompt of candidates) {
            if (seen.size >= limit) break;
            if (seen.has(prompt.id)) continue;
            picked.push(prompt);
            seen.add(prompt.id);
        }
        if (picked.length > 0) sections.push({ label, prompts: picked });
    }

    addSection('Favorites', sorted.filter(prompt => prompt.favorite));
    addSection('Recent', sorted.filter(prompt => !prompt.favorite && prompt.lastUsedAt));
    addSection('Top Prompts', sorted);
    return sections;
}

function buildPromptVariables(context = {}) {
    const date = context.now instanceof Date ? context.now : new Date();
    const day = formatLocalDate(date);
    const time = date.toTimeString().slice(0, 5);
    return {
        date: day,
        time,
        datetime: `${day} ${time}`,
        chat_title: cleanText(context.chatTitle, ''),
        selected_text: cleanText(context.selectedText, ''),
        model: cleanText(context.model, '')
    };
}

function renderPromptTemplate(template, variables = {}) {
    return toText(template).replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
        const normalizedKey = key.toLowerCase().replace(/-/g, '_');
        if (!Object.prototype.hasOwnProperty.call(variables, normalizedKey)) return match;
        const value = variables[normalizedKey];
        return value === null || value === undefined ? '' : String(value);
    });
}

function findPromptByShortcut(prompts, command) {
    const shortcut = normalizeShortcut(command);
    if (!shortcut) return null;
    return sortPromptsForDisplay(prompts).find(prompt => prompt.shortcut === shortcut) || null;
}

function markPromptUsed(prompts, id, opts = {}) {
    const nowIso = opts.nowIso || new Date().toISOString();
    return normalizePromptList(prompts, opts).map(prompt => {
        if (prompt.id !== id) return prompt;
        return {
            ...prompt,
            usedCount: prompt.usedCount + 1,
            lastUsedAt: nowIso,
            updatedAt: nowIso
        };
    });
}

module.exports = {
    buildPromptVariables,
    findPromptByShortcut,
    getQuickMenuSections,
    markPromptUsed,
    normalizePrompt,
    normalizePromptList,
    normalizeShortcut,
    renderPromptTemplate,
    sortPromptsForDisplay
};
