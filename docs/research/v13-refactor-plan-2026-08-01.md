# Primer++ v13 Refactor and Product Plan — 2026-08-01

This document is the dated product, architecture, and verification plan for the
v13 refactor. It supersedes `market-ui-plan-2026-06-07.md` for current product
decisions. Older snapshots remain useful as historical evidence, but they are
not current Gemini compatibility proof.

## Outcome

Primer++ v13 will be a **local-first, recoverable, portable, and auditable
Gemini workflow control layer**. It will complement Gemini's native features
instead of recreating them.

The release is not complete until all of these independent gates pass:

1. deterministic application source reaches 100% statement, branch, function,
   and line coverage, per file;
2. the userscript and extension build and load from clean inputs;
3. every enabled feature passes a current logged-in Gemini acceptance scenario;
4. the UI passes keyboard, focus, contrast, zoom, locale, theme, and visual
   consistency checks;
5. the combined native Gemini + Primer++ task matrix reaches at least 90%; and
6. project status, feature claims, and release evidence match the current code.

Coverage and live acceptance are separate gates. One cannot substitute for the
other.

## 2026-08-01 Pre-refactor Historical Baseline

This entire snapshot records the starting conditions observed before the v13
implementation work. In particular, the vulnerability count, `lib/**`-only
coverage denominator, v12 injection result, and UI findings below are
historical baseline evidence, not the current v13 release-candidate state.
Current deterministic evidence is owned by `docs/PROJECT_STATUS.md`; current
browser evidence is owned by `v13-live-scenarios-2026-08-01.md`.

### Repository (pre-refactor)

- The source repository was clean before refactor work started.
- `npm test` passed 264 tests and reported 100% c8 coverage for `lib/**`.
- `npm run build` completed userscript and extension outputs.
- `npm audit --audit-level=moderate` reported one high-severity
  `brace-expansion` vulnerability. Older status documents that claim zero
  vulnerabilities are stale.
- The current c8 include is only `lib/**/*.js`. Most of `src/**`, the build
  pipeline, platform adapters, DOM integration, and browser behavior are not in
  the coverage denominator.
- `tests/app_smoke.test.js` mostly checks source text and release invariants. It
  is a useful static contract suite, not a behavioral browser smoke test.

### Logged-in Gemini UI (pre-refactor observation)

A current logged-in Gemini session was inspected without reading cookies,
browser storage, or private conversation contents. The observed account exposes:

- native chat search;
- conversation share, pin, rename, delete, and add-to-notebook actions;
- Notebooks, including creation and existing notebook navigation;
- Images, Videos, and Library surfaces;
- an exact Usage Limits page with current-window and weekly-limit progress and
  reset times;
- Gems, Skills, Scheduled actions, Personal Intelligence, and public-link
  management;
- Gemini Spark with Tasks, Schedules, Skills, and Connected Apps;
- native theme selection and temporary chats.

These are rollout-, account-, locale-, region-, and plan-dependent. The adapter
must detect capabilities rather than assume every account has the same surface.

### v12 Live Injection Baseline

The committed v12 userscript was injected into the current Gemini page with an
ephemeral in-memory GM API test shim. No account credentials or cookies were
stored in the repository or probe output.

Observed results:

- the floating panel mounted once;
- the current-conversation export button mounted;
- the page produced no Primer++-related console error or warning during the
  initial mount;
- the onboarding, panel, and settings UI rendered;
- the panel-menu control is an unnamed `span`; a semantic browser click did not
  expand it, while a coordinate click did;
- the expanded panel is too narrow for its information density and uses very
  small, low-contrast text;
- the settings surface overlaps the still-visible panel, is taller than the
  viewport, and mixes Chinese and English;
- tabs, theme choices, module switches, and several actions are exposed as
  generic clickable elements rather than keyboard-operable controls.

The live result agrees with the source audit: the main UI needs a shared design
system and semantic component layer, not additional isolated CSS patches.

## Native and Market Boundary

### Official Gemini evidence

- Chat management: <https://support.google.com/gemini/answer/13666746?co=GENIE.Platform%3DDesktop&hl=en>
- Notebooks: <https://support.google.com/gemini/answer/16972047?hl=en>
- Import from other AI platforms: <https://support.google.com/gemini/answer/16868299?hl=en-GP>
- Gems: <https://support.google.com/gemini/answer/15235603?hl=en>
- Chrome Skills: <https://support.google.com/gemini/answer/16988996?co=GENIE.Platform%3DDesktop&hl=en>
- Spark: <https://support.google.com/gemini/answer/17094507>
- Usage limits: <https://support.google.com/gemini/answer/16275805?hl=en>
- Gemini in Chrome: <https://support.google.com/gemini/answer/16283624?hl=en>
- Response export: <https://support.google.com/gemini/answer/14184041>
- Google Takeout: <https://support.google.com/gemini/answer/16920332?hl=en>
- Canvas: <https://support.google.com/gemini/answer/16047321?co=GENIE.Platform%3DDesktop&hl=en>
- Deep Research: <https://support.google.com/gemini/answer/15719111>

