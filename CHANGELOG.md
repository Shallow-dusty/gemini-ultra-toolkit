# Primer++ for Gemini — Changelog

> Formerly known as "Gemini Counter Pro" (v1–v8) → "Gemini Primer++" (v9–v10.17) → "Primer++ for Gemini™" (v10.17+)

### Unreleased

- **Prompt chain queueing**: Prompt Vault can add a prompt chain to Message Queue as separate local queue items, so each step remains pause/cancel/reorder controlled before sending.
- **Quota reset-window framing**: Counter now shows the active daily reset window and time until reset, using the configured reset hour without pretending to track unrecorded 5h/weekly rolling windows.
- **Local context references**: Chat Notes can insert an explicit local reference packet into the Gemini composer using saved title, link, chat ID, and local note data; it does not read hidden transcript content.
- **Local folder undo**: folder moves, batch moves, unassignments, and local folder deletes now keep a one-step in-memory undo record with conflict-safe restore behavior.
- **Local data portability**: folders and chat notes now have versioned JSON export/import alongside the existing Prompt Vault JSON import/export.
- **Test coverage**: added `lib/folder_tools.js`, `lib/chat_notes_store.js`, and `lib/context_packet_tools.js` unit coverage for local folder undo, folder import/export, notes import/export, and context reference formatting edge cases.

### v11.0 Current Release Cleanup

> _2026/05/05_

- **Branding and store readiness**: aligned public name to `Primer++ for Gemini™`, added unofficial/community disclaimer, and synchronized userscript metadata, extension manifest, README, and generated userscript.
- **Security/dependency cleanup**: updated `brace-expansion` to 5.0.5 through `npm audit fix`; `npm audit --audit-level=moderate` now reports 0 vulnerabilities.
- **Accessibility and i18n**: added modal focus traps, keyboard-operable close controls, focus-visible styles, reduced-motion guards, and localized key panel/settings/dashboard strings through `NativeUI.t()`.
- **Docs consolidation**: replaced obsolete long-form planning/audit documents with current status, roadmap, and audit-state docs.
- **Smoke checks**: added `tests/app_smoke.test.js` for release metadata, manifest scope, accessibility guards, and dependency-audit pin.

### 📦 v9.x Series: Native UI Integration (原生界面集成)

#### **v9.2**

> _2026/02/10_

- **🌐 NativeUI Framework**: 新增原生 UI 注入框架，模块可将 UI 元素嵌入 Gemini 原生界面
- **📤 Export Native Button**: 聊天标题栏旁注入 📤 导出按钮，下拉菜单选择 JSON/CSV/Markdown
- **💎 Prompt Vault Quick Menu**: 输入框旁注入 💎 按钮，弹出提示词快捷菜单一键插入
- **🗑️ Batch Delete Sidebar**: 侧边栏注入批量管理工具栏，复选框覆盖对话项，支持全选/批量删除
- **📁 Folders Filter Bar**: 侧边栏顶部注入文件夹筛选标签栏，按分组过滤对话
- **🔒 Default Model Indicator**: 模型切换按钮旁显示 🔒 锁定指示器
- **🎨 UI Tweaks Status Dots**: 输入框旁 3 个微型状态指示点
- **📖 Module Onboarding**: 首次启用模块时弹出引导页面（吐槽风格 + 使用说明），支持中英文切换
- **🔧 Code Review Fixes**: 修复 5 个 BUG + 6 个设计问题（AbortController 菜单生命周期、侧边栏注入顺序、position:relative 安全检查、NativeUI.t() 双语支持等）
- **🧩 Module Interface Extension**: 新增 `injectNativeUI()`, `removeNativeUI()`, `getOnboarding()` 可选方法

#### **v9.1**

> _2026/02/10_

- **📑 Details Pane Tab Navigation**: 详情面板新增 Tab 导航，模块内容分标签页显示
- **📐 Compact Extensions**: Feature Extensions 区域紧凑布局优化
- **📏 Height Limit**: 详情面板最大高度限制，防止内容溢出

#### **v9.0**

> _2026/02/10_

- **🏗️ Full Feature Platform**: 8 个模块全部就绪的完整功能平台
- **📊 Counter** | **📤 Export** | **📁 Folders** | **💎 PromptVault** | **🤖 DefaultModel** | **🗑️ BatchDelete** | **💬 QuoteReply** | **🎨 UITweaks**

