import { PrimerApplication } from './primer_application.js';

function requireDependency(value, name) {
    if (!value) throw new TypeError(`Primer composition requires ${name}`);
    return value;
}

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(`Primer composition ${name} must be a function`);
    return value;
}

/**
 * Assemble the page lifecycle from injected product policies. This is the one
 * place where registry events are translated into shell/native UI updates.
 */
export function createPrimerComposition({
    registry,
    domWatcher,
    watcherWiring,
    sessionBridge,
    onboarding,
    core,
    panel,
    nativeUI,
    guidedTour,
    counter,
    adapter,
    logger,
    injectNativeStyles,
    flushPlatform,
    documentRef,
    windowRef,
    panelId,
    timings,
    onReady,
    healthService = null,
    archiveWiring = null,
    createApplication = options => new PrimerApplication(options)
}) {
    for (const [name, value] of Object.entries({
        registry,
        domWatcher,
        watcherWiring,
        sessionBridge,
        onboarding,
        core,
        panel,
        nativeUI,
        guidedTour,
        counter,
        adapter,
        logger,
        documentRef,
        windowRef,
        timings
    })) requireDependency(value, name);
    requireFunction(injectNativeStyles, 'injectNativeStyles');
    requireFunction(flushPlatform, 'flushPlatform');
    requireFunction(onReady, 'onReady');
    requireFunction(createApplication, 'createApplication');
    if (healthService !== null && (
        typeof healthService.start !== 'function' ||
        typeof healthService.refresh !== 'function' ||
        typeof healthService.stop !== 'function' ||
        typeof healthService.getSnapshot !== 'function' ||
        typeof healthService.subscribe !== 'function' ||
        typeof healthService.isStarted !== 'function'
    )) {
        throw new TypeError(
            'Primer composition healthService must implement start(), refresh(), stop(), getSnapshot(), subscribe(), and isStarted()'
        );
    }
    if (healthService && typeof panel.configureShellPorts !== 'function') {
        throw new TypeError('Primer composition panel must implement configureShellPorts() for capability health');
    }
    if (archiveWiring !== null && (
        typeof archiveWiring.refresh !== 'function' || typeof archiveWiring.stop !== 'function'
    )) {
        throw new TypeError('Primer composition archiveWiring must implement refresh() and stop()');
    }

    let stylesInjected = false;

    async function flushAfter(operation, phase) {
        const errors = [];
        try {
            await operation();
        } catch (error) {
            errors.push(error);
        }
        try {
            await flushPlatform();
        } catch (error) {
            errors.push(error);
        }
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, `${phase} failed`);
    }

    function ensureStyles() {
        if (stylesInjected) return false;
        panel.injectStyles();
        injectNativeStyles();
        stylesInjected = true;
        return true;
    }

    const registryCallbacks = Object.freeze({
        onModuleEnabled(module) {
            if (typeof module.injectNativeUI === 'function') {
                try {
                    module.injectNativeUI();
                } catch (_error) {
                    nativeUI.markDirty(module.id);
                    nativeUI.tick();
                }
            }
            onboarding.markModuleEnabled(module);
            return archiveWiring?.refresh();
        },
        onModuleDisabled: () => archiveWiring?.refresh(),
        onModulesChanged() {
            if (!documentRef.getElementById(panelId)) return;
            panel.update();
            if (counter.state.isExpanded) panel.renderDetailsPane();
        },
        onModuleError({ id, phase, error }) {
            logger.error('Module transition rolled back', { id, phase, error: String(error) });
        }
    });

    const application = createApplication({
        registry,
        domWatcher,
        watchers: watcherWiring.watchers,
        poll: sessionBridge.poll,
        pollInterval: timings.SLOW_POLL,
        documentRef,
        windowRef,
        beforeStart() {
            if (healthService) panel.configureShellPorts({ capabilityHealth: healthService });
            ensureStyles();
            core._updateAutoListener(core.getTheme());
        },
        async afterStart(scope) {
            if (healthService) {
                scope.defer(() => healthService.stop(), 'Capability Health');
                const unsubscribe = healthService.subscribe(() => {
                    if (documentRef.getElementById(panelId)) panel.update();
                });
                scope.defer(unsubscribe, 'Capability Health panel subscription');
                await healthService.start();
            }
            if (archiveWiring) {
                scope.defer(() => archiveWiring.stop(), 'Portable Archive wiring');
                await archiveWiring.refresh();
            }
        },
        async onVisible() {
            watcherWiring.syncModel();
            await sessionBridge.onVisible();
            if (healthService?.isStarted()) await healthService.refresh();
        },
        onHidden: sessionBridge.flushCounter,
        onPageHide: () => flushAfter(
            () => sessionBridge.flushCounter(),
            'Primer pagehide persistence'
        ),
        isReady: () => adapter.isReady(),
        async onReady(scope) {
            await onReady(scope);
            if (healthService?.isStarted()) await healthService.refresh();
        },
        afterStop: () => flushAfter(async () => {
            await sessionBridge.flushCounter();
            core._updateAutoListener('__primer_stopped__');
            nativeUI._clearRetryTimer?.();
            if (guidedTour._overlay) guidedTour.stop();
            if (typeof nativeUI.disposeDialogs === 'function') {
                nativeUI.disposeDialogs('application-stop');
            } else {
                nativeUI.closeAllDialogs?.('application-stop');
            }
            panel.destroy();
            documentRef.getElementById(panelId)?.remove();
            if (healthService) panel.configureShellPorts({ capabilityHealth: null });
            sessionBridge.reset();
        }, 'Primer application teardown'),
        onError(error, phase) {
            logger.error('Primer application background task failed', { phase, error: String(error) });
        }
    });

    if (!application || typeof application.start !== 'function' || typeof application.stop !== 'function') {
        throw new TypeError('Primer composition createApplication() returned an incompatible application');
    }

    return Object.freeze({ application, registryCallbacks, ensureStyles, healthService, archiveWiring });
}
