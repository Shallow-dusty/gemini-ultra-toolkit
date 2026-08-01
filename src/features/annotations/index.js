export {
    ANNOTATIONS_SCHEMA,
    ANNOTATIONS_SCHEMA_VERSION,
    ANNOTATION_STATUSES,
    LEGACY_CHAT_NOTES_SCHEMA,
    AnnotationsDataError,
    CredentialMaterialError,
    UnsupportedAnnotationsVersionError,
    createAnnotationsExport,
    createEmptyAnnotationsState,
    deleteAnnotation,
    importAnnotations,
    migrateAnnotationsData,
    normalizeAnnotation,
    parseAnnotationsImport,
    resolveAnnotationAnchor,
    searchAnnotations,
    serializeAnnotationsExport,
    upsertAnnotation
} from './domain.js';

export {
    AnnotationsFeatureError,
    createAnnotationsFeature,
    createAnnotationsModule
} from './feature.js';

export {
    LEGACY_ANNOTATIONS_STORAGE_KEY,
    createLegacyAnnotationsRepository,
    createLegacyNotesProjection,
    resolveLegacyAnnotationsStorageKey
} from './legacy_repository.js';

export {
    ANNOTATIONS_RESTORE_SECTION,
    createAnnotationsPortableArchiveIntegration,
    createAnnotationsRestoreContributor
} from './restore_contributor.js';
