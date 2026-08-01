const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const rootDir = path.join(__dirname, '..');
let ui;

before(async () => {
    const entry = pathToFileURL(path.join(rootDir, 'src', 'ui', 'index.js')).href;
    ui = await import(entry);
});

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

class FakeElement extends FakeEventTarget {
    constructor(tagName, ownerDocument) {
        super();
        this.nodeType = 1;
        this.tagName = tagName.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.parentNode = null;
        this.children = [];
        this.attributes = new Map();
        this.className = '';
        this.id = '';
        this.type = '';
        this.name = '';
        this.title = '';
        this.disabled = false;
        this.hidden = false;
        this.checked = false;
        this.required = false;
        this.inert = false;
        this._textContent = '';
        this._tabIndex = null;
        this.shadowRoot = null;
    }

    get childNodes() { return this.children; }

    get textContent() {
        if (this.children.length > 0) return this.children.map(child => child.textContent).join('');
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
            if (node.parentNode?.removeChild) node.parentNode.removeChild(node);
            node.parentNode = this;
            this.children.push(node);
        }
    }

    appendChild(node) { this.append(node); return node; }

    removeChild(node) {
        const index = this.children.indexOf(node);
        if (index !== -1) {
            this.children.splice(index, 1);
            node.parentNode = null;
        }
        return node;
    }

    remove() { this.parentNode?.removeChild?.(this); }

    contains(node) {
        if (node === this) return true;
        return this.children.some(child => child.contains?.(node));
    }

    attachShadow() {
        const root = new FakeShadowRoot(this.ownerDocument, this);
        root.parentNode = this;
        this.shadowRoot = root;
        return root;
    }

    focus() {
        this.ownerDocument.activeElement = this;
        let current = this.parentNode;
        while (current) {
            if (current instanceof FakeShadowRoot) current.activeElement = this;
            current = current.parentNode;
        }
    }

    click() {
        if (!this.disabled) this.dispatchEvent(new FakeEvent('click'));
    }

    _descendants() {
        return this.children.flatMap(child => [child, ...child._descendants()]);
    }

    _matchesSingle(selector) {
        const value = selector.trim();
        if (value.startsWith('#')) return this.id === value.slice(1);
        if (value.startsWith('.')) return this.className.split(/\s+/).includes(value.slice(1));
        if (value === 'a[href]') return this.tagName === 'A' && this.hasAttribute('href');
        if (value === 'button:not([disabled])') return this.tagName === 'BUTTON' && !this.disabled;
        if (value === 'input:not([disabled])') return this.tagName === 'INPUT' && !this.disabled;
        if (value === 'select:not([disabled])') return this.tagName === 'SELECT' && !this.disabled;
        if (value === 'textarea:not([disabled])') return this.tagName === 'TEXTAREA' && !this.disabled;
        if (value === '[tabindex]:not([tabindex="-1"])') return this._tabIndex != null && this.tabIndex !== -1;
        const attribute = value.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
        if (attribute) {
            if (!this.hasAttribute(attribute[1])) return false;
            return attribute[2] == null || this.getAttribute(attribute[1]) === attribute[2];
        }
        return this.tagName === value.toUpperCase();
    }

    querySelectorAll(selector) {
        const selectors = selector.split(',');
        return this._descendants().filter(node => selectors.some(candidate => node._matchesSingle(candidate)));
    }

    querySelector(selector) {
        if (selector === '[') throw new SyntaxError('Invalid selector');
        return this.querySelectorAll(selector)[0] || null;
    }
}

class FakeShadowRoot extends FakeElement {
    constructor(ownerDocument, host) {
        super('#shadow-root', ownerDocument);
        this.nodeType = 11;
        this.host = host;
        this.activeElement = null;
    }
}

class FakeDocument extends FakeEventTarget {
    constructor() {
        super();
        this.nodeType = 9;
        this.ownerDocument = this;
        this.body = new FakeElement('body', this);
        this.body.parentNode = this;
        this.activeElement = this.body;
    }

    createElement(tagName) { return new FakeElement(tagName, this); }
    contains(node) { return node === this || this.body.contains(node); }
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
    querySelector(selector) { return this.body.querySelector(selector); }
}

function makePortal(document) {
    const portal = document.createElement('div');
    portal.setAttribute('data-primer-ui-portal', '');
    document.body.append(portal);
    return portal;
}

function withGlobalDocument(document, callback) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: document });
    try { return callback(); }
    finally {
        if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
        else delete globalThis.document;
    }
}

