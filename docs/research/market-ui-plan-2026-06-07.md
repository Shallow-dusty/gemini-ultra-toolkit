# Market and Gemini UI Planning Snapshot - 2026-06-07

This snapshot turns current external evidence into the v12.x/v13 development
plan. It is intentionally dated: Gemini's UI and the extension market are both
mutable, so refresh this file before any major release or store submission.

## Scope and Verification State

- Local git state is mutable; run `git status --short --branch` before release,
  push, or store submission instead of treating this snapshot as live git truth.
- Local verification on 2026-06-08:
  - `npm test` passed: 242 tests, `lib/` at 100% c8 coverage.
  - `npm run build` passed for userscript and extension outputs; generated
    userscript size was ~468.2 kb after HTML transcript export, adapter probe
    export, pinned context packets, and broader i18n hardening.
- 2026-06-08 follow-up: `brace-expansion` was updated from `5.0.5` to
  `5.0.6`; `npm audit --audit-level=moderate` now reports 0 vulnerabilities.
- Live Gemini DOM verification was not refreshed: no Chrome DevTools Protocol
  Gemini page was available at `127.0.0.1:63366`. Treat the 2026-05-21 DOM probe
  as the last real-browser evidence, not as proof of current compatibility.

## External Evidence

### Gemini Product and UI Direction

Sources:

- Google Gemini Apps release notes:
  <https://gemini.google/us/release-notes/?hl=en>
- Google Blog, "The Gemini app becomes more agentic, delivering proactive,
  24/7 help":
  <https://blog.google/innovation-and-ai/products/gemini-app/next-evolution-gemini-app/>

Current Gemini direction is broader than a chat UI:

- 2026-05-19: Gemini Spark adds an agent tab and moves Gemini toward proactive
  task execution.
- 2026-05-19: Google's Gemini app post describes a redesigned Gemini
  experience with the Neural Expressive design language, inline Gemini Live,
  richer response layouts, Daily Brief, Gemini Omni, and Gemini Spark.
- 2026-05-19: Gemini 3.5 Flash is available globally through the model dropdown.
- 2026-05-19: Gemini responses are becoming richer and more interactive under
  the Neural Expressive design language, with multi-layer images, video
  overviews, timelines, and modality-specific response layouts.
- 2026-05-19: Gemini can connect to apps such as OpenTable, Canva, and Instacart.
- 2026-03-26: Gemini can import personal context and chat history from other AI
  apps; "past chats" are being renamed to "memories".
- 2026-01-28: Gemini in Chrome adds a side-panel assistant and previews auto
  browse for Pro/Ultra users in the US.
- 2025-08-21: Gemini already has built-in chat-history search globally on web
  and mobile.
- 2025-05-20: Canvas can generate dynamic content, web pages, prototypes, and
  session-persistent apps.

Implication: Primer++ should stop planning around "missing sidebar basics"
alone. The durable opportunity is a local-first power-user control layer that
survives richer response layouts, agent tabs, Canvas, memories, and connected
apps.

### Gemini-Specific Competitors

Sources:

- Superpower for Gemini, Chrome Web Store:
  <https://chromewebstore.google.com/detail/superpower-for-gemini/ahmdidjajeicoopcdpablhecokaepofl>
- Toolbox for Gemini, Chrome Web Store:
  <https://chromewebstore.google.com/detail/gemini-toolbox/cbdpdhfnjbkjphmminnkfbeekodlphlp>

Chrome Web Store pages were fetched again on 2026-06-08. Counts and detail-page
update dates below are official store-page values, not third-party mirror values;
refresh them before quoting the snapshot in store copy.

Observed market signals:

- Superpower for Gemini is the strongest direct benchmark: 10,000 users, updated
  2026-06-02, with folders, daily limit counter, PDF/DOCX/TXT/MD export, message
  queue, prompt library, prompt chains, slash commands, default model, notes,
  chat referencing, Google Drive sync, shortcuts, and input counter.
- Toolbox for Gemini is a focused direct competitor: 5,000 users, updated
  2026-05-21, with folders/subfolders, PDF/HTML/Markdown/TXT/CSV export, image
  gallery, pinned messages, prompt library, AI prompt enhancer, send-to-Gemini,
  word counter, and bulk management.

Direct competitive gap:

- Primer++ already covers counter, folders, prompt vault, default model, batch
  delete, quote reply, UI tweaks, heatmap, and export.
