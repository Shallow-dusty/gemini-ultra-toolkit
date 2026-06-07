import { TEMP_USER, TIMINGS } from '../constants.js';
import { Logger } from '../logger.js';
import { Core } from '../core.js';
import { NativeUI } from '../native_ui.js';
import { DOMWatcher } from '../dom_watcher.js';
import { PanelUI } from '../panel_ui.js';
import { CounterModule } from './counter.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { createIcon } from '../icons.js';
import {
    deleteFolderForUndo,
    moveChatsToFolderForUndo,
    restoreDeletedFolder,
    restoreFolderMove
} from '../../lib/folder_tools.js';

// Helper: validate href is safe (relative URL, not javascript: or data:)
function isValidChatHref(href) {
    if (!href || typeof href !== 'string') return false;
    const lower = href.toLowerCase().trim();
    return !lower.match(/^(javascript|data|vbscript):/);
}

// Return a safe hex color or the fallback. Used wherever stored folder color
// is spliced into a cssText template — storage tampering otherwise permits
// CSS injection even though the normal UI picker only writes valid hex.
function safeHexColor(c, fallback = '#8ab4f8') {
    return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;
}

// Reject regex sources likely to exhibit catastrophic backtracking. Not a
// complete decision procedure (impossible via syntax alone) but covers the
// well-known ReDoS families: nested quantifiers, and any alternation
// combined with a quantifier (e.g. `(a|aa)+`, `(foo|foobar)*`).
function isSafeRegex(src) {
    if (typeof src !== 'string') return false;
    if (src.length > 80) return false;
    // Nested quantifier: `...)+` or `...)*` followed by `+ * ? {`
    if (/([+*?]|\{\d+,?\d*\})\s*\)\s*[+*?{]/.test(src)) return false;
    // Alternation combined with a quantifier anywhere in the pattern.
    if (src.includes('|') && /[+*]|\{\d+,?\d*\}/.test(src)) return false;
    return true;
}

