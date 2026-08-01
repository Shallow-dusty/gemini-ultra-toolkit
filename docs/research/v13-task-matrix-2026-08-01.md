# Primer++ v13 Task Coverage Matrix — 2026-08-01

This is the release scoring sheet for the 40-task benchmark defined in
`v13-refactor-plan-2026-08-01.md`. It measures user outcomes, not the number of
settings, buttons, modules, or vendor claims.

## Scoring contract

- `1` requires a complete equivalent and current live evidence.
- `0.5` means the task is useful but materially incomplete.
- `0` means unavailable, broken, or not verified.
- The release value is `max(native, primer)` for each row so duplicated native
  functionality never earns extra credit.
- `implemented` is not the same as `live-verified`. A row without both the
  relevant deterministic test and live scenario remains unscored.
- Rows 12, 14, 28, 30, 37, and 38 are critical. A partial or failed critical
  row blocks a `>=90%` release claim even if the numeric total is high enough.
- Personal-free, personal-paid, and Workspace results are calculated
  separately. Only surfaces actually exercised may be published.

Status vocabulary:

- `native-observed`: present in the current logged-in Gemini surface.
- `implemented`: deterministic source and focused tests exist.
- `live-pass`: the current build passed its named browser scenario.
- `pending`: evidence is not complete yet.
- `native-owned`: Primer++ deliberately defers to the native capability.

## Atomic task matrix

