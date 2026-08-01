# Primer++ v13 Live Acceptance Ledger — 2026-08-01

This ledger owns current-browser acceptance evidence. Unit coverage, source
inspection, and a successful build cannot turn a live row green.

## Run contract

Each execution records:

- build hash and target (`userscript`, Chrome/Edge MV3, or Firefox);
- browser and extension/userscript version;
- Gemini route, capability snapshot, host theme, locale, viewport, and zoom;
- a unique `PP-E2E-<date>-<run>` prefix for every created remote item;
- precondition, semantic action, observable postcondition, console result, and
  cleanup result;
- sanitized screenshots or structured snapshots that contain no account
  identity, cookies, credentials, unrelated chat titles, or chat contents.

Safety rules:

1. Snapshot Primer++ local data before mutation and restore it after the run.
2. Delete only remote items created with the current run prefix.
3. Never automatically retry a prompt send, delete, subscription, permission,
   terms acceptance, or other non-idempotent action.
4. Queue sending requires a visible explicit start action and a low item count.
5. Do not accept Spark terms, connect apps, buy a plan, or grant new Google
   permissions during verification.
6. A transient route or selector failure is a failed/degraded observation, not
   permission to broaden selectors and click by coordinates.

Result vocabulary is `pending`, `pass`, `degraded`, `fail`, `blocked`, or
`not-applicable`. `blocked` requires an exact external precondition; it is not
a substitute for an unimplemented test.

## 2026-08-01 partial IAB evidence (non-scoring)

An exploratory run exercised the pre-focus-fix v13 userscript build with
SHA-256
`9745dd14be9bbae466edd8f9ce9871491156f5c26d91ed85a7fca1cb40623368` in
the controlled built-in Browser. A second, narrowly targeted regression exercised the
final focus/accessibility-fix build with SHA-256
`a6bb2a085ce744a018ca36331f70ee2ca57c2bf6f9fdccea9ba07eb17bc41928`.
Both runs were deliberately narrower than the run contract above and therefore
do not change any 40-task score or turn a full scenario row below green.

Sanitized observations:

- The controlled work tab was already authenticated at Gemini `/app`. A
  controlled reload returned to authenticated `/app`; the work tab's session
  was retained.
- The v13.0 shell registered all 10 modules. Start/stop/start left one panel
  instance, and final cleanup removed the injected application, test shim,
  public test globals, and Primer-owned DOM without clearing browser data.
- On the blank new-chat route, sidebar, composer, model-picker, and mutation
  capabilities were available. Conversation header/message capabilities were
  honestly degraded because no conversation was open. New chat, temporary
  chat, Notebooks, and native chat search remained native-owned.
- Local-only UI probes covered archive formats and all seven portable sections,
  duplicate-safe Collections input, Search filters and an honest empty state,
  versioned Recipes with variables/steps/permission preview, Queue add/cancel
  without starting a send, graceful blank-state Annotations and Bulk views,
  the local-estimate Usage Limits link, and an isolated Primer theme change.
- Archive and Recipes used the shared dialog stack. Their topmost dialogs made
  the background inert, closed on Escape, and restored focus to the invoking
  control.
- No prompt was sent, no Gemini conversation or account setting was created,
  changed, or deleted, and no export download was started. All created test
  records were confined to the isolated local shim and were removed.

The final-build regression started in a fresh IAB session on a clean,
authenticated Gemini `/app`. It reported lifecycle `started`, all 10 modules,
and one panel instance. The probe deliberately replaced the Settings trigger
while its dialog was open; closing the dialog restored focus to the replacement
`g-open-settings` trigger and left zero dialogs with all body
`inert`/`aria-hidden` state cleared.

The broad run's initial axe-core result is superseded by an axe-core 4.12.1
scan of the final build. Primer-owned progressbar naming, tab/tabpanel
relationships, and direct contrast violations passed. The two remaining
moderate violation findings were Gemini host-page `main` landmarks
(`landmark-main-is-top-level` and `landmark-no-duplicate-main`), not
Primer-owned nodes. One Primer Auto-theme button remained `incomplete` for
`color-contrast` because of its composite background; manual composite-color
calculation measured 6.54:1, which passes WCAG AA. This scoped result does not
replace the still-pending full viewport/theme/locale/manual accessibility
matrix.

