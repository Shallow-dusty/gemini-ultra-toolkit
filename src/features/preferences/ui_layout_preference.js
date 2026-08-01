function assertMethod(owner, method, label) {
    if (!owner || typeof owner[method] !== 'function') throw new TypeError(`${label} must implement ${method}()`);
}

export class UiLayoutPreference {
    constructor({ adapter, surface } = {}) {
        for (const method of ['getSidebar', 'getChatWidthTarget']) {
            assertMethod(adapter, method, 'UI layout adapter');
        }
        assertMethod(surface, 'applyWidths', 'Preferences UI surface');
        this.adapter = adapter;
        this.surface = surface;
        this._cleanup = null;
    }

    apply(config) {
        this.stop();
        const chat = config.chatWidth;
        const sidebar = config.sidebarWidth;
        if (!chat.enabled && !sidebar.enabled) return false;
        const cleanup = this.surface.applyWidths({
            chatTarget: chat.enabled ? this.adapter.getChatWidthTarget() : null,
            chatWidth: chat.enabled ? chat.value : null,
            sidebarTarget: sidebar.enabled ? this.adapter.getSidebar() : null,
            sidebarWidth: sidebar.enabled ? sidebar.value : null
        });
        if (typeof cleanup !== 'function') {
            throw new TypeError('Preferences UI width application must return a cleanup function');
        }
        this._cleanup = cleanup;
        return true;
    }

    stop() {
        if (typeof this._cleanup === 'function') this._cleanup();
        this._cleanup = null;
    }
}