---

### 📦 v8.x Series: Full Feature Platform (全功能平台)

#### **v8.12**

> _2026/02/10_

- **🎨 UITweaksModule**: 新增 UI 自定义合集模块，包含 5 个子功能开关
- **📑 Tab Title Sync**: 自动同步对话标题到浏览器 Tab (MutationObserver 监听)
- **⌨️ Ctrl+Enter Send**: 拦截普通 Enter 键发送，仅 Ctrl+Enter 触发发送按钮
- **📏 Chat Width**: 自定义聊天区域最大宽度 (CSS `max-width` 覆盖)
- **📐 Sidebar Width**: 自定义侧栏宽度 (CSS `width` + `min-width` 覆盖)
- **👁️ Hide Gems**: 隐藏侧栏 Gems 入口链接
- **⚙️ Sub-feature Toggles**: 每个子功能独立开关，带数值的功能 (宽度) 额外显示数字输入框
- **💾 Persistent Config**: 子功能状态通过 GM_setValue 持久化存储
- **🔌 Module Toggle**: 在 Feature Extensions 中启用/禁用，默认关闭

#### **v8.11**

> _2026/02/10_

- **💬 QuoteReplyModule**: 新增引用回复模块，选中 Gemini 回复文本后快速引用
- **🎯 Smart FAB**: 选中文本后在光标旁浮现 "💬 Quote" 按钮，5 秒自动消失
- **📝 Blockquote Format**: 选中内容自动格式化为 `> ` 前缀引用，逐行插入编辑器
- **🛡️ Scope Guard**: 仅响应聊天区域文本选中，忽略面板内和输入框内选择
- **⌨️ Editor Integration**: 自动清除空白编辑器状态、触发 input 事件、聚焦并定位光标到末尾
- **🔌 Module Toggle**: 在 Feature Extensions 中启用/禁用，默认关闭

#### **v8.10**

> _2026/02/10_

- **🗑️ BatchDeleteModule**: 新增批量删除模块，在面板中批量选择并删除对话
- **☑ Checkbox Selection**: 面板详情区显示所有侧栏对话，点击复选框多选
- **⚡ Batch Operations**: Select All / Deselect All 快速操作，红色 Delete 按钮带确认提示
- **🔄 Progress Feedback**: 批量删除时显示实时进度（N/M），模拟三点菜单→删除→确认流程
- **🧩 Module Details Pane**: 通用模块面板渲染接口，已启用模块自动在详情面板显示内容
- **🔌 Module Toggle**: 在 Feature Extensions 中启用/禁用，默认关闭

#### **v8.9**

> _2026/02/10_

- **🤖 DefaultModelModule**: 新增默认模型模块，新对话自动选择首选模型
- **⚡ Auto-Switch**: 检测新对话创建后自动打开模型菜单并选择首选模型 (Fast/Thinking/Pro)
- **🎯 Smart Detection**: URL 轮询检测新对话，使用 `data-test-id` 精准定位模型选项
- **⚙️ Module Settings**: Settings 面板自动渲染已启用模块的配置区（通用 `renderToSettings` 接口）
- **🔌 Module Toggle**: 在 Feature Extensions 中启用/禁用，默认关闭

#### **v8.8**

> _2026/02/10_

- **💎 PromptVaultModule**: 新增 Prompt 金库模块，保存和快速插入常用 Prompt 模板
- **📂 Category Grouping**: Prompt 按分类分组显示（General/Coding/Writing/Custom），折叠展开
- **✏️ CRUD Editor**: 完整的新增/编辑/删除 Prompt 模态框，支持名称、分类、内容
- **📋 Quick Insert**: 点击 Prompt 一键插入到 Gemini 输入框 (`div.ql-editor[contenteditable]`)
- **🔌 Module Toggle**: 在 Feature Extensions 中启用/禁用，默认关闭

#### **v8.7**

> _2026/02/10_

- **📊 Model Distribution Chart**: Dashboard 新增模型使用分布条形图（Flash/Thinking/Pro），彩色比例条 + 百分比
- **⚖️ Weighted Summary**: 图表下方显示加权总计和原始消息总数
- **🎨 Themed Bars**: 条形图使用 CSS 变量适配所有主题

