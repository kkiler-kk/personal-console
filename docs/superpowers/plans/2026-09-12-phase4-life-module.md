# 阶段 4：生活模块 + 全站收尾 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付生活模块（习惯打卡热力图 + 随手记 + 照片墙灯箱升级）并完成全站收尾打磨（统一错误态、a11y、遗留 Minor 清算），网站四大板块（投资/学习/生活/博客）完整上线。

**Architecture:** 后端新增 habits/habit_logs 两表 + `handler/habit.go`（CRUD/打卡/热力图）+ dashboard habits 字段填充；随手记**零后端改动**（复用 posts + 迁移种子"随手记"分类 section=life）。前端 /life 页三区块重构（习惯/随手记/照片墙+灯箱），Dashboard 习惯卡接实数据+迷你热力图。收尾任务统一清算前三个阶段账本的高价值延后项。

**Tech Stack:** 同前（Go/Gin/sqlx/Redis；React 19/TS strict/TanStack/Recharts/shadcn radix-nova）。

**Spec:** `docs/superpowers/specs/2026-09-12-personal-site-redesign-design.md` §3.1(habits)、§3.3(随手记)、§5(生活)、§7、§9；§11 阶段 5 行（本计划即原阶段 5，健身取消后顺位为阶段 4）

## Global Constraints

- 全部新 API 挂 JWT protected；错误 `{"error": "..."}`；迁移幂等
- **Dashboard schema 只增不改**：habits_checked_today = 今日已打卡习惯数（Go 本地日期口径，阶段 3 惯例：不用 CURDATE()）；habits_total = 未归档习惯数
- 打卡幂等：habit_logs PRIMARY KEY (habit_id, log_date)，重复打卡 200 不报错；撤销不存在 404
- 随手记 = posts（category=notes/section=life），title 自动取内容首行截 30 字符（前端做），零新端点
- mutation 后 DEL "dashboard:summary"
- 前端惯例全部沿用（strict/e:unknown/?? []/tnum/阴影/invalidate/toast）
- 进程 PID 精确 kill 严禁 pkill；git add 显式路径严禁根 add -A；smoketest/Smoke#2026；8080 用户进程勿动（验证用 PORT=8090）；conventional commits

## API 契约速查

```
GET    /api/habits                 → 200 {habits: Habit[]}（含 archived=false 全部；archived 不返回除非 ?all=1）
POST   /api/habits                 → 201 {id}          body {name, icon?, color?}
PUT    /api/habits/:id             → 200 {message}     body {name?, icon?, color?, archived?}
DELETE /api/habits/:id             → 200 {message}     （连带删 habit_logs）
POST   /api/habits/:id/check       → 200 {message}     body {date?}（默认今天 Go 本地；幂等 INSERT IGNORE）
DELETE /api/habits/:id/check       → 200 {message}|404 body {date?}
GET    /api/habits/heatmap?year=   → 200 {days:[{date:"2006-01-02", count:int}]}（仅 count>0 的日期；year 默认当年 clamp 2000..2100）

Habit = {id, name, icon, color, archived, created_at}
Dashboard 联动: habits_checked_today / habits_total 实数据
```

## 文件结构

```
backend/
├── model/model.go                  Habit/HabitLog（Task 4.1）
├── cmd/migrate.go                  两表 + 种子"随手记"分类（Task 4.1）
├── handler/habit.go                6 端点（Task 4.2）
├── handler/dashboard.go            habits 字段填充（Task 4.2）
├── router/router.go                挂载（Task 4.2）
frontend/src/
├── lib/types.ts / lib/api.ts       habit 类型与端点（Task 4.3）
├── components/charts/HabitHeatmap.tsx  GitHub 风格热力图（Task 4.3）
├── components/ErrorState.tsx       全站统一错误态（Task 4.5）
├── pages/life/LifePage.tsx         三区块重构（Task 4.3）
├── pages/life/{HabitSection,NoteSection,GalleryLightbox}.tsx（Task 4.3）
├── pages/Dashboard.tsx             习惯卡+迷你热力（Task 4.4）
└── scripts/smoke.mjs               第 10 步（Task 4.6）
```

---

### Task 4.1: 数据模型 + 迁移 + 随手记种子分类

**Files:** Modify `backend/cmd/migrate.go`、`backend/model/model.go`

**Interfaces:**
- Produces: 表 `habits`/`habit_logs`；`model.Habit{ID int64, Name, Icon, Color string, Archived bool, CreatedAt time.Time}`（json: id,name,icon,color,archived,created_at）、`model.HabitLog{HabitID int64, LogDate time.Time}`（json: habit_id,log_date）；种子分类 notes（存在则跳过）

- [ ] **Step 1: migrate.go 追加（照既有风格）**

