// --- Theme configurations ---
export const THEMES = {
    auto: {
        name: "\u{1F504} Auto",
        vars: null   // resolved at runtime → glass (dark) / paper (light)
    },
    glass: {
        name: "\u{1F30C} Glass",
        vars: {
            '--primer-bg': 'rgba(32, 33, 36, 0.82)',
            '--primer-blur': '24px',
            '--primer-saturate': '180%',
            '--primer-border': 'rgba(255, 255, 255, 0.12)',
            '--primer-border-highlight': 'inset 1px 1px 1px rgba(255,255,255,0.08)',
            '--primer-text-main': '#a8c7fa',
            '--primer-text-sub': '#9aa0a6',
            '--primer-accent': '#8ab4f8',
            '--primer-btn-bg': 'rgba(255, 255, 255, 0.06)',
            '--primer-row-hover': 'rgba(255, 255, 255, 0.1)',
            '--primer-shadow': '0 4px 12px rgba(0,0,0,0.1), 0 12px 32px rgba(0,0,0,0.25), 0 24px 64px rgba(0,0,0,0.2)',
            '--primer-shadow-hover': '0 8px 24px rgba(0,0,0,0.15), 0 16px 48px rgba(0,0,0,0.3), 0 32px 80px rgba(0,0,0,0.25)',
            '--primer-highlight': 'rgba(255, 255, 255, 0.12)',
            '--primer-header-bg': 'rgba(255, 255, 255, 0.03)',
            '--primer-header-border': 'rgba(255, 255, 255, 0.05)',
            '--primer-detail-bg': 'rgba(0, 0, 0, 0.1)',
            '--primer-overlay-tint': 'rgba(0, 0, 0, 0.6)',
            '--primer-input-bg': 'rgba(255, 255, 255, 0.05)',
            '--primer-divider': 'rgba(255, 255, 255, 0.05)',
            '--primer-badge-bg': 'rgba(255, 255, 255, 0.06)',
            '--primer-scrollbar-thumb': 'rgba(255, 255, 255, 0.15)',
            '--primer-code-bg': 'rgba(0, 0, 0, 0.3)'
        }
    },
    cyber: {
        name: "\u26A1 Cyber",
        vars: {
            '--primer-bg': 'rgba(10, 10, 10, 0.96)',
            '--primer-blur': '4px',
            '--primer-saturate': '120%',
            '--primer-border': '#00ff41',
            '--primer-border-highlight': 'inset 1px 1px 0 rgba(0,255,65,0.15)',
            '--primer-text-main': '#00ff41',
            '--primer-text-sub': '#008F11',
            '--primer-accent': '#00ff41',
            '--primer-btn-bg': '#0d0d0d',
            '--primer-row-hover': '#1a1a1a',
            '--primer-shadow': '0 4px 12px rgba(0,255,65,0.1), 0 12px 32px rgba(0,255,65,0.08)',
            '--primer-shadow-hover': '0 8px 24px rgba(0,255,65,0.15), 0 16px 48px rgba(0,255,65,0.12)',
            '--primer-highlight': 'rgba(0, 255, 65, 0.1)',
            '--primer-header-bg': 'rgba(0, 255, 65, 0.03)',
            '--primer-header-border': 'rgba(0, 255, 65, 0.1)',
            '--primer-detail-bg': 'rgba(0, 0, 0, 0.3)',
            '--primer-overlay-tint': 'rgba(0, 0, 0, 0.7)',
            '--primer-input-bg': '#0d0d0d',
            '--primer-divider': 'rgba(0, 255, 65, 0.08)',
            '--primer-badge-bg': 'rgba(0, 255, 65, 0.08)',
            '--primer-scrollbar-thumb': 'rgba(0, 255, 65, 0.2)',
            '--primer-code-bg': 'rgba(0, 0, 0, 0.5)'
        }
    },
    paper: {
        name: "\u{1F4C4} Paper",
        vars: {
            '--primer-bg': 'rgba(255, 255, 255, 0.88)',
            '--primer-blur': '20px',
            '--primer-saturate': '150%',
            '--primer-border': 'rgba(0, 0, 0, 0.08)',
            '--primer-border-highlight': 'inset 1px 1px 0 rgba(255,255,255,0.8)',
            '--primer-text-main': '#1a1a1a',
            '--primer-text-sub': '#5f6368',
            '--primer-accent': '#1a73e8',
            '--primer-btn-bg': 'rgba(0, 0, 0, 0.04)',
            '--primer-row-hover': 'rgba(0, 0, 0, 0.06)',
            '--primer-shadow': '0 4px 16px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.04)',
            '--primer-shadow-hover': '0 8px 24px rgba(0,0,0,0.08), 0 16px 48px rgba(0,0,0,0.06), 0 32px 80px rgba(0,0,0,0.04)',
            '--primer-highlight': 'rgba(255, 255, 255, 0.9)',
            '--primer-header-bg': 'rgba(0, 0, 0, 0.02)',
            '--primer-header-border': 'rgba(0, 0, 0, 0.06)',
            '--primer-detail-bg': 'rgba(0, 0, 0, 0.03)',
            '--primer-overlay-tint': 'rgba(0, 0, 0, 0.35)',
            '--primer-input-bg': 'rgba(0, 0, 0, 0.04)',
            '--primer-divider': 'rgba(0, 0, 0, 0.06)',
            '--primer-badge-bg': 'rgba(0, 0, 0, 0.05)',
            '--primer-scrollbar-thumb': 'rgba(0, 0, 0, 0.15)',
            '--primer-code-bg': 'rgba(0, 0, 0, 0.04)'
        }
    }
};

