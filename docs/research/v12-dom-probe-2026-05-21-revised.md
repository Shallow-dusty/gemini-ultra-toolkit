# v12 DOM 探测 — 第二轮修订（2026-05-21）

> 第一轮（v12-dom-impact-2026-05-21.md）依据 accessibility snapshot 评估，悲观估计大量选择器失效。
> **第二轮**通过 `document.querySelector` 直接探活，结论**大反转**：v11 绝大多数选择器仍可用，仅少数 4-5 个真废，2-3 个需调整。

---

## A. 仍存在并工作的 v11 选择器（**保留即可**）

| 用途 | v11 选择器 | v12 实测 |
|---|---|---|
| Side nav | `bard-sidenav` | ✅ 仍是 web component |
| Side nav 内层 | `.sidenav-with-history-container` | ✅ 仍在（嵌套于 bard-sidenav）|
| Side nav 容器 | `bard-sidenav-container` | ✅ 仍在 |
| Side nav overflow | `.overflow-container` | ✅ 仍在 |
| Input area V2 tag | `input-area-v2` | ✅ web component 保留 |
| Input area fieldset | `.input-area-container` (实为 fieldset) | ✅ 仍在 |
| Trailing actions | `.trailing-actions-wrapper` | ✅ 仍在 |
| Quill editor | `div.ql-editor[contenteditable="true"]` | ✅ 仍在 |
| Mode picker 按钮 | `button.input-area-switch` | ✅ 仍在 |
| Mode picker 按钮 (DT) | `[data-test-id="bard-mode-menu-button"]` | ✅ 仍在 |
| Mode option | `[data-test-id^="bard-mode-option-"]` | ✅ 仍在（**但 ID 改格式**，见 D 节）|
| user-query | `user-query` web component | ✅ 仍在 |
| model-response | `model-response` web component | ✅ 仍在 |
| message-actions | `message-actions` web component | ✅ 仍在 |
| response-container | `response-container` web component | ✅ 仍在 |
| query text | `.query-text` | ✅ 仍在 |
| 用户 aria-label | `a[aria-label*="@"]` | ✅ 命中侧栏底部账号按钮 |
| Chat 链接 | `a[href*="/app/"]` | ✅ 仍是 |

---

## B. 真废弃的选择器（**必须更新**）

| 用途 | v11 选择器 | v12 替代 |
|---|---|---|
| Conversation title 容器 | `.conversation-title-container`、`span.conversation-title`、`h1.conversation-title`、`[data-test-id="conversation-title"]` | **新版没有可见 title**。Chat header 用 `button[aria-label="Open menu for conversation actions."]`（注意句号）作为锚点；title 本身只剩 `h1.cdk-visually-hidden`（屏幕阅读器） |
| Send button | `button.send-button` | `button[aria-label="Send message"]` |
| User query text class | `.user-query-text` | `.query-text` 仍有，或直接走 `user-query` web component |
| Mode selected pill | `.bard-mode-list-button.is-selected` | `gem-menu-item.selected[data-active="true"]` 或 `gem-menu-item[data-active="true"]` |
| GDS pillbox | `button.gds-pillbox-button`、`button.pillbox-btn` | 模型 pill 已合并到 `button.input-area-switch` 的子文本 |
| `bottom-container` | `.bottom-container` | 不再存在（旧版用作 fallback），可直接删 |

---

## C. 新增有用选择器（**应当利用**）

| 用途 | 选择器 | 备注 |
|---|---|---|
| Chat row 三点菜单按钮（**batch_delete 关键**） | `button[aria-label^="More options for "]` | DOM 中**常驻**（has-hovered-trailing-content），不必 hover 才出现 |
| Chat row 容器 | `gem-nav-list-item[data-test-id="conversation"]` | 单行包裹元素 |
| 全部对话列表容器 | `conversations-list[data-test-id="all-conversations"]` | 比扫 `a[href*="/app/"]` 更精确 |
| Chat header 区（**export 关键**） | `button[aria-label*="Open menu for conversation actions"]` 的父 `gem-icon-button` | 注入 export 📤 按钮的新锚点 |
| Mode picker 弹出菜单 | `[data-test-id="gem-mode-menu"][role="menu"]` | 比通用 `[role="menu"]` 精确 |
| Mode menu item | `gem-menu-item[role="menuitem"][data-mode-id="<hex>"]` | data-mode-id 是 16-hex hash |
| Delete menu item | `button[data-test-id="delete-button"]` | 替代 v11 的文本匹配，**更稳** |
| Share/Pin/Rename | `[data-test-id="share-button" / "pin-button" / "rename-button"]` | 都有 data-test-id |
| Conv container | `.conversation-container.message-actions-hover-boundary` | 单条消息（user+model）的最外包裹 |
| User message anchor (a11y) | `h2.cdk-visually-hidden` 文本 "You said ..." | 屏幕阅读器隐藏，但稳定 |
| Gemini message anchor (a11y) | `h2.cdk-visually-hidden` 文本 "Gemini said" | 同上 |
| 模型按钮显示文字 | `button.input-area-switch .picker-primary-text` | 当前模型名展示 |

---

## D. 模型 ID 映射（**关键 — 影响 default_model 与 counter**）

| Display name | v11 `data-mode-id` | v12 `data-mode-id` | 备注 |
|---|---|---|---|
| 3.5 Flash | `flash` | `56fdd199312815e2` | All-around help（当前默认） |
| 3.1 Flash-Lite | `flash-lite`（不存在过） | `8c46e95b1a07cecc` | Fastest answers（新增） |
| 3.1 Pro | `pro` | `e6fa609c3fa255c0` | Advanced math and code |
| Thinking level | `thinking-toggle` | (子菜单，value="thinking_level") | 拆成独立子菜单 |

**重要**：mode-id hash 可能因账号/A-B 测试不同。default_model.js **不能写死 hash**，必须用**文本关键词匹配**（如包含 "Flash-Lite" → flash-lite）。

---

## E. Quote reply / drag-drop 探测结论

- **Quote reply 触发**：`document.addEventListener('selectionchange')` 仍可用（不依赖特定 DOM）。FAB 注入到 `model-response` 的祖先 `.conversation-container` 即可。
- **Drag drop**：原生 dragstart/drop 事件仍可用。chat row 是 `gem-nav-list-item`，注入 draggable 属性即可。

---

## F. 影响修订（vs 第一轮）

| 第一轮判定 | 第二轮修订 |
|---|---|
| ❌ `input-area-v2` 全失效 | ✅ **仍在** |
| ❌ `.conversation-title-container` 全失效 | ✅ 确实失效（只此一项可见 UI 锚） |
| ❌ `bard-mode-menu-button` 失效 | ✅ **仍在** |
| ❌ `bard-sidenav` 失效 | ✅ **仍在** |
| ⚠️ batch_delete 大概率重写 | 🟢 **新版反而更容易**（DOM 常驻 More 按钮 + data-test-id="delete-button"） |
| ⚠️ default_model 未知 | 🟡 改用文本匹配 + 持久化 hash |

**总体工作量评估**：从「3 天大重构」修订为「集中改 native_ui.js + default_model.js + counter.js + ui_tweaks.js 部分选择器」，**1~2 天可完成 + 抽 adapter**。
