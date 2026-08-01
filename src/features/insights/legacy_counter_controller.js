import { TIMINGS } from '../../constants.js';
import {
    INSIGHTS_EVENT_KIND,
    INSIGHTS_SEMANTICS,
    NATIVE_USAGE_LIMITS_LINK
} from './event_model.js';
import {
    createDefaultCounterDependencies,
    validateCounterDependencies
} from './legacy_counter_environment.js';
import { emptyPublicState, isRecord } from './legacy_counter_state.js';
import { legacyCounterActivity } from './legacy_counter_activity.js';
import { legacyCounterArchive } from './legacy_counter_archive.js';
import { legacyCounterLifecycle } from './legacy_counter_lifecycle.js';
import { legacyCounterMetrics } from './legacy_counter_metrics.js';
import { legacyCounterSessionAdapter } from './legacy_counter_session_adapter.js';

export const LegacyCounterController = {
    id: 'counter',
    icon: '\uD83D\uDCCA',
    defaultEnabled: true,
    COOLDOWN: TIMINGS.COUNTER_COOLDOWN,
    MODEL_CONFIG: {
        flash: { label: '3 Flash', multiplier: 0, color: '#34a853' },
        thinking: { label: '3 Flash Thinking', multiplier: 0.33, color: '#fbbc04' },
        pro: { label: '3 Pro', multiplier: 1, color: '#ea4335' }
    },

    get name() { return this._deps.translate('本地洞察', 'Local Insights'); },
    get description() {
        return this._deps.translate(
            '本地估算的消息、模型与工具趋势；服务端额度请查看 Gemini Usage Limits',
            'Local-only message, model, and tool estimates; use Gemini Usage Limits for server quota'
        );
    },

    resetHour: 0,
    quotaLimit: 50,
    quotaSemantics: INSIGHTS_SEMANTICS,
    nativeUsageLimits: NATIVE_USAGE_LIMITS_LINK,
    accountType: 'free',
    lastDisplayedVal: -1,
    lastCountTime: 0,
    state: emptyPublicState(),

    _deps: createDefaultCounterDependencies(),
    _started: false,
    _currentModel: 'flash',
    _records: new Map(),
    _activeIdentity: null,
    _displayIdentity: null,
    _controller: null,
    _listeners: new Set(),
    _storageUnsubscribe: null,
    _saveTimer: null,
    _boundKeyHandler: null,
    _boundClickHandler: null,
    _cidPoller: null,

    get currentModel() { return this._currentModel; },
    set currentModel(value) {
        const next = typeof value === 'string' && value.trim() ? value.trim() : 'flash';
        if (next === this._currentModel) return;
        this._currentModel = next;
        if (this._started && this._controller) {
            this._captureActiveEvent(INSIGHTS_EVENT_KIND.MODEL, { model: next });
            this._debouncedSave();
        }
        this._emitChange('model');
    },

    configure(overrides = {}) {
        if (this._started) throw new Error('Counter cannot be configured while started');
        if (!isRecord(overrides)) throw new TypeError('Counter configuration must be an object');
        this._deps = validateCounterDependencies({ ...createDefaultCounterDependencies(), ...overrides });
        this._records = new Map();
        this._activeIdentity = null;
        this._displayIdentity = null;
        this._controller = null;
        this._listeners = new Set();
        this._storageUnsubscribe = null;
        this._saveTimer = null;
        this._cidPoller = null;
        this._boundKeyHandler = null;
        this._boundClickHandler = null;
        this._currentModel = 'flash';
        this.lastCountTime = 0;
        this.state = emptyPublicState();
        return this;
    },

    subscribe(listener) {
        if (typeof listener !== 'function') throw new TypeError('Counter listener must be a function');
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    },

    ...legacyCounterLifecycle,
    ...legacyCounterSessionAdapter,
    ...legacyCounterActivity,
    ...legacyCounterArchive,
    ...legacyCounterMetrics
};

export function configureCounterModule(dependencies) {
    return LegacyCounterController.configure(dependencies);
}
