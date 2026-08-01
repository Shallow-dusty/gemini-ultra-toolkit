# Current Audit Status

Updated: 2026-08-01 — v13.0 repository release candidate. The latest published release remains v12.0.

Deterministic source, architecture, coverage, Python-tooling, and dual-build gates are green. Bounded logged-in and local-harness matrices exercised every major feature surface, responsive/dialog behavior, failure recovery, privacy/network boundaries, and exact owned-chat cleanup. The strict current-account result is 38.5/40 (96.25%); every critical row passes.

## Security and privacy boundary

Current status: deterministic protections are implemented and tested; live distribution review remains required.

- Product data is local to the userscript or extension storage port. There is no product backend, analytics SDK, telemetry, remote code loading, or cloud-sync path.
- Raw `GM_*` and `chrome.storage` behavior is confined to platform/storage adapters. Feature repositories are asynchronous, clone-safe, account-scoped, migration-aware, and flush pending writes during page shutdown.
- Mutable Gemini selectors and DOM operations are confined to `src/adapters/gemini/`. Diagnostic exports contain structural capability states and counts, not transcript bodies, sidebar titles, URLs, local storage, or credentials.
- Visible transcript text is captured only after an explicit archive/export or context-packet action. Local Search & Navigator operates on deliberately archived/imported records rather than silently reading hidden conversations.
- Portable Archive validates versioned manifests, normalizes and de-duplicates entries, previews selected writes, rejects malformed or sensitive archive material, and keeps rollback/resume state for explicit restores.
- Message Queue and Bulk Lifecycle require explicit user initiation, provide pause/cancel/confirmation boundaries, and do not add hidden retries around Gemini mutations.
- CSV export quotes cells and guards formula prefixes. HTML escapes content into static documents. DOCX emits escaped, no-macro OpenXML without remote resources.
- Folder regexes are length-capped and safety-screened; stored colors and chat routes are validated before use.
- No application-source use of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function` is permitted by the current guard tests.
- `npm audit --audit-level=moderate` reports 0 vulnerabilities for the candidate dependency tree.

## Resilience and lifecycle

Current status: deterministic failure and cleanup contracts are implemented and tested.

- The composition root is the single place that binds platform, storage, Gemini adapter, features, UI shell, capability health, and Portable Archive policies.
- `LifecycleScope` owns timers, listeners, observers, subscriptions, and disposers. `PrimerApplication` orders page activation and teardown without leaking feature policy into the lifecycle controller.
- `ModuleHost` serializes enable/disable transitions, persists the descriptor-driven enabled map, and rolls back failed start or stop operations.
- GM and Chrome storage adapters share clone/change/failure semantics and track pending writes; account changes do not reuse another account's repository scope.
- Portable restore supports validation, selective planning, de-duplication, rollback, and resumable execution, including production composition wiring.
- Capability Health reports `available`, `native-owned`, `unavailable`, `degraded`, `disabled`, and `injection-failed` states so DOM drift fails visibly instead of silently promising compatibility.
- Dual-target production builds are minified, staged, validated, size-budgeted, and installed atomically; a failed combined build restores previous artifacts.

## UI, accessibility, and native ownership

Current status: component/lifecycle contracts and the complete visual, keyboard, compact-layout, high-contrast, queue, bulk-lifecycle, and automated accessibility matrices pass for the userscript surface.

- Scoped semantic tokens isolate Primer++ styling from Gemini and support the candidate theme/locale state.
- Shared components and the dialog manager provide deterministic dialog stacking, focus restoration, Escape handling, and cleanup.
- Interactive controls use semantic elements, visible focus states, reduced-motion guards, and a 44 px target contract where the shared component is responsible for sizing.
- Optional features are independently switchable through the descriptor-driven settings surface; failed transitions remain actionable.
- Native Gemini Notebooks, search, Usage Limits, Gems/Skills, Canvas, Deep Research, and Spark are not duplicated. Primer++ keeps only distinct local workflows and reports native ownership through capability health.
- Targeted axe and dialog-focus probes found no Primer-owned violation in the exercised surface. The complete live matrix must still cover keyboard loops, screen-reader names, theme contrast, responsive layout, loading/empty/error states, notifications, and enable/disable cleanup on the current Gemini frontend.
- Dedicated-account runs exercised paced exactly-once queue sends, found and fixed Gemini-link bubbling in the sidebar choice control, rejected wrong destructive confirmation, passed Escape/final-cancel paths, validated an archive-first checkpoint, deleted exactly two owned conversations, preserved unrelated conversations, and completed a zero-owned-node teardown.
- A follow-up core run found and fixed the shared dialog portal surviving application stop. The repaired build passed duplicate start, zero-residue stop/restart, all 10 feature switches with their original map restored, and module/theme persistence across a controlled reload.
- The closeout matrix additionally fixed compact annotation actions, 44 px legacy controls, fieldset reflow, native delete verification, and stop-on-failure bulk semantics. Two-chat/rich export, Recipes, restore resume, privacy/network, high contrast, shortcuts, and all eight feature panels passed.

## Verified deterministic gates

- Shipped JavaScript coverage (`lib/**/*.js`, `src/**/*.js`, `scripts/**/*.js`): **100% statements, branches, functions, and lines per file**.
- Coverage totals: **43,288 statements/lines, 3,582 functions, 17,156 branches**, all 100%.
- Store-tooling Python suite: **24 tests** on Windows and WSL. This suite is separate from c8 coverage.
- Production userscript: **829,870 B raw**, **242,857 B gzip-9**, SHA-256 `f7ee24f6b3b467f8020ff545cd7948db16d88d4b6d724170b7a4a84800221879`.
- Production extension `content.js`: **832,179 B raw**, **243,673 B gzip-9**, SHA-256 `574de285c347b5c20a012547c9acf773056159046ac672704d4eb81a404296cd`.
- Both artifacts are under the **835,000 B raw / 245,000 B gzip-9** per-target budgets.
- Application, architecture, source guard, storage parity, archive/restore, and build-pipeline tests pass in the deterministic suite.

## Remaining release handoff

- The strict worksheet is **38.5/40 task-equivalents (96.25%)**: 37 full,
  3 partial, 0 unverified, and every critical row passes.
- Retained non-critical partials are message-target focus observation on one
  harness route, live injected-failure rendering, and a separately installed
  extension-profile parity run.
- Capture final store screenshots and refresh the registry-backed dependency
  audit when npm connectivity returns. Commit/tag/push/store submission still
  require explicit authorization.

## Verification commands

```bash
npm test
python -m unittest discover -s tests/python -p "test_*.py"
npm run build
npm audit --audit-level=moderate
```
