# Primer++ for Gemini — 发布前深度调研报告

**调研日期**：2026-04-18
**目标产品**：`github.com/Shallow-dusty/primer-pp`（Tampermonkey userscript + Chrome MV3 Extension 双产物）
**产品面向**：Google Gemini 网页版 (gemini.google.com) 用户，中国市场优先
**调研范围**：竞品盘点、国内用户生态、Voyaga/Voyager 专题、命名版权风险、差异化定位

---

## 执行摘要（TL;DR）

1. **Voyaga 案例已经发生，且直接印证最大风险**：Voyager（原名 Gemini Voyager）于 2026 年 3 月因收到 **Google 官方商标投诉**被迫改名并从 Chrome Web Store 下架，开发者 Nagi-ovo 在 GitHub Issue #428 明确引用 Google 原话 "received a trademark complaint from Google regarding the use of 'Gemini' in the extension name"。当前 5 万用户 + 5.0/615 评分，是现在 Gemini 增强类扩展里**规模和口碑最接近用户目标定位**的产品。
2. **Google 的命名规则白纸黑字**：Chrome Web Store Branding Guidelines 要求 "for"/"for use with"/"compatible with" + 商标 + ™ 的表述形式，且**商标字号要小于自己的 logo**。这正是 Superpower for Gemini™、Folders for Gemini、UI Enhancer for Gemini 等**合规幸存者**采用的命名范式。"Gemini <YourName>"（Gemini 前置）是触发投诉的高风险模式。
3. **"Primer" 这个名字本身在 AI/软件领域已严重冲突**：至少 3 家独立 AI 公司在用（Primer Technologies Inc `primer.ai` 97 人 NLP 公司 / 2025 年 YC Fall 批次的 Primer AI Product Demos / 金融分析 Primer App）。"++" 前缀无法降低商标近似度判定。
4. **竞品市场红海，但差异化窗口仍在**：现有 Gemini 专用扩展多数是单功能（只做文件夹、只做宽屏、只做导出），"All-in-one 模块化套件"路线只有 Voyager 和 Superpower 两家占据，且 Voyager 刚刚下架，**留下真空期**。

---

## 1. Chrome Web Store 竞品盘点（海外）

按用户量排序，数据源自 Chrome Web Store 官方页面（截至 2026-04-18）。

| # | 扩展名 | 开发者 | 用户数 | 评分(数) | 价格 | 核心功能 | 更新日期 |
|---|--------|--------|-------|---------|------|---------|---------|
| 1 | **Voyager** (原 Gemini Voyager) | Nagi-ovo / help.gemini.voyager@gmail.com | 50,000 | 5.0 (615) | 免费 | 时间轴导航、文件夹、提示词库、导出、宽度调节、Google Drive 同步、多账户 | 2026-04-07 (v1.3.9) |
| 2 | **增强 Gemini (Enhance Gemini)** | champagne | 10,000 | 4.1 (24) | 免费 | 右键搜、omnibox 集成、关键词快捷 | 2024-03-22（久未更新） |
| 3 | **Superpower for Gemini™** | David Košnar (SulfurByte, CZ) | 6,000 | 4.7 (89) | 免费+IAP | 原生文件夹、每日配额计数器、PDF/DOCX 导出、消息队列、提示词库、Pro: Drive 同步 | 2026-04-14 |
| 4 | **Toolbox for Gemini ǀ Folders, Export, Bulk Delete** | Hamza Wasim (browserlab.io) | 4,000 | 4.6 (70) | 免费+IAP | 文件夹/子文件夹、PDF/HTML/MD/TXT/CSV 导出、图库、置顶、提示词库、AI 提示词增强、批量删除、字数计数 | 2026-01-26 |
| 5 | **Folders for Gemini** | Distorted Signal | 2,000 | 4.1 (34) | 免费 | 拖拽文件夹、12 色标签、纯文件夹 | 2026-04-11 |
| 6 | **Gemini Chat Exporter** | N/A | 3,000+ | 2.5 | 免费 | 仅导出 | — |
| 7 | **Wider Gemini** | Sk1ty (Planetes1mal) | 1,000 | 4.9 (21) | 免费 | 仅宽度 700-1400px + 代码换行 | 2026-01-02 |
| 8 | **UI Enhancer for Gemini** | core42x | 343 | 4.8 (4) | 免费 | 宽屏、片段、多引用、消息侧边栏 | 2025-12-23 |
| 9 | **AI Chat Exporter: Gemini to PDF, MD** | ai-chat-exporter.com | 未公开总用户 | 4.8 (428) | Freemium | PDF/MD/TXT/CSV 导出 | 2025-11-22 |
| 10 | **Gemini Ultimate Organizer** | zarnarock | 235 | 2.8 (5) | 免费 | 文件夹、提示词变量、导出、streamer mode | 2025-12-17 |

