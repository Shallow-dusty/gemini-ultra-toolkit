import { textMessage } from './view_contracts.js';

const ROLE_OPTIONS = Object.freeze([
    ['', 'roleAny'],
    ['user', 'roleUser'],
    ['model', 'roleModel'],
    ['system', 'roleSystem']
]);

const MATCH_OPTIONS = Object.freeze([
    ['all', 'matchAll'],
    ['any', 'matchAny'],
    ['exact', 'matchExact']
]);

function commaValues(value) {
    return [...new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean))];
}

function option(documentRef, value, label) {
    const element = documentRef.createElement('option');
    element.value = value;
    element.textContent = label;
    return element;
}

function createField(view, state, spec, onChange) {
    const wrapper = view.document.createElement('div');
    wrapper.className = 'primer-search-filter';
    const label = view.document.createElement('label');
    const control = view.document.createElement(spec.select ? 'select' : 'input');
    control.id = `primer-search-${spec.key}`;
    control.name = spec.key;
    control.value = spec.defaultValue || '';
    if (!spec.select) {
        control.type = spec.type || 'search';
        control.autocomplete = 'off';
    }
    label.setAttribute('for', control.id);
    label.textContent = textMessage(view.messages, spec.label);
    if (spec.select) {
        for (const [value, key] of spec.options) {
            control.append(option(view.document, value, textMessage(view.messages, key)));
        }
    }
    const clear = view.ui.Button({
        document: view.document,
        label: textMessage(view.messages, 'clearField', label.textContent),
        size: 'sm',
        variant: 'ghost',
        onPress: () => clearField(state, spec.key, true, onChange)
    });
    clear.element.setAttribute('aria-controls', control.id);
    const listener = () => updateFilterState(view, state);
    control.addEventListener(spec.select ? 'change' : 'input', listener);
    wrapper.append(label, control, clear.element);
    const record = {
        key: spec.key,
        control,
        clear,
        defaultValue: spec.defaultValue || '',
        listener,
        event: spec.select ? 'change' : 'input'
    };
    state.controls.set(spec.key, record);
    return wrapper;
}

function clearField(state, key, focus, onChange) {
    const record = state.controls.get(key);
    if (!record) return false;
    const changed = record.control.value !== record.defaultValue;
    record.control.value = record.defaultValue;
    updateFilterState(state.view, state);
    if (focus) record.control.focus?.();
    if (changed) onChange();
    return changed;
}

function clearAll(state, onChange) {
    let changed = false;
    for (const record of state.controls.values()) {
        if (record.control.value !== record.defaultValue) changed = true;
        record.control.value = record.defaultValue;
    }
    updateFilterState(state.view, state);
    state.controls.get('query').control.focus?.();
    if (changed) onChange();
    return changed;
}

export function countActiveSearchFilters(state) {
    let count = state.controls.get('match').control.value === 'all' ? 0 : 1;
    for (const key of ['exclude', 'role', 'dateFrom', 'dateTo', 'models', 'sources']) {
        if (state.controls.get(key).control.value.trim()) count += 1;
    }
    return count;
}

function updateFilterState(view, state) {
    const count = countActiveSearchFilters(state);
    state.filterStatus.textContent = textMessage(view.messages, 'activeFilters', count);
    for (const record of state.controls.values()) {
        record.clear.setDisabled(record.control.value === record.defaultValue);
    }
    state.clearAll.setDisabled([...state.controls.values()].every(record =>
        record.control.value === record.defaultValue));
    return count;
}

export function readSearchForm(state) {
    const read = key => state.controls.get(key).control.value.trim();
    const options = { match: read('match') || 'all' };
    const exclude = read('exclude');
    const role = read('role');
    const dateFrom = read('dateFrom');
    const dateTo = read('dateTo');
    const models = commaValues(read('models'));
    const sources = commaValues(read('sources'));
    if (exclude) options.exclude = exclude;
    if (role) options.roles = role === 'model' ? ['model', 'assistant'] : [role];
    if (dateFrom) options.dateFrom = dateFrom;
    if (dateTo) options.dateTo = dateTo;
    if (models.length) options.models = models;
    if (sources.length) options.sources = sources;
    return { query: read('query'), options, filterCount: countActiveSearchFilters(state) };
}

export function createSearchForm(view, { onSubmit, onChange }) {
    const form = view.document.createElement('form');
    form.setAttribute('role', 'search');
    const state = { view, form, controls: new Map(), filterStatus: null, clearAll: null };
    const fields = view.document.createElement('fieldset');
    const legend = view.document.createElement('legend');
    legend.textContent = textMessage(view.messages, 'dialogTitle');
    fields.append(legend);
    const specs = [
        { key: 'query', label: 'searchLabel' },
        { key: 'match', label: 'matchLabel', select: true, options: MATCH_OPTIONS, defaultValue: 'all' },
        { key: 'exclude', label: 'excludeLabel' },
        { key: 'role', label: 'roleLabel', select: true, options: ROLE_OPTIONS },
        { key: 'dateFrom', label: 'dateFromLabel', type: 'date' },
        { key: 'dateTo', label: 'dateToLabel', type: 'date' },
        { key: 'models', label: 'modelLabel' },
        { key: 'sources', label: 'sourceLabel' }
    ];
    for (const spec of specs) fields.append(createField(view, state, spec, onChange));
    const actions = view.document.createElement('div');
    const search = view.ui.Button({
        document: view.document,
        label: textMessage(view.messages, 'searchAction'),
        type: 'submit'
    });
    state.clearAll = view.ui.Button({
        document: view.document,
        label: textMessage(view.messages, 'clearAll'),
        variant: 'ghost',
        onPress: () => clearAll(state, onChange)
    });
    state.filterStatus = view.document.createElement('output');
    state.filterStatus.setAttribute('aria-live', 'polite');
    actions.append(search.element, state.clearAll.element, state.filterStatus);
    form.append(fields, actions);
    const submitListener = event => { event.preventDefault(); onSubmit(readSearchForm(state)); };
    const keyListener = event => {
        if (event.key !== 'Escape') return;
        const record = [...state.controls.values()].find(item => item.control === event.target);
        if (record && record.control.value !== record.defaultValue) {
            clearField(state, record.key, true, onChange);
        } else {
            clearAll(state, onChange);
        }
        event.preventDefault();
    };
    form.addEventListener('submit', submitListener);
    form.addEventListener('keydown', keyListener);
    updateFilterState(view, state);
    return Object.assign(state, {
        input: state.controls.get('query').control,
        searchButton: search,
        destroy() {
            form.removeEventListener('submit', submitListener);
            form.removeEventListener('keydown', keyListener);
            for (const record of state.controls.values()) {
                record.control.removeEventListener(record.event, record.listener);
                record.clear.destroy();
            }
            search.destroy();
            state.clearAll.destroy();
        }
    });
}
