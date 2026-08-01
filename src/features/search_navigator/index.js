export {
    DEFAULT_SEARCH_LIMITS,
    SEARCH_NAVIGATOR_CAPABILITY,
    SEARCH_NAVIGATOR_MODULE_ID,
    SEARCH_NAVIGATOR_SEMANTICS,
    SEARCH_NAVIGATOR_VIEW_MODULE_ID,
    SearchNavigatorError
} from './contracts.js';

export {
    normalizeSearchText,
    projectSearchText,
    tokenizeSearchText
} from './text.js';

export { SearchNavigator, createSearchNavigatorModule } from './search_navigator.js';

export {
    SearchIndexSynchronizer,
    observeGeminiSearchChanges,
    withPortableMessageIds
} from './live_index_sync.js';

export {
    CHATS_RESTORE_SECTION,
    createChatsPortableRestoreContributor
} from './chats_restore_contributor.js';

export {
    assertSearchLocator,
    createChatLocator,
    createMessageLocator
} from './locator.js';

export {
    SearchNavigatorViewController,
    createSearchNavigatorFeatureModule,
    formatQuoteText
} from './vertical_feature.js';