### 评论高频痛点/赞点（从可见页面数据推断 + Reddit 评论截取）

**赞点**（Voyager、Toolbox、Folders for Gemini 评论区）：
- "Local-first, data never leaves device"——**隐私本地存储是用户最看重的卖点**
- "Feels like a built-in feature"——原生感、无侵入（Folders for Gemini 的核心定位）
- 文件夹 + 提示词库二合一是最高需求组合

**痛点**：
- 许多导出类扩展（Gemini Chat Exporter 2.5 分）**格式粗糙、代码块/LaTeX 丢失**
- Enhance Gemini（4.1 分）久未更新、UI 过时
- Chrome Store 通过率不透明，审核耗时长（Voyager 改名后超过 7 天仍未恢复）

**来源**：
- Voyager store page: https://chromewebstore.google.com/detail/voyager/iifacdnjakkhjjiengaffnegbndgingi
- Superpower for Gemini: https://chromewebstore.google.com/detail/superpower-for-gemini/ahmdidjajeicoopcdpablhecokaepofl
- Toolbox for Gemini: https://chromewebstore.google.com/detail/gemini-toolbox/cbdpdhfnjbkjphmminnkfbeekodlphlp
- Enhance Gemini: https://chromewebstore.google.com/detail/enhance-gemini/hengddlmmobpckpmaalbmdlofpiljnon

---

## 2. Greasyfork + 国内用户生态

### 2.1 Greasyfork 上的 Gemini 相关 userscript（按活跃度）

| 脚本名 | 作者/仓库 | 核心功能 |
|--------|----------|---------|
| **Ophel Atlas** (urzeye/tampermonkey-scripts) | urzeye | 全平台 AI 助手（Gemini/ChatGPT/Claude/Grok/AI Studio/豆包等），大纲、全局搜索、文件夹、置顶、提示词队列+库、Markdown/JSON 导出、WebDAV 同步、禅模式、宽屏、快捷键 |
| **Gemini Helper** (同仓库) | urzeye | 会话管理、大纲、提示词、标签页增强、阅读恢复、水印移除、公式/表格复制、模型锁定 |
| **Gemini Workspace+** | greasyfork 564425 | 标签、AI 重命名、文件夹、大纲目录、提示词、历史对话助手 |
| **Gemini 批量删除会话助手** | greasyfork 566102 | 仅批量删除 |
| **Google Gemini 汉化脚本（自定义版）** | greasyfork 557719 | UI 汉化 |
| **Gemini NanoBanana 图片水印移除** | 多作者 | 仅水印移除 |
| **加宽 Gemini** | 多作者 | 仅宽度 |
| **Gemini Agent Connector** | — | 与本地 Quicker/HTTP 服务联动（agent 自动化方向） |

**Greasyfork 现状判断**：国内脚本化生态活跃，**Ophel Atlas + Gemini Helper 组合是目前中文圈影响力最大的 Gemini 增强脚本**（多平台通吃的定位，与 Primer++ 专注 Gemini 的定位形成差异）。

来源：
- https://greasyfork.org/zh-CN/scripts/by-site/google.com
- https://github.com/urzeye/tampermonkey-scripts

