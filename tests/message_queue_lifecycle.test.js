const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const queueFeature = import('../src/features/message_queue/index.js');
const queueModule = import('../src/modules/message_queue.js');

class FakeEvent {
    constructor(type, options = {}) {
        this.type = type;
        Object.assign(this, options);
    }

    stopPropagation() {
        this.stopped = true;
    }
}

class FakeEventTarget {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(name, handler) {
        if (!this.listeners.has(name)) this.listeners.set(name, new Set());
        this.listeners.get(name).add(handler);
    }

    removeEventListener(name, handler) {
        this.listeners.get(name)?.delete(handler);
    }

    emit(name) {
        for (const handler of this.listeners.get(name) || []) handler(new FakeEvent(name));
    }

    listenerCount(name) {
        return this.listeners.get(name)?.size || 0;
    }
}

class FakeElement extends FakeEventTarget {
    constructor(tagName, documentRef) {
        super();
        this.tagName = String(tagName).toUpperCase();
        this.ownerDocument = documentRef;
        this.children = [];
        this.parentNode = null;
        this.style = {};
        this.className = '';
        this.id = '';
        this.title = '';
        this.textContent = '';
        this.events = [];
    }

    get firstChild() {
        return this.children[0] || null;
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    insertBefore(child, before) {
        child.parentNode = this;
        const index = this.children.indexOf(before);
        if (index < 0) this.children.push(child);
        else this.children.splice(index, 0, child);
        return child;
    }

    dispatchEvent(event) {
        this.events.push(event);
        for (const handler of this.listeners.get(event.type) || []) handler(event);
        return this.dispatchResult !== false;
    }

    focus() {
        this.focused = true;
    }
}

class FakeDocument extends FakeEventTarget {
    constructor() {
        super();
        this.visibilityState = 'visible';
        this.body = new FakeElement('body', this);
        this.range = {
            selected: null,
            collapsed: null,
            selectNodeContents: node => { this.range.selected = node; },
            collapse: value => { this.range.collapsed = value; }
        };
    }

    createElement(tagName) {
        return new FakeElement(tagName, this);
    }

    createTextNode(text) {
        const node = new FakeElement('#text', this);
        node.textContent = text;
        return node;
    }

    createRange() {
        return this.range;
    }

    getElementById(id) {
        const visit = node => {
            if (node.id === id) return node;
            for (const child of node.children || []) {
                const found = visit(child);
                if (found) return found;
            }
            return null;
        };
        return visit(this.body);
    }
}

class FakeTimers {
    constructor() {
        this.nextId = 1;
        this.scheduled = new Map();
        this.cleared = [];
        this.delayImpl = async () => {};
    }

    set(callback, delay) {
        const id = this.nextId++;
        this.scheduled.set(id, { callback, delay });
        return id;
    }

    clear(id) {
        this.cleared.push(id);
        this.scheduled.delete(id);
    }

    delay(ms) {
        return this.delayImpl(ms);
    }

