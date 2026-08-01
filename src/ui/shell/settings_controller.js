import { FormField } from '../components.js';
import {
    createModalShell,
    createSection,
    createShellButton,
    createShellSwitch
} from './modal_shell.js';
function requireFunction(value, label) {
    if (typeof value !== 'function') throw new TypeError(`Settings ${label} must be a function`);
    return value;
}
function iconHeading(documentRef, heading, iconFactory, iconName, text, size = 14) {
    const icon = iconFactory(iconName, size);
    icon.setAttribute('aria-hidden', 'true');
    heading.replaceChildren(icon, documentRef.createTextNode(` ${text}`));
}
function register(list, ...handles) {
    list.push(...handles);
    return handles.at(-1);
}
export const EMPTY_CAPABILITY_HEALTH_PORT = Object.freeze({
    getSnapshot: () => null,
    subscribe: () => () => {}
});
export function normalizeCapabilityPresentation(feature) {
    const rawStatus = typeof feature?.status === 'string' ? feature.status : '';
    let state = 'unknown';
    if (rawStatus === 'available' || rawStatus === 'native-owned') state = 'available';
    else if (rawStatus === 'degraded') state = 'degraded';
    else if (rawStatus === 'failed' || rawStatus === 'disabled') state = 'unavailable';
    const owner = rawStatus === 'native-owned' || (
        feature?.nativeCapability?.owned === true
        && feature?.nativeCapability?.policy === 'prefer-native'
    ) ? 'native' : 'extension';
    return Object.freeze({ state, owner });
}
function validateCapabilityHealthPort(port) {
    if (port == null) return EMPTY_CAPABILITY_HEALTH_PORT;
    if (typeof port !== 'object') throw new TypeError('Settings capabilityHealth must be an object');
    requireFunction(port.getSnapshot, 'capabilityHealth.getSnapshot');
    requireFunction(port.subscribe, 'capabilityHealth.subscribe');
    return port;
}

function capabilityText(ui, presentation) {
    const status = {
        available: ui.t('可用', 'Available'),
        degraded: ui.t('降级', 'Degraded'),
        unavailable: ui.t('不可用', 'Unavailable'),
        unknown: ui.t('未知', 'Unknown')
    }[presentation.state];
    const owner = presentation.owner === 'native'
        ? ui.t('Gemini 原生拥有', 'Gemini native')
        : ui.t('扩展补充', 'Extension supplement');
    return { status, owner };
}

export function createUsageChart(documentRef, data) {
    if (!documentRef?.createElementNS) throw new TypeError('Usage chart requires a DOM document');
    if (!Array.isArray(data) || data.length === 0) throw new TypeError('Usage chart requires data');

    const container = documentRef.createElement('div');
    container.className = 'settings-usage-chart';
    const width = 268;
    const height = 80;
    const padding = 20;
    const maxValue = Math.max(...data.map(entry => Number(entry.messages) || 0), 1);
    const denominator = Math.max(data.length - 1, 1);
    const points = data.map((entry, index) => ({
        x: padding + index * ((width - 2 * padding) / denominator),
        y: height - padding - ((Number(entry.messages) || 0) / maxValue) * (height - 2 * padding),
        value: Number(entry.messages) || 0,
        label: String(entry.label || '')
    }));
    const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height + 20));
    svg.setAttribute('viewBox', `0 0 ${width} ${height + 20}`);

    const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const area = documentRef.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('d', `${line} L ${points.at(-1).x} ${height - padding} L ${points[0].x} ${height - padding} Z`);
    area.setAttribute('fill', 'rgba(138, 180, 248, 0.2)');
    svg.appendChild(area);

    const stroke = documentRef.createElementNS('http://www.w3.org/2000/svg', 'path');
    stroke.setAttribute('d', line);
    stroke.setAttribute('fill', 'none');
    stroke.setAttribute('stroke', 'var(--accent, #8ab4f8)');
    stroke.setAttribute('stroke-width', '2');
    stroke.setAttribute('stroke-linecap', 'round');
    stroke.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(stroke);

    for (const point of points) {
        const circle = documentRef.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(point.x));
        circle.setAttribute('cy', String(point.y));
        circle.setAttribute('r', '3');
        circle.setAttribute('fill', 'var(--accent, #8ab4f8)');
        svg.appendChild(circle);
        if (point.value > 0) {
            const value = documentRef.createElementNS('http://www.w3.org/2000/svg', 'text');
            value.setAttribute('x', String(point.x));
            value.setAttribute('y', String(point.y - 6));
            value.setAttribute('text-anchor', 'middle');
            value.setAttribute('font-size', '8');
            value.setAttribute('fill', 'var(--text-sub, #9aa0a6)');
            value.textContent = String(point.value);
            svg.appendChild(value);
        }
        const label = documentRef.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(point.x));
        label.setAttribute('y', String(height + 10));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '8');
        label.setAttribute('fill', 'var(--text-sub, #9aa0a6)');
        label.textContent = point.label;
        svg.appendChild(label);
    }
    container.appendChild(svg);
    return container;
}

