# Primer++ for Gemini™

Unofficial modular assistant platform for [Google Gemini](https://gemini.google.com/) — available as both a **Tampermonkey userscript** and a **browser extension** (Chrome/Edge/Firefox).

Primer++ is an unofficial community extension. Gemini™ is a trademark of Google LLC. This project is not affiliated with, endorsed by, or sponsored by Google.

## Features

| Module | Description |
|--------|-------------|
| **Counter** | Track daily message counts per model (Flash/Thinking/Pro) with streak tracking and heatmap |
| **Folders** | Organize conversations into folders with drag-and-drop |
| **Export** | Export usage data as JSON, CSV, or Markdown reports |
| **Prompt Vault** | Save and quick-insert frequently used prompts |
| **Default Model** | Auto-select your preferred model on page load |
| **Batch Delete** | Select and delete multiple conversations at once |
| **Quote Reply** | Quote selected text into the input area |
| **UI Tweaks** | Tab title updates, Ctrl+Enter send, layout customizations |

All modules can be individually enabled/disabled from the settings panel.

## Install

### Userscript (Tampermonkey / Violentmonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. Open `primer-pp.user.js` and click "Install"

### Browser Extension

1. Build with `npm run build:extension` (or download `dist/extension/`)
2. **Chrome/Edge**: Go to `chrome://extensions/` → Enable Developer Mode → Load Unpacked → select `dist/extension/`
3. **Firefox**: Go to `about:debugging` → This Firefox → Load Temporary Add-on → select `dist/extension/manifest.json`

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
| `npm test` | Run tests with 100% coverage enforcement for `lib/` plus smoke checks |

### Project Structure

```
src/
├── main.js           # App entry point
├── core.js           # User/model detection, URL parsing
├── panel_ui.js       # Main floating panel + settings + dashboard
├── modules/          # 8 feature modules
└── platforms/
    └── extension/    # GM_* polyfill + extension entry + manifest
lib/                  # Pure utility modules (CommonJS, 100% test coverage)
tests/                # Unit tests (Node.js test runner + c8)
```

For the fuller project map, current release status, and roadmap, see [docs/README.md](docs/README.md).

### Architecture

Both platforms share the same core code. The userscript uses native `GM_getValue`/`GM_setValue` APIs. The extension uses a **GM_* polyfill** layer that implements the same APIs on top of `chrome.storage.local` with a preloaded in-memory cache — all downstream code calls GM_* functions identically.

## License

[MIT](LICENSE)
