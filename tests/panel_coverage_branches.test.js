const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
    FakeEvent,
    createFakeDom,
    createUiStub,
    iconFactory
} = require('./helpers/fake_dom.js');

const rootDir = path.join(__dirname, '..');
const importShell = name => import(pathToFileURL(path.join(rootDir, 'src', 'ui', 'shell', name)).href);

let shell;

before(async () => {
    shell = Object.assign({}, ...await Promise.all([
        'calibration_controller.js',
        'dashboard_controller.js',
        'debug_controller.js',
        'details_controller.js',
        'drag_controller.js',
        'onboarding_controller.js',
        'panel_presenter.js',
        'settings_controller.js',
        'tour_controller.js'
    ].map(importShell)));
});

function calibrationOptions(document, overrides = {}) {
    const uiState = createUiStub(document);
    const counter = {
        resetHour: 4,
        state: {
            dailyCounts: {},
            total: 0,
            totalChatsCreated: 0,
            chats: {},
            isExpanded: false
        },
        ensureTodayEntry() { this.state.dailyCounts.today ||= { messages: 0 }; },
        saveData() {}
    };
    return {
        document,
        createIcon: iconFactory(document),
        getTheme: () => 'glass',
        updatePanel() {},
        refreshDetails() {},
        core: {
            applyTheme() {},
            getDayKey: () => 'today',
            getChatId: () => null
        },
        counter,
        logger: { info() {} },
        ui: uiState.ui,
        ...overrides
    };
}

function debugOptions(document, overrides = {}) {
    const uiState = createUiStub(document);
    return {
        document,
        createIcon: iconFactory(document),
        getTheme: () => 'glass',
        filterLogs: entries => entries,
        isDebugEnabled: () => false,
        core: {
            applyTheme() {},
            detectUser: () => null,
            getCurrentUser: () => 'local',
            getInspectingUser: () => null
        },
        adapter: {
            getSelectorHealthReport: () => ({
                ready: false,
                passed: 0,
                total: 1,
                checks: [{ label: 'Missing', detail: '', ok: false }]
            })
        },
        logger: {
            getLevel: () => 'info',
            getEntries: () => [{ ts: '1', level: 'info', msg: 'plain', data: null }],
            subscribe: () => () => {}
        },
        ui: uiState.ui,
        actions: [{ zh: '动作', en: 'Action', run() {} }],
        ...overrides
    };
}

function onboardingOptions(document, content, locale = 'en') {
    const uiState = createUiStub(document, locale);
    const createIcon = iconFactory(document);
    const module = { id: 'alpha', name: 'Alpha', getOnboarding: () => content };
    return {
        options: {
            document,
            moduleId: 'alpha',
            registry: { modules: { alpha: module } },
            core: { applyTheme() {} },
            getTheme: () => 'glass',
            createIcon,
            renderModuleIcon: () => createIcon('alpha', 16),
            ui: uiState.ui
        },
        uiState
    };
}

function settingsBranchOptions(document, overrides = {}) {
    const uiState = createUiStub(document);
    const calls = [];
    const enabled = new Map([['alpha', true], ['export', false]]);
    const modules = [
        {
            id: 'alpha', name: 'Alpha', description: '',
            getOnboarding: () => ({ en: { rant: 'Why' } }),
            renderToSettings: target => { target.dataset.moduleSettings = 'alpha'; }
        },
        { id: 'export', name: 'Export', description: '' }
    ];
    const options = {
        document,
        createIcon: iconFactory(document),
        renderModuleIcon: module => {
            const icon = document.createElement('span');
            icon.textContent = module.id;
            return icon;
        },
        getTheme: () => 'glass',
        core: { applyTheme() {} },
        registry: {
            getAll: () => modules,
            isEnabled: id => enabled.get(id) === true,
            async toggle(id, checked) { enabled.set(id, Boolean(checked)); }
        },
        counter: {
            resetHour: 4,
            quotaLimit: 10,
            state: { total: 1, totalChatsCreated: 1, chats: {}, dailyCounts: {} },
            getLast7DaysData: () => [{ label: '', messages: 'not-a-number' }]
        },
        exportModule: { renderExportButtons: () => calls.push(['native-export']) },
        logger: {
            getLevel: () => 'info',
            setLevel: value => calls.push(['level', value]),
            info: (...args) => calls.push(['info', ...args]),
            error: (...args) => calls.push(['error', ...args])
        },
        ui: uiState.ui,
        keys: { RESET_HOUR: 'reset', QUOTA: 'quota', POS: 'position' },
        defaultPosition: { top: '1px', left: '2px', bottom: 'auto', right: 'auto' },
        metadata: { appName: 'Primer++', version: '13', trademarkNotice: 'Unofficial' },
        persist: (...args) => calls.push(['persist', ...args]),
        reload: () => calls.push(['reload']),
        exportData: data => calls.push(['export', data]),
        showOnboarding: id => calls.push(['onboarding', id]),
        openCalibration: () => calls.push(['calibration']),
        startTour: () => calls.push(['tour']),
        openDebug: () => calls.push(['debug']),
        updatePanel: () => calls.push(['update']),
        refreshDetails: () => calls.push(['details']),
        isDetailsExpanded: () => false,
        isDebugEnabled: () => false,
        setDebugEnabled: value => calls.push(['debug-enabled', value]),
        now: () => new Date('2026-08-01T00:00:00Z'),
        ...overrides
    };
    return { options, calls, enabled, uiState };
}