#### **v8.6**

> _2026/02/10_

- **🤖 Auto-Classification Rules**: 文件夹编辑模态框新增规则编辑器，支持关键词匹配和正则表达式 (`/pattern/`)
- **⚡ Auto Classify Button**: 文件夹区域新增「Auto Classify」按钮，一键根据规则自动分类未分配对话
- **📝 Rule Types**: 支持 `keyword`（纯文本包含匹配）和 `regex`（正则匹配），首匹配优先
- **💾 Rules Persistence**: 规则存储在文件夹数据中，随用户数据持久化

#### **v8.5**

> _2026/02/10_

- **☑ Batch Select Mode**: 文件夹区域新增「Select」模式，点击选中多个对话后批量移入指定文件夹或取消分类
- **📊 Folder Statistics**: 文件夹 badge 鼠标悬停显示统计信息（总关联数 vs 当前可见数）
- **🔲 Visual Checkboxes**: 批量模式下显示圆角复选框，选中对话蓝色高亮

#### **v8.4**

> _2026/02/10_

- **🔍 Folder Search**: 文件夹区域新增搜索栏，实时过滤对话标题和文件夹名称
- **📌 Folder Pin**: 文件夹支持置顶，置顶文件夹始终显示在列表最上方
- **🎨 Custom Hex Colors**: 文件夹颜色选择器新增 Hex 自定义输入，支持任意颜色值
- **🔎 Search Scope**: 搜索同时过滤已分类和未分类对话

#### **v8.3**

> _2026/02/10_

- **🔀 Folder Drag Reorder**: 文件夹可拖拽排序，拖动文件夹行到目标上方/下方即可重新排列
- **📋 Uncategorized View**: 详情面板新增「未分类」区域，显示不属于任何文件夹的对话，可折叠
- **🎯 Uncategorized Drag**: 未分类对话支持拖放到文件夹（直接从面板拖出）
- **🖱️ Visual Drag Feedback**: 文件夹重排时显示蓝色上/下边框指示器，聊天拖入时保留高亮效果

#### **v8.2**

> _2026/02/10_

- **📄 Paper Theme Overhaul**: 全面优化 Paper 浅色主题，新增 9 个 CSS 变量覆盖所有 UI 组件
- **🎨 Theme Variables Expansion**: 所有主题新增 `--header-bg`, `--header-border`, `--detail-bg`, `--overlay-tint`, `--input-bg`, `--divider`, `--badge-bg`, `--scrollbar-thumb`, `--code-bg`
- **🔧 Hardcoded CSS Cleanup**: 将 30+ 处硬编码 `rgba(255,255,255,...)` 替换为 CSS 变量，确保浅色/深色主题均正确渲染
- **🧩 Module CSS Compat**: FoldersModule 模态框、Dashboard、Debug 面板、Settings 等全部组件适配新变量系统

#### **v8.1**

> _2026/02/10_

- **📤 ExportModule**: 新增独立导出模块，支持 JSON / CSV / Markdown 三种格式
- **📊 CSV Export**: 包含日期、消息数、对话数、各模型计数、加权值，末行汇总
- **📝 Markdown Export**: 生成完整报告 (摘要表格 + 最近30天逐日明细 + 连续使用天数)
- **🔌 Module Toggle**: ExportModule 启用时替换原有 JSON 导出按钮，禁用时回退到内联 JSON 导出
- **🧪 Export Tests**: 新增 `lib/export_formatter.js` 可测试模块，22 个测试用例，100% 覆盖率

#### **v8.0**

> _2026/02/10_

- **⚖️ Precise Quota Tracking**: `dailyCounts` 新增 `byModel` 字段，每条消息记录所用模型 (Flash/Thinking/Pro)
- **📊 Weighted Quota**: 配额栏改用加权值计算 (Flash: 0x, Thinking: 0.33x, Pro: 1x)，显示 `"N msgs (M weighted) / limit"`
- **🔢 Model Breakdown**: 详情面板统计区新增今日模型分布 (三色圆点 + 计数)
- **🧪 Quota Tests**: 新增 `lib/quota_calc.js` 可测试模块，28 个测试用例，100% 覆盖率

