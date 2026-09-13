# 迭代三：移除登录 + 总资产币种切换 + 持仓拖拽/列排序 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ①彻底移除登录（单用户本地部署，打开即用）②投资汇总卡 ¥/$ 一键切换（Dashboard 跟随）③持仓表拖拽自定义顺序（后端持久化）+ 列头排序。

**Architecture:** 后端把 JWT 校验中间件替换为"单用户直通"（每请求注入 userID=1），login/register 路由与死代码 handler 移除；前端删 Login 页与 token 流程，AuthContext 收敛为 UserContext 语义（mount 拉 profile）；smoke 去登录化。排序：assets 加 sort_order 列 + reorder 端点，前端原生 HTML5 DnD + 列头三态排序。币种切换纯前端（÷fx 单一汇率模型，localStorage 持久化）。

**Tech Stack:** 同前。

**Spec:** 交付后迭代（用户需求 2026-09-13 ×3）；spec §2/§5/§8 认证相关表述需修订（Task 6 执行）

## Global Constraints

- **安全语义变更（用户明确决定）**：站点无认证，所有 API 公开；后端 `r.Run(":8080")` 监听所有网卡——**局域网设备可访问财务数据**。spec/README 必须写明：公网部署前必须先恢复认证（spec §8 上云前置裁决清单强化）
- 单用户直通中间件：`c.Set("userID", int64(1)); c.Set("username", "felix")`——所有 handler 的 userID 消费点（post Create author_id、Profile、comment CanDelete、admin 接口）零改动继续工作；comment 的 CanDelete 对单用户全站可删属预期语义
- smoke.mjs 去登录化后仍必须 10 步全 PASS（步骤语义不变，仅去掉 login 与 Authorization 头）
- 拖拽排序后端持久化（sort_order），跨浏览器一致；reorder 端点校验 ids 集合与现有资产一致（防并发窗口脏序）否则 400
- 币种切换只影响**汇总层**（InvestPage 三卡 + Dashboard 组合卡）；持仓表/流水行级保持原币；换算 = CNY 值 ÷ summary.fx_usdcny（与后端汇总同一汇率口径）
- 惯例全沿用（strict/e:unknown/?? []/tnum/invalidate/toast/IFNULL/Go 本地日期/PID/显式 add/迁移幂等）；8080 现由 PID 83002（/tmp/blog-backend-iter，代理遗留）运行——验证可授权替换，收尾保留新二进制

## 文件结构

```
backend/
├── middleware/auth.go            → 单用户直通（重写，文件名保留）
├── router/router.go              合并 protected 组入公开组、删 login 路由
├── handler/user.go               删 Login/Register handler（Profile/UpdateProfile 保留）
├── cmd/migrate.go                assets.sort_order 幂等 ALTER（Task 3）
├── handler/asset.go              Create 置 sort_order=MAX+1；新增 Reorder（Task 3）
├── handler/invest.go             assets 查询 ORDER BY sort_order, created_at（Task 3）
frontend/src/
├── App.tsx / pages/Login.tsx（删）/ components/ProtectedRoute.tsx（删）
├── context/AuthContext.tsx       → UserContext 语义（保文件名，去 token/login/logout，isAdmin 恒 true）
├── lib/api.ts                    去 token 注入与 401 跳转
├── components/layout/Topbar.tsx  去退出登录
├── pages/invest/InvestPage.tsx   ¥/$ 切换 + 拖拽 + 列排序（Task 4/5）
├── pages/Dashboard.tsx           组合卡币种跟随（Task 5）
├── scripts/smoke.mjs             去登录化（Task 2）
README.md / CLAUDE.md / spec      （Task 6）
```

---

### Task 1: 后端去认证

**Files:** Modify `backend/middleware/auth.go`、`backend/router/router.go`、`backend/handler/user.go`

- [ ] **Step 1: middleware/auth.go 重写为单用户直通**

```go
package middleware

import "github.com/gin-gonic/gin"

// SingleUserMiddleware 单用户本地部署：所有请求视为首个用户（users.id=1）。
// 2026-09-13 用户决定移除登录。公网部署前必须恢复 JWT 认证（见 spec §8）。
func SingleUserMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("userID", int64(1))
		c.Set("username", "felix")
		c.Next()
	}
}
```

