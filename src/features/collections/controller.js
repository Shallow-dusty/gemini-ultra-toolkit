import { fail } from './errors.js';
import { safeClone, sessionIdFromContext } from './model.js';
import { writeCollectionsToLegacy } from './legacy_repository.js';
import {
    assignChatAction,
    moveCollectionAction,
    nextManualMembershipIds,
    submitCollectionAction
} from './controller_actions.js';
import {
    buildCollectionsPresentation,
    collectionsInTreeOrder,
    normalizeSidebarChats
} from './presentation.js';
import { createRulePreviewSession } from './rule_preview_session.js';

const REQUIRED_SERVICE_METHODS = Object.freeze([
    'start', 'switchSession', 'stop', 'getSnapshot', 'create', 'update', 'move',
    'remove', 'setManualMembership', 'setManualMemberships', 'setNotebooksAvailability', 'exportJson',
    'importJson', 'flush'
]);

function assertMethods(value, methods, label) {
    for (const method of methods) {
        if (!value || typeof value[method] !== 'function') {
            throw new TypeError(`${label} must implement ${method}()`);
        }
    }
    return value;
}

function normalizeUi(ui = {}) {
    const defaults = {
        confirm: () => true,
        toast: () => undefined,
        downloadText: () => undefined,
        pickTextFile: () => null
    };
    const output = { ...defaults, ...ui };
    for (const [name, value] of Object.entries(output)) {
        if (typeof value !== 'function') throw new TypeError(`Collections UI ${name} must be a function`);
    }
    return output;
}

function filenameDate(nowIso) {
    return nowIso.slice(0, 10);
}

export class CollectionsController {
    constructor({
        service,
        view,
        adapter,
        observer,
        archiveProvider = null,
        ui,
        clock,
        schedule = (callback, delay) => setTimeout(callback, delay),
        cancelSchedule = handle => clearTimeout(handle),
        initialDelay = 250
    } = {}) {
        this.service = assertMethods(service, REQUIRED_SERVICE_METHODS, 'Collections service');
        this.view = assertMethods(view, ['mount', 'unmount', 'render', 'renderSidebar', 'clearSidebar', 'ensureStyles', 'removeStyles'], 'Collections view');
        this.adapter = assertMethods(adapter, ['scanSidebarChats', 'getSidebarContainer', 'matchesSidebarMutation', 'openChat', 'getNotebooksAvailability'], 'Collections adapter');
        this.observer = assertMethods(observer, ['register', 'unregister'], 'Collections observer');
        this.ui = normalizeUi(ui);
        this.rulePreview = createRulePreviewSession({ service: this.service, archiveProvider, confirm: message => this.ui.confirm(message) });
        if (typeof clock !== 'function') throw new TypeError('Collections controller clock must be a function');
        if (typeof schedule !== 'function' || typeof cancelSchedule !== 'function') {
            throw new TypeError('Collections controller scheduler must provide schedule and cancelSchedule');
        }
        if (!Number.isFinite(initialDelay) || initialDelay < 0) throw new TypeError('Collections initialDelay must be non-negative');
        this.clock = clock;
        this.schedule = schedule;
        this.cancelSchedule = cancelSchedule;
        this.initialDelay = initialDelay;
        this.active = false;
        this.sessionId = null;
        this.snapshot = null;
        this.chats = [];
        this.query = '';
        this.activeFilter = null;
        this.editingId = null;
        this.status = '';
        this.error = '';
        this._timer = null;
        this._generation = 0;
        this._undoSnapshot = null;
    }

