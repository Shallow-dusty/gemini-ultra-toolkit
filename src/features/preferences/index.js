export {
    DEFAULT_MODULE_METADATA,
    PreferencesCatalog,
    PreferencesError,
    assertModuleId,
    immutablePreferencesCopy
} from './catalog.js';
export {
    ENABLED_MODULES_STORAGE_KEY,
    GLOBAL_PREFERENCES_SCOPE,
    GlobalPreferencesStorageAdapter,
    createGlobalPreferencesStorageAdapter
} from './storage_adapter.js';
export {
    FeaturePreferencesService
} from './preferences_service.js';
export {
    createModuleHostPreferencesRuntime
} from './preferences_ports.js';
export {
    LEGACY_PREFERENCE_KEYS,
    PreferencePersistenceError,
    createGlobalGmPreferencesStorage,
    createLegacyPreferenceRepository
} from './legacy_repository.js';
export {
    DefaultModelPreferenceController,
} from './default_model_controller.js';
export {
    DEFAULT_MODEL_KEYS,
    chooseModelOption,
    normalizePreferredModel
} from './default_model_schema.js';
export {
    DefaultModelSwitcher
} from './default_model_switcher.js';
export {
    createPollingWaitFor
} from './polling_wait.js';
export {
    DEFAULT_UI_TWEAKS,
    UI_TWEAK_FEATURE_IDS,
    normalizeUiTweaks,
    uiPreferenceAcceptsValue
} from './ui_tweaks_schema.js';
export {
    UiTweaksPreferenceController
} from './ui_tweaks_controller.js';
export {
    UiComposerPreference
} from './ui_composer_preference.js';
export {
    UiLayoutPreference
} from './ui_layout_preference.js';
export {
    UiTitlePreference
} from './ui_title_preference.js';
export {
    getAdapterCapabilityStatus
} from './adapter_capability.js';
export { createDomPreferencesSurface } from './dom_surface.js';
export {
    PREFERENCES_PORTABLE_SCHEMA_VERSION,
    PREFERENCES_RESTORE_SECTION,
    createPreferencesPortableArchivePort,
    createPreferencesRestoreContributor,
    normalizePortablePreferences,
    preferencesRestoreContributorInternals
} from './restore_contributor.js';
