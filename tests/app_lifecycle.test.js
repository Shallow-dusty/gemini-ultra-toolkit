const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let ModuleRegistryController;
let PrimerApplication;

before(async () => {
    ({ ModuleRegistryController } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'module_registry.js')
    ).href));
    ({ PrimerApplication } = await import(pathToFileURL(
        path.join(__dirname, '..', 'src', 'app', 'primer_application.js')
    ).href));
});

function createTimers() {
    let nextHandle = 1;
    const timeouts = new Map();
    const intervals = new Map();
    return {
        timeouts,
        intervals,
        setTimeout(callback, delay, ...args) {
            const handle = nextHandle++;
            timeouts.set(handle, { callback, delay, args });
            return handle;
        },
        clearTimeout(handle) {
            timeouts.delete(handle);
        },
        setInterval(callback, delay, ...args) {
            const handle = nextHandle++;
            intervals.set(handle, { callback, delay, args });
            return handle;
        },
        clearInterval(handle) {
            intervals.delete(handle);
        },
        runNextTimeout() {
            const entry = timeouts.entries().next().value;
            if (!entry) return false;
            const [handle, timer] = entry;
            timeouts.delete(handle);
            timer.callback(...timer.args);
            return true;
        }
    };
}

function createTargets() {
    const documentRef = new EventTarget();
    documentRef.visibilityState = 'visible';
    const windowRef = new EventTarget();
    return { documentRef, windowRef };
}

function flushTasks() {
    return new Promise(resolve => setImmediate(resolve));
}

describe('PrimerApplication', () => {
    it('owns polling, visibility, pagehide, readiness, and DOMWatcher registrations idempotently', async () => {
        const timers = createTimers();
        const { documentRef, windowRef } = createTargets();
        const events = [];
        let pollCount = 0;
        let ready = false;
        const registry = {
            async init() { events.push('registry:init'); },
            async destroy(reason) { events.push(`registry:destroy:${reason}`); }
        };
        const domWatcher = {
            init() { events.push('watcher:init'); },
            register(id) { events.push(`watcher:register:${id}`); },
            unregister(id) { events.push(`watcher:unregister:${id}`); },
            destroy() { events.push('watcher:destroy'); }
        };
        const app = new PrimerApplication({
            registry,
            domWatcher,
            watchers: [
                { id: 'sidebar', match() { return true; }, callback() {} },
                { id: 'header', match() { return false; }, callback() {}, debounce: 25 }
            ],
            documentRef,
            windowRef,
            timers,
            pollInterval: 50,
            poll() { pollCount += 1; },
            onVisible() { events.push('visible'); },
            onHidden() { events.push('hidden'); },
            onPageHide() { events.push('pagehide'); },
            isReady: () => ready,
            onReady() { events.push('ready'); },
            readyTimeout: 500,
            readyPollInterval: 10,
            now: () => 0,
            beforeStart() { events.push('before'); },
            afterStart() { events.push('after'); },
            afterStop(reason) { events.push(`after-stop:${reason}`); }
        });

        const firstStart = app.start();
        const secondStart = app.start();
        assert.equal(firstStart, secondStart);
        assert.equal(await firstStart, app);
        assert.equal(app.state, 'started');
        assert.equal(pollCount, 1);
        assert.equal(timers.intervals.size, 1);
        assert.equal(timers.timeouts.size, 1);
        assert.deepEqual(events.slice(0, 6), [
            'before',
            'registry:init',
            'watcher:init',
            'watcher:register:sidebar',
            'watcher:register:header',
            'after'
        ]);

        timers.runNextTimeout();
        assert.equal(timers.timeouts.size, 1, 'readiness retries remain scope-owned');
        ready = true;
        timers.runNextTimeout();
        await flushTasks();
        assert.equal(events.filter(event => event === 'ready').length, 1);

        documentRef.visibilityState = 'hidden';
        documentRef.dispatchEvent(new Event('visibilitychange'));
        await flushTasks();
        assert.equal(timers.intervals.size, 0);
        assert.equal(events.at(-1), 'hidden');

        documentRef.visibilityState = 'visible';
        documentRef.dispatchEvent(new Event('visibilitychange'));
        await flushTasks();
        assert.equal(timers.intervals.size, 1);
        assert.equal(pollCount, 2);
        assert.equal(events.at(-1), 'visible');

        windowRef.dispatchEvent(new Event('pagehide'));
        await flushTasks();
        assert.equal(events.at(-1), 'pagehide');

        const firstStop = app.stop('test-stop');
        const secondStop = app.stop('test-stop');
        assert.equal(firstStop, secondStop);
        await firstStop;
        assert.equal(app.state, 'stopped');
        assert.equal(timers.intervals.size, 0);
        assert.equal(timers.timeouts.size, 0);
        assert.deepEqual(events.slice(-5), [
            'watcher:unregister:header',
            'watcher:unregister:sidebar',
            'watcher:destroy',
            'registry:destroy:test-stop',
            'after-stop:test-stop'
        ]);

        documentRef.dispatchEvent(new Event('visibilitychange'));
        windowRef.dispatchEvent(new Event('pagehide'));
        await flushTasks();
        assert.equal(events.filter(event => event === 'pagehide').length, 1);

        await app.start();
        assert.equal(events.filter(event => event === 'registry:init').length, 2);
        await app.stop('restart-stop');
    });

    it('rolls back partial startup and can retry cleanly', async () => {
        const timers = createTimers();
        const { documentRef, windowRef } = createTargets();
        const events = [];
        let fail = true;
        const registry = {
            async init() { events.push('registry:init'); },
            async destroy() { events.push('registry:destroy'); }
        };
        const domWatcher = {
            init() { events.push('watcher:init'); },
            register(id) {
                events.push(`register:${id}`);
                if (fail && id === 'second') throw new Error('registration failed');
            },
            unregister(id) { events.push(`unregister:${id}`); },
            destroy() { events.push('watcher:destroy'); }
        };
        const app = new PrimerApplication({
            registry,
            domWatcher,
            watchers: [
                { id: 'first', match() { return true; }, callback() {} },
                { id: 'second', match() { return true; }, callback() {} }
            ],
            documentRef,
            windowRef,
            timers
        });

        await assert.rejects(app.start(), /registration failed/);
        assert.equal(app.state, 'stopped');
        assert.deepEqual(events, [
            'registry:init',
            'watcher:init',
            'register:first',
            'register:second',
            'unregister:first',
            'watcher:destroy',
            'registry:destroy'
        ]);

        fail = false;
        await app.start();
        assert.equal(app.state, 'started');
        await app.stop();
    });

    it('reports rejected pagehide persistence through the lifecycle error channel', async () => {
        const timers = createTimers();
        const { documentRef, windowRef } = createTargets();
        const reports = [];
        const app = new PrimerApplication({
            registry: { async init() {}, async destroy() {} },
            domWatcher: { init() {}, register() {}, unregister() {}, destroy() {} },
            documentRef,
            windowRef,
            timers,
            onPageHide: async () => { throw new Error('storage flush rejected'); },
            onError(error, phase) { reports.push(`${phase}:${error.message}`); }
        });
        await app.start();
        windowRef.dispatchEvent(new Event('pagehide'));
        await flushTasks();
        assert.deepEqual(reports, ['pagehide:storage flush rejected']);
        assert.equal(app.state, 'started');
        await app.stop();
    });
});