### 2.2 国内评测生态

- **知乎/B 站/少数派直接搜"Gemini 插件"**：搜索结果匮乏，这类内容未形成规模（不同于 ChatGPT 生态），**推断国内 Gemini 插件赛道仍是蓝海**。Brave 搜索中文关键词返回的主要是"Gemini in Chrome"（Google 官方产品）与 Gemini API 相关，而非第三方增强。
- **小众科学工具网站**（`kexuegongju.com`）收录了 Gemini Voyager 的中文介绍页。
- `xix.ai` 有"Google Gemini AI Extension"条目，内容主要是谷歌官方扩展。
- **推断**：由于 Gemini 需要科学上网，国内 Gemini 用户池规模 < ChatGPT，评测稀缺是自然结果。Primer++ 的品牌积累需要**自造渠道**（GitHub Star、小众派投稿、知乎技术答主合作），不能依赖被动 SEO。⚠️ 这是推断，一手评测链接暂未找到。

### 2.3 国内替代分发渠道现状

- **Edge Add-ons (edgeaddons.microsoft.com)**：审核比 Chrome Web Store 更宽松，历史上 Voyager 类扩展下架时 Edge 版本仍然存活（Issue #454 提到 "Firefox/Edge/Safari 正常"）。**建议发布时同步上架 Edge Add-ons**。
- **火狐 Addons (addons.mozilla.org)**：Firefox 用户群小但质量高，审核快。
- **UC 浏览器/360 扩展中心**：面向国内，但几乎无开发者社区支持，且分发质量参差，不推荐作为主渠道。
- **CRX4Chrome、扩展迷 (extfans.com/cnplugin.com)**：属镜像站，会自动抓取 Chrome Store 的 CRX，无需开发者主动提交。用户侧可用但**不建议在 README 中引导**（灰色）。
- **Chrome 离线安装包** + GitHub Releases + Microsoft Store (Edge) 是**合规的国内可达方案**。

---

## 3. Voyaga → Voyager 专题（关键参照案例）

**重要结论**：用户询问的 "Voyaga" 极大概率是对 **Voyager**（原 **Gemini Voyager**）的口语化记忆。这是 2026 年 3 月刚刚发生的真实下架案例，直接决定 Primer++ 的命名策略。

### 3.1 基本信息

- **项目**：`github.com/Nagi-ovo/gemini-voyager`
- **作者**：Nagi-ovo（疑似华人开发者，README 提供中英双语）
- **原名** → **新名**：Gemini Voyager → **Voyager**
- **技术栈**：Vite + Web Extension Template（非 userscript）
- **功能**：时间轴导航（区别于 Primer++）、文件夹管理、提示词库、聊天导出、Google Drive 同步
- **规模**：5 万用户 / 5.0 分 / 615 评分（截至 2026-04-18）

### 3.2 下架时间线

- **2026-03-06**：GitHub Issue #428 《[重要通知] 插件更名通知 / Extension Renamed to "Voyager"》发布。作者引用 Google 原话："We received a trademark complaint from Google regarding the use of 'Gemini' in the extension name."（收到 Google 针对扩展名中使用"Gemini"的商标投诉）
- **2026-03-11**：Issue #454 发布，说明已提交改名申请但 Chrome Web Store 审核超过 7 天未通过，插件**事实性下架**（用户安装的版本被 Chrome 自动禁用）。
- **2026-03-11**：Reddit `r/GoogleGeminiAI` 帖子 "Gemini Voyager has been banned" 出现，社区确认事件。Reddit 评论中有开发者（Superpower for Gemini 作者）表示 "我上周也收到同样的法律通知，我提前改名为 'Superpower for Gemini' 符合他们严格的第三方命名规则"。
- **2026-04-07**：Voyager 以新名在 Chrome Web Store 恢复上架，v1.3.9，保留全部原功能。

### 3.3 关键信息（已确认的事实 vs 推断）

