# Market and Gemini UI Planning Snapshot - 2026-06-07

This snapshot turns current external evidence into the v12.x/v13 development
plan. It is intentionally dated: Gemini's UI and the extension market are both
mutable, so refresh this file before any major release or store submission.

## Scope and Verification State

- Local checkout: `main` is aligned with `origin/main` and clean at the time of
  this snapshot.
- Local verification on 2026-06-07:
  - `npm test` passed: 146 tests, `lib/` at 100% c8 coverage.
  - `npm run build` passed for userscript and extension outputs.
- 2026-06-08 follow-up: `brace-expansion` was updated from `5.0.5` to
  `5.0.6`; `npm audit --audit-level=moderate` now reports 0 vulnerabilities.
- Live Gemini DOM verification was not refreshed: no Chrome DevTools Protocol
  Gemini page was available at `127.0.0.1:63366`. Treat the 2026-05-21 DOM probe
  as the last real-browser evidence, not as proof of current compatibility.

## External Evidence

### Gemini Product and UI Direction

Source: Google Gemini Apps release notes,
<https://gemini.google/us/release-notes/?hl=en>.

Current Gemini direction is broader than a chat UI:

- 2026-05-19: Gemini Spark adds an agent tab and moves Gemini toward proactive
  task execution.
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

Chrome Web Store pages were fetched again on 2026-06-08. Counts and update dates
below are store-page values, not third-party mirror values.

Observed market signals:

- Superpower for Gemini is the strongest direct benchmark: 10,000 users, updated
  2026-06-03, with folders, daily limit counter, PDF/DOCX/TXT/MD export, message
  queue, prompt library, prompt chains, slash commands, default model, notes,
  chat referencing, Google Drive sync, shortcuts, and input counter.
- Toolbox for Gemini is a focused direct competitor: 5,000 users, updated
  2026-05-22, with folders/subfolders, PDF/HTML/Markdown/TXT/CSV export, image
  gallery, pinned messages, prompt library, AI prompt enhancer, send-to-Gemini,
  word counter, and bulk management.

Direct competitive gap:

- Primer++ already covers counter, folders, prompt vault, default model, batch
  delete, quote reply, UI tweaks, heatmap, and export.
- Primer++ is behind the top competitors on message queue, prompt chains/slash
  commands, per-chat notes, bulk export, PDF/DOCX export, pinned messages,
  image gallery, undo/trash, and cross-device sync.
- Primer++ has a stronger local-first story than products that disclose
  analytics, cloud sync, or in-app purchases. Keep this as a product boundary,
  not an afterthought.

### Capability Comparison

Legend: SPG = Superpower for Gemini; TFG = Toolbox for Gemini.

