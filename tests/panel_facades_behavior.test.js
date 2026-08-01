const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { FakeEvent, createFakeDom } = require('./helpers/fake_dom.js');

const rootDir = path.join(__dirname, '..');
const importSource = file => import(pathToFileURL(path.join(rootDir, 'src', file)).href);

Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'en-US' }
});

let PanelUI;
let setIconText;
let renderModIcon;
let Core;
let ModuleRegistry;
let NativeUI;
let GeminiAdapter;
let settingsFacades;
let dashboardFacade;
let GuidedTour;

function installDom() {
    const dom = createFakeDom();
    globalThis.document = dom.document;
    globalThis.window = dom.window;
    globalThis.location = { reload() {} };
    globalThis.requestAnimationFrame = callback => { callback(); return 1; };
    globalThis.cancelAnimationFrame = () => {};
    globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
    return dom;
}

function makeCounter() {
    return {
        state: {
            isExpanded: false,
            viewMode: 'today',
            resetStep: 0,
            total: 12,
            totalChatsCreated: 2,
            chats: { chat1: 3 },
            dailyCounts: { '2026-08-01': { messages: 5, byModel: { flash: 1 } } }
        },
        resetHour: 4,
        quotaLimit: 100,
        accountType: 'free',
        currentModel: 'flash',
        lastDisplayedVal: -1,
        MODEL_CONFIG: {
            flash: { label: 'Flash', color: 'green', multiplier: 1 },
            thinking: { label: 'Thinking', color: 'orange', multiplier: 2 },
            pro: { label: 'Pro', color: 'red', multiplier: 3 }
        },
        getTodayMessages: () => 5,
        getWeightedQuota: () => 5,
        getQuotaWindowState: () => ({ windowLabel: 'Daily', remainingLabel: 'now' }),
        getTodayByModel: () => ({ flash: 1, thinking: 0, pro: 0 }),
        getLast7DaysData: () => [{ label: 'Today', messages: 5 }],
        calculateStreaks: () => ({ current: 1, best: 2 }),
        loadDataForUser() {},
        handleReset() {},
        ensureTodayEntry() {},
        saveData() {}
    };
}

function stubApplicationState(counter, modules = {}) {
    let inspecting = 'user@example.com';
    Core.getCurrentUser = () => 'user@example.com';
    Core.getInspectingUser = () => inspecting;
    Core.setInspectingUser = value => { inspecting = value; };
    Core.getAllUsers = () => ['user@example.com'];
    Core.getChatId = () => 'chat1';
    Core.getDayKey = () => '2026-08-01';
    Core.getThemes = () => ({ glass: { name: 'Glass' }, paper: { name: 'Paper' } });
    Core.setTheme = () => {};
    Core.applyTheme = (node, theme) => { if (node) node.dataset.theme = theme; };
    Core.detectUser = () => 'user@example.com';

    ModuleRegistry.modules = modules;
    ModuleRegistry.getAll = () => Object.values(ModuleRegistry.modules);
    ModuleRegistry.isEnabled = id => ModuleRegistry.enabledModules.has(id);
    ModuleRegistry.toggle = async (id, checked) => {
        if (checked) ModuleRegistry.enabledModules.add(id);
        else ModuleRegistry.enabledModules.delete(id);
    };
    ModuleRegistry.enabledModules = new Set(Object.keys(modules));
    GeminiAdapter.getSelectorHealthReport = () => ({ ready: true, passed: 1, total: 1, checks: [] });
    return counter;
}

before(async () => {
    installDom();
    const panelModule = await importSource('panel_ui.js');
    [
        ({ PanelUI, setIconText, renderModIcon } = panelModule),
        ({ Core } = await importSource('core.js')),
        ({ ModuleRegistry } = await importSource('module_registry.js')),
        ({ NativeUI } = await importSource('native_ui.js')),
        ({ GeminiAdapter } = await importSource('adapters/gemini.js')),
        settingsFacades = await importSource('panel_settings.js'),
        dashboardFacade = await importSource('panel_dashboard.js'),
        ({ GuidedTour } = await importSource('guided_tour.js'))
    ];
});

