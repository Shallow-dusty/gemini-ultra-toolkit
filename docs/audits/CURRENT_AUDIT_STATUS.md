# Current Audit Status

Updated: 2026-06-08 — covers v12.0 plus post-release dependency-audit repair, local folder undo, local data portability, local context references, pinned context packets, prompt context packets, selected text packets, transcript snippet packets, HTML transcript export, adapter probe export, and i18n hardening.

This is the maintained audit summary for v12.0. v12 inherits all v11 protections and adds a `src/adapters/gemini.js` abstraction layer for DOM coupling (see ROADMAP.md). Reviewed across 5 self-audit passes plus 3 independent agent reviews (architecture / generic code / userscript-specific). No `critical` findings; all `important` items addressed before release. v11.0 baseline below remains the audit reference for shared logic.

## Security

Current status: acceptable for local release testing.

Implemented protections:

- No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function` use in application source.
- Folder auto-classify regexes are length-capped and screened with `isSafeRegex()`.
- Regex edit flow validates patterns before storing them as regex rules.
- Chat href fallback navigation uses `isValidChatHref()`.
- Gemini sidebar chat scanning now rejects known non-conversation `/app/*`
  routes such as `/app/download` before folder/export/batch workflows see them.
- Folder color values are validated before use in `cssText`.
- Transcript export reads visible conversation text only after an explicit
  user export action; selected-chat export records failed/empty captures rather
  than treating sidebar titles as conversation content.
- HTML transcript downloads escape transcript text and metadata into standalone
  static documents; they do not add scripts or change the explicit-export
  capture boundary.
- Adapter probe exports are limited to selector/model/sidebar/input/header
  health counts, booleans, and canonical tool-mode labels. They do not dump
  local storage, sidebar titles, or transcript bodies.
- Prompt Vault local deletes keep a one-step undo record in memory so accidental
  local prompt removal can be restored before the next delete/session reset.
- Local folder moves, batch moves, unassignments, and folder deletes keep a
  one-step undo record in memory; restore is conflict-safe and does not promise
  recovery for Gemini server-side chat deletes.
- Folder and Chat Notes imports normalize versioned JSON locally, reject empty
  or malformed payloads in the UI, and do not read hidden Gemini conversation
  text.
- Chat Notes context-reference insertion is explicit and local: it formats
  saved titles, links, chat IDs, local notes, and visible pinned-note packets
  into the composer without reading hidden transcript content.
- Prompt Vault context-packet insertion is explicit and local: it formats
  selected saved prompts and locally rendered template variables into the
  composer without reading hidden transcript content or auto-sending.
- Quote Reply snippet-packet insertion is explicit and local: it formats the
  current visible text selection plus current title/link metadata into the
  composer without storing snippets, reading hidden transcript content, or
  auto-sending.
- Export transcript-packet insertion is explicit and bounded: it formats the
  current visible transcript or explicitly selected chat transcripts into the
  composer without storing transcript snippets or auto-sending.
- GM_* reads and writes are wrapped defensively in source paths that can run in Tampermonkey or the extension polyfill.
- 2026-06-08: `npm audit --audit-level=moderate` reports 0 vulnerabilities
  after updating `brace-expansion` from `5.0.5` to `5.0.6`.

Residual checks:

- ~~Run a real-browser smoke test before release.~~ — done for v12.0 (`docs/research/v12-dom-probe-2026-05-21-revised.md`). Repeat for every Google Gemini frontend shift.
- Keep avoiding remote secrets; this is a front-end-only project and provider/API keys do not belong in the repo.
- Keep `npm audit --audit-level=moderate` in the release gate.

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
- Main panel, settings, dashboard, debug, calibration, and post-v12 workflow
  labels in Export, Chat Notes, Message Queue, Prompt Vault, Folders, Batch
  Delete, Quote Reply, and UI Tweaks now use `NativeUI.t()` for key paths.

Residual checks:

- Verify `Tab` and `Shift+Tab` loops in a real browser.
- Continue converting any remaining lower-priority module settings labels to
  `NativeUI.t()`.
- Recheck theme contrast manually.

## Verification Commands

```bash
npm test
npm run build
npm audit --audit-level=moderate
```
