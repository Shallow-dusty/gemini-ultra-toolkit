import { Logger } from '../logger.js';
import { Core } from '../core.js';
import { NativeUI } from '../native_ui.js';
import { CounterModule } from './counter.js';
import { exportCSV, exportMarkdown } from '../../lib/export_formatter.js';
import { exportTranscriptJSON, exportTranscriptMarkdown, exportTranscriptText } from '../../lib/chat_transcript_export.js';
import { createIcon } from '../icons.js';
import { GeminiAdapter } from '../adapters/gemini.js';

export const ExportModule = {
    id: 'export',
    name: NativeUI.t('数据导出', 'Data Export'),
    description: NativeUI.t('JSON / CSV / Markdown 多格式导出', 'Export in JSON / CSV / Markdown'),
    iconId: 'download',
    defaultEnabled: true,

    init() {
        Logger.info('ExportModule initialized');
    },
    destroy() {
        this.removeNativeUI();
        Logger.info('ExportModule destroyed');
    },
    onUserChange() { /* no-op */ },

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
            { icon: 'file-text', text: 'Chat TXT', action: () => this.exportCurrentChatText() }
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

    getOnboarding() {
        return {
            zh: {
                rant: '2026 \u5E74\u4E86\uFF0CGoogle \u6700\u5F15\u4EE5\u4E3A\u50B2\u7684 AI \u4EA7\u54C1\u5C45\u7136\u4E0D\u652F\u6301\u5BFC\u51FA\u5BF9\u8BDD\u3002\u4F60\u8DDF Gemini \u8BA8\u8BBA\u4E86\u4E09\u5929\u7684\u67B6\u6784\u65B9\u6848\uFF0C\u7ED3\u679C\u60F3\u4FDD\u5B58\u4E00\u4EFD\uFF1F\u4E0D\u597D\u610F\u601D\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u7C98\u8D34 300 \u6761\u6D88\u606F\u3002\u4EA7\u54C1\u7ECF\u7406\u662F\u4E0D\u662F\u89C9\u5F97\u7528\u6237\u7684\u5BF9\u8BDD\u50CF\u9605\u540E\u5373\u711A\u7684 Snapchat\uFF1F',
                features: '\u5728\u804A\u5929\u6807\u9898\u65C1\u6DFB\u52A0 \uD83D\uDCE4 \u5BFC\u51FA\u6309\u94AE\uFF0C\u5BFC\u51FA\u7528\u91CF\u62A5\u544A\uFF0C\u6216\u5C06\u5F53\u524D\u53EF\u89C1\u5BF9\u8BDD\u5BFC\u51FA\u4E3A JSON/Markdown/TXT\u3002',
                guide: '1. \u6253\u5F00\u4EFB\u610F\u5BF9\u8BDD \u2192 2. \u70B9\u51FB\u6807\u9898\u53F3\u4FA7\u7684 \uD83D\uDCE4 \u6309\u94AE \u2192 3. \u9009\u62E9\u7528\u91CF\u6216\u5F53\u524D\u5BF9\u8BDD\u683C\u5F0F \u2192 4. \u6587\u4EF6\u81EA\u52A8\u4E0B\u8F7D'
            },
            en: {
                rant: "It's 2026. Google's flagship AI product doesn't let you export conversations. You spent three days discussing architecture with Gemini and want to save it? Sorry, please manually copy-paste 300 messages. Does the PM think conversations are Snapchats?",
                features: 'Adds a \uD83D\uDCE4 export button next to the chat title. Export usage reports, or export the current visible conversation to JSON/Markdown/TXT.',
                guide: '1. Open any conversation \u2192 2. Click \uD83D\uDCE4 next to the title \u2192 3. Pick a usage or current-chat format \u2192 4. File downloads automatically'
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
    }
};
