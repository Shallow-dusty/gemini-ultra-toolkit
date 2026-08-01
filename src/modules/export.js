import { Logger } from '../logger.js';
import { Core } from '../core.js';
import { NativeUI } from '../native_ui.js';
import { PanelUI } from '../panel_ui.js';
import { VERSION } from '../constants.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { createIcon } from '../icons.js';
import { createPortableArchiveFeature } from '../features/portable_archive/index.js';
import { BULK_LIFECYCLE_ARCHIVE_CAPABILITY, createLegacyBulkArchiveCapability } from '../features/bulk_lifecycle/index.js';
import { createArchiveExportView } from '../features/portable_archive/archive_export_view.js';
import { createLegacyExportController } from '../features/portable_archive/legacy_export_controller.js';
import { createLegacyArchiveProviderBridge } from '../features/portable_archive/legacy_provider_bridge.js';
import {
    assertExportSessionAdapter,
    createDefaultExportSessionAdapter
} from '../features/portable_archive/export_session_adapter.js';
function createDefaultSessionAdapter() {
    return createDefaultExportSessionAdapter({
        getCurrentUser: () => Core.getCurrentUser(),
        getChatId: () => Core.getChatId()
    });
}
const compatibility = createLegacyExportController({
    sessionAdapter: createDefaultSessionAdapter(),
    geminiAdapter: GeminiAdapter,
    now: () => new Date().toISOString(),
    translate: (zh, en) => NativeUI.t(zh, en),
    notify: message => NativeUI.showToast(message),
    logger: Logger,
    document: () => globalThis.document,
    scanSidebarChats: (...args) => Core.scanSidebarChats(...args),
    sleep: milliseconds => Core.sleep(milliseconds),
    monotonicNow: () => globalThis.performance?.now?.() ?? Date.now(),
    requestRender: () => { try { PanelUI.renderDetailsPane(); } catch (_shellUnavailable) { /* optional shell */ } }
});
let archiveFeature = null;
let now = () => new Date().toISOString();
let archiveProviderGeneration = 0;
const archiveProviders = createLegacyArchiveProviderBridge({
    getTranscript: () => compatibility.getCurrentTranscript()
});
function getArchiveSource() {
    const metadata = compatibility.getSessionMetadata();
    return {
        app: 'Primer++ for Gemini',
        version: VERSION,
        platform: String(metadata.platform || 'gemini-web'),
        locale: String(metadata.locale || globalThis.navigator?.language || 'en'),
        origin: String(metadata.origin || 'https://gemini.google.com'),
        capture: 'visible-session'
    };
}

const getArchiveSections = options => archiveProviders.getSections(options);

const bulkLifecycleArchiveCapability = createLegacyBulkArchiveCapability({ controller: compatibility,
    getSource: getArchiveSource, now: () => now(), isAvailable: () => archiveFeature?.started === true,
    getGeneration: () => archiveProviderGeneration });

function ensureArchiveFeature() {
    if (archiveFeature) return archiveFeature;
    archiveFeature = createPortableArchiveFeature({
        document: globalThis.document,
        now: () => now(),
        getSource: getArchiveSource,
        getSections: getArchiveSections,
        getCurrentSections: getArchiveSections,
        contributors: archiveProviders.getContributors,
        availability: archiveProviders.getAvailability,
        download: (content, filename, type) => compatibility.download(content, filename, type),
        translate: (zh, en) => NativeUI.t(zh, en),
        notify: message => NativeUI.showToast(message),
        openDialog: options => NativeUI.openDialog(options),
        closeDialog: (id, reason) => NativeUI.closeDialog(id, reason)
    });
    return archiveFeature;
}

function runArchiveAction(action) {
    return Promise.resolve().then(action).catch(error => {
        NativeUI.showToast(error?.message || String(error));
        return null;
    });
}

const view = createArchiveExportView({
    controller: compatibility,
    ensureArchiveFeature,
    runArchiveAction,
    translate: (zh, en) => NativeUI.t(zh, en),
    notify: message => NativeUI.showToast(message),
    getChatHeader: () => NativeUI.getChatHeader(),
    removeById: id => NativeUI.remove(id),
    icon: (id, size) => createIcon(id, size),
    computedStyle: element => getComputedStyle(element),
    scanSidebarChats: (...args) => Core.scanSidebarChats(...args),
    invalidateSidebarCache: () => Core.invalidateSidebarCache(),
    requestRender: () => PanelUI.renderDetailsPane()
});

