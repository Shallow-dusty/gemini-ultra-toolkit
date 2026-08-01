import { moveRovingFocus } from './focus_navigation.js';
import { canOpenSearchLocator, jumpToResult } from './locator_navigation.js';
import { createSearchForm, readSearchForm } from './search_filter_form.js';
import { cloneViewValue, invalidDependency, showError, textMessage } from './view_contracts.js';

export function createSearchContent(view) {
    const content = view.document.createElement('div');
    content.className = 'primer-search-navigator';
    const rerender = () => {
        const state = view.dialogState;
        if (!state) return;
        const request = readSearchForm(state.filterForm);
        renderSearch(view, request.query, request.options, request.filterCount);
    };
    const filterForm = createSearchForm(view, {
        onSubmit: request => renderSearch(
            view, request.query, request.options, request.filterCount
        ),
        onChange: rerender
    });
    const status = view.document.createElement('p');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = indexAvailabilityMessage(view);
    const resultNavigation = view.document.createElement('nav');
    resultNavigation.setAttribute('aria-label', textMessage(view.messages, 'dialogTitle'));
    const resultPosition = view.document.createElement('output');
    resultPosition.setAttribute('aria-live', 'polite');
    const previousResult = view.ui.Button({
        document: view.document,
        label: textMessage(view.messages, 'previousResult'),
        onPress: () => focusRelativeResult(view, -1)
    });
    const nextResult = view.ui.Button({
        document: view.document,
        label: textMessage(view.messages, 'nextResult'),
        onPress: () => focusRelativeResult(view, 1)
    });
    resultNavigation.append(previousResult.element, resultPosition, nextResult.element);
    const results = view.document.createElement('ul');
    results.setAttribute('aria-label', textMessage(view.messages, 'dialogTitle'));
    results.hidden = true;
    const empty = view.document.createElement('p');
    empty.textContent = indexAvailabilityMessage(view);
    content.append(filterForm.form, status, resultNavigation, results, empty);

    const state = {
        content,
        form: filterForm.form,
        filterForm,
        input: filterForm.input,
        searchButton: filterForm.searchButton,
        status,
        resultNavigation,
        resultPosition,
        previousResult,
        nextResult,
        results,
        empty,
        resultButtons: [],
        resultFocusListeners: [],
        activeResultIndex: -1,
        onResultsKeydown: event => moveResultFocus(view, event),
        lastQuery: '',
        lastOptions: {},
        lastFilterCount: 0,
        destroyed: false
    };
    results.addEventListener('keydown', state.onResultsKeydown);
    setResultNavigationState(state);
    renderIndexAvailability(view, state);
    return state;
}

export function indexAvailabilityMessage(view) {
    const status = view.indexStatus;
    if (status.state === 'empty') {
        if (status.archive === 'failed') return textMessage(view.messages, 'indexEmptyFailed');
        if (status.archive === 'unavailable') return textMessage(view.messages, 'indexEmptyDegraded');
        return textMessage(view.messages, 'indexEmpty');
    }
    const ready = textMessage(view.messages, 'indexReady', status.chats, status.messages);
    if (status.state !== 'degraded') return `${ready} ${textMessage(view.messages, 'initial')}`;
    const degraded = status.archive === 'failed'
        ? textMessage(view.messages, 'indexFailed')
        : textMessage(view.messages, 'indexDegraded');
    return `${ready} ${degraded}`;
}

export function renderIndexAvailability(view, state = view.dialogState) {
    if (!state) return false;
    destroyResultButtons(state);
    const message = indexAvailabilityMessage(view);
    state.status.textContent = message;
    state.status.setAttribute('data-index-state', view.indexStatus.state);
    state.empty.textContent = message;
    state.empty.hidden = false;
    state.results.hidden = true;
    setResultNavigationState(state);
    return true;
}

export function mountSearchView(view, container) {
    if (!container || typeof container.append !== 'function') {
        invalidDependency('Search details container must mount DOM nodes');
    }
    if (view.dialogState?.content.parentNode === container) return view.dialogState.content;
    destroySearchView(view);
    const state = createSearchContent(view);
    view.dialogState = state;
    container.append(state.content);
    return state.content;
}

export function destroySearchView(view) {
    const state = view.dialogState;
    if (!state || state.destroyed) return false;
    state.destroyed = true;
    state.results.removeEventListener('keydown', state.onResultsKeydown);
    destroyResultButtons(state);
    state.previousResult.destroy();
    state.nextResult.destroy();
    state.filterForm.destroy();
    state.content.remove();
    view.dialogState = null;
    return true;
}

function destroyResultButtons(state) {
    for (const [element, listener] of state.resultFocusListeners) {
        element.removeEventListener('focus', listener);
    }
    state.resultFocusListeners.length = 0;
    for (const button of state.resultButtons) button.destroy();
    state.resultButtons.length = 0;
    state.results.replaceChildren();
    state.activeResultIndex = -1;
}

