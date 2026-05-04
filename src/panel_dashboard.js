/**
 * Dashboard modal (Analytics view with heatmap + model distribution).
 * Extracted from panel_ui.js — mixed into PanelUI at init time.
 */

import { createIcon } from './icons.js';
import { Core } from './core.js';
import { getCurrentTheme } from './state.js';
import { CounterModule } from './modules/counter.js';
import { formatLocalDate } from '../lib/date_utils.js';
import { NativeUI } from './native_ui.js';

export function openDashboard() {
    const exist = document.getElementById('gemini-dashboard-overlay');
    if (exist) return;

    const cm = CounterModule;
    const overlay = document.createElement('div');
    overlay.id = 'gemini-dashboard-overlay';
    overlay.className = 'dash-overlay';
    let releaseFocus = null;
    const closeDash = () => {
        document.removeEventListener('keydown', escHandler);
        if (releaseFocus) releaseFocus();
        const tip = document.getElementById('g-heatmap-tooltip');
        if (tip) tip.remove();
        overlay.remove();
    };
    const escHandler = (e) => { if (e.key === 'Escape') closeDash(); };
    document.addEventListener('keydown', escHandler);
    overlay.onclick = (e) => { if (e.target === overlay) closeDash(); };

    const modal = document.createElement('div');
    modal.className = 'dash-modal';
    Core.applyTheme(modal, getCurrentTheme());

    // Header
    const header = document.createElement('div');
    header.className = 'dash-header';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'dash-title';
    titleDiv.textContent = '';
    titleDiv.appendChild(createIcon('chart', 20));
    titleDiv.appendChild(document.createTextNode(' ' + NativeUI.t('统计', 'Analytics') + ' '));
    const userSpan = document.createElement('span');
    userSpan.style.fontSize = '12px';
    userSpan.style.opacity = '0.5';
    userSpan.style.marginTop = '8px';
    userSpan.textContent = Core.getCurrentUser().split('@')[0];
    titleDiv.appendChild(userSpan);

    const close = document.createElement('div');
    close.className = 'dash-close';
    close.tabIndex = 0;
    close.setAttribute('role', 'button');
    close.setAttribute('aria-label', NativeUI.t('关闭统计面板', 'Close analytics'));
    close.appendChild(createIcon('x', 22));
    close.onclick = () => closeDash();
    close.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') closeDash(); };

    header.appendChild(titleDiv);
    header.appendChild(close);
    modal.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'dash-content';

    // Metric Cards
    const streaks = cm.calculateStreaks();
    const grid = document.createElement('div');
    grid.className = 'metric-grid';

    const metrics = [
        { label: NativeUI.t('总消息数', 'Total Messages'), val: cm.state.total.toLocaleString() },
        { label: NativeUI.t('创建对话数', 'Chats Created'), val: cm.state.totalChatsCreated.toLocaleString() },
        { label: NativeUI.t('当前连续天数', 'Current Streak'), val: streaks.current + ' ' + NativeUI.t('天', 'Days') },
        { label: NativeUI.t('最长连续天数', 'Best Streak'), val: streaks.best + ' ' + NativeUI.t('天', 'Days') },
    ];

    metrics.forEach(m => {
        const card = document.createElement('div');
        card.className = 'metric-card';
        const valDiv = document.createElement('div');
        valDiv.className = 'metric-val';
        valDiv.textContent = m.val;
        const labelDiv = document.createElement('div');
        labelDiv.className = 'metric-label';
        labelDiv.textContent = m.label;
        card.appendChild(valDiv);
        card.appendChild(labelDiv);
        grid.appendChild(card);
    });
    content.appendChild(grid);

    // Heatmap
    const hmContainer = document.createElement('div');
    hmContainer.className = 'heatmap-container';

    const hmHeader = document.createElement('div');
    hmHeader.className = 'heatmap-title';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = NativeUI.t('活动记录（最近 365 天）', 'Activity (Last 365 Days)');

    const legend = document.createElement('div');
    legend.className = 'heatmap-legend';
    legend.appendChild(document.createTextNode(NativeUI.t('少 ', 'Less ')));
    ['l-0', 'l-1', 'l-3', 'l-4'].forEach(cls => {
        const item = document.createElement('div');
        item.className = `legend-item ${cls}`;
        legend.appendChild(item);
    });
    legend.appendChild(document.createTextNode(NativeUI.t(' 多', ' More')));

    hmHeader.appendChild(titleSpan);
    hmHeader.appendChild(legend);
    hmContainer.appendChild(hmHeader);

    const hmWrapper = document.createElement('div');
    hmWrapper.className = 'heatmap-wrapper';

    // Week Labels
    const weekCol = document.createElement('div');
    weekCol.className = 'heatmap-week-labels';
    ['', 'Mon', '', 'Wed', '', 'Fri', ''].forEach(d => {
        const label = document.createElement('div');
        label.className = 'week-label';
        label.textContent = NativeUI.t({ Mon: '一', Wed: '三', Fri: '五' }[d] || '', d);
        weekCol.appendChild(label);
    });
    hmWrapper.appendChild(weekCol);

    const hmMain = document.createElement('div');
    hmMain.className = 'heatmap-main';

    const monthRow = document.createElement('div');
    monthRow.className = 'heatmap-months';

    const hmGrid = document.createElement('div');
    hmGrid.className = 'heatmap-grid';

    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setDate(today.getDate() - 365);

    let maxVal = 0;
    Object.values(cm.state.dailyCounts).forEach(v => { if (v.messages > maxVal) maxVal = v.messages; });
    if (maxVal < 10) maxVal = 10;

    let tooltip = document.getElementById('g-heatmap-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'g-heatmap-tooltip';
        tooltip.className = 'g-tooltip';
        document.body.appendChild(tooltip);
    }

    let iterDate = new Date(oneYearAgo);
    iterDate.setDate(iterDate.getDate() - iterDate.getDay());
    let lastMonth = -1;

    for (let week = 0; week < 53; week++) {
        const currentMonth = iterDate.getMonth();
        const mLabel = document.createElement('div');
        mLabel.className = 'month-label';

        if (currentMonth !== lastMonth) {
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            mLabel.textContent = monthNames[currentMonth];
            lastMonth = currentMonth;
        }
        monthRow.appendChild(mLabel);

        const col = document.createElement('div');
        col.className = 'heatmap-col';
        for (let day = 0; day < 7; day++) {
            const key = formatLocalDate(iterDate);
            const count = cm.state.dailyCounts[key]?.messages || 0;

            const cell = document.createElement('div');
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
                const b = document.createElement('div');
                b.style.fontWeight = 'bold';
                b.textContent = key;
                const sp = document.createElement('div');
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
                if (ttRect.right > window.innerWidth) tooltip.style.left = (window.innerWidth - ttRect.width / 2 - 10) + 'px';
                if (ttRect.left < 0) tooltip.style.left = (ttRect.width / 2 + 10) + 'px';
                if (ttRect.top < 0) tooltip.style.top = (rect.bottom + 10) + 'px';
                if (ttRect.bottom > window.innerHeight) tooltip.style.top = (rect.top - ttRect.height - 10) + 'px';
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

    if (modelTotal > 0) {
        const modelContainer = document.createElement('div');
        modelContainer.className = 'heatmap-container';

        const modelTitle = document.createElement('div');
        modelTitle.className = 'heatmap-title';
        const modelTitleSpan = document.createElement('span');
        modelTitleSpan.textContent = NativeUI.t('模型使用分布', 'Model Usage Distribution');
        modelTitle.appendChild(modelTitleSpan);
        modelContainer.appendChild(modelTitle);

        const modelColors = { flash: CounterModule.MODEL_CONFIG.flash.color, thinking: CounterModule.MODEL_CONFIG.thinking.color, pro: CounterModule.MODEL_CONFIG.pro.color };
        const models = [
            { key: 'flash', label: '3 Flash', count: allByModel.flash },
            { key: 'thinking', label: '3 Flash Thinking', count: allByModel.thinking },
            { key: 'pro', label: '3 Pro', count: allByModel.pro }
        ];

        models.forEach(m => {
            const pct = (m.count / modelTotal * 100).toFixed(1);
            const barRow = document.createElement('div');
            barRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;';

            const labelEl = document.createElement('div');
            labelEl.style.cssText = 'font-size: 11px; color: var(--text-sub); width: 110px; flex-shrink: 0;';
            labelEl.textContent = m.label;

            const barBg = document.createElement('div');
            barBg.style.cssText = 'flex: 1; height: 16px; background: var(--btn-bg, rgba(255,255,255,0.05)); border-radius: 4px; overflow: hidden;';
            const barFill = document.createElement('div');
            barFill.style.cssText = `height: 100%; width: ${pct}%; background: ${modelColors[m.key]}; border-radius: 4px; transition: width 0.4s;`;
            barBg.appendChild(barFill);

            const valEl = document.createElement('div');
            valEl.style.cssText = 'font-size: 11px; color: var(--text-main); width: 70px; text-align: right; flex-shrink: 0; font-family: monospace;';
            valEl.textContent = `${m.count} (${pct}%)`;

            barRow.appendChild(labelEl);
            barRow.appendChild(barBg);
            barRow.appendChild(valEl);
            modelContainer.appendChild(barRow);
        });

        // Weighted summary
        const weightedTotal = Object.keys(allByModel).reduce((sum, k) => sum + (allByModel[k] || 0) * (CounterModule.MODEL_CONFIG[k]?.multiplier ?? 1), 0);
        const wStr = weightedTotal % 1 === 0 ? String(weightedTotal) : weightedTotal.toFixed(1);
        const weightedRow = document.createElement('div');
        weightedRow.style.cssText = 'font-size: 11px; color: var(--text-sub); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--divider, rgba(255,255,255,0.05));';
        weightedRow.textContent = NativeUI.t(`加权总量: ${wStr} | 原始消息: ${modelTotal}`, `Total Weighted: ${wStr} | Raw Messages: ${modelTotal}`);
        modelContainer.appendChild(weightedRow);

        content.appendChild(modelContainer);
    }

    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    releaseFocus = NativeUI.trapFocus(modal);
    close.focus();

    setTimeout(() => { hmContainer.scrollLeft = hmContainer.scrollWidth; }, 0);
}
