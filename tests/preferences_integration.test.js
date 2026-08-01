const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let preferences;
let defaultModuleExports;
let uiModuleExports;
let nativeUiExports;

before(async () => {
    if (!globalThis.navigator) {
        Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true });
    }
    const root = path.join(__dirname, '..');
    [preferences, defaultModuleExports, uiModuleExports, nativeUiExports] = await Promise.all([
        import(pathToFileURL(path.join(root, 'src', 'features', 'preferences', 'index.js')).href),
        import(pathToFileURL(path.join(root, 'src', 'modules', 'default_model.js')).href),
        import(pathToFileURL(path.join(root, 'src', 'modules', 'ui_tweaks.js')).href),
        import(pathToFileURL(path.join(root, 'src', 'native_ui.js')).href)
    ]);
});

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function flush() {
    return new Promise(resolve => setImmediate(resolve));
}

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function report(statuses = {}) {
    return {
        adapterCapabilities: Object.entries(statuses).map(([id, status]) => ({ id, status }))
    };
}

class FakeRepository {
    constructor(value) {
        this.value = clone(value);
        this.loads = 0;
        this.saves = [];
        this.loadGate = null;
        this.loadError = null;
        this.saveError = null;
        this.saveHook = null;
    }

    async load() {
        this.loads += 1;
        if (this.loadGate) await this.loadGate;
        if (this.loadError) throw this.loadError;
        return clone(this.value);
    }

    async save(value) {
        this.saves.push(clone(value));
        if (this.saveHook) await this.saveHook(value, this.saves.length);
        if (this.saveError) throw this.saveError;
        this.value = clone(value);
        return clone(value);
    }
}

class FakeScheduler {
    constructor() {
        this.next = 1;
        this.callbacks = new Map();
        this.cleared = [];
        this.error = null;
    }

    setInterval(callback) {
        if (this.error) throw this.error;
        const id = this.next++;
        this.callbacks.set(id, callback);
        return id;
    }

    clearInterval(id) {
        this.cleared.push(id);
        this.callbacks.delete(id);
    }

    tick() {
        for (const callback of [...this.callbacks.values()]) callback();
    }
}

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.parentElement = null;
        this.style = {};
        this.attributes = new Map();
        this.listeners = new Map();
        this.id = '';
        this.className = '';
        this.textContent = '';
        this.title = '';
        this.value = '';
        this.type = '';
        this.checked = false;
        this.disabled = false;
        this.selected = false;
        this.htmlFor = '';
        this.clicks = 0;
        this.onClick = null;
    }

    get firstChild() { return this.children[0] || null; }
    get isConnected() { return !!this.parentElement; }

    appendChild(child) {
        child.remove();
        this.children.push(child);
        child.parentElement = this;
        return child;
    }

    remove() {
        if (!this.parentElement) return;
        const index = this.parentElement.children.indexOf(this);
        if (index >= 0) this.parentElement.children.splice(index, 1);
        this.parentElement = null;
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }

    dispatch(type, input = {}) {
        const event = { target: this, ...input };
        for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
        return event;
    }

    click() {
        this.clicks += 1;
        this.onClick?.();
    }
}

class FakeDocument {
    constructor() {
        this.title = 'Google Gemini';
        this.documentElement = new FakeElement('html');
        this.head = new FakeElement('head');
        this.body = new FakeElement('body');
        this.documentElement.appendChild(this.head);
        this.documentElement.appendChild(this.body);
        this.listeners = new Map();
    }

    createElement(tagName) { return new FakeElement(tagName); }

    getElementById(id) {
        const visit = element => {
            if (element.id === id) return element;
            for (const child of element.children) {
                const found = visit(child);
                if (found) return found;
            }
            return null;
        };
        return visit(this.documentElement);
    }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }

    dispatch(type, event = {}) {
        for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    }
}

function defaultAdapter(overrides = {}) {
    const state = {
        url: '/app',
        newChat: true,
        trigger: new FakeElement('button'),
        currentModel: 'flash',
        options: [{ key: 'pro', label: '3 Pro', element: new FakeElement('button'), active: false }],
        statuses: { 'model-picker': 'supported' },
        ...overrides
    };
    return {
        state,
        getCapabilityProbeReport() { return report(state.statuses); },
        getCurrentUrl() { return state.url; },
        isNewChatUrl() { return state.newChat; },
        getModelSwitch() { return state.trigger; },
        detectModelKey() { return state.currentModel; },
        getModelMenuOptions() { return state.options; }
    };
}

function defaultSurface(overrides = {}) {
    const state = {
        indicators: [],
        indicatorCleanups: 0,
        opens: 0,
        activations: [],
        dismissals: [],
        rendered: null,
        ...overrides.state
    };
    return {
        state,
        showModelIndicator(trigger, options) {
            state.indicators.push({ trigger, options });
            return () => { state.indicatorCleanups += 1; };
        },
        openModelMenu(trigger) { state.opens += 1; state.openTrigger = trigger; return true; },
        activate(element) { state.activations.push(element); return !element.disabled; },
        dismissModelMenu(trigger) { state.dismissals.push(trigger); return true; },
        renderModelPreference(container, options) { state.rendered = { container, options }; return 'model-view'; },
        ...overrides
    };
}

function defaultSwitcher(overrides = {}) {
    const state = { calls: [], stops: 0 };
    return {
        state,
        async apply(options) { state.calls.push(options); return { status: 'already-selected', model: options.model }; },
        stop() { state.stops += 1; return true; },
        ...overrides
    };
}

function makeDefaultController(options = {}) {
    const repository = options.repository || new FakeRepository('pro');
    const adapter = options.adapter || defaultAdapter();
    const surface = options.surface || defaultSurface();
    const scheduler = options.scheduler || new FakeScheduler();
    const switcher = options.switcher || defaultSwitcher();
    const logs = [];
    const logger = options.logger === undefined ? {
        info(message, data) { logs.push(['info', message, data]); },
        warn(message, data) { logs.push(['warn', message, data]); }
    } : options.logger;
    const controller = new preferences.DefaultModelPreferenceController({
        repository,
        adapter,
        surface,
        scheduler,
        waitFor: options.waitFor || (async predicate => predicate()),
        logger,
        pollIntervalMs: options.pollIntervalMs === undefined ? 10 : options.pollIntervalMs,
        menuTimeoutMs: options.menuTimeoutMs === undefined ? 20 : options.menuTimeoutMs,
        switcher
    });
    return { controller, repository, adapter, surface, scheduler, switcher, logs };
}

