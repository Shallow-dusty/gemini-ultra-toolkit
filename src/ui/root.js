import { BASE_UI_CSS, UI_NAMESPACE, createTokenCss } from './tokens.js';

const ROOT_ATTRIBUTE = `data-${UI_NAMESPACE}-root`;
const SURFACE_ATTRIBUTE = `data-${UI_NAMESPACE}-surface`;
const PORTAL_ATTRIBUTE = `data-${UI_NAMESPACE}-portal`;

function requireDocument(documentRef) {
    if (!documentRef || typeof documentRef.createElement !== 'function') {
        throw new TypeError('A DOM document is required to create the Primer UI root');
    }
    return documentRef;
}

function requireMount(documentRef, mount) {
    if (!mount || typeof mount.append !== 'function') {
        throw new TypeError('The Primer UI mount must be a DOM element');
    }
    if (mount.ownerDocument && mount.ownerDocument !== documentRef) {
        throw new TypeError('The Primer UI mount belongs to a different document');
    }
    return mount;
}

function assertOwnedNode(documentRef, node) {
    if (!node || typeof node !== 'object') {
        throw new TypeError('Only DOM nodes can be mounted in the Primer UI root');
    }
    if (node.ownerDocument && node.ownerDocument !== documentRef) {
        throw new TypeError('Cannot mount a node from a different document');
    }
}

function appendStyles(documentRef, boundary, tokenOverrides, styles) {
    const style = documentRef.createElement('style');
    style.setAttribute(`data-${UI_NAMESPACE}-styles`, '');
    const extras = Array.isArray(styles) ? styles : [styles];
    for (const extra of extras) {
        if (extra != null && typeof extra !== 'string') {
            throw new TypeError('Primer UI root styles must be strings');
        }
    }
    style.textContent = [createTokenCss(tokenOverrides), BASE_UI_CSS, ...extras.filter(Boolean)].join('\n');
    boundary.append(style);
    return style;
}

export function createUiRoot(options = {}) {
    const documentRef = requireDocument(options.document || globalThis.document);
    const mount = requireMount(documentRef, options.mount || documentRef.body);
    const host = documentRef.createElement('div');
    host.setAttribute(ROOT_ATTRIBUTE, '');
    if (options.id != null) {
        if (typeof options.id !== 'string' || options.id.trim() === '') {
            throw new TypeError('Primer UI root id must be a non-empty string');
        }
        host.id = options.id.trim();
    }

    const boundary = typeof host.attachShadow === 'function'
        ? host.attachShadow({ mode: 'open' })
        : host;
    const style = appendStyles(documentRef, boundary, options.tokens || {}, options.styles || []);

    const surface = documentRef.createElement('div');
    surface.setAttribute(SURFACE_ATTRIBUTE, '');
    const portal = documentRef.createElement('div');
    portal.setAttribute(PORTAL_ATTRIBUTE, '');
    boundary.append(surface, portal);
    mount.append(host);

    let destroyed = false;

    function assertActive() {
        if (destroyed) throw new Error('Primer UI root has been destroyed');
    }

    function mountInto(target, node) {
        assertActive();
        assertOwnedNode(documentRef, node);
        target.append(node);
        return () => {
            if (node.parentNode === target && typeof node.remove === 'function') node.remove();
        };
    }

    const api = {
        namespace: UI_NAMESPACE,
        document: documentRef,
        host,
        boundary,
        style,
        surface,
        portal,
        get destroyed() { return destroyed; },
        mount(node) { return mountInto(surface, node); },
        mountPortal(node) { return mountInto(portal, node); },
        contains(node) {
            if (!node || destroyed) return false;
            return node === host
                || node === boundary
                || (typeof boundary.contains === 'function' && boundary.contains(node));
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (typeof host.remove === 'function') host.remove();
        }
    };

    return Object.freeze(api);
}

export const UI_ROOT_ATTRIBUTES = Object.freeze({
    root: ROOT_ATTRIBUTE,
    surface: SURFACE_ATTRIBUTE,
    portal: PORTAL_ATTRIBUTE
});