- Primer++ still trails the top competitors on PDF/DOCX export, image gallery,
  server-side trash/restore, cross-device sync, and deeper queue automation.
  Post-planning selected-chat export, local message queue, per-chat notes,
  local undo for prompts/folders, local JSON import/export for prompts,
  folders, and notes, explicit local Chat Notes reference insertion, and
  visible pinned-note context packets now cover the first parity slice for
  those gaps.
- Primer++ has a stronger local-first story than products that disclose
  analytics, cloud sync, or in-app purchases. Keep this as a product boundary,
  not an afterthought.

### Capability Comparison

Legend: SPG = Superpower for Gemini; TFG = Toolbox for Gemini.

Format: bullet matrix instead of a wide table so the snapshot stays readable in
Codex CLI/TUI.

- Privacy/local-first
  - Primer++ v12: no backend, no telemetry, low permissions.
  - Market signal: SPG offers local/sync claims; TFG says chats stay local but
    discloses anonymous usage analytics.
  - Gemini signal: Gemini itself is account/cloud-native.
  - Plan: keep local-first as a hard product boundary and listing differentiator.
- Organization
  - Primer++ v12: folders, colors, pinning, search, drag reorder, batch move,
    auto-rules, local undo, and JSON import/export.
  - Market signal: SPG has native folders/sidebar management; TFG has folders
    and subfolders.
  - Gemini signal: Gemini has built-in chat-history search on web/mobile.
  - Plan: folders and first-pass notes/references are parity now; keep live
    compatibility checks current before expanding context packets.
- Quota visibility
  - Primer++ v12 plus post-planning implementation: daily counter, model
    weighting, heatmap, streaks, and configured daily reset-window framing.
  - Market signal: SPG frames 5-hour and weekly usage; TFG is more word-count
    oriented.
  - Gemini signal: Gemini exposes tiers but not detailed personal accounting.
  - Plan: keep quota as a core differentiator; daily reset-window framing is
    done, while true 5-hour/weekly rolling windows require per-message
    timestamps before they can be implemented honestly.
- Export
  - Primer++ v12 plus post-planning implementation: usage export in
    JSON/CSV/Markdown and current visible conversation transcript export in
    JSON/Markdown/TXT/HTML, plus selected-sidebar chat export in
    JSON/Markdown/TXT/HTML through a navigation-and-visible-DOM capture
    workflow.
  - Market signal: SPG has PDF/DOCX/TXT/MD; TFG has
    PDF/HTML/Markdown/TXT/CSV.
  - Gemini signal: Gemini built-ins remain limited for power export workflows.
  - Plan: repeat live Gemini smoke coverage for selected-chat export before
    release claims; consider PDF/DOCX only after dependency and bundle-size
    review.
- Prompt workflow
  - Primer++ v12 plus post-planning implementation: Prompt Vault, quick insert,
    versioned metadata import/export, favorites, recent ranking, slash
    shortcuts, template variables, local prompt chains, and chain handoff into
    Message Queue as separate local queue items.
  - Market signal: SPG has library, chains, slash commands; TFG has library and
    prompt enhancer.
  - Adjacent signal: mature ChatGPT extensions treat prompt management as a
    platform feature.
  - Plan: chain-aware queue preparation is done; keep broader execution claims
    behind Message Queue's explicit start control and live tool-mode checks.
- Send control
  - Primer++ v12 plus post-planning implementation: Ctrl+Enter tweak, default
    model, and a local message queue with pause/cancel/reorder controls plus a
    conservative active-tool-mode pause guard. Prompt Vault chains can be added
    as ordered queue items before sending.
  - Market signal: SPG has smart queue and shortcuts; TFG has shortcuts and
    send-to-Gemini.
  - Gemini signal: Gemini is adding agent/tool modes where auto-send risk rises.
  - Plan: local adapter probe export now records active tool-mode state and
    visible tool-mode entry candidates when available; broaden live queue
    execution checks before claiming current Gemini DOM coverage.
- Notes/references
  - Primer++ v12 plus post-planning implementation: quote reply plus local
    per-chat notes and pins with JSON import/export, and explicit local
    reference insertion for saved titles, links, chat IDs, notes, and visible
    pinned-note context packets.
  - Market signal: SPG has notes/chat referencing; TFG has pinned messages.
  - Gemini signal: Gemini renamed past chats to memories and adds app
    connections.
  - Plan: continue toward broader context packets without mirroring Gemini
    memories or reading hidden transcript content.
