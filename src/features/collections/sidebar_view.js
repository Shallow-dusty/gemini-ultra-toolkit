import { COLLECTIONS_VIEW_IDS, createButton } from './view_support.js';

export class CollectionsSidebarView {
    constructor({ document: documentRef, translate, dragState }) {
        this.document = documentRef;
        this.translate = translate;
        this.dragState = dragState;
        this.filterBar = null;
        this.chatBindings = [];
        this.sidebarChats = [];
    }

    render({ container, collections, chats, activeFilter, onFilter, onAssignChat }) {
        this.clear();
        if (!container) return false;
        const bar = this.document.createElement('nav');
        bar.id = COLLECTIONS_VIEW_IDS.sidebarFilter;
        bar.dataset.primerOwned = 'collections';
        bar.setAttribute('aria-label', this.translate('集合筛选', 'Collection filters'));
        bar.appendChild(createButton(this.document, this.translate('全部', 'All'), () => onFilter(null), {
            'aria-pressed': String(activeFilter === null)
        }));
        for (const collection of collections) {
            const filter = createButton(this.document, collection.name, () => onFilter(collection.id), {
                'aria-pressed': String(activeFilter === collection.id), 'data-collection-drop': collection.id
            });
            filter.ondragover = event => event?.preventDefault?.();
            filter.ondrop = event => {
                event?.preventDefault?.();
                const chatId = this.dragState.chatId ?? event?.dataTransfer?.getData?.('text/plain');
                if (chatId) onAssignChat(chatId, collection.id);
            };
            bar.appendChild(filter);
        }
        container.prepend(bar);
        this.filterBar = bar;
        this.sidebarChats = chats;
        for (const chat of chats) this._bindChat(chat, collections, activeFilter);
        return true;
    }

    clear() {
        for (const binding of this.chatBindings) {
            binding.element.removeEventListener?.('dragstart', binding.start);
            binding.element.removeEventListener?.('dragend', binding.end);
            if (binding.previousDraggable === null) binding.element.removeAttribute?.('draggable');
            else binding.element.setAttribute?.('draggable', binding.previousDraggable);
        }
        this.chatBindings = [];
        for (const chat of this.sidebarChats) if (chat.element) chat.element.style.display = '';
        this.sidebarChats = [];
        this.document.querySelectorAll?.('.gf-sidebar-dot').forEach(dot => dot.remove());
        this.filterBar?.remove();
        this.filterBar = null;
        this.dragState.chatId = null;
    }

    _bindChat(chat, collections, activeFilter) {
        const element = chat.element;
        if (!element) return;
        const previousDraggable = element.getAttribute?.('draggable');
        const start = event => {
            this.dragState.chatId = chat.id;
            event?.dataTransfer?.setData?.('text/plain', chat.id);
        };
        const end = () => { this.dragState.chatId = null; };
        element.setAttribute?.('draggable', 'true');
        element.addEventListener?.('dragstart', start);
        element.addEventListener?.('dragend', end);
        this.chatBindings.push({ element, start, end, previousDraggable });
        const collection = collections.find(value => value.id === chat.collectionIds[0]);
        const dots = Array.from(element.children || []).filter(child => child.classList.contains('gf-sidebar-dot'));
        let dot = dots.shift();
        if (collection) {
            if (!dot) {
                dot = this.document.createElement('span');
                dot.className = 'gf-sidebar-dot';
                dot.dataset.primerOwned = 'collections';
            }
            dot.style.background = collection.color ?? '#8ab4f8';
            dot.title = collection.name;
            if (element.firstChild !== dot) element.insertBefore(dot, element.firstChild);
        } else if (dot) dot.remove();
        dots.forEach(extra => extra.remove());
        element.style.display = activeFilter === null || chat.collectionIds.includes(activeFilter) ? '' : 'none';
    }
}
