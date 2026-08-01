import { cloneViewValue, ensureText, ownFunction } from './view_contracts.js';

/** Capture a bounded, page-local text selection as a best-effort quote anchor. */
export function captureQuoteAnchor(view) {
    let selection;
    try {
        selection = view.selectionProvider();
    } catch {
        return null;
    }
    if (!selection || selection.isCollapsed || selection.rangeCount < 1) return null;
    const text = ensureText(selection.toString()).trim();
    if (text.length < 2 || text.length > view.maxSelectionLength) return null;
    let range;
    try {
        range = selection.getRangeAt(0);
    } catch {
        return null;
    }
    const container = range.commonAncestorContainer;
    const element = container?.nodeType === 3 ? container.parentElement : container;
    if (!element || view._ownsNode(element) || view.adapter.isInsideInputEditor(element) ||
        !view.adapter.isInsideChatContent(element)) return null;

    const supplied = ownFunction(view.adapter, 'getMessageLocatorForNode')
        ? view.adapter.getMessageLocatorForNode(element)
        : null;
    const chatId = ensureText(view.adapter.getChatId?.(), '') || null;
    const locator = supplied && typeof supplied === 'object'
        ? cloneViewValue(supplied)
        : { kind: 'chat', chatId };
    return {
        kind: 'selection',
        text,
        title: ensureText(view.adapter.getChatTitleText?.(), ''),
        href: ensureText(view.adapter.getCurrentHref?.(), ''),
        locator
    };
}
