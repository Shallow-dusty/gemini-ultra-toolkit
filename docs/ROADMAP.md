# Roadmap

Updated: 2026-05-21 (v12.0 release).

This is the maintained roadmap. It replaces the old full feature brainstorming document, which mixed implemented features, speculative ideas, and stale project naming.

## v12.0 (2026-05-21) — released

- **GeminiAdapter abstraction**: all DOM coupling consolidated into `src/adapters/gemini.js`. Future Gemini frontend rewrites should only require updating this single file.
- **Live DOM compatibility**: selectors updated for the 2026-05-20 Gemini frontend overhaul (new mode-picker structure, `more options for <title>` row buttons, `data-test-id="delete-button"` confirmation flow, `Send message` aria-label).
- **Real-browser smoke test verified** — first release with end-to-end verification on the live Gemini app.
- **8 modules still operational** post-migration: counter, folders, export, prompt vault, default model, batch delete, quote reply, UI tweaks.

## Current Product Baseline

Implemented modules:

- Counter: daily usage, streaks, quota weighting, model breakdown, heatmap/dashboard.
- Folders: sidebar markers, panel management, search, pinning, drag reorder, batch move, auto-classify rules.
- Export: JSON, CSV, and Markdown usage export.
- Prompt Vault: saved prompts, quick insert, import/export.
- Default Model: preferred model selection on new chats.
- Batch Delete: multi-select deletion workflow.
- Quote Reply: selected-text quote insertion.
- UI Tweaks: title sync, Ctrl+Enter behavior, width controls, Gems hiding.

## Near-Term Priorities

1. ~~Real-browser release smoke test~~ — done for v12.0 via Playwright MCP. Repeat for every major release; Gemini's frontend changes more often than expected.

2. Store-listing readiness
   - Keep `Primer++ for Gemini™` naming consistent.
   - Include the unofficial/community disclaimer.
   - Use local-first/privacy-forward positioning.
   - Prepare screenshots around counter/heatmap, folders, prompt vault, and export.

3. Test broadening
   - Add browser-level smoke automation if Playwright becomes stable for the Gemini DOM.
   - Keep current unit coverage strict for `lib/`.
   - Add static smoke checks only for release-critical metadata and invariants.

4. Accessibility and i18n hardening
   - Continue replacing hardcoded UI text with `NativeUI.t()`.
   - Verify focus order in real browser.
   - Recheck contrast for all themes.

## Deferred Ideas

These are intentionally not active release scope:

- Full-text conversation search.
- Google Drive or OAuth-backed cloud sync.
- Timeline navigation comparable to Voyager.
- AI Studio support.
- Multi-platform support beyond Gemini.
- Large storage migrations or a generalized storage abstraction.

## Product Positioning

Keep the product focused on Gemini web power users:

- local-first data
- quota/counting visibility
- organization through folders and prompt vault
- dual distribution through userscript and MV3 extension