| ID | Family | Atomic user task | Native boundary / market benchmark | Primer++ responsibility | Deterministic evidence | Live scenario | Native | Primer | Release |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |
| O1 | Organization | Put chats into a first-party workspace container | Gemini Notebooks; folder extensions | Detect and preserve Notebooks; never hide or replace them | adapter capability fixture | `NATIVE-01` | 1 | native-owned | 1 |
| O2 | Organization | Create nested local collections | Voyager, AI Toolbox, Superpower, Gemini Folders | Collections tree with stable IDs and cycle prevention | collections model/operations tests | `COLL-01` | 0 | 1 | 1 |
| O3 | Organization | Apply tags and manual classifications | Folder/organizer extensions | Multi-tag membership without moving native data | collections controller/repository tests | `COLL-02` | 0 | 1 | 1 |
| O4 | Organization | Reorder and automatically classify visible chats | Folder/organizer extensions | Drag/drop ordering plus explicit, previewable local rules | collections transfer/rule tests | `COLL-03` | 0 | 1 | 1 |
| S1 | Search | Search chat titles with Gemini's native search | Gemini Search chats | Detect and defer to the native surface | adapter capability fixture | `NATIVE-02` | 1 | native-owned | 1 |
| S2 | Search | Search archived chat and message content locally | Mature chat workspace extensions | Indexed exact/include/exclude content search | search index/query tests | `NAV-01` | 0 | 1 | 1 |
| S3 | Search | Filter results by role, date, model, and source | Superpower-style search benchmark | Composable filters with deterministic ranking | search filter/ranking tests | `NAV-02` | 0 | 1 | 1 |
| S4 | Search | Jump to a message and traverse a conversation timeline | Mature chat navigator benchmark | Stable locators, focus transfer, previous/next results | navigator integration tests | `NAV-03` | 0 | 0.5 | 0.5 |
| S5 | Search | Navigate bookmarks, references, and known branches | Mature workspace benchmark | Bookmark/reference index and branch descriptors where detectable | navigator/annotation tests | `NAV-04` | 0 | 1 | 1 |
| A1 | Archive | Export the current conversation in common open formats | Gemini response export; SaveChat; AI Chat Exporter | JSON, CSV, Markdown, HTML, and DOCX compatibility exports | formatter/archive integration tests | `ARCH-01` | pending | 1 | 1 |
| A2 | Archive | Select and export multiple conversations | Export extensions | Explicit multi-select archive with bounded progress | archive feature/session tests | `ARCH-02` | 0 | 1 | 1 |
| A3 | Archive | Preserve code, math, citations, model/tool/source metadata | Export extensions | Canonical rich-content schema and loss reporting | canonical/fidelity fixture tests | `ARCH-03` | 0 | 1 | 1 |
| A4 | Archive | Validate and preview a portable archive before importing it | Google Takeout/import; mature backup tools | Schema validation, dry-run plan, duplicate detection, selective restore | restore-plan tests | `ARCH-04` | pending | 1 | 1 |
| A5 | Archive | Roll back or safely resume an interrupted restore | Mature backup tools | Transactional restore journal and explicit recovery path | failure-injection/rollback tests | `ARCH-05` | 0 | 1 | 1 |
| R1 | Recipes | Create, edit, duplicate, search, and delete reusable recipes | Gemini Gems/Skills; prompt managers | Local recipe CRUD that complements native Gems/Skills | recipes service/model tests | `RECIPE-01` | pending | 1 | 1 |
| R2 | Recipes | Fill typed variables before inserting a recipe | Prompt manager extensions | Required/default/choice variable resolution and preview | recipe variable tests | `RECIPE-02` | 0 | 1 | 1 |
| R3 | Recipes | Compare recipe versions and retain provenance | Mature prompt libraries | Immutable versions, diff, source, and timestamps | recipe version/provenance tests | `RECIPE-03` | 0 | 1 | 1 |
| R4 | Recipes | Run an explicit deterministic multi-step recipe | Gemini Spark Skills; workflow tools | Permission-described steps; no hidden execution | recipe renderer/step tests | `RECIPE-04` | pending | 1 | 1 |
| R5 | Recipes | Import/export recipes and optionally hand steps to the queue | Prompt libraries | Open format, collision preview, explicit queue handoff | recipe transfer/integration tests | `RECIPE-05` | 0 | 1 | 1 |
| Q1 | Queue | Order, reorder, pause, resume, and cancel queued prompts | AI Toolbox queue benchmark | Local visible queue with explicit controls | queue state-machine tests | `QUEUE-01` | 0 | 1 | 1 |
| Q2 | Queue | Start paced sending explicitly and send every item at most once | Queue extensions | Explicit start, configurable pacing, exactly-once attempt semantics | queue timing/cancellation tests | `QUEUE-02` | 0 | 1 | 1 |
| Q3 | Queue | Stop safely on account, route, visibility, or composer changes | No reliable native equivalent | Session-bound generation tokens and traceable outcomes; never auto-retry sends | queue lifecycle tests | `QUEUE-03` | 0 | 1 | 1 |
| N1 | Notes | Attach a private local note and status to a chat | Workspace note benchmarks | Per-account annotations with pins, tags, and status | annotations repository/domain tests | `NOTE-01` | 0 | 1 | 1 |
| N2 | Notes | Anchor a note or quoted excerpt to a specific message | Quote/reply extensions | Stable message anchor plus explicit composer insertion | annotations/navigator integration tests | `NOTE-02` | 0 | 1 | 1 |
| N3 | Notes | Search pins, tags, statuses, and backlinks | Knowledge workspace benchmark | Local annotation index and backlinks | annotation query tests | `NOTE-03` | 0 | 1 | 1 |
| N4 | Notes | Build a bounded context packet and co-export its references | Context/workspace tools | Explicit selection, size bounds, provenance, archive co-export | packet/archive tests | `NOTE-04` | 0 | 1 | 1 |
| B1 | Bulk lifecycle | Preview the exact chats selected for a bulk operation | Bulk-management extensions | Stable IDs, scope summary, and no implicit all-selection | bulk snapshot/runner tests | `BULK-01` | 0 | 1 | 1 |
| B2 | Bulk lifecycle | Archive selected chats before destructive deletion | Backup-oriented tools | Mandatory optional archive checkpoint with visible result | bulk/archive integration tests | `BULK-02` | 0 | 1 | 1 |
| B3 | Bulk lifecycle | Confirm destructive scope with strong, unambiguous intent | Gemini native single-delete dialog | Typed/scoped confirmation and cancel-first behavior | bulk confirmation tests | `BULK-03` | pending | 1 | 1 |
| B4 | Bulk lifecycle | Stop on cancellation/failure and recover without duplicate deletes | No reliable native equivalent | No automatic retry, partial-result ledger, resumable explicit remainder | bulk failure/cancellation tests | `BULK-04` | 0 | 1 | 1 |
| I1 | Model and usage | Apply a preferred model only when the capability is available | Gemini native model picker | New-chat preference with capability probe and safe fallback | preference/model-controller tests | `PREF-01` | 1 | pending | 1 |
| I2 | Model and usage | Inspect local message/model history, trends, and streaks | Usage/statistics extensions | Honest local events and derived trends; no server-quota claim | insights calculation/session tests | `INSIGHT-01` | 0 | 1 | 1 |
| I3 | Model and usage | See exact native limits while distinguishing local estimates | Gemini Usage limits | Link/defer to native exact limits; label every local estimate | adapter/insights semantics tests | `INSIGHT-02` | 1 | 1 | 1 |
| P1 | Preferences | Enable or disable every optional feature without reload or leaks | Extension settings benchmarks | Descriptor-driven switch with start/stop rollback and persisted state | ModuleHost/settings integration tests | `CORE-06` / `PREF-02` | 0 | 1 | 1 |
| P2 | Preferences | Adjust extension theme, locale, and width coherently | Gemini native theme; extension settings | One locale store and scoped semantic tokens that follow host theme | UI/theme/locale tests | `PREF-02` | pending | 1 | 1 |
| P3 | Preferences | Use shortcuts, send behavior, dialogs, and feature UI accessibly | Accessibility baseline | Fixed shortcut safety, visible focus, keyboard dialogs, and 200% zoom support | UI component/a11y tests | `A11Y-01` | 0 | 1 | 1 |
| H1 | Privacy and health | Keep feature data local and avoid hidden transcript/analytics collection | Privacy claims across extensions | No backend, explicit export boundaries, account-scoped repositories | storage/architecture audit | `PRIV-01` | 0 | 1 | 1 |
| H2 | Privacy and health | Back up, validate, de-duplicate, selectively restore, and roll back all local data | Backup tools; Google Takeout boundary | Versioned open backup manifest spanning enabled features | storage/archive migration tests | `BACKUP-01` | pending | 1 | 1 |
| H3 | Privacy and health | Explain whether a feature is available, degraded, native-owned, disabled, or failed | No consistent native equivalent | Current selector/capability probes with actionable diagnostics | capability-health/adapter tests | `HEALTH-01` | 0 | 0.5 | 0.5 |
| H4 | Privacy and health | Preserve account/session isolation and portable behavior across supported runtimes | Userscript and MV3 extension benchmarks | Bound session repositories, inspection read-only mode, GM/Chrome parity | storage/platform/build tests | `PLAT-01` | 0 | 0.5 | 0.5 |

