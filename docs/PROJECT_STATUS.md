# Project Status

Updated: 2026-06-08 — v12.0 released; selected-chat export and local folder undo added; live smoke still pending.

## Summary

`Primer++ for Gemini™` is a dual-output Gemini web enhancement project:

- Tampermonkey/Violentmonkey userscript: `primer-pp.user.js`
- Browser extension: `dist/extension/` generated from `src/platforms/extension/`
- Shared application code: `src/`
- Testable pure logic: `lib/`
- Node test suite: `tests/`

**v12.0 (2026-05-21)** — Google reshuffled the Gemini frontend on 2026-05-20, breaking several DOM selectors (`.conversation-title-container`, `button.send-button`, `.user-query-text`, `.bard-mode-list-button.is-selected`, `button.gds-pillbox-button`). v12 introduces `src/adapters/gemini.js` as the primary DOM-coupling layer used by every module. Most Gemini selectors now live there; remaining module-level DOM assumptions are tracked as adapter-hardening work in `docs/ROADMAP.md`.

## Verification Snapshot

Last verified locally on 2026-06-08:

- `npm test` — 212 passing tests; `lib/` remains at 100% c8 coverage.
- `npm run build` — userscript and extension builds complete (~427.9 kb
  userscript after selected-chat export, URL filtering, prompt-delete undo, and
  folder undo).
- `npm audit --audit-level=moderate` — 0 vulnerabilities after updating
  `brace-expansion` from `5.0.5` to `5.0.6`.
- **Real-browser smoke test** — last full logged-in smoke passed on 2026-05-21
  (`docs/research/v12-dom-probe-2026-05-21-revised.md`). A 2026-06-07 CDP
  refresh was not possible because no Gemini page was available at
  `127.0.0.1:63366`. Treat live Gemini compatibility as due for refresh before
  store submission.
- **Limited signed-out headless smoke** — on 2026-06-08, Playwright loaded
  `https://gemini.google.com/app`, injected the generated userscript after DOM
  load, mounted the Primer++ panel, opened the Export tab, and confirmed the
  signed-out `/app/download` link is no longer treated as a selectable chat.
  This does not verify logged-in sidebar history navigation or transcript
  capture.

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

Git state is mutable and this document is not the source of truth for whether
the checkout is clean, ahead, or pushed. Use `git status --short --branch` before
release, commit, push, or store packaging.

Before release or push, run:

```bash
npm test
npm run build
npm audit --audit-level=moderate
git status --short --branch
```

## Current Planning Snapshot

See `docs/research/market-ui-plan-2026-06-07.md` for the latest competitor,
Gemini UI, and v12.x/v13 development planning snapshot.

## Manual Smoke Test (completed for v12.0)

Done automatically through Playwright MCP against the live Gemini app on 2026-05-21 (logged-in `establishmentsk2957@gmail.com`, Decodo JP exit). For each subsequent release, repeat this checklist on a real browser to catch regressions on Gemini's evolving UI:

- panel mounts and expands
- Settings, Analytics, Debug, and Calibration modals open and close with `Esc`
- `Tab` and `Shift+Tab` stay inside open modals
- module toggles do not produce console errors
- native UI injections appear in the sidebar, input area, and chat header where applicable
- focus-visible and reduced-motion styles do not break layout
