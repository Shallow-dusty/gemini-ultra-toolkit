function requireFunction(value, label) {
    if (typeof value !== 'function') throw new TypeError(`Panel presenter ${label} must be a function`);
    return value;
}

export function createPanelPresenter(options = {}) {
    const documentRef = options.document || globalThis.document;
    if (!documentRef?.createElement) throw new TypeError('Panel presenter requires a DOM document');
    const {
        counter,
        core,
        quotaColors,
        tempUser,
        panelId
    } = options;
    if (!counter || !core || !quotaColors || typeof tempUser !== 'string' || typeof panelId !== 'string') {
        throw new TypeError('Panel presenter requires application descriptors');
    }
    for (const [label, value] of [
        ['translate', options.translate],
        ['getTheme', options.getTheme],
        ['setTheme', options.setTheme],
        ['createIcon', options.createIcon],
        ['setIconText', options.setIconText],
        ['openDashboard', options.openDashboard],
        ['openSettings', options.openSettings],
        ['renderDetails', options.renderDetails]
    ]) requireFunction(value, label);

    let previous = {};
    const t = options.translate;

    function sectionTitle(text) {
        const element = documentRef.createElement('div');
        element.className = 'section-title';
        element.textContent = text;
        return element;
    }

    function formatQuotaWindow(windowState) {
        if (!windowState) return '';
        const resetText = windowState.remainingLabel === 'now'
            ? t('现在重置', 'reset now')
            : t(`${windowState.remainingLabel} 后重置`, `resets in ${windowState.remainingLabel}`);
        return `${windowState.windowLabel} · ${resetText}`;
    }

    function passiveRow(label, value) {
        const row = documentRef.createElement('div');
        row.className = 'detail-row';
        row.style.cursor = 'default';
        const labelElement = documentRef.createElement('span');
        labelElement.textContent = label;
        const valueElement = documentRef.createElement('span');
        valueElement.className = 'detail-val';
        valueElement.textContent = value;
        row.append(labelElement, valueElement);
        return row;
    }

    function selectableRow(label, mode, value) {
        const user = core.getCurrentUser();
        const inspecting = core.getInspectingUser();
        const row = documentRef.createElement('button');
        row.type = 'button';
        const active = counter.state.viewMode === mode && inspecting === user;
        row.className = `detail-row ${active ? 'active-mode' : ''}`;
        row.setAttribute('aria-pressed', String(active));
        const labelElement = documentRef.createElement('span');
        labelElement.textContent = label;
        const valueElement = documentRef.createElement('span');
        valueElement.className = 'detail-val';
        valueElement.textContent = value;
        row.append(labelElement, valueElement);
        row.onclick = event => {
            event.stopPropagation();
            if (inspecting !== user) {
                core.setInspectingUser(user);
                counter.loadDataForUser(user);
            }
            counter.state.viewMode = mode;
            counter.state.resetStep = 0;
            update();
            options.renderDetails();
        };
        return row;
    }

    function renderModelBreakdown(pane) {
        const byModel = counter.getTodayByModel();
        if (!byModel.flash && !byModel.thinking && !byModel.pro) return;
        const row = documentRef.createElement('div');
        row.className = 'detail-row model-breakdown';
        row.style.cssText = 'display:flex;gap:10px;font-size:10px;padding:4px 8px;color:var(--text-sub);';
        for (const model of [
            { key: 'flash', color: quotaColors.safe },
            { key: 'thinking', color: quotaColors.warn },
            { key: 'pro', color: quotaColors.danger }
        ]) {
            const item = documentRef.createElement('span');
            item.style.cssText = 'display:flex;align-items:center;gap:3px;';
            const dot = documentRef.createElement('span');
            dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${model.color};display:inline-block;`;
            const count = documentRef.createElement('span');
            count.textContent = byModel[model.key] || 0;
            item.append(dot, count);
            row.appendChild(item);
        }
        pane.appendChild(row);
    }

    function renderProfiles(pane) {
        const user = core.getCurrentUser();
        const inspecting = core.getInspectingUser();
        const users = core.getAllUsers().sort((left, right) => (
            left === user ? -1 : right === user ? 1 : left.localeCompare(right)
        ));
        pane.appendChild(sectionTitle(t('账号', 'Profiles')));
        if (users.length === 0 && user === tempUser) {
            const waiting = documentRef.createElement('div');
            waiting.className = 'detail-row';
            waiting.textContent = t('等待登录...', 'Waiting for login...');
            pane.appendChild(waiting);
            return;
        }
        for (const id of users) {
            const row = documentRef.createElement('button');
            row.type = 'button';
            row.className = `detail-row user-row ${id === user ? 'is-me' : ''} ${id === inspecting ? 'active-mode' : ''}`;
            row.setAttribute('aria-pressed', String(id === inspecting));
            row.onclick = event => {
                event.stopPropagation();
                core.setInspectingUser(id);
                counter.loadDataForUser(id);
                counter.state.viewMode = 'total';
                options.renderDetails();
            };
            const name = documentRef.createElement('span');
            name.textContent = id.split('@')[0];
            row.appendChild(name);
            if (id === user) {
                const badge = documentRef.createElement('span');
                badge.className = 'user-indicator';
                badge.textContent = t('我', 'ME');
                row.appendChild(badge);
            }
            pane.appendChild(row);
        }
    }

    function renderThemes(pane) {
        pane.appendChild(sectionTitle(t('主题', 'Themes')));
        for (const [key, theme] of Object.entries(core.getThemes())) {
            const row = documentRef.createElement('button');
            row.type = 'button';
            const active = options.getTheme() === key;
            row.className = `detail-row ${active ? 'active-mode' : ''}`;
            row.textContent = theme.name;
            row.setAttribute('aria-pressed', String(active));
            row.onclick = event => {
                event.stopPropagation();
                core.setTheme(key);
                options.setTheme(key);
                core.applyTheme(documentRef.getElementById(panelId), key);
                options.renderDetails();
            };
            pane.appendChild(row);
        }
    }

    function renderActions(pane) {
        pane.appendChild(sectionTitle(''));
        const row = documentRef.createElement('div');
        row.className = 'panel-detail-actions';
        const analytics = documentRef.createElement('button');
        analytics.type = 'button';
        analytics.className = 'g-btn';
        options.setIconText(analytics, 'chart', t('统计', 'Stats'));
        analytics.onclick = event => { event.stopPropagation(); options.openDashboard(); };
        const settings = documentRef.createElement('button');
        settings.type = 'button';
        settings.id = 'g-open-settings';
        settings.className = 'g-btn panel-settings-trigger';
        const icon = options.createIcon('settings', 16);
        icon.setAttribute('aria-hidden', 'true');
        settings.appendChild(icon);
        settings.title = t('设置', 'Settings');
        settings.setAttribute('aria-label', t('打开设置', 'Open settings'));
        settings.onclick = event => { event.stopPropagation(); options.openSettings(); };
        row.append(analytics, settings);
        pane.appendChild(row);
    }

    function renderStats(pane) {
        pane.appendChild(sectionTitle('Statistics'));
        const chatId = core.getChatId();
        pane.append(
            selectableRow('Today', 'today', counter.getTodayMessages()),
            passiveRow(t('配额窗口', 'Quota Window'), formatQuotaWindow(counter.getQuotaWindowState())),
            selectableRow('Current Chat', 'chat', chatId ? (counter.state.chats[chatId] || 0) : 0),
            selectableRow('Chats Created', 'chatsCreated', counter.state.totalChatsCreated),
            selectableRow('Lifetime', 'total', counter.state.total)
        );
        renderModelBreakdown(pane);
        renderProfiles(pane);
        renderThemes(pane);
        renderActions(pane);
    }

    function computeView(user, inspecting) {
        const isMe = inspecting === user;
        const quotaWindow = formatQuotaWindow(counter.getQuotaWindowState());
        let value = 0;
        let sub = '';
        let button = t('重置', 'Reset');
        let disabled = !isMe;
        if (counter.state.viewMode === 'today') {
            value = counter.getTodayMessages();
            sub = isMe ? t(`今天 ${quotaWindow}`, `Today ${quotaWindow}`) : t(
                `今天（${inspecting.split('@')[0]}）`, `Today (${inspecting.split('@')[0]})`
            );
            button = t('重置今天', 'Reset Today');
        } else if (counter.state.viewMode === 'chat') {
            if (!isMe) {
                value = '--';
                sub = t('不同上下文', 'Different Context');
            } else {
                const chatId = core.getChatId();
                value = chatId ? (counter.state.chats[chatId] || 0) : 0;
                sub = chatId ? `ID: ${chatId.slice(0, 8)}...` : t('ID: 新对话', 'ID: New Chat');
                button = t('重置对话', 'Reset Chat');
            }
        } else if (counter.state.viewMode === 'chatsCreated') {
            value = counter.state.totalChatsCreated;
            sub = t('创建对话数', 'Chats Created');
            button = t('仅查看', 'View Only');
            disabled = true;
        } else if (counter.state.viewMode === 'total') {
            value = counter.state.total;
            sub = t('历史总计', 'Lifetime History');
            button = t('清空历史', 'Clear History');
        }
        return { isMe, value, sub, button, disabled };
    }

    function update() {
        const elements = {
            big: documentRef.getElementById('g-big-display'),
            sub: documentRef.getElementById('g-sub-info'),
            action: documentRef.getElementById('g-action-btn'),
            capsule: documentRef.getElementById('g-user-capsule'),
            model: documentRef.getElementById('g-model-badge'),
            quotaWrap: documentRef.getElementById('g-quota-wrap'),
            quotaFill: documentRef.getElementById('g-quota-fill'),
            quotaLabel: documentRef.getElementById('g-quota-label')
        };
        if (!elements.big || !elements.sub || !elements.action || !elements.capsule || !elements.model) return false;
        const user = core.getCurrentUser();
        const inspecting = core.getInspectingUser();
        const view = computeView(user, inspecting);
        const displayName = inspecting === tempUser ? 'Guest' : inspecting.split('@')[0];
        const accountType = counter.accountType || 'free';
        if (previous.displayName !== displayName || previous.isMe !== view.isMe || previous.accountType !== accountType) {
            elements.capsule.replaceChildren();
            const dot = documentRef.createElement('div');
            dot.className = 'user-avatar-dot';
            const name = documentRef.createElement('span');
            name.textContent = displayName;
            elements.capsule.append(dot, name);
            if (accountType !== 'free') {
                const badge = documentRef.createElement('span');
                badge.className = 'acct-badge-inline';
                badge.dataset.tier = accountType;
                badge.textContent = accountType === 'ultra' ? 'Ultra' : 'Pro';
                badge.title = t('账户等级', 'Account Tier');
                elements.capsule.appendChild(badge);
            }
            elements.capsule.classList.toggle('viewing-other', !view.isMe);
            elements.capsule.title = view.isMe
                ? t('活跃用户', 'Active User')
                : t('查看其他用户（只读）', 'Viewing other user (Read Only)');
            Object.assign(previous, { displayName, isMe: view.isMe, accountType });
        }
        const model = counter.MODEL_CONFIG[counter.currentModel];
        if (previous.modelKey !== counter.currentModel && model) {
            elements.model.textContent = model.label;
            elements.model.style.background = model.color;
            elements.model.style.color = counter.currentModel === 'flash' ? '#000' : '#fff';
            previous.modelKey = counter.currentModel;
        }
        if (previous.value !== view.value) {
            const numeric = typeof view.value === 'number' ? view.value : -1;
            if (numeric !== counter.lastDisplayedVal && counter.lastDisplayedVal !== -1 && numeric > counter.lastDisplayedVal) {
                elements.big.classList.remove('bump');
                void elements.big.offsetWidth;
                elements.big.classList.add('bump');
            }
            counter.lastDisplayedVal = numeric;
            elements.big.textContent = view.value;
            previous.value = view.value;
        }
        if (previous.sub !== view.sub) {
            elements.sub.textContent = view.sub;
            elements.sub.title = view.sub;
            previous.sub = view.sub;
        }
        const used = counter.getTodayMessages();
        const weighted = counter.getWeightedQuota();
        const normalizedWeighted = Number.isFinite(weighted) ? Math.max(weighted, 0) : 0;
        const rawQuotaPct = counter.quotaLimit > 0 ? (normalizedWeighted / counter.quotaLimit) * 100 : 0;
        const quotaPct = Math.min(rawQuotaPct, 100);
        const quotaColor = quotaPct < 60 ? quotaColors.safe : quotaPct < 85 ? quotaColors.warn : quotaColors.danger;
        const weightedText = normalizedWeighted % 1 === 0 ? String(normalizedWeighted) : normalizedWeighted.toFixed(1);
        const quotaText = `${used} msgs (${weightedText} weighted) / ${counter.quotaLimit}`;
        if (elements.quotaWrap) {
            elements.quotaWrap.setAttribute('aria-valuenow', String(quotaPct));
            elements.quotaWrap.setAttribute('aria-valuetext', quotaText);
        }
        if (elements.quotaFill && elements.quotaLabel) {
            if (previous.quotaPct !== quotaPct || previous.quotaColor !== quotaColor) {
                elements.quotaFill.style.width = `${quotaPct}%`;
                elements.quotaFill.style.background = quotaColor;
                Object.assign(previous, { quotaPct, quotaColor });
            }
            if (previous.quotaText !== quotaText) {
                elements.quotaLabel.textContent = quotaText;
                previous.quotaText = quotaText;
            }
        }
        if (previous.button !== view.button || previous.disabled !== view.disabled || previous.resetStep !== counter.state.resetStep) {
            elements.action.disabled = view.disabled;
            if (view.disabled) {
                elements.action.textContent = t('仅查看', 'View Only');
                elements.action.className = 'g-btn disabled';
            } else if (counter.state.resetStep === 0) {
                elements.action.textContent = view.button;
                elements.action.className = 'g-btn';
            } else {
                elements.action.textContent = counter.state.resetStep === 1 ? 'Sure?' : 'Really?';
                elements.action.className = `g-btn danger-${counter.state.resetStep}`;
            }
            Object.assign(previous, {
                button: view.button,
                disabled: view.disabled,
                resetStep: counter.state.resetStep
            });
        }
        return true;
    }

    return Object.freeze({
        renderStats,
        sectionTitle,
        formatQuotaWindow,
        passiveRow,
        selectableRow,
        update,
        reset() { previous = {}; }
    });
}
