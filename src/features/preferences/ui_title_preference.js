import { getAdapterCapabilityStatus } from './adapter_capability.js';

function assertMethod(owner, method, label) {
    if (!owner || typeof owner[method] !== 'function') throw new TypeError(`${label} must implement ${method}()`);
}

export class UiTitlePreference {
    constructor({ adapter, surface, watcher, debounceMs = 300 } = {}) {
        for (const method of ['getCapabilityProbeReport', 'getChatTitleText', 'isInsideMainChatArea']) {
            assertMethod(adapter, method, 'UI title adapter');
        }
        for (const method of ['getTitle', 'setTitle']) assertMethod(surface, method, 'Preferences UI surface');
        for (const method of ['register', 'unregister']) assertMethod(watcher, method, 'UI title watcher');
        if (!Number.isFinite(debounceMs) || debounceMs < 0) throw new RangeError('titleDebounceMs must be non-negative');
        this.adapter = adapter;
        this.surface = surface;
        this.watcher = watcher;
        this.debounceMs = debounceMs;
        this.watcherId = 'preferences-ui-tab-title';
        this.baseTitle = '';
        this.lastAppliedTitle = '';
    }

    begin() {
        this.baseTitle = this.surface.getTitle();
        this.lastAppliedTitle = '';
    }

    apply(enabled) {
        this.watcher.unregister(this.watcherId);
        if (!enabled || getAdapterCapabilityStatus(this.adapter, 'title') === 'unavailable') {
            this.restore();
            return false;
        }
        const update = () => this.update();
        update();
        this.watcher.register(this.watcherId, {
            match: mutation => this.matches(mutation),
            callback: update,
            debounce: this.debounceMs
        });
        return true;
    }

    update() {
        const text = this.adapter.getChatTitleText();
        if (!text) return false;
        const current = this.surface.getTitle();
        if (!this.lastAppliedTitle || current !== this.lastAppliedTitle) this.baseTitle = current;
        const desired = `${text}${text.length >= 50 ? '...' : ''} - Gemini`;
        if (current !== desired) this.surface.setTitle(desired);
        this.lastAppliedTitle = desired;
        return true;
    }

    matches(mutation) {
        if (mutation?.type === 'characterData') return true;
        if (mutation?.type !== 'childList') return false;
        const target = mutation.target;
        return !target || typeof target.closest !== 'function'
            ? true
            : this.adapter.isInsideMainChatArea(target);
    }

    stop(restore = true) {
        this.watcher.unregister(this.watcherId);
        if (restore) this.restore();
    }

    restore() {
        if (this.lastAppliedTitle && this.surface.getTitle() === this.lastAppliedTitle) {
            this.surface.setTitle(this.baseTitle);
        }
        this.lastAppliedTitle = '';
    }
}
