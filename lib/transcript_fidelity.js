'use strict';

const MESSAGE_STRUCTURE_FORMAT = 'primer-pp.message-structure';
const CHAT_TRANSCRIPT_FORMAT = 'primer-pp.chat-transcript';
const TRANSCRIPT_FIDELITY_FORMAT = 'primer-pp.transcript-fidelity';
const TRANSCRIPT_SCHEMA_VERSION = 1;
const PART_TYPES = new Set(['code', 'math', 'link', 'citation', 'tool', 'source']);
const CAPTURE_METHODS = new Set(['visible-dom', 'legacy-text']);
const LOSS_CODES = new Set([
    'VISIBLE_DOM_ONLY',
    'PRESENTATION_NOT_PRESERVED',
    'MESSAGE_LIMIT_REACHED',
    'MESSAGE_TEXT_TRUNCATED',
    'PART_LIMIT_REACHED',
    'PART_TEXT_TRUNCATED',
    'URL_METADATA_STRIPPED',
    'UNSUPPORTED_RICH_CONTENT',
    'NON_ALLOWLIST_METADATA_OMITTED',
    'STRUCTURED_CAPTURE_UNAVAILABLE'
]);
const PRESERVED_FIELDS = Object.freeze([
    'text', 'code', 'math', 'links', 'citations', 'tools', 'sources'
]);
const TRANSCRIPT_LIMITS = Object.freeze({
    maxMessages: 200,
    maxMessageCharacters: 50_000,
    maxPartsPerMessage: 128,
    maxPartCharacters: 20_000,
    maxMetadataCharacters: 256,
    maxHrefCharacters: 2_048
});

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function cleanText(value, limit) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, limit);
}

function cleanContentText(value, limit) {
    if (typeof value !== 'string') return '';
    return value.replace(/\r\n?/g, '\n').slice(0, limit);
}

function cleanMetadata(value) {
    const text = cleanText(value, TRANSCRIPT_LIMITS.maxMetadataCharacters);
    if (/^(?:otpauth:\/\/|bearer\s+)|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(text)) return '';
    return text;
}

function sanitizePublicHref(value, baseHref) {
    const raw = typeof value === 'string' ? value.trim() : '';
    const input = raw.slice(0, TRANSCRIPT_LIMITS.maxHrefCharacters);
    if (!input) return Object.freeze({ href: '', lossy: false });
    try {
        const url = new URL(input, baseHref || undefined);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            return Object.freeze({ href: '', lossy: true });
        }
        const lossy = Boolean(url.username || url.password || url.search || url.hash || raw.length > TRANSCRIPT_LIMITS.maxHrefCharacters);
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return Object.freeze({
            href: url.href.slice(0, TRANSCRIPT_LIMITS.maxHrefCharacters),
            lossy
        });
    } catch {
        return Object.freeze({ href: '', lossy: true });
    }
}

function optionalField(target, key, value) {
    if (value) target[key] = value;
}

function normalizeTranscriptPart(raw) {
    if (!isPlainObject(raw) || !PART_TYPES.has(raw.type)) return null;
    const type = raw.type;
    const part = { type };
    const partText = type === 'code'
        ? cleanContentText(raw.text, TRANSCRIPT_LIMITS.maxPartCharacters)
        : cleanText(raw.text, TRANSCRIPT_LIMITS.maxPartCharacters);
    optionalField(part, 'text', partText);
    if (type === 'code') optionalField(part, 'language', cleanMetadata(raw.language));
    if (type === 'math') optionalField(part, 'notation', raw.notation === 'tex' ? 'tex' : 'rendered-text');
    if (type === 'link' || type === 'citation' || type === 'source') {
        optionalField(part, 'href', sanitizePublicHref(raw.href).href);
    }
    if (type === 'citation' || type === 'source') {
        optionalField(part, 'sourceId', cleanMetadata(raw.sourceId));
    }
    if (type === 'tool') {
        optionalField(part, 'name', cleanMetadata(raw.name));
        optionalField(part, 'status', cleanMetadata(raw.status));
    }
    return Object.keys(part).length > 1 ? Object.freeze(part) : null;
}

