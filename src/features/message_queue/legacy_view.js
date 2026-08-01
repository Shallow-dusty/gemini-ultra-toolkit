import queueTools from '../../../lib/message_queue_tools.js';

const {
    getQueueStats,
    MAX_QUEUE_INTERVAL_MS,
    MIN_QUEUE_INTERVAL_MS,
    normalizeQueueIntervalMs
} = queueTools;

function requireObject(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
    return value;
}

export class LegacyMessageQueueView {
    constructor({ environment, nativeUI, adapter, createIcon, actions, labels = {} }) {
        this.environment = requireObject(environment, 'Message Queue environment');
        this.nativeUI = requireObject(nativeUI, 'Message Queue NativeUI capability');
        this.adapter = requireObject(adapter, 'Message Queue adapter capability');
        this.actions = requireObject(actions, 'Message Queue actions capability');
        if (typeof createIcon !== 'function') throw new TypeError('Message Queue createIcon must be a function');
        if (typeof nativeUI.t !== 'function' || typeof nativeUI.remove !== 'function') {
            throw new TypeError('Message Queue NativeUI translation and removal are required');
        }
        this.createIcon = createIcon;
        this.labels = labels;
    }

    get document() {
        return this.environment.document;
    }

    t(zh, en) {
        return this.nativeUI.t(zh, en);
    }

    injectNativeUI() {
        const id = 'gc-queue-native';
        if (this.document.getElementById(id)) return false;
        const trailing = this.adapter.getInputTrailingActions();
        if (!trailing) return false;

        const button = this.document.createElement('button');
        button.id = id;
        button.className = 'gc-input-btn';
        button.title = this.t('加入发送队列', 'Add to message queue');
        button.appendChild(this.createIcon('package', 16));
        button.onclick = event => {
            event.stopPropagation();
            this.actions.queueCurrentInput();
        };
        trailing.insertBefore(button, trailing.firstChild);
        return true;
    }

    removeNativeUI() {
        this.nativeUI.remove('gc-queue-native');
    }

    _makeButton(iconName, title, onClick, text = '') {
        const button = this.document.createElement('button');
        button.className = 'g-btn';
        button.title = title;
        button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:26px;height:24px;padding:0 6px;font-size:10px;';
        button.appendChild(this.createIcon(iconName, 12));
        if (text) button.appendChild(this.document.createTextNode(` ${text}`));
        button.onclick = event => {
            event.stopPropagation();
            onClick();
        };
        return button;
    }

    _renderControls(container, state, stats) {
        const row = this.document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;margin:6px 0 8px;flex-wrap:wrap;';
        row.appendChild(this._makeButton(
            'plus',
            this.t('加入当前输入', 'Add current input'),
            () => this.actions.queueCurrentInput(),
            this.t('加入', 'Add')
        ));
        if (state.paused) {
            row.appendChild(this._makeButton(
                'play',
                this.t('开始或继续发送队列', 'Start or resume queue'),
                () => this.actions.startQueue(),
                this.t('开始 / 继续', 'Start / resume')
            ));
        } else {
            row.appendChild(this._makeButton(
                'pause',
                this.t('暂停队列', 'Pause queue'),
                () => this.actions.pauseQueue(),
                this.t('暂停', 'Pause')
            ));
        }
        if (stats.sent || stats.cancelled) {
            row.appendChild(this._makeButton(
                'trash',
                this.t('清理已完成', 'Clear finished'),
                () => this.actions.clearHistory(),
                this.t('清理', 'Clear')
            ));
        }
        container.appendChild(row);
    }

    _renderPacingControl(container, state) {
        const row = this.document.createElement('div');
        row.className = 'detail-row';
        row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;';

        const label = this.document.createElement('span');
        label.style.cssText = 'flex:1;color:var(--text-sub);';
        label.textContent = this.labels.sendInterval || this.t('发送间隔', 'Send interval');

        const input = this.document.createElement('input');
        input.type = 'number';
        input.min = String(MIN_QUEUE_INTERVAL_MS / 1000);
        input.max = String(MAX_QUEUE_INTERVAL_MS / 1000);
        input.step = '0.1';
        input.value = (normalizeQueueIntervalMs(state.intervalMs) / 1000).toFixed(1).replace(/\.0$/, '');
        input.title = this.t('队列每条消息之间的本地等待秒数', 'Local wait time between queued sends');
        input.style.cssText = 'width:54px;background:var(--input-bg,rgba(255,255,255,0.1));color:var(--text-main);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-size:11px;text-align:center;';
        input.onchange = () => this.actions.setIntervalMs(Number(input.value) * 1000);

        const unit = this.document.createElement('span');
        unit.style.color = 'var(--text-sub)';
        unit.textContent = this.t('秒', 'sec');
        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(unit);
        container.appendChild(row);
    }

