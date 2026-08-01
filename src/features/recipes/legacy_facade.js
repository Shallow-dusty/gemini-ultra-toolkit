import { GeminiAdapter } from '../../adapters/gemini.js';
import { Logger } from '../../logger.js';
import { normalizePrompt } from '../../../lib/prompt_vault_tools.js';
import { createRecipeService } from './service.js';
import {
    createLegacyPromptRecipeRepository,
    legacyPromptToRecipeDraft,
    legacyStorageKeys
} from './legacy_prompt_repository.js';
import { createLegacyRecipeComposerController } from './legacy_composer_controller.js';
import { createLegacyRecipesManagerController } from './legacy_manager_controller.js';
import { createLegacyRecipeTransferController } from './legacy_transfer_controller.js';
import { createLegacyRecipesArchiveIntegration } from './legacy_archive_integration.js';
import {
    legacyRecipesCapabilityStatus,
    removeLegacyRecipesLiveRegion,
    showLegacyRecipesNotice
} from './legacy_capability_status.js';
import {
    contextCapabilities,
    createLegacyGMStorage,
    defaultLegacyClock,
    defaultLegacyIdFactory,
    defaultLegacyTranslate,
    resolveLegacySession,
    toIsoTimestamp
} from './legacy_runtime.js';
function semanticFields(recipe) {
    return {
        title: recipe.title,
        description: recipe.description,
        variables: recipe.variables,
        steps: recipe.steps,
        permissions: recipe.permissions,
        provenance: recipe.provenance
    };
}
function legacyRecipeFieldsChanged(left, right) {
    return ['name', 'content', 'category', 'chainSteps', 'recipeVariables']
        .some(key => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
}
/**
 * Compatibility facade for the historical PromptVaultModule API.
 * Versioning stays in RecipeService; DOM/composer and file transfer live in controllers.
 */
export class LegacyPromptVaultFacade {
    constructor({
        document: documentRef = globalThis.document,
        window: windowRef = globalThis.window,
        adapter = GeminiAdapter,
        storage = createLegacyGMStorage(),
        logger = Logger,
        clock = defaultLegacyClock,
        t = defaultLegacyTranslate,
        idFactory = defaultLegacyIdFactory,
        Blob: BlobCtor = globalThis.Blob,
        URL: URLApi = globalThis.URL,
        FileReader: Reader = globalThis.FileReader,
        ui
    } = {}) {
        if (!adapter || typeof adapter !== 'object') throw new TypeError('Prompt Vault requires a Gemini adapter capability');
        if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
            throw new TypeError('Prompt Vault requires a storage capability');
        }
        if (typeof clock !== 'function' || typeof t !== 'function' || typeof idFactory !== 'function') {
            throw new TypeError('Prompt Vault clock, translator, and idFactory must be functions');
        }
        this.document = documentRef;
        this.window = windowRef;
        this.adapter = adapter;
        this.storage = storage;
        this.logger = logger;
        this.clock = clock;
        this.t = t;
        this.idFactory = idFactory;
        this.Blob = BlobCtor;
        this.URL = URLApi;
        this.FileReader = Reader;
        this.ui = ui;
        this.id = 'prompt-vault';
        this.name = t('提示词金库', 'Prompt Vault');
        this.description = t('版本化提示词配方与安全草稿插入', 'Versioned prompt recipes with safe draft insertion');
        this.iconId = 'gem';
        this.defaultEnabled = false;
        this.STORAGE_KEY = 'gemini_prompt_vault';
        this._prompts = [];
        this._packetSelected = new Set();
        this._lastDeletedPrompt = null;
        this._repositories = new Map();
        this._service = null;
        this._activeSessionId = null;
        this._started = false;
        this._capabilities = {};
        this._context = null;
        this._manager = null;
        this._composer = null;
        this._transfer = null;
    }

    configureCapabilities(capabilities = {}) {
        if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
            throw new TypeError('Prompt Vault capabilities must be an object');
        }
        this._capabilities = { ...this._capabilities, ...capabilities };
        return this;
    }

    async init(context = {}) {
        if (this._started) return this;
        this.document ||= context.document || globalThis.document;
        this.window ||= context.window || globalThis.window;
        this._requireDocument();
        this._context = context;
        this._adoptContextCapabilities(context);
        this._ensureControllers();
        const initialSession = resolveLegacySession(context.session);
        if (!this._service) {
            this._service = createRecipeService({
                repositoryFactory: ({ sessionId }) => this._repositoryFor(sessionId),
                clock: () => this._timestamp(),
                idFactory: () => String(this.idFactory())
            });
        }
        await this._service.start(initialSession);
        this._activeSessionId = initialSession;
        this._started = true;
        this._packetSelected = new Set();
        this._lastDeletedPrompt = null;
        await this._syncLegacyView();
        this.logger?.info?.('PromptVault Recipes facade initialized', { count: this._prompts.length });
        return this;
    }

    async destroy() {
        this.removeNativeUI('destroy');
        this._manager?.dispose('destroy');
        this._packetSelected.clear();
        this._lastDeletedPrompt = null;
        if (this._service && this._started) await this._service.stop();
        this._started = false;
        this._activeSessionId = null;
        return this;
    }

    async onUserChange(user, context = {}) {
        this._requireStarted();
        this._context = context;
        this._adoptContextCapabilities(context);
        const nextSession = resolveLegacySession(user);
        await this._service.switchSession(nextSession);
        this._activeSessionId = nextSession;
        this._packetSelected.clear();
        this._lastDeletedPrompt = null;
        await this._syncLegacyView();
        await this._refreshMountedPane();
        return nextSession;
    }

    get recipes() {
        return this._service?.api || null;
    }

    getCapabilityStatus() {
        return legacyRecipesCapabilityStatus(this._started, this._capabilities);
    }

    getPortableArchiveIntegration() {
        return createLegacyRecipesArchiveIntegration({
            isStarted: () => this._started,
            activeSessionId: () => this._activeSessionId,
            repository: this._started ? this._activeRepository() : null
        });
    }

    _timestamp() {
        return toIsoTimestamp(this.clock);
    }

    _adoptContextCapabilities(context) {
        for (const [name, value] of Object.entries(contextCapabilities(context))) {
            if (value !== undefined) this._capabilities[name] = value;
        }
    }

    _ensureControllers() {
        if (!this._manager) {
            this._manager = createLegacyRecipesManagerController({
                document: this.document,
                ui: this.ui,
                t: this.t,
                service: () => this._service,
                prompts: () => this._prompts,
                insertPrompt: (...args) => this.insertPrompt(...args),
                queuePrompt: (...args) => this.queuePrompt(...args),
                deletePrompt: id => this.deletePrompt(id),
                importFile: () => this._importPrompts(),
                exportFile: () => this._exportPrompts(),
                updatePrompt: (...args) => this.updatePrompt(...args),
                addPrompt: (...args) => this.addPrompt(...args)
            });
        }
        if (this._composer) return;
        const shared = {
            document: this.document,
            ui: this.ui,
            window: this.window,
            adapter: this.adapter,
            t: this.t,
            timestamp: () => this._timestamp(),
            service: () => this._service,
            capabilities: () => this._capabilities,
            prompts: () => this._prompts,
            packetSelection: () => this._packetSelected,
            mountedPane: () => this._manager.mountedPane,
            recipeIdForPrompt: id => this._recipeIdForPrompt(id),
            markUsed: id => this._markUsed(id),
            toast: message => this._toast(message),
            trackDialog: dialog => this._manager.trackDialog(dialog),
            releaseDialog: dialog => this._manager.releaseDialog(dialog)
        };
        this._composer = createLegacyRecipeComposerController(shared);
        this._transfer = createLegacyRecipeTransferController({
            ...shared,
            Blob: this.Blob,
            URL: this.URL,
            FileReader: this.FileReader,
            addPrompt: (...args) => this.addPrompt(...args),
            refresh: async () => {
                await this._syncLegacyView();
                await this._manager.refresh();
            }
        });
    }

    _repositoryFor(accountId) {
        if (!this._repositories.has(accountId)) {
            this._repositories.set(accountId, createLegacyPromptRecipeRepository({
                storage: this.storage,
                sessionId: accountId,
                clock: () => this._timestamp()
            }));
        }
        return this._repositories.get(accountId);
    }

    _activeRepository() {
        this._requireStarted();
        return this._repositoryFor(this._activeSessionId);
    }

    _requireStarted() {
        if (!this._started || !this._service) throw new Error('Prompt Vault Recipes facade is not started');
    }

    _requireDocument() {
        if (!this.document || typeof this.document.createElement !== 'function') {
            throw new TypeError('Prompt Vault requires a document');
        }
    }

    _getStorageKey() {
        const accountId = this._activeSessionId || resolveLegacySession(this._context?.session);
        return legacyStorageKeys(accountId).legacy;
    }

    async _save() {
        this._requireStarted();
        await this._activeRepository().flush();
        return this._syncLegacyView();
    }

    async _syncLegacyView() {
        this._prompts = await this._activeRepository().getLegacyPrompts();
        return this._prompts;
    }

    async _recipeIdForPrompt(promptId) {
        const recipes = await this._service.api.list();
        return recipes.find(recipe => recipe.id === promptId || recipe.provenance.sourceId === promptId)?.id || null;
    }

    async addPrompt(name, content, category, shortcut, chainSteps = [], recipeVariables = undefined) {
        this._requireStarted();
        const createdAt = this._timestamp();
        const legacyId = this._uniqueLegacyId();
        const prompt = normalizePrompt({
            id: legacyId,
            name: name || 'Untitled',
            content: content || '',
            category: category || 'General',
            shortcut,
            chainSteps,
            createdAt,
            updatedAt: createdAt
        }, this._prompts.length, { nowIso: createdAt });
        if (Array.isArray(recipeVariables)) prompt.recipeVariables = recipeVariables;
        if (!prompt.content) return null;
        const existingIds = new Set((await this._service.api.list()).map(recipe => recipe.id));
        const draft = legacyPromptToRecipeDraft(prompt, this._prompts.length, { nowIso: createdAt, usedIds: existingIds });
        const repository = this._activeRepository();
        await repository.setLegacyMetadata(draft.id, prompt);
        try {
            const recipe = await this._service.api.create(draft);
            await this._syncLegacyView();
            await this._refreshMountedPane();
            return recipe;
        } catch (error) {
            await repository.removeLegacyMetadata(draft.id);
            throw error;
        }
    }

    _uniqueLegacyId() {
        const base = String(this.idFactory());
        const used = new Set(this._prompts.map(prompt => prompt.id));
        let id = base;
        let suffix = 2;
        while (used.has(id)) id = `${base}_${suffix++}`;
        return id;
    }

    async updatePrompt(id, updates) {
        this._requireStarted();
        const prompt = this._prompts.find(item => item.id === id);
        if (!prompt) return null;
        const now = this._timestamp();
        const nextPrompt = normalizePrompt({ ...prompt, ...updates, id, updatedAt: now }, 0, { nowIso: now });
        const recipeVariables = updates.recipeVariables === undefined ? prompt.recipeVariables : updates.recipeVariables;
        if (Array.isArray(recipeVariables)) nextPrompt.recipeVariables = recipeVariables;
        const recipeId = await this._recipeIdForPrompt(id);
        const current = await this._service.api.get(recipeId);
        if (legacyRecipeFieldsChanged(prompt, nextPrompt)) {
            const draft = legacyPromptToRecipeDraft(nextPrompt, 0, { nowIso: now, usedIds: new Set() });
            draft.provenance = { ...draft.provenance, sourceId: id };
            await this._service.api.revise(recipeId, semanticFields(draft), { expectedVersion: current.version });
        }
        await this._activeRepository().setLegacyMetadata(recipeId, nextPrompt);
        await this._syncLegacyView();
        await this._refreshMountedPane();
        return this._service.api.get(recipeId);
    }

    async togglePromptFavorite(id) {
        const prompt = this._prompts.find(item => item.id === id);
        if (!prompt) return false;
        await this._updateLegacyMetadata(id, { favorite: !prompt.favorite, updatedAt: this._timestamp() });
        return true;
    }

    async _updateLegacyMetadata(promptId, patch) {
        const recipeId = await this._recipeIdForPrompt(promptId);
        if (!recipeId) return false;
        const prompt = this._prompts.find(item => item.id === promptId);
        await this._activeRepository().setLegacyMetadata(recipeId, { ...prompt, ...patch, id: promptId });
        await this._syncLegacyView();
        await this._refreshMountedPane();
        return true;
    }

    async deletePrompt(id) {
        const recipeId = await this._recipeIdForPrompt(id);
        if (!recipeId) return false;
        const repository = this._activeRepository();
        const envelope = await this._service.api.export([recipeId]);
        const metadata = repository.getLegacyMetadata(recipeId);
        await this._service.api.remove(recipeId);
        await repository.removeLegacyMetadata(recipeId);
        this._lastDeletedPrompt = { id, recipeId, envelope, metadata };
        this._packetSelected.delete(id);
        await this._syncLegacyView();
        await this._refreshMountedPane();
        this._toast(this.t('提示词已删除，可撤销', 'Prompt deleted. Undo is available'));
        return true;
    }

    async undoDeletePrompt() {
        if (!this._lastDeletedPrompt) return false;
        const deleted = this._lastDeletedPrompt;
        if (deleted.metadata) await this._activeRepository().setLegacyMetadata(deleted.recipeId, deleted.metadata.raw);
        await this._service.api.import(deleted.envelope, { strategy: 'error' });
        this._lastDeletedPrompt = null;
        await this._syncLegacyView();
        await this._refreshMountedPane();
        this._toast(this.t('已恢复提示词', 'Prompt restored'));
        return true;
    }

    async _markUsed(promptId) {
        const prompt = this._prompts.find(item => item.id === promptId);
        if (!prompt) return;
        await this._updateLegacyMetadata(promptId, {
            usedCount: prompt.usedCount + 1,
            lastUsedAt: this._timestamp()
        });
    }

    _toast(message) {
        return showLegacyRecipesNotice({
            document: this.document,
            notifications: this._capabilities.notifications,
            message
        });
    }

    _removeFallbackLiveRegion() {
        return removeLegacyRecipesLiveRegion(this.document);
    }

    async renderToDetailsPane(container) {
        this._requireStarted();
        return this._manager.render(container);
    }

    async _refreshMountedPane() {
        await this._manager?.refresh();
    }

    async _handleManagerAction(action) {
        return this._manager.handleAction(action);
    }

    showPromptEditor(existing) {
        return this._manager.showEditor(existing);
    }

    _trackDialog(dialog) {
        return this._manager.trackDialog(dialog);
    }

    _closeDialogs(reason) {
        return this._manager?.closeDialogs(reason);
    }

    _getTemplateVariables() { return this._composer.templateVariables(); }
    _insertTextIntoEditor(text) { return this._composer.insertText(text); }
    _clearEditor(editor) {
        if ('value' in editor) editor.value = '';
        else editor.textContent = '';
        return editor;
    }
    _getSelectedPromptPacketItems() { return this._composer.selectedPacketItems(); }
    _togglePromptPacketSelection(promptId) {
        if (this._packetSelected.has(promptId)) this._packetSelected.delete(promptId);
        else this._packetSelected.add(promptId);
        void this._refreshMountedPane();
        return this._packetSelected.has(promptId);
    }
    _insertSelectedPromptPacket() { return this._composer.insertSelectedPromptPacket(); }
    _bindSlashExpansion() { return this._composer.bindSlashExpansion(); }
    insertPrompt(content, promptId = null, suppliedValues = {}) {
        return this._composer.insertPrompt(content, promptId, suppliedValues);
    }
    queuePrompt(prompt, suppliedValues = {}) { return this._composer.queuePrompt(prompt, suppliedValues); }
    _queueCapability() { return this._capabilities.queue || null; }
    _confirmQueueHandoff(plan, promptId) { return this._composer.confirmQueueHandoff(plan, promptId); }
    injectNativeUI() { return this._composer.injectNativeUI(); }
    removeNativeUI(reason = 'native-ui-removed') {
        this._manager?.closeDialogs(reason);
        const result = this._composer?.removeNativeUI();
        this._removeFallbackLiveRegion();
        return result;
    }
    _toggleQuickMenu(anchor) { return this._composer.toggleQuickMenu(anchor); }

    exportData(ids) {
        this._requireStarted();
        return this._transfer.exportData(ids);
    }
    importData(input, options = {}) {
        this._requireStarted();
        return this._transfer.importData(input, options);
    }
    _exportPrompts() { return this._transfer.exportFile(); }
    _importPrompts() { return this._transfer.importFile(); }
    _appendPromptIORow(container) {
        return this._manager.appendImportExport(container);
    }

    get _mountedPane() { return this._manager?.mountedPane || null; }
    get _dialogs() { return this._manager?.dialogs || new Set(); }

    getOnboarding() {
        return {
            zh: {
                rant: '把重复提示词升级为可版本化、可审计的配方。',
                features: '支持变量、步骤、差异、来源、导入导出与显式队列权限预览。',
                guide: '选择配方只会插入草稿；加入队列前会显示权限预览，且不会立即发送。'
            },
            en: {
                rant: 'Turn repeated prompts into versioned, auditable recipes.',
                features: 'Variables, steps, diffs, provenance, import/export, and explicit queue permission previews.',
                guide: 'Choosing a recipe only inserts a draft. Queue handoff shows a permission preview and never sends immediately.'
            }
        };
    }
}

export function createLegacyPromptVaultFacade(options) {
    return new LegacyPromptVaultFacade(options);
}
