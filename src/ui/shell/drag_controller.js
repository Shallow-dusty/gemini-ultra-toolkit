export function applyPanelPosition(options = {}) {
    const element = options.element;
    const position = options.position;
    if (!element?.style) throw new TypeError('Panel position requires an element');
    if (!position || typeof position !== 'object') throw new TypeError('Panel position requires coordinates');
    const viewport = options.viewport || globalThis.window;
    const fallback = options.fallback;
    const savedLeft = Number.parseFloat(position.left) || 0;
    const savedTop = Number.parseFloat(position.top) || 0;
    const outside = position.left !== 'auto' && position.top !== 'auto'
        && (savedLeft > viewport.innerWidth - 50 || savedTop > viewport.innerHeight - 50);
    const resolved = outside ? fallback : position;
    if (outside) {
        options.onReset?.(fallback);
        options.onWarning?.('Panel off-screen detected. Resetting.');
    }
    element.style.top = resolved.top;
    element.style.left = resolved.left;
    element.style.bottom = resolved.bottom;
    element.style.right = resolved.right;
    return resolved;
}

export function createDragController(options = {}) {
    const documentRef = options.document || globalThis.document;
    const windowRef = options.window || globalThis.window;
    if (!documentRef?.addEventListener) throw new TypeError('Drag controller requires a document');
    if (!windowRef) throw new TypeError('Drag controller requires a window');
    const persist = options.persist || (() => {});
    if (typeof persist !== 'function') throw new TypeError('Drag controller persist must be a function');
    let move = null;
    let up = null;
    let handle = null;

    function destroy() {
        if (move) documentRef.removeEventListener('pointermove', move);
        if (up) documentRef.removeEventListener('pointerup', up);
        if (handle) handle.onpointerdown = null;
        move = null;
        up = null;
        handle = null;
    }

    function attach(element, nextHandle) {
        if (!element?.style || !nextHandle?.style) throw new TypeError('Drag controller requires element and handle');
        destroy();
        handle = nextHandle;
        handle.style.touchAction = 'none';
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;

        handle.onpointerdown = event => {
            dragging = true;
            startX = event.clientX;
            startY = event.clientY;
            const rect = element.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            element.style.bottom = 'auto';
            element.style.right = 'auto';
            element.style.left = `${initialLeft}px`;
            element.style.top = `${initialTop}px`;
            handle.style.cursor = 'grabbing';
            handle.setPointerCapture?.(event.pointerId);
        };
        move = event => {
            if (!dragging) return;
            event.preventDefault();
            const maxLeft = Math.max(0, windowRef.innerWidth - element.offsetWidth);
            const maxTop = Math.max(10, windowRef.innerHeight - element.offsetHeight);
            const left = Math.min(Math.max(0, initialLeft + event.clientX - startX), maxLeft);
            const top = Math.min(Math.max(10, initialTop + event.clientY - startY), maxTop);
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
        };
        up = () => {
            if (!dragging) return;
            dragging = false;
            handle.style.cursor = 'grab';
            persist({
                top: element.style.top,
                left: element.style.left,
                bottom: 'auto',
                right: 'auto'
            });
        };
        documentRef.addEventListener('pointermove', move);
        documentRef.addEventListener('pointerup', up);
        return element;
    }

    return Object.freeze({ attach, destroy });
}
