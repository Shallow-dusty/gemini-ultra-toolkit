import { TIMINGS } from '../constants.js';
import { Logger } from '../logger.js';
import { DOMWatcher } from '../dom_watcher.js';
import { NativeUI } from '../native_ui.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { formatInputStats } from '../../lib/input_stats_tools.js';
import {
    DEFAULT_UI_TWEAKS,
    LEGACY_PREFERENCE_KEYS,
    UiTweaksPreferenceController,
    createDomPreferencesSurface,
    createGlobalGmPreferencesStorage,
    createLegacyPreferenceRepository,
    normalizeUiTweaks
} from '../features/preferences/index.js';

const UI_TWEAKS_ONBOARDING = Object.freeze({
    zh: Object.freeze({
        rant: '把仍然有用的小型交互偏好集中管理，并让每项能力都可单独开关。',
        features: '可选的 Ctrl+Enter 发送、输入统计、对话标题同步，以及聊天区和侧栏宽度。',
        guide: '1. 只开启需要的偏好\n2. 输入区会显示已启用的快捷键或统计\n3. 停用模块会恢复由 Primer++ 修改的布局与标题'
    }),
    en: Object.freeze({
        rant: 'Keep the useful interaction preferences together while allowing each capability to be enabled independently.',
        features: 'Optional Ctrl+Enter send, composer stats, chat title sync, and chat/sidebar widths.',
        guide: '1. Enable only the preferences you need\n2. The composer shows enabled shortcut or input status\n3. Disabling the module restores layout and title changes owned by Primer++'
    })
});

export function createUiTweaksAdapter(adapter = GeminiAdapter) {
    return Object.freeze({
        getCapabilityProbeReport: () => adapter.getCapabilityProbeReport(),
        getInputArea: () => adapter.getInputArea(),
        getInputEditor: () => adapter.getInputEditor(),
        getSendButton: () => adapter.getSendButton(),
        isInsideInputEditor: target => adapter.isInsideInputEditor(target),
        getChatTitleText: () => adapter.getChatTitleText(),
        isInsideMainChatArea: target => adapter.isInsideMainChatArea(target),
        getSidebar: () => adapter.getSidebar(),
        getChatWidthTarget() {
            const inputArea = adapter.getInputArea();
            return inputArea?.parentElement || inputArea || null;
        }
    });
}

export function createUiPreferencesWatcher(watcher = DOMWatcher) {
    return Object.freeze({
        register: (id, options) => watcher.register(id, options),
        unregister: id => watcher.unregister(id)
    });
}

export function createUiTweaksController({
    globalObject = globalThis,
    storage = null,
    repository = null,
    adapter = null,
    surface = null,
    watcher = null,
    formatter = formatInputStats,
    logger = Logger
} = {}) {
    const persistence = repository || createLegacyPreferenceRepository({
        key: LEGACY_PREFERENCE_KEYS.UI_TWEAKS,
        storage: storage || createGlobalGmPreferencesStorage(globalObject),
        defaultValue: DEFAULT_UI_TWEAKS,
        normalize: normalizeUiTweaks,
        onReadError: error => logger?.warn?.('UI preference read failed', { error: String(error) })
    });
    const ui = surface || createDomPreferencesSurface({
        getDocument: () => globalObject.document,
        translate: (zh, en) => NativeUI.t(zh, en),
        getLocale: () => (NativeUI.isZH ? 'zh' : 'en')
    });
    return new UiTweaksPreferenceController({
        repository: persistence,
        adapter: adapter || createUiTweaksAdapter(),
        surface: ui,
        watcher: watcher || createUiPreferencesWatcher(),
        formatInputStats: formatter,
        logger,
        titleDebounceMs: TIMINGS.TITLE_DEBOUNCE
    });
}

function assertController(controller) {
    for (const method of [
        'start', 'stop', 'onSessionChange', 'getLegacyFeatures', 'getStatus',
        'refreshNativeUi', 'removeNativeUi', 'reapply', 'toggleFeature',
        'setFeatureValue', 'renderSettings'
    ]) {
        if (!controller || typeof controller[method] !== 'function') {
            throw new TypeError(`UI tweaks controller must implement ${method}()`);
        }
    }
}

export function createUiTweaksModule({
    controller = createUiTweaksController(),
    translate = (zh, en) => NativeUI.t(zh, en)
} = {}) {
    assertController(controller);
    if (typeof translate !== 'function') throw new TypeError('UI tweaks translator must be a function');
    return Object.freeze({
        id: 'ui-tweaks',
        name: translate('UI 自定义', 'UI Tweaks'),
        description: translate('标题 / 快捷键 / 输入统计 / 布局', 'Title / hotkeys / input stats / layout'),
        icon: '\uD83C\uDFA8',
        defaultEnabled: false,
        STORAGE_KEY: LEGACY_PREFERENCE_KEYS.UI_TWEAKS,
        get capability() { return controller.capability; },
        get features() { return controller.getLegacyFeatures(); },
        init() { return controller.start(); },
        destroy() { return controller.stop(); },
        onUserChange() { return controller.onSessionChange(); },
        injectNativeUI() { return controller.refreshNativeUi(); },
        removeNativeUI() { return controller.removeNativeUi(); },
        toggleFeature(id) { return controller.toggleFeature(id); },
        setFeatureValue(id, value) { return controller.setFeatureValue(id, value); },
        _applyAll() { return controller.reapply(); },
        _getStatusText() {
            const features = controller.getLegacyFeatures();
            const items = [];
            if (features.ctrlEnter.enabled) items.push('Ctrl+Enter: ON');
            if (features.inputCounter.enabled) items.push('Input Counter: ON');
            if (features.tabTitle.enabled) items.push('Tab Title: ON');
            if (features.chatWidth.enabled) items.push(`Chat Width: ${features.chatWidth.value}px`);
            if (features.sidebarWidth.enabled) items.push(`Sidebar: ${features.sidebarWidth.value}px`);
            return items.length > 0 ? items.join(' | ') : 'All tweaks off';
        },
        getOnboarding() { return UI_TWEAKS_ONBOARDING; },
        renderToSettings(container) { return controller.renderSettings(container); }
    });
}

export const UITweaksModule = createUiTweaksModule();
