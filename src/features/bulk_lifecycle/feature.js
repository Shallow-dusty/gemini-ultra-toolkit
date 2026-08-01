import { BulkConfirmationFlow } from './confirmation.js';
import { BulkLifecycleRunner } from './runner.js';
import { BulkSelectionState } from './selection.js';
import { normalizeConversation } from './snapshot.js';
import { BulkLifecycleView, defaultTranslate } from './view.js';

/** Coordinates lifecycle only; domain, selection, confirmation, and rendering stay separate. */
export class BulkLifecycleFeature {
    constructor({
        document: documentRef = globalThis.document,
        adapter,
        dialogs,
        archiveCapability = null,
        translate = defaultTranslate,
        now = () => new Date().toISOString()
    } = {}) {
        if (!documentRef || typeof documentRef.createElement !== 'function') {
            throw new TypeError('BulkLifecycleFeature requires a document');
        }
        for (const method of [
            'listConversations',
            'getRunScope',
            'mountToolbar',
            'mountSelectionControl',
            'subscribeRouteChange'
        ]) {
            if (!adapter || typeof adapter[method] !== 'function') {
                throw new TypeError(`BulkLifecycleFeature adapter requires ${method}()`);
            }
        }
        if (!dialogs || typeof dialogs.open !== 'function') {
            throw new TypeError('BulkLifecycleFeature requires a dialog manager');
        }
        if (typeof translate !== 'function' || typeof now !== 'function') {
            throw new TypeError('BulkLifecycleFeature translate and now options must be functions');
        }
        this.document = documentRef;
        this.adapter = adapter;
        this.now = now;
        this.runner = new BulkLifecycleRunner({
            adapter,
            archiveCapability,
            onChange: () => this._refreshAll()
        });
        this.selection = new BulkSelectionState({ isRunActive: () => this.runner.active });
        this.view = new BulkLifecycleView({ document: documentRef, translate });
        this.confirmation = new BulkConfirmationFlow({ document: documentRef, dialogs, translate });
        this._started = false;
        this._nativeWanted = false;
        this._toolbarMount = null;
        this._selectionMounts = [];
        this._detailsContainer = null;
        this._detailsRoot = null;
        this._routeUnsubscribe = null;
        this._runPromise = null;
    }

    get started() { return this._started; }
    get selectedIds() { return this.selection.ids; }
    get report() { return this.runner.report; }
    get controller() { return this.runner; }

    setArchiveCapability(capability) {
        const changed = this.runner.setArchiveCapability(capability);
        if (!changed) return false;
        this.confirmation.close('archive-capability-changed');
        this._refreshAll();
        return true;
    }

    start({ session = null } = {}) {
        if (this._started) return false;
        this._started = true;
        this.adapter.setSession?.(session);
        this._routeUnsubscribe = this.adapter.subscribeRouteChange(() => this._invalidateScope('route-changed'));
        return true;
    }

    async stop(reason = 'module-stopped') {
        if (!this._started) return false;
        this._started = false;
        this.runner.cancel(reason);
        this.confirmation.close(reason);
        if (this._runPromise) await this._runPromise;
        this._routeUnsubscribe?.();
        this._routeUnsubscribe = null;
        this.unmountNativeUI();
        this.selection.reset();
        this._detailsRoot?.remove();
        this._detailsRoot = null;
        this._detailsContainer = null;
        return true;
    }

    async changeSession(session) {
        this.runner.cancel('session-changed');
        this.confirmation.close('session-changed');
        if (this._runPromise) await this._runPromise;
        this.adapter.setSession?.(session);
        this.selection.reset();
        this._refreshAll();
        return session;
    }

    _invalidateScope(reason) {
        this.runner.cancel(reason);
        this.confirmation.close(reason);
        this.selection.reset();
        this._refreshAll();
    }

    _listItems() { return this.adapter.listConversations().map(normalizeConversation); }

    _setSelected(item, selected) {
        this.selection.set(item, selected);
        this._refreshAll();
    }