describe('UI design tokens and isolated root', () => {
    it('uses a single namespace and rejects unsafe or unknown overrides', () => {
        assert.equal(ui.UI_NAMESPACE, 'primer-ui');
        assert.equal(ui.tokenVar('color-accent'), '--primer-ui-color-accent');
        assert.equal(ui.resolveTokens({ 'color-accent': '#123456' })['color-accent'], '#123456');
        assert.match(ui.createTokenCss({ 'radius-md': '10px' }), /--primer-ui-radius-md: 10px/);
        assert.match(ui.createTokenCss(), /--primer-ui-control-height-md: 2\.75rem/);
        assert.match(ui.BASE_UI_CSS, /data-primer-theme="glass"/);
        assert.match(ui.BASE_UI_CSS, /data-primer-theme="paper"/);
        assert.throws(() => ui.resolveTokens({ unknown: 'red' }), /Unknown Primer UI token/);
        assert.throws(() => ui.resolveTokens({ 'color-accent': 'red; color: blue' }), /unsafe CSS delimiter/);
        assert.throws(() => ui.resolveTokens([]), /must be an object/);
    });

    it('keeps normal content and overlays inside one owned shadow boundary', () => {
        const document = new FakeDocument();
        const root = ui.createUiRoot({
            document,
            id: 'primer-test-root',
            tokens: { 'color-accent': '#123456' },
            styles: '.feature { display: block; }'
        });
        const content = document.createElement('div');
        const overlay = document.createElement('div');
        const unmountContent = root.mount(content);
        const unmountOverlay = root.mountPortal(overlay);

        assert.equal(root.host.parentNode, document.body);
        assert.equal(root.host.id, 'primer-test-root');
        assert.equal(root.surface.parentNode, root.boundary);
        assert.equal(root.portal.parentNode, root.boundary);
        assert.equal(content.parentNode, root.surface);
        assert.equal(overlay.parentNode, root.portal);
        assert.equal(root.contains(overlay), true);
        assert.match(root.style.textContent, /--primer-ui-color-accent: #123456/);
        assert.match(root.style.textContent, /\.feature \{ display: block; \}/);

        unmountContent();
        unmountOverlay();
        assert.equal(content.parentNode, null);
        assert.equal(overlay.parentNode, null);

        const foreign = new FakeDocument().createElement('div');
        assert.throws(() => root.mountPortal(foreign), /different document/);
        root.destroy();
        root.destroy();
        assert.equal(root.destroyed, true);
        assert.equal(root.host.parentNode, null);
        assert.throws(() => root.mount(document.createElement('div')), /destroyed/);
    });
});

describe('UI component factories', () => {
    it('builds accessible buttons, icon buttons, and switches with controlled state', () => {
        const document = new FakeDocument();
        let presses = 0;
        const button = ui.Button({ document, label: 'Save', variant: 'primary', onPress: () => { presses += 1; } });
        document.body.append(button.element);
        button.element.click();
        assert.equal(presses, 1);
        assert.equal(button.element.type, 'button');
        assert.equal(button.element.getAttribute('data-variant'), 'primary');
        button.setLabel('Saved');
        button.setDisabled(true);
        button.element.click();
        assert.equal(presses, 1);
        assert.equal(button.element.textContent, 'Saved');
        assert.equal(button.element.getAttribute('aria-disabled'), 'true');
        button.setDisabled(false);
        assert.equal(button.element.hasAttribute('aria-disabled'), false);

        const iconButton = ui.IconButton({ document, label: 'Close', icon: '×', size: 'sm' });
        assert.equal(iconButton.element.getAttribute('aria-label'), 'Close');
        assert.equal(iconButton.icon.getAttribute('aria-hidden'), 'true');
        assert.equal(iconButton.element.textContent, '×');
        assert.throws(() => ui.IconButton({ document, label: '', icon: '×' }), /non-empty string/);

        const changes = [];
        const toggle = ui.Switch({ document, label: 'Enable module', checked: true, onChange: checked => changes.push(checked) });
        assert.equal(toggle.control.getAttribute('role'), 'switch');
        assert.equal(toggle.control.getAttribute('aria-checked'), 'true');
        assert.equal(toggle.checked, true);
        toggle.control.checked = false;
        toggle.control.dispatchEvent(new FakeEvent('change'));
        assert.deepEqual(changes, [false]);
        assert.equal(toggle.control.getAttribute('aria-checked'), 'false');
        toggle.setDisabled(true);
        assert.equal(toggle.control.disabled, true);
        assert.equal(toggle.element.getAttribute('data-disabled'), 'true');
    });

    it('provides keyboard tabs that skip disabled items and keep panels linked', () => {
        const document = new FakeDocument();
        const changes = [];
        const tabs = ui.Tabs({
            document,
            label: 'Settings sections',
            selectedId: 'general',
            onChange: id => changes.push(id),
            items: [
                { id: 'general', label: 'General', panel: 'General settings' },
                { id: 'labs', label: 'Labs', panel: 'Unavailable', disabled: true },
                { id: 'privacy', label: 'Privacy', panel: 'Privacy settings' }
            ]
        });
        document.body.append(tabs.element);

        assert.equal(tabs.selectedId, 'general');
        assert.equal(tabs.tabs[0].getAttribute('aria-selected'), 'true');
        assert.equal(tabs.panelElements[0].hidden, false);
        assert.equal(tabs.panelElements[1].hidden, true);
        assert.equal(tabs.tabs[0].getAttribute('aria-controls'), tabs.panelElements[0].id);
        assert.equal(tabs.panelElements[0].getAttribute('aria-labelledby'), tabs.tabs[0].id);
        assert.equal(document.querySelector(`#${tabs.panelElements[0].getAttribute('aria-labelledby')}`), tabs.tabs[0]);
        assert.equal(tabs.element.contains(tabs.tabs[0]), true);
        assert.equal(tabs.element.contains(tabs.panelElements[0]), true);
        assert.equal(tabs.select('labs'), false);

        const move = new FakeEvent('keydown', { key: 'ArrowRight' });
        tabs.tabs[0].dispatchEvent(move);
        assert.equal(move.defaultPrevented, true);
        assert.equal(tabs.selectedId, 'privacy');
        assert.equal(document.activeElement, tabs.tabs[2]);
        assert.deepEqual(changes, ['privacy']);

        tabs.tabs[2].dispatchEvent(new FakeEvent('keydown', { key: 'Home' }));
        assert.equal(tabs.selectedId, 'general');
        tabs.destroy();
        assert.equal(tabs.element.parentNode, null);
        assert.throws(() => ui.Tabs({ document, items: [{ id: 'x', label: 'X' }, { id: 'x', label: 'Y' }] }), /Duplicate tab id/);
    });

    it('links form labels, descriptions, and live validation state', () => {
        const document = new FakeDocument();
        const input = document.createElement('input');
        const field = ui.FormField({
            document,
            control: input,
            label: 'Folder name',
            description: 'Stored only in this browser',
            required: true
        });

        assert.equal(field.label.getAttribute('for'), input.id);
        assert.equal(input.getAttribute('aria-required'), 'true');
        const describedBy = input.getAttribute('aria-describedby').split(' ');
        assert.ok(describedBy.includes(field.description.id));
        assert.ok(describedBy.includes(field.error.id));
        field.setError('Name is required');
        assert.equal(field.error.hidden, false);
        assert.equal(input.getAttribute('aria-invalid'), 'true');
        field.setError('');
        assert.equal(field.error.hidden, true);
        assert.equal(input.hasAttribute('aria-invalid'), false);
    });

    it('bounds toast volume, supports deterministic dismissal, and cleans timers', () => {
        const document = new FakeDocument();
        const root = ui.createUiRoot({ document });
        const timers = new Map();
        let nextTimer = 0;
        const dismissed = [];
        const region = ui.ToastRegion({
            root,
            maxVisible: 2,
            schedule(callback) { nextTimer += 1; timers.set(nextTimer, callback); return nextTimer; },
            cancelSchedule(id) { timers.delete(id); }
        });

        const first = region.show('First', { duration: 100, onDismiss: reason => dismissed.push(reason) });
        const second = region.show('Second', { duration: 0 });
        region.show('Third', { duration: 0, tone: 'danger' });
        assert.equal(region.size, 2);
        assert.deepEqual(dismissed, ['overflow']);
        assert.equal(timers.size, 0);
        assert.equal(first.element.parentNode, null);
        assert.equal(second.dismiss('accepted'), true);
        assert.equal(second.dismiss('again'), false);
        assert.equal(region.size, 1);
        region.destroy();
        assert.equal(region.size, 0);
        assert.equal(region.element.parentNode, null);
        assert.throws(() => region.show('Late'), /destroyed/);
        root.destroy();
    });
});

describe('DialogManager', () => {
    it('keeps one modal stack, closes only the topmost dialog on Escape, and restores focus', () => {
        const document = new FakeDocument();
        const root = ui.createUiRoot({ document });
        const opener = document.createElement('button');
        root.mount(opener);
        opener.focus();
        const manager = ui.createDialogManager({ root });

        const firstContent = document.createElement('div');
        const firstAction = document.createElement('button');
        const lastAction = document.createElement('button');
        firstContent.append(firstAction, lastAction);
        const closed = [];
        const first = manager.open({
            id: 'first',
            title: 'First dialog',
            content: firstContent,
            initialFocus: firstAction,
            onClose: reason => closed.push(`first:${reason}`)
        });
        assert.equal(manager.size, 1);
        assert.equal(root.surface.inert, true);
        assert.equal(root.surface.getAttribute('aria-hidden'), 'true');
        assert.equal(first.element.getAttribute('aria-modal'), 'true');
        assert.equal(document.activeElement, firstAction);

        const secondAction = document.createElement('button');
        const second = manager.open({
            id: 'second',
            ariaLabel: 'Second dialog',
            content: secondAction,
            initialFocus: secondAction,
            onClose: reason => closed.push(`second:${reason}`)
        });
        assert.equal(manager.size, 2);
        assert.equal(first.element.getAttribute('aria-modal'), 'false');
        assert.equal(first.overlay.getAttribute('aria-hidden'), 'true');
        assert.equal(second.element.getAttribute('aria-modal'), 'true');
        assert.equal(document.activeElement, secondAction);

        const escape = new FakeEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
        assert.equal(manager.size, 1);
        assert.equal(second.open, false);
        assert.equal(first.open, true);
        assert.equal(first.element.getAttribute('aria-modal'), 'true');
        assert.equal(document.activeElement, firstAction);
        assert.deepEqual(closed, ['second:escape']);

        lastAction.focus();
        const tab = new FakeEvent('keydown', { key: 'Tab' });
        document.dispatchEvent(tab);
        assert.equal(tab.defaultPrevented, true);
        assert.equal(document.activeElement, firstAction);
        const reverseTab = new FakeEvent('keydown', { key: 'Tab', shiftKey: true });
        document.dispatchEvent(reverseTab);
        assert.equal(document.activeElement, lastAction);

        assert.equal(first.close('done'), true);
        assert.equal(manager.size, 0);
        assert.equal(root.surface.inert, false);
        assert.equal(root.surface.hasAttribute('aria-hidden'), false);
        assert.equal(document.activeElement, opener);
        assert.deepEqual(closed, ['second:escape', 'first:done']);

        const explicitTarget = document.createElement('button');
        root.mount(explicitTarget);
        const explicit = manager.open({ ariaLabel: 'Explicit return target', returnFocus: explicitTarget });
        explicit.close('done');
        assert.equal(document.activeElement, explicitTarget);
        manager.destroy();
        assert.equal(document.listenerCount('keydown'), 0);
        root.destroy();
    });

    it('preserves pre-existing inert state and destroys every remaining layer', () => {
        const document = new FakeDocument();
        const root = ui.createUiRoot({ document });
        root.surface.inert = true;
        root.surface.setAttribute('inert', '');
        root.surface.setAttribute('aria-hidden', 'legacy');
        const manager = new ui.DialogManager({ root });
        const first = manager.open({ title: 'Persistent', content: 'Body', closeOnEscape: false });
        document.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
        assert.equal(first.open, true);
        manager.destroy();
        manager.destroy();
        assert.equal(first.open, false);
        assert.equal(first.overlay.parentNode, null);
        assert.equal(root.surface.inert, true);
        assert.equal(root.surface.hasAttribute('inert'), true);
        assert.equal(root.surface.getAttribute('aria-hidden'), 'legacy');
        assert.equal(document.listenerCount('keydown'), 0);
        assert.throws(() => manager.open({ title: 'Late' }), /destroyed/);
        root.destroy();
    });
});

describe('locale store', () => {
    it('canonicalizes locales, falls back by language, interpolates text, and publishes changes', () => {
        const store = ui.createLocaleStore({
            initialLocale: 'en_US',
            fallbackLocale: 'en',
            messages: {
                en: { greeting: 'Hello, {name}', fallbackOnly: 'Fallback' },
                'zh-CN': { greeting: '你好，{name}' }
            }
        });
        const changes = [];
        const unsubscribe = store.subscribe(snapshot => changes.push(snapshot));

        assert.equal(store.locale, 'en-US');
        assert.equal(store.direction, 'ltr');
        assert.equal(store.t('greeting', { name: 'Ada' }), 'Hello, Ada');
        assert.equal(store.t('unknown'), 'unknown');
        assert.equal(store.t('unknown', {}, 'Readable fallback'), 'Readable fallback');
        store.addMessages('zh_CN', { fallbackOnly: '后备', count: '{count} 项' });
        assert.equal(store.setLocale('zh-cn'), true);
        assert.equal(store.setLocale('zh-CN'), false);
        assert.equal(store.t('greeting', { name: '小明' }), '你好，小明');
        assert.equal(store.t('count', { count: 3 }), '3 项');
        assert.equal(changes.length, 1);
        assert.equal(changes[0].previousLocale, 'en-US');
        assert.equal(changes[0].locale, 'zh-CN');

        store.addMessages('ar', { greeting: 'مرحبا {name}' });
        store.setLocale('ar');
        assert.equal(store.direction, 'rtl');
        unsubscribe();
        store.setLocale('en');
        assert.equal(changes.length, 2);
        assert.equal(ui.normalizeLocale('EN_us'), 'en-US');
        assert.throws(() => ui.normalizeLocale('not a locale!'), /Invalid locale/);
        assert.throws(() => store.addMessages('en', { broken: 42 }), /must be a string/);
    });
});

describe('UI source boundary coverage', () => {
    it('validates every token override shape and unknown token lookup', () => {
        assert.throws(() => ui.tokenVar('missing-token'), /Unknown Primer UI token/);
        assert.throws(() => ui.resolveTokens({ 'color-accent': 42 }), /non-empty string/);
        assert.throws(() => ui.resolveTokens({ 'color-accent': '' }), /non-empty string/);
        assert.throws(() => ui.resolveTokens({ 'color-accent': 'red{}' }), /unsafe CSS delimiter/);
        assert.equal(Object.isFrozen(ui.resolveTokens()), true);
        assert.match(ui.createTokenCss(), /data-primer-ui-root/);
    });

    it('rejects invalid roots and supports custom mounts, light DOM, and idempotent cleanup', () => {
        withGlobalDocument(undefined, () => {
            assert.throws(() => ui.createUiRoot(), /DOM document/);
        });

        const document = new FakeDocument();
        assert.throws(() => ui.createUiRoot({ document, mount: {} }), /mount must be a DOM element/);
        assert.throws(() => ui.createUiRoot({ document, mount: new FakeDocument().body }), /different document/);
        assert.throws(() => ui.createUiRoot({ document, id: 42 }), /non-empty string/);
        assert.throws(() => ui.createUiRoot({ document, id: '   ' }), /non-empty string/);
        assert.throws(() => ui.createUiRoot({ document, styles: 42 }), /styles must be strings/);
        assert.throws(() => ui.createUiRoot({ document, styles: ['ok', false] }), /styles must be strings/);

        const customMount = document.createElement('main');
        document.body.append(customMount);
        const createElement = document.createElement.bind(document);
        let firstElement = true;
        document.createElement = tagName => {
            const element = createElement(tagName);
            if (firstElement) {
                firstElement = false;
                element.attachShadow = undefined;
            }
            return element;
        };
        const root = ui.createUiRoot({
            document,
            mount: customMount,
            id: ' light-root ',
            styles: [null, '', '.extra{}']
        });
        assert.equal(root.boundary, root.host);
        assert.equal(root.host.id, 'light-root');
        assert.equal(root.contains(root.host), true);
        assert.equal(root.contains(root.boundary), true);
        assert.equal(root.contains(document.body), false);
        assert.equal(root.contains(null), false);

        assert.throws(() => root.mount(null), /Only DOM nodes/);
        assert.throws(() => root.mount(new FakeDocument().createElement('div')), /different document/);

        const moved = document.createElement('div');
        const unmountMoved = root.mount(moved);
        document.body.append(moved);
        unmountMoved();
        assert.equal(moved.parentNode, document.body);

        const noRemove = document.createElement('div');
        const unmountNoRemove = root.mountPortal(noRemove);
        noRemove.remove = undefined;
        unmountNoRemove();
        assert.equal(noRemove.parentNode, root.portal);

        root.destroy();
        assert.equal(root.contains(root.host), false);
        assert.throws(() => root.mountPortal(document.createElement('div')), /destroyed/);

        const noShadowDocument = new FakeDocument();
        const noRemoveRoot = ui.createUiRoot({ document: noShadowDocument });
        noRemoveRoot.host.remove = undefined;
        noRemoveRoot.destroy();
        noRemoveRoot.destroy();
        assert.equal(noRemoveRoot.destroyed, true);

        const implicit = withGlobalDocument(document, () => ui.createUiRoot());
        assert.equal(implicit.document, document);
        implicit.destroy();
    });

    it('covers button, icon button, and switch validation and disposal branches', () => {
        const document = new FakeDocument();
        withGlobalDocument(undefined, () => {
            assert.throws(() => ui.Button({ label: 'No DOM' }), /DOM document/);
        });
        assert.throws(() => ui.Button({ document, label: null }), /non-empty string/);
        assert.throws(() => ui.Button({ document, label: '  ' }), /non-empty string/);
        assert.throws(() => ui.Button({ document, label: 'Bad', variant: 'neon' }), /Unsupported button variant/);
        assert.throws(() => ui.Button({ document, label: 'Bad', size: 'lg' }), /Unsupported button size/);
        assert.throws(() => ui.Button({ document, label: 'Bad', onPress: true }), /onPress must be a function/);

        const root = ui.createUiRoot({ document });
        const plain = ui.Button({ root, label: 'Plain', type: 'submit' });
        root.mount(plain.element);
        assert.equal(plain.element.type, 'submit');
        assert.equal(plain.element.hasAttribute('aria-label'), false);
        assert.equal(plain.element.title, '');
        assert.throws(() => plain.setLabel(''), /non-empty string/);
        plain.destroy();
        plain.destroy();

        let presses = 0;
        const guarded = ui.Button({
            document,
            label: 'Guarded',
            ariaLabel: 'Run guarded action',
            title: 'Guard',
            size: 'sm',
            variant: 'ghost',
            onPress: () => { presses += 1; }
        });
        document.body.append(guarded.element);
        guarded.setDisabled(true);
        guarded.element.dispatchEvent(new FakeEvent('click'));
        assert.equal(presses, 0);
        guarded.setDisabled(false);
        guarded.element.dispatchEvent(new FakeEvent('click'));
        assert.equal(presses, 1);
        guarded.destroy();
        assert.equal(guarded.element.listenerCount('click'), 0);

        assert.throws(() => ui.IconButton({ document, label: 'Missing' }), /requires an icon/);
        assert.throws(() => ui.IconButton({ document, label: 'Foreign', icon: new FakeDocument().createElement('i') }), /different document/);
        const iconNode = document.createElement('i');
        iconNode.className = 'existing';
        const iconButton = ui.IconButton({ document, label: 'Menu', title: 'Open menu', icon: iconNode });
        document.body.append(iconButton.element);
        assert.equal(iconButton.element.title, 'Open menu');
        assert.match(iconButton.icon.className, /existing primer-ui-icon-button__icon/);
        iconButton.setDisabled(true);
        iconButton.destroy();

        assert.throws(() => ui.Switch({ document, label: '' }), /non-empty string/);
        assert.throws(() => ui.Switch({ document, label: 'Switch', onChange: 'bad' }), /onChange must be a function/);
        const passive = ui.Switch({
            document,
            id: 'explicit-switch',
            name: 'feature',
            describedBy: 'switch-help',
            label: 'Passive'
        });
        document.body.append(passive.element);
        assert.equal(passive.control.id, 'explicit-switch');
        assert.equal(passive.control.name, 'feature');
        assert.equal(passive.control.getAttribute('aria-describedby'), 'switch-help');
        passive.control.dispatchEvent(new FakeEvent('change'));
        passive.setLabel('Passive renamed');
        assert.equal(passive.label.textContent, 'Passive renamed');
        assert.throws(() => passive.setLabel(' '), /non-empty string/);
        passive.destroy();
        assert.equal(passive.control.listenerCount('change'), 0);
        root.destroy();
    });

    it('renders all tab panel forms and covers selection and keyboard boundaries', () => {
        const document = new FakeDocument();
        assert.throws(() => ui.Tabs({ document }), /non-empty items array/);
        assert.throws(() => ui.Tabs({ document, items: [] }), /non-empty items array/);
        assert.throws(() => ui.Tabs({ document, items: [null] }), /must be an object/);
        assert.throws(() => ui.Tabs({ document, items: [{ id: '', label: 'Bad' }] }), /non-empty string/);
        assert.throws(() => ui.Tabs({ document, items: [{ id: 'x', label: '' }] }), /non-empty string/);
        assert.throws(() => ui.Tabs({ document, onChange: true, items: [{ id: 'x', label: 'X' }] }), /onChange must be a function/);
        assert.throws(() => ui.Tabs({
            document,
            items: [{ id: 'foreign', label: 'Foreign', panel: new FakeDocument().createElement('div') }]
        }), /different document/);
        assert.throws(() => ui.Tabs({
            document,
            items: [{ id: 'foreign-fn', label: 'Foreign fn', panel: () => new FakeDocument().createElement('div') }]
        }), /different document/);

        const functionNode = document.createElement('strong');
        const directNode = document.createElement('em');
        const changes = [];
        const tabs = ui.Tabs({
            document,
            selectedId: 'missing',
            onChange: id => changes.push(id),
            items: [
                { id: 'string', label: 'String', panel: 'Text' },
                { id: 'function-string', label: 'Function string', panel: () => 'Rendered' },
                { id: 'function-node', label: 'Function node', panel: ({ id }) => { functionNode.textContent = id; return functionNode; } },
                { id: 'function-empty', label: 'Function empty', panel: () => null },
                { id: 'direct', label: 'Direct', panel: directNode },
                { id: 'disabled', label: 'Disabled', panel: false, disabled: true }
            ]
        });
        document.body.append(tabs.element);
        assert.equal(tabs.list.hasAttribute('aria-label'), false);
        assert.equal(tabs.selectedId, 'string');
        assert.equal(tabs.panelElements[1].textContent, 'Rendered');
        assert.equal(tabs.panelElements[2].textContent, 'function-node');
        assert.equal(tabs.panelElements[3].textContent, '');
        assert.equal(tabs.panelElements[4].contains(directNode), true);
        assert.equal(tabs.select('missing'), false);
        assert.equal(tabs.select('string'), true);
        assert.deepEqual(changes, []);
        assert.equal(tabs.select('direct', { focus: true, emit: false }), true);
        assert.equal(document.activeElement, tabs.tabs[4]);
        tabs.tabs[0].click();
        assert.deepEqual(changes, ['string']);

        const ignored = new FakeEvent('keydown', { key: 'PageDown' });
        tabs.tabs[0].dispatchEvent(ignored);
        assert.equal(ignored.defaultPrevented, false);
        tabs.tabs[0].dispatchEvent(new FakeEvent('keydown', { key: 'End' }));
        assert.equal(tabs.selectedId, 'direct');
        tabs.tabs[4].dispatchEvent(new FakeEvent('keydown', { key: 'ArrowLeft' }));
        assert.equal(tabs.selectedId, 'function-empty');
        tabs.destroy();
        assert.equal(tabs.tabs[0].listenerCount('click'), 0);
        assert.equal(tabs.tabs[0].listenerCount('keydown'), 0);

        const allDisabled = ui.Tabs({
            document,
            items: [{ id: 'off', label: 'Off', disabled: true }]
        });
        assert.equal(allDisabled.selectedId, null);
        const noMove = new FakeEvent('keydown', { key: 'ArrowRight' });
        allDisabled.tabs[0].dispatchEvent(noMove);
        assert.equal(noMove.defaultPrevented, true);
        assert.equal(allDisabled.selectedId, null);
        allDisabled.destroy();

        const noListener = ui.Tabs({ document, selectedId: 'one', items: [{ id: 'one', label: 'One' }] });
        noListener.tabs[0].click();
        noListener.destroy();
    });

    it('covers form-field ownership, optional content, existing descriptions, and disposal', () => {
        const document = new FakeDocument();
        assert.throws(() => ui.FormField({ document, label: 'Missing' }), /must be a DOM node/);
        assert.throws(() => ui.FormField({ document, control: new FakeDocument().createElement('input'), label: 'Foreign' }), /different document/);
        assert.throws(() => ui.FormField({ document, control: document.createElement('input'), label: '' }), /non-empty string/);

        const input = document.createElement('input');
        input.id = 'existing-control';
        input.setAttribute('aria-describedby', 'existing-help existing-help');
        const field = ui.FormField({ document, control: input, label: 'Optional', error: 'Initial error' });
        document.body.append(field.element);
        assert.equal(field.description, null);
        assert.equal(field.control.required, false);
        assert.match(field.control.getAttribute('aria-describedby'), /^existing-help /);
        assert.equal(field.error.hidden, false);
        field.setError(null);
        assert.equal(field.error.hidden, true);
        field.setLabel('Renamed');
        assert.equal(field.label.textContent, 'Renamed');
        assert.throws(() => field.setLabel(''), /non-empty string/);
        field.destroy();
        assert.equal(field.element.parentNode, null);
    });

    it('validates direct toast portals, scheduling, replacement, timeout, and cleanup', () => {
        const document = new FakeDocument();
        const root = ui.createUiRoot({ document });
        assert.throws(() => ui.ToastRegion({ root: { document } }), /not a compatible Primer UI root/);
        assert.throws(() => ui.ToastRegion({ document }), /portal must be a DOM node/);
        assert.throws(() => ui.ToastRegion({ document, portal: document.createElement('div') }), /must be a Primer UI portal/);
        assert.throws(() => ui.ToastRegion({ document, portal: new FakeDocument().createElement('div') }), /different document/);
        assert.throws(() => ui.ToastRegion({ root, maxVisible: 0 }), /positive integer/);
        assert.throws(() => ui.ToastRegion({ root, maxVisible: 1.5 }), /positive integer/);
        assert.throws(() => ui.ToastRegion({ root, schedule: true }), /scheduling functions/);
        assert.throws(() => ui.ToastRegion({ root, cancelSchedule: true }), /scheduling functions/);

        const portal = makePortal(document);
        const timers = new Map();
        let timerId = 0;
        const reasons = [];
        const region = ui.ToastRegion({
            document,
            portal,
            label: 'Activity',
            maxVisible: 3,
            schedule(callback) { timerId += 1; timers.set(timerId, callback); return timerId; },
            cancelSchedule(id) { timers.delete(id); }
        });
        assert.equal(region.element.getAttribute('aria-label'), 'Activity');
        assert.equal(region.dismiss('missing'), false);
        assert.throws(() => region.show(''), /non-empty string/);
        assert.throws(() => region.show('Bad tone', { tone: 'warning' }), /Unsupported toast tone/);
        assert.throws(() => region.show('Bad duration', { duration: -1 }), /non-negative finite/);
        assert.throws(() => region.show('Bad duration', { duration: 'never' }), /non-negative finite/);
        assert.throws(() => region.show('Bad duration', { duration: Infinity }), /non-negative finite/);

        const timed = region.show('Timed', { id: 'same', duration: 50, onDismiss: reason => reasons.push(reason) });
        assert.equal(timers.size, 1);
        const replacement = region.show('Replacement', { id: 'same', duration: 0, tone: 'success', onDismiss: reason => reasons.push(reason) });
        assert.equal(timed.element.parentNode, null);
        assert.deepEqual(reasons, ['replace']);
        assert.equal(replacement.element.getAttribute('role'), 'status');

        const danger = region.show('Danger', { tone: 'danger', duration: 0, dismissLabel: 'Close danger' });
        assert.equal(danger.element.getAttribute('role'), 'alert');
        const dangerClose = danger.element.querySelector('button');
        assert.equal(dangerClose.getAttribute('aria-label'), 'Close danger');
        dangerClose.click();
        assert.equal(danger.element.parentNode, null);

        const timeout = region.show('Timeout', { duration: 25, onDismiss: reason => reasons.push(reason) });
        const timeoutCallback = timers.values().next().value;
        timeoutCallback();
        assert.equal(timeout.element.parentNode, null);
        assert.ok(reasons.includes('timeout'));

        replacement.dismiss();
        assert.equal(replacement.dismiss(), false);
        const first = region.show('One', { duration: 0 });
        const second = region.show('Two', { duration: 0 });
        region.clear();
        assert.equal(first.element.parentNode, null);
        assert.equal(second.element.parentNode, null);
        region.destroy();
        region.destroy();
        assert.equal(region.element.parentNode, null);

        const movedRegion = ui.ToastRegion({ document, portal, maxVisible: 1 });
        document.body.append(movedRegion.element);
        movedRegion.destroy();
        assert.equal(movedRegion.element.parentNode, document.body);

        const noRemoveRegion = ui.ToastRegion({ document, portal, maxVisible: 1 });
        noRemoveRegion.element.remove = undefined;
        noRemoveRegion.destroy();
        assert.equal(noRemoveRegion.element.parentNode, portal);

        const defaultTimers = ui.ToastRegion({ root });
        const defaultToast = defaultTimers.show('Default duration');
        defaultToast.dismiss('cleanup');
        defaultTimers.destroy();
        root.destroy();
    });

    it('validates dialog construction, direct portals, content forms, and duplicate ids', () => {
        withGlobalDocument(undefined, () => {
            assert.throws(() => new ui.DialogManager(), /DOM document/);
        });
        const document = new FakeDocument();
        const root = ui.createUiRoot({ document });
        assert.throws(() => new ui.DialogManager({ document, root: { document } }), /not a compatible Primer UI root/);
        assert.throws(() => new ui.DialogManager({ document, root: ui.createUiRoot({ document: new FakeDocument() }) }), /not a compatible Primer UI root/);
        assert.throws(() => new ui.DialogManager({ document }), /portal must be a DOM node/);
        assert.throws(() => new ui.DialogManager({ document, portal: document.createElement('div') }), /must be a Primer UI portal/);
        assert.throws(() => new ui.DialogManager({ document, portal: new FakeDocument().createElement('div') }), /different document/);

        const portal = makePortal(document);
        assert.throws(() => new ui.DialogManager({ document, portal }), /inertRoot must be a DOM node/);
        assert.throws(() => new ui.DialogManager({ document, portal, inertRoot: new FakeDocument().createElement('div') }), /different document/);
        assert.throws(() => new ui.DialogManager({ document, portal, inertRoot: portal }), /cannot contain the portal/);
        assert.throws(() => new ui.DialogManager({ document, portal, inertRoot: document.body }), /cannot contain the portal/);

        const inertRoot = document.createElement('main');
        document.body.append(inertRoot);
        const manager = new ui.DialogManager({ document, portal, inertRoot });
        assert.equal(manager.destroyed, false);
        assert.equal(manager.top, null);
        assert.throws(() => manager.open(), /title or ariaLabel/);
        assert.throws(() => manager.open({ title: 'Bad close', onClose: true }), /onClose must be a function/);
        const stringDialog = manager.open({ title: 'Text', describedBy: 'dialog-help', content: 'Body' });
        assert.equal(manager.top, stringDialog);
        assert.equal(stringDialog.element.getAttribute('aria-describedby'), 'dialog-help');
        assert.equal(stringDialog.element.querySelector('.primer-ui-dialog__body').textContent, 'Body');
        assert.throws(() => manager.open({ id: stringDialog.id, title: 'Duplicate' }), /already open/);
        assert.equal(stringDialog.close(), true);
        assert.equal(stringDialog.close(), false);
        assert.equal(manager.closeTop(), false);
        const closeTopDialog = manager.open({ ariaLabel: 'Close top' });
        assert.equal(manager.closeTop('close-top'), true);
        assert.equal(closeTopDialog.open, false);

        const nullActiveButton = document.createElement('button');
        const nullActiveDialog = manager.open({ ariaLabel: 'Null active element', content: nullActiveButton });
        document.activeElement = null;
        const nullActiveTab = new FakeEvent('keydown', { key: 'Tab' });
        document.dispatchEvent(nullActiveTab);
        assert.equal(document.activeElement, nullActiveButton);
        nullActiveDialog.close('done');

        const nullContent = manager.open({ ariaLabel: 'Null', content: () => null });
        assert.equal(nullContent.element.children.length, 0);
        nullContent.close('done');
        const functionString = manager.open({ ariaLabel: 'Function string', content: () => 'Rendered' });
        assert.equal(functionString.element.textContent, 'Rendered');
        functionString.close('done');
        const contentNode = document.createElement('div');
        const functionNode = manager.open({ ariaLabel: 'Function node', content: () => contentNode });
        assert.equal(functionNode.element.contains(contentNode), true);
        functionNode.close('done');
        assert.throws(() => manager.open({ ariaLabel: 'Foreign', content: new FakeDocument().createElement('div') }), /different document/);

        const moved = manager.open({ ariaLabel: 'Moved overlay' });
        document.body.append(moved.overlay);
        moved.close('done');
        assert.equal(moved.overlay.parentNode, document.body);
        const noRemove = manager.open({ ariaLabel: 'No remove' });
        noRemove.overlay.remove = undefined;
        noRemove.close('done');
        assert.equal(noRemove.overlay.parentNode, portal);
        manager.destroy();
        assert.equal(manager.destroyed, true);
        root.destroy();

        const implicitManager = withGlobalDocument(document, () => new ui.DialogManager({ root: ui.createUiRoot({ document }) }));
        implicitManager.destroy();
        implicitManager.portal.getRootNode?.();
    });

    it('covers dialog focus resolution, backdrop policies, keyboard edges, and cleanup', () => {
        const document = new FakeDocument();
        const root = ui.createUiRoot({ document });
        const manager = ui.createDialogManager({ root });
        const opener = document.createElement('button');
        root.mount(opener);
        opener.focus();

        const noActions = manager.open({ ariaLabel: 'No actions', content: null });
        assert.equal(document.activeElement, noActions.element);
        const noCandidateTab = new FakeEvent('keydown', { key: 'Tab' });
        document.dispatchEvent(noCandidateTab);
        assert.equal(noCandidateTab.defaultPrevented, true);
        assert.equal(noActions.close('done'), true);

        const content = document.createElement('div');
        const first = document.createElement('button');
        const middle = document.createElement('button');
        const last = document.createElement('button');
        content.append(first, middle, last);
        const functional = manager.open({
            ariaLabel: 'Functional focus',
            content,
            initialFocus: dialog => dialog.querySelector('button')
        });
        assert.equal(document.activeElement, first);
        middle.focus();
        const middleTab = new FakeEvent('keydown', { key: 'Tab' });
        document.dispatchEvent(middleTab);
        assert.equal(middleTab.defaultPrevented, false);
        document.body.focus();
        root.boundary.activeElement = null;
        const outsideReverse = new FakeEvent('keydown', { key: 'Tab', shiftKey: true });
        document.dispatchEvent(outsideReverse);
        assert.equal(root.boundary.activeElement, last);
        const ignored = new FakeEvent('keydown', { key: 'Enter' });
        document.dispatchEvent(ignored);
        assert.equal(ignored.defaultPrevented, false);
        functional.close('done');

        const invalidSelector = manager.open({ ariaLabel: 'Bad selector', initialFocus: '[' });
        assert.equal(document.activeElement, invalidSelector.element);
        invalidSelector.close('done');
        const outside = document.createElement('button');
        root.mount(outside);
        const outsideCandidate = manager.open({ ariaLabel: 'Outside candidate', initialFocus: outside });
        assert.equal(document.activeElement, outsideCandidate.element);
        outsideCandidate.close('done');

        const disabledContent = document.createElement('div');
        const disabled = document.createElement('button');
        disabled.disabled = true;
        const hidden = document.createElement('button');
        hidden.hidden = true;
        const inert = document.createElement('button');
        inert.inert = true;
        const disconnected = document.createElement('button');
        disabledContent.append(disabled, hidden, inert);
        const invalidCandidate = manager.open({ ariaLabel: 'Invalid candidates', content: disabledContent, initialFocus: disconnected });
        assert.equal(document.activeElement, invalidCandidate.element);
        invalidCandidate.element.querySelectorAll = undefined;
        const missingQuery = new FakeEvent('keydown', { key: 'Tab' });
        document.dispatchEvent(missingQuery);
        assert.equal(missingQuery.defaultPrevented, true);
        invalidCandidate.close('done');

        const persistent = manager.open({ ariaLabel: 'Persistent', closeOnEscape: false, closeOnBackdrop: false });
        const escape = new FakeEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, false);
        persistent.overlay.dispatchEvent(new FakeEvent('click', { target: persistent.overlay }));
        assert.equal(persistent.open, true);
        persistent.overlay.dispatchEvent(new FakeEvent('click', { target: persistent.element }));
        assert.equal(persistent.open, true);
        persistent.close('done');

        const lower = manager.open({ ariaLabel: 'Lower' });
        const upper = manager.open({ ariaLabel: 'Upper' });
        lower.overlay.dispatchEvent(new FakeEvent('click', { target: lower.overlay }));
        assert.equal(lower.open, true);
        upper.overlay.dispatchEvent(new FakeEvent('click', { target: upper.overlay }));
        assert.equal(upper.open, false);
        assert.equal(lower.open, true);
        lower.close('done');

        const focusFallback = manager.open({ ariaLabel: 'Focus fallback' });
        const noNestedRestore = manager.open({ ariaLabel: 'Nested without restore', restoreFocus: false });
        noNestedRestore.close('done');
        assert.equal(root.boundary.activeElement, focusFallback.element);
        focusFallback.close('done');

        const noRestore = manager.open({ ariaLabel: 'No restore', restoreFocus: false });
        noRestore.close('done');
        assert.notEqual(document.activeElement, opener);
        document.dispatchEvent(new FakeEvent('keydown', { key: 'Tab' }));

        const corrupt = manager.open({ ariaLabel: 'Corrupt stack' });
        manager._stack.length = 0;
        assert.equal(corrupt.close('done'), false);
        corrupt.overlay.remove();
        manager._backgroundState = { property: false, attribute: false, ariaHidden: null };
        manager.destroy();
        assert.equal(root.surface.inert, false);
        assert.equal(document.listenerCount('keydown'), 0);
        root.destroy();
    });

    it('covers locale defaults, invalid catalogs, replacement, lookup fallbacks, and snapshots', () => {
        assert.throws(() => ui.normalizeLocale(null), /non-empty string/);
        assert.throws(() => ui.normalizeLocale(' '), /non-empty string/);
        assert.equal(ui.createLocaleStore({ messages: null }).has('dialog.close'), true);
        assert.throws(() => ui.createLocaleStore({ messages: 'invalid' }), /messages must be an object/);
        assert.throws(() => ui.createLocaleStore({ messages: [] }), /messages must be an object/);
        assert.throws(() => ui.createLocaleStore({ messages: { en: null } }), /Catalog for en must be an object/);
        assert.throws(() => ui.createLocaleStore({ messages: { en: [] } }), /Catalog for en must be an object/);
        assert.throws(() => ui.createLocaleStore({ messages: { en: { '': 'bad' } } }), /Message key must be a non-empty string/);
        assert.throws(() => ui.createLocaleStore({ messages: { en: { bad: 42 } } }), /must be a string/);

        const defaults = ui.createLocaleStore();
        assert.equal(defaults.locale, 'en');
        assert.equal(defaults.fallbackLocale, 'en');
        assert.equal(defaults.has('dialog.close'), true);
        assert.equal(defaults.has('missing'), false);
        assert.throws(() => defaults.has(''), /non-empty string/);
        assert.throws(() => defaults.t('dialog.close', 'bad params'), /params must be an object/);
        assert.throws(() => defaults.t('dialog.close', []), /params must be an object/);
        assert.equal(defaults.t('dialog.close', null), 'Close dialog');
        assert.equal(defaults.t('unknown', {}, 42), 'unknown');
        assert.throws(() => defaults.subscribe(null), /listener must be a function/);
        assert.deepEqual(defaults.getSnapshot(), {
            locale: 'en', previousLocale: null, fallbackLocale: 'en', direction: 'ltr'
        });

        const store = ui.createLocaleStore({
            initialLocale: 'en-GB',
            fallbackLocale: 'fr-CA',
            messages: {
                en: { shared: 'English {name} {missing}' },
                'fr-CA': { fallback: 'Canadien' },
                fr: { languageFallback: 'Français' }
            }
        });
        assert.equal(store.fallbackLocale, 'fr-CA');
        assert.equal(store.t('shared', { name: 'Ada' }), 'English Ada {missing}');
        assert.equal(store.has('fallback', 'de-DE'), true);
        assert.equal(store.has('languageFallback', 'de-DE'), true);
        store.addMessages('en', { old: 'Old', shared: 'Merged' });
        assert.equal(store.t('old'), 'Old');
        store.addMessages('en', { fresh: 'Fresh' }, { replace: true });
        assert.equal(store.has('old'), false);
        assert.equal(store.t('fresh'), 'Fresh');
        assert.equal(store.setLocale('en_GB'), false);
        assert.equal(store.setLocale('he'), true);
        assert.equal(store.direction, 'rtl');
        const snapshots = [];
        const unsubscribe = store.subscribe(snapshot => snapshots.push(snapshot));
        store.setLocale('en');
        assert.equal(snapshots[0].previousLocale, 'he');
        assert.equal(unsubscribe(), true);
        assert.equal(unsubscribe(), false);
        store.setLocale('fa');
        assert.equal(snapshots.length, 1);
    });
});
