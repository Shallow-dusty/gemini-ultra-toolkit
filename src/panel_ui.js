import { GLOBAL_KEYS, QUOTA_COLORS, PANEL_ID, DEFAULT_POS, TEMP_USER, VERSION } from './constants.js';
import { formatLocalDate } from '../lib/date_utils.js';
import { createIcon } from './icons.js';
import { Core } from './core.js';
import { ModuleRegistry } from './module_registry.js';
import { getCurrentTheme, setCurrentTheme } from './state.js';
import { CounterModule } from './modules/counter.js';
import { NativeUI } from './native_ui.js';
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
export const MODULE_ICON_MAP = {
    'counter': 'chart',
    'export': 'upload',
    'folders': 'folder',
    'prompt-vault': 'gem',
    'default-model': 'bot',
    'batch-delete': 'trash',
    'quote-reply': 'quote',
    'ui-tweaks': 'palette'
};

/** Set element content to [SVG icon] + text (CSP-safe) */
export function setIconText(el, iconName, text, iconSize = 14) {
    el.textContent = '';
    el.appendChild(createIcon(iconName, iconSize));
    if (text) el.appendChild(document.createTextNode(' ' + text));
}

/** Render a module's icon as SVG, fallback to emoji */
export function renderModIcon(mod, size = 16) {
    const name = MODULE_ICON_MAP[mod.id];
    if (name) return createIcon(name, size);
    const span = document.createElement('span');
    span.textContent = mod.icon;
    return span;
}

