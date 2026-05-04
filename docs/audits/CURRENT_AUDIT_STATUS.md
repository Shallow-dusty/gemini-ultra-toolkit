# Current Audit Status

Updated: 2026-05-05

This is the maintained audit summary for v11.0. It replaces the old v10.11 raw audit reports, whose detailed findings were useful historically but had become misleading after fixes landed.

## Security

Current status: acceptable for local release testing.

Implemented protections:

- No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function` use in application source.
- Folder auto-classify regexes are length-capped and screened with `isSafeRegex()`.
- Regex edit flow validates patterns before storing them as regex rules.
- Chat href fallback navigation uses `isValidChatHref()`.
- Folder color values are validated before use in `cssText`.
- GM_* reads and writes are wrapped defensively in source paths that can run in Tampermonkey or the extension polyfill.
- `npm audit --audit-level=moderate` reports 0 vulnerabilities after the `brace-expansion` update.

Residual checks:

- Run a real-browser smoke test before release.
- Keep avoiding remote secrets; this is a front-end-only project and provider/API keys do not belong in the repo.

## Resilience

Current status: main crash-class findings from the old audit are fixed.

Implemented protections:

- `GM_getValue` calls in counter/default-model/prompt-vault paths have try/catch fallbacks.
- Sidebar and dialog lookups in batch/folder flows guard null returns.
- Guest-session merge paths validate numeric/object inputs.
- JSON cloning in user detection merge is guarded.

Residual risk:

- Very large local datasets can still degrade UI responsiveness. Treat virtualization or pagination as a future optimization.

## UI, Accessibility, and i18n

Current status: core modal and panel paths are improved, but real-browser verification is still required.

Implemented protections:

- Settings, Analytics, Debug, Calibration, onboarding, and confirmation modals support `Esc` close.
- Modal focus trap helper exists in `NativeUI.trapFocus()`.
- Close controls are keyboard-operable.
- `:focus-visible` styles exist for panel, modal, and native-injected controls.
- `prefers-reduced-motion: reduce` guards exist for panel and native injected styles.
- Main panel, settings, dashboard, debug, and calibration user-facing text now uses `NativeUI.t()` for key paths.

Residual checks:

- Verify `Tab` and `Shift+Tab` loops in a real browser.
- Continue converting lower-priority module settings labels to `NativeUI.t()`.
- Recheck theme contrast manually.

## Verification Commands

```bash
npm test
npm run build
npm audit --audit-level=moderate
```
