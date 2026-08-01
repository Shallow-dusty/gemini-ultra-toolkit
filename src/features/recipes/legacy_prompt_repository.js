import {
    RECIPES_SCHEMA_VERSION,
    createEmptyRecipeState,
    createRecipeVersion,
    normalizeRecipeId,
    normalizeRecipeRecord,
    normalizeRecipeState,
    safeClone
} from './model.js';
import { normalizePrompt } from '../../../lib/prompt_vault_tools.js';

export const LEGACY_PROMPT_VAULT_KEY = 'gemini_prompt_vault';
export const RECIPES_SIDECAR_SUFFIX = '_recipes_v13';

const LEGACY_PLACEHOLDER = /{{\s*([a-zA-Z0-9_-]+)\s*}}/g;

function validIso(value, fallback) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fallback;
}

function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function recipeIdForLegacy(promptId, usedIds) {
    let candidate;
    try {
        candidate = normalizeRecipeId(promptId);
    } catch {
        candidate = `legacy-${stableHash(promptId)}`;
    }
    let unique = candidate;
    let suffix = 2;
    while (usedIds.has(unique)) unique = `${candidate}-${suffix++}`;
    usedIds.add(unique);
    return unique;
}

function canonicalizeLegacyTemplates(parts) {
    const names = new Map();
    const templates = parts.map(part => String(part).replace(LEGACY_PLACEHOLDER, (_match, rawName) => {
        if (names.has(rawName)) return `{{${names.get(rawName)}}}`;
        const normalized = rawName.toLowerCase().replace(/-/g, '_');
        const base = /^[A-Za-z]/.test(normalized) ? normalized : `legacy_${stableHash(rawName)}`;
        const occupied = new Set(names.values());
        let name = base;
        if (occupied.has(name)) name = `${base}_${stableHash(rawName)}`;
        names.set(rawName, name);
        return `{{${name}}}`;
    }));
    const variables = [...names.entries()]
        .map(([rawName, name]) => ({ name, type: 'text', required: false, default: `{{${rawName}}}` }))
        .sort((left, right) => left.name.localeCompare(right.name));
    return { templates, variables };
}

export function legacyStorageKeys(sessionId) {
    const normalized = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : 'Guest';
    const legacy = normalized.includes('@') ? `${LEGACY_PROMPT_VAULT_KEY}_${normalized}` : LEGACY_PROMPT_VAULT_KEY;
    return Object.freeze({ legacy, recipes: `${legacy}${RECIPES_SIDECAR_SUFFIX}` });
}

export function legacyPromptToRecipeDraft(rawPrompt, index, options = {}) {
    const nowIso = validIso(options.nowIso, new Date(0).toISOString());
    const prompt = normalizePrompt(rawPrompt, index, { nowIso });
    if (!prompt.content) return null;
    const usedIds = options.usedIds || new Set();
    const id = recipeIdForLegacy(prompt.id, usedIds);
    const { templates, variables: inferredVariables } = canonicalizeLegacyTemplates([prompt.content, ...prompt.chainSteps]);
    const variables = Array.isArray(rawPrompt?.recipeVariables)
        ? safeClone(rawPrompt.recipeVariables)
        : inferredVariables;
    const steps = templates.map((template, stepIndex) => ({
        id: `step-${stepIndex + 1}`,
        title: templates.length === 1 ? prompt.name : `${prompt.name} ${stepIndex + 1}/${templates.length}`,
        template,
        permissions: ['composer.insert']
    }));
    return {
        id,
        title: prompt.name,
        description: prompt.category,
        variables,
        steps,
        permissions: ['composer.insert'],
        provenance: { source: 'legacy-prompt-vault', sourceId: prompt.id }
    };
}