describe('legacy preference persistence and small primitives', () => {
    it('normalizes model and UI schemas without reviving retired Gemini entries', () => {
        assert.deepEqual(preferences.DEFAULT_MODEL_KEYS, ['flash', 'thinking', 'pro']);
        assert.equal(preferences.normalizePreferredModel('flash'), 'flash');
        assert.equal(preferences.normalizePreferredModel('thinking'), 'thinking');
        assert.equal(preferences.normalizePreferredModel('pro'), 'pro');
        assert.equal(preferences.normalizePreferredModel('other'), 'pro');

        const pro = { key: 'pro', label: 'Pro', element: {} };
        const lite = { key: 'flash', label: 'Flash Lite', element: {} };
        const fast = { key: 'flash', label: 'Fast', element: {} };
        assert.equal(preferences.chooseModelOption(null, 'pro'), null);
        assert.equal(preferences.chooseModelOption([{}, pro], 'pro'), pro);
        assert.equal(preferences.chooseModelOption([lite, fast], 'flash'), fast);
        assert.equal(preferences.chooseModelOption([lite], 'flash'), lite);
        assert.equal(preferences.chooseModelOption([{ key: 'flash', element: {} }], 'flash').key, 'flash');
        assert.equal(preferences.chooseModelOption([], 'flash'), null);

        assert.deepEqual(preferences.UI_TWEAK_FEATURE_IDS, [
            'tabTitle', 'ctrlEnter', 'inputCounter', 'chatWidth', 'sidebarWidth'
        ]);
        assert.equal(preferences.uiPreferenceAcceptsValue('chatWidth'), true);
        assert.equal(preferences.uiPreferenceAcceptsValue('tabTitle'), false);
        const normalized = preferences.normalizeUiTweaks({
            tabTitle: { enabled: true },
            ctrlEnter: { enabled: 1 },
            chatWidth: { enabled: true, value: 1200.9 },
            sidebarWidth: { enabled: true, value: 9999 },
            hideGems: { enabled: true }
        });
        assert.deepEqual(normalized, {
            tabTitle: { enabled: true },
            ctrlEnter: { enabled: false },
            inputCounter: { enabled: false },
            chatWidth: { enabled: true, value: 1200 },
            sidebarWidth: { enabled: true, value: 280 }
        });
        assert.equal(Object.hasOwn(normalized, 'hideGems'), false);
        assert.equal(preferences.normalizeUiTweaks({ chatWidth: { value: 399 } }).chatWidth.value, 900);
        assert.equal(preferences.normalizeUiTweaks({ sidebarWidth: { value: '200' } }).sidebarWidth.value, 200);
        assert.deepEqual(preferences.normalizeUiTweaks([]), preferences.normalizeUiTweaks(null));

        assert.equal(preferences.getAdapterCapabilityStatus({
            getCapabilityProbeReport: () => report({ composer: 'degraded' })
        }, 'composer'), 'degraded');
        assert.equal(preferences.getAdapterCapabilityStatus({
            getCapabilityProbeReport: () => ({})
        }, 'composer'), 'unavailable');
    });

    it('polls immediately, later, on timeout, and across predicate failures', async () => {
        for (const config of [
            { setInterval: null, clearInterval() {}, now() {} },
            { setInterval() {}, clearInterval: null, now() {} },
            { setInterval() {}, clearInterval() {}, now: null }
        ]) assert.throws(() => preferences.createPollingWaitFor(config), TypeError);

        const immediate = preferences.createPollingWaitFor();
        assert.equal(await immediate(() => 'ready', 10), 'ready');
        await assert.rejects(immediate(() => { throw new Error('initial'); }, 10), /initial/);

        let callback;
        let now = 0;
        const cleared = [];
        const wait = preferences.createPollingWaitFor({
            setInterval(fn) { callback = fn; return 7; },
            clearInterval(id) { cleared.push(id); },
            now: () => now,
            intervalMs: 1
        });
        let ready = false;
        const later = wait(() => ready && 'later', 10);
        ready = true;
        callback();
        assert.equal(await later, 'later');
        assert.deepEqual(cleared, [7]);

        ready = false;
        now = 0;
        const timeout = wait(() => false, 5);
        now = 5;
        callback();
        await assert.rejects(timeout, /timed out/);

        let calls = 0;
        const failed = wait(() => {
            calls += 1;
            if (calls > 1) throw new Error('later predicate');
            return false;
        }, 5);
        callback();
        await assert.rejects(failed, /later predicate/);

        let defaultClockCallback;
        let defaultClockReady = false;
        const defaultClock = preferences.createPollingWaitFor({
            setInterval(fn) { defaultClockCallback = fn; return 8; },
            clearInterval() {}
        });
        const defaultClockPending = defaultClock(() => defaultClockReady, 1000);
        defaultClockReady = true;
        defaultClockCallback();
        assert.equal(await defaultClockPending, true);
    });

    it('isolates legacy GM storage and repository values, failures, and diagnostics', async () => {
        const noCause = new preferences.PreferencePersistenceError('plain');
        const cause = new Error('cause');
        const withCause = new preferences.PreferencePersistenceError('wrapped', cause);
        assert.equal(noCause.name, 'PreferencePersistenceError');
        assert.equal(Object.hasOwn(noCause, 'cause'), false);
        assert.equal(withCause.cause, cause);

        for (const value of [null, 1, 'global']) {
            assert.throws(() => preferences.createGlobalGmPreferencesStorage(value), TypeError);
        }
        const missing = preferences.createGlobalGmPreferencesStorage({});
        const fallback = { nested: { value: 1 } };
        const loadedFallback = missing.get('key', fallback);
        loadedFallback.nested.value = 9;
        assert.equal(fallback.nested.value, 1);
        assert.throws(() => missing.set('key', {}), preferences.PreferencePersistenceError);

        const calls = [];
        let stored = { value: 2 };
        const gm = preferences.createGlobalGmPreferencesStorage({
            GM_getValue(key, defaultValue) { calls.push(['get', key, defaultValue]); return stored; },
            GM_setValue(key, value) { calls.push(['set', key, value]); stored = value; return 'saved'; }
        });
        const fromGm = gm.get('legacy', fallback);
        fromGm.value = 99;
        assert.equal(stored.value, 2);
        const input = { value: 3 };
        assert.equal(gm.set('legacy', input), 'saved');
        input.value = 8;
        assert.equal(stored.value, 3);
        assert.equal(calls[0][1], 'legacy');
        assert.notEqual(calls[0][2], fallback);

        const throwingGm = preferences.createGlobalGmPreferencesStorage({
            GM_getValue() { throw new Error('gm read'); },
            GM_setValue() { throw new Error('gm write'); }
        });
        assert.throws(() => throwingGm.get('x', null), /gm read/);

        const storage = {
            value: { enabled: true },
            async get() { return clone(this.value); },
            async set(_key, value) { this.value = clone(value); }
        };
        for (const options of [
            { key: '', storage, defaultValue: {}, normalize: value => value },
            { key: 'x', storage: null, defaultValue: {}, normalize: value => value },
            { key: 'x', storage: { get() {} }, defaultValue: {}, normalize: value => value },
            { key: 'x', storage, defaultValue: {}, normalize: null },
            { key: 'x', storage, defaultValue: {}, normalize: value => value, onReadError: null }
        ]) assert.throws(() => preferences.createLegacyPreferenceRepository(options), TypeError);

        const repository = preferences.createLegacyPreferenceRepository({
            key: 'legacy', storage, defaultValue: { enabled: false },
            normalize: value => ({ enabled: value?.enabled === true })
        });
        assert.deepEqual(repository.scope, { kind: 'global', readOnly: false });
        assert.equal(repository.key, 'legacy');
        const loaded = await repository.load();
        loaded.enabled = false;
        assert.equal(storage.value.enabled, true);
        const saved = await repository.save({ enabled: true, extra: true });
        saved.enabled = false;
        assert.deepEqual(storage.value, { enabled: true });
        storage.value = null;
        assert.deepEqual(await repository.load(), { enabled: false });

        let diagnostic = 0;
        const fallbackRepository = preferences.createLegacyPreferenceRepository({
            key: 'fallback',
            storage: { get() { throw new Error('read'); }, set() {} },
            defaultValue: 'pro',
            normalize: preferences.normalizePreferredModel,
            onReadError() { diagnostic += 1; throw new Error('diagnostic'); }
        });
        assert.equal(await fallbackRepository.load(), 'pro');
        assert.equal(diagnostic, 1);

        const normalizeFallback = preferences.createLegacyPreferenceRepository({
            key: 'normalize',
            storage: { get() { return 'bad'; }, set() {} },
            defaultValue: 'good',
            normalize(value) { if (value === 'bad') throw new Error('bad value'); return value; }
        });
        assert.equal(await normalizeFallback.load(), 'good');

        const failedSave = preferences.createLegacyPreferenceRepository({
            key: 'failed',
            storage: { get() {}, set() { throw new Error('write'); } },
            defaultValue: 'pro',
            normalize: value => value
        });
        await assert.rejects(failedSave.save('flash'), error => (
            error instanceof preferences.PreferencePersistenceError && error.cause.message === 'write'
        ));
    });
});

