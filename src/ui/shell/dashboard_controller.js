import { IconButton } from '../components.js';

export function openDashboardController(options = {}) {
    const {
        document: documentRef,
        window: windowRef,
        createIcon: iconFactory,
        core,
        counter,
        formatDate,
        getTheme,
        ui,
        schedule,
        now = () => new Date()
    } = options;
    if (!documentRef?.createElement) throw new TypeError('Dashboard requires a DOM document');
    if (!windowRef) throw new TypeError('Dashboard requires a window');
    for (const [value, label] of [
        [iconFactory, 'createIcon'],
        [formatDate, 'formatDate'],
        [getTheme, 'getTheme'],
        [schedule, 'schedule']
    ]) {
        if (typeof value !== 'function') throw new TypeError(`Dashboard ${label} must be a function`);
    }
    if (!core || !counter || !ui) throw new TypeError('Dashboard requires core, counter, and ui');
    const DASHBOARD_ID = 'gemini-dashboard-overlay';
    if (ui.getDialog(DASHBOARD_ID)) return;

    const cm = counter;
    let dialogHandle = null;
    let unsubscribeLocale = null;
    const closeDash = () => {
        dialogHandle?.close('programmatic');
    };

    const modal = documentRef.createElement('div');
    modal.className = 'dash-modal';
    core.applyTheme(modal, getTheme());

    // Header
    const header = documentRef.createElement('div');
    header.className = 'dash-header';

    const titleDiv = documentRef.createElement('div');
    titleDiv.className = 'dash-title';
    const titleIcon = iconFactory('chart', 20);
    titleIcon.setAttribute('aria-hidden', 'true');
    const titleText = documentRef.createElement('span');
    titleText.textContent = ui.t('统计', 'Analytics');
    titleDiv.append(titleIcon, titleText);
    const userSpan = documentRef.createElement('span');
    userSpan.style.fontSize = '12px';
    userSpan.style.opacity = '0.5';
    userSpan.style.marginTop = '8px';
    userSpan.textContent = core.getCurrentUser().split('@')[0];
    titleDiv.appendChild(userSpan);

    const closeControl = IconButton({
        document: documentRef,
        label: ui.t('关闭统计面板', 'Close analytics'),
        icon: iconFactory('x', 22),
        onPress: closeDash
    });
    const close = closeControl.element;
    close.className += ' dash-close';

    header.appendChild(titleDiv);
    header.appendChild(close);
    modal.appendChild(header);

    // Content
    const content = documentRef.createElement('div');
    content.className = 'dash-content';

    // Metric Cards
    const streaks = cm.calculateStreaks();
    const grid = documentRef.createElement('div');
    grid.className = 'metric-grid';

    const metrics = [
        { zh: '总消息数', en: 'Total Messages', value: () => cm.state.total.toLocaleString() },
        { zh: '创建对话数', en: 'Chats Created', value: () => cm.state.totalChatsCreated.toLocaleString() },
        { zh: '当前连续天数', en: 'Current Streak', value: () => `${streaks.current} ${ui.t('天', 'Days')}` },
        { zh: '最长连续天数', en: 'Best Streak', value: () => `${streaks.best} ${ui.t('天', 'Days')}` },
    ];

    const metricNodes = [];
    metrics.forEach(m => {
        const card = documentRef.createElement('div');
        card.className = 'metric-card';
        const valDiv = documentRef.createElement('div');
        valDiv.className = 'metric-val';
        valDiv.textContent = m.value();
        const labelDiv = documentRef.createElement('div');
        labelDiv.className = 'metric-label';
        labelDiv.textContent = ui.t(m.zh, m.en);
        card.appendChild(valDiv);
        card.appendChild(labelDiv);
        grid.appendChild(card);
        metricNodes.push({ metric: m, value: valDiv, label: labelDiv });
    });
    content.appendChild(grid);

    // Heatmap
    const hmContainer = documentRef.createElement('div');
    hmContainer.className = 'heatmap-container';

    const hmHeader = documentRef.createElement('div');
    hmHeader.className = 'heatmap-title';
    const titleSpan = documentRef.createElement('span');
    titleSpan.textContent = ui.t('活动记录（最近 365 天）', 'Activity (Last 365 Days)');

    const legend = documentRef.createElement('div');
    legend.className = 'heatmap-legend';
    const legendLess = documentRef.createElement('span');
    legendLess.textContent = ui.t('少 ', 'Less ');
    legend.appendChild(legendLess);
    ['l-0', 'l-1', 'l-3', 'l-4'].forEach(cls => {
        const item = documentRef.createElement('div');
        item.className = `legend-item ${cls}`;
        legend.appendChild(item);
    });
    const legendMore = documentRef.createElement('span');
    legendMore.textContent = ui.t(' 多', ' More');
    legend.appendChild(legendMore);

    hmHeader.appendChild(titleSpan);
    hmHeader.appendChild(legend);
    hmContainer.appendChild(hmHeader);

    const hmWrapper = documentRef.createElement('div');
    hmWrapper.className = 'heatmap-wrapper';

    // Week Labels
    const weekCol = documentRef.createElement('div');
    weekCol.className = 'heatmap-week-labels';
    const weekLabels = [];
    ['', 'Mon', '', 'Wed', '', 'Fri', ''].forEach(d => {
        const label = documentRef.createElement('div');
        label.className = 'week-label';
        label.textContent = ui.t({ Mon: '一', Wed: '三', Fri: '五' }[d] || '', d);
        weekCol.appendChild(label);
        weekLabels.push({ node: label, day: d });
    });
    hmWrapper.appendChild(weekCol);

    const hmMain = documentRef.createElement('div');
    hmMain.className = 'heatmap-main';

    const monthRow = documentRef.createElement('div');
    monthRow.className = 'heatmap-months';

    const hmGrid = documentRef.createElement('div');
    hmGrid.className = 'heatmap-grid';

    const today = now();
    const oneYearAgo = new Date(today);
    oneYearAgo.setDate(today.getDate() - 365);

    let maxVal = 0;
    Object.values(cm.state.dailyCounts).forEach(v => { if (v.messages > maxVal) maxVal = v.messages; });
    if (maxVal < 10) maxVal = 10;

    let tooltip = documentRef.getElementById('g-heatmap-tooltip');
    if (!tooltip) {
        tooltip = documentRef.createElement('div');
        tooltip.id = 'g-heatmap-tooltip';
        tooltip.className = 'g-tooltip';
        documentRef.body.appendChild(tooltip);
    }

    let iterDate = new Date(oneYearAgo);
    iterDate.setDate(iterDate.getDate() - iterDate.getDay());
    let lastMonth = -1;

    for (let week = 0; week < 53; week++) {
        const currentMonth = iterDate.getMonth();
        const mLabel = documentRef.createElement('div');
        mLabel.className = 'month-label';

        if (currentMonth !== lastMonth) {
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            mLabel.textContent = monthNames[currentMonth];
            lastMonth = currentMonth;
        }
        monthRow.appendChild(mLabel);

        const col = documentRef.createElement('div');
        col.className = 'heatmap-col';
        for (let day = 0; day < 7; day++) {
            const key = formatDate(iterDate);
            const count = cm.state.dailyCounts[key]?.messages || 0;

            const cell = documentRef.createElement('div');
            cell.className = 'heatmap-cell';

            let level = 'l-0';
            if (count > 0) {
                const ratio = count / maxVal;
                if (ratio > 0.75) level = 'l-4';
                else if (ratio > 0.5) level = 'l-3';
                else if (ratio > 0.25) level = 'l-2';
                else level = 'l-1';
            }
            cell.classList.add(level);

            cell.onmouseenter = (e) => {
                tooltip.textContent = '';
                const b = documentRef.createElement('div');
                b.style.fontWeight = 'bold';
                b.textContent = key;
                const sp = documentRef.createElement('div');
                sp.textContent = `${count} messages`;
                tooltip.appendChild(b);
                tooltip.appendChild(sp);
                tooltip.classList.add('visible');
                const rect = cell.getBoundingClientRect();
                let left = rect.left + rect.width / 2;
                let top = rect.top;
                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';
                const ttRect = tooltip.getBoundingClientRect();
                if (ttRect.right > windowRef.innerWidth) tooltip.style.left = (windowRef.innerWidth - ttRect.width / 2 - 10) + 'px';
                if (ttRect.left < 0) tooltip.style.left = (ttRect.width / 2 + 10) + 'px';
                if (ttRect.top < 0) tooltip.style.top = (rect.bottom + 10) + 'px';
                if (ttRect.bottom > windowRef.innerHeight) tooltip.style.top = (rect.top - ttRect.height - 10) + 'px';
            };
            cell.onmouseleave = () => tooltip.classList.remove('visible');

            col.appendChild(cell);
            iterDate.setDate(iterDate.getDate() + 1);

            if (iterDate > today && day === today.getDay()) break;
        }
        hmGrid.appendChild(col);
        if (iterDate > today) break;
    }

    hmMain.appendChild(monthRow);
    hmMain.appendChild(hmGrid);
    hmWrapper.appendChild(hmMain);

    hmContainer.appendChild(hmWrapper);
    content.appendChild(hmContainer);

    // Model Distribution Chart
    const allByModel = { flash: 0, thinking: 0, pro: 0 };
    Object.values(cm.state.dailyCounts).forEach(entry => {
        if (entry.byModel) {
            allByModel.flash += entry.byModel.flash || 0;
            allByModel.thinking += entry.byModel.thinking || 0;
            allByModel.pro += entry.byModel.pro || 0;
        }
    });
    const modelTotal = allByModel.flash + allByModel.thinking + allByModel.pro;

    let modelTitleSpan = null;
    let weightedRow = null;
    let weightedSummary = null;
    if (modelTotal > 0) {
        const modelContainer = documentRef.createElement('div');
        modelContainer.className = 'heatmap-container';

        const modelTitle = documentRef.createElement('div');
        modelTitle.className = 'heatmap-title';
        modelTitleSpan = documentRef.createElement('span');
        modelTitleSpan.textContent = ui.t('模型使用分布', 'Model Usage Distribution');
        modelTitle.appendChild(modelTitleSpan);
        modelContainer.appendChild(modelTitle);

        const modelColors = { flash: counter.MODEL_CONFIG.flash.color, thinking: counter.MODEL_CONFIG.thinking.color, pro: counter.MODEL_CONFIG.pro.color };
        const models = [
            { key: 'flash', label: '3 Flash', count: allByModel.flash },
            { key: 'thinking', label: '3 Flash Thinking', count: allByModel.thinking },
            { key: 'pro', label: '3 Pro', count: allByModel.pro }
        ];

        models.forEach(m => {
            const pct = (m.count / modelTotal * 100).toFixed(1);
            const barRow = documentRef.createElement('div');
            barRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;';

            const labelEl = documentRef.createElement('div');
            labelEl.style.cssText = 'font-size: 11px; color: var(--text-sub); width: 110px; flex-shrink: 0;';
            labelEl.textContent = m.label;

            const barBg = documentRef.createElement('div');
            barBg.style.cssText = 'flex: 1; height: 16px; background: var(--btn-bg, rgba(255,255,255,0.05)); border-radius: 4px; overflow: hidden;';
            const barFill = documentRef.createElement('div');
            barFill.style.cssText = `height: 100%; width: ${pct}%; background: ${modelColors[m.key]}; border-radius: 4px; transition: width 0.4s;`;
            barBg.appendChild(barFill);

            const valEl = documentRef.createElement('div');
            valEl.style.cssText = 'font-size: 11px; color: var(--text-main); width: 70px; text-align: right; flex-shrink: 0; font-family: monospace;';
            valEl.textContent = `${m.count} (${pct}%)`;

            barRow.appendChild(labelEl);
            barRow.appendChild(barBg);
            barRow.appendChild(valEl);
            modelContainer.appendChild(barRow);
        });

        // Weighted summary
        const weightedTotal = Object.keys(allByModel).reduce((sum, k) => sum + (allByModel[k] || 0) * (counter.MODEL_CONFIG[k]?.multiplier ?? 1), 0);
        const wStr = weightedTotal % 1 === 0 ? String(weightedTotal) : weightedTotal.toFixed(1);
        weightedRow = documentRef.createElement('div');
        weightedRow.style.cssText = 'font-size: 11px; color: var(--text-sub); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--divider, rgba(255,255,255,0.05));';
        weightedSummary = { weighted: wStr, raw: modelTotal };
        weightedRow.textContent = ui.t(`加权总量: ${wStr} | 原始消息: ${modelTotal}`, `Total Weighted: ${wStr} | Raw Messages: ${modelTotal}`);
        modelContainer.appendChild(weightedRow);

        content.appendChild(modelContainer);
    }

    modal.appendChild(content);
    function localize() {
        titleText.textContent = ui.t('统计', 'Analytics');
        close.setAttribute('aria-label', ui.t('关闭统计面板', 'Close analytics'));
        close.title = ui.t('关闭统计面板', 'Close analytics');
        for (const { metric, value, label } of metricNodes) {
            label.textContent = ui.t(metric.zh, metric.en);
            value.textContent = metric.value();
        }
        titleSpan.textContent = ui.t('活动记录（最近 365 天）', 'Activity (Last 365 Days)');
        legendLess.textContent = ui.t('少 ', 'Less ');
        legendMore.textContent = ui.t(' 多', ' More');
        for (const { node, day } of weekLabels) {
            node.textContent = ui.t({ Mon: '一', Wed: '三', Fri: '五' }[day] || '', day);
        }
        if (modelTitleSpan) modelTitleSpan.textContent = ui.t('模型使用分布', 'Model Usage Distribution');
        if (weightedRow && weightedSummary) {
            weightedRow.textContent = ui.t(
                `加权总量: ${weightedSummary.weighted} | 原始消息: ${weightedSummary.raw}`,
                `Total Weighted: ${weightedSummary.weighted} | Raw Messages: ${weightedSummary.raw}`
            );
        }
        dialogHandle?.element.setAttribute('aria-label', ui.t('统计', 'Analytics'));
    }
    // DialogManager owns ARIA, topmost Escape, inert background and focus
    // restoration. This replaces the legacy ui.trapFocus(modal).
    dialogHandle = ui.openDialog({
        id: DASHBOARD_ID,
        ariaLabel: ui.t('统计', 'Analytics'),
        overlayClass: 'dash-overlay',
        contentElement: modal,
        initialFocus: close,
        onClose: () => {
            unsubscribeLocale?.();
            unsubscribeLocale = null;
            closeControl.destroy();
            const tip = documentRef.getElementById('g-heatmap-tooltip');
            if (tip) tip.remove();
        }
    });
    unsubscribeLocale = ui.subscribeLocale(localize);

    schedule(() => { hmContainer.scrollLeft = hmContainer.scrollWidth; }, 0);
    return dialogHandle;
}
