# Privacy Policy — Primer++ for Gemini™

_Last updated: 2026-08-01 (v13.0 repository release candidate; not yet published)_

`Primer++ for Gemini™` is an unofficial, open-source browser extension and userscript that adds local insights, collections, archive/export, recipes, search/navigation, annotations, preferences, backup/restore, and other quality-of-life features to [Google Gemini](https://gemini.google.com/). This document describes what the software touches, where the data lives, and what it does **not** do.

## TL;DR

- **All data stays on your device.** Nothing is uploaded, telemetered, analyzed, or shared.
- **No network requests** are made by the extension beyond what the Gemini page itself does. The extension does not contact any server, including the developer's.
- **Conversation text is read only after an explicit transcript archive/export, import, or context-packet action.** Visible text may be stored locally in an archive you deliberately create or import; the software does not silently index, continuously collect, or upload chat bodies.
- **Chat Notes context insertion uses only local metadata and notes.** It can insert saved titles, links, chat IDs, your local note text, or a packet of visible pinned notes into the composer after you click the action; it does not read hidden transcript bodies.
- **No account, no sign-up, no tracking ID.**
- **You are the operator and the only audience.** Export your data anytime, delete it anytime.

## What the extension stores locally

All data is written to `chrome.storage.local` (extension) or the corresponding userscript storage (`GM_setValue` in Tampermonkey / Violentmonkey). Storage is per-browser-profile and never leaves your machine.

Data categories:

| Category | Purpose | Example keys |
|---|---|---|
| Local insights | Daily message activity by model, used for local history, trends, and streaks; these are not Gemini server quota values | `gemini_store_<account-scope>` |
| Collections | Collection/folder definitions, rules, ordering, and chat references you create | `gemini_folders_data_<account-scope>` |
| Recipes | Prompts, templates, variables, tags, and chains you choose to save | `gemini_prompt_vault_<account-scope>` |
| Message queue | Prompt text you explicitly add to the local queue, including Prompt Vault items you choose to queue | `gemini_message_queue_<your-email>` |
| Chat notes | Notes and pins you explicitly save for conversations | `gemini_chat_notes_<your-email>` |
| Local archives and search | Visible transcript records you explicitly archive/import, capture metadata, and the local records/index needed to search or resume them | Account-scoped archive records |
| Annotations | Notes, pins, quote anchors, and references you explicitly create | Account-scoped annotation records |
| Model and UI preferences | Preferred model, locale, theme, width, shortcut, and UI behavior you choose | Preference records |
| Panel preferences | Floating panel position, current theme, which modules are enabled | `gemini_panel_pos`, `gemini_current_theme`, `gemini_enabled_modules` |
| Portable restore state | Versioned manifest, selected restore plan, de-duplication identity, rollback snapshot, and resumable local progress for a backup/restore you start | Account-scoped restore records |

Legacy keys may use the Gemini account label shown by the page as an **on-device account scope** so data remains separated between accounts in one browser profile. New repositories preserve that compatibility without transmitting the label. Portable backup files may contain the local feature data you explicitly select; they are downloaded to a destination you control and are not cloud-synced by Primer++.

## What the extension reads from the page

To do its job, the content script (`content.js`) reads:

- The currently signed-in account label exposed by Gemini's own UI, solely for local account separation and display.
- The currently selected model (Flash / Pro / Thinking) from Gemini's mode picker.
- Sidebar chat link titles and URLs, so it can render folder markers and counts.
- Page-level UI state needed by individual features (e.g., whether a message just sent successfully, so the counter can increment).
- Visible conversation messages only when you explicitly archive/export the current or selected chats, import a local archive, or insert a bounded transcript packet into the composer.
- Saved Chat Notes metadata and note text when you explicitly insert a local context reference or pinned-note packet into the composer.

The extension **does not** continuously read or store:

- Prompt text you type, unless you explicitly save it to Prompt Vault or add it to Message Queue. Queueing a Prompt Vault item copies that saved prompt text into the local Message Queue store.
- Conversation bodies, unless you explicitly archive/export visible current/selected chats or import a local archive. Explicitly archived/imported text may remain in the local archive until you delete it.
- Attachments, images, audio, or any other content inside a conversation.
- Any other tab, window, or site — the content script only runs on `https://gemini.google.com/*`.

## Permissions and why

| Permission | Why |
|---|---|
| `storage` | Persist local insights, collections, archives, recipes, queue items, annotations, preferences, enabled state, and restore progress in `chrome.storage.local`. |
| `contextMenus` | Add a "Reset Panel Position" item to the extension's toolbar-icon right-click menu. |
| Host: `https://gemini.google.com/*` | The only site the content script runs on. The extension does **not** request `<all_urls>` or any other host permission. |

The extension has **no** `tabs`, `webRequest`, `cookies`, `history`, `bookmarks`, `clipboardRead`, or `identity` permissions. It cannot see other tabs or your browsing history.

## What the extension does not do

- No analytics SDK, no Sentry, no Google Analytics, no telemetry of any kind.
- No remote code loading, no `eval`, no `new Function`, no `innerHTML`.
- No background syncing, no Primer++ cloud backup, no account creation. A portable backup is an explicit browser download; any later sync performed by your browser, operating system, or chosen folder is outside Primer++.
- No advertising, no monetization.

You can verify all of the above by reading the source: <https://github.com/Shallow-dusty/primer-pp>.

## Exporting and deleting your data

- **Export and backup**: archive/export actions produce files through the browser download flow. Usage exports contain local insights. Transcript archives contain visible conversation text captured only after you start the action; selected-chat capture records failed/empty items instead of fabricating content. Portable backup exports only the selected local feature stores. Context-packet insertion writes only into the Gemini composer and does not auto-send.
- **Restore**: before writing, a portable backup is parsed, version-checked, normalized, de-duplicated, and previewed. Selected restore operations keep local rollback/resume state; they do not upload the backup.
- **Delete**: use Primer++ feature controls to delete the relevant local record, remove the extension and its site data through the browser's extension/storage controls, or use your userscript manager's storage controls. Uninstall behavior varies by browser and userscript manager, so confirm stored data there if you need a complete wipe.

## Children's privacy

The extension does not knowingly collect data from anyone, including children under 13. It does not collect data at all.

## Changes to this policy

Material changes will be reflected by bumping the date at the top of this document and noted in the project's `docs/ROADMAP.md` and Release notes.

## Contact

Issues, questions, or suggestions: <https://github.com/Shallow-dusty/primer-pp/issues>.

---

_`Primer++ for Gemini™` is an unofficial community project. Gemini™ is a trademark of Google LLC. This project is not affiliated with, endorsed by, or sponsored by Google._
