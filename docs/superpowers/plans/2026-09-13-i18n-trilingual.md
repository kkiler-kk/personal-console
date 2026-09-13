# 迭代四：全站 i18n 三语切换（中/英/西，默认英文）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端全站文案国际化：react-i18next 三语（zh/en/es），顶栏切换器，localStorage 持久化，默认 en；冒烟钉死 zh 运行保持选择器稳定。

**Architecture:** `frontend/src/i18n/`（index.ts + locales/{zh,en,es}.ts 按命名空间分节）；每模块任务抽取本模块全部硬编码中文为 t() 键并补齐三语翻译；Topbar 加语言切换下拉（Globe 图标）；smoke.mjs addInitScript 预置 `ui-lang=zh`。后端错误消息保持中文（BACKLOG：错误码 i18n）。

**Tech Stack:** 新增依赖 `i18next` + `react-i18next`（npm，registry 已 npmmirror）。其余同前。

**Spec:** 交付后迭代（用户 2026-09-13：界面改英文 + i18n 三语切换）；spec §2「仅中文界面」原则由本迭代修订（Task 5 回写 spec）

## Global Constraints

- 语言键 `ui-lang` ∈ "zh"|"en"|"es"，默认 **"en"**（fallbackLng 同 en）；切换即时生效（无需刷新）+ 持久化 + 跨标签 storage 同步（惯例同 mask/displayCurrency）
- 命名空间约定（键前缀，防跨任务冲突）：`common.*`（确定/取消/删除/保存/编辑/加载中/搜索等）、`nav.*`、`dashboard.*`、`invest.*`、`learn.*`、`life.*`、`blog.*`、`admin.*`、`errors.*`——每任务只增改自己模块的键 + common 补缺
- **三语完整性**：每任务新增键必须 zh/en/es 三份齐全（tsc 不校验翻译完整性——用脚本自检：三文件键集合 diff 为空，命令写进各任务验证）
- 抽取原则：用户可见文案全部 t()；**代码注释、console/log、toast 里的后端回传消息（e.message）不翻译**；aria-label/title/placeholder 也要 t()
- 数字/货币格式化不动（formatMoney/formatDuration 的输出单位词走 i18n，数值逻辑不变）；日期保持 yyyy-MM-dd；长日期文案（日历 title "9月13日 · N 分钟"）改 t() 插值模板（en: "{date} · {minutes}"；es 同款）
- smoke.mjs：`context.addInitScript` 预置 localStorage `ui-lang=zh`（**在所有页面加载前**），既有中文选择器零改动；新增断言：默认语言（无 localStorage 时）页面为英文（如侧边栏 text=Invest）
- 惯例全沿用（strict/radix-nova grep/e:unknown/tnum/PID/显式 add/8080 PID 2154 勿动/3000 用户 vite 勿动/测试数据清理）
- conventional commits

## 文件结构

```
frontend/
├── package.json                     + i18next react-i18next（Task 1）
├── src/i18n/index.ts                init（lng 从 localStorage 读、fallback en、interpolation escapeValue:false——React 已转义）（Task 1）
├── src/i18n/locales/zh.ts en.ts es.ts  三语资源（各任务增量）
├── src/main.tsx                     import "./i18n"（Task 1）
├── src/components/layout/Topbar.tsx 语言切换下拉（Globe + 三项）（Task 1）
├── src/components/layout/Sidebar.tsx / MobileTabBar.tsx / CommandPalette.tsx（Task 1）
├── src/components/{ErrorState,StatCard?,PagePlaceholder}.tsx（Task 1）
├── src/pages/Dashboard.tsx（Task 1）
├── src/pages/invest/*（Task 2）
├── src/components/charts/ValueChart.tsx（Task 2）
├── src/pages/learn/* + components/charts/{MinutesBar,HabitHeatmap}.tsx + lib/duration.ts（Task 3）
├── src/pages/life/*（Task 3）
├── src/pages/blog/* + components/blog/*（Task 4）
├── src/pages/admin/* + components/admin/AdminNav.tsx（Task 4）
├── src/App.tsx                      404 页文案（Task 1）
└── scripts/smoke.mjs                addInitScript zh + 默认英文断言（Task 1）
README.md / CLAUDE.md / spec / BACKLOG.md（Task 5）
```

---

### Task 1: i18n 基建 + 布局/Dashboard/冒烟适配

**Files:** 见文件结构 Task 1 行；Create `frontend/src/i18n/index.ts`、`locales/{zh,en,es}.ts`；Modify `package.json`、`main.tsx`、Topbar/Sidebar/MobileTabBar/CommandPalette/ErrorState/PagePlaceholder/Dashboard/App.tsx、`smoke.mjs`

**Interfaces:**
- Produces: `i18n` 实例与 `useTranslation()` 可用；`useUiLanguage(): { lang: "zh"|"en"|"es"; setLang(l): void }`（放 i18n/index.ts 或 lib/，localStorage+storage 事件+调 i18n.changeLanguage，惯例同 mask）；locales 三文件含 common/nav/topbar/dashboard/errors 节；键自检脚本命令（见验证）
- 导航键值参考：nav: 总览 Overview / 投资 Invest / 学习 Learn / 生活 Life / 博客 Blog；topbar: 管理后台 Admin、切换主题 Toggle theme、语言 Language；dashboard 各卡标题/占位/问候（"你好，{name}" → "Hello, {name}" → "Hola, {name}"）

