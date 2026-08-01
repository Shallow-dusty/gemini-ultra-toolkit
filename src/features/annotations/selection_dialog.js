import { NativeUI } from '../../native_ui.js';
import { GeminiAdapter } from '../../adapters/gemini.js';
import { INPUT_STYLE, splitTags } from './legacy_controls.js';

/** Owns selection discovery and the message-annotation dialog. */
export function createSelectionAnnotationDialog(host) {
    function captureVisibleSelection() {
        const selection = window.getSelection?.();
        if (!selection || selection.isCollapsed || !selection.toString().trim() || selection.rangeCount < 1) return null;
        const range = selection.getRangeAt(0);
        const node = range.commonAncestorContainer;
        const element = node?.nodeType === 3 ? node.parentElement : node;
        if (!element || !GeminiAdapter.isInsideChatContent(element)) return null;
        const excerpt = selection.toString().trim().slice(0, 320);
        let locator = null;
        try { locator = GeminiAdapter.getMessageLocatorForNode(element); }
        catch { /* locator failures degrade to an inspectable fallback anchor */ }
        let role = 'unknown';
        if (locator?.kind === 'message' && Number.isInteger(locator.ordinal)) {
            try { role = GeminiAdapter.getCurrentConversationMessages()?.[locator.ordinal]?.role || 'unknown'; }
            catch { /* role is optional locator diagnostics */ }
        }
        const anchor = locator?.kind === 'message'
            ? {
                kind: 'message',
                messageId: locator.messageId || null,
                role,
                ordinal: Number.isInteger(locator.ordinal) ? locator.ordinal : null,
                excerpt
            }
            : { kind: 'message', role: 'unknown', excerpt };
        return Object.freeze({ excerpt, anchor: Object.freeze(anchor) });
    }

    return Object.freeze({
        captureVisibleSelection,

        getVisibleSelection() {
            return captureVisibleSelection()?.excerpt || null;
        },

        open(current) {
            if (host._isInspecting()) {
                host._showError({ code: 'READ_ONLY_SESSION' });
                return null;
            }
            const captured = host._captureVisibleSelection();
            if (!captured) {
                NativeUI.showToast(NativeUI.t('请先在当前对话中选择文本', 'Select text in the current conversation first'));
                return null;
            }
            const { excerpt, anchor } = captured;

            const modal = document.createElement('div');
            modal.className = 'settings-modal';
            modal.style.width = 'min(420px,calc(100vw - 32px))';
            const heading = document.createElement('h2');
            heading.textContent = NativeUI.t('消息注释', 'Message annotation');
            heading.style.cssText = 'margin:0;padding:18px 18px 6px;font-size:18px;';
            const excerptText = document.createElement('blockquote');
            excerptText.textContent = excerpt;
            excerptText.style.cssText = 'margin:8px 18px;padding:10px;border-left:3px solid var(--accent,#8ab4f8);font-size:12px;max-height:96px;overflow:auto;';
            const form = document.createElement('div');
            form.style.cssText = 'padding:0 18px 18px;';
            const noteArea = document.createElement('textarea');
            noteArea.rows = 4;
            noteArea.style.cssText = `${INPUT_STYLE}resize:vertical;`;
            host._appendField(form, NativeUI.t('注释内容', 'Annotation text'), noteArea);
            const tagsInput = document.createElement('input');
            tagsInput.type = 'text';
            tagsInput.style.cssText = INPUT_STYLE;
            host._appendField(form, NativeUI.t('标签', 'Tags'), tagsInput);
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px;';
            let handle;
            const cancel = host._makeButton(NativeUI.t('取消', 'Cancel'), () => handle.close('cancel'));
            const save = host._makeButton(NativeUI.t('保存消息注释', 'Save message annotation'), async () => {
                const saved = await host._mutate(context => host._service.upsert({
                    conversation: current,
                    anchor,
                    body: noteArea.value,
                    tags: splitTags(tagsInput.value),
                    status: 'active',
                    pinned: false
                }, context), NativeUI.t('消息注释已保存', 'Message annotation saved'));
                if (saved) handle.close('save');
            });
            actions.appendChild(cancel);
            actions.appendChild(save);
            form.appendChild(actions);
            modal.appendChild(heading);
            modal.appendChild(excerptText);
            modal.appendChild(form);
            handle = NativeUI.openDialog({
                id: 'primer-annotations-message-editor',
                ariaLabel: NativeUI.t('创建消息注释', 'Create message annotation'),
                overlayClass: 'settings-overlay',
                contentElement: modal,
                initialFocus: noteArea,
                closeOnEscape: true,
                restoreFocus: true
            });
            return handle;
        }
    });
}
