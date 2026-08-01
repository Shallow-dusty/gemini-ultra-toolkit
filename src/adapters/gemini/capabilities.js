import { firstMatchWithSelector } from './dom.js';
import { SELECTORS } from './selectors.js';

const CAPABILITY_STATUSES = Object.freeze(['available', 'degraded', 'native-owned', 'unavailable']);

function evidence(hit) {
    return hit?.selector ? `selector:${hit.selector}` : null;
}

function record({ id, owner, kind, status, reason, evidenceItems, quality = status }) {
    return Object.freeze({
        id,
        owner,
        kind,
        extensionFeature: false,
        status,
        quality,
        reason,
        evidence: Object.freeze(Array.from(new Set(evidenceItems.filter(Boolean))))
    });
}

function summarize(records) {
    const summary = { total: records.length, available: 0, degraded: 0, nativeOwned: 0, unavailable: 0 };
    for (const capability of records) {
        if (capability.status === 'native-owned') summary.nativeOwned += 1;
        else summary[capability.status] += 1;
    }
    return Object.freeze(summary);
}

function integration(id, current, fallback, reasons) {
    const status = current.length ? 'available' : (fallback.length ? 'degraded' : 'unavailable');
    return record({
        id,
        owner: 'primer-adapter',
        kind: 'integration-surface',
        status,
        reason: reasons[status],
        evidenceItems: current.length ? current : fallback
    });
}

