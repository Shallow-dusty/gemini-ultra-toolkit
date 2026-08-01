import queueTools from '../../../lib/message_queue_tools.js';
import {
    clean, composerBaseline, composerVerificationFailure, continuationFailure, failureMessage,
    QUEUE_STALE_REASONS, requireDelay, requireFunction, requireMethod, requireObject, stageFailure
} from './outbox_support.js';

const {
    addQueueItem,
    addQueueItems,
    cancelQueueItem,
    clearQueueHistory,
    createQueueRunToken,
    evaluateQueueSafety,
    getNextQueuedItem,
    getQueueStats,
    isQueueRunCurrent,
    markQueueItemFailed,
    markQueueItemSending,
    markQueueItemSent,
    moveQueueItem,
    normalizeQueueData,
    normalizeQueueIntervalMs,
    removeQueueItem,
    setQueueInterval,
    setQueuePaused
} = queueTools;

export const MESSAGE_QUEUE_OUTBOX_CAPABILITY = 'message-queue.outbox';
export const DEFAULT_QUEUE_START_DELAY_MS = 50;
export const DEFAULT_SEND_READY_DELAY_MS = 120;

/**
 * Local Queue/Outbox state machine.
 *
 * It deliberately knows nothing about DOM, Gemini, GM storage, or process-wide
 * singletons. Those boundaries are injected by the legacy facade or a future
 * ModuleHost adapter.
 */
export class MessageQueueOutbox {
    constructor(options = {}) {
        requireObject(options, 'MessageQueueOutbox options');
        this.repository = requireObject(options.repository, 'MessageQueueOutbox repository');
        this.delivery = requireObject(options.delivery, 'MessageQueueOutbox delivery adapter');
        this.timers = requireObject(options.timers, 'MessageQueueOutbox timers');
        for (const method of ['read', 'write']) requireMethod(this.repository, method, 'repository');
        for (const method of ['inspect', 'stage', 'verifyStage', 'prepareCommit']) {
            requireMethod(this.delivery, method, 'delivery');
        }
        for (const method of ['set', 'clear', 'delay']) requireMethod(this.timers, method, 'timers');

        this.getContext = requireFunction(options.getContext, 'MessageQueueOutbox getContext');
        this.now = requireFunction(options.now, 'MessageQueueOutbox now');
        this.makeIdPrefix = requireFunction(options.makeIdPrefix, 'MessageQueueOutbox makeIdPrefix');
        this.notify = options.notify === undefined
            ? () => {}
            : requireFunction(options.notify, 'MessageQueueOutbox notify');
        this.reportError = options.reportError === undefined
            ? () => {}
            : requireFunction(options.reportError, 'MessageQueueOutbox reportError');
        this.startDelayMs = requireDelay(options.startDelayMs, 'startDelayMs', DEFAULT_QUEUE_START_DELAY_MS);
        this.sendReadyDelayMs = requireDelay(options.sendReadyDelayMs, 'sendReadyDelayMs', DEFAULT_SEND_READY_DELAY_MS);

        this.state = normalizeQueueData(null, { nowIso: this.now() });
        this.started = false;
        this.disposed = false;
        this.generation = 0;
        this.loadedStorageKey = '';
        this.session = null;
        this.activeRun = null;
        this.timer = null;
    }

    _timestamp() {
        return clean(this.now());
    }

    _context() {
        const value = this.getContext() || {};
        return {
            storageKey: clean(value.storageKey),
            routeKey: clean(value.routeKey),
            visible: value.visible !== false
        };
    }

    _notify() {
        try { this.notify(this.getSnapshot(), this.getRuntimeState()); }
        catch { /* UI observers never own the outbox */ }
    }

    _reportError(message) {
        try { this.reportError(message); }
        catch { /* reporting failures cannot restart delivery */ }
    }

    _read(storageKey) {
        try { return this.repository.read(storageKey, null); }
        catch { return null; }
    }