### Direct benchmarks

The dated listing synthesis and its limitations are recorded in
[`v13-competitor-evidence-2026-08-01.md`](v13-competitor-evidence-2026-08-01.md).

- Voyager: <https://chromewebstore.google.com/detail/voyager/iifacdnjakkhjjiengaffnegbndgingi>
- AI Toolbox: <https://chromewebstore.google.com/detail/ai-toolbox-folders-prompt/jlalnhjkfiogoeonamcnngdndjbneina>
- Toolbox for Gemini: <https://chromewebstore.google.com/detail/toolbox-for-gemini-folder/cbdpdhfnjbkjphmminnkfbeekodlphlp>
- Superpower for Gemini: <https://chromewebstore.google.com/detail/superpower-for-gemini-fol/ahmdidjajeicoopcdpablhecokaepofl>
- Gemini Folders: <https://chromewebstore.google.com/detail/gemini-folders-organize-c/jffchdehoapigpmifkmleglfimjiilik>
- AI Chat Exporter: <https://chromewebstore.google.com/detail/ai-chat-exporter-gemini-t/jfepajhaapfonhhfjmamediilplchakk>
- SaveChat: <https://chromewebstore.google.com/detail/savechat-for-gemini-expor/blndbnmpkgfoopgmcejnhdnepfejgipe>
- Superpower ChatGPT, used only as an adjacent mature-workspace benchmark:
  <https://chromewebstore.google.com/detail/superpower-for-chatgpt/amhmeenmapldpjdedekalnfifgnpfnkc>

Store listings are vendor claims. They define a useful task benchmark but do
not prove actual reliability, privacy behavior, or current DOM compatibility.

## Feature Decisions

| Current module | v13 decision | Durable responsibility |
| --- | --- | --- |
| Counter | Rebuild as Insights | Local message/model history, trends, streaks, and clearly labelled estimates. Link to native Usage Limits; never claim server balance accuracy. |
| Folders | Rebuild as Collections | Nested collections, tags, rules, drag/drop, local portability, and fallback where Notebooks are unavailable. Do not hide or replace Notebooks. |
| Export | Rebuild as Archive | Selective multi-chat archive, message/model/tool/source metadata, rich-content fidelity, portable import, and bounded context packets. |
| Prompt Vault | Rebuild as Recipes | Versioned open recipes, variables, deterministic steps, diffs, provenance, permissions, import/export, and optional queue handoff. |
| Message Queue | Keep and harden | Immediate local draft queue with explicit start, ordering, pause, pacing, confirmation, cancellation, and traceable outcomes. It is not a scheduled-task replacement. |
| Default Model | Merge into Preferences | Capability-aware new-chat preference and safe fallback. No repeated DOM clicking or independent flagship module. |
| Batch Delete | Keep and harden | Preview, explicit selection, optional pre-delete archive, scoped confirmation, partial-failure reporting, and recoverable local state. |
| Quote Reply | Keep, then merge into Navigator | Message-level anchors, selected snippets, source references, and explicit composer insertion. |
| UI Tweaks | Retire as a standalone module | Move valid width, shortcut, title, send-behavior, and accessibility settings into Preferences. Remove default Gems/Notebooks hiding and broad host CSS overrides. |
| Chat Notes | Rebuild as Annotations | Explicit local notes, message anchors, pins, backlinks, context packets, and archive co-export. Do not mimic opaque Gemini memory. |

### New capabilities

1. **Search & Navigator** — exact/include/exclude, role/date/model/source filters,
   message jump, timeline, bookmarks, and branch map.
2. **Portable Backup & Restore** — versioned open schema, validation, incremental
   backup, preview, duplicate detection, selective restore, and rollback.
3. **Capability Health** — live Gemini surface probes and per-feature
   `available`, `degraded`, `native-owned`, `disabled`, or `failed` states.
4. **Preferences & Accessibility** — shared theme, locale, density, width,
   shortcuts, send behavior, focus behavior, and feature toggles.

### Explicit non-goals

- generic multi-tab web automation;
- reimplementing Canvas, Deep Research, native content generation, Gems,
  Notebooks, or Spark scheduled tasks;
- hidden transcript collection;
- remote analytics or a mandatory backend;
- pretending estimated usage equals Google's server-side quota.

## Target Architecture

Dependencies flow in one direction:

```text
platform entry
  -> application bootstrap and session controller
  -> runtime services and capability registry
  -> feature controllers and repositories
  -> registered views and native mounts
  -> UI shell / Gemini surface adapter
```

