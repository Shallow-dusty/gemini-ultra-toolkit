import { Button, IconButton, Switch } from '../components.js';

function requireFunction(value, label) {
    if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
    return value;
}

export function createModalShell(options = {}) {
    const documentRef = options.document || globalThis.document;
    if (!documentRef?.createElement) throw new TypeError('Modal shell requires a DOM document');
    const createIcon = requireFunction(options.createIcon, 'Modal shell createIcon');
    const onClose = requireFunction(options.onClose, 'Modal shell onClose');
    if (typeof options.title !== 'string' || options.title === '') throw new TypeError('Modal shell requires a title');
    if (typeof options.closeLabel !== 'string' || options.closeLabel === '') {
        throw new TypeError('Modal shell requires a close label');
    }

    const modal = documentRef.createElement('section');
    modal.className = options.modalClass || 'settings-modal';
    const header = documentRef.createElement('header');
    header.className = options.headerClass || 'settings-header';
    const title = documentRef.createElement(options.titleTag || 'h3');
    title.className = options.titleClass || '';
    if (options.titleIcon) {
        const icon = createIcon(options.titleIcon, options.titleIconSize || 16);
        icon.setAttribute('aria-hidden', 'true');
        title.append(icon, documentRef.createTextNode(` ${options.title}`));
    } else {
        title.textContent = options.title;
    }
    const closeHandle = IconButton({
        document: documentRef,
        label: options.closeLabel,
        icon: createIcon('x', options.closeIconSize || 16),
        onPress: onClose
    });
    const closeButton = closeHandle.element;
    closeButton.className += ` ${options.closeClass || 'settings-close'}`;
    header.append(title, closeButton);
    const body = documentRef.createElement(options.bodyTag || 'div');
    body.className = options.bodyClass || 'settings-body';
    modal.append(header, body);

    return Object.freeze({
        modal,
        header,
        title,
        closeButton,
        body,
        destroy({ remove = true } = {}) {
            closeHandle.destroy();
            if (remove) modal.remove();
        }
    });
}

export function createShellButton(options = {}) {
    const handle = Button(options);
    handle.element.className += ` ${options.className || 'settings-btn'}`;
    if (options.icon) {
        handle.element.textContent = '';
        options.icon.setAttribute?.('aria-hidden', 'true');
        handle.element.append(options.icon, handle.element.ownerDocument.createTextNode(` ${options.label}`));
    }
    return handle;
}

export function createShellSwitch(options = {}) {
    const handle = Switch(options);
    handle.element.className += ` ${options.className || 'shell-switch-row'}`;
    handle.control.className += ' toggle-switch';
    handle.control.classList.toggle('on', handle.checked);
    return handle;
}

export function createSection(documentRef, title, options = {}) {
    if (!documentRef?.createElement) throw new TypeError('Section requires a DOM document');
    const section = documentRef.createElement('section');
    section.className = options.className || 'settings-section';
    const heading = documentRef.createElement(options.titleTag || 'h4');
    heading.className = options.titleClass || 'settings-section-title';
    heading.textContent = title || '';
    section.appendChild(heading);
    return Object.freeze({ section, heading });
}
