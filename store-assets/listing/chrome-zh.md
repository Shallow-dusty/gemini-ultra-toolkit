# Chrome Web Store 商品页 — 中文（简体）

_在 Chrome Web Store Developer Dashboard 添加"中文（简体）"翻译时使用。_

---

## 商品名称

`Primer++ for Gemini™`

> 商店列表保持英文原名（避免商标翻译歧义）。

## 简短摘要

> 字段上限：**132 字符**。

```
非官方 Gemini™ 增强助手：每日计数、热力图、配额追踪、对话文件夹、Prompt 库、数据导出。数据完全本地，开源。
```

> 56 字。

## 详细描述

```
Primer++ for Gemini™ 是一款非官方、开源的 Google Gemini 网页版增强扩展，为 gemini.google.com 添加多个相互独立的实用模块，把它变成一个你能真正追踪与组织的工作空间。所有数据都在你的浏览器里本地处理；不需要账号，不上传任何遥测，不做云端同步。

═══════════════════════════════════════
功能模块
═══════════════════════════════════════

• 计数器 Counter — 按模型（Flash / Pro / Thinking）分别统计每日消息数，显示按自定义重置时间计算的日窗口，记录连续使用天数与周趋势，并以加权方式计算配额进度条，让你随时知道距离自定义上限还有多远。

• 热力图 Dashboard — 类似 GitHub 的全年使用热力图，可下钻查看单日明细与各模型占比。

• 文件夹 Folders — 把侧边栏对话分组到自建文件夹，支持拖拽排序、颜色标记、置顶、批量移动、一步本地撤销、JSON 导入 / 导出，以及可选的自动归类规则（正则或关键词）。

• 导出 Export — 将使用报告、当前可见对话记录，或侧边栏中选中的对话导出为 JSON / Markdown / TXT / HTML / DOCX，也可把有长度限制的对话片段包插入输入框。

• Prompt 库 Prompt Vault — 收藏常用 prompt，按标签整理，一键插入到输入框，也可把 prompt chain 分步加入队列，并可撤销本地 prompt 删除。库可以 JSON 格式导入 / 导出。

• 消息队列 Message Queue — 在本地排队多个 prompt，包括 Prompt Vault 的 chain step，并可从悬浮面板开始、暂停、取消或重排发送顺序。

• 默认模型 Default Model — 打开新对话时自动切换到你常用的模型（Flash / Pro / Thinking）。

• 批量删除 Batch Delete — 在侧边栏多选对话，一次确认后批量删除。

• 引用回复 Quote Reply — 把任意对话里的选中文字带引用插入到下一条 prompt。

• 对话笔记 Chat Notes — 为重要对话保存本地笔记和置顶标记，换浏览器时可用 JSON 导入 / 导出，也可手动插入包含标题、链接、对话 ID 和本地笔记的单条引用包或置顶笔记包。

• 界面微调 UI Tweaks — 标签页标题与对话标题同步、自定义 Ctrl+Enter 行为、显示输入字数计数、调整对话宽度、隐藏未使用的 Gems。

每个模块都可在设置面板独立开关。悬浮面板可拖动、可换主题（Glass / Cyber / Paper / 自动跟随系统），位置按浏览器配置文件记忆。

═══════════════════════════════════════
隐私与数据
═══════════════════════════════════════

• 所有数据存放在你设备本地的 chrome.storage.local 中。
• 任何数据都不会上传 — 不传给开发者，不传给任何分析服务，不传给任何地方。
• 只有当你明确保存到 Prompt Vault 或加入 Message Queue 时，prompt 文本才会被读取并保存在本地。只有当你明确导出当前对话、选中对话记录，或插入有长度限制的对话片段包时，可见的 Gemini 对话文本才会被读取。Chat Notes 的上下文插入只使用本地保存的标题 / 链接 / ID / 笔记。
• 唯一申请的 host 权限：https://gemini.google.com/*。
• 完整隐私政策：https://github.com/Shallow-dusty/primer-pp/blob/main/PRIVACY.md

═══════════════════════════════════════
开源
═══════════════════════════════════════

MIT 许可。源码、Issue、发布记录：
https://github.com/Shallow-dusty/primer-pp

同一仓库也提供 Tampermonkey / Violentmonkey 油猴脚本版本。

═══════════════════════════════════════
免责声明
═══════════════════════════════════════

Primer++ for Gemini™ 是非官方社区项目。Gemini™ 是 Google LLC 的商标。本扩展与 Google 无关联、未经其背书、亦非由其赞助。扩展不修改 Google 的服务端，只在你自己的浏览器内增强 Gemini 网页的外观与交互。
```

## 分类

`Productivity / 效率`

---

## 单一用途 Single Purpose

```
通过本地化的效率工具增强 gemini.google.com 的 Gemini 网页版体验：使用计数、对话文件夹、收藏 prompt、消息队列、对话笔记、批量操作。
```

---

## 权限说明（翻译版，提交时建议英文为主，此处仅参考）

### `storage`

```
仅在用户设备本地保存偏好设置与按账号隔离的数据：每日消息计数（Counter 模块）、文件夹定义（Folders 模块）、收藏的 prompt（Prompt Vault 模块）、排队的 prompt（Message Queue 模块）、本地对话笔记、置顶标记和引用元数据（Chat Notes 模块）、悬浮面板位置、当前主题、各模块启用状态。所有数据写入 chrome.storage.local，不传输到设备之外的任何地方。
```

### `contextMenus`

```
为扩展工具栏图标的右键菜单添加一个 "Reset Panel Position" 项，用户把悬浮面板拖出屏幕时可以一键复位。不向页面上下文菜单添加任何项。
```

### Host 权限：`https://gemini.google.com/*`

```
扩展的内容脚本只在 Google Gemini（https://gemini.google.com/*）上运行 — 这是它增强的唯一网页应用。脚本读取侧边栏对话标题、当前选中的模型、当前登录的账号标签、以及消息发送事件，以便页面内悬浮面板能展示每日计数、管理文件夹、快速插入 prompt 或用户明确选择的本地 Chat Notes 引用。当用户明确导出对话记录或插入对话片段包时，脚本会读取当前或选中对话的可见内容，并写入本地下载文件或把有长度限制的文本插入输入框。扩展未申请 <all_urls> 或任何其他 host 权限。
```

### 远程代码

```
否。扩展打包时已把所有 JavaScript 内嵌在 content.js 与 background.js 中。运行时不从任何远程源加载代码。不使用 eval、Function 构造器、innerHTML / insertAdjacentHTML 或 script 标签注入。
```
