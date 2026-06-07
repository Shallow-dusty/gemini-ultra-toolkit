# Privacy Policy — Primer++ for Gemini™

_Last updated: 2026-06-08 (v12.0 post-release local data and context-reference update)_

`Primer++ for Gemini™` is an unofficial, open-source browser extension and userscript that adds usage tracking, conversation folders, prompt management, and other quality-of-life features to [Google Gemini](https://gemini.google.com/). This document describes what data the extension touches, where it lives, and what it does **not** do.

## TL;DR

- **All data stays on your device.** Nothing is uploaded, telemetered, analyzed, or shared.
- **No network requests** are made by the extension beyond what the Gemini page itself does. The extension does not contact any server, including the developer's.
- **Conversation text is read only when you explicitly export transcripts.** The extension does not continuously read or upload chat bodies.
- **Chat Notes reference insertion uses only local metadata and notes.** It can insert saved titles, links, chat IDs, and your local note text into the composer after you click the action; it does not read hidden transcript bodies.
- **No account, no sign-up, no tracking ID.**
- **You are the operator and the only audience.** Export your data anytime, delete it anytime.

## What the extension stores locally

All data is written to `chrome.storage.local` (extension) or the corresponding userscript storage (`GM_setValue` in Tampermonkey / Violentmonkey). Storage is per-browser-profile and never leaves your machine.

Data categories:

| Category | Purpose | Example keys |
|---|---|---|
| Per-user usage counts | Daily message tallies by model, used to render counter / heatmap / streak | `gemini_store_<your-email>` |
| Folder definitions | Sidebar folders you create, the chat URLs you put in them | `gemini_folders_data_<your-email>` |
| Saved prompts | Prompts you choose to save in the Prompt Vault | `gemini_prompt_vault_<your-email>` |
| Message queue | Prompt text you explicitly add to the local queue | `gemini_message_queue_<your-email>` |
| Chat notes | Notes and pins you explicitly save for conversations | `gemini_chat_notes_<your-email>` |
| Model and UI preferences | Default model choice and UI tweak settings you choose | `gemini_default_model`, `gemini_ui_tweaks` |
| Panel preferences | Floating panel position, current theme, which modules are enabled | `gemini_panel_pos`, `gemini_current_theme`, `gemini_enabled_modules` |

The `<your-email>` suffix is the Gemini account email shown in the page's top-right avatar. The extension uses it as a **local key** to keep data separated between accounts you sign into in the same browser profile. It is never transmitted anywhere.

## What the extension reads from the page

To do its job, the content script (`content.js`) reads:

- The currently signed-in account label (email + display name from Gemini's own UI).
- The currently selected model (Flash / Pro / Thinking) from Gemini's mode picker.
- Sidebar chat link titles and URLs, so it can render folder markers and counts.
- Page-level UI state needed by individual features (e.g., whether a message just sent successfully, so the counter can increment).
- Visible conversation messages only when you explicitly use the Export module's current-chat or selected-chat transcript export.
- Saved Chat Notes metadata and note text when you explicitly insert a local context reference into the composer.

The extension **does not** continuously read or store:

- Prompt text you type, unless you explicitly save it to Prompt Vault or add it to Message Queue.
- Conversation bodies, unless you explicitly export a current-chat or selected-chat transcript.
- Attachments, images, audio, or any other content inside a conversation.
- Any other tab, window, or site — the content script only runs on `https://gemini.google.com/*`.

## Permissions and why

| Permission | Why |
|---|---|
| `storage` | Persist your counts, folders, prompts, and panel settings locally in `chrome.storage.local`. |
| `contextMenus` | Add a "Reset Panel Position" item to the extension's toolbar-icon right-click menu. |
| Host: `https://gemini.google.com/*` | The only site the content script runs on. The extension does **not** request `<all_urls>` or any other host permission. |

The extension has **no** `tabs`, `webRequest`, `cookies`, `history`, `bookmarks`, `clipboardRead`, or `identity` permissions. It cannot see other tabs or your browsing history.

## What the extension does not do

- No analytics SDK, no Sentry, no Google Analytics, no telemetry of any kind.
- No remote code loading, no `eval`, no `new Function`, no `innerHTML`.
- No background syncing, no cloud backup, no account creation.
- No advertising, no monetization.

You can verify all of the above by reading the source: <https://github.com/Shallow-dusty/primer-pp>.

## Exporting and deleting your data

- **Export**: the Export module produces files written via the browser's download flow. Usage exports contain local counters. Transcript exports contain visible conversation text captured only after you click an export action; selected-chat export navigates selected sidebar chats and records failed/empty captures instead of fabricating content.
- **Delete**: removing the extension from `chrome://extensions/` (or uninstalling the userscript) clears its storage on next browser restart. To wipe earlier, open DevTools on a Gemini tab and run `chrome.storage.local.clear()` (extension) or use Tampermonkey's storage panel (userscript).

## Children's privacy

The extension does not knowingly collect data from anyone, including children under 13. It does not collect data at all.

## Changes to this policy

Material changes will be reflected by bumping the date at the top of this document and noted in the project's `docs/ROADMAP.md` and Release notes.

## Contact

Issues, questions, or suggestions: <https://github.com/Shallow-dusty/primer-pp/issues>.

---

_`Primer++ for Gemini™` is an unofficial community project. Gemini™ is a trademark of Google LLC. This project is not affiliated with, endorsed by, or sponsored by Google._
