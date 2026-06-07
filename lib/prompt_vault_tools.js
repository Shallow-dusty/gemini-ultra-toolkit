const { formatLocalDate } = require('./date_utils.js');

const DEFAULT_CATEGORY = 'General';
const MAX_NAME_LENGTH = 80;
const MAX_CATEGORY_LENGTH = 40;
const MAX_SHORTCUT_LENGTH = 32;
const MAX_CHAIN_STEPS = 12;
const PROMPT_EXPORT_SCHEMA = 'primer-pp.prompt-vault';
const PROMPT_EXPORT_VERSION = 1;

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

function normalizeChainSteps(value) {
    const rawSteps = Array.isArray(value)
        ? value
        : toText(value).split(/\n\s*---+\s*\n/g);
    return rawSteps
        .map(step => step && typeof step === 'object' ? step.content : step)
        .map(step => toText(step).trim())
        .filter(Boolean)
        .slice(0, MAX_CHAIN_STEPS);
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
        chainSteps: normalizeChainSteps(source.chainSteps || source.chain),
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

function composePromptContent(prompt, variables = {}) {
    const normalized = normalizePrompt(prompt);
    const parts = [normalized.content, ...normalized.chainSteps]
        .map(part => renderPromptTemplate(part, variables))
        .filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';
    return parts
        .map((part, index) => `Step ${index + 1}\n${part}`)
        .join('\n\n---\n\n');
}

function createPromptQueueEntries(prompt, variables = {}) {
    const normalized = normalizePrompt(prompt);
    const parts = [normalized.content, ...normalized.chainSteps]
        .map(part => renderPromptTemplate(part, variables).trim())
        .filter(Boolean);
    if (parts.length === 0) return [];
    if (parts.length === 1) {
        return [{
            title: normalized.name,
            text: parts[0],
            promptId: normalized.id,
            stepIndex: 1,
            totalSteps: 1
        }];
    }
    return parts.map((part, index) => {
        return {
            title: `${normalized.name} ${index + 1}/${parts.length}`,
            text: part,
            promptId: normalized.id,
            stepIndex: index + 1,
            totalSteps: parts.length
        };
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

function removePromptForUndo(prompts, id, opts = {}) {
    const normalized = normalizePromptList(prompts, opts);
    const idx = normalized.findIndex(prompt => prompt.id === cleanText(id));
    if (idx === -1) {
        return { prompts: normalized, removed: null };
    }

    const removed = {
        ...normalized[idx],
        deletedAt: getNowIso(opts),
        restoreIndex: idx
    };
    return {
        prompts: normalized.filter(prompt => prompt.id !== removed.id),
        removed
    };
}

function restoreRemovedPrompt(prompts, removed, opts = {}) {
    const normalized = normalizePromptList(prompts, opts);
    const source = removed && typeof removed === 'object' ? removed : {};
    const prompt = normalizePrompt(source, normalized.length, opts);
    if (!prompt.content || normalized.some(existing => existing.id === prompt.id)) {
        return { prompts: normalized, restored: false };
    }

    const rawIndex = Number(source.restoreIndex);
    const restoreIndex = Number.isInteger(rawIndex)
        ? Math.max(0, Math.min(rawIndex, normalized.length))
        : normalized.length;
    const next = [...normalized];
    next.splice(restoreIndex, 0, prompt);
    return { prompts: next, restored: true };
}

function getNowIso(opts = {}) {
    return opts.nowIso || new Date().toISOString();
}

function createPromptExport(prompts, opts = {}) {
    return {
        schema: PROMPT_EXPORT_SCHEMA,
        version: PROMPT_EXPORT_VERSION,
        exportedAt: getNowIso(opts),
        app: 'Primer++ for Gemini',
        prompts: normalizePromptList(prompts, opts)
    };
}

function serializePromptExport(prompts, opts = {}) {
    return JSON.stringify(createPromptExport(prompts, opts), null, 2);
}

function getImportPromptArray(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object' && Array.isArray(raw.prompts)) return raw.prompts;
    return [];
}

function parsePromptImport(raw, opts = {}) {
    return normalizePromptList(getImportPromptArray(raw), opts);
}

function defaultImportedPromptId(prompt, index) {
    return `p_${Date.now()}_${index}`;
}

function mergePromptImport(existing, rawImport, opts = {}) {
    const prompts = normalizePromptList(existing, opts);
    const imported = parsePromptImport(rawImport, opts);
    const idFactory = typeof opts.idFactory === 'function' ? opts.idFactory : defaultImportedPromptId;

    imported.forEach((prompt, index) => {
        prompts.push(normalizePrompt({
            ...prompt,
            id: idFactory(prompt, index)
        }, prompts.length, opts));
    });

    return {
        prompts,
        imported: imported.length
    };
}

module.exports = {
    buildPromptVariables,
    composePromptContent,
    createPromptQueueEntries,
    createPromptExport,
    findPromptByShortcut,
    getQuickMenuSections,
    markPromptUsed,
    mergePromptImport,
    normalizePrompt,
    normalizeChainSteps,
    normalizePromptList,
    normalizeShortcut,
    parsePromptImport,
    renderPromptTemplate,
    removePromptForUndo,
    restoreRemovedPrompt,
    serializePromptExport,
    sortPromptsForDisplay
};
