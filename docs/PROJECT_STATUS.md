# Project Status

Updated: 2026-08-01. The local working tree is a **v13.0 release
candidate**. It is not tagged, committed, pushed, or published; the latest
published GitHub release remains v12.0. Deterministic code, coverage, Python
tooling, and dual-build gates are green. Controlled userscript runs completed
the feature, failure, privacy, visual, accessibility, and exact owned-chat
cleanup matrices. The strict current-account worksheet is 38.5/40 (96.25%):
37 full, 3 partial, no unverified rows, and every critical row passes.

## Summary

`Primer++ for Gemini™` is a local-first Gemini workflow control layer with two
outputs:

- Tampermonkey/Violentmonkey userscript: `primer-pp.user.js`
- Browser extension: `dist/extension/` generated from `src/platforms/extension/`
- Shared modular application: `src/`
- Deterministic domain utilities: `lib/`
- Atomic build tooling: `scripts/`
- Node and Python tests: `tests/`

v13 separates platform, storage, runtime, Gemini DOM, feature, and UI concerns.
Raw Gemini selectors live behind `src/adapters/gemini/`; raw userscript/MV3
storage details live behind platform and storage ports; `LifecycleScope` and
`ModuleHost` own deterministic start/stop and rollback. Stable v12 module IDs
remain as compatibility facades over Local Insights, Collections, Archive,
Recipes, Queue, Bulk Lifecycle, Search & Navigator, Preferences, and
Annotations.

Primer++ now detects and defers to native Notebooks, chat search, Usage Limits,
Gems/Skills, Canvas, Deep Research, and Spark instead of hiding or duplicating
those surfaces.

## Verification Snapshot

Last deterministic verification on 2026-08-01:

- `npm test` — green with `all`, `per-file`, and 100% statements, branches,
  functions, and lines over shipped JavaScript in `lib/**`, `src/**`, and
  `scripts/**`. The captured report covers 43,288 statements/lines, 3,582
  functions, and 17,156 branches; no included file is
  below 100%.
- Store-capture Python tooling — 24 `unittest` tests pass separately on both
  Windows and WSL. Python is not included in the c8 JavaScript denominator.
- The last completed `npm audit --audit-level=moderate` reported 0 known
  vulnerabilities. The closeout refresh was attempted twice but the npm
  advisory endpoint failed before TLS establishment; no dependency changed
  after the green audit snapshot.
- `npm run build` — atomic, minified v13.0 outputs pass validation and both
  enforced budgets:
  - userscript: 829,870 B raw, 242,857 B gzip-9,
    SHA-256 `f7ee24f6b3b467f8020ff545cd7948db16d88d4b6d724170b7a4a84800221879`;
  - extension content script: 832,179 B raw, 243,673 B gzip-9,
    SHA-256 `574de285c347b5c20a012547c9acf773056159046ac672704d4eb81a404296cd`;
  - per-target budgets: 835,000 B raw and 245,000 B deterministic gzip-9.
- Architecture and application smoke contracts are green, including selector,
  ambient-global, dependency-direction, lifecycle, storage, portable-archive,
  and UI-shell boundaries.

**Current-browser evidence:** The controlled built-in Browser used an
already authenticated Gemini `/app` work tab and retained that session through
a controlled reload. A broad local-only probe on the immediately preceding
build registered all 10 modules and exercised selected Archive, Collections,
Search, Recipes, Queue, Insights, Preferences, and empty-state flows with an
isolated storage shim. Shared dialogs closed on Escape and restored focus. The
final build hash above then passed a targeted fresh-session regression: Gemini
remained authenticated at `/app`, lifecycle was `started`, all 10 modules were
registered, and only one panel existed. Replacing the Settings trigger while
its dialog was open still restored focus to the new trigger and cleared all
dialog/body inert state.

The final axe-core 4.12.1 scan found no Primer-owned violation after the
progressbar, tab/tabpanel, and direct contrast fixes. Its two remaining
moderate findings were Gemini host-page `main` landmarks. One Primer Auto-theme
button remained `color-contrast` incomplete because of a composite background;
manual calculation measured 6.54:1, passing WCAG AA. This scoped scan does not
replace the remaining viewport/theme/locale/manual accessibility matrix. The
injected application, axe runtime, isolated local storage, and test globals
were removed, leaving a clean authenticated Gemini `/app` without clearing
browser data.

