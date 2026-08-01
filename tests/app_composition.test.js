const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let createModuleCatalog;
let registerModuleCatalog;
let createSessionDetectionBridge;
let hasGuestCounterData;
let mergeGuestCounterState;
let createGeminiWatcherWiring;
let createOnboardingCoordinator;
let createPrimerComposition;
let createProbeReporter;
let installPublicGlobals;
let registerMenuCommands;
let sanitizeCapabilityHealthSnapshot;

async function load(relativePath) {
    return import(pathToFileURL(path.join(__dirname, '..', relativePath)).href);
}

before(async () => {
    ({ createModuleCatalog, registerModuleCatalog } = await load('src/app/module_catalog.js'));
    ({
        createSessionDetectionBridge,
        hasGuestCounterData,
        mergeGuestCounterState
    } = await load('src/app/session_detection_bridge.js'));
    ({ createGeminiWatcherWiring } = await load('src/app/gemini_watcher_wiring.js'));
    ({ createOnboardingCoordinator } = await load('src/app/onboarding_coordinator.js'));
    ({ createPrimerComposition } = await load('src/app/composition_root.js'));
    ({ createProbeReporter, installPublicGlobals, registerMenuCommands, sanitizeCapabilityHealthSnapshot } =
        await load('src/app/public_bridge.js'));
});

function createScope(active = true) {
    const timeouts = [];
    const intervals = [];
    const cancellations = [];
    return {
        active,
        timeouts,
        intervals,
        cancellations,
        timeout(callback, delay) {
            const item = { callback, delay, cancelled: false };
            timeouts.push(item);
            return () => {
                item.cancelled = true;
                cancellations.push(`timeout:${delay}`);
            };
        },
        interval(callback, delay) {
            const item = { callback, delay, cancelled: false };
            intervals.push(item);
            return () => {
                item.cancelled = true;
                cancellations.push(`interval:${delay}`);
            };
        }
    };
}

describe('module catalog', () => {
    it('validates all catalog and registry boundaries before ordered registration', () => {
        assert.throws(() => createModuleCatalog(null), /must be an array/);
        for (const entry of [null, 'counter', {}, { id: '' }, { id: 1 }]) {
            assert.throws(() => createModuleCatalog([entry]), /must have an id/);
        }
        assert.throws(() => createModuleCatalog([{ id: 'a' }, { id: 'a' }]), /Duplicate/);

        const first = { id: 'first' };
        const second = { id: 'second' };
        const catalog = createModuleCatalog([first, second]);
        assert.equal(Object.isFrozen(catalog), true);
        assert.throws(() => registerModuleCatalog(null, catalog), /requires a registry/);
        assert.throws(() => registerModuleCatalog({}, catalog), /requires a registry/);
        assert.throws(() => registerModuleCatalog({ register() {} }, {}), /must be an array/);

        const registered = [];
        const registry = { register(module) { registered.push(module.id); } };
        assert.equal(registerModuleCatalog(registry, catalog), registry);
        assert.deepEqual(registered, ['first', 'second']);
    });
});