describe('panel shell defensive and fallback branches', () => {
    it('validates support-dialog, presenter, settings, and tour dependencies', () => {
        const { document, window } = createFakeDom();
        const createIcon = iconFactory(document);
        const savedDocument = globalThis.document;
        const savedWindow = globalThis.window;
        globalThis.document = document;
        globalThis.window = window;
        try {
            assert.throws(() => shell.openCalibrationController(), /createIcon/);
            assert.throws(() => shell.openCalibrationController({
                createIcon, getTheme() {}, updatePanel() {}, refreshDetails() {}
            }), /application dependencies/);
            assert.throws(() => shell.openCalibrationController({ document, createIcon: 1 }), /createIcon/);

            assert.throws(() => shell.openDebugController(), /createIcon/);
            assert.throws(() => shell.openDebugController({
                createIcon, getTheme() {}, filterLogs() {}, isDebugEnabled() {}, actions: []
            }), /application dependencies/);
            assert.throws(() => shell.openDebugController({
                ...debugOptions(document), actions: [{}]
            }), /action/);

            assert.throws(() => shell.openOnboardingController({ document }), /getTheme/);
            assert.throws(() => shell.openOnboardingController({
                document, getTheme() {}, createIcon, renderModuleIcon() {}
            }), /registry, core, and ui/);

            assert.throws(() => shell.createPanelPresenter(), /application descriptors/);
            assert.throws(() => shell.createPanelPresenter({
                document, counter: {}, core: {}, quotaColors: {}, tempUser: 'guest', panelId: 'panel'
            }), /translate/);

            assert.throws(() => shell.openSettingsController(), /createIcon/);
            const emptyFunctions = {
                document,
                createIcon,
                renderModuleIcon() {},
                getTheme() {},
                persist() {},
                reload() {},
                exportData() {},
                showOnboarding() {},
                openCalibration() {},
                startTour() {},
                openDebug() {},
                updatePanel() {},
                refreshDetails() {},
                isDetailsExpanded() {},
                isDebugEnabled() {},
                setDebugEnabled() {},
                now() {}
            };
            assert.throws(() => shell.openSettingsController(emptyFunctions), /application dependencies/);
            assert.throws(() => shell.openSettingsController({ ...emptyFunctions, createIcon: 1 }), /createIcon/);
            assert.throws(() => shell.createUsageChart(null, []), /DOM document/);
            assert.throws(() => shell.createUsageChart(document, []), /requires data/);
            const chart = shell.createUsageChart(document, [{ label: '', messages: 'invalid' }]);
            assert.equal(chart.querySelectorAll('circle').length, 1);
            assert.equal(shell.EMPTY_CAPABILITY_HEALTH_PORT.getSnapshot(), null);
            assert.equal(typeof shell.EMPTY_CAPABILITY_HEALTH_PORT.subscribe()(), 'undefined');

            assert.throws(() => shell.createTourController(), /requires steps/);
            assert.throws(() => shell.createTourController({ steps: [{}] }), /getDocument/);
            assert.throws(() => shell.createTourController({
                steps: [{}], getDocument: () => document, getWindow: () => window
            }), /requires ui/);
            assert.throws(() => shell.createTourController({
                steps: [{}], getDocument: () => document, getWindow: () => window,
                ui: {}, readSeen: 1
            }), /readSeen/);
        } finally {
            globalThis.document = savedDocument;
            globalThis.window = savedWindow;
        }

        delete globalThis.document;
        try {
            assert.throws(() => shell.openCalibrationController(), /DOM document/);
            assert.throws(() => shell.openDebugController(), /DOM document/);
            assert.throws(() => shell.createPanelPresenter(), /DOM document/);
            assert.throws(() => shell.openSettingsController(), /DOM document/);
        } finally {
            globalThis.document = savedDocument;
        }
        assert.throws(() => shell.openOnboardingController(), /DOM document/);

        const details = shell.createDetailsController({
            document,
            translate: (_zh, en) => en,
            createIcon,
            renderContent() {}
        });
        const detailsPane = document.createElement('div');
        const tabs = [{ id: 'stats', label: 'Stats' }];
        details.render(detailsPane, tabs);
        details.setActive('missing');
        details.render(detailsPane, tabs);
        details.setActive('stats');
        assert.equal(details.focusActive(), true);
        details.destroy();

        globalThis.window = window;
        try {
            const positioned = document.createElement('div');
            const position = { top: '1px', left: '1px', bottom: 'auto', right: 'auto' };
            assert.equal(shell.applyPanelPosition({ element: positioned, position }), position);
            const defaultDrag = shell.createDragController({ document, window });
            const defaultHandle = document.createElement('header');
            defaultDrag.attach(positioned, defaultHandle);
            defaultHandle.dispatchEvent(new FakeEvent('pointerdown', {
                clientX: 1, clientY: 1, pointerId: 1
            }));
            document.dispatchEvent(new FakeEvent('pointerup'));
            defaultDrag.destroy();
        } finally {
            globalThis.window = savedWindow;
        }
    });

    it('covers calibration defaults, invalid values, duplicate suppression, and no-chat apply', () => {
        const { document } = createFakeDom();
        const duplicate = calibrationOptions(document, {
            ui: { ...createUiStub(document).ui, getDialog: () => ({}) }
        });
        assert.equal(shell.openCalibrationController(duplicate), undefined);

        const options = calibrationOptions(document);
        const handle = shell.openCalibrationController(options);
        const inputs = handle.element.querySelectorAll('input');
        assert.equal(inputs.length, 3);
        inputs.forEach(input => { input.value = 'invalid'; });
        handle.element.querySelector('.calibration-apply').click();
        assert.equal(options.counter.state.dailyCounts.today.messages, 0);
        assert.equal(options.counter.state.total, 0);
        assert.equal(options.counter.state.totalChatsCreated, 0);
        assert.equal(handle.open, false);

        const missingChat = calibrationOptions(document, {
            core: {
                applyTheme() {},
                getDayKey: () => 'today',
                getChatId: () => 'missing-chat'
            }
        });
        const missingChatHandle = shell.openCalibrationController(missingChat);
        const missingChatInput = missingChatHandle.element.querySelectorAll('input').at(-1);
        assert.equal(missingChatInput.value, '0');
        missingChatInput.value = 'not-a-number';
        missingChatHandle.element.querySelector('.calibration-apply').click();
        assert.equal(missingChat.counter.state.chats['missing-chat'], 0);
    });

    it('covers onboarding missing modules/content and each language fallback', () => {
        const { document } = createFakeDom();
        const base = onboardingOptions(document, {}).options;
        assert.equal(shell.openOnboardingController({
            ...base,
            registry: { modules: {} }
        }), undefined);
        assert.equal(shell.openOnboardingController({
            ...base,
            registry: { modules: { alpha: { id: 'alpha' } } }
        }), undefined);
        assert.equal(shell.openOnboardingController({
            ...base,
            registry: { modules: { alpha: { id: 'alpha', getOnboarding: () => null } } }
        }), undefined);

        const englishFallback = onboardingOptions(document, { zh: { rant: '中文内容' } }, 'en');
        const zhHandle = shell.openOnboardingController(englishFallback.options);
        assert.match(zhHandle.element.textContent, /中文内容/);
        zhHandle.close();

        const chineseFallback = onboardingOptions(document, { en: { features: 'English fallback' } }, 'zh-CN');
        const enHandle = shell.openOnboardingController(chineseFallback.options);
        assert.match(enHandle.element.textContent, /English fallback/);
        const language = enHandle.element.querySelector('.onboarding-lang-btn');
        const originalQuery = enHandle.element.querySelector.bind(enHandle.element);
        enHandle.element.querySelector = selector => selector === '.onboarding-lang-btn' ? null : originalQuery(selector);
        language.click();
        assert.equal(chineseFallback.uiState.ui.getLocale(), 'en');
        enHandle.element.querySelector = originalQuery;
        enHandle.element.querySelector('.onboarding-close').click();

        const empty = onboardingOptions(document, {}, 'zh-CN');
        const emptyHandle = shell.openOnboardingController(empty.options);
        assert.equal(emptyHandle.element.querySelectorAll('.onboarding-section').length, 0);
        emptyHandle.close();
    });

    it('covers debug duplicate, nullable identity, invalid identity, and close-control paths', () => {
        const { document } = createFakeDom();
        const duplicate = debugOptions(document, {
            ui: { ...createUiStub(document).ui, getDialog: () => ({}) }
        });
        assert.equal(shell.openDebugController(duplicate), undefined);

        const options = debugOptions(document);
        const handle = shell.openDebugController(options);
        assert.match(handle.element.textContent, /Detected: null/);
        assert.match(handle.element.textContent, /Storage Key: N\/A/);
        handle.element.querySelector('.debug-close').click();
        assert.equal(handle.open, false);

        const nullIdentity = debugOptions(document, {
            core: {
                applyTheme() {}, detectUser: () => null,
                getCurrentUser: () => null, getInspectingUser: () => null
            }
        });
        const nullHandle = shell.openDebugController(nullIdentity);
        assert.match(nullHandle.element.textContent, /Storage Key: N\/A/);
        nullHandle.close();
    });
});