Forbidden dependencies:

- registry to concrete UI;
- UI shell to Counter or any concrete feature;
- feature to another feature singleton;
- feature to global `GM_*` or raw Gemini selectors;
- pure domain logic to DOM, storage, navigation, or wall-clock globals.

### Runtime contract

Features are factories with no import-time side effects:

```js
export function createFeature(ctx) {
  return {
    descriptor: {
      id: 'collections',
      defaultEnabled: false,
      requires: [],
      provides: ['collections']
    },
    async start(scope) {},
    async onSessionChanged(next, previous) {},
    async suspend(reason) {},
    async resume() {},
    async stop() {}
  };
}
```

`LifecycleScope` owns listeners, timers, observers, subscriptions, deferred
cleanup, and an `AbortSignal`. `ModuleHost` serializes lifecycle changes,
rolls back partial starts, unregisters capabilities, and records explicit
states.

### Storage

- All access is asynchronous through `StoragePort.get/set/update/subscribe/flush`.
- Userscript sync APIs are Promise-wrapped; extension storage remains genuinely
  asynchronous and propagates errors.
- Reads and writes cross a structured-clone boundary.
- Existing keys remain readable during migration.
- New values use `{ schemaVersion, revision, data }` envelopes.
- Feature repositories own validation and pure migrations.
- detected session identity and selected inspection profile are separate; write
  APIs only accept the active session identity.

### Gemini surface

The existing `GeminiAdapter` remains as a compatibility facade while being
split into selector, session, sidebar, composer, conversation, model, dialog,
mutation, and diagnostics capabilities.

Features consume high-level queries/actions and events, not selectors:

- `composer.mounted`, `composer.insert()`, `composer.submit()`;
- `sidebar.changed`, `conversation.listVisible()`;
- `route.changed`, `session.changed`, `model.changed`;
- `capabilities.snapshot()` and `diagnostics.report()`.

Observers use narrow roots and ignore Primer++-owned nodes. Low-frequency
health polling remains only as a fallback.

### UI system

- One independent `#primer-pp-root`/portal for shell UI.
- `.pp-*` classes and `--pp-*` semantic tokens only.
- Gemini-embedded controls use a separate surface adapter and inherit the
  actual host theme.
- Shared Button, IconButton, Switch, Checkbox, Tabs, DialogManager, Menu,
  FormField, ToastRegion, EmptyState, ModuleSection, and data-visualization
  primitives.
- One dialog stack: topmost Escape only, `aria-modal`, background inert,
  trigger-focus restoration, and deterministic disposal.
- One locale store. No browser-language snapshot plus independent onboarding
  language plus hardcoded labels.
- Minimum body text 13–14 px, 4 px spacing grid, visible focus, complete
  contrast states, 32 px compact and 44 px touch targets.

## Test Architecture

### Coverage denominator

Include all deterministic JavaScript:

- `lib/**/*.js`;
- `src/**/*.js`, including bootstrap, UI, all features, Gemini adapter, and
  userscript/extension platform code;
- `scripts/**/*.js` after the build CLI is split into injectable functions.

Use per-file 100% statement, branch, function, and line thresholds. Exclude
only generated output, dependencies, test fixtures, and non-JavaScript assets.
Any source exclusion requires an owner, reason, and expiry date.

### Test layers

| Layer | Required evidence |
| --- | --- |
| Unit | Domain functions, migrations, state machines, cancellation, failure injection, undo/redo, and normalization. |
| Component DOM | Shell, dialogs, settings, dashboard, tour, native mounts, feature views, repeated mount/unmount, focus, and event cleanup. |
| Adapter contract | Sanitized signed-out, zero-state, chat, sidebar, model-menu, delete-dialog, tool-mode, and rich-response fixtures. |
| Platform contract | Fake GM and Chrome storage, reload, cross-tab changes, failures, context menu, and single SPA injection. |
| Build/package | Clean userscript and extension build, manifest/schema/version/header/icon checks, output hashes, and loadability. |
| Live E2E | Current logged-in Gemini scenarios with observable preconditions, actions, postconditions, and cleanup. |
| Visual | Light/dark, locale, common viewport, 200% zoom, long text, and reduced motion screenshot review. |
| Accessibility | axe, keyboard-only operation, dialog focus, focus restoration, target size, and zero critical/serious findings. |

### Test-account safety

- Authentication secrets never enter the repository, screenshots, or logs.
- Every created chat/data item uses a unique `PP-E2E-<date>-<run>` prefix.
- Only items carrying the current run prefix may be deleted.
- Send/delete actions are not automatically retried.
- Queue tests are rate limited and explicitly started.
- Local feature data is snapshotted before tests and restored or removed after.
- Probes export booleans, counts, normalized labels, and selector health only.

## Auditable 90% Task Coverage