（保留 AuthMiddleware 与否二选一：倾向删除——pkg/jwt.go 与其测试留存不删（未来恢复认证的基座），仅中间件与路由收敛；报告注明。）

- [ ] **Step 2: router.go**：protected 组改用 SingleUserMiddleware()（组结构保留最小 diff）；删除 `api.POST("/auth/login", ...)` 行
- [ ] **Step 3: handler/user.go**：删除 Login 与 Register 两个 handler 函数（死代码；Profile/UpdateProfile 保留）；pkg/jwt.go 不动
- [ ] **Step 3.5（可选，终审建议）**: search.go 五处 LIKE 追加 `ESCAPE '\\\\'` 子句自证转义语义（防未来 sql_mode 漂移）；做了则补一条含 % 的 curl 对照
- [ ] **Step 4: 验证**：build/vet/test 全绿；8090 起服：无 token GET /api/posts 200、GET /api/user/profile 200（nickname=Felix）、POST /api/posts 无 token 201（author_id=1，测后删）、POST /api/auth/login → 404；kill PID
- [ ] **Step 5: Commit** `feat(backend)!: replace JWT auth with single-user passthrough`

### Task 2: 前端去登录 + smoke 去登录化

**Files:** Delete `frontend/src/pages/Login.tsx`、`frontend/src/components/ProtectedRoute.tsx`；Modify `frontend/src/App.tsx`、`frontend/src/context/AuthContext.tsx`、`frontend/src/lib/api.ts`、`frontend/src/components/layout/Topbar.tsx`、`frontend/src/components/blog/CommentSection.tsx`、`frontend/scripts/smoke.mjs`

- [ ] **Step 1: AuthContext**：去 token/login/logout；mount 时 getProfile 拉 user（失败 toast 不阻塞——站点仍可用，仅问候语/头像缺失）；isAdmin 恒 true；导出契约变为 `{ user, isAdmin, refresh }`——grep 全部 useAuth 消费点同步（Topbar logout 删除、Login 已删、CommentSection 的 `token ? undefined : email` 改为恒 email 路径、AdminProfile refresh 保留）
- [ ] **Step 1.5（上迭代终审 Important 移交）**: LearnPage 三处 mutation 的 invalidateAll 追加 `["learn-sessions"]`（录学习后管理后台学习记录/总览 30s 陈旧窗口闭环）
- [ ] **Step 2: api.ts**：删 token 注入与 401 清 storage 跳转逻辑（401 已不可能；保留 ApiError 抛出）
- [ ] **Step 3: App.tsx**：删 /login 路由与 ProtectedRoute 包裹（布局路由直接渲染）；根路径 / 直达 Dashboard
- [ ] **Step 4: smoke.mjs 去登录化**：删第 2 步登录（保留第 1 步"访问 / 不跳登录"改为"访问 / 直达 Dashboard"断言 waitForSelector text=已发布文章）；全部 Authorization 头删除；步骤重编号注释；**10 步语义全保留**；另按终审建议新增两断言：`GET /api/search?q=smoke` 200 且五键恒在（posts/assets/habits/categories/tags 均数组）、`/admin` 总览可达（waitForSelector text=数据总览 或实际标题——读 AdminOverview 现状定选择器）
- [ ] **Step 5: 验证**：tsc×2/build 零错误；8090 后端（Task 1 代码）+ vite 3001 → 全栈冒烟 10 步 PASS；未登录直入 / 渲染 Dashboard；grep token/login 残留（frontend/src 无 localStorage token 引用）
- [ ] **Step 6: Commit** `feat(frontend)!: remove login flow — single-user local deployment`

### Task 3: 后端拖拽排序持久化

**Files:** Modify `backend/cmd/migrate.go`、`backend/handler/asset.go`、`backend/handler/invest.go`