**事实**：
- Google **主动**发出商标投诉（非 Chrome Store 主动删除，而是 Google 法务部门投诉 → 开发者被要求改名）。来源：Issue #428 直接引用邮件措辞。
- 触发条件是**扩展名中"Gemini"作为主品牌元素**（"Gemini Voyager" 让 Gemini 成为名字的一部分）。
- **改名规则**：把 "Gemini" 从主名移除，或改用 "for Gemini™" 的从属式写法。
- **Extension ID、GitHub 仓库名、Google Drive 同步数据、功能、用户数据全部不变**——这意味着改名成本可控。

**推断（非一手来源）**：
- ⚠️ 未找到 Google 法务邮件的完整公开原文，只有开发者的转述。
- ⚠️ 其他早期 Gemini 扩展（如 `tudoujunha/gemini-google-extension`，2024-08 被下架，Issue #20）下架原因写的是 "violates the web store policy"，**未明确是否也是商标原因**，可能是 MV2 过期、权限超范围等其他原因。

### 3.4 案例的启示（对 Primer++ 的直接映射）

| 规避项 | 具体做法 |
|-------|---------|
| **名字里"Gemini"必须放从属位置** | 用 `Primer++ for Gemini™` 而非 `Gemini Primer++` |
| **必须带 ™ 符号** | 所有出现 "Gemini" 的位置（store listing、README、UI、manifest name）都带 ™ |
| **显式声明非官方** | store description + README 加："Primer++ is an unofficial, community-built extension. Gemini™ is a trademark of Google LLC." |
| **logo 不能形似 Google 官方 Gemini logo** | 避免用 Google 那种多彩星形/钻石 icon |
| **备好改名 Plan B** | 保留一个中性的候选名（如 "Primer++"、"Tether"、"Atlas" 等），manifest 用变量化生成，应对突发改名 |

来源：
- https://github.com/Nagi-ovo/gemini-voyager/issues/428
- https://github.com/Nagi-ovo/gemini-voyager/issues/454
- https://www.reddit.com/r/GoogleGeminiAI/comments/1rqk9if/gemini_voyager_has_been_banned/（Reddit 原帖确认）
- https://chromewebstore.google.com/detail/voyager/iifacdnjakkhjjiengaffnegbndgingi（改名后页面）

---

## 4. 命名版权风险（核心章节）

### 4.1 Google 对 "Gemini" 字样的官方规则

**Chrome Web Store Branding Guidelines 原文**（https://developer.chrome.com/docs/webstore/branding）：

> "Don't use any Google trademarks or any confusingly similar marks as the name of your extension or company without written permission from Google."
> "If your product is compatible with a Google product, make reference to that Google product by using the text 'for', 'for use with', or 'compatible with', and be sure to include the ™ symbol with the Google trademark. Example: 'for Google Chrome™'"
> "If you are making reference to a Google trademark in combination with your logo, the referencing text should be smaller in size than your logo."

**Brand Resource Center 关键禁止事项**（https://about.google/brand-resource-center/rules/）：
- 不要把 Google Brand Feature 放在页面最显著位置
- 不要通过连字符/组合/缩写改造商标（如 Googliscious）
- 不要让 Google 商标作为社交账号主名、二/三级域名

**Google 官方确认 "Gemini™" 在商标清单内**（https://about.google/brand-resource-center/trademark-list/）：  
> "Gemini™ large language model & API"

**结论：**
- ✅ **允许**：`<YourName> for Gemini™`、`<YourName> for Google Gemini™`、`<YourName>: compatible with Gemini™`
- ❌ **禁止**：`Gemini <YourName>`（Gemini 作为主品牌前缀）、`GeminiPlus`、`Gemini-Pro`、任何让 Gemini 看起来是产品名一部分的写法
- ⚠️ **灰色**：UI 内部图标、开屏界面上使用 Gemini logo 的副本 —— 除非特殊授权，否则一律用文字 "Gemini™"，不画 logo

### 4.2 "Primer" / "Primer++" 的商标扫描

