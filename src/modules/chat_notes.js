import { Core } from '../core.js';
import { Logger } from '../logger.js';
import { NativeUI } from '../native_ui.js';
import { PanelUI } from '../panel_ui.js';
import { createIcon } from '../icons.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { formatLocalDate } from '../../lib/date_utils.js';
import { formatContextReference } from '../../lib/context_packet_tools.js';
import {
    mergeNotesImport,
    deleteChatNote,
    getNotesStats,
    getPinnedNotes,
    normalizeNotesData,
    serializeNotesExport,
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

    _insertTextIntoEditor(text) {
        const editor = GeminiAdapter.getInputEditor();
        if (!editor) {
            NativeUI.showToast(NativeUI.t('未找到 Gemini 输入框', 'Gemini input box not found'));
            return false;
        }

        editor.focus();
        const before = 'value' in editor ? editor.value : editor.textContent;
        const inputEvent = new InputEvent('beforeinput', {
            inputType: 'insertText',
            data: text,
            bubbles: true,
            cancelable: true,
            composed: true
        });
        const accepted = editor.dispatchEvent(inputEvent);
        const after = 'value' in editor ? editor.value : editor.textContent;
        if (accepted && after !== before) return true;

        if ('value' in editor) {
            const start = Number.isInteger(editor.selectionStart) ? editor.selectionStart : editor.value.length;
            const end = Number.isInteger(editor.selectionEnd) ? editor.selectionEnd : editor.value.length;
            editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
            editor.selectionStart = editor.selectionEnd = start + text.length;
        } else {
            const p = document.createElement('p');
            p.textContent = text;
            editor.appendChild(p);
        }
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    },

    _insertContextReference(note) {
        const text = formatContextReference(note);
        if (!text) return;
        if (this._insertTextIntoEditor(text)) {
            NativeUI.showToast(NativeUI.t('上下文引用已插入', 'Context reference inserted'));
        }
    },

    _makeContextInsertButton(note) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:4px;';
        btn.title = NativeUI.t('插入本地上下文引用', 'Insert local context reference');
        btn.setAttribute('aria-label', NativeUI.t('插入本地上下文引用', 'Insert local context reference'));
        btn.appendChild(createIcon('copy', 12));
        btn.onclick = (e) => {
            e.stopPropagation();
            this._insertContextReference(note);
        };
        return btn;
    },

    _exportNotes() {
        const data = serializeNotesExport(this.data, { nowIso: new Date().toISOString() });
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `primer-pp-notes-${formatLocalDate(new Date())}.json`;
        a.click();
        URL.revokeObjectURL(url);
        NativeUI.showToast(NativeUI.t('笔记已导出', 'Notes exported'));
    },

    _importNotes() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const imported = JSON.parse(ev.target.result);
                    const result = mergeNotesImport(this.data, imported, { nowIso: new Date().toISOString() });
                    if (result.importedNotes === 0) throw new Error('Invalid format');
                    this.data = result.data;
                    this._save();
                    PanelUI.renderDetailsPane();
                    NativeUI.showToast(NativeUI.t(`已导入 ${result.importedNotes} 条笔记`, `Imported ${result.importedNotes} notes`));
                } catch {
                    NativeUI.showToast(NativeUI.t('导入失败: 格式无效', 'Import failed: invalid format'));
                }
            };
            reader.readAsText(file);
        };
        input.click();
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

        const insertBtn = this._makeContextInsertButton({
            chatId: current.id,
            title: existing?.title || current.title,
            href: existing?.href || current.href,
            note: existing?.note || ''
        });

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
        header.appendChild(insertBtn);
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
            row.appendChild(this._makeContextInsertButton(note));
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

        const ioRow = document.createElement('div');
        ioRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;';

        const exportBtn = document.createElement('button');
        exportBtn.style.cssText = 'flex:1;font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);cursor:pointer;';
        exportBtn.textContent = NativeUI.t('导出', 'Export');
        exportBtn.onclick = (e) => {
            e.stopPropagation();
            this._exportNotes();
        };

        const importBtn = document.createElement('button');
        importBtn.style.cssText = 'flex:1;font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);cursor:pointer;';
        importBtn.textContent = NativeUI.t('导入', 'Import');
        importBtn.onclick = (e) => {
            e.stopPropagation();
            this._importNotes();
        };

        ioRow.appendChild(exportBtn);
        ioRow.appendChild(importBtn);
        container.appendChild(ioRow);
    },

    getOnboarding() {
        return {
            zh: {
                rant: 'Gemini 的对话列表只有标题和时间。你想记住“这段架构结论以后要复用”，只能靠脑子或外部笔记。',
                features: '为每个 Gemini 对话保存本地笔记和置顶标记，并可手动把本地标题、链接、ID 与笔记作为上下文引用插入输入框。数据只写入浏览器本地存储，不同步到远端。',
                guide: '打开一个对话，在面板的 Chat Notes 标签里写笔记或置顶。点击复制图标可把本地引用包插入当前输入框，置顶列表可快速回到重要对话。'
            },
            en: {
                rant: 'Gemini gives you titles and timestamps, but not a durable place to mark why a chat matters.',
                features: 'Adds local per-chat notes and pins, plus explicit context-reference insertion for local titles, links, IDs, and notes. Data stays in browser storage and is not synced to a backend.',
                guide: 'Open a chat, use the Chat Notes tab to save a note or pin it. Click the copy icon to insert a local reference packet into the current composer, or use the pinned list to return to important chats.'
            }
        };
    }
};
