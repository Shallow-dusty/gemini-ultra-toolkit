import { cloneStorageValue } from '../../storage/clone.js';
import { getAdapterCapabilityStatus } from './adapter_capability.js';
import { UiComposerPreference } from './ui_composer_preference.js';
import { UiLayoutPreference } from './ui_layout_preference.js';
import { UiTitlePreference } from './ui_title_preference.js';
import {
    UI_TWEAK_FEATURE_IDS,
    normalizeUiTweaks,
    uiPreferenceAcceptsValue
} from './ui_tweaks_schema.js';

function assertMethod(owner, method, label) {
    if (!owner || typeof owner[method] !== 'function') throw new TypeError(`${label} must implement ${method}()`);
}

function normalizeLogger(logger) {
    return Object.freeze({
        info: typeof logger?.info === 'function' ? logger.info.bind(logger) : () => {},
        warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : () => {}
    });
}

export class UiTweaksPreferenceController {
    constructor({
        repository,
        adapter,
        surface,
        watcher,
        formatInputStats,
        logger = null,
        titleDebounceMs = 300,
        layout = null,
        title = null,
        composer = null
    } = {}) {
        for (const method of ['load', 'save']) assertMethod(repository, method, 'UI preferences repository');
        assertMethod(adapter, 'getCapabilityProbeReport', 'UI preferences adapter');
        for (const method of ['translate', 'renderUiPreferences']) {
            assertMethod(surface, method, 'Preferences UI surface');
        }
        this.layout = layout || new UiLayoutPreference({ adapter, surface });
        this.title = title || new UiTitlePreference({ adapter, surface, watcher, debounceMs: titleDebounceMs });
        this.composer = composer || new UiComposerPreference({ adapter, surface, formatInputStats });
        for (const [owner, methods, label] of [
            [this.layout, ['apply', 'stop'], 'UI layout preference'],
            [this.title, ['begin', 'apply', 'stop'], 'UI title preference'],
            [this.composer, ['apply', 'refresh', 'stop', 'removeNativeUi'], 'UI composer preference']
        ]) {
            for (const method of methods) assertMethod(owner, method, label);
        }
        this.repository = repository;
        this.adapter = adapter;
        this.surface = surface;
        this.logger = normalizeLogger(logger);
        this.config = normalizeUiTweaks(null);
        this.active = false;
        this._generation = 0;
        this._startPromise = null;
        this.capability = Object.freeze({
            id: 'preferences.ui',
            get: () => this.getConfig(),
            set: config => this.setConfig(config),
            setEnabled: (id, enabled) => this.setFeatureEnabled(id, enabled),
            setValue: (id, value) => this.setFeatureValue(id, value),
            refresh: () => this.refreshNativeUi(),
            status: () => this.getStatus()
        });
    }

    start() {
        if (this.active) return Promise.resolve(this.capability);
        if (this._startPromise) return this._startPromise;
        const generation = ++this._generation;
        const operation = (async () => {
            const config = normalizeUiTweaks(await this.repository.load());
            if (generation !== this._generation) return this.capability;
            this.config = config;
            this.active = true;
            this.title.begin();
            try {
                this._applyAll();
            } catch (error) {
                this.active = false;
                this._generation += 1;
                this._teardown(true);
                throw error;
            }
            this.logger.info('UI preferences started', { enabled: this.getEnabledIds() });
            return this.capability;
        })();
        const wrapped = operation.finally(() => {
            if (this._startPromise === wrapped) this._startPromise = null;
        });
        this._startPromise = wrapped;
        return wrapped;
    }

    async stop() {
        if (!this.active && !this._startPromise) return;
        const pendingStart = this._startPromise;
        this._generation += 1;
        if (pendingStart) await pendingStart.catch(() => {});
        if (!this.active) return;
        this.active = false;
        this._teardown(true);
    }

    onSessionChange() {
        if (!this.active) return false;
        return this.reapply();
    }