**海外（USPTO + 公开数据库）**：

| 持有方/主体 | 主要业务 | 状态 | 与我们的冲突度 |
|------------|---------|------|---------------|
| **Primer Technologies, Inc.** (primer.ai) | AI/NLP 软件，97 员工，美国国防客户 | 在营，有 USPTO 商标申请记录 | **极高**（同类软件服务 Class 9/42） |
| **Primer Federal Inc** (Primer.AI for military cyber) | 美军相关 AI 服务 | 活跃（SBIR 项目） | **高** |
| **Primer** (Y Combinator F25, startprimer.com) | AI 产品演示 agent | 活跃，YC 校友 | **高**（都在 AI/SaaS 赛道） |
| **Primer App** (primer-app.com) | 金融分析 | 活跃 | 中（金融类目不完全重叠） |
| **Primer** (primerapp.com) | 金融信息 AI | 活跃 | 中 |

**"Primer++" 特殊符号**：USPTO 允许特殊符号，但 "Primer++" 在**商标相似度判定中会被归为与 "Primer" 高度近似**（"++" 属于常见计算机领域后缀修饰，不产生区分性）。这是 TMEP 规则 §1207 的典型情形。

⚠️ **未访问 USPTO TESS 在线查询确认 Primer++ 本身是否已被注册**（TESS 需登录且非公开 API 深度查询）；但仅凭 "Primer" 本身的占用密度，**风险已经是高等级**。

**国内（CNIPA 中国商标局）**：

- ⚠️ 本次调研未直连 sbj.cnipa.gov.cn/tmsearch.cnipa.gov.cn 进行单点查询（公开爬虫封锁严格、需要验证码登录）。
- **推断**：中文语境下 "Primer"（普瑞默）非极端罕见词，Class 9（下载软件）和 Class 42（SaaS）软件类目下**很可能已有国内持有方**。建议在提交中国商标申请前通过代理（猪八戒/权大师/百利来）做付费预检索，费用约 200-500 元。
- **"Primer++" 作为完整词在中国商标中几乎不可能有精确同名**（特殊符号 + 英文），但近似审查仍会以 "Primer" 为基础比对。

### 4.3 候选名产出（5 个低风险建议）

评估维度：商标风险、SEO 搜索友好度、中英双语可读性、与 Google 规则的合规度。

| # | 候选名 | 商标风险 | SEO 友好度 | 中英双语 | 理由 |
|---|-------|---------|-----------|---------|------|
| 1 | **`Primer++ for Gemini™`**（保留原名 + 合规后缀） | 中高（Primer 冲突） | 高（Gemini 关键词在 store 搜索排名高） | 可读（可译"普瑞默"） | 继承品牌资产，但需承担"Primer"系软件商标风险 |
| 2 | **`Tether for Gemini™`** | 低（Tether 在加密币类冲突，但软件扩展类目很少） | 中 | 可读 | "Tether"=系绳，隐喻"把 Gemini 变成专属工具" |
| 3 | **`Lumen for Gemini™`** | 低（Lumen 是单词，但无强势 AI/扩展 类目占用者） | 中 | 可读 | "Lumen" 光/明，品牌感强 |
| 4 | **`Pilot for Gemini™`** | 中（GitHub Copilot 强势，但 "Pilot" 作为独立词可用） | 高（用户搜"Gemini pilot"会到） | 可读 | 简洁、自带功能暗示 |
| 5 | **`Nexus for Gemini™`** | 中（Nexus 在 Google Nexus 手机时代是自家品牌，现已不用，但残留风险） | 中 | 可读 | 暗示"枢纽/节点" |
| 6 | **`Harbor for Gemini™`** | 低（Harbor 在 Docker 生态占用，但扩展类目空缺） | 中 | 可读 | "港湾"—收纳/组织的暗喻 |
| 7 | **`Gear for Gemini™`** | 低 | 中 | 可读 | "齿轮/工具"，直白 |
| 8 | **`Forge for Gemini™`** | 低（与 Entropy-Forge 项目自洽） | 中 | 可读 | 作者已有 Forge 系列品牌风格，可复用识别度 |

