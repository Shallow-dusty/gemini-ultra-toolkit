# In-app Browser UI harness

This directory provides a deterministic local page for exercising the built
`primer-pp.user.js` through Codex's in-app Browser. It exists because the
Browser's read-only Playwright surface must not inject arbitrary application
code into a real logged-in Gemini page.

The fixture contains no Google account data, cookies, or credentials. Its only
identity is the reserved example address `fixture@example.test`.

## Start

From the repository root, using the same Node.js version used by the project:

```text
node tests/browser/iab-harness-server.mjs
```

The server binds only to `127.0.0.1` and defaults to port `4173`. An explicit
port can be passed as the only argument:

```text
node tests/browser/iab-harness-server.mjs 4317
```

Open this URL in the in-app Browser:

```text
http://127.0.0.1:4173/app/fixture
```

Useful endpoints:

- `/` and `/app/fixture` serve the same harness.
- `/primer-pp.user.js` serves the repository's current final userscript build.
- `/healthz` returns a small JSON readiness response.

The server accepts only `GET` and `HEAD`, validates the loopback Host header,
uses an exact path allowlist, and rejects encoded or dot-segment paths. It does
not expose a general static-file root.

## Fixture behavior

Before `primer-pp.user.js` loads, the page installs a localStorage-backed
userscript host shim for:

- `GM_getValue`, `GM_setValue`, `GM_deleteValue`, and `GM_listValues`;
- `GM_addValueChangeListener` and `GM_removeValueChangeListener`;
- `GM_addStyle`, `GM_registerMenuCommand`, and
  `GM_unregisterMenuCommand`;
- `__flushGMPolyfill`.

All keys are isolated below `__PRIMER_PP_IAB_HARNESS__:`. The banner's
**Reset fixture storage** button clears only that prefix and reloads. By
default, the guided tour and module onboarding are marked seen so they do not
block repeatable feature checks. Append `?firstRun=1` to clear the prefix before
Primer++ loads and exercise first-run UI.

The production URL adapter intentionally accepts current-conversation ids only
on `gemini.google.com`. For this one test route, the harness narrowly maps URL
parsing of its own loopback `/app/fixture` URL to the currently selected virtual
fixture conversation (initially
`https://gemini.google.com/app/fixture-chat-alpha`). Clicking a fixture chat
changes only that virtual id, the selected row, and the local heading. The real
`window.location` stays on `127.0.0.1`, links are still held locally, and the
mapping performs no navigation or network request. This is test scaffolding,
not a production URL compatibility claim.

The fixture's New chat and Temporary chat controls switch the virtual parser to
`https://gemini.google.com/app` so new-chat-only preferences can be exercised;
selecting a recent fixture chat restores a virtual conversation route.

Composer sends, model selection, tool modes, navigation, menu actions, and
sidebar deletion are local simulations. They never contact Gemini. Deleting a
fixture chat removes only its in-memory row; reload to restore it.

Bulk partial-failure checks may call
`__IAB_HARNESS__.setDeleteFailures(['fixture-chat-beta'])` before running the
real Primer++ flow. The matching fixture confirmation records one attempt but
keeps that row in place; `__IAB_HARNESS__.deleteAttempts` exposes only fixture
conversation ids so tests can prove stop/no-retry behavior without account
data or remote deletion.

Explicit fixture exports are intercepted in memory rather than written to the
system Downloads folder. `__IAB_HARNESS__.clearDownloads()` resets the capture,
and `__IAB_HARNESS__.capturedDownloads` exposes filename, MIME type, byte size,
and text for text-based formats so schema and rich-content fidelity can be
asserted without leaving artifacts behind.

## Stable selectors

Harness controls:

- `[data-harness="fixture-root"]`
- `#harness-status`
- `[data-harness-action="toggle-theme"]`
- `[data-harness-action="reset-storage"]`

Current Gemini adapter anchors represented by the fixture:

- `nav[aria-label="Side Navigation"]`
- `[data-test-id="new-chat-button"]`
- `[data-test-id="search-chats-button"]`
- `conversations-list[data-test-id="all-conversations"]`
- `gem-nav-list-item[data-test-id="conversation"] a[href*="/app/"]`
- `[data-test-id="conversation-title"]`
- `[data-test-id="conversation-actions-menu-button"]`
- `[data-test-id="user-query"][data-message-id]`
- `[data-test-id="model-response"][data-response-id]`
- `[data-test-id="bard-mode-menu-button"]`
- `[data-test-id="gem-mode-menu"][role="menu"]`
- `[data-test-id="textarea-inner"] [contenteditable="true"]`
- `button[data-test-id="send-button"]`

The rich response includes code, rendered math metadata, a normal link, a
citation, a source, a tool result, a table, and an image. Native-owned anchors
cover new/temporary chat, Images, Videos, Library, Notebooks, search, Usage
Limits, Spark, Skills, Gems, Canvas, and Deep Research.

The model menu uses current-shape hashed `data-mode-id` fixture values and
human-readable 3.5 Flash / 3.1 Flash-Lite / 3.1 Pro / Thinking labels. Tests
must continue to select by semantic label or normalized model family, never by
assuming those fixture hashes are stable production ids.

## Boundary

This is a UI and DOM integration harness. It can validate Primer++ mount/stop/
start behavior, module toggles, storage persistence, dialogs, focus, themes,
accessibility, local archive flows, and adapter selector probes against a
controlled current-shape fixture.

It does **not** validate Gemini authentication, server state, actual prompt
delivery, live navigation, remote export fidelity, server-owned deletion,
account switching, rate limits, or future Gemini rollout changes. Those remain
separate, sanitized checks on the real logged-in Gemini surface. A pass here
must never be reported as a pass for live Gemini remote integration.
