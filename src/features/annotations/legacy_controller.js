import { Core } from '../../core.js';
import { Logger } from '../../logger.js';
import { NativeUI } from '../../native_ui.js';
import { AnnotationsFeatureError, createAnnotationsFeature } from './feature.js';
import {
    createLegacyAnnotationsRepository,
    createLegacyNotesProjection
} from './legacy_repository.js';
import { createAnnotationsPortableArchiveIntegration } from './restore_contributor.js';

/** Owns legacy lifecycle, account binding, mutation guards, and data projection. */
export function createLegacyAnnotationsController(host) {
    return Object.freeze({
        getStorageKey(user = Core.getCurrentUser()) {
            return user && user.includes('@') ? `${host.STORAGE_KEY}_${user}` : host.STORAGE_KEY;
        },

        getSessionId(fallback) {
            const value = typeof fallback === 'string'
                ? fallback
                : fallback && typeof fallback === 'object'
                    ? fallback.accountId ?? fallback.userId ?? fallback.id
                    : Core.getCurrentUser();
            return String(value || Core.getTempUser()).trim() || Core.getTempUser();
        },

        createRepository(accountId) {
            if (!host._repositories) host._repositories = new Map();
            if (!host._repositories.has(accountId)) {
                host._repositories.set(accountId, createLegacyAnnotationsRepository({ accountId }));
            }
            return host._repositories.get(accountId);
        },

        createService() {
            return createAnnotationsFeature({
                repositoryForSession: accountId => host._createRepository(accountId)
            });
        },

        async init(context = {}) {
            host._archiveGeneration += 1;
            if (host._service) await host._service.stop();
            host._repositories = new Map();
            host._service = host._createService();
            await host._service.start({ session: host._getSessionId(context.session) });
            host._syncCompatibilityData();
            Logger.info('Annotations compatibility module initialized', host._getStats());
        },

        async destroy() {
            host._archiveGeneration += 1;
            const service = host._service;
            host._service = null;
            host._detailsContainer = null;
            host.data = { notes: {} };
            if (service) await service.stop();
            host._repositories?.clear();
            host._repositories = null;
        },

        async onUserChange(user) {
            if (!host._service) return;
            host._archiveGeneration += 1;
            await host._service.onSessionChange(host._getSessionId(user));
            host._syncCompatibilityData();
            host._refreshDetails();
        },

        async loadData(user = Core.getCurrentUser()) {
            if (!host._service) return host.init({ session: user });
            await host.onUserChange(user);
            return host.data;
        },

        injectNativeUI() { return Boolean(host._service); },

        syncCompatibilityData() {
            if (!host._service) {
                host.data = { notes: {} };
                return;
            }
            const compatible = createLegacyNotesProjection(host._service.getSnapshot());
            host.data = { notes: compatible.notes };
        },

        isInspecting() {
            const current = Core.getCurrentUser();
            const inspecting = Core.getInspectingUser();
            const guest = Core.getTempUser();
            return Boolean(inspecting && inspecting !== guest && inspecting !== current);
        },

        writeContext() {
            return { sessionId: Core.getCurrentUser(), readOnly: host._isInspecting() };
        },

        snapshot() {
            return host._service?.getSnapshot() || { version: 2, annotations: {} };
        },

        getPortableArchiveIntegration() {
            const service = host._service;
            if (!service) {
                throw new AnnotationsFeatureError('NOT_STARTED', 'Annotations feature is not active');
            }
            const generation = host._archiveGeneration;
            return createAnnotationsPortableArchiveIntegration({
                service,
                isCurrent: () => host._service === service && host._archiveGeneration === generation,
                isReadOnly: () => host._isInspecting() || service.isReadOnly()
            });
        },

        getStats() {
            const annotations = Object.values(host._snapshot().annotations);
            return {
                total: annotations.length,
                pinned: annotations.filter(annotation => annotation.pinned).length,
                messages: annotations.filter(annotation => annotation.anchor.kind === 'message').length
            };
        },

        conversationAnnotation(chatId) {
            return Object.values(host._snapshot().annotations)
                .filter(annotation => annotation.conversation.id === chatId && annotation.anchor.kind === 'conversation')
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] || null;
        },

        refreshDetails() {
            const container = host._detailsContainer;
            if (!container) return;
            if (typeof container.replaceChildren === 'function') container.replaceChildren();
            else container.textContent = '';
            host.renderToDetailsPane(container);
        },

        showError(error) {
            const readOnly = error?.code === 'READ_ONLY_SESSION';
            const changed = error?.code === 'SESSION_CHANGED';
            const message = readOnly
                ? NativeUI.t('检查其他账号时注释为只读', 'Annotations are read-only while inspecting another account')
                : changed
                    ? NativeUI.t('账号已切换，请重试', 'The account changed; please try again')
                    : NativeUI.t('注释操作失败', 'Annotation operation failed');
            NativeUI.showToast(message);
            Logger.warn('Annotations operation failed', { code: error?.code || 'UNKNOWN' });
        },

        async mutate(operation, successMessage = '') {
            if (!host._service) return false;
            try {
                await operation(host._writeContext());
                host._syncCompatibilityData();
                host._refreshDetails();
                if (successMessage) NativeUI.showToast(successMessage);
                return true;
            } catch (error) {
                host._showError(error);
                return false;
            }
        }
    });
}
