const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const rootDir = path.join(__dirname, '..');

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

class FakeClassList {
    constructor(element) { this.element = element; }

    _values() { return this.element.className.split(/\s+/).filter(Boolean); }
    contains(value) { return this._values().includes(value); }
    add(...values) { this.element.className = [...new Set([...this._values(), ...values])].join(' '); }
    remove(...values) {
        const removed = new Set(values);
        this.element.className = this._values().filter(value => !removed.has(value)).join(' ');
    }
    toggle(value, force) {
        const present = this.contains(value);
        const enabled = force === undefined ? !present : Boolean(force);
        if (enabled) this.add(value);
        else this.remove(value);
        return enabled;
    }
}

class FakeElement extends FakeEventTarget {
    constructor(tagName, ownerDocument) {
        super();
        this.nodeType = tagName === '#text' ? 3 : 1;
        this.tagName = tagName.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.parentNode = null;
        this.children = [];
        this.attributes = new Map();
        this.className = '';
        this.classList = new FakeClassList(this);
        this.style = { cssText: '' };
        this.id = '';
        this.disabled = false;
        this.hidden = false;
        this.inert = false;
        this._textContent = '';
        this._tabIndex = null;
        this.rect = { top: 0, left: 0, right: 100, bottom: 30, width: 100, height: 30 };
        this.scrollRect = null;
        this.scrollCalls = 0;
    }

    get childNodes() { return this.children; }
    get firstChild() { return this.children[0] || null; }
    get textContent() {
        if (this.children.length) return this.children.map(child => child.textContent).join('');
        return this._textContent;
    }
    set textContent(value) {
        for (const child of this.children) child.parentNode = null;
        this.children = [];
        this._textContent = String(value ?? '');
    }
    get tabIndex() {
        if (this._tabIndex != null) return this._tabIndex;
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
        this.attributes.set(String(name), String(value));
        if (name === 'id') this.id = String(value);
        if (name === 'class') this.className = String(value);
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
        if (index >= 0) this.children.splice(index, 1);
        node.parentNode = null;
        return node;
    }
    replaceChildren(...nodes) {
        for (const child of this.children) child.parentNode = null;
        this.children = [];
        this._textContent = '';
        this.append(...nodes);
    }
    remove() { this.parentNode?.removeChild?.(this); }
    contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
    focus() { this.ownerDocument.activeElement = this; }
    click() {
        if (this.disabled) return;
        const event = new FakeEvent('click', { target: this });
        this.dispatchEvent(event);
        if (typeof this.onclick === 'function') this.onclick(event);
    }
    getBoundingClientRect() { return { ...this.rect }; }
    scrollIntoView() {
        this.scrollCalls += 1;
        if (this.scrollRect) this.rect = { ...this.scrollRect };
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
        if (value === '[tabindex]:not([tabindex="-1"])') return this._tabIndex != null && this.tabIndex !== -1;
        return this.tagName === value.toUpperCase();
    }
    querySelectorAll(selector) {
        const selectors = selector.split(',');
        return this._descendants().filter(node => selectors.some(value => node._matchesSingle(value)));
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
    createTextNode(text) {
        const node = new FakeElement('#text', this);
        node.textContent = text;
        return node;
    }
    contains(node) { return node === this || this.documentElement.contains(node); }
    querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
    querySelector(selector) { return this.documentElement.querySelector(selector); }
    getElementById(id) { return this.querySelector(`#${id}`); }
}

async function loadIntegration() {
    const nativeUrl = pathToFileURL(path.join(rootDir, 'src', 'native_ui.js')).href;
    const tourUrl = pathToFileURL(path.join(rootDir, 'src', 'guided_tour.js')).href;
    const recipesUrl = pathToFileURL(path.join(rootDir, 'src', 'features', 'recipes', 'index.js')).href;
    const [nativeModule, tourModule, recipes] = await Promise.all([
        import(nativeUrl), import(tourUrl), import(recipesUrl)
    ]);
    return { NativeUI: nativeModule.NativeUI, GuidedTour: tourModule.GuidedTour, recipes };
}

Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
});
let integration;

