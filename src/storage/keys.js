const GUEST_USER = 'Guest';

/** Exact legacy keys.  These values deliberately mirror the current modules. */
export const GLOBAL_STORAGE_KEYS = Object.freeze({
    PANEL_POSITION: 'gemini_panel_pos',
    USER_REGISTRY: 'gemini_user_registry',
    THEME: 'gemini_current_theme',
    RESET_HOUR: 'gemini_reset_hour',
    QUOTA_LIMIT: 'gemini_quota_limit',
    ENABLED_MODULES: 'gemini_enabled_modules',
    PENDING_ENABLED_MODULES: 'gemini_enabled_modules_pending',
    LOCALE: 'gemini_locale',
    DEBUG_ENABLED: 'gemini_debug_enabled',
    LOG_LEVEL: 'gemini_log_level',
    LOGS: 'gemini_logs_store',
    ONBOARDING_SEEN: 'gemini_onboarding_seen',
    ONBOARDING_LANGUAGE: 'gemini_onboarding_lang',
    TOUR_SEEN: 'gemini_tour_seen',
    UI_TWEAKS: 'gemini_ui_tweaks',
    DEFAULT_MODEL: 'gemini_default_model'
});

/** Read-only compatibility keys still inspected by debug/import tooling. */
export const LEGACY_STORAGE_KEYS = Object.freeze({
    CHAT_MAP: 'gemini_count_chats_map',
    SESSION_COUNT: 'gemini_count_session',
    TOTAL_COUNT: 'gemini_count_total',
    INTERACTION_COUNT: 'gemini_interaction_count',
    VIEW_MODE: 'gemini_view_mode',
    PANEL_POSITION: 'gemini_panel_position',
    PANEL_POSITION_V64: 'gemini_panel_pos_v64'
});

export const STORAGE_SLOTS = Object.freeze({
    COUNTER: 'counter',
    FOLDERS: 'folders',
    PROMPT_VAULT: 'promptVault',
    MESSAGE_QUEUE: 'messageQueue',
    CHAT_NOTES: 'chatNotes'
});

const USER_KEY_DEFINITIONS = Object.freeze({
    [STORAGE_SLOTS.COUNTER]: Object.freeze({ base: 'gemini_store', suffix: 'emailRequired' }),
    [STORAGE_SLOTS.FOLDERS]: Object.freeze({ base: 'gemini_folders_data', suffix: 'nonGuest' }),
    [STORAGE_SLOTS.PROMPT_VAULT]: Object.freeze({ base: 'gemini_prompt_vault', suffix: 'email' }),
    [STORAGE_SLOTS.MESSAGE_QUEUE]: Object.freeze({ base: 'gemini_message_queue', suffix: 'email' }),
    [STORAGE_SLOTS.CHAT_NOTES]: Object.freeze({ base: 'gemini_chat_notes', suffix: 'email' })
});

export const STORAGE_SCOPE_KIND = Object.freeze({
    GLOBAL: 'global',
    SESSION: 'session',
    INSPECTION: 'inspection'
});

function normalizeUserId(userId, label) {
    if (typeof userId !== 'string' || userId.trim().length === 0) {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return userId.trim();
}

export function createSessionScope(userId = GUEST_USER) {
    const normalized = normalizeUserId(userId, 'Session user id');
    return Object.freeze({
        kind: STORAGE_SCOPE_KIND.SESSION,
        sessionUserId: normalized,
        targetUserId: normalized,
        readOnly: false
    });
}

export function createGlobalScope() {
    return Object.freeze({
        kind: STORAGE_SCOPE_KIND.GLOBAL,
        readOnly: false
    });
}

export function createInspectionScope(sessionScopeOrUserId, targetUserId) {
    const sessionUserId = typeof sessionScopeOrUserId === 'string'
        ? normalizeUserId(sessionScopeOrUserId, 'Session user id')
        : normalizeUserId(sessionScopeOrUserId?.sessionUserId, 'Session user id');
    const target = normalizeUserId(targetUserId, 'Inspection target user id');

    return Object.freeze({
        kind: STORAGE_SCOPE_KIND.INSPECTION,
        sessionUserId,
        targetUserId: target,
        readOnly: true
    });
}

export function isWritableStorageScope(scope) {
    if (scope?.kind === STORAGE_SCOPE_KIND.GLOBAL) return scope.readOnly === false;
    return scope?.kind === STORAGE_SCOPE_KIND.SESSION
        && scope.readOnly === false
        && scope.sessionUserId === scope.targetUserId;
}

export function resolveStorageKey(slot, scope) {
    const definition = USER_KEY_DEFINITIONS[slot];
    if (!definition) throw new TypeError(`Unknown user storage slot: ${String(slot)}`);
    const userId = normalizeUserId(scope?.targetUserId, 'Storage target user id');

    if (definition.suffix === 'emailRequired') {
        if (!userId.includes('@')) {
            throw new Error(`Storage slot ${slot} is in-memory only for user ${userId}`);
        }
        return `${definition.base}_${userId}`;
    }
    if (definition.suffix === 'nonGuest') {
        return userId === GUEST_USER ? definition.base : `${definition.base}_${userId}`;
    }
    // Every remaining definition uses the shared email suffix policy. Keeping
    // the closed mapping above as the source of truth avoids an unreachable
    // permissive fallback for malformed definitions.
    return userId.includes('@') ? `${definition.base}_${userId}` : definition.base;
}
