export const MODULE_ICON_MAP = Object.freeze({
    counter: 'chart',
    export: 'upload',
    folders: 'folder',
    'prompt-vault': 'gem',
    'default-model': 'bot',
    'batch-delete': 'trash',
    'quote-reply': 'quote',
    'ui-tweaks': 'palette',
    'chat-notes': 'pin',
    'message-queue': 'package'
});

export function setIconText(element, iconName, text, iconSize = 14, options = {}) {
    const documentRef = options.document || element?.ownerDocument || globalThis.document;
    const createIcon = options.createIcon;
    if (!element || typeof element.appendChild !== 'function') {
        throw new TypeError('setIconText requires a DOM element');
    }
    if (typeof createIcon !== 'function') throw new TypeError('setIconText requires createIcon');
    element.textContent = '';
    element.appendChild(createIcon(iconName, iconSize));
    if (text) element.appendChild(documentRef.createTextNode(` ${text}`));
    return element;
}

export function renderModuleIcon(module, size = 16, options = {}) {
    const documentRef = options.document || globalThis.document;
    const createIcon = options.createIcon;
    if (!module || typeof module !== 'object') throw new TypeError('renderModuleIcon requires a module');
    if (typeof createIcon !== 'function') throw new TypeError('renderModuleIcon requires createIcon');
    const name = MODULE_ICON_MAP[module.id];
    if (name) return createIcon(name, size);
    const fallback = documentRef.createElement('span');
    fallback.textContent = module.icon || '';
    return fallback;
}
