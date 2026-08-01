const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDom, FakeEvent } = require('./helpers/fake_dom.js');

const GLOBAL_NAMES = [
    'Blob',
    'document',
    'MutationObserver',
    'URL',
    'window',
    'GM_addValueChangeListener',
    'GM_getValue',
    'GM_listValues',
    'GM_removeValueChangeListener',
    'GM_setValue',
];
const savedGlobals = new Map(GLOBAL_NAMES.map(name => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
]));

let constants;
let Core;
let configureCoreRuntime;
let DOMWatcher;
let debugUtils;
let GeminiAdapter;
let icons;
let Logger;
let state;
let adapterMethods;
let loggerMethods;

const gm = {
    addError: null,
    getErrors: new Set(),
    listError: null,
    listValues: [],
    listeners: new Map(),
    nextListenerId: 1,
    removeError: null,
    setErrors: new Set(),
    values: new Map(),
};

const coreStorage = Object.freeze({
    get(key, fallback) {
        if (gm.getErrors.has(key)) throw new Error(`get failed: ${key}`);
        return gm.values.has(key) ? gm.values.get(key) : fallback;
    },
    set(key, value) {
        if (gm.setErrors.has(key)) throw new Error(`set failed: ${key}`);
        gm.values.set(key, value);
    },
    addValueChangeListener(key, callback) {
        if (gm.addError) throw gm.addError;
        const id = gm.nextListenerId++;
        gm.listeners.set(id, { callback, key });
        return id;
    },
    removeValueChangeListener(id) {
        if (gm.removeError) throw gm.removeError;
        gm.listeners.delete(id);
    }
});

function fakeElement({
    attrs = {},
    backgroundColor = 'rgba(0, 0, 0, 0)',
    className = '',
    colorScheme = 'normal',
    id = '',
    isConnected = true,
    nodeType = 1,
    parentElement = null,
    tagName = 'div',
} = {}) {
    const attributes = new Map(Object.entries(attrs).map(([key, value]) => [key, String(value)]));
    const properties = new Map();
    return {
        _attributes: attributes,
        _properties: properties,
        children: [],
        classList: className ? className.split(/\s+/).filter(Boolean) : [],
        className,
        computed: { backgroundColor, colorScheme },
        id,
        isConnected,
        nodeType,
        parentElement,
        removed: false,
        tagName,
        style: {
            flexShrink: '',
            verticalAlign: '',
            getPropertyValue(name) { return properties.get(name) || ''; },
            setProperty(name, value) { properties.set(name, String(value)); },
        },
        appendChild(child) {
            this.children.push(child);
            child.parentElement = this;
            return child;
        },
        click() { this.clicked = true; },
        getAttribute(name) {
            if (name === 'class') return this.className;
            return attributes.get(name) ?? null;
        },
        remove() { this.removed = true; },
        setAttribute(name, value) { attributes.set(name, String(value)); },
    };
}

function createEnvironment({
    bodyBackground = 'rgba(0, 0, 0, 0)',
    bodyClass = '',
    bodyScheme = 'normal',
    mediaMatches = false,
} = {}) {
    const html = fakeElement({ tagName: 'html' });
    const body = fakeElement({
        backgroundColor: bodyBackground,
        className: bodyClass,
        colorScheme: bodyScheme,
        parentElement: html,
        tagName: 'body',
    });
    html.children = [body];
    const panel = fakeElement({ id: constants?.PANEL_ID || 'gemini-monitor-panel-v7', parentElement: body });
    const appended = [];
    const observers = [];
    const mediaListeners = new Set();
    const mediaLegacyListeners = new Set();
    const media = {
        matches: mediaMatches,
        addEventListener(name, handler) {
            if (name === 'change') mediaListeners.add(handler);
        },
        removeEventListener(name, handler) {
            if (name === 'change') mediaListeners.delete(handler);
        },
        addListener(handler) { mediaLegacyListeners.add(handler); },
        removeListener(handler) { mediaLegacyListeners.delete(handler); },
        emit() {
            for (const handler of [...mediaListeners, ...mediaLegacyListeners]) handler({ matches: this.matches });
        },
    };

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.disconnected = false;
            this.observations = [];
            observers.push(this);
        }
        disconnect() { this.disconnected = true; }
        emit(mutations) { this.callback(mutations); }
        observe(target, options) {
            if (target?.throwOnObserve) throw new Error('detached target');
            this.observations.push({ options, target });
        }
    }

    body.appendChild = child => {
        appended.push(child);
        child.parentElement = body;
        return child;
    };
    const document = {
        body,
        documentElement: html,
        elementFromPoint: () => body,
        getElementById: id => id === panel.id ? panel : null,
        querySelector: () => null,
        createElement(tagName) { return fakeElement({ tagName }); },
        createElementNS(_namespace, tagName) { return fakeElement({ tagName }); },
        createTextNode(textContent) { return { nodeType: 3, textContent }; },
    };
    const window = {
        getComputedStyle: element => element.computed || { backgroundColor: '', colorScheme: '' },
        innerHeight: 720,
        innerWidth: 1280,
        matchMedia: () => media,
    };
    return {
        appended,
        body,
        document,
        html,
        media,
        mediaLegacyListeners,
        mediaListeners,
        MutationObserver: FakeMutationObserver,
        observers,
        panel,
        window,
    };
}

function installGmGlobals() {
    globalThis.GM_getValue = (key, fallback) => {
        if (gm.getErrors.has(key)) throw new Error(`get failed: ${key}`);
        return gm.values.has(key) ? gm.values.get(key) : fallback;
    };
    globalThis.GM_setValue = (key, value) => {
        if (gm.setErrors.has(key)) throw new Error(`set failed: ${key}`);
        gm.values.set(key, value);
    };
    globalThis.GM_listValues = () => {
        if (gm.listError) throw gm.listError;
        return gm.listValues.slice();
    };
    globalThis.GM_addValueChangeListener = (key, callback) => {
        if (gm.addError) throw gm.addError;
        const id = gm.nextListenerId++;
        gm.listeners.set(id, { callback, key });
        return id;
    };
    globalThis.GM_removeValueChangeListener = id => {
        if (gm.removeError) throw gm.removeError;
        gm.listeners.delete(id);
    };
}

