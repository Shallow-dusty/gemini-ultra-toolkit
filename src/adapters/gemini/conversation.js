import { closestAny, firstMatch, getUniqueDescendantCount } from './dom.js';
import { SELECTORS } from './selectors.js';
import { captureVisibleTranscript, renderedMessageNodes, stableMessageId } from './transcript.js';

function canUseOrdinalFallback(messageId) {
    return typeof messageId === 'string' && /^m_\d+$/u.test(messageId);
}

function findMessageNode(locator, { requireStable = false } = {}) {
    const nodes = renderedMessageNodes();
    if (typeof locator.messageId === 'string' && locator.messageId) {
        const stable = nodes.find(node => stableMessageId(node) === locator.messageId) || null;
        if (stable) return stable;
        if (requireStable || !canUseOrdinalFallback(locator.messageId)) return null;
    }
    if (!Number.isInteger(locator.ordinal) || locator.ordinal < 0) return null;
    return nodes[locator.ordinal] || null;
}

function focusMessageNode(target) {
    if (!target || typeof target.focus !== 'function') return false;
    const addedTabIndex = typeof target.hasAttribute === 'function'
        && typeof target.setAttribute === 'function'
        && !target.hasAttribute('tabindex');
    if (addedTabIndex) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    return true;
}

export const conversationMethods = Object.freeze({
    getChatHeader() {
        const moreButton = firstMatch(document, SELECTORS.CHAT_HEADER_MORE_BTN);
        return moreButton ? (moreButton.parentElement || moreButton) : firstMatch(document, SELECTORS.CHAT_HEADER_TITLE);
    },

    getChatTitleText() {
        const visible = document.querySelector('h1.conversation-title, [data-test-id="conversation-title"], span.conversation-title');
        if (visible?.textContent?.trim()) return visible.textContent.trim();
        const accessibilityTitle = document.querySelector('h1.cdk-visually-hidden');
        const accessibilityText = accessibilityTitle?.textContent?.trim() || '';
        if (accessibilityText && !/^Conversation with Gemini|^与\s*Gemini|Gemini\s*との|Gemini\s*와의/i.test(accessibilityText)) {
            return accessibilityText;
        }
        const firstMessage = document.querySelector(SELECTORS.USER_QUERY_TEXT);
        return firstMessage?.textContent?.trim().substring(0, 50) || '';
    },

    isInsideMainChatArea(target) {
        return Boolean(closestAny(target, SELECTORS.MAIN_CHAT_AREA.split(', ')));
    },

    isInsideChatContent(target) {
        return Boolean(closestAny(target, SELECTORS.CHAT_CONTENT_ROOT.split(', ')));
    },

    getCurrentConversationMessages() {
        return captureVisibleTranscript().messages;
    },

    getCurrentConversationTranscript() {
        return captureVisibleTranscript();
    },

    getMessageLocatorForNode(node) {
        const chatId = this.getChatId();
        if (!chatId || !this.isInsideChatContent(node)) return null;
        const message = closestAny(node, [SELECTORS.USER_QUERY, SELECTORS.MODEL_RESPONSE]);
        if (!message) return Object.freeze({ kind: 'chat', chatId });
        const nodes = renderedMessageNodes();
        const ordinal = nodes.indexOf(message);
        if (ordinal < 0) return Object.freeze({ kind: 'chat', chatId });
        return Object.freeze({
            kind: 'message',
            chatId,
            messageId: stableMessageId(message),
            ordinal
        });
    },

    hasMessageLocator(locator, options = {}) {
        if (!locator || typeof locator !== 'object' || typeof locator.chatId !== 'string') return false;
        if (locator.chatId !== this.getChatId()) return false;
        if (locator.kind === 'chat') return true;
        if (locator.kind !== 'message') return false;
        return Boolean(findMessageNode(locator, options));
    },

    openMessageLocator(locator, options = {}) {
        if (!this.hasMessageLocator(locator, options)) return false;
        if (locator.kind === 'chat') return true;
        const target = findMessageNode(locator, options);
        if (!target) return false;
        target.scrollIntoView?.({ block: 'center', behavior: 'auto' });
        const focusTarget = target.querySelector?.(
            `${SELECTORS.USER_QUERY_TEXT}, .model-response-text, .markdown, [role="heading"]`
        ) || target;
        focusMessageNode(focusTarget);
        return true;
    },

    highlightMessageLocator(locator, options = {}) {
        if (locator?.kind !== 'message' || !this.hasMessageLocator(locator, options)) return false;
        const target = findMessageNode(locator, options);
        if (!target) return false;
        const previous = {
            outline: target.style?.outline || '',
            outlineOffset: target.style?.outlineOffset || '',
            transition: target.style?.transition || ''
        };
        target.setAttribute('data-primer-search-highlight', 'active');
        if (target.style) {
            target.style.outline = '3px solid var(--primer-ui-color-focus, #6b7cff)';
            target.style.outlineOffset = '4px';
            target.style.transition = 'outline-color 120ms ease';
        }
        let active = true;
        return () => {
            if (!active) return false;
            active = false;
            target.removeAttribute('data-primer-search-highlight');
            if (target.style) Object.assign(target.style, previous);
            return true;
        };
    },

    jumpToMessage(locator) {
        return this.openMessageLocator(locator);
    },

    getRichResponseProbeReport() {
        const roots = Array.from(document.querySelectorAll(`${SELECTORS.MODEL_RESPONSE}, ${SELECTORS.RESPONSE_CONTAINER}`));
        const codeBlockCount = getUniqueDescendantCount(roots, SELECTORS.RICH_CODE_BLOCK);
        const tableCount = getUniqueDescendantCount(roots, SELECTORS.RICH_TABLE);
        const imageCount = getUniqueDescendantCount(roots, SELECTORS.RICH_IMAGE);
        const videoCount = getUniqueDescendantCount(roots, SELECTORS.RICH_VIDEO);
        const linkCount = getUniqueDescendantCount(roots, SELECTORS.RICH_LINK);
        const citationCandidateCount = getUniqueDescendantCount(roots, SELECTORS.RICH_CITATION_CANDIDATE);
        const mediaCandidateCount = imageCount + videoCount;
        const richElementCount = codeBlockCount + tableCount + mediaCandidateCount + linkCount + citationCandidateCount;
        return {
            responseRootCount: roots.length,
            codeBlockCount,
            tableCount,
            imageCount,
            videoCount,
            mediaCandidateCount,
            linkCount,
            citationCandidateCount,
            richElementCount,
            hasRichContent: richElementCount > 0
        };
    }
});