```text
Capability              Primer++ v12 evidence                  Direct Gemini competitors             Gemini / adjacent signal              Planning consequence
----------------------  --------------------------------------  ------------------------------------  ------------------------------------  ------------------------------------
Privacy/local-first     No backend, no telemetry, low perms     SPG offers local/sync claims; TFG      Gemini itself is account/cloud-native  Keep local-first as a hard product
                                                                 says chats stay local but discloses                                         boundary and listing differentiator.
                                                                 anonymous usage analytics
Organization            Folders, colors, pinning, search,       SPG has native folders/sidebar mgr;    Gemini has built-in chat-history       Folders are parity now; move toward
                        drag reorder, batch move, auto-rules     TFG has folders/subfolders             search on web/mobile                  notes, pins, and context packets.
Quota visibility        Daily counter, model weighting,          SPG frames 5-hour and weekly usage;    Gemini exposes tiers but not detailed  Keep quota as a core differentiator;
                        heatmap, streaks                        TFG is more word-count oriented        personal accounting                   add reset-window framing.
Export                  Usage export in JSON/CSV/Markdown;       SPG has PDF/DOCX/TXT/MD; TFG has       Gemini built-ins remain limited for    Ship selected-chat bulk export in
                        chat export remains narrow               PDF/HTML/Markdown/TXT/CSV             power export workflows                JSON/Markdown/TXT before PDF/DOCX.
Prompt workflow         Prompt Vault, quick insert, import/      SPG has library, chains, slash cmds;   Mature ChatGPT extensions treat        Upgrade vault with slash commands,
                        export                                  TFG has library and prompt enhancer    prompt mgmt as a platform feature      chains, placeholders, favorites.
Send control            Ctrl+Enter tweak and default model       SPG has smart queue and shortcuts;     Gemini is adding agent/tool modes      Message queue is high-value parity,
                                                                 TFG has shortcuts and send-to-Gemini   where auto-send risk rises             but must be tool-mode aware.
Notes/references        Quote reply; no durable per-chat notes   SPG has notes/chat referencing; TFG    Gemini renamed past chats to           Add local notes/pins/context packets
                                                                 has pinned messages                    memories and adds app connections      without mirroring Gemini memories.
Rich responses/media    No image gallery or Neural Expressive    TFG has image gallery; SPG is not      Gemini is moving to richer layouts     Add adapter probes for rich response
                        handling                                primarily media-positioned             and modality-specific responses        zones before media features.
Bulk safety             Batch delete; no local undo/trash        SPG positions trash/restore; TFG has   Gemini delete remains server-side       Add undo for local operations first;
                                                                 bulk management/protected folders      and risky to automate                  avoid promising server-side restore.
UI resilience           Primary adapter covers most DOM paths;   Competitor internals unknown           Gemini UI churn is frequent            Make adapter health visible and add
                        known selector leakage remains                                                                                       static selector-leak checks.
```

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

1. Move remaining Gemini-dependent CSS selectors and event filters into
   `GeminiAdapter` helpers or an adapter-owned selector catalog.
2. Add static smoke checks that fail when Gemini selectors appear outside
   `src/adapters/gemini.js` without an explicit exception.
3. Extend the CDP probe scripts to capture:
   - model switcher state;
   - sidebar chat rows and row actions;
   - input editor and send button;
   - chat header/export anchor;
   - Canvas/Spark/tool-mode entry points when visible.
4. Add a small "selector health" debug panel that reports which adapter probes
   currently pass in the live page.

Exit gate: adapter probe report can be exported from a live Gemini page, and
all module injection points are covered by either adapter methods or explicit
exceptions.

### Phase 2 - Power-User Workflow Parity

Goal: close the highest-value competitor gaps while keeping the local-first
boundary.

1. Message queue:
   - queue multiple prompts while Gemini is generating;
   - support pause/cancel/reorder;
   - avoid auto-sending while model/tool mode is ambiguous.
2. Prompt vault upgrade:
   - slash command insertion;
   - prompt chains;
   - variable placeholders;
   - recent prompts and favorites;
   - import/export compatibility with the existing local JSON format.
3. Per-chat notes and pins:
   - store local notes keyed by chat ID;
   - pin important messages/sections locally without modifying Gemini data;
   - expose quick navigation in the panel.
4. Bulk export upgrade:
   - export selected chats in JSON/Markdown/TXT first;
   - add PDF/DOCX only after a dependency and bundle-size review.
5. Undo/trash safety for local operations:
   - undo folder moves and local prompt deletes;
   - do not promise recovery for Gemini server-side chat deletes unless the
     deletion path can be intercepted before confirmation.

Exit gate: one new workflow ships with tests, live smoke coverage, and updated
store screenshots.

### Phase 3 - Gemini-Native Context Control

Goal: differentiate from generic folder/export extensions.

1. Local context packets:
   - create reusable bundles from selected prompts, notes, chat links, and
     exported snippets;
   - insert them into Gemini via explicit user action.
2. Chat referencing without server storage:
   - drag a local chat reference or note into the composer;
   - include title/date/link plus optional local notes, not full hidden chat
     content unless user explicitly exports/selects it.
3. Memory migration helper:
   - support local export/import of Primer++ prompt vault, folders, and notes;
   - do not try to mirror Gemini's own "memories" feature.
4. Tool-mode awareness:
   - detect when Gemini is in Canvas, Deep Research, Image, Video, Audio
     Overview, Spark, or similar modes;
   - disable incompatible automations and explain status in the debug panel.

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