// Panel styles still consume the original short variable names. Keep those
// aliases local to each Primer++ surface instead of publishing generic names
// such as --bg or --accent on Gemini's document root.
export const THEME_COMPAT_ALIASES = Object.freeze({
    '--primer-bg': '--bg',
    '--primer-blur': '--blur',
    '--primer-saturate': '--saturate',
    '--primer-border': '--border',
    '--primer-border-highlight': '--border-highlight',
    '--primer-text-main': '--text-main',
    '--primer-text-sub': '--text-sub',
    '--primer-accent': '--accent',
    '--primer-btn-bg': '--btn-bg',
    '--primer-row-hover': '--row-hover',
    '--primer-shadow': '--shadow',
    '--primer-shadow-hover': '--shadow-hover',
    '--primer-highlight': '--highlight',
    '--primer-header-bg': '--header-bg',
    '--primer-header-border': '--header-border',
    '--primer-detail-bg': '--detail-bg',
    '--primer-overlay-tint': '--overlay-tint',
    '--primer-input-bg': '--input-bg',
    '--primer-divider': '--divider',
    '--primer-badge-bg': '--badge-bg',
    '--primer-scrollbar-thumb': '--scrollbar-thumb',
    '--primer-code-bg': '--code-bg'
});

// --- Global storage keys ---
export const GLOBAL_KEYS = {
    POS: 'gemini_panel_pos',
    REGISTRY: 'gemini_user_registry',
    THEME: 'gemini_current_theme',
    RESET_HOUR: 'gemini_reset_hour',
    QUOTA: 'gemini_quota_limit',
    MODULES: 'gemini_enabled_modules',
    MODULES_PENDING: 'gemini_enabled_modules_pending',
    LOCALE: 'gemini_locale',
    DEBUG: 'gemini_debug_enabled',
    LOG_LEVEL: 'gemini_log_level',
    LOGS: 'gemini_logs_store',
    ONBOARDING: 'gemini_onboarding_seen',
    ONBOARDING_LANG: 'gemini_onboarding_lang',
    TOUR_SEEN: 'gemini_tour_seen'
};

// --- Timing constants ---
export const TIMINGS = {
    POLL_INTERVAL: 1500,
    SLOW_POLL: 5000,
    COUNTER_COOLDOWN: 1000,
    OBSERVER_DEBOUNCE: 500,
    NATIVEUI_DEBOUNCE: 1500,
    TITLE_DEBOUNCE: 300,
    FAB_AUTO_DISMISS: 5000,
    MODEL_MENU_TIMEOUT: 2000,
    MODEL_MUTATION_DEBOUNCE: 500,
};

// --- Quota colors ---
export const QUOTA_COLORS = { safe: '#34a853', warn: '#fbbc04', danger: '#ea4335' };

// --- Panel config ---
export const VERSION = '13.0';
export const APP_NAME = 'Primer++ for Gemini\u2122';
export const TRADEMARK_NOTICE = 'Primer++ is an unofficial community extension. Gemini\u2122 is a trademark of Google LLC.';
export const PANEL_ID = 'gemini-monitor-panel-v7';
export const DEFAULT_POS = { top: '20px', left: 'auto', bottom: 'auto', right: '220px' };
export const TEMP_USER = "Guest";
