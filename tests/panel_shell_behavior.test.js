const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
    FakeDocument,
    FakeEvent,
    createFakeDom,
    createUiStub,
    iconFactory
} = require('./helpers/fake_dom.js');

const rootDir = path.join(__dirname, '..');
let shell;

async function importShell(name) {
    return import(pathToFileURL(path.join(rootDir, 'src', 'ui', 'shell', name)).href);
}

before(async () => {
    const modules = await Promise.all([
        'icon_helpers.js',
        'modal_shell.js',
        'panel_layout.js',
        'panel_presenter.js',
        'details_controller.js',
        'drag_controller.js',
        'panel_styles.js',
        'settings_controller.js',
        'onboarding_controller.js',
        'debug_controller.js',
        'calibration_controller.js',
        'dashboard_controller.js'
    ].map(importShell));
    shell = Object.assign({}, ...modules);
});

function settingsOptions(overrides = {}) {
    const { document } = createFakeDom();
    const uiState = createUiStub(document);
    const icons = iconFactory(document);
    const enabled = new Map([['alpha', true], ['export', false]]);
    const moduleSettings = document.createElement('div');
    const modules = [
        {
            id: 'alpha',
            name: 'Alpha',
            description: 'Alpha description',
            icon: 'A',
            getOnboarding: () => ({ en: { rant: 'Why' } }),
            renderToSettings: target => target.appendChild(moduleSettings)
        },
        { id: 'export', name: 'Export', description: '', icon: 'E' }
    ];
    const registry = {
        getAll: () => modules,
        isEnabled: id => enabled.get(id) === true,
        async toggle(id, checked) { enabled.set(id, Boolean(checked)); }
    };
    const counter = {
        resetHour: 4,
        quotaLimit: 80,
        state: {
            total: 10,
            totalChatsCreated: 2,
            chats: { c1: 3 },
            dailyCounts: { d1: { messages: 1 } }
        },
        getLast7DaysData: () => [
            { label: 'M', messages: 0 },
            { label: 'T', messages: 4 }
        ]
    };
    const loggerEvents = [];
    const logger = {
        getLevel: () => 'info',
        setLevel: value => loggerEvents.push(['level', value]),
        info: (...args) => loggerEvents.push(['info', ...args]),
        error: (...args) => loggerEvents.push(['error', ...args])
    };
    const calls = [];
    let healthListener = null;
    let healthUnsubscribed = false;
    const capabilityHealth = {
        getSnapshot: () => ({
            features: [
                { id: 'alpha', status: 'degraded', nativeCapability: { owned: false, policy: 'augment' } },
                { id: 'export', status: 'native-owned', nativeCapability: { owned: true, policy: 'prefer-native' } }
            ]
        }),
        subscribe(listener, options) {
            healthListener = listener;
            calls.push(['health-subscribe', options]);
            return () => { healthUnsubscribed = true; };
        }
    };
    const options = {
        document,
        createIcon: icons,
        renderModuleIcon: module => icons(module.id, 16),
        getTheme: () => 'glass',
        core: { applyTheme: (node, theme) => calls.push(['theme', node, theme]) },
        registry,
        counter,
        exportModule: { renderExportButtons: target => calls.push(['native-export', target]) },
        logger,
        ui: uiState.ui,
        keys: { RESET_HOUR: 'reset', QUOTA: 'quota', POS: 'pos' },
        defaultPosition: { top: '1px', left: '2px', bottom: 'auto', right: 'auto' },
        metadata: { appName: 'Primer++', version: '13', trademarkNotice: 'Unofficial' },
        capabilityHealth,
        persist: (...args) => calls.push(['persist', ...args]),
        reload: () => calls.push(['reload']),
        exportData: data => calls.push(['export', data]),
        showOnboarding: id => calls.push(['onboarding', id]),
        openCalibration: () => calls.push(['calibration']),
        startTour: () => calls.push(['tour']),
        openDebug: () => calls.push(['debug']),
        updatePanel: () => calls.push(['update']),
        refreshDetails: () => calls.push(['details']),
        isDetailsExpanded: () => true,
        isDebugEnabled: () => true,
        setDebugEnabled: value => calls.push(['debug-enabled', value]),
        now: () => new Date('2026-08-01T00:00:00Z'),
        ...overrides
    };
    return {
        options,
        document,
        uiState,
        enabled,
        calls,
        loggerEvents,
        moduleSettings,
        emitHealth: snapshot => healthListener?.({ snapshot }),
        wasHealthUnsubscribed: () => healthUnsubscribed
    };
}

