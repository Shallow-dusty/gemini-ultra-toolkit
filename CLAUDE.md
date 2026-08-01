# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build              # Build both userscript + extension
npm run build:userscript   # Build userscript only → primer-pp.user.js
npm run build:extension    # Build extension only → dist/extension/
npm run test:fast          # Run node:test without coverage instrumentation
npm test                   # Per-file coverage gate for all shipped JavaScript
python -m unittest discover -s tests/python -p "test_*.py"  # Store-tooling tests
npm audit --audit-level=moderate
```

`npm test` uses the canonical `.c8rc` and enforces **100% statements, branches, functions, and lines per file** for shipped JavaScript under `lib/**/*.js`, `src/**/*.js`, and `scripts/**/*.js`. The 24 Python store-tooling tests are a separate gate and are not included in c8 percentages. Build explicitly with `npm run build`; there is no `pretest` build hook or watch command.

## Architecture

**Dual-platform project**: one codebase produces a Tampermonkey/Violentmonkey **userscript** and a Chrome/Edge/Firefox **browser extension** (MV3). Product behavior is shared; thin platform adapters provide storage and runtime capabilities. Public branding is `Primer++ for Gemini™`. The repository version sources are `src/constants.js`, `src/meta.txt`, and `src/platforms/extension/manifest.json`; keep generated `primer-pp.user.js` and release-facing docs aligned. `package.json` intentionally has no version.

The local repository is a **v13.0 release candidate**. The latest published release remains **v12.0** until an explicit release workflow creates and publishes v13 artifacts.

### Build Pipeline

`scripts/build.js` delegates to the testable `scripts/build_core.js` and esbuild:

- **Userscript**: `src/main.js` → minified IIFE with the `src/meta.txt` banner → tracked `primer-pp.user.js`.
- **Extension**: bundles the GM compatibility bootstrap and `src/main.js`, waits for `chrome.storage.local` preload, then emits a minified async IIFE at ignored `dist/extension/content.js` with manifest, background worker, and icons.
- **Atomicity**: both targets are staged, validated, and installed together; a failed dual build restores previous artifacts.
- **Budgets**: each primary artifact is limited to 835,000 raw bytes and 245,000 gzip-9 bytes. Build output reports raw/gzip size and SHA-256.

### Key Design Patterns

**Composition root** (`src/app/`): `main.js` wires injected platform, storage, adapter, feature, UI, health, and archive policies. `PrimerApplication` owns one page activation and ordered shutdown.

**Lifecycle and module host** (`src/runtime/`): `LifecycleScope` owns listeners, timers, observers, and disposers. `ModuleHost` serializes feature transitions, persists enabled state, and rolls back failed start/stop operations. Compatibility module IDs remain stable while feature implementations move behind descriptors.

**Storage ports** (`src/storage/`): application and features use asynchronous clone-safe repositories. GM and Chrome adapters contain raw platform calls and pending-write flushing; account-scoped keys remain isolated.

**Gemini adapter** (`src/adapters/gemini/`): all mutable Gemini DOM selectors and page interactions belong here. Features consume capability-oriented composer, conversation, dialog, model, session, sidebar, transcript, and diagnostic ports instead of embedding selectors.

**Feature verticals** (`src/features/`): Insights, Collections, Portable Archive, Recipes, Message Queue, Preferences, Annotations, Bulk Lifecycle, Search & Navigator, and Capability Health own their domain, service/controller, view, and restore integration.

**UI foundation** (`src/ui/`): scoped semantic tokens, reusable components, locale state, dialog management, and shell controllers keep product UI separate from host DOM policy. Legacy panel/native facades remain only where compatibility requires them.

### Source Layout

```
src/
├── main.js                  → Browser entry and composition
├── app/                     → Composition root, application lifecycle, archive wiring
├── runtime/                 → LifecycleScope, ModuleHost, descriptors and transition state
├── storage/                 → Async storage port, repositories, migrations, GM/Chrome adapters
├── adapters/gemini/         → Current Gemini DOM and capability boundary
├── features/                → Product verticals and restore contributors
├── ui/                      → Tokens, components, dialogs, locale, shell controllers
├── modules/                 → Stable compatibility facades for legacy module IDs
├── platforms/               → Userscript and MV3 runtime adapters
└── constants.js / meta.txt  → Shared product constants and userscript metadata

lib/                         → Shared pure logic used by product features
scripts/                     → Atomic, validated dual-target build pipeline
tests/                       → Node coverage/smoke/architecture tests and Python store tests
```

### Data Flow

1. The userscript starts with the GM adapter; the extension awaits its Chrome storage bootstrap before the shared application bundle starts.
2. `main.js` creates the platform and storage ports, Gemini adapter, feature catalog, UI shell, archive wiring, and capability-health service.
3. The composition root starts one `PrimerApplication`; lifecycle scopes own DOM watchers, visibility handling, polling, subscriptions, and teardown.
4. The module host starts only enabled descriptors and rolls back failed transitions. Features read Gemini through adapter capabilities and persist through repositories.
5. Portable Archive discovers enabled restore contributors, validates a versioned manifest, previews selection, and executes resumable restore with rollback safeguards.

### Storage Key Conventions

- New code uses `src/storage/keys.js`, repositories, and the storage port; do not call raw `GM_*` or `chrome.storage` from feature code.
- Preserve existing user-scoped keys and migration behavior. Never log or export an account label except as explicitly sanitized product data.
- Preferences, enabled-state, and feature data must participate in Portable Archive through a restore contributor where applicable.
- Flush pending platform writes on page hide and application shutdown.

## Important Conventions

- Current docs entry point: `docs/README.md`; current release state: `docs/PROJECT_STATUS.md`; near-term scope: `docs/ROADMAP.md`; current audit state: `docs/audits/CURRENT_AUDIT_STATUS.md`.
- Current v13 product/architecture/test plan: `docs/research/v13-refactor-plan-2026-08-01.md`. It supersedes the June market snapshot for current decisions.
- **Timezone safety**: All date operations use `formatLocalDate()` / `parseLocalDate()` / `getDayKey()` from `lib/date_utils.js`. Never use `toISOString().slice(0,10)` or `new Date("YYYY-MM-DD")` — both produce UTC dates that shift in non-UTC timezones.
- `lib/model_config.js` is the single source for model configuration; sync guards protect compatibility surfaces.
- Theme and locale UI must use scoped tokens/components. Do not copy Gemini styling assumptions into feature code.
- Gemini-native features are not reimplemented: Notebooks, native search, Usage Limits, Gems/Skills, Canvas, Deep Research, and Spark stay native-owned; capability health should explain the boundary.
- ReDoS protection: folder auto-classify regexes are length-capped (100 chars). CSS injection prevention: hex color validation on folder colors.
- Transcript capture is explicit and visible-surface-only. Diagnostic exports must remain structural and must not include transcript bodies, sidebar titles, URLs, local storage, or credentials.
- Do not describe local counts or estimates as Gemini server quota.
