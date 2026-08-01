import { TEMP_USER, TIMINGS } from '../../constants.js';
import { Logger } from '../../logger.js';
import { Core } from '../../core.js';
import { DOMWatcher } from '../../dom_watcher.js';
import { GeminiAdapter } from '../../adapters/gemini.js';
import { createCollectionsService } from './feature.js';
import { createLegacyCollectionsRepository, LEGACY_FOLDERS_KEY } from './legacy_repository.js';
import { createCollectionsView } from './view.js';
import { createCollectionsController } from './controller.js';

function defaultStorage() {
    return {
        get(key, fallback) {
            const getter = globalThis.GM_getValue;
            return typeof getter === 'function' ? getter(key, fallback) : fallback;
        },
        set(key, value) {
            const setter = globalThis.GM_setValue;
            if (typeof setter !== 'function') throw new Error('GM_setValue is unavailable');
            return setter(key, value);
        },
        flush() {
            const flush = globalThis.__flushGMPolyfill;
            return typeof flush === 'function' ? flush() : undefined;
        }
    };
}

function safeChatHref(href) {
    const value = String(href ?? '').trim();
    return value && !/^(?:javascript|data|vbscript):/i.test(value) ? value : null;
}

function openChat(chat) {
    if (typeof chat.element?.click === 'function') {
        chat.element.click();
        return true;
    }
    const href = safeChatHref(chat.href);
    if (!href || !globalThis.location) return false;
    globalThis.location.href = href;
    return true;
}

function notebooksAvailable() {
    try {
        const report = GeminiAdapter.getCapabilityProbeReport();
        const notebooks = report.nativeCapabilities.find(capability => capability.id === 'notebooks');
        return notebooks?.status === 'native-owned'
            && (notebooks.quality === 'available' || notebooks.quality === 'degraded');
    } catch (_error) {
        return false;
    }
}

function downloadText(documentRef, filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

function pickTextFile(documentRef, options = {}) {
    return new Promise((resolve, reject) => {
        const input = documentRef.createElement('input');
        input.type = 'file';
        input.accept = options.accept ?? '.json';
        input.oncancel = () => resolve(null);
        input.onchange = event => {
            const file = event.target.files?.[0];
            if (!file) {
                resolve(null);
                return;
            }
            const reader = new FileReader();
            reader.onload = loadEvent => resolve(String(loadEvent.target.result ?? ''));
            reader.onerror = () => reject(reader.error ?? new Error('Unable to read collections file'));
            reader.readAsText(file);
        };
        input.click();
    });
}

function defaultUi(documentRef, logger) {
    return {
        confirm: message => typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false,
        toast(message, options) {
            const method = options?.tone === 'danger' ? 'warn' : 'info';
            logger[method]?.(message);
        },
        downloadText: (filename, text, type) => downloadText(documentRef, filename, text, type),
        pickTextFile: options => pickTextFile(documentRef, options)
    };
}

function defaultAdapter() {
    return {
        scanSidebarChats: () => Core.scanSidebarChats(),
        getSidebarContainer: () => GeminiAdapter.getSidebarOverflowContainer(),
        matchesSidebarMutation: mutation => GeminiAdapter.matchesFoldersSidebarMutation(mutation),
        openChat,
        getNotebooksAvailability: notebooksAvailable
    };
}

export function legacyRulesToCollections(rules) {
    if (!Array.isArray(rules)) return [];
    return rules.map(rule => {
        if (rule?.field && rule?.operator) return rule;
        if (rule?.type === 'regex') {
            return {
                field: 'title', operator: 'contains', value: String(rule.value ?? ''),
                caseSensitive: false, enabled: false, legacyType: 'regex'
            };
        }
        return {
            field: 'title', operator: 'contains', value: String(rule?.value ?? ''),
            caseSensitive: false, enabled: true
        };
    }).filter(rule => rule.value.trim());
}

export function createDefaultFoldersRuntime(options = {}) {
    const clock = options.clock ?? (() => new Date().toISOString());
    const storage = options.storage ?? defaultStorage();
    const documentRef = options.document ?? globalThis.document;
    const translate = options.translate ?? ((zh, en) => (
        String(globalThis.navigator?.language ?? '').toLowerCase().startsWith('zh') ? zh : en
    ));
    let sequence = 0;
    const idFactory = options.idFactory ?? (() => `folder_${Date.parse(clock())}_${sequence++}`);
    const service = createCollectionsService({
        repositoryForSession: sessionId => createLegacyCollectionsRepository({
            storage, sessionId, key: LEGACY_FOLDERS_KEY, temporarySessionId: TEMP_USER, clock
        }),
        clock,
        idFactory
    });
    const view = createCollectionsView({ document: documentRef, translate });
    const adapter = options.adapter ?? defaultAdapter();
    const observer = options.observer ?? DOMWatcher;
    const ui = options.ui ?? defaultUi(documentRef, options.logger ?? Logger);
    const controller = createCollectionsController({
        service, view, adapter, observer, ui, clock,
        archiveProvider: options.archiveProvider ?? null,
        schedule: options.schedule,
        cancelSchedule: options.cancelSchedule,
        initialDelay: options.initialDelay ?? TIMINGS.POLL_INTERVAL
    });
    return Object.freeze({ service, view, controller, storage, adapter, observer, ui, clock });
}
