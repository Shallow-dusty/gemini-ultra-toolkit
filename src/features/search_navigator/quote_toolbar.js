import { moveRovingFocus } from './focus_navigation.js';
import { ensureText, mountWith, showError, textMessage } from './view_contracts.js';

/** Schedule selection capture after the browser has committed the pointer selection. */
export function handlePointerUp(view, event) {
    clearPointerTimer(view);
    const point = { x: Number(event.clientX) || 0, y: Number(event.clientY) || 0 };
    view._pointerTimer = view.schedule(() => {
        view._pointerTimer = null;
        const anchor = view.captureQuoteAnchor();
        if (anchor) showQuoteActions(view, point, anchor, false);
    }, view.quoteDelay);
}

export function handlePointerDown(view, event) {
    if (view.quoteActions?.element.contains?.(event.target)) return;
    removeQuoteActions(view, false);
}

export function handleDocumentKeydown(view, event) {
    if (event.key === 'Escape' && view.quoteActions) {
        event.preventDefault();
        event.stopPropagation?.();
        removeQuoteActions(view, true);
        return;
    }
    if (!(event.altKey && event.shiftKey && ensureText(event.key).toLowerCase() === 'q')) return;
    const anchor = view.captureQuoteAnchor();
    if (!anchor) return;
    event.preventDefault();
    showQuoteActions(view, { x: 16, y: 56 }, anchor, true);
}

/** Mount the transient quote/context-packet toolbar at a viewport-bounded position. */
export function showQuoteActions(view, point, anchor, focusFirst) {
    removeQuoteActions(view, false);
    const element = view.document.createElement('div');
    element.className = 'gc-quote-fab primer-search-navigator-quote-actions visible';
    element.setAttribute('role', 'toolbar');
    element.setAttribute('aria-label', textMessage(view.messages, 'quoteToolbar'));
    const quote = createAction(view, anchor, 'quote');
    const packet = createAction(view, anchor, 'packet');
    quote.element.className += ' gc-quote-fab-btn';
    packet.element.className += ' gc-quote-fab-btn';
    element.append(quote.element, packet.element);

    const viewport = view.document.defaultView || {};
    const left = Math.max(8, Math.min(point.x + 8, (viewport.innerWidth || 1024) - 240));
    const top = Math.max(8, Math.min(point.y - 48, (viewport.innerHeight || 768) - 56));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    const returnFocus = view.document.activeElement;
    const buttons = [quote.element, packet.element];
    const onKeydown = event => moveRovingFocus(event, buttons, view.document.activeElement, {
        nextKey: 'ArrowRight',
        previousKey: 'ArrowLeft'
    });
    element.addEventListener('keydown', onKeydown);
    const unmount = mountWith(view.overlayMount, element, 'Quote action mount');
    view.quoteActions = { element, quote, packet, buttons, onKeydown, unmount, returnFocus };
    if (focusFirst) quote.element.focus();
    if (view.quoteDismissDelay > 0) {
        view.quoteTimer = view.schedule(() => {
            view.quoteTimer = null;
            removeQuoteActions(view, false);
        }, view.quoteDismissDelay);
    }
    return anchor;
}

function createAction(view, anchor, mode) {
    return view.ui.Button({
        document: view.document,
        label: textMessage(view.messages, mode),
        size: 'sm',
        onPress: event => {
            event.stopPropagation?.();
            try {
                view.insertQuoteAnchor(anchor, { mode });
            } catch (error) {
                showError(view, error);
            }
            removeQuoteActions(view, false);
        }
    });
}

export function removeQuoteActions(view, restoreFocus) {
    if (view.quoteTimer !== null) {
        view.cancelSchedule(view.quoteTimer);
        view.quoteTimer = null;
    }
    const actions = view.quoteActions;
    if (!actions) return false;
    view.quoteActions = null;
    actions.element.removeEventListener('keydown', actions.onKeydown);
    actions.quote.destroy();
    actions.packet.destroy();
    actions.unmount();
    if (restoreFocus) actions.returnFocus?.focus?.();
    return true;
}

export function clearPointerTimer(view) {
    if (view._pointerTimer === null) return;
    view.cancelSchedule(view._pointerTimer);
    view._pointerTimer = null;
}

export function ownsNode(view, node) {
    return Boolean(
        view.launcher?.element.contains?.(node) ||
        view.quoteActions?.element.contains?.(node) ||
        view.dialog?.element.contains?.(node)
    );
}