    _persist() {
        if (!this.loadedStorageKey) return false;
        try {
            this.repository.write(this.loadedStorageKey, this.getSnapshot());
            return true;
        } catch {
            return false;
        }
    }

    _loadCurrent() {
        const context = this._context();
        this.loadedStorageKey = context.storageKey;
        this.state = normalizeQueueData(this._read(context.storageKey), {
            recoverSending: true,
            nowIso: this._timestamp()
        });
        this.state.paused = true;
        this._persist();
    }

    _invalidate() {
        this.generation += 1;
        if (this.timer !== null) this.timers.clear(this.timer);
        this.timer = null;
        this.session = null;
        this.activeRun = null;
    }

    _captureSession() {
        const context = this._context();
        return createQueueRunToken(this.generation, {
            storageKey: this.loadedStorageKey || context.storageKey,
            routeKey: context.routeKey
        });
    }

    _isSessionCurrent(session) {
        const context = this._context();
        return this.started
            && this.session === session
            && isQueueRunCurrent(session, this.generation, {
                storageKey: context.storageKey,
                routeKey: context.routeKey,
                visible: context.visible,
                paused: this.state.paused
            });
    }

    _continuationFailure(session) {
        return continuationFailure({
            started: this.started,
            session,
            currentSession: this.session,
            generation: this.generation,
            context: this._context(),
            paused: this.state.paused
        });
    }

    _recoverInterruptedItem() {
        if (this.activeRun?.commitStarted) {
            this.state = markQueueItemSent(this.state, this.activeRun.itemId, { nowIso: this._timestamp() });
            return;
        }
        this.state = normalizeQueueData(this.state, {
            recoverSending: true,
            nowIso: this._timestamp()
        });
    }

    _pauseWithError(reason) {
        const message = clean(reason) || 'Queue send failed';
        this.activeRun = null;
        this._invalidate();
        this.state = setQueuePaused(this.state, true, { lastError: message, nowIso: this._timestamp() });
        this._persist();
        this._reportError(message);
        this._notify();
        return false;
    }

    _failRun(run, reason) {
        if (this.activeRun !== run) return false;
        this.activeRun = null;
        this._invalidate();
        const message = clean(reason) || 'Queue send failed';
        this.state = markQueueItemFailed(this.state, run.itemId, message, { nowIso: this._timestamp() });
        this._persist();
        this._reportError(message);
        this._notify();
        return false;
    }

    _cancelRun(run, reason) {
        if (this.activeRun !== run || run.commitStarted) return false;
        const message = clean(reason) || QUEUE_STALE_REASONS.composer;
        this.activeRun = null;
        this._invalidate();
        this.state = cancelQueueItem(this.state, run.itemId, { nowIso: this._timestamp() });
        this.state = setQueuePaused(this.state, true, { lastError: message, nowIso: this._timestamp() });
        this._persist();
        this._reportError(message);
        this._notify();
        return false;
    }

    cancelStaleAttempt(reason) {
        if (!this.started) return false;
        if (!this.activeRun || this.activeRun.commitStarted) return this.pause();
        const run = this.activeRun;
        this._cancelRun(run, reason);
        return true;
    }

    _schedule(delay = this.state.intervalMs, session = this.session) {
        if (this.timer !== null) this.timers.clear(this.timer);
        this.timer = null;
        if (!this._isSessionCurrent(session)) return false;
        this.timer = this.timers.set(() => {
            this.timer = null;
            if (!this._isSessionCurrent(session)) {
                if (this.session === session) this.pause();
                return;
            }
            void this.processNext(session);
        }, delay);
        return true;
    }

    start() {
        if (this.disposed || this.started) return false;
        this.started = true;
        this.generation += 1;
        this._loadCurrent();
        this._notify();
        return true;
    }

    stop() {
        if (!this.started) return false;
        this.pause();
        this.started = false;
        return true;
    }

    dispose() {
        if (this.disposed) return false;
        this.stop();
        this.disposed = true;
        return true;
    }

