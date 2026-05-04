# Project Status

Updated: 2026-05-05

## Summary

`Primer++ for Gemini™` is a dual-output Gemini web enhancement project:

- Tampermonkey/Violentmonkey userscript: `primer-pp.user.js`
- Browser extension: `dist/extension/` generated from `src/platforms/extension/`
- Shared application code: `src/`
- Testable pure logic: `lib/`
- Node test suite: `tests/`

The project is buildable and locally verified. The remaining release blocker is a real-browser smoke test on `https://gemini.google.com/` with an authenticated session.

## Verification Snapshot

Last verified locally on 2026-05-05:

- `npm test` — 142 passing tests; `lib/` remains at 100% c8 coverage.
- `npm run build` — userscript and extension builds complete.
- `npm audit --audit-level=moderate` — 0 vulnerabilities.

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

## Manual Smoke Test Still Required

Load either the userscript or `dist/extension/` in a real browser, then verify on Gemini:

- panel mounts and expands
- Settings, Analytics, Debug, and Calibration modals open and close with `Esc`
- `Tab` and `Shift+Tab` stay inside open modals
- module toggles do not produce console errors
- native UI injections appear in the sidebar, input area, and chat header where applicable
- focus-visible and reduced-motion styles do not break layout