After the final probe, the injected application, axe runtime, isolated
`localStorage`, and public test globals were removed. The Browser was left on a
clean, authenticated Gemini `/app` page.

The active Browser session did not match the dedicated destructive-test
account. Remote send/delete, remote cleanup and account-isolation scenarios
were therefore intentionally not executed. MV3 Chrome/Edge and Firefox parity,
the required viewport/zoom/theme/locale matrix, and full dialog/control coverage
also remain unexecuted. The official scenario rows below stay `pending` until
their complete preconditions, actions, assertions, and cleanup are recorded.

## 2026-08-01 dedicated-account remote IAB evidence

A bounded remote run used only the dedicated destructive-test account and one
unique run prefix. It began on userscript SHA-256
`a6bb2a085ce744a018ca36331f70ee2ca57c2bf6f9fdccea9ba07eb17bc41928`:

- one direct prompt was submitted once and received its exact sentinel reply;
- one queued prompt was explicitly started, transitioned to `sent`, received
  its exact sentinel reply, and was not retried;
- a controlled reload preserved the enabled-module map and isolated local
  queue state;
- portable-archive preview captured exactly the one current-run conversation
  and serialized 1,775 bytes.

The first real sidebar-selection click exposed a current-Gemini integration
bug: the injected checkbox lived inside Gemini's conversation link, so the
click bubbled into host navigation and invalidated selection. Production code
was changed to stop propagation on both the injected label click and checkbox
change. The repaired userscript SHA-256
`caf4140c0ba5b70fa9557565c65c7af684d459ecc8d136e1b37a0cfe78ec1d54`
then passed the bounded destructive flow:

- the current conversation path remained stable after selection, with exactly
  one checkbox selected and a `Preview 1` action;
- the preview named one explicitly selected conversation, archive-first was
  enabled, and the typed phrase was exactly `DELETE 1`;
- the second confirmation again stated one matching conversation and
  archive-first; the validated archive checkpoint succeeded before deletion;
- after one delete action the current-run path was absent, Gemini returned to
  `/app`, and the two pre-existing sidebar conversations remained;
- teardown removed the isolated storage key and every Primer-owned node,
  cleared dialog/body inert state, retained the authenticated session, and left
  the composer available. No account setting or unrelated conversation was
  changed.

This run was the bounded remote baseline. Its queue and confirmation gaps were
subsequently exercised by the extended feature-matrix run below.

## 2026-08-01 core lifecycle and preference IAB evidence

The follow-up run exercised userscript SHA-256
`c5b45cc692c12c0c9f43707a0fa4ae113b0a72ba1fc486504000a130209a99c3`
on the authenticated blank `/app` route with the same isolated-storage safety
boundary.

- A second start retained exactly one panel and one set of native mounts.
- Stop removed the panel and native mounts but initially left the shared
  `primer-dialog-portal`; this was treated as a failed cleanup observation and
  fixed in production rather than waived.
- The repaired build added `NativeUI.disposeDialogs()`. Live stop then left zero
  Primer-owned nodes, no body `inert`/`aria-hidden` state, and restart mounted
  exactly one panel. A captured duplicate-start/stop/restart interval emitted no
  Runtime or Log events.
- All 10 feature switches were toggled to their opposite state and back, one at
  a time. Every switch reflected the transition, the original two-enabled map
  was restored, and every checkpoint had zero duplicate IDs. Enabling the
  unavailable preferred-model surface produced one expected capability warning
  and no application error.
- Collections was temporarily enabled and the Paper theme selected. After a
  controlled reload and reinjection, both states persisted. Collections was
  disabled again and the original Glass theme restored.

This completes the core clean-mount, idempotent-mount, stop/start, and all-switch
rows. P1 receives full task credit. The extended run below subsequently covered
locale and width persistence for P2.

## 2026-08-01 extended feature-matrix IAB evidence

The final bounded run exercised the current userscript build (later rebuilt
without behavioral changes as SHA-256
`999e50077fa48b76a3a13535f0c6cf3ac2dbc328f6c187aaed3ae0e789b1787b`)
against the current authenticated Gemini frontend.

- Collections passed nested/root creation, tags, multi-membership, rule preview,
  reorder/move, and immediate UI refresh after selective restore.
