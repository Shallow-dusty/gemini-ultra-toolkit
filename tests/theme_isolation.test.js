const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const savedGlobals = new Map();
for (const key of ['document', 'window', 'MutationObserver', 'GM_getValue', 'GM_setValue', 'GM_addStyle']) {
    savedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
}

function restoreGlobals() {
    for (const [key, descriptor] of savedGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
    }
}

function fakeElement({ className = '', colorScheme = 'normal', backgroundColor = 'rgba(0, 0, 0, 0)' } = {}) {
    const attrs = new Map();
    const properties = new Map();
    return {
        className,
        children: [],
        parentElement: null,
        isConnected: true,
        computed: { colorScheme, backgroundColor },
        style: {
            setProperty(name, value) { properties.set(name, value); },
            getPropertyValue(name) { return properties.get(name) || ''; }
        },
        getAttribute(name) {
            if (name === 'class') return this.className;
            return attrs.get(name) ?? null;
        },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        _attrs: attrs,
        _properties: properties
    };
}

function createEnvironment({
    bodyClass = '',
    bodyScheme = 'normal',
    bodyBackground = 'rgba(0, 0, 0, 0)',
    mediaMatches = false
} = {}) {
    const html = fakeElement();
    const body = fakeElement({
        className: bodyClass,
        colorScheme: bodyScheme,
        backgroundColor: bodyBackground
    });
    body.parentElement = html;
    html.children = [body];
    const panel = fakeElement();
    panel.parentElement = body;
    const observers = [];
    const mediaListeners = new Set();
    const media = {
        matches: mediaMatches,
        addEventListener(name, handler) { if (name === 'change') mediaListeners.add(handler); },
        removeEventListener(name, handler) { if (name === 'change') mediaListeners.delete(handler); },
        emit() { for (const handler of mediaListeners) handler({ matches: this.matches }); }
    };

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.observations = [];
            this.disconnected = false;
            observers.push(this);
        }
        observe(target, options) { this.observations.push({ target, options }); }
        disconnect() { this.disconnected = true; }
        emit(mutations) { this.callback(mutations); }
    }

    globalThis.document = {
        documentElement: html,
        body,
        elementFromPoint: () => body,
        querySelector: () => null,
        getElementById: () => panel
    };
    globalThis.window = {
        innerWidth: 1280,
        innerHeight: 720,
        getComputedStyle: element => element.computed,
        matchMedia: () => media
    };
    globalThis.MutationObserver = FakeMutationObserver;
    globalThis.GM_getValue = (_key, fallback) => fallback;
    globalThis.GM_setValue = () => {};

    return { html, body, panel, observers, media, mediaListeners };
}

function importSource(relativePath) {
    return import(pathToFileURL(path.join(root, relativePath)).href);
}

let loadedCore;
async function loadCore() {
    loadedCore ??= await importSource('src/core.js');
    return loadedCore;
}

afterEach(() => {
    loadedCore?.Core._updateAutoListener('paper');
    loadedCore?.Core._autoThemeRoots.clear();
    restoreGlobals();
});