export function renderSearch(view, query, options = {}, filterCount = 0) {
    const state = view.dialogState;
    if (!state) return null;
    destroyResultButtons(state);
    state.lastQuery = typeof query === 'string' ? query : '';
    state.lastOptions = options && typeof options === 'object' ? cloneViewValue(options) : options;
    state.lastFilterCount = filterCount;
    try {
        const response = view.navigator.search(query, options);
        const degraded = response.items.some(result => !canOpenSearchLocator(view.adapter, result));
        const sourceDegraded = view.indexStatus.state === 'degraded';
        state.status.setAttribute('role', 'status');
        state.status.setAttribute('aria-live', 'polite');
        const resultStatus = degraded
            ? `${textMessage(view.messages, 'results', response.total)} ${textMessage(view.messages, 'jumpDegraded')}`
            : textMessage(view.messages, 'results', response.total);
        state.status.textContent = sourceDegraded
            ? `${resultStatus} ${indexAvailabilityMessage(view)}`
            : resultStatus;
        state.status.setAttribute('data-index-state', view.indexStatus.state);
        if (degraded) state.status.setAttribute('data-capability-state', 'degraded');
        else state.status.removeAttribute('data-capability-state');
        state.empty.textContent = response.total === 0
            ? (view.navigator.getStats().documents === 0
                ? indexAvailabilityMessage(view)
                : textMessage(view.messages, 'empty'))
            : '';
        state.empty.hidden = response.total !== 0;
        state.results.hidden = response.items.length === 0;
        for (const result of response.items) appendResult(view, state, result);
        setResultNavigationState(state);
        return response;
    } catch (error) {
        state.results.hidden = true;
        state.empty.hidden = true;
        setResultNavigationState(state);
        showError(view, error);
        return null;
    }
}

function appendResult(view, state, result) {
    const item = view.document.createElement('li');
    const snippet = view.document.createElement('p');
    snippet.textContent = result.snippet.text;
    const metadata = view.document.createElement('small');
    metadata.textContent = [result.role, result.model, result.source]
        .filter(Boolean).join(' • ');
    const label = result.kind === 'message'
        ? textMessage(view.messages, 'openMessage')
        : textMessage(view.messages, 'openChat');
    const disabled = !canOpenSearchLocator(view.adapter, result);
    const button = view.ui.Button({
        document: view.document,
        label,
        disabled,
        // jumpToResult reports its asynchronous navigation failure before
        // rejecting, so the live region becomes an alert without a duplicate toast.
        onPress: () => jumpToResult(view, result).catch(() => {})
    });
    button.element.setAttribute('aria-label', `${label}: ${result.snippet.text}`);
    button.element.tabIndex = state.resultButtons.length === 0 ? 0 : -1;
    const focusListener = () => setActiveResult(view, button.element);
    button.element.addEventListener('focus', focusListener);
    state.resultFocusListeners.push([button.element, focusListener]);
    item.append(snippet, metadata, button.element);
    state.results.append(item);
    state.resultButtons.push(button);
}

function enabledResultElements(state) {
    return state.resultButtons.map(button => button.element).filter(button => !button.disabled);
}

function setActiveResult(view, element) {
    const state = view.dialogState;
    if (!state) return false;
    const enabled = enabledResultElements(state);
    const index = enabled.indexOf(element);
    if (index < 0) return false;
    for (const button of enabled) button.tabIndex = button === element ? 0 : -1;
    state.activeResultIndex = index;
    state.resultPosition.textContent = textMessage(view.messages, 'currentResult', index + 1, enabled.length);
    return true;
}

function setResultNavigationState(state) {
    const enabled = enabledResultElements(state);
    state.resultNavigation.hidden = enabled.length === 0;
    state.previousResult.setDisabled(enabled.length < 2);
    state.nextResult.setDisabled(enabled.length < 2);
    if (enabled.length === 0) state.resultPosition.textContent = '';
    else if (state.activeResultIndex < 0) state.resultPosition.textContent = `0 / ${enabled.length}`;
}

export function focusRelativeResult(view, direction) {
    const state = view.dialogState;
    const enabled = state ? enabledResultElements(state) : [];
    if (enabled.length === 0) return false;
    const current = enabled.indexOf(view.document.activeElement);
    const index = current < 0
        ? (direction < 0 ? enabled.length - 1 : 0)
        : (current + direction + enabled.length) % enabled.length;
    enabled[index].focus();
    setActiveResult(view, enabled[index]);
    return true;
}

export function moveResultFocus(view, event) {
    const buttons = view.dialogState ? enabledResultElements(view.dialogState) : [];
    const moved = moveRovingFocus(event, buttons, view.document.activeElement, {
        nextKey: ['ArrowDown', 'PageDown'],
        previousKey: ['ArrowUp', 'PageUp']
    });
    if (moved) setActiveResult(view, view.document.activeElement);
    return moved;
}