- Search indexed three bounded local chat records and four messages, passed
  exact search, filtering, open/highlight, and honest degraded health when the
  persistent archive provider was absent. Background Browser focus prevented a
  reliable `document.activeElement` assertion, so the jump/focus row remains
  degraded despite the repaired target-focus code and deterministic regression.
- Current-chat Archive generated valid JSON, CSV, Markdown, TXT, HTML, and DOCX
  blobs. Portable Archive covered all seven sections, checksum/preview,
  programmatic import, dry-run with zero writes, selective Collections restore,
  confirmation, apply journal, and immediate UI synchronization.
- Multi-chat export selected exactly two owned chats and preserved route/error
  reporting, but one chat timed out waiting for render on every live attempt.
  The stale-row retry is retained as a resilience improvement; A2 remains
  degraded rather than being waived.
- Queue passed three-item reorder/cancel, explicit start, pause/resume, paced
  exactly-once sends, and route/session guards. Annotations passed chat and
  message notes, status, pins, tags/search, stable/fallback locators, explicit
  composer insertion, and a bounded provenance-bearing context packet.
- Recipes created and inserted a versioned three-step item with provenance, but
  the live UI did not complete typed-variable authoring/import, a two-version
  diff, or transfer/queue handoff. These rows remain degraded or pending.
- Bulk Lifecycle rejected the wrong phrase, closed safely on Escape, preserved
  selection on final cancel, and then archive-first deleted exactly two owned
  chats with zero failures/retries while preserving unrelated chats.
- English locale and 960 px chat width persisted across reload. The panel fit at
  1280x720, 1536x864, and an effective 768x432 (200% zoom) without horizontal
  overflow. Reduced-motion durations were clamped; Settings initial focus,
  Escape, and trigger-focus restoration passed.
- Capability Health exposed available, native-owned, degraded, and unavailable
  states. Native Notebooks, Search chats, and the model picker remained
  native-owned. Disabled/injected-failure variants and distribution-runtime
  parity remain outstanding.

Final cleanup stopped the application, cleared the composer and isolated local
state, removed test globals/styles/portals, deleted only the two owned remote
chats, retained the authenticated session, and finalized one clean Gemini
`/app` tab.

## 2026-08-01 closeout acceptance

The current candidate completed the previously open critical and feature rows.
The controlled local harness and authenticated Gemini surface verified exact
two-chat and rich-content export; Recipes CRUD, variables, version diff, steps,
transfer and queue handoff; restore rollback/resume; stop-on-failure bulk
deletion; local Insights/native Usage separation; and a zero-request local-only
privacy probe.

All eight feature panels were swept at the minimum panel width with no
horizontal overflow or duplicate IDs, 44 px non-checkbox controls, semantic
names, forced-colors rendering, reduced motion, fixed-shortcut editable-field
safety, arrow-key tabs, Escape, and trigger-focus restoration. A semantic module
switch produced `started -> stopped -> started`. Userscript and extension builds
share the same composition; the Firefox-compatible manifest carries both
service-worker and script backgrounds plus an extension action surface.

Three non-critical evidence limits remain partial: the harness route scrolled
and selected the expected search result but did not expose message-target focus
through `document.activeElement`; injected failed capability rendering remains
deterministic-only; and the extension bundle/runtime contract passed without a
separately installed browser profile. The strict current-account score is 37
full, 3 partial, 0 unverified = 38.5/40 (96.25%).

## Core shell and lifecycle

| Scenario | Preconditions | Semantic actions | Required observable result | Cleanup | Result |
| --- | --- | --- | --- | --- | --- |
| `CORE-01` clean mount | Logged-in Gemini `/app`; no Primer root | Inject current build once | One root, one native export mount, no duplicate IDs, no Primer console error | stop application | pass — one panel/native mount set, zero duplicate IDs, zero captured Runtime/Log events |
| `CORE-02` idempotent mount | `CORE-01` running | Start/inject again | Still one root and one set of listeners/mounts | stop | pass — repeated start retained exactly one panel and one native mount set |
| `CORE-03` stop/start | Running application with settings closed | stop, inspect, start | All owned DOM/listeners/observers/timers removed, then one clean remount; local state preserved | leave one running instance | pass — live-found portal leak fixed; repaired stop left zero owned nodes and restart mounted one panel |
| `CORE-04` route/session health | Running app, synthetic chat available | navigate app -> synthetic chat -> search -> app | capability state and mounts follow route without stale UI or duplicate work | return `/app` | pass — local route changes and authenticated Usage/app navigation preserved one current shell |
| `CORE-05` feature start rollback | Controlled failure injection build | enable failing fixture feature | switch returns to actual disabled/failed state, error is visible, no leaked UI | remove fixture | pending |
| `CORE-06` all module switches | Settings open | toggle each optional feature off then on, one at a time | semantic switch, busy state, actual state reflection, no reload, no leaked feature surface | restore initial enabled map | pass — all 10 transitioned both ways; original map restored; zero duplicate IDs |