export function openSettingsController(options = {}) {
    const documentRef = options.document || globalThis.document;
    if (!documentRef?.createElement) throw new TypeError('Settings requires a DOM document');
    const functions = [
        ['createIcon', options.createIcon],
        ['renderModuleIcon', options.renderModuleIcon],
        ['getTheme', options.getTheme],
        ['persist', options.persist],
        ['reload', options.reload],
        ['exportData', options.exportData],
        ['showOnboarding', options.showOnboarding],
        ['openCalibration', options.openCalibration],
        ['startTour', options.startTour],
        ['openDebug', options.openDebug],
        ['updatePanel', options.updatePanel],
        ['refreshDetails', options.refreshDetails],
        ['isDetailsExpanded', options.isDetailsExpanded],
        ['isDebugEnabled', options.isDebugEnabled],
        ['setDebugEnabled', options.setDebugEnabled],
        ['now', options.now]
    ];
    for (const [label, value] of functions) requireFunction(value, label);
    const { core, registry, counter, exportModule, logger, ui, keys, defaultPosition, metadata } = options;
    if (!core || !registry || !counter || !exportModule || !logger || !ui || !keys || !metadata) {
        throw new TypeError('Settings requires application dependencies');
    }
    const capabilityHealth = validateCapabilityHealthPort(options.capabilityHealth);

    const dialogId = 'gemini-settings-modal';
    if (ui.getDialog(dialogId)) return undefined;
    let dialogHandle = null;
    let modal = null;
    let unsubscribe = null;
    let unsubscribeCapabilityHealth = null;
    let controls = [];
    let capabilitySnapshot = capabilityHealth.getSnapshot();
    const capabilityNodes = new Map();
    let closed = false;
    const close = () => dialogHandle?.close('programmatic');

    function renderCapabilitySnapshot(snapshot) {
        capabilitySnapshot = snapshot ?? null;
        const features = Array.isArray(capabilitySnapshot?.features) ? capabilitySnapshot.features : [];
        const featureById = new Map(features.map(feature => [feature?.id, feature]));
        for (const [moduleId, nodes] of capabilityNodes) {
            const presentation = normalizeCapabilityPresentation(featureById.get(moduleId));
            const text = capabilityText(ui, presentation);
            nodes.status.dataset.capabilityState = presentation.state;
            nodes.status.textContent = text.status;
            nodes.owner.dataset.capabilityOwner = presentation.owner;
            nodes.owner.textContent = text.owner;
            nodes.container.title = `${text.status} · ${text.owner}`;
        }
    }

    function disposeControls() {
        for (const control of controls) control.destroy?.();
        controls = [];
    }

    function mountShell(shell) {
        if (!modal) {
            modal = shell.modal;
            return true;
        }
        while (shell.modal.firstChild) modal.appendChild(shell.modal.firstChild);
        shell.modal.remove();
        return false;
    }

    function render() {
        disposeControls();
        capabilityNodes.clear();
        modal?.replaceChildren();
        const shell = createModalShell({
            document: documentRef,
            createIcon: options.createIcon,
            title: ui.t('设置', 'Settings'),
            titleIcon: 'settings',
            closeLabel: ui.t('关闭设置', 'Close settings'),
            onClose: close
        });
        const adoptedShell = mountShell(shell);
        register(controls, adoptedShell
            ? { destroy: () => shell.destroy({ remove: false }) }
            : shell);
        core.applyTheme(modal, options.getTheme());
        const body = shell.body;

        const extensions = createSection(documentRef, '');
        iconHeading(documentRef, extensions.heading, options.createIcon, 'package', ui.t('功能扩展', 'Feature Extensions'));
        for (const module of registry.getAll()) {
            const row = documentRef.createElement('div');
            row.className = 'module-toggle-compact';
            row.title = module.description || '';
            const label = documentRef.createElement('div');
            label.className = 'module-compact-label';
            const icon = documentRef.createElement('span');
            icon.className = 'module-icon';
            icon.appendChild(options.renderModuleIcon(module, 16));
            const name = documentRef.createElement('span');
            name.textContent = module.name;
            const identity = documentRef.createElement('span');
            identity.className = 'module-compact-identity';
            identity.appendChild(name);
            const capability = documentRef.createElement('span');
            capability.className = 'module-capability-meta';
            capability.setAttribute('role', 'status');
            capability.setAttribute('aria-live', 'polite');
            const capabilityStatus = documentRef.createElement('span');
            capabilityStatus.className = 'module-capability-status';
            const capabilityOwner = documentRef.createElement('span');
            capabilityOwner.className = 'module-capability-owner';
            capability.append(capabilityStatus, capabilityOwner);
            identity.appendChild(capability);
            capabilityNodes.set(module.id, {
                container: capability,
                status: capabilityStatus,
                owner: capabilityOwner
            });
            label.append(icon, identity);
            const actions = documentRef.createElement('div');
            actions.className = 'module-compact-actions';
            if (typeof module.getOnboarding === 'function') {
                const info = register(controls, createShellButton({
                    document: documentRef,
                    label: ui.t('显示引导', 'Show guide'),
                    ariaLabel: `${ui.t('显示引导', 'Show guide')}: ${module.name}`,
                    className: 'onboarding-info-btn',
                    icon: options.createIcon('info', 12),
                    onPress: event => {
                        event.stopPropagation();
                        options.showOnboarding(module.id);
                    }
                }));
                actions.appendChild(info.element);
            }
            const enabledAtRender = registry.isEnabled(module.id);
            let desiredEnabled = enabledAtRender;
            let transitionRunning = false;
            let toggle;
            const syncToggle = enabled => {
                toggle.setChecked(enabled);
                toggle.control.classList.toggle('on', enabled);
            };
            const requestToggle = async checked => {
                desiredEnabled = Boolean(checked);
                syncToggle(desiredEnabled);
                if (transitionRunning) return;
                transitionRunning = true;
                toggle.setDisabled(true);
                toggle.control.setAttribute('aria-busy', 'true');
                let changed = false;
                try {
                    while (registry.isEnabled(module.id) !== desiredEnabled) {
                        const requested = desiredEnabled;
                        await registry.toggle(module.id, requested);
                        const actual = registry.isEnabled(module.id);
                        syncToggle(actual);
                        if (actual !== requested) {
                            desiredEnabled = actual;
                            break;
                        }
                        changed = true;
                    }
                } catch (error) {
                    const actual = registry.isEnabled(module.id);
                    desiredEnabled = actual;
                    syncToggle(actual);
                    logger.error('Module toggle failed from settings', { id: module.id, error: String(error) });
                    ui.showToast(ui.t('切换失败，请重试', 'Unable to change this feature. Try again.'));
                } finally {
                    transitionRunning = false;
                    toggle.setDisabled(false);
                    toggle.control.removeAttribute('aria-busy');
                }
                if (options.isDetailsExpanded()) options.refreshDetails();
                if (changed && !closed) render();
            };
            toggle = register(controls, createShellSwitch({
                document: documentRef,
                label: module.name,
                checked: enabledAtRender,
                className: 'module-switch',
                onChange: requestToggle
            }));
            toggle.label.className += ' primer-ui-visually-hidden';
            actions.appendChild(toggle.element);
            row.append(label, actions);
            extensions.section.appendChild(row);
        }
        body.appendChild(extensions.section);

        for (const module of registry.getAll()) {
            if (!registry.isEnabled(module.id) || typeof module.renderToSettings !== 'function') continue;
            const moduleSection = createSection(documentRef, '');
            moduleSection.section.setAttribute('data-module-settings-id', module.id);
            moduleSection.heading.append(
                options.renderModuleIcon(module, 12),
                documentRef.createTextNode(` ${ui.t('设置', 'Settings')}`)
            );
            module.renderToSettings(moduleSection.section);
            body.appendChild(moduleSection.section);
        }

        const reset = createSection(documentRef, ui.t('每日重置', 'Daily Reset'));
        const resetSelect = documentRef.createElement('select');
        resetSelect.className = 'settings-select';
        for (let hour = 0; hour < 24; hour += 1) {
            const option = documentRef.createElement('option');
            option.value = String(hour);
            option.textContent = `${String(hour).padStart(2, '0')}:00`;
            option.selected = hour === counter.resetHour;
            resetSelect.appendChild(option);
        }
        resetSelect.value = String(counter.resetHour);
        resetSelect.onchange = () => {
            counter.resetHour = Number.parseInt(resetSelect.value, 10);
            options.persist(keys.RESET_HOUR, counter.resetHour);
            options.updatePanel();
        };
        const resetField = register(controls, FormField({
            document: documentRef,
            label: ui.t('重置时间', 'Reset Hour'),
            control: resetSelect
        }));
        resetField.element.className += ' settings-row';
        reset.section.appendChild(resetField.element);
        body.appendChild(reset.section);

        const quota = createSection(documentRef, ui.t('每日配额', 'Daily Quota'));
        const quotaInput = documentRef.createElement('input');
        quotaInput.type = 'number';
        quotaInput.min = '1';
        quotaInput.max = '999';
        quotaInput.value = String(counter.quotaLimit);
        quotaInput.className = 'settings-select settings-number-input';
        quotaInput.onchange = () => {
            const value = Number.parseInt(quotaInput.value, 10);
            if (value < 1 || value > 999 || Number.isNaN(value)) return;
            counter.quotaLimit = value;
            options.persist(keys.QUOTA, value);
            options.updatePanel();
        };
        const quotaField = register(controls, FormField({
            document: documentRef,
            label: ui.t('消息限制', 'Message Limit'),
            control: quotaInput
        }));
        quotaField.element.className += ' settings-row';
        quota.section.appendChild(quotaField.element);
        body.appendChild(quota.section);

        const chart = createSection(documentRef, ui.t('使用历史（最近 7 天）', 'Usage History (Last 7 Days)'));
        chart.section.appendChild(createUsageChart(documentRef, counter.getLast7DaysData()));
        body.appendChild(chart.section);

        const data = createSection(documentRef, ui.t('数据', 'Data'));
        if (registry.isEnabled('export')) {
            exportModule.renderExportButtons(data.section);
        } else {
            const fallbackExport = register(controls, createShellButton({
                document: documentRef,
                label: ui.t('导出数据 (JSON)', 'Export Data (JSON)'),
                icon: options.createIcon('download', 14),
                onPress: () => options.exportData({
                    total: counter.state.total,
                    totalChatsCreated: counter.state.totalChatsCreated,
                    chats: counter.state.chats,
                    dailyCounts: counter.state.dailyCounts,
                    exportedAt: options.now().toISOString()
                })
            }));
            data.section.appendChild(fallbackExport.element);
        }
        const calibrate = register(controls, createShellButton({
            document: documentRef,
            label: ui.t('校准数据', 'Calibrate Data'),
            icon: options.createIcon('wrench', 14),
            onPress: options.openCalibration
        }));
        const resetPosition = register(controls, createShellButton({
            document: documentRef,
            label: ui.t('重置面板位置', 'Reset Panel Position'),
            icon: options.createIcon('pin', 14),
            onPress: () => {
                options.persist(keys.POS, defaultPosition);
                close();
                options.reload();
            }
        }));
        const tour = register(controls, createShellButton({
            document: documentRef,
            label: ui.t('引导教程', 'Guided Tour'),
            icon: options.createIcon('compass', 14),
            onPress: () => {
                close();
                options.startTour();
            }
        }));
        data.section.append(calibrate.element, resetPosition.element, tour.element);
        body.appendChild(data.section);

        const debug = createSection(documentRef, ui.t('调试', 'Debug'));
        const debugToggle = register(controls, createShellSwitch({
            document: documentRef,
            label: ui.t('启用调试', 'Enable Debug'),
            checked: options.isDebugEnabled(),
            className: 'settings-switch-row',
            onChange: enabled => {
                options.setDebugEnabled(enabled);
                debugToggle.control.classList.toggle('on', enabled);
                logger.info('Debug mode toggled', { enabled });
            }
        }));
        debug.section.appendChild(debugToggle.element);
        const logLevel = documentRef.createElement('select');
        logLevel.className = 'settings-select';
        for (const level of ['error', 'warn', 'info', 'debug']) {
            const option = documentRef.createElement('option');
            option.value = level;
            option.textContent = level.toUpperCase();
            option.selected = level === logger.getLevel();
            logLevel.appendChild(option);
        }
        logLevel.value = logger.getLevel();
        logLevel.onchange = () => logger.setLevel(logLevel.value);
        const logField = register(controls, FormField({
            document: documentRef,
            label: ui.t('日志级别', 'Log Level'),
            control: logLevel
        }));
        logField.element.className += ' settings-row';
        debug.section.appendChild(logField.element);
        const openDebug = register(controls, createShellButton({
            document: documentRef,
            label: ui.t('打开调试面板', 'Open Debug Panel'),
            icon: options.createIcon('bug', 14),
            onPress: options.openDebug
        }));
        debug.section.appendChild(openDebug.element);
        body.appendChild(debug.section);

        const version = documentRef.createElement('div');
        version.className = 'settings-version';
        version.textContent = `${metadata.appName} v${metadata.version}`;
        version.title = metadata.trademarkNotice;
        body.appendChild(version);
        renderCapabilitySnapshot(capabilitySnapshot);
        return shell.closeButton;
    }

    const initialFocus = render();
    dialogHandle = ui.openDialog({
        id: dialogId,
        ariaLabel: ui.t('设置', 'Settings'),
        overlayClass: 'settings-overlay',
        contentElement: modal,
        initialFocus,
        returnFocus: () => documentRef.getElementById('g-open-settings'),
        onClose() {
            closed = true;
            unsubscribe?.();
            unsubscribe = null;
            unsubscribeCapabilityHealth?.();
            unsubscribeCapabilityHealth = null;
            disposeControls();
        }
    });
    modal = dialogHandle.element;
    unsubscribe = ui.subscribeLocale(() => render());
    unsubscribeCapabilityHealth = capabilityHealth.subscribe(event => {
        renderCapabilitySnapshot(event?.snapshot ?? capabilityHealth.getSnapshot());
    }, { emitCurrent: true });
    return dialogHandle;
}
