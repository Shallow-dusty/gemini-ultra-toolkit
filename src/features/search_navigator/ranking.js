import { projectSearchText } from './text.js';

const FIELD_WEIGHTS = Object.freeze({ title: 8, tags: 6, annotation: 4, content: 2 });
const KIND_ORDER = Object.freeze({ chat: 0, message: 1 });

export function scoreDocument(document, query, queryTokens, fields, matchMode) {
    const matchedFields = [];
    const matchedAcrossDocument = new Set();
    let score = 0;
    for (const field of fields) {
        const compiled = document.fields[field];
        if (!compiled || !compiled.normalized) continue;
        if (matchMode === 'exact' && !compiled.normalized.includes(query)) continue;
        const fieldMatches = queryTokens.filter(token => compiled.tokens.has(token));
        if (fieldMatches.length === 0) continue;
        matchedFields.push(field);
        fieldMatches.forEach(token => matchedAcrossDocument.add(token));
        const weight = FIELD_WEIGHTS[field];
        score += fieldMatches.length * weight;
        if (compiled.normalized.includes(query)) score += weight * 3;
        if (compiled.normalized === query) score += weight * 5;
    }
    const exactMatch = matchedFields.length > 0;
    const qualifies = matchMode === 'exact'
        ? exactMatch
        : matchMode === 'all'
            ? queryTokens.every(token => matchedAcrossDocument.has(token))
            : queryTokens.some(token => matchedAcrossDocument.has(token));
    return qualifies ? { score, matchedFields } : null;
}

export function buildSnippet(document, matchedFields, query, queryTokens, maxLength) {
    const field = matchedFields.slice()
        .sort((left, right) => FIELD_WEIGHTS[right] - FIELD_WEIGHTS[left])[0];
    const compiled = document.fields[field];
    const projection = projectSearchText(compiled.original);
    let matchIndex = findPointSequence(projection.normalizedPoints, Array.from(query));
    let matchLength = Array.from(query).length;
    if (matchIndex < 0) {
        for (const token of queryTokens) {
            matchIndex = findPointSequence(projection.normalizedPoints, Array.from(token));
            if (matchIndex >= 0) {
                matchLength = Array.from(token).length;
                break;
            }
        }
    }
    const matchedStart = projection.offsets[matchIndex].start;
    const matchedEnd = projection.offsets[matchIndex + matchLength - 1].end;
    if (projection.sourceSegments.length <= maxLength) {
        return {
            field,
            text: projection.original,
            leadingEllipsis: false,
            trailingEllipsis: false
        };
    }
    let window = positionWindow(
        projection.sourceSegments.length,
        matchedStart,
        matchedEnd,
        maxLength - 2
    );
    if (window.start === 0 || window.end === projection.sourceSegments.length) {
        window = positionWindow(
            projection.sourceSegments.length,
            matchedStart,
            matchedEnd,
            maxLength - 1
        );
    }
    const leadingEllipsis = window.start > 0;
    const trailingEllipsis = window.end < projection.sourceSegments.length;
    return {
        field,
        text: `${leadingEllipsis ? '…' : ''}${projection.sourceSegments.slice(window.start, window.end).join('')}${trailingEllipsis ? '…' : ''}`,
        leadingEllipsis,
        trailingEllipsis
    };
}

function positionWindow(total, matchedStart, matchedEnd, budget) {
    const matchSpan = Math.max(1, matchedEnd - matchedStart);
    const context = Math.max(0, budget - matchSpan);
    let start = Math.max(0, matchedStart - Math.floor(context / 2));
    const end = Math.min(total, start + budget);
    start = Math.max(0, end - budget);
    return { start, end };
}

function findPointSequence(source, search) {
    const limit = source.length - search.length;
    for (let start = 0; start <= limit; start += 1) {
        if (search.every((point, offset) => source[start + offset] === point)) return start;
    }
    return -1;
}

function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

export function compareResults(left, right) {
    return right.score - left.score
        || compareText(left.chatId, right.chatId)
        || KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
        || (left.ordinal ?? -1) - (right.ordinal ?? -1);
}
