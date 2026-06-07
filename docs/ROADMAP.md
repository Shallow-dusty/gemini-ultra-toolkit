# Roadmap

Updated: 2026-06-08 (post-v12 planning refresh + Phase 0 audit repair).

This is the maintained roadmap. It replaces the old full feature brainstorming document, which mixed implemented features, speculative ideas, and stale project naming.

## v12.0 (2026-05-21) — released

- **GeminiAdapter abstraction**: `src/adapters/gemini.js` is now the primary DOM-coupling layer. Most Gemini selectors live there; remaining module-level assumptions are explicit adapter-hardening work.
- **Live DOM compatibility**: selectors were updated for the 2026-05-20 Gemini frontend overhaul (new mode-picker structure, `more options for <title>` row buttons, `data-test-id="delete-button"` confirmation flow, `Send message` aria-label).
- **Real-browser smoke test verified** — first release with end-to-end verification on the live Gemini app.
- **8 modules were operational in the 2026-05-21 live smoke**: counter, folders, export, prompt vault, default model, batch delete, quote reply, UI tweaks. This is the last live DOM evidence, not a current-day compatibility guarantee.

## Planning Snapshot

The current market/UI planning source is `docs/research/market-ui-plan-2026-06-07.md`.
Refresh that snapshot before any major release because Gemini's UI and the
extension market both change quickly.

## Current Product Baseline

Implemented modules:

- Counter: daily usage, streaks, quota weighting, model breakdown, heatmap/dashboard.
- Folders: sidebar markers, panel management, search, pinning, drag reorder, batch move, auto-classify rules.
- Export: JSON/CSV/Markdown usage export plus current visible conversation
  transcript export in JSON/Markdown/TXT.
- Prompt Vault: saved prompts, quick insert, import/export, favorites, recent
  ranking, slash shortcuts, template variables, local prompt chains, and
  versioned metadata import/export.
- Message Queue: local prompt queue with start/pause, cancel, reorder, and a
  conservative active-tool-mode pause guard.
- Default Model: preferred model selection on new chats.
- Batch Delete: multi-select deletion workflow.
- Quote Reply: selected-text quote insertion.
- UI Tweaks: title sync, Ctrl+Enter behavior, width controls, Gems hiding.
- Chat Notes: local per-chat notes and pins in the details pane.

## Near-Term Priorities

1. Release hygiene and truthful status
   - ~~Update `brace-expansion` from `5.0.5` to `5.0.6`, then update the smoke
     test that currently pins the old version.~~ Done on 2026-06-08.
   - ~~Refresh `PROJECT_STATUS.md` and `audits/CURRENT_AUDIT_STATUS.md` after
     `npm audit --audit-level=moderate` is green again.~~ Done on 2026-06-08.
   - ~~Fix the Chrome Web Store screenshot filename mismatch, or regenerate
     screenshots that match the listing docs.~~ Done on 2026-06-08.

2. Live Gemini compatibility
   - Repeat the real-browser smoke test before store submission and every major
     release; the last completed live probe is from 2026-05-21.
   - Extend CDP probes to cover model switcher, sidebar row actions, input
     editor/send button, header/export anchor, and visible tool-mode entry
     points such as Canvas/Spark when present.

3. Store-listing readiness
   - Keep `Primer++ for Gemini™` naming consistent.
   - Include the unofficial/community disclaimer.
   - Use local-first/privacy-forward positioning.
   - Prepare screenshots around counter/heatmap, folders, prompt vault, and export.

4. Adapter hardening
   - ~~Move remaining Gemini-dependent CSS selectors and event filters in
     `counter`, `ui-tweaks`, and `quote-reply` into `GeminiAdapter` helpers.~~
     Done after the market/UI planning snapshot.
   - ~~Add static smoke checks so accidental Gemini selectors do not spread back
     into modules.~~ Done after the market/UI planning snapshot.
   - ~~Expose adapter selector health in the debug panel.~~ Done after the
     market/UI planning snapshot.
   - Continue treating module-owned selectors such as `.gc-*` and `.gf-*` as
     local UI selectors, not Gemini DOM coupling.

5. Test broadening
   - Add browser-level smoke automation if Playwright becomes stable for the Gemini DOM.
   - Keep current unit coverage strict for `lib/`.
   - Add static smoke checks only for release-critical metadata and invariants.

6. Accessibility and i18n hardening
   - Continue replacing hardcoded UI text with `NativeUI.t()`.
   - Verify focus order in real browser.
   - Recheck contrast for all themes.

## v12.x / v13 Product Direction

Prioritize local-first workflow parity with direct Gemini competitors:

- ~~Message queue with pause/cancel/reorder.~~ Done after the market/UI planning
  snapshot; live Gemini smoke coverage is still due before release.
- Prompt vault upgrade:
  - ~~slash shortcut insertion~~ done after the market/UI planning snapshot;
  - ~~prompt chains~~ done after the market/UI planning snapshot;
  - ~~variable placeholders~~ done after the market/UI planning snapshot;
  - ~~recents and favorites~~ done after the market/UI planning snapshot;
  - ~~compatible import/export for prompt metadata~~ done after the market/UI
    planning snapshot.
- ~~Per-chat local notes and pins.~~ Done after the market/UI planning snapshot.
- Bulk export for selected chats in JSON/Markdown/TXT first; current visible
  chat transcript export is done, but cross-chat selected export still needs a
  navigation/smoke-tested workflow. PDF/DOCX only after dependency and
  bundle-size review.
- Tool-mode awareness for Canvas, Deep Research, Image, Video, Audio Overview, Spark, or
  equivalent Gemini modes so automations can disable themselves safely.

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