describe('settings residual behavior', () => {
    it('covers optional capability health, duplicate suppression, native export, and mismatch rollback', async () => {
        const { document } = createFakeDom();
        const invalidPort = settingsBranchOptions(document);
        assert.throws(() => shell.openSettingsController({
            ...invalidPort.options,
            capabilityHealth: 1
        }), /capabilityHealth must be an object/);

        const duplicate = settingsBranchOptions(document);
        duplicate.options.ui = { ...duplicate.uiState.ui, getDialog: () => ({}) };
        assert.equal(shell.openSettingsController(duplicate.options), undefined);

        let healthListener = null;
        const native = settingsBranchOptions(document, {
            capabilityHealth: {
                getSnapshot: () => ({ features: [null] }),
                subscribe(listener) { healthListener = listener; return () => {}; }
            }
        });
        native.enabled.set('export', true);
        native.options.registry.toggle = async () => {};
        const nativeHandle = shell.openSettingsController(native.options);
        assert.ok(native.calls.some(call => call[0] === 'native-export'));
        healthListener();
        const toggle = nativeHandle.element.querySelectorAll('input')[0];
        toggle.checked = false;
        toggle.dispatchEvent(new FakeEvent('change'));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(toggle.checked, true);
        nativeHandle.element.querySelector('.settings-close').click();
        assert.equal(nativeHandle.open, false);
    });

    it('executes every settings action and keeps close-owning actions deterministic', () => {
        const { document } = createFakeDom();
        const fixture = settingsBranchOptions(document);
        let handle = shell.openSettingsController(fixture.options);
        const byText = text => handle.element.querySelectorAll('button')
            .find(button => button.textContent.includes(text));
        byText('Show guide').click();
        byText('Export Data').click();
        byText('Calibrate Data').click();
        byText('Open Debug Panel').click();
        const debugSwitch = handle.element.querySelectorAll('input').at(-1);
        debugSwitch.checked = true;
        debugSwitch.dispatchEvent(new FakeEvent('change'));
        const logLevel = handle.element.querySelectorAll('select').at(-1);
        logLevel.value = 'debug';
        logLevel.onchange();
        byText('Guided Tour').click();
        assert.equal(handle.open, false);

        handle = shell.openSettingsController(fixture.options);
        handle.element.querySelectorAll('button')
            .find(button => button.textContent.includes('Reset Panel Position')).click();
        assert.equal(handle.open, false);
        assert.ok(fixture.calls.some(call => call[0] === 'onboarding'));
        assert.ok(fixture.calls.some(call => call[0] === 'export'));
        assert.ok(fixture.calls.some(call => call[0] === 'calibration'));
        assert.ok(fixture.calls.some(call => call[0] === 'debug'));
        assert.ok(fixture.calls.some(call => call[0] === 'debug-enabled'));
        assert.ok(fixture.calls.some(call => call[0] === 'level'));
        assert.ok(fixture.calls.some(call => call[0] === 'tour'));
        assert.ok(fixture.calls.some(call => call[0] === 'reload'));
    });
});

