import { fail } from './errors.js';
import { normalizeRules } from './model.js';

export const COLLECTIONS_VIEW_IDS = Object.freeze({
    root: 'gc-collections-view',
    sidebarFilter: 'gc-folder-filter',
    styles: 'gc-collections-styles'
});

const HANDLER_NAMES = Object.freeze([
    'onSubmit', 'onCancelEdit', 'onEdit', 'onDelete', 'onToggle', 'onMove',
    'onAssignChat', 'onOpenChat', 'onSearch', 'onFilter', 'onExport',
    'onImport', 'onAutoClassify', 'onApplyRulePreview', 'onCancelRulePreview', 'onUndo', 'onPin'
]);

const noop = () => undefined;

export function normalizeViewHandlers(handlers = {}) {
    const output = {};
    for (const name of HANDLER_NAMES) {
        const handler = handlers[name];
        if (handler !== undefined && typeof handler !== 'function') {
            throw new TypeError(`Collections view ${name} must be a function`);
        }
        output[name] = handler ?? noop;
    }
    return output;
}

export function setAttributes(element, attributes) {
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    return element;
}

export function createButton(documentRef, label, action, attributes = {}) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.textContent = label;
    setAttributes(button, attributes);
    button.onclick = event => {
        event?.stopPropagation?.();
        action();
    };
    return button;
}

export function appendLabel(documentRef, parent, text, control) {
    const label = documentRef.createElement('label');
    const caption = documentRef.createElement('span');
    caption.textContent = text;
    label.append(caption, control);
    parent.appendChild(label);
    return label;
}

export function descendantsOf(tree, id, output = new Set()) {
    for (const node of tree) {
        if (node.id === id) {
            const visit = value => {
                for (const child of value.children) {
                    output.add(child.id);
                    visit(child);
                }
            };
            visit(node);
            return output;
        }
        descendantsOf(node.children, id, output);
    }
    return output;
}

export function flattenCollectionTree(tree, depth = 1, output = []) {
    for (const node of tree) {
        output.push({ collection: node, depth });
        flattenCollectionTree(node.children, depth + 1, output);
    }
    return output;
}

export function parseTagsDraft(value) {
    return String(value ?? '').split(',').map(tag => tag.trim()).filter(Boolean);
}

export function formatRulesDraft(rules) {
    return rules?.length ? JSON.stringify(rules, null, 2) : '';
}

export function parseRulesDraft(value) {
    const text = String(value ?? '').trim();
    if (!text) return [];
    try {
        return normalizeRules(JSON.parse(text));
    } catch (error) {
        fail('INVALID_RULES_JSON', 'Rules must be a valid JSON array', {}, error);
    }
}

export function collectionsViewCss() {
    return `
        #${COLLECTIONS_VIEW_IDS.root} { display:grid; gap:10px; color:var(--text-main,#202124); }
        #${COLLECTIONS_VIEW_IDS.root} button, #${COLLECTIONS_VIEW_IDS.root} input,
        #${COLLECTIONS_VIEW_IDS.root} select, #${COLLECTIONS_VIEW_IDS.root} textarea { font:inherit; }
        .gc-collections-toolbar, .gc-collection-actions, .gc-collection-meta { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
        .gc-collections-form { display:grid; gap:8px; padding:10px; border:1px solid var(--divider,#dadce0); border-radius:10px; }
        .gc-rule-preview { display:grid; gap:6px; padding:10px; border:1px solid var(--accent,#8ab4f8); border-radius:10px; }
        .gc-rule-preview ul { max-height:240px; overflow:auto; margin:0; padding-left:22px; }
        .gc-collections-form label { display:grid; gap:3px; }
        .gc-collections-form input, .gc-collections-form select, .gc-collections-form textarea { width:100%; box-sizing:border-box; }
        .gc-collection-tree, .gc-collection-tree ul, .gc-chat-list { list-style:none; margin:0; padding:0; }
        .gc-collection-tree ul { padding-left:16px; }
        .gf-folder-row { display:grid; gap:5px; padding:8px; margin:4px 0; border:1px solid var(--divider,#dadce0); border-radius:9px; }
        .gc-collection-heading { display:flex; gap:6px; align-items:center; }
        .gc-collection-heading > [data-tree-focus] { flex:1; text-align:left; }
        .gc-collection-tag { border-radius:999px; padding:1px 6px; background:var(--input-bg,#f1f3f4); }
        .gc-chat-button { width:100%; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .gc-collections-empty { padding:12px; border:1px dashed var(--divider,#dadce0); border-radius:9px; }
        .gf-sidebar-dot { width:6px; height:6px; border-radius:50%; margin-right:6px; flex:0 0 auto; }
        #${COLLECTIONS_VIEW_IDS.sidebarFilter} { display:flex; gap:4px; overflow:auto; padding:4px; }
        #${COLLECTIONS_VIEW_IDS.sidebarFilter} button[aria-pressed="true"] { font-weight:700; text-decoration:underline; }
    `;
}
