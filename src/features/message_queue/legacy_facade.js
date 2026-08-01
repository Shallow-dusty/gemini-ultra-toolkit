import {
    createMessageQueueOutbox,
    MESSAGE_QUEUE_OUTBOX_CAPABILITY
} from './outbox.js';
import {
    createLegacyQueueContext,
    createLegacyQueueDelivery,
    createLegacyQueueRepository,
    createLegacyQueueTimers
} from './legacy_adapters.js';
import { createLegacyMessageQueueView } from './legacy_view.js';
import { cloneStorageValue } from '../../storage/clone.js';
import {
    createMessageQueueRestoreContributor,
    MESSAGE_QUEUE_RESTORE_SECTION
} from './restore_contributor.js';
import { QUEUE_STALE_REASONS } from './outbox_support.js';

export const LEGACY_MESSAGE_QUEUE_STORAGE_KEY = 'gemini_message_queue';

function requireObject(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
    return value;
}

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
    return value;
}

function portableIntegrationFailure(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
}

function assertPortableSignal(signal) {
    if (signal === undefined || signal === null) return;
    if (!signal || typeof signal !== 'object' || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
        portableIntegrationFailure('INVALID_ABORT_SIGNAL', 'Message Queue archive signal must implement AbortSignal');
    }
    if (signal.aborted) portableIntegrationFailure('RESTORE_ABORTED', 'Message Queue archive inspection was aborted');
}

export class LegacyMessageQueueFacade {
    constructor(options = {}) {
        requireObject(options, 'Message Queue facade options');
        this.environment = requireObject(options.environment, 'Message Queue environment');
        this.core = requireObject(options.core, 'Message Queue Core capability');
        this.logger = requireObject(options.logger, 'Message Queue Logger capability');
        this.nativeUI = requireObject(options.nativeUI, 'Message Queue NativeUI capability');
        this.panelUI = requireObject(options.panelUI, 'Message Queue PanelUI capability');
        this.adapter = requireObject(options.adapter, 'Message Queue Gemini adapter');
        this.iconFactory = requireFunction(options.createIcon, 'Message Queue createIcon');
        if (typeof this.logger.info !== 'function') throw new TypeError('Message Queue Logger.info must be a function');
        if (typeof this.panelUI.renderDetailsPane !== 'function') {
            throw new TypeError('Message Queue PanelUI.renderDetailsPane must be a function');
        }
        if (typeof this.nativeUI.showToast !== 'function') throw new TypeError('Message Queue NativeUI.showToast must be a function');

        this.id = 'message-queue';
        this.name = options.labels?.name || 'Message Queue';
        this.description = options.labels?.description || 'Queue prompts locally with pause, cancel, and reorder controls';
        this.iconId = 'package';
        this.defaultEnabled = false;
        this.STORAGE_KEY = options.storageKey || LEGACY_MESSAGE_QUEUE_STORAGE_KEY;
        this._lifecycleCleanups = [];

        const DateConstructor = this.environment.Date || Date;
        const now = options.now || (() => new DateConstructor().toISOString());
        const makeIdPrefix = options.makeIdPrefix || (() => `q_${DateConstructor.now()}`);
        this._getContext = createLegacyQueueContext({
            core: this.core,
            environment: this.environment,
            storageKey: this.STORAGE_KEY
        });
        this._delivery = options.delivery || createLegacyQueueDelivery({
            adapter: this.adapter,
            environment: this.environment
        });
        this._repository = options.repository || createLegacyQueueRepository(this.environment);
        this._outbox = createMessageQueueOutbox({
            repository: this._repository,
            delivery: this._delivery,
            timers: options.timers || createLegacyQueueTimers(this.environment),
            getContext: this._getContext,
            now,
            makeIdPrefix,
            notify: () => this.panelUI.renderDetailsPane(),
            reportError: message => this.nativeUI.showToast(message),
            startDelayMs: options.startDelayMs,
            sendReadyDelayMs: options.sendReadyDelayMs
        });
        this._view = createLegacyMessageQueueView({
            environment: this.environment,
            nativeUI: this.nativeUI,
            adapter: this.adapter,
            createIcon: this.iconFactory,
            actions: this,
            labels: options.labels
        });
        this.capabilities = Object.freeze({
            [MESSAGE_QUEUE_OUTBOX_CAPABILITY]: this._outbox.getCapability()
        });
        this._routeHandler = () => this.onRouteChange();
        this._visibilityHandler = () => this.onVisibilityChange();
    }

    get data() {
        return this._outbox.getSnapshot();
    }