    deferDelay() {
        let release;
        this.delayImpl = () => new Promise(resolve => { release = resolve; });
        return () => release();
    }
}

function allElements(root) {
    const result = [];
    const visit = node => {
        result.push(node);
        for (const child of node.children || []) visit(child);
    };
    visit(root);
    return result;
}

async function createFacadeHarness(overrides = {}) {
    const { createLegacyMessageQueueModule } = await queueFeature;
    const document = overrides.document || new FakeDocument();
    const navigation = overrides.navigation || new FakeEventTarget();
    const selection = {
        ranges: [],
        removeAllRanges() { this.ranges.length = 0; },
        addRange(range) { this.ranges.push(range); }
    };
    const window = overrides.window || Object.assign(new FakeEventTarget(), {
        location: { href: 'https://gemini.google.com/app/one' },
        navigation,
        getSelection: () => selection
    });
    const storage = { ...(overrides.storage || {}) };
    const writes = [];
    const environment = overrides.environment || {
        document,
        window,
        Event: FakeEvent,
        InputEvent: FakeEvent,
        Date,
        setTimeout,
        clearTimeout,
        GM_getValue(key, fallback) {
            return Object.prototype.hasOwnProperty.call(storage, key)
                ? structuredClone(storage[key])
                : fallback;
        },
        GM_setValue(key, value) {
            storage[key] = structuredClone(value);
            writes.push({ key, value: structuredClone(value) });
        }
    };
    const trailing = document.createElement('div');
    document.body.appendChild(trailing);
    const editor = document.createElement('textarea');
    editor.value = overrides.editorText || '';
    let clicks = 0;
    const sendButton = { click() { clicks += 1; } };
    const adapter = overrides.adapter || {
        getActiveToolMode: () => ({ active: false, label: '' }),
        getInputEditor: () => editor,
        getSendButton: () => sendButton,
        isSendButtonElement: button => button === sendButton,
        getInputTrailingActions: () => trailing
    };
    let currentUser = 'first@example.com';
    const logs = [];
    const toasts = [];
    const removals = [];
    let renders = 0;
    const timers = overrides.timers || new FakeTimers();
    const facade = createLegacyMessageQueueModule({
        environment,
        core: overrides.core || { getCurrentUser: () => currentUser },
        logger: overrides.logger || { info: (...args) => logs.push(args) },
        nativeUI: overrides.nativeUI || {
            t: (_zh, en) => en,
            remove: id => removals.push(id),
            showToast: message => toasts.push(message)
        },
        panelUI: overrides.panelUI || { renderDetailsPane: () => { renders += 1; } },
        adapter,
        createIcon: overrides.createIcon || ((name, size) => {
            const icon = document.createElement('i');
            icon.textContent = `${name}:${size}`;
            return icon;
        }),
        labels: overrides.labels || { name: 'Message Queue', description: 'Queue', sendInterval: 'Send interval' },
        timers,
        now: overrides.now || (() => '2026-08-01T00:00:00.000Z'),
        makeIdPrefix: overrides.makeIdPrefix || (() => 'test'),
        startDelayMs: 0,
        sendReadyDelayMs: 0,
        repository: overrides.repository,
        delivery: overrides.delivery
    });
    return {
        adapter,
        document,
        editor,
        environment,
        facade,
        get clicks() { return clicks; },
        get renders() { return renders; },
        logs,
        navigation,
        removals,
        selection,
        sendButton,
        setCurrentUser(user) { currentUser = user; },
        storage,
        timers,
        toasts,
        trailing,
        window,
        writes
    };
}

describe('legacy Message Queue adapters', () => {
    it('validates adapter boundaries and keeps storage, context, and timers injected', async () => {
        const {
            createLegacyQueueContext,
            createLegacyQueueDelivery,
            createLegacyQueueRepository,
            createLegacyQueueTimers
        } = await queueFeature;
        assert.throws(() => createLegacyQueueRepository(null), /environment must be an object/);
        assert.throws(() => createLegacyQueueContext({ core: null, environment: {} }), /Core capability/);
        assert.throws(() => createLegacyQueueContext({ core: {}, environment: {}, storageKey: 'key' }), /getCurrentUser/);
        assert.throws(
            () => createLegacyQueueContext({ core: { getCurrentUser() {} }, environment: {}, storageKey: '' }),
            /storageKey is required/
        );
        assert.throws(() => createLegacyQueueTimers(null), /environment must be an object/);
        assert.throws(() => createLegacyQueueTimers({ setTimeout() {} }), /timer functions/);
        assert.throws(() => createLegacyQueueDelivery({ adapter: null, environment: {} }), /Gemini adapter/);
        assert.throws(() => createLegacyQueueDelivery({ adapter: {}, environment: null }), /environment/);
        const adapterMethods = ['getActiveToolMode', 'getInputEditor', 'getSendButton', 'isSendButtonElement'];
        const complete = Object.fromEntries(adapterMethods.map(name => [name, () => null]));
        for (const method of adapterMethods) {
            assert.throws(
                () => createLegacyQueueDelivery({ adapter: { ...complete, [method]: null }, environment: {} }),
                new RegExp(`adapter.${method}`)
            );
        }

        const fallbackRepository = createLegacyQueueRepository({});
        assert.equal(fallbackRepository.read('key', 'fallback'), 'fallback');
        assert.equal(fallbackRepository.write('key', 'value'), undefined);
        const values = {};
        const repository = createLegacyQueueRepository({
            GM_getValue: (key, fallback) => values[key] ?? fallback,
            GM_setValue: (key, value) => { values[key] = value; return 'saved'; }
        });
        assert.equal(repository.read('key', 'fallback'), 'fallback');
        assert.equal(repository.write('key', 'value'), 'saved');
        assert.equal(repository.read('key', 'fallback'), 'value');

        const environment = {
            document: { visibilityState: 'hidden' },
            window: { location: { href: ' route ' } }
        };
        let user = 'person@example.com';
        const getContext = createLegacyQueueContext({
            core: { getCurrentUser: () => user }, environment, storageKey: 'base'
        });
        assert.deepEqual(getContext(), {
            storageKey: 'base_person@example.com', routeKey: ' route ', visible: false
        });
        user = 'Guest';
        environment.document.visibilityState = 'visible';
        assert.equal(getContext().storageKey, 'base');
        environment.window.location.href = '';
        assert.equal(getContext().routeKey, '');
        environment.window = { get location() { throw new Error('blocked'); } };
        assert.equal(getContext().routeKey, '');

        const scheduled = [];
        const timerEnvironment = {
            setTimeout(callback, delay) { scheduled.push({ callback, delay }); return 4; },
            clearTimeout(handle) { scheduled.push({ cleared: handle }); }
        };
        const timers = createLegacyQueueTimers(timerEnvironment);
        assert.equal(timers.set(() => {}, 12), 4);
        timers.clear(4);
        const delayed = timers.delay(9);
        assert.equal(scheduled[2].delay, 9);
        scheduled[2].callback();
        await delayed;
    });

    it('supports textarea and contenteditable staging plus explicit commit preparation', async () => {
        const {
            clearLegacyEditor,
            createLegacyQueueDelivery,
            getLegacyEditorText,
            insertLegacyEditorText
        } = await queueFeature;
        const harness = await createFacadeHarness();
        const { adapter, document, editor, environment, selection, sendButton } = harness;
        assert.equal(getLegacyEditorText({ getInputEditor: () => null }), '');
        editor.value = ' value ';
        assert.equal(getLegacyEditorText(adapter), 'value');
        clearLegacyEditor(environment, editor);
        assert.equal(editor.value, '');
        insertLegacyEditorText(environment, editor, 'textarea text');
        assert.equal(editor.value, 'textarea text');
        assert.equal(editor.focused, true);

        const rich = document.createElement('div');
        rich.textContent = ' rich ';
        assert.equal(getLegacyEditorText({ getInputEditor: () => rich }), 'rich');
        clearLegacyEditor(environment, rich);
        rich.dispatchResult = false;
        insertLegacyEditorText(environment, rich, 'fallback text');
        assert.equal(rich.children[0].textContent, 'fallback text');
        assert.equal(document.range.selected, rich);
        assert.equal(document.range.collapsed, false);
        assert.equal(selection.ranges.length, 1);

        const emptyAccepted = document.createElement('div');
        insertLegacyEditorText(environment, emptyAccepted, 'empty fallback');
        assert.equal(emptyAccepted.children[0].textContent, 'empty fallback');

        const accepted = document.createElement('div');
        accepted.dispatchEvent = event => {
            accepted.events.push(event);
            if (event.type === 'beforeinput') accepted.textContent = event.data;
            return true;
        };
        insertLegacyEditorText(environment, accepted, 'accepted');
        assert.equal(accepted.children.length, 0);

        let currentEditor = editor;
        let currentButton = sendButton;
        let mode = null;
        const delivery = createLegacyQueueDelivery({
            environment,
            adapter: {
                getActiveToolMode: () => mode,
                getInputEditor: () => currentEditor,
                getSendButton: () => currentButton,
                isSendButtonElement: button => button === sendButton
            }
        });
        assert.deepEqual(delivery.inspect(), {
            toolModeActive: false, toolModeLabel: undefined, editorReady: true
        });
        mode = { active: true, label: 'Canvas' };
        assert.equal(delivery.inspect().toolModeActive, true);
        const staged = delivery.stage('delivery text');
        assert.equal(staged.ok, true);
        assert.equal(staged.reason, '');
        assert.equal(Object.isFrozen(staged.baseline), true);
        assert.equal(staged.baseline.editor, editor);
        assert.equal(staged.baseline.text, 'delivery text');
        assert.deepEqual(delivery.verifyStage(staged.baseline), { ok: true, reason: '' });
        assert.equal(delivery.getEditor(), editor);
        assert.equal(delivery.getEditorText(), 'delivery text');
        editor.value = 'user text';
        assert.deepEqual(delivery.verifyStage(staged.baseline), {
            ok: false,
            reason: 'Queue send cancelled: composer text changed'
        });
        editor.value = 'delivery text';
        currentEditor = document.createElement('textarea');
        assert.deepEqual(delivery.verifyStage(staged.baseline), {
            ok: false,
            reason: 'Queue send cancelled: composer editor changed'
        });
        assert.deepEqual(delivery.verifyStage(null), {
            ok: false,
            reason: 'Queue send cancelled: composer baseline unavailable'
        });
        assert.deepEqual(delivery.verifyStage({}), {
            ok: false,
            reason: 'Queue send cancelled: composer baseline unavailable'
        });
        currentEditor = editor;
        delivery.clearEditor(editor);
        currentEditor = null;
        assert.deepEqual(delivery.stage('missing'), { ok: false, reason: 'Input editor unavailable' });
        currentButton = {};
        assert.equal(delivery.prepareCommit(), null);
        currentButton = sendButton;
        delivery.prepareCommit()();
        assert.equal(harness.clicks, 1);

        const stubbornEditor = {
            get value() { return ''; },
            set value(_value) {},
            dispatchEvent() { return true; },
            focus() {}
        };
        const mismatch = createLegacyQueueDelivery({
            environment,
            adapter: {
                getActiveToolMode: () => null,
                getInputEditor: () => stubbornEditor,
                getSendButton: () => sendButton,
                isSendButtonElement: () => true
            }
        });
        assert.deepEqual(mismatch.stage('blocked'), {
            ok: false,
            reason: 'Queue composer staging mismatch'
        });
    });
});

describe('legacy Message Queue view', () => {
    it('validates view dependencies', async () => {
        const { LegacyMessageQueueView } = await queueFeature;
        const valid = await createFacadeHarness();
        const options = {
            environment: valid.environment,
            nativeUI: { t: (_zh, en) => en, remove() {} },
            adapter: valid.adapter,
            createIcon: () => valid.document.createElement('i'),
            actions: {}
        };
        for (const field of ['environment', 'nativeUI', 'adapter', 'actions']) {
            assert.throws(() => new LegacyMessageQueueView({ ...options, [field]: null }), new RegExp(field === 'nativeUI' ? 'NativeUI' : field));
        }
        assert.throws(() => new LegacyMessageQueueView({ ...options, createIcon: null }), /createIcon/);
        assert.throws(() => new LegacyMessageQueueView({ ...options, nativeUI: { remove() {} } }), /translation/);
        assert.throws(() => new LegacyMessageQueueView({ ...options, nativeUI: { t() {} } }), /translation/);
    });

    it('renders every state and routes semantic controls to injected actions', async () => {
        const { createLegacyMessageQueueView } = await queueFeature;
        const harness = await createFacadeHarness();
        const calls = [];
        const actions = new Proxy({}, {
            get(_target, property) {
                return (...args) => calls.push([property, ...args]);
            }
        });
        let trailing = null;
        const adapter = { getInputTrailingActions: () => trailing };
        const view = createLegacyMessageQueueView({
            environment: harness.environment,
            nativeUI: {
                t: (_zh, en) => en,
                remove: id => calls.push(['removeNative', id])
            },
            adapter,
            createIcon: (name, size) => {
                const icon = harness.document.createElement('i');
                icon.textContent = `${name}:${size}`;
                return icon;
            },
            actions
        });
        assert.equal(view.document, harness.document);
        assert.equal(view.t('中', 'English'), 'English');
        assert.equal(view.injectNativeUI(), false);
        trailing = harness.trailing;
        assert.equal(view.injectNativeUI(), true);
        assert.equal(view.injectNativeUI(), false);
        const nativeButton = harness.document.getElementById('gc-queue-native');
        const nativeEvent = new FakeEvent('click');
        nativeButton.onclick(nativeEvent);
        assert.equal(nativeEvent.stopped, true);
        view.removeNativeUI();

        const empty = harness.document.createElement('section');
        view.render(empty, { paused: true, intervalMs: 1600, items: [], lastError: '' });
        assert.match(allElements(empty).map(node => node.textContent).join('|'), /Type a prompt/);
        assert.match(allElements(empty).map(node => node.textContent).join('|'), /Start \/ resume/);

        const items = Array.from({ length: 13 }, (_, index) => ({
            id: `q${index}`,
            title: `Item ${index}`,
            text: `Text ${index}`,
            status: index === 0 ? 'queued' : index === 1 ? 'sent' : index === 2 ? 'cancelled' : 'failed',
            error: index === 0 ? 'item error' : ''
        }));
        const running = harness.document.createElement('section');
        view.render(running, {
            paused: false,
            intervalMs: 2400,
            items,
            lastError: 'queue error'
        });
        const elements = allElements(running);
        assert.equal(elements.some(node => node.textContent === '13. Item 12 [failed]'), false);
        for (const button of elements.filter(node => node.tagName === 'BUTTON')) {
            button.onclick(new FakeEvent('click'));
        }
        const intervalInput = elements.find(node => node.tagName === 'INPUT');
        intervalInput.value = '3.5';
        intervalInput.onchange();

        const paused = harness.document.createElement('section');
        view.render(paused, {
            paused: true,
            intervalMs: 1600,
            items: [{ id: 'done', title: 'Done', text: 'Done', status: 'sent', error: '' }],
            lastError: ''
        });
        for (const button of allElements(paused).filter(node => node.tagName === 'BUTTON')) {
            button.onclick(new FakeEvent('click'));
        }
        assert.equal(calls.some(call => call[0] === 'queueCurrentInput'), true);
        assert.equal(calls.some(call => call[0] === 'startQueue'), true);
        assert.equal(calls.some(call => call[0] === 'pauseQueue'), true);
        assert.equal(calls.some(call => call[0] === 'clearHistory'), true);
        assert.equal(calls.some(call => call[0] === 'moveItem' && call[2] === 'up'), true);
        assert.equal(calls.some(call => call[0] === 'moveItem' && call[2] === 'down'), true);
        assert.equal(calls.some(call => call[0] === 'cancelItem'), true);
        assert.equal(calls.some(call => call[0] === 'removeItem'), true);
        assert.deepEqual(calls.find(call => call[0] === 'setIntervalMs'), ['setIntervalMs', 3500]);
        assert.match(view.getOnboarding().en.features, /send-interval/);
    });
});

describe('LegacyMessageQueueFacade integration', () => {
    it('keeps legacy storage/API metadata and idempotent lifecycle listeners', async () => {
        const key = 'gemini_message_queue_first@example.com';
        const harness = await createFacadeHarness({
            storage: {
                [key]: { paused: false, activeId: 'legacy', items: [{ id: 'legacy', text: 'old', status: 'sending' }] }
            }
        });
        const { facade } = harness;
        assert.equal(facade.id, 'message-queue');
        assert.equal(facade.iconId, 'package');
        assert.equal(facade.defaultEnabled, false);
        assert.equal(facade.STORAGE_KEY, 'gemini_message_queue');
        assert.equal(facade._getStorageKey(), key);
        assert.equal(facade._getRouteKey(), harness.window.location.href);
        assert.equal(facade.init(), true);
        assert.equal(facade.init(), false);
        assert.equal(facade.data.paused, true);
        assert.equal(facade.data.items[0].status, 'queued');
        assert.equal(facade._loadedStorageKey, key);
        assert.equal(facade._generation > 0, true);
        assert.equal(facade._activeRun, null);
        assert.equal(facade._timer, null);
        assert.equal(harness.document.listenerCount('visibilitychange'), 1);
        assert.equal(harness.navigation.listenerCount('navigate'), 1);
        assert.equal(facade._installLifecycleListeners(), false);
        assert.equal(facade._listen({}, 'x', () => {}), false);
        assert.equal(facade._save(), true);
        assert.equal(facade.loadData(), true);
        assert.equal(facade.destroy(), true);
        assert.equal(facade.destroy(), false);
        assert.equal(harness.document.listenerCount('visibilitychange'), 0);
        assert.deepEqual(harness.removals, ['gc-queue-native', 'gc-queue-native']);
        assert.equal(facade.init(), true);
        assert.equal(facade.dispose(), true);
        assert.equal(facade.dispose(), false);
        assert.equal(facade.init(), false);
    });

    it('preserves account, route, visibility, exactly-once, and explicit retry semantics', async () => {
        const account = await createFacadeHarness();
        const releaseAccount = account.timers.deferDelay();
        account.facade.init();
        account.facade.enqueueEntries(['old account'], { idPrefix: 'account' });
        account.facade.startQueue();
        const oldSession = account.facade._session;
        const pendingAccount = account.facade._processNext(oldSession);
        await Promise.resolve();
        account.setCurrentUser('second@example.com');
        account.facade.onUserChange();
        releaseAccount();
        assert.equal(await pendingAccount, false);
        assert.equal(account.clicks, 0);
        assert.equal(account.storage['gemini_message_queue_first@example.com'].items[0].status, 'cancelled');
        assert.equal(
            account.storage['gemini_message_queue_first@example.com'].lastError,
            'Queue send cancelled: session changed'
        );
        assert.equal(account.facade.data.items.length, 0);

        for (const transition of ['visibility', 'route']) {
            const harness = await createFacadeHarness();
            const release = harness.timers.deferDelay();
            harness.facade.init();
            harness.facade.enqueueEntries(['one'], { idPrefix: transition });
            harness.facade.startQueue();
            const pending = harness.facade._processNext(harness.facade._session);
            await Promise.resolve();
            if (transition === 'visibility') {
                harness.document.visibilityState = 'hidden';
                harness.document.emit('visibilitychange');
            } else {
                harness.window.emit('popstate');
            }
            release();
            assert.equal(await pending, false);
            assert.equal(harness.clicks, 0);
            assert.equal(harness.facade.data.paused, true);
            assert.equal(harness.facade.data.items[0].status, 'cancelled');
            assert.equal(
                harness.facade.data.lastError,
                transition === 'visibility'
                    ? 'Queue send cancelled: page hidden'
                    : 'Queue send cancelled: route changed'
            );
            harness.document.visibilityState = 'visible';
            assert.equal(harness.facade.onVisibilityChange(), false);
        }

        const once = await createFacadeHarness();
        const releaseOnce = once.timers.deferDelay();
        once.facade.init();
        once.facade.enqueueEntries(['only once'], { idPrefix: 'once' });
        once.facade.startQueue();
        once.sendButton.click = () => {
            once.navigation.emit('navigate');
        };
        const pending = once.facade._processNext(once.facade._session);
        const duplicate = once.facade._processNext(once.facade._session);
        await Promise.resolve();
        releaseOnce();
        assert.equal(await duplicate, false);
        assert.equal(await pending, true);
        assert.equal(once.facade.data.items[0].status, 'sent');
        assert.equal(once.facade.data.paused, true);
    });

    it('exposes a read-only session-bound portable archive integration and invalidates old ports', async () => {
        const harness = await createFacadeHarness();
        const { facade } = harness;
        assert.throws(
            () => facade.getPortableArchiveIntegration(),
            error => error.code === 'FEATURE_INACTIVE'
        );
        facade.init();
        facade.enqueueEntries([{ id: 'portable-one', text: 'portable body' }]);
        const integration = facade.getPortableArchiveIntegration();
        assert.deepEqual(Object.keys(integration), ['section', 'exportSection', 'contributor']);
        assert.equal(integration.section, 'queue');
        assert.equal(Object.isFrozen(integration), true);
        assert.equal(Object.isFrozen(integration.contributor), true);
        assert.deepEqual(Object.keys(integration.contributor), ['snapshot', 'apply', 'rollback']);

        const exported = await integration.exportSection();
        assert.deepEqual(exported.map(item => item.id), ['portable-one']);
        exported[0].text = 'caller mutation';
        assert.equal(facade.data.items[0].text, 'portable body');
        await assert.rejects(
            integration.exportSection({ signal: { aborted: false } }),
            error => error.code === 'INVALID_ABORT_SIGNAL'
        );
        const abortController = new AbortController();
        abortController.abort();
        await assert.rejects(
            integration.exportSection({ signal: abortController.signal }),
            error => error.code === 'RESTORE_ABORTED'
        );
        const snapshotContext = { section: 'queue', plan: {}, actions: [], signal: null };
        const snapshot = await integration.contributor.snapshot(snapshotContext);
        snapshot.state.items[0].text = 'snapshot mutation';
        assert.equal(facade.data.items[0].text, 'portable body');

        harness.setCurrentUser('portable-second@example.com');
        facade.onUserChange();
        await assert.rejects(integration.exportSection(), error => error.code === 'SESSION_CHANGED');
        await assert.rejects(
            integration.contributor.snapshot(snapshotContext),
            error => error.code === 'SESSION_CHANGED'
        );
        const second = facade.getPortableArchiveIntegration();
        assert.deepEqual(await second.exportSection(), []);
        facade.destroy();
        await assert.rejects(second.exportSection(), error => error.code === 'FEATURE_INACTIVE');
        await assert.rejects(
            second.contributor.snapshot(snapshotContext),
            error => error.code === 'FEATURE_INACTIVE'
        );
        assert.throws(
            () => facade.getPortableArchiveIntegration(),
            error => error.code === 'FEATURE_INACTIVE'
        );
    });

    it('delegates legacy queue, panel, native UI, and compatibility methods', async () => {
        const harness = await createFacadeHarness();
        const { facade } = harness;
        facade.init();
        assert.equal(facade.startQueue(), false);
        assert.equal(facade.queueCurrentInput(), false);
        harness.editor.value = ' current prompt ';
        assert.equal(facade.queueCurrentInput(), true);
        assert.equal(harness.editor.value, '');
        assert.equal(facade.enqueueEntries(['second'], { idPrefix: 'manual' }), 1);
        assert.equal(facade.setIntervalMs(2200), true);
        assert.equal(facade._getIntervalMs(), 2200);
        assert.equal(facade.moveItem('manual_1', 'up'), true);
        assert.equal(facade.cancelItem('manual_1'), true);
        assert.equal(facade.removeItem('manual_1'), true);
        assert.equal(facade.clearHistory(), false);
        assert.equal(facade.startQueue(), true);
        assert.equal(facade._isSessionCurrent(facade._session), true);
        assert.deepEqual(facade._captureSession().storageKey, facade._getStorageKey());
        assert.equal(facade._scheduleProcess(0, facade._session), true);
        facade._timer = null;
        assert.equal(facade.pauseQueue(), true);
        facade._recoverInterruptedItem();
        assert.equal(facade.injectNativeUI(), true);
        assert.equal(facade.injectNativeUI(), false);
        const container = harness.document.createElement('section');
        assert.equal(facade.renderToDetailsPane(container), container);
        assert.match(facade.getOnboarding().zh.features, /发送间隔/);
        assert.equal(facade.removeNativeUI(), undefined);
        assert.equal(harness.toasts.includes('Input is empty'), true);
        assert.equal(harness.toasts.includes('Added to queue'), true);
    });

    it('validates facade dependencies and contains listener cleanup failures', async () => {
        const { LegacyMessageQueueFacade } = await queueFeature;
        assert.throws(() => new LegacyMessageQueueFacade(null), /options must be an object/);
        const valid = await createFacadeHarness();
        const options = {
            environment: valid.environment,
            core: { getCurrentUser: () => 'Guest' },
            logger: { info() {} },
            nativeUI: { t: (_zh, en) => en, remove() {}, showToast() {} },
            panelUI: { renderDetailsPane() {} },
            adapter: valid.adapter,
            createIcon: () => valid.document.createElement('i'),
            timers: valid.timers,
            now: () => '2026-08-01T00:00:00.000Z',
            makeIdPrefix: () => 'id'
        };
        for (const field of ['environment', 'core', 'logger', 'nativeUI', 'panelUI', 'adapter']) {
            assert.throws(() => new LegacyMessageQueueFacade({ ...options, [field]: null }), new RegExp(field, 'i'));
        }
        assert.throws(() => new LegacyMessageQueueFacade({ ...options, createIcon: null }), /createIcon/);
        assert.throws(() => new LegacyMessageQueueFacade({ ...options, logger: {} }), /Logger.info/);
        assert.throws(() => new LegacyMessageQueueFacade({ ...options, panelUI: {} }), /renderDetailsPane/);
        assert.throws(() => new LegacyMessageQueueFacade({ ...options, nativeUI: { t() {}, remove() {} } }), /showToast/);

        const environmentWithoutDate = { ...valid.environment, Date: undefined };
        const defaulted = new LegacyMessageQueueFacade({
            ...options,
            environment: environmentWithoutDate,
            labels: undefined,
            now: undefined,
            makeIdPrefix: undefined
        });
        assert.equal(defaulted.name, 'Message Queue');
        assert.match(defaulted.description, /Queue prompts locally/);
        defaulted.init();
        assert.equal(defaulted.enqueueEntries(['default id']), 1);
        defaulted.dispose();

        const cleanup = await createFacadeHarness();
        const target = new FakeEventTarget();
        target.removeEventListener = () => { throw new Error('host teardown failed'); };
        assert.equal(cleanup.facade._listen(target, 'event', () => {}), true);
        assert.equal(cleanup.facade._removeLifecycleListeners(), true);
        assert.equal(cleanup.facade._removeLifecycleListeners(), false);
    });

    it('keeps src/modules/message_queue.js a directly imported thin compatibility facade', async () => {
        const { MessageQueueModule, createMessageQueueModule } = await queueModule;
        assert.equal(MessageQueueModule.name.length > 0, true);
        assert.equal(typeof MessageQueueModule.setQueueInterval, 'function');
        assert.equal(MessageQueueModule.setQueueInterval(1900), true);
        MessageQueueModule._outbox._reportError('module report');
        const harness = await createFacadeHarness();
        const custom = createMessageQueueModule({
            environment: harness.environment,
            core: { getCurrentUser: () => 'module@example.com' },
            logger: { info() {} },
            nativeUI: { t: (_zh, en) => en, remove() {}, showToast() {} },
            panelUI: { renderDetailsPane() {} },
            adapter: harness.adapter,
            createIcon: () => harness.document.createElement('i'),
            timers: harness.timers,
            now: () => '2026-08-01T00:00:00.000Z',
            makeIdPrefix: () => 'module'
        });
        assert.equal(custom.init(), true);
        assert.equal(custom._getStorageKey(), 'gemini_message_queue_module@example.com');
        custom.destroy();
    });
});