    getConfig() {
        return cloneStorageValue(this.config);
    }

    getEnabledIds() {
        return UI_TWEAK_FEATURE_IDS.filter(id => this.config[id].enabled);
    }

    getLegacyFeatures() {
        const labels = {
            tabTitle: this.surface.translate('Tab 标题同步对话名', 'Sync tab title with chat name'),
            ctrlEnter: this.surface.translate('Ctrl+Enter 才发送', 'Ctrl+Enter to send'),
            inputCounter: this.surface.translate('输入字数计数', 'Input counter'),
            chatWidth: this.surface.translate('聊天区宽度', 'Chat area width'),
            sidebarWidth: this.surface.translate('侧栏宽度', 'Sidebar width')
        };
        return Object.fromEntries(UI_TWEAK_FEATURE_IDS.map(id => [id, {
            ...cloneStorageValue(this.config[id]),
            label: labels[id]
        }]));
    }

    getStatus() {
        return Object.freeze({
            active: this.active,
            enabled: Object.freeze(this.getEnabledIds()),
            composer: getAdapterCapabilityStatus(this.adapter, 'composer'),
            title: getAdapterCapabilityStatus(this.adapter, 'title')
        });
    }

    async setFeatureEnabled(id, enabled) {
        this._assertFeature(id);
        const next = this.getConfig();
        next[id].enabled = Boolean(enabled);
        return this._commit(next);
    }

    async setConfig(config) {
        return this._commit(config);
    }

    async toggleFeature(id) {
        this._assertFeature(id);
        return this.setFeatureEnabled(id, !this.config[id].enabled);
    }

    async setFeatureValue(id, value) {
        this._assertFeature(id);
        if (!uiPreferenceAcceptsValue(id)) throw new TypeError(`${id} does not accept a numeric value`);
        const next = this.getConfig();
        next[id].value = value;
        return this._commit(next);
    }

    renderSettings(container) {
        return this.surface.renderUiPreferences(container, {
            config: this.getConfig(),
            labels: this.getLegacyFeatures(),
            onToggle: (id, enabled) => this.setFeatureEnabled(id, enabled),
            onValue: (id, value) => this.setFeatureValue(id, value)
        });
    }

    refreshNativeUi() {
        if (!this.active) {
            this.composer.removeNativeUi();
            return false;
        }
        return this.composer.refresh(this.config);
    }

    removeNativeUi() {
        this.composer.removeNativeUi();
    }

    reapply() {
        if (!this.active) return false;
        try {
            this._applyAll();
            return true;
        } catch (error) {
            this.active = false;
            this._generation += 1;
            this._teardown(true);
            throw error;
        }
    }

    _applyAll() {
        if (!this.active) return;
        this.layout.apply(this.config);
        this.title.apply(this.config.tabTitle.enabled);
        this.composer.apply(this.config);
    }

    async _commit(next) {
        const previous = this.getConfig();
        const normalized = normalizeUiTweaks(next);
        await this.repository.save(normalized);
        this.config = normalized;
        if (!this.active) return this.getConfig();
        try {
            this._applyAll();
            return this.getConfig();
        } catch (error) {
            this.config = previous;
            let rollbackError = null;
            try { await this.repository.save(previous); }
            catch (failure) { rollbackError = failure; }
            try { this._applyAll(); }
            catch (failure) {
                rollbackError ||= failure;
                this.active = false;
                this._teardown(true);
            }
            if (rollbackError) error.rollbackError = rollbackError;
            this.logger.warn('UI preference apply failed', { error: String(error) });
            throw error;
        }
    }

    _assertFeature(id) {
        if (!UI_TWEAK_FEATURE_IDS.includes(id)) throw new TypeError(`Unknown UI preference: ${String(id)}`);
    }

    _teardown(restoreTitle) {
        this.composer.stop();
        this.layout.stop();
        this.title.stop(restoreTitle);
    }
}