---

### 📦 v7.x Series: Modular Architecture (模块化架构)

#### **v7.8**

> _2026/02/10_

- **🌐 Multi-language Send Detection**: 全版本发送按钮检测改用 `button.send-button` 类选择器（语言无关），`aria-label` 作为后备
- **🏷️ Model Labels**: 面板徽章更新为精确模型名 (3 Flash / 3 Flash Thinking / 3 Pro)
- **🗺️ i18n Model Detection**: `MODEL_DETECT_MAP` 扩展支持 EN/ZH/JA/KO 四语言 (高速/빠른/사고)
- **🛡️ CSP Cleanup**: 消除全部版本的 `innerHTML`，Standard 版补齐 `contenteditable` 检测
- **🧹 Code Quality**: 修复拖拽事件监听器泄漏，缩小 FoldersModule Observer 范围，归档旧版本文件

#### **v7.7**

> _2026/02/10_

- **🔧 Data Calibration**: Settings 新增手动校准功能，支持直接编辑 Today/Lifetime/Chats/当前对话计数
- **🤖 Model Detection Fix**: 适配 Gemini 3 UI 重命名 (Flash → Fast)，新增 `data-test-id` 后备选择器
- **📝 文档修复**: 更新 CLAUDE.md 测试描述和架构图，修复 CHANGELOG v6.5 日期

#### **v7.6**

> _2026/02/06_

- **🧩 Shared Logger Module**: 日志逻辑抽离到可测试模块，并同步注入脚本
- **🧪 Test Coverage**: 纯逻辑模块覆盖率 100%，新增同步脚本 `scripts/sync_logger.js`

#### **v7.5**

> _2026/02/06_

- **✅ Test Suite**: 新增测试用例与覆盖率配置，目标覆盖率 100%
- **🧪 Debug Logger Tests**: 核心日志/过滤逻辑加入单元测试
- **📦 Test Runner**: 增加 `package.json` 与 `c8` 覆盖率配置

#### **v7.4**

> _2026/02/05_

- **🧰 Debug Panel**: 设置中新增调试入口，提供可视化诊断面板
- **📝 日志系统**: 支持日志级别、持久化存储与一键导出
- **🧭 Debug 工具集**: 导出存储/导出日志/快速查看用户识别与存储 Key
- **🎨 UI 调整**: Pro/Ultra 徽标移动到用户名旁边，模型徽标样式优化

#### **v7.1**

> _2026/01/28_

- **📁 文件夹模块 (FoldersModule)**: 完整实现对话文件夹功能 (Pure Enhancement 方式)
  - **不修改原有布局**: 仅在侧边栏聊天项添加小圆点颜色标记
  - **面板内管理**: 文件夹列表在我们的面板详情区展示
  - 创建/编辑/删除文件夹
  - 8 种预设颜色可选
  - 从侧边栏拖拽聊天到面板内的文件夹
  - 文件夹折叠/展开
  - 点击聊天项导航到对应对话
  - 用户数据隔离存储
- **🎯 Option C 设计**: 遵循"纯增强"原则，不破坏 Gemini 原有 UI
- **🔄 MutationObserver**: 监听侧边栏变化，自动同步颜色标记

#### **v7.0**

> _2026/01/28_

- **🏗️ 模块化重构 (Modular Architecture)**: 将代码重构为 Core + Module 架构，支持功能扩展。
- **📦 模块注册系统 (Module Registry)**: 新增模块注册、启用/禁用、生命周期管理机制。
- **🎛️ Feature Extensions 面板**: Settings 中新增"功能扩展"区域，支持开关各模块。
- **🔌 CounterModule**: 原计数功能封装为独立模块，支持动态启用/禁用。
- **📁 FoldersModule (占位)**: 文件夹模块框架就绪，默认禁用，待后续实现。
- **🧩 Core 层**: 抽取共享基础设施 - 用户检测、主题系统、存储管理、URL 工具。
- **🎨 Toggle Switch UI**: 新增滑动开关组件，用于模块启用/禁用。

---

### 📦 v6.x Series: Data Visualization (数据可视化)

#### **v6.6**

> _2026/01/28_