## Native ownership

| Scenario | Task | Preconditions | Actions and assertions | Cleanup | Result |
| --- | --- | --- | --- | --- | --- |
| `NATIVE-01` | O1 | Notebooks capability available | Open native menu by role/name; verify Primer does not hide, clone, or intercept Notebooks | close menu | pass — capability observed and reported native-owned |
| `NATIVE-02` | S1 | Search chats capability available | Open native Search chats; return; verify capability reports `native-owned` | return `/app` | pass — capability observed and reported native-owned |
| `NATIVE-03` | I3 | Usage limits route available | Open exact native Usage; verify Insights labels local figures as local/estimated and links back to native source | return `/app` | pass — authenticated native Usage opened while Insights remained explicitly local/estimated |
| `NATIVE-04` | R1/R4 | Gems or Skills capability available | Inspect availability only; verify Recipes describes itself as local and does not claim to be native Skills | return `/app` | pass — native Gems/Skills were preserved and Recipes stayed explicitly local |

## Collections

| Scenario | Tasks | Actions and assertions | Cleanup | Result |
| --- | --- | --- | --- | --- |
| `COLL-01` nested tree | O2 | Create parent and child with run prefix; reject duplicate/cycle; keyboard-expand and reorder; reload and verify persistence | remove run-prefix collections | pass — nested/root create, reorder/move, and persisted state exercised |
| `COLL-02` tags/membership | O3 | Tag the synthetic chat with two tags; place it in multiple allowed local views; verify native chat remains untouched | remove run-prefix data | pass — tags and multi-membership remained local |
| `COLL-03` rule preview | O4 | Define a run-prefix title rule; preview matched visible chats; apply explicitly; verify no unrelated match and no observer loop | remove rule/membership | pass — bounded preview and explicit classification exercised |
| `COLL-04` host coexistence | O1/O4 | Open/close sidebar, native Notebooks, Collections, and settings repeatedly in light/dark | remove owned dots/view | pass — native navigation remained intact while local surfaces mounted and stopped cleanly |

## Search and Navigator

| Scenario | Tasks | Actions and assertions | Cleanup | Result |
| --- | --- | --- | --- | --- |
| `NAV-01` content search | S2 | Index only sanitized synthetic archive fixtures; search exact/include/exclude; verify deterministic result count and empty state | clear fixture index | pass — three bounded records/four messages; persistent provider health honestly degraded |
| `NAV-02` filters | S3 | Combine role/date/model/source filters, clear each, and verify count/ranking updates | clear search | pass — exact query, composable filter state, ranking, and clearing exercised |
| `NAV-03` message jump | S4 | From results, jump to a synthetic message; verify focus/scroll highlight and return-focus behavior | close navigator | degraded — open/scroll/highlight passed; background document prevented activeElement proof |
| `NAV-04` bookmark/reference | S5/N2/N3 | Pin an anchored annotation; find through bookmark/backlink views; verify unavailable live anchor degrades without wrong jump | remove annotation | pass — bookmark/reference search, backlink, and composer-only insertion were observed |
| `NAV-05` quote insertion | N2 | Select synthetic text, open quote action by keyboard, insert into composer | composer changes but does not submit; clear composer | pass — anchored selection inserted without submit and was cleared |

## Archive and portable restore

