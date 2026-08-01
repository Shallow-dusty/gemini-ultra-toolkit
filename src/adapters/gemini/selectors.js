/** Gemini-owned selector catalog. No feature may query these selectors directly. */
export const SELECTORS = Object.freeze({
    SIDEBAR: Object.freeze([
        'bard-sidenav',
        'nav[aria-label="Side Navigation"]',
        '.sidenav-with-history-container',
        'nav[role="navigation"]'
    ]),
    SIDEBAR_CURRENT_MARKERS: Object.freeze([
        '[data-test-id="new-chat-button"]',
        '[data-test-id="search-chats-button"]',
        '[data-test-id="temp-chat-button"]'
    ]),
    SIDEBAR_OVERFLOW: '.overflow-container',
    SIDEBAR_CONVERSATIONS_LIST: 'conversations-list[data-test-id="all-conversations"]',
    CHAT_LINK: 'gem-nav-list-item[data-test-id="conversation"] a[href*="/app/"], a[href*="/app/"]',
    CHAT_ROW_WRAPPER: 'gem-nav-list-item[data-test-id="conversation"]',
    CHAT_ROW_MORE_BTN: 'button[aria-label^="More options for"]',

    INPUT_AREA: Object.freeze([
        '[data-test-id="textarea-wrapper"]',
        'input-area-v2',
        '.input-area-container',
        'input-container',
        '[data-test-id="textarea-inner"]'
    ]),
    INPUT_EDITOR_CURRENT: Object.freeze([
        '[data-test-id="textarea-inner"] [contenteditable="true"]',
        '[data-test-id="textarea-inner"][contenteditable="true"]',
        'textarea[data-test-id="textarea-inner"]'
    ]),
    INPUT_EDITOR: 'div.ql-editor[contenteditable="true"]',
    INPUT_EDITOR_BY_ARIA: '[role="textbox"][contenteditable="true"], [role="textbox"][aria-label="Enter a prompt for Gemini"]',
    INPUT_EDITOR_TARGET: '[data-test-id="textarea-inner"], textarea, div.ql-editor[contenteditable="true"], [role="textbox"], [contenteditable="true"]',
    INPUT_TRAILING_ACTIONS: '.trailing-actions-wrapper',
    TOOL_MODE_CANDIDATE: 'button, [role="button"], [aria-pressed="true"], [data-active="true"]',
    SEND_BUTTON: Object.freeze([
        'button[data-test-id="send-button"]',
        'button[aria-label="Send message"]',
        'button.send-button',
        'button[aria-label*="Send" i]'
    ]),

    MODE_BTN: Object.freeze([
        '[data-test-id="bard-mode-menu-button"]',
        '[data-test-id="bard-mode-switcher"] [data-test-id="bard-mode-menu-button"]',
        '[data-test-id="bard-mode-switcher"] button',
        'button[aria-label="Open mode picker"]',
        'button.input-area-switch'
    ]),
    MODE_BTN_LABEL: '.picker-primary-text',
    MODE_MENU: '[data-test-id="gem-mode-menu"][role="menu"]',
    MODE_MENU_ITEM: '[role="menuitem"][data-test-id^="bard-mode-option-"], gem-menu-item[data-test-id^="bard-mode-option-"]',
    MODE_MENU_ITEM_ANY: '[role="menuitem"]',

    CHAT_HEADER_MORE_BTN: Object.freeze([
        'button[data-test-id="conversation-actions-menu-button"]',
        'button[aria-label*="Open menu for conversation actions" i]'
    ]),
    CHAT_HEADER_TITLE: Object.freeze([
        '[data-test-id="conversation-title"]',
        'h1.conversation-title',
        '.conversation-title-container',
        'h1.cdk-visually-hidden'
    ]),
    USER_AREAS: 'a[aria-label*="@"], button[aria-label*="@"], div[aria-label*="帐号"], div[aria-label*="Account"], img[alt*="@"], img[aria-label*="@"]',

    MENU_PANEL: '.cdk-overlay-pane [role="menu"], .cdk-overlay-container [role="menu"], .mat-mdc-menu-panel',
    MENU_ITEM: '[role="menuitem"], mat-menu-item, button.mat-mdc-menu-item, .mat-menu-item',
    DELETE_BUTTON: 'button[data-test-id="delete-button"]',
    DIALOG: 'mat-dialog-container, .mdc-dialog, [role="dialog"], [role="alertdialog"]',
    DIALOG_CONFIRM_BTNS: 'button.confirm-button, button[data-test-id*="confirm"], mat-dialog-actions button, .mdc-dialog__actions button, [role="dialog"] button, [role="alertdialog"] button',

    USER_QUERY_CURRENT: '[data-test-id="user-query"]',
    MODEL_RESPONSE_CURRENT: '[data-test-id="model-response"]',
    USER_QUERY: '[data-test-id="user-query"], user-query',
    MODEL_RESPONSE: '[data-test-id="model-response"], model-response',
    MESSAGE_ACTIONS: 'message-actions',
    RESPONSE_CONTAINER: 'response-container',
    CONVERSATION_CONTAINER: '.conversation-container',
    USER_QUERY_TEXT: '.query-text, .user-query-text',
    CHAT_CONTENT_ROOT: 'main, [role="main"], user-query, model-response, response-container, .conversation-container',
    MAIN_CHAT_AREA: 'main, .chat-container, [role="main"]',
    RICH_CODE_BLOCK: 'pre, code, [data-language], [class*="code" i]',
    RICH_TABLE: 'table',
    RICH_IMAGE: 'img, picture',
    RICH_VIDEO: 'video',
    RICH_LINK: 'a[href]',
    RICH_CITATION_CANDIDATE: 'citation, [data-citation], [data-source-id], [aria-label*="source" i], [aria-label*="citation" i]',
    TRANSCRIPT_CODE: 'pre, code, [data-language]',
    TRANSCRIPT_MATH: 'math, [data-math], [data-latex], .katex, .MathJax',
    TRANSCRIPT_LINK: 'a[href]',
    TRANSCRIPT_CITATION: 'citation, [data-citation], [aria-label*="citation" i]',
    TRANSCRIPT_SOURCE: '[data-source-id], [aria-label*="source" i]',
    TRANSCRIPT_TOOL: '[data-tool-name], [data-tool-status], [aria-label*="tool" i]',
    TRANSCRIPT_RICH_PART: 'pre, code, [data-language], math, [data-math], [data-latex], .katex, .MathJax, a[href], citation, [data-citation], [data-source-id], [aria-label*="source" i], [aria-label*="citation" i], [data-tool-name], [data-tool-status], [aria-label*="tool" i]',
    TRANSCRIPT_UNSUPPORTED_RICH: 'table, img, picture, video',

    NATIVE_CAPABILITIES: Object.freeze({
        'new-chat': Object.freeze({ current: Object.freeze(['[data-test-id="new-chat-button"]']), fallback: Object.freeze(['a[href="/app"]', 'button[aria-label*="new chat" i]']) }),
        'temporary-chat': Object.freeze({ current: Object.freeze(['[data-test-id="temp-chat-button"]']), fallback: Object.freeze(['button[aria-label*="temporary chat" i]']) }),
        images: Object.freeze({ current: Object.freeze(['[data-test-id="images-side-nav-entry"]']), fallback: Object.freeze(['a[href*="/images"]']) }),
        videos: Object.freeze({ current: Object.freeze(['[data-test-id="videos-side-nav-entry"]']), fallback: Object.freeze(['a[href*="/videos"]']) }),
        library: Object.freeze({ current: Object.freeze(['[data-test-id="my-stuff-side-nav-entry"]', '[data-test-id="library-side-nav-entry"]']), fallback: Object.freeze(['a[href*="/library"]']) }),
        notebooks: Object.freeze({ current: Object.freeze(['[data-test-id="notebooks-section"]', '[data-test-id="new-notebook-button"]']), fallback: Object.freeze(['a[href*="/notebooks"]']) }),
        search: Object.freeze({ current: Object.freeze(['[data-test-id="search-chats-button"]']), fallback: Object.freeze(['button[aria-label*="search" i]']) }),
        usage: Object.freeze({ current: Object.freeze(['[data-test-id="usage-button"]', '[data-test-id="usage-side-nav-entry"]']), fallback: Object.freeze(['a[href*="/usage"]']) }),
        spark: Object.freeze({ current: Object.freeze(['[data-test-id="spark-button"]', '[data-test-id="spark-side-nav-entry"]']), fallback: Object.freeze(['a[href*="/spark"]']) }),
        skills: Object.freeze({ current: Object.freeze(['[data-test-id="skills-button"]', '[data-test-id="skills-side-nav-entry"]']), fallback: Object.freeze(['a[href*="/skills"]']) })
    }),

    UI_TWEAK_CHAT_WIDTH_TARGET: 'main .conversation-container, main .chat-window',
    UI_TWEAK_SIDEBAR_WIDTH_TARGET: 'bard-sidenav, nav[aria-label="Side Navigation"]',
    UI_TWEAK_GEMS_ENTRY: 'a[href*="/gems/"]',

    MUTATION_ATTRIBUTE_FILTER: Object.freeze(['aria-label', 'alt', 'class', 'data-test-id']),
    SIDEBAR_MUTATION_ROOT: 'nav[aria-label="Side Navigation"], bard-sidenav, bard-sidenav-container, .sidenav-with-history-container, nav[role="navigation"]',
    INPUT_MUTATION_ROOT: '[data-test-id="textarea-wrapper"], [data-test-id="textarea-inner"], input-area-v2, .input-area-container, input-container',
    HEADER_MUTATION_ROOT: 'gem-icon-button, [data-test-id="conversation-actions-menu-button"], [data-test-id="conversation-title"], .conversation-title-container',
    MODEL_MUTATION_TARGET_MATCH: '[data-test-id="bard-mode-switcher"], [data-test-id="bard-mode-menu-button"], button.input-area-switch, button[aria-label="Open mode picker"], gem-menu-item'
});
