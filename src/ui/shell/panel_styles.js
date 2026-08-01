export function createPanelShellCss(panelId) {
    return `
            #${panelId} {
                --bg: #202124; --text-main: #fff; --text-sub: #ccc; --accent: #8ab4f8;
                --blur: 18px; --saturate: 180%;
                --panel-control-height: max(var(--primer-ui-control-height-md, 40px), 44px);
                position: fixed; z-index: 2147483647;
                width: min(264px, calc(100vw - 24px));
                background: var(--bg);
                backdrop-filter: blur(var(--blur)) saturate(var(--saturate));
                -webkit-backdrop-filter: blur(var(--blur)) saturate(var(--saturate));
                border: 1px solid var(--border); border-radius: var(--primer-ui-radius-lg, 16px);
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                box-shadow: var(--shadow), var(--border-highlight, inset 0 0 0 transparent);
                font-family: var(--primer-ui-font-family, 'Google Sans', Roboto, sans-serif);
                font-size: var(--primer-ui-font-size-sm, 13px);
                max-height: calc(100vh - 24px);
                max-height: calc(100dvh - 24px);
                overflow: hidden; user-select: none;
                display: flex; flex-direction: column;
                transition: height 0.35s cubic-bezier(0.19, 1, 0.22, 1),
                            background 0.3s cubic-bezier(0.19, 1, 0.22, 1),
                            box-shadow 0.4s cubic-bezier(0.19, 1, 0.22, 1),
                            transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
            }
            #${panelId}:hover {
                box-shadow: var(--shadow-hover, var(--shadow)), var(--border-highlight, inset 0 0 0 transparent);
                transform: translateY(-2px);
            }
            .gemini-header {
                padding: 8px 12px; cursor: grab;
                background: var(--header-bg, rgba(255, 255, 255, 0.03));
                border-bottom: 1px solid var(--header-border, rgba(255, 255, 255, 0.05));
                display: flex; align-items: center; justify-content: space-between; min-height: 48px;
            }
            .user-capsule {
                display: flex; align-items: center; gap: 4px;
                font-size: 12px; color: var(--text-sub);
                background: var(--badge-bg, rgba(255,255,255,0.05));
                padding: 2px 8px; border-radius: 12px; border: 1px solid transparent;
                max-width: 188px; overflow: hidden;
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
            .gemini-toggle-btn {
                appearance: none; align-items: center; justify-content: center;
                background: transparent; border: 1px solid transparent; border-radius: 10px;
                box-sizing: border-box;
                cursor: pointer; display: inline-flex; flex: 0 0 var(--panel-control-height);
                width: var(--panel-control-height); height: var(--panel-control-height);
                font-size: 14px; opacity: 0.72; color: var(--text-sub);
                transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .gemini-toggle-btn:hover { opacity: 1; color: var(--accent); }
            .gemini-toggle-btn[aria-expanded="true"] { background: var(--row-hover); color: var(--accent); opacity: 1; }
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
                font-size: 9px; color: var(--text-sub);
                margin-bottom: 8px; font-family: monospace;
            }

            .gemini-sub-info {
                font-size: 12px; color: var(--text-sub); margin-bottom: 8px;
                font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .gemini-details-view {
                height: 0; opacity: 0; overflow: hidden; background: var(--detail-bg, rgba(0,0,0,0.1));
                padding: 0 12px;
                transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                            padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .gemini-details-view.expanded { flex: 1 1 auto; min-height: 0; height: auto; opacity: 1; padding: 10px 12px 14px 12px; border-top: 1px solid var(--border); max-height: 420px; overflow-y: auto; }
            .gemini-details-view button { min-width: var(--panel-control-height); min-height: var(--panel-control-height); }
            .gemini-details-view fieldset { min-width: 0; max-width: 100%; box-sizing: border-box; }
            .gemini-details-view label { min-width: 0; max-width: 100%; box-sizing: border-box; }
            .gemini-details-view input:not([type="checkbox"]):not([type="radio"]),
            .gemini-details-view select { width: 100%; min-width: 0; min-height: var(--panel-control-height); max-width: 100%; box-sizing: border-box; }
            .section-title {
                font-size: 11px; color: var(--text-sub);
                margin: 8px 0 4px 0; text-transform: uppercase; letter-spacing: 1px;
            }
            .detail-row {
                display: flex; justify-content: space-between; align-items: center;
                box-sizing: border-box;
                width: 100%; min-height: var(--panel-control-height);
                margin: 0 0 4px; font: inherit; font-size: 12px; color: var(--text-sub); cursor: pointer;
                padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; text-align: left;
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
                box-sizing: border-box;
                color: var(--text-sub); border-radius: 8px; padding: 8px 10px; min-height: var(--panel-control-height); font-size: 12px;
                cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); width: 100%;
            }
            .g-btn:hover { background: var(--row-hover); color: var(--text-main); }
            .g-btn:focus-visible,
            .gemini-toggle-btn:focus-visible,
            .details-tab:focus-visible,
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
            .panel-detail-actions { display: flex; gap: 8px; }
            .panel-detail-actions > .g-btn:first-child { flex: 1; }
            .panel-settings-trigger { width: 44px; min-width: 44px; padding-inline: 0; }
            .primer-ui-visually-hidden {
                position: absolute !important; width: 1px !important; height: 1px !important;
                padding: 0 !important; margin: -1px !important; overflow: hidden !important;
                clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important;
            }

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
                font-family: var(--primer-ui-font-family, 'Google Sans', Roboto, sans-serif);
                animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .settings-header {
                padding: 12px 16px; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.1));
                display: flex; justify-content: space-between; align-items: center;
            }
            .settings-header h3 { margin: 0; font-size: 14px; color: var(--text-main, #fff); font-weight: 500; }
            .settings-close {
                width: 44px; height: 44px; padding: 0; border: 0; background: transparent;
                display: inline-flex; align-items: center; justify-content: center;
                cursor: pointer; font-size: 18px; color: var(--text-sub, #9aa0a6);
            }
            .settings-close:hover { color: var(--accent, #8ab4f8); }
            .settings-body { padding: 12px 16px; }
            .settings-section { margin-bottom: 16px; }
            .settings-section-title { font-size: 10px; font-weight: 500; color: var(--text-sub, #9aa0a6); text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px; }
            .settings-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 8px 0; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.05));
            }
            .settings-row:last-child { border-bottom: none; }
            .settings-label { font-size: 12px; color: var(--text-main, #fff); }
            .settings-row .primer-ui-form-field__label { font-size: 12px; color: var(--text-main, #fff); }
            .settings-select {
                background: var(--btn-bg, rgba(255,255,255,0.05)); border: 1px solid var(--border, rgba(255,255,255,0.1));
                color: var(--text-main, #fff); border-radius: 6px; padding: 4px 8px; font-size: 11px; min-height: 44px;
            }
            .settings-number-input { width: 80px; text-align: center; }
            .settings-usage-chart { background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px; margin-top: 4px; overflow-x: auto; }
            .settings-btn {
                background: var(--btn-bg, rgba(255,255,255,0.05)); border: 1px solid transparent;
                color: var(--text-sub, #9aa0a6); border-radius: 8px; padding: 8px 12px; font-size: 11px;
                cursor: pointer; transition: all 0.2s; width: 100%; min-height: 44px; margin-top: 4px;
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
                font-family: var(--primer-ui-font-family, 'Google Sans', Roboto, sans-serif);
                animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .debug-header {
                padding: 12px 16px; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.1));
                display: flex; justify-content: space-between; align-items: center;
            }
            .debug-header h3 { margin: 0; font-size: 14px; color: var(--text-main, #fff); font-weight: 500; }
            .debug-close { width: 44px; height: 44px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; color: var(--text-sub, #9aa0a6); }
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
                min-height: 44px; font-size: 10px; padding: 4px 8px; border-radius: 6px;
                border: 1px solid var(--divider, rgba(255,255,255,0.1));
                background: var(--input-bg, rgba(255,255,255,0.05));
                color: var(--text-sub); cursor: pointer;
            }
            .debug-filter-btn.active { color: var(--text-main); border-color: var(--accent); }
            .debug-search {
                background: var(--code-bg, rgba(0,0,0,0.3));
                border: 1px solid var(--divider, rgba(255,255,255,0.1));
                color: var(--text-main); border-radius: 6px; padding: 4px 8px;
                font-size: 10px; width: 100%; min-height: 44px;
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
                position: relative; width: 44px; min-width: 44px; height: 44px; padding: 0; border: 0;
                background: transparent; border-radius: 12px;
                cursor: pointer; transition: background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .toggle-switch::before {
                content: ''; position: absolute; width: 36px; height: 20px; top: 12px; left: 4px;
                background: var(--btn-bg, rgba(255,255,255,0.1)); border-radius: 10px;
                transition: background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .toggle-switch.on::before { background: var(--accent, #8ab4f8); }
            .toggle-switch::after {
                content: ''; position: absolute; top: 14px; left: 6px;
                width: 16px; height: 16px; background: #fff; border-radius: 50%;
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            }
            .toggle-switch.on::after { transform: translateX(16px); }
            .shell-switch-row { min-height: 44px; }
            .settings-switch-row { width: 100%; justify-content: space-between; }

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
            .dash-close { width: 44px; height: 44px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; color: var(--text-sub); cursor: pointer; transition: 0.2s; }
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
                margin-bottom: 8px; overflow-x: auto; scrollbar-width: thin;
            }
            .details-tab {
                appearance: none; border: 0; flex: 1; min-width: var(--panel-control-height);
                box-sizing: border-box;
                min-height: var(--panel-control-height); padding: 8px; text-align: center;
                font: inherit; font-size: 12px; cursor: pointer; border-radius: 8px;
                color: var(--text-sub); transition: all 0.2s;
                background: transparent;
            }
            .details-tab:hover { background: var(--row-hover); color: var(--text-main); }
            .details-tab.active,
            .details-tab[aria-selected="true"] {
                background: var(--accent); color: #000; font-weight: 600;
            }

            /* Module Toggle Compact */
            .module-toggle-compact {
                display: flex; justify-content: space-between; align-items: center;
                min-height: 52px; padding: 4px 0; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.05));
            }
            .module-compact-identity {
                display: flex; flex-direction: column; min-width: 0; gap: 2px;
            }
            .module-capability-meta {
                display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px;
                color: var(--text-sub, #9aa0a6); font-size: 10px; line-height: 1.25;
            }
            .module-capability-status::before {
                content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 4px;
                border-radius: 50%; background: var(--text-sub, #9aa0a6); vertical-align: 1px;
            }
            .module-capability-status[data-capability-state='available']::before { background: #34a853; }
            .module-capability-status[data-capability-state='degraded']::before { background: #f9ab00; }
            .module-capability-status[data-capability-state='unavailable']::before { background: #ea4335; }
            .module-capability-owner { opacity: 0.82; }
            .module-compact-label {
                display: flex; align-items: center; gap: 6px;
                font-size: 11px; color: var(--text-main);
            }
            .module-compact-label .module-icon { font-size: 14px; }
            .module-compact-actions { display: flex; align-items: center; gap: 6px; }

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
                font-family: var(--primer-ui-font-family, 'Google Sans', Roboto, sans-serif);
                animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .onboarding-header {
                padding: 16px 20px; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.08));
                display: flex; justify-content: space-between; align-items: center;
            }
            .onboarding-header h3 { margin: 0; font-size: 16px; color: var(--text-main, #fff); font-weight: 500; }
            .onboarding-close { width: 44px; height: 44px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; color: var(--text-sub, #9aa0a6); }
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
                min-height: 44px; font-size: 11px; cursor: pointer;
            }
            .onboarding-lang-btn:hover { color: var(--text-main); }
            .onboarding-start-btn {
                background: var(--accent, #8ab4f8); color: #000; border: none;
                border-radius: 8px; padding: 6px 16px; font-size: 12px;
                min-height: 44px; font-weight: 600; cursor: pointer;
            }
            .onboarding-start-btn:hover { opacity: 0.9; }
            .onboarding-info-btn {
                width: 44px; height: 44px; padding: 0; border: 0; background: transparent;
                display: inline-flex; align-items: center; justify-content: center;
                font-size: 11px; color: var(--text-sub, #9aa0a6); cursor: pointer;
                opacity: 0.65; margin-left: 0;
            }
            .onboarding-info-btn:hover { opacity: 1; color: var(--accent, #8ab4f8); }
            .gc-tour-button { min-height: 44px; }
            .calibration-chat-hint { font-size: 9px; color: var(--text-sub); opacity: 0.5; margin-top: 2px; }
            .calibration-apply { margin-top: 12px; font-weight: 600; }

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
                #gemini-monitor-panel-v7,
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
    `;
}

export function injectPanelShellStyles({
    addStyle,
    panelId
} = {}) {
    if (typeof addStyle !== 'function') throw new TypeError('Panel shell requires a style injector');
    if (typeof panelId !== 'string' || panelId === '') throw new TypeError('Panel shell requires a panel id');
    const css = createPanelShellCss(panelId);
    addStyle(css);
    return css;
}