function installEnvironment(options) {
    const env = createEnvironment(options);
    globalThis.document = env.document;
    globalThis.window = env.window;
    globalThis.MutationObserver = env.MutationObserver;
    return env;
}

function installDownloadGlobals() {
    const blobs = [];
    const urls = [];
    class FakeBlob {
        constructor(parts, options) {
            this.options = options;
            this.parts = parts;
            blobs.push(this);
        }
    }
    globalThis.Blob = FakeBlob;
    globalThis.URL = {
        createObjectURL(blob) {
            const url = `blob:test-${urls.length}`;
            urls.push({ blob, revoked: false, url });
            return url;
        },
        revokeObjectURL(url) {
            const record = urls.find(entry => entry.url === url);
            if (record) record.revoked = true;
        },
    };
    return { blobs, urls };
}

function resetGm() {
    gm.addError = null;
    gm.getErrors.clear();
    gm.listError = null;
    gm.listValues = [];
    gm.listeners.clear();
    gm.nextListenerId = 1;
    gm.removeError = null;
    gm.setErrors.clear();
    gm.values.clear();
    installGmGlobals();
}

function restoreGlobal(name) {
    const descriptor = savedGlobals.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
}

before(async () => {
    // These two modules must stay safe to import without a DOM.
    delete globalThis.document;
    constants = await import('../src/constants.js');
    icons = await import('../src/icons.js');

    resetGm();
    gm.values.set(constants.GLOBAL_KEYS.LOG_LEVEL, 'error');
    installEnvironment();
    state = await import('../src/state.js');
    ({ GeminiAdapter } = await import('../src/adapters/gemini.js'));
    ({ Core, configureCoreRuntime } = await import('../src/core.js'));
    ({ DOMWatcher } = await import('../src/dom_watcher.js'));
    ({ Logger } = await import('../src/logger.js'));
    debugUtils = await import('../src/debug_utils.js');

    adapterMethods = {
        detectUserEmail: GeminiAdapter.detectUserEmail,
        getChatId: GeminiAdapter.getChatId,
        getChatLinkCount: GeminiAdapter.getChatLinkCount,
        scanSidebarChatLinks: GeminiAdapter.scanSidebarChatLinks,
    };
    loggerMethods = {
        debug: Logger.debug,
        export: Logger.export,
        info: Logger.info,
        warn: Logger.warn,
    };
});

beforeEach(() => {
    resetGm();
    configureCoreRuntime({ storage: coreStorage });
    installEnvironment();
    installDownloadGlobals();
    Object.assign(GeminiAdapter, adapterMethods);
    Object.assign(Logger, loggerMethods);
    Logger.debug = () => {};
    state.setCurrentUser(constants.TEMP_USER);
    state.setInspectingUser(constants.TEMP_USER);
    state.setCurrentTheme('glass');
    state.setStorageListenerId(null);
    Core._autoThemeQuery = null;
    Core._autoThemeHandler = null;
    Core._autoThemeObserver = null;
    Core._autoThemeRoots.clear();
    Core.invalidateSidebarCache();
    DOMWatcher.destroy();
    DOMWatcher.configure();
});

after(() => {
    Object.assign(GeminiAdapter, adapterMethods);
    Object.assign(Logger, loggerMethods);
    DOMWatcher.destroy();
    for (const name of GLOBAL_NAMES) restoreGlobal(name);
});

describe('direct ESM imports and pure factories', () => {
    it('loads constants without side effects and preserves the public constants contract', () => {
        assert.deepEqual(Object.keys(constants.THEMES), ['auto', 'glass', 'cyber', 'paper']);
        assert.equal(constants.THEMES.auto.vars, null);
        assert.equal(constants.THEME_COMPAT_ALIASES['--primer-bg'], '--bg');
        assert.equal(Object.isFrozen(constants.THEME_COMPAT_ALIASES), true);
        assert.equal(constants.GLOBAL_KEYS.REGISTRY, 'gemini_user_registry');
        assert.equal(constants.TIMINGS.OBSERVER_DEBOUNCE, 500);
        assert.equal(constants.QUOTA_COLORS.danger, '#ea4335');
        assert.equal(constants.VERSION, '13.0');
        assert.equal(constants.APP_NAME, 'Primer++ for Gemini™');
        assert.match(constants.TRADEMARK_NOTICE, /unofficial community extension/);
        assert.equal(constants.PANEL_ID, 'gemini-monitor-panel-v7');
        assert.deepEqual(constants.DEFAULT_POS, { top: '20px', left: 'auto', bottom: 'auto', right: '220px' });
        assert.equal(constants.TEMP_USER, 'Guest');
    });

    it('creates known, dotted, default-sized, and fallback icons directly against a tiny DOM', () => {
        const fallback = icons.createIcon('not-an-icon', 11);
        assert.deepEqual(fallback, { nodeType: 3, textContent: 'not-an-icon' });

        const menu = icons.createIcon(icons.ICON_NAMES.menu, 20);
        assert.equal(menu.tagName, 'svg');
        assert.equal(menu.getAttribute('width'), '20');
        assert.equal(menu.getAttribute('height'), '20');
        assert.equal(menu.children.length, 3);
        assert.equal(menu.children[0].getAttribute('d'), 'M4 12h16');
        assert.equal(menu.style.verticalAlign, 'middle');

        const palette = icons.createIcon(icons.ICON_NAMES.palette);
        assert.equal(palette.getAttribute('width'), '16');
        assert.equal(palette.children.filter(child => child.tagName === 'circle').length, 3);
        assert.equal(palette.children.at(-1).getAttribute('fill'), 'currentColor');
        assert.equal(icons.ICON_NAMES.compass, 'compass');
    });

    it('loads theme state only through an explicit storage port', () => {
        for (const storage of [null, {}, { get: true }]) {
            assert.throws(() => state.configureStateRuntime({ storage }), /storage port must implement/);
        }
        assert.equal(state.configureStateRuntime({ storage: {
            get(key, fallback) {
                assert.equal(key, constants.GLOBAL_KEYS.THEME);
                assert.equal(fallback, 'glass');
                return 'paper';
            }
        } }), 'paper');
        assert.equal(state.getCurrentTheme(), 'paper');
        assert.equal(state.configureStateRuntime({
            storage: { get() { throw new Error('blocked'); } }
        }), 'glass');
        assert.equal(state.getCurrentTheme(), 'glass');
    });
});

