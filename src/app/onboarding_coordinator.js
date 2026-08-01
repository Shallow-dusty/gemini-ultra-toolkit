function requireScope(scope) {
    if (!scope || typeof scope.timeout !== 'function' || typeof scope.interval !== 'function') {
        throw new TypeError('Onboarding requires a lifecycle scope');
    }
}

/** Coordinate guided tour and per-module onboarding without owning timers. */
export function createOnboardingCoordinator({
    registry,
    panel,
    guidedTour,
    storage,
    onboardingKey,
    documentRef,
    modalSelector
}) {
    if (!registry || !panel || !guidedTour || !storage || !documentRef) {
        throw new TypeError('Onboarding coordinator dependencies are required');
    }
    if (typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new TypeError('Onboarding storage must implement get() and set()');
    }

    function readSeen() {
        try {
            const value = storage.get(onboardingKey, {});
            return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
        } catch (_ignored) {
            return {};
        }
    }

    function writeSeen(seen) {
        try {
            storage.set(onboardingKey, seen);
            return true;
        } catch (_ignored) {
            return false;
        }
    }

    function markModuleEnabled(module) {
        if (typeof module?.getOnboarding !== 'function') return false;
        const seen = readSeen();
        if (seen[module.id]) return false;
        panel.showOnboarding(module.id);
        seen[module.id] = true;
        writeSeen(seen);
        return true;
    }

    function collectQueue() {
        const seen = readSeen();
        const queue = [];
        for (const id of registry.enabledModules) {
            const module = registry.modules[id];
            if (!seen[id] && typeof module?.getOnboarding === 'function') {
                queue.push(id);
                seen[id] = true;
            }
        }
        if (queue.length) writeSeen(seen);
        return queue;
    }

    function startQueue(scope) {
        requireScope(scope);
        const queue = collectQueue();
        if (queue.length === 0) return false;

        let index = 0;
        const showNext = () => {
            if (!scope.active || index >= queue.length) return;
            panel.showOnboarding(queue[index++]);

            let cancelCheck = null;
            let cancelTimeout = null;
            const cleanup = () => {
                cancelCheck?.();
                cancelTimeout?.();
                cancelCheck = null;
                cancelTimeout = null;
            };
            cancelCheck = scope.interval(() => {
                if (!documentRef.querySelector(modalSelector)) {
                    cleanup();
                    scope.timeout(showNext, 500);
                }
            }, 300);
            cancelTimeout = scope.timeout(cleanup, 10000);
        };
        scope.timeout(showNext, 500);
        return true;
    }

    function startProgressiveDisclosure(scope) {
        requireScope(scope);
        if (!guidedTour.hasSeen()) {
            scope.timeout(() => guidedTour.start(() => {
                if (scope.active) startQueue(scope);
            }), 800);
            return 'tour';
        }
        startQueue(scope);
        return 'modules';
    }

    return Object.freeze({ markModuleEnabled, startQueue, startProgressiveDisclosure });
}