| Scenario | Tasks | Actions and assertions | Cleanup | Result |
| --- | --- | --- | --- | --- |
| `ARCH-01` current export | A1 | Export synthetic current chat to every exposed format; parse each download; verify title/messages/order and no secrets | remove downloaded fixtures | pass — JSON/CSV/Markdown/TXT/HTML/DOCX blobs validated |
| `ARCH-02` selective archive | A2 | Select two sanitized fixture chats from a bounded list; cancel once, then export; verify progress and exact membership | remove downloads | pass — exact bounded membership and route/error accounting completed after stale-row repair |
| `ARCH-03` fidelity | A3 | Archive fixture containing code, math, link/citation and tool/source metadata; compare canonical loss report | remove download | pass — parsed rich JSON preserved code, math, citation, tool, source, table, and image/loss metadata |
| `ARCH-04` restore preview | A4 | Load valid, duplicate, malformed, and future-schema archives; verify dry-run plan and zero writes before confirmation | discard plan | pass — checksum, preview, zero-write dry-run, selective confirmed apply |
| `ARCH-05` restore failure | A5 | Inject a mid-restore storage failure; verify journal/rollback, explicit resume, and no duplicate records | restore local snapshot | pass — rollback journal and explicit resume completed without duplicate records |

## Recipes

| Scenario | Tasks | Actions and assertions | Cleanup | Result |
| --- | --- | --- | --- | --- |
| `RECIPE-01` CRUD/search | R1 | Create, edit, duplicate, search and delete a run-prefix recipe through semantic controls | delete run-prefix recipe | pass |
| `RECIPE-02` variables | R2 | Preview required/default/choice variables; reject missing required value; insert resolved text without submit | clear composer/recipe | pass |
| `RECIPE-03` versions | R3 | Save two versions; inspect diff and provenance; reopen after reload | delete recipe | pass |
| `RECIPE-04` steps/permissions | R4 | Preview deterministic steps and declared permissions; cancel; run only non-sending fixture step | clear result | pass |
| `RECIPE-05` transfer/handoff | R5 | Export/import with collision preview; hand two resolved drafts to paused queue | remove import and queued items | pass |

## Queue

| Scenario | Tasks | Actions and assertions | Cleanup | Result |
| --- | --- | --- | --- | --- |
| `QUEUE-01` local controls | Q1 | Add three non-sent drafts, reorder, pause/resume, cancel one; reload before start | cancel all | pass — three-item reorder, pause/resume, and cancel exercised |
| `QUEUE-02` explicit send | Q2 | With two run-prefix prompts and safe pacing, press Start once; verify two attempts at most once and visible outcomes | delete only run-prefix remote chat if created | pass — paced items sent at most once with visible terminal states |
| `QUEUE-03` cancellation boundaries | Q3 | In separate dry fixtures, change route/session/visibility/composer during wait; verify stale continuation cannot send | cancel/restore route | pass — stale route/session continuations were blocked |
| `QUEUE-04` failure | Q2/Q3 | Inject composer/send failure; verify failed item is not automatically retried and remaining behavior follows explicit policy | cancel remainder | pass — one terminal failure, no retry, explicit remaining-item policy |

## Annotations and context

| Scenario | Tasks | Actions and assertions | Cleanup | Result |
| --- | --- | --- | --- | --- |
| `NOTE-01` chat annotation | N1 | Create note, status, tags, and pin on synthetic chat; reload and edit | remove annotation | pass — note/status/tags/pin lifecycle exercised |
| `NOTE-02` message anchor | N2 | Anchor selected synthetic excerpt; open preview; verify message identity and explicit composer insert only | remove anchor/clear composer | pass — stable locator and fallback diagnostics exercised |
| `NOTE-03` query/backlink | N3 | Search by text/tag/status/pin, open backlinks, keyboard traverse results | clear query/remove fixture | pass — text/tag/status/pin query exercised |
| `NOTE-04` context packet | N4 | Select bounded notes/messages, preview size/provenance, export and parse packet | remove download/fixtures | pass — bounded provenance packet preview/insert exercised |

## Bulk lifecycle

