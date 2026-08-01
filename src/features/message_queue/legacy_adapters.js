function requireObject(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
    return value;
}

function event(environment, type) {
    return new environment.Event(type, { bubbles: true });
}

function readEditorText(editor) {
    if (!editor) return '';
    return String(('value' in editor ? editor.value : editor.textContent) || '').trim();
}

export function getLegacyEditorText(adapter) {
    return readEditorText(adapter.getInputEditor());
}

export function clearLegacyEditor(environment, editor) {
    if ('value' in editor) editor.value = '';
    else editor.textContent = '';
    editor.dispatchEvent(event(environment, 'input'));
}

export function insertLegacyEditorText(environment, editor, text) {
    clearLegacyEditor(environment, editor);
    editor.focus();
    if ('value' in editor) {
        editor.value = text;
        editor.dispatchEvent(event(environment, 'input'));
        return;
    }

    const selection = environment.window.getSelection();
    const range = environment.document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    const inputEvent = new environment.InputEvent('beforeinput', {
        inputType: 'insertText',
        data: text,
        bubbles: true,
        cancelable: true,
        composed: true
    });
    const accepted = editor.dispatchEvent(inputEvent);
    if (!accepted || String(editor.textContent || '').trim() === '') {
        const paragraph = environment.document.createElement('p');
        paragraph.textContent = text;
        editor.appendChild(paragraph);
        editor.dispatchEvent(event(environment, 'input'));
    }
}

export function createLegacyQueueRepository(environment) {
    requireObject(environment, 'Message Queue environment');
    return Object.freeze({
        read(key, fallback) {
            return typeof environment.GM_getValue === 'function'
                ? environment.GM_getValue(key, fallback)
                : fallback;
        },
        write(key, value) {
            return typeof environment.GM_setValue === 'function'
                ? environment.GM_setValue(key, value)
                : undefined;
        }
    });
}

export function createLegacyQueueContext({ core, environment, storageKey }) {
    requireObject(core, 'Message Queue Core capability');
    requireObject(environment, 'Message Queue environment');
    if (typeof core.getCurrentUser !== 'function') throw new TypeError('Message Queue Core.getCurrentUser must be a function');
    if (!String(storageKey || '').trim()) throw new TypeError('Message Queue storageKey is required');
    return () => {
        const user = core.getCurrentUser();
        let routeKey = '';
        try { routeKey = String(environment.window?.location?.href || ''); }
        catch { /* an inaccessible host location invalidates route-bound work */ }
        return {
            storageKey: user && String(user).includes('@') ? `${storageKey}_${user}` : storageKey,
            routeKey,
            visible: environment.document?.visibilityState !== 'hidden'
        };
    };
}

export function createLegacyQueueTimers(environment) {
    requireObject(environment, 'Message Queue environment');
    if (typeof environment.setTimeout !== 'function' || typeof environment.clearTimeout !== 'function') {
        throw new TypeError('Message Queue environment requires timer functions');
    }
    return Object.freeze({
        set(callback, delay) { return environment.setTimeout(callback, delay); },
        clear(handle) { environment.clearTimeout(handle); },
        delay(ms) { return new Promise(resolve => environment.setTimeout(resolve, ms)); }
    });
}

export function createLegacyQueueDelivery({ adapter, environment }) {
    requireObject(adapter, 'Message Queue Gemini adapter');
    requireObject(environment, 'Message Queue environment');
    for (const method of ['getActiveToolMode', 'getInputEditor', 'getSendButton', 'isSendButtonElement']) {
        if (typeof adapter[method] !== 'function') throw new TypeError(`Message Queue adapter.${method} must be a function`);
    }
    return Object.freeze({
        inspect() {
            const mode = adapter.getActiveToolMode() || {};
            return {
                toolModeActive: mode.active === true,
                toolModeLabel: mode.label,
                editorReady: !!adapter.getInputEditor()
            };
        },
        stage(text) {
            const editor = adapter.getInputEditor();
            if (!editor) return { ok: false, reason: 'Input editor unavailable' };
            insertLegacyEditorText(environment, editor, text);
            const stagedText = readEditorText(editor);
            if (stagedText !== String(text ?? '').trim()) {
                return { ok: false, reason: 'Queue composer staging mismatch' };
            }
            return {
                ok: true,
                reason: '',
                baseline: Object.freeze({ editor, text: stagedText })
            };
        },
        verifyStage(baseline) {
            if (!baseline || typeof baseline !== 'object' || !baseline.editor) {
                return { ok: false, reason: 'Queue send cancelled: composer baseline unavailable' };
            }
            const editor = adapter.getInputEditor();
            if (editor !== baseline.editor) {
                return { ok: false, reason: 'Queue send cancelled: composer editor changed' };
            }
            if (readEditorText(editor) !== String(baseline.text ?? '')) {
                return { ok: false, reason: 'Queue send cancelled: composer text changed' };
            }
            return { ok: true, reason: '' };
        },
        prepareCommit() {
            const button = adapter.getSendButton();
            if (!adapter.isSendButtonElement(button)) return null;
            return () => button.click();
        },
        getEditor() {
            return adapter.getInputEditor();
        },
        getEditorText() {
            return getLegacyEditorText(adapter);
        },
        clearEditor(editor) {
            clearLegacyEditor(environment, editor);
        }
    });
}