    _renderQueueItem(container, item, index) {
        const row = this.document.createElement('div');
        row.className = 'detail-row';
        row.style.alignItems = 'center';
        row.title = item.text;

        const label = this.document.createElement('span');
        label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        label.textContent = `${index + 1}. ${item.title} [${item.status}]`;

        const actions = this.document.createElement('div');
        actions.style.cssText = 'display:flex;gap:4px;';
        if (item.status === 'queued') {
            actions.appendChild(this._makeButton('arrow-up', this.t('上移', 'Move up'), () => this.actions.moveItem(item.id, 'up')));
            actions.appendChild(this._makeButton('arrow-down', this.t('下移', 'Move down'), () => this.actions.moveItem(item.id, 'down')));
            actions.appendChild(this._makeButton('x', this.t('取消', 'Cancel'), () => this.actions.cancelItem(item.id)));
        } else {
            actions.appendChild(this._makeButton('trash', this.t('删除', 'Delete'), () => this.actions.removeItem(item.id)));
        }
        row.appendChild(label);
        row.appendChild(actions);
        container.appendChild(row);

        if (item.error) {
            const error = this.document.createElement('div');
            error.className = 'detail-row';
            error.style.cssText = 'font-size:10px;color:#f28b82;';
            error.textContent = item.error;
            container.appendChild(error);
        }
    }

    render(container, state) {
        const stats = getQueueStats(state);
        const title = this.document.createElement('div');
        title.className = 'section-title';
        title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
        const label = this.document.createElement('span');
        label.textContent = this.labels.name || this.t('消息队列', 'Message Queue');
        const count = this.document.createElement('span');
        count.style.opacity = '0.7';
        count.textContent = `${stats.queued}/${stats.total}`;
        title.appendChild(label);
        title.appendChild(count);
        container.appendChild(title);

        this._renderControls(container, state, stats);
        this._renderPacingControl(container, state);

        if (state.lastError) {
            const error = this.document.createElement('div');
            error.className = 'detail-row';
            error.style.cssText = 'font-size:10px;color:#f28b82;';
            error.textContent = state.lastError;
            container.appendChild(error);
        }

        if (state.items.length === 0) {
            const hint = this.document.createElement('div');
            hint.className = 'detail-row';
            hint.textContent = this.t('输入 Prompt 后点击加入队列。', 'Type a prompt, then add it to the queue.');
            container.appendChild(hint);
            return container;
        }
        state.items.slice(0, 12).forEach((item, index) => this._renderQueueItem(container, item, index));
        return container;
    }

    getOnboarding() {
        return {
            zh: {
                rant: '连续发多条 Prompt 时，Gemini 没有本地队列；你只能手动复制、等待、再发送。',
                features: '把输入框内容加入本地发送队列，支持开始、暂停、取消、重排和发送间隔控制。遇到可识别的工具模式会暂停，避免盲目自动发送。',
                guide: '在输入框写好 Prompt 后点击队列按钮或面板里的加入，按需调整发送间隔，再从 Message Queue 标签开始发送。'
            },
            en: {
                rant: 'Gemini has no local send queue, so multi-prompt runs become copy, wait, paste, repeat.',
                features: 'Queues prompts locally with start, pause, cancel, reorder, and send-interval controls. Recognized tool modes pause automation instead of blindly sending.',
                guide: 'Write a prompt, add it through the queue button or panel, adjust the send interval if needed, then start sending from the Message Queue tab.'
            }
        };
    }
}

export function createLegacyMessageQueueView(options) {
    return new LegacyMessageQueueView(options);
}
