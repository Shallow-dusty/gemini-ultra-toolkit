# Project Status

Updated: 2026-05-21 — v12.0 release in progress.

## Summary

`Primer++ for Gemini™` is a dual-output Gemini web enhancement project:

- Tampermonkey/Violentmonkey userscript: `primer-pp.user.js`
- Browser extension: `dist/extension/` generated from `src/platforms/extension/`
- Shared application code: `src/`
- Testable pure logic: `lib/`
- Node test suite: `tests/`

**v12.0 (2026-05-21)** — Google reshuffled the Gemini frontend on 2026-05-20, breaking several DOM selectors (`.conversation-title-container`, `button.send-button`, `.user-query-text`, `.bard-mode-list-button.is-selected`, `button.gds-pillbox-button`). v12 introduces `src/adapters/gemini.js` — a single DOM-coupling layer used by every module. Future Gemini rewrites should only touch this file.

## Verification Snapshot

Last verified locally on 2026-05-21:

- `npm test` — 146 passing tests; `lib/` remains at 100% c8 coverage.
- `npm run build` — userscript and extension builds complete (~329 kb userscript).
- `npm audit --audit-level=moderate` — 0 vulnerabilities.
- **Real-browser smoke test** — passed (`docs/research/v12-dom-probe-2026-05-21-revised.md`). All 8 modules inject correctly on the new Gemini frontend: panel + counter + export + folders + prompt-vault + default-model + batch-delete + quote-reply + ui-tweaks. Zero `pageerror` events.

## Repository Structure

```
.
├── src/                         shared app source
│   ├── modules/                 feature modules
│   └── platforms/extension/     MV3 extension entry, polyfill, manifest, icons
├── lib/                         CommonJS pure utility modules covered by c8
├── tests/                       node:test suite plus app smoke checks
├── scripts/                     build tooling
├── docs/                        current docs, audit status, release research
├── primer-pp.user.js            generated userscript committed for distribution
└── package.json                 npm scripts and dev dependencies
```

Generated or local-only directories:

- `dist/` — ignored extension build output.
- `coverage/` — ignored c8 output.
- `node_modules/` — ignored dependencies.
- `.playwright-mcp/` — ignored local browser/debug logs.

## Current Git Notes

Expected modified files after the 2026-05-05 cleanup:

- source and metadata files for branding, a11y/i18n, and audit fixes
- generated `primer-pp.user.js`
- docs consolidation files
- `package-lock.json`
- `tests/app_smoke.test.js`

Before release or commit, run:

```bash
npm test
npm run build
npm audit --audit-level=moderate
git status --short --branch
```

## Manual Smoke Test (completed for v12.0)

Done automatically through Playwright MCP against the live Gemini app on 2026-05-21 (logged-in `establishmentsk2957@gmail.com`, Decodo JP exit). For each subsequent release, repeat this checklist on a real browser to catch regressions on Gemini's evolving UI:

- panel mounts and expands
- Settings, Analytics, Debug, and Calibration modals open and close with `Esc`
- `Tab` and `Shift+Tab` stay inside open modals
- module toggles do not produce console errors
- native UI injections appear in the sidebar, input area, and chat header where applicable
- focus-visible and reduced-motion styles do not break layout
