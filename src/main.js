// ╔══════════════════════════════════════════════════════════════════════════╗
// ║              Primer++ for Gemini v12.0 — Entry Point                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { TIMINGS, GLOBAL_KEYS, PANEL_ID, DEFAULT_POS, TEMP_USER } from './constants.js';
import { Logger } from './logger.js';
import { Core } from './core.js';
import {
    getCurrentUser, setCurrentUser,
    getInspectingUser, setInspectingUser
} from './state.js';
import { ModuleRegistry } from './module_registry.js';
import { NativeUI } from './native_ui.js';
import { DOMWatcher } from './dom_watcher.js';
import { PanelUI } from './panel_ui.js';
import { GuidedTour } from './guided_tour.js';
import { GeminiAdapter } from './adapters/gemini.js';
import {
    debugShowDetectedUser,
    debugDumpStorageKeys,
    debugDumpGeminiStores,
    debugExportLegacyData,
    debugExportAllStorage,
    debugExportLogs
} from './debug_utils.js';

// --- Module imports (explicit registration in main.js to avoid circular dep issues) ---
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

// Register all modules explicitly (after all imports are resolved)
ModuleRegistry.register(CounterModule);
ModuleRegistry.register(ExportModule);
ModuleRegistry.register(FoldersModule);
ModuleRegistry.register(PromptVaultModule);
ModuleRegistry.register(DefaultModelModule);
ModuleRegistry.register(BatchDeleteModule);
ModuleRegistry.register(QuoteReplyModule);
ModuleRegistry.register(UITweaksModule);
ModuleRegistry.register(ChatNotesModule);
ModuleRegistry.register(MessageQueueModule);

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                           MAIN LOOP (主循环)                             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

let lastDetectedUser = null;

// --- Lazy path: user detection + account type (slow poll, 5s) ---
function lazyDetect() {
  try {
    const detected = Core.detectUser();
    if (detected !== lastDetectedUser) {
        Logger.debug('User detection changed', { detected });
        lastDetectedUser = detected;
    }
    if (detected && detected !== getCurrentUser()) {
        // Snapshot Guest state before switching. Without this clone the merge
        // below would read the live cm.state — which is about to be replaced
        // by the new user's storage — and end up double-counting Guest data.
        let guestState = null;
        if (getCurrentUser() === TEMP_USER && ModuleRegistry.isEnabled('counter')) {
            try {
                guestState = JSON.parse(JSON.stringify(CounterModule.state));
            } catch (e) {
                guestState = null;
            }
        }

        setCurrentUser(detected);
        Core.registerUser(detected);
        Logger.info('User switched', { currentUser: detected });

        if (getInspectingUser() === TEMP_USER || getInspectingUser() === getCurrentUser()) {
            setInspectingUser(getCurrentUser());
        }

        // Load the new user's existing storage FIRST. counter.onUserChange()
        // calls loadDataForUser() which overwrites cm.state — so any merge
        // attempted before this would be wiped out (and saving the
        // pre-merge state here would clobber the user's real storage).
        ModuleRegistry.notifyUserChange(getInspectingUser());

        // Merge captured Guest data ON TOP of the freshly loaded user state,
        // then persist. cm.state now reflects user's prior totals + Guest
        // session — no double-counting, no storage clobber.
        if (guestState && (guestState.total > 0 || Object.keys(guestState.chats || {}).length > 0)) {
            const cm = CounterModule;
            cm.state.total += (typeof guestState.total === 'number' ? guestState.total : 0);
            cm.state.totalChatsCreated += (typeof guestState.totalChatsCreated === 'number' ? guestState.totalChatsCreated : 0);
            for (const [day, counts] of Object.entries(guestState.dailyCounts || {})) {
                if (typeof counts !== 'object' || !counts) continue;
                if (!cm.state.dailyCounts[day]) {
                    cm.state.dailyCounts[day] = counts;
                } else {
                    cm.state.dailyCounts[day].messages += (typeof counts.messages === 'number' ? counts.messages : 0);
                    cm.state.dailyCounts[day].chats += (typeof counts.chats === 'number' ? counts.chats : 0);
                    if (counts.byModel && typeof counts.byModel === 'object') {
                        if (!cm.state.dailyCounts[day].byModel) {
                            cm.state.dailyCounts[day].byModel = { flash: 0, thinking: 0, pro: 0 };
                        }
                        cm.state.dailyCounts[day].byModel.flash += (typeof counts.byModel.flash === 'number' ? counts.byModel.flash : 0);
                        cm.state.dailyCounts[day].byModel.thinking += (typeof counts.byModel.thinking === 'number' ? counts.byModel.thinking : 0);
                        cm.state.dailyCounts[day].byModel.pro += (typeof counts.byModel.pro === 'number' ? counts.byModel.pro : 0);
                    }
                }
            }
            for (const [cid, count] of Object.entries(guestState.chats || {})) {
                cm.state.chats[cid] = (cm.state.chats[cid] || 0) + (typeof count === 'number' ? count : 0);
            }
            Logger.info(`Merged ${guestState.total} messages from Guest session to ${getCurrentUser()}`);
            cm.saveData();
            if (document.getElementById(PANEL_ID)) PanelUI.update();
        }
    }

    // Also detect account type on lazy poll
    if (ModuleRegistry.isEnabled('counter')) {
        const cm = CounterModule;
        const newAcct = cm.detectAccountType();
        if (newAcct !== cm.accountType) {
            cm.accountType = newAcct;
            if (document.getElementById(PANEL_ID)) PanelUI.update();
        }
    }
  } catch (e) {
    Logger.error('lazyDetect error', e);
  }
}

