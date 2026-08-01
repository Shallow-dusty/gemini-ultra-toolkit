import { formatTextSnippetPacket } from '../../../lib/context_packet_tools.js';
import { SearchNavigatorError } from './contracts.js';
import { announce, ensureText, ownFunction, textMessage } from './view_contracts.js';

export function formatQuoteText(text) {
    return `${String(text).split(/\r?\n/u).map(line => `> ${line}`).join('\n')}\n\n`;
}

function createInputEvent(documentRef) {
    const EventConstructor = documentRef.defaultView?.Event || globalThis.Event;
    return new EventConstructor('input', { bubbles: true, composed: true });
}

function directComposerInsert(documentRef, editor, text) {
    if (!editor) return false;
    editor.focus?.();
    if (typeof editor.value === 'string') {
        const start = Number.isInteger(editor.selectionStart) ? editor.selectionStart : editor.value.length;
        const end = Number.isInteger(editor.selectionEnd) ? editor.selectionEnd : editor.value.length;
        editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
        editor.selectionStart = editor.selectionEnd = start + text.length;
    } else {
        const lines = text.split('\n');
        for (const line of lines) {
            const paragraph = documentRef.createElement('p');
            if (line) paragraph.textContent = line;
            else paragraph.append(documentRef.createElement('br'));
            editor.append(paragraph);
        }
    }
    editor.dispatchEvent?.(createInputEvent(documentRef));
    editor.focus?.();
    return true;
}

export function insertComposerText(view, text) {
    if (ownFunction(view.adapter, 'insertComposerText')) {
        return view.adapter.insertComposerText(text, {
            source: 'search-navigator',
            submit: false,
            focus: true
        }) !== false;
    }
    return directComposerInsert(view.document, view.adapter.getInputEditor(), text);
}

export function insertQuoteAnchor(view, anchor, { mode = 'quote' } = {}) {
    if (!anchor || typeof anchor.text !== 'string' || !anchor.text.trim()) {
        throw new SearchNavigatorError('INVALID_QUOTE_ANCHOR', 'Quote anchor must contain selected text');
    }
    if (mode !== 'quote' && mode !== 'packet') {
        throw new SearchNavigatorError(
            'INVALID_OPTIONS',
            'Quote insertion mode must be "quote" or "packet"'
        );
    }
    const text = mode === 'quote'
        ? formatQuoteText(anchor.text)
        : formatTextSnippetPacket({
            title: ensureText(anchor.title),
            href: ensureText(anchor.href),
            text: anchor.text
        }, { label: 'Selected Gemini text snippet' });
    if (!text || !insertComposerText(view, text)) {
        throw new SearchNavigatorError(
            'COMPOSER_UNAVAILABLE',
            textMessage(view.messages, 'composerUnavailable')
        );
    }
    announce(
        view,
        textMessage(view.messages, mode === 'quote' ? 'quoteInserted' : 'packetInserted'),
        'success'
    );
    return true;
}
