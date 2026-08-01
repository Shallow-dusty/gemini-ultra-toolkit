import transcriptFidelity from '../../../lib/transcript_fidelity.js';

const { TRANSCRIPT_LIMITS, createFidelityReport, normalizeFidelityReport } = transcriptFidelity;

const PART_TYPES = Object.freeze(['code', 'math', 'link', 'citation', 'tool', 'source']);

function fingerprint(value, limit) {
    if (typeof value !== 'string') return '0:0';
    const text = value.slice(0, limit);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    }
    return `${value.length}:${hash >>> 0}`;
}

/** Bounded, non-reversible readiness signature for late rich-part rendering. */
export function transcriptCaptureSignature(messages) {
    if (!Array.isArray(messages)) return '';
    const signature = messages.slice(0, TRANSCRIPT_LIMITS.maxMessages).map(message => {
        const source = message && typeof message === 'object' ? message : {};
        const candidateParts = Array.isArray(source.structure?.parts) ? source.structure.parts : [];
        const parts = candidateParts.slice(0, TRANSCRIPT_LIMITS.maxPartsPerMessage).map(part => {
            const value = part && typeof part === 'object' ? part : {};
            return [
                PART_TYPES.indexOf(value.type),
                fingerprint(value.text, TRANSCRIPT_LIMITS.maxPartCharacters),
                fingerprint(value.language, TRANSCRIPT_LIMITS.maxMetadataCharacters),
                fingerprint(value.notation, TRANSCRIPT_LIMITS.maxMetadataCharacters),
                fingerprint(value.href, TRANSCRIPT_LIMITS.maxHrefCharacters),
                fingerprint(value.sourceId, TRANSCRIPT_LIMITS.maxMetadataCharacters),
                fingerprint(value.name, TRANSCRIPT_LIMITS.maxMetadataCharacters),
                fingerprint(value.status, TRANSCRIPT_LIMITS.maxMetadataCharacters)
            ];
        });
        return [
            fingerprint(source.id, TRANSCRIPT_LIMITS.maxMetadataCharacters),
            fingerprint(source.role, TRANSCRIPT_LIMITS.maxMetadataCharacters),
            fingerprint(source.text, TRANSCRIPT_LIMITS.maxMessageCharacters),
            parts
        ];
    });
    return JSON.stringify(signature);
}

function legacyFidelity(messages) {
    return createFidelityReport({
        captureMethod: 'legacy-text',
        messages: messages.length,
        structuredMessages: 0,
        parts: 0,
        losses: [
            'VISIBLE_DOM_ONLY',
            'PRESENTATION_NOT_PRESERVED',
            'STRUCTURED_CAPTURE_UNAVAILABLE'
        ]
    });
}

/** Resolve one bounded adapter snapshot while preserving text-only adapters. */
export function captureCurrentTranscript(adapter) {
    if (!adapter || typeof adapter !== 'object') {
        throw new TypeError('Transcript capture requires a Gemini adapter');
    }
    if (typeof adapter.getCurrentConversationTranscript === 'function') {
        const capture = adapter.getCurrentConversationTranscript();
        const fidelity = normalizeFidelityReport(capture?.fidelity);
        if (Array.isArray(capture?.messages) && fidelity) {
            return Object.freeze({ messages: capture.messages, fidelity });
        }
    }
    const candidate = adapter.getCurrentConversationMessages?.();
    const messages = Array.isArray(candidate) ? candidate : [];
    return Object.freeze({ messages, fidelity: legacyFidelity(messages) });
}

export const transcriptCaptureInternals = Object.freeze({ fingerprint, legacyFidelity });
