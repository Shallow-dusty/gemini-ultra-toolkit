import { TIMINGS, GLOBAL_KEYS, PANEL_ID, DEFAULT_POS, TEMP_USER, APP_NAME, VERSION } from './constants.js';
import { Logger, configureLoggerRuntime } from './logger.js';
import { Core, configureCoreRuntime } from './core.js';
import {
    configureStateRuntime,
    getCurrentUser, setCurrentUser,
    getInspectingUser, setInspectingUser
} from './state.js';
import { ModuleRegistry } from './module_registry.js';
import { NativeUI, configureNativeUIRuntime } from './native_ui.js';
import { DOMWatcher } from './dom_watcher.js';
import { PanelUI } from './panel_ui.js';
import { GuidedTour } from './guided_tour.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { injectNativeUIStyles } from './native_ui_styles.js';
import { createModuleCatalog, registerModuleCatalog } from './app/module_catalog.js';
import { createSessionDetectionBridge } from './app/session_detection_bridge.js';
import { createGeminiWatcherWiring } from './app/gemini_watcher_wiring.js';
import { createOnboardingCoordinator } from './app/onboarding_coordinator.js';
import { createPrimerComposition } from './app/composition_root.js';
import { createProductionPortableArchive } from './app/portable_archive_production.js';
import { createLegacyGmRuntime, createPersistedReloadHandler } from './platforms/legacy_gm_runtime.js';
import {
    createGeminiCapabilityHealthService,
    createGeminiModuleCapabilityCatalog
} from './features/capability_health/index.js';
import {
    createProbeReporter,
    installPublicGlobals,
    registerMenuCommands
} from './app/public_bridge.js';
import { debugExportAdapterProbe } from './debug_utils.js';

import { CounterModule } from './modules/counter.js';
import { ExportModule } from './modules/export.js';
import { FoldersModule } from './modules/folders.js';
import { PromptVaultModule } from './modules/prompt_vault.js';
import { DefaultModelModule } from './modules/default_model.js';
import { BatchDeleteModule } from './modules/batch_delete.js';
import { QuoteReplyModule } from './modules/quote_reply.js';
import { UITweaksModule } from './modules/ui_tweaks.js';
import { ChatNotesModule } from './modules/chat_notes.js';
import { MessageQueueModule } from './modules/message_queue.js';

const platform = createLegacyGmRuntime();
configureLoggerRuntime({ storage: platform.storage });
configureStateRuntime({ storage: platform.storage });
configureCoreRuntime({ storage: platform.storage });
configureNativeUIRuntime({ storage: platform.storage });
ModuleRegistry.configureRuntime({ storage: platform.storage });
DOMWatcher.configure({ attributeFilter: GeminiAdapter.SELECTORS.MUTATION_ATTRIBUTE_FILTER });

const moduleCatalog = createModuleCatalog([
    CounterModule,
    ExportModule,
    FoldersModule,
    PromptVaultModule,
    DefaultModelModule,
    BatchDeleteModule,
    QuoteReplyModule,
    UITweaksModule,
    ChatNotesModule,
    MessageQueueModule
]);
registerModuleCatalog(ModuleRegistry, moduleCatalog);

const capabilityHealthService = createGeminiCapabilityHealthService({
    getCapabilityProbeReport: () => GeminiAdapter.getCapabilityProbeReport(),
    features: createGeminiModuleCapabilityCatalog({
        isEnabled: id => ModuleRegistry.isEnabled(id)
    }),
    version: VERSION,
    clock: () => Date.now()
});

const notifications = Object.freeze({
    show: message => NativeUI.showToast(message),
    announce: (message, options = {}) => NativeUI.showToast(message, options.duration)
});
const shell = Object.freeze({ openModule: id => PanelUI.openModule(id) });
const portableArchive = createProductionPortableArchive({
    registry: ModuleRegistry, storage: platform.storage, core: Core, nativeUI: NativeUI,
    defaultModel: DefaultModelModule, uiTweaks: UITweaksModule, notifications,
    sectionOwners: { chats: QuoteReplyModule, annotations: ChatNotesModule, collections: FoldersModule,
        recipes: PromptVaultModule, insights: CounterModule, queue: MessageQueueModule }
});
ExportModule.configure(portableArchive.exportPorts);
const resetPosition = createPersistedReloadHandler({
    storage: platform.storage,
    key: GLOBAL_KEYS.POS,
    value: DEFAULT_POS,
    reload: platform.reload,
    onError(error) {
        Logger.error('Position reset failed', error);
        notifications.show(NativeUI.t('位置重置失败；页面未刷新', 'Position reset failed; page was not reloaded'));
    }
});

