/**
 * Centralized CSS classes for native UI injections.
 *
 * IMPORTANT: These elements are injected INTO Gemini's native UI (sidebar,
 * input area, chat header) — they must match Gemini's own colors, NOT the
 * floating panel's theme. All colors are hardcoded to Gemini's native palette.
 *
 * Gemini native palette (dark mode):
 *   text-main: #e8eaed   text-sub: #9aa0a6   accent: #8ab4f8
 *   hover-bg: rgba(255,255,255,0.06)   badge-bg: rgba(255,255,255,0.06)
 */

export function injectNativeUIStyles() {
    GM_addStyle(`
        /* ============================================ */
        /* Sidebar injections (Gemini-native colors)    */
        /* ============================================ */

        .gc-filter-bar {
            display: flex;
            gap: 4px;
            padding: 6px 12px;
            overflow-x: auto;
            align-items: center;
            flex-shrink: 0;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            max-height: 36px;
            align-self: start;
            animation: gcFadeIn 0.2s ease-out;
        }
        .gc-filter-bar::-webkit-scrollbar { display: none; }

        .gc-filter-tab {
            padding: 4px 12px;
            border-radius: 14px;
            font-size: 12px;
            font-family: 'Google Sans', Roboto, sans-serif;
            white-space: nowrap;
            cursor: pointer;
            border: none;
            background: transparent;
            color: #9aa0a6;
            font-weight: 400;
            transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            line-height: 1.4;
            user-select: none;
            opacity: 0.7;
        }
        .gc-filter-tab:hover {
            background: rgba(255,255,255,0.06);
            color: #e8eaed;
            opacity: 1;
        }
        .gc-filter-tab:focus-visible,
        .gc-sidebar-btn:focus-visible,
        .gc-input-btn:focus-visible,
        .gc-header-btn:focus-visible,
        .gc-quote-fab:focus-visible {
            outline: 2px solid #8ab4f8;
            outline-offset: 2px;
        }
        .gc-filter-tab.active {
            font-weight: 500;
            opacity: 1;
        }

        .gc-sidebar-toolbar {
            padding: 4px 12px;
            max-height: 40px;
            align-self: start;
            animation: gcFadeIn 0.2s ease-out;
        }

        .gc-sidebar-btn {
            background: transparent;
            border: none;
            color: #9aa0a6;
            border-radius: 14px;
            padding: 5px 14px;
            font-size: 12px;
            font-family: 'Google Sans', Roboto, sans-serif;
            cursor: pointer;
            transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            opacity: 0.6;
        }
        .gc-sidebar-btn:hover {
            color: #e8eaed;
            background: rgba(255,255,255,0.06);
            opacity: 1;
        }
        .gc-sidebar-btn.full-width {
            width: 100%;
        }
        .gc-sidebar-btn.danger {
            background: rgba(234,67,53,0.15);
            color: #f28b82;
            border: none;
        }
        .gc-sidebar-btn.danger:hover {
            background: rgba(234,67,53,0.25);
        }

        .gc-sidebar-toolbar-active {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .gc-count-label {
            font-size: 11px;
            color: #8ab4f8;
            flex: 1;
            text-align: center;
            font-weight: 500;
        }

        .gc-batch-check {
            width: 16px;
            height: 16px;
            border-radius: 4px;
            border: 2px solid #5f6368;
            background: transparent;
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #fff;
            cursor: pointer;
            margin-right: 6px;
            vertical-align: middle;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .gc-batch-check[data-checked="true"] {
            border-color: #8ab4f8;
            background: #8ab4f8;
        }

        /* ============================================ */
        /* Input area injections (Gemini-native colors) */
        /* ============================================ */

        .gc-input-btn {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: transparent;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            color: #9aa0a6;
        }
        .gc-input-btn:hover {
            background: rgba(128,128,128,0.15);
            color: #e8eaed;
        }
        .gc-input-btn:active {
            transform: scale(0.92);
        }

        .gc-tweaks-dots {
            display: flex;
            gap: 4px;
            position: absolute;
            bottom: 8px;
            right: 8px;
            pointer-events: none;
            z-index: 1;
        }

        .gc-tweaks-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #555;
            transition: background 0.3s;
        }
        .gc-tweaks-dot.on {
            background: #8ab4f8;
            animation: gcDotPulse 2.5s infinite;
        }
        @keyframes gcDotPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .gc-send-hint {
            position: absolute;
            bottom: 8px;
            right: 36px;
            font-size: 11px;
            color: #9aa0a6;
            opacity: 0.6;
            pointer-events: none;
            z-index: 1;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: rgba(255,255,255,0.06);
            padding: 2px 6px;
            border-radius: 4px;
        }

        /* ============================================ */
        /* Chat header injections (Gemini-native)       */
        /* ============================================ */

        .gc-header-btn {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: transparent;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            color: #9aa0a6;
        }
        .gc-header-btn:hover {
            opacity: 1;
            background: rgba(128, 128, 128, 0.15);
        }
        .gc-header-btn:active {
            transform: scale(0.92);
        }

        /* ============================================ */
        /* Model lock indicator (Gemini-native)         */
        /* ============================================ */

        .gc-model-lock {
            font-size: 9px;
            color: #9aa0a6;
            margin-left: 2px;
            cursor: default;
            user-select: none;
            display: inline-flex;
            align-items: center;
            opacity: 0.5;
        }

        /* ============================================ */
        /* Quote reply FAB (Gemini-native accent)       */
        /* ============================================ */

        .gc-quote-fab {
            position: fixed;
            z-index: 2147483646;
            background: #8ab4f8;
            color: #fff;
            padding: 5px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 600;
            font-family: 'Google Sans', Roboto, sans-serif;
            cursor: pointer;
            box-shadow: 0 2px 12px rgba(0,0,0,0.3);
            user-select: none;
            transition: opacity 0.15s, transform 0.15s;
            opacity: 0;
            transform: scale(0.9);
        }
        .gc-quote-fab.visible {
            opacity: 1;
            transform: scale(1);
        }

        /* ============================================ */
        /* Toast notification (theme vars OK — floats)  */
        /* ============================================ */

        .gc-toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(10px);
            background: var(--bg, #303134);
            color: var(--text-main, #e8eaed);
            border: 1px solid var(--border, rgba(255,255,255,0.12));
            padding: 10px 24px;
            border-radius: 14px;
            font-size: 13px;
            font-family: 'Google Sans', Roboto, sans-serif;
            z-index: 2147483647;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            opacity: 0;
            transition: opacity 0.2s, transform 0.2s;
        }
        .gc-toast.visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        /* Shared entrance animation for native UI injections */
        @keyframes gcFadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
            .gc-filter-bar,
            .gc-filter-tab,
            .gc-sidebar-toolbar,
            .gc-sidebar-btn,
            .gc-batch-check,
            .gc-input-btn,
            .gc-tweaks-dot,
            .gc-header-btn,
            .gc-quote-fab,
            .gc-toast {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
                scroll-behavior: auto !important;
            }
        }
    `);
}
