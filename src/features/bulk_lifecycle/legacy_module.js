import { GeminiAdapter } from '../../adapters/gemini.js';
import { Core } from '../../core.js';
import { getCurrentTheme } from '../../state.js';
import { createUiRoot } from '../../ui/root.js';
import { DialogManager } from '../../ui/dialog_manager.js';
import { BulkLifecycleFeature } from './feature.js';
import { createGeminiBulkLifecycleAdapter } from './gemini_adapter.js';
import {
    BULK_LIFECYCLE_ARCHIVE_CAPABILITY,
    normalizeArchiveCapability
} from './archive_capability.js';

function optionalArchiveCapability(configured, context) {
    if (configured !== undefined) return configured;
    if (context.archiveCapability !== undefined) return context.archiveCapability;
    return context.getCapability?.(BULK_LIFECYCLE_ARCHIVE_CAPABILITY) || null;
}

function releaseOwnedRoot(root) {
    Core._autoThemeRoots.delete(root.host);
    root.destroy();
}

export function createBatchDeleteModule(initialOptions = {}) {
    let options = { ...initialOptions };
    let runtime = null;
    let archiveCapability = Object.hasOwn(initialOptions, 'archiveCapability')
        ? normalizeArchiveCapability(initialOptions.archiveCapability)
        : undefined;

    return {
        id: 'batch-delete',
        key: 'batch-delete',
        toggleId: 'batch-delete',
        name: '批量生命周期 / Bulk Lifecycle',
        legacyName: '批量删除 / Batch Delete',
        description: '显式选择、归档、预览并安全删除对话 / Explicitly select, archive, preview, and safely delete conversations',
        icon: '\uD83D\uDDD1\uFE0F',
        iconId: 'trash',
        defaultEnabled: false,

        configure(nextOptions = {}) {
            if (runtime) throw new Error('Cannot configure Bulk Lifecycle while it is running');
            if (!nextOptions || typeof nextOptions !== 'object' || Array.isArray(nextOptions)) {
                throw new TypeError('Bulk Lifecycle configuration must be an object');
            }
            options = { ...options, ...nextOptions };
            if (Object.hasOwn(nextOptions, 'archiveCapability')) {
                archiveCapability = normalizeArchiveCapability(nextOptions.archiveCapability);
            }
            return this;
        },

        configureCapabilities(capabilities = {}) {
            if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
                throw new TypeError('Bulk Lifecycle capabilities must be an object');
            }
            const next = Object.hasOwn(capabilities, BULK_LIFECYCLE_ARCHIVE_CAPABILITY)
                ? normalizeArchiveCapability(capabilities[BULK_LIFECYCLE_ARCHIVE_CAPABILITY])
                : null;
            archiveCapability = next;
            runtime?.feature.setArchiveCapability(next);
            return this;
        },

        async init(context = {}) {
            if (runtime) return false;
            const documentRef = options.document || globalThis.document;
            const adapter = options.adapter || createGeminiBulkLifecycleAdapter({
                gemini: options.gemini || GeminiAdapter,
                document: documentRef,
                window: options.window || globalThis.window,
                timers: options.timers || globalThis,
                wait: options.wait || null,
                session: context.session
            });
            let root = options.uiRoot || null;
            let dialogs = options.dialogs || null;
            let ownsRoot = false;
            let ownsDialogs = false;
            if (!dialogs) {
                if (!root) {
                    root = createUiRoot({
                        document: documentRef,
                        mount: options.dialogMount || documentRef.body,
                        id: 'primer-bulk-lifecycle-dialog-root'
                    });
                    root.host.setAttribute('data-primer-owned', '');
                    Core.applyTheme(root.host, getCurrentTheme());
                    ownsRoot = true;
                }
                dialogs = new DialogManager({ root });
                ownsDialogs = true;
            }

            const feature = new BulkLifecycleFeature({
                document: documentRef,
                adapter,
                dialogs,
                archiveCapability: normalizeArchiveCapability(optionalArchiveCapability(archiveCapability, context)),
                translate: options.translate,
                now: options.now
            });
            try {
                feature.start({ session: context.session });
                runtime = { feature, adapter, dialogs, root, ownsDialogs, ownsRoot };
                return true;
            } catch (error) {
                await feature.stop('start-failed');
                if (ownsDialogs) dialogs.destroy();
                if (ownsRoot) releaseOwnedRoot(root);
                throw error;
            }
        },

        async destroy(context = {}) {
            if (!runtime) return false;
            const current = runtime;
            runtime = null;
            try {
                await current.feature.stop(context.reason || 'module-stopped');
            } finally {
                if (current.ownsDialogs) current.dialogs.destroy();
                if (current.ownsRoot) releaseOwnedRoot(current.root);
            }
            return true;
        },

        onUserChange(session) {
            return runtime?.feature.changeSession(session) ?? session;
        },

        injectNativeUI() {
            return runtime?.feature.mountNativeUI() || false;
        },

        removeNativeUI() {
            return runtime?.feature.unmountNativeUI() || false;
        },

        renderToDetailsPane(container) {
            return runtime?.feature.render(container) || null;
        },

        _scanChats() {
            return runtime?.adapter.listConversations() || [];
        },

        _batchDelete() {
            return runtime?.feature.openPreview() || null;
        },

        get _selected() {
            return new Set(runtime?.feature.selectedIds || []);
        },

        get _deleting() {
            return runtime?.feature.controller.active || false;
        },

        get controller() {
            return runtime?.feature || null;
        },

        get _archiveCapability() {
            return archiveCapability ?? null;
        },

        getOnboarding() {
            return {
                zh: {
                    rant: '原来的批量删除把选择、确认和不可逆操作挤在一次点击里，页面变化后仍可能操作旧目标。',
                    features: '仅处理明确选择且仍匹配快照的当前侧栏对话；支持删除前归档、强确认词、二次确认、取消和逐项失败报告。',
                    guide: '选择当前可见范围中的对话，检查标题、数量和运行范围，输入要求的确认词，再完成二次确认。'
                },
                en: {
                    rant: 'The former batch delete flow compressed selection, confirmation, and irreversible actions into one fragile click path.',
                    features: 'Only explicitly selected conversations that still match the captured sidebar snapshot are processed, with optional pre-delete archive, cancellation, and per-item reporting.',
                    guide: 'Select conversations in the visible scope, review titles/count/scope, type the required phrase, then complete the final confirmation.'
                }
            };
        }
    };
}

export const BatchDeleteModule = createBatchDeleteModule();
