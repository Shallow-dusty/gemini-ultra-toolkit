import { PORTABLE_ARCHIVE_SECTIONS } from './constants.js';
import { deterministicStringify } from './canonical.js';

const CHAT_FALLBACK_CODES = new Set([
    'MISSING_SECTION',
    'SECTION_DISABLED',
    'SECTION_UNAVAILABLE',
    'WIRING_INACTIVE'
]);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function optionalProvider(value, name) {
    if (value !== null && value !== undefined && typeof value !== 'function') {
        throw new TypeError(`Export ${name} must be a function`);
    }
    return value || null;
}

function normalizeInclude(value) {
    const include = value === undefined ? ['chats'] : value;
    if (!Array.isArray(include) || new Set(include).size !== include.length ||
        include.some(section => !PORTABLE_ARCHIVE_SECTIONS.includes(section))) {
        throw new TypeError('Export archive section selection is invalid');
    }
    return [...include];
}

function chatIdentity(chat) {
    for (const value of [chat?.chatId, chat?.id]) {
        if (value === null || value === undefined) continue;
        const identity = String(value).trim();
        if (identity) return identity;
    }
    return '';
}
const hasMessages = chat => Array.isArray(chat?.messages) && chat.messages.length > 0;

function assertProviderChats(provided) {
    if (!Array.isArray(provided)) throw new TypeError('Export chats provider must return an array');
    const identities = new Set();
    for (const chat of provided) {
        if (!isObject(chat)) throw new TypeError('Export chats provider must contain object records');
        const identity = chatIdentity(chat);
        if (!identity) continue;
        if (identities.has(identity)) {
            throw new TypeError(`Export chats provider returned duplicate identity: ${identity}`);
        }
        identities.add(identity);
    }
}

function restoreProviderField(merged, provided, field) {
    if (Object.hasOwn(provided, field)) merged[field] = provided[field];
    else delete merged[field];
}

function mergeMatchingTranscript(provided, transcript) {
    const merged = { ...provided, ...transcript };
    if (isObject(provided.metadata) || isObject(transcript.metadata)) {
        merged.metadata = {
            ...(isObject(provided.metadata) ? provided.metadata : {}),
            ...(isObject(transcript.metadata) ? transcript.metadata : {})
        };
    }
    for (const field of ['tags', 'annotations', 'aliases', 'collections']) {
        if (Object.hasOwn(provided, field)) merged[field] = provided[field];
    }
    if (!hasMessages(transcript)) {
        for (const field of ['format', 'schemaVersion', 'messages', 'structure', 'fidelity']) {
            restoreProviderField(merged, provided, field);
        }
    }
    return merged;
}

function mergeVisibleTranscript(provided, transcript) {
    assertProviderChats(provided);
    const chats = [...provided];
    const visibleId = chatIdentity(transcript);
    const hasVisibleContent = hasMessages(transcript);
    if (!visibleId && !hasVisibleContent) return chats;
    if (visibleId) {
        const index = chats.findIndex(chat => chatIdentity(chat) === visibleId);
        if (index === -1) {
            if (hasVisibleContent) chats.push(transcript);
        } else {
            chats[index] = mergeMatchingTranscript(chats[index], transcript);
        }
        return chats;
    }
    const fingerprint = deterministicStringify(transcript);
    if (!chats.some(chat => !chatIdentity(chat) && deterministicStringify(chat) === fingerprint)) {
        chats.push(transcript);
    }
    return chats;
}

/** Preserve the visible transcript while adapting strict production providers. */
export function createLegacyArchiveProviderBridge({ getTranscript } = {}) {
    if (typeof getTranscript !== 'function') {
        throw new TypeError('Export provider bridge requires getTranscript()');
    }
    let sectionsProvider = null;
    let contributorsProvider = null;
    let availabilityProvider = null;

    function configure({
        archiveSectionsProvider = null,
        contributorsProvider: contributors = null,
        availabilityProvider: availability = null
    } = {}) {
        sectionsProvider = optionalProvider(archiveSectionsProvider, 'archiveSectionsProvider');
        contributorsProvider = optionalProvider(contributors, 'contributorsProvider');
        availabilityProvider = optionalProvider(availability, 'availabilityProvider');
        return api;
    }

    async function collect(include, signal) {
        if (!sectionsProvider || include.length === 0) return {};
        const provided = await sectionsProvider({ include: [...include], signal });
        if (!isObject(provided)) {
            throw new TypeError('Export archiveSectionsProvider must return an object');
        }
        return Object.fromEntries(include
            .filter(section => Object.hasOwn(provided, section))
            .map(section => [section, provided[section]]));
    }

    async function getSections(options = {}) {
        if (!isObject(options)) throw new TypeError('Export archive section options must be an object');
        const include = normalizeInclude(options.include);
        const nonChats = include.filter(section => section !== 'chats');
        const sections = await collect(nonChats, options.signal);
        if (!include.includes('chats')) return sections;

        const transcript = getTranscript();
        const fallback = (chatIdentity(transcript) || hasMessages(transcript)) ? [transcript] : [];
        try {
            const provided = await collect(['chats'], options.signal);
            sections.chats = Object.hasOwn(provided, 'chats')
                ? mergeVisibleTranscript(provided.chats, transcript)
                : fallback;
        } catch (error) {
            if (!CHAT_FALLBACK_CODES.has(error?.code)) throw error;
            sections.chats = fallback;
        }
        return sections;
    }

    function getContributors() {
        return contributorsProvider ? contributorsProvider() : {};
    }

    async function getAvailability() {
        if (!availabilityProvider) return null;
        const snapshot = await availabilityProvider();
        if (!isObject(snapshot) || !isObject(snapshot.sections)) {
            throw new TypeError('Export availabilityProvider must return an availability snapshot');
        }
        const chats = snapshot.sections.chats?.status === 'available'
            ? snapshot.sections.chats
            : Object.freeze({ status: 'available', reasonCode: 'TRANSCRIPT_FALLBACK' });
        return Object.freeze({
            ...snapshot,
            sections: Object.freeze({ ...snapshot.sections, chats })
        });
    }

    const api = Object.freeze({
        configure,
        getSections,
        getContributors,
        getAvailability,
        get archiveSectionsProvider() { return sectionsProvider; },
        get contributorsProvider() { return contributorsProvider; },
        get availabilityProvider() { return availabilityProvider; }
    });
    return api;
}
