import transcriptFidelity from '../../../lib/transcript_fidelity.js';
import { cleanVisibleText, matchesAny } from './dom.js';
import { SELECTORS } from './selectors.js';

const {
    TRANSCRIPT_LIMITS,
    buildMessageStructure,
    createFidelityReport,
    sanitizePublicHref
} = transcriptFidelity;

function addLoss(losses, code, count = 1) {
    losses.push({ code, count });
}

function boundedText(value, limit, losses, code) {
    if (value.length <= limit) return value;
    addLoss(losses, code, value.length - limit);
    return value.slice(0, limit);
}

function attribute(node, name) {
    return node.getAttribute?.(name) || '';
}

function metadataText(node, ...names) {
    for (const name of names) {
        const value = attribute(node, name).trim();
        if (value) return value.slice(0, TRANSCRIPT_LIMITS.maxMetadataCharacters);
    }
    return '';
}

function classifyPart(node) {
    if (matchesAny(node, SELECTORS.TRANSCRIPT_TOOL)) return 'tool';
    if (matchesAny(node, SELECTORS.TRANSCRIPT_CITATION)) return 'citation';
    if (matchesAny(node, SELECTORS.TRANSCRIPT_SOURCE)) return 'source';
    if (matchesAny(node, SELECTORS.TRANSCRIPT_MATH)) return 'math';
    if (matchesAny(node, SELECTORS.TRANSCRIPT_CODE)) return 'code';
    if (matchesAny(node, SELECTORS.TRANSCRIPT_LINK)) return 'link';
    return null;
}

function isNestedDuplicate(node, root, type) {
    let parent = node.parentElement;
    while (parent && parent !== root) {
        if (classifyPart(parent) === type) return true;
        parent = parent.parentElement;
    }
    return false;
}

function codeLanguage(node) {
    const explicit = metadataText(node, 'data-language');
    if (explicit) return explicit;
    const className = attribute(node, 'class');
    return className.match(/(?:^|\s)language-([\w+-]+)/i)?.[1]
        ?.slice(0, TRANSCRIPT_LIMITS.maxMetadataCharacters) || '';
}

function partFromNode(node, type, baseHref, losses) {
    const rawText = type === 'code'
        ? String(node.textContent || '').replace(/\r\n?/g, '\n')
        : cleanVisibleText(node);
    const text = boundedText(rawText, TRANSCRIPT_LIMITS.maxPartCharacters, losses, 'PART_TEXT_TRUNCATED');
    if (type === 'code') return { type, text, language: codeLanguage(node) };
    if (type === 'math') {
        const source = metadataText(node, 'data-math', 'data-latex');
        return { type, text: source || text, notation: source ? 'tex' : 'rendered-text' };
    }
    if (type === 'tool') {
        return {
            type,
            text,
            name: metadataText(node, 'data-tool-name'),
            status: metadataText(node, 'data-tool-status')
        };
    }
    const sanitized = sanitizePublicHref(attribute(node, 'href'), baseHref);
    if (sanitized.lossy) addLoss(losses, 'URL_METADATA_STRIPPED');
    return {
        type,
        text,
        href: sanitized.href,
        sourceId: metadataText(node, 'data-source-id', 'data-citation')
    };
}

function extractStructure(node, baseHref, losses) {
    let candidates = [];
    try {
        candidates = Array.from(node.querySelectorAll(SELECTORS.TRANSCRIPT_RICH_PART));
    } catch {
        addLoss(losses, 'UNSUPPORTED_RICH_CONTENT');
    }
    if (candidates.length > TRANSCRIPT_LIMITS.maxPartsPerMessage) {
        addLoss(losses, 'PART_LIMIT_REACHED', candidates.length - TRANSCRIPT_LIMITS.maxPartsPerMessage);
    }
    const parts = [];
    for (const candidate of candidates.slice(0, TRANSCRIPT_LIMITS.maxPartsPerMessage)) {
        const type = classifyPart(candidate);
        if (!type || isNestedDuplicate(candidate, node, type)) continue;
        const part = partFromNode(candidate, type, baseHref, losses);
        if (part.text || part.href || part.sourceId || part.name || part.status) parts.push(part);
        else addLoss(losses, 'UNSUPPORTED_RICH_CONTENT');
    }
    try {
        const unsupported = node.querySelectorAll(SELECTORS.TRANSCRIPT_UNSUPPORTED_RICH).length;
        if (unsupported) addLoss(losses, 'UNSUPPORTED_RICH_CONTENT', unsupported);
    } catch {
        addLoss(losses, 'UNSUPPORTED_RICH_CONTENT');
    }
    return buildMessageStructure(parts);
}

export function renderedMessageNodes(documentRef = globalThis.document) {
    return Array.from(documentRef.querySelectorAll(`${SELECTORS.USER_QUERY}, ${SELECTORS.MODEL_RESPONSE}`));
}

export function stableMessageId(element) {
    return element.getAttribute?.('data-message-id')
        || element.getAttribute?.('data-response-id')
        || element.id
        || null;
}

export function captureVisibleTranscript(documentRef = globalThis.document, baseHref = globalThis.location?.href || '') {
    const losses = [
        { code: 'VISIBLE_DOM_ONLY', count: 1 },
        { code: 'PRESENTATION_NOT_PRESERVED', count: 1 },
        { code: 'NON_ALLOWLIST_METADATA_OMITTED', count: 1 }
    ];
    const nodes = renderedMessageNodes(documentRef);
    if (nodes.length > TRANSCRIPT_LIMITS.maxMessages) {
        addLoss(losses, 'MESSAGE_LIMIT_REACHED', nodes.length - TRANSCRIPT_LIMITS.maxMessages);
    }
    const messages = [];
    let partCount = 0;
    let structuredMessages = 0;
    nodes.slice(0, TRANSCRIPT_LIMITS.maxMessages).forEach((node, index) => {
        const isUser = node.matches(SELECTORS.USER_QUERY);
        const target = isUser ? (node.querySelector(SELECTORS.USER_QUERY_TEXT) || node) : node;
        const rawText = cleanVisibleText(target);
        if (!rawText) return;
        const structure = extractStructure(node, baseHref, losses);
        const message = {
            id: stableMessageId(node) || `m_${index}`,
            role: isUser ? 'user' : 'model',
            text: boundedText(rawText, TRANSCRIPT_LIMITS.maxMessageCharacters, losses, 'MESSAGE_TEXT_TRUNCATED')
        };
        if (structure) {
            message.structure = structure;
            structuredMessages += 1;
            partCount += structure.parts.length;
        }
        messages.push(Object.freeze(message));
    });
    return Object.freeze({
        messages: Object.freeze(messages),
        fidelity: createFidelityReport({
            captureMethod: 'visible-dom',
            messages: messages.length,
            structuredMessages,
            parts: partCount,
            losses
        })
    });
}

export const transcriptInternals = Object.freeze({
    boundedText,
    classifyPart,
    codeLanguage,
    extractStructure,
    isNestedDuplicate,
    metadataText,
    partFromNode
});