- **🤖 模型检测 (Model Detection)**: 自动识别当前使用的模型 (Flash/Thinking/Pro)，在面板显示彩色徽章。
- **👤 账户类型识别**: 自动检测用户订阅状态 (Free/Pro/Ultra)，显示对应徽章。
- **📊 配额进度条 (Quota Bar)**: 新增可视化进度条，显示今日消息使用量，支持在设置中自定义上限。
- **✨ 数字跳动动画 (Bump Animation)**: 消息计数增加时触发弹跳动画，视觉反馈更明确。
- **🎨 Glass 2.0**: 升级磨砂玻璃效果 - `blur: 18px`, `saturate: 180%`，视觉层次更丰富。
- **📄 Paper 主题修复**: 降低背景亮度至 88%，优化边框和按钮颜色，减少视觉刺激。
- **🎯 默认位置调整**: 面板默认位置改为右上角 (right: 220px, top: 20px)。
- **⚡ 过渡动画优化**: 全局使用 `cubic-bezier(0.4, 0, 0.2, 1)` 缓动函数，动效更流畅。

#### **v6.5**

> _2026/01/27_

- **🐛 Bug Fixes**:
  - 修复 `handleReset` 确认逻辑错误 (Today/Chat 模式下第一次点击无响应)
  - 修复 `visibilitychange` 事件未触发数据刷新的问题
  - 修复 `resetStep` 在切换视图后未正确重置的问题
- **🔄 功能恢复**: 从 git 历史中恢复了丢失的 365 天热力图、Profiles 列表和 Dashboard 功能
- **🧹 代码清理**: 移除重复的注释块，统一代码风格

#### **v6.3**

> _2025/12/24_

- **🔄 即时同步 (Active Sync)**: 修复了多标签页切换时数据延迟同步的问题。当窗口重新获得焦点时，现在会强制拉取最新数据，确保 UI 始终显示最新状态。
- **🐛 稳定性修复**: 修复了 v6.2 中的一个语法错误导致的逻辑阻断，以及 "Panel off-screen detected" 误报问题。
- **🔍 Debug 系统**: 增强了 Chat ID 匹配的容错性，并移除了可能导致性能问题的过量日志。

#### **v6.2**

> _2025/12/09_

- **📈 热力图体验升级 (Heatmap UX)**:
  - 实装了 **Grid Axes** (顶部月份 + 左侧星期坐标)，数据可读性与 GitHub/GitLab 对齐。
  - 新增 **Auto-Scroll** 机制，仪表盘打开时热力图自动滚动至最右侧（今日），无需手动拖拽。
- **🎈 智能 Tooltip (Smart Tooltip)**:
  - 移除了原生的 Title 属性，替换为 **Custom Tooltip** 浮层。
  - 实现了 **Viewport Clamping** (边缘检测)，确保提示框永远不会被屏幕边缘遮挡。
- **🚀 性能优化**: Tooltip 逻辑完全移除 DOM 注入，彻底解决 CSP 风险，响应更流畅。

#### **v6.1**

> _2025/12/09_

- **📊 独立数据仪表盘 (Analytics Dashboard)**: 新增全屏级统计面板，点击详情页底部的 `📊 Stats` 按钮进入。
- **🔥 年度热力图 (Activity Heatmap)**: 引入 GitHub 风格的年度活跃度热力图，可视化展示过去 365 天的对话频率。
- **🏆 连胜统计 (Streak Tracking)**: 自动计算 "Current Streak" (当前连续打卡天数) 和 "Best Streak" (历史最佳连胜)。
- **💎 核心指标**: 仪表盘顶部展示 Lifetime Messages, Chats Created 等关键数据卡片。
- **UI 优化**: 详情面板底部操作区重新布局，分离了统计与设置入口。

#### **v6.0.1**

> _2025/12/09_

- **🐛 核心修复**: 解决了新窗口/新会话中首次交互计数丢失的竞态 Bug (Guest 状态合并机制)。
- **🔍 识别增强**: 增加 `img[alt]` 选择器，提高用户检测速度。

#### **v6.0**

> _2025/12/09_

- **📈 历史曲线图 (Usage Chart)**: Settings Modal 中新增过去 7 天的消息数折线图，纯 SVG 实现，无外部依赖。
- **🎨 图表特性**: 填充区域 + 折线 + 数据点 + 日期标签，支持主题色适配。
- **📊 数据洞察**: 直观展示每日使用趋势，一目了然。

