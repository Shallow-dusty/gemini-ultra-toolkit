import { TEMP_USER, TIMINGS } from '../constants.js';
import { Logger } from '../logger.js';
import { Core } from '../core.js';
import {
    LEGACY_FOLDERS_KEY
} from '../features/collections/legacy_repository.js';
import {
    createDefaultFoldersRuntime,
    legacyRulesToCollections
} from '../features/collections/folders_runtime.js';
import {
    createCollectionsPortableIntegrationManager,
    resolveCollectionsSessionAccess
} from '../features/collections/portable_integration.js';

export { createDefaultFoldersRuntime };

function defaultTranslate(zh, en) {
    return String(globalThis.navigator?.language ?? '').toLowerCase().startsWith('zh') ? zh : en;
}

// Local copy shim retained for v12 smoke contracts. It is deliberately not an
// import of the application NativeUI singleton; runtime UI is injected below.
const NativeUI = Object.freeze({ t: defaultTranslate });
const LEGACY_COPY = Object.freeze({
    title: NativeUI.t('文件夹', 'Folders'),
    search: NativeUI.t('搜索对话...', 'Search chats...'),
    add: NativeUI.t('+ 新建文件夹', '+ New Folder'),
    name: NativeUI.t('文件夹名称', 'Folder name'),
    rule: NativeUI.t('+ 添加规则', '+ Add Rule')
});

const EMPTY_LEGACY_DATA = Object.freeze({ folders: {}, chatToFolder: {}, folderOrder: [] });

export class FoldersCompatibilityModule {
    constructor({
        runtimeFactory = createDefaultFoldersRuntime,
        runtimeOptions = {},
        sessionProvider = () => Core.getCurrentUser(),
        logger = Logger
    } = {}) {
        if (typeof runtimeFactory !== 'function') throw new TypeError('Folders runtimeFactory must be a function');
        if (typeof sessionProvider !== 'function') throw new TypeError('Folders sessionProvider must be a function');
        this.id = 'folders';
        this.name = defaultTranslate('集合', 'Collections');
        this.description = defaultTranslate('嵌套集合、标签与规则整理', 'Nested collections, tags, and rule-based organization');
        this.iconId = 'folder';
        this.defaultEnabled = false;
        this.STORAGE_KEY = LEGACY_FOLDERS_KEY;
        this.FOLDER_COLORS = Object.freeze(['#8ab4f8', '#81c995', '#f28b82', '#fdd663', '#d7aefb', '#78d9ec', '#fcad70', '#c58af9']);
        this._runtimeFactory = runtimeFactory;
        this._runtimeOptions = runtimeOptions;
        this._sessionProvider = sessionProvider;
        this._logger = logger;
        this._runtime = null;
        this._batchSelected = new Set();
        this._portableArchive = createCollectionsPortableIntegrationManager({
            getRuntime: () => this._runtime,
            getClock: runtime => runtime.clock ?? this._runtimeOptions.clock ?? (() => new Date().toISOString())
        });
    }

    get data() {
        return this._runtime?.controller.getLegacyData() ?? structuredClone(EMPTY_LEGACY_DATA);
    }

    configure(options = {}) {
        if (this._runtime?.controller.active) throw new Error('Cannot configure Folders while Collections is active');
        this._runtimeOptions = { ...this._runtimeOptions, ...options };
        this._runtime = null;
        this._portableArchive.invalidate();
        return this;
    }

    async init(context = {}) {
        const session = context?.session ?? this._sessionProvider();
        const runtime = this._ensureRuntime();
        const access = resolveCollectionsSessionAccess(session, TEMP_USER);
        const started = await runtime.controller.start(access.controllerSession);
        this._portableArchive.bind(access, started);
        this._logger.info?.('Folders compatibility module initialized', { domain: 'collections' });
        return started;
    }

    async destroy() {
        if (!this._runtime) return false;
        try {
            const stopped = await this._runtime.controller.stop();
            this._logger.info?.('Folders compatibility module destroyed');
            return stopped;
        } finally {
            this._batchSelected.clear();
            this._portableArchive.invalidate();
        }
    }

    async onUserChange(user) {
        const runtime = this._ensureRuntime();
        const session = user || TEMP_USER;
        const access = resolveCollectionsSessionAccess(session, TEMP_USER);
        const changed = await runtime.controller.changeSession(access.controllerSession);
        this._portableArchive.bind(access, changed);
        return changed;
    }

    getPortableArchiveIntegration() {
        return this._portableArchive.getIntegration();
    }

    renderToDetailsPane(container) {
        return this._ensureRuntime().controller.mount(container);
    }

    loadData() {
        return this._ensureRuntime().controller.refresh();
    }

    saveData() {
        return this._ensureRuntime().service.flush();
    }

    async createFolder(name, color, parentId = null, tags = [], rules = []) {
        const created = await this._ensureRuntime().controller.submit(null, {
            name: String(name ?? '').trim() || 'New Folder',
            color: color || this.FOLDER_COLORS[0],
            parentId,
            tags,
            rules: legacyRulesToCollections(rules),
            ruleMode: 'any'
        });
        return created?.id ?? null;
    }

