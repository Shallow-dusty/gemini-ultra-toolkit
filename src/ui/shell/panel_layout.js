import { Button, IconButton } from '../components.js';

function requireFunction(value, label) {
    if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
    return value;
}

export function createPanelLayout(options = {}) {
    const documentRef = options.document || globalThis.document;
    if (!documentRef?.createElement) throw new TypeError('Panel layout requires a DOM document');
    if (typeof options.panelId !== 'string' || options.panelId === '') {
        throw new TypeError('Panel layout requires a panel id');
    }
    const translate = requireFunction(options.translate, 'Panel layout translate');
    const createIcon = requireFunction(options.createIcon, 'Panel layout createIcon');
    const onToggle = requireFunction(options.onToggle, 'Panel layout onToggle');
    const onReset = requireFunction(options.onReset, 'Panel layout onReset');
    const expanded = Boolean(options.expanded);

    const container = documentRef.createElement('section');
    container.id = options.panelId;
    container.className = 'notranslate primer-ui-shell';
    container.setAttribute('translate', 'no');
    container.setAttribute('aria-label', translate('Primer++ 控制面板', 'Primer++ control panel'));

    const header = documentRef.createElement('header');
    header.className = 'gemini-header';
    const userCapsule = documentRef.createElement('div');
    userCapsule.id = 'g-user-capsule';
    userCapsule.className = 'user-capsule';

    const toggleLabel = expanded
        ? translate('收起详情', 'Hide details')
        : translate('展开详情', 'Show details');
    const toggleHandle = IconButton({
        document: documentRef,
        label: toggleLabel,
        icon: createIcon('menu', 16),
        onPress: onToggle
    });
    const toggle = toggleHandle.element;
    toggle.id = 'g-details-toggle';
    toggle.className += ' gemini-toggle-btn';
    toggle.setAttribute('aria-controls', 'g-details-pane');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.onpointerdown = event => event.stopPropagation();
    header.append(userCapsule, toggle);

    const mainView = documentRef.createElement('main');
    mainView.className = 'gemini-main-view';
    const bigDisplay = documentRef.createElement('output');
    bigDisplay.id = 'g-big-display';
    bigDisplay.className = 'gemini-big-num';
    bigDisplay.textContent = '0';
    bigDisplay.setAttribute('aria-live', 'polite');

    const modelRow = documentRef.createElement('div');
    modelRow.id = 'g-model-row';
    modelRow.className = 'gemini-model-row';
    const modelBadge = documentRef.createElement('span');
    modelBadge.id = 'g-model-badge';
    modelBadge.className = 'model-badge';
    modelRow.appendChild(modelBadge);

    const subInfo = documentRef.createElement('div');
    subInfo.id = 'g-sub-info';
    subInfo.className = 'gemini-sub-info';
    subInfo.textContent = translate('今天', 'Today');

    const quotaWrap = documentRef.createElement('div');
    quotaWrap.id = 'g-quota-wrap';
    quotaWrap.className = 'quota-bar-wrap';
    quotaWrap.setAttribute('role', 'progressbar');
    quotaWrap.setAttribute('aria-label', translate('今日配额使用率', 'Daily quota usage'));
    quotaWrap.setAttribute('aria-describedby', 'g-quota-label');
    quotaWrap.setAttribute('aria-valuemin', '0');
    quotaWrap.setAttribute('aria-valuemax', '100');
    quotaWrap.setAttribute('aria-valuenow', '0');
    const quotaFill = documentRef.createElement('div');
    quotaFill.id = 'g-quota-fill';
    quotaFill.className = 'quota-bar-fill';
    quotaWrap.appendChild(quotaFill);
    const quotaLabel = documentRef.createElement('div');
    quotaLabel.id = 'g-quota-label';
    quotaLabel.className = 'quota-label';

    const actionHandle = Button({
        document: documentRef,
        label: translate('重置今天', 'Reset Today'),
        onPress: onReset
    });
    const actionButton = actionHandle.element;
    actionButton.id = 'g-action-btn';
    actionButton.className += ' g-btn';
    actionButton.onpointerdown = event => event.stopPropagation();
    mainView.append(bigDisplay, modelRow, subInfo, quotaWrap, quotaLabel, actionButton);

    const details = documentRef.createElement('section');
    details.id = 'g-details-pane';
    details.className = 'gemini-details-view';
    details.setAttribute('aria-hidden', String(!expanded));
    details.inert = !expanded;
    if (expanded) details.classList.add('expanded');

    container.append(header, mainView, details);
    return Object.freeze({
        container,
        header,
        details,
        toggle,
        actionButton,
        destroy() {
            toggleHandle.destroy();
            actionHandle.destroy();
            container.remove();
        }
    });
}

export function isPanelLayoutComplete(container) {
    return Boolean(container
        && container.querySelector?.('#g-user-capsule')
        && container.querySelector?.('#g-details-toggle')
        && container.querySelector?.('#g-big-display')
        && container.querySelector?.('#g-model-badge')
        && container.querySelector?.('#g-action-btn')
        && container.querySelector?.('#g-details-pane'));
}

export function syncPanelDisclosure({ document: documentRef = globalThis.document, translate, expanded }) {
    requireFunction(translate, 'Panel disclosure translate');
    const isExpanded = Boolean(expanded);
    const label = isExpanded
        ? translate('收起详情', 'Hide details')
        : translate('展开详情', 'Show details');
    const toggle = documentRef?.getElementById?.('g-details-toggle');
    const pane = documentRef?.getElementById?.('g-details-pane');
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(isExpanded));
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
    }
    if (pane) {
        pane.setAttribute('aria-hidden', String(!isExpanded));
        pane.inert = !isExpanded;
    }
    return isExpanded;
}