    reload() {
        if (!this.started) return false;
        this.pause();
        this._loadCurrent();
        this._notify();
        return true;
    }

    changeContext() {
        if (!this.started) return false;
        this.cancelStaleAttempt(QUEUE_STALE_REASONS.session);
        this._loadCurrent();
        this._notify();
        return true;
    }

    getSnapshot() {
        return normalizeQueueData(this.state, { nowIso: this._timestamp() });
    }

    persist() {
        return this._persist();
    }

    getStats() {
        return getQueueStats(this.state);
    }

    getRuntimeState() {
        return Object.freeze({
            activeRun: this.activeRun,
            disposed: this.disposed,
            generation: this.generation,
            loadedStorageKey: this.loadedStorageKey,
            session: this.session,
            started: this.started,
            timer: this.timer
        });
    }

    getCapability() {
        return Object.freeze({
            cancel: this.cancel.bind(this),
            clearHistory: this.clearHistory.bind(this),
            enqueue: this.enqueue.bind(this),
            enqueueEntries: this.enqueueEntries.bind(this),
            getSnapshot: this.getSnapshot.bind(this),
            getStats: this.getStats.bind(this),
            move: this.move.bind(this),
            pause: this.pause.bind(this),
            remove: this.remove.bind(this),
            resume: this.resume.bind(this),
            setInterval: this.setInterval.bind(this)
        });
    }

    enqueue(text, options = {}) {
        const previousLength = this.state.items.length;
        this.state = addQueueItem(this.state, text, {
            ...options,
            id: options.id || `${this.makeIdPrefix()}_1`,
            nowIso: this._timestamp()
        });
        if (this.state.items.length === previousLength) return false;
        this._persist();
        this._notify();
        return true;
    }

    enqueueEntries(entries, options = {}) {
        const result = addQueueItems(this.state, entries, {
            ...options,
            idPrefix: options.idPrefix || this.makeIdPrefix(),
            nowIso: this._timestamp()
        });
        if (result.added === 0) return 0;
        this.state = result.data;
        this._persist();
        this._notify();
        return result.added;
    }

    resume() {
        if (!this.started) return false;
        if (!this.state.paused && this._isSessionCurrent(this.session)) return false;
        if (getQueueStats(this.state).queued === 0) return false;
        this._invalidate();
        this.state = setQueuePaused(this.state, false, { nowIso: this._timestamp() });
        this.session = this._captureSession();
        this._persist();
        this._notify();
        return this._schedule(this.startDelayMs, this.session);
    }

    pause() {
        if (!this.started) return false;
        const changed = !this.state.paused || this.activeRun !== null || this.timer !== null || this.session !== null;
        this._recoverInterruptedItem();
        this._invalidate();
        this.state = setQueuePaused(this.state, true, { nowIso: this._timestamp() });
        this._persist();
        this._notify();
        return changed;
    }

    setInterval(intervalMs) {
        const previous = this.state.intervalMs;
        this.state = setQueueInterval(this.state, intervalMs, { nowIso: this._timestamp() });
        this._persist();
        this._notify();
        if (!this.state.paused && this.timer !== null) this._schedule(this.state.intervalMs, this.session);
        return this.state.intervalMs !== previous;
    }

    cancel(id) {
        if (this.activeRun?.itemId === id) {
            const committed = this.activeRun.commitStarted;
            this.pause();
            if (committed) return false;
        }
        const target = this.state.items.find(item => item.id === clean(id));
        if (!target) return false;
        this.state = cancelQueueItem(this.state, id, { nowIso: this._timestamp() });
        this._persist();
        this._notify();
        return true;
    }

    remove(id) {
        if (this.activeRun?.itemId === id) {
            const committed = this.activeRun.commitStarted;
            this.pause();
            if (committed) return false;
        }
        const previousLength = this.state.items.length;
        this.state = removeQueueItem(this.state, id, { nowIso: this._timestamp() });
        if (this.state.items.length === previousLength) return false;
        this._persist();
        this._notify();
        return true;
    }

