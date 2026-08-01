import { fail } from './errors.js';

export const RULE_FIELDS = Object.freeze(['title', 'url', 'tag', 'status']);
export const RULE_OPERATORS = Object.freeze(['contains', 'equals', 'starts-with']);

function cleanRuleText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

export function normalizeTags(value, limits) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) fail('INVALID_TAGS', 'Collection tags must be an array');
    if (value.length > limits.maxTagsPerCollection) fail('TAG_LIMIT', 'Collection tag count exceeds the limit');
    const tags = [];
    const seen = new Set();
    for (const raw of value) {
        const tag = cleanRuleText(raw);
        if (!tag) fail('INVALID_TAG', 'Collection tags must be non-empty strings');
        if (tag.length > limits.maxTagLength) fail('TAG_TOO_LONG', 'Collection tag exceeds the length limit', { tag });
        const key = tag.toLocaleLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            tags.push(tag);
        }
    }
    return tags;
}

export function normalizeRules(value, limits) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) fail('INVALID_RULES', 'Collection rules must be an array');
    if (value.length > limits.maxRulesPerCollection) fail('RULE_LIMIT', 'Collection rule count exceeds the limit');
    return value.map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('INVALID_RULE', 'Collection rule must be an object', { index });
        const field = cleanRuleText(raw.field);
        const operator = cleanRuleText(raw.operator);
        if (!RULE_FIELDS.includes(field)) fail('INVALID_RULE_FIELD', `Unsupported collection rule field: ${field}`, { index, field });
        if (!RULE_OPERATORS.includes(operator)) fail('INVALID_RULE_OPERATOR', `Unsupported collection rule operator: ${operator}`, { index, operator });
        const ruleValue = cleanRuleText(raw.value);
        if (!ruleValue) fail('INVALID_RULE_VALUE', 'Collection rule value must be non-empty', { index });
        if (ruleValue.length > limits.maxRuleValueLength) fail('RULE_VALUE_TOO_LONG', 'Collection rule value exceeds the limit', { index });
        return {
            field,
            operator,
            value: ruleValue,
            caseSensitive: raw.caseSensitive === true,
            enabled: raw.enabled !== false,
            ...(raw.legacyType === 'regex' ? { legacyType: 'regex' } : {})
        };
    });
}

function normalizedList(value, limits, label) {
    const values = Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
    if (values.length > limits.maxTagsPerCollection) fail('RULE_CANDIDATE_LIMIT', `${label} count exceeds the local limit`);
    const normalized = values.map(cleanRuleText).filter(Boolean);
    if (normalized.some(item => item.length > limits.maxTagLength)) {
        fail('RULE_CANDIDATE_LIMIT', `${label} value exceeds the local length limit`);
    }
    return [...new Set(normalized)];
}

export function normalizeRuleCandidateFields(item, limits = {
    maxItemIdLength: 320,
    maxTagLength: 64,
    maxTagsPerCollection: 32
}) {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const title = cleanRuleText(source.title);
    const url = cleanRuleText(source.url ?? source.href);
    if (title.length > limits.maxItemIdLength * 8 || url.length > limits.maxItemIdLength * 8) {
        fail('RULE_CANDIDATE_LIMIT', 'Rule candidate text exceeds the local length limit');
    }
    return {
        title,
        url,
        tags: normalizedList(source.tags ?? source.tag, limits, 'Rule candidate tag'),
        statuses: normalizedList(source.statuses ?? source.status, limits, 'Rule candidate status')
    };
}

export function matchesCollectionRule(rule, item) {
    const expected = rule.caseSensitive ? rule.value : rule.value.toLocaleLowerCase();
    const values = rule.field === 'tag'
        ? item.tags
        : (rule.field === 'status' ? item.statuses : [item[rule.field]]);
    return values.some(value => {
        const candidate = rule.caseSensitive ? value : value.toLocaleLowerCase();
        if (rule.operator === 'equals') return candidate === expected;
        if (rule.operator === 'starts-with') return candidate.startsWith(expected);
        return candidate.includes(expected);
    });
}

export function matchingRuleCollectionIds(collections, item) {
    return collections
        .filter(collection => {
            const activeRules = collection.rules.filter(value => value.enabled);
            if (activeRules.length === 0) return false;
            return collection.ruleMode === 'all'
                ? activeRules.every(value => matchesCollectionRule(value, item))
                : activeRules.some(value => matchesCollectionRule(value, item));
        })
        .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
        .map(collection => collection.id);
}