export function legacyPromptToRecipeRecord(rawPrompt, index, options = {}) {
    const nowIso = validIso(options.nowIso, new Date(0).toISOString());
    const prompt = normalizePrompt(rawPrompt, index, { nowIso });
    const draft = legacyPromptToRecipeDraft(prompt, index, options);
    if (!draft) return null;
    const createdAt = validIso(prompt.createdAt, nowIso);
    const updatedAt = validIso(prompt.updatedAt, createdAt);
    const version = createRecipeVersion(draft, { id: draft.id, now: updatedAt, createdAt });
    const id = draft.id;
    return normalizeRecipeRecord({ id, currentVersion: 1, versions: [version] });
}

function latest(record) {
    return record.versions[record.currentVersion - 1];
}

export function recipeRecordToLegacyPrompt(recordValue, metadata = {}) {
    const record = normalizeRecipeRecord(recordValue);
    const recipe = latest(record);
    const raw = metadata.raw && typeof metadata.raw === 'object' && !Array.isArray(metadata.raw)
        ? safeClone(metadata.raw)
        : {};
    const original = metadata.original && typeof metadata.original === 'object' ? metadata.original : null;
    const legacyId = metadata.legacyId || recipe.provenance.sourceId || recipe.id;
    const recipeTemplates = recipe.steps.map(step => step.template);
    const legacyTemplates = raw.content === undefined
        ? (original ? [original.content, ...(original.chainSteps || [])] : null)
        : [raw.content, ...(raw.chainSteps || [])];
    const preservesRecipeMeaning = legacyTemplates !== null &&
        JSON.stringify(canonicalizeLegacyTemplates(legacyTemplates).templates) === JSON.stringify(recipeTemplates);
    const templates = preservesRecipeMeaning ? legacyTemplates : recipeTemplates;
    const normalized = normalizePrompt({
        ...raw,
        id: legacyId,
        name: recipe.title,
        content: templates[0],
        chainSteps: templates.slice(1),
        category: raw.category || recipe.description || 'General',
        shortcut: raw.shortcut || '',
        favorite: raw.favorite === true,
        usedCount: raw.usedCount || 0,
        lastUsedAt: raw.lastUsedAt || '',
        createdAt: raw.createdAt || recipe.createdAt,
        updatedAt: recipe.updatedAt
    }, 0, { nowIso: recipe.updatedAt });
    normalized.recipeVariables = safeClone(recipe.variables);
    return { ...raw, ...normalized };
}

function assertStorage(storage) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new TypeError('Legacy prompt repository storage must implement get() and set()');
    }
    return storage;
}

function cloneRawPrompt(raw, normalized) {
    return {
        raw: safeClone(raw),
        original: safeClone(normalized),
        legacyId: normalized.id
    };
}

export class LegacyPromptRecipeRepository {
    constructor({ storage, sessionId, clock = () => new Date().toISOString() } = {}) {
        this.storage = assertStorage(storage);
        this.sessionId = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : 'Guest';
        if (typeof clock !== 'function') throw new TypeError('Legacy prompt repository clock must be a function');
        this.clock = clock;
        this.keys = legacyStorageKeys(this.sessionId);
        this.boundAccountId = this.sessionId;
        this._metadata = new Map();
        this._tail = Promise.resolve();
    }

    get() {
        return this._enqueue(() => this._load());
    }

    update(updater) {
        if (typeof updater !== 'function') return Promise.reject(new TypeError('Legacy prompt repository updater must be a function'));
        return this._enqueue(async () => {
            const beforeSidecar = await this.storage.get(this.keys.recipes, undefined);
            const beforeLegacy = await this.storage.get(this.keys.legacy, []);
            const current = await this._load(beforeLegacy, beforeSidecar);
            const nextRaw = await updater(safeClone(current));
            const next = normalizeRecipeState(nextRaw, this.sessionId);
            try {
                await this.storage.set(this.keys.recipes, safeClone(next));
                await this.storage.set(this.keys.legacy, this._toLegacy(next));
            } catch (error) {
                await this._rollback(beforeSidecar, beforeLegacy);
                throw error;
            }
            return safeClone(next);
        });
    }