    move(id, direction) {
        if (this.activeRun?.itemId === id) return false;
        const previousOrder = this.state.items.map(item => item.id).join('\n');
        this.state = moveQueueItem(this.state, id, direction, { nowIso: this._timestamp() });
        if (this.state.items.map(item => item.id).join('\n') === previousOrder) return false;
        this._persist();
        this._notify();
        return true;
    }

    clearHistory() {
        const previousLength = this.state.items.length;
        this.state = clearQueueHistory(this.state, { nowIso: this._timestamp() });
        if (this.state.items.length === previousLength) return false;
        this._persist();
        this._notify();
        return true;
    }

    async processNext(session = this.session) {
        if (this.activeRun || !this._isSessionCurrent(session)) return false;
        const item = getNextQueuedItem(this.state);
        if (!item) {
            this._notify();
            return false;
        }

        let safety;
        try { safety = evaluateQueueSafety(this.delivery.inspect()); }
        catch (error) { return this._pauseWithError(failureMessage(error, 'Queue safety check failed')); }
        if (!safety.ok) return this._pauseWithError(safety.reason);

        const run = { session, itemId: item.id, commitStarted: false };
        this.activeRun = run;
        this.state = markQueueItemSending(this.state, item.id, { nowIso: this._timestamp() });
        this._persist();
        this._notify();

        let staged;
        try { staged = await this.delivery.stage(item.text); }
        catch (error) { return this._failRun(run, failureMessage(error, 'Queue editor staging failed')); }
        const stagingFailure = stageFailure(staged, 'Input editor unavailable');
        if (stagingFailure) return this._failRun(run, stagingFailure);
        const baseline = composerBaseline(staged);
        if (!baseline) return this._cancelRun(run, QUEUE_STALE_REASONS.baseline);
        if (this.activeRun !== run) return false;
        const stagedDrift = this._continuationFailure(session);
        if (stagedDrift) return this._cancelRun(run, stagedDrift);

        try { await this.timers.delay(this.sendReadyDelayMs); }
        catch (error) { return this._failRun(run, failureMessage(error, 'Queue send delay failed')); }

        if (this.activeRun !== run) return false;
        const delayedDrift = this._continuationFailure(session);
        if (delayedDrift) return this._cancelRun(run, delayedDrift);

        let commit;
        try { commit = this.delivery.prepareCommit(); }
        catch (error) { return this._failRun(run, failureMessage(error, 'Send button unavailable')); }
        if (typeof commit !== 'function') return this._failRun(run, 'Send button unavailable');
        if (this.activeRun !== run) return false;
        const commitDrift = this._continuationFailure(session);
        if (commitDrift) return this._cancelRun(run, commitDrift);

        let verification;
        try { verification = this.delivery.verifyStage(baseline); }
        catch (error) {
            return this._cancelRun(run, failureMessage(error, 'Queue send cancelled: composer verification failed'));
        }
        const composerDrift = composerVerificationFailure(verification);
        if (composerDrift) return this._cancelRun(run, composerDrift);

        run.commitStarted = true;
        let committed;
        try { committed = await commit(); }
        catch (error) {
            run.commitStarted = false;
            return this._failRun(run, failureMessage(error, 'Queue send failed'));
        }
        if (committed === false) {
            run.commitStarted = false;
            return this._failRun(run, 'Queue send failed');
        }

        if (this.activeRun !== run) return true;
        if (!this._isSessionCurrent(session)) {
            this.pause();
            return true;
        }
        this.activeRun = null;
        this.state = markQueueItemSent(this.state, item.id, { nowIso: this._timestamp() });
        this._persist();
        this._notify();
        this._schedule(normalizeQueueIntervalMs(this.state.intervalMs), session);
        return true;
    }
}

export function createMessageQueueOutbox(options) {
    return new MessageQueueOutbox(options);
}