- Rich responses/media
  - Primer++ v12: no image gallery or Neural Expressive handling.
  - Market signal: TFG has image gallery; SPG is not primarily media-positioned.
  - Gemini signal: Gemini is moving to richer layouts and modality-specific
    responses.
  - Plan: add adapter probes for rich response zones before media features.
- Bulk safety
  - Primer++ v12 plus post-planning implementation: batch delete, local Prompt
    Vault delete undo, and one-step local folder move/delete undo.
  - Market signal: SPG positions trash/restore; TFG has bulk management and
    protected folders.
  - Gemini signal: Gemini delete remains server-side and risky to automate.
  - Plan: keep local undo conflict-safe; avoid promising server-side restore.
- UI resilience
  - Primer++ v12: primary adapter covers most Gemini DOM paths; a static smoke
    check now blocks new Gemini selector literals outside the adapter.
  - Market signal: competitor internals are unknown.
  - Gemini signal: Gemini UI churn is frequent.
  - Plan: keep adapter health visible; exportable local probe reports now exist,
    but live probe coverage still needs a logged-in Gemini page.

### Adjacent AI Workspace Benchmark

Source:

- Superpower Chat, Chrome Web Store:
  <https://chromewebstore.google.com/detail/superpower-chatgpt/amhmeenmapldpjdedekalnfifgnpfnkc>

Superpower Chat shows the mature end-state for AI chat enhancement: the Chrome
Web Store listing shows 100,000 users, while the listing copy says it is trusted
by over 400,000 people. Its feature set includes folders/subfolders, bulk
export/delete/archive, notes, prompt manager, prompt optimizer, prompt chains,
prompt templates, image gallery, conversation references, minimap, model
switcher, timestamps, copy modes, custom instruction profiles, auto-splitter,
and broad shortcut support.

Implication: Primer++ should not try to match every broad ChatGPT-extension
feature. The practical direction is a smaller Gemini-native control layer with
high reliability, low permissions, and no remote service dependency.

## Strategic Position

Recommended positioning:

> Primer++ is the local-first Gemini workspace layer for operators who need
> counting, organization, prompt reuse, export, and low-friction control without
> sending chat content or private workflow data to an extension backend.

Do not compete by becoming a cloud-synced AI platform. Compete by being:

- reliable under Gemini UI churn;
- transparent about local storage and no chat-content exfiltration;
- dense enough for daily power use without becoming a noisy control panel;
- publishable as both userscript and extension.

## Development Plan

### Phase 0 - Release Hygiene and Reality Check

Goal: make the current v12 baseline truthful and publishable again.

1. ~~Update `brace-expansion` from `5.0.5` to `5.0.6`, then update the smoke
   test that currently pins `5.0.5`.~~ Done on 2026-06-08.
2. ~~Refresh `docs/PROJECT_STATUS.md` and `docs/audits/CURRENT_AUDIT_STATUS.md`
   after audit passes.~~ Done on 2026-06-08.
3. ~~Fix store-listing screenshot filenames or regenerate screenshots that match
   the listing instructions.~~ Done on 2026-06-08.
4. Run a fresh live Gemini smoke test through CDP before any store submission.
5. Record the live probe date and the account/locale/browser path used.

Exit gate: `npm test`, `npm run build`, `npm audit --audit-level=moderate`, clean
git status, and one live Gemini smoke run.

### Phase 1 - Adapter and UI-Churn Hardening

Goal: make "Gemini changed again" a contained adapter task.

1. ~~Move remaining Gemini-dependent CSS selectors and event filters into
   `GeminiAdapter` helpers or an adapter-owned selector catalog.~~ Done after
   this planning snapshot.
2. ~~Add static smoke checks that fail when Gemini selectors appear outside
   `src/adapters/gemini.js` without an explicit exception.~~ Done after this
   planning snapshot.
3. Extend the CDP probe scripts to capture:
   - ~~model switcher state;~~ covered by the adapter probe export helper;
   - ~~sidebar chat rows and row actions;~~ covered by the adapter probe export
     helper as counts/action presence, without exporting titles;
   - ~~input editor and send button;~~ covered by the adapter probe export
     helper;
   - ~~chat header/export anchor;~~ covered by adapter/local-UI presence flags;
   - ~~Canvas/Spark/tool-mode entry points when visible.~~ The report records
     active tool-mode state and visible entry candidates when the adapter can
     detect them; logged-in live proof is still required.