A later bounded run used the dedicated destructive-test account. One direct
prompt and one explicitly started queued prompt were each sent once and each
received the expected sentinel response; no automatic retry occurred. A
portable-archive preview contained exactly one current-run conversation. The
first live bulk-selection click exposed a host-link bubbling defect, which was
fixed by stopping propagation on the injected choice label and change event.
The repaired build above then kept the route stable, selected exactly one
current-run chat, required `DELETE 1`, passed its archive-first checkpoint, and
deleted that one chat. The two pre-existing sidebar conversations remained.
Final teardown returned to authenticated `/app` with the composer available,
zero Primer-owned nodes, no body inert state, and the isolated storage key
removed.

A follow-up core/UI run found one additional lifecycle defect: application
stop left the shared `primer-dialog-portal` attached after every other owned
surface had been removed. `NativeUI.disposeDialogs()` now destroys the manager,
removes the portal and toast region, and clears owned references. The final
build above then passed duplicate start, stop, and restart with one panel while
producing zero owned-node leftovers and zero captured console events. All 10
feature switches changed state and returned to their original enabled map with
zero duplicate IDs. A temporary Collections enable plus Paper-theme choice
survived a controlled reload; both were restored to their original state.

The extended run then covered Collections hierarchy/tags/rules, bounded local
Search, all current-chat export formats, seven-section portable backup plus
dry-run/selective restore, queue controls and exactly-once pacing, annotations
and context packets, wrong/cancel/correct bulk confirmation, two-chat
archive-first deletion, locale/width persistence, both required viewports,
effective 200% zoom, reduced motion, and dialog focus/Escape behavior. Only the
two owned chats were deleted; unrelated chats and authentication remained.

The strict worksheet records 37 full, 3 partial, and no unverified rows:
38.5/40, or 96.25%. Critical A2 and H1 pass. The three partial evidence rows are
message-target focus observation on one harness route, live injected-failure
rendering, and a separately installed extension-profile parity run. No
personal-free or Workspace score is inferred from the exercised account.

## Repository Structure

```
.
├── src/                         shared application
│   ├── adapters/gemini/         current Gemini DOM/capability boundary
│   ├── app/                     composition and production wiring
│   ├── features/                isolated vertical features
│   ├── runtime/                 lifecycle, module host, sessions, capabilities
│   ├── storage/                 account-scoped async storage and migrations
│   ├── ui/                      scoped tokens, components, dialogs, shell
│   ├── modules/                 stable compatibility module IDs
│   └── platforms/               userscript and MV3 boundaries
├── lib/                         deterministic shared utilities
├── tests/                       Node, integration, architecture, and Python tests
├── scripts/                     atomic dual-target build tooling
├── docs/                        current docs, audit status, release research
├── primer-pp.user.js            generated userscript committed for distribution
└── package.json                 npm scripts and dev dependencies
```

Generated or local-only directories:

- `dist/` — ignored extension build output.
- `coverage/` — ignored c8 output.
- `node_modules/` — ignored dependencies.
- `.playwright-mcp/` — ignored local browser/debug logs.

## Current Git Notes

Git state is mutable and this document is not the source of truth for whether
the checkout is clean, ahead, or pushed. Use `git status --short --branch` before
release, commit, push, or store packaging.

Before release or push, run:

```bash
npm test
npm run build
npm audit --audit-level=moderate
git status --short --branch
```

## Current Planning Snapshot

Current product boundary, acceptance contract, market evidence, and scoring are
owned by:

- `docs/research/v13-refactor-plan-2026-08-01.md`
- `docs/research/v13-competitor-evidence-2026-08-01.md`
- `docs/research/v13-task-matrix-2026-08-01.md`
- `docs/research/v13-live-scenarios-2026-08-01.md`

The June market/UI plan and v12 browser probes remain historical evidence, not
current compatibility proof.

## Release handoff

The requested implementation and `>=90%` acceptance gate are complete. Before
an explicitly authorized public release, repeat the registry-backed dependency
audit when npm connectivity returns, install the packaged extension once in a
clean distribution browser profile, capture store screenshots, and then decide
whether to tag, commit, publish, or submit to stores. Those publication actions
are intentionally outside this uncommitted refactor task.