---

### 📦 v5.x Series: The Ultimate Edition (企业级/多用户/主题)

_这一阶段不仅完善了功能，更是在与 Google 严格的 CSP 安全策略博弈中取得了最终胜利。_

#### **v5.6.1**

> _2025/12/08_

- **🔧 整合油猴菜单**: Reset Position 按钮现已移入 Settings Modal，所有功能统一在 UI 中操作。
- **🧹 精简菜单**: 移除冗余的 Set Reset Hour 菜单项 (已在 Settings 中有下拉选择)。

#### **v5.6**

> _2025/12/07_

- **⚙️ 高级设置面板 (Settings Modal)**: 新增独立设置弹窗，通过 Details 面板底部 "Settings" 按钮进入。
- **🕐 Reset Hour 下拉选择**: 每日重置时间现可通过下拉菜单直接选择 (0-23 点)，无需记忆油猴菜单位置。
- **📤 数据导出**: Settings 中新增 "Export Data (JSON)" 功能，一键导出当前用户的统计数据。
- **🎨 Modal 主题适配**: 设置面板自动继承当前主题配色。

#### **v5.5**

> _2025/12/07_

- **📅 每日配额追踪 (Daily Quota)**: 用 "Today" 替代了原有的手动 Session，自动按日重置。默认凌晨 0 点重置，可通过油猴菜单自定义重置时间（支持 0-23 点）。
- **💬 累计对话数 (Chats Created)**: 新增统计维度，记录历史累计创建的对话数量。
- **🕐 可调重置时间**: 通过油猴菜单 `⏰ Set Reset Hour` 设置每日配额的重置时间点，适配不同模型的配额规则。
- **🗃️ 数据结构升级**: 引入 `dailyCounts` 按日存储数据，为后续周/月统计和历史曲线图功能铺路。
- **🔄 向下兼容**: 自动迁移旧版 Session 数据到新的 Daily 结构。

#### **v5.4**

> _2025/12/07_

- **🧱 视口自适应 (Adaptive Viewport)**: 新增 `Adaptive Viewport Check` 机制。在窗口尺寸改变或多屏切换导致面板坐标溢出屏幕时，自动检测并重置面板位置到默认安全区域，彻底解决“面板消失”的问题。
- **🧹 代码优化**: 优化了 Panel 初始化的位置应用逻辑，并同步修补了 Standard/Simple 版本。

#### **v5.3**

> _原 V17 - 2023/xx/xx_

- **⚡ 核心重构**: 彻底弃用 `innerHTML` 清空容器，改用原生 `replaceChildren()`，根除所有潜在的 TrustedHTML 报错。
- **🧠 智能逻辑**: 优化“新对话”判定逻辑。采用 **智能轮询机制 (Smart Polling)**，在 10 秒内持续检测 URL 变化，确保即使网络延迟也能精准捕获新 Chat ID 并归档计数，彻底解决新窗口计数丢失问题。
- **💾 数据持久化**: 修复了 Session 计数在页面刷新后丢失的问题，现在 Session 数据会写入本地存储。
- **🔄 实时同步**: 重新引入多标签页同步机制，当在一个窗口操作时，其他窗口的 UI 会实时更新。
- **✅ 修复**: 修复了详情面板在展开/切换视图时的渲染 Bug。

#### **v5.2**

> _原 V16 - 2023/xx/xx_

- **🛡️ 容错机制**: 引入身份识别超时降级策略。如果 2 秒内未提取到邮箱，自动降级为 `Local_User`，防止面板卡在 "Initializing..."。
- **🔍 识别增强**: 增加了对中文环境（"帐号"）和 Google 通用顶部栏的 DOM 识别规则。

#### **v5.1**

> _原 V15 - 2023/xx/xx_

- **🎨 新增功能**: 引入 **Theme Engine (主题引擎)**，支持 Glass (默认)、Cyber (赛博朋克)、Paper (白纸) 三种风格。
- **👥 新增功能**: 引入 **Profiles (用户画像)** 列表，支持跨账户查看数据（View Only 模式）。
- **🐛 修复**: 修复了新开 Chat 时 URL 未变化导致计数错误归类的问题。
- **📝 记录**: _[Build v14 被撤回]_ 因在构建用户列表时使用了模板字符串导致 CSP 崩溃，v5.1 全面改回纯 DOM 构建。