4. ~~Add a small "selector health" debug panel that reports which adapter probes
   currently pass in the live page.~~ Done after this planning snapshot.

Exit gate: adapter probe report can be exported from a live Gemini page, and
the static selector-leak smoke check remains passing. Local export plumbing is
implemented; logged-in live proof remains pending.

### Phase 2 - Power-User Workflow Parity

Goal: close the highest-value competitor gaps while keeping the local-first
boundary.

1. Message queue:
   - ~~queue multiple prompts while Gemini is generating;~~ local queue shipped
     after this planning snapshot;
   - ~~support pause/cancel/reorder;~~ done after this planning snapshot;
   - active-tool-mode pause guard shipped after this planning snapshot; broaden
     live probes before claiming full ambiguous-mode coverage.
2. Prompt vault upgrade:
   - ~~slash shortcut insertion;~~ done after this planning snapshot;
   - ~~prompt chains;~~ done after this planning snapshot;
   - ~~variable placeholders;~~ done after this planning snapshot;
   - ~~recent prompts and favorites;~~ done after this planning snapshot;
   - ~~compatible import/export for prompt metadata.~~ done after this planning
     snapshot.
3. Per-chat notes and pins:
   - ~~store local notes keyed by chat ID;~~ done after this planning snapshot;
   - ~~pin important messages/sections locally without modifying Gemini
     data;~~ done after this planning snapshot;
   - ~~expose quick navigation in the panel;~~ done after this planning
     snapshot;
   - explicit local reference insertion and pinned-note packet insertion shipped
     after this planning snapshot; they format local title/link/chat ID/note
     data into the composer and do not read hidden Gemini transcript content.
4. Bulk export upgrade:
   - ~~export selected chats in JSON/Markdown/TXT/HTML first~~ done with a
     selected-sidebar navigation workflow; live smoke still pending;
   - add PDF/DOCX only after a dependency and bundle-size review.
5. Undo/trash safety for local operations:
   - ~~undo folder moves/deletes~~ done with a one-step local restore action;
   - ~~undo local prompt deletes~~ done with a Prompt Vault one-step restore
     action;
   - do not promise recovery for Gemini server-side chat deletes unless the
     deletion path can be intercepted before confirmation.

Exit gate: one new workflow ships with tests, live smoke coverage, and updated
store screenshots.

### Phase 3 - Gemini-Native Context Control

Goal: differentiate from generic folder/export extensions.

1. Local context packets:
   - first-pass Chat Notes references shipped after this planning snapshot for
     saved notes, titles, links, and chat IDs;
   - ~~create reusable bundles from selected notes and chat links;~~ visible
     pinned-note packets now package the pinned list without transcript reads;
   - create reusable bundles from selected prompts and exported snippets;
   - insert them into Gemini via explicit user action.
2. Chat referencing without server storage:
   - ~~insert a local chat reference or note into the composer;~~ done as an
     icon-button action after this planning snapshot;
   - include title/date/link plus optional local notes, not full hidden chat
     content unless user explicitly exports/selects it.
3. Memory migration helper:
   - ~~support local export/import of Primer++ prompt vault, folders, and
     notes~~ done with versioned JSON import/export for all three local data
     sets;
   - do not try to mirror Gemini's own "memories" feature.
4. Tool-mode awareness:
   - canonical matching for Canvas, Deep Research, Image, Video, Audio Overview,
     Spark, and localized labels is now covered by pure unit tests;
   - disable incompatible automations and explain status in the debug panel;
   - live visible-entry probes are still required before claiming current
     Gemini DOM coverage.

Exit gate: context features never read or transmit chat body content without a
user action, and tool-mode detection prevents unsafe auto-send/export behavior.

## Deferred or Explicitly Rejected

- Remote analytics or backend sync.
- Google Drive sync as a default path; revisit only if local-first publishing is
  stable and the permission story remains clear.
- AI prompt enhancer that sends prompt text to a third-party model.
- Broad multi-platform support beyond Gemini.
- A generalized storage abstraction unless a real migration requires it.

## Next Refresh Triggers

Refresh this snapshot when any of these happen:

- Gemini ships a visible UI rewrite or new tool-mode tab.
- A live CDP probe fails on one or more injection zones.
- A direct competitor changes its store listing materially.
- Store submission is ready.
- v13 planning starts.