describe('default model capability and controller', () => {
    it('validates switcher collaborators and handles every safe switch outcome', async () => {
        const adapter = defaultAdapter();
        const surface = defaultSurface();
        const requiredAdapter = ['getCapabilityProbeReport', 'getModelSwitch', 'detectModelKey', 'getModelMenuOptions'];
        for (const missingMethod of requiredAdapter) {
            const broken = { ...adapter };
            delete broken[missingMethod];
            assert.throws(() => new preferences.DefaultModelSwitcher({
                adapter: broken, surface, waitFor() {}
            }), TypeError);
        }
        for (const missingMethod of ['openModelMenu', 'activate', 'dismissModelMenu']) {
            const broken = { ...surface };
            delete broken[missingMethod];
            assert.throws(() => new preferences.DefaultModelSwitcher({
                adapter, surface: broken, waitFor() {}
            }), TypeError);
        }
        assert.throws(() => new preferences.DefaultModelSwitcher({ adapter, surface, waitFor: null }), TypeError);
        for (const value of [0, -1, NaN]) {
            assert.throws(() => new preferences.DefaultModelSwitcher({
                adapter, surface, waitFor() {}, menuTimeoutMs: value
            }), RangeError);
        }

        const create = (adapterOverrides = {}, surfaceOverrides = {}, waitFor = async predicate => predicate()) => {
            const currentAdapter = defaultAdapter(adapterOverrides);
            const currentSurface = defaultSurface(surfaceOverrides);
            const logs = [];
            const switcher = new preferences.DefaultModelSwitcher({
                adapter: currentAdapter,
                surface: currentSurface,
                waitFor,
                logger: {
                    info(message, data) { logs.push(['info', message, data]); },
                    warn(message, data) { logs.push(['warn', message, data]); }
                },
                menuTimeoutMs: 10
            });
            return { switcher, adapter: currentAdapter, surface: currentSurface, logs };
        };

        const invalidGuard = create();
        await assert.rejects(invalidGuard.switcher.apply({ model: 'pro', isCurrent: null }), TypeError);

        const unavailable = create({ statuses: { 'model-picker': 'unavailable' } });
        assert.equal((await unavailable.switcher.apply({ model: 'pro', isCurrent: () => true })).status, 'capability-unavailable');

        const cancelledEarly = create();
        assert.equal((await cancelledEarly.switcher.apply({ model: 'pro', isCurrent: () => false })).status, 'cancelled');

        const already = create({ currentModel: 'pro' });
        assert.deepEqual(await already.switcher.apply({ model: 'pro', isCurrent: () => true }), {
            status: 'already-selected', model: 'pro'
        });

        const triggerUnavailable = create({}, { openModelMenu() { return false; } });
        assert.equal((await triggerUnavailable.switcher.apply({ model: 'pro', isCurrent: () => true })).status, 'trigger-unavailable');

        let guardCalls = 0;
        const cancelledMenu = create();
        assert.equal((await cancelledMenu.switcher.apply({
            model: 'pro', isCurrent: () => ++guardCalls === 1
        })).status, 'cancelled');
        assert.equal(cancelledMenu.surface.state.dismissals.length, 1);

        const noOption = create({ options: [{ key: 'flash', label: 'Fast', element: {} }] });
        assert.equal((await noOption.switcher.apply({ model: 'pro', isCurrent: () => true })).status, 'option-unavailable');

        const disabledElement = new FakeElement('button');
        disabledElement.disabled = true;
        const disabled = create({ options: [{ key: 'pro', label: 'Pro', element: disabledElement }] });
        assert.equal((await disabled.switcher.apply({ model: 'pro', isCurrent: () => true })).status, 'option-disabled');

        const active = create({ options: [{ key: 'pro', label: 'Pro', element: {}, active: true }] });
        assert.equal((await active.switcher.apply({ model: 'pro', isCurrent: () => true })).status, 'already-selected');
        assert.equal(active.surface.state.dismissals.length, 1);

        const applied = create();
        assert.deepEqual(await applied.switcher.apply({ model: 'pro', isCurrent: () => true }), {
            status: 'applied', from: 'flash', model: 'pro'
        });
        assert.equal(applied.surface.state.activations.length, 1);
        assert.equal(applied.logs[0][0], 'info');
        assert.equal(applied.switcher.stop(), false);

        const failedEarly = create({}, {}, async () => { throw new Error('wait failed'); });
        assert.equal((await failedEarly.switcher.apply({ model: 'pro', isCurrent: () => true })).status, 'failed');
        assert.equal(failedEarly.logs[0][0], 'warn');

        let waits = 0;
        const failedAfterOpen = create({}, {}, async predicate => {
            waits += 1;
            if (waits === 2) throw new Error('options failed');
            return predicate();
        });
        assert.equal((await failedAfterOpen.switcher.apply({ model: 'pro', isCurrent: () => true })).status, 'failed');
        assert.equal(failedAfterOpen.surface.state.dismissals.length, 1);

        const gate = deferred();
        waits = 0;
        let alive = true;
        const stopped = create({}, {}, async predicate => {
            waits += 1;
            if (waits === 2) return gate.promise;
            return predicate();
        });
        const pending = stopped.switcher.apply({ model: 'pro', isCurrent: () => alive });
        await flush();
        alive = false;
        assert.equal(stopped.switcher.stop(), true);
        gate.resolve(stopped.adapter.state.options);
        assert.equal((await pending).status, 'cancelled');
        assert.equal(stopped.surface.state.dismissals.length, 1);

        const silent = new preferences.DefaultModelSwitcher({
            adapter: defaultAdapter({ currentModel: 'pro' }), surface: defaultSurface(),
            waitFor: async predicate => predicate(), logger: {}, menuTimeoutMs: 10
        });
        assert.equal((await silent.apply({ model: 'pro', isCurrent: () => true })).status, 'already-selected');
        const silentApplied = new preferences.DefaultModelSwitcher({
            adapter: defaultAdapter(), surface: defaultSurface(),
            waitFor: async predicate => predicate(), logger: {}, menuTimeoutMs: 10
        });
        assert.equal((await silentApplied.apply({ model: 'pro', isCurrent: () => true })).status, 'applied');
        const silentFailed = new preferences.DefaultModelSwitcher({
            adapter: defaultAdapter(), surface: defaultSurface(),
            waitFor: async () => { throw new Error('silent'); }, logger: {}, menuTimeoutMs: 10
        });
        assert.equal((await silentFailed.apply({ model: 'pro', isCurrent: () => true })).status, 'failed');

        let emptyWaits = 0;
        const delayedOptionsAdapter = defaultAdapter({ options: [] });
        const delayedOptionsSurface = defaultSurface();
        let delayedSwitcher;
        delayedSwitcher = new preferences.DefaultModelSwitcher({
            adapter: delayedOptionsAdapter,
            surface: delayedOptionsSurface,
            waitFor: async predicate => {
                emptyWaits += 1;
                if (emptyWaits === 1) return predicate();
                assert.equal(predicate(), null);
                delayedOptionsAdapter.state.options = [{ key: 'pro', label: 'Pro', element: {} }];
                return predicate();
            },
            menuTimeoutMs: 10
        });
        assert.equal((await delayedSwitcher.apply({ model: 'pro', isCurrent: () => true })).status, 'applied');
    });

    it('validates controller ports and makes start/stop/start race-free', async () => {
        const base = makeDefaultController();
        const args = {
            repository: base.repository,
            adapter: base.adapter,
            surface: base.surface,
            scheduler: base.scheduler,
            waitFor: async predicate => predicate(),
            switcher: base.switcher
        };
        for (const key of ['repository', 'adapter', 'surface', 'scheduler']) {
            assert.throws(() => new preferences.DefaultModelPreferenceController({ ...args, [key]: null }), TypeError);
        }
        assert.throws(() => new preferences.DefaultModelPreferenceController({ ...args, waitFor: null }), TypeError);
        assert.throws(() => new preferences.DefaultModelPreferenceController({ ...args, switcher: {} }), TypeError);
        for (const value of [0, -1, NaN]) {
            assert.throws(() => new preferences.DefaultModelPreferenceController({ ...args, pollIntervalMs: value }), RangeError);
        }

        const gate = deferred();
        const concurrent = makeDefaultController();
        concurrent.repository.loadGate = gate.promise;
        const first = concurrent.controller.start();
        assert.equal(concurrent.controller.start(), first);
        const stopping = concurrent.controller.stop();
        gate.resolve();
        await Promise.all([first, stopping]);
        assert.equal(concurrent.controller.active, false);
        assert.equal(concurrent.scheduler.callbacks.size, 0);

        await concurrent.controller.start();
        assert.equal(concurrent.controller.active, true);
        assert.equal((await concurrent.controller.start()).id, 'preferences.default-model');
        await concurrent.controller.stop();
        await concurrent.controller.stop();
        assert.equal(concurrent.switcher.state.stops, 1);

        const failedStart = makeDefaultController();
        failedStart.scheduler.error = new Error('timer');
        await assert.rejects(failedStart.controller.start(), /timer/);
        assert.equal(failedStart.controller.active, false);
        assert.equal(failedStart.surface.state.indicatorCleanups, 1);
        assert.equal(failedStart.switcher.state.stops, 1);
    });

    it('coordinates indicators, routes, settings, persistence, and deduplicated switches', async () => {
        const setup = makeDefaultController();
        setup.adapter.state.newChat = false;
        await setup.controller.start();
        assert.equal(setup.controller.capability.id, 'preferences.default-model');
        assert.equal(setup.controller.capability.get(), 'pro');
        assert.equal(await setup.controller.capability.set('thinking'), 'thinking');
        assert.equal((await setup.controller.capability.apply()).status, 'not-new-chat');
        assert.equal(setup.controller.capability.status().active, true);
        assert.deepEqual(setup.controller.getStatus(), {
            active: true, preferredModel: 'thinking', modelPicker: 'supported', switching: false
        });
        assert.equal(setup.surface.state.indicators.length, 2);
        assert.equal(setup.controller.refreshIndicator(), true);
        assert.equal(setup.surface.state.indicatorCleanups, 1);
        setup.controller.removeIndicator();
        assert.equal(setup.surface.state.indicatorCleanups, 2);

        assert.equal(setup.controller.renderSettings('container'), 'model-view');
        assert.deepEqual(setup.surface.state.rendered.options.options, ['flash', 'thinking', 'pro']);
        assert.equal(await setup.surface.state.rendered.options.onChange('invalid'), 'pro');
        assert.equal(setup.repository.saves.at(-1), 'pro');
        assert.equal((await setup.controller.applyToCurrentNewChat()).status, 'not-new-chat');

        setup.adapter.state.statuses = { 'model-picker': 'unavailable' };
        assert.equal(setup.controller.refreshIndicator(), false);
        setup.adapter.state.statuses = { 'model-picker': 'supported' };
        setup.adapter.state.trigger = null;
        assert.equal(setup.controller.refreshIndicator(), false);
        setup.adapter.state.trigger = new FakeElement('button');
        setup.surface.showModelIndicator = () => { throw new Error('indicator'); };
        assert.equal(setup.controller.refreshIndicator(), false);
        assert.equal(setup.logs.at(-1)[0], 'warn');

        setup.adapter.state.url = '/other';
        setup.scheduler.tick();
        assert.equal(setup.controller._route, '/other');
        setup.scheduler.tick();
        setup.adapter.state.newChat = true;
        setup.adapter.state.url = '/app/new';
        setup.scheduler.tick();
        await setup.controller.whenIdle();
        assert.equal(setup.switcher.state.calls.length, 1);
        assert.equal((await setup.controller.applyToCurrentNewChat()).status, 'already-applied');
        assert.equal(setup.controller.onSessionChange(), true);
        await setup.controller.whenIdle();
        await setup.controller.stop();
        setup.controller._checkRoute();
        assert.equal(setup.controller.onSessionChange(), false);
        assert.equal((await setup.controller.applyToCurrentNewChat()).status, 'inactive');

        const failedSave = makeDefaultController();
        failedSave.repository.saveError = new Error('save');
        await assert.rejects(failedSave.controller.setPreferredModel('flash'), /save/);

        const noLogger = makeDefaultController({ logger: {} });
        noLogger.adapter.state.newChat = false;
        await noLogger.controller.start();
        await noLogger.controller.stop();

        const noWarn = makeDefaultController({ logger: {} });
        noWarn.adapter.state.newChat = false;
        await noWarn.controller.start();
        noWarn.surface.showModelIndicator = () => { throw new Error('silent indicator'); };
        noWarn.adapter.state.trigger = new FakeElement('button');
        assert.equal(noWarn.controller.refreshIndicator(), false);
        await noWarn.controller.stop();
    });

    it('shares an in-flight switch, snapshots its model, and follows only a changed preference', async () => {
        const gate = deferred();
        let calls = 0;
        const switcher = defaultSwitcher({
            apply({ model }) {
                calls += 1;
                if (calls === 1) return gate.promise.then(() => ({ status: 'applied', model, from: 'flash' }));
                return Promise.resolve({ status: 'already-selected', model });
            }
        });
        const setup = makeDefaultController({ switcher });
        setup.adapter.state.newChat = false;
        await setup.controller.start();
        setup.adapter.state.newChat = true;
        const first = setup.controller.applyToCurrentNewChat();
        assert.equal(setup.controller.applyToCurrentNewChat(), first);
        await setup.controller.setPreferredModel('flash');
        gate.resolve();
        assert.equal((await first).model, 'pro');
        await setup.controller.whenIdle();
        assert.equal(calls, 2);
        assert.equal(switcher.state.calls?.length || 0, 0);

        const throwing = defaultSwitcher({ apply() { throw new Error('switch exploded'); } });
        const background = makeDefaultController({ switcher: throwing });
        await background.controller.start();
        await background.controller.whenIdle();
        assert.equal(background.logs.some(entry => entry[0] === 'warn'), true);

        const pendingGate = deferred();
        const pendingSwitcher = defaultSwitcher({ apply() { return pendingGate.promise; } });
        const cancelled = makeDefaultController({ switcher: pendingSwitcher });
        cancelled.adapter.state.newChat = false;
        await cancelled.controller.start();
        cancelled.adapter.state.newChat = true;
        const pending = cancelled.controller.applyToCurrentNewChat();
        await cancelled.controller.stop();
        pendingGate.resolve({ status: 'cancelled' });
        assert.equal((await pending).status, 'cancelled');

        const idleGate = deferred();
        const idleSwitcher = defaultSwitcher({
            apply({ isCurrent }) { assert.equal(isCurrent(), true); return idleGate.promise; }
        });
        const idling = makeDefaultController({ switcher: idleSwitcher });
        idling.adapter.state.newChat = false;
        await idling.controller.start();
        idling.adapter.state.newChat = true;
        const direct = idling.controller.applyToCurrentNewChat();
        const idle = idling.controller.whenIdle();
        idling.adapter.state.newChat = false;
        idleGate.resolve({ status: 'cancelled' });
        await Promise.all([direct, idle]);
        await idling.controller.stop();
    });
});

