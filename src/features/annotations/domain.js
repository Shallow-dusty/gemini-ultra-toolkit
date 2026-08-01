import { cloneStorageValue } from '../../storage/clone.js';

export const ANNOTATIONS_SCHEMA = 'primer-pp.annotations';
export const LEGACY_CHAT_NOTES_SCHEMA = 'primer-pp.chat-notes';
export const ANNOTATIONS_SCHEMA_VERSION = 2;
export const ANNOTATION_STATUSES = Object.freeze(['active', 'resolved', 'archived']);

const MAX_ID_LENGTH = 240;
const MAX_TITLE_LENGTH = 240;
const MAX_BODY_LENGTH = 16000;
const MAX_EXCERPT_LENGTH = 320;
const MAX_TAG_LENGTH = 64;
const MAX_TAGS = 32;
const MAX_IMPORT_LENGTH = 4 * 1024 * 1024;
const CREDENTIAL_FIELD = /^(?:password|passphrase|passcode|secret|totp|otp|cookie|authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret)$/i;

export class AnnotationsDataError extends Error {
    constructor(code, message, cause = undefined) {
        super(message, cause ? { cause } : undefined);
        this.name = 'AnnotationsDataError';
        this.code = code;
    }
}

export class UnsupportedAnnotationsVersionError extends AnnotationsDataError {
    constructor(version) {
        super(
            'UNSUPPORTED_VERSION',
            `Annotations schema version ${version} is newer than supported version ${ANNOTATIONS_SCHEMA_VERSION}`
        );
        this.name = 'UnsupportedAnnotationsVersionError';
        this.version = version;
    }
}

export class CredentialMaterialError extends AnnotationsDataError {
    constructor(path) {
        super('CREDENTIAL_MATERIAL', `Credential material is not accepted at ${path}`);
        this.name = 'CredentialMaterialError';
        this.path = path;
    }
}

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, fallback = '', maxLength = Infinity) {
    if (value === null || value === undefined) return fallback;
    const text = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    return (text || fallback).slice(0, maxLength);
}

function requireText(value, label, maxLength = MAX_ID_LENGTH) {
    const text = cleanText(value, '', maxLength);
    if (!text) throw new AnnotationsDataError('INVALID_FIELD', `${label} must be a non-empty string`);
    return text;
}

function normalizeHref(value) {
    const href = cleanText(value, '', 2048);
    if (!href) return '';
    const scheme = href.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
    return !scheme || scheme === 'http' || scheme === 'https' ? href : '';
}

function normalizeIso(value, fallback) {
    const candidate = cleanText(value, '');
    if (!candidate || !Number.isFinite(Date.parse(candidate))) return fallback;
    return new Date(candidate).toISOString();
}

function getNowIso(options = {}) {
    const supplied = typeof options.now === 'function' ? options.now() : options.nowIso;
    const candidate = supplied instanceof Date ? supplied.toISOString() : cleanText(supplied, '');
    if (candidate && Number.isFinite(Date.parse(candidate))) return new Date(candidate).toISOString();
    throw new AnnotationsDataError(
        'CLOCK_REQUIRED',
        'Annotations requiring a timestamp must receive an explicit now or nowIso option'
    );
}

