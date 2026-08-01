import { GLOBAL_KEYS, QUOTA_COLORS, PANEL_ID, DEFAULT_POS, TEMP_USER } from './constants.js';
import { createIcon } from './icons.js';
import { Core } from './core.js';
import { ModuleRegistry } from './module_registry.js';
import { getCurrentTheme, setCurrentTheme } from './state.js';
import { NativeUI } from './native_ui.js';
import { injectPanelShellStyles } from './ui/shell/panel_styles.js';
import {
    MODULE_ICON_MAP,
    renderModuleIcon,
    setIconText as setShellIconText
} from './ui/shell/icon_helpers.js';
import {
    createPanelLayout,
    isPanelLayoutComplete,
    syncPanelDisclosure
} from './ui/shell/panel_layout.js';
import { createDetailsController } from './ui/shell/details_controller.js';
import { applyPanelPosition, createDragController } from './ui/shell/drag_controller.js';
import { createPanelPresenter } from './ui/shell/panel_presenter.js';
import {
    openSettingsModal as _openSettingsModal,
    showOnboarding as _showOnboarding,
    openDebugModal as _openDebugModal,
    openCalibrationModal as _openCalibrationModal
} from './panel_settings.js';
import { openDashboard as _openDashboard } from './panel_dashboard.js';

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                          PANEL UI (面板界面)                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// Module ID → SVG icon name mapping (exported for panel_settings/panel_dashboard)
export { MODULE_ICON_MAP };

/** Set element content to [SVG icon] + text (CSP-safe) */
export function setIconText(el, iconName, text, iconSize = 14) {
    return setShellIconText(el, iconName, text, iconSize, { createIcon });
}

/** Render a module's icon as SVG, fallback to emoji */
export function renderModIcon(mod, size = 16) {
    return renderModuleIcon(mod, size, { createIcon });
}

const EMPTY_SHELL_PORTS = Object.freeze({
    capabilityHealth: null,
    counter: null,
    exportModule: null,
    storage: null,
    addStyle: null,
    notifications: null
});

function validateCapabilityHealthPort(port) {
    if (port == null) return null;
    if (typeof port !== 'object'
        || typeof port.getSnapshot !== 'function'
        || typeof port.subscribe !== 'function') {
        throw new TypeError('Panel capabilityHealth port requires getSnapshot() and subscribe()');
    }
    return port;
}

function validateStoragePort(port) {
    if (port == null) return null;
    if (typeof port !== 'object' || typeof port.get !== 'function' || typeof port.set !== 'function') {
        throw new TypeError('Panel storage port requires get() and set()');
    }
    return port;
}

function validateObjectPort(port, name) {
    if (port == null) return null;
    if (typeof port !== 'object') throw new TypeError(`Panel ${name} port must be an object`);
    return port;
}

function validateStylePort(port) {
    if (port == null) return null;
    if (typeof port !== 'function') throw new TypeError('Panel addStyle port must be a function');
    return port;
}

function validateNotificationPort(port) {
    if (port == null) return null;
    if (typeof port !== 'object' || typeof port.announce !== 'function') {
        throw new TypeError('Panel notifications port requires announce()');
    }
    return port;
}

const SHELL_PORT_VALIDATORS = Object.freeze({
    capabilityHealth: validateCapabilityHealthPort,
    counter: port => validateObjectPort(port, 'counter'),
    exportModule: port => validateObjectPort(port, 'exportModule'),
    storage: validateStoragePort,
    addStyle: validateStylePort,
    notifications: validateNotificationPort
});

