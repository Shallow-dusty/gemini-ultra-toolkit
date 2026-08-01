import { isPlainObject } from './export_session_adapter.js';
import { renderUsageCSV, renderUsageMarkdown } from './export_download_renderer.js';

function defaultTranslate(_zh, en) {
    return en;
}

function createBrowserDownloader({ document, url, notify, translate }) {
    return (content, filename, type) => {
        const blob = new Blob([content], { type });
        const objectUrl = url.createObjectURL(blob);
        const anchor = document().createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.click();
        url.revokeObjectURL(objectUrl);
        notify(translate(`已导出: ${filename}`, `Exported: ${filename}`));
    };
}

export function createUsageExportController(options = {}) {
    if (typeof options.now !== 'function') {
        throw new TypeError('Usage export now must be a function');
    }
    const translate = options.translate ?? defaultTranslate;
    const notify = options.notify ?? (() => {});
    const document = options.document ?? (() => globalThis.document);
    const url = options.url ?? URL;
    const state = {
        sessionAdapter: options.sessionAdapter ?? null,
        geminiAdapter: options.geminiAdapter ?? null,
        now: options.now,
        download: options.download ?? null
    };
    if (!state.download) {
        state.download = createBrowserDownloader({ document, url, notify, translate });
    }

    const controller = {
        configure({ sessionAdapter, geminiAdapter, now } = {}) {
            if (sessionAdapter !== undefined) state.sessionAdapter = sessionAdapter;
            if (geminiAdapter !== undefined) state.geminiAdapter = geminiAdapter;
            if (now !== undefined) state.now = now;
            return controller;
        },

        setDownload(download) {
            if (typeof download !== 'function') throw new TypeError('Export download must be a function');
            state.download = download;
            return controller;
        },

        get sessionAdapter() { return state.sessionAdapter; },
        get geminiAdapter() { return state.geminiAdapter; },
        get now() { return state.now; },

        getSessionMetadata() {
            const metadata = state.sessionAdapter?.getMetadata?.();
            if (!isPlainObject(metadata)) {
                throw new TypeError('Export sessionAdapter.getMetadata() must return an object');
            }
            return metadata;
        },

        getUsageSnapshot() {
            const snapshot = state.sessionAdapter?.getUsageSnapshot?.() ?? null;
            if (snapshot && typeof snapshot.then === 'function') {
                throw new TypeError('Export usage snapshots must be synchronous');
            }
            if (!isPlainObject(snapshot)) {
                notify(translate(
                    '本地用量洞察尚不可用；Gemini 官方限额请查看 Usage 页面。',
                    'Local usage insights are unavailable; use Gemini Usage for official limits.'
                ));
                return null;
            }
            return snapshot;
        },

        getGeminiAdapter() {
            return state.geminiAdapter;
        },

        download(content, filename, type) {
            return state.download(content, filename, type);
        },

        getFilePrefix() {
            const user = String(controller.getSessionMetadata().user || 'unknown').split('@')[0] || 'unknown';
            const dateValue = new Date(state.now());
            const date = Number.isFinite(dateValue.getTime())
                ? dateValue.toISOString().slice(0, 10)
                : 'unknown-date';
            return `primer-pp-${user}-${date}`;
        },

        getChatFilePrefix() {
            const chatId = controller.getSessionMetadata().chatId || 'current-chat';
            return `${controller.getFilePrefix()}-${chatId}`;
        },

        getBulkFilePrefix() {
            return `${controller.getFilePrefix()}-selected-chats`;
        },

        exportJSON() {
            const snapshot = controller.getUsageSnapshot();
            if (!snapshot) return;
            controller.download(JSON.stringify({
                total: snapshot.total,
                totalChatsCreated: snapshot.totalChatsCreated,
                chats: snapshot.chats,
                dailyCounts: snapshot.dailyCounts,
                exportedAt: state.now()
            }, null, 2), `${controller.getFilePrefix()}.json`, 'application/json');
        },

        doExportCSV() {
            const snapshot = controller.getUsageSnapshot();
            if (!snapshot) return;
            controller.download(renderUsageCSV(snapshot), `${controller.getFilePrefix()}.csv`, 'text/csv');
        },

        doExportMarkdown() {
            const snapshot = controller.getUsageSnapshot();
            if (!snapshot) return;
            const streaks = state.sessionAdapter.getUsageStreaks?.(snapshot) || snapshot.streaks || {};
            controller.download(
                renderUsageMarkdown(snapshot, controller.getSessionMetadata(), streaks),
                `${controller.getFilePrefix()}.md`,
                'text/markdown'
            );
        }
    };
    return controller;
}
