import { UI_NAMESPACE } from './tokens.js';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

let dialogSequence = 0;

function getDocument(options) {
    const documentRef = options.document || options.root?.document || globalThis.document;
    if (!documentRef || typeof documentRef.createElement !== 'function') {
        throw new TypeError('DialogManager requires a DOM document');
    }
    return documentRef;
}

function assertNode(documentRef, node, label) {
    if (!node || typeof node !== 'object') throw new TypeError(`${label} must be a DOM node`);
    if (node.ownerDocument && node.ownerDocument !== documentRef) {
        throw new TypeError(`${label} belongs to a different document`);
    }
}

function resolveMount(options, documentRef) {
    if (options.root) {
        if (options.root.document !== documentRef || typeof options.root.mountPortal !== 'function') {
            throw new TypeError('DialogManager root is not a compatible Primer UI root');
        }
        return {
            portal: options.root.portal,
            inertRoot: options.inertRoot || options.root.surface,
            mount: node => options.root.mountPortal(node)
        };
    }

    const portal = options.portal;
    assertNode(documentRef, portal, 'DialogManager portal');
    if (!portal.hasAttribute?.(`data-${UI_NAMESPACE}-portal`)) {
        throw new TypeError('DialogManager portal must be a Primer UI portal');
    }
    const inertRoot = options.inertRoot;
    assertNode(documentRef, inertRoot, 'DialogManager inertRoot');
    return {
        portal,
        inertRoot,
        mount(node) {
            portal.append(node);
            return () => {
                if (node.parentNode === portal && typeof node.remove === 'function') node.remove();
            };
        }
    };
}

function preserveInertState(node) {
    return {
        property: Boolean(node.inert),
        attribute: Boolean(node.hasAttribute?.('inert')),
        ariaHidden: node.getAttribute?.('aria-hidden')
    };
}

function makeInert(node) {
    node.inert = true;
    node.setAttribute?.('inert', '');
    node.setAttribute?.('aria-hidden', 'true');
}

function restoreInert(node, state) {
    node.inert = state.property;
    if (state.attribute) node.setAttribute?.('inert', '');
    else node.removeAttribute?.('inert');
    if (state.ariaHidden == null) node.removeAttribute?.('aria-hidden');
    else node.setAttribute?.('aria-hidden', state.ariaHidden);
}

function activeElement(documentRef, boundary) {
    return boundary?.activeElement || documentRef.activeElement || null;
}

function canFocus(node) {
    if (!node || typeof node.focus !== 'function') return false;
    if (node.disabled || node.hidden || node.inert) return false;
    return node.isConnected !== false;
}

function focus(node) {
    if (!canFocus(node)) return false;
    node.focus({ preventScroll: true });
    return true;
}

function focusableElements(dialog) {
    if (typeof dialog.querySelectorAll !== 'function') return [];
    return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(canFocus);
}

function renderContent(documentRef, container, content) {
    if (content == null) return;
    const rendered = typeof content === 'function' ? content({ document: documentRef }) : content;
    if (rendered == null) return;
    if (typeof rendered === 'string') {
        const body = documentRef.createElement('div');
        body.className = 'primer-ui-dialog__body';
        body.textContent = rendered;
        container.append(body);
        return;
    }
    assertNode(documentRef, rendered, 'Dialog content');
    container.append(rendered);
}

export class DialogManager {
    constructor(options = {}) {
        this.document = getDocument(options);
        const mount = resolveMount(options, this.document);
        this.portal = mount.portal;
        this.inertRoot = mount.inertRoot;
        this._mount = mount.mount;
        if (this.inertRoot === this.portal || this.inertRoot.contains?.(this.portal)) {
            throw new TypeError('DialogManager inertRoot cannot contain the portal');
        }
        this.boundary = options.root?.boundary || null;
        this._stack = [];
        this._backgroundState = null;
        this._destroyed = false;
        this._onDocumentKeydown = event => this._handleDocumentKeydown(event);
        this.document.addEventListener('keydown', this._onDocumentKeydown, true);
    }

    get size() { return this._stack.length; }
    get destroyed() { return this._destroyed; }
    get top() {
        const record = this._stack[this._stack.length - 1];
        return record?.handle || null;
    }