describe('session detection bridge', () => {
    it('merges legacy Guest counter data defensively and reports empty payloads', () => {
        assert.equal(hasGuestCounterData(null), false);
        assert.equal(hasGuestCounterData({ total: Infinity, chats: [] }), false);
        assert.equal(hasGuestCounterData({ total: 1 }), true);
        assert.equal(hasGuestCounterData({ chats: { c: 0 } }), true);
        assert.equal(mergeGuestCounterState({}, {}), false);

        const target = {
            total: 2,
            totalChatsCreated: 1,
            dailyCounts: {
                old: { messages: 2, chats: 1 },
                models: { messages: 'bad', chats: NaN, byModel: { flash: 2 } }
            },
            chats: { existing: 2 }
        };
        const guest = {
            total: 3,
            totalChatsCreated: 4,
            dailyCounts: {
                fresh: { messages: 1, chats: 1, byModel: { flash: 1 } },
                old: { messages: 3, chats: 2 },
                models: { messages: 4, chats: 5, byModel: { flash: 3, thinking: 2, pro: 'bad' } },
                invalid: null,
                invalidArray: []
            },
            chats: { existing: 3, invalid: 'bad' }
        };
        assert.equal(mergeGuestCounterState(target, guest), true);
        assert.equal(target.total, 5);
        assert.equal(target.totalChatsCreated, 5);
        assert.deepEqual(target.dailyCounts.old, { messages: 5, chats: 3 });
        assert.deepEqual(target.dailyCounts.models, {
            messages: 4,
            chats: 5,
            byModel: { flash: 5, thinking: 2, pro: 0 }
        });
        assert.deepEqual(target.dailyCounts.fresh, guest.dailyCounts.fresh);
        assert.notEqual(target.dailyCounts.fresh, guest.dailyCounts.fresh);
        assert.equal('invalid' in target.dailyCounts, false);
        assert.equal('invalidArray' in target.dailyCounts, false);
        assert.deepEqual(target.chats, { existing: 5, invalid: 0 });
    });

    it('uses the JSON cloning fallback when structuredClone is unavailable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
        Object.defineProperty(globalThis, 'structuredClone', { configurable: true, value: undefined });
        try {
            const target = {};
            assert.equal(mergeGuestCounterState(target, {
                total: 1,
                dailyCounts: { today: { messages: 1 } },
                chats: {}
            }), true);
            assert.deepEqual(target.dailyCounts.today, { messages: 1 });
        } finally {
            if (descriptor) Object.defineProperty(globalThis, 'structuredClone', descriptor);
            else delete globalThis.structuredClone;
        }
    });

    it('coordinates detection, session load, Guest merge, account type, visibility, and persistence', async () => {
        const events = [];
        let current = 'Guest';
        let inspecting = 'Guest';
        let detected = 'person@example.test';
        let panelPresent = true;
        const counter = {
            state: {
                total: 2,
                totalChatsCreated: 1,
                dailyCounts: {},
                chats: { guest: 2 }
            },
            accountType: 'free',
            detectAccountType: () => 'pro',
            async saveData() { events.push('save'); },
            async loadDataForUser(user) {
                events.push(`load:${user}`);
                this.state = { total: 10, totalChatsCreated: 0, dailyCounts: {}, chats: {} };
            },
            flushPendingSave() { events.push('flush'); }
        };
        const registry = { isEnabled: () => true };
        const panel = { update() { events.push('panel'); } };
        const logger = {
            debug(message, data) { events.push(`debug:${message}:${data.detected}`); },
            info(message) { events.push(`info:${message}`); },
            error(message, error) { events.push(`error:${message}:${error.message}`); }
        };
        const bridge = createSessionDetectionBridge({
            core: {
                detectUser: () => detected,
                registerUser(user) { events.push(`register:${user}`); }
            },
            registry,
            counter,
            panel,
            logger,
            tempUser: 'Guest',
            getCurrentUser: () => current,
            setCurrentUser(user) { current = user; events.push(`current:${user}`); },
            getInspectingUser: () => inspecting,
            setInspectingUser(user) { inspecting = user; events.push(`inspect:${user}`); },
            async notifySession(user) {
                events.push(`notify:${user}`);
                await counter.loadDataForUser(user);
            },
            isPanelPresent: () => panelPresent,
            onGuestMerged({ guestState, user }) {
                events.push(`merged:${guestState.total}:${user}`);
            }
        });

        await bridge.poll();
        assert.equal(current, detected);
        assert.equal(inspecting, detected);
        assert.equal(counter.state.total, 12);
        assert.equal(counter.state.chats.guest, 2);
        assert.equal(counter.accountType, 'pro');
        assert.ok(events.indexOf(`notify:${detected}`) < events.indexOf(`merged:2:${detected}`));

        const eventCount = events.length;
        await bridge.poll();
        assert.equal(events.filter(event => event.startsWith('debug:')).length, 1);
        assert.ok(events.length >= eventCount);

        await bridge.onVisible();
        assert.equal(events.at(-1), `load:${detected}`);
        assert.equal(await bridge.flushCounter(), true);
        bridge.reset();

        panelPresent = false;
        inspecting = current;
        detected = 'refined@example.test';
        await bridge.poll();
        assert.equal(inspecting, detected);

        detected = 'second@example.test';
        inspecting = 'other@example.test';
        counter.detectAccountType = () => counter.accountType;
        await bridge.poll();
        assert.equal(inspecting, 'other@example.test');
    });

    it('contains detection, cloning, disabled-counter, flush, and load failures', async () => {
        const errors = [];
        let current = 'Guest';
        let inspecting = '';
        let enabled = false;
        let shouldThrowDetection = false;
        const counter = {
            state: { total: 1, chats: { a: 1 } },
            accountType: 'same',
            detectAccountType: () => 'same',
            flushPendingSave() { throw new Error('flush failed'); },
            loadDataForUser() { throw new Error('load failed'); }
        };
        const args = {
            core: {
                detectUser() {
                    if (shouldThrowDetection) throw new Error('detect failed');
                    return 'user';
                },
                registerUser() {}
            },
            registry: { isEnabled: () => enabled },
            counter,
            panel: { update() {} },
            logger: { debug() {}, info() {}, error(message, error) { errors.push(`${message}:${error.message}`); } },
            tempUser: 'Guest',
            getCurrentUser: () => current,
            setCurrentUser: value => { current = value; },
            getInspectingUser: () => inspecting,
            setInspectingUser: value => { inspecting = value; },
            notifySession: async () => {},
            cloneState() { throw new Error('clone failed'); }
        };
        const bridge = createSessionDetectionBridge(args);
        await bridge.poll();
        assert.equal(current, 'user');
        assert.equal(inspecting, '');
        assert.equal(await bridge.flushCounter(), false);
        enabled = true;
        inspecting = 'signed@example.test';
        await assert.rejects(bridge.onVisible(), /load failed/);

        current = 'Guest';
        inspecting = 'Guest';
        await bridge.poll();
        shouldThrowDetection = true;
        await bridge.poll();
        assert.deepEqual(errors, ['lazyDetect error:detect failed']);

        const defaultCallbacks = createSessionDetectionBridge({
            ...args,
            core: { detectUser: () => 'third', registerUser() {} },
            cloneState: value => ({ ...value, chats: { ...value.chats } }),
            notifySession: async () => {
                counter.state = { total: 0, chats: {}, dailyCounts: {} };
            }
        });
        current = 'Guest';
        inspecting = 'Guest';
        counter.flushPendingSave = () => {};
        counter.saveData = () => {};
        await defaultCallbacks.poll();
    });

    it('rejects incomplete or non-callable dependencies', () => {
        const complete = {
            core: {}, registry: {}, counter: {}, panel: {}, logger: {}, tempUser: 'Guest',
            getCurrentUser() {}, setCurrentUser() {}, getInspectingUser() {}, setInspectingUser() {},
            notifySession() {}
        };
        assert.throws(() => createSessionDetectionBridge({ ...complete, core: null }), /requires core/);
        assert.throws(() => createSessionDetectionBridge({ ...complete, notifySession: 1 }), /must be a function/);
    });
});

