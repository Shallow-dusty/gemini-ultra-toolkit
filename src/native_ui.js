import { ModuleRegistry } from './module_registry.js';
import { Core } from './core.js';
import { getCurrentTheme } from './state.js';
import { GLOBAL_KEYS } from './constants.js';
import { Logger } from './logger.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { createDialogManager } from './ui/dialog_manager.js';
import { createLocaleStore } from './ui/locale.js';

const nativeLocaleStore = createLocaleStore({ initialLocale: navigator.language });
let runtimeLocaleStorage = null;

export function configureNativeUIRuntime({ storage } = {}) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new TypeError('NativeUI locale storage must implement get() and set()');
    }
    let initialLocale;
    try {
        initialLocale = storage.get(GLOBAL_KEYS.LOCALE, navigator.language);
        nativeLocaleStore.setLocale(initialLocale);
    } catch (_error) {
        nativeLocaleStore.setLocale(navigator.language);
    }
    runtimeLocaleStorage = storage;
    return nativeLocaleStore.locale;
}

export const NativeUI = {
    _localeStore: nativeLocaleStore,
    get isZH() { return this._localeStore.locale.split('-')[0] === 'zh'; },
    set isZH(value) { this.setLocale(value ? 'zh-CN' : 'en'); },
    t(zh, en) { return this.isZH ? zh : en; },
    getLocale() { return this._localeStore.locale; },
    setLocale(locale) {
        const changed = this._localeStore.setLocale(locale);
        try { runtimeLocaleStorage?.set(GLOBAL_KEYS.LOCALE, this._localeStore.locale); }
        catch (_error) { /* locale remains valid in memory */ }
        return changed;
    },
    subscribeLocale(listener) { return this._localeStore.subscribe(listener); },

    _dialogManager: null,
    _dialogPortal: null,
    _dialogDocument: null,
    _dialogs: new Map(),
    _toastRegion: null,
    _activeTour: null,

    _ensureDialogManager() {
        const documentRef = document;
        const managerIsUsable = this._dialogManager
            && !this._dialogManager.destroyed
            && this._dialogDocument === documentRef
            && this._dialogPortal?.isConnected;
        if (managerIsUsable) return this._dialogManager;

        if (this._dialogManager && !this._dialogManager.destroyed) {
            this._dialogManager.destroy();
        }
        this._dialogPortal?.remove();
        this._dialogs.clear();

        const portal = documentRef.createElement('div');
        portal.id = 'primer-dialog-portal';
        portal.setAttribute('data-primer-ui-portal', '');
        portal.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
        // Keep the portal outside <body>, which is the background made inert by
        // DialogManager. This preserves the live Gemini page without moving it.
        documentRef.documentElement.appendChild(portal);

        this._dialogPortal = portal;
        this._dialogDocument = documentRef;
        this._dialogManager = createDialogManager({
            document: documentRef,
            portal,
            inertRoot: documentRef.body
        });
        return this._dialogManager;
    },

    getDialog(id) {
        const handle = this._dialogs.get(id) || null;
        if (handle && !handle.open) {
            this._dialogs.delete(id);
            return null;
        }
        return handle;
    },

    /**
     * Mount a legacy-styled modal in the shared DialogManager stack.
     * The staging element's class/style/children are promoted onto the actual
     * role=dialog element so existing panel CSS remains the single visual owner.
     */
    openDialog(options = {}) {
        const id = options.id;
        if (!id) throw new TypeError('NativeUI.openDialog requires an id');
        // GuidedTour registers itself here without introducing an import cycle.
        // A modal opening always ends the non-modal spotlight interaction first.
        if (this._activeTour) this._activeTour.stop();
        const existing = this.getDialog(id);
        if (existing) {
            if (!options.replaceExisting) return existing;
            existing.close('replace');
        }

        const manager = this._ensureDialogManager();
        const staging = options.contentElement;
        if (!staging) throw new TypeError('NativeUI.openDialog requires contentElement');
        const legacyClass = staging.className;
        const legacyStyle = staging.style?.cssText || '';
        const externalOnClose = options.onClose;
        let handle;
        handle = manager.open({
            id,
            ariaLabel: options.ariaLabel,
            content: staging,
            initialFocus: options.initialFocus,
            returnFocus: options.returnFocus,
            closeOnEscape: options.closeOnEscape,
            closeOnBackdrop: options.closeOnBackdrop,
            restoreFocus: options.restoreFocus,
            onClose: (reason, closedHandle) => {
                if (this._dialogs.get(id) === closedHandle) this._dialogs.delete(id);
                if (externalOnClose) {
                    try { externalOnClose(reason, closedHandle); }
                    catch (error) {
                        Logger.warn('Dialog close handler failed', { id, reason, error: String(error) });
                    }
                }
            }
        });

        handle.overlay.id = id;
        handle.overlay.className = ['primer-ui-dialog-layer', options.overlayClass]
            .filter(Boolean).join(' ');
        handle.overlay.style.pointerEvents = 'auto';
        // Legacy overlay classes used different global z-index values. Inside
        // the owned portal, stack order is authoritative and deterministic.
        handle.overlay.style.zIndex = String(manager.size);
        handle.element.className = ['primer-ui-dialog', legacyClass].filter(Boolean).join(' ');
        if (legacyStyle) handle.element.style.cssText = legacyStyle;
        while (staging.firstChild) handle.element.appendChild(staging.firstChild);
        staging.remove();

        // Reparenting the legacy shell can make Chromium drop focus even though
        // DialogManager focused the requested control before adoption.
        const initialFocus = options.initialFocus;
        if (handle.element.contains(initialFocus)) {
            initialFocus.focus({ preventScroll: true });
        }

        this._dialogs.set(id, handle);
        return handle;
    },

    closeDialog(id, reason = 'programmatic') {
        return this.getDialog(id)?.close(reason) || false;
    },

    closeAllDialogs(reason = 'programmatic') {
        const manager = this._dialogManager;
        if (!manager || manager.destroyed) return 0;
        let closed = 0;
        while (manager.top) {
            manager.closeTop(reason);
            closed += 1;
        }
        return closed;
    },

    disposeDialogs(reason = 'application-stop') {
        const manager = this._dialogManager;
        const portal = this._dialogPortal;
        const hadOwnedState = Boolean(manager || portal || this._toastRegion || this._dialogs.size);
        this.closeAllDialogs(reason);
        if (manager && !manager.destroyed) manager.destroy();
        portal?.remove();
        this._dialogs.clear();
        this._dialogManager = null;
        this._dialogPortal = null;
        this._dialogDocument = null;
        this._toastRegion = null;
        return hadOwnedState;
    },

    trapFocus(container) {
        const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const handler = (e) => {
            if (e.key !== 'Tab') return;
            const focusable = Array.from(container.querySelectorAll(selector))
                .filter(el => !el.disabled && el.tabIndex !== -1);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        container.addEventListener('keydown', handler);
        return () => container.removeEventListener('keydown', handler);
    },

    /**
     * Show a brief toast notification at the bottom of the screen.
     * @param {string} message
     * @param {number} [duration=2000] - ms before auto-dismiss
     */
    showToast(message, duration = 2000, timing = {}) {
        this._ensureDialogManager();
        if (!this._toastRegion?.isConnected) {
            const region = document.createElement('div');
            region.className = 'gc-toast-region';
            region.setAttribute('role', 'status');
            region.setAttribute('aria-live', 'polite');
            region.setAttribute('aria-atomic', 'false');
            region.style.cssText = 'position:fixed;inset:0;pointer-events:none;';
            this._dialogPortal.appendChild(region);
            this._toastRegion = region;
        }
        const toast = document.createElement('div');
        toast.className = 'gc-toast';
        toast.textContent = message;
        this._toastRegion.appendChild(toast);
        const schedule = timing.setTimeout || setTimeout;
        const cancel = timing.clearTimeout || clearTimeout;
        const frame = timing.requestAnimationFrame ??
            (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
        const show = () => toast.classList.add('visible');
        if (typeof frame === 'function') frame(show);
        else show();

        let dismissTimer = null;
        let removeTimer = null;
        let removed = false;
        const remove = () => {
            if (removed) return;
            removed = true;
            toast.remove();
        };
        const dismiss = ({ immediate = false } = {}) => {
            if (removed) return;
            if (dismissTimer !== null) cancel(dismissTimer);
            if (removeTimer !== null) cancel(removeTimer);
            toast.classList.remove('visible');
            if (immediate) remove();
            else removeTimer = schedule(remove, 200);
        };
        dismissTimer = schedule(dismiss, duration);
        return Object.freeze({ element: toast, dismiss, remove });
    },

    // Dirty tracking: only re-inject modules when DOM structure changes
    _dirtyModules: new Set(),
    _retryCount: {},

    // Zone → module IDs: which modules inject into which DOM zones
    _zoneModules: {
        sidebar: ['folders', 'batch-delete'],
        input:   ['prompt-vault', 'ui-tweaks', 'default-model', 'message-queue'],
        header:  ['export'],
    },

    _clearRetryTimer() {
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }
    },

    markAllDirty() {
        ModuleRegistry.enabledModules.forEach(id => {
            this._dirtyModules.add(id);
            delete this._retryCount[id];
        });
        this._clearRetryTimer();
    },

    /** Mark only modules that inject into a specific DOM zone */
    markDirtyByZone(zone) {
        const ids = this._zoneModules[zone];
        if (!ids) return this.markAllDirty();
        for (const id of ids) {
            if (ModuleRegistry.isEnabled(id)) {
                this._dirtyModules.add(id);
                delete this._retryCount[id];
            }
        }
        this._clearRetryTimer();
    },

    markDirty(id) {
        this._dirtyModules.add(id);
        delete this._retryCount[id];
        this._clearRetryTimer();
    },

    remove(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    },

    getSidebar() { return GeminiAdapter.getSidebar(); },
    getInputArea() { return GeminiAdapter.getInputArea(); },
    getChatHeader() { return GeminiAdapter.getChatHeader(); },
    getModelSwitch() { return GeminiAdapter.getModelSwitch(); },

    /**
     * Show a themed confirmation dialog (replaces native confirm()).
     * @param {string} message - Confirmation message
     * @param {Function} onConfirm - Called when user confirms
     * @param {Object} [opts] - { confirmText, cancelText, danger }
     */
    showConfirm(message, onConfirm, opts = {}) {
        const modal = document.createElement('div');
        modal.className = 'settings-modal';
        modal.style.width = '280px';
        try { Core.applyTheme(modal, getCurrentTheme()); } catch {}

        const body = document.createElement('div');
        body.style.cssText = 'padding:20px;font-size:13px;color:var(--text-main,#e8eaed);line-height:1.6;';
        body.textContent = message;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;padding:0 20px 16px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'settings-btn';
        cancelBtn.style.cssText = 'width:auto;padding:8px 16px;';
        cancelBtn.textContent = opts.cancelText || this.t('取消', 'Cancel');

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'settings-btn';
        confirmBtn.style.cssText = `width:auto;padding:8px 16px;background:${opts.danger ? '#ea4335' : 'var(--accent,#8ab4f8)'};color:${opts.danger ? '#fff' : '#000'};font-weight:600;`;
        confirmBtn.textContent = opts.confirmText || this.t('确认', 'Confirm');

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        modal.appendChild(body);
        modal.appendChild(actions);
        const id = `primer-confirm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const handle = this.openDialog({
            id,
            ariaLabel: opts.ariaLabel || this.t('确认操作', 'Confirm action'),
            overlayClass: 'settings-overlay',
            contentElement: modal,
            initialFocus: confirmBtn,
            onClose: reason => {
                if (reason === 'confirm') onConfirm();
            }
        });
        cancelBtn.onclick = () => handle.close('cancel');
        confirmBtn.onclick = () => handle.close('confirm');
        return handle;
    },

    // Called from zone handlers — only processes dirty modules
    _retryTimer: null,

    tick() {
        if (this._dirtyModules.size === 0) return;

        let needsRetry = false;
        const toProcess = [...this._dirtyModules];
        for (const id of toProcess) {
            // Skip modules the user has disabled between mark and tick — otherwise a
            // pending retry could "resurrect" injection after the module was turned off.
            if (!ModuleRegistry.isEnabled(id)) {
                this._dirtyModules.delete(id);
                delete this._retryCount[id];
                continue;
            }
            const mod = ModuleRegistry.modules[id];
            if (typeof mod?.injectNativeUI === 'function') {
                try {
                    mod.injectNativeUI();
                    this._dirtyModules.delete(id);
                    delete this._retryCount[id];
                } catch (e) {
                    const count = (this._retryCount[id] || 0) + 1;
                    this._retryCount[id] = count;
                    if (count >= 5) {
                        Logger.warn('Native UI injection failed after retries', { id, error: String(e) });
                        this._dirtyModules.delete(id);
                        delete this._retryCount[id];
                    } else {
                        needsRetry = true;
                    }
                }
            } else {
                this._dirtyModules.delete(id);
            }
        }

        // Schedule exponential backoff retry for remaining dirty modules
        if (needsRetry && !this._retryTimer) {
            const maxCount = Math.max(...Object.values(this._retryCount), 1);
            const delay = 500 * Math.pow(2, maxCount - 1);
            this._retryTimer = setTimeout(() => {
                this._retryTimer = null;
                this.tick();
            }, delay);
        }
    }
};