- [ ] **Step 1: migrate.go 幂等 ALTER**（information_schema 探测模式）：`ALTER TABLE assets ADD COLUMN sort_order INT NOT NULL DEFAULT 0`；随后一次性归一：`UPDATE assets SET sort_order = id WHERE sort_order = 0`（幂等：二次运行 sort_order 非 0 不再触发——用 `WHERE sort_order = 0` 天然幂等，新资产 Create 会赋 MAX+1）
- [ ] **Step 2: asset.go**：model.Asset 加 `SortOrder int json:"sort_order" db:"sort_order"`；Create INSERT 列加 sort_order，值 `SELECT COALESCE(MAX(sort_order),0)+1 FROM assets`（同事务或先查后插，单用户无并发压力，先查后插即可）；新增 Reorder：

```go
// PUT /api/assets/reorder  body {ids:[int64,...]}
// 校验：ids 与 SELECT id FROM assets 集合完全一致（数量+成员，顺序任意）否则 400 {"error":"ids must match all existing assets"}
// 事务逐位 UPDATE assets SET sort_order=? WHERE id=?（i 从 1 起）；失败回滚 500
// 成功 DEL dashboard:summary → 200 {message}
```

- [ ] **Step 3: invest.go**：ComputePositionsResponse 的 assets 查询 `ORDER BY sort_order, created_at`（positions 行序即自定义序）；asset.go List 同步改
- [ ] **Step 4: router**：`protected.PUT("/assets/reorder", ah.Reorder)`——**注意 gin 路由**：/assets/reorder 与 /assets/:id 同段（PUT 树），静态优先共存（同 /habits/heatmap 先例），起服实测
- [ ] **Step 5: 验证**：build/vet/test 全绿；8090：建 3 测试资产 → List 顺序=创建序 → PUT reorder [3,1,2] → List/positions 顺序变 → ids 缺一个 → 400 → 重启后端顺序保持（持久化）→ 清理
- [ ] **Step 6: Commit** `feat(backend): persistent asset sort order with reorder endpoint`

### Task 4: 前端拖拽 + 列排序

**Files:** Modify `frontend/src/lib/types.ts`（Asset 加 sort_order）、`frontend/src/lib/api.ts`（reorderAssets(ids)）、`frontend/src/pages/invest/InvestPage.tsx`

- [ ] **Step 1: 排序模式 state**：`sortKey: null | "quantity"|"avg_cost"|"price"|"day_change_pct"|"pe_ttm"|"market_value"|"unrealized_pnl"` + `sortDir: "asc"|"desc"`；列头点击三态（无→desc→asc→无）；箭头指示（ArrowUpDown/ArrowUp/ArrowDown）；null 值排序时恒沉底
- [ ] **Step 2: 自定义模式（sortKey===null）**：行 `draggable` + 首列把手（GripVertical 图标）；原生 HTML5 DnD（onDragStart 记 index、onDragOver preventDefault+插入位预览、onDrop 重排）；**仅「全部」筛选 Tab 且 sortKey===null 时可拖**（筛选/排序态把手禁用 title 说明）；drop 后 `reorderAssets(新序 ids)` → invalidate ["assets"]["positions"]["dashboard"]；乐观更新可选（先 setState 后 mutation，失败 invalidate 回滚——报告注明选择）
- [ ] **Step 3: 排序模式**：visiblePositions 经 useMemo sort（比较器处理 null 沉底、数值降/升）；拖拽禁用
- [ ] **Step 4: 验证**：tsc×2/build；8090+3001 Playwright：建 3 资产→拖第 3 到第 1（HTML5 DnD 事件 Playwright 可 dispatchEvent 模拟或改用 dragTo）→ 刷新页面顺序保持→点市值列头两次（降/升）→「自定义」恢复；清理
- [ ] **Step 5: Commit** `feat(frontend): drag-to-reorder positions and sortable columns`

### Task 5: 总资产 ¥/$ 币种切换

**Files:** Modify `frontend/src/pages/invest/InvestPage.tsx`、`frontend/src/pages/Dashboard.tsx`；Create `frontend/src/lib/displayCurrency.ts`

