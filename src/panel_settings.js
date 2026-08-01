/**
 * Compatibility facade for panel-owned settings and support dialogs.
 * DOM composition lives in dependency-injected shell controllers.
 */

import { GLOBAL_KEYS, DEFAULT_POS, VERSION, APP_NAME, TRADEMARK_NOTICE } from './constants.js';
import { createIcon } from './icons.js';
import { GuidedTour } from './guided_tour.js';
import { Logger, filterLogs, isDebugEnabled, setDebugEnabled } from './logger.js';
import { Core } from './core.js';
import { ModuleRegistry } from './module_registry.js';
import { getCurrentTheme } from './state.js';
import { NativeUI } from './native_ui.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { debugExportAdapterProbe } from './debug_utils.js';
import { renderModuleIcon } from './ui/shell/icon_helpers.js';
import { openSettingsController } from './ui/shell/settings_controller.js';
import { openOnboardingController } from './ui/shell/onboarding_controller.js';
import { openDebugController } from './ui/shell/debug_controller.js';
import { openCalibrationController } from './ui/shell/calibration_controller.js';

function exportCounterData(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date();
    anchor.href = url;
    anchor.download = `primer-pp-${Core.getCurrentUser().split('@')[0]}-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
}

function renderModule(module, size) {
    return renderModuleIcon(module, size, { document, createIcon });
}

export function openSettingsModal() {
    const panel = this;
    const counter = panel._requireShellPort('counter');
    const exportModule = panel._requireShellPort('exportModule');
    const storage = panel._requireShellPort('storage');
    return openSettingsController({
        document,
        createIcon,
        renderModuleIcon: renderModule,
        getTheme: getCurrentTheme,
        core: Core,
        registry: ModuleRegistry,
        counter,
        exportModule,
        logger: Logger,
        ui: NativeUI,
        keys: GLOBAL_KEYS,
        defaultPosition: DEFAULT_POS,
        metadata: { appName: APP_NAME, version: VERSION, trademarkNotice: TRADEMARK_NOTICE },
        capabilityHealth: panel.getShellPort?.('capabilityHealth'),
        persist: (key, value) => storage.set(key, value),
        reload: () => location.reload(),
        exportData: exportCounterData,
        showOnboarding: moduleId => panel.showOnboarding(moduleId),
        openCalibration: () => panel.openCalibrationModal(),
        startTour: () => GuidedTour.start(),
        openDebug: () => panel.openDebugModal(),
        updatePanel: () => panel.update(),
        refreshDetails: () => panel.renderDetailsPane(),
        isDetailsExpanded: () => document.getElementById('g-details-pane')?.classList.contains('expanded') === true,
        isDebugEnabled,
        setDebugEnabled,
        now: () => new Date()
    });
}

export function showOnboarding(moduleId) {
    return openOnboardingController({
        document,
        moduleId,
        registry: ModuleRegistry,
        core: Core,
        getTheme: getCurrentTheme,
        createIcon,
        renderModuleIcon: renderModule,
        ui: NativeUI
    });
}

export function openDebugModal() {
    return openDebugController({
        document,
        createIcon,
        getTheme: getCurrentTheme,
        core: Core,
        adapter: GeminiAdapter,
        logger: Logger,
        filterLogs,
        isDebugEnabled,
        ui: NativeUI,
        actions: [
            { zh: '导出适配器探针', en: 'Export Adapter Probe', run: debugExportAdapterProbe },
            { zh: '清空日志', en: 'Clear Logs', run: () => Logger.clear() }
        ]
    });
}

export function openCalibrationModal() {
    const panel = this;
    return openCalibrationController({
        document,
        createIcon,
        getTheme: getCurrentTheme,
        core: Core,
        counter: panel._requireShellPort('counter'),
        logger: Logger,
        ui: NativeUI,
        updatePanel: () => panel.update(),
        refreshDetails: () => panel.renderDetailsPane()
    });
}