export const PanelUI = {
    _activeTab: 'stats',
    _shellPorts: EMPTY_SHELL_PORTS,
    _presenter: null,
    configureShellPorts(ports = {}) {
        if (!ports || typeof ports !== 'object' || Array.isArray(ports)) {
            throw new TypeError('Panel shell ports must be an object');
        }
        const next = { ...this._shellPorts };
        for (const [name, value] of Object.entries(ports)) {
            const validate = SHELL_PORT_VALIDATORS[name];
            if (!validate) throw new TypeError(`Unknown panel shell port: ${name}`);
            next[name] = validate(value);
        }
        if (next.counter !== this._shellPorts.counter) this._presenter = null;
        this._shellPorts = Object.freeze(next);
        return this._shellPorts;
    },
    getShellPort(name) {
        return Object.hasOwn(this._shellPorts, name) ? this._shellPorts[name] : null;
    },
    _requireShellPort(name) {
        const port = this.getShellPort(name);
        if (port == null) throw new Error(`Panel shell port is not configured: ${name}`);
        return port;
    },
    _getPresenter() {
        if (!this._presenter) {
            this._presenter = createPanelPresenter({
                document,
                counter: this._requireShellPort('counter'),
                core: Core,
                quotaColors: QUOTA_COLORS,
                tempUser: TEMP_USER,
                panelId: PANEL_ID,
                translate: (zh, en) => NativeUI.t(zh, en),
                getTheme: getCurrentTheme,
                setTheme: setCurrentTheme,
                createIcon,
                setIconText,
                openDashboard: () => this.openDashboard(),
                openSettings: () => this.openSettingsModal(),
                renderDetails: () => this.renderDetailsPane()
            });
        }
        return this._presenter;
    },
    announce(message, options = {}) {
        if (typeof message !== 'string' || message.trim() === '') {
            throw new TypeError('Panel announcement requires a non-empty message');
        }
        return this._requireShellPort('notifications').announce(message, options);
    },
    // --- 样式注入 ---
    injectStyles() {
        return injectPanelShellStyles({
            panelId: PANEL_ID,
            addStyle: this._requireShellPort('addStyle')
        });
    },

    // --- 面板创建 ---
    create() {
        try {
            const counter = this._requireShellPort('counter');
            const storage = this._requireShellPort('storage');
            const existing = document.getElementById(PANEL_ID);
            if (existing) {
                if (this._isPanelComplete(existing)) {
                    this.update();
                    return;
                }
                existing.remove();
            }
            this._layout?.destroy();
            this._layout = null;
            this._getPresenter().reset();
            this._prevTabIds = null;

            const layout = createPanelLayout({
                document,
                panelId: PANEL_ID,
                expanded: counter.state.isExpanded,
                translate: (zh, en) => NativeUI.t(zh, en),
                createIcon,
                onToggle: () => this.toggleDetails(),
                onReset: () => counter.handleReset()
            });
            this._layout = layout;
            let pos = DEFAULT_POS;
            try { pos = storage.get(GLOBAL_KEYS.POS, DEFAULT_POS); } catch (e) { /* silent */ }
            this.applyPos(layout.container, pos);
            Core.applyTheme(layout.container, getCurrentTheme());
            document.body.appendChild(layout.container);
            this.makeDraggable(layout.container, layout.header);
            if (counter.state.isExpanded) this.renderDetailsPane();
            this._syncDetailsDisclosure(counter.state.isExpanded);
            this.update();

            if (!this._localeUnsubscribe) {
                this._localeUnsubscribe = NativeUI.subscribeLocale(() => {
                    if (!this._isPanelComplete(document.getElementById(PANEL_ID))) return;
                    this._getPresenter().reset();
                    this._prevTabIds = null;
                    this._syncDetailsDisclosure(counter.state.isExpanded);
                    if (counter.state.isExpanded) this.renderDetailsPane();
                    this.update();
                });
            }
        } catch (error) {
            console.error('Panel init error', error);
        }
    },

    _isPanelComplete(container) {
        return isPanelLayoutComplete(container);
    },

    // --- 详情面板渲染 (optimized: separate tab bar from content) ---
    _prevTabIds: null,

    renderDetailsPane() {
        const counter = this._requireShellPort('counter');
        const pane = document.getElementById('g-details-pane');
        if (!pane) return;
        if (!counter.state.isExpanded && !pane.classList.contains('expanded')) return;

        const tabs = [{ id: 'stats', iconName: 'chart', label: NativeUI.t('统计', 'Statistics') }];
        for (const [id, mod] of Object.entries(ModuleRegistry.modules)) {
            if (mod && ModuleRegistry.isEnabled(id) && typeof mod.renderToDetailsPane === 'function') {
                tabs.push({
                    id,
                    iconName: MODULE_ICON_MAP[id] || null,
                    icon: mod.icon,
                    label: mod.name || id
                });
            }
        }
        if (!this._detailsController) {
            this._detailsController = createDetailsController({
                document,
                activeId: this._activeTab,
                translate: (zh, en) => NativeUI.t(zh, en),
                createIcon,
                onActiveChange: id => { this._activeTab = id; },
                onError: error => console.error('Details pane render error', error),
                renderContent: (id, content) => {
                    if (id === 'stats') {
                        this._renderStatsTab(content);
                        return;
                    }
                    const mod = ModuleRegistry.modules[id];
                    if (mod && typeof mod.renderToDetailsPane === 'function') mod.renderToDetailsPane(content);
                }
            });
        }
        this._detailsController.setActive(this._activeTab);
        this._detailsController.render(pane, tabs);
    },

    openModule(id) {
        if (typeof id !== 'string' || id.trim() === '') throw new TypeError('Panel module id must be a string');
        const moduleId = id.trim();
        const module = ModuleRegistry.modules[moduleId];
        if (!module || !ModuleRegistry.isEnabled(moduleId) || typeof module.renderToDetailsPane !== 'function') {
            return false;
        }
        const counter = this._requireShellPort('counter');
        counter.state.isExpanded = true;
        let pane = document.getElementById('g-details-pane');
        if (!pane) {
            this.create();
            pane = document.getElementById('g-details-pane');
        }
        if (!pane) return false;
        pane.classList.add('expanded');
        this._activeTab = moduleId;
        this._syncDetailsDisclosure(true);
        this.renderDetailsPane();
        this._detailsController?.focusActive();
        return true;
    },

    _renderStatsTab(pane) {
        return this._getPresenter().renderStats(pane);
    },

    createSectionTitle(text) {
        return this._getPresenter().sectionTitle(text);
    },

    _formatQuotaWindowText(windowState) {
        return this._getPresenter().formatQuotaWindow(windowState);
    },

    createPassiveRow(label, val) {
        return this._getPresenter().passiveRow(label, val);
    },

    createRow(label, mode, val) {
        return this._getPresenter().selectableRow(label, mode, val);
    },

    // --- UI 更新 (with dirty-checking) ---
    _prev: {},

    update() {
        return this._getPresenter().update();
    },

    toggleDetails() {
        const cm = this._requireShellPort('counter');
        cm.state.isExpanded = !cm.state.isExpanded;
        const pane = document.getElementById('g-details-pane');
        if (pane) {
            if (cm.state.isExpanded) {
                pane.classList.add('expanded');
                this.renderDetailsPane();
            } else {
                pane.classList.remove('expanded');
                cm.state.resetStep = 0;
            }
            this._syncDetailsDisclosure(cm.state.isExpanded);
            this.update();
        }
    },

    _syncDetailsDisclosure(expanded) {
        return syncPanelDisclosure({
            document,
            expanded,
            translate: (zh, en) => NativeUI.t(zh, en)
        });
    },

    // --- 位置管理 ---
    applyPos(element, position) {
        return applyPanelPosition({
            element,
            position,
            viewport: window,
            fallback: DEFAULT_POS,
            onWarning: message => console.warn(`💎 ${message}`),
            onReset: fallback => {
                try { this._requireShellPort('storage').set(GLOBAL_KEYS.POS, fallback); } catch {}
            }
        });
    },

    makeDraggable(element, handle) {
        if (!this._dragController) {
            this._dragController = createDragController({
                document,
                window,
                persist: position => {
                    try { this._requireShellPort('storage').set(GLOBAL_KEYS.POS, position); } catch {}
                }
            });
        }
        return this._dragController.attach(element, handle);
    },

    destroy() {
        this._dragController?.destroy();
        this._detailsController?.destroy();
        this._layout?.destroy();
        this._localeUnsubscribe?.();
        this._presenter = null;
        this._dragController = null;
        this._detailsController = null;
        this._layout = null;
        this._localeUnsubscribe = null;
    },

    // --- Delegated modals (extracted to panel_settings.js / panel_dashboard.js) ---
    openSettingsModal: _openSettingsModal,
    showOnboarding: _showOnboarding,
    openDebugModal: _openDebugModal,
    openCalibrationModal: _openCalibrationModal,
    openDashboard: _openDashboard
};