**推荐三甲**：`Forge for Gemini™`（首选，作者品牌系列一致）、`Harbor for Gemini™`（备选，寓意贴合"文件夹收纳"核心功能）、`Primer++ for Gemini™`（保留选项，需预先做付费商标检索确认可用）。

---

## 5. 功能矩阵 + 差异化定位

### 5.1 横向功能对比

| 功能维度 | Primer++（本项目） | Voyager（Nagi-ovo） | Voyager 改名前 Gemini Voyager | Superpower for Gemini | Toolbox for Gemini |
|---------|:-----------------:|:-----------------:|:---------------------------:|:---------------------:|:------------------:|
| 对话文件夹（含子文件夹） | ✅ | ✅ | ✅ | ✅ | ✅ |
| 提示词库 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 批量删除 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 消息计数 / 配额追踪 / 日历热图 | ✅（独特） | ❌ | ❌ | 部分（每日限额计数器） | ❌ |
| 聊天导出 JSON/CSV/MD | ✅ | ✅ (JSON) | ✅ | ✅ (PDF/DOCX) | ✅ (PDF/HTML/MD/TXT/CSV) |
| UI 调整（宽度/Ctrl+Enter） | ✅ | ✅（宽度） | ✅ | 部分 | 部分 |
| 引用回复 (quote reply) | ✅（较独特） | ❌ | ❌ | ❌ | ❌ |
| 默认模型锁定 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 时间轴导航 | ❌ | ✅（其旗舰功能） | ✅ | ❌ | ❌ |
| 云同步 Google Drive | ❌ | ✅ | ✅ | Pro 付费 | ❌ |
| Gem 类型识别（智能图标） | ❌ | ✅ | ✅ | ❌ | ❌ |
| AI Studio 支持 | ❌ | ✅ | ✅ | ❌ | ❌ |
| 多账户切换 (u/0, u/1) | 部分（用户隔离存储） | ✅ | ✅ | ❌ | ❌ |
| **双产物**（userscript + MV3） | ✅（独特） | ❌ | ❌ | ❌ | ❌ |
| 本地优先/数据不上传 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 价格 | 免费开源 | 免费 | 免费 | 免费+IAP | 免费+IAP |

### 5.2 定位建议

**核心判断**：Gemini 专精路线值得坚持，原因三条：
1. Voyager 刚下架改名，前 5 万用户处于"找替代品"窗口期——**3-6 个月内是上架黄金期**。
2. 同时做 ChatGPT/Claude/Grok/豆包 的大而全脚本（如 Ophel Atlas）已有先行者，难以追赶 DOM 适配速度。
3. Gemini 快速迭代（Gemini 3、Auto Browse、AI Studio 合并）会打破跨平台扩展的统一 DOM 假设，专注 Gemini 可以跟得更紧。

**差异化卖点排序**（按独特性从高到低）：
1. **消息计数 + 配额追踪 + 日历热图**（counter + dashboard）——竞品基本没有，这是 "Primer++ 最独特的身份锁定"。放在 store listing 第一屏截图。
2. **双产物（userscript + MV3 extension）**——同一源码、同时覆盖 Tampermonkey 用户和 Chrome Store 用户，中文技术圈吃这一套（Greasyfork + 扩展双渠道是 Ophel 也在走的路）。
3. **Quote Reply（引用回复）**——几乎所有竞品都没做。如果能做得自然（像 Discord/Slack 那种），这是 power user 的强粘性功能。
4. **`lib/` 100% 测试覆盖率 + 开源 MIT**——对照 Voyager 是 GPL-3.0，本项目采用 MIT；发布材料应准确表述为核心纯函数库 100% 覆盖，并辅以应用层 smoke 测试建立工程信任。