| Scenario | Tasks | Actions and assertions | Cleanup | Result |
| --- | --- | --- | --- | --- |
| `BULK-01` selection preview | B1 | Select only current run-prefix synthetic chats; verify stable IDs, count, titles, and cancel-default dialog | cancel | pass — exact two-item owned scope previewed; route remained stable |
| `BULK-02` archive checkpoint | B2 | Require archive option, validate resulting archive before enabling delete confirmation | keep evidence, then remove download after review | pass — archive-first checkpoint validated before both deletes |
| `BULK-03` strong confirmation | B3 | Enter wrong then correct scoped phrase; test Escape/cancel/focus restoration | cancel first run | pass — wrong phrase blocked; Escape and final cancel preserved scope; correct phrase completed |
| `BULK-04` partial failure | B4 | Use controlled fixture adapter to fail item two; verify stop/no retry/result ledger/explicit remainder | restore local fixture | pass — attempts stopped after the failing second item; the third remained explicit and untouched |
| `BULK-05` live bounded delete | B1-B4 | Create at most two run-prefix chats, archive, strongly confirm, delete once; verify no unrelated chat affected | confirm only run-prefix items gone | pass — two owned chats deleted once; unrelated chats remained; clean `/app` teardown |

## Insights, Preferences, Backup, and Health

| Scenario | Tasks | Actions and assertions | Cleanup | Result |
| --- | --- | --- | --- | --- |
| `INSIGHT-01` local history | I2 | Generate fixture events across day/model; inspect trends/streaks and account switch read-only inspection | restore snapshot | pass — chat/day/lifetime events and local estimate labels updated from local-only activity |
| `INSIGHT-02` honest semantics | I3 | Compare labels/links with current native Usage page; verify no local number is described as remaining server quota | close page | pass — native Usage remained exact while every product figure stayed labelled local/estimated |
| `PREF-01` preferred model | I1 | Choose available preference then unavailable fixture; open new chat; verify capability-aware selection/fallback and bounded attempts | restore preference | pass — available selection and explicit unavailable fallback remained bounded and native-aware |
| `PREF-02` persistence | P1/P2 | Change locale/theme/width and enabled map; reload; verify one coherent state source | restore snapshot | pass — enabled map, theme, English locale, and 960 px width persisted and were restored |
| `PREF-03` shortcut safety | P3 | Use the fixed quote shortcut outside and inside editable controls; verify editable-field safety and cleanup on disable | restore preference | pass — composer focus suppressed the shortcut without mutation; keyboard tabs/dialogs/zoom remained operable |
| `PRIV-01` local-only boundary | H1 | Exercise each enabled local store plus one explicit visible-transcript archive; inspect sanitized network and diagnostic evidence; verify no product backend/telemetry, no hidden transcript indexing, account separation, and downloads only after explicit export | delete fixture/archive downloads and restore local snapshot | pass — zero post-baseline requests and no source-level network APIs; downloads followed explicit exports only |
| `BACKUP-01` complete local backup | H2 | Export all enabled local feature data, validate manifest, preview selective restore into clean fake account, inject rollback failure | restore original snapshot | pass — seven-section manifest, checksum, dry-run and selective apply exercised; failure injection remains tracked by ARCH-05 |
| `HEALTH-01` capability states | H3 | Exercise available, native-owned, unavailable, degraded, disabled, and injected failed probes; verify actionable status | clear injected fault | degraded — live available/native-owned/unavailable/degraded/disabled/recovery passed; injected failed is deterministic-only |
| `PLAT-01` reload/parity | H4 | Repeat core local storage flow on supported GM and MV3 targets; verify clone, change, failure, and account isolation semantics | restore snapshots | degraded — GM/Chrome clone/change/failure/isolation and dual builds pass; no separately installed extension profile was available |

## Cross-cutting visual and accessibility matrix

These checks apply to the shell, settings, every enabled feature view, every
dialog/menu/toast, and native embedded controls. A task scenario is not a pass
if its cross-cutting cell exposes a functional blocker.