describe('Core shared API', () => {
    it('requires an explicit storage port before using the shared runtime', () => {
        for (const storage of [null, {}, { get() {}, set: true }]) {
            assert.throws(() => configureCoreRuntime({ storage }), /storage port must implement/);
        }
        assert.equal(configureCoreRuntime({ storage: coreStorage }), Core);
    });

    it('normalizes account registry state and keeps user accessors compatible', () => {
        Core.registerUser();
        Core.registerUser(constants.TEMP_USER);
        Core.registerUser('not-an-email');
        assert.equal(gm.values.has(constants.GLOBAL_KEYS.REGISTRY), false);

        gm.values.set(constants.GLOBAL_KEYS.REGISTRY, 'corrupt');
        Core.registerUser('first@example.com');
        assert.deepEqual(gm.values.get(constants.GLOBAL_KEYS.REGISTRY), ['first@example.com']);
        Core.registerUser('first@example.com');
        assert.deepEqual(gm.values.get(constants.GLOBAL_KEYS.REGISTRY), ['first@example.com']);

        gm.getErrors.add(constants.GLOBAL_KEYS.REGISTRY);
        gm.setErrors.add(constants.GLOBAL_KEYS.REGISTRY);
        assert.doesNotThrow(() => Core.registerUser('second@example.com'));
        assert.deepEqual(Core.getAllUsers(), []);
        gm.getErrors.clear();
        gm.values.set(constants.GLOBAL_KEYS.REGISTRY, { bad: true });
        assert.deepEqual(Core.getAllUsers(), []);
        gm.values.set(constants.GLOBAL_KEYS.REGISTRY, ['ok@example.com']);
        assert.deepEqual(Core.getAllUsers(), ['ok@example.com']);

        GeminiAdapter.detectUserEmail = () => 'detected@example.com';
        assert.equal(Core.detectUser(), 'detected@example.com');
        assert.equal(Core.getCurrentUser(), constants.TEMP_USER);
        Core.setInspectingUser('inspect@example.com');
        assert.equal(Core.getInspectingUser(), 'inspect@example.com');
        assert.equal(Core.getTempUser(), constants.TEMP_USER);
    });

    it('classifies host tokens and rendered backgrounds defensively', () => {
        assert.equal(Core._themeFromToken(), null);
        assert.equal(Core._themeFromToken('theme-dark'), 'glass');
        assert.equal(Core._themeFromToken('LIGHT_theme'), 'paper');
        assert.equal(Core._themeFromToken('light dark'), null);
        assert.equal(Core._themeFromToken('delightful'), null);

        assert.equal(Core._themeFromBackground('not-a-color'), null);
        assert.equal(Core._themeFromBackground(0), null);
        assert.equal(Core._themeFromBackground('rgba(1, 2, 3, 0.01)'), null);
        assert.equal(Core._themeFromBackground('rgba(1, 2, 3, .)'), null);
        assert.equal(Core._themeFromBackground('rgb(., 2, 3)'), null);
        assert.equal(Core._themeFromBackground('rgb(1, ., 3)'), null);
        assert.equal(Core._themeFromBackground('rgb(1, 2, .)'), null);
        assert.equal(Core._themeFromBackground('rgb(0, 0, 0)'), 'glass');
        assert.equal(Core._themeFromBackground('rgba(255 255 255 / 0.5)'), 'paper');

        assert.equal(Core._isPrimerThemeRoot(null), false);
        assert.equal(Core._isPrimerThemeRoot(fakeElement({ attrs: { 'data-primer-theme-root': 'true' } })), true);
        assert.equal(Core._isPrimerThemeRoot({ getAttribute() { throw new Error('bad node'); } }), false);
    });

    it('collects unique host candidates and tolerates partial DOMs', () => {
        const env = installEnvironment();
        const child = fakeElement({ parentElement: env.body });
        const primer = fakeElement({ attrs: { 'data-primer-theme-root': 'true' }, parentElement: env.body });
        const centre = fakeElement({ parentElement: child });
        env.body.children = [child, primer, child];
        env.document.elementFromPoint = () => centre;
        const candidates = Core._getHostThemeCandidates();
        assert.deepEqual(candidates, [env.html, env.body, child, centre]);

        env.document.body = null;
        env.document.elementFromPoint = undefined;
        assert.deepEqual(Core._getHostThemeCandidates(), [env.html]);

        env.document.body = env.body;
        env.document.elementFromPoint = () => null;
        env.window.innerWidth = 0;
        env.window.innerHeight = undefined;
        assert.deepEqual(Core._getHostThemeCandidates(), [env.html, env.body, child]);

        Object.defineProperty(env.document, 'body', {
            configurable: true,
            get() { throw new Error('body unavailable'); },
        });
        assert.deepEqual(Core._getHostThemeCandidates(), [env.html]);
    });

    it('prefers attributes, classes, metadata, computed schemes, and backgrounds in order', () => {
        const originalCandidates = Core._getHostThemeCandidates;
        const attr = fakeElement({ attrs: { 'data-theme': 'dark' } });
        Core._getHostThemeCandidates = () => [attr];
        assert.equal(Core._detectHostTheme(), 'glass');

        const classElement = fakeElement({ className: 'theme-light' });
        Core._getHostThemeCandidates = () => [classElement];
        assert.equal(Core._detectHostTheme(), 'paper');

        const classAttribute = fakeElement({ attrs: { class: 'dark_theme' } });
        classAttribute.className = { baseVal: 'dark_theme' };
        classAttribute.getAttribute = name => name === 'class' ? 'dark_theme' : null;
        Core._getHostThemeCandidates = () => [classAttribute];
        assert.equal(Core._detectHostTheme(), 'glass');

        const neutral = fakeElement();
        Core._getHostThemeCandidates = () => [neutral];
        document.querySelector = () => fakeElement({ attrs: { content: 'only light' } });
        assert.equal(Core._detectHostTheme(), 'paper');

        document.querySelector = () => { throw new Error('no metadata'); };
        neutral.computed.colorScheme = 'dark';
        assert.equal(Core._detectHostTheme(), 'glass');

        const throwing = fakeElement();
        const bright = fakeElement({ backgroundColor: 'rgb(250, 250, 250)' });
        Core._getHostThemeCandidates = () => [throwing, bright];
        window.getComputedStyle = element => {
            if (element === throwing) throw new Error('detached');
            return element.computed;
        };
        assert.equal(Core._detectHostTheme(), 'paper');

        bright.computed.backgroundColor = 'transparent';
        assert.equal(Core._detectHostTheme(), null);
        Core._getHostThemeCandidates = originalCandidates;
    });

    it('resolves, stores, and applies themes only to Primer-owned surfaces', () => {
        const env = installEnvironment({ bodyClass: 'dark-theme', mediaMatches: true });
        assert.equal(Core.resolveTheme('paper'), 'paper');
        assert.equal(Core.resolveTheme('auto'), 'glass');
        env.body.className = '';
        env.body.computed.backgroundColor = 'rgba(0, 0, 0, 0)';
        assert.equal(Core.resolveTheme('auto'), 'paper');
        env.window.matchMedia = () => ({ matches: false });
        assert.equal(Core.resolveTheme('auto'), 'glass');
        env.window.matchMedia = () => { throw new Error('unsupported'); };
        assert.equal(Core.resolveTheme('auto'), 'glass');

        const updates = [];
        const originalUpdate = Core._updateAutoListener;
        Core._updateAutoListener = key => updates.push(key);
        Core.setTheme('missing');
        Core.setTheme('cyber');
        assert.equal(Core.getTheme(), 'cyber');
        assert.deepEqual(updates, ['cyber']);
        gm.setErrors.add(constants.GLOBAL_KEYS.THEME);
        assert.doesNotThrow(() => Core.setTheme('paper'));
        assert.equal(Core.getTheme(), 'paper');
        assert.equal(Core.getThemes(), constants.THEMES);
        Core._updateAutoListener = originalUpdate;

        Core.applyTheme(null, 'paper');
        Core.applyTheme(env.html, 'paper');
        Core.applyTheme(env.body, 'paper');
        Core.applyTheme(env.panel, 'unknown');
        assert.equal(env.html._properties.size, 0);
        assert.equal(env.body._properties.size, 0);
        Core.applyTheme(env.panel, 'paper');
        assert.equal(env.panel.style.getPropertyValue('--primer-bg'), 'rgba(255, 255, 255, 0.88)');
        assert.equal(env.panel.style.getPropertyValue('--bg'), 'var(--primer-bg)');
        assert.equal(env.panel.style.getPropertyValue('color-scheme'), 'light');
        assert.equal(env.panel.getAttribute('data-primer-theme'), 'paper');

        env.document.querySelectorAll = selector => selector === '[data-primer-theme-root="true"]'
            ? [env.panel]
            : [];
        Core.setTheme('cyber');
        assert.equal(env.panel.getAttribute('data-primer-theme'), 'cyber');
        assert.equal(env.panel.style.getPropertyValue('color-scheme'), 'dark');
        env.document.querySelectorAll = () => { throw new Error('document unavailable'); };
        assert.doesNotThrow(() => Core.setTheme('paper'));

        constants.THEMES.testUnmapped = { name: 'test', vars: { '--unmapped': 'value' } };
        const styleOnly = { style: { setProperty() {} } };
        Core.applyTheme(styleOnly, 'testUnmapped');
        delete constants.THEMES.testUnmapped;

        env.body.className = 'dark-theme';
        Core.applyTheme(env.panel, 'auto');
        assert.equal(Core._autoThemeRoots.has(env.panel), true);
        Core.applyTheme(env.panel, 'glass');
        assert.equal(Core._autoThemeRoots.has(env.panel), false);

        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            get() { throw new Error('document unavailable'); },
        });
        const detachedHarnessElement = fakeElement();
        Core.applyTheme(detachedHarnessElement, 'glass');
        Object.defineProperty(globalThis, 'document', descriptor);
        assert.equal(detachedHarnessElement.getAttribute('data-primer-theme'), 'glass');
    });

    it('refreshes connected auto roots and drops stale roots', () => {
        const env = installEnvironment({ bodyClass: 'dark-theme' });
        const disconnected = fakeElement({ isConnected: false });
        Core._autoThemeRoots.set(null, 'auto');
        Core._autoThemeRoots.set(disconnected, 'auto');
        Core._autoThemeRoots.set(env.panel, 'auto');
        Core._refreshAutoThemeRoots();
        assert.equal(Core._autoThemeRoots.has(null), false);
        assert.equal(Core._autoThemeRoots.has(disconnected), false);
        assert.equal(env.panel.getAttribute('data-primer-theme'), 'glass');
    });

    it('observes host theme changes while excluding Primer-owned mutations', () => {
        const env = installEnvironment({ bodyClass: 'dark-theme' });
        delete globalThis.MutationObserver;
        Core._observeHostTheme();
        assert.equal(Core._autoThemeObserver, null);
        globalThis.MutationObserver = env.MutationObserver;

        let refreshes = 0;
        let retargets = 0;
        const originalRefresh = Core._refreshAutoThemeRoots;
        const originalTargets = Core._observeHostThemeTargets;
        Core._refreshAutoThemeRoots = () => { refreshes += 1; };
        Core._observeHostThemeTargets = function wrappedTargets() {
            retargets += 1;
            return originalTargets.call(this);
        };
        Core._observeHostTheme();
        assert.equal(env.observers.length, 1);
        const primer = fakeElement({ attrs: { 'data-primer-theme-root': 'true' } });
        env.observers[0].emit([{ target: primer, type: 'attributes' }]);
        env.observers[0].emit([{ target: env.body, type: 'attributes' }]);
        env.observers[0].emit([{ target: env.body, type: 'childList' }]);
        assert.equal(refreshes, 2);
        assert.ok(retargets >= 2);
        Core._refreshAutoThemeRoots = originalRefresh;
        Core._observeHostThemeTargets = originalTargets;

        const throwingTarget = fakeElement();
        throwingTarget.throwOnObserve = true;
        const originalCandidates = Core._getHostThemeCandidates;
        Core._autoThemeObserver = env.observers[0];
        Core._getHostThemeCandidates = () => [env.body, throwingTarget];
        assert.doesNotThrow(() => Core._observeHostThemeTargets());
        Core._autoThemeObserver = null;
        assert.doesNotThrow(() => Core._observeHostThemeTargets());
        Core._getHostThemeCandidates = originalCandidates;

        const originalTargetMethod = Core._observeHostThemeTargets;
        Core._observeHostThemeTargets = () => { throw new Error('target setup failed'); };
        Core._observeHostTheme();
        assert.equal(env.observers.at(-1).disconnected, true);
        assert.equal(Core._autoThemeObserver, null);
        Core._observeHostThemeTargets = originalTargetMethod;
    });

    it('replaces modern, legacy, stale, and unavailable auto-theme listeners safely', () => {
        const env = installEnvironment({ bodyClass: 'dark-theme' });
        let removed = 0;
        Core._autoThemeHandler = () => {};
        Core._autoThemeQuery = { removeEventListener() { removed += 1; } };
        Core._autoThemeObserver = { disconnect() { removed += 1; } };
        Core._updateAutoListener('paper');
        assert.equal(removed, 2);
        assert.equal(Core._autoThemeQuery, null);

        Core._autoThemeHandler = () => {};
        Core._autoThemeQuery = { removeListener() { removed += 1; } };
        Core._updateAutoListener('paper');
        assert.equal(removed, 3);

        Core._autoThemeHandler = () => {};
        Core._autoThemeQuery = { removeEventListener() { throw new Error('stale'); } };
        assert.doesNotThrow(() => Core._updateAutoListener('paper'));

        Core._updateAutoListener('auto');
        assert.equal(env.mediaListeners.size, 1);
        assert.equal(env.panel.getAttribute('data-primer-theme'), 'glass');
        env.media.emit();

        Core._updateAutoListener('paper');
        const legacy = {
            matches: true,
            addListener(handler) { this.handler = handler; },
            removeListener(handler) { if (this.handler === handler) this.handler = null; },
        };
        env.window.matchMedia = () => legacy;
        Core._updateAutoListener('auto');
        assert.equal(typeof legacy.handler, 'function');
        legacy.handler();

        Core._updateAutoListener('paper');
        env.window.matchMedia = () => { throw new Error('matchMedia failed'); };
        env.document.getElementById = () => null;
        Core._updateAutoListener('auto');
        env.document.getElementById = () => { throw new Error('panel lookup failed'); };
        assert.doesNotThrow(() => Core._updateAutoListener('auto'));
        Core._updateAutoListener('paper');
    });

    it('manages remote storage listeners and isolates listener failures', () => {
        state.setStorageListenerId(42);
        gm.listeners.set(42, { key: 'old' });
        Core.setupStorageListener(null, null);
        assert.equal(state.getStorageListenerId(), null);

        state.setStorageListenerId(43);
        gm.removeError = new Error('remove failed');
        Core.setupStorageListener(constants.TEMP_USER, null);
        assert.equal(state.getStorageListenerId(), null);
        gm.removeError = null;

        let received = null;
        Core.setupStorageListener('account@example.com', value => { received = value; });
        const [id, listener] = [...gm.listeners.entries()].at(-1);
        assert.equal(state.getStorageListenerId(), id);
        listener.callback('key', {}, { count: 1 }, false);
        listener.callback('key', {}, null, true);
        listener.callback('key', {}, { count: 2 }, true);
        assert.deepEqual(received, { count: 2 });

        Core.setupStorageListener('account@example.com', () => { throw new Error('consumer failed'); });
        [...gm.listeners.values()].at(-1).callback('key', {}, { count: 3 }, true);
        Core.setupStorageListener('account@example.com', null);
        [...gm.listeners.values()].at(-1).callback('key', {}, { count: 4 }, true);

        gm.addError = new Error('add failed');
        assert.doesNotThrow(() => Core.setupStorageListener('other@example.com', () => {}));

        configureCoreRuntime({ storage: { get() {}, set() {} } });
        Core.setupStorageListener('minimal@example.com', () => {});
        assert.equal(state.getStorageListenerId(), null);
        configureCoreRuntime({ storage: coreStorage });
    });

    it('caches sidebar scans only while every cache invariant remains true', () => {
        const originalNow = Date.now;
        let now = 10_000;
        let liveCount = 0;
        let scans = 0;
        let items = [];
        Date.now = () => now;
        GeminiAdapter.getChatLinkCount = () => liveCount;
        GeminiAdapter.scanSidebarChatLinks = () => {
            scans += 1;
            return items;
        };

        assert.deepEqual(Core.scanSidebarChats(), []);
        assert.equal(scans, 1);
        assert.deepEqual(Core.scanSidebarChats(), []);
        assert.equal(scans, 1);

        const connected = { element: { isConnected: true }, id: 'a' };
        items = [connected];
        liveCount = 1;
        assert.equal(Core.scanSidebarChats(), items);
        assert.equal(Core.scanSidebarChats(), items);
        connected.element.isConnected = false;
        assert.equal(Core.scanSidebarChats(), items);
        now += 2000;
        assert.equal(Core.scanSidebarChats(), items);
        liveCount = 2;
        assert.equal(Core.scanSidebarChats(), items);
        assert.equal(Core.scanSidebarChats(true), items);
        assert.ok(scans >= 6);

        Core.invalidateSidebarCache();
        assert.equal(Core._sidebarCache, null);
        assert.equal(Core._sidebarCacheTime, 0);
        Date.now = originalNow;
    });

    it('delegates route lookup, sleeps, and emits reset-aware local day keys', async () => {
        GeminiAdapter.getChatId = () => 'chat-123';
        assert.equal(Core.getChatId(), 'chat-123');
        await Core.sleep(0);
        assert.match(Core.getDayKey(0), /^\d{4}-\d{2}-\d{2}$/);
        assert.match(Core.getDayKey(24), /^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('DOMWatcher lifecycle', () => {
    it('validates and applies an injected attribute filter before observation', () => {
        for (const attributeFilter of [null, 'class', [1], ['']]) {
            assert.throws(
                () => DOMWatcher.configure({ attributeFilter }),
                /array of non-empty strings/
            );
        }
        assert.equal(DOMWatcher.configure({
            attributeFilter: ['class', 'data-state', 'class']
        }), DOMWatcher);
        const env = installEnvironment();
        DOMWatcher.init();
        assert.deepEqual(
            env.observers[0].observations[0].options.attributeFilter,
            ['class', 'data-state']
        );
        assert.throws(() => DOMWatcher.configure(), /after init/);
    });

    it('initializes once, isolates match errors, and coalesces callbacks', () => {
        const env = installEnvironment();
        const scheduled = new Map();
        let nextTimer = 1;
        const originalSetTimeout = globalThis.setTimeout;
        const originalClearTimeout = globalThis.clearTimeout;
        globalThis.setTimeout = callback => {
            const id = nextTimer++;
            scheduled.set(id, callback);
            return id;
        };
        globalThis.clearTimeout = id => scheduled.delete(id);

        let callbacks = 0;
        DOMWatcher.init();
        DOMWatcher.init();
        assert.equal(env.observers.length, 1);
        assert.equal(env.observers[0].observations.length, 1);
        DOMWatcher.register('throws', {
            callback() { callbacks += 100; },
            match() { throw new Error('bad matcher'); },
        });
        DOMWatcher.register('miss', { callback() { callbacks += 10; }, match: () => false });
        DOMWatcher.register('hit', { callback() { callbacks += 1; }, debounce: 5, match: () => true });
        env.observers[0].emit([{ type: 'attributes' }]);
        env.observers[0].emit([{ type: 'attributes' }]);
        assert.equal(scheduled.size, 1);
        [...scheduled.values()][0]();
        assert.equal(callbacks, 1);

        DOMWatcher.register('callback-throws', {
            callback() { throw new Error('isolated callback'); },
            match: () => true,
        });
        env.observers[0].emit([{ type: 'attributes' }]);
        for (const callback of [...scheduled.values()]) callback();
        assert.equal(callbacks, 2);

        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
    });

    it('invalidates stale debounce generations after unregister, replacement, and destroy', () => {
        const env = installEnvironment();
        const scheduled = [];
        const cleared = [];
        const originalSetTimeout = globalThis.setTimeout;
        const originalClearTimeout = globalThis.clearTimeout;
        globalThis.setTimeout = callback => {
            const token = { callback, id: scheduled.length + 1 };
            scheduled.push(token);
            return token;
        };
        globalThis.clearTimeout = token => { if (token) cleared.push(token); };

        let calls = 0;
        DOMWatcher.init();
        DOMWatcher.register('generation', { callback() { calls += 1; }, match: () => true });
        env.observers[0].emit([{}]);
        const stale = scheduled.at(-1);
        DOMWatcher._timers.generation = { newer: true };
        stale.callback();
        assert.equal(calls, 0);

        DOMWatcher._timers.generation = stale;
        DOMWatcher._handlers = [];
        stale.callback();
        assert.equal(calls, 0);

        DOMWatcher.register('self-unregister', {
            callback() { calls += 10; },
            match() {
                DOMWatcher.unregister('self-unregister');
                return true;
            },
        });
        env.observers[0].emit([{}]);
        assert.equal(scheduled.length, 1);

        DOMWatcher.register('destroyed', { callback() { calls += 100; }, match: () => true });
        env.observers[0].emit([{}]);
        const pending = scheduled.at(-1);
        DOMWatcher.destroy();
        pending.callback();
        assert.equal(calls, 0);
        assert.equal(env.observers[0].disconnected, true);
        assert.ok(cleared.length >= 1);
        DOMWatcher.destroy();

        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
    });
});

describe('debug utilities', () => {
    function spyLogger() {
        const calls = [];
        Logger.info = (message, data) => calls.push({ data, level: 'info', message });
        Logger.warn = (message, data) => calls.push({ data, level: 'warn', message });
        return calls;
    }

    it('lists and masks storage keys, including missing and failed GM APIs', () => {
        const loggerCalls = spyLogger();
        const logs = [];
        const original = { group: console.group, groupEnd: console.groupEnd, log: console.log };
        console.group = (...args) => logs.push(['group', ...args]);
        console.log = (...args) => logs.push(['log', ...args]);
        console.groupEnd = () => logs.push(['end']);
        gm.listValues = ['', 'plain', 'gemini_store_person@example.com', 'gemini_other'];
        debugUtils.debugDumpStorageKeys();
        assert.match(JSON.stringify(logs), /g\*\*\*@e\*\*\*\.com/);
        assert.equal(loggerCalls.at(-1).data.count, 4);

        delete globalThis.GM_listValues;
        debugUtils.debugDumpStorageKeys();
        assert.equal(loggerCalls.at(-1).data.count, 0);
        installGmGlobals();
        gm.listError = new Error('list failed');
        debugUtils.debugDumpStorageKeys();
        assert.equal(loggerCalls.at(-1).level, 'warn');

        gm.listError = null;
        console.group = () => { throw new Error('console failed'); };
        debugUtils.debugDumpStorageKeys();
        assert.equal(loggerCalls.at(-1).level, 'warn');
        Object.assign(console, original);
    });

    it('masks detected, current, fallback, and absent user identities', () => {
        const loggerCalls = spyLogger();
        const logs = [];
        const original = { group: console.group, groupEnd: console.groupEnd, log: console.log };
        console.group = () => {};
        console.groupEnd = () => {};
        console.log = (...args) => logs.push(args);
        const originalDetect = Core.detectUser;
        const originalCurrent = Core.getCurrentUser;
        Core.detectUser = () => 'alice@example.com';
        Core.getCurrentUser = () => 'current@example.org';
        debugUtils.debugShowDetectedUser();
        assert.match(JSON.stringify(logs), /a\*\*\*@e\*\*\*\.com/);

        Core.detectUser = () => null;
        Core.getCurrentUser = () => 'Guest';
        debugUtils.debugShowDetectedUser();
        Core.getCurrentUser = () => null;
        debugUtils.debugShowDetectedUser();
        assert.equal(loggerCalls.filter(call => call.level === 'info').length, 3);

        Core.detectUser = () => { throw new Error('adapter failed'); };
        debugUtils.debugShowDetectedUser();
        assert.equal(loggerCalls.at(-1).level, 'warn');
        Core.detectUser = originalDetect;
        Core.getCurrentUser = originalCurrent;
        Object.assign(console, original);
    });

    it('exports full and legacy storage with per-key errors and download cleanup', () => {
        const loggerCalls = spyLogger();
        const env = installEnvironment();
        const downloads = installDownloadGlobals();
        gm.listValues = ['alpha', 'broken'];
        gm.values.set('alpha', { ok: true });
        gm.getErrors.add('broken');
        debugUtils.debugExportAllStorage();
        assert.equal(env.appended[0].download, 'gemini_storage_export.json');
        assert.equal(env.appended[0].clicked, true);
        assert.equal(env.appended[0].removed, true);
        assert.equal(downloads.urls[0].revoked, true);
        assert.match(downloads.blobs[0].parts[0], /get failed: broken/);

        delete globalThis.GM_listValues;
        debugUtils.debugExportAllStorage();
        installGmGlobals();

        gm.getErrors.add('gemini_count_session');
        debugUtils.debugExportLegacyData();
        assert.equal(env.appended.at(-1).download, 'gemini_legacy_export.json');
        assert.match(downloads.blobs.at(-1).parts[0], /get failed: gemini_count_session/);

        globalThis.Blob = class { constructor() { throw new Error('blob failed'); } };
        debugUtils.debugExportAllStorage();
        debugUtils.debugExportLegacyData();
        assert.equal(loggerCalls.at(-1).level, 'warn');
    });

    it('exports logs and adapter probes, and reports unavailable bridges', () => {
        const loggerCalls = spyLogger();
        const env = installEnvironment();
        const downloads = installDownloadGlobals();
        Logger.export = () => ({ entries: [{ message: 'ok' }] });
        debugUtils.debugExportLogs();
        assert.equal(env.appended.at(-1).download, 'gemini_logs_export.json');

        delete env.window.__PRIMER_PP_GET_PROBE_REPORT__;
        debugUtils.debugExportAdapterProbe();
        assert.equal(loggerCalls.at(-1).level, 'warn');
        env.window.__PRIMER_PP_GET_PROBE_REPORT__ = () => ({ ready: true });
        debugUtils.debugExportAdapterProbe();
        assert.equal(env.appended.at(-1).download, 'primer_pp_adapter_probe.json');
        assert.equal(downloads.urls.at(-1).revoked, true);

        Logger.export = () => { throw new Error('export failed'); };
        debugUtils.debugExportLogs();
        env.window.__PRIMER_PP_GET_PROBE_REPORT__ = () => { throw new Error('probe failed'); };
        debugUtils.debugExportAdapterProbe();
        assert.equal(loggerCalls.at(-1).level, 'warn');
    });

    it('dumps selected Gemini stores while isolating individual and outer failures', () => {
        const loggerCalls = spyLogger();
        const output = [];
        const original = {
            group: console.group,
            groupEnd: console.groupEnd,
            log: console.log,
            warn: console.warn,
        };
        console.group = () => {};
        console.groupEnd = () => {};
        console.log = (...args) => output.push(['log', ...args]);
        console.warn = (...args) => output.push(['warn', ...args]);
        gm.listValues = ['other', 'gemini_store_alice@example.com', 'gemini_folders_data', 'gemini_misc'];
        gm.values.set('gemini_misc', 1);
        gm.getErrors.add('gemini_folders_data');
        debugUtils.debugDumpGeminiStores();
        assert.equal(output.some(entry => entry[0] === 'warn'), true);
        assert.match(JSON.stringify(output), /g\*\*\*@e\*\*\*\.com/);

        delete globalThis.GM_listValues;
        debugUtils.debugDumpGeminiStores();
        installGmGlobals();
        gm.listError = new Error('list failed');
        debugUtils.debugDumpGeminiStores();
        assert.equal(loggerCalls.at(-1).level, 'warn');
        Object.assign(console, original);
    });
});

describe('production main entry coverage', () => {
    it('boots the real composition entry and releases its public lifecycle', async () => {
        const names = [
            'document', 'window', 'navigator', 'location', 'history', 'MutationObserver',
            'getComputedStyle', 'MouseEvent', 'InputEvent', 'GM_getValue', 'GM_setValue',
            'GM_listValues', 'GM_addValueChangeListener', 'GM_removeValueChangeListener',
            'GM_addStyle', 'GM_registerMenuCommand', '__flushGMPolyfill'
        ];
        const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
        const install = (name, value) => Object.defineProperty(globalThis, name, {
            configurable: true, writable: true, value
        });
        const { document, window } = createFakeDom();
        document.title = 'Primer main coverage fixture';
        document.visibilityState = 'hidden';
        window.location = {
            href: 'https://gemini.google.com/app/main-coverage',
            origin: 'https://gemini.google.com',
            pathname: '/app/main-coverage',
            reload() {}
        };
        window.history = { pushState() {}, replaceState() {} };
        window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
        window.getComputedStyle = () => ({
            position: 'static', backgroundColor: 'rgb(255, 255, 255)', colorScheme: 'light'
        });
        const navigator = { language: 'en-US' };
        window.navigator = navigator;
        class FixtureMutationObserver {
            observe() {}
            disconnect() {}
            takeRecords() { return []; }
        }

        install('document', document);
        install('window', window);
        install('navigator', navigator);
        install('location', window.location);
        install('history', window.history);
        install('MutationObserver', FixtureMutationObserver);
        install('getComputedStyle', window.getComputedStyle);
        install('MouseEvent', FakeEvent);
        install('InputEvent', FakeEvent);
        install('GM_getValue', (_key, fallback) => fallback);
        install('GM_setValue', () => undefined);
        install('GM_listValues', () => []);
        install('GM_addValueChangeListener', () => 1);
        install('GM_removeValueChangeListener', () => undefined);
        install('GM_addStyle', () => null);
        const menuCommands = [];
        install('GM_registerMenuCommand', (label, handler) => {
            menuCommands.push({ label, handler });
            return menuCommands.length;
        });
        install('__flushGMPolyfill', () => Promise.resolve());

        let restoreRuntime = () => {};
        try {
            const [
                { ModuleRegistry },
                { PanelUI },
                { NativeUI },
                { CounterModule },
                { PromptVaultModule }
            ] = await Promise.all([
                import('../src/module_registry.js'),
                import('../src/panel_ui.js'),
                import('../src/native_ui.js'),
                import('../src/modules/counter.js'),
                import('../src/modules/prompt_vault.js')
            ]);
            const originalModuleInit = ModuleRegistry.init;
            const originalIsReady = GeminiAdapter.isReady;
            const originalDetectUser = Core.detectUser;
            const originalLoggerError = Logger.error;
            const originalLoggerInfo = Logger.info;
            const originalShowToast = NativeUI.showToast;
            const originalPanelCreate = PanelUI.create;
            const originalCounterSaveData = CounterModule.saveData;
            restoreRuntime = () => {
                ModuleRegistry.init = originalModuleInit;
                GeminiAdapter.isReady = originalIsReady;
                Core.detectUser = originalDetectUser;
                Logger.error = originalLoggerError;
                Logger.info = originalLoggerInfo;
                NativeUI.showToast = originalShowToast;
                PanelUI.create = originalPanelCreate;
                CounterModule.saveData = originalCounterSaveData;
            };

            const errors = [];
            const infos = [];
            const toasts = [];
            Logger.error = (message, details) => errors.push({ message, details });
            Logger.info = (message, details) => infos.push({ message, details });
            NativeUI.showToast = (message, duration) => {
                toasts.push({ duration, message });
                return message;
            };
            GeminiAdapter.isReady = () => true;

            const startupFailure = new Error('expected top-level startup failure');
            ModuleRegistry.init = () => Promise.reject(startupFailure);
            const main = await import('../src/main.js');
            for (let attempt = 0; attempt < 50 && !errors.some(entry => entry.message === 'Primer++ startup failed'); attempt += 1) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
            assert.equal(
                errors.some(entry => entry.message === 'Primer++ startup failed' && entry.details === startupFailure),
                true
            );
            ModuleRegistry.init = originalModuleInit;

            let panelCreates = 0;
            PanelUI.create = function (...args) {
                panelCreates += 1;
                return originalPanelCreate.apply(this, args);
            };
            const application = await main.startPrimer();
            for (let attempt = 0; attempt < 50 && panelCreates === 0; attempt += 1) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
            assert.ok(panelCreates > 0, 'readiness invokes the production onReady callback');

            assert.equal(typeof main.startPrimer, 'function');
            assert.equal(typeof main.stopPrimer, 'function');
            assert.equal(typeof window.__PRIMER_PP_GET_PROBE_REPORT__, 'function');
            assert.equal(window.__PRIMER_PP_START__, main.startPrimer);
            assert.equal(window.__PRIMER_PP_STOP__, main.stopPrimer);
            assert.deepEqual(menuCommands.map(command => command.label), [
                '🧰 Debug: Export Adapter Probe',
                '🔄 Reset Position'
            ]);

            const panelGuard = DOMWatcher._handlers.find(handler => handler.id === 'panel-guard');
            assert.ok(panelGuard);
            const beforePanelGuard = panelCreates;
            panelGuard.callback();
            assert.equal(panelCreates, beforePanelGuard + 1);

            assert.equal(PromptVaultModule._capabilities.notifications.show('wired notification'), 'wired notification');
            assert.equal(PanelUI.announce('wired announcement', { duration: 321 }), 'wired announcement');
            assert.equal(toasts.some(entry => entry.message === 'wired announcement' && entry.duration === 321), true);
            assert.equal(PromptVaultModule._capabilities.shell.openModule('missing-module'), false);

            install('GM_setValue', () => { throw new Error('reset persistence failed'); });
            const resetCommand = menuCommands.find(command => command.label === '🔄 Reset Position');
            assert.equal(await resetCommand.handler(), false);
            assert.equal(errors.some(entry => entry.message === 'Position reset failed'), true);
            assert.equal(toasts.some(entry => /Position reset failed/.test(entry.message)), true);

            state.setCurrentUser(constants.TEMP_USER);
            state.setInspectingUser(constants.TEMP_USER);
            Object.assign(CounterModule.state, {
                total: 2,
                totalChatsCreated: 1,
                chats: { guest: 2 },
                dailyCounts: {
                    '2026-08-01': {
                        messages: 2,
                        chats: 1,
                        byModel: { flash: 2, thinking: 0, pro: 0 }
                    }
                }
            });
            Core.detectUser = () => 'coverage-user@example.test';
            CounterModule.saveData = () => Promise.resolve(true);
            await application._poll();
            assert.equal(state.getCurrentUser(), 'coverage-user@example.test');
            assert.equal(infos.some(entry => /Merged 2 messages/.test(entry.message)), true);
            assert.equal(errors.some(entry => entry.message === 'lazyDetect error'), false);

            const stopped = await main.stopPrimer('main coverage complete');
            assert.equal(window.__PRIMER_PP_GET_PROBE_REPORT__().lifecycle, 'stopped');
            assert.equal(await main.stopPrimer('already stopped'), stopped);
        } finally {
            try {
                await window.__PRIMER_PP_STOP__?.('main coverage cleanup');
            } finally {
                restoreRuntime();
                for (const [name, descriptor] of [...previous].reverse()) {
                    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
                    else delete globalThis[name];
                }
            }
        }
    });
});
