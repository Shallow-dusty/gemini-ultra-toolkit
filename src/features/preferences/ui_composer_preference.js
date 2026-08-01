import { getAdapterCapabilityStatus } from './adapter_capability.js';

function assertMethod(owner, method, label) {
    if (!owner || typeof owner[method] !== 'function') throw new TypeError(`${label} must implement ${method}()`);
}

export class UiComposerPreference {
    constructor({ adapter, surface, formatInputStats } = {}) {
        for (const method of [
            'getCapabilityProbeReport', 'getInputArea', 'getInputEditor',
            'getSendButton', 'isInsideInputEditor'
        ]) assertMethod(adapter, method, 'UI composer adapter');
        for (const method of [
            'translate', 'locale', 'listenKeydown', 'activate', 'mountComposerStatus'
        ]) assertMethod(surface, method, 'Preferences UI surface');
        if (typeof formatInputStats !== 'function') throw new TypeError('formatInputStats must be a function');
        this.adapter = adapter;
        this.surface = surface;
        this.formatInputStats = formatInputStats;
        this._keydownCleanup = null;
        this._composerHandle = null;
        this._host = null;
        this._showHint = false;
        this._showCounter = false;
        this._editor = null;
        this._editorHandler = null;
    }

    apply(config) {
        this._applyKeyboard(config.ctrlEnter.enabled);
        return this.refresh(config);
    }

    refresh(config) {
        const showHint = config.ctrlEnter.enabled;
        const showCounter = config.inputCounter.enabled;
        if ((!showHint && !showCounter)
            || getAdapterCapabilityStatus(this.adapter, 'composer') === 'unavailable') {
            this.removeNativeUi();
            return false;
        }
        const host = this.adapter.getInputArea();
        if (!host) {
            this.removeNativeUi();
            return false;
        }
        const editor = showCounter ? this.adapter.getInputEditor() : null;
        if (this._composerHandle && this._host === host
            && this._showHint === showHint && this._showCounter === showCounter
            && (!showCounter || this._editor === editor)) {
            if (showCounter) this._updateCounter();
            return true;
        }
        this.removeNativeUi();
        const handle = this.surface.mountComposerStatus(host, {
            showHint,
            showCounter,
            hintText: this.surface.translate('Ctrl+Enter ↵', 'Ctrl+Enter ↵'),
            counterLabel: this.surface.translate('当前输入长度', 'Current input length')
        });
        if (!handle || typeof handle.destroy !== 'function'
            || (showCounter && typeof handle.setCounter !== 'function')) {
            throw new TypeError('Composer status surface returned an invalid handle');
        }
        this._composerHandle = handle;
        this._host = host;
        this._showHint = showHint;
        this._showCounter = showCounter;
        if (showCounter) this._bindCounter(editor);
        return true;
    }

    stop() {
        this.removeNativeUi();
        if (typeof this._keydownCleanup === 'function') this._keydownCleanup();
        this._keydownCleanup = null;
    }

    removeNativeUi() {
        if (this._editor && this._editorHandler && typeof this._editor.removeEventListener === 'function') {
            this._editor.removeEventListener('input', this._editorHandler);
        }
        this._editor = null;
        this._editorHandler = null;
        this._composerHandle?.destroy();
        this._composerHandle = null;
        this._host = null;
        this._showHint = false;
        this._showCounter = false;
    }

    _applyKeyboard(enabled) {
        if (typeof this._keydownCleanup === 'function') this._keydownCleanup();
        this._keydownCleanup = null;
        if (!enabled || getAdapterCapabilityStatus(this.adapter, 'composer') === 'unavailable') return false;
        this._keydownCleanup = this.surface.listenKeydown(event => {
            if (event.key !== 'Enter' || !this.adapter.isInsideInputEditor(event.target) || event.isComposing) return;
            if (!event.ctrlKey && !event.metaKey) {
                event.stopPropagation();
                event.stopImmediatePropagation();
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const sendButton = this.adapter.getSendButton();
            if (sendButton && !sendButton.disabled) this.surface.activate(sendButton);
        });
        return true;
    }

    _bindCounter(editor) {
        if (!editor) return false;
        this._editor = editor;
        this._editorHandler = () => this._updateCounter();
        if (typeof editor.addEventListener === 'function' && typeof editor.removeEventListener === 'function') {
            editor.addEventListener('input', this._editorHandler);
        }
        this._updateCounter();
        return true;
    }

    _updateCounter() {
        if (!this._composerHandle || !this._editor) return false;
        const text = 'value' in this._editor
            ? this._editor.value || ''
            : this._editor.textContent || '';
        this._composerHandle.setCounter(this.formatInputStats(text, { locale: this.surface.locale() }));
        return true;
    }
}