    getPortableArchiveIntegration() {
        const initialRuntime = this._outbox.getRuntimeState();
        if (initialRuntime.started !== true || !initialRuntime.loadedStorageKey) {
            portableIntegrationFailure('FEATURE_INACTIVE', 'Message Queue is not active');
        }
        const storageKey = initialRuntime.loadedStorageKey;
        const contributorPort = createMessageQueueRestoreContributor({
            outbox: this._outbox,
            repository: this._repository
        });
        const assertBound = () => {
            const runtime = this._outbox.getRuntimeState();
            if (runtime.started !== true) {
                portableIntegrationFailure('FEATURE_INACTIVE', 'Message Queue is not active');
            }
            if (runtime.loadedStorageKey !== storageKey) {
                portableIntegrationFailure('SESSION_CHANGED', 'Message Queue account changed after archive integration');
            }
        };
        const invoke = method => async context => {
            assertBound();
            const result = await contributorPort[method](context);
            assertBound();
            return cloneStorageValue(result);
        };
        const contributor = Object.freeze({
            snapshot: invoke('snapshot'),
            apply: invoke('apply'),
            rollback: invoke('rollback')
        });
        const exportSection = async ({ signal } = {}) => {
            assertPortableSignal(signal);
            assertBound();
            const items = cloneStorageValue(this._outbox.getSnapshot().items);
            assertPortableSignal(signal);
            assertBound();
            return items;
        };
        return Object.freeze({ section: MESSAGE_QUEUE_RESTORE_SECTION, exportSection, contributor });
    }

    get _timer() {
        return this._outbox.timer;
    }

    set _timer(value) {
        this._outbox.timer = value;
    }

    get _generation() {
        return this._outbox.generation;
    }

    get _session() {
        return this._outbox.session;
    }

    get _activeRun() {
        return this._outbox.activeRun;
    }

    get _loadedStorageKey() {
        return this._outbox.loadedStorageKey;
    }

    _getStorageKey() {
        return this._getContext().storageKey;
    }

    _getRouteKey() {
        return this._getContext().routeKey;
    }

    _listen(target, eventName, handler) {
        if (!target?.addEventListener) return false;
        target.addEventListener(eventName, handler);
        this._lifecycleCleanups.push(() => target.removeEventListener(eventName, handler));
        return true;
    }

    _installLifecycleListeners() {
        if (this._lifecycleCleanups.length > 0) return false;
        this._listen(this.environment.document, 'visibilitychange', this._visibilityHandler);
        this._listen(this.environment.window, 'pagehide', this._routeHandler);
        this._listen(this.environment.window, 'popstate', this._routeHandler);
        this._listen(this.environment.window, 'hashchange', this._routeHandler);
        this._listen(this.environment.window?.navigation, 'navigate', this._routeHandler);
        return true;
    }

    _removeLifecycleListeners() {
        const cleanups = this._lifecycleCleanups.splice(0);
        for (const cleanup of cleanups) {
            try { cleanup(); }
            catch { /* host listeners do not own module teardown */ }
        }
        return cleanups.length > 0;
    }

    init() {
        const started = this._outbox.start();
        if (!started) return false;
        this._installLifecycleListeners();
        this.logger.info('MessageQueueModule initialized', this._outbox.getStats());
        return true;
    }

    destroy() {
        const stopped = this._outbox.stop();
        this._removeLifecycleListeners();
        this.removeNativeUI();
        return stopped;
    }

    dispose() {
        const disposed = this._outbox.dispose();
        this._removeLifecycleListeners();
        this.removeNativeUI();
        return disposed;
    }

    onUserChange() {
        return this._outbox.changeContext();
    }

    onRouteChange() {
        return this._outbox.cancelStaleAttempt(QUEUE_STALE_REASONS.route);
    }

    onVisibilityChange() {
        if (this.environment.document?.visibilityState === 'visible') return false;
        return this._outbox.cancelStaleAttempt(QUEUE_STALE_REASONS.visibility);
    }

    loadData() {
        return this._outbox.reload();
    }

    _save() {
        return this._outbox.persist();
    }

    _captureSession() {
        return this._outbox._captureSession();
    }

    _isSessionCurrent(session) {
        return this._outbox._isSessionCurrent(session);
    }

    _recoverInterruptedItem() {
        return this._outbox._recoverInterruptedItem();
    }

    _scheduleProcess(delay, session) {
        return this._outbox._schedule(delay, session);
    }

    _processNext(session) {
        return this._outbox.processNext(session);
    }

    _getIntervalMs() {
        return this.data.intervalMs;
    }

    injectNativeUI() {
        return this._view.injectNativeUI();
    }

    removeNativeUI() {
        return this._view.removeNativeUI();
    }

    queueCurrentInput() {
        const editor = this._delivery.getEditor();
        const text = this._delivery.getEditorText();
        if (!text) {
            this.nativeUI.showToast(this.nativeUI.t('输入框为空', 'Input is empty'));
            return false;
        }
        this._outbox.enqueue(text);
        if (editor) this._delivery.clearEditor(editor);
        this.nativeUI.showToast(this.nativeUI.t('已加入队列', 'Added to queue'));
        return true;
    }

    enqueueEntries(entries, options = {}) {
        return this._outbox.enqueueEntries(entries, options);
    }

    startQueue() {
        return this._outbox.resume();
    }

    pauseQueue() {
        return this._outbox.pause();
    }

    setIntervalMs(intervalMs) {
        return this._outbox.setInterval(intervalMs);
    }

    cancelItem(id) {
        return this._outbox.cancel(id);
    }

    removeItem(id) {
        return this._outbox.remove(id);
    }

    moveItem(id, direction) {
        return this._outbox.move(id, direction);
    }

    clearHistory() {
        return this._outbox.clearHistory();
    }

    renderToDetailsPane(container) {
        return this._view.render(container, this.data);
    }

    getOnboarding() {
        return this._view.getOnboarding();
    }
}

export function createLegacyMessageQueueModule(options) {
    return new LegacyMessageQueueFacade(options);
}
