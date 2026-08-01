import { getAdapterCapabilityStatus } from './adapter_capability.js';
import { chooseModelOption } from './default_model_schema.js';

function assertMethod(owner, method, label) {
    if (!owner || typeof owner[method] !== 'function') throw new TypeError(`${label} must implement ${method}()`);
}

function normalizeLogger(logger) {
    return Object.freeze({
        info: typeof logger?.info === 'function' ? logger.info.bind(logger) : () => {},
        warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : () => {}
    });
}

export class DefaultModelSwitcher {
    constructor({ adapter, surface, waitFor, logger = null, menuTimeoutMs = 2000 } = {}) {
        for (const method of [
            'getCapabilityProbeReport', 'getModelSwitch', 'detectModelKey', 'getModelMenuOptions'
        ]) assertMethod(adapter, method, 'Default model adapter');
        for (const method of ['openModelMenu', 'activate', 'dismissModelMenu']) {
            assertMethod(surface, method, 'Preferences UI surface');
        }
        if (typeof waitFor !== 'function') throw new TypeError('Default model waitFor must be a function');
        if (!Number.isFinite(menuTimeoutMs) || menuTimeoutMs <= 0) {
            throw new RangeError('menuTimeoutMs must be positive');
        }
        this.adapter = adapter;
        this.surface = surface;
        this.waitFor = waitFor;
        this.logger = normalizeLogger(logger);
        this.menuTimeoutMs = menuTimeoutMs;
        this._openMenu = null;
    }

    async apply({ model, isCurrent }) {
        if (typeof isCurrent !== 'function') throw new TypeError('Default model switch requires a lifecycle guard');
        if (getAdapterCapabilityStatus(this.adapter, 'model-picker') === 'unavailable') {
            return Object.freeze({ status: 'capability-unavailable' });
        }
        let menu = null;
        try {
            const trigger = await this.waitFor(() => this.adapter.getModelSwitch(), this.menuTimeoutMs);
            if (!isCurrent()) return Object.freeze({ status: 'cancelled' });
            const currentModel = this.adapter.detectModelKey();
            if (currentModel === model) {
                return Object.freeze({ status: 'already-selected', model: currentModel });
            }
            if (!this.surface.openModelMenu(trigger)) {
                return Object.freeze({ status: 'trigger-unavailable' });
            }
            menu = Object.freeze({ trigger });
            this._openMenu = menu;
            const options = await this.waitFor(() => {
                const current = this.adapter.getModelMenuOptions();
                return Array.isArray(current) && current.length > 0 ? current : null;
            }, this.menuTimeoutMs);
            if (!isCurrent()) {
                this._dismissMenu(menu);
                return Object.freeze({ status: 'cancelled' });
            }
            const option = chooseModelOption(options, model);
            if (!option) {
                this._dismissMenu(menu);
                return Object.freeze({ status: 'option-unavailable', model });
            }
            if (!option.active && !this.surface.activate(option.element)) {
                this._dismissMenu(menu);
                return Object.freeze({ status: 'option-disabled', model });
            }
            if (option.active) this._dismissMenu(menu);
            else if (this._openMenu === menu) this._openMenu = null;
            this.logger.info('Preferred model applied', { from: currentModel, to: model });
            return Object.freeze({
                status: option.active ? 'already-selected' : 'applied',
                from: currentModel,
                model
            });
        } catch (error) {
            if (menu) this._dismissMenu(menu);
            this.logger.warn('Preferred model switch failed', { error: String(error) });
            return Object.freeze({ status: 'failed', error: String(error) });
        }
    }

    stop() {
        return this._dismissMenu(this._openMenu);
    }

    _dismissMenu(menu) {
        if (!menu || this._openMenu !== menu) return false;
        this._openMenu = null;
        return this.surface.dismissModelMenu(menu.trigger);
    }
}
