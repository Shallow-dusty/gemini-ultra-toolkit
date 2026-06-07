import { TIMINGS, PANEL_ID } from '../constants.js';
import { Logger } from '../logger.js';
import { NativeUI } from '../native_ui.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { createIcon } from '../icons.js';
import { formatTextSnippetPacket } from '../../lib/context_packet_tools.js';

export const QuoteReplyModule = {
    id: 'quote-reply',
    name: NativeUI.t('引用回复', 'Quote Reply'),
    description: NativeUI.t('选中文本后快速插入引用到输入框', 'Select text to quickly quote into input'),
    icon: '\uD83D\uDCAC',
    defaultEnabled: false,

    _fab: null,
    _boundPointerUp: null,
    _boundPointerDown: null,

    init() {
        this._boundPointerUp = this._onPointerUp.bind(this);
        this._boundPointerDown = this._onPointerDown.bind(this);
        document.addEventListener('pointerup', this._boundPointerUp, true);
        document.addEventListener('pointerdown', this._boundPointerDown, true);
        Logger.info('QuoteReplyModule initialized');
    },

    destroy() {
        if (this._boundPointerUp) {
            document.removeEventListener('pointerup', this._boundPointerUp, true);
            this._boundPointerUp = null;
        }
        if (this._boundPointerDown) {
            document.removeEventListener('pointerdown', this._boundPointerDown, true);
            this._boundPointerDown = null;
        }
        this._removeFab();
    },

    onUserChange() {},

    _onPointerDown(e) {
        // If clicking the FAB itself, don't remove it
        if (this._fab && this._fab.contains(e.target)) return;
        this._removeFab();
    },

    _onPointerUp(e) {
        // Delay slightly to let browser finalize selection
        setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                return;
            }

            // Only show for text within the main chat area (not our panel)
            const range = sel.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const el = container.nodeType === 3 ? container.parentElement : container;
            if (!el) return;

            // Skip if selection is in our panel or in the editor
            if (el.closest('#' + PANEL_ID)) return;
            if (GeminiAdapter.isInsideInputEditor(el)) return;
            if (!GeminiAdapter.isInsideChatContent(el)) return;

            const text = sel.toString().trim();
            if (!text || text.length < 2) return;

            this._showFab(e.clientX, e.clientY, text);
        }, 50);
    },

    _showFab(x, y, text) {
        this._removeFab();

        const fab = document.createElement('div');
        fab.className = 'gc-quote-fab';

        const quoteBtn = this._makeFabButton('quote', NativeUI.t('引用', 'Quote'), NativeUI.t('引用选中文本', 'Quote selected text'), (e) => {
            e.stopPropagation();
            this._insertQuote(text);
            this._removeFab();
        });
        const packetBtn = this._makeFabButton('package', NativeUI.t('包', 'Packet'), NativeUI.t('插入选中文本上下文包', 'Insert selected text packet'), (e) => {
            e.stopPropagation();
            this._insertSnippetPacket(text);
            this._removeFab();
        });
        fab.appendChild(quoteBtn);
        fab.appendChild(packetBtn);

        // Position near cursor, clamped to viewport
        const fabW = 150;
        const fabH = 30;
        let left = Math.min(x + 8, window.innerWidth - fabW - 10);
        let top = Math.max(y - fabH - 8, 10);
        fab.style.left = left + 'px';
        fab.style.top = top + 'px';

        document.body.appendChild(fab);
        this._fab = fab;

        // Animate in
        requestAnimationFrame(() => fab.classList.add('visible'));

        // Auto-dismiss after timeout
        setTimeout(() => {
            if (this._fab === fab) this._removeFab();
        }, TIMINGS.FAB_AUTO_DISMISS);
    },

    _makeFabButton(icon, label, title, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gc-quote-fab-btn';
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.appendChild(createIcon(icon, 12));
        btn.appendChild(document.createTextNode(label));
        btn.onclick = onClick;
        return btn;
    },

    _removeFab() {
        if (this._fab) {
            this._fab.remove();
            this._fab = null;
        }
    },

    _insertQuote(text) {
        const editor = GeminiAdapter.getInputEditor();
        if (!editor) {
            Logger.warn('QuoteReply: editor not found');
            return;
        }

        // Format as blockquote: each line prefixed with >
        const quoted = text.split('\n').map(line => '> ' + line).join('\n');
        const fullText = quoted + '\n\n';

        // Check if editor is empty (has only placeholder)
        const isBlank = editor.classList.contains('ql-blank') ||
                        (editor.textContent.trim() === '' && editor.children.length <= 1);

        if (isBlank) {
            editor.replaceChildren();
            editor.classList.remove('ql-blank');
        }

        // Insert quoted text as paragraphs
        const lines = fullText.split('\n');
        lines.forEach(line => {
            const p = document.createElement('p');
            if (line === '') {
                p.appendChild(document.createElement('br'));
            } else {
                p.textContent = line;
            }
            editor.appendChild(p);
        });

        // Dispatch input event to notify Gemini's framework
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.focus();

        // Place cursor at end
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);

        Logger.info('Quote inserted', { length: text.length });
    },

    _insertEditorText(text) {
        const editor = GeminiAdapter.getInputEditor();
        if (!editor) {
            Logger.warn('QuoteReply: editor not found');
            return false;
        }

        editor.focus();
        const before = 'value' in editor ? editor.value : editor.textContent;
        const inputEvent = new InputEvent('beforeinput', {
            inputType: 'insertText',
            data: text,
            bubbles: true,
            cancelable: true,
            composed: true
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
            const p = document.createElement('p');
            p.textContent = text;
            editor.appendChild(p);
        }
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    },

    _insertSnippetPacket(text) {
        let title = '';
        try { title = GeminiAdapter.getChatTitleText() || document.title || ''; }
        catch { title = document.title || ''; }
        const packet = formatTextSnippetPacket({
            title,
            href: window.location.href,
            text
        }, {
            label: 'Selected Gemini text snippet'
        });
        if (!packet) return;
        if (this._insertEditorText(packet)) {
            NativeUI.showToast(NativeUI.t('选中文本上下文包已插入', 'Selected text packet inserted'));
            Logger.info('Quote snippet packet inserted', { length: text.length });
        }
    }
};
