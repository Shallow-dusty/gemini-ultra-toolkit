// --- Theme configurations ---
export const THEMES = {
    auto: {
        name: "\u{1F504} Auto",
        vars: null   // resolved at runtime → glass (dark) / paper (light)
    },
    glass: {
        name: "\u{1F30C} Glass",
        vars: {
            '--bg': 'rgba(32, 33, 36, 0.82)',
            '--blur': '24px',
            '--saturate': '180%',
            '--border': 'rgba(255, 255, 255, 0.12)',
            '--border-highlight': 'inset 1px 1px 1px rgba(255,255,255,0.08)',
            '--text-main': '#a8c7fa',
            '--text-sub': '#9aa0a6',
            '--accent': '#8ab4f8',
            '--btn-bg': 'rgba(255, 255, 255, 0.06)',
            '--row-hover': 'rgba(255, 255, 255, 0.1)',
            '--shadow': '0 4px 12px rgba(0,0,0,0.1), 0 12px 32px rgba(0,0,0,0.25), 0 24px 64px rgba(0,0,0,0.2)',
            '--shadow-hover': '0 8px 24px rgba(0,0,0,0.15), 0 16px 48px rgba(0,0,0,0.3), 0 32px 80px rgba(0,0,0,0.25)',
            '--highlight': 'rgba(255, 255, 255, 0.12)',
            '--header-bg': 'rgba(255, 255, 255, 0.03)',
            '--header-border': 'rgba(255, 255, 255, 0.05)',
            '--detail-bg': 'rgba(0, 0, 0, 0.1)',
            '--overlay-tint': 'rgba(0, 0, 0, 0.6)',
            '--input-bg': 'rgba(255, 255, 255, 0.05)',
            '--divider': 'rgba(255, 255, 255, 0.05)',
            '--badge-bg': 'rgba(255, 255, 255, 0.06)',
            '--scrollbar-thumb': 'rgba(255, 255, 255, 0.15)',
            '--code-bg': 'rgba(0, 0, 0, 0.3)'
        }
    },
    cyber: {
        name: "\u26A1 Cyber",
        vars: {
            '--bg': 'rgba(10, 10, 10, 0.96)',
            '--blur': '4px',
            '--saturate': '120%',
            '--border': '#00ff41',
            '--border-highlight': 'inset 1px 1px 0 rgba(0,255,65,0.15)',
            '--text-main': '#00ff41',
            '--text-sub': '#008F11',
            '--accent': '#00ff41',
            '--btn-bg': '#0d0d0d',
            '--row-hover': '#1a1a1a',
            '--shadow': '0 4px 12px rgba(0,255,65,0.1), 0 12px 32px rgba(0,255,65,0.08)',
            '--shadow-hover': '0 8px 24px rgba(0,255,65,0.15), 0 16px 48px rgba(0,255,65,0.12)',
            '--highlight': 'rgba(0, 255, 65, 0.1)',
            '--header-bg': 'rgba(0, 255, 65, 0.03)',
            '--header-border': 'rgba(0, 255, 65, 0.1)',
            '--detail-bg': 'rgba(0, 0, 0, 0.3)',
            '--overlay-tint': 'rgba(0, 0, 0, 0.7)',
            '--input-bg': '#0d0d0d',
            '--divider': 'rgba(0, 255, 65, 0.08)',
            '--badge-bg': 'rgba(0, 255, 65, 0.08)',
            '--scrollbar-thumb': 'rgba(0, 255, 65, 0.2)',
            '--code-bg': 'rgba(0, 0, 0, 0.5)'
        }
    },
    paper: {
        name: "\u{1F4C4} Paper",
        vars: {
            '--bg': 'rgba(255, 255, 255, 0.88)',
            '--blur': '20px',
            '--saturate': '150%',
            '--border': 'rgba(0, 0, 0, 0.08)',
            '--border-highlight': 'inset 1px 1px 0 rgba(255,255,255,0.8)',
            '--text-main': '#1a1a1a',
            '--text-sub': '#5f6368',
            '--accent': '#1a73e8',
            '--btn-bg': 'rgba(0, 0, 0, 0.04)',
            '--row-hover': 'rgba(0, 0, 0, 0.06)',
            '--shadow': '0 4px 16px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.04)',
            '--shadow-hover': '0 8px 24px rgba(0,0,0,0.08), 0 16px 48px rgba(0,0,0,0.06), 0 32px 80px rgba(0,0,0,0.04)',
            '--highlight': 'rgba(255, 255, 255, 0.9)',
            '--header-bg': 'rgba(0, 0, 0, 0.02)',
            '--header-border': 'rgba(0, 0, 0, 0.06)',
            '--detail-bg': 'rgba(0, 0, 0, 0.03)',
            '--overlay-tint': 'rgba(0, 0, 0, 0.35)',
            '--input-bg': 'rgba(0, 0, 0, 0.04)',
            '--divider': 'rgba(0, 0, 0, 0.06)',
            '--badge-bg': 'rgba(0, 0, 0, 0.05)',
            '--scrollbar-thumb': 'rgba(0, 0, 0, 0.15)',
            '--code-bg': 'rgba(0, 0, 0, 0.04)'
        }
    }
};

// --- Global storage keys ---
export const GLOBAL_KEYS = {
    POS: 'gemini_panel_pos',
    REGISTRY: 'gemini_user_registry',
    THEME: 'gemini_current_theme',
    RESET_HOUR: 'gemini_reset_hour',
    QUOTA: 'gemini_quota_limit',
    MODULES: 'gemini_enabled_modules',
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
export const VERSION = '12.0';
export const APP_NAME = 'Primer++ for Gemini\u2122';
export const TRADEMARK_NOTICE = 'Primer++ is an unofficial community extension. Gemini\u2122 is a trademark of Google LLC.';
export const PANEL_ID = 'gemini-monitor-panel-v7';
export const DEFAULT_POS = { top: '20px', left: 'auto', bottom: 'auto', right: '220px' };
export const TEMP_USER = "Guest";
