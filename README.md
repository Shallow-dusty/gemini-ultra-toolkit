# Primer++ for Gemini™

Unofficial modular assistant platform for [Google Gemini](https://gemini.google.com/) — available as both a **Tampermonkey userscript** and a **browser extension** (Chrome/Edge/Firefox).

Primer++ is an unofficial community extension. Gemini™ is a trademark of Google LLC. This project is not affiliated with, endorsed by, or sponsored by Google.

## Features

| Module | Description |
|--------|-------------|
| **Local Insights** | Keep account-scoped local message/model history, trends, streaks, and heatmaps. Local estimates are labelled as estimates and link to Gemini's native Usage Limits. |
| **Collections** | Organize visible chats into nested local collections with tags, ordering, previewable rules, undo, and portable data. Native Notebooks remain untouched. |
| **Archive & Export** | Export current or selected chats as JSON/CSV/Markdown/TXT/HTML/DOCX, preserve rich-content fidelity with explicit loss reports, and create validated portable archives. |
| **Prompt Vault / Recipes** | Save, version, diff, import/export, and run typed-variable multi-step recipes, with explicit composer insertion or queue handoff. |
| **Message Queue** | Queue prompts locally with explicit start, pause, cancel, reorder, pacing, session/route guards, and no automatic send retry. |
| **Default Model** | Apply a preferred model to new chats only when the current Gemini capability is available. |
| **Bulk Lifecycle** | Preview an exact bounded selection, optionally archive it, strongly confirm destructive scope, and stop safely on partial failure. |
| **Search & Navigator** | Search deliberately indexed/archive-imported local records, filter and rank results, jump through stable message locators, and quote visible text without auto-send. Health reports degraded when no persistent archive provider is available. |
| **Preferences & UI Tweaks** | Configure scoped themes, locale, width, title/send behavior, and composer statistics without hiding native Gems or Notebooks. |
| **Annotations** | Save local conversation/message annotations with tags, status, pins, search, anchors, context packets, and portable restore. |

All optional modules can be enabled or disabled from the settings panel. The
shell also reports whether each capability is available, degraded,
`native-owned`, disabled, or failed. Portable backup/restore spans the enabled
local features with validation, preview, selective apply, rollback, and explicit
resume after an interrupted restore.

Primer++ deliberately defers to current Gemini features such as Notebooks,
native chat search, Usage Limits, Gems/Skills, Canvas, Deep Research, and Spark.
It complements those surfaces instead of hiding or reimplementing them.

The v13 release candidate scores 38.5/40 task-equivalents (96.25%) in its strict
current-account matrix: 37 full rows and three partial rows. All critical rows
pass. Deterministic shipped-JavaScript coverage is 100%. The remaining partial
evidence is limited to observable message-target focus in one harness route,
live injected-failure rendering, and an installed-browser extension parity run;
no personal-free or Workspace score is inferred from this account.

## Install

Latest published release: **[v12.0](https://github.com/Shallow-dusty/primer-pp/releases/latest)** · [CHANGELOG / release notes](https://github.com/Shallow-dusty/primer-pp/releases)

Repository development version: **v13.0 release candidate**. It is not yet a
published GitHub release.

### Userscript (Tampermonkey / Violentmonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Click **[Install Primer++](https://github.com/Shallow-dusty/primer-pp/releases/latest/download/primer-pp.user.js)** — your userscript manager will detect the `.user.js` URL and open the install prompt.
3. Auto-updates from then on track `main` via the header's `@updateURL`.

Mirror: Greasyfork listing — _pending publication_.

### Browser Extension

Store listings — _pending review_:

- Chrome Web Store
- Microsoft Edge Add-ons
- Mozilla Add-ons (AMO)

Until the listings are live, install manually from the latest release:

1. Download [`primer-pp-extension-v12.0.zip`](https://github.com/Shallow-dusty/primer-pp/releases/latest) from the Releases page and unzip it.
2. **Chrome / Edge**: open `chrome://extensions/` (or `edge://extensions/`), enable **Developer mode**, click **Load Unpacked**, choose the unzipped folder.
3. **Firefox**: open `about:debugging` → **This Firefox** → **Load Temporary Add-on**, select the unzipped folder's `manifest.json`.

Privacy: see [PRIVACY.md](PRIVACY.md). Data stays in browser-local extension or
userscript storage unless you explicitly download an export; nothing is sent to
the developer or an analytics service.

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
git clone https://github.com/Shallow-dusty/primer-pp.git
cd primer-pp
npm install
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build both userscript and extension |
| `npm run build:userscript` | Build userscript only → `primer-pp.user.js` |
| `npm run build:extension` | Build extension only → `dist/extension/` |
| `npm test` | Run the Node suite with per-file 100% statements/branches/functions/lines over shipped JavaScript in `lib/`, `src/`, and `scripts/` |
| `npm run test:fast` | Run the Node suite without collecting coverage |

The store-capture Python helpers have a separate 24-test `unittest` suite,
verified on Windows and WSL:

```bash
python3 -m unittest discover -s tests/python -p 'test_*.py'
```

### Project Structure

```
src/
├── main.js           # Composition root and reusable application lifecycle
├── app/              # Session, watcher, onboarding, and portable-archive wiring
├── adapters/gemini/  # The only raw Gemini DOM/capability boundary
├── features/         # Isolated vertical features and compatibility facades
├── runtime/          # LifecycleScope, ModuleHost, capabilities, session control
├── storage/          # Async ports, account scope, migrations, GM/MV3 adapters
├── ui/               # Scoped tokens, semantic components, dialogs, and shell
├── modules/          # Stable public module IDs backed by vertical features
└── platforms/        # Userscript runtime and MV3 extension boundary
lib/                  # Deterministic shared domain utilities
scripts/              # Atomic, minified dual-target build pipeline
tests/                # Node, architecture, integration, coverage, and Python tool tests
```

For the fuller project map, current release status, and roadmap, see [docs/README.md](docs/README.md).

### Architecture

Both outputs share one application composition. Feature/domain code depends on
explicit runtime, storage, UI, and Gemini-adapter ports; raw `GM_*` calls are
confined to the platform boundary, and raw Gemini selectors are confined to the
Gemini adapter. `LifecycleScope` and `ModuleHost` make enable/disable,
session-change, failure rollback, and stop/start behavior deterministic.

Production builds are minified and atomic. Each userscript or extension content
artifact must stay within **835,000 raw bytes** and **245,000 deterministic
gzip-9 bytes**; the build fails before replacing a valid artifact when either
budget or validation fails.

## License

[MIT](LICENSE)
