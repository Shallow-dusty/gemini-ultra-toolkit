import { formatBulkTranscriptSnippetPacket } from '../../../lib/context_packet_tools.js';
import { renderBulkTranscriptDownload } from './export_download_renderer.js';
import { captureCurrentTranscript, transcriptCaptureSignature } from './transcript_capture.js';
import transcriptFidelity from '../../../lib/transcript_fidelity.js';

const {
    CHAT_TRANSCRIPT_FORMAT,
    TRANSCRIPT_SCHEMA_VERSION,
    appendFidelityLoss,
    sanitizePublicHref
} = transcriptFidelity;

const noopLogger = Object.freeze({ warn() {}, info() {} });

export function createMultiChatExportController(options = {}) {
    const usage = options.usage;
    const current = options.current;
    if (!usage || typeof usage !== 'object' || !current || typeof current !== 'object') {
        throw new TypeError('Multi-chat export requires usage and current-chat controllers');
    }
    if (typeof options.monotonicNow !== 'function') {
        throw new TypeError('Multi-chat export monotonicNow must be a function');
    }
    const monotonicNow = options.monotonicNow;
    const scanSidebarChats = options.scanSidebarChats ?? (() => []);
    const sleep = options.sleep ?? (() => Promise.resolve());
    const requestRender = options.requestRender ?? (() => {});
    const translate = options.translate ?? ((_zh, en) => en);
    const notify = options.notify ?? (() => {});
    const logger = options.logger ?? noopLogger;
    const mouseEvent = options.mouseEvent ?? ((type, init) => new MouseEvent(type, init));
    const state = {
        selected: new Set(),
        selectedMeta: {},
        exporting: false,
        cancelRequested: false,
        progress: { current: 0, total: 0, title: '' }
    };

    const controller = {
        get selected() { return state.selected; },
        get selectedMeta() { return state.selectedMeta; },
        get exporting() { return state.exporting; },
        set exporting(value) { state.exporting = !!value; },
        get cancelRequested() { return state.cancelRequested; },
        set cancelRequested(value) { state.cancelRequested = !!value; },
        get progress() { return state.progress; },
        set progress(value) { state.progress = value; },

        resetSessionState() {
            controller.clearSelection();
            state.exporting = false;
            state.cancelRequested = false;
            state.progress = { current: 0, total: 0, title: '' };
        },

        cloneChatMeta(chat) {
            return {
                id: chat?.id || '',
                title: chat?.title || 'Untitled',
                href: chat?.href || '',
                element: chat?.element || null
            };
        },

        rememberChat(chat) {
            if (!chat?.id) return;
            state.selectedMeta[chat.id] = controller.cloneChatMeta(chat);
        },

        toggleChat(chat) {
            if (!chat?.id) return;
            controller.rememberChat(chat);
            if (state.selected.has(chat.id)) state.selected.delete(chat.id);
            else state.selected.add(chat.id);
        },

        selectVisible(chats) {
            chats.forEach(chat => {
                controller.rememberChat(chat);
                state.selected.add(chat.id);
            });
        },

        clearSelection() {
            state.selected.clear();
            state.selectedMeta = {};
        },

        getSelectedChats() {
            const byId = new Map();
            scanSidebarChats(true).forEach(chat => {
                controller.rememberChat(chat);
                byId.set(chat.id, controller.cloneChatMeta(chat));
            });
            return Array.from(state.selected)
                .map(id => byId.get(id) || state.selectedMeta[id])
                .filter(chat => chat?.id);
        },

        resolveForNavigation(chat) {
            const match = scanSidebarChats(true).find(item => item.id === chat.id);
            if (!match) return chat;
            const resolved = controller.cloneChatMeta(match);
            resolved.title = chat.title || resolved.title;
            controller.rememberChat(resolved);
            return resolved;
        },

        absoluteHref(chat) {
            const href = chat?.href || '';
            if (!href) return '';
            try {
                return new URL(href, usage.getSessionMetadata().origin || globalThis.location?.origin).href;
            } catch (_error) {
                return '';
            }
        },

        async waitForReady(chatId, timeout = 12000) {
            const start = monotonicNow();
            let lastSignature = '';
            let stableMs = 0;
            while (monotonicNow() - start < timeout) {
                if (usage.getSessionMetadata().chatId === chatId) {
                    const adapter = usage.getGeminiAdapter();
                    const messages = adapter.getCurrentConversationMessages();
                    if (messages.length > 0) {
                        const signature = transcriptCaptureSignature(messages);
                        if (signature === lastSignature) stableMs += 250;
                        else {
                            lastSignature = signature;
                            stableMs = 0;
                        }
                        if (stableMs >= 500) return true;
                    } else if (monotonicNow() - start > 1500 && adapter.getChatTitleText()) {
                        return true;
                    }
                }
                await sleep(250);
            }
            return usage.getSessionMetadata().chatId === chatId;
        },

        async navigate(chat) {
            if (usage.getSessionMetadata().chatId !== chat.id) {
                let target = controller.resolveForNavigation(chat);
                if (!target.element || typeof target.element.click !== 'function') {
                    throw new Error('Chat row is not available for in-page navigation');
                }
                target.element.dispatchEvent(mouseEvent('mouseenter', { bubbles: true }));
                await sleep(100);
                target = controller.resolveForNavigation(target);
                target.element?.click?.();
                await sleep(250);
                const fresh = usage.getSessionMetadata().chatId === chat.id
                    ? null : controller.resolveForNavigation(chat);
                if (fresh?.element !== target.element && typeof fresh?.element?.click === 'function') {
                    fresh.element.click();
                }
            }
            if (!await controller.waitForReady(chat.id)) {
                throw new Error('Timed out waiting for chat to render');
            }
        },
        getCurrentReference() {
            const metadata = usage.getSessionMetadata();
            if (!metadata.chatId) return null;
            const match = scanSidebarChats(true).find(chat => chat.id === metadata.chatId);
            if (match) return controller.cloneChatMeta(match);
            return {
                id: metadata.chatId,
                title: usage.getGeminiAdapter().getChatTitleText() || metadata.chatId,
                href: metadata.href || globalThis.location?.href || '',
                element: null
            };
        },

        async restoreOriginal(originalChat) {
            if (!originalChat?.id || usage.getSessionMetadata().chatId === originalChat.id) return;
            const match = scanSidebarChats(true).find(chat => chat.id === originalChat.id);
            if (!match?.element || typeof match.element.click !== 'function') return;
            match.element.click();
            await controller.waitForReady(originalChat.id, 6000);
        },

        capture(chat, exportedAt) {
            const adapter = usage.getGeminiAdapter();
            const capture = captureCurrentTranscript(adapter);
            const messages = capture.messages;
            const metadata = usage.getSessionMetadata();
            const source = sanitizePublicHref(
                metadata.href || globalThis.location?.href || '',
                globalThis.location?.href || undefined
            );
            const fidelity = source.lossy
                ? appendFidelityLoss(capture.fidelity, 'URL_METADATA_STRIPPED')
                : capture.fidelity;
            return {
                format: CHAT_TRANSCRIPT_FORMAT,
                schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
                chatId: chat.id,
                selectedTitle: chat.title,
                title: adapter.getChatTitleText() || chat.title || 'Gemini conversation',
                href: source.href,
                exportedAt,
                status: messages.length > 0 ? 'exported' : 'empty',
                messages,
                fidelity,
                metadata: {
                    captureMethod: fidelity.captureMethod,
                    visibleMessageCount: messages.length,
                    model: metadata.model || adapter.detectModelKey?.() || null,
                    richResponse: adapter.getRichResponseProbeReport?.() || null
                }
            };
        },

        failed(chat, exportedAt, error) {
            return {
                chatId: chat.id,
                selectedTitle: chat.title,
                title: chat.title || 'Gemini conversation',
                href: controller.absoluteHref(chat),
                exportedAt,
                status: 'failed',
                error: error?.message || String(error),
                messages: []
            };
        },

        async collect() {
            if (state.exporting) return null;
            const selected = controller.getSelectedChats();
            if (selected.length === 0) {
                notify(translate('请选择要导出的对话', 'Select chats to export'));
                return null;
            }

            const exportedAt = usage.now();
            const originalChat = controller.getCurrentReference();
            const transcripts = [];
            state.exporting = true;
            state.cancelRequested = false;
            state.progress = { current: 0, total: selected.length, title: '' };
            requestRender();
            try {
                for (let index = 0; index < selected.length; index++) {
                    if (state.cancelRequested) break;
                    const chat = controller.resolveForNavigation(selected[index]);
                    state.progress = { current: index + 1, total: selected.length, title: chat.title };
                    requestRender();
                    try {
                        await controller.navigate(chat);
                        transcripts.push(controller.capture(chat, exportedAt));
                    } catch (error) {
                        logger.warn('Selected chat export failed', { chatId: chat.id, error: String(error) });
                        transcripts.push(controller.failed(chat, exportedAt, error));
                    }
                    await sleep(300);
                }
                if (state.cancelRequested) {
                    notify(translate('已取消导出', 'Export canceled'));
                    return null;
                }
                return { app: 'Primer++ for Gemini', exportedAt, chats: transcripts };
            } finally {
                await controller.restoreOriginal(originalChat);
                state.exporting = false;
                state.cancelRequested = false;
                state.progress = { current: 0, total: 0, title: '' };
                requestRender();
            }
        },

        async downloadSelected(format) {
            const bulkExport = await controller.collect();
            if (!bulkExport) return;
            const rendered = renderBulkTranscriptDownload(format, bulkExport, usage.getBulkFilePrefix());
            usage.download(rendered.content, rendered.filename, rendered.type);
        },
        async insertSelectedPacket() {
            const bulkExport = await controller.collect();
            if (!bulkExport) return;
            const packet = formatBulkTranscriptSnippetPacket(bulkExport, {
                label: 'Selected Gemini transcript snippet packet'
            });
            if (!packet) {
                notify(translate('没有可插入的已选对话消息', 'No selected chat messages to insert'));
                return;
            }
            if (current.insertTextIntoEditor(packet)) {
                notify(translate('已选对话上下文包已插入', 'Selected chat packet inserted'));
                logger.info('Selected transcript packet inserted', { chats: bulkExport.chats.length });
            }
        }
    };
    return controller;
}
