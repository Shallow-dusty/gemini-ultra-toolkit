import { NativeUI } from '../../native_ui.js';
import { createLegacyAnnotationsController } from './legacy_controller.js';
import { createLegacyAnnotationsControls } from './legacy_controls.js';
import { createAnnotationsContextTransfer } from './context_transfer.js';
import { createSelectionAnnotationDialog } from './selection_dialog.js';
import { createConversationAnnotationSurface } from './conversation_surface.js';
import { createAnnotationLibrarySurface } from './library_surface.js';
import { createLegacyAnnotationsView } from './legacy_view.js';

function getOnboarding() {
    return {
        zh: {
            rant: 'Gemini 的对话列表无法记录一段结论为什么重要，也无法把说明稳定锚定到某条消息。',
            features: '为对话和选中消息保存本地注释、标签、状态与置顶；支持搜索、JSON 导入导出和显式上下文引用。数据只保存在浏览器本地。',
            guide: '打开对话后在 Annotations 标签保存对话注释；选中消息文字可创建带诊断回退锚点的消息注释。检查其他账号时所有写入自动禁用。'
        },
        en: {
            rant: 'Gemini titles do not capture why a conclusion matters or let you attach a durable explanation to a message.',
            features: 'Save local conversation and message annotations with tags, status, pins, search, JSON portability, and explicit context references.',
            guide: 'Open a conversation and use Annotations for conversation notes. Select visible message text to create a diagnostic fallback anchor. Writes are disabled while inspecting another account.'
        }
    };
}

/**
 * Small compatibility facade for the v12 ModuleHost contract. Each behavior is
 * delegated to a responsibility-owned component; state remains on this host so
 * external callers that relied on legacy fields continue to work.
 */
export function createLegacyChatNotesModule() {
    const host = {
        id: 'chat-notes',
        name: NativeUI.t('注释', 'Annotations'),
        legacyName: NativeUI.t('对话笔记', 'Chat Notes'),
        description: NativeUI.t('为对话或消息保存本地注释', 'Save local annotations for conversations or messages'),
        iconId: 'pin',
        defaultEnabled: false,
        STORAGE_KEY: 'gemini_chat_notes',
        data: { notes: {} },
        _service: null,
        _repositories: null,
        _detailsContainer: null,
        _searchQuery: '',
        _controlSequence: 0,
        _archiveGeneration: 0,
        getOnboarding
    };

    const controller = createLegacyAnnotationsController(host);
    const controls = createLegacyAnnotationsControls(host);
    const contextTransfer = createAnnotationsContextTransfer(host);
    const selectionDialog = createSelectionAnnotationDialog(host);
    const conversationSurface = createConversationAnnotationSurface(host);
    const librarySurface = createAnnotationLibrarySurface(host);
    const view = createLegacyAnnotationsView(host);

    Object.assign(host, {
        _getStorageKey: controller.getStorageKey,
        _getSessionId: controller.getSessionId,
        _createRepository: controller.createRepository,
        _createService: controller.createService,
        init: controller.init,
        destroy: controller.destroy,
        onUserChange: controller.onUserChange,
        loadData: controller.loadData,
        injectNativeUI: controller.injectNativeUI,
        _syncCompatibilityData: controller.syncCompatibilityData,
        _isInspecting: controller.isInspecting,
        _writeContext: controller.writeContext,
        _snapshot: controller.snapshot,
        getPortableArchiveIntegration: controller.getPortableArchiveIntegration,
        _getStats: controller.getStats,
        _conversationAnnotation: controller.conversationAnnotation,
        _refreshDetails: controller.refreshDetails,
        _showError: controller.showError,
        _mutate: controller.mutate,
        _nextControlId: controls.nextControlId,
        _appendField: controls.appendField,
        _makeButton: controls.makeButton,
        _insertTextIntoEditor: contextTransfer.insertTextIntoEditor,
        _insertContextReference: contextTransfer.insertContextReference,
        _insertPinnedContextPacket: contextTransfer.insertPinnedContextPacket,
        _makeContextInsertButton: contextTransfer.makeContextInsertButton,
        _getCurrentChatRef: contextTransfer.getCurrentChatRef,
        _captureVisibleSelection: selectionDialog.captureVisibleSelection,
        _getVisibleSelection: selectionDialog.getVisibleSelection,
        _openSelectionAnnotationDialog: selectionDialog.open,
        _renderReadOnlyNotice: conversationSurface.renderReadOnlyNotice,
        _renderCurrentChatEditor: conversationSurface.renderCurrentChatEditor,
        _openAnnotationBacklink: librarySurface.openAnnotationBacklink,
        _renderPinnedAnnotations: librarySurface.renderPinnedAnnotations,
        _renderSearchResults: librarySurface.renderSearchResults,
        _renderSearch: librarySurface.renderSearch,
        _exportAnnotations: librarySurface.exportAnnotations,
        _importAnnotations: librarySurface.importAnnotations,
        renderToDetailsPane: view.renderToDetailsPane
    });

    return host;
}

export const ChatNotesModule = createLegacyChatNotesModule();
