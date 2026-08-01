const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { afterEach, before, beforeEach, describe, it } = require('node:test');

const rootDir = path.resolve(__dirname, '..');

class FakeEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.key = init.key;
        this.shiftKey = Boolean(init.shiftKey);
        this.target = init.target || null;
        this.currentTarget = null;
        this.defaultPrevented = false;
        this.propagationStopped = false;
    }

    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
}

class FakeEventTarget {
    constructor() { this._listeners = new Map(); }

    addEventListener(type, listener) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) { this._listeners.get(type)?.delete(listener); }

    dispatchEvent(event) {
        if (!event.target) event.target = this;
        event.currentTarget = this;
        for (const listener of [...(this._listeners.get(event.type) || [])]) listener.call(this, event);
        return !event.defaultPrevented;
    }

    listenerCount(type) { return this._listeners.get(type)?.size || 0; }
}

class FakeStyle {
    constructor() {
        this.cssText = '';
        this._properties = new Map();
    }

    setProperty(name, value) {
        this._properties.set(String(name), String(value));
    }

    getPropertyValue(name) { return this._properties.get(String(name)) || ''; }
}

class FakeClassList {
    constructor(element) { this.element = element; }

    _values() { return this.element.className.split(/\s+/).filter(Boolean); }
    contains(value) { return this._values().includes(value); }
    add(...values) { this.element.className = [...new Set([...this._values(), ...values])].join(' '); }
    remove(...values) {
        const removed = new Set(values);
        this.element.className = this._values().filter(value => !removed.has(value)).join(' ');
    }
}

class FakeElement extends FakeEventTarget {
    constructor(tagName, ownerDocument) {
        super();
        this.nodeType = 1;
        this.tagName = String(tagName).toUpperCase();
        this.ownerDocument = ownerDocument;
        this.parentNode = null;
        this.children = [];
        this.attributes = new Map();
        this.className = '';
        this.classList = new FakeClassList(this);
        this.style = new FakeStyle();
        this.id = '';
        this.disabled = false;
        this.hidden = false;
        this.inert = false;
        this.onclick = null;
        this._tabIndex = null;
        this._textContent = '';
    }

    get firstChild() { return this.children[0] || null; }
    get childNodes() { return this.children; }
    get textContent() {
        return this.children.length > 0
            ? this.children.map(child => child.textContent).join('')
            : this._textContent;
    }
    set textContent(value) {
        for (const child of this.children) child.parentNode = null;
        this.children = [];
        this._textContent = String(value ?? '');
    }
    get tabIndex() {
        if (this._tabIndex !== null) return this._tabIndex;
        return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(this.tagName) ? 0 : -1;
    }
    set tabIndex(value) { this._tabIndex = Number(value); }
    get isConnected() {
        let current = this;
        while (current) {
            if (current === this.ownerDocument) return true;
            current = current.parentNode;
        }
        return false;
    }

