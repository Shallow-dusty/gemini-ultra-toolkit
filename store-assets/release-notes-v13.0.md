# Primer++ for Gemini™ v13.0 — Release Candidate Notes

> Repository candidate dated 2026-08-01. This version has not been tagged, published on GitHub, submitted to the Chrome Web Store, or posted to Greasyfork. The latest published release remains v12.0.

v13 reorganizes Primer++ around explicit feature boundaries and the current Gemini frontend. It keeps distinct local workflows, retires overlap with features Gemini now provides natively, and makes failure, backup, and compatibility state visible.

## What changed

### Modular foundation

- A composition root now assembles platform, storage, Gemini adapter, feature, UI, capability-health, and archive policies.
- Lifecycle scopes own timers, listeners, observers, subscriptions, and ordered cleanup.
- A descriptor-driven module host serializes enable/disable transitions, persists the enabled map, and rolls back failed transitions.
- Asynchronous storage ports and clone-safe repositories replace feature-level platform storage calls while preserving legacy migrations and account isolation.
- Gemini selectors and DOM operations live behind capability-oriented adapter ports instead of being scattered across features.

### Reorganized feature set

- **Local Insights**: on-device activity history, model/day breakdowns, trends, streaks, and heatmaps without claiming Gemini server quota.
- **Collections**: nested organization, ordering, colors, pins, batch moves, smart-rule previews, transfer, and undo.
- **Archive & Export**: explicit visible-transcript capture with fidelity preservation and JSON, CSV, Markdown, TXT, HTML, and DOCX output.
- **Portable Backup & Restore**: versioned manifests, validation, preview, de-duplication, selective restore, rollback, and resumable execution across enabled feature contributors.
- **Recipes and Message Queue**: reusable parameterized prompts, prompt chains, import/export, and a locally controlled start/pause/cancel/reorder outbox.
- **Search & Navigator**: local search over deliberately archived/imported records, filters, ranking, chat locators, and anchored quotes.
- **Annotations**: local notes, pins, references, and explicit context transfer.
- **Preferences**: capability-aware preferred model, locale/theme/layout/composer choices, and shortcut conflict handling.
- **Bulk Lifecycle**: confirmed archive/delete operations with progress, pause/cancel boundaries, and snapshots.
- **Capability Health**: actionable `available`, `native-owned`, `unavailable`, `degraded`, `disabled`, and `injection-failed` states.

### Native Gemini ownership

Primer++ no longer attempts to duplicate Gemini's Notebooks, native search, Usage Limits, Gems/Skills, Canvas, Deep Research, or Spark. Capability Health explains when a workflow is native-owned; Primer++ focuses on local organization, portability, and recovery.

### UI and build quality

- Scoped semantic tokens, shared components, locale-aware surfaces, dialog-stack management, keyboard/focus contracts, reduced-motion support, and lifecycle-safe cleanup provide a consistent UI foundation.
- Userscript and MV3 extension builds are minified, validated, size-budgeted, SHA-256 reported, staged, and installed atomically.
- The MV3 manifest includes both service-worker and Firefox script backgrounds, plus a toolbar action for the action-context reset command.
- Version facts are aligned at `13.0` in userscript metadata, runtime constants, extension manifest, and generated userscript. `package.json` intentionally has no version.

## Deterministic verification completed

- Shipped JavaScript under `lib/**/*.js`, `src/**/*.js`, and `scripts/**/*.js`: **100% statements, branches, functions, and lines per file**.
- Totals: **43,288 statements/lines, 3,582 functions, and 17,156 branches**, all 100%.
- Store-tooling Python tests: **24 passed** on Windows and WSL, separate from c8 coverage.
- `npm audit --audit-level=moderate`: **0 vulnerabilities**.
- Userscript: **829,870 B raw**, **242,857 B gzip-9**, SHA-256 `f7ee24f6b3b467f8020ff545cd7948db16d88d4b6d724170b7a4a84800221879`.
- Extension `content.js`: **832,179 B raw**, **243,673 B gzip-9**, SHA-256 `574de285c347b5c20a012547c9acf773056159046ac672704d4eb81a404296cd`.
- Both primary artifacts are below the **835,000 B raw / 245,000 B gzip-9** per-target budgets.
- Bounded userscript runs exercised each major feature surface, paced exactly-once queue sends, fixed live Gemini integration/focus/responsive defects, validated wrong/cancel/correct destructive confirmation, archive-first deleted exactly two owned chats, preserved unrelated chats, and completed a clean teardown.
- A follow-up userscript run found and fixed a dialog-portal teardown leak, then passed duplicate start, zero-residue stop/restart, all 10 feature switches, and module/theme persistence across reload.

## Release handoff

- The strict current-account score is **38.5/40 task-equivalents (96.25%)**;
  all critical rows pass. Personal-free and Workspace scores remain unclaimed.
- Non-critical partial evidence is limited to message-target focus observation,
  live injected-failure rendering, and a separately installed extension profile.
- Capture final store screenshots and refresh the dependency audit when the npm
  advisory endpoint is reachable.
- Create tags, commits, release assets, and store submissions only after explicit authorization.

Primer++ for Gemini™ is an unofficial community project and is not affiliated with, endorsed by, or sponsored by Google.