function hashText(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function normalizeStatus(value) {
    const status = cleanText(value, 'active').toLowerCase();
    if (ANNOTATION_STATUSES.includes(status)) return status;
    if (status === 'done' || status === 'closed') return 'resolved';
    if (status === 'open') return 'active';
    return 'active';
}

function normalizeTags(value) {
    const source = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    const seen = new Set();
    const tags = [];
    for (const item of source) {
        const tag = cleanText(item, '', MAX_TAG_LENGTH);
        const key = tag.toLocaleLowerCase();
        if (!tag || seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
        if (tags.length === MAX_TAGS) break;
    }
    return tags;
}

function normalizeRole(value) {
    const role = cleanText(value, 'unknown').toLowerCase();
    if (role === 'user' || role === 'system') return role;
    if (role === 'assistant' || role === 'model' || role === 'gemini') return 'assistant';
    return 'unknown';
}

function normalizeConversation(source) {
    const nested = isRecord(source.conversation) ? source.conversation : {};
    const id = requireText(
        nested.id ?? source.conversationId ?? source.chatId,
        'Conversation id'
    );
    return {
        id,
        title: cleanText(nested.title ?? source.title, id, MAX_TITLE_LENGTH),
        href: normalizeHref(nested.href ?? source.href)
    };
}

/**
 * Resolve a message locator without pretending a DOM ordinal is a stable id.
 * The returned diagnostics make degraded anchors inspectable by UI and export.
 */
export function resolveAnnotationAnchor(rawAnchor, conversationId) {
    const source = isRecord(rawAnchor) ? rawAnchor : {};
    const stableId = cleanText(source.messageId ?? source.stableId, '', MAX_ID_LENGTH);
    const explicitlyConversation = source.kind === 'conversation';
    const hasMessageSignal = source.kind === 'message'
        || stableId
        || source.role !== undefined
        || source.ordinal !== undefined
        || source.excerpt !== undefined;

    if (explicitlyConversation || !hasMessageSignal) {
        return { kind: 'conversation', conversationId };
    }

    const role = normalizeRole(source.role);
    const ordinal = Number.isInteger(source.ordinal) && source.ordinal >= 0 ? source.ordinal : null;
    const excerpt = cleanText(source.excerpt, '', MAX_EXCERPT_LENGTH);
    if (stableId) {
        return {
            kind: 'message',
            conversationId,
            messageId: stableId,
            strategy: 'stable-id',
            role,
            ordinal,
            excerpt,
            diagnostics: []
        };
    }

    const diagnostics = ['MESSAGE_ID_UNAVAILABLE'];
    if (ordinal === null && !excerpt) diagnostics.push('WEAK_MESSAGE_ANCHOR');
    return {
        kind: 'message',
        conversationId,
        messageId: null,
        strategy: 'fallback',
        role,
        ordinal,
        excerpt,
        fallbackKey: `${role}:${ordinal === null ? '?' : ordinal}:${hashText(excerpt)}`,
        diagnostics
    };
}

function defaultAnnotationId() {
    return `annotation-${globalThis.crypto.randomUUID()}`;
}

export function normalizeAnnotation(raw, options = {}) {
    if (!isRecord(raw)) {
        throw new AnnotationsDataError('INVALID_ANNOTATION', 'Annotation must be an object');
    }

    const conversation = normalizeConversation(raw);
    const anchorSource = raw.anchor ?? {
        kind: raw.messageId || raw.message ? 'message' : 'conversation',
        messageId: raw.messageId,
        role: raw.message?.role ?? raw.role,
        ordinal: raw.message?.ordinal ?? raw.ordinal,
        excerpt: raw.message?.excerpt ?? raw.excerpt
    };
    const anchor = resolveAnnotationAnchor(anchorSource, conversation.id);
    const suppliedCreatedAt = normalizeIso(raw.createdAt, null);
    const createdAt = suppliedCreatedAt || getNowIso(options);
    const updatedAt = normalizeIso(raw.updatedAt, createdAt);
    const partial = {
        conversation,
        anchor,
        body: cleanText(raw.body ?? raw.note, '', MAX_BODY_LENGTH),
        tags: normalizeTags(raw.tags),
        status: normalizeStatus(raw.status),
        pinned: raw.pinned === true,
        createdAt,
        updatedAt
    };
    const suppliedId = cleanText(raw.id, '', MAX_ID_LENGTH);
    const generated = suppliedId || (typeof options.idFactory === 'function'
        ? options.idFactory(cloneStorageValue(partial))
        : defaultAnnotationId());
    const id = requireText(generated, 'Annotation id');
    return cloneStorageValue({ id, ...partial });
}

export function createEmptyAnnotationsState() {
    return { version: ANNOTATIONS_SCHEMA_VERSION, annotations: {} };
}

function annotationEntries(value) {
    if (Array.isArray(value)) return value.map(item => [item?.id, item]);
    if (isRecord(value)) return Object.entries(value);
    throw new AnnotationsDataError('INVALID_COLLECTION', 'Annotations must be an array or object map');
}

function normalizeCurrentCollection(value, options = {}, transform = item => item) {
    const annotations = {};
    for (const [key, item] of annotationEntries(value)) {
        const source = isRecord(item) ? transform({ ...item, id: item.id ?? key }) : item;
        const annotation = normalizeAnnotation(source, options);
        annotations[annotation.id] = annotation;
    }
    return { version: ANNOTATIONS_SCHEMA_VERSION, annotations };
}

function migrateLegacyChatNotes(raw, options = {}) {
    const notes = isRecord(raw?.notes) ? raw.notes : {};
    const annotations = {};
    for (const [chatId, note] of Object.entries(notes)) {
        if (!cleanText(chatId, '')) continue;
        const source = isRecord(note) ? note : {};
        const annotation = normalizeAnnotation({
            id: `legacy-note-${hashText(chatId)}`,
            conversation: {
                id: chatId,
                title: source.title,
                href: source.href
            },
            anchor: { kind: 'conversation' },
            body: source.note,
            tags: [],
            status: 'active',
            pinned: source.pinned,
            createdAt: source.createdAt,
            updatedAt: source.updatedAt
        }, options);
        annotations[annotation.id] = annotation;
    }
    return { version: ANNOTATIONS_SCHEMA_VERSION, annotations };
}

function migrateVersionOne(raw, options = {}) {
    return normalizeCurrentCollection(raw.annotations, options, item => ({
        ...item,
        conversation: item.conversation ?? {
            id: item.conversationId ?? item.chatId,
            title: item.title,
            href: item.href
        },
        anchor: item.anchor ?? {
            kind: item.messageId || item.message ? 'message' : 'conversation',
            messageId: item.messageId,
            role: item.message?.role,
            ordinal: item.message?.ordinal,
            excerpt: item.message?.excerpt
        },
        body: item.body ?? item.note,
        status: item.status
    }));
}

/** Pure migration entry used by both repositories and import preview. */
export function migrateAnnotationsData(raw, options = {}) {
    if (raw === undefined || raw === null) return createEmptyAnnotationsState();
    if (!isRecord(raw)) {
        throw new AnnotationsDataError('UNRECOGNIZED_SCHEMA', 'Annotations data must be an object');
    }

    if (raw.schema === LEGACY_CHAT_NOTES_SCHEMA || (raw.notes && !raw.annotations)) {
        return migrateLegacyChatNotes(raw, options);
    }

    if (raw.schema && raw.schema !== ANNOTATIONS_SCHEMA) {
        throw new AnnotationsDataError('UNRECOGNIZED_SCHEMA', `Unsupported annotations schema: ${raw.schema}`);
    }

    const version = raw.version ?? raw.schemaVersion ?? (raw.annotations ? 1 : null);
    if (!Number.isInteger(version) || version < 1) {
        throw new AnnotationsDataError('INVALID_VERSION', 'Annotations version must be a positive integer');
    }
    if (version > ANNOTATIONS_SCHEMA_VERSION) throw new UnsupportedAnnotationsVersionError(version);
    if (!Object.prototype.hasOwnProperty.call(raw, 'annotations')) {
        throw new AnnotationsDataError('INVALID_COLLECTION', 'Annotations data is missing annotations');
    }
    return version === 1
        ? migrateVersionOne(raw, options)
        : normalizeCurrentCollection(raw.annotations, options);
}

function currentState(state, options = {}) {
    return migrateAnnotationsData(state, options);
}

export function upsertAnnotation(state, input, options = {}) {
    const current = currentState(state, options);
    if (!isRecord(input)) {
        throw new AnnotationsDataError('INVALID_ANNOTATION', 'Annotation must be an object');
    }
    const existingId = cleanText(input.id, '', MAX_ID_LENGTH);
    const existing = existingId ? current.annotations[existingId] : null;
    const merged = existing ? {
        ...existing,
        ...input,
        id: existing.id,
        conversation: input.conversation
            ? { ...existing.conversation, ...input.conversation }
            : existing.conversation,
        anchor: input.anchor ?? existing.anchor,
        createdAt: existing.createdAt,
        updatedAt: getNowIso(options)
    } : input;
    const annotation = normalizeAnnotation(merged, options);
    const annotations = { ...current.annotations, [annotation.id]: annotation };
    return cloneStorageValue({ version: ANNOTATIONS_SCHEMA_VERSION, annotations });
}

export function deleteAnnotation(state, annotationId, options = {}) {
    const current = currentState(state, options);
    const id = requireText(annotationId, 'Annotation id');
    const annotations = { ...current.annotations };
    delete annotations[id];
    return cloneStorageValue({ version: ANNOTATIONS_SCHEMA_VERSION, annotations });
}

function normalizeStatusFilter(value) {
    if (value === undefined || value === null) return null;
    const source = Array.isArray(value) ? value : [value];
    return new Set(source.map(normalizeStatus));
}

export function searchAnnotations(state, filters = {}, options = {}) {
    const current = currentState(state, options);
    if (!isRecord(filters)) throw new TypeError('Annotation filters must be an object');
    const query = cleanText(filters.query, '').toLocaleLowerCase();
    const tags = normalizeTags(filters.tags).map(tag => tag.toLocaleLowerCase());
    const tagMode = filters.tagMode === 'any' ? 'any' : 'all';
    const statuses = normalizeStatusFilter(filters.status);
    const pinned = typeof filters.pinned === 'boolean' ? filters.pinned : null;
    const anchorKind = filters.anchorKind === 'message' || filters.anchorKind === 'conversation'
        ? filters.anchorKind
        : null;
    const conversationId = cleanText(filters.conversationId, '');

    const results = Object.values(current.annotations).filter(annotation => {
        if (statuses && !statuses.has(annotation.status)) return false;
        if (pinned !== null && annotation.pinned !== pinned) return false;
        if (anchorKind && annotation.anchor.kind !== anchorKind) return false;
        if (conversationId && annotation.conversation.id !== conversationId) return false;
        if (tags.length) {
            const annotationTags = new Set(annotation.tags.map(tag => tag.toLocaleLowerCase()));
            const matches = tagMode === 'any'
                ? tags.some(tag => annotationTags.has(tag))
                : tags.every(tag => annotationTags.has(tag));
            if (!matches) return false;
        }
        if (query) {
            const haystack = [
                annotation.body,
                annotation.conversation.title,
                annotation.conversation.id,
                annotation.anchor.excerpt,
                ...annotation.tags
            ].filter(Boolean).join('\n').toLocaleLowerCase();
            if (!haystack.includes(query)) return false;
        }
        return true;
    });

    results.sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        const updated = right.updatedAt.localeCompare(left.updatedAt);
        return updated || left.id.localeCompare(right.id);
    });
    return cloneStorageValue(results);
}

