import { fail } from './errors.js';
import {
    normalizeCollectionsState,
    normalizeItemId,
    resolveCollectionLimits,
    safeClone
} from './model.js';
import { matchingRuleCollectionIds, normalizeRuleCandidateFields } from './rules.js';

const RULE_SOURCES = Object.freeze(['visible', 'archive']);
const ARCHIVE_STATES = Object.freeze(['ready', 'unavailable']);

function assertSourceRecords(value, source) {
    if (!Array.isArray(value)) fail('INVALID_RULE_SOURCE', `${source} rule candidates must be an array`, { source });
    return value;
}

function mergeLists(left, right) {
    return [...new Set([...left, ...right])];
}

function normalizedSourceRecord(raw, source, limits) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        fail('INVALID_RULE_CANDIDATE', `${source} rule candidate must be an object`, { source });
    }
    const fields = normalizeRuleCandidateFields(raw, limits);
    return {
        id: normalizeItemId(raw.itemId ?? raw.chatId ?? raw.id, limits),
        ...fields,
        statuses: mergeLists(fields.statuses, [source === 'archive' ? 'archived' : 'visible']),
        sources: [source]
    };
}

function mergeCandidate(existing, incoming) {
    if (!existing) return incoming;
    return {
        id: existing.id,
        title: existing.title || incoming.title,
        url: existing.url || incoming.url,
        tags: mergeLists(existing.tags, incoming.tags),
        statuses: mergeLists(existing.statuses, incoming.statuses),
        sources: mergeLists(existing.sources, incoming.sources)
    };
}

export function mergeRuleCandidates(sources, options = {}) {
    if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
        fail('INVALID_RULE_SOURCE', 'Smart rule sources must be an object');
    }
    const limits = resolveCollectionLimits(options.limits);
    const candidates = new Map();
    for (const source of RULE_SOURCES) {
        const records = assertSourceRecords(sources[source] ?? [], source);
        if (records.length > limits.maxMembershipItems) {
            fail('RULE_CANDIDATE_LIMIT', `${source} rule candidates exceed the local limit`, {
                source,
                limit: limits.maxMembershipItems
            });
        }
        for (const raw of records) {
            const candidate = normalizedSourceRecord(raw, source, limits);
            candidates.set(candidate.id, mergeCandidate(candidates.get(candidate.id), candidate));
            if (candidates.size > limits.maxMembershipItems) {
                fail('RULE_CANDIDATE_LIMIT', 'Combined rule candidates exceed the local limit', {
                    limit: limits.maxMembershipItems
                });
            }
        }
    }
    return safeClone([...candidates.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function membershipMap(state) {
    return new Map(state.memberships.map(record => [record.itemId, record.collectionIds]));
}

function previewMatch(candidate, collections, manualByChat) {
    const matchedCollectionIds = matchingRuleCollectionIds(collections, candidate);
    if (!matchedCollectionIds.length) return null;
    const currentCollectionIds = manualByChat.get(candidate.id) ?? [];
    const nextCollectionIds = [...new Set([...currentCollectionIds, ...matchedCollectionIds])].sort();
    const current = new Set(currentCollectionIds);
    const addedCollectionIds = nextCollectionIds.filter(id => !current.has(id));
    return {
        chatId: candidate.id,
        sources: candidate.sources,
        matchedCollectionIds,
        addedCollectionIds,
        currentCollectionIds: [...currentCollectionIds],
        nextCollectionIds
    };
}

export function createSmartRulePreview(state, sources, options = {}) {
    const limits = resolveCollectionLimits(options.limits);
    const current = normalizeCollectionsState(state, {
        sessionId: options.sessionId ?? state?.sessionId,
        limits,
        ...(options.nowIso ? { nowIso: options.nowIso } : {})
    });
    const archiveState = options.archiveState ?? 'unavailable';
    if (!ARCHIVE_STATES.includes(archiveState)) {
        fail('INVALID_ARCHIVE_STATE', `Unsupported smart rule archive state: ${archiveState}`);
    }
    const candidates = mergeRuleCandidates(sources, { limits });
    const manualByChat = membershipMap(current);
    const matches = candidates
        .map(candidate => previewMatch(candidate, current.collections, manualByChat))
        .filter(Boolean);
    const changes = matches
        .filter(match => match.addedCollectionIds.length > 0)
        .map(match => ({ itemId: match.chatId, collectionIds: match.nextCollectionIds }));
    const matchedChatIds = matches.map(match => match.chatId);
    return safeClone({
        semantics: 'local-memberships-only',
        sessionId: current.sessionId,
        archiveState,
        candidateCount: candidates.length,
        matchCount: matches.length,
        changeCount: changes.length,
        matchedChatIds,
        visibleMatchedChatIds: matches.filter(match => match.sources.includes('visible')).map(match => match.chatId),
        archiveMatchedChatIds: matches.filter(match => match.sources.includes('archive')).map(match => match.chatId),
        unchangedChatIds: matches.filter(match => match.addedCollectionIds.length === 0).map(match => match.chatId),
        matches,
        changes
    });
}

export function smartRulePreviewFingerprint(preview) {
    return JSON.stringify({
        semantics: preview.semantics,
        sessionId: preview.sessionId,
        archiveState: preview.archiveState,
        candidateCount: preview.candidateCount,
        matches: preview.matches,
        changes: preview.changes
    });
}
