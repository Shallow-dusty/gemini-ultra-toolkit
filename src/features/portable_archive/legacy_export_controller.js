import { createUsageExportController } from './usage_export_controller.js';
import { createCurrentChatExportController } from './current_chat_export_controller.js';
import { createMultiChatExportController } from './multi_chat_export_controller.js';
export { LEGACY_DOCX_MIME, LEGACY_EXPORT_FORMATS } from './export_download_renderer.js';

/** Compose the legacy surface from independent usage, current-chat and multi-chat controllers. */
export function createLegacyExportController(options = {}) {
    const usage = createUsageExportController(options);
    const current = createCurrentChatExportController({ ...options, usage });
    const multi = createMultiChatExportController({ ...options, usage, current });
    const controller = {
        configure: config => { usage.configure(config); return controller; },
        setDownload: download => { usage.setDownload(download); return controller; },
        get sessionAdapter() { return usage.sessionAdapter; },
        get geminiAdapter() { return usage.geminiAdapter; },
        get now() { return usage.now; },
        get bulkSelected() { return multi.selected; },
        get bulkSelectedMeta() { return multi.selectedMeta; },
        get bulkExporting() { return multi.exporting; },
        set bulkExporting(value) { multi.exporting = value; },
        get bulkCancelRequested() { return multi.cancelRequested; },
        set bulkCancelRequested(value) { multi.cancelRequested = value; },
        get bulkProgress() { return multi.progress; },
        set bulkProgress(value) { multi.progress = value; },
        resetSessionState: () => multi.resetSessionState(),
        getSessionMetadata: () => usage.getSessionMetadata(),
        getUsageSnapshot: () => usage.getUsageSnapshot(),
        getGeminiAdapter: () => usage.getGeminiAdapter(),
        download: (...args) => usage.download(...args),
        getFilePrefix: () => usage.getFilePrefix(),
        getChatFilePrefix: () => usage.getChatFilePrefix(),
        getBulkFilePrefix: () => usage.getBulkFilePrefix(),
        exportJSON: () => usage.exportJSON(),
        doExportCSV: () => usage.doExportCSV(),
        doExportMarkdown: () => usage.doExportMarkdown()
    };

    const aliases = {
        getCurrentTranscript: [current, 'getCurrentTranscript'],
        insertTextIntoEditor: [current, 'insertTextIntoEditor'],
        insertCurrentTranscriptPacket: [current, 'insertCurrentTranscriptPacket'],
        downloadCurrentTranscript: [current, 'downloadCurrentTranscript'],
        cloneChatMeta: [multi, 'cloneChatMeta'],
        rememberBulkChat: [multi, 'rememberChat'],
        toggleBulkChat: [multi, 'toggleChat'],
        selectVisibleBulkChats: [multi, 'selectVisible'],
        clearBulkSelection: [multi, 'clearSelection'],
        getSelectedBulkChats: [multi, 'getSelectedChats'],
        resolveBulkChatForNavigation: [multi, 'resolveForNavigation'],
        absoluteChatHref: [multi, 'absoluteHref'],
        waitForChatReady: [multi, 'waitForReady'],
        navigateToBulkChat: [multi, 'navigate'],
        getCurrentChatReference: [multi, 'getCurrentReference'],
        restoreOriginalChat: [multi, 'restoreOriginal'],
        captureBulkTranscript: [multi, 'capture'],
        failedBulkTranscript: [multi, 'failed'],
        collectSelectedTranscripts: [multi, 'collect'],
        downloadSelectedTranscripts: [multi, 'downloadSelected'],
        insertSelectedTranscriptPacket: [multi, 'insertSelectedPacket']
    };
    for (const [name, [target, method]] of Object.entries(aliases)) {
        Object.defineProperty(controller, name, {
            configurable: true,
            enumerable: true,
            get: () => target[method],
            set: value => { target[method] = value; }
        });
    }
    return controller;
}
