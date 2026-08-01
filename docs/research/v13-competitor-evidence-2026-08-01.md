# Primer++ v13 Competitor Evidence — 2026-08-01

This is a dated primary-listing snapshot used to define the task benchmark. It
does not treat store copy as proof that a feature is reliable, private, safe,
or compatible with the current Gemini DOM.

## Current direct benchmarks

| Product | Current listing snapshot | Claimed Gemini-relevant task coverage | Product boundary learned |
| --- | --- | --- | --- |
| [AI Toolbox](https://chromewebstore.google.com/detail/ai-toolbox-folders-prompt/jlalnhjkfiogoeonamcnngdndjbneina) | v5.0.24; updated 2026-07-28; about 40,000 users; 2.54 MiB | Full-content search with role/date/exact/include/exclude filters and message jump; nested folders and rules/tags; message bookmarks; context references and a context-window estimate; prompt variables; single/bulk export; bulk delete | Strongest breadth benchmark. Some organizational metadata is described as backend-synced and some long-context operations use a backend, so Primer++ should compete on transparent local-first boundaries rather than copy its architecture. |
| [Voyager](https://chromewebstore.google.com/detail/voyager/iifacdnjakkhjjiengaffnegbndgingi) | v1.6.0; updated 2026-07-19; about 100,000 users; 2.81 MiB | Clickable message timeline, previews and starred messages; folders/subfolders with drag/drop; prompt tags/search/import/export; JSON history export with metadata; adjustable reading width | Establishes timeline/navigation as a first-class task, not a cosmetic extra. Its listing also has broad data-handling disclosures, so the store's privacy slogan is not sufficient evidence by itself. |
| [Superpower for Gemini](https://chromewebstore.google.com/detail/superpower-for-gemini-fol/ahmdidjajeicoopcdpablhecokaepofl) | v1.4.7; updated 2026-07-23; about 10,000 users; 2.6 MiB | Modular toggles; folders and trash/restore; queue; prompt library/chains; bulk operations; model preference; notes; references; shortcuts; Drive sync; local usage-counter claims | Confirms demand for queue, recovery, references, notes, preferences, and modular control. Its claim to track the real quota is not adopted: Primer++ must label local counts as local/estimated and defer exact limits to Gemini's native Usage page. |
| [Gemini Folders](https://chromewebstore.google.com/detail/gemini-folders-organize-c/jffchdehoapigpmifkmleglfimjiilik) | v4.5.4; updated 2026-07-27; about 1,000 users; 175 KiB; 43 listed languages | Folder/prompt modes; prompt search/sort/pin/injection; keyboard trigger; quick save; multi-select; drag/drop; native tab groups; optional bookmark/mobile mirror; sync/JSON backup | Demonstrates that a focused implementation can remain small. It also provides useful safety benchmarks: hardened backup imports, surfaced storage failures, keyboard accessibility, and no mandatory account/server. |
| [AI Chat Exporter](https://chromewebstore.google.com/detail/ai-chat-exporter-gemini-t/jfepajhaapfonhhfjmamediilplchakk) | v4.0.0; updated 2026-07-15; about 50,000 users; 586 KiB | PDF, Markdown, text, CSV, and JSON; per-message selection; timestamp and PDF layout options; code, math, table/chart, and thinking-content claims | Sets the rich-content and export-customization bar. Primer++ uses an open canonical archive and explicit loss reporting; format count alone is not fidelity. |
| [Toolbox for Gemini](https://chromewebstore.google.com/detail/toolbox-for-gemini-folder/cbdpdhfnjbkjphmminnkfbeekodlphlp) | v1.4.2; updated 2026-05-21; about 5,000 users; 1.24 MiB | Nested folders; multiple export formats; image gallery; pinned messages; prompt library/chaining/enhancement; word counter; bulk management; shortcuts | Useful secondary evidence for pinned-message navigation, media-aware export, and keyboard workflows. AI prompt enhancement and image tooling are not core Primer++ goals because Gemini already owns generation. |

Versions, dates, user counts, sizes, features, pricing boundaries, and privacy
disclosures above are vendor/store facts as displayed on 2026-08-01. They may
change independently of this repository.

## Current official Gemini boundary

- [Gemini Notebooks](https://support.google.com/gemini/answer/16972047?hl=en)
  already provide project spaces with sources, instructions, continuous chat,
  chat membership, rename/pin/delete, and synchronized notebook management.
  Google's current help page limits this surface to personal accounts and says
  work/school accounts are not supported. Collections therefore coexist with
  Notebooks and remain capability-gated; they never hide or impersonate them.
- [Gemini Spark](https://support.google.com/gemini/answer/17094507?hl=en) owns
  ongoing tasks, schedules, skills, Connected Apps, and local/remote browser
  automation. The current official requirements include a personal account,
  Pro or Ultra, age and region constraints, and enabled activity. Primer++'s
  Queue is only an explicit local draft sender; it is not a scheduler or Spark
  replacement.
- [Gemini usage limits](https://support.google.com/gemini/answer/16275805?hl=en)
  are compute-based, model/feature/chat dependent, and may change. The current
  help page describes five-hour refreshes until a weekly limit and directs
  users to the native Usage Limits surface for exact status. Insights therefore
  reports local activity/trends and links to native limits; it never labels a
  DOM-derived count as Google's remaining quota.

These official facts agree with the current logged-in surface observed during
this run. Availability is still account-, plan-, locale-, region-, age-, and
rollout-dependent, so the adapter reports capabilities rather than assuming a
single universal Gemini UI.

## Benchmark synthesis

The overlapping market center is:

1. organization: nested folders/collections, tags, ordering, and bulk move;
2. retrieval: full-text search, filters, message jump, timeline, and bookmarks;
3. portability: selective single/bulk export with rich-content fidelity;
4. reusable work: prompt variables, versions or chains, quick insertion;
5. execution: visible queue state, pacing, cancel, and safe failure behavior;
6. context: message anchors, notes, references, and bounded handoff packets;
7. lifecycle: previewable bulk actions, archive/recovery, and no duplicate retry;
8. customization: module switches, width/theme/shortcuts, and accessible UI;
9. trust: local-first storage, backup validation, compatibility health, and
   clear native-versus-estimated usage semantics.

The 40 rows in `v13-task-matrix-2026-08-01.md` deliberately decompose this
center into independently testable outcomes. Marketing-only extras such as
watermark removal, generic webpage automation, hidden prompt optimization,
host decluttering, and reimplementations of Gemini generation modes do not add
release points.

## Decisions driven by the snapshot

- Add timeline, message jump, bookmarks, role/date/model/source filters, and
  include/exclude search to the durable Navigator boundary.
- Treat archive fidelity for code, math, citations, tables, media metadata, and
  thinking/tool metadata as a critical row with an explicit loss report.
- Keep Recipes open, versioned, permission-described, and local. Native
  Gems/Skills remain native-owned.
- Keep the Queue explicit and observable. Automatic prompt chaining cannot
  silently send or retry.
- Preserve recovery before optimizing bulk-operation speed.
- Publish no exact quota claim derived from DOM activity or local counters.
- Use installed/built size and responsibility budgets as architecture signals;
  moving a giant legacy file into a new folder is not a refactor.
- Prefer an auditable local backup schema over mandatory cross-device backend
  sync. Optional sync can be considered only after local restore is proven.

## Evidence limitations

- Store listings are provided by vendors and may describe premium or
  platform-specific behavior not available on every account.
- User counts and ratings are popularity signals, not quality measurements.
- No competitor extension was installed into the user's browser or granted
  account access during this work.
- Reliability, DOM compatibility, accessibility, and privacy claims require
  separate code/runtime evidence and are not inferred from the listing.