function uiAdapter(overrides = {}) {
    const state = {
        statuses: { composer: 'supported', title: 'supported' },
        inputArea: new FakeElement('div'),
        editor: new FakeElement('textarea'),
        sendButton: new FakeElement('button'),
        insideEditor: true,
        titleText: 'A chat',
        insideMain: true,
        sidebar: new FakeElement('aside'),
        chatTarget: new FakeElement('main'),
        ...overrides
    };
    state.editor.value = state.editor.value || 'hello';
    return {
        state,
        getCapabilityProbeReport() { return report(state.statuses); },
        getInputArea() { return state.inputArea; },
        getInputEditor() { return state.editor; },
        getSendButton() { return state.sendButton; },
        isInsideInputEditor() { return state.insideEditor; },
        getChatTitleText() { return state.titleText; },
        isInsideMainChatArea() { return state.insideMain; },
        getSidebar() { return state.sidebar; },
        getChatWidthTarget() { return state.chatTarget; }
    };
}

function uiSurface(overrides = {}) {
    const state = {
        title: 'Google Gemini',
        keyHandler: null,
        keyCleanups: 0,
        activations: [],
        mounted: [],
        counters: [],
        composerDestroys: 0,
        widths: [],
        widthCleanups: 0,
        rendered: null,
        ...overrides.state
    };
    return {
        state,
        translate(_zh, en) { return en; },
        locale() { return 'en'; },
        getTitle() { return state.title; },
        setTitle(value) { state.title = value; },
        listenKeydown(handler) {
            state.keyHandler = handler;
            return () => { state.keyCleanups += 1; state.keyHandler = null; };
        },
        activate(element) { state.activations.push(element); return true; },
        mountComposerStatus(host, options) {
            state.mounted.push({ host, options });
            return {
                setCounter(value) { state.counters.push(value); },
                destroy() { state.composerDestroys += 1; }
            };
        },
        applyWidths(options) {
            state.widths.push(options);
            return () => { state.widthCleanups += 1; };
        },
        renderUiPreferences(container, options) {
            state.rendered = { container, options };
            return 'ui-view';
        },
        ...overrides
    };
}

function uiWatcher() {
    const state = { registrations: new Map(), unregistered: [] };
    return {
        state,
        register(id, options) { state.registrations.set(id, options); },
        unregister(id) { state.unregistered.push(id); state.registrations.delete(id); }
    };
}

function keyboardEvent(overrides = {}) {
    const calls = [];
    return {
        key: 'Enter',
        target: {},
        isComposing: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault() { calls.push('preventDefault'); },
        stopPropagation() { calls.push('stopPropagation'); },
        stopImmediatePropagation() { calls.push('stopImmediatePropagation'); },
        calls,
        ...overrides
    };
}

function coordinatorCapability(name) {
    const state = { name, calls: [], applyError: null };
    return {
        state,
        begin() { state.calls.push(['begin']); },
        apply(value) { state.calls.push(['apply', clone(value)]); if (state.applyError) throw state.applyError; return true; },
        refresh(value) { state.calls.push(['refresh', clone(value)]); return true; },
        removeNativeUi() { state.calls.push(['remove']); },
        stop(value) { state.calls.push(['stop', value]); }
    };
}

function makeUiController(options = {}) {
    const repository = options.repository || new FakeRepository(preferences.normalizeUiTweaks(null));
    const adapter = options.adapter || uiAdapter();
    const surface = options.surface || uiSurface();
    const layout = options.layout || coordinatorCapability('layout');
    const title = options.title || coordinatorCapability('title');
    const composer = options.composer || coordinatorCapability('composer');
    const logs = [];
    const logger = options.logger === undefined ? {
        info(message, data) { logs.push(['info', message, data]); },
        warn(message, data) { logs.push(['warn', message, data]); }
    } : options.logger;
    const controller = new preferences.UiTweaksPreferenceController({
        repository, adapter, surface, watcher: options.watcher || uiWatcher(),
        formatInputStats: options.formatter || (() => 'stats'), logger,
        titleDebounceMs: 5, layout, title, composer
    });
    return { controller, repository, adapter, surface, layout, title, composer, logs };
}

