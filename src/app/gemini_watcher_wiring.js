/** Create the five Gemini DOM watcher descriptors owned by the application. */
export function createGeminiWatcherWiring({
    adapter,
    core,
    nativeUI,
    panel,
    counter,
    registry,
    panelId,
    timings,
    documentRef,
    onPanelRemoved = () => panel.create(),
    onDOMStructureChange = () => {
        core.invalidateSidebarCache();
        panel.create();
        nativeUI.markAllDirty();
        nativeUI.tick();
    }
}) {
    if (!adapter || !core || !nativeUI || !panel || !counter || !registry || !documentRef) {
        throw new TypeError('Gemini watcher wiring dependencies are required');
    }
    if (typeof onPanelRemoved !== 'function' || typeof onDOMStructureChange !== 'function') {
        throw new TypeError('Gemini watcher callbacks must be functions');
    }

    const hasPanel = () => Boolean(documentRef.getElementById(panelId));

    function syncModel() {
        if (!registry.isEnabled('counter')) return false;
        const model = counter.detectModel();
        if (model === counter.currentModel) return false;
        counter.currentModel = model;
        if (hasPanel()) panel.update();
        return true;
    }

    function sidebarChanged() {
        core.invalidateSidebarCache();
        nativeUI.markDirtyByZone('sidebar');
        nativeUI.tick();
    }

    function inputChanged() {
        nativeUI.markDirtyByZone('input');
        nativeUI.tick();
    }

    function headerChanged() {
        nativeUI.markDirtyByZone('header');
        nativeUI.tick();
    }

    const watchers = Object.freeze([
        Object.freeze({
            id: 'model-mutation',
            match: mutation => adapter.matchesModelMutation(mutation),
            callback: syncModel,
            debounce: timings.MODEL_MUTATION_DEBOUNCE
        }),
        Object.freeze({
            id: 'sidebar-structure',
            match: mutation => adapter.matchesSidebarMutation(mutation),
            callback: sidebarChanged,
            debounce: timings.NATIVEUI_DEBOUNCE
        }),
        Object.freeze({
            id: 'input-structure',
            match: mutation => adapter.matchesInputAreaMutation(mutation),
            callback: inputChanged,
            debounce: timings.NATIVEUI_DEBOUNCE
        }),
        Object.freeze({
            id: 'header-structure',
            match: mutation => adapter.matchesHeaderMutation(mutation),
            callback: headerChanged,
            debounce: timings.NATIVEUI_DEBOUNCE
        }),
        Object.freeze({
            id: 'panel-guard',
            match(mutation) {
                if (mutation.type !== 'childList' || !mutation.removedNodes?.length) return false;
                return Array.from(mutation.removedNodes).some(node => node.id === panelId);
            },
            callback: onPanelRemoved,
            debounce: 500
        })
    ]);

    return Object.freeze({ watchers, syncModel, onDOMStructureChange });
}
