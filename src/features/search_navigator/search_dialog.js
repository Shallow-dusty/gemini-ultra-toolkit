import { SearchNavigatorError } from './contracts.js';
import { createSearchContent, destroySearchView } from './search_view.js';
import { textMessage } from './view_contracts.js';

/** Open the optional modal search surface; details-pane rendering uses search_view directly. */
export function openSearch(view, trigger = null) {
    if (!view.started || !view.enableLauncher) {
        throw new SearchNavigatorError('VIEW_NOT_STARTED', 'Search navigator view is not mounted');
    }
    if (view.dialog?.open) {
        view.dialogState.input.focus?.();
        return view.dialog;
    }

    destroySearchView(view);
    // Programmatic activation does not consistently focus a button before its
    // click handler runs. Prefer the semantic launcher supplied by the caller
    // so this dialog owns one stable return target for its whole lifetime.
    const returnFocus = trigger || view.document.activeElement;
    const state = createSearchContent(view);
    view.dialogState = state;
    view.dialog = view.dialogManager.open({
        id: 'primer-search-navigator-dialog',
        title: textMessage(view.messages, 'dialogTitle'),
        content: state.content,
        initialFocus: state.input,
        onClose: reason => {
            view.dialog = null;
            destroySearchView(view);
            if (reason === 'jump' && returnFocus?.isConnected &&
                typeof returnFocus.focus === 'function') {
                returnFocus.focus({ preventScroll: true });
            }
        }
    });
    return view.dialog;
}
