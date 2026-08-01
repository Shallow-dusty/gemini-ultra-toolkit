import { createPortableArchiveOperations } from './archive_operations.js';
import { createArchiveDialogView } from './archive_dialog_view.js';
import { createArchiveControlsView } from './archive_controls_view.js';
import { createPortableIntegrationResolver, createPortableRestoreCoordinator } from './restore_coordinator.js';
import { DEFAULT_SELECTION, DIALOG_IDS, SECTION_LABELS, archivePreview, assertFunction,
    defaultFilename, fail, isPlainObject, normalizeSelection } from './feature_contract.js';

export { PortableArchiveFeatureError } from './feature_contract.js';
/** Lifecycle shell that composes operations, dialog rendering, and controls. */
export function createPortableArchiveFeature(options = {}) {
    const getSource = options.getSource;
    const getSections = options.getSections;
    const getCurrentSections = options.getCurrentSections ?? getSections;
    const download = options.download;
    const now = options.now;
    const filename = options.filename ?? defaultFilename;
    const notify = options.notify ?? (() => {});
    const translate = options.translate ?? ((_zh, en) => en);
    const openDialog = options.openDialog;
    const closeDialog = options.closeDialog;
    assertFunction(getSource, 'getSource');
    assertFunction(getSections, 'getSections');
    assertFunction(getCurrentSections, 'getCurrentSections');
    assertFunction(download, 'download', true);
    assertFunction(now, 'now');
    assertFunction(filename, 'filename');
    assertFunction(notify, 'notify');
    assertFunction(translate, 'translate');
    assertFunction(openDialog, 'openDialog', true);
    assertFunction(closeDialog, 'closeDialog', true);

    let started = false;
    let generation = 0;
    const mounts = new Map();
    const getIntegrations = createPortableIntegrationResolver(options.integrations);
    function requireStarted() {
        if (!started) fail('NOT_STARTED', 'Portable Archive is not started');
        return generation;
    }

    function assertCurrent(operationGeneration) {
        if (!started || operationGeneration !== generation) {
            fail('OPERATION_CANCELLED', 'Portable Archive operation was cancelled by a lifecycle change');
        }
    }

    const operations = createPortableArchiveOperations({
        getSource,
        getSections,
        getCurrentSections,
        getAvailability: options.availability,
        download,
        now,
        filename,
        limits: options.limits,
        cryptoProvider: options.cryptoProvider,
        getIntegrations,
        requireStarted,
        assertCurrent
    });
    const restore = createPortableRestoreCoordinator({
        getIntegrations,
        contributors: options.contributors,
        executor: options.executor,
        createExecutor: options.createExecutor,
        isReadOnly: options.isReadOnly,
        requireStarted,
        assertCurrent
    });
    async function planRestoreText(text, strategy = 'skip') {
        restore.invalidateResume('NEW_PLAN');
        return operations.planRestoreText(text, strategy);
    }
    const dialogs = createArchiveDialogView({
        operations: Object.freeze({ ...operations, planRestoreText }),
        describeRestore: restore.describe,
        applyRestore: restore.execute,
        resumeRestore: restore.resume,
        getResumeEligibility: restore.getResumeEligibility,
        cancelRestore: restore.cancel,
        document: () => options.document ?? globalThis.document,
        translate,
        openDialog,
        closeDialog
    });
    const controls = createArchiveControlsView({
        operations,
        dialogs,
        document: container => options.document ?? container.ownerDocument ?? globalThis.document,
        translate,
        notify
    });

    function mount(container, mountOptions = {}) {
        requireStarted();
        const slot = mountOptions.slot ?? container;
        const previous = mounts.get(slot);
        if (previous?.container === container && previous.root.parentElement === container) return previous.handle;
        previous?.handle.unmount();

        const built = controls.build(container, mountOptions);
        let mounted = true;
        const handle = Object.freeze({
            ...built,
            unmount() {
                if (!mounted) return false;
                mounted = false;
                built.previewButton.onclick = null;
                built.downloadButton.onclick = null;
                built.planButton.onclick = null;
                built.root.remove();
                if (mounts.get(slot)?.handle === handle) mounts.delete(slot);
                return true;
            }
        });
        mounts.set(slot, { container, root: built.root, handle });
        return handle;
    }

    function start() {
        if (started) return api;
        started = true;
        generation += 1;
        restore.reset('feature-start');
        return api;
    }

    function sessionChanged() {
        requireStarted();
        generation += 1;
        restore.reset('session-change');
        dialogs.closeAll('session-change');
        for (const { handle } of mounts.values()) {
            controls.setStatus(handle.status, translate('会话已切换', 'Session changed'));
        }
    }

    function stop() {
        if (!started) return false;
        started = false;
        generation += 1;
        restore.reset('feature-stop');
        dialogs.closeAll('feature-stop');
        for (const record of [...mounts.values()]) record.handle.unmount();
        return true;
    }

    const api = Object.freeze({
        get started() { return started; },
        start,
        stop,
        sessionChanged,
        mount,
        create: operations.create,
        preview: operations.preview,
        download: operations.download,
        planRestoreText,
        inspectAvailability: operations.inspectAvailability,
        describeRestore: restore.describe,
        applyRestore: restore.execute,
        resumeRestore: restore.resume,
        getRestoreResumeEligibility: restore.getResumeEligibility,
        cancelRestore: restore.cancel,
        showPreview: dialogs.showPreview,
        showRestorePlan: dialogs.showRestorePlan,
        get restoreRunning() { return restore.running; }
    });
    return api;
}

export const portableArchiveFeatureInternals = Object.freeze({
    DEFAULT_SELECTION,
    DIALOG_IDS,
    SECTION_LABELS,
    archivePreview,
    defaultFilename,
    isPlainObject,
    normalizeSelection
});