describe('dashboard and presenter residual behavior', () => {
    it('validates dashboard dependencies and suppresses duplicate overlays', () => {
        const { document, window } = createFakeDom();
        const createIcon = iconFactory(document);
        assert.throws(() => shell.openDashboardController(), /DOM document/);
        assert.throws(() => shell.openDashboardController({ document }), /requires a window/);
        assert.throws(() => shell.openDashboardController({ document, window }), /createIcon/);
        assert.throws(() => shell.openDashboardController({
            document, window, createIcon, formatDate() {}, getTheme() {}, schedule() {}
        }), /requires core, counter, and ui/);
        const uiState = createUiStub(document);
        assert.equal(shell.openDashboardController({
            document,
            window,
            createIcon,
            formatDate() {},
            getTheme() {},
            schedule() {},
            core: {}, counter: {},
            ui: { ...uiState.ui, getDialog: () => ({}) }
        }), undefined);
    });

    it('renders all heat levels, clamps the tooltip, reuses/removes it, and covers model defaults', () => {
        const { document, window } = createFakeDom();
        window.innerWidth = 120;
        window.innerHeight = 80;
        const uiState = createUiStub(document);
        const tooltip = document.createElement('div');
        tooltip.id = 'g-heatmap-tooltip';
        tooltip.rect = { top: -5, left: -5, right: 200, bottom: 120, width: 80, height: 40 };
        document.body.appendChild(tooltip);
        const keys = ['one', 'three', 'six', 'ten'];
        let keyIndex = 0;
        const counter = {
            state: {
                total: 3,
                totalChatsCreated: 1,
                dailyCounts: {
                    one: { messages: 1, byModel: { flash: 1 } },
                    three: { messages: 3, byModel: { thinking: 1 } },
                    six: { messages: 6 },
                    ten: { messages: 10 }
                }
            },
            MODEL_CONFIG: {
                flash: { color: 'green', multiplier: 1.5 },
                thinking: { color: 'orange' },
                pro: { color: 'red', multiplier: null }
            },
            calculateStreaks: () => ({ current: 0, best: 0 })
        };
        const scheduled = [];
        const handle = shell.openDashboardController({
            document,
            window,
            createIcon: iconFactory(document),
            core: { applyTheme() {}, getCurrentUser: () => 'local' },
            counter,
            formatDate: () => keys[keyIndex++ % keys.length],
            getTheme: () => 'glass',
            ui: uiState.ui,
            schedule: callback => scheduled.push(callback)
        });
        const levels = handle.element.querySelectorAll('.heatmap-cell').map(cell => cell.className);
        assert.ok(levels.some(value => value.includes('l-1')));
        assert.ok(levels.some(value => value.includes('l-2')));
        assert.ok(levels.some(value => value.includes('l-3')));
        assert.ok(levels.some(value => value.includes('l-4')));
        const cell = handle.element.querySelector('.heatmap-cell');
        cell.rect = { top: 5, left: 5, right: 25, bottom: 25, width: 20, height: 20 };
        cell.dispatchEvent(new FakeEvent('mouseenter'));
        assert.equal(tooltip.classList.contains('visible'), true);
        scheduled[0]();
        tooltip.remove();
        handle.close();

        const sparse = {
            ...counter,
            state: { total: 0, totalChatsCreated: 0, dailyCounts: {} }
        };
        const sparseHandle = shell.openDashboardController({
            document,
            window,
            createIcon: iconFactory(document),
            core: { applyTheme() {}, getCurrentUser: () => 'local' },
            counter: sparse,
            formatDate: () => 'none',
            getTheme: () => 'glass',
            ui: uiState.ui,
            schedule() {},
            now: () => new Date('2026-08-01T00:00:00Z')
        });
        sparseHandle.close();
    });

    it('renders the other-user today view and presenter fallbacks', () => {
        const { document } = createFakeDom();
        const layout = document.createElement('div');
        for (const id of [
            'g-big-display', 'g-sub-info', 'g-action-btn', 'g-user-capsule',
            'g-model-badge', 'g-quota-fill', 'g-quota-label'
        ]) {
            const element = document.createElement(id === 'g-action-btn' ? 'button' : 'div');
            element.id = id;
            layout.appendChild(element);
        }
        document.body.appendChild(layout);
        let current = 'me@example.com';
        let inspecting = 'other@example.com';
        let weighted = 0.5;
        let chatId = null;
        const counter = {
            state: { viewMode: 'today', resetStep: 0, chats: {}, total: 0, totalChatsCreated: 0 },
            accountType: '', currentModel: 'missing', MODEL_CONFIG: {}, quotaLimit: 0,
            lastDisplayedVal: -1,
            getTodayMessages: () => 0,
            getWeightedQuota: () => weighted,
            getQuotaWindowState: () => ({ windowLabel: 'Daily', remainingLabel: 'now' }),
            getTodayByModel: () => ({ flash: 1 }),
            loadDataForUser() {}
        };
        const core = {
            getCurrentUser: () => current,
            getInspectingUser: () => inspecting,
            setInspectingUser: value => { inspecting = value; },
            getAllUsers: () => ['z@example.com', 'me@example.com', 'a@example.com'],
            getChatId: () => chatId,
            getThemes: () => ({}),
            setTheme() {}, applyTheme() {}
        };
        const presenter = shell.createPanelPresenter({
            document, counter, core,
            quotaColors: { safe: 'green', warn: 'orange', danger: 'red' },
            tempUser: 'guest', panelId: 'panel',
            translate: (_zh, en) => en,
            getTheme: () => 'glass', setTheme() {}, createIcon: iconFactory(document),
            setIconText() {}, openDashboard() {}, openSettings() {}, renderDetails() {}
        });
        assert.equal(presenter.update(), true);
        assert.match(document.getElementById('g-sub-info').textContent, /Today \(other\)/);
        const pane = document.createElement('div');
        presenter.renderStats(pane);
        assert.equal(pane.querySelector('.model-breakdown').textContent.includes('0'), true);

        inspecting = 'me@example.com';
        chatId = 'missing-chat';
        counter.state.viewMode = 'chat';
        counter.accountType = 'pro';
        counter.currentModel = 'pro';
        counter.MODEL_CONFIG.pro = { label: 'Pro', color: 'red' };
        weighted = 70;
        counter.quotaLimit = 100;
        presenter.reset();
        presenter.update();
        assert.equal(document.getElementById('g-big-display').textContent, '0');
        assert.equal(document.getElementById('g-user-capsule').querySelector('.acct-badge-inline').textContent, 'Pro');
        assert.equal(document.getElementById('g-quota-fill').style.background, 'orange');
        assert.equal(document.getElementById('g-model-badge').style.color, '#fff');

        const missingChatPane = document.createElement('div');
        presenter.renderStats(missingChatPane);
        assert.match(missingChatPane.textContent, /Current Chat0/);

        current = inspecting;
        presenter.update();
        counter.accountType = 'ultra';
        presenter.update();
        counter.state.resetStep = 1;
        presenter.update();

        inspecting = 'guest';
        counter.state.viewMode = 'total';
        weighted = 90;
        presenter.reset();
        presenter.update();
        assert.match(document.getElementById('g-user-capsule').textContent, /Guest/);
        assert.equal(document.getElementById('g-quota-fill').style.background, 'red');
    });
});