export const ExportModule = {
    id: 'export',
    name: NativeUI.t('归档与导出', 'Archive & Export'),
    description: NativeUI.t(
        '可移植备份、恢复预演与 JSON / CSV / Markdown / HTML / DOCX 导出',
        'Portable backup, restore dry runs, and JSON / CSV / Markdown / HTML / DOCX export'
    ),
    iconId: 'download',
    defaultEnabled: true,
    capabilities: Object.freeze({ [BULK_LIFECYCLE_ARCHIVE_CAPABILITY]: bulkLifecycleArchiveCapability }),

    configure({ sessionAdapter = null, geminiAdapter = GeminiAdapter, archiveSectionsProvider = null,
        contributorsProvider = null, availabilityProvider = null, now: clock = null } = {}) {
        const nextSessionAdapter = sessionAdapter || createDefaultSessionAdapter();
        assertExportSessionAdapter(nextSessionAdapter);
        if (!geminiAdapter || typeof geminiAdapter !== 'object') {
            throw new TypeError('Export geminiAdapter must be an object');
        }
        if (clock !== null && typeof clock !== 'function') {
            throw new TypeError('Export now must be a function');
        }

        const restartArchive = archiveFeature?.started === true;
        archiveProviderGeneration += 1;
        archiveFeature?.stop();
        archiveFeature = null;
        archiveProviders.configure({ archiveSectionsProvider, contributorsProvider, availabilityProvider });
        now = clock || (() => new Date().toISOString());
        compatibility.configure({ sessionAdapter: nextSessionAdapter, geminiAdapter, now });
        if (restartArchive) ensureArchiveFeature().start();
        return this;
    },

    init() {
        archiveProviderGeneration += 1;
        ensureArchiveFeature().start();
        Logger.info('ExportModule initialized');
    },

    destroy() {
        archiveProviderGeneration += 1;
        view.removeNativeUI();
        archiveFeature?.stop();
        archiveFeature = null;
        compatibility.resetSessionState();
        Logger.info('ExportModule destroyed');
    },

    onUserChange() {
        archiveProviderGeneration += 1;
        compatibility.resetSessionState();
        if (archiveFeature?.started) archiveFeature.sessionChanged();
    },

    _getSessionMetadata: () => compatibility.getSessionMetadata(),
    _getUsageSnapshot: () => compatibility.getUsageSnapshot(),
    _getGeminiAdapter: () => compatibility.getGeminiAdapter(),
    _getArchiveSource: getArchiveSource,
    _getArchiveSections: getArchiveSections,
    _ensureArchiveFeature: ensureArchiveFeature,

    injectNativeUI: () => view.injectNativeUI(),
    removeNativeUI: () => view.removeNativeUI(),
    _toggleExportMenu: anchor => view.toggleExportMenu(anchor),
    renderToDetailsPane: container => view.renderToDetailsPane(container),
    renderExportButtons: container => view.renderExportButtons(container),
    getOnboarding: () => view.getOnboarding(),
    _panelButton: (...args) => view.panelButton(...args),
    _buttonRow: buttons => view.buttonRow(buttons),

    exportJSON: () => compatibility.exportJSON(),
    doExportCSV: () => compatibility.doExportCSV(),
    doExportMarkdown: () => compatibility.doExportMarkdown(),

    _getFilePrefix: () => compatibility.getFilePrefix(),
    _getChatFilePrefix: () => compatibility.getChatFilePrefix(),
    _getBulkFilePrefix: () => compatibility.getBulkFilePrefix(),
    _cloneChatMeta: chat => compatibility.cloneChatMeta(chat),
    _rememberBulkChat: chat => compatibility.rememberBulkChat(chat),
    _toggleBulkChat: chat => compatibility.toggleBulkChat(chat),
    _selectVisibleBulkChats: chats => compatibility.selectVisibleBulkChats(chats),
    _clearBulkSelection: () => compatibility.clearBulkSelection(),
    _getSelectedBulkChats: () => compatibility.getSelectedBulkChats(),
    _resolveBulkChatForNavigation: chat => compatibility.resolveBulkChatForNavigation(chat),
    _absoluteChatHref: chat => compatibility.absoluteChatHref(chat),
    _waitForChatReady: (...args) => compatibility.waitForChatReady(...args),
    _navigateToBulkChat: chat => compatibility.navigateToBulkChat(chat),
    _getCurrentChatReference: () => compatibility.getCurrentChatReference(),
    _restoreOriginalChat: chat => compatibility.restoreOriginalChat(chat),
    _captureBulkTranscript: (...args) => compatibility.captureBulkTranscript(...args),
    _failedBulkTranscript: (...args) => compatibility.failedBulkTranscript(...args),

    _getCurrentTranscript: () => compatibility.getCurrentTranscript(),
    _insertTextIntoEditor: text => compatibility.insertTextIntoEditor(text),
    _insertCurrentTranscriptPacket: () => compatibility.insertCurrentTranscriptPacket(),
    _downloadCurrentTranscript: format => compatibility.downloadCurrentTranscript(format),
    exportCurrentChatJSON: () => compatibility.downloadCurrentTranscript('json'),
    exportCurrentChatCSV: () => compatibility.downloadCurrentTranscript('csv'),
    exportCurrentChatMarkdown: () => compatibility.downloadCurrentTranscript('markdown'),
    exportCurrentChatText: () => compatibility.downloadCurrentTranscript('text'),
    exportCurrentChatHTML: () => compatibility.downloadCurrentTranscript('html'),
    exportCurrentChatDOCX: () => compatibility.downloadCurrentTranscript('docx'),

    _collectSelectedTranscripts: () => compatibility.collectSelectedTranscripts(),
    _downloadSelectedTranscripts: format => compatibility.downloadSelectedTranscripts(format),
    _insertSelectedTranscriptPacket: () => compatibility.insertSelectedTranscriptPacket(),
    exportSelectedChatsJSON: () => compatibility.downloadSelectedTranscripts('json'),
    exportSelectedChatsCSV: () => compatibility.downloadSelectedTranscripts('csv'),
    exportSelectedChatsMarkdown: () => compatibility.downloadSelectedTranscripts('markdown'),
    exportSelectedChatsText: () => compatibility.downloadSelectedTranscripts('text'),
    exportSelectedChatsHTML: () => compatibility.downloadSelectedTranscripts('html'),
    exportSelectedChatsDOCX: () => compatibility.downloadSelectedTranscripts('docx'),

    createPortableArchive: (include = ['chats']) => ensureArchiveFeature().create(include),
    previewPortableArchive: (include = ['chats']) => ensureArchiveFeature().showPreview(include),
    downloadPortableArchive: (include = ['chats']) => ensureArchiveFeature().download(include),
    planPortableArchiveRestore: (text, strategy = 'skip') => ensureArchiveFeature().showRestorePlan(text, strategy),
    _runArchiveAction: runArchiveAction
};

Object.defineProperties(ExportModule, {
    _download: {
        configurable: true,
        get: () => (...args) => compatibility.download(...args),
        set: download => compatibility.setDownload(download)
    },
    _sessionAdapter: { get: () => compatibility.sessionAdapter },
    _geminiAdapter: { get: () => compatibility.geminiAdapter },
    _archiveSectionsProvider: { get: () => archiveProviders.archiveSectionsProvider },
    _contributorsProvider: { get: () => archiveProviders.contributorsProvider },
    _availabilityProvider: { get: () => archiveProviders.availabilityProvider },
    _archiveFeature: { get: () => archiveFeature },
    _now: { get: () => now },
    _bulkSelected: { get: () => compatibility.bulkSelected },
    _bulkSelectedMeta: { get: () => compatibility.bulkSelectedMeta },
    _bulkExporting: {
        get: () => compatibility.bulkExporting,
        set: value => { compatibility.bulkExporting = value; }
    },
    _bulkCancelRequested: {
        get: () => compatibility.bulkCancelRequested,
        set: value => { compatibility.bulkCancelRequested = value; }
    },
    _bulkProgress: {
        get: () => compatibility.bulkProgress,
        set: value => { compatibility.bulkProgress = value; }
    }
});