    async start(session) {
        const sessionId = sessionIdFromContext(session);
        if (this.active) {
            if (this.sessionId === sessionId) return false;
            fail('ALREADY_STARTED', 'Collections controller is already active for another session');
        }
        this.active = true;
        this.sessionId = sessionId;
        this._generation += 1;
        try {
            await this.service.start(sessionId);
            await this._refresh(true);
            this._registerObserver();
            this.scheduleRefresh(this.initialDelay);
            return true;
        } catch (error) {
            this.active = false;
            this.sessionId = null;
            this._generation += 1;
            this._cancelRefresh();
            this.observer.unregister('folders-sidebar');
            this.view.clearSidebar();
            this.view.unmount();
            this.view.removeStyles();
            this.snapshot = null;
            this.chats = [];
            this.query = '';
            this.editingId = null;
            this.activeFilter = null;
            this.status = '';
            this.error = '';
            this._undoSnapshot = null;
            this.rulePreview.clear();
            // The startup error remains authoritative. Promise.allSettled also
            // contains synchronous stop failures through the microtask boundary.
            await Promise.allSettled([Promise.resolve().then(() => this.service.stop())]);
            throw error;
        }
    }

    async stop() {
        if (!this.active) return false;
        this.active = false;
        this.sessionId = null;
        this._generation += 1;
        this._cancelRefresh();
        this.observer.unregister('folders-sidebar');
        this.view.clearSidebar();
        this.view.unmount();
        this.view.removeStyles();
        try {
            await this.service.stop();
        } finally {
            this.snapshot = null;
            this.chats = [];
            this.query = '';
            this.editingId = null;
            this.activeFilter = null;
            this.status = '';
            this.error = '';
            this._undoSnapshot = null;
            this.rulePreview.clear();
        }
        return true;
    }

    async changeSession(session) {
        const sessionId = sessionIdFromContext(session);
        if (!this.active) return this.start(sessionId);
        if (sessionId === this.sessionId) return false;
        await this.service.switchSession(sessionId);
        this.sessionId = sessionId;
        this.query = '';
        this.activeFilter = null;
        this.editingId = null;
        this._undoSnapshot = null;
        this.rulePreview.clear();
        this.status = '';
        this.error = '';
        await this._refresh(true);
        this.scheduleRefresh(0);
        return true;
    }

    mount(container) {
        const mounted = this.view.mount(container, this._handlers());
        if (this.snapshot) this._render();
        return mounted;
    }

    getSnapshot() {
        return this.snapshot ? safeClone(this.snapshot) : null;
    }

    getLegacyData() {
        if (!this.snapshot) return { folders: {}, chatToFolder: {}, folderOrder: [] };
        const legacy = writeCollectionsToLegacy(this.snapshot, {}, { sessionId: this.snapshot.sessionId });
        return safeClone({
            folders: legacy.folders,
            chatToFolder: legacy.chatToFolder,
            folderOrder: legacy.folderOrder
        });
    }

    scheduleRefresh(delay = 0) {
        if (!this.active) return false;
        this._cancelRefresh();
        const generation = this._generation;
        this._timer = this.schedule(async () => {
            this._timer = null;
            if (!this.active || generation !== this._generation) return;
            try {
                await this._refresh(false);
            } catch (error) {
                this._showError(error);
            }
        }, delay);
        return true;
    }

    async refresh() {
        if (!this.active) return false;
        try {
            await this._refresh(false);
            return true;
        } catch (error) {
            this._showError(error);
            return false;
        }
    }

    async submit(editingId, draft) {
        return this._run(editingId ? 'Collection updated' : 'Collection created', async () => {
            const result = await submitCollectionAction({ service: this.service, snapshot: this.snapshot, editingId, draft });
            this.editingId = null;
            return result;
        }, true, true);
    }

    edit(id) {
        const exists = this.snapshot?.collections.some(collection => collection.id === id);
        if (!exists) return false;
        this.editingId = id;
        this.error = '';
        this._render(`collection-${id}`);
        return true;
    }

    cancelEdit() {
        if (!this.editingId) return false;
        this.editingId = null;
        this._render('collection-form-submit');
        return true;
    }

    async remove(id) {
        const collection = this.snapshot?.collections.find(value => value.id === id);
        if (!collection) return null;
        let accepted;
        try {
            accepted = await this.ui.confirm(`Delete collection "${collection.name}" and its nested collections?`);
        } catch (error) {
            this._showError(error);
            return null;
        }
        if (!accepted) return null;
        return this._run('Collection deleted', () => this.service.remove(id, { cascade: true }), true, true);
    }