describe('panel shell primitives', () => {
    it('rejects invalid primitive dependencies and exercises global/default construction paths', () => {
        const { document, window } = createFakeDom();
        const createIcon = iconFactory(document);
        const previousDocument = globalThis.document;
        const previousWindow = globalThis.window;
        globalThis.document = document;
        globalThis.window = window;
        try {
            const modal = shell.createModalShell({
                createIcon,
                title: 'Plain',
                closeLabel: 'Close',
                onClose() {},
                titleTag: 'h2',
                bodyTag: 'main',
                modalClass: 'modal',
                headerClass: 'header',
                titleClass: 'title',
                bodyClass: 'body',
                closeClass: 'close',
                closeIconSize: 20
            });
            document.body.appendChild(modal.modal);
            assert.equal(modal.title.tagName, 'H2');
            assert.equal(modal.body.tagName, 'MAIN');
            modal.destroy();
            assert.equal(modal.modal.parentNode, null);
            assert.throws(() => shell.createModalShell({ document, title: 'X', closeLabel: 'C', onClose() {} }), /createIcon/);
            assert.throws(() => shell.createModalShell({ document, createIcon, title: 'X', closeLabel: 'C' }), /onClose/);
            assert.throws(() => shell.createModalShell({ document, createIcon, title: 1, closeLabel: 'C', onClose() {} }), /title/);
            assert.throws(() => shell.createModalShell({ document, createIcon, title: '', closeLabel: 'C', onClose() {} }), /title/);
            assert.throws(() => shell.createModalShell({ document, createIcon, title: 'X', closeLabel: 1, onClose() {} }), /close label/);
            assert.throws(() => shell.createModalShell({ document, createIcon, title: 'X', closeLabel: '', onClose() {} }), /close label/);

            const collapsed = shell.createPanelLayout({
                panelId: 'global-panel',
                translate: (_zh, en) => en,
                createIcon,
                onToggle() {},
                onReset() {}
            });
            document.body.appendChild(collapsed.container);
            assert.equal(collapsed.details.inert, true);
            const actionPointer = new FakeEvent('pointerdown');
            collapsed.actionButton.dispatchEvent(actionPointer);
            assert.equal(actionPointer.propagationStopped, true);
            assert.equal(shell.syncPanelDisclosure({ expanded: true, translate: (_zh, en) => en }), true);
            collapsed.destroy();
            assert.throws(() => shell.createPanelLayout({ document, panelId: '', translate() {}, createIcon, onToggle() {}, onReset() {} }), /panel id/);
            assert.throws(() => shell.createPanelLayout({ document, panelId: 1, translate() {}, createIcon, onToggle() {}, onReset() {} }), /panel id/);
            assert.throws(() => shell.createPanelLayout({ document, panelId: 'x', createIcon, onToggle() {}, onReset() {} }), /translate/);
            assert.throws(() => shell.createPanelLayout({ document, panelId: 'x', translate() {}, onToggle() {}, onReset() {} }), /createIcon/);
            assert.throws(() => shell.createPanelLayout({ document, panelId: 'x', translate() {}, createIcon, onReset() {} }), /onToggle/);
            assert.throws(() => shell.createPanelLayout({ document, panelId: 'x', translate() {}, createIcon, onToggle() {} }), /onReset/);
            assert.throws(() => shell.syncPanelDisclosure({ document, expanded: false }), /translate/);
            assert.equal(shell.isPanelLayoutComplete(null), false);
            assert.equal(shell.isPanelLayoutComplete({}), false);
            for (const missing of [
                '#g-user-capsule', '#g-details-toggle', '#g-big-display',
                '#g-model-badge', '#g-action-btn', '#g-details-pane'
            ]) {
                assert.equal(shell.isPanelLayoutComplete({
                    querySelector: selector => selector === missing ? null : {}
                }), false);
            }

            const defaults = shell.createDetailsController({
                translate: (_zh, en) => en,
                createIcon,
                renderContent: (_id, panel) => { panel.textContent = 'ok'; }
            });
            assert.equal(defaults.activeId, 'stats');
            assert.equal(defaults.focusActive(), false);
            defaults.destroy();
            assert.throws(() => shell.createDetailsController({ document, createIcon, renderContent() {} }), /translate/);
            assert.throws(() => shell.createDetailsController({ document, translate() {}, renderContent() {} }), /createIcon/);
            assert.throws(() => shell.createDetailsController({ document, translate() {}, createIcon }), /renderContent/);
            assert.throws(() => shell.createDetailsController({ document, translate() {}, createIcon, renderContent() {}, onActiveChange: 1 }), /onActiveChange/);
            assert.throws(() => shell.createDetailsController({ document, translate() {}, createIcon, renderContent() {}, onError: 1 }), /onError/);

            const drag = shell.createDragController();
            drag.destroy();
            const element = document.createElement('div');
            const handle = document.createElement('header');
            handle.setPointerCapture = undefined;
            drag.attach(element, handle);
            document.dispatchEvent(new FakeEvent('pointermove', { clientX: 1, clientY: 1 }));
            document.dispatchEvent(new FakeEvent('pointerup'));
            drag.destroy();
            assert.throws(() => shell.createDragController({ document: {}, window }), /requires a document/);
            const activeWindow = globalThis.window;
            delete globalThis.window;
            try { assert.throws(() => shell.createDragController({ document, window: null }), /requires a window/); }
            finally { globalThis.window = activeWindow; }
            assert.throws(() => shell.createDragController({ document, window, persist: 1 }), /persist/);
            const auto = { top: 'auto', left: 'auto', bottom: '10px', right: '10px' };
            assert.equal(shell.applyPanelPosition({ element, position: auto, viewport: window, fallback: auto }), auto);
            const topAuto = { top: 'auto', left: '900px', bottom: '0', right: '0' };
            assert.equal(shell.applyPanelPosition({ element, position: topAuto, viewport: window, fallback: auto }), topAuto);

            const globalFallback = shell.renderModuleIcon({ id: 'custom' }, 16, { createIcon });
            assert.equal(globalFallback.textContent, '');
        } finally {
            globalThis.document = previousDocument;
            globalThis.window = previousWindow;
        }
        const savedDocument = globalThis.document;
        delete globalThis.document;
        try {
            assert.throws(() => shell.createModalShell(), /DOM document/);
            assert.throws(() => shell.createPanelLayout(), /DOM document/);
            assert.throws(() => shell.createDetailsController(), /DOM document/);
        } finally {
            globalThis.document = savedDocument;
        }
    });
    it('builds icons, modal controls, sections, and semantic switches', () => {
        const document = new FakeDocument();
        const createIcon = iconFactory(document);
        const target = document.createElement('button');
        shell.setIconText(target, 'chart', 'Stats', 18, { document, createIcon });
        assert.equal(target.textContent, ' Stats');
        assert.equal(target.firstChild.dataset.icon, 'chart');
        shell.setIconText(target, 'chart', '', 14, { createIcon });
        assert.equal(target.children.length, 1);
        assert.throws(() => shell.setIconText(null, 'x', 'X', 1, { createIcon }), /DOM element/);
        assert.throws(() => shell.setIconText(target, 'x', 'X'), /createIcon/);

        assert.equal(shell.renderModuleIcon({ id: 'counter' }, 20, { document, createIcon }).dataset.icon, 'chart');
        assert.equal(shell.renderModuleIcon({ id: 'custom', icon: '★' }, 16, { document, createIcon }).textContent, '★');
        assert.throws(() => shell.renderModuleIcon(null, 16, { document, createIcon }), /requires a module/);
        assert.throws(() => shell.renderModuleIcon({ id: 'x' }, 16, { document }), /requires createIcon/);

        let closed = 0;
        const modal = shell.createModalShell({
            document,
            createIcon,
            title: 'Settings',
            titleIcon: 'settings',
            closeLabel: 'Close',
            onClose: () => { closed += 1; }
        });
        document.body.appendChild(modal.modal);
        assert.equal(modal.modal.tagName, 'SECTION');
        assert.equal(modal.closeButton.getAttribute('aria-label'), 'Close');
        modal.closeButton.click();
        assert.equal(closed, 1);
        modal.destroy({ remove: false });
        assert.equal(modal.modal.parentNode, document.body);
        modal.modal.remove();

        const button = shell.createShellButton({
            document,
            label: 'Export',
            icon: createIcon('download', 14)
        });
        assert.match(button.element.className, /settings-btn/);
        assert.equal(button.element.firstChild.getAttribute('aria-hidden'), 'true');
        const plain = shell.createShellButton({ document, label: 'Plain', className: 'custom' });
        assert.match(plain.element.className, /custom/);
        const toggle = shell.createShellSwitch({ document, label: 'Feature', checked: true });
        assert.equal(toggle.control.getAttribute('role'), 'switch');
        assert.equal(toggle.control.classList.contains('on'), true);
        const section = shell.createSection(document, 'Data', { className: 'custom-section', titleTag: 'h2' });
        assert.equal(section.heading.tagName, 'H2');
        assert.throws(() => shell.createSection(null, 'No'), /DOM document/);
        button.destroy();
        plain.destroy();
        toggle.destroy();
    });

    it('builds a complete panel layout and synchronizes disclosure semantics', () => {
        const document = new FakeDocument();
        const createIcon = iconFactory(document);
        let toggles = 0;
        let resets = 0;
        const layout = shell.createPanelLayout({
            document,
            panelId: 'panel',
            expanded: true,
            translate: (_zh, en) => en,
            createIcon,
            onToggle: () => { toggles += 1; },
            onReset: () => { resets += 1; }
        });
        document.body.appendChild(layout.container);
        assert.equal(shell.isPanelLayoutComplete(layout.container), true);
        assert.equal(layout.details.inert, false);
        const quota = layout.container.querySelector('#g-quota-wrap');
        assert.equal(quota.getAttribute('aria-label'), 'Daily quota usage');
        assert.equal(quota.getAttribute('aria-describedby'), 'g-quota-label');
        assert.equal(quota.getAttribute('aria-valuemin'), '0');
        assert.equal(quota.getAttribute('aria-valuemax'), '100');
        assert.equal(quota.getAttribute('aria-valuenow'), '0');
        layout.toggle.click();
        layout.actionButton.click();
        assert.deepEqual([toggles, resets], [1, 1]);
        const pointer = new FakeEvent('pointerdown');
        layout.toggle.dispatchEvent(pointer);
        assert.equal(pointer.propagationStopped, true);
        assert.equal(shell.syncPanelDisclosure({ document, expanded: false, translate: (_zh, en) => en }), false);
        assert.equal(layout.toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(layout.details.getAttribute('aria-hidden'), 'true');
        assert.equal(layout.details.inert, true);
        assert.equal(shell.isPanelLayoutComplete(document.createElement('div')), false);
        layout.destroy();
        assert.equal(layout.container.parentNode, null);
    });

    it('renders details with the public Tabs API and handles rebuild, keyboard, fallback, and cleanup', () => {
        const document = new FakeDocument();
        const changes = [];
        const errors = [];
        const controller = shell.createDetailsController({
            document,
            activeId: 'missing',
            translate: (_zh, en) => en,
            createIcon: iconFactory(document),
            onActiveChange: id => changes.push(id),
            onError: error => errors.push(error.message),
            renderContent(id, panel) {
                if (id === 'broken') throw new Error('broken');
                panel.textContent = `content:${id}`;
            }
        });
        const pane = document.createElement('section');
        document.body.appendChild(pane);
        const tabs = [
            { id: 'stats', label: 'Stats', iconName: 'chart' },
            { id: 'custom', label: 'Custom', icon: '★' },
            { id: 'broken', label: 'Broken' }
        ];
        const widget = controller.render(pane, tabs);
        assert.equal(controller.activeId, 'stats');
        assert.equal(widget.list.id, 'g-details-tab-bar');
        for (const [index, panel] of widget.panelElements.entries()) {
            const labelledBy = panel.getAttribute('aria-labelledby');
            assert.equal(labelledBy, widget.tabs[index].id);
            assert.equal(document.getElementById(labelledBy), widget.tabs[index]);
            assert.equal(widget.element.contains(widget.tabs[index]), true);
            assert.equal(widget.element.contains(panel), true);
        }
        assert.equal(widget.tabs[0].textContent, '');
        assert.equal(widget.tabs[1].textContent, '★');
        widget.tabs[1].dispatchEvent(new FakeEvent('keydown', { key: 'ArrowRight' }));
        assert.equal(controller.activeId, 'broken');
        assert.deepEqual(errors, ['broken']);
        assert.match(widget.panelElements[2].textContent, /Details unavailable/);
        controller.setActive('custom');
        assert.equal(controller.render(pane, tabs), widget);
        const rebuilt = controller.render(pane, [...tabs, { id: 'new', label: 'New' }]);
        assert.notEqual(rebuilt, widget);
        for (const [index, panel] of rebuilt.panelElements.entries()) {
            const labelledBy = panel.getAttribute('aria-labelledby');
            assert.equal(labelledBy, rebuilt.tabs[index].id);
            assert.equal(document.getElementById(labelledBy), rebuilt.tabs[index]);
            assert.equal(rebuilt.element.contains(rebuilt.tabs[index]), true);
            assert.equal(rebuilt.element.contains(panel), true);
        }
        assert.throws(() => controller.setActive(''), /active id/);
        assert.throws(() => controller.render(null, tabs), /requires a pane/);
        assert.throws(() => controller.render(pane, []), /requires tabs/);
        controller.destroy();
    });

    it('clamps panel position and owns one drag lifecycle', () => {
        const { document, window } = createFakeDom();
        const element = document.createElement('div');
        const fallback = { top: '10px', left: '20px', bottom: 'auto', right: 'auto' };
        const resets = [];
        const warnings = [];
        assert.equal(shell.applyPanelPosition({
            element,
            position: { top: '900px', left: '900px', bottom: 'auto', right: 'auto' },
            viewport: window,
            fallback,
            onReset: value => resets.push(value),
            onWarning: value => warnings.push(value)
        }), fallback);
        assert.equal(element.style.left, '20px');
        assert.equal(resets.length, 1);
        assert.equal(warnings.length, 1);
        const saved = { top: '5px', left: '6px', bottom: 'auto', right: 'auto' };
        assert.equal(shell.applyPanelPosition({ element, position: saved, viewport: window, fallback }), saved);
        assert.throws(() => shell.applyPanelPosition({ position: saved }), /requires an element/);
        assert.throws(() => shell.applyPanelPosition({ element }), /requires coordinates/);

        const persisted = [];
        const handle = document.createElement('header');
        element.rect = { top: 40, left: 30, right: 130, bottom: 70, width: 100, height: 30 };
        element.offsetWidth = 100;
        element.offsetHeight = 60;
        const drag = shell.createDragController({ document, window, persist: value => persisted.push(value) });
        drag.attach(element, handle);
        handle.dispatchEvent(new FakeEvent('pointerdown', { clientX: 50, clientY: 60, pointerId: 7 }));
        assert.equal(handle.capturedPointer, 7);
        document.dispatchEvent(new FakeEvent('pointermove', { clientX: 5000, clientY: -5000 }));
        assert.equal(element.style.left, '924px');
        assert.equal(element.style.top, '10px');
        document.dispatchEvent(new FakeEvent('pointerup'));
        assert.equal(persisted.length, 1);
        drag.destroy();
        assert.equal(handle.onpointerdown, null);
        assert.throws(() => drag.attach({}, handle), /requires element and handle/);
    });

    it('creates and injects scoped panel CSS', () => {
        const injected = [];
        const css = shell.injectPanelShellStyles({ addStyle: value => injected.push(value), panelId: 'panel' });
        assert.equal(injected[0], css);
        assert.match(css, /#panel/);
        assert.match(css, /prefers-reduced-motion/);
        assert.match(css, /\.gemini-details-view button \{ min-width: var\(--panel-control-height\); min-height: var\(--panel-control-height\); \}/);
        assert.throws(() => shell.injectPanelShellStyles({ panelId: 'panel' }), /style injector/);
        assert.throws(() => shell.injectPanelShellStyles({ addStyle() {}, panelId: '' }), /panel id/);
    });

    it('presents panel stats, profiles, themes, actions, quotas, and every view mode from injected ports', () => {
        const { document } = createFakeDom();
        const createIcon = iconFactory(document);
        const layout = shell.createPanelLayout({
            document,
            panelId: 'panel',
            expanded: true,
            translate: (_zh, en) => en,
            createIcon,
            onToggle() {},
            onReset() {}
        });
        document.body.appendChild(layout.container);
        let current = 'me@example.com';
        let inspecting = current;
        let chatId = 'chat-123456789';
        let theme = 'glass';
        const calls = [];
        const counter = {
            state: {
                viewMode: 'today', resetStep: 0, total: 20, totalChatsCreated: 3,
                chats: { [chatId]: 4 }
            },
            accountType: 'ultra',
            currentModel: 'flash',
            MODEL_CONFIG: { flash: { label: 'Flash', color: 'green' } },
            quotaLimit: 100,
            lastDisplayedVal: -1,
            getTodayMessages: () => 10,
            getWeightedQuota: () => 12.5,
            getQuotaWindowState: () => ({ windowLabel: 'Daily', remainingLabel: '2h' }),
            getTodayByModel: () => ({ flash: 4, thinking: 2, pro: 1 }),
            loadDataForUser: id => calls.push(['load', id])
        };
        const core = {
            getCurrentUser: () => current,
            getInspectingUser: () => inspecting,
            setInspectingUser: id => { inspecting = id; calls.push(['inspect', id]); },
            getAllUsers: () => ['other@example.com', current],
            getChatId: () => chatId,
            getThemes: () => ({ glass: { name: 'Glass' }, paper: { name: 'Paper' } }),
            setTheme: key => calls.push(['core-theme', key]),
            applyTheme: (node, key) => calls.push(['apply-theme', node, key])
        };
        const presenter = shell.createPanelPresenter({
            document,
            counter,
            core,
            quotaColors: { safe: 'green', warn: 'orange', danger: 'red' },
            tempUser: 'guest',
            panelId: 'panel',
            translate: (_zh, en) => en,
            getTheme: () => theme,
            setTheme: key => { theme = key; },
            createIcon,
            setIconText: (element, name, text) => shell.setIconText(element, name, text, 14, { document, createIcon }),
            openDashboard: () => calls.push(['dashboard']),
            openSettings: () => calls.push(['settings']),
            renderDetails: () => calls.push(['render'])
        });
        presenter.renderStats(layout.details);
        assert.match(layout.details.textContent, /Statistics/);
        assert.equal(layout.details.querySelectorAll('.user-row').length, 2);
        assert.equal(layout.details.querySelectorAll('[aria-pressed="true"]').length >= 3, true);
        layout.details.querySelectorAll('.user-row')[1].click();
        assert.equal(inspecting, 'other@example.com');
        const paper = layout.details.querySelectorAll('button').find(button => button.textContent === 'Paper');
        paper.click();
        assert.equal(theme, 'paper');
        layout.details.querySelectorAll('button').find(button => button.textContent.includes('Stats')).click();
        const settingsTrigger = layout.details.querySelector('.panel-settings-trigger');
        assert.equal(settingsTrigger.id, 'g-open-settings');
        settingsTrigger.click();
        assert.ok(calls.some(call => call[0] === 'dashboard'));
        assert.ok(calls.some(call => call[0] === 'settings'));

        inspecting = current;
        counter.state.viewMode = 'today';
        presenter.reset();
        assert.equal(presenter.update(), true);
        assert.equal(layout.container.querySelector('#g-big-display').textContent, '10');
        assert.equal(layout.container.querySelector('#g-user-capsule').querySelector('.acct-badge-inline').textContent, 'Ultra');
        assert.equal(layout.container.querySelector('#g-quota-fill').style.background, 'green');
        assert.equal(layout.container.querySelector('#g-quota-wrap').getAttribute('aria-valuenow'), '12.5');
        assert.equal(
            layout.container.querySelector('#g-quota-wrap').getAttribute('aria-valuetext'),
            '10 msgs (12.5 weighted) / 100'
        );
        counter.getWeightedQuota = () => Number.NaN;
        presenter.reset();
        presenter.update();
        assert.equal(layout.container.querySelector('#g-quota-wrap').getAttribute('aria-valuenow'), '0');
        assert.equal(
            layout.container.querySelector('#g-quota-wrap').getAttribute('aria-valuetext'),
            '10 msgs (0 weighted) / 100'
        );
        counter.getWeightedQuota = () => 12.5;
        counter.lastDisplayedVal = 5;
        presenter.reset();
        presenter.update();
        assert.equal(layout.container.querySelector('#g-big-display').classList.contains('bump'), true);

        counter.state.viewMode = 'chat';
        presenter.reset();
        presenter.update();
        assert.match(layout.container.querySelector('#g-sub-info').textContent, /chat-123/);
        chatId = null;
        presenter.reset();
        presenter.update();
        assert.equal(layout.container.querySelector('#g-sub-info').textContent, 'ID: New Chat');
        counter.state.viewMode = 'chatsCreated';
        presenter.reset();
        presenter.update();
        assert.equal(layout.container.querySelector('#g-action-btn').disabled, true);
        counter.state.viewMode = 'total';
        counter.state.resetStep = 1;
        presenter.reset();
        presenter.update();
        assert.equal(layout.container.querySelector('#g-action-btn').textContent, 'Sure?');
        counter.state.resetStep = 2;
        presenter.reset();
        presenter.update();
        assert.equal(layout.container.querySelector('#g-action-btn').textContent, 'Really?');

        inspecting = 'other@example.com';
        counter.state.viewMode = 'chat';
        presenter.reset();
        presenter.update();
        assert.equal(layout.container.querySelector('#g-big-display').textContent, '--');
        assert.equal(layout.container.querySelector('#g-action-btn').disabled, true);
        presenter.selectableRow('Lifetime', 'total', 20).click();
        assert.equal(inspecting, current);
        assert.equal(counter.state.viewMode, 'total');

        const detached = createFakeDom().document;
        const detachedPresenter = shell.createPanelPresenter({
            document: detached,
            counter,
            core,
            quotaColors: { safe: 'g', warn: 'o', danger: 'r' },
            tempUser: 'guest', panelId: 'none',
            translate: (_zh, en) => en,
            getTheme: () => 'glass', setTheme() {}, createIcon: iconFactory(detached),
            setIconText() {}, openDashboard() {}, openSettings() {}, renderDetails() {}
        });
        assert.equal(detachedPresenter.update(), false);
        layout.destroy();
    });

    it('shows a waiting profile for the temporary user and omits an empty model breakdown', () => {
        const document = new FakeDocument();
        const pane = document.createElement('div');
        const counter = {
            state: { viewMode: 'today', chats: {}, total: 0, totalChatsCreated: 0 },
            getTodayMessages: () => 0,
            getQuotaWindowState: () => null,
            getTodayByModel: () => ({ flash: 0, thinking: 0, pro: 0 }),
            loadDataForUser() {}
        };
        const core = {
            getCurrentUser: () => 'guest', getInspectingUser: () => 'guest', getChatId: () => null,
            getAllUsers: () => [], getThemes: () => ({}), setInspectingUser() {}, setTheme() {}, applyTheme() {}
        };
        const presenter = shell.createPanelPresenter({
            document, counter, core, quotaColors: { safe: 'g', warn: 'o', danger: 'r' },
            tempUser: 'guest', panelId: 'panel', translate: (_zh, en) => en,
            getTheme: () => 'glass', setTheme() {}, createIcon: iconFactory(document),
            setIconText() {}, openDashboard() {}, openSettings() {}, renderDetails() {}
        });
        presenter.renderStats(pane);
        assert.match(pane.textContent, /Waiting for login/);
        assert.equal(pane.querySelector('.model-breakdown'), null);
        assert.equal(presenter.formatQuotaWindow(null), '');
        assert.equal(presenter.formatQuotaWindow({ windowLabel: 'Daily', remainingLabel: 'now' }), 'Daily · reset now');
    });
});

describe('settings capability-health port', () => {
    it('normalizes every service status into the four shell states and ownership labels', () => {
        assert.deepEqual(shell.normalizeCapabilityPresentation({ status: 'available' }), { state: 'available', owner: 'extension' });
        assert.deepEqual(shell.normalizeCapabilityPresentation({ status: 'degraded' }), { state: 'degraded', owner: 'extension' });
        assert.deepEqual(shell.normalizeCapabilityPresentation({ status: 'failed' }), { state: 'unavailable', owner: 'extension' });
        assert.deepEqual(shell.normalizeCapabilityPresentation({ status: 'disabled' }), { state: 'unavailable', owner: 'extension' });
        assert.deepEqual(shell.normalizeCapabilityPresentation({ status: 'native-owned' }), { state: 'available', owner: 'native' });
        assert.deepEqual(shell.normalizeCapabilityPresentation({
            status: 'available', nativeCapability: { owned: true, policy: 'prefer-native' }
        }), { state: 'available', owner: 'native' });
        assert.deepEqual(shell.normalizeCapabilityPresentation({ status: 'future' }), { state: 'unknown', owner: 'extension' });
        assert.deepEqual(shell.normalizeCapabilityPresentation(null), { state: 'unknown', owner: 'extension' });
    });

    it('renders live capability state, locale updates, semantic controls, and tears down subscriptions', async () => {
        const fixture = settingsOptions();
        const staleTrigger = fixture.document.createElement('button');
        staleTrigger.id = 'g-open-settings';
        fixture.document.body.appendChild(staleTrigger);
        const openDialog = fixture.uiState.ui.openDialog;
        let dialogOptions;
        fixture.uiState.ui.openDialog = options => {
            dialogOptions = options;
            return openDialog(options);
        };
        const handle = shell.openSettingsController(fixture.options);
        assert.equal(typeof dialogOptions.returnFocus, 'function');
        staleTrigger.remove();
        const replacementTrigger = fixture.document.createElement('button');
        replacementTrigger.id = 'g-open-settings';
        fixture.document.body.appendChild(replacementTrigger);
        assert.equal(dialogOptions.returnFocus(), replacementTrigger);
        assert.equal(handle.element.getAttribute('role'), 'dialog');
        assert.equal(fixture.calls[0][0], 'theme');
        const statusNodes = handle.element.querySelectorAll('.module-capability-status');
        const ownerNodes = handle.element.querySelectorAll('.module-capability-owner');
        assert.deepEqual(statusNodes.map(node => node.dataset.capabilityState), ['degraded', 'available']);
        assert.deepEqual(ownerNodes.map(node => node.dataset.capabilityOwner), ['extension', 'native']);
        assert.equal(handle.element.querySelector('.module-capability-meta').getAttribute('aria-live'), 'polite');
        assert.deepEqual(fixture.calls.find(call => call[0] === 'health-subscribe')[1], { emitCurrent: true });

        fixture.emitHealth({ features: [{ id: 'alpha', status: 'failed' }] });
        assert.equal(statusNodes[0].dataset.capabilityState, 'unavailable');
        assert.equal(statusNodes[1].dataset.capabilityState, 'unknown');

        const switches = handle.element.querySelectorAll('input');
        switches[0].checked = false;
        switches[0].dispatchEvent(new FakeEvent('change'));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(fixture.enabled.get('alpha'), false);
        assert.equal(switches[0].getAttribute('aria-busy'), null);
        assert.ok(fixture.calls.some(call => call[0] === 'details'));

        fixture.uiState.ui.setLocale('zh-CN');
        assert.equal(handle.element.isConnected, true, 'locale rerender must not detach the dialog');
        assert.match(handle.element.textContent, /功能扩展/);
        assert.match(handle.element.textContent, /未知/);
        const rerenderedOwner = handle.element.querySelector('.module-capability-owner');
        assert.equal(rerenderedOwner.textContent, '扩展补充');

        handle.close('test');
        assert.equal(fixture.wasHealthUnsubscribed(), true);
        assert.equal(fixture.uiState.localeListeners.size, 0);
    });

    it('handles settings actions, valid data changes, and toggle rollback', async () => {
        const fixture = settingsOptions();
        let fail = true;
        fixture.options.registry.toggle = async (_id, checked) => {
            if (fail) throw new Error('nope');
            fixture.enabled.set('alpha', Boolean(checked));
        };
        const handle = shell.openSettingsController(fixture.options);
        const selects = handle.element.querySelectorAll('select');
        selects[0].value = '8';
        selects[0].onchange();
        assert.equal(fixture.options.counter.resetHour, 8);
        const number = handle.element.querySelectorAll('input').find(input => input.type === 'number');
        number.value = '0';
        number.onchange();
        assert.equal(fixture.options.counter.quotaLimit, 80);
        number.value = '120';
        number.onchange();
        assert.equal(fixture.options.counter.quotaLimit, 120);

        const toggle = handle.element.querySelectorAll('input')[0];
        toggle.checked = false;
        toggle.dispatchEvent(new FakeEvent('change'));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(toggle.checked, true);
        assert.equal(fixture.uiState.toasts.length, 1);
        assert.equal(fixture.loggerEvents.at(-1)[0], 'error');
        fail = false;

        toggle.checked = false;
        toggle.dispatchEvent(new FakeEvent('change'));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(fixture.enabled.get('alpha'), false);
        assert.equal(handle.element.querySelector('[data-module-settings-id="alpha"]'), null);

        const buttons = handle.element.querySelectorAll('button');
        const byText = text => buttons.find(button => button.textContent.includes(text));
        byText('Show guide').click();
        byText('Export Data').click();
        byText('Calibrate Data').click();
        byText('Open Debug Panel').click();
        assert.ok(fixture.calls.some(call => call[0] === 'onboarding'));
        assert.ok(fixture.calls.some(call => call[0] === 'export'));
        assert.ok(fixture.calls.some(call => call[0] === 'calibration'));
        assert.ok(fixture.calls.some(call => call[0] === 'debug'));
        handle.close();
    });

    it('serializes rapid opposite requests and applies the latest explicit checked state', async () => {
        const fixture = settingsOptions();
        const requests = [];
        const releases = [];
        fixture.options.registry.toggle = (id, checked) => new Promise(resolve => {
            requests.push([id, checked]);
            releases.push(() => {
                fixture.enabled.set(id, Boolean(checked));
                resolve();
            });
        });
        const handle = shell.openSettingsController(fixture.options);
        const toggle = handle.element.querySelectorAll('input')[0];
        toggle.checked = false;
        toggle.dispatchEvent(new FakeEvent('change'));
        toggle.checked = true;
        toggle.dispatchEvent(new FakeEvent('change'));
        assert.deepEqual(requests, [['alpha', false]]);
        assert.equal(toggle.getAttribute('aria-busy'), 'true');
        releases[0]();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(requests, [['alpha', false], ['alpha', true]]);
        releases[1]();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(fixture.enabled.get('alpha'), true);
        assert.equal(handle.element.querySelectorAll('input')[0].checked, true);
        assert.notEqual(handle.element.querySelector('[data-module-settings-id="alpha"]'), null);
        handle.close();
    });
});

describe('support dialogs', () => {
    it('renders onboarding content, changes locale, and closes from reusable buttons', () => {
        const { document } = createFakeDom();
        const uiState = createUiStub(document, 'en');
        const createIcon = iconFactory(document);
        const module = {
            id: 'alpha', name: 'Alpha', icon: 'A',
            getOnboarding: () => ({
                en: { rant: 'Why', features: 'Features', guide: 'Guide' },
                zh: { rant: '原因', features: '功能', guide: '用法' }
            })
        };
        const handle = shell.openOnboardingController({
            document,
            moduleId: 'alpha',
            registry: { modules: { alpha: module } },
            core: { applyTheme: (node, theme) => { node.dataset.theme = theme; } },
            getTheme: () => 'paper',
            createIcon,
            renderModuleIcon: () => createIcon('alpha', 16),
            ui: uiState.ui
        });
        assert.equal(handle.element.dataset.theme, 'paper');
        assert.match(handle.element.textContent, /Why/);
        const language = handle.element.querySelector('.onboarding-lang-btn');
        language.click();
        assert.match(handle.element.textContent, /原因/);
        assert.equal(document.activeElement.classList.contains('onboarding-lang-btn'), true);
        handle.element.querySelector('.onboarding-start-btn').click();
        assert.equal(handle.open, false);
        assert.equal(uiState.localeListeners.size, 0);
    });

    it('renders debug health/logs, filters, localizes, executes actions, and cleans subscriptions', () => {
        const { document } = createFakeDom();
        const uiState = createUiStub(document, 'en');
        let logListener = null;
        let actionRuns = 0;
        let unsubscribed = false;
        const entries = [
            { ts: '1', level: 'info', msg: 'hello', data: { ok: true } },
            { ts: '2', level: 'error', msg: 'bad', data: null }
        ];
        const handle = shell.openDebugController({
            document,
            createIcon: iconFactory(document),
            getTheme: () => 'glass',
            core: {
                applyTheme: (node, theme) => { node.dataset.theme = theme; },
                detectUser: () => 'user@example.com',
                getCurrentUser: () => 'user@example.com',
                getInspectingUser: () => 'other@example.com'
            },
            adapter: {
                getSelectorHealthReport: () => ({
                    ready: false, passed: 1, total: 2,
                    checks: [
                        { label: 'Composer', detail: 'primary', ok: true },
                        { label: 'Sidebar', detail: '', ok: false }
                    ]
                })
            },
            logger: {
                getLevel: () => 'debug',
                getEntries: () => entries,
                subscribe(listener) { logListener = listener; return () => { unsubscribed = true; }; }
            },
            filterLogs(logs, { level, term }) {
                return logs.filter(entry => (level === 'all' || entry.level === level) && entry.msg.includes(term));
            },
            isDebugEnabled: () => true,
            ui: uiState.ui,
            actions: [{ zh: '执行', en: 'Run', run: () => { actionRuns += 1; } }]
        });
        assert.equal(handle.element.dataset.theme, 'glass');
        assert.match(handle.element.textContent, /Adapter Health: 1\/2/);
        const filters = handle.element.querySelectorAll('.debug-filter-btn');
        assert.equal(filters[0].getAttribute('aria-pressed'), 'true');
        filters[1].click();
        assert.equal(filters[1].getAttribute('aria-pressed'), 'true');
        const search = handle.element.querySelector('.debug-search');
        search.value = 'missing';
        search.dispatchEvent(new FakeEvent('input'));
        assert.match(handle.element.querySelector('.debug-log-list').textContent, /No logs yet/);
        handle.element.querySelectorAll('button').find(button => button.textContent === 'Run').click();
        assert.equal(actionRuns, 1);
        uiState.ui.setLocale('zh-CN');
        assert.equal(search.getAttribute('aria-label'), '搜索日志...');
        logListener();
        handle.close();
        assert.equal(unsubscribed, true);
        assert.equal(uiState.localeListeners.size, 0);
    });

    it('applies calibration values for today, lifetime, chats, and current chat', () => {
        const { document } = createFakeDom();
        const uiState = createUiStub(document, 'en');
        const calls = [];
        const counter = {
            resetHour: 4,
            state: {
                dailyCounts: { today: { messages: 2 } },
                total: 10,
                totalChatsCreated: 3,
                chats: { chat1: 4 },
                isExpanded: true
            },
            ensureTodayEntry: () => calls.push('ensure'),
            saveData: () => calls.push('save')
        };
        const handle = shell.openCalibrationController({
            document,
            createIcon: iconFactory(document),
            getTheme: () => 'glass',
            core: {
                applyTheme: () => {},
                getDayKey: () => 'today',
                getChatId: () => 'chat1'
            },
            counter,
            logger: { info: (...args) => calls.push(args) },
            ui: uiState.ui,
            updatePanel: () => calls.push('update'),
            refreshDetails: () => calls.push('details')
        });
        const inputs = handle.element.querySelectorAll('input');
        [inputs[0].value, inputs[1].value, inputs[2].value, inputs[3].value] = ['7', '20', '5', '9'];
        uiState.ui.setLocale('zh-CN');
        assert.match(handle.element.textContent, /应用校准/);
        handle.element.querySelector('.calibration-apply').click();
        assert.equal(counter.state.dailyCounts.today.messages, 7);
        assert.equal(counter.state.total, 20);
        assert.equal(counter.state.totalChatsCreated, 5);
        assert.equal(counter.state.chats.chat1, 9);
        assert.ok(calls.includes('details'));
        assert.equal(handle.open, false);
    });

    it('renders dashboard metrics, heatmap tooltip, model distribution, and locale changes', () => {
        const { document, window } = createFakeDom();
        const uiState = createUiStub(document, 'en');
        const scheduled = [];
        const counter = {
            state: {
                total: 100,
                totalChatsCreated: 5,
                dailyCounts: {
                    '2026-07-31': { messages: 10, byModel: { flash: 2, thinking: 1, pro: 1 } }
                }
            },
            MODEL_CONFIG: {
                flash: { color: 'green', multiplier: 1 },
                thinking: { color: 'orange', multiplier: 2 },
                pro: { color: 'red', multiplier: 3 }
            },
            calculateStreaks: () => ({ current: 2, best: 4 })
        };
        const handle = shell.openDashboardController({
            document,
            window,
            createIcon: iconFactory(document),
            core: {
                applyTheme: (node, theme) => { node.dataset.theme = theme; },
                getCurrentUser: () => 'user@example.com'
            },
            counter,
            formatDate: date => date.toISOString().slice(0, 10),
            getTheme: () => 'paper',
            ui: uiState.ui,
            schedule: callback => scheduled.push(callback),
            now: () => new Date('2026-08-01T12:00:00Z')
        });
        assert.equal(handle.element.dataset.theme, 'paper');
        assert.match(handle.element.textContent, /Total Messages/);
        assert.match(handle.element.textContent, /Model Usage Distribution/);
        const cell = handle.element.querySelector('.heatmap-cell');
        cell.dispatchEvent(new FakeEvent('mouseenter'));
        assert.equal(document.getElementById('g-heatmap-tooltip').classList.contains('visible'), true);
        cell.dispatchEvent(new FakeEvent('mouseleave'));
        assert.equal(document.getElementById('g-heatmap-tooltip').classList.contains('visible'), false);
        uiState.ui.setLocale('zh-CN');
        assert.match(handle.element.textContent, /总消息数/);
        scheduled[0]();
        assert.ok(handle.element.querySelector('.heatmap-container').scrollLeft > 0);
        handle.element.querySelector('.dash-close').click();
        assert.equal(document.getElementById('g-heatmap-tooltip'), null);
        assert.equal(uiState.localeListeners.size, 0);
    });
});