describe('Gemini watcher wiring', () => {
    function dependencies(overrides = {}) {
        const events = [];
        const panelNode = { id: 'panel' };
        const deps = {
            adapter: {
                matchesModelMutation: mutation => mutation.kind === 'model',
                matchesSidebarMutation: mutation => mutation.kind === 'sidebar',
                matchesInputAreaMutation: mutation => mutation.kind === 'input',
                matchesHeaderMutation: mutation => mutation.kind === 'header'
            },
            core: { invalidateSidebarCache() { events.push('invalidate'); } },
            nativeUI: {
                markDirtyByZone(zone) { events.push(`zone:${zone}`); },
                markAllDirty() { events.push('all'); },
                tick() { events.push('tick'); }
            },
            panel: { create() { events.push('create'); }, update() { events.push('update'); } },
            counter: { currentModel: 'flash', detectModel: () => 'pro' },
            registry: { isEnabled: () => true },
            panelId: 'panel',
            timings: { MODEL_MUTATION_DEBOUNCE: 10, NATIVEUI_DEBOUNCE: 20 },
            documentRef: { getElementById: id => id === 'panel' ? panelNode : null },
            events
        };
        return Object.assign(deps, overrides);
    }

    it('creates immutable watcher descriptors and wires every callback', () => {
        const deps = dependencies();
        let removed = 0;
        let structured = 0;
        const wiring = createGeminiWatcherWiring({
            ...deps,
            onPanelRemoved() { removed += 1; },
            onDOMStructureChange() { structured += 1; }
        });
        assert.equal(Object.isFrozen(wiring.watchers), true);
        assert.deepEqual(wiring.watchers.map(watcher => watcher.id), [
            'model-mutation', 'sidebar-structure', 'input-structure', 'header-structure', 'panel-guard'
        ]);
        assert.deepEqual(wiring.watchers.slice(0, 4).map(watcher => watcher.debounce), [10, 20, 20, 20]);
        assert.equal(wiring.watchers[0].match({ kind: 'model' }), true);
        assert.equal(wiring.watchers[1].match({ kind: 'sidebar' }), true);
        assert.equal(wiring.watchers[2].match({ kind: 'input' }), true);
        assert.equal(wiring.watchers[3].match({ kind: 'header' }), true);
        assert.equal(wiring.syncModel(), true);
        assert.equal(deps.counter.currentModel, 'pro');
        assert.equal(wiring.syncModel(), false);
        deps.registry.isEnabled = () => false;
        assert.equal(wiring.syncModel(), false);

        wiring.watchers[1].callback();
        wiring.watchers[2].callback();
        wiring.watchers[3].callback();
        assert.deepEqual(deps.events.slice(-7), [
            'invalidate', 'zone:sidebar', 'tick', 'zone:input', 'tick', 'zone:header', 'tick'
        ]);
        const guard = wiring.watchers[4];
        assert.equal(guard.match({ type: 'attributes', removedNodes: [] }), false);
        assert.equal(guard.match({ type: 'childList' }), false);
        assert.equal(guard.match({ type: 'childList', removedNodes: [{ id: 'other' }] }), false);
        assert.equal(guard.match({ type: 'childList', removedNodes: [{ id: 'panel' }] }), true);
        guard.callback();
        wiring.onDOMStructureChange();
        assert.equal(removed, 1);
        assert.equal(structured, 1);
    });

    it('supports default shell callbacks and absent panel updates', () => {
        const deps = dependencies({ documentRef: { getElementById: () => null } });
        const wiring = createGeminiWatcherWiring(deps);
        assert.equal(wiring.syncModel(), true);
        assert.doesNotMatch(deps.events.join(','), /update/);
        wiring.watchers[4].callback();
        wiring.onDOMStructureChange();
        assert.deepEqual(deps.events.slice(-5), ['create', 'invalidate', 'create', 'all', 'tick']);
    });

    it('validates required dependencies and callbacks', () => {
        const deps = dependencies();
        assert.throws(() => createGeminiWatcherWiring({ ...deps, adapter: null }), /dependencies/);
        assert.throws(() => createGeminiWatcherWiring({ ...deps, onPanelRemoved: 1 }), /callbacks/);
        assert.throws(() => createGeminiWatcherWiring({ ...deps, onDOMStructureChange: 1 }), /callbacks/);
    });
});