    setAttribute(name, value) {
        const normalized = String(name);
        this.attributes.set(normalized, String(value));
        if (normalized === 'id') this.id = String(value);
        if (normalized === 'class') this.className = String(value);
    }

    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) {
        this.attributes.delete(name);
        if (name === 'id') this.id = '';
        if (name === 'class') this.className = '';
    }

    append(...nodes) {
        for (const node of nodes) {
            node.parentNode?.removeChild?.(node);
            node.parentNode = this;
            this.children.push(node);
        }
    }

    appendChild(node) { this.append(node); return node; }
    removeChild(node) {
        const index = this.children.indexOf(node);
        if (index !== -1) this.children.splice(index, 1);
        node.parentNode = null;
        return node;
    }
    remove() { this.parentNode?.removeChild?.(this); }
    contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
    focus() { this.ownerDocument.activeElement = this; }
    click() {
        if (this.disabled) return;
        const event = new FakeEvent('click', { target: this });
        if (typeof this.onclick === 'function') this.onclick(event);
        this.dispatchEvent(event);
    }

    _descendants() { return this.children.flatMap(child => [child, ...child._descendants()]); }
    _matchesSingle(selector) {
        const value = selector.trim();
        if (value.startsWith('#')) return this.id === value.slice(1);
        if (value.startsWith('.')) return this.classList.contains(value.slice(1));
        if (value === 'a[href]') return this.tagName === 'A' && this.hasAttribute('href');
        if (value === 'button:not([disabled])') return this.tagName === 'BUTTON' && !this.disabled;
        if (value === 'input:not([disabled])') return this.tagName === 'INPUT' && !this.disabled;
        if (value === 'select:not([disabled])') return this.tagName === 'SELECT' && !this.disabled;
        if (value === 'textarea:not([disabled])') return this.tagName === 'TEXTAREA' && !this.disabled;
        if (value === '[tabindex]:not([tabindex="-1"])') return this._tabIndex !== null && this.tabIndex !== -1;
        const attribute = value.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
        if (attribute) {
            return this.hasAttribute(attribute[1])
                && (attribute[2] === undefined || this.getAttribute(attribute[1]) === attribute[2]);
        }
        return this.tagName === value.toUpperCase();
    }

    querySelectorAll(selector) {
        const selectors = String(selector).split(',');
        return this._descendants().filter(node => selectors.some(candidate => node._matchesSingle(candidate)));
    }

    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeDocument extends FakeEventTarget {
    constructor() {
        super();
        this.nodeType = 9;
        this.ownerDocument = this;
        this.documentElement = new FakeElement('html', this);
        this.documentElement.parentNode = this;
        this.body = new FakeElement('body', this);
        this.documentElement.appendChild(this.body);
        this.activeElement = this.body;
    }

    createElement(tagName) { return new FakeElement(tagName, this); }
    contains(node) { return node === this || this.documentElement.contains(node); }
    querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
    querySelector(selector) { return this.documentElement.querySelector(selector); }
    getElementById(id) { return this.querySelector(`#${id}`); }
}

function createScheduler() {
    let nextId = 1;
    const tasks = new Map();
    const scheduled = [];
    const cleared = [];
    return {
        tasks,
        scheduled,
        cleared,
        setTimeout(callback, delay) {
            const id = nextId++;
            tasks.set(id, { callback, delay });
            scheduled.push({ id, delay });
            return id;
        },
        clearTimeout(id) {
            cleared.push(id);
            tasks.delete(id);
        },
        run(id) {
            const task = tasks.get(id);
            assert.ok(task, `timer ${id} must exist`);
            tasks.delete(id);
            task.callback();
        },
        runNext() {
            const id = tasks.keys().next().value;
            assert.notEqual(id, undefined, 'a pending timer must exist');
            this.run(id);
            return id;
        }
    };
}

function withTimers(scheduler, callback) {
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    const restore = () => {
        globalThis.setTimeout = previousSetTimeout;
        globalThis.clearTimeout = previousClearTimeout;
    };
    globalThis.setTimeout = scheduler.setTimeout.bind(scheduler);
    globalThis.clearTimeout = scheduler.clearTimeout.bind(scheduler);
    try {
        const result = callback();
        if (result && typeof result.finally === 'function') return result.finally(restore);
        restore();
        return result;
    } catch (error) {
        restore();
        throw error;
    }
}

Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
});

let NativeUI;
let configureNativeUIRuntime;
let injectNativeUIStyles;
let ModuleRegistry;
let Core;
let GeminiAdapter;
let Logger;
let originalApplyTheme;
let originalWarn;
let originalAdapterMethods;
let documentRef;

const adapterNames = ['getSidebar', 'getInputArea', 'getChatHeader', 'getModelSwitch'];