describe('ModuleRegistryController integration', () => {
    it('wraps legacy hooks in ModuleHost and rolls failed async toggles back', async () => {
        const values = new Map();
        const storage = {
            get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
            set(key, value) { values.set(key, value); }
        };
        const logger = { debug() {}, info() {}, error() {} };
        const registry = new ModuleRegistryController({ storage, logger });
        const events = [];
        let failStart = true;
        let failStop = false;
        const module = {
            id: 'fragile',
            defaultEnabled: false,
            async init() {
                events.push(`init:${this === module}`);
                if (failStart) throw new Error('start failed');
            },
            async destroy(context) {
                events.push(`destroy:${context?.failedStart === true}`);
                if (failStop) {
                    failStop = false;
                    throw new Error('stop failed');
                }
            },
            async onUserChange(user) {
                events.push(`user:${user}:${this === module}`);
            }
        };
        registry.register(module);
        await registry.init('guest');

        await assert.rejects(registry.toggle('fragile', true), /failed to start/);
        assert.equal(registry.isEnabled('fragile'), false);
        assert.deepEqual(values.values().next().value, ['fragile']);
        assert.deepEqual(events, ['init:true', 'destroy:true']);

        failStart = false;
        assert.equal(await registry.toggle('fragile', true), true);
        assert.equal(registry.isEnabled('fragile'), true);
        await registry.notifyUserChange('signed-in');
        assert.equal(events.at(-1), 'user:signed-in:true');

        failStop = true;
        await assert.rejects(registry.toggle('fragile', false), /failed to stop cleanly/);
        assert.equal(registry.isEnabled('fragile'), true, 'failed disable restarts the legacy module');
        assert.equal(registry.host.getState('fragile').state, 'started');

        assert.equal(await registry.toggle('fragile', false), false);
        assert.equal(registry.isEnabled('fragile'), false);
        await registry.destroy();
    });

    it('keeps UI dependencies at the composition root and the panel shell independent of Counter', () => {
        const root = path.join(__dirname, '..');
        const registry = fs.readFileSync(path.join(root, 'src', 'module_registry.js'), 'utf8');
        const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');

        assert.doesNotMatch(registry, /from ['"]\.\/native_ui\.js['"]/);
        assert.doesNotMatch(registry, /from ['"]\.\/panel_ui\.js['"]/);
        assert.match(main, /ModuleRegistry\.configure\(\{/);
        assert.match(main, /export function startPrimer\(\)/);
        assert.match(main, /export function stopPrimer\(reason = 'Primer\+\+ stopped'\)/);
        assert.match(main, /function onPanelRemoved\(\) \{\s*\/\/[^\n]+\s*PanelUI\.create\(\);/);
        assert.match(main, /function onDOMStructureChange\(\) \{[\s\S]*?PanelUI\.create\(\);/);
        assert.doesNotMatch(
            main.match(/function onPanelRemoved\(\)[\s\S]*?\n\}/)?.[0] || '',
            /isEnabled\('counter'\)/
        );
    });
});