```sql
CREATE TABLE IF NOT EXISTS habits (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  icon VARCHAR(16),
  color VARCHAR(16),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS habit_logs (
  habit_id BIGINT NOT NULL,
  log_date DATE NOT NULL,
  PRIMARY KEY (habit_id, log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

种子（幂等）：`INSERT IGNORE INTO categories (name, slug, section) VALUES ('随手记', 'notes', 'life')`——作为迁移语句之一执行；执行后 DEL Redis "categories:list"（best-effort，log 错误）。

- [ ] **Step 2: model.go 追加两结构体**（Icon/Color 可空列 → string + 查询 IFNULL）
- [ ] **Step 3: 验证** build/vet；两次启动幂等；SHOW TABLES 两表；`SELECT * FROM categories WHERE slug='notes'` 恰一行 section=life；kill PID
- [ ] **Step 4: Commit** `feat(backend): habits schema and notes category seed`

### Task 4.2: habit handler + dashboard 填充 + 路由

**Files:** Create `backend/handler/habit.go`；Modify `backend/handler/dashboard.go`、`backend/router/router.go`

**Interfaces:**
- Consumes: model.Habit/HabitLog；DashboardHandler 现有结构（db, redis, uploadDir, invest, learn）
- Produces: 契约速查 6 端点；dashboardSummary 的 HabitsCheckedToday/HabitsTotal 实数据；`HabitHandler.TodayCounts(ctx) (checked int, total int, err error)` 导出供 dashboard 复用

- [ ] **Step 1: handler/habit.go（逻辑规格，按仓库 handler 风格写完整代码）**

```go
// HabitHandler{db, redis}；NewHabitHandler(db, rdb)
// List: ?all=1 含归档，否则 WHERE archived=FALSE；SELECT id,name,IFNULL(icon,'') AS icon,IFNULL(color,'') AS color,archived,created_at ORDER BY created_at → {habits}
// Create: body {name binding required max=50, icon max=16, color max=16} → INSERT → 201 {id}；DEL dashboard:summary
// Update: :id；body 指针字段合并语义（*string/*bool，nil 保持原值——沿用 category.go Update 的合并模式）；0 行 404；DEL dashboard:summary
// Delete: :id；先 DELETE habit_logs WHERE habit_id=? 再 DELETE habits（顺序避免孤儿）；0 行 404；DEL dashboard:summary
// Check: :id + body {date? 默认 time.Now().Format("2006-01-02")}；校验 habit 存在 404；INSERT IGNORE INTO habit_logs → 200 {message:"ok"}（幂等：重复打卡也 200）；DEL dashboard:summary
// Uncheck: 同参；DELETE → 0 行 404 {"error":"no check for that date"}；DEL dashboard:summary
// Heatmap: ?year= 默认当年 clamp 2000..2100
//   SELECT log_date, COUNT(*) AS count FROM habit_logs WHERE YEAR(log_date)=? GROUP BY log_date ORDER BY log_date
//   → {days:[{date:"2006-01-02", count}]}（仅 count>0 日期；无则 []）
// TodayCounts(ctx): total = COUNT(*) habits WHERE archived=FALSE；
//   checked = COUNT(DISTINCT habit_id) FROM habit_logs WHERE log_date=?（Go 本地今天字符串）
```

- [ ] **Step 2: dashboard.go** 增 habit *HabitHandler 字段（NewDashboardHandler 加参，router 同步、hh 在 dh 前构造）；Summary 填充：

```go
if checked, total, err := h.habit.TodayCounts(c.Request.Context()); err != nil {
	log.Printf("dashboard: habit counts unavailable: %v", err)
} else {
	s.HabitsCheckedToday = checked
	s.HabitsTotal = total
}
```

- [ ] **Step 3: router.go** protected 组挂 6 路由（/habits、/habits/:id、/habits/:id/check、/habits/heatmap）——**注意 gin 路由顺序无关但 /habits/heatmap 与 /habits/:id 同段冲突**：gin 对同段静态+参数路由会 panic（`heatmap` vs `:id`）——**注册顺序：先 /habits/heatmap 再 /habits/:id 会 panic？** 实测为准：gin httpradix 允许静态优先共存（新版本的 gin 支持同段静态与参数并存，静态优先匹配）；若启动 panic 则把 heatmap 改为 /habits-heatmap 或 query 形式 /habits?heatmap=year——**实现者起服验证，若冲突采用 `GET /api/habits/heatmap` 不可行时的备选：路径改 `/api/habit-heatmap`，同步契约与前端，报告注明**
- [ ] **Step 4: 验证（curl，PORT=8090）**：建习惯（名"早睡"icon"🌙"）→ 打卡今天 → 重复打卡 200 幂等 → heatmap 含今天 count=1 → PUT 改名（省略字段保持验证合并语义）→ dashboard summary habits_checked_today=1 habits_total=1 → 撤销打卡 → 再撤销 404 → DELETE 习惯（habit_logs 连带清净）→ 全部测试数据清理 + DEL dashboard:summary；build/vet/test 全绿
- [ ] **Step 5: Commit** `feat(backend): habits API — CRUD, check-in, heatmap`

### Task 4.3: 前端 /life 三区块重构

**Files:** Modify `frontend/src/lib/types.ts`、`frontend/src/lib/api.ts`；Create `frontend/src/components/charts/HabitHeatmap.tsx`、`frontend/src/pages/life/{LifePage,HabitSection,NoteSection,GalleryLightbox}.tsx`（LifePage 重写）

**Interfaces:**
- Consumes: 契约速查；既有 posts API（随手记）；gallery API（照片墙）
- Produces: types 新增 `Habit{id,name,icon,color,archived,created_at}`、`HeatmapDay{date,count}`；api 新增 getHabits/createHabit/updateHabit/deleteHabit/checkHabit/uncheckHabit/getHabitHeatmap；`<HabitHeatmap days={HeatmapDay[]} year={number} onYearChange? />`（4.4 Dashboard 迷你版复用，props 加 `compact?: boolean`）

- [ ] **Step 1: types/api 追加（逐字按契约）**
- [ ] **Step 2: HabitHeatmap.tsx**：GitHub 贡献图风格——53 列×7 行网格（周一起始，按 year 的 1 月 1 日对齐周列）；格色 4 档（0: bg-muted、1: bg-primary/30、2: bg-primary/60、3+: bg-primary）；格 title=`{date} · {count} 个习惯`；今天 ring-1 ring-primary；月份标签行；compact 模式（Dashboard 用）：只显示近 16 周、无月份标签、格 8px
- [ ] **Step 3: LifePage.tsx 三区块**（Tab 或纵排三段，纵排为准）：
  - **习惯区**（HabitSection）：标题+「新习惯」按钮（对话框：name 必填/icon emoji 输入/color 色板 8 选）；今日打卡行列表（icon+name+打卡按钮：已打卡→绿色✓点击撤销（确认）、未打卡→「打卡」）；连续统计角标（每个习惯当前 streak 前端从 heatmap 数据算不了逐习惯——**简化：只显示全站今日 x/y 与年度热力图**，逐习惯 streak 不做，YAGNI）；HabitHeatmap 全年版 + 年份切换；习惯管理（编辑/归档/删除带 AlertDialog）
  - **随手记区**（NoteSection）：顶部快速输入（Textarea 2 行 + 「记一笔」按钮：POST /api/posts {title: 内容首行截30字, content, category_id: notes 分类 id（getCategories 找 slug=notes）, status:"published"}）；下方流水列表（getPosts({category:"notes", size:20})：日期+内容两行截断+删除按钮（AlertDialog，DELETE /api/posts/:id））；「查看更多」链接 /blog/category/notes
  - **照片墙区**（GalleryLightbox 集成）：既有网格保留 + 点击开灯箱 Dialog（大图 object-contain max-h-[80vh]、左右切换按钮、Esc/遮罩关闭、filename 灰字）+ 上传/删除既有逻辑迁移
- [ ] **Step 4: 查询键与 invalidate**：["habits"] ["habit-heatmap", year] ["notes"]（= getPosts category notes 的专用键）["gallery"] ["dashboard"]；各 mutation 对应失效
- [ ] **Step 5: 验证**：tsc×2/build 零错误；8090 后端造数据（建习惯+打卡+发随手记）→ dev 3001 /life HTML 200 + curl 形状对照 → 清理测试数据（删习惯/删随手记 post/DEL dashboard:summary）
- [ ] **Step 6: Commit** `feat(frontend): life page — habits heatmap, quick notes, gallery lightbox`

### Task 4.4: Dashboard 习惯卡 + 迷你热力

**Files:** Modify `frontend/src/pages/Dashboard.tsx`

**Interfaces:** Consumes habits_checked_today/habits_total（已有字段）、getHabitHeatmap、HabitHeatmap compact
- [ ] **Step 1:** 习惯打卡卡：value `habits_total ? `${habits_checked_today}/${habits_total}` : "—"`、sub「阶段 5 上线」文案删除→ habits_total>0 时 "今日已打卡" / 0 习惯时 "去创建习惯"；href="/life"
- [ ] **Step 2:** 卡片下方或收益曲线同行加迷你热力卡：`useQuery(["habit-heatmap", currentYear])` → `<HabitHeatmap compact days year />`；无数据显示引导文案
- [ ] **Step 3:** 验证 tsc×2/build + curl 形状；Commit `feat(frontend): dashboard habits card with mini heatmap`

### Task 4.5: 全站收尾打磨（延后项清算）

**Files:** Modify 多处（前端为主 + 两个后端小修）

**修复清单（全部来自前三阶段账本 triage）**：
1. **统一错误态**：新建 `frontend/src/components/ErrorState.tsx`（`{title?, message, onRetry?}`：居中图标+文案+重试按钮）；接入 6 处 isError 分支：Dashboard（替代永久骨架屏）、PostList、Archive、CommentSection（替代误导性"还没有评论"）、LifePage 各查询、InvestPage 两查询——`isError` 时渲染 ErrorState + refetch
2. **前端价格校验对齐后端**：InvestPage 改价 `priceValNum >= 0` → `> 0`；TradeDialog `Number(price) >= 0` → `> 0`（避免裸 binding 英文错误 toast）
3. **AssetDialog 预设切换残留**：selectPreset 切离 gold 时清空自动填充的 symbol/name（仅当当前值等于自动填充值才清，不吞用户输入）
4. **a11y 小修**：Topbar 用户菜单按钮 aria-label="用户菜单"；Dashboard 👋 加 aria-hidden；PostEditor 标签 X 按钮 type="button" + aria-label
5. **登录回跳保留 search+hash**：Login.tsx `from.pathname` → `from.pathname + from.search + from.hash`
6. **后端 ValueCurve carry-in**：invest.go PositionsHistory 的 closes 查询窗口前多取最近一行每 symbol（`OR (symbol, date) IN (SELECT symbol, MAX(date) FROM price_history WHERE date < ? GROUP BY symbol)` 或两次查询合并——实现者选简洁方案），窗口首日不再回退 CurrentPrice 造成的偏平
7. **quote.Service 单实例**：main.go 构造一次传入 router.Setup（签名加参 `qs *quote.Service`），消除双实例双连接池
8. **smoke.mjs**：资产创建挪进 try（清理 guaranteed）；删交易补 ok() 检查 WARN
- [ ] **验证**：backend build/vet/test 全绿；frontend tsc×2/build 零错误；起 8090+3001 手动 curl 抽查错误态（停后端→前端查询 isError→ErrorState 渲染路径由 build+tsc 保证，浏览器级验证留冒烟）；ValueCurve carry-in 用 curl 对照（造窗口前 close 数据验证首日 value 用 carry-in 价）
- [ ] **Commit** `fix: site-wide polish — error states, a11y, curve carry-in, single quote service`

### Task 4.6: 冒烟第 10 步 + 文档 + 阶段收尾

**Files:** Modify `frontend/scripts/smoke.mjs`、`README.md`、`CLAUDE.md`
- [ ] **Step 1: smoke 第 10 步（习惯链路，自清理）**：POST /api/habits {name:"冒烟习惯"} → POST check → GET heatmap 含今天 → GET /life 页面 waitForSelector('h1:has-text("生活")') → DELETE check → DELETE habit（try/finally 清理）→ `STEP10 HABIT PASS`
- [ ] **Step 2: 文档**：README API 表加生活端点组、数据库设计加 2 表、板块进度（阶段 4 完成=全站交付）；CLAUDE.md 结构加 handler/habit.go、HabitHeatmap、ErrorState，Key Design Decisions 加「随手记复用 posts/notes 分类」
- [ ] **Step 3: 全量验证**：backend/frontend 全绿 + 全栈冒烟 10 步 `SMOKE PASS ✅`（8080 被占报控制器协调）+ 测试数据三查清净
- [ ] **Step 4: Commit** `feat: phase 4 complete — life module and site-wide polish`（控制器负责合并推送）

---

## Self-Review 记录

- **Spec 覆盖**：§3.1 habits/habit_logs DDL（4.1）；§3.3 随手记复用 posts+notes 分类（4.1 种子 + 4.3 NoteSection）；§5 生活 6 端点（4.2）；§7 /life 结构 + Dashboard 习惯热力缩略（4.3/4.4）；§9 冒烟习惯链路（4.6）；§11 阶段 5"全站收尾"（4.5 延后项清算）。照片墙升级=灯箱（spec 未细化，YAGNI 裁量）。缺口：无。
- **占位符扫描**：4.2 Step 1 逻辑规格 + Step 3 gin 路由冲突预案（含备选路径与报告要求）；4.3 组件为结构要求（惯例确立）；4.5 逐条精确。无 TBD。
- **类型一致性**：Habit/HeatmapDay ↔ 契约 ↔ HabitHeatmap props ↔ Dashboard 复用（compact）一致；TodayCounts 签名 4.2 定义即消费；gin 路由冲突有显式预案不靠猜。
- **日期口径**（阶段 2 I-3 教训）：打卡/今日统计一律 Go 本地日期字符串传参，禁 CURDATE()；heatmap YEAR() 查询按 DATE 列无时区歧义。