- [ ] **Step 1: displayCurrency.ts**：`useDisplayCurrency(): [currency: "CNY"|"USD", setCurrency, toggle]`——localStorage 键 `invest-total-currency` 默认 CNY；storage 事件跨标签同步（同 useInvestMask 模式）；`convertFromCNY(v: number, currency, fx): number`（USD → v/fx）
- [ ] **Step 2: InvestPage**：总资产卡 action 槽加切换按钮（显示目标币种符号，如当前 ¥ 则显示 "$"，title "切换为美元"）；三卡（总资产/总盈亏/今日盈亏）value 经 convertFromCNY + formatMoney(v, currency)；sub 汇率行保留；fx 取 summary.fx_usdcny（<=0 时禁用切换 toast 提示）
- [ ] **Step 3: Dashboard 组合卡**：同 hook 跟随（value/sub 盈亏换算）；迷你符号 ¥/$ 前缀正确
- [ ] **Step 4: 验证**：tsc×2/build；Playwright：默认 ¥ → 点切换 → 三卡变 $ 且数值 = 原值/fx（容差 0.01）→ 刷新保持 → Dashboard 同步 $ → 切回；清理
- [ ] **Step 5: Commit** `feat(frontend): CNY/USD toggle for portfolio summary cards`

### Task 6: 文档 + spec 修订 + 冒烟回归 + 收尾

**Files:** Modify `README.md`、`CLAUDE.md`、`docs/superpowers/specs/2026-09-12-personal-site-redesign-design.md`、`BACKLOG.md`

- [ ] **Step 1: spec 修订**：§2 原则（"移除注册页保留 JWT 登录"→"无认证单用户直通（2026-09-13 用户决定）；公网部署前必须恢复认证"）；§5 认证行删除，并**回写上迭代两端点**（GET /api/search 五类聚合、GET /api/learn/sessions）；§8 安全节改写（LAN 暴露面明示 + 上云前置裁决置顶）；§3.1 assets 加 sort_order 注释
- [ ] **Step 2: README**：快速开始去登录步骤；功能特性加三条（无登录直入/币种切换/拖拽排序）；API 表：删 login 行、加 PUT /api/assets/reorder；**安全注意**一节新增（LAN 提示）
- [ ] **Step 3: CLAUDE.md**：Auth 行改 single-user passthrough；middleware 描述；Key Design Decisions 加「无认证是用户明确决定，恢复认证从 pkg/jwt.go 基座重建」；顺手修 Task 4 移交的三处措辞（seven cards/limit-capped/AdminProfile placeholder 备注）
- [ ] **Step 4: BACKLOG**：移除已关闭项（无——本迭代未直接消费 BACKLOG 条目，则跳过）；加一条「公网部署前恢复认证（middleware/auth.go git 历史有 JWT 版本）」置顶
- [ ] **Step 5: 全量验证**：backend build/vet/test 全绿；frontend tsc×2/build；全栈冒烟 10 步 PASS（去登录版）；8080 替换为本分支最终二进制保留（ps 复核 PID 83002 后替换）
- [ ] **Step 6: Commit** `feat: no-auth single user, currency toggle, drag-sort — iteration three complete`

---

## Self-Review 记录

- **需求覆盖**：移除登录（Task 1/2 + spec/文档）、¥/$ 切换（Task 5）、拖拽+列排序（Task 3/4）——三需求全落；smoke 去登录化在 Task 2、终验在 Task 6。
- **顺序依赖**：Task 2 依赖 Task 1（冒烟需无认证后端）；Task 4 依赖 Task 3；Task 5 独立；Task 6 收尾。串行执行天然满足。
- **风险点**：①comment CanDelete 语义变化（直通后恒可删——单用户预期，计划已注明）②gin /assets/reorder 与 /assets/:id PUT 树共存（有 /habits/heatmap 先例，Task 3 Step 4 实测）③HTML5 DnD 的 Playwright 可测性（Task 4 给了 dispatchEvent/dragTo 双路径）④AuthContext 契约变更是**破坏性**的（login/token 移除）——Task 2 Step 1 要求 grep 全消费点，tsc strict 会兜住遗漏。
- **占位符扫描**：middleware 全码、reorder 逻辑规格、DnD/排序交互规格明确；无 TBD。
- **类型一致性**：sort_order 在 model/types/Create/ORDER BY/reorder 五处一致；useDisplayCurrency 契约 Task 5 内定义即消费；AuthContext 新契约 {user,isAdmin,refresh} 在 Task 2 内闭环。