#### **v5.0**

> _原 V13 - 2023/xx/xx_

- **🚀 重大更新**: 实现了 **Multi-User Support (多用户隔离)**。
- **⚙️ 技术细节**: 自动提取 Google 账号邮箱作为主键，不同账号的数据完全隔离，互不干扰。
- **📦 数据迁移**: 首次运行时自动将旧版本的单机数据迁移至当前登录账号。

---

### 🌿 Alternative Branch: Simple Sync (简约同步版)

#### **v6.0 (Legacy Sync)**

> _对应文件: GeminiCounter_Simple.user.js_

- **定位**: v2.x 系列的最终形态，Gemini Counter Pro 的直系后代。
- **特性**: 保留了 v2.x 的单计数器逻辑，但引入了 v5.x 级别的 UI 和 v2.1 的同步核心。
- **状态**: 已归档。适合不需要仪表盘、只想要一个简单计数器的用户。

---

### 📦 v4.x Series: Compatibility (兼容性更新)

#### **v4.0**

> _原 V12 - 2023/xx/xx_

- **🛡️ 防冲突**: 为面板添加 `translate="no"` 和 `class="notranslate"` 属性。
- **🔧 解决痛点**: 完美解决了与“沉浸式翻译”等插件同时使用时，因 DOM 被强行翻译修改而导致的脚本崩溃问题。

---

### 📦 v3.x Series: Dashboard (仪表盘与统计)

#### **v3.1**

> _原 V11 - 2023/xx/xx_

- **📊 交互升级**: 引入 **Dashboard View (仪表盘视图)**。
- **✨ 特性**: 支持点击列表行切换主视图（Session / Chat / Lifetime），按钮功能随上下文自动变化（重置当前/重置历史）。

#### **v3.0**

> _原 V10 - 2023/xx/xx_

- **📈 重大更新**: 新增 **Expandable Details (折叠详情页)**，支持查看当前窗口计数与历史总计。
- **🔒 安全重置**: 引入“三级确认锁”机制（Sure? -> Really?），防止误删历史数据。
- **📝 记录**: _[Build v9 被撤回]_ 因在详情页使用了 `innerHTML` 触发 TrustedHTML 报错，v3.0 进行了纯 DOM 重写。

---

### 📦 v2.x Series: GUI & Sync (界面与同步)

#### **v2.3**

> _原 V8 - 2023/xx/xx_

- **🚑 紧急修复**: 修复了 v2.2 中为了加“小绿点” UI 而引入的 CSP 安全报错，回归纯 DOM 操作。

#### **v2.2**

> _原 V7 - 2023/xx/xx_

- **🧱 边界物理**: 引入窗口拖拽的“空气墙”，防止面板被拖出屏幕可视区域。
- **🆘 救援功能**: 在油猴菜单中新增 "Reset Position"，用于在窗口位置异常时一键复位。

#### **v2.1**

> _原 V6 - 2023/xx/xx_

- **🔄 核心升级**: 引入 `GM_addValueChangeListener`。
- **✅ 解决痛点**: 解决了多标签页（Tab A / Tab B）同时使用时数据不同步、相互覆盖的竞态条件问题。

#### **v2.0**

> _原 V5 - 2023/xx/xx_

- **🎨 UI 重构**: 从简单的文本框升级为 **Glassmorphism (磨砂玻璃)** 悬浮窗。
- **🖐️ 交互**: 支持自由拖拽与位置记忆。

---

### 📦 v1.x Series: Core Foundation (核心功能)

#### **v1.1**

> _原 V4 - 2023/xx/xx_

- **⌨️ 体验优化**: 引入输入法状态检测 (`isComposing`)。
- **✅ 解决痛点**: 修复了中文输入法按回车选词时会被误判为发送消息的 Bug。

#### **v1.0**

> _原 V1-V3 整合_

- **🚀 初始发布**: 基于原生 DOM API 的计数器。
- **⚙️ 核心技术**: 绕过 `innerHTML` 限制，利用 `Observer` 监听 SPA 页面变化，实现基础计数功能。