export const FoldersModule = {
    id: 'folders',
    name: NativeUI.t('对话文件夹', 'Chat Folders'),
    description: NativeUI.t('整理对话到自定义文件夹', 'Organize chats into custom folders'),
    iconId: 'folder',
    defaultEnabled: false,

    // --- \u6A21\u5757\u79C1\u6709\u5E38\u91CF ---
    STORAGE_KEY: 'gemini_folders_data',
    FOLDER_COLORS: ['#8ab4f8', '#81c995', '#f28b82', '#fdd663', '#d7aefb', '#78d9ec', '#fcad70', '#c58af9'],

    // --- \u6A21\u5757\u79C1\u6709\u72B6\u6001 ---
    data: {
        folders: {},        // { folderId: { name, color, collapsed } }
        chatToFolder: {},   // { chatId: folderId }
        folderOrder: []     // [folderId, folderId, ...]
    },
    observer: null,
    chatCache: [],          // \u7F13\u5B58\u626B\u63CF\u5230\u7684\u804A\u5929\u9879
    dragState: null,        // Chat drag state: { chatId, chatTitle }
    folderDragState: null,  // Folder reorder state: { folderId }
    uncategorizedCollapsed: false,
    _searchQuery: '',
    _batchMode: false,
    _batchSelected: new Set(),
    _activeFilter: null,
    _initTimeout: null,
    _lastFolderUndo: null,

    // --- \u751F\u547D\u5468\u671F ---
    init() {
        this.loadData();
        this._lastFolderUndo = null;
        this.injectStyles();
        this.startObserver();
        Logger.info('FoldersModule initialized', { mode: 'pure' });
    },

    destroy() {
        // 清理注入的样式
        if (this._styleEl) { this._styleEl.remove(); this._styleEl = null; }
        if (this._initTimeout) { clearTimeout(this._initTimeout); this._initTimeout = null; }
        if (this._searchDebounce) { clearTimeout(this._searchDebounce); this._searchDebounce = null; }

        DOMWatcher.unregister('folders-sidebar');
        // 清理拖拽状态
        this.dragState = null;
        this.folderDragState = null;
        this._lastFolderUndo = null;
        // \u79FB\u9664\u4FA7\u8FB9\u680F\u7684\u989C\u8272\u6807\u8BB0
        document.querySelectorAll('.gf-sidebar-dot').forEach(el => el.remove());
        // \u79FB\u9664\u6A21\u6001\u6846
        document.querySelectorAll('.gf-modal-overlay').forEach(el => el.remove());

        // \u6E05\u7406\u62D6\u62FD\u5C5E\u6027\u548C\u4E8B\u4EF6
        if (this.chatCache) {
            this.chatCache.forEach(chat => {
                if (chat.element) {
                    chat.element.removeAttribute('draggable');
                    chat.element.ondragstart = null;
                    chat.element.ondragend = null;
                    chat.element.style.opacity = '';
                }
            });
        }
        // \u6E05\u7406\u6240\u6709\u9AD8\u4EAE
        document.querySelectorAll('.gf-drop-highlight').forEach(el => {
            el.classList.remove('gf-drop-highlight');
        });

        this.removeNativeUI();
        Logger.info('FoldersModule destroyed');
    },

    onUserChange(user) {
        this.loadData();
        this._lastFolderUndo = null;
        this._activeFilter = null;
        // removeNativeUI() wipes the filter bar; without a follow-up re-inject
        // the bar stays gone until Gemini next mutates the sidebar, which
        // typically does not happen on profile switch (same DOM node persists).
        this.removeNativeUI();
        this.markSidebarChats();
        NativeUI.markDirty(this.id);
        NativeUI.tick();
        // \u5237\u65B0\u8BE6\u60C5\u9762\u677F
        if (CounterModule.state.isExpanded) {
            PanelUI.renderDetailsPane();
        }
    },

    // --- \u539F\u751F UI \u6CE8\u5165 ---
    injectNativeUI() {
        const FILTER_ID = 'gc-folder-filter';
        if (document.getElementById(FILTER_ID)) return;

        const sidebar = NativeUI.getSidebar();
        if (!sidebar) return;

        const filterBar = document.createElement('div');
        filterBar.id = FILTER_ID;
        filterBar.className = 'gc-filter-bar';

        this._renderFilterTabs(filterBar);
        if (!sidebar) return;
        const overflowC = GeminiAdapter.getSidebarOverflowContainer() || sidebar;
        overflowC.prepend(filterBar);
    },

    removeNativeUI() {
        NativeUI.remove('gc-folder-filter');
        // \u6062\u590D\u6240\u6709\u88AB\u9690\u85CF\u7684\u5BF9\u8BDD\u9879
        const chats = Core.scanSidebarChats();
        chats.forEach(chat => {
            if (chat.element) chat.element.style.display = '';
        });
        this._activeFilter = null;
    },

    _renderFilterTabs(container) {
        container.replaceChildren();
        const folders = this.data.folderOrder
            .map(id => ({ id, ...this.data.folders[id] }))
            .filter(f => f.name);

        // "\u5168\u90E8" \u6807\u7B7E
        const allTab = this._createFilterTab('\u5168\u90E8', null, '#8ab4f8');
        container.appendChild(allTab);

        // \u5404\u6587\u4EF6\u5939\u6807\u7B7E
        folders.forEach(folder => {
            const tab = this._createFilterTab(folder.name, folder.id, folder.color);
            container.appendChild(tab);
        });
    },

    _createFilterTab(label, folderId, color) {
        const tab = document.createElement('button');
        const isActive = this._activeFilter === folderId;
        tab.className = 'gc-filter-tab' + (isActive ? ' active' : '');
        const c = color || 'var(--accent, #8ab4f8)';
        if (isActive) {
            tab.style.background = c + '12';
            tab.style.color = c;
        }
        tab.textContent = label;
        tab.onclick = (e) => {
            e.stopPropagation();
            this._activeFilter = folderId;
            this._applyFilter(folderId);
            // \u5237\u65B0\u6807\u7B7E\u680F\u9AD8\u4EAE
            const bar = document.getElementById('gc-folder-filter');
            if (bar) this._renderFilterTabs(bar);
        };
        return tab;
    },

    _applyFilter(folderId) {
        const chats = Core.scanSidebarChats();
        chats.forEach(chat => {
            if (!folderId) {
                chat.element.style.display = '';
            } else {
                const assignment = this.data.chatToFolder[chat.id];
                chat.element.style.display = (assignment === folderId) ? '' : 'none';
            }
        });
    },

    _refreshFilterBar() {
        const bar = document.getElementById('gc-folder-filter');
        if (bar) this._renderFilterTabs(bar);
    },

    // --- \u6570\u636E\u7BA1\u7406 ---
    loadData() {
        const user = Core.getCurrentUser();
        const key = user && user !== TEMP_USER ? `${this.STORAGE_KEY}_${user}` : this.STORAGE_KEY;
        let saved;
        try { saved = GM_getValue(key, null); }
        catch (e) { saved = null; }
        if (saved) {
            this.data = {
                folders: saved.folders || {},
                chatToFolder: saved.chatToFolder || {},
                folderOrder: saved.folderOrder || Object.keys(saved.folders || {})
            };
        } else {
            this.data = { folders: {}, chatToFolder: {}, folderOrder: [] };
        }
    },

    saveData() {
        const user = Core.getCurrentUser();
        const key = user && user !== TEMP_USER ? `${this.STORAGE_KEY}_${user}` : this.STORAGE_KEY;
        try { GM_setValue(key, this.data); }
        catch (e) { /* silent */ }
    },

    // --- \u6587\u4EF6\u5939 CRUD ---
    createFolder(name, color) {
        const id = 'folder_' + Date.now();
        this.data.folders[id] = {
            name: name || 'New Folder',
            color: color || this.FOLDER_COLORS[Object.keys(this.data.folders).length % this.FOLDER_COLORS.length],
            collapsed: false,
            rules: []  // Auto-classification rules: [{ type: 'keyword', value: 'string' }]
        };
        this.data.folderOrder.push(id);
        this.saveData();
        this.markSidebarChats();
        this._refreshFilterBar();
        PanelUI.renderDetailsPane();
        return id;
    },

    renameFolder(folderId, newName) {
        if (this.data.folders[folderId]) {
            this.data.folders[folderId].name = newName;
            this.saveData();
            this._refreshFilterBar();
            PanelUI.renderDetailsPane();
        }
    },

    deleteFolder(folderId) {
        const result = deleteFolderForUndo(this.data, folderId, { nowIso: new Date().toISOString() });
        if (!result.undo) return;
        this.data = result.data;
        this._lastFolderUndo = result.undo;
        if (this._activeFilter === result.undo.folderId) this._activeFilter = null;
        this._persistFolderChanges();
        NativeUI.showToast(NativeUI.t('文件夹已删除，可撤销', 'Folder deleted. Undo is available'));
    },

    toggleFolderCollapse(folderId) {
        if (this.data.folders[folderId]) {
            this.data.folders[folderId].collapsed = !this.data.folders[folderId].collapsed;
            this.saveData();
            PanelUI.renderDetailsPane();
        }
    },

    setFolderColor(folderId, color) {
        if (this.data.folders[folderId]) {
            this.data.folders[folderId].color = color;
            this.saveData();
            this.markSidebarChats();
            this._refreshFilterBar();
            PanelUI.renderDetailsPane();
        }
    },

    toggleFolderPin(folderId) {
        if (this.data.folders[folderId]) {
            this.data.folders[folderId].pinned = !this.data.folders[folderId].pinned;
            this.saveData();
            PanelUI.renderDetailsPane();
        }
    },

    moveChatToFolder(chatId, folderId) {
        const result = moveChatsToFolderForUndo(this.data, [chatId], folderId, { nowIso: new Date().toISOString() });
        if (!result.undo) return;
        this.data = result.data;
        this._lastFolderUndo = result.undo;
        this._persistFolderChanges();
        NativeUI.showToast(NativeUI.t('对话已移动，可撤销', 'Chat moved. Undo is available'));
    },

    reorderFolder(draggedId, targetId, position) {
        const order = this.data.folderOrder.filter(id => id !== draggedId);
        const targetIdx = order.indexOf(targetId);
        if (targetIdx === -1) return;
        const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
        order.splice(insertIdx, 0, draggedId);
        this.data.folderOrder = order;
        this.saveData();
        PanelUI.renderDetailsPane();
    },

    batchMoveToFolder(targetFolderId) {
        const result = moveChatsToFolderForUndo(this.data, [...this._batchSelected], targetFolderId, { nowIso: new Date().toISOString() });
        this.data = result.data;
        if (result.undo) {
            this._lastFolderUndo = result.undo;
            NativeUI.showToast(NativeUI.t('批量移动已完成，可撤销', 'Batch move complete. Undo is available'));
        }
        this._batchSelected.clear();
        this._batchMode = false;
        this._persistFolderChanges();
    },

    undoLastFolderAction() {
        if (!this._lastFolderUndo) return;
        const undo = this._lastFolderUndo;
        const result = undo.type === 'folder-delete'
            ? restoreDeletedFolder(this.data, undo)
            : restoreFolderMove(this.data, undo);

        this._lastFolderUndo = null;
        if (!result.restored) {
            PanelUI.renderDetailsPane();
            NativeUI.showToast(NativeUI.t('无法撤销最近的文件夹操作', 'Unable to undo the latest folder change'));
            return;
        }

        this.data = result.data;
        this._persistFolderChanges();
        NativeUI.showToast(NativeUI.t('已撤销文件夹操作', 'Folder change undone'));
    },

    _persistFolderChanges() {
        this.saveData();
        this.markSidebarChats();
        this._applyFilter(this._activeFilter);
        this._refreshFilterBar();
        PanelUI.renderDetailsPane();
    },

    getFolderStats(folderId) {
        const chatIds = Object.entries(this.data.chatToFolder)
            .filter(([, fid]) => fid === folderId)
            .map(([cid]) => cid);
        return { chatCount: chatIds.length };
    },

    setFolderRules(folderId, rules) {
        if (this.data.folders[folderId]) {
            this.data.folders[folderId].rules = rules;
            this.saveData();
        }
    },

    autoClassify() {
        let classified = 0;
        this.scanSidebarChats();
        this.chatCache.forEach(chat => {
            // Skip already assigned
            if (this.data.chatToFolder[chat.id]) return;
            const title = chat.title.toLowerCase();
            for (const folderId of this.data.folderOrder) {
                const folder = this.data.folders[folderId];
                if (!folder || !folder.rules || folder.rules.length === 0) continue;
                const matched = folder.rules.some(rule => {
                    if (rule.type === 'keyword' && rule.value) {
                        return title.includes(rule.value.toLowerCase());
                    }
                    if (rule.type === 'regex' && rule.value) {
                        try {
                            if (!isSafeRegex(rule.value)) return false;
                            const regex = new RegExp(rule.value, 'i');
                            return regex.test(chat.title.substring(0, 200));
                        }
                        catch { return false; }
                    }
                    return false;
                });
                if (matched) {
                    this.data.chatToFolder[chat.id] = folderId;
                    classified++;
                    break; // First match wins
                }
            }
        });
        if (classified > 0) {
            this.saveData();
            this.markSidebarChats();
            PanelUI.renderDetailsPane();
            Logger.info(`Auto-classified ${classified} chats`);
        }
        return classified;
    },

    // --- \u4FA7\u8FB9\u680F\u626B\u63CF ---
    scanSidebarChats() {
        this.chatCache = Core.scanSidebarChats();
        return this.chatCache;
    },

    // --- \u4EC5\u5728\u4FA7\u8FB9\u680F\u804A\u5929\u9879\u4E0A\u6DFB\u52A0\u989C\u8272\u6807\u8BB0 (6px dot) ---
    markSidebarChats() {
        // \u79FB\u9664\u65E7\u6807\u8BB0
        document.querySelectorAll('.gf-sidebar-dot').forEach(el => el.remove());

        // \u626B\u63CF\u804A\u5929\u5217\u8868
        const chats = this.scanSidebarChats();

        chats.forEach(chat => {
            const folderId = this.data.chatToFolder[chat.id];
            if (folderId && this.data.folders[folderId]) {
                const folder = this.data.folders[folderId];
                // \u521B\u5EFA\u5C0F\u5706\u70B9
                const dot = document.createElement('span');
                dot.className = 'gf-sidebar-dot';
                dot.style.cssText = `
                    display: inline-block;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: ${safeHexColor(folder.color)};
                    margin-right: 6px;
                    flex-shrink: 0;
                    vertical-align: middle;
                `;
                dot.title = folder.name;
                // \u63D2\u5165\u5230\u94FE\u63A5\u5F00\u5934
                chat.element.insertBefore(dot, chat.element.firstChild);
            }
        });

        // \u8BBE\u7F6E\u62D6\u62FD
        this.enableSidebarDrag();
    },

    // --- \u5728\u4FA7\u8FB9\u680F\u542F\u7528\u62D6\u62FD\uFF08\u62D6\u5230\u6211\u4EEC\u7684\u9762\u677F\uFF09 ---
    enableSidebarDrag() {
        const chats = this.chatCache;
        chats.forEach(chat => {
            chat.element.setAttribute('draggable', 'true');
            chat.element.ondragstart = (e) => {
                this.dragState = { chatId: chat.id, chatTitle: chat.title };
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', chat.id);
                // \u89C6\u89C9\u53CD\u9988
                chat.element.style.opacity = '0.5';
            };
            chat.element.ondragend = () => {
                chat.element.style.opacity = '';
                this.dragState = null;
                // \u79FB\u9664\u6240\u6709\u9AD8\u4EAE
                document.querySelectorAll('.gf-drop-highlight').forEach(el => {
                    el.classList.remove('gf-drop-highlight');
                });
            };
        });
    },

    // --- DOM 观察 ---
    startObserver() {
        // 延迟初始化
        if (this._initTimeout) clearTimeout(this._initTimeout);
        this._initTimeout = setTimeout(() => this.markSidebarChats(), TIMINGS.POLL_INTERVAL);

        // 通过 DOMWatcher 监听侧边栏 DOM 变化
        DOMWatcher.register('folders-sidebar', {
            match: (m) => GeminiAdapter.matchesFoldersSidebarMutation(m),
            callback: () => this.markSidebarChats(),
            debounce: TIMINGS.OBSERVER_DEBOUNCE
        });
    },

    _styleEl: null,

    // --- \u6CE8\u5165\u6837\u5F0F ---
    injectStyles() {
        if (this._styleEl) return;
        this._styleEl = GM_addStyle(`
            /* Folder Modal */
            .gf-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: var(--overlay-tint, rgba(0, 0, 0, 0.6));
                z-index: 2147483646;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .gf-modal {
                width: 280px;
                background: var(--bg, #202124);
                border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
                border-radius: 16px;
                padding: 20px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            }
            .gf-modal-title {
                font-size: 16px;
                font-weight: 500;
                color: var(--text-main, #e8eaed);
                margin-bottom: 16px;
            }
            .gf-modal-input {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
                border-radius: 8px;
                background: var(--input-bg, rgba(255, 255, 255, 0.05));
                color: var(--text-main, #e8eaed);
                font-size: 14px;
                margin-bottom: 12px;
                box-sizing: border-box;
            }
            .gf-modal-input:focus {
                outline: none;
                border-color: var(--accent, #8ab4f8);
            }
            .gf-modal-colors {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 16px;
            }
            .gf-color-option {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                cursor: pointer;
                border: 2px solid transparent;
                transition: transform 0.2s, border-color 0.2s;
            }
            .gf-color-option:hover {
                transform: scale(1.1);
            }
            .gf-color-option.selected {
                border-color: #fff;
            }
            .gf-modal-actions {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            .gf-modal-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 8px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .gf-modal-btn.primary {
                background: var(--accent, #8ab4f8);
                color: #000;
            }
            .gf-modal-btn.secondary {
                background: var(--btn-bg, rgba(255, 255, 255, 0.1));
                color: var(--text-main, #e8eaed);
            }
            .gf-modal-btn.danger {
                background: rgba(242, 139, 130, 0.2);
                color: #f28b82;
            }
            .gf-modal-btn:hover {
                filter: brightness(1.1);
            }

            /* Folder row in details pane */
            .gf-folder-row {
                display: flex;
                align-items: center;
                padding: 6px 8px;
                margin: 2px 0;
                border-radius: 6px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .gf-folder-row:hover {
                background: var(--row-hover, rgba(255, 255, 255, 0.08));
            }
            .gf-folder-row.drop-active {
                background: rgba(138, 180, 248, 0.2) !important;
                outline: 2px dashed rgba(138, 180, 248, 0.5);
            }
            .gf-folder-dot {
                width: 10px;
                height: 10px;
                border-radius: 3px;
                margin-right: 8px;
                flex-shrink: 0;
            }
            .gf-folder-label {
                flex: 1;
                font-size: 11px;
                color: var(--text-main, #e8eaed);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .gf-folder-badge {
                font-size: 9px;
                color: var(--text-sub, #9aa0a6);
                margin-left: 4px;
            }
            .gf-folder-toggle {
                font-size: 8px;
                color: var(--text-sub, #9aa0a6);
                margin-left: 4px;
                transition: transform 0.2s;
            }
            .gf-folder-row.collapsed .gf-folder-toggle {
                transform: rotate(-90deg);
            }
            .gf-folder-actions {
                display: none;
                gap: 2px;
                margin-left: 4px;
            }
            .gf-folder-row:hover .gf-folder-actions {
                display: flex;
            }
            .gf-folder-action {
                font-size: 10px;
                padding: 2px;
                cursor: pointer;
                opacity: 0.6;
            }
            .gf-folder-action:hover {
                opacity: 1;
            }

            /* Chat item in folder */
            .gf-chat-row {
                display: flex;
                align-items: center;
                padding: 4px 8px 4px 20px;
                margin: 1px 0;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.2s;
                font-size: 10px;
                color: var(--text-sub, #9aa0a6);
            }
            .gf-chat-row:hover {
                background: var(--row-hover, rgba(255, 255, 255, 0.08));
                color: var(--text-main, #e8eaed);
            }
            .gf-chat-title {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .gf-chat-remove {
                font-size: 9px;
                opacity: 0;
                cursor: pointer;
                padding: 2px;
            }
            .gf-chat-row:hover .gf-chat-remove {
                opacity: 0.6;
            }
            .gf-chat-remove:hover {
                opacity: 1;
            }

            /* Add folder button in details */
            .gf-add-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 6px;
                margin-top: 4px;
                border: 1px dashed var(--divider, rgba(255, 255, 255, 0.15));
                border-radius: 6px;
                background: transparent;
                color: var(--text-sub, #9aa0a6);
                font-size: 10px;
                cursor: pointer;
                transition: all 0.2s;
                width: 100%;
            }
            .gf-add-btn:hover {
                background: var(--input-bg, rgba(255, 255, 255, 0.05));
                border-color: var(--border, rgba(255, 255, 255, 0.25));
                color: var(--text-main, #e8eaed);
            }

            /* Drop highlight for folder rows */
            .gf-drop-highlight {
                background: rgba(138, 180, 248, 0.15) !important;
            }

            /* Folder drag reorder */
            .gf-folder-row[draggable="true"] {
                cursor: grab;
            }
            .gf-folder-row.dragging {
                opacity: 0.4;
            }
            .gf-folder-row.drag-above {
                border-top: 2px solid var(--accent, #8ab4f8);
            }
            .gf-folder-row.drag-below {
                border-bottom: 2px solid var(--accent, #8ab4f8);
            }

            /* Uncategorized section */
            .gf-uncategorized-header {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 8px;
                margin-top: 6px;
                font-size: 10px;
                color: var(--text-sub, #9aa0a6);
                opacity: 0.7;
                cursor: pointer;
                border-radius: 6px;
                transition: background 0.2s;
            }
            .gf-uncategorized-header:hover {
                background: var(--row-hover, rgba(255, 255, 255, 0.08));
                opacity: 1;
            }

            /* Batch mode */
            .gf-batch-bar {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                margin-bottom: 4px;
                font-size: 10px;
                color: var(--text-sub, #9aa0a6);
            }
            .gf-batch-bar button {
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 4px;
                border: 1px solid var(--divider, rgba(255,255,255,0.1));
                background: var(--btn-bg, rgba(255,255,255,0.05));
                color: var(--text-sub, #9aa0a6);
                cursor: pointer;
            }
            .gf-batch-bar button:hover {
                color: var(--text-main, #fff);
            }
            .gf-chat-row.batch-selected {
                background: rgba(138, 180, 248, 0.15);
            }
            .gf-batch-check {
                width: 12px; height: 12px;
                border: 1px solid var(--text-sub, #9aa0a6);
                border-radius: 3px;
                margin-right: 6px;
                flex-shrink: 0;
                cursor: pointer;
            }
            .gf-batch-check.checked {
                background: var(--accent, #8ab4f8);
                border-color: var(--accent, #8ab4f8);
            }
        `);
    },

    getOnboarding() {
        return {
            zh: {
                rant: '\u4F60\u7684 Gemini \u4FA7\u8FB9\u680F\u73B0\u5728\u662F\u4EC0\u4E48\u6837\uFF1F200 \u4E2A\u65E0\u5E8F\u5BF9\u8BDD\uFF0C\u6309\u65F6\u95F4\u6392\u5217\uFF0C\u8FDE\u641C\u7D22\u90FD\u6CA1\u6709\u3002\u60F3\u627E\u4E0A\u5468\u90A3\u4E2A\u5173\u4E8E Kubernetes \u90E8\u7F72\u7684\u5BF9\u8BDD\uFF1F\u795D\u4F60\u597D\u8FD0\uFF0C\u6162\u6162\u7FFB\u5427\u3002Google Keep \u6709\u6807\u7B7E\uFF0CGmail \u6709\u6807\u7B7E\uFF0CGoogle Drive \u6709\u6587\u4EF6\u5939\uFF0C\u4F46 Gemini \u5C31\u662F\u6CA1\u6709\u3002\u4E00\u81F4\u6027\uFF1F\u4E0D\u5B58\u5728\u7684\u3002',
                features: '\u4FA7\u8FB9\u680F\u9876\u90E8\u6DFB\u52A0\u6587\u4EF6\u5939\u7B5B\u9009\u680F\uFF0C\u652F\u6301\u6309\u5206\u7EC4\u8FC7\u6EE4\u5BF9\u8BDD\u3002\u5BF9\u8BDD\u9879\u663E\u793A\u5F69\u8272\u6587\u4EF6\u5939\u6807\u8BB0\uFF0C\u652F\u6301\u62D6\u62FD\u5206\u914D\u3002',
                guide: '1. \u5728\u6D6E\u52A8\u9762\u677F\u7684 \uD83D\uDCC1 \u6807\u7B7E\u9875\u521B\u5EFA\u6587\u4EF6\u5939\n2. \u62D6\u62FD\u5BF9\u8BDD\u5230\u6587\u4EF6\u5939\n3. \u70B9\u51FB\u4FA7\u8FB9\u680F\u9876\u90E8\u7684\u6587\u4EF6\u5939\u6807\u7B7E\u7B5B\u9009'
            },
            en: {
                rant: "Your Gemini sidebar right now: 200 unorganized conversations sorted by time with no search. Want to find last week's Kubernetes deployment chat? Good luck scrolling. Google Keep has labels, Gmail has labels, Drive has folders, but Gemini has nothing. Consistency? Never heard of it.",
                features: 'Adds a folder filter bar at the top of the sidebar. Filter conversations by group. Chat items show colored folder dots, with drag-and-drop assignment.',
                guide: '1. Create folders in the \uD83D\uDCC1 tab of the floating panel\n2. Drag conversations into folders\n3. Click folder tabs at the top of the sidebar to filter'
            }
        };
    },

    // --- \u6E32\u67D3\u5230\u8BE6\u60C5\u9762\u677F ---
    renderToDetailsPane(container) {
        // Section Title
        const title = document.createElement('div');
        title.className = 'section-title';
        title.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
        const titleText = document.createElement('span');
        titleText.textContent = 'Folders';
        const batchToggle = document.createElement('span');
        batchToggle.style.cssText = 'font-size: 9px; cursor: pointer; opacity: 0.6;';
        batchToggle.textContent = this._batchMode ? '\u2715 Cancel' : '\u2611 Select';
        batchToggle.onclick = (e) => {
            e.stopPropagation();
            this._batchMode = !this._batchMode;
            this._batchSelected.clear();
            PanelUI.renderDetailsPane();
        };
        title.appendChild(titleText);
        title.appendChild(batchToggle);
        container.appendChild(title);

        if (this._lastFolderUndo) {
            const undoRow = document.createElement('div');
            undoRow.className = 'detail-row';
            undoRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
            const label = document.createElement('span');
            label.style.cssText = 'flex:1;font-size:10px;color:var(--text-sub);';
            label.textContent = this._lastFolderUndo.type === 'folder-delete'
                ? NativeUI.t('文件夹删除可撤销', 'Folder delete can be undone')
                : NativeUI.t('文件夹移动可撤销', 'Folder move can be undone');
            const undoBtn = document.createElement('button');
            undoBtn.className = 'settings-btn';
            undoBtn.style.cssText = 'width:auto;margin-top:0;padding:3px 8px;font-size:10px;';
            undoBtn.textContent = NativeUI.t('撤销', 'Undo');
            undoBtn.onclick = (e) => {
                e.stopPropagation();
                this.undoLastFolderAction();
            };
            undoRow.appendChild(label);
            undoRow.appendChild(undoBtn);
            container.appendChild(undoRow);
        }

        // Batch action bar
        if (this._batchMode && this._batchSelected.size > 0) {
            const batchBar = document.createElement('div');
            batchBar.className = 'gf-batch-bar';
            const countLabel = document.createElement('span');
            countLabel.textContent = `${this._batchSelected.size} selected`;
            batchBar.appendChild(countLabel);

            // Move to folder buttons
            this.data.folderOrder.forEach(fid => {
                const f = this.data.folders[fid];
                if (!f) return;
                const btn = document.createElement('button');
                btn.textContent = `\u2192 ${f.name}`;
                btn.onclick = () => this.batchMoveToFolder(fid);
                batchBar.appendChild(btn);
            });
            const unassignBtn = document.createElement('button');
            unassignBtn.textContent = '\u2192 None';
            unassignBtn.onclick = () => this.batchMoveToFolder(null);
            batchBar.appendChild(unassignBtn);
            container.appendChild(batchBar);
        }

        // Search bar
        const searchWrap = document.createElement('div');
        searchWrap.style.cssText = 'margin-bottom: 6px;';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search chats...';
        searchInput.style.cssText = 'width: 100%; padding: 4px 8px; font-size: 10px; border-radius: 6px; border: 1px solid var(--divider, rgba(255,255,255,0.1)); background: var(--input-bg, rgba(255,255,255,0.05)); color: var(--text-main, #fff); box-sizing: border-box;';
        searchInput.value = this._searchQuery || '';
        searchInput.oninput = (e) => {
            this._searchQuery = e.target.value;
            if (this._searchDebounce) clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => PanelUI.renderDetailsPane(), 150);
        };
        searchWrap.appendChild(searchInput);
        container.appendChild(searchWrap);

        const query = (this._searchQuery || '').toLowerCase().trim();

        // \u626B\u63CF\u5F53\u524D\u804A\u5929
        this.scanSidebarChats();

        // \u6309\u6587\u4EF6\u5939\u5206\u7EC4
        const chatsByFolder = {};
        this.chatCache.forEach(chat => {
            const fid = this.data.chatToFolder[chat.id];
            if (fid && this.data.folders[fid]) {
                if (!chatsByFolder[fid]) chatsByFolder[fid] = [];
                chatsByFolder[fid].push(chat);
            }
        });

        // Sort folder order: pinned first, then original order
        const sortedFolderOrder = [...this.data.folderOrder].sort((a, b) => {
            const aPinned = this.data.folders[a]?.pinned ? 1 : 0;
            const bPinned = this.data.folders[b]?.pinned ? 1 : 0;
            return bPinned - aPinned;
        });

        // \u6E32\u67D3\u6587\u4EF6\u5939\u5217\u8868
        if (this.data.folderOrder.length === 0) {
            const hint = document.createElement('div');
            hint.style.cssText = 'font-size: 10px; color: var(--text-sub); opacity: 0.6; padding: 4px 8px;';
            hint.textContent = 'Drag chats here to organize';
            container.appendChild(hint);
        } else {
            sortedFolderOrder.forEach(folderId => {
                const folder = this.data.folders[folderId];
                if (!folder) return;

                let chats = chatsByFolder[folderId] || [];
                // Apply search filter
                if (query) {
                    chats = chats.filter(c => c.title.toLowerCase().includes(query));
                    // Also match folder name
                    if (!folder.name.toLowerCase().includes(query) && chats.length === 0) return;
                }
                const folderEl = this.createFolderRow(folderId, folder, chats);
                container.appendChild(folderEl);
            });
        }

        // Uncategorized chats section
        const assignedChatIds = new Set(
            Object.entries(this.data.chatToFolder)
                .filter(([, fid]) => this.data.folders[fid])
                .map(([cid]) => cid)
        );
        let uncategorized = this.chatCache.filter(chat => !assignedChatIds.has(chat.id));
        if (query) {
            uncategorized = uncategorized.filter(c => c.title.toLowerCase().includes(query));
        }

        if (uncategorized.length > 0) {
            const uncatHeader = document.createElement('div');
            uncatHeader.className = 'gf-uncategorized-header';
            const uncatToggle = document.createElement('span');
            uncatToggle.textContent = this.uncategorizedCollapsed ? '\u25B6' : '\u25BC';
            uncatToggle.style.fontSize = '8px';
            const uncatLabel = document.createElement('span');
            uncatLabel.textContent = `Uncategorized (${uncategorized.length})`;
            uncatHeader.appendChild(uncatToggle);
            uncatHeader.appendChild(uncatLabel);
            uncatHeader.onclick = (e) => {
                e.stopPropagation();
                this.uncategorizedCollapsed = !this.uncategorizedCollapsed;
                PanelUI.renderDetailsPane();
            };
            container.appendChild(uncatHeader);

            if (!this.uncategorizedCollapsed) {
                uncategorized.forEach(chat => {
                    const chatRow = document.createElement('div');
                    chatRow.className = 'gf-chat-row' + (this._batchSelected.has(chat.id) ? ' batch-selected' : '');

                    if (this._batchMode) {
                        const check = document.createElement('div');
                        check.className = 'gf-batch-check' + (this._batchSelected.has(chat.id) ? ' checked' : '');
                        check.onclick = (e) => {
                            e.stopPropagation();
                            if (this._batchSelected.has(chat.id)) {
                                this._batchSelected.delete(chat.id);
                            } else {
                                this._batchSelected.add(chat.id);
                            }
                            PanelUI.renderDetailsPane();
                        };
                        chatRow.appendChild(check);
                    }

                    if (!this._batchMode) {
                        chatRow.setAttribute('draggable', 'true');
                        chatRow.ondragstart = (e) => {
                            this.dragState = { chatId: chat.id, chatTitle: chat.title };
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', chat.id);
                            chatRow.style.opacity = '0.5';
                        };
                        chatRow.ondragend = () => {
                            chatRow.style.opacity = '';
                            this.dragState = null;
                        };
                    }

                    const chatTitle = document.createElement('span');
                    chatTitle.className = 'gf-chat-title';
                    chatTitle.textContent = chat.title.length > 20 ? chat.title.slice(0, 20) + '...' : chat.title;
                    chatTitle.title = chat.title;
                    chatRow.appendChild(chatTitle);

                    chatRow.onclick = (e) => {
                        e.stopPropagation();
                        if (this._batchMode) {
                            if (this._batchSelected.has(chat.id)) {
                                this._batchSelected.delete(chat.id);
                            } else {
                                this._batchSelected.add(chat.id);
                            }
                            PanelUI.renderDetailsPane();
                            return;
                        }
                        if (chat.element && chat.element.click) {
                            chat.element.click();
                        } else if (isValidChatHref(chat.href)) {
                            window.location.href = chat.href;
                        }
                    };

                    container.appendChild(chatRow);
                });
            }
        }

        // Add folder button
        const addBtn = document.createElement('button');
        addBtn.className = 'gf-add-btn';
        addBtn.textContent = '+ New Folder';
        addBtn.onclick = (e) => {
            e.stopPropagation();
            this.showFolderModal(null, 'Create Folder', '', this.FOLDER_COLORS[0]);
        };
        container.appendChild(addBtn);

        // Auto-classify button (only if rules exist)
        const hasRules = this.data.folderOrder.some(fid => {
            const f = this.data.folders[fid];
            return f && f.rules && f.rules.length > 0;
        });
        if (hasRules) {
            const classifyBtn = document.createElement('button');
            classifyBtn.className = 'gf-add-btn';
            classifyBtn.style.borderStyle = 'solid';
            classifyBtn.textContent = '';
            classifyBtn.appendChild(createIcon('bot', 12));
            classifyBtn.appendChild(document.createTextNode(' Auto Classify'));
            classifyBtn.onclick = (e) => {
                e.stopPropagation();
                const count = this.autoClassify();
                classifyBtn.textContent = count > 0 ? `\u2713 Classified ${count} chats` : '\u2713 Nothing to classify';
                setTimeout(() => {
                    classifyBtn.textContent = '';
                    classifyBtn.appendChild(createIcon('bot', 12));
                    classifyBtn.appendChild(document.createTextNode(' Auto Classify'));
                }, 2000);
            };
            container.appendChild(classifyBtn);
        }
    },

    createFolderRow(folderId, folder, chats) {
        const wrapper = document.createElement('div');
        wrapper.className = 'gf-folder-wrapper';

        // Folder header row
        const row = document.createElement('div');
        row.className = `gf-folder-row ${folder.collapsed ? 'collapsed' : ''}`;
        row.setAttribute('draggable', 'true');
        row.dataset.folderId = folderId;

        // Folder drag reorder
        row.ondragstart = (e) => {
            // Only start folder drag if not dragging a chat
            if (this.dragState) return;
            this.folderDragState = { folderId };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'folder:' + folderId);
            row.classList.add('dragging');
        };
        row.ondragend = () => {
            row.classList.remove('dragging');
            this.folderDragState = null;
            document.querySelectorAll('.gf-folder-row').forEach(el => {
                el.classList.remove('drag-above', 'drag-below');
            });
        };

        // Color dot
        const dot = document.createElement('div');
        dot.className = 'gf-folder-dot';
        dot.style.background = folder.color;

        // Name
        const label = document.createElement('span');
        label.className = 'gf-folder-label';
        if (folder.pinned) {
            label.appendChild(createIcon('pin', 10));
            label.appendChild(document.createTextNode(' ' + folder.name));
        } else {
            label.textContent = folder.name;
        }

        // Count badge with stats tooltip
        const stats = this.getFolderStats(folderId);
        const badge = document.createElement('span');
        badge.className = 'gf-folder-badge';
        badge.textContent = chats.length > 0 ? `(${chats.length})` : '';
        badge.title = `Total assigned: ${stats.chatCount} | Visible: ${chats.length}`;

        // Toggle arrow
        const toggle = document.createElement('span');
        toggle.className = 'gf-folder-toggle';
        toggle.textContent = '\u25BC';

        // Actions
        const actions = document.createElement('div');
        actions.className = 'gf-folder-actions';

        const editBtn = document.createElement('span');
        editBtn.className = 'gf-folder-action';
        editBtn.appendChild(createIcon('edit', 12));
        editBtn.title = 'Edit';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            this.showFolderModal(folderId, 'Edit Folder', folder.name, folder.color);
        };

        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'gf-folder-action';
        deleteBtn.appendChild(createIcon('trash', 12));
        deleteBtn.title = 'Delete';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            NativeUI.showConfirm(
                NativeUI.t(`确认删除文件夹 "${folder.name}"？`, `Delete folder "${folder.name}"?`),
                () => this.deleteFolder(folderId),
                { confirmText: NativeUI.t('删除', 'Delete'), danger: true }
            );
        };

        const pinBtn = document.createElement('span');
        pinBtn.className = 'gf-folder-action';
        pinBtn.appendChild(createIcon('pin', 12));
        pinBtn.title = folder.pinned ? 'Unpin' : 'Pin to top';
        pinBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleFolderPin(folderId);
        };

        actions.appendChild(pinBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        row.appendChild(dot);
        row.appendChild(label);
        row.appendChild(badge);
        row.appendChild(actions);
        row.appendChild(toggle);

        // Click to toggle collapse
        row.onclick = (e) => {
            if (e.target.closest('.gf-folder-actions')) return;
            e.stopPropagation();
            this.toggleFolderCollapse(folderId);
        };

        // Drag & Drop (chat into folder + folder reorder)
        row.ondragover = (e) => {
            e.preventDefault();
            if (this.folderDragState && this.folderDragState.folderId !== folderId) {
                // Folder reorder: show position indicator
                const rect = row.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                row.classList.remove('drag-above', 'drag-below', 'drop-active');
                if (e.clientY < mid) {
                    row.classList.add('drag-above');
                } else {
                    row.classList.add('drag-below');
                }
            } else if (this.dragState) {
                // Chat drop into folder
                row.classList.add('drop-active');
            }
        };
        row.ondragleave = () => {
            row.classList.remove('drop-active', 'drag-above', 'drag-below');
        };
        row.ondrop = (e) => {
            e.preventDefault();
            const wasAbove = row.classList.contains('drag-above');
            row.classList.remove('drop-active', 'drag-above', 'drag-below');
            if (this.folderDragState && this.folderDragState.folderId !== folderId) {
                // Folder reorder
                this.reorderFolder(this.folderDragState.folderId, folderId, wasAbove ? 'before' : 'after');
            } else if (this.dragState) {
                // Chat drop
                this.moveChatToFolder(this.dragState.chatId, folderId);
            }
        };

        wrapper.appendChild(row);

        // Chat items (if not collapsed)
        if (!folder.collapsed && chats.length > 0) {
            chats.forEach(chat => {
                const chatRow = document.createElement('div');
                chatRow.className = 'gf-chat-row' + (this._batchSelected.has(chat.id) ? ' batch-selected' : '');

                if (this._batchMode) {
                    const check = document.createElement('div');
                    check.className = 'gf-batch-check' + (this._batchSelected.has(chat.id) ? ' checked' : '');
                    check.onclick = (e) => {
                        e.stopPropagation();
                        if (this._batchSelected.has(chat.id)) {
                            this._batchSelected.delete(chat.id);
                        } else {
                            this._batchSelected.add(chat.id);
                        }
                        PanelUI.renderDetailsPane();
                    };
                    chatRow.appendChild(check);
                }

                const chatTitle = document.createElement('span');
                chatTitle.className = 'gf-chat-title';
                chatTitle.textContent = chat.title;
                chatTitle.title = chat.title;

                const removeBtn = document.createElement('span');
                removeBtn.className = 'gf-chat-remove';
                removeBtn.appendChild(createIcon('x', 10));
                removeBtn.title = 'Remove from folder';
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.moveChatToFolder(chat.id, null);
                };

                chatRow.appendChild(chatTitle);
                if (!this._batchMode) chatRow.appendChild(removeBtn);

                // Click to navigate or select in batch mode
                chatRow.onclick = (e) => {
                    e.stopPropagation();
                    if (this._batchMode) {
                        if (this._batchSelected.has(chat.id)) {
                            this._batchSelected.delete(chat.id);
                        } else {
                            this._batchSelected.add(chat.id);
                        }
                        PanelUI.renderDetailsPane();
                        return;
                    }
                    if (chat.element && chat.element.click) {
                        chat.element.click();
                    } else if (isValidChatHref(chat.href)) {
                        window.location.href = chat.href;
                    }
                };

                wrapper.appendChild(chatRow);
            });
        }

        return wrapper;
    },

    // --- \u6A21\u6001\u6846 ---
    showFolderModal(folderId, title, currentName, currentColor) {
        const isEdit = folderId !== null;

        const overlay = document.createElement('div');
        overlay.className = 'gf-modal-overlay';

        // ESC to close + cleanup on all close paths
        const escHandler = (e) => { if (e.key === 'Escape') closeOverlay(); };
        document.addEventListener('keydown', escHandler);
        const closeOverlay = () => { document.removeEventListener('keydown', escHandler); overlay.remove(); };
        overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(); };

        const modal = document.createElement('div');
        modal.className = 'gf-modal';
        Core.applyTheme(modal, Core.getTheme());

        const titleEl = document.createElement('div');
        titleEl.className = 'gf-modal-title';
        titleEl.textContent = title;

        const input = document.createElement('input');
        input.className = 'gf-modal-input';
        input.type = 'text';
        input.placeholder = 'Folder name';
        input.value = currentName;

        const colorsContainer = document.createElement('div');
        colorsContainer.className = 'gf-modal-colors';

        let selectedColor = currentColor;
        this.FOLDER_COLORS.forEach(color => {
            const colorBtn = document.createElement('div');
            colorBtn.className = `gf-color-option ${color === selectedColor ? 'selected' : ''}`;
            colorBtn.style.background = color;
            colorBtn.onclick = () => {
                colorsContainer.querySelectorAll('.gf-color-option').forEach(c => c.classList.remove('selected'));
                colorBtn.classList.add('selected');
                selectedColor = color;
                hexInput.value = color;
            };
            colorsContainer.appendChild(colorBtn);
        });

        // Custom hex color input
        const hexWrap = document.createElement('div');
        hexWrap.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 16px;';
        const hexLabel = document.createElement('span');
        hexLabel.style.cssText = 'font-size: 11px; color: var(--text-sub, #9aa0a6);';
        hexLabel.textContent = 'Custom:';
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.value = currentColor;
        hexInput.placeholder = '#ff6600';
        hexInput.style.cssText = 'flex: 1; padding: 6px 8px; font-size: 12px; border-radius: 6px; border: 1px solid var(--border, rgba(255,255,255,0.1)); background: var(--input-bg, rgba(255,255,255,0.05)); color: var(--text-main, #e8eaed); font-family: monospace; box-sizing: border-box;';
        hexInput.oninput = () => {
            const val = hexInput.value.trim();
            if (/^#[0-9a-fA-F]{3,8}$/.test(val)) {
                selectedColor = val;
                colorsContainer.querySelectorAll('.gf-color-option').forEach(c => c.classList.remove('selected'));
            }
        };
        hexWrap.appendChild(hexLabel);
        hexWrap.appendChild(hexInput);

        // Rules section (edit mode only)
        let rulesData = [];
        let rulesContainer = null;
        if (isEdit) {
            rulesData = [...(this.data.folders[folderId].rules || [])];

            const rulesSection = document.createElement('div');
            rulesSection.style.cssText = 'margin-bottom: 16px;';
            const rulesLabel = document.createElement('div');
            rulesLabel.style.cssText = 'font-size: 11px; color: var(--text-sub, #9aa0a6); margin-bottom: 6px;';
            rulesLabel.textContent = 'Auto-classify rules (keyword or /regex/):';
            rulesSection.appendChild(rulesLabel);

            rulesContainer = document.createElement('div');
            rulesContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

            const renderRules = () => {
                rulesContainer.replaceChildren();
                rulesData.forEach((rule, idx) => {
                    const ruleRow = document.createElement('div');
                    ruleRow.style.cssText = 'display: flex; gap: 4px; align-items: center;';
                    const ruleInput = document.createElement('input');
                    ruleInput.type = 'text';
                    ruleInput.value = rule.type === 'regex' ? `/${rule.value}/` : rule.value;
                    ruleInput.style.cssText = 'flex: 1; padding: 4px 8px; font-size: 11px; border-radius: 4px; border: 1px solid var(--border, rgba(255,255,255,0.1)); background: var(--input-bg, rgba(255,255,255,0.05)); color: var(--text-main, #e8eaed); box-sizing: border-box;';
                    ruleInput.oninput = () => {
                        const val = ruleInput.value.trim();
                        const regexMatch = val.match(/^\/(.+)\/$/);
                        if (regexMatch) {
                            try {
                                new RegExp(regexMatch[1], 'i');
                                rulesData[idx] = { type: 'regex', value: regexMatch[1] };
                            } catch (e) {
                                rulesData[idx] = { type: 'keyword', value: val };
                            }
                        } else {
                            rulesData[idx] = { type: 'keyword', value: val };
                        }
                    };
                    const delBtn = document.createElement('span');
                    delBtn.appendChild(createIcon('x', 10));
                    delBtn.style.cssText = 'cursor: pointer; font-size: 12px; color: var(--text-sub); opacity: 0.6;';
                    delBtn.onclick = () => { rulesData.splice(idx, 1); renderRules(); };
                    ruleRow.appendChild(ruleInput);
                    ruleRow.appendChild(delBtn);
                    rulesContainer.appendChild(ruleRow);
                });
            };
            renderRules();

            const addRuleBtn = document.createElement('button');
            addRuleBtn.style.cssText = 'font-size: 10px; padding: 4px 8px; border-radius: 4px; border: 1px dashed var(--divider, rgba(255,255,255,0.15)); background: transparent; color: var(--text-sub, #9aa0a6); cursor: pointer; margin-top: 4px;';
            addRuleBtn.textContent = '+ Add Rule';
            addRuleBtn.onclick = () => { rulesData.push({ type: 'keyword', value: '' }); renderRules(); };

            rulesSection.appendChild(rulesContainer);
            rulesSection.appendChild(addRuleBtn);
            modal.rulesSection = rulesSection;
        }

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'gf-modal-actions';

        if (isEdit) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'gf-modal-btn danger';
            deleteBtn.textContent = NativeUI.t('删除', 'Delete');
            deleteBtn.onclick = () => {
                if (deleteBtn.dataset.confirmed) {
                    this.deleteFolder(folderId);
                    closeOverlay();
                } else {
                    deleteBtn.dataset.confirmed = '1';
                    deleteBtn.textContent = NativeUI.t('确认删除？', 'Confirm?');
                    setTimeout(() => {
                        deleteBtn.dataset.confirmed = '';
                        deleteBtn.textContent = NativeUI.t('删除', 'Delete');
                    }, 3000);
                }
            };
            actionsDiv.appendChild(deleteBtn);
        }

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'gf-modal-btn secondary';
        cancelBtn.textContent = NativeUI.t('取消', 'Cancel');
        cancelBtn.onclick = () => closeOverlay();

        const saveBtn = document.createElement('button');
        saveBtn.className = 'gf-modal-btn primary';
        saveBtn.textContent = isEdit ? 'Save' : 'Create';
        saveBtn.onclick = () => {
            const name = input.value.trim() || 'New Folder';
            if (isEdit) {
                this.renameFolder(folderId, name);
                this.setFolderColor(folderId, selectedColor);
                this.setFolderRules(folderId, rulesData.filter(r => r.value));
            } else {
                this.createFolder(name, selectedColor);
            }
            closeOverlay();
        };

        actionsDiv.appendChild(cancelBtn);
        actionsDiv.appendChild(saveBtn);

        modal.appendChild(titleEl);
        modal.appendChild(input);
        modal.appendChild(colorsContainer);
        modal.appendChild(hexWrap);
        if (modal.rulesSection) modal.appendChild(modal.rulesSection);
        modal.appendChild(actionsDiv);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        input.focus();
        input.select();
    }
};