    selectAllVisible() {
        this.selection.selectAll(this._listItems());
        this._refreshAll();
    }

    clearSelection() {
        this.selection.clear();
        this._refreshAll();
    }

    enterSelectionMode() {
        const entered = this.selection.enter();
        if (entered) this._refreshAll();
        return entered;
    }

    exitSelectionMode() {
        const exited = this.selection.exit();
        if (exited) this._refreshAll();
        return exited;
    }

    _removeNativeMount() {
        for (const mount of this._selectionMounts.splice(0)) mount?.remove();
        this._toolbarMount?.remove();
        this._toolbarMount = null;
    }

    unmountNativeUI() {
        const hadMount = Boolean(this._toolbarMount || this._selectionMounts.length);
        this._nativeWanted = false;
        this._removeNativeMount();
        return hadMount;
    }

    mountNativeUI() {
        this._nativeWanted = true;
        if (!this._started) return false;
        if (this._toolbarMount?.isConnected) return false;
        this._removeNativeMount();
        const toolbar = this.view.createToolbar({
            selectionMode: this.selection.mode,
            active: this.runner.active,
            selectedCount: this.selection.size
        }, {
            enter: () => this.enterSelectionMode(),
            exit: () => this.exitSelectionMode(),
            selectAll: () => this.selectAllVisible(),
            clear: () => this.clearSelection(),
            preview: () => this.openPreview(),
            cancelRun: () => this.runner.cancel('user-cancelled')
        });
        const mount = this.adapter.mountToolbar(toolbar);
        if (!mount) return false;
        this._toolbarMount = mount;
        if (this.selection.mode) {
            for (const item of this._listItems()) {
                const choice = this.view.createChoice(item, {
                    checked: this.selection.has(item.id),
                    disabled: this.runner.active,
                    onChange: selected => this._setSelected(item, selected)
                });
                const selectionMount = this.adapter.mountSelectionControl(item.id, choice.label);
                if (selectionMount) this._selectionMounts.push(selectionMount);
            }
        }
        return true;
    }

    _refreshNative() {
        if (!this._nativeWanted) return;
        this._removeNativeMount();
        this.mountNativeUI();
    }

    _refreshAll() {
        this._refreshNative();
        if (this._detailsContainer) this.render(this._detailsContainer);
    }

    openPreview() {
        if (this.runner.active || this.selection.size === 0) return null;
        const snapshot = this.selection.capture({
            scope: this.adapter.getRunScope(),
            capturedAt: String(this.now())
        });
        return this.confirmation.open(snapshot, {
            hasArchive: this.runner.hasArchive,
            onConfirm: (confirmed, runOptions) => this._startRun(confirmed, runOptions)
        });
    }

    _startRun(snapshot, runOptions = {}) {
        if (this._runPromise) return this._runPromise;
        const run = this.runner.execute(snapshot, runOptions).then(report => {
            for (const item of report.items) {
                if (item.status === 'deleted') this.selection.remove(item.id);
            }
            return report;
        });
        this._runPromise = run.finally(() => {
            this._runPromise = null;
            this._refreshAll();
        });
        this._refreshAll();
        return this._runPromise;
    }

    whenIdle() { return this._runPromise || Promise.resolve(this.runner.report); }

    render(container) {
        if (!container || typeof container.append !== 'function') {
            throw new TypeError('Bulk lifecycle details container must be a DOM element');
        }
        this._detailsContainer = container;
        this._detailsRoot?.remove();
        const root = this.view.createDetails({
            items: this._listItems(),
            scope: this.adapter.getRunScope(),
            selection: this.selection,
            report: this.runner.report,
            active: this.runner.active
        }, {
            select: (item, selected) => this._setSelected(item, selected),
            selectAll: () => this.selectAllVisible(),
            clear: () => this.clearSelection(),
            preview: () => this.openPreview(),
            cancelRun: () => this.runner.cancel('user-cancelled')
        });
        container.append(root);
        this._detailsRoot = root;
        return root;
    }
}

export { defaultTranslate } from './view.js';
