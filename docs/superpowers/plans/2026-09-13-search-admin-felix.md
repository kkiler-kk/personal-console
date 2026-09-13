# 迭代：全站搜索 + 管理后台扩充 + Felix 品牌 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ⌘K 命令面板接入真实全站搜索（文章/资产/习惯/分类/标签）；管理后台从 3 页扩到 7 页（总览/文章/分类/学习记录/习惯/资料）；品牌文案改「Felix 控制台」，用户昵称数据更新为 Felix。

**Architecture:** 后端新增 `handler/search.go`（GET /api/search 五类聚合 LIKE，转义 %/_）与 learn sessions 列表端点；前端 CommandPalette 改造（debounce 250ms + 分组结果）、新增 4 个 admin 页面 + AdminNav 共享导航、AuthContext 增加 refresh()；品牌字符串三处替换。

**Tech Stack:** 同前。

**Spec:** 无独立 spec（交付后迭代，用户需求 2026-09-13：搜索可用/后台扩充/改名 Felix）；BACKLOG 相关项：学习记录逐条删除入口（4.3 YAGNI 遗留）、习惯取消归档 UI（4.3 遗留）在本迭代关闭。

## Global Constraints

- /api/search 与 /api/learn/sessions 挂 JWT protected；错误 `{"error":...}`；LIKE 参数必须转义 `%`/`_`/`\`（escapeLike helper）
- 搜索响应形态（前后端契约，逐字）：

```
GET /api/search?q=xxx   （q 必填 trim 后 1..50 字符，超长 400）
→ 200 {
  posts:    [{id,title,slug,summary}]            -- published，title/summary LIKE，LIMIT 8
  assets:   [{id,symbol,name,type}]              -- symbol/name LIKE，LIMIT 8
  habits:   [{id,name,icon}]                     -- 未归档，name LIKE，LIMIT 5
  categories:[{id,name,slug}]                    -- name/slug LIKE，LIMIT 5
  tags:     [{id,name}]                          -- name LIKE，LIMIT 5
}
GET /api/learn/sessions?limit=100  → 200 {sessions:[StudySession...], total:int}
  -- StudySession json 与 model 一致（id,lang,activity,minutes,session_date,note,created_at）；IFNULL(note,'')；ORDER BY session_date DESC, id DESC；limit clamp 1..200 默认 100；total=全表 COUNT