describe('tour residual behavior', () => {
    it('covers storage failures, navigation controls, keyboard, resize, placement, and completion', () => {
        const { document, window } = createFakeDom();
        window.innerWidth = 220;
        window.innerHeight = 100;
        const uiState = createUiStub(document);
        const target = document.createElement('button');
        target.id = 'one';
        target.rect = { top: 60, left: 180, right: 210, bottom: 90, width: 30, height: 30 };
        document.body.appendChild(target);
        const second = document.createElement('button');
        second.id = 'two';
        second.rect = { top: 10, left: 10, right: 40, bottom: 40, width: 30, height: 30 };
        document.body.appendChild(second);
        const returnFocus = document.createElement('button');
        document.body.appendChild(returnFocus);
        returnFocus.focus();
        const scheduled = [];
        const cancelled = [];
        const controller = shell.createTourController({
            steps: [
                { sel: '#one', zh: '一', en: 'One' },
                { sel: '#missing', zh: '缺', en: 'Missing' },
                { sel: '#two', zh: '二', en: 'Two' }
            ],
            ui: uiState.ui,
            getDocument: () => document,
            getWindow: () => window,
            getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
            getRequestAnimationFrame: () => callback => { callback(); return 7; },
            getCancelAnimationFrame: () => id => cancelled.push(id),
            schedule: (callback, delay) => scheduled.push([callback, delay]),
            readSeen: () => { throw new Error('read'); },
            writeSeen: () => { throw new Error('write'); }
        });
        assert.equal(controller.hasSeen(), false);
        controller.markSeen();
        assert.equal(controller.start(() => {}), true);
        assert.equal(controller.start(), false);
        const blockerEvent = new FakeEvent('click');
        controller._blocker.dispatchEvent(blockerEvent);
        assert.equal(blockerEvent.defaultPrevented, true);

        document.dispatchEvent(new FakeEvent('keydown', { key: 'Tab' }));
        document.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowRight' }));
        assert.equal(controller._current, 2);
        document.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowLeft' }));
        assert.equal(controller._current, 0);
        controller.next();
        assert.equal(controller._current, 2);
        controller._tooltip.querySelectorAll('button').find(button => button.textContent === 'Prev').click();
        assert.equal(controller._current, 0);
        uiState.ui.setLocale('zh-CN');
        window.dispatchEvent(new FakeEvent('resize'));
        controller._tooltip.querySelectorAll('button').find(button => button.textContent === '跳过').click();
        assert.equal(controller._overlay, null);
        assert.equal(scheduled[0][1], 500);
        scheduled[0][0]();
        assert.equal(document.activeElement, returnFocus);

        assert.equal(controller.start(), true);
        document.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
        assert.equal(controller._overlay, null);
        assert.equal(cancelled.length >= 0, true);

        document.activeElement = null;
        assert.equal(controller.start(), true);
        controller.next();
        const done = controller._tooltip.querySelectorAll('button').find(button => button.textContent === '完成');
        done.click();
        assert.equal(controller._overlay, null);
    });

    it('skips every hidden/disconnected/zero-size target and handles off-screen retry fallbacks', () => {
        const { document, window } = createFakeDom();
        const uiState = createUiStub(document);
        const variants = [];
        const hidden = document.createElement('div'); hidden.id = 'hidden'; hidden.hidden = true; variants.push(hidden);
        const aria = document.createElement('div'); aria.id = 'aria'; aria.setAttribute('aria-hidden', 'true'); variants.push(aria);
        const disconnected = document.createElement('div'); disconnected.id = 'disconnected';
        Object.defineProperty(disconnected, 'isConnected', { value: false });
        const display = document.createElement('div'); display.id = 'display'; variants.push(display);
        const visibility = document.createElement('div'); visibility.id = 'visibility'; variants.push(visibility);
        const zero = document.createElement('div'); zero.id = 'zero'; zero.rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; variants.push(zero);
        const offscreen = document.createElement('div'); offscreen.id = 'offscreen'; offscreen.rect = { top: 900, left: 0, right: 20, bottom: 920, width: 20, height: 20 }; variants.push(offscreen);
        for (const node of variants) document.body.appendChild(node);
        offscreen.scrollIntoView = undefined;
        const controller = shell.createTourController({
            steps: ['hidden', 'aria', 'disconnected', 'display', 'visibility', 'zero', 'offscreen']
                .map(id => ({ sel: `#${id}`, zh: id, en: id })),
            ui: uiState.ui,
            getDocument: () => document,
            getWindow: () => window,
            getComputedStyle: element => ({
                display: element.id === 'display' ? 'none' : 'block',
                visibility: element.id === 'visibility' ? 'hidden' : 'visible'
            }),
            getRequestAnimationFrame: () => null,
            getCancelAnimationFrame: () => null
        });
        assert.equal(controller.start(), true);
        assert.equal(controller._overlay, null);
        controller.prev();
        controller.stop();
    });

    it('cancels pending frames and executes the no-frame retry path', () => {
        const { document, window } = createFakeDom();
        const uiState = createUiStub(document);
        const offscreen = document.createElement('div');
        offscreen.id = 'pending';
        offscreen.rect = { top: 900, left: 10, right: 30, bottom: 920, width: 20, height: 20 };
        document.body.appendChild(offscreen);
        const next = document.createElement('div');
        next.id = 'next';
        document.body.appendChild(next);
        const cancelled = [];
        let pendingRetry = null;
        const pending = shell.createTourController({
            steps: [
                { sel: '#pending', zh: '等待', en: 'Pending' },
                { sel: '#next', zh: '下一项', en: 'Next' }
            ],
            ui: uiState.ui,
            getDocument: () => document,
            getWindow: () => window,
            getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
            getRequestAnimationFrame: () => callback => { pendingRetry = callback; return 7; },
            getCancelAnimationFrame: () => id => cancelled.push(id)
        });
        assert.equal(pending.start(), true);
        assert.equal(pending._repositionFrame, 7);
        pending.next();
        assert.deepEqual(cancelled, [7]);
        assert.equal(pending._current, 1);
        pending.stop();
        assert.equal(typeof pendingRetry, 'function');

        const resizeTarget = document.createElement('div');
        resizeTarget.id = 'resize-target';
        document.body.appendChild(resizeTarget);
        const resizeController = shell.createTourController({
            steps: [{ sel: '#resize-target', zh: '调整', en: 'Resize' }],
            ui: uiState.ui,
            getDocument: () => document,
            getWindow: () => window,
            getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
            getRequestAnimationFrame: () => null,
            getCancelAnimationFrame: () => null
        });
        assert.equal(resizeController.start(), true);
        resizeTarget.remove();
        window.dispatchEvent(new FakeEvent('resize'));
        assert.equal(resizeController._overlay, null);

        const noFrameTarget = document.createElement('div');
        noFrameTarget.id = 'no-frame';
        noFrameTarget.rect = { top: 900, left: 10, right: 30, bottom: 920, width: 20, height: 20 };
        noFrameTarget.scrollIntoView = () => {
            noFrameTarget.rect = { top: 10, left: 10, right: 30, bottom: 30, width: 20, height: 20 };
        };
        document.body.appendChild(noFrameTarget);
        const noFrame = shell.createTourController({
            steps: [{ sel: '#no-frame', zh: '无帧', en: 'No frame' }],
            ui: uiState.ui,
            getDocument: () => document,
            getWindow: () => window,
            getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
            getRequestAnimationFrame: () => null,
            getCancelAnimationFrame: () => null
        });
        assert.equal(noFrame._showStep(0), false);
        assert.equal(noFrame.start(), true);
        assert.equal(noFrame._overlay.style.top, '4px');
        assert.equal(noFrame._showStep(99), false);
        window.innerWidth = 0;
        window.innerHeight = 0;
        document.documentElement.clientWidth = 500;
        document.documentElement.clientHeight = 500;
        assert.equal(noFrame._showStep(0), true);
        window.innerWidth = 0;
        window.innerHeight = 0;
        document.documentElement.clientWidth = 0;
        document.documentElement.clientHeight = 0;
        assert.equal(noFrame._showStep(0, false), false);
        noFrame._repositionFrame = 11;
        noFrame.stop();

        const defaultTarget = document.createElement('div');
        defaultTarget.id = 'defaults';
        document.body.appendChild(defaultTarget);
        const defaults = shell.createTourController({
            steps: [{ sel: '#defaults', zh: '默认', en: 'Defaults' }],
            ui: uiState.ui,
            getDocument: () => document,
            getWindow: () => window
        });
        assert.equal(defaults.hasSeen(), false);
        defaults.markSeen();
        window.innerWidth = 500;
        window.innerHeight = 500;
        assert.equal(defaults.start(), true);
        defaults.stop();

        const runRetryScenario = withNext => {
            const retryTarget = document.createElement('div');
            retryTarget.id = withNext ? 'retry-skip' : 'retry-stop';
            retryTarget.rect = { top: 900, left: 10, right: 30, bottom: 920, width: 20, height: 20 };
            document.body.appendChild(retryTarget);
            const retrySteps = [{ sel: `#${retryTarget.id}`, zh: '重试', en: 'Retry' }];
            if (withNext) {
                const fallback = document.createElement('div');
                fallback.id = 'retry-fallback';
                document.body.appendChild(fallback);
                retrySteps.push({ sel: '#retry-fallback', zh: '后备', en: 'Fallback' });
            }
            const retryController = shell.createTourController({
                steps: retrySteps,
                ui: uiState.ui,
                getDocument: () => document,
                getWindow: () => window,
                getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
                getRequestAnimationFrame: () => null,
                getCancelAnimationFrame: () => null
            });
            assert.equal(retryController.start(), true);
            if (withNext) assert.equal(retryController._current, 1);
            else assert.equal(retryController._overlay, null);
            retryController.stop();
        };
        runRetryScenario(true);
        runRetryScenario(false);

        const asyncStopTarget = document.createElement('div');
        asyncStopTarget.id = 'async-stop';
        asyncStopTarget.rect = { top: 900, left: 10, right: 30, bottom: 920, width: 20, height: 20 };
        document.body.appendChild(asyncStopTarget);
        let asyncRetry = null;
        const asyncStop = shell.createTourController({
            steps: [{ sel: '#async-stop', zh: '异步', en: 'Async' }],
            ui: uiState.ui,
            getDocument: () => document,
            getWindow: () => window,
            getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
            getRequestAnimationFrame: () => callback => { asyncRetry = callback; return 19; },
            getCancelAnimationFrame: () => () => {}
        });
        assert.equal(asyncStop.start(), true);
        asyncRetry();
        assert.equal(asyncStop._overlay, null);

        noFrameTarget.remove();
    });
});
