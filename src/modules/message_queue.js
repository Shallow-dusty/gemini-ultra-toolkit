import { Core } from '../core.js';
import { Logger } from '../logger.js';
import { NativeUI } from '../native_ui.js';
import { PanelUI } from '../panel_ui.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { createIcon } from '../icons.js';
import {
    addQueueItem,
    addQueueItems,
    cancelQueueItem,
    clearQueueHistory,
    evaluateQueueSafety,
    getNextQueuedItem,
    getQueueStats,
    markQueueItemFailed,
    markQueueItemSending,
    markQueueItemSent,
    moveQueueItem,
    normalizeQueueData,
    removeQueueItem,
    setQueuePaused
} from '../../lib/message_queue_tools.js';

const PROCESS_DELAY_MS = 1600;
const SEND_READY_DELAY_MS = 120;

export const MessageQueueModule = {
    id: 'message-queue',
    name: NativeUI.t('消息队列', 'Message Queue'),
    description: NativeUI.t('本地排队发送 Prompt，支持暂停、取消和重排', 'Queue prompts locally with pause, cancel, and reorder controls'),
    iconId: 'package',
    defaultEnabled: false,

    STORAGE_KEY: 'gemini_message_queue',
    data: { paused: true, activeId: '', lastError: '', items: [] },
    _timer: null,
    _processing: false,

    _getStorageKey() {
        const user = Core.getCurrentUser();
        return user && user.includes('@') ? `${this.STORAGE_KEY}_${user}` : this.STORAGE_KEY;
    },

    init() {
        this.loadData();
        Logger.info('MessageQueueModule initialized', getQueueStats(this.data));
    },

    destroy() {
        this.pauseQueue();
        this.removeNativeUI();
    },

    onUserChange() {
        this.pauseQueue();
        this.loadData();
        PanelUI.renderDetailsPane();
    },

    loadData() {
        let saved;
        try { saved = GM_getValue(this._getStorageKey(), null); }
        catch { saved = null; }
        this.data = normalizeQueueData(saved, { recoverSending: true });
        this.data.paused = true;
        this._save();
    },

    _save() {
        try { GM_setValue(this._getStorageKey(), this.data); } catch { /* silent */ }
    },

    injectNativeUI() {
        const BTN_ID = 'gc-queue-native';
        if (document.getElementById(BTN_ID)) return;
        const trailing = GeminiAdapter.getInputTrailingActions();
        if (!trailing) return;

        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.className = 'gc-input-btn';
        btn.title = NativeUI.t('加入发送队列', 'Add to message queue');
        btn.appendChild(createIcon('package', 16));
        btn.onclick = (e) => {
            e.stopPropagation();
            this.queueCurrentInput();
        };

        trailing.insertBefore(btn, trailing.firstChild);
    },

    removeNativeUI() {
        NativeUI.remove('gc-queue-native');
    },

    _getEditorText() {
        const editor = GeminiAdapter.getInputEditor();
        if (!editor) return '';
        return (('value' in editor ? editor.value : editor.textContent) || '').trim();
    },

    _clearEditor(editor) {
        if ('value' in editor) editor.value = '';
        else editor.textContent = '';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    },

    _insertEditorText(editor, text) {
        this._clearEditor(editor);
        editor.focus();

        if ('value' in editor) {
            editor.value = text;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);

        const inputEvent = new InputEvent('beforeinput', {
            inputType: 'insertText',
            data: text,
            bubbles: true,
            cancelable: true,
            composed: true
        });
        const accepted = editor.dispatchEvent(inputEvent);
        if (!accepted || editor.textContent.trim() === '') {
            const p = document.createElement('p');
            p.textContent = text;
            editor.appendChild(p);
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
    },

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async _sendText(text) {
        const editor = GeminiAdapter.getInputEditor();
        if (!editor) return { ok: false, reason: 'Input editor unavailable' };

        this._insertEditorText(editor, text);
        await this._delay(SEND_READY_DELAY_MS);

        const sendBtn = GeminiAdapter.getSendButton();
        if (!GeminiAdapter.isSendButtonElement(sendBtn)) {
            return { ok: false, reason: 'Send button unavailable' };
        }
        sendBtn.click();
        return { ok: true, reason: '' };
    },

    _scheduleProcess(delay = PROCESS_DELAY_MS) {
        if (this._timer) clearTimeout(this._timer);
        if (this.data.paused) return;
        this._timer = setTimeout(() => {
            this._timer = null;
            this._processNext();
        }, delay);
    },

    async _processNext() {
        if (this._processing || this.data.paused) return;
        const item = getNextQueuedItem(this.data);
        if (!item) {
            PanelUI.renderDetailsPane();
            return;
        }

        const toolMode = GeminiAdapter.getActiveToolMode();
        const safety = evaluateQueueSafety({
            toolModeActive: toolMode.active,
            toolModeLabel: toolMode.label,
            editorReady: !!GeminiAdapter.getInputEditor()
        });
        if (!safety.ok) {
            this.data = setQueuePaused(this.data, true, { lastError: safety.reason });
            this._save();
            NativeUI.showToast(safety.reason);
            PanelUI.renderDetailsPane();
            return;
        }

        this._processing = true;
        this.data = markQueueItemSending(this.data, item.id);
        this._save();
        PanelUI.renderDetailsPane();

        const result = await this._sendText(item.text);
        this._processing = false;

        if (!result.ok) {
            this.data = markQueueItemFailed(this.data, item.id, result.reason);
            this._save();
            NativeUI.showToast(result.reason);
            PanelUI.renderDetailsPane();
            return;
        }

        this.data = markQueueItemSent(this.data, item.id);
        this._save();
        PanelUI.renderDetailsPane();
        this._scheduleProcess();
    },

    queueCurrentInput() {
        const editor = GeminiAdapter.getInputEditor();
        const text = this._getEditorText();
        if (!text) {
            NativeUI.showToast(NativeUI.t('输入框为空', 'Input is empty'));
            return;
        }
        this.data = addQueueItem(this.data, text);
        this._save();
        if (editor) this._clearEditor(editor);
        NativeUI.showToast(NativeUI.t('已加入队列', 'Added to queue'));
        PanelUI.renderDetailsPane();
    },

    enqueueEntries(entries, opts = {}) {
        const result = addQueueItems(this.data, entries, {
            idPrefix: opts.idPrefix || `q_${Date.now()}`
        });
        if (result.added === 0) return 0;
        this.data = result.data;
        this._save();
        PanelUI.renderDetailsPane();
        return result.added;
    },

    startQueue() {
        const stats = getQueueStats(this.data);
        if (stats.queued === 0) return;
        this.data = setQueuePaused(this.data, false);
        this._save();
        PanelUI.renderDetailsPane();
        this._scheduleProcess(50);
    },

    pauseQueue() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this.data = setQueuePaused(this.data, true);
        this._save();
        PanelUI.renderDetailsPane();
    },

    cancelItem(id) {
        this.data = cancelQueueItem(this.data, id);
        this._save();
        PanelUI.renderDetailsPane();
    },

    removeItem(id) {
        this.data = removeQueueItem(this.data, id);
        this._save();
        PanelUI.renderDetailsPane();
    },

    moveItem(id, direction) {
        this.data = moveQueueItem(this.data, id, direction);
        this._save();
        PanelUI.renderDetailsPane();
    },

    clearHistory() {
        this.data = clearQueueHistory(this.data);
        this._save();
        PanelUI.renderDetailsPane();
    },

    _makeButton(iconName, title, onClick, text = '') {
        const btn = document.createElement('button');
        btn.className = 'g-btn';
        btn.title = title;
        btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:26px;height:24px;padding:0 6px;font-size:10px;';
        btn.appendChild(createIcon(iconName, 12));
        if (text) btn.appendChild(document.createTextNode(' ' + text));
        btn.onclick = (e) => {
            e.stopPropagation();
            onClick();
        };
        return btn;
    },

    _renderControls(container, stats) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;margin:6px 0 8px;flex-wrap:wrap;';

        row.appendChild(this._makeButton('plus', NativeUI.t('加入当前输入', 'Add current input'), () => this.queueCurrentInput(), NativeUI.t('加入', 'Add')));
        if (this.data.paused) {
            row.appendChild(this._makeButton('play', NativeUI.t('开始发送队列', 'Start queue'), () => this.startQueue(), NativeUI.t('开始', 'Start')));
        } else {
            row.appendChild(this._makeButton('pause', NativeUI.t('暂停队列', 'Pause queue'), () => this.pauseQueue(), NativeUI.t('暂停', 'Pause')));
        }
        if (stats.sent || stats.cancelled) {
            row.appendChild(this._makeButton('trash', NativeUI.t('清理已完成', 'Clear finished'), () => this.clearHistory(), NativeUI.t('清理', 'Clear')));
        }

        container.appendChild(row);
    },

    _renderQueueItem(container, item, index) {
        const row = document.createElement('div');
        row.className = 'detail-row';
        row.style.alignItems = 'center';
        row.title = item.text;

        const label = document.createElement('span');
        label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        label.textContent = `${index + 1}. ${item.title} [${item.status}]`;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:4px;';
        if (item.status === 'queued') {
            actions.appendChild(this._makeButton('arrow-up', NativeUI.t('上移', 'Move up'), () => this.moveItem(item.id, 'up')));
            actions.appendChild(this._makeButton('arrow-down', NativeUI.t('下移', 'Move down'), () => this.moveItem(item.id, 'down')));
            actions.appendChild(this._makeButton('x', NativeUI.t('取消', 'Cancel'), () => this.cancelItem(item.id)));
        } else {
            actions.appendChild(this._makeButton('trash', NativeUI.t('删除', 'Delete'), () => this.removeItem(item.id)));
        }

        row.appendChild(label);
        row.appendChild(actions);
        container.appendChild(row);

        if (item.error) {
            const err = document.createElement('div');
            err.className = 'detail-row';
            err.style.cssText = 'font-size:10px;color:#f28b82;';
            err.textContent = item.error;
            container.appendChild(err);
        }
    },

    renderToDetailsPane(container) {
        const stats = getQueueStats(this.data);
        const title = document.createElement('div');
        title.className = 'section-title';
        title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
        const label = document.createElement('span');
        label.textContent = 'Message Queue';
        const count = document.createElement('span');
        count.style.opacity = '0.7';
        count.textContent = `${stats.queued}/${stats.total}`;
        title.appendChild(label);
        title.appendChild(count);
        container.appendChild(title);

        this._renderControls(container, stats);

        if (this.data.lastError) {
            const err = document.createElement('div');
            err.className = 'detail-row';
            err.style.cssText = 'font-size:10px;color:#f28b82;';
            err.textContent = this.data.lastError;
            container.appendChild(err);
        }

        if (this.data.items.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'detail-row';
            hint.textContent = NativeUI.t('输入 Prompt 后点击加入队列。', 'Type a prompt, then add it to the queue.');
            container.appendChild(hint);
            return;
        }

        this.data.items.slice(0, 12).forEach((item, index) => this._renderQueueItem(container, item, index));
    },

    getOnboarding() {
        return {
            zh: {
                rant: '连续发多条 Prompt 时，Gemini 没有本地队列；你只能手动复制、等待、再发送。',
                features: '把输入框内容加入本地发送队列，支持开始、暂停、取消、重排。遇到可识别的工具模式会暂停，避免盲目自动发送。',
                guide: '在输入框写好 Prompt 后点击队列按钮或面板里的加入，再从 Message Queue 标签开始发送。'
            },
            en: {
                rant: 'Gemini has no local send queue, so multi-prompt runs become copy, wait, paste, repeat.',
                features: 'Queues prompts locally with start, pause, cancel, and reorder controls. Recognized tool modes pause automation instead of blindly sending.',
                guide: 'Write a prompt, add it through the queue button or panel, then start sending from the Message Queue tab.'
            }
        };
    }
};