PanelUI.configureShellPorts({
    capabilityHealth: capabilityHealthService,
    counter: CounterModule,
    exportModule: ExportModule,
    storage: platform.storage,
    addStyle: platform.addStyle,
    notifications
});
GuidedTour.configurePorts({ storage: platform.storage });
PromptVaultModule.configureCapabilities({ notifications, shell });

function onPanelRemoved() {
    // The shell is application infrastructure, not a side effect of Counter.
    PanelUI.create();
}

function onDOMStructureChange() {
    Core.invalidateSidebarCache();
    PanelUI.create();
    NativeUI.markAllDirty();
    NativeUI.tick();
}

const onboarding = createOnboardingCoordinator({
    registry: ModuleRegistry,
    panel: PanelUI,
    guidedTour: GuidedTour,
    storage: platform.storage,
    onboardingKey: GLOBAL_KEYS.ONBOARDING,
    documentRef: document,
    modalSelector: '#gemini-onboarding-modal, .onboarding-overlay'
});

function startProgressiveDisclosure(scope) {
    return onboarding.startProgressiveDisclosure(scope);
}

const sessionBridge = createSessionDetectionBridge({
    core: Core,
    registry: ModuleRegistry,
    counter: CounterModule,
    panel: PanelUI,
    logger: Logger,
    tempUser: TEMP_USER,
    getCurrentUser,
    setCurrentUser,
    getInspectingUser,
    setInspectingUser,
    isPanelPresent: () => Boolean(document.getElementById(PANEL_ID)),
    notifySession: () => portableArchive.notifySession(getInspectingUser()),
    onGuestMerged({ guestState, user }) {
        Logger.info(`Merged ${guestState.total} messages from Guest session to ${user}`);
    }
});

const watcherWiring = createGeminiWatcherWiring({
    adapter: GeminiAdapter,
    core: Core,
    nativeUI: NativeUI,
    panel: PanelUI,
    counter: CounterModule,
    registry: ModuleRegistry,
    panelId: PANEL_ID,
    timings: TIMINGS,
    documentRef: document,
    onPanelRemoved,
    onDOMStructureChange
});

const composition = createPrimerComposition({
    registry: ModuleRegistry,
    domWatcher: DOMWatcher,
    watcherWiring,
    sessionBridge,
    onboarding,
    core: Core,
    panel: PanelUI,
    nativeUI: NativeUI,
    guidedTour: GuidedTour,
    counter: CounterModule,
    adapter: GeminiAdapter,
    logger: Logger,
    injectNativeStyles: () => injectNativeUIStyles(platform.addStyle),
    flushPlatform: platform.storage.flush,
    documentRef: document,
    windowRef: window,
    panelId: PANEL_ID,
    timings: TIMINGS,
    healthService: capabilityHealthService,
    archiveWiring: portableArchive.wiring,
    onReady(scope) {
        onDOMStructureChange();
        startProgressiveDisclosure(scope);
    }
});

ModuleRegistry.configure({
    onModuleEnabled: composition.registryCallbacks.onModuleEnabled,
    onModuleDisabled: composition.registryCallbacks.onModuleDisabled,
    onModulesChanged: composition.registryCallbacks.onModulesChanged,
    onModuleError: composition.registryCallbacks.onModuleError
});

const primerApplication = composition.application;
const getPrimerProbeReport = createProbeReporter({
    appName: APP_NAME,
    version: VERSION,
    application: primerApplication,
    adapter: GeminiAdapter,
    registry: ModuleRegistry,
    documentRef: document,
    panelId: PANEL_ID,
    healthService: capabilityHealthService
});

/** Start Primer++ once. Concurrent/repeated calls share the active lifecycle. */
export function startPrimer() {
    return primerApplication.start();
}

/** Stop Primer++ once and release every page-level resource owned by the app. */
export function stopPrimer(reason = 'Primer++ stopped') {
    return primerApplication.stop(reason);
}

installPublicGlobals({
    globalObject: window,
    getProbeReport: getPrimerProbeReport,
    start: startPrimer,
    stop: stopPrimer,
    names: {
        getProbe: '__PRIMER_PP_GET_PROBE_REPORT__',
        start: '__PRIMER_PP_START__',
        stop: '__PRIMER_PP_STOP__'
    }
});

registerMenuCommands(platform.registerMenuCommand, [
    { label: "\u{1F9F0} Debug: Export Adapter Probe", handler: debugExportAdapterProbe },
    {
        label: "\u{1F504} Reset Position",
        handler: resetPosition
    }
]);

startPrimer().catch(error => {
    Logger.error('Primer++ startup failed', error);
});
