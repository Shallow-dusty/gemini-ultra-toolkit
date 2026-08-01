export {
    PORTABLE_ARCHIVE_CHECKSUM_ALGORITHM,
    PORTABLE_ARCHIVE_FORMAT,
    PORTABLE_ARCHIVE_LIMITS,
    PORTABLE_ARCHIVE_SCHEMA_VERSION,
    PORTABLE_ARCHIVE_SECTIONS,
    RESTORE_CONFLICT_STRATEGIES
} from './constants.js';
export { PortableArchiveError } from './errors.js';
export {
    clonePortableValue,
    deterministicStringify,
    isSensitiveFieldName,
    normalizeArchiveLimits,
    sha256Checksum,
    utf8ByteLength
} from './canonical.js';
export {
    createPortableArchive,
    parsePortableArchive,
    serializePortableArchive,
    validatePortableArchive
} from './archive.js';
export { planPortableArchiveRestore } from './restore_plan.js';
export {
    PortableRestoreExecutionError,
    createPortableRestoreExecutor,
    validatePortableRestorePlan
} from './restore_executor.js';
export {
    PortableArchiveFeatureError,
    createPortableArchiveFeature
} from './feature.js';
export { createPortableArchiveOperations } from './archive_operations.js';
export { createArchiveDialogView } from './archive_dialog_view.js';
export { createArchiveControlsView } from './archive_controls_view.js';
export {
    createPortableIntegrationResolver,
    createPortableRestoreCoordinator,
    normalizePortableArchiveIntegrations
} from './restore_coordinator.js';
export { createArchiveExportView } from './archive_export_view.js';
export {
    LEGACY_DOCX_MIME,
    LEGACY_EXPORT_FORMATS,
    createLegacyExportController
} from './legacy_export_controller.js';
export { createUsageExportController } from './usage_export_controller.js';
export { createCurrentChatExportController } from './current_chat_export_controller.js';
export { createMultiChatExportController } from './multi_chat_export_controller.js';
export {
    renderBulkTranscriptDownload,
    renderCurrentTranscriptDownload,
    renderUsageCSV,
    renderUsageMarkdown
} from './export_download_renderer.js';
export {
    assertExportSessionAdapter,
    createDefaultExportSessionAdapter,
    isPlainObject
} from './export_session_adapter.js';

/**
 * Pure restore composition example (feature wiring deliberately lives elsewhere):
 *
 * const executor = createPortableRestoreExecutor({
 *   contributors: {
 *     chats: {
 *       snapshot: context => chats.snapshot(context),
 *       apply: context => chats.applyRestore(context),
 *       rollback: context => chats.rollbackRestore(context)
 *     }
 *   },
 *   onProgress: event => reportRestoreProgress(event)
 * });
 * await executor.execute(validatedPlan, { sections: ['chats'], signal });
 */
