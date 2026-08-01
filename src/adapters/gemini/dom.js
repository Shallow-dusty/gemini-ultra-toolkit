function asList(value) {
    return Array.isArray(value) ? value : [value];
}
export function firstMatchWithSelector(root, selectors) {
    const list = asList(selectors);
    for (let index = 0; index < list.length; index += 1) {
        const selector = list[index];
        try {
            const element = root.querySelector(selector);
            if (element) return { element, selector, index };
        } catch {
            // A stale fallback must not disable every later selector.
        }
    }
    return { element: null, selector: null, index: -1 };
}

export function firstMatch(root, selectors) {
    return firstMatchWithSelector(root, selectors).element;
}

export function matchesAny(target, selectors) {
    if (!target || typeof target.matches !== 'function') return false;
    for (const selector of asList(selectors)) {
        try {
            if (target.matches(selector)) return true;
        } catch {
            // Ignore rollout-invalid selectors.
        }
    }
    return false;
}

export function closestAny(target, selectors) {
    if (!target || typeof target.closest !== 'function') return null;
    for (const selector of asList(selectors)) {
        try {
            const element = target.closest(selector);
            if (element) return element;
        } catch {
            // Ignore rollout-invalid selectors.
        }
    }
    return null;
}

export function isPrimerOwnedNode(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!element) return false;
    if (element.id?.startsWith('gc-') || element.id?.startsWith('gf-')) return true;
    if (Array.from(element.classList || []).some(name => name.startsWith('gc-') || name.startsWith('gf-'))) return true;
    return Boolean(closestAny(element, [
        '[data-primer-owned]', '[id^="gc-"]', '[id^="gf-"]',
        '[class^="gc-"]', '[class*=" gc-"]', '[class^="gf-"]', '[class*=" gf-"]'
    ]));
}

export function matchesNativeChildListMutation(mutation, roots) {
    if (!mutation || mutation.type !== 'childList' || !mutation.target) return false;
    if (!closestAny(mutation.target, roots) || isPrimerOwnedNode(mutation.target)) return false;
    const changedNodes = [
        ...Array.from(mutation.addedNodes || []),
        ...Array.from(mutation.removedNodes || [])
    ];
    return changedNodes.length > 0 && changedNodes.some(node => !isPrimerOwnedNode(node));
}

export function cleanVisibleText(element) {
    return (element?.textContent || '').replace(/\s+\n/g, '\n').replace(/\n\s+/g, '\n').trim();
}

export function getUniqueDescendantCount(roots, selector) {
    const seen = new Set();
    for (const root of roots) {
        try {
            root.querySelectorAll(selector).forEach(element => seen.add(element));
        } catch {
            // Structural probes are best effort across staged rollouts.
        }
    }
    return seen.size;
}