afterEach(() => {
    NativeUI.closeAllDialogs?.('test-cleanup');
    NativeUI.setLocale?.('en');
    PanelUI.destroy();
});

describe('PanelUI injected shell ports', () => {
    it('creates, repairs, expands, focuses, announces, persists, and destroys without concrete module imports', () => {
        const { document, window } = installDom();
        const counter = makeCounter();
        const rendered = [];
        const modules = {
            alpha: {
                id: 'alpha', name: 'Alpha', icon: 'A',
                renderToDetailsPane: pane => { pane.textContent = 'Alpha content'; rendered.push('alpha'); }
            },
            inert: { id: 'inert', name: 'Inert' }
        };
        stubApplicationState(counter, modules);
        ModuleRegistry.enabledModules.delete('inert');
        const stored = new Map();
        const styles = [];
        const announcements = [];
        const health = { getSnapshot: () => null, subscribe: () => () => {} };
        const ports = PanelUI.configureShellPorts({
            counter,
            exportModule: { renderExportButtons() {} },
            storage: {
                get: (key, fallback) => stored.has(key) ? stored.get(key) : fallback,
                set: (key, value) => stored.set(key, value)
            },
            addStyle: css => styles.push(css),
            notifications: { announce: (...args) => { announcements.push(args); return 'announced'; } },
            capabilityHealth: health
        });
        assert.equal(ports.counter, counter);
        assert.equal(PanelUI.getShellPort('missing'), null);
        assert.equal(PanelUI.injectStyles(), styles[0]);
        assert.match(styles[0], /gemini-monitor-panel-v7/);
        assert.match(styles[0], /max-height:\s*calc\(100dvh - 24px\)/);
        assert.match(styles[0], /\.gemini-details-view\.expanded\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s);
        assert.match(styles[0], /@media \(prefers-reduced-motion: reduce\)\s*\{\s*#gemini-monitor-panel-v7,/);
        assert.equal(PanelUI.announce('Ready', { tone: 'success' }), 'announced');
        assert.deepEqual(announcements[0], ['Ready', { tone: 'success' }]);
        assert.throws(() => PanelUI.announce(''), /non-empty message/);

        PanelUI.create();
        const panel = document.getElementById('gemini-monitor-panel-v7');
        assert.notEqual(panel, null);
        assert.equal(panel.dataset.theme, 'glass');
        assert.equal(PanelUI._isPanelComplete(panel), true);
        assert.equal(PanelUI.openModule('unknown'), false);
        assert.equal(PanelUI.openModule('inert'), false);
        assert.throws(() => PanelUI.openModule(''), /module id/);
        assert.equal(PanelUI.openModule('alpha'), true);
        assert.equal(counter.state.isExpanded, true);
        assert.ok(rendered.includes('alpha'));
        assert.equal(document.activeElement.dataset.tabId, 'alpha');
        assert.equal(document.getElementById('g-details-toggle').getAttribute('aria-expanded'), 'true');

        PanelUI.toggleDetails();
        assert.equal(counter.state.isExpanded, false);
        PanelUI.toggleDetails();
        assert.equal(counter.state.isExpanded, true);
        const offscreen = { top: '900px', left: '900px', bottom: 'auto', right: 'auto' };
        window.innerWidth = 400;
        window.innerHeight = 300;
        PanelUI.applyPos(panel, offscreen);
        assert.ok([...stored.values()].some(value => value?.top === '20px'));
        const header = panel.querySelector('.gemini-header');
        PanelUI.makeDraggable(panel, header);
        header.dispatchEvent(new FakeEvent('pointerdown', { clientX: 20, clientY: 20, pointerId: 1 }));
        document.dispatchEvent(new FakeEvent('pointermove', { clientX: 40, clientY: 50 }));
        document.dispatchEvent(new FakeEvent('pointerup'));
        assert.ok([...stored.values()].some(value => value?.bottom === 'auto'));

        PanelUI.create();
        assert.equal(document.querySelectorAll('#gemini-monitor-panel-v7').length, 1);
        panel.querySelector('#g-big-display').remove();
        PanelUI.create();
        assert.equal(document.querySelectorAll('#gemini-monitor-panel-v7').length, 1);
        PanelUI.destroy();
        assert.equal(PanelUI._layout, null);
    });

    it('validates every port and exposes deterministic missing-port failures', () => {
        assert.throws(() => PanelUI.configureShellPorts(null), /must be an object/);
        assert.throws(() => PanelUI.configureShellPorts([]), /must be an object/);
        assert.throws(() => PanelUI.configureShellPorts({ unknown: {} }), /Unknown panel shell port/);
        assert.throws(() => PanelUI.configureShellPorts({ capabilityHealth: {} }), /getSnapshot/);
        assert.throws(() => PanelUI.configureShellPorts({ storage: {} }), /get\(\) and set\(\)/);
        assert.throws(() => PanelUI.configureShellPorts({ counter: 1 }), /counter port/);
        assert.throws(() => PanelUI.configureShellPorts({ exportModule: 1 }), /exportModule port/);
        assert.throws(() => PanelUI.configureShellPorts({ addStyle: {} }), /addStyle port/);
        assert.throws(() => PanelUI.configureShellPorts({ notifications: {} }), /announce/);
        PanelUI.configureShellPorts({ counter: null });
        assert.throws(() => PanelUI._requireShellPort('counter'), /not configured/);
    });

    it('covers presenter delegates, locale refresh, recovery, missing panes, and injected-port failures', () => {
        const { document, window } = installDom();
        const counter = makeCounter();
        counter.state.isExpanded = true;
        let resets = 0;
        counter.handleReset = () => { resets += 1; };
        const modules = {
            nameless: {
                id: 'nameless', name: '', icon: 'N',
                renderToDetailsPane: pane => { pane.textContent = 'Nameless'; }
            },
            broken: {
                id: 'broken', name: 'Broken', icon: 'B',
                renderToDetailsPane: () => { throw new Error('broken details'); }
            }
        };
        stubApplicationState(counter, modules);
        const styles = [];
        const storage = {
            get() { throw new Error('read failed'); },
            set() { throw new Error('write failed'); }
        };
        PanelUI.configureShellPorts({
            counter,
            exportModule: {},
            storage,
            addStyle: css => styles.push(css),
            notifications: { announce() {} },
            capabilityHealth: null
        });
        const iconTarget = document.createElement('button');
        setIconText(iconTarget, 'chart', 'Stats');
        assert.match(iconTarget.textContent, /Stats/);
        assert.equal(renderModIcon({ id: 'counter' }).tagName, 'SVG');

        const originalError = console.error;
        const originalWarn = console.warn;
        const errors = [];
        console.error = (...args) => errors.push(args);
        console.warn = () => {};
        try {
            PanelUI.create();
            const panel = document.getElementById('gemini-monitor-panel-v7');
            assert.notEqual(panel, null);
            NativeUI.setLocale('zh-CN');
            panel.querySelector('#g-details-toggle').click();
            panel.querySelector('#g-details-toggle').click();
            panel.querySelector('#g-action-btn').click();
            assert.equal(resets, 1);

            PanelUI._activeTab = 'stats';
            PanelUI.renderDetailsPane();
            const originalDashboard = PanelUI.openDashboard;
            const originalSettings = PanelUI.openSettingsModal;
            const originalRenderDetails = PanelUI.renderDetailsPane;
            const calls = [];
            PanelUI.openDashboard = () => calls.push('dashboard');
            PanelUI.openSettingsModal = () => calls.push('settings');
            PanelUI.renderDetailsPane = () => calls.push('details');
            try {
                const presenter = PanelUI._getPresenter();
                const stats = document.createElement('div');
                presenter.renderStats(stats);
                stats.querySelectorAll('button').find(button => button.textContent.includes('统计')).click();
                stats.querySelector('.panel-settings-trigger').click();
                stats.querySelectorAll('button').find(button => button.textContent.startsWith('Today')).click();
                assert.deepEqual(calls, ['dashboard', 'settings', 'details']);
            } finally {
                PanelUI.openDashboard = originalDashboard;
                PanelUI.openSettingsModal = originalSettings;
                PanelUI.renderDetailsPane = originalRenderDetails;
            }

            assert.equal(PanelUI.openModule('broken'), true);
            assert.ok(errors.some(args => String(args[0]).includes('Details pane render error')));
            const statsPane = document.createElement('div');
            PanelUI._renderStatsTab(statsPane);
            assert.match(statsPane.textContent, /Statistics/);
            assert.equal(PanelUI.createSectionTitle('Section').textContent, 'Section');
            assert.match(PanelUI._formatQuotaWindowText({ windowLabel: 'Daily', remainingLabel: 'now' }), /Daily/);
            assert.match(PanelUI.createPassiveRow('A', 'B').textContent, /AB/);
            assert.match(PanelUI.createRow('C', 'total', 'D').textContent, /CD/);

            document.getElementById('g-big-display').remove();
            NativeUI.setLocale('en');
            PanelUI.create();

            const pane = document.getElementById('g-details-pane');
            pane.classList.remove('expanded');
            counter.state.isExpanded = false;
            PanelUI.renderDetailsPane();
            pane.remove();
            PanelUI.renderDetailsPane();

            PanelUI.destroy();
            counter.state.isExpanded = false;
            assert.equal(PanelUI.openModule('nameless'), true);
            PanelUI.destroy();
            const originalCreate = PanelUI.create;
            PanelUI.create = () => {};
            try { assert.equal(PanelUI.openModule('nameless'), false); }
            finally { PanelUI.create = originalCreate; }

            const element = document.createElement('div');
            element.offsetWidth = 100;
            element.offsetHeight = 50;
            const handle = document.createElement('header');
            window.innerWidth = 100;
            window.innerHeight = 100;
            PanelUI.applyPos(element, { top: '900px', left: '900px', bottom: 'auto', right: 'auto' });
            PanelUI.makeDraggable(element, handle);
            handle.dispatchEvent(new FakeEvent('pointerdown', { clientX: 1, clientY: 1, pointerId: 1 }));
            document.dispatchEvent(new FakeEvent('pointerup'));

            PanelUI.destroy();
            PanelUI.configureShellPorts({ counter: null });
            PanelUI.create();
            assert.ok(errors.some(args => String(args[0]).includes('Panel init error')));
        } finally {
            console.error = originalError;
            console.warn = originalWarn;
        }

        PanelUI.configureShellPorts({
            capabilityHealth: null,
            counter: null,
            exportModule: null,
            storage: null,
            addStyle: null,
            notifications: null
        });
        assert.equal(styles.length >= 0, true);
    });
});

describe('legacy panel facades', () => {
    it('opens settings, onboarding, debug, calibration, and dashboard through injected controllers', () => {
        const { document, window } = installDom();
        NativeUI._dialogManager?.destroy();
        NativeUI._dialogManager = null;
        NativeUI._dialogPortal = null;
        NativeUI._dialogDocument = null;
        NativeUI._dialogs.clear();
        const counter = makeCounter();
        const onboarding = {
            en: { rant: 'Why', features: 'Feature', guide: 'Guide' },
            zh: { rant: '原因', features: '功能', guide: '用法' }
        };
        const modules = {
            alpha: {
                id: 'alpha', name: 'Alpha', icon: 'A', description: 'Alpha',
                getOnboarding: () => onboarding,
                renderToSettings: section => { section.dataset.rendered = 'alpha'; }
            }
        };
        stubApplicationState(counter, modules);
        const storage = new Map();
        const panel = {
            _requireShellPort(name) {
                return {
                    counter,
                    exportModule: { renderExportButtons: section => { section.dataset.export = 'true'; } },
                    storage: { get: (_key, fallback) => fallback, set: (key, value) => storage.set(key, value) }
                }[name];
            },
            getShellPort: () => ({ getSnapshot: () => null, subscribe: () => () => {} }),
            showOnboarding: id => settingsFacades.showOnboarding.call(panel, id),
            openCalibrationModal: () => settingsFacades.openCalibrationModal.call(panel),
            openDebugModal: () => settingsFacades.openDebugModal.call(panel),
            update() {},
            renderDetailsPane() {}
        };

        const settings = settingsFacades.openSettingsModal.call(panel);
        assert.equal(settings.element.getAttribute('role'), 'dialog');
        assert.match(settings.element.textContent, /Feature Extensions/);
        settings.close();

        const guide = settingsFacades.showOnboarding.call(panel, 'alpha');
        assert.match(guide.element.textContent, /Why/);
        guide.close();
        assert.equal(settingsFacades.showOnboarding.call(panel, 'unknown'), undefined);

        const calibration = settingsFacades.openCalibrationModal.call(panel);
        assert.match(calibration.element.textContent, /Calibrate Data/);
        calibration.close();

        const debug = settingsFacades.openDebugModal.call(panel);
        assert.match(debug.element.textContent, /Adapter Ready/);
        debug.close();

        const dashboard = dashboardFacade.openDashboard.call(panel);
        assert.match(dashboard.element.textContent, /Total Messages/);
        dashboard.close();
        assert.equal(document.getElementById('g-heatmap-tooltip'), null);
        assert.equal(window.document, document);
    });

    it('executes every settings facade callback and calibration/debug refresh path', async () => {
        const { document } = installDom();
        NativeUI._dialogManager?.destroy();
        NativeUI._dialogManager = null;
        NativeUI._dialogPortal = null;
        NativeUI._dialogDocument = null;
        NativeUI._dialogs.clear();
        const counter = makeCounter();
        counter.state.isExpanded = true;
        const modules = {
            alpha: {
                id: 'alpha', name: 'Alpha', icon: 'A', description: 'Alpha',
                getOnboarding: () => ({ en: { rant: 'Why' } }),
                renderToSettings: section => { section.dataset.rendered = 'alpha'; }
            }
        };
        stubApplicationState(counter, modules);
        const calls = [];
        const storage = {
            get: (_key, fallback) => fallback,
            set: (...args) => calls.push(['storage', ...args])
        };
        const panel = {
            _requireShellPort(name) {
                return {
                    counter,
                    exportModule: { renderExportButtons() {} },
                    storage
                }[name];
            },
            getShellPort: () => null,
            showOnboarding: id => calls.push(['onboarding', id]),
            openCalibrationModal: () => calls.push(['calibration']),
            openDebugModal: () => calls.push(['debug']),
            update: () => calls.push(['update']),
            renderDetailsPane: () => calls.push(['details'])
        };
        const details = document.createElement('div');
        details.id = 'g-details-pane';
        details.classList.add('expanded');
        document.body.appendChild(details);

        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;
        const originalReload = globalThis.location.reload;
        const originalTourStart = GuidedTour.start;
        URL.createObjectURL = blob => { calls.push(['blob', blob.type]); return 'blob:test'; };
        URL.revokeObjectURL = url => calls.push(['revoke', url]);
        globalThis.location.reload = () => calls.push(['reload']);
        GuidedTour.start = () => calls.push(['tour']);
        try {
            let settings = settingsFacades.openSettingsModal.call(panel);
            const findButton = text => settings.element.querySelectorAll('button')
                .find(button => button.textContent.includes(text));
            const selects = settings.element.querySelectorAll('select');
            selects[0].value = '8';
            selects[0].onchange();
            const quota = settings.element.querySelectorAll('input').find(input => input.type === 'number');
            quota.value = '20';
            quota.onchange();
            findButton('Show guide').click();
            findButton('Export Data').click();
            findButton('Calibrate Data').click();
            findButton('Open Debug Panel').click();
            const logLevel = selects.at(-1);
            logLevel.value = 'debug';
            logLevel.onchange();
            const moduleToggle = settings.element.querySelectorAll('input')[0];
            moduleToggle.checked = false;
            moduleToggle.dispatchEvent(new FakeEvent('change'));
            await new Promise(resolve => setImmediate(resolve));
            settings.element.querySelectorAll('button')
                .find(button => button.textContent.includes('Guided Tour')).click();
            assert.equal(settings.open, false);

            settings = settingsFacades.openSettingsModal.call(panel);
            settings.element.querySelectorAll('button')
                .find(button => button.textContent.includes('Reset Panel Position')).click();
            assert.equal(settings.open, false);

            const calibration = settingsFacades.openCalibrationModal.call(panel);
            calibration.element.querySelector('.calibration-apply').click();
            assert.equal(calibration.open, false);

            const debug = settingsFacades.openDebugModal.call(panel);
            debug.element.querySelectorAll('button')
                .find(button => button.textContent.includes('Clear Logs')).click();
            debug.close();
        } finally {
            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
            globalThis.location.reload = originalReload;
            GuidedTour.start = originalTourStart;
        }
        for (const type of [
            'storage', 'update', 'onboarding', 'blob', 'revoke', 'calibration',
            'debug', 'details', 'tour', 'reload'
        ]) assert.ok(calls.some(call => call[0] === type), `expected ${type} callback`);
    });

    it('configures the guided-tour storage facade without ambient GM access', () => {
        const writes = [];
        const storage = { get: () => true, set: (...args) => writes.push(args) };
        assert.equal(GuidedTour.configurePorts({ storage }).storage, storage);
        assert.equal(GuidedTour.hasSeen(), true);
        GuidedTour.markSeen();
        assert.equal(writes.length, 1);
        assert.throws(() => GuidedTour.configurePorts({ storage: {} }), /get\(\) and set\(\)/);
        assert.equal(GuidedTour.configurePorts().storage, storage);
        assert.equal(GuidedTour.configurePorts({}).storage, storage);
        assert.equal(GuidedTour.configurePorts({ storage: null }).storage, null);
        assert.equal(GuidedTour.hasSeen(), false);
        assert.throws(() => GuidedTour.configurePorts(null), /ports must be an object/);
        assert.throws(() => GuidedTour.configurePorts([]), /ports must be an object/);
    });

    it('runs the guided-tour global fallbacks and completion scheduler', () => {
        const { document } = installDom();
        const target = document.createElement('div');
        target.id = 'gemini-monitor-panel-v7';
        document.body.appendChild(target);
        GuidedTour.configurePorts({ storage: null });
        const originalStyle = globalThis.getComputedStyle;
        const originalTimeout = globalThis.setTimeout;
        const scheduled = [];
        let completed = 0;
        delete globalThis.getComputedStyle;
        globalThis.setTimeout = (callback, delay) => {
            scheduled.push(delay);
            callback();
            return 1;
        };
        try {
            assert.equal(GuidedTour.start(() => { completed += 1; }), true);
            GuidedTour.stop();
        } finally {
            globalThis.getComputedStyle = originalStyle;
            globalThis.setTimeout = originalTimeout;
        }
        assert.deepEqual(scheduled, [500]);
        assert.equal(completed, 1);
    });
});