- [ ] **Step 1:** npm i i18next react-i18next；i18n/index.ts（initReactI18next、resources 三语、lng=localStorage||"en"、fallbackLng:"en"、interpolation.escapeValue:false）+ useUiLanguage hook；main.tsx 在 render 前 import "./i18n"
- [ ] **Step 2:** locales 三文件：common（确定/取消/删除/保存/编辑/关闭/加载中/搜索/暂无数据/操作…以本任务实际用到的为准）+ nav + topbar + dashboard + errors（加载失败/重试）
- [ ] **Step 3:** Topbar 语言切换：Globe 图标 DropdownMenu（三项：中文/English/Español，当前项勾选态）；useUiLanguage 驱动
- [ ] **Step 4:** 布线：Sidebar/MobileTabBar NAV_ITEMS label → t(nav.*)（NAV_ITEMS 结构改为 labelKey，消费点 t()——CommandPalette 同步）；Dashboard 全部文案；ErrorState title/message 默认文案；PagePlaceholder（404/投资学习等占位描述——注意 invest/learn/fitness 占位已删，现存仅 404）；App.tsx 404 文案
- [ ] **Step 5:** smoke.mjs：开头 `const context = await browser.newContext(); await context.addInitScript(() => localStorage.setItem("ui-lang","zh")); const page = await context.newPage()`（替换原 newPage 路径）；末尾新增第 11 步：新 context 无预置 → 打开 / → `waitForSelector("text=Invest")`（默认英文断言）→ `STEP11 I18N PASS`
- [ ] **Step 6: 验证**：tsc×2+build 零错误；**键完整性自检**：`node -e` 加载三 locale 文件扁平化键集合互 diff 为空（脚本写进报告，后续任务复用）；Playwright（3001→8080）：默认打开为英文界面（Sidebar "Invest/Learn/Life/Blog"）→ 切 中文 即时生效 → reload 保持 → 切 Español 抽查 → 冒烟全 11 步 PASS；清理进程
- [ ] **Step 7: Commit** `feat(frontend): i18n foundation — react-i18next, language switcher, layout & dashboard`

### Task 2: 投资模块 i18n

**Files:** Modify `frontend/src/pages/invest/{InvestPage,TradeDialog,AssetDialog}.tsx`、`frontend/src/components/charts/ValueChart.tsx`、locales×3

- [ ] **Step 1:** invest.* 键抽取：汇总四卡标题与 sub（含"1 USD = ¥{fx}"模板）、持仓表全部列头、类型 Badge（股票 Stock/Acción、ETF、基金 Fund/Fondo、黄金 Gold/Oro、其他 Other/Otro）、已清仓/数据异常 Badge 与 title、stale 提示、空态、占比卡、流水表列头与买卖 Badge、删除确认文案、录交易对话框全表单（含超卖错误提示壳）、添加资产五预设标签/hint/placeholder/轻校验 toast、改价对话框、切换按钮 title、"记录学习"类按钮不涉及
- [ ] **Step 2:** ValueChart tooltip/轴 label（市值 Value/Valor、成本 Cost/Coste）
- [ ] **Step 3:** 三语翻译补齐 + 键完整性自检
- [ ] **Step 4: 验证**：tsc×2/build；Playwright 英文态投资页走查（列头/卡片/Badge 全英文、切 $ 与遮蔽功能语言无关正常）+ 中文态回归 + 冒烟 11 步（zh 钉死）；清理
- [ ] **Step 5: Commit** `feat(frontend): i18n invest module`

### Task 3: 学习 + 生活模块 i18n

**Files:** Modify `frontend/src/pages/learn/*`、`frontend/src/pages/life/*`、`frontend/src/components/charts/{MinutesBar,HabitHeatmap}.tsx`、`frontend/src/lib/duration.ts`、locales×3

- [ ] **Step 1:** learn.*：streak 横幅（连续 N 天 → "{n}-day streak" → "Racha de {n} días"）、本周/累计、今日卡、by_activity 芯片标签（ACTIVITY_LABELS 迁 i18n：背单词 Vocabulary/Vocabulario、听力 Listening/Comprensión auditiva…）、语言卡（LANG_META name：英语 English/Inglés、西班牙语 Spanish/Español——**注意语言名本身三语写法**）、已打卡/打卡按钮、SessionDialog/ProfileDialog 表单、StudyCalendar 格 title 模板与月份/星期头、MinutesBar tooltip
- [ ] **Step 2:** lib/duration.ts formatDuration i18n 化：改为接收 t 或返回 {value, unitKey}（**BACKLOG 已有拆分建议，借此落地**：`formatDuration(minutes, t)` 内部用 t("common.minutes")/t("common.hours")；或 splitDuration 返回结构由调用方组装——选影响面小方案，报告注明）
- [ ] **Step 3:** life.*：三区块标题、习惯区（新习惯对话框/打卡/撤销确认/x个习惯 title/图例/年份切换）、随手记（输入 placeholder/记一笔/空态/查看更多/删除确认/notes 缺失提示）、照片墙（上传/删除 aria/灯箱计数/空态）
- [ ] **Step 4:** HabitHeatmap title 模板与月份/星期标签、compact 无月份
- [ ] **Step 5:** 三语补齐 + 键自检；验证：tsc/build；Playwright 英文态学习页（streak 文案/芯片/日历 title）与生活页走查 + 中文回归 + 冒烟 11 步（**注意 step 9 text=英语 选择器**：zh 钉死下 LearnPage 语言卡显示"英语"——LANG_META 中文名保留则零改动，确认之）；清理
- [ ] **Step 6: Commit** `feat(frontend): i18n learn and life modules`