## Current live-native observations

The completed userscript run in `v13-live-scenarios-2026-08-01.md` retained an
authenticated Gemini `/app` session while exercising the 10-module shell,
module switches, reload persistence, Collections, Search, Archive, Recipes,
Queue, Annotations, Bulk Lifecycle, Portable Restore, Capability Health, and
responsive dialog/panel behavior. It created and removed only records bearing
the run prefix; the final teardown left no Primer-owned DOM, storage shim,
composer text, or test globals.

The run found and fixed current-Gemini integration defects in sidebar choice
events, shared-dialog disposal and initial focus, compact-panel layout,
high-zoom sizing, reduced-motion styling, queue action wording, immediate
Collections restore refresh, stale multi-chat selection retry, native delete
verification, and stop-on-failure handling. Wrong bulk confirmation, Escape,
final cancel, archive-first deletion, and a deterministic partial-delete failure
were exercised without retrying or touching unrelated chats.

Current native Notebooks, Search chats, and the model picker were observed and
left native-owned. Local Archive formats, queue pacing and route guards,
Collections hierarchy/tags/rules, annotation anchors/context packets, all seven
portable sections, dry-run/selective restore, theme/locale/width persistence,
1280x720, 1536x864, 200% effective zoom, reduced motion, and dialog focus/Escape
behavior passed their bounded scenarios.

The closeout run completed multi-chat export, rich-fidelity export, Recipes
CRUD/variables/version diff/steps/transfer/queue handoff, restore rollback and
resume, bulk partial-failure recovery, local Insights, native Usage semantics,
privacy/network isolation, module disabled/recovery states, fixed-shortcut
safety, high contrast, reduced motion, compact reflow, and all eight feature
panels. The supported MV3/Firefox manifest now carries both service-worker and
script backgrounds plus an action surface, and its storage/build contracts pass;
an installed extension runtime was not available in this run. Message scroll
and selection passed, but the harness route did not expose message-target focus
through `document.activeElement`; injected failed capability rendering remains
deterministic-only. Those three evidence limits remain partial.
No personal-free or Workspace score is inferred.

## Score worksheet

| Surface | Fully equivalent | Partial | Failed/unverified | Weighted score | Critical rows pass | Publishable |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Current personal account | 37 | 3 | 0 | 96.25% | yes | yes |
| Personal free | not tested | not tested | not tested | — | not tested | no |
| Workspace | not tested | not tested | not tested | — | not tested | no |

Only current bounded evidence receives credit: `37 + (3 × 0.5) = 38.5`
task-equivalents out of 40. Every critical row passes and the current-account
matrix exceeds the `>=90%` release gate. Unsupported personal-free and
Workspace surfaces remain explicitly unclaimed rather than inheriting this
account's score.
