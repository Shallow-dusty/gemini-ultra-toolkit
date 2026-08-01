import { Tabs } from '../components.js';

function requireFunction(value, label) {
    if (typeof value !== 'function') throw new TypeError(`${label} must be a function`);
    return value;
}

export function createDetailsController(options = {}) {
    const documentRef = options.document || globalThis.document;
    if (!documentRef?.createElement) throw new TypeError('Details controller requires a DOM document');
    const translate = requireFunction(options.translate, 'Details translate');
    const createIcon = requireFunction(options.createIcon, 'Details createIcon');
    const renderContent = requireFunction(options.renderContent, 'Details renderContent');
    const onActiveChange = options.onActiveChange || (() => {});
    const onError = options.onError || (() => {});
    requireFunction(onActiveChange, 'Details onActiveChange');
    requireFunction(onError, 'Details onError');

    let activeId = options.activeId || 'stats';
    let signature = null;
    let currentPane = null;
    let widget = null;
    let records = [];

    function renderFallback(panel, error) {
        onError(error);
        const fallback = documentRef.createElement('div');
        fallback.className = 'detail-row';
        fallback.textContent = translate('详情暂时无法渲染', 'Details unavailable');
        panel.appendChild(fallback);
    }

    function renderActive() {
        const record = records.find(candidate => candidate.id === activeId);
        record.panel.replaceChildren();
        try { renderContent(activeId, record.panel); }
        catch (error) { renderFallback(record.panel, error); }
        return true;
    }

    function build(pane, tabs) {
        widget?.destroy();
        const items = tabs.map(tab => ({
            id: tab.id,
            label: tab.label,
            panel: documentRef.createElement('div')
        }));
        widget = Tabs({
            document: documentRef,
            items,
            selectedId: activeId,
            label: translate('详情分类', 'Detail sections'),
            onChange(id) {
                activeId = id;
                onActiveChange(id);
                renderActive();
            }
        });
        widget.element.className += ' details-tabs-shell';
        widget.list.id = 'g-details-tab-bar';
        widget.list.className += ' details-tab-bar';
        records = items.map((item, index) => ({
            id: item.id,
            tab: widget.tabs[index],
            panel: widget.panelElements[index]
        }));
        records.forEach((record, index) => {
            const tab = tabs[index];
            record.tab.className += ' details-tab';
            record.tab.dataset.tabId = record.id;
            record.tab.title = tab.label;
            record.panel.className += ' details-tab-panel';
            if (tab.iconName) {
                record.tab.textContent = '';
                const icon = createIcon(tab.iconName, 16);
                icon.setAttribute('aria-hidden', 'true');
                record.tab.appendChild(icon);
            } else if (tab.icon) {
                record.tab.textContent = tab.icon;
            }
        });
        pane.replaceChildren(widget.element);
        currentPane = pane;
    }

    return Object.freeze({
        get activeId() { return activeId; },
        setActive(id) {
            if (typeof id !== 'string' || id === '') throw new TypeError('Details active id must be a string');
            activeId = id;
            return activeId;
        },
        render(pane, tabs) {
            if (!pane?.replaceChildren) throw new TypeError('Details render requires a pane');
            if (!Array.isArray(tabs) || tabs.length === 0) throw new TypeError('Details render requires tabs');
            if (!tabs.some(tab => tab.id === activeId)) activeId = tabs[0].id;
            const nextSignature = tabs.map(tab => `${tab.id}:${tab.label}:${tab.iconName || ''}:${tab.icon || ''}`).join('|');
            if (!widget || currentPane !== pane || signature !== nextSignature) {
                signature = nextSignature;
                build(pane, tabs);
            } else {
                widget.select(activeId, { emit: false });
            }
            onActiveChange(activeId);
            renderActive();
            return widget;
        },
        focusActive() {
            const record = records.find(candidate => candidate.id === activeId);
            if (!record?.tab?.focus) return false;
            record.tab.focus({ preventScroll: true });
            return true;
        },
        destroy() {
            widget?.destroy();
            widget = null;
            records = [];
            currentPane = null;
            signature = null;
        }
    });
}
