import { Button } from '../components.js';
import { createModalShell, createShellButton } from './modal_shell.js';

function requireFunction(value, label) {
    if (typeof value !== 'function') throw new TypeError(`Debug ${label} must be a function`);
    return value;
}

function infoLine(documentRef, label, value) {
    const line = documentRef.createElement('div');
    const strong = documentRef.createElement('strong');
    strong.textContent = `${label}:`;
    line.append(strong, documentRef.createTextNode(` ${value}`));
    return line;
}

export function openDebugController(options = {}) {
    const documentRef = options.document || globalThis.document;
    if (!documentRef?.createElement) throw new TypeError('Debug requires a DOM document');
    for (const [label, value] of [
        ['createIcon', options.createIcon],
        ['getTheme', options.getTheme],
        ['filterLogs', options.filterLogs],
        ['isDebugEnabled', options.isDebugEnabled]
    ]) requireFunction(value, label);
    const { core, adapter, logger, ui } = options;
    if (!core || !adapter || !logger || !ui || !Array.isArray(options.actions)) {
        throw new TypeError('Debug requires application dependencies');
    }
    for (const action of options.actions) requireFunction(action?.run, 'action');

    const dialogId = 'gemini-debug-modal';
    if (ui.getDialog(dialogId)) return undefined;
    let dialogHandle = null;
    let unsubscribeLogs = null;
    let unsubscribeLocale = null;
    let activeFilter = 'all';
    let searchTerm = '';
    const controls = [];
    const close = () => dialogHandle?.close('programmatic');

    const modalShell = createModalShell({
        document: documentRef,
        createIcon: options.createIcon,
        title: ui.t('调试面板', 'Debug Panel'),
        titleIcon: 'bug',
        closeLabel: ui.t('关闭调试面板', 'Close debug panel'),
        modalClass: 'debug-modal',
        headerClass: 'debug-header',
        bodyClass: 'debug-body',
        closeClass: 'debug-close',
        onClose: close
    });
    controls.push(modalShell);
    const modal = modalShell.modal;
    const body = modalShell.body;
    core.applyTheme(modal, options.getTheme());

    const detected = core.detectUser();
    const current = core.getCurrentUser();
    const inspecting = core.getInspectingUser();
    const effective = detected || current;
    const storageKey = effective?.includes('@') ? `gemini_store_${effective}` : 'N/A';
    const info = documentRef.createElement('div');
    info.className = 'debug-kv';
    info.append(
        infoLine(documentRef, 'Detected', detected || 'null'),
        infoLine(documentRef, 'Current', current),
        infoLine(documentRef, 'Inspecting', inspecting),
        infoLine(documentRef, 'Storage Key', storageKey),
        infoLine(documentRef, 'Debug Enabled', String(options.isDebugEnabled())),
        infoLine(documentRef, 'Log Level', logger.getLevel())
    );

    const report = adapter.getSelectorHealthReport();
    const health = documentRef.createElement('div');
    health.className = 'debug-kv';
    health.append(
        infoLine(documentRef, 'Adapter Ready', String(report.ready)),
        infoLine(documentRef, 'Adapter Health', `${report.passed}/${report.total}`)
    );
    for (const check of report.checks) {
        health.appendChild(infoLine(
            documentRef,
            check.detail ? `${check.label} (${check.detail})` : check.label,
            check.ok ? 'ok' : 'missing'
        ));
    }

    const filterRow = documentRef.createElement('div');
    filterRow.className = 'debug-filter-row';
    filterRow.setAttribute('role', 'group');
    const filterButtons = new Map();
    const logList = documentRef.createElement('div');
    logList.className = 'debug-log-list';

    function syncFilters() {
        for (const [filter, button] of filterButtons) {
            const active = filter === activeFilter;
            button.element.classList.toggle('active', active);
            button.element.setAttribute('aria-pressed', String(active));
        }
    }

    function renderLogs() {
        logList.replaceChildren();
        const entries = options.filterLogs(logger.getEntries(), {
            level: activeFilter,
            term: searchTerm
        }).slice(-120);
        if (entries.length === 0) {
            const empty = documentRef.createElement('div');
            empty.className = 'debug-log-item';
            empty.textContent = ui.t('暂无日志。', 'No logs yet.');
            logList.appendChild(empty);
            return;
        }
        for (const entry of entries) {
            const item = documentRef.createElement('div');
            item.className = 'debug-log-item';
            item.textContent = `${entry.ts} `;
            const level = documentRef.createElement('span');
            level.className = `debug-level ${entry.level}`;
            level.textContent = `[${entry.level.toUpperCase()}]`;
            const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
            item.append(level, documentRef.createTextNode(` ${entry.msg}${data}`));
            logList.appendChild(item);
        }
    }

    for (const filter of ['all', 'error', 'warn', 'info', 'debug']) {
        const button = Button({
            document: documentRef,
            label: filter.toUpperCase(),
            onPress() {
                activeFilter = filter;
                syncFilters();
                renderLogs();
            }
        });
        button.element.className += ' debug-filter-btn';
        controls.push(button);
        filterButtons.set(filter, button);
        filterRow.appendChild(button.element);
    }
    syncFilters();

    const search = documentRef.createElement('input');
    search.type = 'search';
    search.className = 'debug-search';
    search.placeholder = ui.t('搜索日志...', 'Search logs...');
    search.setAttribute('aria-label', search.placeholder);
    search.oninput = () => {
        searchTerm = search.value.trim().toLowerCase();
        renderLogs();
    };

    const actions = documentRef.createElement('div');
    actions.className = 'debug-actions';
    const actionControls = options.actions.map(action => {
        const control = createShellButton({
            document: documentRef,
            label: ui.t(action.zh, action.en),
            onPress: action.run
        });
        controls.push(control);
        actions.appendChild(control.element);
        return { action, control };
    });

    function localize() {
        modalShell.title.lastChild.textContent = ` ${ui.t('调试面板', 'Debug Panel')}`;
        modalShell.closeButton.setAttribute('aria-label', ui.t('关闭调试面板', 'Close debug panel'));
        modalShell.closeButton.title = ui.t('关闭调试面板', 'Close debug panel');
        filterRow.setAttribute('aria-label', ui.t('日志级别筛选', 'Log level filters'));
        search.placeholder = ui.t('搜索日志...', 'Search logs...');
        search.setAttribute('aria-label', search.placeholder);
        for (const { action, control } of actionControls) control.setLabel(ui.t(action.zh, action.en));
        renderLogs();
    }

    body.append(info, health, filterRow, search, actions, logList);
    renderLogs();
    unsubscribeLogs = logger.subscribe(renderLogs);
    dialogHandle = ui.openDialog({
        id: dialogId,
        ariaLabel: ui.t('调试面板', 'Debug panel'),
        overlayClass: 'debug-overlay',
        contentElement: modal,
        initialFocus: modalShell.closeButton,
        onClose() {
            unsubscribeLogs?.();
            unsubscribeLogs = null;
            unsubscribeLocale?.();
            unsubscribeLocale = null;
            for (const control of controls) control.destroy?.();
        }
    });
    unsubscribeLocale = ui.subscribeLocale(localize);
    return dialogHandle;
}