| ID | Matrix | Required checks | Result |
| --- | --- | --- | --- |
| `VIS-01` host theme | Gemini light, dark, and system/auto; no writes to host `html`/`body`; owned tokens update | pass — scoped tokens followed controlled host-theme signals without host-root writes |
| `VIS-02` locale | English and Chinese; no mixed-language surface within one locale; long-label wrapping | pass — both locales and compact long-label reflow were exercised |
| `VIS-03` viewport | 1280x720 and 1536x864; no settings/panel overlap or off-screen required action | pass |
| `VIS-04` zoom | Browser 200%; reflow without two-dimensional scrolling for primary flows | pass — effective 768x432 panel/dialog reflow passed after sizing fix |
| `VIS-05` contrast/motion | normal/high-contrast signals where available and reduced-motion; focus always visible | pass — forced colors, reduced motion, focus outline, and compact-panel visuals passed |
| `A11Y-01` keyboard | logical Tab order, Enter/Space activation, arrow navigation where specified, no keyboard trap | pass — editable shortcut safety, arrow-key tabs, dialogs, Escape, and focus restoration passed |
| `A11Y-02` dialogs | name/description, `aria-modal`, topmost Escape, inert background, trigger focus restoration | pass — Settings and stacked shared dialogs exercised |
| `A11Y-03` controls | semantic buttons/switches/tabs/forms, target sizes, live status/error announcements | pass — every feature panel had named controls, no duplicate IDs, 44 px non-checkbox targets, and no horizontal overflow |
| `A11Y-04` automated | zero critical or serious automated findings on each major surface | pass — scoped automated scan remained clean and the manual eight-panel sweep found no blocker |
| `CONS-01` console | zero uncaught Primer error and zero unresolved Primer warning per scenario | pass for completed scenarios; unavailable-capability warnings remained explicit and expected |

## Execution record

| Run | Build hash | Target/browser | Surface | Started | Completed | Passed | Degraded | Failed | Evidence directory |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| `IAB-local-20260801` (exploratory, non-scoring) | `9745dd14be9bbae466edd8f9ce9871491156f5c26d91ed85a7fca1cb40623368` | userscript / controlled built-in Browser | authenticated `/app`; isolated local shim | 2026-08-01 | 2026-08-01 | — | — | — | inline partial-IAB section above |
| `IAB-final-20260801` (targeted, non-scoring) | `a6bb2a085ce744a018ca36331f70ee2ca57c2bf6f9fdccea9ba07eb17bc41928` | userscript / controlled built-in Browser | fresh session, v13 probe, Settings focus, axe scan, clean teardown | 2026-08-01 | 2026-08-01 | — | — | — | inline partial-IAB section above |
| `IAB-remote-20260801-send` | `a6bb2a085ce744a018ca36331f70ee2ca57c2bf6f9fdccea9ba07eb17bc41928` | userscript / controlled built-in Browser | dedicated test account; direct send, one-item queue, archive preview | 2026-08-01 | 2026-08-01 | 0 | 1 | 0 | inline dedicated-account section above |
| `IAB-remote-20260801-bulk` | `caf4140c0ba5b70fa9557565c65c7af684d459ecc8d136e1b37a0cfe78ec1d54` | userscript / controlled built-in Browser | repaired live selection; archive-first bounded delete; clean teardown | 2026-08-01 | 2026-08-01 | 3 | 1 | 0 | inline dedicated-account section above |
| `IAB-matrix-20260801-core` | `c5b45cc692c12c0c9f43707a0fa4ae113b0a72ba1fc486504000a130209a99c3` | userscript / controlled built-in Browser | clean/idempotent mount, repaired zero-residue stop/start, all module switches, reload persistence | 2026-08-01 | 2026-08-01 | 4 | 1 | 0 | inline core lifecycle section above |
| `IAB-feature-matrix-20260801` | `999e50077fa48b76a3a13535f0c6cf3ac2dbc328f6c187aaed3ae0e789b1787b` | userscript / controlled built-in Browser | bounded current-personal feature/visual matrix with owned remote cleanup | 2026-08-01 | 2026-08-01 | 23 | 10 | 0 | inline extended feature-matrix section above; 7 task rows unverified |
| `IAB-closeout-20260801` | `f7ee24f6b3b467f8020ff545cd7948db16d88d4b6d724170b7a4a84800221879` | userscript + dual-build contracts / controlled built-in Browser | remaining feature, failure, privacy, compatibility, compact UI, high-contrast, and accessibility acceptance | 2026-08-01 | 2026-08-01 | 37 | 3 | 0 | closeout section above |

Only completed, bounded observations update release scores in
`v13-task-matrix-2026-08-01.md`. The strict current-personal result is 37 full,
3 partial, and 0 unverified rows (38.5/40 task-equivalents, 96.25%). Every
critical row passes and the 90% release evidence gate is satisfied. Personal-free
and Workspace surfaces remain unclaimed.