describe('UI preference capabilities and controller', () => {
    it('applies and restores layout widths without host-wide CSS', () => {
        const adapter = uiAdapter();
        const surface = uiSurface();
        for (const missing of ['getSidebar', 'getChatWidthTarget']) {
            const broken = { ...adapter };
            delete broken[missing];
            assert.throws(() => new preferences.UiLayoutPreference({ adapter: broken, surface }), TypeError);
        }
        assert.throws(() => new preferences.UiLayoutPreference({ adapter, surface: {} }), TypeError);
        const layout = new preferences.UiLayoutPreference({ adapter, surface });
        const off = preferences.normalizeUiTweaks(null);
        assert.equal(layout.apply(off), false);
        layout.stop();
        const chat = preferences.normalizeUiTweaks({ chatWidth: { enabled: true, value: 1000 } });
        assert.equal(layout.apply(chat), true);
        assert.equal(surface.state.widths.at(-1).chatTarget, adapter.state.chatTarget);
        assert.equal(surface.state.widths.at(-1).sidebarTarget, null);
        const both = preferences.normalizeUiTweaks({
            chatWidth: { enabled: true, value: 1200 },
            sidebarWidth: { enabled: true, value: 300 }
        });
        assert.equal(layout.apply(both), true);
        assert.equal(surface.state.widthCleanups, 1);
        assert.equal(surface.state.widths.at(-1).sidebarTarget, adapter.state.sidebar);
        const sidebarOnly = preferences.normalizeUiTweaks({ sidebarWidth: { enabled: true, value: 320 } });
        assert.equal(layout.apply(sidebarOnly), true);
        assert.equal(surface.state.widths.at(-1).chatTarget, null);
        assert.equal(surface.state.widths.at(-1).chatWidth, null);
        layout.stop();
        assert.equal(surface.state.widthCleanups, 3);

        const badSurface = uiSurface({ applyWidths() { return null; } });
        const badLayout = new preferences.UiLayoutPreference({ adapter, surface: badSurface });
        assert.throws(() => badLayout.apply(chat), /cleanup function/);
    });

    it('owns title updates, mutation routing, and conservative restoration', () => {
        const adapter = uiAdapter();
        const surface = uiSurface();
        const watcher = uiWatcher();
        for (const missing of ['getCapabilityProbeReport', 'getChatTitleText', 'isInsideMainChatArea']) {
            const broken = { ...adapter };
            delete broken[missing];
            assert.throws(() => new preferences.UiTitlePreference({ adapter: broken, surface, watcher }), TypeError);
        }
        for (const missing of ['getTitle', 'setTitle']) {
            const broken = { ...surface };
            delete broken[missing];
            assert.throws(() => new preferences.UiTitlePreference({ adapter, surface: broken, watcher }), TypeError);
        }
        assert.throws(() => new preferences.UiTitlePreference({ adapter, surface, watcher: {} }), TypeError);
        for (const debounceMs of [-1, NaN]) {
            assert.throws(() => new preferences.UiTitlePreference({ adapter, surface, watcher, debounceMs }), RangeError);
        }

        const title = new preferences.UiTitlePreference({ adapter, surface, watcher, debounceMs: 7 });
        title.begin();
        adapter.state.titleText = '';
        assert.equal(title.apply(true), true);
        assert.equal(title.update(), false);
        adapter.state.titleText = 'Short title';
        assert.equal(title.update(), true);
        assert.equal(surface.state.title, 'Short title - Gemini');
        assert.equal(title.update(), true);
        adapter.state.titleText = 'x'.repeat(50);
        watcher.state.registrations.get(title.watcherId).callback();
        assert.equal(surface.state.title, `${'x'.repeat(50)}... - Gemini`);
        const match = watcher.state.registrations.get(title.watcherId).match;
        assert.equal(match({ type: 'characterData' }), true);
        assert.equal(match({ type: 'attributes' }), false);
        assert.equal(match({ type: 'childList', target: null }), true);
        assert.equal(match({ type: 'childList', target: {} }), true);
        adapter.state.insideMain = false;
        assert.equal(match({ type: 'childList', target: { closest() {} } }), false);
        adapter.state.insideMain = true;
        assert.equal(match({ type: 'childList', target: { closest() {} } }), true);

        title.stop(false);
        assert.match(surface.state.title, /Gemini$/);
        title.apply(false);
        assert.equal(surface.state.title, 'Google Gemini');
        title.begin();
        adapter.state.titleText = 'Owned';
        title.apply(true);
        surface.state.title = 'Host changed';
        title.restore();
        assert.equal(surface.state.title, 'Host changed');

        adapter.state.statuses.title = 'unavailable';
        title.begin();
        assert.equal(title.apply(true), false);
        title.stop();
    });

    it('contains shortcut and input statistics inside the current composer', () => {
        const adapter = uiAdapter();
        const surface = uiSurface();
        for (const missing of [
            'getCapabilityProbeReport', 'getInputArea', 'getInputEditor', 'getSendButton', 'isInsideInputEditor'
        ]) {
            const broken = { ...adapter };
            delete broken[missing];
            assert.throws(() => new preferences.UiComposerPreference({
                adapter: broken, surface, formatInputStats() {}
            }), TypeError);
        }
        for (const missing of ['translate', 'locale', 'listenKeydown', 'activate', 'mountComposerStatus']) {
            const broken = { ...surface };
            delete broken[missing];
            assert.throws(() => new preferences.UiComposerPreference({
                adapter, surface: broken, formatInputStats() {}
            }), TypeError);
        }
        assert.throws(() => new preferences.UiComposerPreference({ adapter, surface, formatInputStats: null }), TypeError);

        const formatted = [];
        const composer = new preferences.UiComposerPreference({
            adapter, surface,
            formatInputStats(text, options) { formatted.push([text, options]); return `${text.length} chars`; }
        });
        const off = preferences.normalizeUiTweaks(null);
        assert.equal(composer.apply(off), false);
        const enabled = preferences.normalizeUiTweaks({
            ctrlEnter: { enabled: true }, inputCounter: { enabled: true }
        });
        assert.equal(composer.apply(enabled), true);
        assert.equal(composer.apply(enabled), true);
        assert.equal(surface.state.mounted.length, 1);
        assert.equal(surface.state.counters.at(-1), '5 chars');
        assert.deepEqual(formatted.at(-1), ['hello', { locale: 'en' }]);

        const ignoreKey = keyboardEvent({ key: 'Escape' });
        surface.state.keyHandler(ignoreKey);
        adapter.state.insideEditor = false;
        surface.state.keyHandler(keyboardEvent());
        adapter.state.insideEditor = true;
        surface.state.keyHandler(keyboardEvent({ isComposing: true }));
        const plain = keyboardEvent();
        surface.state.keyHandler(plain);
        assert.deepEqual(plain.calls, ['stopPropagation', 'stopImmediatePropagation']);
        const ctrl = keyboardEvent({ ctrlKey: true });
        surface.state.keyHandler(ctrl);
        assert.deepEqual(ctrl.calls, ['preventDefault', 'stopPropagation', 'stopImmediatePropagation']);
        assert.equal(surface.state.activations.at(-1), adapter.state.sendButton);
        const meta = keyboardEvent({ metaKey: true });
        adapter.state.sendButton = null;
        surface.state.keyHandler(meta);
        adapter.state.sendButton = new FakeElement('button');
        adapter.state.sendButton.disabled = true;
        surface.state.keyHandler(keyboardEvent({ ctrlKey: true }));

        adapter.state.editor.value = 'updated';
        adapter.state.editor.dispatch('input');
        assert.equal(surface.state.counters.at(-1), '7 chars');
        composer.removeNativeUi();
        composer.removeNativeUi();
        assert.equal(surface.state.composerDestroys, 1);

        composer._composerHandle = { setCounter(value) { surface.state.counters.push(value); }, destroy() {} };
        composer._editor = { value: '' };
        assert.equal(composer._updateCounter(), true);
        assert.equal(surface.state.counters.at(-1), '0 chars');
        composer._editor = { textContent: '' };
        assert.equal(composer._updateCounter(), true);
        assert.equal(surface.state.counters.at(-1), '0 chars');
        composer.removeNativeUi();
        assert.equal(composer._updateCounter(), false);

        const contentEditable = new FakeElement('div');
        contentEditable.textContent = 'content';
        delete contentEditable.value;
        adapter.state.editor = contentEditable;
        assert.equal(composer.refresh(enabled), true);
        assert.equal(surface.state.counters.at(-1), '7 chars');
        adapter.state.editor = null;
        assert.equal(composer.refresh(enabled), true);
        adapter.state.inputArea = null;
        assert.equal(composer.refresh(enabled), false);
        adapter.state.inputArea = new FakeElement('div');
        adapter.state.statuses.composer = 'unavailable';
        assert.equal(composer.refresh(enabled), false);
        composer.stop();
        composer.stop();

        const noCounterHandle = uiSurface({
            mountComposerStatus() { return { destroy() {} }; }
        });
        assert.throws(() => new preferences.UiComposerPreference({
            adapter: uiAdapter(), surface: noCounterHandle, formatInputStats() {}
        }).refresh(enabled), /invalid handle/);
        const noHandle = uiSurface({ mountComposerStatus() { return null; } });
        assert.throws(() => new preferences.UiComposerPreference({
            adapter: uiAdapter(), surface: noHandle, formatInputStats() {}
        }).refresh(preferences.normalizeUiTweaks({ ctrlEnter: { enabled: true } })), /invalid handle/);

        const inertEditor = { value: 'once' };
        const inertAdapter = uiAdapter({ editor: inertEditor });
        const inertSurface = uiSurface();
        const inert = new preferences.UiComposerPreference({
            adapter: inertAdapter, surface: inertSurface, formatInputStats: text => text
        });
        inert.refresh(preferences.normalizeUiTweaks({ inputCounter: { enabled: true } }));
        assert.equal(inertSurface.state.counters.at(-1), 'once');
        inert.removeNativeUi();
    });

    it('validates the coordinator and keeps lifecycle state transactional', async () => {
        const base = makeUiController();
        const args = {
            repository: base.repository,
            adapter: base.adapter,
            surface: base.surface,
            watcher: uiWatcher(),
            formatInputStats() {},
            layout: base.layout,
            title: base.title,
            composer: base.composer
        };
        for (const key of ['repository', 'adapter', 'surface']) {
            assert.throws(() => new preferences.UiTweaksPreferenceController({ ...args, [key]: null }), TypeError);
        }
        for (const [key, value] of [['layout', {}], ['title', {}], ['composer', {}]]) {
            assert.throws(() => new preferences.UiTweaksPreferenceController({ ...args, [key]: value }), TypeError);
        }

        const gate = deferred();
        const concurrent = makeUiController();
        concurrent.repository.loadGate = gate.promise;
        const first = concurrent.controller.start();
        assert.equal(concurrent.controller.start(), first);
        const stopping = concurrent.controller.stop();
        gate.resolve();
        await Promise.all([first, stopping]);
        assert.equal(concurrent.controller.active, false);

        concurrent.repository.value = preferences.normalizeUiTweaks({
            tabTitle: { enabled: true }, ctrlEnter: { enabled: true },
            inputCounter: { enabled: true }, chatWidth: { enabled: true, value: 1000 }
        });
        assert.equal((await concurrent.controller.start()).id, 'preferences.ui');
        assert.equal((await concurrent.controller.start()).id, 'preferences.ui');
        assert.deepEqual(concurrent.controller.getEnabledIds(), ['tabTitle', 'ctrlEnter', 'inputCounter', 'chatWidth']);
        const copy = concurrent.controller.getConfig();
        copy.tabTitle.enabled = false;
        assert.equal(concurrent.controller.getConfig().tabTitle.enabled, true);
        const labels = concurrent.controller.getLegacyFeatures();
        assert.equal(labels.ctrlEnter.label, 'Ctrl+Enter to send');
        assert.equal(Object.hasOwn(labels, 'hideGems'), false);
        assert.deepEqual(concurrent.controller.getStatus(), {
            active: true,
            enabled: ['tabTitle', 'ctrlEnter', 'inputCounter', 'chatWidth'],
            composer: 'supported',
            title: 'supported'
        });
        assert.equal(concurrent.controller.capability.get().tabTitle.enabled, true);
        assert.equal(concurrent.controller.refreshNativeUi(), true);
        concurrent.controller.removeNativeUi();
        assert.equal(concurrent.controller.reapply(), true);
        assert.equal(concurrent.controller.onSessionChange(), true);
        assert.equal(concurrent.controller.renderSettings('container'), 'ui-view');
        assert.equal(await concurrent.surface.state.rendered.options.onToggle('tabTitle', false).then(v => v.tabTitle.enabled), false);
        assert.equal(await concurrent.surface.state.rendered.options.onValue('chatWidth', 1100).then(v => v.chatWidth.value), 1100);
        assert.equal(await concurrent.controller.toggleFeature('inputCounter').then(v => v.inputCounter.enabled), false);
        assert.equal(await concurrent.controller.capability.setEnabled('ctrlEnter', false).then(v => v.ctrlEnter.enabled), false);
        assert.equal(await concurrent.controller.capability.setValue('sidebarWidth', 333).then(v => v.sidebarWidth.value), 333);
        const replacement = concurrent.controller.capability.get();
        replacement.sidebarWidth = { enabled: true, value: 444 };
        assert.equal(await concurrent.controller.capability.set(replacement).then(
            value => value.sidebarWidth.value
        ), 444);
        await assert.rejects(concurrent.controller.toggleFeature('missing'), /Unknown UI preference/);
        await assert.rejects(concurrent.controller.setFeatureValue('tabTitle', 5), /does not accept/);
        await concurrent.controller.stop();
        await concurrent.controller.stop();
        assert.equal(concurrent.controller.onSessionChange(), false);
        assert.equal(concurrent.controller.reapply(), false);
        assert.equal(concurrent.controller.refreshNativeUi(), false);
        concurrent.controller._applyAll();

        const failedStart = makeUiController();
        failedStart.layout.state.applyError = new Error('layout start');
        await assert.rejects(failedStart.controller.start(), /layout start/);
        assert.equal(failedStart.controller.active, false);
        assert.equal(failedStart.composer.state.calls.some(call => call[0] === 'stop'), true);

        const noLogger = makeUiController({ logger: {} });
        await noLogger.controller.start();
        assert.equal(noLogger.controller.capability.refresh(), true);
        assert.equal(noLogger.controller.capability.status().active, true);
        await noLogger.controller.stop();

        const noWarn = makeUiController({ logger: {} });
        await noWarn.controller.start();
        noWarn.layout.state.applyError = new Error('silent apply');
        await assert.rejects(noWarn.controller.setFeatureEnabled('chatWidth', true), /silent apply/);
    });

    it('rolls back applied preferences and disables itself only when UI rollback also fails', async () => {
        const setup = makeUiController();
        await setup.controller.start();
        setup.layout.state.applyError = new Error('new apply');
        let saves = 0;
        setup.repository.saveHook = async () => { saves += 1; };
        await assert.rejects(setup.controller.setFeatureEnabled('chatWidth', true), error => (
            error.message === 'new apply' && error.rollbackError === error
        ));
        assert.equal(saves, 2);
        assert.equal(setup.controller.active, false);

        const persistenceRollback = makeUiController();
        await persistenceRollback.controller.start();
        let applyCalls = 0;
        persistenceRollback.layout.apply = value => {
            applyCalls += 1;
            if (applyCalls === 1) throw new Error('apply once');
            persistenceRollback.layout.state.calls.push(['apply', clone(value)]);
        };
        let saveCalls = 0;
        persistenceRollback.repository.saveHook = async () => {
            saveCalls += 1;
            if (saveCalls === 2) throw new Error('rollback save');
        };
        await assert.rejects(
            persistenceRollback.controller.setFeatureEnabled('chatWidth', true),
            error => error.rollbackError?.message === 'rollback save'
        );
        assert.equal(persistenceRollback.controller.active, true);

        const inactive = makeUiController();
        const saved = await inactive.controller.setFeatureEnabled('tabTitle', true);
        assert.equal(saved.tabTitle.enabled, true);
        inactive.repository.saveError = new Error('initial save');
        await assert.rejects(inactive.controller.setFeatureEnabled('tabTitle', false), /initial save/);

        const reapplyFailure = makeUiController();
        await reapplyFailure.controller.start();
        reapplyFailure.composer.state.applyError = new Error('reapply');
        assert.throws(() => reapplyFailure.controller.reapply(), /reapply/);
        assert.equal(reapplyFailure.controller.active, false);
    });
});