The row-level release ledger is
[`v13-task-matrix-2026-08-01.md`](v13-task-matrix-2026-08-01.md). This section
defines its scoring model; the ledger owns task status and the final score.
The browser execution contract and result log live in
[`v13-live-scenarios-2026-08-01.md`](v13-live-scenarios-2026-08-01.md).

The score is calculated from user tasks, not marketing bullets:

```text
score = sum(weight[i] * max(native[i], primer[i])) / sum(weight[i])
```

- complete and live-verified = 1;
- partial = 0.5;
- unavailable or unverified = 0;
- `max` prevents duplicate native + extension functionality from double
  counting.

Use 40 equally weighted atomic tasks:

| Capability family | Tasks |
| --- | ---: |
| Organization and classification | 4 |
| Search, timeline, and message navigation | 5 |
| Export, archive, and re-import | 5 |
| Recipe and prompt workflow | 5 |
| Queue and session execution | 3 |
| Notes, references, and context packets | 4 |
| Bulk lifecycle and recovery | 4 |
| Model, history, and usage visibility | 3 |
| Preferences, shortcuts, and accessibility | 3 |
| Privacy, backup, and compatibility health | 4 |
| Total | **40** |

Publishing `>=90%` requires at least 36 fully equivalent tasks or an equivalent
weighted score. Export fidelity, destructive-operation safety, recovery, and
privacy cannot be rescued by partial points elsewhere. Scores are computed
separately for personal free, personal paid, and Workspace surfaces; the lowest
supported-surface score is the published score.

## Migration Sequence

### Phase 0 — Truth and safety gates

- correct stale module counts, lifecycle descriptions, audit status, and native
  capability assumptions;
- fix the high-severity dependency finding;
- preserve the current live injection baseline;
- add guards against new raw GM calls, feature-to-feature singleton imports,
  feature-to-panel imports, and selectors outside the Gemini layer.

Exit: docs match reality; test/build/audit commands are honest and repeatable.

### Phase 1 — Correctness boundaries

- cancel in-flight Message Queue continuations on disable/session/route changes;
- stop Folders mutation self-trigger and duplicate rescans;
- correct extension storage cloning, error, and change-notification semantics;
- make build output atomic.

Exit: focused regression tests pass and current user data remains readable.

### Phase 2 — Runtime, storage, and shell

- introduce `LifecycleScope`, `ModuleHost`, capability registry, async
  `StoragePort`, and `SessionController`;
- expose reusable `startPrimer()` / `stopPrimer()`;
- detach shell visibility and detail state from Counter;
- add the scoped design-token and semantic component layer.

Exit: start -> stop -> start leaves no duplicate DOM, listener, observer, or
timer; a failed feature start rolls back cleanly.

### Phase 3 — Strangler migration

Migrate one vertical feature at a time while preserving old keys and a facade:

1. Chat Notes -> Annotations;
2. Prompt Vault -> Recipes;
3. Folders -> Collections;
4. Message Queue;
5. Export -> Archive;
6. Counter -> Insights;
7. Default Model and valid UI Tweaks -> Preferences;
8. Batch Delete and Quote Reply -> lifecycle/navigation services.

Each migrated feature must have domain, repository, controller, view, adapter
contract, component, and live acceptance tests before its compatibility facade
is removed.

### Phase 4 — Missing high-value tasks

- Search & Navigator;
- portable backup/restore with preview and validation;
- capability health and native-ownership detection;
- rich archive fidelity for code, math, citations, and media metadata.

Exit: the 40-task matrix reaches at least 90% on every claimed account surface.

### Phase 5 — Release candidate verification

- current Chrome + Tampermonkey;
- current Firefox + Violentmonkey;
- Chrome and Edge MV3;
- Firefox extension;
- live Gemini evidence less than 24 hours old;
- no skipped or quarantined release-gate scenario;
- updated public claims, privacy statement, screenshots, and changelog.

## Completion Evidence Map

| Requirement | Proof required |
| --- | --- |
| Less heavy, clearer modules | dependency-direction guard, size/responsibility review, lifecycle start/stop tests |
| Code quality | clean static checks, deterministic failure tests, no known high audit issue |
| Unified attractive UI | token/component use, visual matrix, theme/locale/zoom evidence |
| User-selectable modules | descriptor-driven settings and live enable/disable cleanup for every feature |
| Current Gemini fit | capability snapshot, native-owned decisions, live adapter and feature matrix |
| 100% test coverage | per-file merged source coverage artifact, not only `lib/**` |
| Every function UI-tested | live scenario ledger with precondition/action/result/cleanup |
| No known interaction bugs | zero unresolved critical/serious a11y issues and no failed required scenario |
| >=90% competitor task coverage | current 40-task native + Primer++ score with source links and live evidence |

Until every row has current evidence, v13 remains in progress.