```

- 品牌字符串仅三处：`frontend/index.html <title>`、`Sidebar.tsx`、`Login.tsx` 卡片标题 → 「Felix 控制台」；不动其他文案
- AuthContext 契约加法：`refresh(): Promise<void>`（重拉 profile 更新 state+localStorage），既有字段不动
- 惯例全沿用（strict/e:unknown/?? []/tnum/invalidate/toast/radix-nova grep/PID/显式 add/8080 现由代理进程 PID 70192 运行最终代码——验证用 PORT=8090，收尾时替换规则同前）
- conventional commits

## 文件结构

```
backend/
├── handler/search.go（新）          /api/search（Task S1）
├── handler/learn.go                 + Sessions 列表端点（Task S1）
├── router/router.go                 挂 2 路由（Task S1）
frontend/src/
├── lib/types.ts / lib/api.ts        SearchResult/LearnSessions 类型 + 2 端点（Task S2）
├── components/layout/CommandPalette.tsx  真实搜索（Task S2）
├── components/layout/Sidebar.tsx、pages/Login.tsx、index.html  Felix 品牌（Task S2）
├── components/admin/AdminNav.tsx（新）   admin 共享导航（Task S3）
├── pages/admin/{AdminOverview,AdminSessions,AdminHabits,AdminProfile}.tsx（新）（Task S3）
├── pages/admin/{AdminPosts,AdminCategories,PostEditor}.tsx  挂 AdminNav（Task S3）
├── context/AuthContext.tsx          + refresh()（Task S3）
├── App.tsx                          admin 路由 4 条新增 + /admin 指向总览（Task S3）
README.md / CLAUDE.md                文档（Task S4）
```

---

### Task 1: 后端 —— search + learn sessions 端点

**Files:** Create `backend/handler/search.go`；Modify `backend/handler/learn.go`、`backend/router/router.go`

**Interfaces:**
- Produces: 契约两个端点；`SearchHandler{db}`、`NewSearchHandler(db)`；`LearnHandler.Sessions`

- [ ] **Step 1: handler/search.go**

```go
// escapeLike: strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)——LIKE 参数先转义再包 %...%
// Search(c): q := strings.TrimSpace(c.Query("q"))；len([]rune(q)) 1..50 否则 400 {"error":"q must be 1-50 characters"}
// 五类查询（全部占位符、独立错误 log 后该类返回空数组不整体失败——搜索尽力而为）:
//   posts: SELECT id,title,slug,IFNULL(summary,'') AS summary FROM posts WHERE status='published' AND (title LIKE ? OR summary LIKE ?) ORDER BY created_at DESC LIMIT 8
//   assets: SELECT id,symbol,name,type FROM assets WHERE symbol LIKE ? OR name LIKE ? ORDER BY created_at LIMIT 8
//   habits: SELECT id,name,IFNULL(icon,'') AS icon FROM habits WHERE archived=FALSE AND name LIKE ? ORDER BY created_at LIMIT 5
//   categories: SELECT id,name,slug FROM categories WHERE name LIKE ? OR slug LIKE ? ORDER BY name LIMIT 5
//   tags: SELECT id,name FROM tags WHERE name LIKE ? ORDER BY name LIMIT 5
// 响应五键恒在（空为 []）；匿名结构体或 map 均可，json 键名与契约逐字
```

- [ ] **Step 2: learn.go 追加 Sessions**（逻辑见契约；复用 profileColumns 同款 IFNULL 惯例；note 可空 IFNULL）
- [ ] **Step 3: router.go** protected 组挂 `GET /search`、`GET /learn/sessions`
- [ ] **Step 4: 验证（PORT=8090，smoketest）**：造数据（发布文章标题含"测试搜索xyz"、建资产 NAMETEST、建习惯"测试习惯xyz"、录 session）→ `GET /api/search?q=测试搜索` 命中 posts；`q=NAMETEST`/`q=nametest`（大小写）命中 assets；`q=%` 不炸（转义生效，返回空或少量）；`q=` 空 → 400；51 字符 → 400；`GET /api/learn/sessions?limit=5` 形状对照；清理测试数据 + DEL dashboard:summary；build/vet/test 全绿（50 无回归）
- [ ] **Step 5: Commit** `feat(backend): global search endpoint and learn sessions list`

### Task 2: 前端 —— CommandPalette 真实搜索 + Felix 品牌

**Files:** Modify `frontend/src/lib/types.ts`、`frontend/src/lib/api.ts`、`frontend/src/components/layout/CommandPalette.tsx`、`frontend/src/components/layout/Sidebar.tsx`、`frontend/src/pages/Login.tsx`、`frontend/index.html`

**Interfaces:**
- Consumes: S1 端点
- Produces: types `SearchResult{posts:{id,title,slug,summary}[], assets:{id,symbol,name,type}[], habits:{id,name,icon}[], categories:{id,name,slug}[], tags:{id,name}[]}`、`LearnSession`（=既有 StudySession 命名对齐 types 惯例，含 lang/activity/minutes/session_date/note）、`LearnSessionsResp{sessions,total}`；api `search(q)`、`getLearnSessions(limit?)`

- [ ] **Step 1: types/api 追加**
- [ ] **Step 2: CommandPalette 改造**：
  - 输入 debounce 250ms（useEffect + setTimeout cleanup）→ `api.search(q)`（q.trim() 长度 >=1 才查；useQuery ["search", debouncedQ] enabled 门控）
  - 结果分组渲染（CommandGroup heading：文章/资产/习惯/分类/标签）：文章→`/blog/:slug`（副标题 summary 截 40）、资产→`/invest`、习惯→`/life`、分类→`/blog/category/:slug`、标签→`/blog/tag/:name`
  - 导航组保留（q 为空时只显示导航组；有 q 时导航组按 label 本地过滤 + 搜索结果并列）
  - isError 静默（面板内一行"搜索失败"）；isFetching 时 CommandEmpty 显示"搜索中…"
- [ ] **Step 3: Felix 品牌三处**：index.html `<title>Felix 控制台</title>`；Sidebar `KK 控制台`→`Felix 控制台`；Login CardTitle 同
- [ ] **Step 4: 验证**：tsc×2/build 零错误；8090 后端造数据 → dev 3001：⌘K 输入关键词 HTML 层面无法断言（无头可选 Playwright 快速脚本或代码走查，报告注明方式）；grep 全仓 "KK 控制台" 零残留
- [ ] **Step 5: Commit** `feat(frontend): real search in command palette; rebrand to Felix`

### Task 3: 前端 —— 管理后台扩充

**Files:** Create `frontend/src/components/admin/AdminNav.tsx`、`frontend/src/pages/admin/{AdminOverview,AdminSessions,AdminHabits,AdminProfile}.tsx`；Modify `frontend/src/App.tsx`、`frontend/src/context/AuthContext.tsx`、`frontend/src/pages/admin/{AdminPosts,AdminCategories,PostEditor}.tsx`

**Interfaces:**
- Consumes: S2 的 getLearnSessions；既有 getHabits/updateHabit/deleteHabit（?all=1）、getProfile/updateProfile、api.getPosts/getAdminPosts/getAssets/getTrades/getDashboardSummary
- Produces: AuthContext 加 `refresh(): Promise<void>`（重拉 getProfile 更新 user state+localStorage；契约加法不改既有字段）；AdminNav（横向链接条：总览/文章/分类/学习记录/习惯/资料，NavLink active 态）；路由 `/admin`→AdminOverview、`/admin/sessions`、`/admin/habits`、`/admin/profile`（既有 /admin/posts* 重定向关系：`/admin` 从"文章管理"改为"总览"，Topbar 用户菜单"管理后台"指向 /admin 不变）

- [ ] **Step 1: AuthContext.refresh()**（getProfile → 组 AuthUser → setUser+localStorage；失败 toast 不清会话——沿用 401-only 清理语义）
- [ ] **Step 2: AdminNav** 挂到全部 admin 页面顶部（AdminPosts/AdminCategories/PostEditor 三处既有页面插入 `<AdminNav/>`，最小侵入不动其余）
- [ ] **Step 3: AdminOverview（/admin）**：统计卡网格（文章 total（getPosts size=1 取 total）/评论+照片（dashboard summary）/资产数（getAssets.length）/交易数（getTrades.length）/学习记录 total（getLearnSessions(1).total）/习惯数（getHabits all=1 length）+ 快捷入口按钮到各管理页）
- [ ] **Step 4: AdminSessions（/admin/sessions）**：表格（日期/语言 Badge/类型中文（复用 learn constants ACTIVITY_LABELS——跨页 import 自 pages/learn/constants）/分钟/备注/删除 AlertDialog）；getLearnSessions(100)；删除→deleteLearnSession→invalidate ["learn-sessions"]+["learn-stats"]+["dashboard"]；分页暂不做（100 条 + "仅显示最近 100 条"注记）
- [ ] **Step 5: AdminHabits（/admin/habits）**：getHabits(all=1) 表格（icon/名称/归档 Badge/创建日期/操作：编辑对话框（name/icon/color 复用 LifePage HabitDialog 模式——可简化为内联实现）、归档/取消归档（updateHabit {archived:!x}）、删除 AlertDialog）；invalidate ["habits"]+["habit-heatmap"]+["dashboard"]
- [ ] **Step 6: AdminProfile（/admin/profile）**：getProfile 表单（昵称/头像 URL/简介 Textarea）→ updateProfile → auth.refresh() + toast + invalidate ["dashboard"]；昵称改动即时反映到 Topbar 头像菜单与 Dashboard 问候
- [ ] **Step 7: App.tsx** 加 4 路由 + /admin 指 AdminOverview
- [ ] **Step 8: 验证**：tsc×2/build 零错误；8090 造数据走查四页数据流（curl 形状对照 + dev HTML 200）；清理；grep 确认三处既有 admin 页 AdminNav 挂载
- [ ] **Step 9: Commit** `feat(frontend): admin expansion — overview, sessions, habits, profile`

### Task 4: 数据（昵称 Felix）+ 文档 + 冒烟回归 + 收尾

**Files:** Modify `README.md`、`CLAUDE.md`；DB 数据更新（非文件）

- [ ] **Step 1: 用户昵称更新**：`UPDATE users SET nickname='Felix' WHERE id=(SELECT MIN(id) FROM (SELECT id FROM users) t)` 之外——**精确做法**：先 `SELECT id,username,nickname FROM users` 列出，取**最早注册的真实用户**（非 smoketest）更新 nickname='Felix'；smoketest 不动；DEL dashboard:summary（问候语走 AuthContext 不受缓存影响，但保险）
- [ ] **Step 2: 文档**：README 标题/简介改「Felix 的个人控制台」、功能特性加全站搜索与管理后台条目、API 表加 2 端点；CLAUDE.md 结构加 handler/search.go、admin 页面清单、CommandPalette 搜索说明、品牌备注（改名只需动三处字符串——写清位置）
- [ ] **Step 3: 全栈冒烟回归**（10 步，8080 替换规则同前：PID 70192 为代理遗留 /tmp/blog-backend-final2，ps 复核后替换为本分支构建并保留）+ backend build/vet/test 全绿 + frontend tsc×2/build 零错误
- [ ] **Step 4: 收尾提交** `feat: search, admin expansion, Felix rebrand — iteration complete`（控制器合并推送）

---

## Self-Review 记录

- **需求覆盖**：搜索可用（S1 端点 + S2 面板）✓；后台扩充（S3 四页 + 导航，关闭 BACKLOG 两项：学习记录逐条删除、习惯取消归档）✓；Felix（S2 品牌三处 + S4 昵称数据）✓。
- **占位符扫描**：S1 含 SQL 全文与转义规则；S2/S3 为结构要求 + 关键交互规格（仓库惯例确立四轮）；S4 精确到 SQL 与替换点。无 TBD。
- **类型一致性**：SearchResult 五键 ↔ S1 响应逐字；LearnSession ↔ model.StudySession json tag；refresh() 契约在 S3 内定义即消费；AdminNav 消费既有路由。
- **风险**：搜索 LIKE '%q%' 无索引全表扫——个人站数据量（<万行）毫秒级，接受；q 长度上限 50 防滥用。