    setLegacyMetadata(recipeId, metadata) {
        return this._enqueue(async () => {
            const state = await this._load();
            const current = this._metadata.get(recipeId);
            const merged = { ...(current?.raw || {}), ...safeClone(metadata) };
            this._metadata.set(recipeId, {
                raw: merged,
                original: current?.original || safeClone(metadata),
                legacyId: metadata.id || current?.legacyId || recipeId
            });
            await this.storage.set(this.keys.legacy, this._toLegacy(state));
        });
    }

    getLegacyMetadata(recipeId) {
        const metadata = this._metadata.get(recipeId);
        return metadata ? safeClone(metadata) : null;
    }

    removeLegacyMetadata(recipeId) {
        return this._enqueue(() => {
            this._metadata.delete(recipeId);
        });
    }

    async getLegacyPrompts() {
        const raw = await this.storage.get(this.keys.legacy, []);
        if (!Array.isArray(raw)) throw new TypeError('Legacy prompt vault storage must remain an array');
        return raw.map((prompt, index) => {
            const normalized = normalizePrompt(prompt, index);
            if (Array.isArray(prompt?.recipeVariables)) normalized.recipeVariables = safeClone(prompt.recipeVariables);
            return normalized;
        }).filter(prompt => prompt.content);
    }

    async flush() {
        await this._tail;
        if (typeof this.storage.flush === 'function') await this.storage.flush();
    }

    _enqueue(operation) {
        const run = this._tail.then(operation);
        this._tail = run.catch(() => undefined);
        return run;
    }

    async _load(legacyValue = undefined, sidecarValue = undefined) {
        const nowIso = validIso(this.clock(), new Date(0).toISOString());
        const legacy = legacyValue === undefined ? await this.storage.get(this.keys.legacy, []) : legacyValue;
        if (!Array.isArray(legacy)) throw new TypeError('Legacy prompt vault storage must remain an array');
        const usedIds = new Set();
        const migrated = [];
        for (const [index, raw] of legacy.entries()) {
            const normalized = normalizePrompt(raw, index, { nowIso });
            if (!normalized.content) continue;
            if (Array.isArray(raw?.recipeVariables)) normalized.recipeVariables = safeClone(raw.recipeVariables);
            const record = legacyPromptToRecipeRecord(normalized, index, { nowIso, usedIds });
            migrated.push(record);
            this._metadata.set(record.id, cloneRawPrompt(raw, normalized));
        }

        const stored = sidecarValue === undefined ? await this.storage.get(this.keys.recipes, undefined) : sidecarValue;
        let state;
        let changed = false;
        if (stored === undefined || stored === null) {
            state = createEmptyRecipeState(this.sessionId);
            state.records = migrated;
            changed = true;
        } else {
            state = normalizeRecipeState(stored, this.sessionId);
            const sourceIds = new Set(state.records.flatMap(record => [
                record.id,
                latest(record).provenance.sourceId
            ].filter(Boolean)));
            const additions = migrated.filter(record => !sourceIds.has(record.id) &&
                !sourceIds.has(latest(record).provenance.sourceId));
            if (additions.length) {
                state = { ...state, records: [...state.records, ...additions] };
                changed = true;
            }
        }
        if (changed) await this.storage.set(this.keys.recipes, safeClone(state));
        return normalizeRecipeState(state, this.sessionId);
    }

    _toLegacy(state) {
        return state.records.map(record => recipeRecordToLegacyPrompt(record, this._metadata.get(record.id)));
    }

    async _rollback(sidecar, legacy) {
        try { await this.storage.set(this.keys.recipes, safeClone(sidecar)); } catch { /* best effort */ }
        try { await this.storage.set(this.keys.legacy, safeClone(legacy)); } catch { /* best effort */ }
    }
}

export function createLegacyPromptRecipeRepository(options) {
    return new LegacyPromptRecipeRepository(options);
}