    async toggle(id, collapsed) {
        return this._run('Collection visibility updated', () => this.service.update(id, { collapsed }), true, true);
    }

    async pin(id, pinned) {
        return this._run('Collection pin updated', () => this.service.update(id, { pinned }), true, true);
    }

    async move(id, directionOrPlacement) {
        return this._run('Collection moved', () => moveCollectionAction({
            service: this.service,
            snapshot: this.snapshot,
            id,
            placement: directionOrPlacement
        }), true, true);
    }

    async assignChat(chatId, collectionId, removeCollectionId = null) {
        return this._run('Chat membership updated', () => assignChatAction({
            service: this.service,
            snapshot: this.snapshot,
            chatId,
            collectionId,
            removeCollectionId
        }), true, true);
    }

    async assignChats(chatIds, collectionId) {
        const ids = [...new Set((Array.isArray(chatIds) ? chatIds : []).map(value => String(value).trim()).filter(Boolean))];
        if (!ids.length) return 0;
        return this._run('Chat memberships updated', async () => {
            await this.service.setManualMemberships(ids.map(chatId => ({
                itemId: chatId,
                collectionIds: nextManualMembershipIds({
                    snapshot: this.snapshot,
                    chatId,
                    collectionId
                })
            })));
            return ids.length;
        }, true, true);
    }
    async autoClassify() {
        return this.previewRules();
    }
    async previewRules() {
        return this._run('', async () => {
            this.chats = normalizeSidebarChats(this.adapter.scanSidebarChats());
            const preview = await this.rulePreview.preview(this.snapshot, this.chats);
            this.status = `${preview.matchCount} rule match${preview.matchCount === 1 ? '' : 'es'} reviewed; ${preview.changeCount} local change${preview.changeCount === 1 ? '' : 's'} ready`;
            return preview;
        }, false);
    }
    async applyRulePreview() {
        return this._run('', async () => {
            const visibleChats = normalizeSidebarChats(this.adapter.scanSidebarChats());
            const result = await this.rulePreview.apply(visibleChats);
            this.status = result.cancelled ? 'Rule application cancelled' : `${result.applied} local membership${result.applied === 1 ? '' : 's'} applied`;
            return result;
        }, true, result => result.applied > 0);
    }
    cancelRulePreview() {
        if (!this.rulePreview.clear()) return false;
        this.status = 'Rule preview cleared';
        this._render();
        return true;
    }
    async exportData() {
        return this._run('Collections exported', async () => {
            const text = await this.service.exportJson();
            const nowIso = new Date(this.clock()).toISOString();
            await this.ui.downloadText(`primer-pp-collections-${filenameDate(nowIso)}.json`, text, 'application/json');
            return text;
        }, false);
    }

    async importData() {
        let text;
        try {
            text = await this.ui.pickTextFile({ accept: '.json,application/json' });
        } catch (error) {
            this._showError(error);
            return null;
        }
        if (text === null || text === undefined) return null;
        return this._run('Collections imported', () => this.service.importJson(text, {
            mode: 'merge',
            conflict: 'rename'
        }), true, true);
    }

    async undo() {
        if (!this._undoSnapshot) return null;
        const snapshot = this._undoSnapshot;
        const result = await this._run('Last collection change undone', () => this.service.importJson(snapshot, {
            mode: 'replace'
        }));
        if (result) this._undoSnapshot = null;
        this._render();
        return result;
    }

    setSearch(query) {
        this.query = String(query ?? '');
        this._render();
        return this.query;
    }

    setFilter(collectionId) {
        this.activeFilter = collectionId;
        this._renderSidebar();
        return collectionId;
    }

    openChat(chat) {
        try {
            return this.adapter.openChat(safeClone(chat));
        } catch (error) {
            this._showError(error);
            return false;
        }
    }

