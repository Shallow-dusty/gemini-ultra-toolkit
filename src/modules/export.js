import { Logger } from '../logger.js';
import { Core } from '../core.js';
import { NativeUI } from '../native_ui.js';
import { PanelUI } from '../panel_ui.js';
import { CounterModule } from './counter.js';
import { exportCSV, exportMarkdown } from '../../lib/export_formatter.js';
import {
    exportBulkTranscriptHTML,
    exportBulkTranscriptJSON,
    exportBulkTranscriptMarkdown,
    exportBulkTranscriptText,
    exportTranscriptHTML,
    exportTranscriptJSON,
    exportTranscriptMarkdown,
    exportTranscriptText
} from '../../lib/chat_transcript_export.js';
import { createIcon } from '../icons.js';
import { GeminiAdapter } from '../adapters/gemini.js';

export const ExportModule = {
    id: 'export',
    name: NativeUI.t('数据导出', 'Data Export'),
    description: NativeUI.t('JSON / CSV / Markdown / HTML 多格式导出', 'Export in JSON / CSV / Markdown / HTML'),
    iconId: 'download',
    defaultEnabled: true,
    _bulkSelected: new Set(),
    _bulkSelectedMeta: {},
    _bulkExporting: false,
    _bulkCancelRequested: false,
    _bulkProgress: { current: 0, total: 0, title: '' },

    init() {
        Logger.info('ExportModule initialized');
    },
    destroy() {
        this.removeNativeUI();
        this._clearBulkSelection();
        this._bulkExporting = false;
        this._bulkCancelRequested = false;
        Logger.info('ExportModule destroyed');
    },
    onUserChange() {
        this._clearBulkSelection();
        this._bulkExporting = false;
        this._bulkCancelRequested = false;
    },

    // --- Native UI: Export button next to chat title ---
    injectNativeUI() {
        const NATIVE_ID = 'gc-export-native';
        if (document.getElementById(NATIVE_ID)) return;

        const titleEl = NativeUI.getChatHeader();
        if (!titleEl) return;
        const parent = titleEl.parentElement;
        if (!parent) return;

        const btn = document.createElement('button');
        btn.id = NATIVE_ID;
        btn.className = 'gc-header-btn';
        btn.appendChild(createIcon('download', 16));
        btn.title = 'Export conversation';
        btn.onclick = (e) => {
            e.stopPropagation();
            this._toggleExportMenu(btn);
        };

        const pos = getComputedStyle(parent).position;
        if (pos === 'static' || pos === '') parent.style.position = 'relative';
        parent.appendChild(btn);
    },

    removeNativeUI() {
        NativeUI.remove('gc-export-native');
        NativeUI.remove('gc-export-menu');
        if (this._menuAbort) { this._menuAbort.abort(); this._menuAbort = null; }
    },

    _toggleExportMenu(anchorBtn) {
        const MENU_ID = 'gc-export-menu';
        const existing = document.getElementById(MENU_ID);
        if (existing) { existing.remove(); return; }

        const menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.className = 'gc-dropdown-menu';
        menu.style.cssText = 'top:100%;right:0;margin-top:4px;';

        const items = [
            { icon: 'file-text', text: 'Usage JSON', action: () => this.exportJSON() },
            { icon: 'chart', text: 'Usage CSV', action: () => this.doExportCSV() },
            { icon: 'edit', text: 'Usage Markdown', action: () => this.doExportMarkdown() },
            { icon: 'file-text', text: 'Chat JSON', action: () => this.exportCurrentChatJSON() },
            { icon: 'edit', text: 'Chat Markdown', action: () => this.exportCurrentChatMarkdown() },
            { icon: 'file-text', text: 'Chat TXT', action: () => this.exportCurrentChatText() },
            { icon: 'file-text', text: 'Chat HTML', action: () => this.exportCurrentChatHTML() }
        ];

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'gc-dropdown-item';
            el.appendChild(createIcon(item.icon, 14));
            el.appendChild(document.createTextNode(' ' + item.text));
            el.onclick = (e) => {
                e.stopPropagation();
                menu.remove();
                item.action();
            };
            menu.appendChild(el);
        });

        anchorBtn.parentElement.appendChild(menu);

        if (this._menuAbort) this._menuAbort.abort();
        this._menuAbort = new AbortController();
        const signal = this._menuAbort.signal;
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== anchorBtn) {
                menu.remove();
                if (this._menuAbort) { this._menuAbort.abort(); this._menuAbort = null; }
            }
        };
        document.addEventListener('click', closeMenu, { capture: true, signal });
    },

    // --- Export helpers ---
    _download(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        NativeUI.showToast(NativeUI.t('已导出: ' + filename, 'Exported: ' + filename));
    },

    _getFilePrefix() {
        const user = Core.getCurrentUser()?.split('@')[0] || 'unknown';
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        return `primer-pp-${user}-${date}`;
    },

    _getChatFilePrefix() {
        const chatId = Core.getChatId() || 'current-chat';
        return `${this._getFilePrefix()}-${chatId}`;
    },

    _getBulkFilePrefix() {
        return `${this._getFilePrefix()}-selected-chats`;
    },

    _cloneChatMeta(chat) {
        return {
            id: chat?.id || '',
            title: chat?.title || 'Untitled',
            href: chat?.href || '',
            element: chat?.element || null
        };
    },

    _rememberBulkChat(chat) {
        if (!chat?.id) return;
        this._bulkSelectedMeta[chat.id] = this._cloneChatMeta(chat);
    },

    _toggleBulkChat(chat) {
        if (!chat?.id) return;
        this._rememberBulkChat(chat);
        if (this._bulkSelected.has(chat.id)) {
            this._bulkSelected.delete(chat.id);
        } else {
            this._bulkSelected.add(chat.id);
        }
    },

    _selectVisibleBulkChats(chats) {
        chats.forEach(chat => {
            this._rememberBulkChat(chat);
            this._bulkSelected.add(chat.id);
        });
    },

    _clearBulkSelection() {
        this._bulkSelected.clear();
        this._bulkSelectedMeta = {};
    },

    _getSelectedBulkChats() {
        const visible = Core.scanSidebarChats(true);
        const byId = new Map();
        visible.forEach(chat => {
            this._rememberBulkChat(chat);
            byId.set(chat.id, this._cloneChatMeta(chat));
        });

        return Array.from(this._bulkSelected)
            .map(id => byId.get(id) || this._bulkSelectedMeta[id])
            .filter(chat => chat?.id);
    },

    _resolveBulkChatForNavigation(chat) {
        const visible = Core.scanSidebarChats(true);
        const match = visible.find(item => item.id === chat.id);
        if (!match) return chat;
        const resolved = this._cloneChatMeta(match);
        resolved.title = chat.title || resolved.title;
        this._rememberBulkChat(resolved);
        return resolved;
    },

    _absoluteChatHref(chat) {
        const href = chat?.href || '';
        if (!href) return '';
        try {
            return new URL(href, location.origin).href;
        } catch {
            return '';
        }
    },

    async _waitForChatReady(chatId, timeout = 12000) {
        const start = Date.now();
        let lastSignature = '';
        let stableMs = 0;

        while (Date.now() - start < timeout) {
            const currentId = Core.getChatId();
            if (currentId === chatId) {
                const messages = GeminiAdapter.getCurrentConversationMessages();
                if (messages.length > 0) {
                    const signature = messages.map(message => `${message.role}:${message.text.length}`).join('|');
                    if (signature === lastSignature) {
                        stableMs += 250;
                    } else {
                        lastSignature = signature;
                        stableMs = 0;
                    }
                    if (stableMs >= 500) return true;
                } else if (Date.now() - start > 1500 && GeminiAdapter.getChatTitleText()) {
                    return true;
                }
            }
            await Core.sleep(250);
        }

        return Core.getChatId() === chatId;
    },

    async _navigateToBulkChat(chat) {
        if (Core.getChatId() !== chat.id) {
            if (!chat.element || typeof chat.element.click !== 'function') {
                throw new Error('Chat row is not available for in-page navigation');
            }
            chat.element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            await Core.sleep(100);
            chat.element.click();
        }

        const loaded = await this._waitForChatReady(chat.id);
        if (!loaded) throw new Error('Timed out waiting for chat to render');
    },

    _getCurrentChatReference() {
        const id = Core.getChatId();
        if (!id) return null;
        const visible = Core.scanSidebarChats(true);
        const match = visible.find(chat => chat.id === id);
        if (match) return this._cloneChatMeta(match);
        return {
            id,
            title: GeminiAdapter.getChatTitleText() || id,
            href: location.href,
            element: null
        };
    },

    async _restoreOriginalChat(originalChat) {
        if (!originalChat?.id || Core.getChatId() === originalChat.id) return;
        const visible = Core.scanSidebarChats(true);
        const match = visible.find(chat => chat.id === originalChat.id);
        if (!match?.element || typeof match.element.click !== 'function') return;
        match.element.click();
        await this._waitForChatReady(originalChat.id, 6000);
    },

    _captureBulkTranscript(chat, exportedAt) {
        const messages = GeminiAdapter.getCurrentConversationMessages();
        return {
            chatId: chat.id,
            selectedTitle: chat.title,
            title: GeminiAdapter.getChatTitleText() || chat.title || 'Gemini conversation',
            href: location.href,
            exportedAt,
            status: messages.length > 0 ? 'exported' : 'empty',
            messages
        };
    },

    _failedBulkTranscript(chat, exportedAt, error) {
        return {
            chatId: chat.id,
            selectedTitle: chat.title,
            title: chat.title || 'Gemini conversation',
            href: this._absoluteChatHref(chat),
            exportedAt,
            status: 'failed',
            error: error?.message || String(error),
            messages: []
        };
    },

    exportJSON() {
        const cm = CounterModule;
        if (!cm?.state) return;
        const data = {
            total: cm.state.total,
            totalChatsCreated: cm.state.totalChatsCreated,
            chats: cm.state.chats,
            dailyCounts: cm.state.dailyCounts,
            exportedAt: new Date().toISOString()
        };
        this._download(JSON.stringify(data, null, 2), `${this._getFilePrefix()}.json`, 'application/json');
    },

    doExportCSV() {
        const cm = CounterModule;
        if (!cm?.state) return;
        const content = exportCSV(cm.state.dailyCounts);
        this._download(content, `${this._getFilePrefix()}.csv`, 'text/csv');
    },

    doExportMarkdown() {
        const cm = CounterModule;
        if (!cm?.state) return;
        const streaks = cm.calculateStreaks ? cm.calculateStreaks() : {};
        const content = exportMarkdown(cm.state.dailyCounts, {
            user: Core.getCurrentUser(),
            total: cm.state.total,
            totalChatsCreated: cm.state.totalChatsCreated,
            currentStreak: streaks.current,
            bestStreak: streaks.best
        });
        this._download(content, `${this._getFilePrefix()}.md`, 'text/markdown');
    },

    _getCurrentTranscript() {
        const chatId = Core.getChatId() || '';
        const title = GeminiAdapter.getChatTitleText() || document.title || chatId || 'Gemini conversation';
        return {
            chatId,
            title,
            href: location.href,
            exportedAt: new Date().toISOString(),
            messages: GeminiAdapter.getCurrentConversationMessages()
        };
    },

    _downloadCurrentTranscript(format) {
        const transcript = this._getCurrentTranscript();
        if (transcript.messages.length === 0) {
            NativeUI.showToast(NativeUI.t('没有可导出的可见对话消息', 'No visible chat messages to export'));
            return;
        }

        if (format === 'json') {
            this._download(exportTranscriptJSON(transcript), `${this._getChatFilePrefix()}.chat.json`, 'application/json');
        } else if (format === 'markdown') {
            this._download(exportTranscriptMarkdown(transcript), `${this._getChatFilePrefix()}.chat.md`, 'text/markdown');
        } else if (format === 'html') {
            this._download(exportTranscriptHTML(transcript), `${this._getChatFilePrefix()}.chat.html`, 'text/html');
        } else {
            this._download(exportTranscriptText(transcript), `${this._getChatFilePrefix()}.chat.txt`, 'text/plain');
        }
    },

    exportCurrentChatJSON() {
        this._downloadCurrentTranscript('json');
    },

    exportCurrentChatMarkdown() {
        this._downloadCurrentTranscript('markdown');
    },

    exportCurrentChatText() {
        this._downloadCurrentTranscript('text');
    },

    exportCurrentChatHTML() {
        this._downloadCurrentTranscript('html');
    },

    async _collectSelectedTranscripts() {
        if (this._bulkExporting) return null;
        const selected = this._getSelectedBulkChats();
        if (selected.length === 0) {
            NativeUI.showToast(NativeUI.t('请选择要导出的对话', 'Select chats to export'));
            return null;
        }

        const exportedAt = new Date().toISOString();
        const originalChat = this._getCurrentChatReference();
        const transcripts = [];

        this._bulkExporting = true;
        this._bulkCancelRequested = false;
        this._bulkProgress = { current: 0, total: selected.length, title: '' };
        PanelUI.renderDetailsPane();

        try {
            for (let i = 0; i < selected.length; i++) {
                if (this._bulkCancelRequested) break;
                const chat = this._resolveBulkChatForNavigation(selected[i]);
                this._bulkProgress = { current: i + 1, total: selected.length, title: chat.title };
                PanelUI.renderDetailsPane();

                try {
                    await this._navigateToBulkChat(chat);
                    transcripts.push(this._captureBulkTranscript(chat, exportedAt));
                } catch (error) {
                    Logger.warn('Selected chat export failed', { chatId: chat.id, error: String(error) });
                    transcripts.push(this._failedBulkTranscript(chat, exportedAt, error));
                }

                await Core.sleep(300);
            }

            if (this._bulkCancelRequested) {
                NativeUI.showToast(NativeUI.t('已取消导出', 'Export canceled'));
                return null;
            }

            return {
                app: 'Primer++ for Gemini',
                exportedAt,
                chats: transcripts
            };
        } finally {
            await this._restoreOriginalChat(originalChat);
            this._bulkExporting = false;
            this._bulkCancelRequested = false;
            this._bulkProgress = { current: 0, total: 0, title: '' };
            PanelUI.renderDetailsPane();
        }
    },

    async _downloadSelectedTranscripts(format) {
        const bulkExport = await this._collectSelectedTranscripts();
        if (!bulkExport) return;

        if (format === 'json') {
            this._download(exportBulkTranscriptJSON(bulkExport), `${this._getBulkFilePrefix()}.json`, 'application/json');
        } else if (format === 'markdown') {
            this._download(exportBulkTranscriptMarkdown(bulkExport), `${this._getBulkFilePrefix()}.md`, 'text/markdown');
        } else if (format === 'html') {
            this._download(exportBulkTranscriptHTML(bulkExport), `${this._getBulkFilePrefix()}.html`, 'text/html');
        } else {
            this._download(exportBulkTranscriptText(bulkExport), `${this._getBulkFilePrefix()}.txt`, 'text/plain');
        }
    },

    exportSelectedChatsJSON() {
        return this._downloadSelectedTranscripts('json');
    },

    exportSelectedChatsMarkdown() {
        return this._downloadSelectedTranscripts('markdown');
    },

    exportSelectedChatsText() {
        return this._downloadSelectedTranscripts('text');
    },

    exportSelectedChatsHTML() {
        return this._downloadSelectedTranscripts('html');
    },

    _panelButton(label, onClick, opts = {}) {
        const btn = document.createElement('button');
        btn.className = 'settings-btn';
        btn.style.cssText = opts.style || 'width:auto;flex:1;padding:5px 6px;font-size:10px;margin-top:0;';
        btn.textContent = label;
        btn.disabled = !!opts.disabled;
        if (btn.disabled) {
            btn.style.opacity = '0.45';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.onclick = onClick;
        }
        return btn;
    },

    _buttonRow(buttons) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:4px;margin-top:6px;';
        buttons.forEach(button => row.appendChild(button));
        return row;
    },

    renderToDetailsPane(container) {
        const section = document.createElement('div');
        section.className = 'gf-section';

        const currentTitle = document.createElement('div');
        currentTitle.className = 'section-title';
        currentTitle.textContent = 'Current Chat';
        section.appendChild(currentTitle);
        section.appendChild(this._buttonRow([
            this._panelButton('JSON', () => this.exportCurrentChatJSON()),
            this._panelButton('MD', () => this.exportCurrentChatMarkdown()),
            this._panelButton('TXT', () => this.exportCurrentChatText()),
            this._panelButton('HTML', () => this.exportCurrentChatHTML())
        ]));

        const bulkTitle = document.createElement('div');
        bulkTitle.className = 'section-title';
        bulkTitle.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
        const bulkLabel = document.createElement('span');
        bulkLabel.textContent = 'Selected Chats';
        const bulkCount = document.createElement('span');
        bulkCount.textContent = String(this._bulkSelected.size);
        bulkTitle.appendChild(bulkLabel);
        bulkTitle.appendChild(bulkCount);
        section.appendChild(bulkTitle);

        const chats = Core.scanSidebarChats(true);
        if (chats.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'font-size:11px;color:var(--text-sub);padding:8px 0;text-align:center;';
            empty.textContent = NativeUI.t('未找到侧栏对话', 'No sidebar chats found');
            section.appendChild(empty);
        } else {
            const actions = this._buttonRow([
                this._panelButton('All', () => {
                    this._selectVisibleBulkChats(chats);
                    PanelUI.renderDetailsPane();
                }),
                this._panelButton('Clear', () => {
                    this._clearBulkSelection();
                    PanelUI.renderDetailsPane();
                }),
                this._panelButton('Refresh', () => {
                    Core.invalidateSidebarCache();
                    PanelUI.renderDetailsPane();
                })
            ]);
            section.appendChild(actions);

            const list = document.createElement('div');
            list.style.cssText = 'max-height:160px;overflow-y:auto;margin-top:6px;border-top:1px solid var(--divider);border-bottom:1px solid var(--divider);';
            chats.forEach(chat => {
                this._rememberBulkChat(chat);
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 2px;cursor:pointer;font-size:11px;color:var(--text-main);';
                row.title = chat.title;

                const check = document.createElement('div');
                const checked = this._bulkSelected.has(chat.id);
                check.style.cssText = `width:14px;height:14px;border-radius:3px;border:1px solid ${checked ? 'var(--accent)' : 'var(--text-sub)'};background:${checked ? 'var(--accent)' : 'transparent'};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;`;
                check.textContent = checked ? '\u2713' : '';

                const label = document.createElement('span');
                label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
                label.textContent = chat.title;

                row.onclick = (e) => {
                    e.stopPropagation();
                    this._toggleBulkChat(chat);
                    PanelUI.renderDetailsPane();
                };
                row.appendChild(check);
                row.appendChild(label);
                list.appendChild(row);
            });
            section.appendChild(list);
        }

        if (this._bulkExporting) {
            const progress = document.createElement('div');
            progress.style.cssText = 'font-size:10px;color:var(--accent);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            progress.textContent = `Exporting ${this._bulkProgress.current}/${this._bulkProgress.total}: ${this._bulkProgress.title}`;
            section.appendChild(progress);
            section.appendChild(this._buttonRow([
                this._panelButton('Cancel', () => {
                    this._bulkCancelRequested = true;
                }, { style: 'width:auto;flex:1;padding:5px 6px;font-size:10px;margin-top:0;color:#f28b82;' })
            ]));
        } else {
            const disabled = this._bulkSelected.size === 0;
            section.appendChild(this._buttonRow([
                this._panelButton('JSON', () => this.exportSelectedChatsJSON(), { disabled }),
                this._panelButton('MD', () => this.exportSelectedChatsMarkdown(), { disabled }),
                this._panelButton('TXT', () => this.exportSelectedChatsText(), { disabled }),
                this._panelButton('HTML', () => this.exportSelectedChatsHTML(), { disabled })
            ]));
        }

        container.appendChild(section);
    },

    getOnboarding() {
        return {
            zh: {
                rant: '2026 \u5E74\u4E86\uFF0CGoogle \u6700\u5F15\u4EE5\u4E3A\u50B2\u7684 AI \u4EA7\u54C1\u5C45\u7136\u4E0D\u652F\u6301\u5BFC\u51FA\u5BF9\u8BDD\u3002\u4F60\u8DDF Gemini \u8BA8\u8BBA\u4E86\u4E09\u5929\u7684\u67B6\u6784\u65B9\u6848\uFF0C\u7ED3\u679C\u60F3\u4FDD\u5B58\u4E00\u4EFD\uFF1F\u4E0D\u597D\u610F\u601D\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u7C98\u8D34 300 \u6761\u6D88\u606F\u3002\u4EA7\u54C1\u7ECF\u7406\u662F\u4E0D\u662F\u89C9\u5F97\u7528\u6237\u7684\u5BF9\u8BDD\u50CF\u9605\u540E\u5373\u711A\u7684 Snapchat\uFF1F',
                features: '在聊天标题旁添加导出按钮，可导出用量报告、当前可见对话，或在导出面板多选侧栏对话并导出为 JSON/Markdown/TXT/HTML。',
                guide: '当前对话：打开对话 → 点击标题右侧导出按钮。多选对话：打开悬浮面板导出标签 → 选择对话 → 选择 JSON / MD / TXT / HTML。'
            },
            en: {
                rant: "It's 2026. Google's flagship AI product doesn't let you export conversations. You spent three days discussing architecture with Gemini and want to save it? Sorry, please manually copy-paste 300 messages. Does the PM think conversations are Snapchats?",
                features: 'Adds a \uD83D\uDCE4 export button next to the chat title. Export usage reports, the current visible conversation, or selected sidebar chats to JSON/Markdown/TXT/HTML.',
                guide: 'Current chat: open a conversation \u2192 click the title export button. Selected chats: open the Export panel tab \u2192 select chats \u2192 choose JSON / MD / TXT / HTML.'
            }
        };
    },

    renderExportButtons(container) {
        const jsonBtn = document.createElement('button');
        jsonBtn.className = 'settings-btn';
        jsonBtn.style.cssText = 'display:flex;align-items:center;gap:6px;';
        jsonBtn.appendChild(createIcon('download', 14));
        jsonBtn.appendChild(document.createTextNode(' Export JSON'));
        jsonBtn.onclick = () => this.exportJSON();
        container.appendChild(jsonBtn);

        const csvBtn = document.createElement('button');
        csvBtn.className = 'settings-btn';
        csvBtn.style.cssText = 'display:flex;align-items:center;gap:6px;';
        csvBtn.appendChild(createIcon('download', 14));
        csvBtn.appendChild(document.createTextNode(' Export CSV'));
        csvBtn.onclick = () => this.doExportCSV();
        container.appendChild(csvBtn);

        const mdBtn = document.createElement('button');
        mdBtn.className = 'settings-btn';
        mdBtn.style.cssText = 'display:flex;align-items:center;gap:6px;';
        mdBtn.appendChild(createIcon('download', 14));
        mdBtn.appendChild(document.createTextNode(' Export Markdown'));
        mdBtn.onclick = () => this.doExportMarkdown();
        container.appendChild(mdBtn);

        const chatMdBtn = document.createElement('button');
        chatMdBtn.className = 'settings-btn';
        chatMdBtn.style.cssText = 'display:flex;align-items:center;gap:6px;';
        chatMdBtn.appendChild(createIcon('download', 14));
        chatMdBtn.appendChild(document.createTextNode(' Export Current Chat'));
        chatMdBtn.onclick = () => this.exportCurrentChatMarkdown();
        container.appendChild(chatMdBtn);

        const chatHtmlBtn = document.createElement('button');
        chatHtmlBtn.className = 'settings-btn';
        chatHtmlBtn.style.cssText = 'display:flex;align-items:center;gap:6px;';
        chatHtmlBtn.appendChild(createIcon('download', 14));
        chatHtmlBtn.appendChild(document.createTextNode(' Export Current Chat HTML'));
        chatHtmlBtn.onclick = () => this.exportCurrentChatHTML();
        container.appendChild(chatHtmlBtn);
    }
};
