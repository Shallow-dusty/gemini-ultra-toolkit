# Chrome Web Store Listing — English

_Use this file when filling the Chrome Web Store Developer Dashboard. Paste each section into the matching field._

---

## Item name

`Primer++ for Gemini™`

> 32 character cap. Current: 21.

## Item summary / Short description

> Form field cap: **132 characters**.

```
Unofficial Gemini™ companion: daily counter, heatmap, quota tracker, folders, prompt vault, export. Local-only, open source.
```

> 124 characters.

## Detailed description

> Form field cap: 16,000 characters. Markdown is **not** rendered — line breaks are preserved.

```
Primer++ for Gemini™ is an unofficial, open-source companion extension for Google Gemini (gemini.google.com). It adds eight independent quality-of-life modules that turn the Gemini web app into a workspace you can actually track and organize. Everything runs locally in your browser; no account, no telemetry, no cloud sync.

═══════════════════════════════════════
WHAT IT ADDS
═══════════════════════════════════════

• Counter — daily message tally per model (Flash / Pro / Thinking), streak tracking, weekly trend, and a model-weighted quota bar so you can see how close you are to your self-set ceiling.

• Heatmap dashboard — GitHub-style year heatmap of your Gemini usage, plus per-model breakdown and per-day drill-down.

• Folders — group sidebar chats into folders with drag-and-drop, color coding, pinning, batch move, and optional auto-classify rules (regex or keyword).

• Prompt Vault — save frequently used prompts, organize by tag, one-click insert into the composer. Import / export your library as JSON.

• Default Model — auto-select your preferred model (Flash / Pro / Thinking) when you open a fresh chat.

• Batch Delete — multi-select chats in the sidebar and delete them in one confirmed pass.

• Quote Reply — quote selected text from any chat into your next prompt, with attribution.

• UI Tweaks — sync the tab title with the chat title, customize Ctrl+Enter behavior, adjust chat width, hide unused Gems.

Each module can be individually enabled or disabled from the settings panel. The floating panel is draggable, themable (Glass / Cyber / Paper / Auto-system), and remembers its position per browser profile.

═══════════════════════════════════════
PRIVACY & DATA
═══════════════════════════════════════

• All data is stored in chrome.storage.local on your device.
• Nothing is uploaded — not to the developer, not to any analytics service, not anywhere.
• The extension does NOT read the body of your prompts or Gemini's responses. It only reads sidebar titles and counts the messages you send.
• Only host permission requested: https://gemini.google.com/*.
• Full privacy policy: https://github.com/Shallow-dusty/primer-pp/blob/main/PRIVACY.md

═══════════════════════════════════════
OPEN SOURCE
═══════════════════════════════════════

MIT licensed. Source, issue tracker, and release notes:
https://github.com/Shallow-dusty/primer-pp

Also available as a Tampermonkey / Violentmonkey userscript on the same repository.

═══════════════════════════════════════
DISCLAIMER
═══════════════════════════════════════

Primer++ for Gemini™ is an unofficial community project. Gemini™ is a trademark of Google LLC. This extension is not affiliated with, endorsed by, or sponsored by Google. It does not modify Google's servers or services — it only enhances the appearance and ergonomics of the Gemini web page inside your own browser.
```

## Category

`Productivity`

## Language

`English` (primary). You may add `Chinese (Simplified)` as additional translation using the zh file.

---

## Single purpose

> Required free-text field. Keep to one sentence.

```
Enhance the Gemini web app at gemini.google.com with local-only productivity tools: usage counter, conversation folders, saved prompts, and bulk operations.
```

---

## Permission justifications

> Each permission asked in manifest.json must be justified in its own form field.

### `storage`

```
Persists user preferences and per-account local data on the device only: daily message counts (for the Counter module), folder definitions (for the Folders module), saved prompts (for the Prompt Vault module), floating panel position, current theme, and which modules are enabled. All data is written to chrome.storage.local and never transmitted off the device.
```

### `contextMenus`

```
Adds a single "Reset Panel Position" item to the extension toolbar icon's right-click menu, so users can recover the floating panel if they drag it off-screen. No page context menu items are added.
```

### Host permission: `https://gemini.google.com/*`

```
The extension's content script only runs on Google Gemini at https://gemini.google.com/*, which is the single web app it enhances. The script reads sidebar chat titles, the currently selected model, the signed-in account label, and message-send events so the in-page floating panel can show daily counts, manage folders, and inject quick-insert prompts. It does not request <all_urls> or any other host permission.
```

### Remote code use

```
No. The extension ships with all JavaScript bundled in content.js and background.js. No code is loaded from any remote source at runtime. No eval, no Function constructor, no innerHTML/insertAdjacentHTML, no script tag injection.
```

### Data collection disclosures (Privacy practices form)

Check **only** the following row (if any are applicable). All others: leave unchecked.

| Category | Should you check it? |
|---|---|
| Personally identifiable information | No |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No (we count messages but never transmit) |
| Website content | No (we read sidebar titles but never transmit) |

Then check the three disclosure statements:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy URL

```
https://github.com/Shallow-dusty/primer-pp/blob/main/PRIVACY.md
```

---

## Distribution

- **Visibility**: Public
- **Regions**: All regions
- **Pricing**: Free

---

## Screenshots upload order

Upload in this order from `store-assets/screenshots/`:

1. `01-panel-counter.png` — floating panel with daily counter + quota bar
2. `02-details-pane.png` — expanded details pane with module tabs
3. `03-dashboard-heatmap.png` — year heatmap and model breakdown
4. `04-settings.png` — settings modal showing module toggles
5. `05-theme-cyber.png` — alternate Cyber theme

> Each 1280×800 PNG, no transparency. Required: at least 1, max 5.
