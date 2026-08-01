import { Core } from '../../core.js';
import { NativeUI } from '../../native_ui.js';
import { createIcon } from '../../icons.js';
import { GeminiAdapter } from '../../adapters/gemini.js';
import { formatContextPacket, formatContextReference } from '../../../lib/context_packet_tools.js';

export function annotationToContextReference(annotation) {
    return {
        chatId: annotation.conversation.id,
        title: annotation.conversation.title,
        href: annotation.conversation.href,
        note: annotation.body
    };
}

/** Owns explicit composer insertion and current-conversation context lookup. */
export function createAnnotationsContextTransfer(host) {
    return Object.freeze({
        insertTextIntoEditor(text) {
            const editor = GeminiAdapter.getInputEditor();
            if (!editor) {
                NativeUI.showToast(NativeUI.t('未找到 Gemini 输入框', 'Gemini input box not found'));
                return false;
            }
            editor.focus();
            const before = 'value' in editor ? editor.value : editor.textContent;
            const inputEvent = new InputEvent('beforeinput', {
                inputType: 'insertText', data: text, bubbles: true, cancelable: true, composed: true
            });
            const accepted = editor.dispatchEvent(inputEvent);
            const after = 'value' in editor ? editor.value : editor.textContent;
            if (accepted && after !== before) return true;

            if ('value' in editor) {
                const start = Number.isInteger(editor.selectionStart) ? editor.selectionStart : editor.value.length;
                const end = Number.isInteger(editor.selectionEnd) ? editor.selectionEnd : editor.value.length;
                editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
                editor.selectionStart = editor.selectionEnd = start + text.length;
            } else {
                const paragraph = document.createElement('p');
                paragraph.textContent = text;
                editor.appendChild(paragraph);
            }
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        },

        insertContextReference(annotation) {
            const text = formatContextReference(annotationToContextReference(annotation));
            if (text && host._insertTextIntoEditor(text)) {
                NativeUI.showToast(NativeUI.t('注释引用已插入', 'Annotation reference inserted'));
            }
        },

        insertPinnedContextPacket(notes) {
            const text = formatContextPacket(notes.slice(0, 8), { label: 'Pinned Gemini context packet' });
            if (text && host._insertTextIntoEditor(text)) {
                NativeUI.showToast(NativeUI.t('置顶注释包已插入', 'Pinned annotation packet inserted'));
            }
        },

        makeContextInsertButton(annotation) {
            const label = NativeUI.t('插入本地注释引用', 'Insert local annotation reference');
            const button = host._makeButton('', () => host._insertContextReference(annotation), {
                className: 'g-btn',
                title: label,
                ariaLabel: label,
                style: 'display:inline-flex;align-items:center;justify-content:center;width:44px;min-width:44px;flex:0 0 44px;padding:8px;'
            });
            button.appendChild(createIcon('copy', 14));
            return button;
        },

        getCurrentChatRef() {
            const chatId = Core.getChatId();
            if (!chatId) return null;
            const fromSidebar = Core.scanSidebarChats(true).find(chat => chat.id === chatId);
            return {
                id: chatId,
                title: fromSidebar?.title || document.title || chatId,
                href: fromSidebar?.href || `/app/${chatId}`
            };
        }
    });
}
