import { getToolModeState } from '../../../lib/tool_mode_tools.js';
import { closestAny, firstMatch } from './dom.js';
import { SELECTORS } from './selectors.js';

function readToolModeState(element) {
    return getToolModeState({
        text: element.textContent || '',
        ariaLabel: element.getAttribute('aria-label') || '',
        ariaPressed: element.getAttribute('aria-pressed') || '',
        ariaCurrent: element.getAttribute('aria-current') || '',
        dataActive: element.getAttribute('data-active') || '',
        classList: Array.from(element.classList || [])
    });
}

function dispatchInput(element, text) {
    if (typeof element.dispatchEvent !== 'function') return;
    const view = element.ownerDocument?.defaultView || globalThis;
    const EventClass = view.InputEvent || view.Event;
    if (typeof EventClass !== 'function') return;
    element.dispatchEvent(new EventClass('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text
    }));
}

export const composerMethods = Object.freeze({
    getInputArea() {
        return firstMatch(document, SELECTORS.INPUT_AREA);
    },

    getInputEditor() {
        return firstMatch(document, SELECTORS.INPUT_EDITOR_CURRENT)
            || document.querySelector(SELECTORS.INPUT_EDITOR_BY_ARIA)
            || document.querySelector(SELECTORS.INPUT_EDITOR);
    },

    getInputTrailingActions() {
        return document.querySelector(SELECTORS.INPUT_TRAILING_ACTIONS);
    },

    getActiveToolMode() {
        const area = this.getInputArea();
        if (!area) return { active: false, label: '' };
        for (const element of area.querySelectorAll(SELECTORS.TOOL_MODE_CANDIDATE)) {
            const state = readToolModeState(element);
            if (state.active) return state;
        }
        return { active: false, label: '' };
    },

    getVisibleToolModeEntries() {
        const entries = [];
        document.querySelectorAll(SELECTORS.TOOL_MODE_CANDIDATE).forEach((element, index) => {
            const state = readToolModeState(element);
            if (state.label) entries.push({ index, label: state.label, active: state.active });
        });
        return entries.slice(0, 20);
    },

    getSendButton() {
        return firstMatch(document, SELECTORS.SEND_BUTTON);
    },

    isInsideInputEditor(target) {
        return Boolean(closestAny(target, SELECTORS.INPUT_EDITOR_TARGET.split(', ')));
    },

    isSendButtonElement(button) {
        if (!button || button.disabled) return false;
        if (button.classList?.contains('send-button')) return true;
        const label = (button.getAttribute?.('aria-label') || '').trim();
        if (label === 'Send message' || label === 'Send' || /^send\s+(message|prompt)$/i.test(label)) return true;
        return label.includes('发送') || label.includes('送信') || label.includes('전송') || label.includes('보내기');
    },

    getClosestSendButton(target) {
        const button = closestAny(target, 'button');
        return this.isSendButtonElement(button) ? button : null;
    },

    insertComposerText(text, options = {}) {
        if (typeof text !== 'string' || text.length === 0) return false;
        const editor = this.getInputEditor();
        if (!editor) return false;
        editor.focus?.();

        if ('value' in editor) {
            const value = String(editor.value || '');
            const start = Number.isInteger(editor.selectionStart) ? editor.selectionStart : value.length;
            const end = Number.isInteger(editor.selectionEnd) ? editor.selectionEnd : start;
            editor.value = options.replace ? text : `${value.slice(0, start)}${text}${value.slice(end)}`;
        } else if (editor.isContentEditable || editor.getAttribute?.('contenteditable') === 'true') {
            const inserted = !options.replace && editor.ownerDocument?.execCommand?.('insertText', false, text);
            if (!inserted) editor.textContent = options.replace ? text : `${editor.textContent || ''}${text}`;
        } else {
            return false;
        }

        dispatchInput(editor, text);
        return true;
    }
});