    renameFolder(folderId, newName) {
        return this._updateFolder(folderId, { name: newName });
    }

    deleteFolder(folderId) {
        return this._ensureRuntime().controller.remove(folderId);
    }

    toggleFolderCollapse(folderId) {
        const folder = this._collection(folderId);
        return folder ? this._ensureRuntime().controller.toggle(folderId, !folder.collapsed) : Promise.resolve(null);
    }

    setFolderColor(folderId, color) {
        return this._updateFolder(folderId, { color });
    }

    toggleFolderPin(folderId) {
        const folder = this._collection(folderId);
        return folder ? this._ensureRuntime().controller.pin(folderId, !folder.pinned) : Promise.resolve(null);
    }

    moveChatToFolder(chatId, folderId) {
        return this._ensureRuntime().controller.assignChat(chatId, folderId);
    }

    reorderFolder(draggedId, targetId, position) {
        return this._ensureRuntime().controller.move(draggedId, { targetId, position });
    }

    async batchMoveToFolder(targetFolderId) {
        const controller = this._ensureRuntime().controller;
        const ids = [...this._batchSelected];
        const count = await controller.assignChats(ids, targetFolderId);
        this._batchSelected.clear();
        return count;
    }

    undoLastFolderAction() {
        return this._ensureRuntime().controller.undo();
    }

    _exportFolders() {
        return this._ensureRuntime().controller.exportData();
    }

    _importFolders() {
        return this._ensureRuntime().controller.importData();
    }

    getFolderStats(folderId) {
        const snapshot = this._ensureRuntime().controller.getSnapshot();
        const chatCount = snapshot?.memberships.filter(entry => entry.collectionIds.includes(folderId)).length ?? 0;
        return { chatCount };
    }

    setFolderRules(folderId, rules) {
        return this._updateFolder(folderId, { rules: legacyRulesToCollections(rules) });
    }

    async autoClassify() {
        const preview = await this._ensureRuntime().controller.previewRules();
        return preview?.matchCount ?? null;
    }

    previewRules() {
        return this._ensureRuntime().controller.previewRules();
    }

    applyRules() {
        return this._ensureRuntime().controller.applyRulePreview();
    }

    clearRulePreview() {
        return this._ensureRuntime().controller.cancelRulePreview();
    }

    scanSidebarChats() {
        return this._ensureRuntime().adapter.scanSidebarChats();
    }

    markSidebarChats() {
        return this._ensureRuntime().controller.refresh();
    }

    _scheduleSidebarRefresh(delay = 0) {
        return this._ensureRuntime().controller.scheduleRefresh(delay);
    }

    startObserver() {
        return this._scheduleSidebarRefresh(TIMINGS.POLL_INTERVAL);
    }

    injectStyles() {
        return this._ensureRuntime().view.ensureStyles();
    }

    injectNativeUI() {
        return this.markSidebarChats();
    }

    removeNativeUI() {
        return this._ensureRuntime().view.clearSidebar();
    }

    _applyFilter(folderId) {
        return this._ensureRuntime().controller.setFilter(folderId);
    }

    _refreshFilterBar() {
        return this._ensureRuntime().controller.refresh();
    }

    showFolderModal(folderId) {
        const controller = this._ensureRuntime().controller;
        return folderId === null ? controller.cancelEdit() : controller.edit(folderId);
    }

    getOnboarding() {
        return {
            zh: {
                rant: '对话不该被困在单层列表里。Collections 用嵌套、标签和规则补足本地整理，同时保留 Gemini 官方 Notebooks 入口。',
                features: '支持嵌套集合、多重归属、标签、规则、拖放、搜索以及 JSON 导入导出。',
                guide: '1. 创建集合并选择父集合\n2. 拖动对话或使用规则归类\n3. 用侧栏筛选快速定位'
            },
            en: {
                rant: 'Chats should not be trapped in one flat list. Collections adds local nesting, tags, and rules while preserving Gemini-owned Notebooks.',
                features: 'Nested collections, multi-membership, tags, rules, drag and drop, search, and JSON transfer.',
                guide: '1. Create a collection and optionally choose a parent\n2. Drag chats or apply rules\n3. Filter quickly from the sidebar'
            },
            legacyCopy: LEGACY_COPY
        };
    }

    _collection(id) {
        return this._ensureRuntime().controller.getSnapshot()?.collections.find(collection => collection.id === id) ?? null;
    }

    _updateFolder(id, patch) {
        const folder = this._collection(id);
        if (!folder) return Promise.resolve(null);
        return this._ensureRuntime().controller.submit(id, {
            name: patch.name ?? folder.name,
            parentId: patch.parentId ?? folder.parentId,
            tags: patch.tags ?? folder.tags,
            color: patch.color ?? folder.color,
            rules: patch.rules ?? folder.rules,
            ruleMode: patch.ruleMode ?? folder.ruleMode
        });
    }

    _ensureRuntime() {
        if (!this._runtime) this._runtime = this._runtimeFactory(this._runtimeOptions);
        return this._runtime;
    }
}

export function createFoldersCompatibilityModule(options) {
    return new FoldersCompatibilityModule(options);
}

export const FoldersModule = createFoldersCompatibilityModule();