describe('semantic DOM preferences surface', () => {
    it('validates providers and owns document title and key listeners', () => {
        for (const options of [
            { getDocument: null },
            { translate: null },
            { getLocale: null }
        ]) assert.throws(() => preferences.createDomPreferencesSurface(options), TypeError);
        const invalid = preferences.createDomPreferencesSurface({ getDocument: () => null });
        assert.throws(() => invalid.getTitle(), /DOM document/);

        const document = new FakeDocument();
        const surface = preferences.createDomPreferencesSurface({
            getDocument: () => document,
            translate: (_zh, en) => en,
            getLocale: () => 'en'
        });
        assert.equal(surface.locale(), 'en');
        assert.equal(surface.translate('中', 'English'), 'English');
        assert.equal(surface.getTitle(), 'Google Gemini');
        surface.setTitle(123);
        assert.equal(surface.getTitle(), '123');
        assert.throws(() => surface.listenKeydown(null), TypeError);
        let keydowns = 0;
        const cleanup = surface.listenKeydown(() => { keydowns += 1; });
        document.dispatch('keydown', {});
        assert.equal(keydowns, 1);

        document.title = '';
        assert.equal(surface.getTitle(), '');
        const previousDocument = globalThis.document;
        globalThis.document = document;
        const defaults = preferences.createDomPreferencesSurface();
        assert.equal(defaults.translate('中', 'Default English'), 'Default English');
        assert.equal(defaults.locale(), 'en');
        assert.equal(defaults.getTitle(), '');
        globalThis.document = previousDocument;
        cleanup();
        cleanup();
        document.dispatch('keydown', {});
        assert.equal(keydowns, 1);
    });

    it('activates only available controls and opens or dismisses menus conservatively', () => {
        const surface = preferences.createDomPreferencesSurface({ getDocument: () => new FakeDocument() });
        assert.equal(surface.activate(null), false);
        const disabled = new FakeElement('button');
        disabled.disabled = true;
        assert.equal(surface.activate(disabled), false);
        const ariaDisabled = new FakeElement('button');
        ariaDisabled.setAttribute('aria-disabled', 'true');
        assert.equal(surface.activate(ariaDisabled), false);
        assert.equal(surface.activate({}), false);
        const active = new FakeElement('button');
        assert.equal(surface.activate(active), true);
        assert.equal(active.clicks, 1);

        const expanded = new FakeElement('button');
        expanded.setAttribute('aria-expanded', 'true');
        assert.equal(surface.openModelMenu(expanded), true);
        assert.equal(expanded.clicks, 0);
        const closed = new FakeElement('button');
        closed.setAttribute('aria-expanded', 'false');
        assert.equal(surface.openModelMenu(closed), true);
        assert.equal(closed.clicks, 1);
        assert.equal(surface.dismissModelMenu(null), false);
        assert.equal(surface.dismissModelMenu(closed), false);
        assert.equal(surface.dismissModelMenu({ getAttribute: () => 'true' }), false);
        assert.equal(surface.dismissModelMenu(expanded), true);
        assert.equal(expanded.clicks, 1);
    });

    it('mounts accessible model and composer status with replaceable ownership', () => {
        const document = new FakeDocument();
        const surface = preferences.createDomPreferencesSurface({ getDocument: () => document });
        const orphan = new FakeElement('button');
        const noop = surface.showModelIndicator(orphan, { label: 'Preferred Pro', model: 'pro' });
        noop();

        const parent = new FakeElement('div');
        document.body.appendChild(parent);
        const trigger = new FakeElement('button');
        parent.appendChild(trigger);
        const firstCleanup = surface.showModelIndicator(trigger, { label: 'Preferred Pro', model: 'pro' });
        const first = document.getElementById('gc-model-lock');
        assert.equal(first.getAttribute('role'), 'status');
        assert.equal(first.getAttribute('aria-label'), 'Preferred Pro');
        assert.equal(first.textContent, '🔒 pro');
        const secondCleanup = surface.showModelIndicator(trigger, { label: 'Preferred Flash', model: 'flash' });
        assert.notEqual(document.getElementById('gc-model-lock'), first);
        firstCleanup();
        secondCleanup();
        assert.equal(document.getElementById('gc-model-lock'), null);

        const host = new FakeElement('div');
        document.body.appendChild(host);
        const hintOnly = surface.mountComposerStatus(host, {
            showHint: true, showCounter: false, hintText: 'Ctrl+Enter', counterLabel: 'Count'
        });
        assert.equal(hintOnly.element.getAttribute('role'), 'status');
        assert.equal(document.getElementById('gc-tweaks-send-hint').textContent, 'Ctrl+Enter');
        hintOnly.setCounter('ignored');
        const both = surface.mountComposerStatus(host, {
            showHint: true, showCounter: true, hintText: 'Send', counterLabel: 'Current input length'
        });
        assert.equal(hintOnly.element.parentElement, null);
        both.setCounter('4 chars');
        const counter = document.getElementById('gc-tweaks-input-counter');
        assert.equal(counter.tagName, 'OUTPUT');
        assert.equal(counter.getAttribute('aria-live'), 'polite');
        assert.equal(counter.textContent, '4 chars');
        both.destroy();
        both.destroy();
        assert.equal(document.getElementById('gc-tweaks-status'), null);
    });

    it('applies inline widths and restores exactly the styles it owned', () => {
        const surface = preferences.createDomPreferencesSurface({ getDocument: () => new FakeDocument() });
        const chat = new FakeElement('main');
        const sidebar = new FakeElement('aside');
        chat.style.maxWidth = '700px';
        chat.style.width = '80%';
        sidebar.style.width = '250px';
        sidebar.style.minWidth = '200px';
        const cleanup = surface.applyWidths({
            chatTarget: chat, chatWidth: 1000,
            sidebarTarget: sidebar, sidebarWidth: 300
        });
        assert.deepEqual(chat.style, { maxWidth: '1000px', width: '100%' });
        assert.deepEqual(sidebar.style, { width: '300px', minWidth: '300px' });
        cleanup();
        cleanup();
        assert.deepEqual(chat.style, { maxWidth: '700px', width: '80%' });
        assert.deepEqual(sidebar.style, { width: '250px', minWidth: '200px' });

        const untouched = new FakeElement('div');
        const noTargets = surface.applyWidths({
            chatTarget: untouched, chatWidth: NaN,
            sidebarTarget: null, sidebarWidth: null
        });
        noTargets();
        assert.deepEqual(untouched.style, {});
        const emptyStyles = new FakeElement('div');
        const restoreEmpty = surface.applyWidths({
            chatTarget: emptyStyles, chatWidth: 800,
            sidebarTarget: null, sidebarWidth: null
        });
        restoreEmpty();
        assert.deepEqual(emptyStyles.style, { maxWidth: '', width: '' });
    });

    it('renders a labeled model select with committed async rollback semantics', async () => {
        const document = new FakeDocument();
        const surface = preferences.createDomPreferencesSurface({
            getDocument: () => document,
            translate: (_zh, en) => en
        });
        const changes = [];
        let failure = null;
        const view = surface.renderModelPreference(document.body, {
            value: 'pro',
            options: ['flash', 'thinking', 'pro'],
            onChange(value) {
                changes.push(value);
                if (failure) throw failure;
                return value;
            }
        });
        assert.equal(view.element.children[0].tagName, 'LABEL');
        assert.equal(view.element.children[0].htmlFor, view.control.id);
        assert.deepEqual(view.control.children.map(option => option.textContent), [
            'Fast (Flash)', 'Thinking', 'Pro'
        ]);
        view.control.value = 'flash';
        view.control.dispatch('change');
        assert.equal(view.control.disabled, true);
        await flush();
        assert.equal(view.control.disabled, false);
        assert.equal(view.control.value, 'flash');
        failure = new Error('sync change');
        view.control.value = 'thinking';
        view.control.dispatch('change');
        await flush();
        assert.equal(view.control.value, 'flash');
        failure = null;
        const asyncView = surface.renderModelPreference(document.body, {
            value: 'pro', options: ['pro'], onChange: () => Promise.reject(new Error('async change'))
        });
        asyncView.control.value = 'flash';
        asyncView.control.dispatch('change');
        await flush();
        assert.equal(asyncView.control.value, 'pro');
        const undefinedView = surface.renderModelPreference(document.body, {
            value: 'pro', options: ['pro', 'flash'], onChange() {}
        });
        undefinedView.control.value = 'flash';
        undefinedView.control.dispatch('change');
        await flush();
        assert.equal(undefinedView.control.value, 'flash');
        view.destroy();
        view.destroy();
        asyncView.destroy();
        undefinedView.destroy();
        assert.equal(changes.length, 2);
    });

    it('renders semantic switches and number controls with normalized rollbacks', async () => {
        const document = new FakeDocument();
        const surface = preferences.createDomPreferencesSurface({ getDocument: () => document });
        let toggleFailure = null;
        let valueFailure = null;
        const toggles = [];
        const values = [];
        const config = preferences.normalizeUiTweaks({ chatWidth: { value: 900 } });
        const labels = Object.fromEntries(Object.keys(config).map(id => [id, { label: id }]));
        const view = surface.renderUiPreferences(document.body, {
            config,
            labels,
            onToggle(id, enabled) {
                toggles.push([id, enabled]);
                if (toggleFailure) throw toggleFailure;
                return { [id]: { enabled } };
            },
            onValue(id, value) {
                values.push([id, value]);
                if (valueFailure) return Promise.reject(valueFailure);
                return { [id]: { value: value === 1200 ? 1100 : value } };
            }
        });
        assert.equal(view.elements.length, 5);
        const tabRow = view.elements[0];
        const tabControl = tabRow.children[1];
        assert.equal(tabControl.getAttribute('role'), 'switch');
        assert.equal(tabControl.getAttribute('aria-checked'), 'false');
        tabControl.checked = true;
        tabControl.dispatch('change');
        await flush();
        assert.equal(tabControl.checked, true);
        assert.equal(tabControl.getAttribute('aria-checked'), 'true');
        toggleFailure = new Error('toggle');
        tabControl.checked = false;
        tabControl.dispatch('change');
        await flush();
        assert.equal(tabControl.checked, true);
        assert.equal(tabControl.disabled, false);
        toggleFailure = null;
        const fallbackToggle = surface.renderUiPreferences(document.body, {
            config: { tabTitle: { enabled: false } },
            labels: { tabTitle: { label: 'tabTitle' } },
            onToggle() { return {}; }, onValue() {}
        });
        const fallbackControl = fallbackToggle.elements[0].children[1];
        fallbackControl.checked = true;
        fallbackControl.dispatch('change');
        await flush();
        assert.equal(fallbackControl.checked, true);

        const chatRow = view.elements[3];
        const valueInput = chatRow.children[2];
        assert.equal(valueInput.type, 'number');
        assert.equal(valueInput.getAttribute('aria-label'), 'chatWidth (px)');
        valueInput.value = 'invalid';
        valueInput.dispatch('change');
        assert.equal(valueInput.value, '900');
        valueInput.value = '-1';
        valueInput.dispatch('change');
        assert.equal(valueInput.value, '900');
        valueInput.value = '1200';
        valueInput.dispatch('change');
        await flush();
        assert.equal(valueInput.value, '1100');
        valueFailure = new Error('value');
        valueInput.value = '1000';
        valueInput.dispatch('change');
        await flush();
        assert.equal(valueInput.value, '1100');
        assert.equal(valueInput.disabled, false);
        valueFailure = null;
        const fallbackValue = surface.renderUiPreferences(document.body, {
            config: { chatWidth: { enabled: false, value: 900 } },
            labels: { chatWidth: { label: 'chatWidth' } },
            onToggle() {}, onValue() { return {}; }
        });
        const fallbackValueInput = fallbackValue.elements[0].children[2];
        fallbackValueInput.value = '950';
        fallbackValueInput.dispatch('change');
        await flush();
        assert.equal(fallbackValueInput.value, '950');
        view.destroy();
        view.destroy();
        assert.deepEqual(toggles, [['tabTitle', true], ['tabTitle', false]]);
        assert.deepEqual(values, [['chatWidth', 1200], ['chatWidth', 1000]]);
        fallbackToggle.destroy();
        fallbackValue.destroy();
    });
});