describe('onboarding coordinator', () => {
    function fixture({ initial = {}, hasSeen = true, query = null } = {}) {
        let stored = initial;
        const events = [];
        const registry = {
            enabledModules: new Set(['first', 'plain', 'seen']),
            modules: {
                first: { id: 'first', getOnboarding() {} },
                plain: { id: 'plain' },
                seen: { id: 'seen', getOnboarding() {} }
            }
        };
        const guidedTour = {
            hasSeen: () => hasSeen,
            start(done) { events.push('tour'); done(); }
        };
        const coordinator = createOnboardingCoordinator({
            registry,
            panel: { showOnboarding(id) { events.push(`show:${id}`); } },
            guidedTour,
            storage: {
                get() { return stored; },
                set(_key, value) { stored = value; events.push('write'); }
            },
            onboardingKey: 'seen-key',
            documentRef: { querySelector: () => query },
            modalSelector: '.onboarding'
        });
        return { coordinator, events, registry, get stored() { return stored; } };
    }

    it('marks modules once and serializes the enabled onboarding queue', () => {
        const fx = fixture({ initial: { seen: true } });
        assert.equal(fx.coordinator.markModuleEnabled(null), false);
        assert.equal(fx.coordinator.markModuleEnabled(fx.registry.modules.plain), false);
        assert.equal(fx.coordinator.markModuleEnabled(fx.registry.modules.seen), false);
        const added = { id: 'added', getOnboarding() {} };
        assert.equal(fx.coordinator.markModuleEnabled(added), true);
        assert.equal(fx.coordinator.markModuleEnabled(added), false);

        const scope = createScope();
        assert.equal(fx.coordinator.startQueue(scope), true);
        assert.equal(scope.timeouts[0].delay, 500);
        scope.timeouts[0].callback();
        assert.equal(scope.intervals[0].delay, 300);
        scope.intervals[0].callback();
        assert.deepEqual(scope.cancellations, ['interval:300', 'timeout:10000']);
        const next = scope.timeouts.find(item => item.delay === 500 && item !== scope.timeouts[0]);
        next.callback();
        assert.deepEqual(fx.events.filter(event => event.startsWith('show:')), ['show:added', 'show:first']);
    });

    it('handles empty, inactive, modal-present, and tour-first flows', () => {
        const empty = fixture({ initial: { first: true, seen: true } });
        assert.equal(empty.coordinator.startQueue(createScope()), false);
        assert.equal(empty.coordinator.startProgressiveDisclosure(createScope()), 'modules');

        const inactive = fixture({ initial: { seen: true } });
        const inactiveScope = createScope(false);
        assert.equal(inactive.coordinator.startQueue(inactiveScope), true);
        inactiveScope.timeouts[0].callback();
        assert.deepEqual(inactive.events.filter(event => event.startsWith('show:')), []);

        const modal = fixture({ initial: { seen: true }, query: {} });
        const modalScope = createScope();
        modal.coordinator.startQueue(modalScope);
        modalScope.timeouts[0].callback();
        modalScope.intervals[0].callback();
        assert.deepEqual(modalScope.cancellations, []);
        modalScope.timeouts.find(item => item.delay === 10000).callback();
        assert.deepEqual(modalScope.cancellations, ['interval:300', 'timeout:10000']);

        const tour = fixture({ initial: { seen: true }, hasSeen: false });
        const tourScope = createScope();
        assert.equal(tour.coordinator.startProgressiveDisclosure(tourScope), 'tour');
        assert.equal(tourScope.timeouts[0].delay, 800);
        tourScope.timeouts[0].callback();
        assert.equal(tour.events[0], 'tour');

        const stoppedTour = fixture({ initial: { seen: true }, hasSeen: false });
        const stoppedScope = createScope(false);
        stoppedTour.coordinator.startProgressiveDisclosure(stoppedScope);
        stoppedScope.timeouts[0].callback();
        assert.deepEqual(stoppedTour.events, ['tour']);
    });

    it('contains malformed and failing storage and rejects incompatible inputs', () => {
        const common = {
            registry: { enabledModules: new Set(), modules: {} },
            panel: {}, guidedTour: {}, onboardingKey: 'key',
            documentRef: { querySelector() {} }, modalSelector: '.modal'
        };
        assert.throws(() => createOnboardingCoordinator({ ...common, registry: null, storage: {} }), /dependencies/);
        assert.throws(() => createOnboardingCoordinator({ ...common, storage: {} }), /implement get/);
        assert.throws(() => createOnboardingCoordinator({ ...common, storage: { get() {} } }), /implement get/);

        let throwGet = true;
        let throwSet = true;
        const coordinator = createOnboardingCoordinator({
            ...common,
            panel: { showOnboarding() {} },
            guidedTour: { hasSeen: () => true },
            storage: {
                get() {
                    if (throwGet) throw new Error('blocked');
                    return [];
                },
                set() {
                    if (throwSet) throw new Error('blocked');
                }
            }
        });
        assert.equal(coordinator.markModuleEnabled({ id: 'a', getOnboarding() {} }), true);
        throwGet = false;
        throwSet = false;
        assert.equal(coordinator.markModuleEnabled({ id: 'b', getOnboarding() {} }), true);
        assert.throws(() => coordinator.startQueue(null), /lifecycle scope/);
        assert.throws(() => coordinator.startQueue({ timeout() {} }), /lifecycle scope/);
    });
});

