/** Report optional UI capability quality without creating fallback DOM. */
export function legacyRecipesCapabilityStatus(started, capabilities) {
    const missing = [];
    if (typeof capabilities.notifications?.show !== 'function') missing.push('ui.notifications');
    if (typeof capabilities.shell?.openModule !== 'function') missing.push('ui.shell');
    return Object.freeze({
        status: started ? (missing.length ? 'degraded' : 'available') : 'unavailable',
        reasonCode: started
            ? (missing.length ? 'OPTIONAL_CAPABILITIES_UNAVAILABLE' : null)
            : 'FEATURE_INACTIVE',
        missing: Object.freeze(missing)
    });
}
export function removeLegacyRecipesLiveRegion(document) {
    const region = document?.getElementById?.('primer-recipes-live');
    region?.remove();
    return !!region;
}

/** Use injected notifications when present, otherwise own one disposable live region. */
export function showLegacyRecipesNotice({ document, notifications, message }) {
    if (notifications && typeof notifications.show === 'function') {
        removeLegacyRecipesLiveRegion(document);
        return notifications.show(message);
    }
    let region = document.getElementById?.('primer-recipes-live');
    if (!region) {
        region = document.createElement('div');
        region.id = 'primer-recipes-live';
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('data-capability-state', 'degraded');
        region.setAttribute('data-missing-capability', 'ui.notifications');
        document.body.appendChild(region);
    }
    region.textContent = message;
    return undefined;
}