describe('thin compatibility facades and default composition', () => {
    it('adapts current Gemini capabilities without selectors or storage knowledge', () => {
        const source = uiAdapter();
        source.state.inputArea.parentElement = new FakeElement('main');
        const adapted = uiModuleExports.createUiTweaksAdapter(source);
        assert.equal(adapted.getCapabilityProbeReport().adapterCapabilities.length, 2);
        assert.equal(adapted.getInputArea(), source.state.inputArea);
        assert.equal(adapted.getInputEditor(), source.state.editor);
        assert.equal(adapted.getSendButton(), source.state.sendButton);
        assert.equal(adapted.isInsideInputEditor({}), true);
        assert.equal(adapted.getChatTitleText(), 'A chat');
        assert.equal(adapted.isInsideMainChatArea({}), true);
        assert.equal(adapted.getSidebar(), source.state.sidebar);
        assert.equal(adapted.getChatWidthTarget(), source.state.inputArea.parentElement);
        source.state.inputArea.parentElement = null;
        assert.equal(adapted.getChatWidthTarget(), source.state.inputArea);
        source.state.inputArea = null;
        assert.equal(adapted.getChatWidthTarget(), null);

        const watcherCalls = [];
        const watcher = uiModuleExports.createUiPreferencesWatcher({
            register(id, options) { watcherCalls.push(['register', id, options]); return 'registered'; },
            unregister(id) { watcherCalls.push(['unregister', id]); return 'unregistered'; }
        });
        assert.equal(watcher.register('id', { debounce: 1 }), 'registered');
        assert.equal(watcher.unregister('id'), 'unregistered');
        assert.equal(watcherCalls.length, 2);

        assert.throws(() => defaultModuleExports.createDefaultModelAdapter({ getCurrentUrl: null }), TypeError);
        const modelSource = defaultAdapter();
        const previousLocation = globalThis.location;
        Object.defineProperty(globalThis, 'location', {
            value: { href: '/global-location' }, configurable: true, writable: true
        });
        const defaultUrlAdapter = defaultModuleExports.createDefaultModelAdapter({ adapter: modelSource });
        assert.equal(defaultUrlAdapter.getCurrentUrl(), '/global-location');
        if (previousLocation === undefined) delete globalThis.location;
        else globalThis.location = previousLocation;
        assert.equal(defaultUrlAdapter.getCurrentUrl(), '');
        const modelAdapter = defaultModuleExports.createDefaultModelAdapter({
            adapter: modelSource, getCurrentUrl: () => '/provided'
        });
        assert.equal(modelAdapter.getCapabilityProbeReport().adapterCapabilities[0].id, 'model-picker');
        assert.equal(modelAdapter.getCurrentUrl(), '/provided');
        assert.equal(modelAdapter.isNewChatUrl(), true);
        assert.equal(modelAdapter.getModelSwitch(), modelSource.state.trigger);
        assert.equal(modelAdapter.detectModelKey(), 'flash');
        assert.equal(modelAdapter.getModelMenuOptions(), modelSource.state.options);
    });

    it('builds injectable controllers while retaining exact legacy keys', async () => {
        const globalObject = {
            document: new FakeDocument(),
            setInterval() { return 41; },
            clearInterval(id) { this.cleared = id; }
        };
        const modelAdapter = defaultAdapter({ newChat: false });
        const modelSurface = defaultSurface();
        const modelController = defaultModuleExports.createDefaultModelController({
            globalObject,
            repository: new FakeRepository('flash'),
            adapter: modelAdapter,
            surface: modelSurface,
            waitFor: async predicate => predicate(),
            logger: {}
        });
        await modelController.start();
        assert.equal(modelController.preferredModel, 'flash');
        await modelController.stop();
        assert.equal(globalObject.cleared, 41);

        const defaultSurfaceController = defaultModuleExports.createDefaultModelController({
            globalObject,
            repository: new FakeRepository('pro'),
            adapter: defaultAdapter({ newChat: false }),
            scheduler: new FakeScheduler(),
            waitFor: async predicate => predicate(),
            logger: {}
        });
        assert.equal(defaultSurfaceController.surface.getTitle(), 'Google Gemini');
        assert.equal(defaultSurfaceController.surface.translate('中', 'English'), 'English');
        assert.equal(defaultSurfaceController.surface.locale(), 'en');
        nativeUiExports.NativeUI.isZH = true;
        assert.equal(defaultSurfaceController.surface.locale(), 'zh');
        nativeUiExports.NativeUI.isZH = false;

        const warnings = [];
        const storageController = defaultModuleExports.createDefaultModelController({
            globalObject: {
                document: new FakeDocument(),
                setInterval() { return 1; }, clearInterval() {},
                GM_getValue() { throw new Error('read global'); }, GM_setValue() {}
            },
            adapter: defaultAdapter({ newChat: false }),
            surface: defaultSurface(),
            waitFor: async predicate => predicate(),
            logger: { warn(message) { warnings.push(message); } }
        });
        await storageController.start();
        assert.equal(storageController.preferredModel, 'pro');
        assert.equal(warnings.length, 1);
        await storageController.stop();

        const uiController = uiModuleExports.createUiTweaksController({
            globalObject,
            repository: new FakeRepository(preferences.normalizeUiTweaks(null)),
            adapter: uiAdapter(),
            surface: uiSurface(),
            watcher: uiWatcher(),
            formatter: text => String(text),
            logger: {}
        });
        await uiController.start();
        await uiController.stop();

        const defaultUiSurfaceController = uiModuleExports.createUiTweaksController({
            globalObject,
            repository: new FakeRepository(preferences.normalizeUiTweaks(null)),
            adapter: uiAdapter(), watcher: uiWatcher(), formatter: () => '', logger: {}
        });
        assert.equal(defaultUiSurfaceController.surface.getTitle(), 'Google Gemini');
        assert.equal(defaultUiSurfaceController.surface.translate('中', 'English'), 'English');
        assert.equal(defaultUiSurfaceController.surface.locale(), 'en');
        nativeUiExports.NativeUI.isZH = true;
        assert.equal(defaultUiSurfaceController.surface.locale(), 'zh');
        nativeUiExports.NativeUI.isZH = false;

        const uiWarnings = [];
        const globalUi = uiModuleExports.createUiTweaksController({
            globalObject: {
                document: new FakeDocument(),
                GM_getValue() { throw new Error('ui read'); }, GM_setValue() {}
            },
            adapter: uiAdapter({ statuses: { composer: 'unavailable', title: 'unavailable' } }),
            surface: uiSurface(), watcher: uiWatcher(), formatter: () => '',
            logger: { warn(message) { uiWarnings.push(message); } }
        });
        await globalUi.start();
        assert.equal(uiWarnings.length, 1);
        await globalUi.stop();
        assert.equal(defaultModuleExports.DefaultModelModule.STORAGE_KEY, 'gemini_default_model');
        assert.equal(uiModuleExports.UITweaksModule.STORAGE_KEY, 'gemini_ui_tweaks');
    });

    it('keeps Default Model as a frozen thin facade over an injected controller', async () => {
        const calls = [];
        const controller = {
            preferredModel: 'thinking', _route: '/route', _routeTimer: 9,
            capability: { id: 'preferences.default-model' },
            adapter: { isNewChatUrl: () => true, detectModelKey: () => null },
            waitFor: (predicate, timeout) => ['wait', predicate(), timeout],
            start() { calls.push('start'); return 'started'; },
            stop() { calls.push('stop'); return 'stopped'; },
            onSessionChange() { calls.push('session'); return true; },
            refreshIndicator() { calls.push('inject'); return true; },
            removeIndicator() { calls.push('remove'); },
            setPreferredModel(model) { calls.push(['model', model]); return model; },
            applyToCurrentNewChat() { calls.push('apply'); return 'applied'; },
            renderSettings(container) { calls.push(['render', container]); return 'view'; },
            getStatus() { return { switching: true }; }
        };
        for (const missing of [
            'start', 'stop', 'onSessionChange', 'refreshIndicator', 'removeIndicator',
            'setPreferredModel', 'applyToCurrentNewChat', 'renderSettings', 'getStatus'
        ]) {
            const broken = { ...controller };
            delete broken[missing];
            assert.throws(() => defaultModuleExports.createDefaultModelModule({ controller: broken }), TypeError);
        }
        assert.throws(() => defaultModuleExports.createDefaultModelModule({ controller, translate: null }), TypeError);
        const module = defaultModuleExports.createDefaultModelModule({ controller, translate: (_zh, en) => en });
        assert.equal(Object.isFrozen(module), true);
        assert.equal(module.id, 'default-model');
        assert.equal(module.name, 'Default Model');
        assert.equal(module.description, 'Apply a preferred model to new chats');
        assert.equal(module.iconId, 'settings');
        assert.equal(module.defaultEnabled, false);
        assert.equal(module.capability.id, 'preferences.default-model');
        assert.equal(module._preferredModel, 'thinking');
        assert.equal(module._lastUrl, '/route');
        assert.equal(module._pollTimer, 9);
        assert.equal(module._switching, true);
        assert.equal(await module.init(), 'started');
        assert.equal(await module.destroy(), 'stopped');
        assert.equal(module.onUserChange(), true);
        assert.equal(module.injectNativeUI(), true);
        assert.equal(module.removeNativeUI(), undefined);
        assert.equal(module.setPreferredModel('flash'), 'flash');
        assert.equal(module._isNewChat(), true);
        assert.equal(module._startUrlWatcher(), 'started');
        assert.equal(module._attemptModelSwitch(), 'applied');
        assert.equal(module._detectCurrentModel(), 'flash');
        assert.deepEqual(module._waitFor(() => 'ready', 5), ['wait', 'ready', 5]);
        assert.equal(module.renderToSettings('container'), 'view');
        assert.match(module.getOnboarding().en.features, /supported model picker/);
        assert.equal(calls.length > 8, true);
    });

    it('keeps UI Tweaks as a dynamic thin facade without retired entries', async () => {
        const calls = [];
        const currentFeatures = preferences.normalizeUiTweaks(null);
        const controller = {
            capability: { id: 'preferences.ui' },
            start() { calls.push('start'); return 'started'; },
            stop() { calls.push('stop'); return 'stopped'; },
            onSessionChange() { calls.push('session'); return true; },
            getLegacyFeatures() { return clone(currentFeatures); },
            getStatus() { return { active: true }; },
            refreshNativeUi() { calls.push('inject'); return true; },
            removeNativeUi() { calls.push('remove'); },
            reapply() { calls.push('apply'); return true; },
            toggleFeature(id) { currentFeatures[id].enabled = !currentFeatures[id].enabled; return id; },
            setFeatureValue(id, value) { currentFeatures[id].value = value; return value; },
            renderSettings(container) { calls.push(['render', container]); return 'view'; }
        };
        for (const missing of [
            'start', 'stop', 'onSessionChange', 'getLegacyFeatures', 'getStatus',
            'refreshNativeUi', 'removeNativeUi', 'reapply', 'toggleFeature',
            'setFeatureValue', 'renderSettings'
        ]) {
            const broken = { ...controller };
            delete broken[missing];
            assert.throws(() => uiModuleExports.createUiTweaksModule({ controller: broken }), TypeError);
        }
        assert.throws(() => uiModuleExports.createUiTweaksModule({ controller, translate: null }), TypeError);
        const module = uiModuleExports.createUiTweaksModule({ controller, translate: (_zh, en) => en });
        assert.equal(Object.isFrozen(module), true);
        assert.equal(module.id, 'ui-tweaks');
        assert.equal(module.name, 'UI Tweaks');
        assert.equal(module.defaultEnabled, false);
        assert.equal(module.capability.id, 'preferences.ui');
        assert.equal(Object.hasOwn(module.features, 'hideGems'), false);
        assert.equal(module._getStatusText(), 'All tweaks off');
        assert.equal(await module.init(), 'started');
        assert.equal(await module.destroy(), 'stopped');
        assert.equal(module.onUserChange(), true);
        assert.equal(module.injectNativeUI(), true);
        assert.equal(module.removeNativeUI(), undefined);
        assert.equal(module.toggleFeature('ctrlEnter'), 'ctrlEnter');
        module.toggleFeature('inputCounter');
        module.toggleFeature('tabTitle');
        module.toggleFeature('chatWidth');
        module.toggleFeature('sidebarWidth');
        assert.equal(module.setFeatureValue('chatWidth', 1000), 1000);
        assert.equal(module.setFeatureValue('sidebarWidth', 300), 300);
        assert.match(module._getStatusText(), /Ctrl\+Enter: ON/);
        assert.match(module._getStatusText(), /Chat Width: 1000px/);
        assert.match(module._getStatusText(), /Sidebar: 300px/);
        assert.equal(module._applyAll(), true);
        assert.equal(module.renderToSettings('container'), 'view');
        assert.match(module.getOnboarding().zh.features, /输入统计/);
        assert.equal(calls.length > 5, true);
    });
});
