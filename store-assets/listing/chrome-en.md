# Chrome Web Store Listing — English

_Use this file when filling the Chrome Web Store Developer Dashboard. Paste each section into the matching field._

---

## Item name

`Primer++ for Gemini™`

> 32 character cap. Current: 21.

## Item summary / Short description

> Form field cap: **132 characters**.

```
Unofficial Gemini™ companion for local insights, collections, archives, recipes, search, and backup. Private and open source.
```

> 125 characters.

## Detailed description

> Form field cap: 16,000 characters. Markdown is **not** rendered — line breaks are preserved.

```
Primer++ for Gemini™ is an unofficial, open-source companion extension for Google Gemini (gemini.google.com). It adds optional local workflows for organizing, archiving, reusing, and finding your work. Everything runs in your browser; there is no Primer++ account, telemetry, backend, or cloud sync.

═══════════════════════════════════════
WHAT IT ADDS
═══════════════════════════════════════

• Local Insights — keep an on-device activity history with day and model breakdowns, streaks, trends, and a year heatmap. These are local observations, not Gemini server quota or remaining-limit values.

• Collections — organize chat references into nested local collections with ordering, colors, pins, batch moves, previews, safe smart rules, transfer, and undo.

• Archive & Export — explicitly capture visible current or selected chats, preserve transcript structure, and export JSON / CSV / Markdown / TXT / HTML / DOCX. Failed or empty captures remain visible instead of being fabricated.

• Portable Backup & Restore — export a versioned backup of selected local feature stores, validate and preview it, de-duplicate records, selectively restore, roll back failed writes, and resume an interrupted restore.

• Recipes — save reusable prompts and parameterized templates, organize them with tags, insert rendered content into the composer, queue a chain step by step, and import/export the local library.

• Message Queue — locally stage prompts, then explicitly start, pause, cancel, or reorder the sequence. Active Gemini tool modes pause the queue instead of silently retrying.

• Search & Navigator — search deliberately archived/imported local records, filter and rank results, jump to a chat locator, or create an anchored quote. It does not silently index hidden Gemini conversations.

• Annotations — save local notes, pins, and references for important chats and insert an explicit context packet when you choose.

• Preferences — select an available preferred model, adjust theme/locale/layout and composer behavior, and manage shortcuts with conflict checks.

• Bulk Lifecycle — select multiple chats and run a confirmed archive or delete flow with progress, pause/cancel boundaries, and an operation snapshot.

• Capability Health — see whether each integration is available, Gemini-native, unavailable, degraded, disabled, or failed to inject after a frontend change.

Each optional feature can be enabled or disabled independently. The shell uses consistent themes, locale-aware components, keyboard controls, and remembered preferences. Gemini-native Notebooks, search, Usage Limits, Gems/Skills, Canvas, Deep Research, and Spark remain native and are not duplicated.

═══════════════════════════════════════
PRIVACY & DATA
═══════════════════════════════════════

• All data is stored in chrome.storage.local on your device.
• Nothing is uploaded — not to the developer, not to any analytics service, not anywhere.
• Prompt text is stored only when you explicitly save a recipe or add it to Message Queue. Visible conversation text is read only after an explicit archive/export or context-packet action, or from an archive you explicitly import. Archived text stays local until you delete it; hidden chats are not continuously collected.
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
Enhance the Gemini web app with optional local workflows for insights, organization, archives, reusable prompts, navigation, and backup/restore.
```

---

## Permission justifications

> Each permission asked in manifest.json must be justified in its own form field.

### `storage`

```
Persists user preferences and account-scoped local feature data on the device: insights, collections, explicitly created/imported archives, recipes, queued prompts, annotations, search records derived from those archives, restore progress, panel layout, locale/theme, and enabled state. All data is written to chrome.storage.local and is not transmitted by Primer++.
```

### `contextMenus`

```
Adds a single "Reset Panel Position" item to the extension toolbar icon's right-click menu, so users can recover the floating panel if they drag it off-screen. No page context menu items are added.
```

### Host permission: `https://gemini.google.com/*`

```
The content script only runs on Google Gemini at https://gemini.google.com/*, the single web app it enhances. It reads the signed-in account label for local separation, current model and capability state, sidebar chat references, and page events needed by enabled workflows. It reads visible transcript content only after an explicit archive/export or context-packet action. It does not request <all_urls> or any other host permission.
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
| Website content | No (we read sidebar titles and explicit-export visible chat text, but never transmit) |

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

1. `01-panel-counter.png` — floating panel with local activity insights
2. `02-details-pane.png` — expanded details pane with module tabs
3. `03-dashboard-heatmap.png` — year heatmap and model breakdown
4. `04-settings.png` — settings modal showing module toggles
5. `05-theme-cyber.png` — alternate Cyber theme

> Each 1280×800 PNG, no transparency. Required: at least 1, max 5.
