import { createButton } from './view_support.js';

export class CollectionTreeView {
    constructor({ document: documentRef, translate, dragState }) {
        this.document = documentRef;
        this.translate = translate;
        this.dragState = dragState;
    }

    renderTree(model, handlers) {
        const tree = this.document.createElement('ul');
        tree.className = 'gc-collection-tree';
        tree.setAttribute('role', 'tree');
        tree.setAttribute('aria-label', this.translate('集合树', 'Collection tree'));
        for (const node of model.tree) tree.appendChild(this._renderCollection(node, model, handlers, 1));
        return tree;
    }

    renderChats(chats, handlers, collectionId = null) {
        const list = this.document.createElement('ul');
        list.className = 'gc-chat-list';
        for (const chat of chats) {
            const item = this.document.createElement('li');
            item.appendChild(createButton(this.document, chat.title, () => handlers.onOpenChat(chat), {
                class: 'gc-chat-button', 'data-focus-key': `chat-${chat.id}`
            }));
            if (collectionId && chat.manualCollectionIds.includes(collectionId)) {
                item.appendChild(createButton(
                    this.document,
                    this.translate('移除', 'Remove'),
                    () => handlers.onAssignChat(chat.id, null, collectionId),
                    { 'aria-label': `${this.translate('从集合移除', 'Remove from collection')}: ${chat.title}` }
                ));
            }
            list.appendChild(item);
        }
        return list;
    }

    moveFocus(root, activeElement, event) {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const controls = [...(root?.querySelectorAll?.('[data-tree-focus]') ?? [])];
        if (!controls.length) return;
        const current = controls.indexOf(activeElement);
        let index = current < 0 ? 0 : current;
        if (event.key === 'ArrowDown') index = Math.min(index + 1, controls.length - 1);
        if (event.key === 'ArrowUp') index = Math.max(index - 1, 0);
        if (event.key === 'Home') index = 0;
        if (event.key === 'End') index = controls.length - 1;
        event.preventDefault();
        controls[index].focus();
    }

    _renderCollection(node, model, handlers, level) {
        const item = this.document.createElement('li');
        item.setAttribute('role', 'treeitem');
        item.setAttribute('aria-level', level);
        item.setAttribute('aria-expanded', String(!node.collapsed));
        const row = this.document.createElement('div');
        row.className = 'gf-folder-row';
        row.dataset.collectionId = node.id;
        row.dataset.primerOwned = 'collections';
        row.draggable = true;

        const heading = this.document.createElement('div');
        heading.className = 'gc-collection-heading';
        heading.appendChild(createButton(
            this.document,
            `${node.collapsed ? '▸' : '▾'} ${node.name}`,
            () => handlers.onToggle(node.id, !node.collapsed),
            { 'aria-expanded': String(!node.collapsed), 'data-tree-focus': '', 'data-focus-key': `collection-${node.id}` }
        ));
        const actions = this.document.createElement('div');
        actions.className = 'gc-collection-actions';
        actions.append(
            createButton(this.document, '↑', () => handlers.onMove(node.id, -1), { 'aria-label': this.translate('上移', 'Move up') }),
            createButton(this.document, '↓', () => handlers.onMove(node.id, 1), { 'aria-label': this.translate('下移', 'Move down') }),
            createButton(this.document, node.pinned ? '★' : '☆', () => handlers.onPin(node.id, !node.pinned), {
                'aria-label': node.pinned ? this.translate('取消置顶', 'Unpin') : this.translate('置顶', 'Pin')
            }),
            createButton(this.document, this.translate('编辑', 'Edit'), () => handlers.onEdit(node.id)),
            createButton(this.document, this.translate('删除', 'Delete'), () => handlers.onDelete(node.id))
        );
        heading.appendChild(actions);
        row.appendChild(heading);

        const meta = this.document.createElement('div');
        meta.className = 'gc-collection-meta';
        for (const tag of node.tags) {
            const badge = this.document.createElement('span');
            badge.className = 'gc-collection-tag';
            badge.textContent = `#${tag}`;
            meta.appendChild(badge);
        }
        if (node.rules.length) {
            const count = this.document.createElement('span');
            count.textContent = `${node.rules.length} ${this.translate('条规则', 'rules')}`;
            meta.appendChild(count);
        }
        row.appendChild(meta);
        const chats = model.chats.filter(chat => chat.collectionIds.includes(node.id) && chat.matchesQuery);
        if (chats.length && !node.collapsed) row.appendChild(this.renderChats(chats, handlers, node.id));

        row.ondragstart = event => {
            this.dragState.collectionId = node.id;
            event?.dataTransfer?.setData?.('application/x-primer-collection', node.id);
        };
        row.ondragend = () => { this.dragState.collectionId = null; };
        row.ondragover = event => event?.preventDefault?.();
        row.ondrop = event => {
            event?.preventDefault?.();
            const sourceId = this.dragState.collectionId ?? event?.dataTransfer?.getData?.('application/x-primer-collection');
            if (sourceId && sourceId !== node.id) handlers.onMove(sourceId, { targetId: node.id, position: 'before' });
            else {
                const chatId = this.dragState.chatId ?? event?.dataTransfer?.getData?.('text/plain');
                if (chatId) handlers.onAssignChat(chatId, node.id);
            }
        };
        item.appendChild(row);
        if (!node.collapsed && node.children.length) {
            const children = this.document.createElement('ul');
            children.setAttribute('role', 'group');
            for (const child of node.children) children.appendChild(this._renderCollection(child, model, handlers, level + 1));
            item.appendChild(children);
        }
        return item;
    }
}
