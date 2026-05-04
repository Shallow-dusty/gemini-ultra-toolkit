# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build              # Build both userscript + extension
npm run build:userscript   # Build userscript only → primer-pp.user.js
npm run build:extension    # Build extension only → dist/extension/
npm test                   # Run lib coverage checks plus project smoke checks
```

Tests enforce **100% branch/function/line/statement coverage** on `lib/`; `tests/app_smoke.test.js` covers release metadata, manifest scope, accessibility guards, and the dependency-audit pin. `pretest` auto-builds the userscript before testing. There is no watch mode or per-file test command.

## Architecture

**Dual-platform project**: a single codebase produces both a Tampermonkey/Violentmonkey **userscript** and a Chrome/Edge/Firefox **browser extension** (MV3). All 8 modules + core + UI are shared; only thin platform entry points differ. Public branding is `Primer++ for Gemini™`; keep `src/meta.txt`, `src/platforms/extension/manifest.json`, `src/constants.js`, `README.md`, and generated `primer-pp.user.js` aligned.

### Build Pipeline

**esbuild** via `scripts/build.js`, controlled by `TARGET` env var:
- **Userscript**: `src/main.js` → IIFE bundle with `src/meta.txt` banner → `primer-pp.user.js` (root)
- **Extension**: two-phase build — `src/platforms/extension/content.js` (GM_* polyfill) and `src/main.js` bundled separately as ESM, then concatenated into an async IIFE wrapper so polyfill can `await chrome.storage.local.get()` before main runs → `dist/extension/content.js`

### Key Design Patterns

**GM_* Polyfill** (`src/platforms/extension/gm_polyfill.js`): Extension reuses the exact same code as userscript by polyfilling all GM_* APIs (getValue/setValue/listValues/addValueChangeListener/addStyle/registerMenuCommand) on top of `chrome.storage.local` with a synchronous in-memory cache. The polyfill is preloaded before main.js runs.

**Direct Import (singleton modules)**: Modules import shared state/utilities directly (`import { Core } from './core.js'`). Not factory+DI. All GM_* calls go through the global `GM_getValue`/`GM_setValue` which are either native (userscript) or polyfilled (extension).

**Module Registry** (`src/module_registry.js`): Manages lifecycle of 8 pluggable feature modules. Each module implements `init()`, `destroy()`, `tick()`, and optionally `onUserChange()`.

**DOMWatcher** (`src/dom_watcher.js`): Centralized MutationObserver management — modules register watchers here instead of creating their own observers.

### Source Layout

```
src/
├── main.js             → App entry: boots core, registers modules, starts main loop
├── core.js             → User/model detection, URL parsing, sidebar scanning
├── panel_ui.js         → Main floating panel + details pane + core rendering
├── panel_settings.js   → Settings, Onboarding, Debug, Calibration modals
├── panel_dashboard.js  → Analytics dashboard with heatmap + model distribution
├── native_ui.js        → Native Gemini UI injection points + showConfirm/showToast
├── state.js            → Shared mutable state
├── constants.js        → GLOBAL_KEYS, TIMINGS, VERSION
├── module_registry.js  → Module lifecycle management
├── dom_watcher.js      → Centralized MutationObserver
├── guided_tour.js      → New user onboarding tour
├── icons.js            → SVG icon definitions
├── logger.js / debug_utils.js → Logging infrastructure
├── meta.txt            → Tampermonkey userscript header
├── modules/            → 8 feature modules (counter, export, folders, prompt_vault, default_model, batch_delete, quote_reply, ui_tweaks)
└── platforms/extension/ → GM_* polyfill, content.js entry, background.js, manifest.json, icons

lib/                    → Pure utility modules (CommonJS, 100% test coverage)
├── counter_calc.js     → Streak calculation, last-7-days data, ensureTodayEntry
├── date_utils.js       → formatLocalDate, getDayKey, parseLocalDate (timezone-safe)
├── quota_calc.js       → Weighted quota calculation, quota bar state
├── model_config.js     → MODEL_CONFIG definition (shared with counter module)
├── data_loader.js      → User data normalization
├── export_formatter.js → Multi-format export (JSON/CSV/Markdown)
└── debug_logger.js     → Logger with circular buffer, persistence, subscribers

tests/                  → Unit tests for lib/ (node:test + c8)
```

### Data Flow

1. **Userscript**: Tampermonkey loads `primer-pp.user.js` → `main.js` → boots directly with native GM_* APIs
2. **Extension**: `content.js` → async IIFE: init GM_* polyfill (preload chrome.storage) → then run `main.js`
3. `main.js`: initializes Core → registers 8 modules → starts main loop (polling every 1500ms)
4. Main loop: detects user/model changes → creates/updates panel → ticks enabled modules

### Storage Key Conventions

- User-scoped: `gemini_store_{email}`, `gemini_folders_data_{email}`, `gemini_prompt_vault_{email}`
- Global: `gemini_panel_pos`, `gemini_current_theme`, `gemini_enabled_modules`, etc.
- All key names defined in `src/constants.js` → `GLOBAL_KEYS`

## Important Conventions

- Current docs entry point: `docs/README.md`; current release state: `docs/PROJECT_STATUS.md`; near-term scope: `docs/ROADMAP.md`; current audit state: `docs/audits/CURRENT_AUDIT_STATUS.md`.
- **Timezone safety**: All date operations use `formatLocalDate()` / `parseLocalDate()` / `getDayKey()` from `lib/date_utils.js`. Never use `toISOString().slice(0,10)` or `new Date("YYYY-MM-DD")` — both produce UTC dates that shift in non-UTC timezones.
- `lib/model_config.js` is the single source for MODEL_CONFIG — a sync guard test ensures it stays in sync with `src/modules/counter.js`.
- Four built-in themes (Glass/Cyber/Paper/Auto) defined in `src/constants.js`. Auto syncs with system color scheme.
- ReDoS protection: folder auto-classify regexes are length-capped (100 chars). CSS injection prevention: hex color validation on folder colors.
- All GM_* calls in `src/` are wrapped in try-catch for robustness.