// --- Reactive path: model mutation (DOMWatcher, debounce 500ms) ---
function onModelMutation() {
    if (!ModuleRegistry.isEnabled('counter')) return;
    const cm = CounterModule;
    const newModel = cm.detectModel();
    if (newModel !== cm.currentModel) {
        cm.currentModel = newModel;
        if (document.getElementById(PANEL_ID)) PanelUI.update();
    }
}

// --- Reactive path: zone-based DOM structure changes (DOMWatcher) ---
function onSidebarChange() {
    Core.invalidateSidebarCache();
    NativeUI.markDirtyByZone('sidebar');
    NativeUI.tick();
}

function onInputAreaChange() {
    NativeUI.markDirtyByZone('input');
    NativeUI.tick();
}

function onHeaderChange() {
    NativeUI.markDirtyByZone('header');
    NativeUI.tick();
}

function onPanelRemoved() {
    if (ModuleRegistry.isEnabled('counter')) {
        PanelUI.create();
    }
}

// Full re-injection (used only at initialization)
function onDOMStructureChange() {
    Core.invalidateSidebarCache();
    if (ModuleRegistry.isEnabled('counter')) {
        PanelUI.create();
    }
    NativeUI.markAllDirty();
    NativeUI.tick();
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                           INITIALIZATION                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { injectNativeUIStyles } from './native_ui_styles.js';

PanelUI.injectStyles();
injectNativeUIStyles();
ModuleRegistry.init();
DOMWatcher.init();

// Initialize auto theme listener if current theme is 'auto'
Core._updateAutoListener(Core.getTheme());

// Register DOMWatcher reactive handlers
DOMWatcher.register('model-mutation', {
    match: (m) => GeminiAdapter.matchesModelMutation(m),
    callback: onModelMutation,
    debounce: TIMINGS.MODEL_MUTATION_DEBOUNCE
});

// Zone-based structure watchers (replaces single broad dom-structure handler)
DOMWatcher.register('sidebar-structure', {
    match: (m) => GeminiAdapter.matchesSidebarMutation(m),
    callback: onSidebarChange,
    debounce: TIMINGS.NATIVEUI_DEBOUNCE
});
DOMWatcher.register('input-structure', {
    match: (m) => GeminiAdapter.matchesInputAreaMutation(m),
    callback: onInputAreaChange,
    debounce: TIMINGS.NATIVEUI_DEBOUNCE
});
DOMWatcher.register('header-structure', {
    match: (m) => GeminiAdapter.matchesHeaderMutation(m),
    callback: onHeaderChange,
    debounce: TIMINGS.NATIVEUI_DEBOUNCE
});
DOMWatcher.register('panel-guard', {
    match: (m) => {
        if (m.type !== 'childList' || !m.removedNodes?.length) return false;
        for (const n of m.removedNodes) { if (n.id === PANEL_ID) return true; }
        return false;
    },
    callback: onPanelRemoved,
    debounce: 500
});

// Onboarding queue: show module guides for newly-enabled modules
function startOnboardingQueue() {
    let seen;
    try { seen = GM_getValue(GLOBAL_KEYS.ONBOARDING, {}); } catch (e) { seen = {}; }
    const queue = [];
    ModuleRegistry.enabledModules.forEach(id => {
        const mod = ModuleRegistry.modules[id];
        if (!seen[id] && typeof mod?.getOnboarding === 'function') {
            queue.push(id);
            seen[id] = true;
        }
    });
    if (queue.length === 0) return;
    try { GM_setValue(GLOBAL_KEYS.ONBOARDING, seen); } catch (e) { /* silent */ }
    let i = 0;
    function showNext() {
        if (i >= queue.length) return;
        const id = queue[i++];
        PanelUI.showOnboarding(id);
        let check = null;
        let timeout = null;
        const cleanup = () => {
            if (check) clearInterval(check);
            if (timeout) clearTimeout(timeout);
        };
        check = setInterval(() => {
            if (!document.querySelector('#gemini-onboarding-modal, .onboarding-overlay')) {
                cleanup();
                setTimeout(showNext, 500);
            }
        }, 300);
        timeout = setTimeout(cleanup, 10000);
    }
    setTimeout(showNext, 500);
}

function startProgressiveDisclosure() {
    // Guided Tour first, then onboarding queue. This must run after the panel is
    // present; starting it during Gemini's own initial render can leave stacked
    // overlays or a missing tour target.
    if (!GuidedTour.hasSeen()) {
        setTimeout(() => GuidedTour.start(startOnboardingQueue), 800);
    } else {
        startOnboardingQueue();
    }
}

// Wait for Gemini's core UI to be present before first injection
function waitForGeminiReady(cb, maxWait = 10000) {
    const start = Date.now();
    (function check() {
        if (GeminiAdapter.isReady()) cb();
        else if (Date.now() - start < maxWait) requestAnimationFrame(check);
        else cb();
    })();
}

// Initial calls
lazyDetect();
waitForGeminiReady(() => {
    onDOMStructureChange();
    startProgressiveDisclosure();
});

let pollTimer = setInterval(lazyDetect, TIMINGS.SLOW_POLL);

// Visibility change: pause/resume polling + auto-sync
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (!pollTimer) pollTimer = setInterval(lazyDetect, TIMINGS.SLOW_POLL);
        lazyDetect();
        onModelMutation();
        const user = getInspectingUser();
        if (user && user !== TEMP_USER && ModuleRegistry.isEnabled('counter')) {
            CounterModule.loadDataForUser(user);
        }
    } else {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        // Tab going hidden — flush any pending counter state before the page may get suspended/discarded.
        try { CounterModule.flushPendingSave?.(); } catch (e) { /* silent */ }
    }
});

// Page unload path — flush pending state synchronously so the 300ms debounce
// window cannot swallow the most recent message increment.
window.addEventListener('pagehide', () => {
    try { CounterModule.flushPendingSave?.(); } catch (e) { /* silent */ }
});

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                      TAMPERMONKEY MENU COMMANDS                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

GM_registerMenuCommand("\u{1F9F0} Debug: Show Detected User", () => {
    debugShowDetectedUser();
});

GM_registerMenuCommand("\u{1F9F0} Debug: Dump Storage Keys", () => {
    debugDumpStorageKeys();
});

GM_registerMenuCommand("\u{1F9F0} Debug: Export All Storage", () => {
    debugExportAllStorage();
});

GM_registerMenuCommand("\u{1F9F0} Debug: Export Legacy Data", () => {
    debugExportLegacyData();
});

GM_registerMenuCommand("\u{1F9F0} Debug: Export Logs", () => {
    debugExportLogs();
});

GM_registerMenuCommand("\u{1F9F0} Debug: Dump Gemini Storage", () => {
    debugDumpGeminiStores();
});

GM_registerMenuCommand("\u{1F504} Reset Position", () => {
    GM_setValue(GLOBAL_KEYS.POS, DEFAULT_POS);
    location.reload();
});
