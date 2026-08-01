import { formatTranscriptSnippetPacket } from '../../../lib/context_packet_tools.js';
import { renderCurrentTranscriptDownload } from './export_download_renderer.js';
import { captureCurrentTranscript } from './transcript_capture.js';
import transcriptFidelity from '../../../lib/transcript_fidelity.js';

const {
    CHAT_TRANSCRIPT_FORMAT,
    TRANSCRIPT_SCHEMA_VERSION,
    appendFidelityLoss,
    sanitizePublicHref
} = transcriptFidelity;

const noopLogger = Object.freeze({ info() {} });

export function createCurrentChatExportController(options = {}) {
    const usage = options.usage;
    if (!usage || typeof usage !== 'object') {
        throw new TypeError('Current chat export requires a usage/session controller');
    }
    const translate = options.translate ?? ((_zh, en) => en);
    const notify = options.notify ?? (() => {});
    const logger = options.logger ?? noopLogger;
    const document = options.document ?? (() => globalThis.document);
    const inputEvent = options.inputEvent ?? ((type, init) => new InputEvent(type, init));
    const event = options.event ?? ((type, init) => new Event(type, init));

    const controller = {
        getCurrentTranscript() {
            const metadata = usage.getSessionMetadata();
            const adapter = usage.getGeminiAdapter();
            const capture = captureCurrentTranscript(adapter);
            const messages = capture.messages;
            const chatId = metadata.chatId || '';
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
                chatId,
                title: adapter.getChatTitleText()
                    || document()?.title
                    || chatId
                    || 'Gemini conversation',
                href: source.href,
                exportedAt: usage.now(),
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

        insertTextIntoEditor(text) {
            const editor = usage.getGeminiAdapter().getInputEditor();
            if (!editor) {
                notify(translate('未找到 Gemini 输入框', 'Gemini input box not found'));
                return false;
            }

            editor.focus();
            const before = 'value' in editor ? editor.value : editor.textContent;
            const beforeInput = inputEvent('beforeinput', {
                inputType: 'insertText', data: text, bubbles: true, cancelable: true, composed: true
            });
            const accepted = editor.dispatchEvent(beforeInput);
            const after = 'value' in editor ? editor.value : editor.textContent;
            if (accepted && after !== before) return true;

            if ('value' in editor) {
                const start = Number.isInteger(editor.selectionStart) ? editor.selectionStart : editor.value.length;
                const end = Number.isInteger(editor.selectionEnd) ? editor.selectionEnd : editor.value.length;
                editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
                editor.selectionStart = editor.selectionEnd = start + text.length;
            } else {
                const paragraph = document().createElement('p');
                paragraph.textContent = text;
                editor.appendChild(paragraph);
            }
            editor.dispatchEvent(event('input', { bubbles: true }));
            return true;
        },

        insertCurrentTranscriptPacket() {
            const transcript = controller.getCurrentTranscript();
            const packet = formatTranscriptSnippetPacket(transcript, {
                label: 'Current Gemini transcript snippet packet'
            });
            if (!packet) {
                notify(translate('没有可插入的可见对话消息', 'No visible chat messages to insert'));
                return;
            }
            if (controller.insertTextIntoEditor(packet)) {
                notify(translate('对话上下文包已插入', 'Chat packet inserted'));
                logger.info('Current transcript packet inserted', { messages: transcript.messages.length });
            }
        },

        downloadCurrentTranscript(format) {
            const transcript = controller.getCurrentTranscript();
            if (transcript.messages.length === 0) {
                notify(translate('没有可导出的可见对话消息', 'No visible chat messages to export'));
                return;
            }
            const rendered = renderCurrentTranscriptDownload(format, transcript, usage.getChatFilePrefix());
            usage.download(rendered.content, rendered.filename, rendered.type);
        }
    };
    return controller;
}
