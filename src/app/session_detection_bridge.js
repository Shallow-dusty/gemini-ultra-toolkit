function numeric(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function objectRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneCounterState(value) {
    if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

export function hasGuestCounterData(state) {
    const source = objectRecord(state);
    return numeric(source.total) > 0 || Object.keys(objectRecord(source.chats)).length > 0;
}

/** Pure compatibility merge for the v12 Guest counter payload. */
export function mergeGuestCounterState(targetState, guestState) {
    const target = objectRecord(targetState);
    const guest = objectRecord(guestState);
    if (!hasGuestCounterData(guest)) return false;

    target.total = numeric(target.total) + numeric(guest.total);
    target.totalChatsCreated = numeric(target.totalChatsCreated) + numeric(guest.totalChatsCreated);
    target.chats = objectRecord(target.chats);
    target.dailyCounts = objectRecord(target.dailyCounts);

    for (const [day, rawCounts] of Object.entries(objectRecord(guest.dailyCounts))) {
        if (!rawCounts || typeof rawCounts !== 'object' || Array.isArray(rawCounts)) continue;
        const counts = rawCounts;
        if (!target.dailyCounts[day]) {
            target.dailyCounts[day] = cloneCounterState(counts);
            continue;
        }

        const current = objectRecord(target.dailyCounts[day]);
        current.messages = numeric(current.messages) + numeric(counts.messages);
        current.chats = numeric(current.chats) + numeric(counts.chats);
        if (counts.byModel && typeof counts.byModel === 'object') {
            current.byModel = objectRecord(current.byModel);
            for (const model of ['flash', 'thinking', 'pro']) {
                current.byModel[model] = numeric(current.byModel[model]) + numeric(counts.byModel[model]);
            }
        }
        target.dailyCounts[day] = current;
    }

    for (const [chatId, count] of Object.entries(objectRecord(guest.chats))) {
        target.chats[chatId] = numeric(target.chats[chatId]) + numeric(count);
    }
    return true;
}

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(`Session detection ${name} must be a function`);
    return value;
}

/**
 * Bridge Gemini account detection to the legacy module session contract.
 * Every mutable dependency is injected so account switching is testable and
 * the compatibility merge no longer lives in the composition entry point.
 */
export function createSessionDetectionBridge({
    core,
    registry,
    counter,
    panel,
    logger,
    tempUser,
    getCurrentUser,
    setCurrentUser,
    getInspectingUser,
    setInspectingUser,
    notifySession,
    isPanelPresent = () => false,
    cloneState = cloneCounterState,
    onGuestMerged = () => {}
}) {
    if (!core || !registry || !counter || !panel || !logger) {
        throw new TypeError('Session detection requires core, registry, counter, panel, and logger');
    }
    for (const [name, fn] of Object.entries({
        getCurrentUser,
        setCurrentUser,
        getInspectingUser,
        setInspectingUser,
        notifySession,
        isPanelPresent,
        cloneState,
        onGuestMerged
    })) requireFunction(fn, name);

    let lastDetectedUser = null;

    function snapshotGuest() {
        if (getCurrentUser() !== tempUser || !registry.isEnabled('counter')) return null;
        try {
            return cloneState(counter.state);
        } catch (_ignored) {
            return null;
        }
    }

    async function switchSession(detected) {
        const guestState = snapshotGuest();
        const previousCurrentUser = getCurrentUser();
        const previousInspectingUser = getInspectingUser();
        setCurrentUser(detected);
        core.registerUser(detected);
        logger.info('User switched', { currentUser: detected });

        if (previousInspectingUser === tempUser || previousInspectingUser === previousCurrentUser) {
            setInspectingUser(getCurrentUser());
        }

        await notifySession(getInspectingUser());
        if (!guestState || !mergeGuestCounterState(counter.state, guestState)) return;

        onGuestMerged({ guestState, user: getCurrentUser() });
        await Promise.resolve(counter.saveData?.());
        if (isPanelPresent()) panel.update();
    }

    function syncAccountType() {
        if (!registry.isEnabled('counter')) return;
        const accountType = counter.detectAccountType();
        if (accountType === counter.accountType) return;
        counter.accountType = accountType;
        if (isPanelPresent()) panel.update();
    }

    async function poll() {
        try {
            const detected = core.detectUser();
            if (detected !== lastDetectedUser) {
                logger.debug('User detection changed', { detected });
                lastDetectedUser = detected;
            }
            if (detected && detected !== getCurrentUser()) await switchSession(detected);
            syncAccountType();
        } catch (error) {
            logger.error('lazyDetect error', error);
        }
    }

    async function onVisible() {
        const user = getInspectingUser();
        if (user && user !== tempUser && registry.isEnabled('counter')) {
            await Promise.resolve(counter.loadDataForUser(user));
        }
    }

    async function flushCounter() {
        try {
            await Promise.resolve(counter.flushPendingSave?.());
            return true;
        } catch (_ignored) {
            return false;
        }
    }

    function reset() {
        lastDetectedUser = null;
    }

    return Object.freeze({ poll, onVisible, flushCounter, reset });
}