describe('dialog stack integration', () => {
    before(async () => {
        integration = await loadIntegration();
    });

    it('uses one stack for ARIA, inert background, topmost Escape, and focus restoration', () => {
        const document = new FakeDocument();
        globalThis.document = document;
        globalThis.requestAnimationFrame = callback => { callback(); return 1; };

        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();

        const firstModal = document.createElement('div');
        firstModal.className = 'settings-modal';
        const firstAction = document.createElement('button');
        firstModal.appendChild(firstAction);
        const first = integration.NativeUI.openDialog({
            id: 'settings',
            ariaLabel: 'Settings',
            overlayClass: 'settings-overlay',
            contentElement: firstModal,
            initialFocus: firstAction
        });

        assert.equal(first.element.getAttribute('role'), 'dialog');
        assert.equal(first.element.getAttribute('aria-modal'), 'true');
        assert.equal(first.element.getAttribute('aria-label'), 'Settings');
        assert.equal(first.element.classList.contains('settings-modal'), true);
        assert.equal(first.overlay.classList.contains('settings-overlay'), true);
        assert.equal(document.body.inert, true);
        assert.equal(document.body.getAttribute('aria-hidden'), 'true');
        assert.equal(document.activeElement, firstAction);

        const secondModal = document.createElement('div');
        secondModal.className = 'debug-modal';
        const secondAction = document.createElement('button');
        secondModal.appendChild(secondAction);
        const second = integration.NativeUI.openDialog({
            id: 'debug',
            ariaLabel: 'Debug',
            overlayClass: 'debug-overlay',
            contentElement: secondModal,
            initialFocus: secondAction,
            returnFocus: () => firstAction
        });

        assert.equal(integration.NativeUI._dialogManager.size, 2);
        assert.equal(first.element.getAttribute('aria-modal'), 'false');
        assert.equal(first.overlay.getAttribute('aria-hidden'), 'true');
        assert.equal(second.element.getAttribute('aria-modal'), 'true');
        assert.ok(Number(second.overlay.style.zIndex) > Number(first.overlay.style.zIndex));

        const escape = new FakeEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
        assert.equal(second.open, false);
        assert.equal(first.open, true);
        assert.equal(first.element.getAttribute('aria-modal'), 'true');
        assert.equal(document.activeElement, firstAction);

        first.close('done');
        assert.equal(document.body.inert, false);
        assert.equal(document.body.hasAttribute('aria-hidden'), false);
        assert.equal(document.activeElement, opener);

        opener.id = 'g-open-settings';
        const rerenderedModal = document.createElement('div');
        rerenderedModal.appendChild(document.createElement('button'));
        const rerendered = integration.NativeUI.openDialog({
            id: 'settings-after-rerender',
            ariaLabel: 'Settings after rerender',
            contentElement: rerenderedModal,
            returnFocus: () => document.getElementById('g-open-settings')
        });
        opener.remove();
        const replacement = document.createElement('button');
        replacement.id = 'g-open-settings';
        document.body.appendChild(replacement);
        rerendered.close('done');
        assert.equal(document.activeElement, replacement);
    });

    it('announces toasts from a live region outside the inert background', () => {
        const document = new FakeDocument();
        globalThis.document = document;
        globalThis.requestAnimationFrame = callback => { callback(); return 1; };

        const scheduled = new Map();
        let nextTimer = 1;
        const toast = integration.NativeUI.showToast('Saved', 2000, {
            requestAnimationFrame: callback => callback(),
            setTimeout(callback) { const id = nextTimer++; scheduled.set(id, callback); return id; },
            clearTimeout(id) { scheduled.delete(id); }
        });
        const region = integration.NativeUI._toastRegion;
        assert.equal(region.getAttribute('role'), 'status');
        assert.equal(region.getAttribute('aria-live'), 'polite');
        assert.equal(region.getAttribute('aria-atomic'), 'false');
        assert.equal(region.parentNode, integration.NativeUI._dialogPortal);
        assert.equal(document.body.contains(region), false);
        assert.equal(region.textContent, 'Saved');
        toast.dismiss({ immediate: true });
        toast.dismiss({ immediate: true });
        toast.remove();
        assert.equal(region.textContent, '');
    });

    it('routes confirmations through the stack and confirms only explicitly', () => {
        const document = new FakeDocument();
        globalThis.document = document;
        globalThis.requestAnimationFrame = callback => { callback(); return 1; };
        let confirmed = 0;

        const handle = integration.NativeUI.showConfirm('Proceed?', () => { confirmed += 1; });
        assert.equal(handle.element.getAttribute('aria-label'), 'Confirm action');
        assert.equal(document.body.inert, true);
        const buttons = handle.element.querySelectorAll('button');
        assert.equal(buttons.length, 2);
        buttons[0].click();
        assert.equal(confirmed, 0);
        assert.equal(document.body.inert, false);

        const confirmHandle = integration.NativeUI.showConfirm('Proceed?', () => { confirmed += 1; });
        confirmHandle.element.querySelectorAll('button')[1].click();
        assert.equal(confirmed, 1);
        assert.equal(document.body.inert, false);
    });

    it('skips hidden tour targets and scrolls an off-screen target into view', () => {
        const document = new FakeDocument();
        const windowTarget = new FakeEventTarget();
        windowTarget.innerWidth = 800;
        windowTarget.innerHeight = 600;
        globalThis.document = document;
        globalThis.window = windowTarget;
        globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
        globalThis.requestAnimationFrame = callback => { callback(); return 1; };
        globalThis.cancelAnimationFrame = () => {};
        let markedSeen = false;
        integration.GuidedTour.configurePorts({
            storage: {
                get: () => false,
                set: () => { markedSeen = true; }
            }
        });

        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const hiddenPanel = document.createElement('div');
        hiddenPanel.id = 'gemini-monitor-panel-v7';
        hiddenPanel.rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
        document.body.appendChild(hiddenPanel);
        const user = document.createElement('div');
        user.id = 'g-user-capsule';
        document.body.appendChild(user);
        const display = document.createElement('div');
        display.id = 'g-big-display';
        display.rect = { top: 900, left: 10, right: 110, bottom: 930, width: 100, height: 30 };
        display.scrollRect = { top: 100, left: 10, right: 110, bottom: 130, width: 100, height: 30 };
        document.body.appendChild(display);

        integration.GuidedTour.start();
        assert.equal(integration.GuidedTour._current, 1);
        assert.match(integration.GuidedTour._tooltip.textContent, /2 \/ 7/);
        integration.GuidedTour.next();
        assert.equal(display.scrollCalls, 1);
        assert.equal(integration.GuidedTour._current, 2);
        assert.equal(integration.GuidedTour._overlay.style.top, '94px');

        const modal = document.createElement('div');
        const modalAction = document.createElement('button');
        modal.appendChild(modalAction);
        const modalHandle = integration.NativeUI.openDialog({
            id: 'tour-replacement',
            ariaLabel: 'Replacement dialog',
            contentElement: modal,
            initialFocus: modalAction
        });
        assert.equal(integration.GuidedTour._overlay, null);
        assert.equal(integration.NativeUI._dialogManager.size, 1);
        assert.equal(document.activeElement, modalAction);
        assert.equal(markedSeen, true);
        modalHandle.close('done');
        assert.equal(document.activeElement, opener);
    });

    it('keeps every Recipes modal in the shared inert and topmost-only focus stack', () => {
        const document = new FakeDocument();
        globalThis.document = document;
        globalThis.requestAnimationFrame = callback => { callback(); return 1; };
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const closed = [];

        const editor = integration.recipes.openLegacyRecipeEditor({
            document,
            onSave() {},
            onClose: reason => closed.push(['editor', reason]),
            t: (_zh, en) => en
        });
        const variables = integration.recipes.openRecipeVariablesDialog({
            document,
            recipe: {
                id: 'recipe-stack',
                title: 'Stack recipe',
                variables: [{ name: 'topic', label: 'Topic', type: 'text', required: true }]
            },
            onSubmit() {},
            onClose: reason => closed.push(['variables', reason]),
            t: (_zh, en) => en
        });
        const preview = integration.recipes.openQueuePermissionPreview({
            document,
            plan: {
                autoSend: false,
                permissions: ['composer.insert'],
                steps: [{ title: 'Prepare' }]
            },
            onConfirm() {},
            onClose: reason => closed.push(['preview', reason]),
            t: (_zh, en) => en
        });

        assert.equal(document.querySelectorAll('#primer-dialog-portal').length, 1);
        assert.equal(integration.NativeUI._dialogManager.size, 3);
        assert.equal(document.body.inert, true);
        assert.equal(document.body.getAttribute('aria-hidden'), 'true');
        assert.equal(editor.dialog.getAttribute('role'), 'dialog');
        assert.equal(editor.dialog.getAttribute('aria-labelledby').endsWith('-title'), true);
        assert.equal(editor.dialog.getAttribute('aria-describedby').endsWith('-description'), true);
        assert.equal(editor.overlay.classList.contains('primer-recipes-dialog-layer'), true);
        assert.equal(editor.dialog.getAttribute('aria-modal'), 'false');
        assert.equal(editor.overlay.getAttribute('aria-hidden'), 'true');
        assert.equal(variables.dialog.getAttribute('aria-modal'), 'false');
        assert.equal(preview.dialog.getAttribute('aria-modal'), 'true');
        assert.equal(document.activeElement, preview.dialog.querySelector('.settings-close'));
        assert.equal(Object.isFrozen(preview), true);

        const previewButtons = preview.dialog.querySelectorAll('button');
        previewButtons.at(-1).focus();
        const tab = new FakeEvent('keydown', { key: 'Tab' });
        document.dispatchEvent(tab);
        assert.equal(tab.defaultPrevented, true);
        assert.equal(document.activeElement, previewButtons[0]);
        const shiftTab = new FakeEvent('keydown', { key: 'Tab', shiftKey: true });
        document.dispatchEvent(shiftTab);
        assert.equal(shiftTab.defaultPrevented, true);
        assert.equal(document.activeElement, previewButtons.at(-1));

        variables.overlay.dispatchEvent(new FakeEvent('click', { target: variables.overlay }));
        assert.equal(variables.open, true);
        const escape = new FakeEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
        assert.equal(preview.open, false);
        assert.equal(variables.open, true);
        assert.equal(editor.open, true);
        assert.equal(variables.dialog.getAttribute('aria-modal'), 'true');
        assert.equal(document.activeElement, variables.dialog.querySelector('.settings-close'));

        variables.overlay.dispatchEvent(new FakeEvent('click', { target: variables.overlay }));
        assert.equal(variables.open, false);
        assert.equal(editor.open, true);
        assert.equal(editor.dialog.getAttribute('aria-modal'), 'true');
        assert.equal(editor.close('complete'), true);
        assert.equal(editor.close('again'), false);
        assert.equal(document.body.inert, false);
        assert.equal(document.body.hasAttribute('aria-hidden'), false);
        assert.equal(document.activeElement, opener);
        assert.deepEqual(closed, [
            ['preview', 'escape'],
            ['variables', 'backdrop'],
            ['editor', 'complete']
        ]);
    });

    it('closes tracked Recipes dialogs on UI removal and facade destroy', async () => {
        const document = new FakeDocument();
        const windowRef = {};
        globalThis.document = document;
        globalThis.window = windowRef;
        globalThis.requestAnimationFrame = callback => { callback(); return 1; };
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        let sequence = 0;
        const facade = integration.recipes.createLegacyPromptVaultFacade({
            document,
            window: windowRef,
            adapter: {
                getInputEditor() { return null; },
                getInputTrailingActions() { return null; }
            },
            storage: {
                async get(_key, fallback) { return structuredClone(fallback); },
                async set() {},
                async flush() {}
            },
            logger: { info() {} },
            clock: () => new Date('2026-08-01T00:00:00.000Z'),
            idFactory: () => `recipe-${++sequence}`,
            t: (_zh, en) => en
        });
        await facade.init({ session: 'dialog-stack@example.test' });

        const removed = facade.showPromptEditor(null);
        assert.equal(facade._dialogs.size, 1);
        facade.removeNativeUI();
        assert.equal(removed.open, false);
        assert.equal(facade._dialogs.size, 0);
        assert.equal(integration.NativeUI._dialogManager.size, 0);
        assert.equal(document.body.inert, false);
        assert.equal(document.activeElement, opener);

        opener.focus();
        const destroyed = facade.showPromptEditor(null);
        assert.equal(destroyed.open, true);
        await facade.destroy();
        assert.equal(destroyed.open, false);
        assert.equal(facade._dialogs.size, 0);
        assert.equal(integration.NativeUI._dialogManager.size, 0);
        assert.equal(document.body.inert, false);
        assert.equal(document.activeElement, opener);
    });

    it('keeps Recipes import on the native file-picker boundary without opening another modal', () => {
        const document = new FakeDocument();
        globalThis.document = document;
        let imports = 0;
        const controller = integration.recipes.createLegacyRecipesManagerController({
            document,
            t: (_zh, en) => en,
            importFile() { imports += 1; },
            exportFile() {}
        });
        const host = document.createElement('div');
        document.body.appendChild(host);
        const group = controller.appendImportExport(host);
        group.querySelectorAll('button')[0].click();
        assert.equal(imports, 1);
        assert.equal(document.querySelector('#primer-dialog-portal'), null);
    });

    it('routes every scoped modal facade through one injected dialog stack', () => {
        const read = file => fs.readFileSync(path.join(rootDir, file), 'utf8');
        const settings = read('src/panel_settings.js');
        const dashboard = read('src/panel_dashboard.js');
        const nativeUi = read('src/native_ui.js');
        const tour = read('src/guided_tour.js');
        const settingsController = read('src/ui/shell/settings_controller.js');
        const onboardingController = read('src/ui/shell/onboarding_controller.js');
        const debugController = read('src/ui/shell/debug_controller.js');
        const calibrationController = read('src/ui/shell/calibration_controller.js');
        const dashboardController = read('src/ui/shell/dashboard_controller.js');
        const tourController = read('src/ui/shell/tour_controller.js');
        const recipesUi = read('src/features/recipes/legacy_ui.js');
        const recipesManager = read('src/features/recipes/legacy_manager_controller.js');
        const recipesComposer = read('src/features/recipes/legacy_composer_controller.js');
        const recipesFacade = read('src/features/recipes/legacy_facade.js');
        const recipesTransfer = read('src/features/recipes/legacy_transfer_controller.js');
        const moduleRegistry = read('src/module_registry.js');

        assert.match(settings, /openSettingsController/);
        assert.match(settings, /openOnboardingController/);
        assert.match(settings, /openDebugController/);
        assert.match(settings, /openCalibrationController/);
        assert.match(dashboard, /openDashboardController/);
        for (const source of [settingsController, onboardingController, debugController, calibrationController, dashboardController]) {
            assert.equal((source.match(/ui\.openDialog\(/g) || []).length, 1);
            assert.doesNotMatch(source, /documentRef\.addEventListener\('keydown', escHandler/);
        }
        assert.match(nativeUi, /createDialogManager/);
        assert.match(nativeUi, /aria-live', 'polite'/);
        assert.match(tour, /createTourController/);
        assert.match(tourController, /ui\.closeAllDialogs\('tour'\)/);
        assert.match(nativeUi, /this\._activeTour\.stop\(\)/);
        assert.match(tourController, /scrollIntoView/);
        assert.equal((recipesUi.match(/ui\.openDialog\(/g) || []).length, 1);
        assert.doesNotMatch(recipesUi, /const overlay\s*=/);
        assert.doesNotMatch(recipesUi, /addEventListener\(['"]keydown/);
        assert.doesNotMatch(recipesUi, /event\.key === ['"]Escape/);
        assert.doesNotMatch(recipesUi, /(?:document\.body|target)\.appendChild\(overlay\)/);
        assert.match(recipesManager, /\{ document, t, ui, updatePrompt, addPrompt \}/);
        assert.match(recipesComposer, /document, ui/);
        assert.match(recipesFacade, /removeNativeUI\(reason = 'native-ui-removed'\)/);
        assert.match(recipesFacade, /closeDialogs\(reason\)/);
        assert.match(recipesFacade, /removeNativeUI\('destroy'\)/);
        assert.match(recipesTransfer, /input\.type = 'file'/);
        assert.match(moduleRegistry, /descriptor\.stop = context => module\.destroy\(context\)/);
    });
});