    _handlers() {
        return {
            onSubmit: (id, draft) => this.submit(id, draft),
            onCancelEdit: () => this.cancelEdit(),
            onEdit: id => this.edit(id),
            onDelete: id => this.remove(id),
            onToggle: (id, value) => this.toggle(id, value),
            onPin: (id, value) => this.pin(id, value),
            onMove: (id, placement) => this.move(id, placement),
            onAssignChat: (chatId, collectionId, removeId) => this.assignChat(chatId, collectionId, removeId),
            onOpenChat: chat => this.openChat(chat),
            onSearch: query => this.setSearch(query),
            onFilter: id => this.setFilter(id),
            onExport: () => this.exportData(),
            onImport: () => this.importData(),
            onAutoClassify: () => this.autoClassify(),
            onApplyRulePreview: () => this.applyRulePreview(),
            onCancelRulePreview: () => this.cancelRulePreview(),
            onUndo: () => this.undo()
        };
    }

    _registerObserver() {
        this.observer.unregister('folders-sidebar');
        this.observer.register('folders-sidebar', {
            match: mutation => this.adapter.matchesSidebarMutation(mutation),
            callback: () => this.rulePreview.suppressesObserver ? false : this.scheduleRefresh(0)
        });
    }

    async _refresh(syncNative) {
        this.rulePreview.clear();
        let snapshot = await this.service.getSnapshot();
        if (syncNative) {
            const available = Boolean(await this.adapter.getNotebooksAvailability());
            if (snapshot.native.notebooks.available !== available || snapshot.native.notebooks.observedAt === null) {
                await this.service.setNotebooksAvailability({ available, observedAt: new Date(this.clock()).toISOString() });
                snapshot = await this.service.getSnapshot();
            }
        }
        this.snapshot = snapshot;
        this.chats = normalizeSidebarChats(this.adapter.scanSidebarChats());
        if (this.activeFilter && !snapshot.collections.some(collection => collection.id === this.activeFilter)) {
            this.activeFilter = null;
        }
        this.error = '';
        this._render();
        this._renderSidebar();
        return snapshot;
    }

    _presentation(focusKey) {
        return buildCollectionsPresentation(this.snapshot, this.chats, {
            query: this.query,
            editingId: this.editingId,
            status: this.status,
            error: this.error,
            canUndo: this._undoSnapshot !== null,
            rulePreview: this.rulePreview.getPreview(),
            focusKey
        });
    }

    _render(focusKey) {
        if (!this.snapshot || !this.view.root) return false;
        this.view.render(this._presentation(focusKey));
        return true;
    }

    _renderSidebar() {
        if (!this.snapshot) return false;
        const presentation = this._presentation();
        return this.view.renderSidebar({
            container: this.adapter.getSidebarContainer(),
            collections: collectionsInTreeOrder(presentation.tree),
            chats: presentation.chats,
            activeFilter: this.activeFilter,
            onFilter: id => this.setFilter(id),
            onAssignChat: (chatId, id) => this.assignChat(chatId, id)
        });
    }

    async _run(successMessage, operation, refresh = true, captureUndo = false) {
        this.error = '';
        const before = captureUndo && this.snapshot ? safeClone(this.snapshot) : null;
        try {
            const result = await operation();
            const shouldCapture = typeof captureUndo === 'function' ? captureUndo(result) : captureUndo;
            if (before && shouldCapture) this._undoSnapshot = before;
            if (refresh) await this._refresh(false);
            if (successMessage) this.status = successMessage;
            this._render();
            if (successMessage) this.ui.toast(successMessage, { tone: 'success' });
            return result;
        } catch (error) {
            this._showError(error);
            return null;
        }
    }

    _showError(error) {
        this.error = error?.message || 'Collections operation failed';
        this._render();
        this.ui.toast(this.error, { tone: 'danger' });
    }

    _cancelRefresh() {
        if (this._timer === null) return false;
        this.cancelSchedule(this._timer);
        this._timer = null;
        return true;
    }
}

export function createCollectionsController(options) {
    return new CollectionsController(options);
}
