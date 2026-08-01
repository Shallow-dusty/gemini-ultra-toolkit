/**
 * Centralized CSS classes for native UI injections.
 *
 * IMPORTANT: These elements are injected INTO Gemini's native UI (sidebar,
 * input area, chat header) — they must match Gemini's own colors, NOT the
 * floating panel's theme. Prefer Gemini/Material design tokens and inherit
 * from the surrounding native surface when a host token is unavailable.
 */

export function injectNativeUIStyles(addStyle) {
    if (typeof addStyle !== 'function') throw new TypeError('Native UI styles require an addStyle port');
    const css = `
        :where(
            .gc-filter-bar, .gc-filter-tab, .gc-sidebar-toolbar, .gc-sidebar-btn,
            .gc-count-label, .gc-batch-check, .gc-input-btn, .gc-tweaks-dots,
            .gc-tweaks-status, .gc-send-hint, .gc-input-counter, .gc-header-btn,
            .gc-model-lock, .gc-quote-fab, .gc-toast
        ) {
            color-scheme: inherit;
            --primer-native-text: var(--gem-sys-color--on-surface,
                var(--mat-sys-on-surface, currentColor));
            --primer-native-muted: var(--gem-sys-color--on-surface-variant,
                var(--mat-sys-on-surface-variant,
                    color-mix(in srgb, currentColor 68%, transparent)));
            --primer-native-accent: var(--gem-sys-color--primary,
                var(--mat-sys-primary, Highlight));
            --primer-native-on-accent: var(--gem-sys-color--on-primary,
                var(--mat-sys-on-primary, HighlightText));
            --primer-native-hover: var(--gem-sys-color--surface-container-high,
                var(--mat-sys-surface-container-high,
                    color-mix(in srgb, currentColor 9%, transparent)));
            --primer-native-surface: var(--gem-sys-color--surface-container,
                var(--mat-sys-surface-container,
                    color-mix(in srgb, Canvas 94%, currentColor)));
            --primer-native-outline: var(--gem-sys-color--outline-variant,
                var(--mat-sys-outline-variant,
                    color-mix(in srgb, currentColor 22%, transparent)));
            --primer-native-error: var(--gem-sys-color--error,
                var(--mat-sys-error, currentColor));
            --primer-native-error-container: var(--gem-sys-color--error-container,
                var(--mat-sys-error-container,
                    color-mix(in srgb, currentColor 14%, transparent)));
            --primer-native-on-error-container: var(--gem-sys-color--on-error-container,
                var(--mat-sys-on-error-container, currentColor));
        }

        /* ============================================ */
        /* Sidebar injections (host-adaptive colors)    */
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
            font-family: inherit;
            white-space: nowrap;
            cursor: pointer;
            border: none;
            background: transparent;
            color: var(--primer-native-muted);
            font-weight: 400;
            transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            line-height: 1.4;
            user-select: none;
            opacity: 0.7;
        }
        .gc-filter-tab:hover {
            background: var(--primer-native-hover);
            color: var(--primer-native-text);
            opacity: 1;
        }
        .gc-filter-tab:focus-visible,
        .gc-sidebar-btn:focus-visible,
        .gc-input-btn:focus-visible,
        .gc-header-btn:focus-visible,
        .gc-quote-fab:focus-visible {
            outline: 2px solid var(--primer-native-accent);
            outline-offset: 2px;
        }
        .gc-filter-tab.active {
            font-weight: 500;
            opacity: 1;
            color: var(--primer-native-accent);
            background: color-mix(in srgb, var(--primer-native-accent) 12%, transparent);
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
            color: var(--primer-native-muted);
            border-radius: 14px;
            padding: 5px 14px;
            font-size: 12px;
            font-family: inherit;
            cursor: pointer;
            transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            opacity: 0.6;
        }
        .gc-sidebar-btn:hover {
            color: var(--primer-native-text);
            background: var(--primer-native-hover);
            opacity: 1;
        }
        .gc-sidebar-btn.full-width {
            width: 100%;
        }
        .gc-sidebar-btn.danger {
            background: var(--primer-native-error-container);
            color: var(--primer-native-on-error-container);
            border: none;
        }
        .gc-sidebar-btn.danger:hover {
            background: color-mix(in srgb, var(--primer-native-error) 22%, transparent);
        }

        .gc-sidebar-toolbar-active {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .gc-count-label {
            font-size: 11px;
            color: var(--primer-native-accent);
            flex: 1;
            text-align: center;
            font-weight: 500;
        }

        .gc-batch-check {
            width: 16px;
            height: 16px;
            border-radius: 4px;
            border: 2px solid var(--primer-native-outline);
            background: transparent;
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: var(--primer-native-on-accent);
            cursor: pointer;
            margin-right: 6px;
            vertical-align: middle;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .gc-batch-check[data-checked="true"] {
            border-color: var(--primer-native-accent);
            background: var(--primer-native-accent);
        }

        /* ============================================ */
        /* Input area injections (host-adaptive colors) */
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
            color: var(--primer-native-muted);
        }
        .gc-input-btn:hover {
            background: var(--primer-native-hover);
            color: var(--primer-native-text);
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
            background: currentColor;
            opacity: 0.42;
            transition: background 0.3s;
        }
        .gc-tweaks-dot.on {
            background: var(--primer-native-accent);
            opacity: 1;
            animation: gcDotPulse 2.5s infinite;
        }
        @keyframes gcDotPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .gc-tweaks-status {
            position: absolute;
            bottom: 8px;
            right: 36px;
            display: flex;
            align-items: center;
            gap: 6px;
            pointer-events: none;
            z-index: 1;
        }

        .gc-send-hint,
        .gc-input-counter {
            font-size: 11px;
            color: var(--primer-native-muted);
            opacity: 0.6;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: var(--primer-native-hover);
            padding: 2px 6px;
            border-radius: 4px;
            line-height: 1.4;
            white-space: nowrap;
        }

        /* ============================================ */
        /* Chat header injections (host-adaptive)       */
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
            color: var(--primer-native-muted);
        }
        .gc-header-btn:hover {
            opacity: 1;
            color: var(--primer-native-text);
            background: var(--primer-native-hover);
        }
        .gc-header-btn:active {
            transform: scale(0.92);
        }

        /* ============================================ */
        /* Model lock indicator (host-adaptive)         */
        /* ============================================ */

        .gc-model-lock {
            font-size: 9px;
            color: var(--primer-native-muted);
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
            background: var(--primer-native-accent);
            color: var(--primer-native-on-accent);
            padding: 4px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 600;
            font-family: inherit;
            box-shadow: 0 2px 12px color-mix(in srgb, CanvasText 28%, transparent);
            user-select: none;
            transition: opacity 0.15s, transform 0.15s;
            opacity: 0;
            transform: scale(0.9);
            display: inline-flex;
            gap: 2px;
        }
        .gc-quote-fab.visible {
            opacity: 1;
            transform: scale(1);
        }
        .gc-quote-fab-btn {
            border: 0;
            border-radius: 12px;
            background: transparent;
            color: inherit;
            padding: 3px 8px;
            font: inherit;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .gc-quote-fab-btn:hover,
        .gc-quote-fab-btn:focus-visible {
            background: color-mix(in srgb, currentColor 18%, transparent);
            outline: none;
        }

        /* ============================================ */
        /* Toast notification (native host surface)     */
        /* ============================================ */

        .gc-toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(10px);
            background: var(--primer-native-surface);
            color: var(--primer-native-text);
            border: 1px solid var(--primer-native-outline);
            padding: 10px 24px;
            border-radius: 14px;
            font-size: 13px;
            font-family: inherit;
            z-index: 2147483647;
            box-shadow: 0 4px 20px color-mix(in srgb, CanvasText 25%, transparent);
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
            .gc-input-counter,
            .gc-header-btn,
            .gc-quote-fab,
            .gc-toast,
            .gc-tour-overlay,
            .gc-tour-tooltip {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
                scroll-behavior: auto !important;
            }
        }
    `;
    addStyle(css);
    return css;
}
