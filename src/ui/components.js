import { UI_NAMESPACE } from './tokens.js';

let componentSequence = 0;

function nextId(kind) {
    componentSequence += 1;
    return `${UI_NAMESPACE}-${kind}-${componentSequence}`;
}

function getDocument(options = {}) {
    const documentRef = options.document || options.root?.document || globalThis.document;
    if (!documentRef || typeof documentRef.createElement !== 'function') {
        throw new TypeError('A DOM document is required to create a Primer UI component');
    }
    return documentRef;
}

function requireText(value, name) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${name} must be a non-empty string`);
    }
    return value;
}

function assertNode(documentRef, node, name = 'node') {
    if (!node || typeof node !== 'object') throw new TypeError(`${name} must be a DOM node`);
    if (node.ownerDocument && node.ownerDocument !== documentRef) {
        throw new TypeError(`${name} belongs to a different document`);
    }
}

function removeElement(element) {
    if (element && typeof element.remove === 'function') element.remove();
}

export function Button(options = {}) {
    const documentRef = getDocument(options);
    const label = requireText(options.label, 'Button label');
    const variant = options.variant || 'default';
    const size = options.size || 'md';
    if (!['default', 'primary', 'danger', 'ghost'].includes(variant)) {
        throw new RangeError(`Unsupported button variant: ${variant}`);
    }
    if (!['sm', 'md'].includes(size)) throw new RangeError(`Unsupported button size: ${size}`);
    if (options.onPress != null && typeof options.onPress !== 'function') {
        throw new TypeError('Button onPress must be a function');
    }

    const element = documentRef.createElement('button');
    element.type = options.type || 'button';
    element.className = 'primer-ui-button';
    element.setAttribute('data-variant', variant);
    element.setAttribute('data-size', size);
    element.textContent = label;
    if (options.ariaLabel) element.setAttribute('aria-label', options.ariaLabel);
    if (options.title) element.title = options.title;

    const onPress = options.onPress
        ? event => {
            if (!element.disabled) options.onPress(event);
        }
        : null;
    if (onPress) element.addEventListener('click', onPress);

    const api = {
        element,
        setLabel(nextLabel) { element.textContent = requireText(nextLabel, 'Button label'); },
        setDisabled(disabled) {
            element.disabled = Boolean(disabled);
            if (element.disabled) element.setAttribute('aria-disabled', 'true');
            else element.removeAttribute('aria-disabled');
        },
        destroy() {
            if (onPress) element.removeEventListener('click', onPress);
            removeElement(element);
        }
    };
    api.setDisabled(Boolean(options.disabled));
    return Object.freeze(api);
}

export function IconButton(options = {}) {
    const documentRef = getDocument(options);
    const label = requireText(options.label, 'Icon button label');
    const button = Button({
        ...options,
        document: documentRef,
        label,
        ariaLabel: label
    });
    const element = button.element;
    element.className = 'primer-ui-button primer-ui-icon-button';
    element.textContent = '';
    element.title = options.title || label;

    const icon = typeof options.icon === 'string'
        ? documentRef.createElement('span')
        : options.icon;
    if (!icon) throw new TypeError('IconButton requires an icon string or DOM node');
    assertNode(documentRef, icon, 'Icon');
    if (typeof options.icon === 'string') icon.textContent = options.icon;
    icon.className = `${icon.className ? `${icon.className} ` : ''}primer-ui-icon-button__icon`;
    icon.setAttribute('aria-hidden', 'true');
    element.append(icon);

    return Object.freeze({
        element,
        icon,
        setDisabled: button.setDisabled,
        destroy: button.destroy
    });
}

export function Switch(options = {}) {
    const documentRef = getDocument(options);
    const labelText = requireText(options.label, 'Switch label');
    if (options.onChange != null && typeof options.onChange !== 'function') {
        throw new TypeError('Switch onChange must be a function');
    }

    const element = documentRef.createElement('label');
    element.className = 'primer-ui-switch';
    const control = documentRef.createElement('input');
    control.type = 'checkbox';
    control.className = 'primer-ui-switch__control';
    control.setAttribute('role', 'switch');
    control.id = options.id || nextId('switch');
    if (options.name) control.name = options.name;
    if (options.describedBy) control.setAttribute('aria-describedby', options.describedBy);
    const label = documentRef.createElement('span');
    label.className = 'primer-ui-switch__label';
    label.textContent = labelText;
    element.append(control, label);

    const onChange = options.onChange
        ? event => options.onChange(Boolean(control.checked), event)
        : null;
    const syncCheckedState = event => {
        control.setAttribute('aria-checked', String(Boolean(control.checked)));
        if (onChange) onChange(event);
    };
    control.addEventListener('change', syncCheckedState);

    const api = {
        element,
        control,
        label,
        get checked() { return Boolean(control.checked); },
        setChecked(checked) {
            control.checked = Boolean(checked);
            control.setAttribute('aria-checked', String(control.checked));
        },
        setDisabled(disabled) {
            control.disabled = Boolean(disabled);
            element.setAttribute('data-disabled', String(control.disabled));
            control.setAttribute('aria-disabled', String(control.disabled));
        },
        setLabel(nextLabel) { label.textContent = requireText(nextLabel, 'Switch label'); },
        destroy() {
            control.removeEventListener('change', syncCheckedState);
            removeElement(element);
        }
    };
    api.setChecked(Boolean(options.checked));
    api.setDisabled(Boolean(options.disabled));
    return Object.freeze(api);
}

function normalizeTabs(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new TypeError('Tabs requires a non-empty items array');
    }
    const ids = new Set();
    return items.map((item, index) => {
        if (!item || typeof item !== 'object') throw new TypeError(`Tab at index ${index} must be an object`);
        const id = requireText(item.id, `Tab id at index ${index}`);
        if (ids.has(id)) throw new RangeError(`Duplicate tab id: ${id}`);
        ids.add(id);
        return {
            id,
            label: requireText(item.label, `Tab label at index ${index}`),
            panel: item.panel,
            disabled: Boolean(item.disabled)
        };
    });
}

export function Tabs(options = {}) {
    const documentRef = getDocument(options);
    const items = normalizeTabs(options.items);
    if (options.onChange != null && typeof options.onChange !== 'function') {
        throw new TypeError('Tabs onChange must be a function');
    }

    const element = documentRef.createElement('div');
    element.className = 'primer-ui-tabs';
    const list = documentRef.createElement('div');
    list.className = 'primer-ui-tabs__list';
    list.setAttribute('role', 'tablist');
    if (options.label) list.setAttribute('aria-label', options.label);
    const panels = documentRef.createElement('div');
    panels.className = 'primer-ui-tabs__panels';
    element.append(list, panels);

    const instanceId = nextId('tabs');
    const records = [];
    const listeners = [];
    let selectedId = null;

    function listen(target, type, handler) {
        target.addEventListener(type, handler);
        listeners.push([target, type, handler]);
    }

    for (const [index, item] of items.entries()) {
        const tab = documentRef.createElement('button');
        tab.type = 'button';
        tab.className = 'primer-ui-tab';
        tab.id = `${instanceId}-tab-${index}`;
        tab.textContent = item.label;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('data-tab-id', item.id);
        tab.disabled = item.disabled;
        const panel = documentRef.createElement('div');
        panel.className = 'primer-ui-tabpanel';
        panel.id = `${instanceId}-panel-${index}`;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        tab.setAttribute('aria-controls', panel.id);

        if (typeof item.panel === 'string') panel.textContent = item.panel;
        else if (typeof item.panel === 'function') {
            const rendered = item.panel({ document: documentRef, id: item.id });
            if (typeof rendered === 'string') panel.textContent = rendered;
            else if (rendered) {
                assertNode(documentRef, rendered, `Panel for tab ${item.id}`);
                panel.append(rendered);
            }
        } else if (item.panel) {
            assertNode(documentRef, item.panel, `Panel for tab ${item.id}`);
            panel.append(item.panel);
        }

        list.append(tab);
        panels.append(panel);
        records.push({ ...item, tab, panel });
    }

    function enabledRecords() { return records.filter(record => !record.disabled); }

    function select(id, selectOptions = {}) {
        const record = records.find(candidate => candidate.id === id);
        if (!record || record.disabled) return false;
        const changed = selectedId !== id;
        selectedId = id;
        for (const candidate of records) {
            const selected = candidate.id === id;
            candidate.tab.setAttribute('aria-selected', String(selected));
            candidate.tab.tabIndex = selected ? 0 : -1;
            candidate.panel.hidden = !selected;
        }
        if (selectOptions.focus) record.tab.focus();
        if (changed && selectOptions.emit !== false && options.onChange) options.onChange(id);
        return true;
    }

    function moveFrom(record, key) {
        const enabled = enabledRecords();
        if (enabled.length === 0) return;
        const index = enabled.indexOf(record);
        let nextIndex = index;
        if (key === 'Home') nextIndex = 0;
        else if (key === 'End') nextIndex = enabled.length - 1;
        else if (key === 'ArrowRight') nextIndex = (index + 1) % enabled.length;
        else nextIndex = (index - 1 + enabled.length) % enabled.length;
        select(enabled[nextIndex].id, { focus: true });
    }

    for (const record of records) {
        listen(record.tab, 'click', () => select(record.id));
        listen(record.tab, 'keydown', event => {
            if (!['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            moveFrom(record, event.key);
        });
    }

    const requested = options.selectedId;
    const initial = records.find(record => record.id === requested && !record.disabled)
        || enabledRecords()[0];
    for (const record of records) {
        record.tab.setAttribute('aria-selected', 'false');
        record.tab.tabIndex = -1;
        record.panel.hidden = true;
    }
    if (initial) select(initial.id, { emit: false });

    return Object.freeze({
        element,
        list,
        panels,
        tabs: Object.freeze(records.map(record => record.tab)),
        panelElements: Object.freeze(records.map(record => record.panel)),
        get selectedId() { return selectedId; },
        select,
        destroy() {
            for (const [target, type, handler] of listeners) target.removeEventListener(type, handler);
            listeners.length = 0;
            removeElement(element);
        }
    });
}

function mergeDescribedBy(control, ids) {
    const current = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    control.setAttribute('aria-describedby', [...new Set([...current, ...ids])].join(' '));
}

export function FormField(options = {}) {
    const documentRef = getDocument(options);
    assertNode(documentRef, options.control, 'FormField control');
    const labelText = requireText(options.label, 'FormField label');
    const control = options.control;
    if (!control.id) control.id = nextId('field-control');

    const element = documentRef.createElement('div');
    element.className = 'primer-ui-form-field';
    const label = documentRef.createElement('label');
    label.className = 'primer-ui-form-field__label';
    label.setAttribute('for', control.id);
    label.textContent = labelText;
    if (options.required) {
        control.required = true;
        control.setAttribute('aria-required', 'true');
    }
    element.append(label, control);

    let description = null;
    if (options.description) {
        description = documentRef.createElement('div');
        description.className = 'primer-ui-form-field__description';
        description.id = nextId('field-description');
        description.textContent = options.description;
        element.append(description);
    }
    const error = documentRef.createElement('div');
    error.className = 'primer-ui-form-field__error';
    error.id = nextId('field-error');
    error.hidden = true;
    element.append(error);
    mergeDescribedBy(control, [description?.id, error.id].filter(Boolean));

    function setError(message) {
        const hasError = typeof message === 'string' && message.trim() !== '';
        error.textContent = hasError ? message : '';
        error.hidden = !hasError;
        if (hasError) control.setAttribute('aria-invalid', 'true');
        else control.removeAttribute('aria-invalid');
    }
    setError(options.error || '');

    return Object.freeze({
        element,
        control,
        label,
        description,
        error,
        setError,
        setLabel(nextLabel) { label.textContent = requireText(nextLabel, 'FormField label'); },
        destroy() { removeElement(element); }
    });
}

function getPortalMount(options, documentRef) {
    if (options.root) {
        if (options.root.document !== documentRef || typeof options.root.mountPortal !== 'function') {
            throw new TypeError('ToastRegion root is not a compatible Primer UI root');
        }
        return node => options.root.mountPortal(node);
    }
    const portal = options.portal;
    assertNode(documentRef, portal, 'ToastRegion portal');
    if (!portal.hasAttribute?.(`data-${UI_NAMESPACE}-portal`)) {
        throw new TypeError('ToastRegion portal must be a Primer UI portal');
    }
    return node => {
        portal.append(node);
        return () => {
            if (node.parentNode === portal && typeof node.remove === 'function') node.remove();
        };
    };
}

export function ToastRegion(options = {}) {
    const documentRef = getDocument(options);
    const mountPortal = getPortalMount(options, documentRef);
    const maxVisible = options.maxVisible == null ? 4 : Number(options.maxVisible);
    if (!Number.isInteger(maxVisible) || maxVisible < 1) {
        throw new RangeError('ToastRegion maxVisible must be a positive integer');
    }
    const schedule = options.schedule || globalThis.setTimeout;
    const cancelSchedule = options.cancelSchedule || globalThis.clearTimeout;
    if (typeof schedule !== 'function' || typeof cancelSchedule !== 'function') {
        throw new TypeError('ToastRegion requires timeout scheduling functions');
    }

    const element = documentRef.createElement('section');
    element.className = 'primer-ui-toast-region';
    element.setAttribute('role', 'region');
    element.setAttribute('aria-live', 'polite');
    element.setAttribute('aria-relevant', 'additions text');
    element.setAttribute('aria-label', options.label || 'Notifications');
    const unmount = mountPortal(element);
    const records = new Map();
    let destroyed = false;

    function dismiss(id, reason = 'dismiss') {
        const record = records.get(id);
        if (!record) return false;
        records.delete(id);
        if (record.timer != null) cancelSchedule(record.timer);
        record.close.removeEventListener('click', record.onClose);
        removeElement(record.element);
        if (record.onDismiss) record.onDismiss(reason);
        return true;
    }

    function show(message, toastOptions = {}) {
        if (destroyed) throw new Error('ToastRegion has been destroyed');
        const text = requireText(message, 'Toast message');
        const tone = toastOptions.tone || 'default';
        if (!['default', 'success', 'danger'].includes(tone)) {
            throw new RangeError(`Unsupported toast tone: ${tone}`);
        }
        const id = toastOptions.id || nextId('toast');
        if (records.has(id)) dismiss(id, 'replace');

        const toast = documentRef.createElement('div');
        toast.className = 'primer-ui-toast';
        toast.setAttribute('data-tone', tone);
        toast.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
        toast.setAttribute('aria-atomic', 'true');
        const content = documentRef.createElement('span');
        content.className = 'primer-ui-toast__message';
        content.textContent = text;
        const close = documentRef.createElement('button');
        close.type = 'button';
        close.className = 'primer-ui-button primer-ui-icon-button';
        close.setAttribute('data-size', 'sm');
        close.setAttribute('aria-label', toastOptions.dismissLabel || 'Dismiss notification');
        close.textContent = '×';
        toast.append(content, close);
        element.append(toast);

        const onClose = () => dismiss(id, 'manual');
        close.addEventListener('click', onClose);
        const duration = toastOptions.duration == null ? 5000 : Number(toastOptions.duration);
        if (!Number.isFinite(duration) || duration < 0) {
            close.removeEventListener('click', onClose);
            toast.remove();
            throw new RangeError('Toast duration must be a non-negative finite number');
        }
        const record = {
            id,
            element: toast,
            content,
            close,
            onClose,
            onDismiss: typeof toastOptions.onDismiss === 'function' ? toastOptions.onDismiss : null,
            timer: null
        };
        records.set(id, record);
        if (duration > 0) record.timer = schedule(() => dismiss(id, 'timeout'), duration);

        while (records.size > maxVisible) {
            dismiss(records.keys().next().value, 'overflow');
        }

        return Object.freeze({ id, element: toast, dismiss: reason => dismiss(id, reason) });
    }

    function clear(reason = 'clear') {
        for (const id of [...records.keys()]) dismiss(id, reason);
    }

    return Object.freeze({
        element,
        get size() { return records.size; },
        show,
        dismiss,
        clear,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            clear('destroy');
            unmount();
        }
    });
}