    open(options = {}) {
        if (this._destroyed) throw new Error('DialogManager has been destroyed');
        if (!options.title && !options.ariaLabel) {
            throw new TypeError('Dialog requires a title or ariaLabel');
        }
        if (options.onClose != null && typeof options.onClose !== 'function') {
            throw new TypeError('Dialog onClose must be a function');
        }

        dialogSequence += 1;
        const id = options.id || `${UI_NAMESPACE}-dialog-${dialogSequence}`;
        if (this._stack.some(record => record.id === id)) {
            throw new RangeError(`A dialog with id "${id}" is already open`);
        }

        const returnFocus = options.returnFocus ?? activeElement(this.document, this.boundary);
        const overlay = this.document.createElement('div');
        overlay.className = 'primer-ui-dialog-layer';
        overlay.setAttribute('data-dialog-id', id);
        const dialog = this.document.createElement('section');
        dialog.className = 'primer-ui-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.tabIndex = -1;

        if (options.title) {
            const title = this.document.createElement('h2');
            title.className = 'primer-ui-dialog__title';
            title.id = `${id}-title`;
            title.textContent = options.title;
            dialog.setAttribute('aria-labelledby', title.id);
            dialog.append(title);
        } else {
            dialog.setAttribute('aria-label', options.ariaLabel);
        }
        if (options.describedBy) dialog.setAttribute('aria-describedby', options.describedBy);
        renderContent(this.document, dialog, options.content);
        overlay.append(dialog);
        const unmount = this._mount(overlay);

        const record = {
            id,
            overlay,
            dialog,
            returnFocus,
            initialFocus: options.initialFocus || null,
            closeOnEscape: options.closeOnEscape !== false,
            closeOnBackdrop: options.closeOnBackdrop !== false,
            restoreFocus: options.restoreFocus !== false,
            onClose: options.onClose || null,
            unmount,
            onBackdrop: null,
            open: true,
            handle: null
        };

        record.onBackdrop = event => {
            if (event.target === overlay && this._topRecord() === record && record.closeOnBackdrop) {
                this._closeRecord(record, 'backdrop');
            }
        };
        overlay.addEventListener('click', record.onBackdrop);
        record.handle = Object.freeze({
            id,
            element: dialog,
            overlay,
            get open() { return record.open; },
            close: reason => this._closeRecord(record, reason || 'programmatic')
        });

        if (this._stack.length === 0) {
            this._backgroundState = preserveInertState(this.inertRoot);
            makeInert(this.inertRoot);
        }
        this._stack.push(record);
        this._syncStackState();
        this._focusRecord(record);
        return record.handle;
    }

    closeTop(reason = 'programmatic') {
        const top = this._topRecord();
        return top ? this._closeRecord(top, reason) : false;
    }

    _topRecord() { return this._stack[this._stack.length - 1] || null; }

    _syncStackState() {
        const top = this._topRecord();
        for (const record of this._stack) {
            const active = record === top;
            record.overlay.inert = !active;
            if (active) {
                record.overlay.removeAttribute('inert');
                record.overlay.removeAttribute('aria-hidden');
                record.dialog.setAttribute('aria-modal', 'true');
            } else {
                record.overlay.setAttribute('inert', '');
                record.overlay.setAttribute('aria-hidden', 'true');
                record.dialog.setAttribute('aria-modal', 'false');
            }
        }
    }

    _resolveInitialFocus(record) {
        let candidate = record.initialFocus;
        if (typeof candidate === 'function') candidate = candidate(record.dialog);
        if (typeof candidate === 'string') {
            try { candidate = record.dialog.querySelector?.(candidate); }
            catch { candidate = null; }
        }
        if (candidate && record.dialog.contains?.(candidate) && canFocus(candidate)) return candidate;
        return focusableElements(record.dialog)[0] || record.dialog;
    }

    _focusRecord(record) { focus(this._resolveInitialFocus(record)); }

    _resolveReturnFocus(record) {
        return typeof record?.returnFocus === 'function' ? record.returnFocus() : record?.returnFocus;
    }

    _handleDocumentKeydown(event) {
        const top = this._topRecord();
        if (!top) return;
        if (event.key === 'Escape') {
            if (!top.closeOnEscape) return;
            event.preventDefault();
            event.stopPropagation?.();
            this._closeRecord(top, 'escape');
            return;
        }
        if (event.key !== 'Tab') return;

        const candidates = focusableElements(top.dialog);
        if (candidates.length === 0) {
            event.preventDefault();
            focus(top.dialog);
            return;
        }
        const current = activeElement(this.document, this.boundary);
        const first = candidates[0];
        const last = candidates[candidates.length - 1];
        if (event.shiftKey && (current === first || !top.dialog.contains?.(current))) {
            event.preventDefault();
            focus(last);
        } else if (!event.shiftKey && (current === last || !top.dialog.contains?.(current))) {
            event.preventDefault();
            focus(first);
        }
    }

    _closeRecord(record, reason, options = {}) {
        if (!record?.open) return false;
        const index = this._stack.indexOf(record);
        if (index === -1) return false;
        const wasTop = index === this._stack.length - 1;
        record.open = false;
        this._stack.splice(index, 1);
        record.overlay.removeEventListener('click', record.onBackdrop);
        record.unmount();

        if (this._stack.length === 0 && this._backgroundState) {
            restoreInert(this.inertRoot, this._backgroundState);
            this._backgroundState = null;
        }
        this._syncStackState();
        if (record.onClose) record.onClose(reason, record.handle);

        if (wasTop && options.restoreFocus !== false) {
            const top = this._topRecord();
            const returnFocus = this._resolveReturnFocus(record);
            if (top) {
                const returnsInsideTop = top.dialog.contains?.(returnFocus);
                if (!(record.restoreFocus && returnsInsideTop && focus(returnFocus))) this._focusRecord(top);
            } else if (record.restoreFocus) {
                focus(returnFocus);
            }
        }
        return true;
    }

    destroy() {
        if (this._destroyed) return;
        const originalFocus = this._resolveReturnFocus(this._stack[0]) || null;
        this._destroyed = true;
        for (const record of [...this._stack].reverse()) {
            this._closeRecord(record, 'destroy', { restoreFocus: false });
        }
        if (this._backgroundState) {
            restoreInert(this.inertRoot, this._backgroundState);
            this._backgroundState = null;
        }
        this.document.removeEventListener('keydown', this._onDocumentKeydown, true);
        focus(originalFocus);
    }
}

export function createDialogManager(options = {}) {
    return new DialogManager(options);
}