**建议不做的功能（避免分散）**：
- 暂不做时间轴导航（Voyager 的护城河，做了也比不过且增加 DOM 依赖）
- 暂不做 AI Studio 支持（DOM 差异大，优先稳住 gemini.google.com 主站）
- 暂不做 Google Drive 云同步（需要 OAuth，Chrome Store 审核成本高且隐私争议面广，**用 `chrome.storage.sync` 做轻量跨机器同步**是更安全的中间方案）
- 暂不做多平台扩展（Ophel 已占位，打不赢 DOM 适配的长期维护）

### 5.3 上架策略行动清单

1. ✅ **立刻改名**到 `<YourName> for Gemini™` 范式（推荐 `Forge for Gemini™`），保留 `Primer++` 作为 GitHub 仓库 slug（仓库名不受商标投诉）。
2. ✅ manifest.json 的 `name` 字段、store listing 标题、截图 UI 里的 app logo 文字一律带 ™。
3. ✅ 描述里第一行加："Forge for Gemini™ is an unofficial community extension. Gemini™ is a trademark of Google LLC."
4. ✅ 先发 Chrome Web Store → 同时投递 Edge Add-ons（备份分发）→ 后补 Firefox AMO。
5. ✅ 做完备份改名方案：所有品牌资产用 CSS 变量/常量引用，未来一行改全改。
6. ✅ 付费做一次 "Primer" "Primer++" "Forge" 的中美商标检索（猪八戒/权大师 ~500 RMB），确认后再投入品牌推广成本。
7. ✅ 首发日写 Reddit `r/GoogleGeminiAI` + Hacker News + 知乎专栏 三连发，标题蹭 "Voyager alternative" 的热度。

---

## 附录：关键来源链接汇总

**Voyager 案例**：
- Issue #428 改名通知：https://github.com/Nagi-ovo/gemini-voyager/issues/428
- Issue #454 下架说明：https://github.com/Nagi-ovo/gemini-voyager/issues/454
- Reddit 社区讨论：https://www.reddit.com/r/GoogleGeminiAI/comments/1rqk9if/gemini_voyager_has_been_banned/

**Google 官方规则**：
- Chrome Web Store Branding Guidelines：https://developer.chrome.com/docs/webstore/branding
- Chrome Web Store Program Policies：https://developer.chrome.com/docs/webstore/program-policies/policies
- Google Brand Resource Center / Trademark List：https://about.google/brand-resource-center/trademark-list/
- Brand Resource Center Rules：https://about.google/brand-resource-center/rules/

**Gemini 商标诉讼背景（说明 Google 自身也是被告，对第三方商标敏感）**：
- Gemini Data Inc. v. Google LLC：https://www.afslaw.com/perspectives/ai-law-blog/gemini-spells-double-trouble-googles-ai-gemini-data-inc-sues-trademark
- P2B Trading v. Google（Google 胜诉）：https://news.bloomberglaw.com/ip-law/google-avoids-gemini-ban-during-speaker-company-trademark-suit

**竞品 Chrome Web Store 页面**（前文表格中链接）。

**Greasyfork / 国内生态**：
- https://greasyfork.org/zh-CN/scripts/by-site/google.com
- https://github.com/urzeye/tampermonkey-scripts

**"Primer" 商标冲突主体**：
- Primer.ai / Primer Technologies Inc：https://primer.ai
- Primer (YC F25)：https://www.ycombinator.com/companies/primer
- uspto.report 公司条目：https://uspto.report/company/Primer-Technologies-Inc

**未找到一手来源的标注项**：
- ⚠️ Google 发给 Nagi-ovo 的商标投诉邮件原文（仅开发者转述可见）
- ⚠️ CNIPA 直接查 "Primer" 的软件类目现存注册清单（需登录 tmsearch.cnipa.gov.cn）
- ⚠️ USPTO TESS 对 "Primer++" 精确字符串的可用性（需人工登录）

---

**报告完成 / 字数约 3000 字 / 建议 2026-04-25 前完成改名决策并启动 Chrome Store 开发者账号注册（需 $5 注册费 + 1-3 天身份验证）**