### Task 4: 博客 + 管理后台 i18n

**Files:** Modify `frontend/src/pages/blog/*`、`frontend/src/components/blog/*`、`frontend/src/pages/admin/*`、`frontend/src/components/admin/AdminNav.tsx`、locales×3

- [ ] **Step 1:** blog.*：列表/详情（归档 Archive/Archivo、分类 Category/Categoría、标签 Tag/Etiqueta、浏览量、评论节全文案（发表评论/昵称/邮箱 placeholder/回复/删除/已删除/还没有评论/抢沙发）、分页（上一页/下一页）、空态）
- [ ] **Step 2:** admin.*：AdminNav 六项、总览七卡与快捷入口、文章管理表格与确认框、编辑器全表单（写文章/预览/插入图片/标签回车提示/发布开关/无分类）、分类管理（新建表单/板块五选/删除确认文案含"文章将变为无分类"）、学习记录管理表格、习惯管理、资料页（昵称/头像/简介/保存提示）
- [ ] **Step 3:** 三语补齐 + 键自检；验证：tsc/build；Playwright 英文态博客+admin 走查 + 中文回归 + **冒烟 11 步**（step 5 text=文章管理、step 10 h1 生活、STEP5 h1 管理总览——zh 钉死下全部保持）；清理
- [ ] **Step 4: Commit** `feat(frontend): i18n blog and admin modules`

### Task 5: 完整性审计 + 文档 + 收尾

**Files:** Modify `README.md`、`CLAUDE.md`、spec、`BACKLOG.md`；可能触碰任何漏网组件

- [ ] **Step 1: 硬编码审计**：`grep -rn '[一-龥]' frontend/src --include='*.tsx' --include='*.ts' | grep -v locales/zh | grep -v '^\s*//' | grep -v '// '`——剩余命中逐条判定（注释合法/漏网文案补 t()）；目标：**用户可见文案零硬编码**
- [ ] **Step 2:** 三语键完整性终检（扁平 diff 为空）+ 抽查 es 翻译质量（10 键人工读）
- [ ] **Step 3: 文档**：README 功能特性加「三语界面（中/英/西，默认英文，顶栏切换）」；CLAUDE.md Frontend 结构加 i18n/ 说明与「新增文案必须三语齐 + 键自检命令」、smoke 钉语言机制；spec §2「仅中文界面」原则修订为三语 i18n（2026-09-13 用户决定）；BACKLOG 加「后端错误消息 i18n（错误码方案）」
- [ ] **Step 4: 全量验证**：backend build/vet/test 全绿；frontend tsc×2/build；冒烟 11 步全 PASS；三查清净
- [ ] **Step 5: Commit** `feat: trilingual UI (zh/en/es) with i18n — iteration four complete`（控制器合并推送）

---

## Self-Review 记录

- **需求覆盖**：界面默认英文（Task 1 default en + 冒烟第 11 步断言）；三语切换（Task 1 切换器 + Task 2-4 全模块抽取）；持久化/跨标签（Global Constraints）。缺口：无。
- **占位符扫描**：各任务给出键命名空间与代表性键值/翻译示例，抽取范围按文件清单穷举——机械性翻译工作以"范围+约定+自检命令"定义，属可执行规格；无 TBD。
- **类型一致性**：useUiLanguage 契约 Task 1 定义、Topbar 消费；NAV_ITEMS labelKey 改造在 Task 1 内闭环（Sidebar/MobileTabBar/CommandPalette 三消费点同步）；formatDuration 签名变更限定 Task 3 内并 grep 全消费点（LearnPage/MinutesBar/StudyCalendar/Dashboard——Dashboard 的"今日学习 N 分钟"卡也在消费！Task 3 需同步 Dashboard 该处，跨界提醒已写入 Step 2）。
- **冒烟稳定性**：zh 钉死策略使既有 10 步选择器零改动；第 11 步只加不删；LANG_META 中文名保留是 step 9 选择器前提（Task 3 Step 5 显式确认）。
- **风险**：翻译量大（约 300-400 键 ×3）——按模块分四任务消化；es 翻译质量抽查安排（Task 5）；i18next 包体积增量可接受（个人站）。
