# Greasyfork Submission — Primer++ for Gemini™

_Use when publishing the userscript at https://greasyfork.org/_

## Steps

> The repository currently contains a v13.0 release candidate. Do not publish it until live acceptance, the task matrix, and an explicit release authorization are complete. The latest published release is v12.0.

1. Open <https://greasyfork.org/zh-CN/users/sign_up> (or `/en/users/sign_up`) and sign in **via GitHub OAuth** as `Shallow-dusty`. (Email/password is also supported.)
2. After login, go to <https://greasyfork.org/zh-CN/script_versions/new>.
3. For the current public version, paste the userscript from the v12.0 GitHub Release. After an explicitly authorized v13 release, paste the verified `primer-pp.user.js` from that release asset. The metadata block at the top is auto-parsed.
4. Fill the form fields below.
5. Click **Post new script**. Publication is instant (no review).

## Form fields

### Description (homepage / category)

Auto-extracted from the `@description` line in the userscript header. Greasyfork lets you write a longer **About** page on the next screen — paste this:

```
Primer++ for Gemini™ is an unofficial, open-source companion userscript for Google Gemini (gemini.google.com). Its optional local workflows include activity insights and heatmaps, nested collections, explicit visible-transcript archive/export, reusable prompt recipes, a controllable message queue, archived-record search and navigation, annotations, preferences, confirmed bulk lifecycle actions, capability health, and versioned backup/restore with validation, de-duplication, rollback, and resume.

Every optional feature can be enabled or disabled independently. Local observations are not presented as Gemini server quota. Gemini-native Notebooks, search, Usage Limits, Gems/Skills, Canvas, Deep Research, and Spark remain native and are not duplicated.

Privacy: every byte of data lives in your browser's GM storage. The script makes no network requests to any server; no telemetry, no remote code, no tracking. Full policy: https://github.com/Shallow-dusty/primer-pp/blob/main/PRIVACY.md

Source, issue tracker, browser-extension build: https://github.com/Shallow-dusty/primer-pp

Disclaimer: this is an unofficial community project. Gemini™ is a trademark of Google LLC. Not affiliated with, endorsed by, or sponsored by Google.

非官方 Gemini™ 本地工作流油猴脚本：洞察、集合、归档、配方、搜索和备份；功能可独立开关，数据留在设备。
```

### Additional info

| Field | Value |
|---|---|
| **License** | `MIT` |
| **Applies to** | (auto from `@match` — should show `gemini.google.com`) |
| **Sync URL** _(optional, recommended)_ | `https://raw.githubusercontent.com/Shallow-dusty/primer-pp/main/primer-pp.user.js` |
| **Sync method** | `Webhook` is fine; alternatively, every push to `main` updates the raw URL — Greasyfork will refetch on its own schedule. |

### Tags

Add (separated by spaces): `gemini`, `productivity`, `counter`, `heatmap`, `folders`, `prompt`, `unofficial`, `ai`.

### Visibility

- **Listed**: yes (public). Anyone can find this script via Greasyfork search.

## After publishing

Copy the script page URL (e.g. `https://greasyfork.org/zh-CN/scripts/<id>-primer-pp-for-gemini`) and paste it into `README.md` install section, replacing the `_pending publication_` placeholder.
