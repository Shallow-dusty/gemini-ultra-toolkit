import { TIMINGS } from '../constants.js';
import { Logger } from '../logger.js';
import { NativeUI } from '../native_ui.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import {
    DefaultModelPreferenceController,
    LEGACY_PREFERENCE_KEYS,
    createDomPreferencesSurface,
    createGlobalGmPreferencesStorage,
    createLegacyPreferenceRepository,
    createPollingWaitFor,
    normalizePreferredModel
} from '../features/preferences/index.js';

const DEFAULT_MODEL_ONBOARDING = Object.freeze({
    zh: Object.freeze({
        rant: '为不同工作流保留一个明确的新对话首选模型，避免每次开始时重复调整。',
        features: '在 Gemini 当前模型选择器可用时，为新对话应用首选模型，并在选择器旁显示状态。',
        guide: '1. 在设置中选择 Fast、Thinking 或 Pro\n2. 新建对话时自动应用\n3. 无法确认模型选择器时安全跳过，不影响 Gemini'
    }),
    en: Object.freeze({
        rant: 'Keep an explicit preferred model for new chats so each workflow starts consistently.',
        features: 'Applies the preference when Gemini exposes a supported model picker and shows a status beside it.',
        guide: '1. Choose Fast, Thinking, or Pro in Settings\n2. Start a new chat\n3. If the picker cannot be confirmed, Primer++ safely leaves Gemini unchanged'
    })
});

export function createDefaultModelAdapter({
    adapter = GeminiAdapter,
    getCurrentUrl = () => globalThis.location?.href || ''
} = {}) {
    if (typeof getCurrentUrl !== 'function') throw new TypeError('Default model URL provider must be a function');
    return Object.freeze({
        getCapabilityProbeReport: () => adapter.getCapabilityProbeReport(),
        getCurrentUrl,
        isNewChatUrl: () => adapter.isNewChatUrl(),
        getModelSwitch: () => adapter.getModelSwitch(),
        detectModelKey: () => adapter.detectModelKey(),
        getModelMenuOptions: () => adapter.getModelMenuOptions()
    });
}

export function createDefaultModelController({
    globalObject = globalThis,
    storage = null,
    repository = null,
    adapter = null,
    surface = null,
    scheduler = null,
    waitFor = null,
    logger = Logger
} = {}) {
    const timer = scheduler || Object.freeze({
        setInterval: (callback, delay) => globalObject.setInterval(callback, delay),
        clearInterval: handle => globalObject.clearInterval(handle)
    });
    const persistence = repository || createLegacyPreferenceRepository({
        key: LEGACY_PREFERENCE_KEYS.DEFAULT_MODEL,
        storage: storage || createGlobalGmPreferencesStorage(globalObject),
        defaultValue: 'pro',
        normalize: normalizePreferredModel,
        onReadError: error => logger?.warn?.('Default model preference read failed', { error: String(error) })
    });
    const ui = surface || createDomPreferencesSurface({
        getDocument: () => globalObject.document,
        translate: (zh, en) => NativeUI.t(zh, en),
        getLocale: () => (NativeUI.isZH ? 'zh' : 'en')
    });
    return new DefaultModelPreferenceController({
        repository: persistence,
        adapter: adapter || createDefaultModelAdapter(),
        surface: ui,
        scheduler: timer,
        waitFor: waitFor || createPollingWaitFor({
            setInterval: timer.setInterval,
            clearInterval: timer.clearInterval,
            intervalMs: 100
        }),
        logger,
        pollIntervalMs: 800,
        menuTimeoutMs: TIMINGS.MODEL_MENU_TIMEOUT
    });
}

function assertController(controller) {
    for (const method of [
        'start', 'stop', 'onSessionChange', 'refreshIndicator', 'removeIndicator',
        'setPreferredModel', 'applyToCurrentNewChat', 'renderSettings', 'getStatus'
    ]) {
        if (!controller || typeof controller[method] !== 'function') {
            throw new TypeError(`Default model controller must implement ${method}()`);
        }
    }
}

export function createDefaultModelModule({
    controller = createDefaultModelController(),
    translate = (zh, en) => NativeUI.t(zh, en)
} = {}) {
    assertController(controller);
    if (typeof translate !== 'function') throw new TypeError('Default model translator must be a function');
    return Object.freeze({
        id: 'default-model',
        name: translate('默认模型', 'Default Model'),
        description: translate('为新对话应用首选模型', 'Apply a preferred model to new chats'),
        icon: '\uD83E\uDD16',
        iconId: 'settings',
        defaultEnabled: false,
        STORAGE_KEY: LEGACY_PREFERENCE_KEYS.DEFAULT_MODEL,
        get capability() { return controller.capability; },
        get _preferredModel() { return controller.preferredModel; },
        get _lastUrl() { return controller._route; },
        get _pollTimer() { return controller._routeTimer; },
        get _switching() { return controller.getStatus().switching; },
        init() { return controller.start(); },
        destroy() { return controller.stop(); },
        onUserChange() { return controller.onSessionChange(); },
        injectNativeUI() { return controller.refreshIndicator(); },
        removeNativeUI() { return controller.removeIndicator(); },
        setPreferredModel(model) { return controller.setPreferredModel(model); },
        _isNewChat() { return controller.adapter.isNewChatUrl(); },
        _startUrlWatcher() { return controller.start(); },
        _attemptModelSwitch() { return controller.applyToCurrentNewChat(); },
        _detectCurrentModel() { return controller.adapter.detectModelKey() || 'flash'; },
        _waitFor(predicate, timeout) { return controller.waitFor(predicate, timeout); },
        getOnboarding() { return DEFAULT_MODEL_ONBOARDING; },
        renderToSettings(container) { return controller.renderSettings(container); }
    });
}

export const DefaultModelModule = createDefaultModelModule();
