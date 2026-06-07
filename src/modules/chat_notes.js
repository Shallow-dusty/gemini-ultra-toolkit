import { Core } from '../core.js';
import { Logger } from '../logger.js';
import { NativeUI } from '../native_ui.js';
import { PanelUI } from '../panel_ui.js';
import { createIcon } from '../icons.js';
import {
    deleteChatNote,
    getNotesStats,
    getPinnedNotes,
    normalizeNotesData,
    toggleChatPin,
    upsertChatNote
} from '../../lib/chat_notes_store.js';

export const ChatNotesModule = {
    id: 'chat-notes',
    name: NativeUI.t('对话笔记', 'Chat Notes'),
    description: NativeUI.t('为对话保存本地笔记和置顶标记', 'Save local notes and pins for chats'),
    iconId: 'pin',
    defaultEnabled: false,

    STORAGE_KEY: 'gemini_chat_notes',
    data: { notes: {} },

    _getStorageKey() {
        const user = Core.getCurrentUser();
        return user && user.includes('@') ? `${this.STORAGE_KEY}_${user}` : this.STORAGE_KEY;
    },

    init() {
        this.loadData();
        Logger.info('ChatNotesModule initialized', getNotesStats(this.data));
    },

    onUserChange() {
        this.loadData();
        PanelUI.renderDetailsPane();
    },

    loadData() {
        let saved;
        try { saved = GM_getValue(this._getStorageKey(), null); }
        catch { saved = null; }
        this.data = normalizeNotesData(saved);
        this._save();
    },

    _save() {
        try { GM_setValue(this._getStorageKey(), this.data); } catch { /* silent */ }
    },

    _getCurrentChatRef() {
        const chatId = Core.getChatId();
        if (!chatId) return null;
        const chats = Core.scanSidebarChats(true);
        const fromSidebar = chats.find(chat => chat.id === chatId);
        return {
            id: chatId,
            title: fromSidebar?.title || document.title || chatId,
            href: fromSidebar?.href || `/app/${chatId}`
        };
    },

    _renderCurrentChatEditor(container, current) {
        const existing = current ? this.data.notes[current.id] : null;

        const title = document.createElement('div');
        title.className = 'section-title';
        title.textContent = NativeUI.t('当前对话', 'Current Chat');
        container.appendChild(title);

        if (!current) {
            const hint = document.createElement('div');
            hint.className = 'detail-row';
            hint.textContent = NativeUI.t('打开一个对话后可保存笔记。', 'Open a chat to save notes.');
            container.appendChild(hint);
            return;
        }

        const header = document.createElement('div');
        header.className = 'detail-row';
        header.style.alignItems = 'center';
        const label = document.createElement('span');
        label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        label.textContent = current.title;
        label.title = current.title;

        const pinBtn = document.createElement('span');
        pinBtn.style.cssText = `display:inline-flex;cursor:pointer;color:${existing?.pinned ? 'var(--accent)' : 'inherit'};`;
        pinBtn.title = existing?.pinned ? 'Unpin current chat' : 'Pin current chat';
        pinBtn.appendChild(createIcon('pin', 12));
        pinBtn.onclick = (e) => {
            e.stopPropagation();
            this.data = toggleChatPin(this.data, current);
            this._save();
            PanelUI.renderDetailsPane();
        };

        header.appendChild(label);
        header.appendChild(pinBtn);
        container.appendChild(header);

        const noteArea = document.createElement('textarea');
        noteArea.style.cssText = 'width:100%;height:92px;box-sizing:border-box;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--input-bg,rgba(255,255,255,0.05));color:var(--text-main,#fff);font-size:11px;padding:8px;resize:vertical;font-family:inherit;';
        noteArea.placeholder = NativeUI.t('本地笔记，只保存在浏览器里...', 'Local note, saved only in this browser...');
        noteArea.value = existing?.note || '';
        container.appendChild(noteArea);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:6px;margin:6px 0 10px;';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'g-btn';
        saveBtn.style.flex = '1';
        saveBtn.textContent = NativeUI.t('保存笔记', 'Save Note');
        saveBtn.onclick = (e) => {
            e.stopPropagation();
            this.data = upsertChatNote(this.data, current, {
                note: noteArea.value,
                pinned: this.data.notes[current.id]?.pinned
            });
            this._save();
            NativeUI.showToast(NativeUI.t('笔记已保存', 'Note saved'));
            PanelUI.renderDetailsPane();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'g-btn';
        deleteBtn.style.flex = '1';
        deleteBtn.textContent = NativeUI.t('删除', 'Delete');
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.data = deleteChatNote(this.data, current.id);
            this._save();
            PanelUI.renderDetailsPane();
        };

        actions.appendChild(saveBtn);
        actions.appendChild(deleteBtn);
        container.appendChild(actions);
    },

    _renderPinnedNotes(container) {
        const pinned = getPinnedNotes(this.data);
        const title = document.createElement('div');
        title.className = 'section-title';
        title.textContent = NativeUI.t('置顶对话', 'Pinned Chats');
        container.appendChild(title);

        if (pinned.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'detail-row';
            empty.textContent = NativeUI.t('暂无置顶。', 'No pinned chats yet.');
            container.appendChild(empty);
            return;
        }

        pinned.slice(0, 8).forEach(note => {
            const row = document.createElement('div');
            row.className = 'detail-row';
            row.title = note.note || note.title;
            const text = document.createElement('span');
            text.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            text.textContent = note.note ? `${note.title} - ${note.note.slice(0, 40)}` : note.title;
            row.appendChild(text);
            row.onclick = (e) => {
                e.stopPropagation();
                if (note.href) window.location.href = note.href;
            };
            container.appendChild(row);
        });
    },

    renderToDetailsPane(container) {
        const stats = getNotesStats(this.data);
        const title = document.createElement('div');
        title.className = 'section-title';
        title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
        const label = document.createElement('span');
        label.textContent = 'Chat Notes';
        const count = document.createElement('span');
        count.style.opacity = '0.7';
        count.textContent = `${stats.total}/${stats.pinned}`;
        title.appendChild(label);
        title.appendChild(count);
        container.appendChild(title);

        this._renderCurrentChatEditor(container, this._getCurrentChatRef());
        this._renderPinnedNotes(container);
    },

    getOnboarding() {
        return {
            zh: {
                rant: 'Gemini 的对话列表只有标题和时间。你想记住“这段架构结论以后要复用”，只能靠脑子或外部笔记。',
                features: '为每个 Gemini 对话保存本地笔记和置顶标记。数据只写入浏览器本地存储，不同步到远端。',
                guide: '打开一个对话，在面板的 Chat Notes 标签里写笔记或置顶。置顶列表可快速回到重要对话。'
            },
            en: {
                rant: 'Gemini gives you titles and timestamps, but not a durable place to mark why a chat matters.',
                features: 'Adds local per-chat notes and pins. Data stays in browser storage and is not synced to a backend.',
                guide: 'Open a chat, use the Chat Notes tab to save a note or pin it, then use the pinned list to return to important chats.'
            }
        };
    }
};