function buildMessageStructure(parts) {
    if (!Array.isArray(parts)) return null;
    const normalized = parts
        .slice(0, TRANSCRIPT_LIMITS.maxPartsPerMessage)
        .map(normalizeTranscriptPart)
        .filter(Boolean);
    if (normalized.length === 0) return null;
    return Object.freeze({
        format: MESSAGE_STRUCTURE_FORMAT,
        schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
        parts: Object.freeze(normalized)
    });
}

function normalizeMessageStructure(value) {
    if (!isPlainObject(value) || value.format !== MESSAGE_STRUCTURE_FORMAT ||
        value.schemaVersion !== TRANSCRIPT_SCHEMA_VERSION) return null;
    return buildMessageStructure(value.parts);
}

function safeCount(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalizeRichResponse(value) {
    if (!isPlainObject(value)) return null;
    const fields = [
        'responseRootCount', 'codeBlockCount', 'tableCount', 'imageCount', 'videoCount',
        'mediaCandidateCount', 'linkCount', 'citationCandidateCount', 'richElementCount'
    ];
    const report = {};
    for (const field of fields) report[field] = safeCount(value[field]);
    report.hasRichContent = value.hasRichContent === true;
    return Object.freeze(report);
}

function normalizeTranscriptMetadata(value) {
    if (!isPlainObject(value)) return null;
    return Object.freeze({
        captureMethod: CAPTURE_METHODS.has(value.captureMethod) ? value.captureMethod : 'visible-dom',
        visibleMessageCount: safeCount(value.visibleMessageCount),
        model: cleanMetadata(value.model) || null,
        richResponse: normalizeRichResponse(value.richResponse)
    });
}

function normalizeLosses(losses) {
    if (!Array.isArray(losses)) return [];
    const totals = new Map();
    for (const loss of losses) {
        const code = typeof loss === 'string' ? loss : loss?.code;
        if (!LOSS_CODES.has(code)) continue;
        const count = typeof loss === 'string' ? 1 : Math.max(1, safeCount(loss.count));
        totals.set(code, (totals.get(code) || 0) + count);
    }
    return [...totals]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, count]) => Object.freeze({ code, count }));
}

function createFidelityReport(input = {}) {
    const losses = Object.freeze(normalizeLosses(input.losses));
    const observed = Object.freeze({
        messages: safeCount(input.messages),
        structuredMessages: safeCount(input.structuredMessages),
        parts: safeCount(input.parts)
    });
    return Object.freeze({
        format: TRANSCRIPT_FIDELITY_FORMAT,
        schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
        captureMethod: CAPTURE_METHODS.has(input.captureMethod) ? input.captureMethod : 'visible-dom',
        captureScope: 'rendered-visible-messages',
        status: losses.length === 0 ? 'complete' : 'partial',
        preserved: PRESERVED_FIELDS,
        losses,
        observed,
        limits: TRANSCRIPT_LIMITS
    });
}

function normalizeFidelityReport(value) {
    if (!isPlainObject(value) || value.format !== TRANSCRIPT_FIDELITY_FORMAT ||
        value.schemaVersion !== TRANSCRIPT_SCHEMA_VERSION) return null;
    const observed = isPlainObject(value.observed) ? value.observed : {};
    return createFidelityReport({
        captureMethod: value.captureMethod,
        messages: observed.messages,
        structuredMessages: observed.structuredMessages,
        parts: observed.parts,
        losses: value.losses
    });
}

function appendFidelityLoss(report, code, count = 1) {
    const normalized = normalizeFidelityReport(report);
    if (!normalized) return null;
    return createFidelityReport({
        captureMethod: normalized.captureMethod,
        ...normalized.observed,
        losses: [...normalized.losses, { code, count }]
    });
}

module.exports = {
    CHAT_TRANSCRIPT_FORMAT,
    MESSAGE_STRUCTURE_FORMAT,
    PRESERVED_FIELDS,
    TRANSCRIPT_FIDELITY_FORMAT,
    TRANSCRIPT_LIMITS,
    TRANSCRIPT_SCHEMA_VERSION,
    buildMessageStructure,
    appendFidelityLoss,
    createFidelityReport,
    normalizeFidelityReport,
    normalizeMessageStructure,
    normalizeTranscriptMetadata,
    normalizeTranscriptPart,
    sanitizePublicHref
};