describe('Primer++ theme isolation', () => {
    it('prefers Gemini body theme signals and keeps every variable off html/body', async () => {
        const env = createEnvironment({
            bodyClass: 'dark-theme theme-host variable-context zero-state-theme',
            bodyScheme: 'dark',
            bodyBackground: 'rgb(0, 0, 0)',
            mediaMatches: true
        });
        const { Core } = await loadCore();

        assert.equal(Core.resolveTheme('auto'), 'glass', 'Gemini dark theme must beat light OS preference');
        Core.applyTheme(env.panel, 'auto');

        assert.match(env.panel.style.getPropertyValue('--primer-bg'), /^rgba\(32, 33, 36/);
        assert.equal(env.panel.style.getPropertyValue('--bg'), 'var(--primer-bg)');
        assert.equal(env.panel.style.getPropertyValue('color-scheme'), 'dark');
        assert.equal(env.panel.getAttribute('data-primer-theme'), 'glass');
        assert.equal(env.html._properties.size, 0);
        assert.equal(env.body._properties.size, 0);

        Core.applyTheme(env.html, 'paper');
        Core.applyTheme(env.body, 'paper');
        assert.equal(env.html._properties.size, 0, 'documentElement must remain untouched');
        assert.equal(env.body._properties.size, 0, 'body must remain untouched');
    });

    it('tracks Gemini host changes while treating matchMedia as fallback only', async () => {
        const env = createEnvironment({
            bodyClass: 'dark-theme theme-host',
            bodyScheme: 'dark',
            bodyBackground: 'rgb(0, 0, 0)',
            mediaMatches: true
        });
        const { Core } = await loadCore();

        Core._updateAutoListener('auto');
        assert.equal(env.panel.getAttribute('data-primer-theme'), 'glass');
        assert.equal(env.observers.length, 1);

        env.body.className = 'light-theme theme-host variable-context';
        env.body.computed.colorScheme = 'light';
        env.body.computed.backgroundColor = 'rgb(255, 255, 255)';
        env.observers[0].emit([{ type: 'attributes', target: env.body, attributeName: 'class' }]);
        assert.equal(env.panel.getAttribute('data-primer-theme'), 'paper');
        assert.match(env.panel.style.getPropertyValue('--primer-bg'), /^rgba\(255, 255, 255/);

        env.media.matches = false;
        env.media.emit();
        assert.equal(
            env.panel.getAttribute('data-primer-theme'),
            'paper',
            'OS dark preference must not override an explicit light Gemini host'
        );

        env.body.className = 'theme-host variable-context';
        env.body.computed.colorScheme = 'normal';
        env.body.computed.backgroundColor = 'rgba(0, 0, 0, 0)';
        env.observers[0].emit([{ type: 'attributes', target: env.body, attributeName: 'class' }]);
        assert.equal(env.panel.getAttribute('data-primer-theme'), 'glass', 'matchMedia is used after host signals vanish');

        Core._updateAutoListener('paper');
        assert.equal(env.observers[0].disconnected, true);
        assert.equal(env.mediaListeners.size, 0);
    });

    it('uses computed color-scheme before rendered background, then background before the OS', async () => {
        const env = createEnvironment({
            bodyScheme: 'light',
            bodyBackground: 'rgb(0, 0, 0)',
            mediaMatches: false
        });
        const { Core } = await loadCore();

        assert.equal(Core.resolveTheme('auto'), 'paper');
        env.body.computed.colorScheme = 'normal';
        env.body.computed.backgroundColor = 'rgb(250, 250, 250)';
        assert.equal(Core.resolveTheme('auto'), 'paper');
        env.body.computed.backgroundColor = 'rgb(18, 18, 18)';
        assert.equal(Core.resolveTheme('auto'), 'glass');
    });

    it('keeps native injections host-adaptive in both light and dark modes', async () => {
        let css = '';
        const { injectNativeUIStyles } = await importSource('src/native_ui_styles.js');
        injectNativeUIStyles(value => { css = value; });

        assert.match(css, /--gem-sys-color--on-surface/);
        assert.match(css, /--mat-sys-on-surface/);
        assert.match(css, /color-scheme:\s*inherit/);
        assert.match(css, /outline:\s*2px solid var\(--primer-native-accent\)/);
        assert.match(css, /background:\s*var\(--primer-native-hover\)/);
        assert.doesNotMatch(css, /var\(--bg|var\(--text-main|var\(--border/);
        assert.doesNotMatch(css, /#e8eaed|#9aa0a6|#8ab4f8|#303134|#fff\b/i);

        const constants = fs.readFileSync(path.join(root, 'src/constants.js'), 'utf8');
        const themeBlock = constants.slice(0, constants.indexOf('// --- Global storage keys ---'));
        assert.doesNotMatch(themeBlock, /^\s*'--(?:bg|accent|text-main|border)'\s*:/m);
        assert.match(themeBlock, /'--primer-bg'/);
    });
});
