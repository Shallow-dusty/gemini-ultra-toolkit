class FakeEvent {
    constructor(type, init = {}) {
        this.type = type;
        Object.assign(this, init);
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
        const propertyHandler = this[`on${event.type}`];
        if (typeof propertyHandler === 'function') propertyHandler.call(this, event);
        return !event.defaultPrevented;
    }

    listenerCount(type) { return this._listeners.get(type)?.size || 0; }
}

class FakeClassList {
    constructor(element) { this.element = element; }

    _values() { return String(this.element.className || '').split(/\s+/).filter(Boolean); }
    contains(value) { return this._values().includes(value); }
    add(...values) { this.element.className = [...new Set([...this._values(), ...values])].join(' '); }
    remove(...values) {
        const removed = new Set(values);
        this.element.className = this._values().filter(value => !removed.has(value)).join(' ');
    }
    toggle(value, force) {
        const enabled = force === undefined ? !this.contains(value) : Boolean(force);
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
        this.dataset = {};
        this.className = '';
        this.classList = new FakeClassList(this);
        this.style = { cssText: '' };
        this.id = '';
        this.type = '';
        this.name = '';
        this.title = '';
        this.placeholder = '';
        this.value = '';
        this.disabled = false;
        this.hidden = false;
        this.inert = false;
        this.checked = false;
        this.required = false;
        this.selected = false;
        this._textContent = '';
        this._tabIndex = null;
        this.rect = { top: 20, left: 20, right: 120, bottom: 50, width: 100, height: 30 };
        this.offsetWidth = 100;
        this.offsetHeight = 30;
        this.scrollWidth = 500;
        this.scrollLeft = 0;
        this.scrollCalls = 0;
        this.capturedPointer = null;
    }

    get childNodes() { return this.children; }
    get firstChild() { return this.children[0] || null; }
    get lastChild() { return this.children.at(-1) || null; }
    get nodeValue() { return this._textContent; }
    set nodeValue(value) { this.textContent = value; }
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
        const normalized = String(name);
        const text = String(value);
        this.attributes.set(normalized, text);
        if (normalized === 'id') this.id = text;
        if (normalized === 'class') this.className = text;
        if (normalized.startsWith('data-')) {
            const key = normalized.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
            this.dataset[key] = text;
        }
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) {
        const normalized = String(name);
        this.attributes.delete(normalized);
        if (normalized === 'id') this.id = '';
        if (normalized === 'class') this.className = '';
    }

    append(...nodes) {
        for (const node of nodes) {
            node.parentNode?.removeChild?.(node);
            node.parentNode = this;
            this.children.push(node);
        }
    }
    appendChild(node) { this.append(node); return node; }
    prepend(...nodes) {
        for (const node of [...nodes].reverse()) {
            node.parentNode?.removeChild?.(node);
            node.parentNode = this;
            this.children.unshift(node);
        }
    }
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
        if (!this.disabled) this.dispatchEvent(new FakeEvent('click', { target: this }));
    }
    getBoundingClientRect() { return { ...this.rect }; }
    scrollIntoView() { this.scrollCalls += 1; }
    setPointerCapture(pointerId) { this.capturedPointer = pointerId; }

    _descendants() { return this.children.flatMap(child => [child, ...child._descendants()]); }
    _matchesSingle(selector) {
        const value = selector.trim();
        if (value.startsWith('#')) return this.id === value.slice(1);
        if (value.startsWith('.')) return this.classList.contains(value.slice(1));
        const tagClass = value.match(/^([a-z0-9-]+)\.([a-z0-9_-]+)$/i);
        if (tagClass) return this.tagName === tagClass[1].toUpperCase() && this.classList.contains(tagClass[2]);
        if (value === 'a[href]') return this.tagName === 'A' && this.hasAttribute('href');
        const enabled = value.match(/^(button|input|select|textarea):not\(\[disabled\]\)$/i);
        if (enabled) return this.tagName === enabled[1].toUpperCase() && !this.disabled;
        if (value === '[tabindex]:not([tabindex="-1"])') return this._tabIndex != null && this.tabIndex !== -1;
        const attribute = value.match(/^([a-z0-9-]+)?\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/i);
        if (attribute) {
            if (attribute[1] && this.tagName !== attribute[1].toUpperCase()) return false;
            if (!this.hasAttribute(attribute[2])) return false;
            return attribute[3] == null || this.getAttribute(attribute[2]) === attribute[3];
        }
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
        this.head = new FakeElement('head', this);
        this.body = new FakeElement('body', this);
        this.documentElement.append(this.head, this.body);
        this.activeElement = this.body;
        this.defaultView = null;
    }

    createElement(tagName) { return new FakeElement(tagName, this); }
    createElementNS(_namespace, tagName) { return new FakeElement(tagName, this); }
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

class FakeWindow extends FakeEventTarget {
    constructor(document) {
        super();
        this.document = document;
        this.innerWidth = 1024;
        this.innerHeight = 768;
        document.defaultView = this;
    }
}

function createFakeDom() {
    const document = new FakeDocument();
    const window = new FakeWindow(document);
    return { document, window };
}

function createUiStub(document, locale = 'en') {
    const dialogs = new Map();
    const localeListeners = new Set();
    const toasts = [];
    let currentLocale = locale;
    const ui = {
        _activeTour: null,
        t(zh, en) { return currentLocale.startsWith('zh') ? zh : en; },
        getLocale() { return currentLocale; },
        setLocale(next) {
            currentLocale = next;
            for (const listener of [...localeListeners]) listener(next);
        },
        subscribeLocale(listener) {
            localeListeners.add(listener);
            return () => localeListeners.delete(listener);
        },
        getDialog(id) { return dialogs.get(id) || null; },
        openDialog(options) {
            if (options.replaceExisting) {
                for (const handle of [...dialogs.values()]) handle.close('replaced');
            }
            const element = options.contentElement;
            element.setAttribute('role', 'dialog');
            element.setAttribute('aria-label', options.ariaLabel);
            document.body.appendChild(element);
            const handle = {
                id: options.id,
                element,
                open: true,
                close(reason = 'programmatic') {
                    if (!handle.open) return false;
                    handle.open = false;
                    dialogs.delete(options.id);
                    element.remove();
                    options.onClose?.(reason);
                    return true;
                }
            };
            dialogs.set(options.id, handle);
            options.initialFocus?.focus?.();
            return handle;
        },
        closeAllDialogs(reason) {
            for (const handle of [...dialogs.values()]) handle.close(reason);
        },
        showToast(message) { toasts.push(message); }
    };
    return { ui, dialogs, localeListeners, toasts };
}

function iconFactory(document) {
    return (name, size) => {
        const icon = document.createElement('svg');
        icon.dataset.icon = name;
        icon.dataset.size = String(size);
        return icon;
    };
}

module.exports = {
    FakeClassList,
    FakeDocument,
    FakeElement,
    FakeEvent,
    FakeEventTarget,
    FakeWindow,
    createFakeDom,
    createUiStub,
    iconFactory
};