function resetNativeUI() {
    if (!NativeUI) return;
    try { NativeUI._dialogManager?.destroy(); } catch {}
    NativeUI._dialogPortal?.remove?.();
    NativeUI._toastRegion?.remove?.();
    NativeUI._dialogManager = null;
    NativeUI._dialogPortal = null;
    NativeUI._dialogDocument = null;
    NativeUI._dialogs.clear();
    NativeUI._toastRegion = null;
    NativeUI._activeTour = null;
    NativeUI._dirtyModules.clear();
    NativeUI._retryCount = {};
    NativeUI._retryTimer = null;
    NativeUI.isZH = false;
    ModuleRegistry.enabledModules.clear();
    ModuleRegistry.modules = {};
    Core.applyTheme = originalApplyTheme;
    Logger.warn = originalWarn;
    for (const name of adapterNames) GeminiAdapter[name] = originalAdapterMethods[name];
}

describe('NativeUI real-source behavior', () => {
    before(async () => {
        const bootstrapScheduler = createScheduler();
        await withTimers(bootstrapScheduler, async () => {
            ({ NativeUI, configureNativeUIRuntime } = await import(
                pathToFileURL(path.join(rootDir, 'src', 'native_ui.js')).href
            ));
            ({ injectNativeUIStyles } = await import(pathToFileURL(path.join(rootDir, 'src', 'native_ui_styles.js')).href));
            ({ ModuleRegistry } = await import(pathToFileURL(path.join(rootDir, 'src', 'module_registry.js')).href));
            ({ Core } = await import(pathToFileURL(path.join(rootDir, 'src', 'core.js')).href));
            ({ GeminiAdapter } = await import(pathToFileURL(path.join(rootDir, 'src', 'adapters', 'gemini.js')).href));
            ({ Logger } = await import(pathToFileURL(path.join(rootDir, 'src', 'logger.js')).href));
        });
        originalApplyTheme = Core.applyTheme;
        originalWarn = Logger.warn;
        originalAdapterMethods = Object.fromEntries(adapterNames.map(name => [name, GeminiAdapter[name]]));
    });

    beforeEach(() => {
        resetNativeUI();
        documentRef = new FakeDocument();
        globalThis.document = documentRef;
        delete globalThis.requestAnimationFrame;
        delete globalThis.GM_addStyle;
    });

    afterEach(() => {
        resetNativeUI();
        delete globalThis.GM_addStyle;
        delete globalThis.requestAnimationFrame;
    });

    it('derives compatibility translation from one observable LocaleStore and injects the complete stylesheet', () => {
        const changes = [];
        const unsubscribe = NativeUI.subscribeLocale(snapshot => changes.push(snapshot));
        assert.equal(NativeUI.getLocale(), 'en');
        assert.equal(NativeUI.t('中文', 'English'), 'English');
        assert.equal(NativeUI.setLocale('zh-cn'), true);
        assert.equal(NativeUI.getLocale(), 'zh-CN');
        assert.equal(NativeUI.setLocale('zh-CN'), false);
        assert.equal(changes.length, 1);
        assert.equal(changes[0].previousLocale, 'en');
        assert.equal(changes[0].locale, 'zh-CN');
        assert.equal(NativeUI.t('中文', 'English'), '中文');
        unsubscribe();
        NativeUI.isZH = false;
        assert.equal(NativeUI.getLocale(), 'en');
        assert.equal(changes.length, 1);
        NativeUI.isZH = true;
        assert.equal(NativeUI.t('中文', 'English'), '中文');
        assert.throws(() => NativeUI.setLocale(''), /non-empty string/);
        assert.throws(() => NativeUI.subscribeLocale(null), /listener must be a function/);

        const styles = [];
        assert.throws(() => injectNativeUIStyles(), /addStyle port/);
        const css = injectNativeUIStyles(value => styles.push(value));
        assert.equal(css, styles[0]);
        assert.equal(styles.length, 1);
        assert.match(styles[0], /--primer-native-accent/);
        assert.match(styles[0], /\.gc-toast\.visible/);
        assert.match(styles[0], /prefers-reduced-motion/);
    });

    it('loads and persists the locale through the explicit platform storage port', () => {
        assert.throws(() => configureNativeUIRuntime(), /must implement get/);
        assert.throws(() => configureNativeUIRuntime({ storage: { get() {}, set: true } }), /must implement get/);
        const values = new Map([['gemini_locale', 'zh-cn']]);
        const writes = [];
        const storage = {
            get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
            set(key, value) { values.set(key, value); writes.push([key, value]); }
        };
        assert.equal(configureNativeUIRuntime({ storage }), 'zh-CN');
        assert.equal(NativeUI.getLocale(), 'zh-CN');
        assert.equal(NativeUI.setLocale('en-us'), true);
        assert.equal(NativeUI.setLocale('en-US'), false);
        assert.deepEqual(writes, [
            ['gemini_locale', 'en-US'],
            ['gemini_locale', 'en-US']
        ]);

        values.set('gemini_locale', 'not a locale');
        assert.equal(configureNativeUIRuntime({ storage }), 'en-US');
        assert.equal(NativeUI.getLocale(), 'en-US');
        const throwing = { get() { throw new Error('read failed'); }, set() {} };
        assert.equal(configureNativeUIRuntime({ storage: throwing }), 'en-US');

        const writeFailure = {
            get(_key, fallback) { return fallback; },
            set() { throw new Error('write failed'); }
        };
        assert.equal(configureNativeUIRuntime({ storage: writeFailure }), 'en-US');
        assert.doesNotThrow(() => NativeUI.setLocale('zh-CN'));
        assert.equal(NativeUI.getLocale(), 'zh-CN');
        configureNativeUIRuntime({ storage });
    });

    it('creates, reuses, and replaces the shared manager across stale portal and document states', () => {
        const initial = NativeUI._ensureDialogManager();
        assert.equal(initial, NativeUI._ensureDialogManager());
        assert.equal(NativeUI._dialogPortal.parentNode, documentRef.documentElement);
        assert.equal(documentRef.body.contains(NativeUI._dialogPortal), false);

        const disconnectedPortal = NativeUI._dialogPortal;
        disconnectedPortal.remove();
        NativeUI._dialogs.set('stale', { open: true });
        const afterDisconnect = NativeUI._ensureDialogManager();
        assert.notEqual(afterDisconnect, initial);
        assert.equal(initial.destroyed, true);
        assert.equal(NativeUI._dialogs.size, 0);

        NativeUI._dialogPortal = null;
        const afterMissingPortal = NativeUI._ensureDialogManager();
        assert.notEqual(afterMissingPortal, afterDisconnect);

        afterMissingPortal.destroy();
        const afterDestroyed = NativeUI._ensureDialogManager();
        assert.notEqual(afterDestroyed, afterMissingPortal);

        const nextDocument = new FakeDocument();
        globalThis.document = nextDocument;
        const afterDocumentChange = NativeUI._ensureDialogManager();
        assert.notEqual(afterDocumentChange, afterDestroyed);
        assert.equal(afterDestroyed.destroyed, true);
        assert.equal(NativeUI._dialogDocument, nextDocument);
    });

    it('disposes the shared dialog manager and every owned portal reference', () => {
        const manager = NativeUI._ensureDialogManager();
        const portal = NativeUI._dialogPortal;
        const toastRegion = documentRef.createElement('div');
        portal.appendChild(toastRegion);
        NativeUI._toastRegion = toastRegion;
        NativeUI._dialogs.set('stale', { open: false });

        assert.equal(NativeUI.disposeDialogs('test-stop'), true);
        assert.equal(manager.destroyed, true);
        assert.equal(portal.isConnected, false);
        assert.equal(NativeUI._dialogManager, null);
        assert.equal(NativeUI._dialogPortal, null);
        assert.equal(NativeUI._dialogDocument, null);
        assert.equal(NativeUI._toastRegion, null);
        assert.equal(NativeUI._dialogs.size, 0);
        assert.equal(NativeUI.disposeDialogs('again'), false);

        const destroyed = NativeUI._ensureDialogManager();
        destroyed.destroy();
        assert.equal(NativeUI.disposeDialogs('already-destroyed'), true);
    });

    it('validates, stages, replaces, closes, and cleans dialog handles', () => {
        assert.throws(() => NativeUI.openDialog(), /requires an id/);
        assert.throws(() => NativeUI.openDialog({ id: 'missing-content' }), /requires contentElement/);

        let tourStops = 0;
        NativeUI._activeTour = { stop() { tourStops += 1; NativeUI._activeTour = null; } };
        const closeReasons = [];
        const staging = documentRef.createElement('div');
        staging.className = 'legacy-dialog';
        staging.style.cssText = 'width:320px';
        const first = documentRef.createElement('button');
        const second = documentRef.createElement('span');
        staging.append(first, second);
        const handle = NativeUI.openDialog({
            id: 'settings',
            ariaLabel: 'Settings',
            overlayClass: 'legacy-overlay',
            contentElement: staging,
            initialFocus: first,
            onClose: reason => closeReasons.push(reason)
        });
        assert.equal(tourStops, 1);
        assert.equal(NativeUI.getDialog('settings'), handle);
        assert.equal(handle.element.className, 'primer-ui-dialog legacy-dialog');
        assert.equal(handle.element.style.cssText, 'width:320px');
        assert.equal(handle.element.children.length, 2);
        assert.equal(handle.overlay.className, 'primer-ui-dialog-layer legacy-overlay');
        assert.equal(handle.overlay.style.pointerEvents, 'auto');
        assert.equal(handle.overlay.style.zIndex, '1');
        assert.equal(staging.parentNode, null);
        assert.equal(NativeUI.openDialog({ id: 'settings' }), handle);

        const replacementNode = documentRef.createElement('div');
        replacementNode.style = null;
        const replacement = NativeUI.openDialog({
            id: 'settings',
            ariaLabel: 'Replacement',
            contentElement: replacementNode,
            replaceExisting: true
        });
        assert.notEqual(replacement, handle);
        assert.deepEqual(closeReasons, ['replace']);
        assert.equal(replacement.element.className, 'primer-ui-dialog');
        assert.equal(replacement.overlay.className, 'primer-ui-dialog-layer');

        assert.equal(NativeUI.closeDialog('missing'), false);
        assert.equal(NativeUI.closeDialog('settings', 'api'), true);
        assert.equal(NativeUI.closeDialog('settings'), false);
        NativeUI._dialogs.set('settings', replacement);
        assert.equal(NativeUI.getDialog('settings'), null);
        assert.equal(NativeUI.getDialog('missing'), null);

        const warnings = [];
        Logger.warn = (...args) => warnings.push(args);
        const throwing = NativeUI.openDialog({
            id: 'throwing-close',
            ariaLabel: 'Throwing close',
            contentElement: documentRef.createElement('div'),
            onClose() { throw new Error('close failed'); }
        });
        NativeUI._dialogs.set('throwing-close', { open: true });
        assert.equal(throwing.close('test'), true);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0][1].error, /close failed/);
        NativeUI._dialogs.delete('throwing-close');
    });

    it('closes every stacked dialog and handles absent or destroyed managers', () => {
        assert.equal(NativeUI.closeAllDialogs(), 0);
        for (const id of ['one', 'two', 'three']) {
            NativeUI.openDialog({
                id,
                ariaLabel: id,
                contentElement: documentRef.createElement('div')
            });
        }
        assert.equal(NativeUI.closeAllDialogs('batch'), 3);
        assert.equal(NativeUI._dialogs.size, 0);
        NativeUI._dialogManager.destroy();
        assert.equal(NativeUI.closeAllDialogs(), 0);
    });

    it('traps focus only at the enabled tab-order boundaries and disposes its listener', () => {
        const empty = documentRef.createElement('div');
        const disposeEmpty = NativeUI.trapFocus(empty);
        const ignored = new FakeEvent('keydown', { key: 'Enter' });
        empty.dispatchEvent(ignored);
        assert.equal(ignored.defaultPrevented, false);
        const noCandidates = new FakeEvent('keydown', { key: 'Tab' });
        empty.dispatchEvent(noCandidates);
        assert.equal(noCandidates.defaultPrevented, false);
        disposeEmpty();

        const container = documentRef.createElement('div');
        documentRef.body.append(container);
        const first = documentRef.createElement('button');
        const disabled = documentRef.createElement('button');
        disabled.disabled = true;
        const skipped = documentRef.createElement('div');
        skipped.tabIndex = -1;
        const middle = documentRef.createElement('input');
        const last = documentRef.createElement('a');
        last.setAttribute('href', '#');
        container.append(first, disabled, skipped, middle, last);
        const dispose = NativeUI.trapFocus(container);

        first.focus();
        const reverse = new FakeEvent('keydown', { key: 'Tab', shiftKey: true });
        container.dispatchEvent(reverse);
        assert.equal(reverse.defaultPrevented, true);
        assert.equal(documentRef.activeElement, last);

        last.focus();
        const forward = new FakeEvent('keydown', { key: 'Tab' });
        container.dispatchEvent(forward);
        assert.equal(forward.defaultPrevented, true);
        assert.equal(documentRef.activeElement, first);

        middle.focus();
        const middleForward = new FakeEvent('keydown', { key: 'Tab' });
        container.dispatchEvent(middleForward);
        assert.equal(middleForward.defaultPrevented, false);
        const middleReverse = new FakeEvent('keydown', { key: 'Tab', shiftKey: true });
        container.dispatchEvent(middleReverse);
        assert.equal(middleReverse.defaultPrevented, false);

        assert.equal(container.listenerCount('keydown'), 1);
        dispose();
        assert.equal(container.listenerCount('keydown'), 0);
    });

    it('returns controllable toast handles and uses only injected timers', () => {
        const scheduler = createScheduler();
        let frames = 0;
        const timing = {
            setTimeout: scheduler.setTimeout.bind(scheduler),
            clearTimeout: scheduler.clearTimeout.bind(scheduler),
            requestAnimationFrame(callback) { frames += 1; callback(); }
        };
        const first = NativeUI.showToast('Saved', 1000, timing);
        assert.equal(frames, 1);
        assert.equal(first.element.classList.contains('visible'), true);
        assert.equal(NativeUI._toastRegion.getAttribute('role'), 'status');
        assert.equal(NativeUI._toastRegion.getAttribute('aria-live'), 'polite');
        assert.equal(NativeUI._toastRegion.parentNode, NativeUI._dialogPortal);
        assert.equal(scheduler.scheduled[0].delay, 1000);

        const second = NativeUI.showToast('Again', 500, timing);
        assert.equal(NativeUI._toastRegion.children.length, 2);
        second.dismiss();
        assert.equal(second.element.classList.contains('visible'), false);
        assert.equal(scheduler.scheduled.at(-1).delay, 200);
        second.dismiss();
        const removeId = scheduler.scheduled.at(-1).id;
        scheduler.run(removeId);
        assert.equal(second.element.parentNode, null);
        second.dismiss({ immediate: true });
        second.remove();

        first.dismiss({ immediate: true });
        assert.equal(first.element.parentNode, null);
        first.remove();
        assert.ok(scheduler.cleared.length >= 2);

        NativeUI._toastRegion.remove();
        const replacementRegionToast = NativeUI.showToast('New region', 0, timing);
        assert.equal(NativeUI._toastRegion.isConnected, true);
        replacementRegionToast.dismiss({ immediate: true });
    });

    it('covers automatic toast dismissal and global timer/frame fallbacks explicitly', () => {
        const scheduler = createScheduler();
        globalThis.requestAnimationFrame = callback => { callback(); return 7; };
        withTimers(scheduler, () => {
            const automatic = NativeUI.showToast('Automatic', 25);
            const dismissId = scheduler.scheduled[0].id;
            scheduler.run(dismissId);
            const removeId = scheduler.scheduled.at(-1).id;
            scheduler.run(removeId);
            assert.equal(automatic.element.parentNode, null);
        });

        NativeUI._toastRegion.remove();
        NativeUI._toastRegion = null;
        delete globalThis.requestAnimationFrame;
        const noFrameScheduler = createScheduler();
        withTimers(noFrameScheduler, () => {
            const noFrame = NativeUI.showToast('No frame', 50, { requestAnimationFrame: 0 });
            assert.equal(noFrame.element.classList.contains('visible'), true);
            noFrame.dismiss({ immediate: true });
        });

        let synchronousId = 100;
        const synchronous = NativeUI.showToast('Synchronous', 10, {
            setTimeout(callback) { callback(); return synchronousId++; },
            clearTimeout() {},
            requestAnimationFrame: null
        });
        assert.equal(synchronous.element.parentNode, null);
        synchronous.dismiss();

        assert.throws(() => NativeUI.showToast('Bad schedule', 10, {
            setTimeout: true,
            clearTimeout() {},
            requestAnimationFrame: 0
        }), /schedule is not a function/);
        const badCancelScheduler = createScheduler();
        const badCancel = NativeUI.showToast('Bad cancel', 10, {
            setTimeout: badCancelScheduler.setTimeout.bind(badCancelScheduler),
            clearTimeout: true,
            requestAnimationFrame: 0
        });
        assert.throws(() => badCancel.dismiss(), /cancel is not a function/);
    });

    it('marks dirty zones, clears retry state, removes nodes, and delegates Gemini anchors', () => {
        const scheduler = createScheduler();
        withTimers(scheduler, () => {
            ModuleRegistry.enabledModules.add('folders');
            ModuleRegistry.enabledModules.add('export');
            NativeUI._retryCount = { folders: 2, export: 1, orphan: 3 };
            NativeUI._retryTimer = scheduler.setTimeout(() => {}, 999);
            NativeUI.markAllDirty();
            assert.deepEqual([...NativeUI._dirtyModules].sort(), ['export', 'folders']);
            assert.deepEqual(NativeUI._retryCount, { orphan: 3 });
            assert.equal(NativeUI._retryTimer, null);
            NativeUI._clearRetryTimer();

            NativeUI._dirtyModules.clear();
            NativeUI._retryCount.folders = 1;
            NativeUI.markDirtyByZone('sidebar');
            assert.deepEqual([...NativeUI._dirtyModules], ['folders']);
            assert.equal('folders' in NativeUI._retryCount, false);
            NativeUI.markDirtyByZone('unknown-zone');
            assert.deepEqual([...NativeUI._dirtyModules].sort(), ['export', 'folders']);
            NativeUI.markDirty('manual');
            assert.equal(NativeUI._dirtyModules.has('manual'), true);
        });

        const removable = documentRef.createElement('div');
        removable.id = 'remove-me';
        documentRef.body.append(removable);
        NativeUI.remove('remove-me');
        assert.equal(removable.parentNode, null);
        NativeUI.remove('missing');

        const values = {
            getSidebar: { name: 'sidebar' },
            getInputArea: { name: 'input' },
            getChatHeader: { name: 'header' },
            getModelSwitch: { name: 'model' }
        };
        for (const name of adapterNames) GeminiAdapter[name] = () => values[name];
        assert.equal(NativeUI.getSidebar(), values.getSidebar);
        assert.equal(NativeUI.getInputArea(), values.getInputArea);
        assert.equal(NativeUI.getChatHeader(), values.getChatHeader);
        assert.equal(NativeUI.getModelSwitch(), values.getModelSwitch);
    });

    it('processes success, disabled, missing, retry, pending, and terminal dirty-module states', () => {
        const scheduler = createScheduler();
        const warnings = [];
        Logger.warn = (...args) => warnings.push(args);
        withTimers(scheduler, () => {
            NativeUI.tick();

            let successes = 0;
            ModuleRegistry.modules.success = { injectNativeUI() { successes += 1; } };
            ModuleRegistry.modules.noHook = {};
            ModuleRegistry.modules.failure = { injectNativeUI() { throw new Error('retry me'); } };
            ModuleRegistry.enabledModules.add('success');
            ModuleRegistry.enabledModules.add('noHook');
            ModuleRegistry.enabledModules.add('missing');
            ModuleRegistry.enabledModules.add('failure');
            NativeUI._dirtyModules = new Set(['disabled', 'success', 'noHook', 'missing', 'failure']);
            NativeUI._retryCount.disabled = 3;
            NativeUI.tick();

            assert.equal(successes, 1);
            assert.equal(NativeUI._dirtyModules.has('disabled'), false);
            assert.equal('disabled' in NativeUI._retryCount, false);
            assert.equal(NativeUI._dirtyModules.has('noHook'), false);
            assert.equal(NativeUI._dirtyModules.has('missing'), false);
            assert.equal(NativeUI._dirtyModules.has('failure'), true);
            assert.equal(NativeUI._retryCount.failure, 1);
            assert.equal(scheduler.scheduled.at(-1).delay, 500);

            const originalRetryTimer = NativeUI._retryTimer;
            NativeUI.tick();
            assert.equal(NativeUI._retryCount.failure, 2);
            assert.equal(NativeUI._retryTimer, originalRetryTimer);
            scheduler.run(originalRetryTimer);
            assert.equal(NativeUI._retryCount.failure, 3);
            assert.equal(scheduler.scheduled.at(-1).delay, 2000);

            NativeUI._clearRetryTimer();
            NativeUI._retryCount.failure = 4;
            NativeUI.tick();
            assert.equal(NativeUI._dirtyModules.has('failure'), false);
            assert.equal('failure' in NativeUI._retryCount, false);
            assert.equal(warnings.length, 1);
            assert.match(warnings[0][1].error, /retry me/);
        });
    });

    it('builds cancel and confirm flows with default, localized, custom, danger, and theme-error states', () => {
        let confirmed = 0;
        const cancelled = NativeUI.showConfirm('Proceed?', () => { confirmed += 1; });
        let buttons = cancelled.element.querySelectorAll('button');
        assert.equal(buttons[0].textContent, 'Cancel');
        assert.equal(buttons[1].textContent, 'Confirm');
        assert.equal(cancelled.element.getAttribute('aria-label'), 'Confirm action');
        assert.equal(buttons[1].style.cssText.includes('var(--accent,#8ab4f8)'), true);
        buttons[0].click();
        assert.equal(confirmed, 0);

        const confirmedDialog = NativeUI.showConfirm('Proceed?', () => { confirmed += 1; });
        confirmedDialog.element.querySelectorAll('button')[1].click();
        assert.equal(confirmed, 1);

        NativeUI.isZH = true;
        Core.applyTheme = () => { throw new Error('theme unavailable'); };
        const localized = NativeUI.showConfirm('删除？', () => { confirmed += 1; }, {
            danger: true,
            cancelText: '返回',
            confirmText: '删除',
            ariaLabel: '删除确认'
        });
        buttons = localized.element.querySelectorAll('button');
        assert.equal(buttons[0].textContent, '返回');
        assert.equal(buttons[1].textContent, '删除');
        assert.equal(localized.element.getAttribute('aria-label'), '删除确认');
        assert.equal(buttons[1].style.cssText.includes('#ea4335'), true);
        assert.equal(buttons[1].style.cssText.includes('#fff'), true);
        buttons[1].click();
        assert.equal(confirmed, 2);

        const zhDefaults = NativeUI.showConfirm('继续？', () => {});
        buttons = zhDefaults.element.querySelectorAll('button');
        assert.equal(buttons[0].textContent, '取消');
        assert.equal(buttons[1].textContent, '确认');
        assert.equal(zhDefaults.element.getAttribute('aria-label'), '确认操作');
        zhDefaults.close('cleanup');

        const warnings = [];
        Logger.warn = (...args) => warnings.push(args);
        const callbackFailure = NativeUI.showConfirm('失败？', () => { throw new Error('confirm failed'); });
        callbackFailure.element.querySelectorAll('button')[1].click();
        assert.equal(warnings.length, 1);
        assert.match(warnings[0][1].error, /confirm failed/);
    });
});
