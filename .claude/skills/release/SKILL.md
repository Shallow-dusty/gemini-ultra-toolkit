---
name: release
description: 发布新版本 — 同步源版本事实、完成确定性与真实浏览器门禁、构建并在明确授权后提交和打标签
---

# Release Workflow

用户通过 `/release <version>` 调用（如 `/release 11.1`）。

## 版本号事实源（全部需要同步更新）

1. `src/constants.js` → `export const VERSION = '<version>';`
2. `src/meta.txt` → `@name` 行中的 `(v<version>)` 和 `@version <version>`
3. `src/platforms/extension/manifest.json` → `"version": "<version>"`

`package.json` 故意不含版本号，不要新增。`src/main.js` 也不是版本事实源。

## 执行步骤

1. **验证参数**：确认提供了版本号，格式为 semver（如 `11.1` 或 `11.1.0`）
2. **确认授权和工作树**：记录 `git status --short --branch`，确认用户是在准备候选版还是明确要求正式发布；保护已有修改
3. **更新版本号**：只修改上述 3 个事实源，并同步 README / PROJECT_STATUS / ROADMAP / CHANGELOG / 隐私和商店文案中的当前版本措辞
4. **运行 JavaScript 门禁**：`npm test` — `lib/`、`src/`、`scripts/` 每个已发货文件的 statements / branches / functions / lines 都必须 100%
5. **运行 Python 门禁**：`python -m unittest discover -s tests/python -p "test_*.py"`；它与 c8 覆盖率分开报告
6. **依赖审计**：`npm audit --audit-level=moderate`
7. **构建**：`npm run build` — 原子生成并校验 minified userscript + extension，确认 raw / gzip-9 预算和 SHA-256 报告
8. **真实浏览器门禁**：执行当前 live scenarios 与跨模块 UI / accessibility 检查，把观察结果和脱敏证据写回 ledger；据此填写 task matrix，不得预填分数
9. **更新发布文档**：将候选说明改为正式版本说明，确认 GitHub 最新发布措辞、安装链接、商店文案和截图均与实际产物一致
10. **再次确认**：在 commit / tag / push / GitHub Release / 商店提交前向用户确认精确范围；准备候选版不等于授权发布
11. **经授权后提交和打标签**：使用项目约定的提交消息，创建 `v<version>` tag；推送和外部分发仍分别需要明确授权

## 注意事项

- 任一测试、审计、构建、live scenario 或 UI 门禁失败，都保持 release candidate 状态并报告；不要用文档措辞绕过门禁
- 不要修改 `package.json` 的 version（该项目不使用 npm publish）
- `primer-pp.user.js` 是 tracked 分发文件；`dist/` 是 ignored 构建目录，正式 release 时从已验证构建制作独立扩展包，不把 ignored 目录误写成必须提交
- 最新发布版本只在发布实际成功后更新；候选版不得写成已发布
- 对外文档只包含产品、实现、客观验证和已知边界，不包含内部审议过程或工具痕迹
