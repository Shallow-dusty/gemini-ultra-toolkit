let surfaceSequence = 0;

function requireDocument(getDocument) {
    const document = getDocument();
    if (!document || typeof document.createElement !== 'function') throw new TypeError('Preferences UI requires a DOM document');
    return document;
}

function cleanupElement(element) {
    if (element?.remove) element.remove();
}

function captureStyles(target, properties) {
    const previous = Object.fromEntries(properties.map(property => [property, target.style[property] || '']));
    return () => {
        for (const [property, value] of Object.entries(previous)) target.style[property] = value;
    };
}

function semanticRow(document, labelText) {
    const row = document.createElement('div');
    row.className = 'settings-row primer-preference-row';
    const label = document.createElement('label');
    label.className = 'primer-preference-label';
    label.textContent = labelText;
    row.appendChild(label);
    return { row, label };
}

function activateElement(element) {
    if (!element || element.disabled || element.getAttribute?.('aria-disabled') === 'true'
        || typeof element.click !== 'function') return false;
    element.click();
    return true;
}

export function createDomPreferencesSurface({
    getDocument = () => globalThis.document,
    translate = (_zh, en) => en,
    getLocale = () => 'en'
} = {}) {
    if (typeof getDocument !== 'function' || typeof translate !== 'function' || typeof getLocale !== 'function') {
        throw new TypeError('Preferences DOM surface requires document, translation, and locale providers');
    }

    return Object.freeze({
        translate,
        locale: getLocale,
        getTitle() { return requireDocument(getDocument).title || ''; },
        setTitle(title) { requireDocument(getDocument).title = String(title); },
        listenKeydown(handler) {
            if (typeof handler !== 'function') throw new TypeError('Keydown handler must be a function');
            const document = requireDocument(getDocument);
            document.addEventListener('keydown', handler, true);
            let active = true;
            return () => {
                if (!active) return;
                active = false;
                document.removeEventListener('keydown', handler, true);
            };
        },
        activate(element) {
            return activateElement(element);
        },
        openModelMenu(trigger) {
            return trigger?.getAttribute?.('aria-expanded') === 'true' || activateElement(trigger);
        },
        dismissModelMenu(trigger) {
            if (trigger?.getAttribute?.('aria-expanded') !== 'true' || typeof trigger.click !== 'function') return false;
            trigger.click();
            return true;
        },
        showModelIndicator(trigger, { label, model }) {
            const document = requireDocument(getDocument);
            cleanupElement(document.getElementById('gc-model-lock'));
            const parent = trigger?.parentElement;
            if (!parent) return () => {};
            const indicator = document.createElement('span');
            indicator.id = 'gc-model-lock';
            indicator.className = 'gc-model-lock';
            indicator.setAttribute('data-primer-owned', '');
            indicator.setAttribute('role', 'status');
            indicator.setAttribute('aria-label', label);
            indicator.title = label;
            indicator.textContent = `🔒 ${model}`;
            parent.appendChild(indicator);
            return () => cleanupElement(indicator);
        },
        mountComposerStatus(host, { showHint, showCounter, hintText, counterLabel }) {
            const document = requireDocument(getDocument);
            cleanupElement(document.getElementById('gc-tweaks-status'));
            const status = document.createElement('div');
            status.id = 'gc-tweaks-status';
            status.className = 'gc-tweaks-status';
            status.setAttribute('data-primer-owned', '');
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            let counter = null;
            if (showHint) {
                const hint = document.createElement('span');
                hint.id = 'gc-tweaks-send-hint';
                hint.className = 'gc-send-hint';
                hint.textContent = hintText;
                status.appendChild(hint);
            }
            if (showCounter) {
                counter = document.createElement('output');
                counter.id = 'gc-tweaks-input-counter';
                counter.className = 'gc-input-counter';
                counter.setAttribute('aria-label', counterLabel);
                counter.setAttribute('aria-live', 'polite');
                status.appendChild(counter);
            }
            host.appendChild(status);
            return Object.freeze({
                element: status,
                setCounter(text) { if (counter) counter.textContent = String(text); },
                destroy() { cleanupElement(status); }
            });
        },
        applyWidths({ chatTarget, chatWidth, sidebarTarget, sidebarWidth }) {
            const cleanups = [];
            if (chatTarget?.style && Number.isFinite(chatWidth)) {
                cleanups.push(captureStyles(chatTarget, ['maxWidth', 'width']));
                chatTarget.style.maxWidth = `${chatWidth}px`;
                chatTarget.style.width = '100%';
            }
            if (sidebarTarget?.style && Number.isFinite(sidebarWidth)) {
                cleanups.push(captureStyles(sidebarTarget, ['width', 'minWidth']));
                sidebarTarget.style.width = `${sidebarWidth}px`;
                sidebarTarget.style.minWidth = `${sidebarWidth}px`;
            }
            let active = true;
            return () => {
                if (!active) return;
                active = false;
                cleanups.reverse().forEach(cleanup => cleanup());
            };
        },
        renderModelPreference(container, { value, options, onChange }) {
            const document = requireDocument(getDocument);
            const id = `primer-default-model-${++surfaceSequence}`;
            const { row, label } = semanticRow(document, translate('首选模型', 'Preferred model'));
            const select = document.createElement('select');
            select.id = id;
            select.value = value;
            label.htmlFor = id;
            for (const model of options) {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model === 'flash' ? 'Fast (Flash)' : model === 'thinking' ? 'Thinking' : 'Pro';
                option.selected = model === value;
                select.appendChild(option);
            }
            let committedValue = value;
            const listener = () => {
                const requested = select.value;
                select.disabled = true;
                Promise.resolve().then(() => onChange(requested)).then(result => {
                    committedValue = typeof result === 'string' ? result : requested;
                    select.value = committedValue;
                }).catch(() => { select.value = committedValue; })
                    .finally(() => { select.disabled = false; });
            };
            select.addEventListener('change', listener);
            row.appendChild(select);
            container.appendChild(row);
            return Object.freeze({
                element: row,
                control: select,
                destroy() { select.removeEventListener('change', listener); cleanupElement(row); }
            });
        },
        renderUiPreferences(container, { config, labels, onToggle, onValue }) {
            const document = requireDocument(getDocument);
            const rows = [];
            for (const [id, preference] of Object.entries(config)) {
                const sequence = ++surfaceSequence;
                const controlId = `primer-ui-pref-${sequence}`;
                const { row, label } = semanticRow(document, labels[id].label);
                const control = document.createElement('input');
                control.id = controlId;
                control.type = 'checkbox';
                control.checked = preference.enabled;
                control.setAttribute('role', 'switch');
                control.setAttribute('aria-checked', String(control.checked));
                label.htmlFor = controlId;
                let committedEnabled = control.checked;
                const toggleListener = () => {
                    const requested = control.checked;
                    control.disabled = true;
                    control.setAttribute('aria-checked', String(requested));
                    Promise.resolve().then(() => onToggle(id, requested)).then(result => {
                        committedEnabled = typeof result?.[id]?.enabled === 'boolean'
                            ? result[id].enabled
                            : requested;
                        control.checked = committedEnabled;
                        control.setAttribute('aria-checked', String(committedEnabled));
                    }).catch(() => {
                        control.checked = committedEnabled;
                        control.setAttribute('aria-checked', String(committedEnabled));
                    }).finally(() => { control.disabled = false; });
                };
                control.addEventListener('change', toggleListener);
                row.appendChild(control);

                let valueInput = null;
                let valueListener = null;
                if (Object.prototype.hasOwnProperty.call(preference, 'value')) {
                    valueInput = document.createElement('input');
                    valueInput.type = 'number';
                    valueInput.value = String(preference.value);
                    valueInput.setAttribute('aria-label', `${labels[id].label} (px)`);
                    let committedValue = preference.value;
                    valueListener = () => {
                        const parsed = Number(valueInput.value);
                        if (!Number.isFinite(parsed) || parsed <= 0) {
                            valueInput.value = String(committedValue);
                            return;
                        }
                        valueInput.disabled = true;
                        Promise.resolve().then(() => onValue(id, parsed)).then(result => {
                            committedValue = Number.isFinite(result?.[id]?.value) ? result[id].value : parsed;
                            valueInput.value = String(committedValue);
                        }).catch(() => {
                            valueInput.value = String(committedValue);
                        }).finally(() => { valueInput.disabled = false; });
                    };
                    valueInput.addEventListener('change', valueListener);
                    row.appendChild(valueInput);
                }
                container.appendChild(row);
                rows.push({ row, control, toggleListener, valueInput, valueListener });
            }
            return Object.freeze({
                elements: Object.freeze(rows.map(record => record.row)),
                destroy() {
                    for (const record of rows) {
                        record.control.removeEventListener('change', record.toggleListener);
                        if (record.valueInput) record.valueInput.removeEventListener('change', record.valueListener);
                        cleanupElement(record.row);
                    }
                }
            });
        }
    });
}