describe('composition root', () => {
    function fixture(overrides = {}) {
        const events = [];
        let panelNode = { remove() { events.push('remove'); } };
        const app = { state: 'stopped', start() {}, stop() {} };
        const deps = {
            registry: { init() {}, destroy() {} },
            domWatcher: { init() {}, register() {}, unregister() {}, destroy() {} },
            watcherWiring: { watchers: [], syncModel() { events.push('model'); } },
            sessionBridge: {
                poll() {}, onVisible() { events.push('visible'); },
                flushCounter() { events.push('flush'); }, reset() { events.push('reset'); }
            },
            onboarding: { markModuleEnabled(module) { events.push(`onboard:${module.id}`); } },
            core: {
                getTheme: () => 'dark',
                _updateAutoListener(theme) { events.push(`theme:${theme}`); }
            },
            panel: {
                injectStyles() { events.push('panel-style'); }, update() { events.push('panel-update'); },
                renderDetailsPane() { events.push('details'); }, destroy() { events.push('destroy'); },
                configureShellPorts(ports) {
                    events.push(`health-port:${ports.capabilityHealth ? 'set' : 'clear'}`);
                }
            },
            nativeUI: {
                markDirty(id) { events.push(`dirty:${id}`); }, tick() { events.push('tick'); },
                _clearRetryTimer() { events.push('clear-retry'); },
                closeAllDialogs(reason) { events.push(`dialogs:${reason}`); },
                disposeDialogs(reason) { events.push(`dispose-dialogs:${reason}`); }
            },
            guidedTour: { _overlay: {}, stop() { events.push('tour-stop'); } },
            counter: { state: { isExpanded: true } },
            adapter: { isReady: () => true },
            logger: { error(message, details) { events.push(`error:${message}:${details.phase || ''}`); } },
            injectNativeStyles() { events.push('native-style'); },
            flushPlatform() { events.push('platform-flush'); },
            documentRef: {
                addEventListener() {}, removeEventListener() {},
                getElementById: () => panelNode
            },
            windowRef: { addEventListener() {}, removeEventListener() {} },
            panelId: 'panel',
            timings: { SLOW_POLL: 50 },
            onReady() { events.push('ready'); },
            createApplication(options) { deps.options = options; return app; },
            events,
            app,
            setPanelNode(value) { panelNode = value; }
        };
        return Object.assign(deps, overrides);
    }

    it('assembles callbacks and lifecycle hooks with idempotent styles and teardown', async () => {
        const deps = fixture();
        const composition = createPrimerComposition(deps);
        assert.equal(composition.application, deps.app);
        assert.equal(composition.ensureStyles(), true);
        assert.equal(composition.ensureStyles(), false);

        composition.registryCallbacks.onModuleEnabled({ id: 'plain' });
        composition.registryCallbacks.onModuleEnabled({ id: 'native', injectNativeUI() { deps.events.push('inject'); } });
        composition.registryCallbacks.onModuleEnabled({ id: 'broken', injectNativeUI() { throw new Error('bad'); } });
        composition.registryCallbacks.onModulesChanged();
        composition.registryCallbacks.onModuleError({ id: 'broken', phase: 'enable', error: new Error('bad') });

        await deps.options.beforeStart();
        assert.equal(await deps.options.onVisible(), undefined);
        deps.options.onHidden();
        await deps.options.onPageHide();
        assert.equal(deps.options.isReady(), true);
        await deps.options.onReady();
        deps.options.onError(new Error('background'), 'poll');
        await deps.options.afterStop();

        assert.ok(deps.events.includes('dirty:broken'));
        assert.ok(deps.events.includes('details'));
        assert.ok(deps.events.includes('tour-stop'));
        assert.ok(deps.events.includes('remove'));
        assert.equal(deps.options.poll, deps.sessionBridge.poll);
        assert.equal(deps.options.pollInterval, 50);
    });

    it('awaits counter persistence before platform flush on pagehide and stop', async () => {
        const deps = fixture();
        const order = [];
        let releaseCounter;
        deps.sessionBridge.flushCounter = () => {
            order.push('counter:start');
            return new Promise(resolve => {
                releaseCounter = () => { order.push('counter:end'); resolve(true); };
            });
        };
        deps.flushPlatform = async () => { order.push('platform'); };
        createPrimerComposition(deps);

        const pagehide = deps.options.onPageHide();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(order, ['counter:start']);
        releaseCounter();
        await pagehide;
        assert.deepEqual(order, ['counter:start', 'counter:end', 'platform']);

        order.length = 0;
        const stopped = deps.options.afterStop();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(order, ['counter:start']);
        releaseCounter();
        await stopped;
        assert.deepEqual(order, ['counter:start', 'counter:end', 'platform']);
    });

    it('propagates platform flush failures and aggregates teardown failures', async () => {
        const pagehide = fixture({ flushPlatform() { throw new Error('flush rejected'); } });
        createPrimerComposition(pagehide);
        await assert.rejects(pagehide.options.onPageHide(), /flush rejected/);

        const stopped = fixture({ flushPlatform() { throw new Error('flush rejected'); } });
        delete stopped.nativeUI.disposeDialogs;
        stopped.nativeUI.closeAllDialogs = () => { throw new Error('dialog cleanup rejected'); };
        createPrimerComposition(stopped);
        const error = await stopped.options.afterStop().catch(value => value);
        assert.equal(error instanceof AggregateError, true);
        assert.deepEqual(error.errors.map(entry => entry.message), [
            'dialog cleanup rejected', 'flush rejected'
        ]);
        assert.match(error.message, /teardown failed/);
    });

    it('covers absent optional UI hooks, collapsed/no panel, and compatible defaults', async () => {
        const deps = fixture({
            nativeUI: { markDirty() {}, tick() {} },
            guidedTour: { _overlay: null },
            counter: { state: { isExpanded: false } }
        });
        const composition = createPrimerComposition(deps);
        deps.setPanelNode(null);
        composition.registryCallbacks.onModulesChanged();
        await deps.options.afterStop();

        const collapsed = fixture({ counter: { state: { isExpanded: false } } });
        const collapsedComposition = createPrimerComposition(collapsed);
        collapsedComposition.registryCallbacks.onModulesChanged();
        assert.doesNotMatch(collapsed.events.join(','), /details/);
    });

    it('uses PrimerApplication by default and validates every public boundary', async () => {
        const deps = fixture();
        delete deps.createApplication;
        const composition = createPrimerComposition(deps);
        assert.equal(typeof composition.application.start, 'function');
        await composition.application.start();
        await composition.application.stop('test');

        const invalid = fixture();
        assert.throws(() => createPrimerComposition({ ...invalid, registry: null }), /requires registry/);
        assert.throws(() => createPrimerComposition({ ...invalid, injectNativeStyles: null }), /must be a function/);
        assert.throws(() => createPrimerComposition({ ...invalid, flushPlatform: null }), /flushPlatform/);
        assert.throws(() => createPrimerComposition({ ...invalid, onReady: null }), /must be a function/);
        assert.throws(() => createPrimerComposition({ ...invalid, createApplication: null }), /must be a function/);
        assert.throws(() => createPrimerComposition({ ...invalid, createApplication: () => null }), /incompatible/);
        assert.throws(() => createPrimerComposition({ ...invalid, createApplication: () => ({ start() {} }) }), /incompatible/);
    });

    it('owns an optional capability-health service through the application scope', async () => {
        const events = [];
        const healthService = {
            async start() { events.push('health:start'); return { generation: 1 }; },
            async refresh() { events.push('health:refresh'); return { generation: 2 }; },
            stop() { events.push('health:stop'); },
            getSnapshot() { return { generation: 1 }; },
            subscribe(listener) {
                events.push('health:subscribe');
                this.listener = listener;
                return () => events.push('health:unsubscribe');
            },
            isStarted() { return true; }
        };
        const deps = fixture({ healthService });
        const composition = createPrimerComposition(deps);
        const cleanups = [];
        deps.options.beforeStart();
        await deps.options.afterStart({
            defer(callback, label) { cleanups.push(callback); events.push(`defer:${label}`); }
        });
        assert.equal(composition.healthService, healthService);
        assert.deepEqual(events, [
            'defer:Capability Health',
            'health:subscribe',
            'defer:Capability Health panel subscription',
            'health:start'
        ]);
        healthService.listener();
        assert.ok(deps.events.includes('panel-update'));
        deps.setPanelNode(null);
        const panelUpdates = deps.events.filter(event => event === 'panel-update').length;
        healthService.listener();
        assert.equal(deps.events.filter(event => event === 'panel-update').length, panelUpdates);
        await deps.options.onVisible();
        await deps.options.onReady();
        assert.deepEqual(events.slice(-2), ['health:refresh', 'health:refresh']);
        for (const cleanup of cleanups.reverse()) await cleanup();
        assert.deepEqual(events.slice(-2), ['health:unsubscribe', 'health:stop']);
        await deps.options.afterStop();
        assert.ok(deps.events.includes('health-port:set'));
        assert.ok(deps.events.includes('health-port:clear'));

        const idleEvents = [];
        const idle = fixture({
            healthService: {
                start() {}, refresh() { idleEvents.push('refresh'); }, stop() {}, getSnapshot() {}, subscribe() {},
                isStarted: () => false
            }
        });
        createPrimerComposition(idle);
        await idle.options.onVisible();
        await idle.options.onReady();
        assert.deepEqual(idleEvents, []);

        const invalid = fixture();
        for (const service of [
            {},
            { start() {} },
            { start() {}, refresh() {} },
            { start() {}, refresh() {}, stop() {} },
            { start() {}, refresh() {}, stop() {}, getSnapshot() {} },
            { start() {}, refresh() {}, stop() {}, getSnapshot() {}, subscribe() {} }
        ]) {
            assert.throws(() => createPrimerComposition({ ...invalid, healthService: service }), /healthService/);
        }
        assert.throws(() => createPrimerComposition({
            ...invalid,
            panel: {},
            healthService
        }), /configureShellPorts/);
    });

    it('refreshes Portable Archive only after registry start and module transitions, then stops it with the scope', async () => {
        const events = [];
        const archiveWiring = {
            async refresh() { events.push('archive:refresh'); },
            stop() { events.push('archive:stop'); }
        };
        const deps = fixture({ archiveWiring });
        const composition = createPrimerComposition(deps);
        assert.equal(composition.archiveWiring, archiveWiring);
        await composition.registryCallbacks.onModuleEnabled({ id: 'enabled' });
        await composition.registryCallbacks.onModuleDisabled({ id: 'disabled' });
        const cleanups = [];
        await deps.options.afterStart({
            defer(callback, label) { cleanups.push(callback); events.push(`defer:${label}`); }
        });
        assert.deepEqual(events, [
            'archive:refresh',
            'archive:refresh',
            'defer:Portable Archive wiring',
            'archive:refresh'
        ]);
        await cleanups[0]();
        assert.equal(events.at(-1), 'archive:stop');

        assert.throws(() => createPrimerComposition({ ...fixture(), archiveWiring: {} }), /archiveWiring/);
        assert.throws(() => createPrimerComposition({
            ...fixture(), archiveWiring: { refresh() {}, stop: true }
        }), /archiveWiring/);
    });
});

