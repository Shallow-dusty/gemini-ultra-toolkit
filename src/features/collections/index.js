export { CollectionsError } from './errors.js';
export {
    COLLECTIONS_EXPORT_FORMAT,
    COLLECTIONS_EXPORT_VERSION,
    COLLECTIONS_SCHEMA,
    COLLECTIONS_SCHEMA_VERSION,
    COLLECTION_LIMITS,
    LEGACY_FOLDERS_SCHEMA,
    ROOT_COLLECTION_ID,
    RULE_FIELDS,
    RULE_OPERATORS,
    SORT_FIELDS,
    assertImportSize,
    createEmptyCollectionsState,
    createNativeMetadata,
    getNowIso,
    migrateLegacyFolders,
    normalizeCollection,
    normalizeCollectionsState,
    normalizeId,
    normalizeItemId,
    normalizeRules,
    normalizeSessionId,
    normalizeTags,
    parseJson,
    resolveCollectionLimits,
    safeClone,
    sessionIdFromContext
} from './model.js';
export {
    createCollection,
    getCollectionTree,
    listCollections,
    moveCollection,
    removeCollection,
    resolveMembership,
    setManualMembership,
    setNotebooksAvailability,
    updateCollection
} from './operations.js';
export {
    createCollectionsExport,
    importCollections,
    parseCollectionsImport,
    serializeCollectionsExport
} from './transfer.js';
export {
    CollectionsService,
    createCollectionsModule,
    createCollectionsService
} from './feature.js';
export {
    LEGACY_COLLECTIONS_FIELD,
    LEGACY_FOLDERS_KEY,
    createLegacyCollectionsRepository,
    legacyStorageKey,
    readCollectionsFromLegacy,
    writeCollectionsToLegacy
} from './legacy_repository.js';
export {
    COLLECTIONS_RESTORE_SECTION,
    createCollectionsRestoreContributor
} from './restore_contributor.js';
export {
    createCollectionsPortableIntegrationManager,
    resolveCollectionsSessionAccess
} from './portable_integration.js';
export {
    COLLECTIONS_VIEW_IDS,
    CollectionsView,
    createCollectionsView,
    flattenCollectionTree,
    formatRulesDraft,
    parseRulesDraft,
    parseTagsDraft
} from './view.js';
export {
    CollectionsController,
    createCollectionsController
} from './controller.js';
export {
    buildCollectionsPresentation,
    collectionsInTreeOrder,
    normalizeSidebarChats
} from './presentation.js';
export {
    createSmartRulePreview,
    mergeRuleCandidates,
    smartRulePreviewFingerprint
} from './smart_rules.js';
export {
    RulePreviewSession,
    createRulePreviewSession
} from './rule_preview_session.js';
