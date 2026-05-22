# Primer++ for Gemini™ v12.0

_2026-05-21_

First public release. v12.0 ships the same eight modules the project has carried since v10.x, but rebuilt around a single **GeminiAdapter** layer so future Gemini frontend rewrites only require touching one file.

## Highlights

- **`src/adapters/gemini.js`** — every DOM selector, every mutation matcher, every "find the model picker" / "scan the sidebar" routine is now centralized here. Core, native UI, and all 8 modules go through it.
- **Live DOM compatibility** — selectors updated for the 2026-05-20 Gemini frontend overhaul (new mode-picker structure, `more options for <title>` row buttons, `data-test-id="delete-button"` confirmation flow, `Send message` aria-label).
- **Real-browser smoke test verified** — first release with end-to-end verification on the live Gemini app. Panel + 8 modules inject cleanly with zero `pageerror`.
- **Dual distribution** — Tampermonkey/Violentmonkey userscript and Chrome/Edge/Firefox extension built from the same source.

## Modules (unchanged behavior, refactored plumbing)

Counter · Folders · Export · Prompt Vault · Default Model · Batch Delete · Quote Reply · UI Tweaks. Each toggleable from the settings panel.

## Quality bar

- 146 unit tests, `lib/` at 100% statement / branch / function / line coverage.
- 5 self-audit passes + 3 independent agent reviews (architecture, generic code, userscript-specific). No `critical` findings; all `important` items resolved before release.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

## Install

### Tampermonkey / Violentmonkey

Click [`primer-pp.user.js`](https://github.com/Shallow-dusty/primer-pp/releases/download/v12.0/primer-pp.user.js) (the asset attached to this release). Your userscript manager will pick up the install prompt automatically. Auto-updates will track `main` from now on.

### Browser extension

- **Chrome Web Store / Edge Add-ons / Firefox AMO** — pending review at time of release.
- **Manual install (Chromium today)** — download `primer-pp-extension-v12.0.zip`, unzip, go to `chrome://extensions/`, enable Developer Mode, choose **Load Unpacked**, point at the unzipped folder.

## Privacy

All data stored in `chrome.storage.local` on your device. No telemetry. No remote code. No tracking. Full policy: [PRIVACY.md](https://github.com/Shallow-dusty/primer-pp/blob/main/PRIVACY.md).

---

## 中文摘要

v12.0 是 Primer++ for Gemini™ 的首次公开发布。本次重构把所有 Gemini DOM 选择器集中到 `src/adapters/gemini.js`，下次 Google 改版只需修改这一个文件。八个模块（计数器 / 文件夹 / 导出 / Prompt 库 / 默认模型 / 批量删除 / 引用回复 / 界面微调）在新版 Gemini 前端 (2026-05-20) 实测全部注入成功。

- 油猴脚本：点上方 `primer-pp.user.js` asset 一键安装。
- 浏览器扩展：Chrome / Edge / Firefox 商店审核中；现在可下载 `primer-pp-extension-v12.0.zip` 手动加载（`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序）。
- 隐私：所有数据存本地，零遥测，详见 PRIVACY.md。
