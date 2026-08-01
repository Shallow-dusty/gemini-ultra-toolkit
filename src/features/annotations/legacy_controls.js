export const INPUT_STYLE = 'width:100%;min-height:44px;box-sizing:border-box;border-radius:8px;border:1px solid var(--divider,rgba(255,255,255,0.14));background:var(--input-bg,rgba(255,255,255,0.06));color:var(--text-main,#fff);font:inherit;font-size:13px;padding:9px;';

const CONTROL_SIZE_STYLE = 'min-width:44px;min-height:44px;font:inherit;';
const FIELD_STYLE = 'display:grid;gap:4px;margin:8px 0;';

export function splitTags(value) {
    return String(value || '').split(',').map(tag => tag.trim()).filter(Boolean);
}

/** Semantic form/control primitives shared by annotation UI surfaces. */
export function createLegacyAnnotationsControls(host) {
    return Object.freeze({
        nextControlId(kind) {
            host._controlSequence += 1;
            return `primer-annotation-${kind}-${host._controlSequence}`;
        },

        appendField(container, labelText, control, description = '') {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = FIELD_STYLE;
            if (!control.id) control.id = host._nextControlId('field');
            const label = document.createElement('label');
            label.htmlFor = control.id;
            label.textContent = labelText;
            label.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-main,#fff);';
            wrapper.appendChild(label);
            if (description) {
                const hint = document.createElement('span');
                hint.id = `${control.id}-hint`;
                hint.textContent = description;
                hint.style.cssText = 'font-size:11px;color:var(--text-sub,#9aa0a6);';
                control.setAttribute('aria-describedby', hint.id);
                wrapper.appendChild(hint);
            }
            wrapper.appendChild(control);
            container.appendChild(wrapper);
            return wrapper;
        },

        makeButton(label, onClick, options = {}) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = options.className || 'g-btn';
            button.style.cssText = `${CONTROL_SIZE_STYLE}${options.style || ''}`;
            button.textContent = label;
            button.disabled = options.disabled === true;
            if (options.title) button.title = options.title;
            button.setAttribute('aria-label', options.ariaLabel || options.title || label);
            if (options.pressed !== undefined) button.setAttribute('aria-pressed', String(options.pressed));
            button.onclick = event => {
                event.stopPropagation();
                if (!button.disabled) return onClick(event);
                return undefined;
            };
            return button;
        }
    });
}