describe('public bridge', () => {
    it('reports lifecycle, adapter, module, and local UI state deterministically', () => {
        const nodes = {
            panel: {},
            'g-details-pane': { classList: { contains: value => value === 'expanded' } },
            'gc-export-native': {}
        };
        const registry = {
            modules: { z: {}, a: {} },
            enabledModules: new Set(['z', 'a']),
            host: { list: () => [{ id: 'a', state: 'started' }] }
        };
        const report = createProbeReporter({
            appName: 'Primer++', version: '13', application: { state: 'started' },
            adapter: { getRuntimeProbeReport: () => ({ healthy: true }) },
            registry,
            documentRef: { getElementById: id => nodes[id] || null },
            panelId: 'panel',
            healthService: {
                getSnapshot: () => ({
                    schemaVersion: 1,
                    generation: 2,
                    features: [{
                        id: 'composer', status: 'available', action: 'run',
                        secret: 'must-not-leak',
                        selectorHealth: { checks: [{ id: 'composer', required: true, ok: true }] }
                    }],
                    privateAccount: 'must-not-leak'
                })
            },
            now: () => new Date('2026-08-01T00:00:00.000Z')
        })();
        assert.deepEqual(report.modules.registered, ['a', 'z']);
        assert.deepEqual(report.modules.enabled, ['a', 'z']);
        assert.equal(report.generatedAt, '2026-08-01T00:00:00.000Z');
        assert.equal(report.localUI.detailsPaneExpanded, true);
        assert.equal(report.capabilityHealth.features[0].id, 'composer');
        assert.doesNotMatch(JSON.stringify(report.capabilityHealth), /secret|privateAccount|must-not-leak/);

        registry.host = null;
        delete nodes.panel;
        delete nodes['g-details-pane'];
        delete nodes['gc-export-native'];
        const empty = createProbeReporter({
            appName: 'App', version: '0', application: { state: 'stopped' },
            adapter: { getRuntimeProbeReport: () => ({}) }, registry,
            documentRef: { getElementById: id => nodes[id] || null }, panelId: 'panel'
        })();
        assert.deepEqual(empty.modules.states, []);
        assert.equal(empty.capabilityHealth, null);
        assert.match(empty.generatedAt, /^\d{4}-\d{2}-\d{2}T/);

        const stringTime = createProbeReporter({
            appName: 'App', version: '0', application: { state: 'stopped' },
            adapter: { getRuntimeProbeReport: () => ({}) }, registry,
            documentRef: { getElementById: () => null }, panelId: 'panel',
            now: () => 'timestamp'
        })();
        assert.equal(stringTime.generatedAt, 'timestamp');
        assert.deepEqual(empty.localUI, {
            panelPresent: false,
            detailsPanePresent: false,
            detailsPaneExpanded: false,
            exportButtonPresent: false
        });
    });

    it('installs and idempotently removes legacy globals while restoring descriptors', () => {
        const globalObject = {};
        Object.defineProperty(globalObject, 'oldProbe', {
            configurable: true, enumerable: false, writable: false, value: 'old'
        });
        const getProbeReport = () => 'report';
        const start = () => 'start';
        const stop = () => 'stop';
        const cleanup = installPublicGlobals({
            globalObject, getProbeReport, start, stop,
            names: { getProbe: 'oldProbe', start: 'newStart', stop: 'newStop' }
        });
        assert.equal(globalObject.oldProbe(), 'report');
        assert.equal(globalObject.newStart(), 'start');
        assert.equal(globalObject.newStop(), 'stop');
        assert.equal(cleanup(), true);
        assert.equal(globalObject.oldProbe, 'old');
        assert.equal(Object.getOwnPropertyDescriptor(globalObject, 'oldProbe').enumerable, false);
        assert.equal('newStart' in globalObject, false);
        assert.equal(cleanup(), false);

        const defaults = {};
        installPublicGlobals({ globalObject: defaults, getProbeReport, start, stop });
        assert.equal(defaults.__PRIMER_PP_GET_PROBE_REPORT__, getProbeReport);
    });

    it('registers ordered menu commands and rejects malformed public contracts', () => {
        const labels = [];
        const handles = registerMenuCommands((label, handler) => {
            labels.push(label);
            return handler();
        }, [
            { label: 'one', handler: () => 1 },
            { label: 'two', handler: () => 2 }
        ]);
        assert.deepEqual(labels, ['one', 'two']);
        assert.deepEqual(handles, [1, 2]);

        assert.throws(() => createProbeReporter({}), /dependencies/);
        assert.throws(() => createProbeReporter({
            application: {}, adapter: {}, registry: {}, documentRef: {}, now: 1
        }), /now must be a function/);
        assert.throws(() => createProbeReporter({
            application: {}, adapter: {}, registry: {}, documentRef: {}, healthService: {}
        }), /healthService/);
        assert.throws(() => installPublicGlobals({}), /global object/);
        const valid = { globalObject: {}, getProbeReport() {}, start() {}, stop() {} };
        assert.throws(() => installPublicGlobals({ ...valid, start: null }), /start must be a function/);
        assert.throws(() => installPublicGlobals({ ...valid, names: { getProbe: '', start: 'a', stop: 'b' } }), /unique/);
        assert.throws(() => installPublicGlobals({ ...valid, names: { getProbe: 'a', start: 'a', stop: 'b' } }), /unique/);
        assert.throws(() => registerMenuCommands(null, []), /registerMenuCommand/);
        assert.throws(() => registerMenuCommands(() => {}, null), /must be an array/);
        assert.throws(() => registerMenuCommands(() => {}, [null]), /requires a label/);
        assert.throws(() => registerMenuCommands(() => {}, [{ label: '' }]), /requires a label/);
        assert.throws(() => registerMenuCommands(() => {}, [{ label: 'bad', handler: null }]), /handler/);
    });

    it('sanitizes capability-health snapshots and contains unserializable values', () => {
        assert.equal(sanitizeCapabilityHealthSnapshot(null), null);
        assert.equal(sanitizeCapabilityHealthSnapshot('bad'), null);
        assert.equal(sanitizeCapabilityHealthSnapshot([]), null);
        assert.deepEqual(sanitizeCapabilityHealthSnapshot({
            schemaVersion: 1,
            version: '1',
            adapterVersion: null,
            generation: 3,
            generatedAt: 'now',
            features: [{
                id: 'feature', version: '2', checkedAt: 'now', status: 'degraded', action: 'run-degraded',
                reason: { code: 'OPTIONAL_SELECTOR_MISSING', sourceCode: 'SAFE', selectors: ['optional'] },
                selectorHealth: {
                    passed: 0, total: 1, failedRequired: [], failedOptional: ['optional'],
                    checks: [{ id: 'optional', required: false, ok: false }]
                },
                nativeCapability: {
                    id: 'native', policy: 'augment', available: false, owned: false,
                    version: null, reasonCode: null
                },
                callback() {}, privateValue: 'drop'
            }]
        }), {
            schemaVersion: 1,
            version: '1',
            adapterVersion: null,
            generation: 3,
            generatedAt: 'now',
            features: [{
                id: 'feature', version: '2', checkedAt: 'now', status: 'degraded', action: 'run-degraded',
                reason: { code: 'OPTIONAL_SELECTOR_MISSING', sourceCode: 'SAFE', selectors: ['optional'] },
                selectorHealth: {
                    passed: 0, total: 1, failedRequired: [], failedOptional: ['optional'],
                    checks: [{ id: 'optional', required: false, ok: false }]
                },
                nativeCapability: {
                    id: 'native', policy: 'augment', available: false, owned: false,
                    version: null, reasonCode: null
                }
            }]
        });
        const cyclic = { schemaVersion: 1 };
        cyclic.features = [cyclic];
        assert.equal(sanitizeCapabilityHealthSnapshot(cyclic), null);
        assert.equal(sanitizeCapabilityHealthSnapshot({ generation: 1n }), null);
    });
});