export const PanelUI = {
    _activeTab: 'stats',
    // --- 样式注入 ---
    injectStyles() {
        GM_addStyle(`
            #${PANEL_ID} {
                --bg: #202124; --text-main: #fff; --text-sub: #ccc; --accent: #8ab4f8;
                --blur: 18px; --saturate: 180%;
                position: fixed; z-index: 2147483647; width: 170px;
                background: var(--bg);
                backdrop-filter: blur(var(--blur)) saturate(var(--saturate));
                -webkit-backdrop-filter: blur(var(--blur)) saturate(var(--saturate));
                border: 1px solid var(--border); border-radius: 16px;
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                box-shadow: var(--shadow), var(--border-highlight, inset 0 0 0 transparent);
                font-family: 'Google Sans', Roboto, sans-serif;
                overflow: hidden; user-select: none;
                display: flex; flex-direction: column;
                transition: height 0.35s cubic-bezier(0.19, 1, 0.22, 1),
                            background 0.3s cubic-bezier(0.19, 1, 0.22, 1),
                            box-shadow 0.4s cubic-bezier(0.19, 1, 0.22, 1),
                            transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
            }
            #${PANEL_ID}:hover {
                box-shadow: var(--shadow-hover, var(--shadow)), var(--border-highlight, inset 0 0 0 transparent);
                transform: translateY(-2px);
            }
            .gemini-header {
                padding: 8px 14px; cursor: grab;
                background: var(--header-bg, rgba(255, 255, 255, 0.03));
                border-bottom: 1px solid var(--header-border, rgba(255, 255, 255, 0.05));
                display: flex; align-items: center; justify-content: space-between; height: 32px;
            }
            .user-capsule {
                display: flex; align-items: center; gap: 4px;
                font-size: 10px; color: var(--text-sub);
                background: var(--badge-bg, rgba(255,255,255,0.05));
                padding: 2px 8px; border-radius: 12px; border: 1px solid transparent;
                max-width: 120px; overflow: hidden;
            }
            .acct-badge-inline {
                font-size: 8px; font-weight: 600; letter-spacing: 0.4px;
                padding: 1px 5px; border-radius: 10px;
                background: var(--badge-bg, rgba(255,255,255,0.06));
                color: var(--text-sub);
                text-transform: uppercase;
                flex-shrink: 0;
            }
            .acct-badge-inline[data-tier="pro"] {
                background: rgba(138,180,248,0.2);
                color: #8ab4f8;
            }
            .acct-badge-inline[data-tier="ultra"] {
                background: rgba(251,188,4,0.2);
                color: #fbbc04;
            }
            .user-capsule.viewing-other { border-color: #fdbd00; color: #fdbd00; }
            .user-avatar-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
            .gemini-toggle-btn { cursor: pointer; font-size: 14px; opacity: 0.6; color: var(--text-sub);
                transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
            .gemini-toggle-btn:hover { opacity: 1; color: var(--accent); }
            .gemini-main-view { padding: 12px 14px 14px; text-align: center; }
            .gemini-big-num {
                font-size: 40px; font-weight: 400; color: var(--text-main); line-height: 1;
                margin-bottom: 4px; text-shadow: 0 0 20px rgba(128, 128, 128, 0.1);
                transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .gemini-big-num.bump {
                animation: numBump 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            @keyframes numBump {
                0%   { transform: scale(1); }
                40%  { transform: scale(1.15); }
                100% { transform: scale(1); }
            }

            /* --- 模型 & 配额 --- */
            .gemini-model-row {
                display: flex; align-items: center; justify-content: center; gap: 6px;
                margin-bottom: 6px;
            }
            .model-badge {
                font-size: 9px; font-weight: 700; letter-spacing: 0.6px;
                padding: 2px 7px; border-radius: 6px;
                line-height: 1.4;
                border: 1px solid var(--divider, rgba(255,255,255,0.15));
            }
            .quota-bar-wrap {
                margin: 6px 0 8px; height: 4px; border-radius: 2px;
                background: var(--btn-bg); overflow: hidden;
                position: relative;
            }
            .quota-bar-fill {
                height: 100%; border-radius: 2px;
                transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                            background 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .quota-label {
                font-size: 9px; color: var(--text-sub); opacity: 0.6;
                margin-bottom: 8px; font-family: monospace;
            }

            .gemini-sub-info {
                font-size: 10px; color: var(--text-sub); margin-bottom: 8px;
                font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .gemini-details-view {
                height: 0; opacity: 0; overflow: hidden; background: var(--detail-bg, rgba(0,0,0,0.1));
                padding: 0 12px;
                transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                            padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .gemini-details-view.expanded { height: auto; opacity: 1; padding: 10px 12px 14px 12px; border-top: 1px solid var(--border); max-height: 420px; overflow-y: auto; }
            .section-title {
                font-size: 9px; color: var(--text-sub); opacity: 0.5;
                margin: 8px 0 4px 0; text-transform: uppercase; letter-spacing: 1px;
            }
            .detail-row {
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 4px; font-size: 11px; color: var(--text-sub); cursor: pointer;
                padding: 5px 8px; border-radius: 6px;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .detail-row:hover { background: var(--row-hover); color: var(--text-main); }
            .detail-row:active { transform: scale(0.98); }
            .detail-row.active-mode { background: rgba(138, 180, 248, 0.15); color: var(--accent); font-weight: 500; }
            .user-row { justify-content: flex-start; gap: 6px; }
            .user-row.is-me { border-left: 2px solid var(--accent); }
            .user-indicator { font-size: 8px; padding: 1px 4px; border-radius: 4px; background: var(--accent); color: #000; }
            .g-btn {
                background: var(--btn-bg); border: 1px solid transparent;
                color: var(--text-sub); border-radius: 8px; padding: 6px 0; font-size: 11px;
                cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); width: 100%;
            }
            .g-btn:hover { background: var(--row-hover); color: var(--text-main); }
            .g-btn:focus-visible,
            .settings-btn:focus-visible,
            .settings-select:focus-visible,
            .settings-close:focus-visible,
            .onboarding-close:focus-visible,
            .dash-close:focus-visible,
            .debug-close:focus-visible,
            .detail-row:focus-visible,
            .onboarding-lang-btn:focus-visible,
            .gc-native-btn:focus-visible,
            .gc-dropdown-item:focus-visible {
                outline: 2px solid var(--accent, #8ab4f8);
                outline-offset: 2px;
            }
            .g-btn:active { transform: scale(0.97); opacity: 0.85; }
            .g-btn.danger-1 { color: #f28b82; border-color: #f28b82; }
            .g-btn.danger-2 { background: #f28b82; color: #202124; font-weight: bold; }
            .g-btn.disabled { opacity: 0.5; cursor: not-allowed; }

            /* Settings Modal */
            @keyframes modalIn {
                0% { opacity: 0; transform: translateY(16px) scale(0.96); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes overlayIn {
                from { opacity: 0; }
                to   { opacity: 1; }
            }
            .settings-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: var(--overlay-tint, rgba(0,0,0,0.6)); z-index: 2147483646;
                display: flex; align-items: center; justify-content: center;
                animation: overlayIn 0.2s ease-out;
            }
            .settings-modal {
                width: 300px; max-height: 80vh; overflow-y: auto;
                background: var(--bg, #202124); border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
                font-family: 'Google Sans', Roboto, sans-serif;
                animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .settings-header {
                padding: 12px 16px; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.1));
                display: flex; justify-content: space-between; align-items: center;
            }
            .settings-header h3 { margin: 0; font-size: 14px; color: var(--text-main, #fff); font-weight: 500; }
            .settings-close { cursor: pointer; font-size: 18px; color: var(--text-sub, #9aa0a6); }
            .settings-close:hover { color: var(--accent, #8ab4f8); }
            .settings-body { padding: 12px 16px; }
            .settings-section { margin-bottom: 16px; }
            .settings-section-title { font-size: 10px; color: var(--text-sub, #9aa0a6); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
            .settings-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 8px 0; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.05));
            }
            .settings-row:last-child { border-bottom: none; }
            .settings-label { font-size: 12px; color: var(--text-main, #fff); }
            .settings-select {
                background: var(--btn-bg, rgba(255,255,255,0.05)); border: 1px solid var(--border, rgba(255,255,255,0.1));
                color: var(--text-main, #fff); border-radius: 6px; padding: 4px 8px; font-size: 11px;
            }
            .settings-btn {
                background: var(--btn-bg, rgba(255,255,255,0.05)); border: 1px solid transparent;
                color: var(--text-sub, #9aa0a6); border-radius: 8px; padding: 8px 12px; font-size: 11px;
                cursor: pointer; transition: all 0.2s; width: 100%; margin-top: 4px;
            }
            .settings-btn:hover { background: var(--row-hover, rgba(255,255,255,0.05)); color: var(--text-main, #fff); }
            .settings-btn:active { transform: scale(0.97); opacity: 0.85; }
            .settings-btn.danger { color: #f28b82; border-color: #f28b82; }
            .settings-version { font-size: 10px; color: var(--text-sub, #9aa0a6); text-align: center; padding: 8px; opacity: 0.6; }

            /* Debug Modal */
            .debug-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: var(--overlay-tint, rgba(0,0,0,0.6)); z-index: 2147483646;
                display: flex; align-items: center; justify-content: center;
                animation: overlayIn 0.2s ease-out;
            }
            .debug-modal {
                width: 520px; max-width: 95vw; max-height: 85vh; overflow-y: auto;
                background: var(--bg, #202124); border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
                font-family: 'Google Sans', Roboto, sans-serif;
                animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .debug-header {
                padding: 12px 16px; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.1));
                display: flex; justify-content: space-between; align-items: center;
            }
            .debug-header h3 { margin: 0; font-size: 14px; color: var(--text-main, #fff); font-weight: 500; }
            .debug-close { cursor: pointer; font-size: 18px; color: var(--text-sub, #9aa0a6); }
            .debug-close:hover { color: var(--accent, #8ab4f8); }
            .debug-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
            .debug-kv { font-size: 11px; color: var(--text-sub); line-height: 1.6; }
            .debug-kv strong { color: var(--text-main); font-weight: 500; }
            .debug-actions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .debug-log-list {
                background: var(--code-bg, rgba(0,0,0,0.3)); border: 1px solid var(--divider, rgba(255,255,255,0.08));
                border-radius: 8px; padding: 8px; max-height: 240px; overflow: auto;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size: 10px; color: var(--text-sub);
            }
            .debug-log-item { padding: 2px 0; border-bottom: 1px dashed var(--divider, rgba(255,255,255,0.05)); }
            .debug-log-item:last-child { border-bottom: none; }
            .debug-filter-row { display: flex; gap: 6px; flex-wrap: wrap; }
            .debug-filter-btn {
                font-size: 10px; padding: 4px 8px; border-radius: 6px;
                border: 1px solid var(--divider, rgba(255,255,255,0.1));
                background: var(--input-bg, rgba(255,255,255,0.05));
                color: var(--text-sub); cursor: pointer;
            }
            .debug-filter-btn.active { color: var(--text-main); border-color: var(--accent); }
            .debug-search {
                background: var(--code-bg, rgba(0,0,0,0.3));
                border: 1px solid var(--divider, rgba(255,255,255,0.1));
                color: var(--text-main); border-radius: 6px; padding: 4px 8px;
                font-size: 10px; width: 100%;
            }
            .debug-level { font-weight: 700; letter-spacing: 0.3px; }
            .debug-level.error { color: #f28b82; }
            .debug-level.warn { color: #fbbc04; }
            .debug-level.info { color: #8ab4f8; }
            .debug-level.debug { color: #81c995; }

            /* Module Toggle */
            .module-toggle-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 0; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.05));
            }
            .module-info { display: flex; align-items: center; gap: 8px; }
            .module-icon { font-size: 16px; display: inline-flex; align-items: center; }
            .module-text { display: flex; flex-direction: column; }
            .module-name { font-size: 12px; color: var(--text-main, #fff); }
            .module-desc { font-size: 9px; color: var(--text-sub, #9aa0a6); opacity: 0.7; }
            .toggle-switch {
                position: relative; width: 36px; height: 20px;
                background: var(--btn-bg, rgba(255,255,255,0.1)); border-radius: 10px;
                cursor: pointer; transition: background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .toggle-switch.on { background: var(--accent, #8ab4f8); }
            .toggle-switch::after {
                content: ''; position: absolute; top: 2px; left: 2px;
                width: 16px; height: 16px; background: #fff; border-radius: 50%;
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            }
            .toggle-switch.on::after { transform: translateX(16px); }

            /* --- Dashboard Styles --- */
            .dash-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: var(--overlay-tint, rgba(0,0,0,0.85)); z-index: 2147483645;
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(5px);
                animation: overlayIn 0.2s ease-out;
            }
            .dash-modal {
                width: 800px; max-width: 95vw; max-height: 90vh; overflow-y: auto;
                background: var(--bg); border: 1px solid var(--border);
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 24px; box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2);
                display: flex; flex-direction: column;
                animation: modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .dash-header {
                padding: 24px 32px; border-bottom: 1px solid var(--border);
                display: flex; justify-content: space-between; align-items: center;
            }
            .dash-title { font-size: 24px; font-weight: 300; color: var(--text-main); display: flex; align-items: center; gap: 12px; }
            .dash-close { font-size: 28px; color: var(--text-sub); cursor: pointer; transition: 0.2s; }
            .dash-close:hover { color: var(--accent); transform: scale(1.1); }

            .dash-content { padding: 32px; display: flex; flex-direction: column; gap: 32px; }

            /* Metric Cards */
            .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
            .metric-card {
                background: var(--input-bg, rgba(255,255,255,0.03)); border: 1px solid var(--border);
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 16px; padding: 20px; text-align: center;
                transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s;
            }
            .metric-card:hover { transform: translateY(-3px); background: var(--row-hover, rgba(255,255,255,0.06)); box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
            .metric-val { font-size: 32px; color: var(--text-main); font-weight: 300; margin-bottom: 4px; }
            .metric-label { font-size: 12px; color: var(--text-sub); text-transform: uppercase; letter-spacing: 1px; }

            /* Heatmap */
            .heatmap-container {
                background: var(--input-bg, rgba(255,255,255,0.03)); border: 1px solid var(--border);
                border-radius: 16px; padding: 24px; overflow-x: auto;
            }
            .heatmap-title { font-size: 14px; color: var(--text-main); margin-bottom: 16px; display: flex; justify-content: space-between; }
            .heatmap-grid { display: flex; gap: 4px; }
            .heatmap-col { display: flex; flex-direction: column; gap: 4px; }
            .heatmap-cell {
                width: 12px; height: 12px; border-radius: 3px;
                background: var(--btn-bg, rgba(255,255,255,0.1)); position: relative;
                transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .heatmap-cell:hover { transform: scale(1.4); z-index: 10; outline: 1.5px solid var(--accent); outline-offset: 0.5px; }
            .heatmap-legend { display: flex; gap: 4px; align-items: center; font-size: 10px; color: var(--text-sub); }
            .legend-item { width: 10px; height: 10px; border-radius: 2px; }

            .heatmap-wrapper { display: flex; gap: 8px; }
            .heatmap-week-labels { display: flex; flex-direction: column; gap: 4px; padding-top: 18px; }
            .week-label { height: 12px; font-size: 9px; line-height: 12px; color: var(--text-sub); opacity: 0.7; }

            .heatmap-main { display: flex; flex-direction: column; }
            .heatmap-months { display: flex; gap: 4px; margin-bottom: 6px; height: 12px; }
            .month-label { width: 12px; font-size: 9px; color: var(--text-sub); overflow: visible; white-space: nowrap; }

            /* Custom Tooltip */
            .g-tooltip {
                position: fixed; background: rgba(0,0,0,0.9); border: 1px solid var(--border);
                color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 10px;
                pointer-events: none; z-index: 2147483647; opacity: 0; transition: opacity 0.1s;
                transform: translate(-50%, -100%); margin-top: -8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            }
            .g-tooltip.visible { opacity: 1; }

            /* Level Colors */
            .l-0 { background: var(--btn-bg, rgba(255,255,255,0.05)); }
            .l-1 { background: rgba(138, 180, 248, 0.2); }
            .l-2 { background: rgba(138, 180, 248, 0.4); }
            .l-3 { background: rgba(138, 180, 248, 0.7); }
            .l-4 { background: rgba(138, 180, 248, 1.0); }

            /* Details Pane Tab Bar */
            .details-tab-bar {
                display: flex; gap: 2px; padding: 0 0 8px 0;
                border-bottom: 1px solid var(--divider, rgba(255,255,255,0.05));
                margin-bottom: 8px;
            }
            .details-tab {
                flex: 1; padding: 5px 0; text-align: center;
                font-size: 12px; cursor: pointer; border-radius: 6px;
                color: var(--text-sub); transition: all 0.2s;
                background: transparent;
            }
            .details-tab:hover { background: var(--row-hover); color: var(--text-main); }
            .details-tab.active {
                background: var(--accent); color: #000; font-weight: 600;
            }

            /* Module Toggle Compact */
            .module-toggle-compact {
                display: flex; justify-content: space-between; align-items: center;
                padding: 6px 0; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.05));
            }
            .module-compact-label {
                display: flex; align-items: center; gap: 6px;
                font-size: 11px; color: var(--text-main);
            }
            .module-compact-label .module-icon { font-size: 14px; }

            /* Onboarding Modal */
            .onboarding-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: var(--overlay-tint, rgba(0,0,0,0.7)); z-index: 2147483647;
                display: flex; align-items: center; justify-content: center;
                animation: overlayIn 0.2s ease-out;
            }
            .onboarding-modal {
                width: 400px; max-width: 92vw; max-height: 80vh; overflow-y: auto;
                background: var(--bg, #202124); border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2);
                font-family: 'Google Sans', Roboto, sans-serif;
                animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .onboarding-header {
                padding: 16px 20px; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.08));
                display: flex; justify-content: space-between; align-items: center;
            }
            .onboarding-header h3 { margin: 0; font-size: 16px; color: var(--text-main, #fff); font-weight: 500; }
            .onboarding-close { cursor: pointer; font-size: 18px; color: var(--text-sub, #9aa0a6); }
            .onboarding-close:hover { color: var(--accent, #8ab4f8); }
            .onboarding-body { padding: 16px 20px; }
            .onboarding-section { margin-bottom: 16px; }
            .onboarding-section-title {
                font-size: 13px; font-weight: 600; color: var(--accent, #8ab4f8);
                margin-bottom: 6px;
            }
            .onboarding-text {
                font-size: 12px; color: var(--text-sub, #9aa0a6); line-height: 1.6;
                white-space: pre-line;
            }
            .onboarding-footer {
                padding: 12px 20px; border-top: 1px solid var(--divider, rgba(255,255,255,0.08));
                display: flex; justify-content: space-between; align-items: center;
            }
            .onboarding-lang-btn {
                background: var(--btn-bg, rgba(255,255,255,0.06)); border: 1px solid var(--border);
                color: var(--text-sub); border-radius: 8px; padding: 4px 10px;
                font-size: 11px; cursor: pointer;
            }
            .onboarding-lang-btn:hover { color: var(--text-main); }
            .onboarding-start-btn {
                background: var(--accent, #8ab4f8); color: #000; border: none;
                border-radius: 8px; padding: 6px 16px; font-size: 12px;
                font-weight: 600; cursor: pointer;
            }
            .onboarding-start-btn:hover { opacity: 0.9; }
            .onboarding-info-btn {
                font-size: 11px; color: var(--text-sub, #9aa0a6); cursor: pointer;
                opacity: 0.5; margin-left: 4px;
            }
            .onboarding-info-btn:hover { opacity: 1; color: var(--accent, #8ab4f8); }

            /* Native UI shared styles */
            .gc-native-btn {
                background: transparent; border: none; cursor: pointer;
                font-size: 16px; padding: 4px 6px; border-radius: 50%;
                transition: background 0.2s;
                line-height: 1;
            }
            .gc-native-btn:hover { background: rgba(128,128,128,0.2); }
            .gc-dropdown-menu {
                position: absolute; z-index: 2147483646;
                background: var(--bg, #303134); border: 1px solid rgba(255,255,255,0.12);
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 12px 32px rgba(0,0,0,0.2);
                padding: 4px 0; min-width: 160px;
                font-family: 'Google Sans', Roboto, sans-serif;
                animation: modalIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .gc-dropdown-item {
                padding: 8px 16px; font-size: 13px; color: #e8eaed;
                cursor: pointer; display: flex; align-items: center; gap: 8px;
            }
            .gc-dropdown-item:hover { background: rgba(255,255,255,0.08); }
            @media (prefers-reduced-motion: reduce) {
                #gemini-monitor-panel-v7 *,
                .settings-overlay *,
                .debug-overlay *,
                .dash-overlay *,
                .onboarding-overlay *,
                .settings-overlay,
                .debug-overlay,
                .dash-overlay,
                .onboarding-overlay {
                    animation-duration: 0.01ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.01ms !important;
                    scroll-behavior: auto !important;
                }
            }
        `);
    },

    // --- 面板创建 ---
    create() {
        try {
            const existing = document.getElementById(PANEL_ID);
            if (existing) {
                if (this._isPanelComplete(existing)) {
                    this.update();
                    return;
                }
                existing.remove();
            }
            this._prev = {};
            this._prevTabIds = null;

            const container = document.createElement('div');
            container.id = PANEL_ID;
            container.className = 'notranslate';
            container.setAttribute('translate', 'no');
            let pos = DEFAULT_POS;
            try { pos = GM_getValue(GLOBAL_KEYS.POS, DEFAULT_POS); } catch (e) { /* silent */ }
            this.applyPos(container, pos);
            Core.applyTheme(container, getCurrentTheme());

            // Header
            const header = document.createElement('div');
            header.className = 'gemini-header';
            const userCapsule = document.createElement('div');
            userCapsule.id = 'g-user-capsule';
            userCapsule.className = 'user-capsule';
            const toggle = document.createElement('span');
            toggle.className = 'gemini-toggle-btn';
            toggle.appendChild(createIcon('menu', 14));
            toggle.onpointerdown = (e) => e.stopPropagation();
            toggle.onclick = () => this.toggleDetails();
            header.appendChild(userCapsule);
            header.appendChild(toggle);

            // Main View
            const mainView = document.createElement('div');
            mainView.className = 'gemini-main-view';

            const bigDisplay = document.createElement('div');
            bigDisplay.id = 'g-big-display';
            bigDisplay.className = 'gemini-big-num';
            bigDisplay.textContent = '0';

            const modelRow = document.createElement('div');
            modelRow.id = 'g-model-row';
            modelRow.className = 'gemini-model-row';

            const modelBadge = document.createElement('span');
            modelBadge.id = 'g-model-badge';
            modelBadge.className = 'model-badge';

            modelRow.appendChild(modelBadge);

            const subInfo = document.createElement('div');
            subInfo.id = 'g-sub-info';
            subInfo.className = 'gemini-sub-info';
            subInfo.textContent = NativeUI.t('今天', 'Today');

            const quotaWrap = document.createElement('div');
            quotaWrap.id = 'g-quota-wrap';
            quotaWrap.className = 'quota-bar-wrap';
            const quotaFill = document.createElement('div');
            quotaFill.id = 'g-quota-fill';
            quotaFill.className = 'quota-bar-fill';
            quotaWrap.appendChild(quotaFill);

            const quotaLabel = document.createElement('div');
            quotaLabel.id = 'g-quota-label';
            quotaLabel.className = 'quota-label';

            const actionBtn = document.createElement('button');
            actionBtn.id = 'g-action-btn';
            actionBtn.className = 'g-btn';
            actionBtn.textContent = NativeUI.t('重置今天', 'Reset Today');
            actionBtn.onclick = () => CounterModule.handleReset();
            actionBtn.onpointerdown = (e) => e.stopPropagation();

            mainView.appendChild(bigDisplay);
            mainView.appendChild(modelRow);
            mainView.appendChild(subInfo);
            mainView.appendChild(quotaWrap);
            mainView.appendChild(quotaLabel);
            mainView.appendChild(actionBtn);

            // Details Pane
            const details = document.createElement('div');
            details.id = 'g-details-pane';
            details.className = 'gemini-details-view';

            container.appendChild(header);
            container.appendChild(mainView);
            container.appendChild(details);
            document.body.appendChild(container);

            this.makeDraggable(container, header);
            if (CounterModule.state.isExpanded) {
                details.classList.add('expanded');
                this.renderDetailsPane();
            }
            this.update();

        } catch (e) {
            console.error("Panel init error", e);
        }
    },

    _isPanelComplete(container) {
        return !!(
            container &&
            container.querySelector('#g-user-capsule') &&
            container.querySelector('#g-big-display') &&
            container.querySelector('#g-model-badge') &&
            container.querySelector('#g-action-btn') &&
            container.querySelector('#g-details-pane')
        );
    },

    // --- 详情面板渲染 (optimized: separate tab bar from content) ---
    _prevTabIds: null,

    renderDetailsPane() {
        const pane = document.getElementById('g-details-pane');
        if (!pane) return;
        if (!CounterModule.state.isExpanded && !pane.classList.contains('expanded')) return;

        // Collect available tabs
        const tabs = [{ id: 'stats', iconName: 'chart' }];
        Object.keys(ModuleRegistry.modules).forEach(id => {
            const mod = ModuleRegistry.modules[id];
            if (mod && ModuleRegistry.isEnabled(id) && typeof mod.renderToDetailsPane === 'function') {
                tabs.push({ id, iconName: MODULE_ICON_MAP[id] || null, icon: mod.icon });
            }
        });

        if (!tabs.find(t => t.id === this._activeTab)) this._activeTab = 'stats';

        const tabIds = tabs.map(t => t.id).join(',');
        const tabBarChanged = tabIds !== this._prevTabIds;

        // Rebuild tab bar only when tab set changes
        if (tabBarChanged) {
            pane.replaceChildren();
            this._prevTabIds = tabIds;

            if (tabs.length > 1) {
                const tabBar = document.createElement('div');
                tabBar.id = 'g-details-tab-bar';
                tabBar.className = 'details-tab-bar';
                tabs.forEach(t => {
                    const tab = document.createElement('div');
                    tab.className = `details-tab ${t.id === this._activeTab ? 'active' : ''}`;
                    tab.dataset.tabId = t.id;
                    if (t.iconName) {
                        tab.appendChild(createIcon(t.iconName, 14));
                    } else {
                        tab.textContent = t.icon;
                    }
                    tab.title = t.id;
                    tab.onclick = (e) => {
                        e.stopPropagation();
                        this._activeTab = t.id;
                        this._switchTabContent(pane, tabs);
                    };
                    tabBar.appendChild(tab);
                });
                pane.appendChild(tabBar);
            }

            const content = document.createElement('div');
            content.id = 'g-details-content';
            pane.appendChild(content);
        }

        this._switchTabContent(pane, tabs);
    },

    _switchTabContent(pane, tabs) {
        const content = document.getElementById('g-details-content') || pane;
        content.replaceChildren();

        // Update tab bar active states (without rebuilding)
        const tabBar = document.getElementById('g-details-tab-bar');
        if (tabBar) {
            tabBar.querySelectorAll('.details-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.tabId === this._activeTab);
            });
        }

        try {
            // Render active tab content
            if (this._activeTab === 'stats') {
                this._renderStatsTab(content);
            } else {
                const mod = ModuleRegistry.modules[this._activeTab];
                if (mod && typeof mod.renderToDetailsPane === 'function') {
                    mod.renderToDetailsPane(content);
                }
            }
        } catch (e) {
            console.error('Details pane render error', e);
            const fallback = document.createElement('div');
            fallback.className = 'detail-row';
            fallback.textContent = NativeUI.t('详情暂时无法渲染', 'Details unavailable');
            content.appendChild(fallback);
        }
    },

    // --- Stats tab content (original Statistics + Profiles + Themes + Actions) ---
    _renderStatsTab(pane) {
        const cm = CounterModule;
        const user = Core.getCurrentUser();
        const inspecting = Core.getInspectingUser();

        // Statistics
        pane.appendChild(this.createSectionTitle('Statistics'));
        const cid = Core.getChatId();
        pane.appendChild(this.createRow('Today', 'today', cm.getTodayMessages()));
        pane.appendChild(this.createRow('Current Chat', 'chat', cid ? (cm.state.chats[cid] || 0) : 0));
        pane.appendChild(this.createRow('Chats Created', 'chatsCreated', cm.state.totalChatsCreated));
        pane.appendChild(this.createRow('Lifetime', 'total', cm.state.total));

        // Model Breakdown (today)
        const byModel = cm.getTodayByModel();
        const hasModelData = byModel.flash || byModel.thinking || byModel.pro;
        if (hasModelData) {
            const modelRow = document.createElement('div');
            modelRow.className = 'detail-row model-breakdown';
            modelRow.style.cssText = 'display: flex; gap: 10px; font-size: 10px; padding: 4px 8px; color: var(--text-sub);';
            const models = [
                { key: 'flash', label: 'Flash', color: QUOTA_COLORS.safe },
                { key: 'thinking', label: 'Think', color: QUOTA_COLORS.warn },
                { key: 'pro', label: 'Pro', color: QUOTA_COLORS.danger }
            ];
            models.forEach(m => {
                const span = document.createElement('span');
                span.style.cssText = 'display: flex; align-items: center; gap: 3px;';
                const dot = document.createElement('span');
                dot.style.cssText = `width: 6px; height: 6px; border-radius: 50%; background: ${m.color}; display: inline-block;`;
                const num = document.createElement('span');
                num.textContent = byModel[m.key] || 0;
                span.appendChild(dot);
                span.appendChild(num);
                modelRow.appendChild(span);
            });
            pane.appendChild(modelRow);
        }

        // Profiles
        pane.appendChild(this.createSectionTitle(NativeUI.t('账号', 'Profiles')));
        const users = Core.getAllUsers();
        const sortedUsers = users.sort((a, b) => (a === user ? -1 : b === user ? 1 : a.localeCompare(b)));

        if (sortedUsers.length === 0 && user === TEMP_USER) {
            const row = document.createElement('div');
            row.className = 'detail-row';
            row.textContent = NativeUI.t('等待登录...', 'Waiting for login...');
            pane.appendChild(row);
        } else {
            sortedUsers.forEach(uid => {
                const row = document.createElement('div');
                row.className = `detail-row user-row ${uid === user ? 'is-me' : ''} ${uid === inspecting ? 'active-mode' : ''}`;
                row.onclick = (e) => {
                    e.stopPropagation();
                    Core.setInspectingUser(uid);
                    cm.loadDataForUser(uid);
                    cm.state.viewMode = 'total';
                    this.renderDetailsPane();
                };
                const nameSpan = document.createElement('span');
                nameSpan.textContent = uid.split('@')[0];
                row.appendChild(nameSpan);
                if (uid === user) {
                    const meBadge = document.createElement('span');
                    meBadge.className = 'user-indicator';
                    meBadge.textContent = NativeUI.t('我', 'ME');
                    row.appendChild(meBadge);
                }
                pane.appendChild(row);
            });
        }

        // Themes
        pane.appendChild(this.createSectionTitle(NativeUI.t('主题', 'Themes')));
        const themes = Core.getThemes();
        Object.keys(themes).forEach(key => {
            const row = document.createElement('div');
            row.className = `detail-row ${getCurrentTheme() === key ? 'active-mode' : ''}`;
            row.textContent = themes[key].name;
            row.onclick = (e) => {
                e.stopPropagation();
                Core.setTheme(key);
                setCurrentTheme(key);
                const panel = document.getElementById(PANEL_ID);
                Core.applyTheme(panel, key);
                this.renderDetailsPane();
            };
            pane.appendChild(row);
        });

        // Actions
        pane.appendChild(this.createSectionTitle(''));
        const actionsRow = document.createElement('div');
        actionsRow.style.display = 'flex';
        actionsRow.style.gap = '8px';

        const statsBtn = document.createElement('button');
        statsBtn.className = 'g-btn';
        statsBtn.textContent = '';
        setIconText(statsBtn, 'chart', NativeUI.t('统计', 'Stats'));
        statsBtn.style.flex = '1';
        statsBtn.onclick = (e) => { e.stopPropagation(); this.openDashboard(); };

        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'g-btn';
        settingsBtn.appendChild(createIcon('settings', 14));
        settingsBtn.style.width = '44px';
        settingsBtn.style.minWidth = '44px';
        settingsBtn.title = NativeUI.t('设置', 'Settings');
        settingsBtn.onclick = (e) => { e.stopPropagation(); this.openSettingsModal(); };

        actionsRow.appendChild(statsBtn);
        actionsRow.appendChild(settingsBtn);
        pane.appendChild(actionsRow);
    },

    createSectionTitle(text) {
        const div = document.createElement('div');
        div.className = 'section-title';
        div.textContent = text;
        return div;
    },

    createRow(label, mode, val) {
        const cm = CounterModule;
        const user = Core.getCurrentUser();
        const inspecting = Core.getInspectingUser();

        const row = document.createElement('div');
        row.className = `detail-row ${cm.state.viewMode === mode && inspecting === user ? 'active-mode' : ''}`;
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        const valSpan = document.createElement('span');
        valSpan.className = 'detail-val';
        valSpan.textContent = val;
        row.appendChild(labelSpan);
        row.appendChild(valSpan);
        row.onclick = (e) => {
            e.stopPropagation();
            if (inspecting !== user) {
                Core.setInspectingUser(user);
                cm.loadDataForUser(user);
            }
            cm.state.viewMode = mode;
            cm.state.resetStep = 0;
            this.update();
            this.renderDetailsPane();
        };
        return row;
    },

    // --- UI 更新 (with dirty-checking) ---
    _prev: {},

    update() {
        const cm = CounterModule;
        const user = Core.getCurrentUser();
        const inspecting = Core.getInspectingUser();

        const bigDisplay = document.getElementById('g-big-display');
        const subInfo = document.getElementById('g-sub-info');
        const actionBtn = document.getElementById('g-action-btn');
        const capsule = document.getElementById('g-user-capsule');
        const modelBadge = document.getElementById('g-model-badge');
        const quotaFill = document.getElementById('g-quota-fill');
        const quotaLabel = document.getElementById('g-quota-label');
        if (!bigDisplay || !subInfo || !actionBtn || !capsule || !modelBadge) return;

        const p = this._prev;

        // --- Compute all values first ---
        const isMe = inspecting === user;
        const displayName = inspecting === TEMP_USER ? 'Guest' : inspecting.split('@')[0];
        const accountType = cm.accountType || 'free';
        const modelKey = cm.currentModel;

        let val = 0, sub = "", btn = NativeUI.t('重置', 'Reset');
        let disableBtn = !isMe;

        if (cm.state.viewMode === 'today') {
            val = cm.getTodayMessages();
            sub = NativeUI.t(`今天（${cm.resetHour}:00 重置）`, `Today (Reset @${cm.resetHour}:00)`);
            btn = NativeUI.t('重置今天', 'Reset Today');
            if (!isMe) { sub = NativeUI.t(`今天（${inspecting.split('@')[0]}）`, `Today (${inspecting.split('@')[0]})`); }
        } else if (cm.state.viewMode === 'chat') {
            if (!isMe) {
                val = "--"; sub = NativeUI.t('不同上下文', 'Different Context'); disableBtn = true;
            } else {
                const cid = Core.getChatId();
                val = cid ? (cm.state.chats[cid] || 0) : 0;
                sub = cid ? `ID: ${cid.slice(0, 8)}...` : NativeUI.t('ID: 新对话', 'ID: New Chat');
                btn = NativeUI.t('重置对话', 'Reset Chat');
            }
        } else if (cm.state.viewMode === 'chatsCreated') {
            val = cm.state.totalChatsCreated;
            sub = NativeUI.t('创建对话数', 'Chats Created');
            btn = NativeUI.t('仅查看', 'View Only');
            disableBtn = true;
        } else if (cm.state.viewMode === 'total') {
            val = cm.state.total;
            sub = NativeUI.t('历史总计', 'Lifetime History');
            btn = NativeUI.t('清空历史', 'Clear History');
        }

        const used = cm.getTodayMessages();
        const weighted = cm.getWeightedQuota();
        const quotaPct = cm.quotaLimit > 0 ? Math.min((weighted / cm.quotaLimit) * 100, 100) : 0;
        const quotaColor = quotaPct < 60 ? QUOTA_COLORS.safe : quotaPct < 85 ? QUOTA_COLORS.warn : QUOTA_COLORS.danger;
        const weightedStr = weighted % 1 === 0 ? String(weighted) : weighted.toFixed(1);
        const quotaText = `${used} msgs (${weightedStr} weighted) / ${cm.quotaLimit}`;
        const resetStep = cm.state.resetStep;

        // --- Write DOM only for changed values ---

        // Capsule (most expensive — replaceChildren)
        if (p.displayName !== displayName || p.isMe !== isMe || p.accountType !== accountType) {
            capsule.replaceChildren();
            const dot = document.createElement('div');
            dot.className = 'user-avatar-dot';
            const name = document.createElement('span');
            name.textContent = displayName;
            name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            capsule.appendChild(dot);
            capsule.appendChild(name);

            if (accountType !== 'free') {
                const badge = document.createElement('span');
                badge.className = 'acct-badge-inline';
                badge.dataset.tier = accountType;
                badge.textContent = accountType === 'ultra' ? 'Ultra' : 'Pro';
                badge.title = NativeUI.t('账户等级', 'Account Tier');
                capsule.appendChild(badge);
            }

            capsule.classList.toggle('viewing-other', !isMe);
            capsule.title = isMe
                ? NativeUI.t('活跃用户', 'Active User')
                : NativeUI.t('查看其他用户（只读）', 'Viewing other user (Read Only)');
            p.displayName = displayName;
            p.isMe = isMe;
            p.accountType = accountType;
        }

        // Model badge — an unknown modelKey (e.g. Gemini ships a new variant we
        // haven't mapped yet) must only skip the badge, not abort the rest of
        // update() and freeze the panel.
        if (p.modelKey !== modelKey && modelBadge) {
            const mc = cm.MODEL_CONFIG[modelKey];
            if (mc) {
                modelBadge.textContent = mc.label;
                modelBadge.style.background = mc.color;
                modelBadge.style.color = modelKey === 'flash' ? '#000' : '#fff';
                p.modelKey = modelKey;
            }
        }

        // Big number + sub info
        if (p.val !== val) {
            // Bump animation
            const numericVal = typeof val === 'number' ? val : -1;
            if (numericVal !== cm.lastDisplayedVal && cm.lastDisplayedVal !== -1 && numericVal > cm.lastDisplayedVal) {
                bigDisplay.classList.remove('bump');
                void bigDisplay.offsetWidth;
                bigDisplay.classList.add('bump');
            }
            cm.lastDisplayedVal = numericVal;
            bigDisplay.textContent = val;
            p.val = val;
        }
        if (p.sub !== sub) {
            subInfo.textContent = sub;
            p.sub = sub;
        }

        // Quota bar
        if (quotaFill && quotaLabel) {
            if (p.quotaPct !== quotaPct || p.quotaColor !== quotaColor) {
                quotaFill.style.width = quotaPct + '%';
                quotaFill.style.background = quotaColor;
                p.quotaPct = quotaPct;
                p.quotaColor = quotaColor;
            }
            if (p.quotaText !== quotaText) {
                quotaLabel.textContent = quotaText;
                p.quotaText = quotaText;
            }
        }

        // Action button
        if (p.btn !== btn || p.disableBtn !== disableBtn || p.resetStep !== resetStep) {
            if (disableBtn) {
                actionBtn.textContent = NativeUI.t('仅查看', 'View Only');
                actionBtn.className = 'g-btn disabled';
                actionBtn.disabled = true;
            } else {
                actionBtn.disabled = false;
                if (resetStep === 0) {
                    actionBtn.textContent = btn;
                    actionBtn.className = 'g-btn';
                } else {
                    actionBtn.textContent = resetStep === 1 ? "Sure?" : "Really?";
                    actionBtn.className = `g-btn danger-${resetStep}`;
                }
            }
            p.btn = btn;
            p.disableBtn = disableBtn;
            p.resetStep = resetStep;
        }
    },

    toggleDetails() {
        const cm = CounterModule;
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
            this.update();
        }
    },

    // --- 位置管理 ---
    applyPos(el, pos) {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const savedLeft = parseFloat(pos.left) || 0;
        const savedTop = parseFloat(pos.top) || 0;

        if (pos.left !== 'auto' && pos.top !== 'auto' &&
            (savedLeft > winW - 50 || savedTop > winH - 50)) {
            console.warn(`\uD83D\uDC8E Panel off-screen detected. Resetting.`);
            pos = DEFAULT_POS;
            try { GM_setValue(GLOBAL_KEYS.POS, DEFAULT_POS); } catch {};
        }
        el.style.top = pos.top;
        el.style.left = pos.left;
        el.style.bottom = pos.bottom;
        el.style.right = pos.right;
    },

    makeDraggable(el, handle) {
        // Clean up previous drag listeners if any
        if (this._dragMove) document.removeEventListener('pointermove', this._dragMove);
        if (this._dragUp) document.removeEventListener('pointerup', this._dragUp);

        // Prevent default touch gestures on the drag handle
        handle.style.touchAction = 'none';

        let isDragging = false, startX, startY, iLeft, iTop;
        handle.onpointerdown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            iLeft = rect.left;
            iTop = rect.top;
            el.style.bottom = 'auto';
            el.style.right = 'auto';
            el.style.left = iLeft + 'px';
            el.style.top = iTop + 'px';
            handle.style.cursor = 'grabbing';
            handle.setPointerCapture(e.pointerId);
        };
        this._dragMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            let nL = iLeft + e.clientX - startX;
            let nT = iTop + e.clientY - startY;
            if (nT < 10) nT = 10;
            if (nL < 0) nL = 0;
            if (nL + el.offsetWidth > window.innerWidth) nL = window.innerWidth - el.offsetWidth;
            if (nT + el.offsetHeight > window.innerHeight) nT = window.innerHeight - el.offsetHeight;
            el.style.left = nL + 'px';
            el.style.top = nT + 'px';
        };
        this._dragUp = () => {
            if (!isDragging) return;
            isDragging = false;
            handle.style.cursor = 'grab';
            try { GM_setValue(GLOBAL_KEYS.POS, { top: el.style.top, left: el.style.left, bottom: 'auto', right: 'auto' }); } catch {}
        };
        document.addEventListener('pointermove', this._dragMove);
        document.addEventListener('pointerup', this._dragUp);
    },

    destroy() {
        if (this._dragMove) document.removeEventListener('pointermove', this._dragMove);
        if (this._dragUp) document.removeEventListener('pointerup', this._dragUp);
        this._dragMove = null;
        this._dragUp = null;
    },

    // --- Delegated modals (extracted to panel_settings.js / panel_dashboard.js) ---
    openSettingsModal: _openSettingsModal,
    showOnboarding: _showOnboarding,
    openDebugModal: _openDebugModal,
    openCalibrationModal: _openCalibrationModal,
    openDashboard: _openDashboard
};
