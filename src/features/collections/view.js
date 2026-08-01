import { renderCollectionForm } from './collection_form_view.js';
import { CollectionTreeView } from './collection_tree_view.js';
import { CollectionsSidebarView } from './sidebar_view.js';
import { renderRulePreview } from './rule_preview_view.js';
import {
    COLLECTIONS_VIEW_IDS,
    collectionsViewCss,
    createButton,
    flattenCollectionTree,
    formatRulesDraft,
    normalizeViewHandlers,
    parseRulesDraft,
    parseTagsDraft
} from './view_support.js';

export {
    COLLECTIONS_VIEW_IDS,
    flattenCollectionTree,
    formatRulesDraft,
    parseRulesDraft,
    parseTagsDraft
};

export class CollectionsView {
    constructor({ document: documentRef, translate = (_zh, en) => en } = {}) {
        if (!documentRef || typeof documentRef.createElement !== 'function') {
            throw new TypeError('Collections view requires a document');
        }
        if (typeof translate !== 'function') throw new TypeError('Collections view translate must be a function');
        this.document = documentRef;
        this.translate = translate;
        this.root = null;
        this.container = null;
        this.handlers = normalizeViewHandlers();
        this.dragState = { collectionId: null, chatId: null };
        this.tree = new CollectionTreeView({ document: documentRef, translate, dragState: this.dragState });
        this.sidebar = new CollectionsSidebarView({ document: documentRef, translate, dragState: this.dragState });
        this._keydown = event => this.tree.moveFocus(this.root, this.document.activeElement, event);
    }

    ensureStyles() {
        const existing = this.document.getElementById?.(COLLECTIONS_VIEW_IDS.styles);
        if (existing) return existing;
        const style = this.document.createElement('style');
        style.id = COLLECTIONS_VIEW_IDS.styles;
        style.dataset.primerOwned = 'collections';
        style.textContent = collectionsViewCss();
        (this.document.head ?? this.document.body).appendChild(style);
        return style;
    }

    removeStyles() {
        const style = this.document.getElementById?.(COLLECTIONS_VIEW_IDS.styles);
        style?.remove();
        return Boolean(style);
    }

    mount(container, handlers = {}) {
        if (!container || typeof container.appendChild !== 'function') {
            throw new TypeError('Collections view mount requires a container');
        }
        this.handlers = normalizeViewHandlers(handlers);
        if (this.container === container && this.root?.parentNode === container) return false;
        this.unmount();
        this.ensureStyles();
        this.container = container;
        this.root = this.document.createElement('section');
        this.root.id = COLLECTIONS_VIEW_IDS.root;
        this.root.dataset.primerOwned = 'collections';
        this.root.setAttribute('aria-label', this.translate('集合', 'Collections'));
        this.root.addEventListener('keydown', this._keydown);
        container.appendChild(this.root);
        return true;
    }

    unmount() {
        if (!this.root) return false;
        this.root.removeEventListener('keydown', this._keydown);
        this.root.remove();
        this.root = null;
        this.container = null;
        return true;
    }

    render(model) {
        if (!this.root) throw new Error('Collections view must be mounted before render');
        const previousKey = this.document.activeElement?.dataset?.focusKey ?? null;
        const focusKey = model.focusKey ?? previousKey;
        this.root.replaceChildren();
        this.root.append(this._heading(model), this._status(model), this._toolbar(model));
        const rulePreview = renderRulePreview({ document: this.document, translate: this.translate, preview: model.rulePreview, handlers: this.handlers });
        if (rulePreview) this.root.appendChild(rulePreview);
        this.root.appendChild(renderCollectionForm({ document: this.document, translate: this.translate, model, handlers: this.handlers }));

        if (model.tree.length === 0) {
            const empty = this.document.createElement('p');
            empty.className = 'gc-collections-empty';
            empty.textContent = this.translate('尚无集合。创建一个集合，或导入旧 Folders JSON。', 'No collections yet. Create one or import legacy Folders JSON.');
            this.root.appendChild(empty);
        } else this.root.appendChild(this.tree.renderTree(model, this.handlers));

        const unassigned = model.chats.filter(chat => chat.collectionIds.length === 0 && chat.matchesQuery);
        if (unassigned.length) {
            const section = this.document.createElement('section');
            const title = this.document.createElement('h3');
            title.textContent = `${this.translate('未归类', 'Unassigned')} (${unassigned.length})`;
            section.append(title, this.tree.renderChats(unassigned, this.handlers));
            this.root.appendChild(section);
        }
        const target = focusKey ? this.root.querySelector?.(`[data-focus-key="${focusKey}"]`) : null;
        target?.focus?.();
        return this.root;
    }

    renderSidebar(model) {
        return this.sidebar.render(model);
    }

    clearSidebar() {
        return this.sidebar.clear();
    }

    _heading(model) {
        const wrapper = this.document.createElement('header');
        const heading = this.document.createElement('h2');
        heading.textContent = this.translate('集合', 'Collections');
        const native = this.document.createElement('p');
        native.textContent = model.state.native.notebooks.available
            ? this.translate('Gemini Notebooks 可用；官方入口保持不变。', 'Gemini Notebooks is available; its official entry remains untouched.')
            : this.translate('集合仅增强本地整理，不替代 Gemini 官方入口。', 'Collections augments local organization without replacing Gemini-owned entries.');
        wrapper.append(heading, native);
        return wrapper;
    }

    _status(model) {
        const status = this.document.createElement('div');
        status.setAttribute('role', model.error ? 'alert' : 'status');
        status.setAttribute('aria-live', model.error ? 'assertive' : 'polite');
        status.textContent = model.error || model.status || '';
        return status;
    }

    _toolbar(model) {
        const toolbar = this.document.createElement('div');
        toolbar.className = 'gc-collections-toolbar';
        const search = this.document.createElement('input');
        search.type = 'search';
        search.value = model.query;
        search.placeholder = this.translate('搜索集合或对话…', 'Search collections or chats…');
        search.setAttribute('aria-label', this.translate('搜索集合或对话', 'Search collections or chats'));
        search.oninput = event => this.handlers.onSearch(event.target.value);
        toolbar.append(
            search,
            createButton(this.document, this.translate('预览规则', 'Preview rules'), this.handlers.onAutoClassify),
            createButton(this.document, this.translate('导出', 'Export'), this.handlers.onExport),
            createButton(this.document, this.translate('导入', 'Import'), this.handlers.onImport)
        );
        if (model.canUndo) toolbar.appendChild(createButton(this.document, this.translate('撤销', 'Undo'), this.handlers.onUndo));
        return toolbar;
    }
}

export function createCollectionsView(options) {
    return new CollectionsView(options);
}