function assertNoCredentialFields(value, path = '$', seen = new WeakSet()) {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
        const childPath = `${path}.${key}`;
        if (CREDENTIAL_FIELD.test(key)) throw new CredentialMaterialError(childPath);
        assertNoCredentialFields(child, childPath, seen);
    }
}

export function parseAnnotationsImport(input, options = {}) {
    let raw = input;
    if (typeof input === 'string') {
        if (input.length > MAX_IMPORT_LENGTH) {
            throw new AnnotationsDataError('IMPORT_TOO_LARGE', 'Annotations import exceeds 4 MiB');
        }
        try {
            raw = JSON.parse(input);
        } catch (error) {
            throw new AnnotationsDataError('INVALID_JSON', 'Annotations import is not valid JSON', error);
        }
    }
    assertNoCredentialFields(raw);
    return migrateAnnotationsData(raw, options);
}

export function createAnnotationsExport(state, options = {}) {
    const current = currentState(state, options);
    const annotations = Object.values(current.annotations)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(annotation => cloneStorageValue(annotation));
    return {
        schema: ANNOTATIONS_SCHEMA,
        version: ANNOTATIONS_SCHEMA_VERSION,
        exportedAt: getNowIso(options),
        annotations
    };
}

export function serializeAnnotationsExport(state, options = {}) {
    return JSON.stringify(createAnnotationsExport(state, options), null, 2);
}

export function importAnnotations(state, input, options = {}) {
    const current = currentState(state, options);
    const incoming = parseAnnotationsImport(input, options);
    const mode = options.mode ?? 'merge';
    const conflict = options.conflict ?? 'newer';
    if (mode !== 'merge' && mode !== 'replace') {
        throw new TypeError('Annotation import mode must be merge or replace');
    }
    if (!['newer', 'incoming', 'existing'].includes(conflict)) {
        throw new TypeError('Annotation conflict policy must be newer, incoming, or existing');
    }

    const annotations = mode === 'replace' ? {} : { ...current.annotations };
    let imported = 0;
    let skipped = 0;
    let replaced = 0;
    for (const annotation of Object.values(incoming.annotations)) {
        const existing = annotations[annotation.id];
        const shouldUseIncoming = !existing
            || conflict === 'incoming'
            || (conflict === 'newer' && annotation.updatedAt > existing.updatedAt);
        if (!shouldUseIncoming) {
            skipped += 1;
            continue;
        }
        if (existing) replaced += 1;
        annotations[annotation.id] = annotation;
        imported += 1;
    }
    return cloneStorageValue({
        data: { version: ANNOTATIONS_SCHEMA_VERSION, annotations },
        imported,
        skipped,
        replaced
    });
}