export const capabilityMethods = Object.freeze({
    isReady() {
        return Boolean(this.getSidebar() || this.getInputArea());
    },

    getThemeContext() {
        const body = document.body;
        const host = document.querySelector('.theme-host');
        const bodyDark = Boolean(body?.classList?.contains('dark-theme'));
        const hostDark = Boolean(host?.classList?.contains('dark-theme'))
            || (host?.getAttribute?.('data-theme') || '').toLowerCase() === 'dark';
        const evidenceItems = [];
        if (bodyDark) evidenceItems.push('body.dark-theme');
        if (host) evidenceItems.push('.theme-host');
        if (hostDark) evidenceItems.push('.theme-host:dark');
        return Object.freeze({
            mode: bodyDark || hostDark ? 'dark' : 'unknown',
            hostPresent: Boolean(host),
            evidence: Object.freeze(evidenceItems)
        });
    },

    getCapabilityProbeReport() {
        const sidebarRoot = firstMatchWithSelector(document, SELECTORS.SIDEBAR);
        const sidebarMarker = firstMatchWithSelector(document, SELECTORS.SIDEBAR_CURRENT_MARKERS);
        const inputArea = firstMatchWithSelector(document, SELECTORS.INPUT_AREA);
        const editorCurrent = firstMatchWithSelector(document, SELECTORS.INPUT_EDITOR_CURRENT);
        const editorSemantic = firstMatchWithSelector(document, SELECTORS.INPUT_EDITOR_BY_ARIA);
        const editorLegacy = firstMatchWithSelector(document, SELECTORS.INPUT_EDITOR);
        const sendButton = firstMatchWithSelector(document, SELECTORS.SEND_BUTTON);
        const modelCurrent = firstMatchWithSelector(document, SELECTORS.MODE_BTN.slice(0, 4));
        const modelFallback = firstMatchWithSelector(document, SELECTORS.MODE_BTN.slice(4));
        const headerAction = firstMatchWithSelector(document, SELECTORS.CHAT_HEADER_MORE_BTN);
        const headerTitleCurrent = firstMatchWithSelector(document, SELECTORS.CHAT_HEADER_TITLE.slice(0, 1));
        const headerTitleFallback = firstMatchWithSelector(document, SELECTORS.CHAT_HEADER_TITLE.slice(1));
        const currentUserMessages = document.querySelectorAll(SELECTORS.USER_QUERY_CURRENT).length;
        const currentModelMessages = document.querySelectorAll(SELECTORS.MODEL_RESPONSE_CURRENT).length;
        const legacyUserMessages = document.querySelectorAll('user-query').length;
        const legacyModelMessages = document.querySelectorAll('model-response').length;
        const conversationRoot = firstMatchWithSelector(document, SELECTORS.CHAT_CONTENT_ROOT.split(', '));
        const chatLinks = this.scanSidebarChatLinks();
        const rowAction = chatLinks[0] ? this.getChatRowMoreButton(chatLinks[0].element) : null;

        const adapterCapabilities = [];
        const currentReady = [sidebarMarker, editorCurrent, editorSemantic, modelCurrent].map(evidence).filter(Boolean);
        const fallbackReady = [sidebarRoot, inputArea, editorLegacy].map(evidence).filter(Boolean);
        adapterCapabilities.push(integration('readiness', currentReady, fallbackReady, {
            available: 'Current Gemini data-test or semantic anchors are present.',
            degraded: 'Only fallback application anchors are present.',
            unavailable: 'No sidebar or composer readiness anchor is present.'
        }));

        const sidebarCurrent = sidebarRoot.element && sidebarMarker.element
            ? [evidence(sidebarRoot), evidence(sidebarMarker)].filter(Boolean) : [];
        const sidebarFallback = [sidebarRoot, sidebarMarker].map(evidence).filter(Boolean);
        adapterCapabilities.push(integration('sidebar', sidebarCurrent, sidebarFallback, {
            available: 'Sidebar root and current navigation marker are present.',
            degraded: 'Sidebar is only partially anchored.',
            unavailable: 'Sidebar anchors are absent.'
        }));

        const composerCurrent = [editorCurrent, editorSemantic].map(evidence).filter(Boolean);
        const composerFallback = [editorLegacy, inputArea, sendButton].map(evidence).filter(Boolean);
        adapterCapabilities.push(integration('composer', composerCurrent, composerFallback, {
            available: 'Current data-test or textbox semantics identify the composer.',
            degraded: 'Composer is reachable only through a wrapper or legacy fallback.',
            unavailable: 'Composer anchors are absent.'
        }));

        adapterCapabilities.push(integration('model-picker', [evidence(modelCurrent)].filter(Boolean), [evidence(modelFallback)].filter(Boolean), {
            available: 'Current mode switcher control is present.',
            degraded: 'Only the legacy mode switch control is present.',
            unavailable: 'Model picker anchors are absent.'
        }));

        const mutationHits = [sidebarRoot, inputArea, modelCurrent, headerAction].map(evidence).filter(Boolean);
        const mutationCurrent = sidebarRoot.element && inputArea.element && (modelCurrent.element || headerAction.element)
            ? mutationHits : [];
        adapterCapabilities.push(integration('mutation-zones', mutationCurrent, mutationHits, {
            available: 'Sidebar, composer, and header or model mutation zones are anchored.',
            degraded: 'Only part of the mutation zone set is anchored.',
            unavailable: 'No mutation zones are anchored.'
        }));

        const headerCurrent = [headerAction, headerTitleCurrent].map(evidence).filter(Boolean);
        const headerFallback = [headerTitleFallback].map(evidence).filter(Boolean);
        adapterCapabilities.push(integration('chat-header', headerCurrent, headerFallback, {
            available: 'Current chat header action or title anchor is present.',
            degraded: 'Only a legacy or accessibility title anchor is present.',
            unavailable: 'Chat header anchors are absent.'
        }));

        const currentMessageCount = currentUserMessages + currentModelMessages;
        const legacyMessageCount = legacyUserMessages + legacyModelMessages;
        const currentMessages = [];
        if (currentUserMessages) currentMessages.push(`selector:${SELECTORS.USER_QUERY_CURRENT}`);
        if (currentModelMessages) currentMessages.push(`selector:${SELECTORS.MODEL_RESPONSE_CURRENT}`);
        const fallbackMessages = [];
        if (legacyUserMessages) fallbackMessages.push('selector:user-query');
        if (legacyModelMessages) fallbackMessages.push('selector:model-response');
        if (!legacyMessageCount) fallbackMessages.push(evidence(conversationRoot));
        adapterCapabilities.push(integration('messages', currentMessages, fallbackMessages.filter(Boolean), {
            available: 'Current message data-test anchors are rendered.',
            degraded: 'Conversation structure is available only through legacy anchors.',
            unavailable: 'No rendered conversation anchors are present.'
        }));
        adapterCapabilities.push(integration('message-navigation', currentMessageCount ? currentMessages : [], legacyMessageCount ? fallbackMessages : [], {
            available: 'Current-chat message locators can resolve current message anchors.',
            degraded: 'Current-chat message locators rely on legacy ordering.',
            unavailable: 'Message locator capability is unavailable in this DOM snapshot.'
        }));

        const titleCurrent = [evidence(headerTitleCurrent)].filter(Boolean);
        const titleFallback = [evidence(headerTitleFallback)].filter(Boolean);
        if (!titleCurrent.length && !titleFallback.length && this.getChatTitleText()) titleFallback.push('first-message-title');
        adapterCapabilities.push(integration('title', titleCurrent, titleFallback, {
            available: 'Current conversation title anchor is present.',
            degraded: 'Title is derived from a legacy, accessibility, or first-message fallback.',
            unavailable: 'No title anchor is available.'
        }));

        const exportCurrent = [];
        if (headerAction.element) exportCurrent.push(evidence(headerAction));
        if (rowAction) exportCurrent.push('sidebar-row-action');
        const exportFallback = chatLinks.length ? ['sidebar-chat-link'] : [];
        adapterCapabilities.push(integration('export-anchors', exportCurrent.length === 2 ? exportCurrent : [], [...exportCurrent, ...exportFallback], {
            available: 'Current-chat and sidebar-row export anchors are present.',
            degraded: 'Only part of the export injection surface is available.',
            unavailable: 'No export injection anchor is available.'
        }));

        const nativeCapabilities = Object.entries(SELECTORS.NATIVE_CAPABILITIES).map(([id, selectors]) => {
            const current = firstMatchWithSelector(document, selectors.current);
            const fallback = firstMatchWithSelector(document, selectors.fallback);
            const quality = current.element ? 'available' : (fallback.element ? 'degraded' : 'unavailable');
            return record({
                id,
                owner: 'gemini-native',
                kind: 'native-feature',
                status: quality === 'unavailable' ? 'unavailable' : 'native-owned',
                quality,
                reason: current.element
                    ? 'Gemini owns this native feature and exposes a current anchor.'
                    : (fallback.element
                        ? 'Gemini owns this native feature; only a semantic URL/control fallback is visible.'
                        : 'This Gemini-native feature is not visible in the current DOM snapshot.'),
                evidenceItems: [evidence(current), evidence(fallback)]
            });
        });

        const all = [...adapterCapabilities, ...nativeCapabilities];
        return Object.freeze({
            schemaVersion: 2,
            statuses: CAPABILITY_STATUSES,
            policy: Object.freeze({ nativeFeaturesAreExtensionFeatures: false }),
            summary: summarize(all),
            adapterCapabilities: Object.freeze(adapterCapabilities),
            nativeCapabilities: Object.freeze(nativeCapabilities),
            theme: this.getThemeContext()
        });
    },

    buildUITweakCssRules({ chatWidth, sidebarWidth, hideGems } = {}) {
        const rules = [];
        if (Number.isFinite(chatWidth)) rules.push(`${SELECTORS.UI_TWEAK_CHAT_WIDTH_TARGET} { max-width: ${chatWidth}px !important; }`);
        if (Number.isFinite(sidebarWidth)) rules.push(`${SELECTORS.UI_TWEAK_SIDEBAR_WIDTH_TARGET} { width: ${sidebarWidth}px !important; min-width: ${sidebarWidth}px !important; }`);
        if (hideGems) rules.push(`${SELECTORS.UI_TWEAK_GEMS_ENTRY} { display: none !important; }`);
        return rules;
    }
});
