# 个人控制台重构 · 阶段 0+1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 GitHub 私有仓库上线（阶段 0），并用全新仪表盘风 UI 重写前端、扩展少量后端，达到现有博客功能等价 + Dashboard 壳（阶段 1）。

**Architecture:** Go/Gin + MySQL + Redis 后端保留并小幅扩展（categories.section 字段、/api/dashboard/summary 聚合接口、下线 register）；前端在 `frontend/` 推倒重写为 Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui + TanStack Query；旧前端暂存 `frontend-legacy/`，阶段末删除。

**Tech Stack:** Go 1.22 / Gin / sqlx / MySQL 8 / Redis 7；Vite 6 / React 18 / TypeScript 5 / Tailwind v4 / shadcn/ui / TanStack Query v5 / react-router-dom v6 / Recharts / sonner / zod / react-markdown。

**Spec:** `docs/superpowers/specs/2026-09-12-personal-site-redesign-design.md`

## Global Constraints

- 所有新 API 一律走 JWT 认证（沿用 `middleware/auth.go`），错误响应统一 `{"error": "..."}`。
- 数据库变更全部走 `backend/cmd/migrate.go` 自动迁移，且必须幂等（重复启动不报错）。
- Redis 缓存：读接口可缓存，任何 mutation 后必须失效相关 key（沿用现有模式）。
- 前端界面 v1 仅中文；数字使用 `tabular-nums` 等宽对齐；涨绿跌红（美股习惯）。
- 设计 token：浅色背景 `#F7F8FA`、卡片白 `#FFFFFF`、边框 `#E5E7EB`、主色靛蓝 `#4F46E5`；深色背景 `#0E0F12`、卡片 `#16181D`、边框 `#262A31`、主色 `#6366F1`；圆角 12px；阴影只用 `0 1px 3px rgba(0,0,0,.06)`。
- 仓库必须**私有**；`backend/.env`、`backend/uploads/`、`backups/`、`node_modules`、`dist` 永不入库。
- 每个 Task 结束必须 commit；提交信息用 conventional commits（feat/chore/docs/refactor）。
- 本地开发端口：后端 8080、前端 3000（Vite 代理 `/api` 与 `/uploads` 到 8080）。

## 现有 API 契约速查（新前端直接消费，字段名以此为准）

```
POST /api/auth/login {username,password} → 200 {token, user:{id,username,nickname,avatar}} | 401 {error}
GET  /api/user/profile (JWT) → 200 {id,username,nickname,avatar,bio,created_at}
PUT  /api/user/profile (JWT) {nickname,avatar,bio} → 200 {message}
GET  /api/posts?page=1&size=10&category=&tag=&year=&month= → 200 {posts:Post[], total, page, size}
GET  /api/posts/:slug → 200 Post（含 author、category、tags；自动 +view_count）
GET  /api/posts/archive → 200 {archives:[{year,month,count}]}
GET  /api/admin/posts (JWT) → 200 {posts:Post[], total, page, size}（含 draft）
POST /api/posts (JWT) {title,summary,content,tags:[string],category_id?,status?} → 201 {id,slug}
PUT  /api/posts/:id (JWT) 同上 → 200 {message}
DELETE /api/posts/:id (JWT) → 200 {message}
GET  /api/categories → 200 {categories:Category[]}
POST /api/categories (JWT) {name,slug} → 201 {id}
PUT  /api/categories/:id (JWT) {name,slug} → 200 {message}
DELETE /api/categories/:id (JWT) → 200 {message}
GET  /api/tags → 200 {tags:[{id,name,count}]}
GET  /api/posts/:slug/comments?email= → 200 {comments:Comment[], total}（Comment 含 replies、can_delete）
POST /api/posts/:slug/comments {name,email,content,parent_id?} → 201 Comment
POST /api/comments/:id/like {email} → 200 {like_count, liked}
GET  /api/comments/:id/like?email= → 200 {liked}
DELETE /api/comments/:id (JWT 或 {email}) → 200 {message}
POST /api/upload (JWT, FormData 字段名 image，≤10MB，jpg/png/gif/webp) → 200 {url:"/uploads/xxx"}
GET  /api/gallery (JWT) → 200 {items:[{filename,url,size,mod_time}], total}
DELETE /api/gallery/:filename (JWT) → 200 {message}

Post = {id,title,slug,summary,content,author_id,category_id:number|null,status,view_count,created_at,updated_at,author?,category?,tags?}
Category = {id,name,slug,created_at}   （Task 1.2 起增加 section 字段）
Comment = {id,post_id,parent_id:number|null,name,content,like_count,can_delete,created_at,updated_at,replies?}
```

---

# 阶段 0：GitHub 初始化 + 隐私清理

### Task 0.1: 隐私文件移出 + 首次提交 + 推送私有仓库

**Files:**
- Modify: `.gitignore`
- Move out: `edit_wedding_videos.py`、`edit_wedding_videos.sh`、`女本位主义核心思想综述.md` → `~/personal/`

**Interfaces:**
- Consumes: 无（git 仓库已由设计文档阶段 `git init`，主分支 `main`，已有 1 个 docs 提交）
- Produces: GitHub 私有远程仓库 `origin`；干净的首次全量提交

- [ ] **Step 1: 移动隐私文件（移动不删除）**

```bash
mkdir -p ~/personal
mv /Users/kk/data/code/blogs/edit_wedding_videos.py ~/personal/
mv /Users/kk/data/code/blogs/edit_wedding_videos.sh ~/personal/
mv "/Users/kk/data/code/blogs/女本位主义核心思想综述.md" ~/personal/
ls ~/personal/   # 确认三个文件都在
```

- [ ] **Step 2: 更新 .gitignore**

追加以下内容到 `.gitignore` 末尾：

```
backups/
.claude/settings.local.json
```

- [ ] **Step 3: 确认无隐私泄漏后全量提交**

```bash
cd /Users/kk/data/code/blogs
git status --short | head -30          # 人工检查：不应出现 wedding/女本位/.env/uploads
git ls-files -o --exclude-standard | grep -iE 'wedding|女本位|\.env$' && echo "!!! 有隐私文件，停止" || echo "OK 无隐私文件"
git add -A
git commit -m "chore: initial commit — existing blog system before console rewrite"
```

- [ ] **Step 4: 创建 GitHub 私有仓库并推送**

```bash
gh auth status   # 未登录则先 gh auth login
gh repo create personal-console --private --source=. --remote=origin --push
```

（仓库名可按用户喜好改；**必须 `--private`**，站点含财务数据。）

- [ ] **Step 5: 验证**

```bash
gh repo view --json isPrivate,url   # isPrivate 必须为 true
git log --oneline origin/main | head -3
```

Expected: `isPrivate: true`，远程有两个提交（docs + chore）。

---

# 阶段 1：前端重写 + 后端小幅扩展

### Task 1.1: 后端 —— categories 增加 section 字段

**Files:**
- Modify: `backend/cmd/migrate.go`（新增幂等 ALTER）
- Modify: `backend/model/model.go`（Category 加 Section）
- Modify: `backend/handler/category.go`（Create/Update 支持 section，含白名单校验）

**Interfaces:**
- Consumes: 现有 `config.DB`、`handler.NewCategoryHandler(cfg, db, rdb)` 签名不变
- Produces: `GET /api/categories` 返回的 Category 含 `section` 字段，取值 `invest|learn|fitness|life|blog`，默认 `blog`；POST/PUT 接受可选 `section`

- [ ] **Step 1: migrate.go 增加幂等迁移**

在 `migrate.go` 的建表语句之后追加（先查 information_schema 再 ALTER，重复启动安全）：

```go
// add categories.section if missing
var colCount int
if err := db.Get(&colCount, `
	SELECT COUNT(*) FROM information_schema.columns
	WHERE table_schema = DATABASE() AND table_name = 'categories' AND column_name = 'section'`); err != nil {
	return err
}
if colCount == 0 {
	if _, err := db.Exec("ALTER TABLE categories ADD COLUMN section VARCHAR(20) NOT NULL DEFAULT 'blog'"); err != nil {
		return err
	}
}
```

（按 migrate.go 现有函数签名适配：若现有函数不返回 error，则在其内部 log.Fatal 风格保持一致。）

- [ ] **Step 2: model.Category 增加字段**

```go
type Category struct {
	ID        int64     `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Slug      string    `json:"slug" db:"slug"`
	Section   string    `json:"section" db:"section"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}
```

- [ ] **Step 3: category.go 的 Create/Update 支持 section**

在 Create 的请求结构体加 `Section string \`json:"section"\``，并加校验函数：

```go
func validSection(s string) string {
	switch s {
	case "invest", "learn", "fitness", "life":
		return s
	default:
		return "blog"
	}
}
```

Create 的 INSERT 改为 `INSERT INTO categories (name, slug, section) VALUES (?, ?, ?)`，参数追加 `validSection(req.Section)`；Update 同理 `UPDATE categories SET name=?, slug=?, section=? WHERE id=?`。注意 Create/Update 成功后需继续失效 `categories:list` 缓存（沿用现有代码）。

- [ ] **Step 4: 编译 + 启动验证**

```bash
cd /Users/kk/data/code/blogs/backend
go build ./...
docker compose -f ../docker-compose.yml up -d   # 确保 MySQL/Redis 在跑
go run cmd/*.go &                                # 启动后端（自动迁移）
sleep 2
curl -s localhost:8080/api/categories | head -c 300   # 每条应有 "section":"blog"
TOKEN=$(curl -s localhost:8080/api/auth/login -H 'Content-Type: application/json' -d '{"username":"<现有账号>","password":"<密码>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s localhost:8080/api/categories -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"投资笔记","slug":"invest-notes","section":"invest"}'
curl -s localhost:8080/api/categories   # 新分类 section=invest
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/migrate.go backend/model/model.go backend/handler/category.go
git commit -m "feat(backend): categories.section field for five-zone navigation"
```

### Task 1.2: 后端 —— Dashboard 聚合接口 + 下线注册

**Files:**
- Create: `backend/handler/dashboard.go`
- Modify: `backend/router/router.go`（挂路由、删 register 行）

**Interfaces:**
- Consumes: `middleware.AuthMiddleware`（c.GetInt64("userID") 可用）、sqlx.DB、redis.Client
- Produces: `GET /api/dashboard/summary` (JWT) → 200，JSON schema（**后续阶段只增不改**）：

```json
{
  "posts_total": 0, "comments_total": 0, "gallery_total": 0,
  "portfolio_value": null, "portfolio_pnl": null, "portfolio_pnl_pct": null,
  "review_due": 0, "learn_streak": 0,
  "workouts_this_week": 0,
  "habits_checked_today": 0, "habits_total": 0
}
```

- [ ] **Step 1: 写 handler/dashboard.go**

```go
package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/jmoiron/sqlx"
)

type DashboardHandler struct {
	db        *sqlx.DB
	redis     *redis.Client
	uploadDir string
}

func NewDashboardHandler(db *sqlx.DB, rdb *redis.Client) *DashboardHandler {
	return &DashboardHandler{db: db, redis: rdb, uploadDir: "./uploads"}
}

type dashboardSummary struct {
	PostsTotal    int      `json:"posts_total"`
	CommentsTotal int      `json:"comments_total"`
	GalleryTotal  int      `json:"gallery_total"`
	PortfolioValue *float64 `json:"portfolio_value"`
	PortfolioPnl   *float64 `json:"portfolio_pnl"`
	PortfolioPnlPct *float64 `json:"portfolio_pnl_pct"`
	ReviewDue     int      `json:"review_due"`
	LearnStreak   int      `json:"learn_streak"`
	WorkoutsThisWeek int   `json:"workouts_this_week"`
	HabitsCheckedToday int `json:"habits_checked_today"`
	HabitsTotal   int      `json:"habits_total"`
}

func (h *DashboardHandler) Summary(c *gin.Context) {
	const cacheKey = "dashboard:summary"
	if cached, err := h.redis.Get(context.Background(), cacheKey).Result(); err == nil {
		c.Data(http.StatusOK, "application/json", []byte(cached))
		return
	}

	var s dashboardSummary
	h.db.Get(&s.PostsTotal, "SELECT COUNT(*) FROM posts WHERE status = 'published'")
	h.db.Get(&s.CommentsTotal, "SELECT COUNT(*) FROM comments")
	// gallery: count image files in uploads dir
	if entries, err := os.ReadDir(h.uploadDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			switch strings.ToLower(filepath.Ext(e.Name())) {
			case ".jpg", ".jpeg", ".png", ".gif", ".webp":
				s.GalleryTotal++
			}
		}
	}
	// tool modules land in phases 2-5; fields stay zero/null until then

	resp, _ := json.Marshal(s)
	h.redis.Set(context.Background(), cacheKey, resp, 60*time.Second)
	c.Data(http.StatusOK, "application/json", resp)
}
```

注意：`comments` 表名以 `migrate.go` 实际建表名为准（执行时先 `grep -n "CREATE TABLE" backend/cmd/migrate.go` 确认，若表名不同则改 SQL）。

- [ ] **Step 2: router.go 挂载并下线 register**

在 `router.go` 中：删除 `api.POST("/auth/register", uh.Register)` 这一行；在 handlers 初始化区加 `dh := handler.NewDashboardHandler(db, rdb)`；在 `protected` 组内加：

```go
protected.GET("/dashboard/summary", dh.Summary)
```

- [ ] **Step 3: 编译 + curl 验证**

```bash
cd /Users/kk/data/code/blogs/backend && go build ./... && go run cmd/*.go &
sleep 2
curl -s -X POST localhost:8080/api/auth/register -H 'Content-Type: application/json' -d '{"username":"x","password":"x","nickname":"x"}' -o /dev/null -w "%{http_code}\n"   # 期望 404
TOKEN=<同上获取>
curl -s localhost:8080/api/dashboard/summary -H "Authorization: Bearer $TOKEN"   # 返回完整 schema
curl -s localhost:8080/api/dashboard/summary -o /dev/null -w "%{http_code}\n"    # 无 token 期望 401
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add backend/handler/dashboard.go backend/router/router.go
git commit -m "feat(backend): dashboard summary endpoint; retire register route"
```

### Task 1.3: 前端脚手架 —— Vite + TS + Tailwind v4 + shadcn/ui + 设计 token

**Files:**
- Move: `frontend/` → `frontend-legacy/`
- Create: 全新 `frontend/`（脚手架生成）
- Modify: `frontend/vite.config.ts`、`frontend/src/index.css`、`frontend/src/App.tsx`、`frontend/components.json`

**Interfaces:**
- Consumes: 无
- Produces: `npm run dev` 起 3000 端口并代理 `/api`、`/uploads` 到 8080；`@/` 别名指向 `frontend/src/`；shadcn 组件位于 `frontend/src/components/ui/`；CSS 变量 token（--background/--card/--border/--primary 等）全站生效；`cn()` 工具在 `@/lib/utils`

- [ ] **Step 1: 移走旧前端，生成新脚手架**

```bash
cd /Users/kk/data/code/blogs
mv frontend frontend-legacy
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install tailwindcss @tailwindcss/vite @tanstack/react-query react-router-dom recharts sonner zod react-markdown remark-gfm lucide-react date-fns clsx tailwind-merge class-variance-authority @tailwindcss/typography
```

- [ ] **Step 2: 配置 vite.config.ts**

```ts
import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:8080",
      "/uploads": "http://localhost:8080",
    },
  },
})
```

同时在 `tsconfig.json` 与 `tsconfig.app.json` 的 `compilerOptions` 中加入：

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 3: 初始化 shadcn/ui 并添加组件**

```bash
cd /Users/kk/data/code/blogs/frontend
npx shadcn@latest init -d        # 默认 new-york 风格
npx shadcn@latest add button card input textarea dialog dropdown-menu tabs badge skeleton table select command sheet avatar separator tooltip alert-dialog label switch
```

- [ ] **Step 4: 写入设计 token（覆盖 shadcn 生成的 src/index.css 顶部变量）**

`frontend/src/index.css` 完整内容（`:root`/`.dark` 变量部分按下面写，其余保留 shadcn 生成内容）：

```css
@import "tailwindcss";
@import "tw-animate-css";
@plugin "@tailwindcss/typography";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.75rem;
  --background: #f7f8fa;
  --foreground: #111318;
  --card: #ffffff;
  --card-foreground: #111318;
  --popover: #ffffff;
  --popover-foreground: #111318;
  --primary: #4f46e5;
  --primary-foreground: #ffffff;
  --secondary: #eef0f4;
  --secondary-foreground: #111318;
  --muted: #eef0f4;
  --muted-foreground: #6b7280;
  --accent: #eef2ff;
  --accent-foreground: #4f46e5;
  --destructive: #dc2626;
  --border: #e5e7eb;
  --input: #e5e7eb;
  --ring: #4f46e5;
}

.dark {
  --background: #0e0f12;
  --foreground: #e6e8ec;
  --card: #16181d;
  --card-foreground: #e6e8ec;
  --popover: #16181d;
  --popover-foreground: #e6e8ec;
  --primary: #6366f1;
  --primary-foreground: #ffffff;
  --secondary: #1f232b;
  --secondary-foreground: #e6e8ec;
  --muted: #1f232b;
  --muted-foreground: #9aa1ad;
  --accent: #1e2140;
  --accent-foreground: #a5b4fc;
  --destructive: #ef4444;
  --border: #262a31;
  --input: #262a31;
  --ring: #6366f1;
}

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground antialiased; }
}

/* 数字等宽对齐（金额/统计） */
.tnum { font-variant-numeric: tabular-nums; }
```

若 shadcn init 生成的 CSS 结构与上面冲突（版本差异），以「变量名一致、值按上表」为准合并；`@theme inline` 段必须保留 shadcn 用到的全部 `--color-*` 映射。

- [ ] **Step 5: 最小 App 验证**

`frontend/src/App.tsx` 临时改为：

```tsx
import { Button } from "@/components/ui/button"

export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">个人控制台</h1>
      <Button>靛蓝主色 ✓</Button>
    </div>
  )
}
```

删除脚手架自带的 `src/App.css`；`src/main.tsx` 只保留 `import "./index.css"` 与渲染 `<App/>`。

```bash
npm run build && npx tsc --noEmit   # 零错误
npm run dev &                        # 打开 http://localhost:3000 目测：浅灰底、白字卡片按钮靛蓝
kill %1
```

- [ ] **Step 6: Commit**

```bash
cd /Users/kk/data/code/blogs
git add frontend frontend-legacy .gitignore
git commit -m "feat(frontend): scaffold Vite+TS+Tailwind v4+shadcn with dashboard design tokens"
```

### Task 1.4: 前端基础层 —— 类型、API 客户端、Auth/Theme Context

**Files:**
- Create: `frontend/src/lib/types.ts`、`frontend/src/lib/api.ts`、`frontend/src/lib/format.ts`
- Create: `frontend/src/context/AuthContext.tsx`、`frontend/src/context/ThemeContext.tsx`
- Modify: `frontend/src/main.tsx`（挂 Provider + QueryClient + Toaster）

**Interfaces:**
- Consumes: §API 契约速查（Task 1.1/1.2 的 section 与 summary 已生效）
- Produces（后续所有页面依赖，签名必须一致）:
  - `api.*` 全部端点函数（见 Step 2 代码）
  - `useAuth(): { user: AuthUser | null; token: string | null; login(u: string, p: string): Promise<void>; logout(): void; isAdmin: boolean }`，`AuthUser = { id: number; username: string; nickname: string; avatar: string }`
  - `useTheme(): { theme: "light" | "dark"; toggle(): void }`
  - `formatDate(iso: string): string`（→ `2026-09-12`）、`formatDateTime(iso: string): string`（→ `2026-09-12 14:30`）、`cn(...)` 来自 `@/lib/utils`（shadcn 已生成）

- [ ] **Step 1: lib/types.ts**

```ts
export interface AuthUser { id: number; username: string; nickname: string; avatar: string }
export interface Category { id: number; name: string; slug: string; section: Section; created_at: string }
export type Section = "invest" | "learn" | "fitness" | "life" | "blog"
export interface Tag { id: number; name: string; count?: number }
export interface Post {
  id: number; title: string; slug: string; summary: string; content: string
  author_id: number; category_id: number | null; status: "published" | "draft"
  view_count: number; created_at: string; updated_at: string
  author?: AuthUser & { bio?: string }; category?: Category; tags?: Tag[]
}
export interface Comment {
  id: number; post_id: number; parent_id: number | null; name: string; content: string
  like_count: number; can_delete: boolean; created_at: string; updated_at: string
  replies?: Comment[]
}
export interface GalleryItem { filename: string; url: string; size: number; mod_time: string }
export interface DashboardSummary {
  posts_total: number; comments_total: number; gallery_total: number
  portfolio_value: number | null; portfolio_pnl: number | null; portfolio_pnl_pct: number | null
  review_due: number; learn_streak: number; workouts_this_week: number
  habits_checked_today: number; habits_total: number
}
export interface PostListResp { posts: Post[]; total: number; page: number; size: number }
export interface ArchiveItem { year: number; month: number; count: number }
```

- [ ] **Step 2: lib/api.ts**

```ts
import type { AuthUser, Category, Comment, DashboardSummary, GalleryItem, Post, PostListResp, ArchiveItem, Tag } from "./types"

const BASE = "/api"

function getToken(): string | null { return localStorage.getItem("token") }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  const isForm = options.body instanceof FormData
  if (!isForm) headers["Content-Type"] = "application/json"
  const token = getToken()
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  let data: any = null
  try { data = await res.json() } catch { /* 204 等无 body 场景 */ }
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("token"); localStorage.removeItem("user")
      if (!location.pathname.startsWith("/login")) location.href = "/login"
    }
    throw new ApiError(res.status, data?.error || `请求失败 (${res.status})`)
  }
  return data as T
}

const qs = (p: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams()
  Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== "") s.set(k, String(v)) })
  const str = s.toString()
  return str ? `?${str}` : ""
}

export interface PostInput { title: string; summary?: string; content: string; tags?: string[]; category_id?: number | null; status?: "published" | "draft" }

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  getProfile: () => request<AuthUser & { bio: string; created_at: string }>("/user/profile"),
  updateProfile: (body: { nickname?: string; avatar?: string; bio?: string }) =>
    request<{ message: string }>("/user/profile", { method: "PUT", body: JSON.stringify(body) }),

  getPosts: (p: { page?: number; size?: number; category?: string; tag?: string; year?: number; month?: number } = {}) =>
    request<PostListResp>(`/posts${qs(p)}`),
  getPost: (slug: string) => request<Post>(`/posts/${slug}`),
  getArchive: () => request<{ archives: ArchiveItem[] }>("/posts/archive"),
  getAdminPosts: (p: { page?: number; size?: number } = {}) => request<PostListResp>(`/admin/posts${qs(p)}`),
  createPost: (body: PostInput) => request<{ id: number; slug: string }>("/posts", { method: "POST", body: JSON.stringify(body) }),
  updatePost: (id: number, body: PostInput) => request<{ message: string }>(`/posts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePost: (id: number) => request<{ message: string }>(`/posts/${id}`, { method: "DELETE" }),

  getCategories: () => request<{ categories: Category[] }>("/categories"),
  createCategory: (body: { name: string; slug: string; section?: string }) =>
    request<{ id: number }>("/categories", { method: "POST", body: JSON.stringify(body) }),
  updateCategory: (id: number, body: { name: string; slug: string; section?: string }) =>
    request<{ message: string }>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteCategory: (id: number) => request<{ message: string }>(`/categories/${id}`, { method: "DELETE" }),
  getTags: () => request<{ tags: Tag[] }>("/tags"),

  getComments: (slug: string, email?: string) =>
    request<{ comments: Comment[]; total: number }>(`/posts/${slug}/comments${qs({ email })}`),
  createComment: (slug: string, body: { name: string; email: string; content: string; parent_id?: number }) =>
    request<Comment>(`/posts/${slug}/comments`, { method: "POST", body: JSON.stringify(body) }),
  likeComment: (id: number, email: string) =>
    request<{ like_count: number; liked: boolean }>(`/comments/${id}/like`, { method: "POST", body: JSON.stringify({ email }) }),
  checkLike: (id: number, email: string) => request<{ liked: boolean }>(`/comments/${id}/like${qs({ email })}`),
  deleteComment: (id: number, email?: string) =>
    request<{ message: string }>(`/comments/${id}`, { method: "DELETE", body: email ? JSON.stringify({ email }) : undefined }),

  uploadImage: (file: File) => {
    const fd = new FormData(); fd.append("image", file)
    return request<{ url: string }>("/upload", { method: "POST", body: fd })
  },
  getGallery: () => request<{ items: GalleryItem[]; total: number }>("/gallery"),
  deleteGalleryFile: (filename: string) => request<{ message: string }>(`/gallery/${filename}`, { method: "DELETE" }),

  getDashboardSummary: () => request<DashboardSummary>("/dashboard/summary"),
}
```

- [ ] **Step 3: lib/format.ts**

```ts
import { format } from "date-fns"
export const formatDate = (iso: string) => format(new Date(iso), "yyyy-MM-dd")
export const formatDateTime = (iso: string) => format(new Date(iso), "yyyy-MM-dd HH:mm")
export const formatMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n)
```

- [ ] **Step 4: context/AuthContext.tsx**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { api } from "@/lib/api"
import type { AuthUser } from "@/lib/types"

interface AuthCtx {
  user: AuthUser | null
  token: string | null
  isAdmin: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("user")
    return raw ? (JSON.parse(raw) as AuthUser) : null
  })

  // 启动时用 profile 校验 token 有效性；失败则清理
  useEffect(() => {
    if (!token) return
    api.getProfile()
      .then((p) => {
        const u = { id: p.id, username: p.username, nickname: p.nickname, avatar: p.avatar }
        setUser(u); localStorage.setItem("user", JSON.stringify(u))
      })
      .catch(() => { setToken(null); setUser(null); localStorage.removeItem("token"); localStorage.removeItem("user") })
  }, [token])

  const login = async (username: string, password: string) => {
    const { token: t, user: u } = await api.login(username, password)
    localStorage.setItem("token", t); localStorage.setItem("user", JSON.stringify(u))
    setToken(t); setUser(u)
  }
  const logout = () => {
    localStorage.removeItem("token"); localStorage.removeItem("user")
    setToken(null); setUser(null)
  }

  // 单用户站点：登录者即管理员（后端“第一个用户是管理员”）
  return <Ctx.Provider value={{ user, token, isAdmin: !!token, login, logout }}>{children}</Ctx.Provider>
}
```

- [ ] **Step 5: context/ThemeContext.tsx**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "light" | "dark"
const Ctx = createContext<{ theme: Theme; toggle: () => void }>(null!)
export const useTheme = () => useContext(Ctx)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) || "light")
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    localStorage.setItem("theme", theme)
  }, [theme])
  return <Ctx.Provider value={{ theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) }}>{children}</Ctx.Provider>
}
```

- [ ] **Step 6: main.tsx 挂 Provider**

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import "./index.css"
import App from "./App"
import { AuthProvider } from "@/context/AuthContext"
import { ThemeProvider } from "@/context/ThemeContext"

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
            <Toaster richColors position="top-center" />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 7: 类型检查 + Commit**

```bash
cd /Users/kk/data/code/blogs/frontend && npx tsc --noEmit && npm run build   # 零错误
cd .. && git add frontend/src
git commit -m "feat(frontend): api client, types, auth & theme providers"
```

### Task 1.5: 布局壳 —— Sidebar / Topbar / 移动 TabBar / ⌘K 命令面板 / 路由 / 登录页

**Files:**
- Create: `frontend/src/components/layout/AppLayout.tsx`、`Sidebar.tsx`、`Topbar.tsx`、`MobileTabBar.tsx`、`CommandPalette.tsx`
- Create: `frontend/src/components/ProtectedRoute.tsx`、`frontend/src/components/PagePlaceholder.tsx`、`frontend/src/components/StatCard.tsx`
- Create: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/App.tsx`（完整路由表）

**Interfaces:**
- Consumes: `useAuth()`、`useTheme()`（Task 1.4）
- Produces:
  - 路由表（后续任务只加页面不改布局）：`/login`；受保护壳内：`/`(Dashboard)、`/invest`、`/learn`、`/learn/review`、`/fitness`、`/life`、`/blog`、`/blog/archive`、`/blog/category/:slug`、`/blog/tag/:name`、`/blog/:slug`、`/admin/posts`、`/admin/posts/new`、`/admin/posts/:id/edit`、`/admin/categories`
  - `<StatCard title value sub icon href? />`：`title: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; href?: string`
  - `<PagePlaceholder title description icon />` 板块占位组件
  - `NAV_ITEMS: { to: string; label: string; icon: LucideIcon }[]`（Dashboard/投资/学习/健身/生活/博客），`Admin.tsx` 内导航用 `/admin/*`

- [ ] **Step 1: components/layout/Sidebar.tsx**

```tsx
import { NavLink } from "react-router-dom"
import { LayoutDashboard, TrendingUp, Languages, Dumbbell, Sprout, PenLine } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

export const NAV_ITEMS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "总览", icon: LayoutDashboard },
  { to: "/invest", label: "投资", icon: TrendingUp },
  { to: "/learn", label: "学习", icon: Languages },
  { to: "/fitness", label: "健身", icon: Dumbbell },
  { to: "/life", label: "生活", icon: Sprout },
  { to: "/blog", label: "博客", icon: PenLine },
]

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="h-14 flex items-center px-5 font-semibold text-lg">KK 控制台</div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}>
            <Icon className="size-4" /> {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: components/layout/Topbar.tsx**

```tsx
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Moon, Search, Sun, User, LogOut, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/AuthContext"
import { useTheme } from "@/context/ThemeContext"
import { CommandPalette } from "./CommandPalette"

export function Topbar() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card flex items-center gap-2 px-4">
      <Button variant="outline" size="sm" className="gap-2 text-muted-foreground" onClick={() => setOpen(true)}>
        <Search className="size-4" /> 搜索 <kbd className="text-xs">⌘K</kbd>
      </Button>
      <div className="flex-1" />
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="切换主题">
        {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            {user?.avatar ? <img src={user.avatar} className="size-7 rounded-full object-cover" alt="" /> : <User className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate("/admin/posts")}><Settings2 className="size-4" /> 管理后台</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { logout(); navigate("/login") }}><LogOut className="size-4" /> 退出登录</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </header>
  )
}
```

- [ ] **Step 3: components/layout/CommandPalette.tsx**

```tsx
import { useNavigate } from "react-router-dom"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { NAV_ITEMS } from "./Sidebar"

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const go = (to: string) => { onOpenChange(false); navigate(to) }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="跳转到…" />
      <CommandList>
        <CommandEmpty>无匹配结果</CommandEmpty>
        <CommandGroup heading="导航">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <CommandItem key={to} onSelect={() => go(to)}><Icon className="size-4" /> {label}</CommandItem>
          ))}
          <CommandItem onSelect={() => go("/admin/posts")}>管理后台</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

- [ ] **Step 4: components/layout/MobileTabBar.tsx**

```tsx
import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import { NAV_ITEMS } from "./Sidebar"

export function MobileTabBar() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card flex">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === "/"}
          className={({ isActive }) => cn(
            "flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px]",
            isActive ? "text-primary font-medium" : "text-muted-foreground",
          )}>
          <Icon className="size-5" /> {label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 5: components/layout/AppLayout.tsx + ProtectedRoute.tsx + PagePlaceholder.tsx + StatCard.tsx**

```tsx
// AppLayout.tsx
import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"
import { MobileTabBar } from "./MobileTabBar"

export function AppLayout() {
  return (
    <div className="h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  )
}
```

```tsx
// ProtectedRoute.tsx
import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import type { ReactNode } from "react"

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const location = useLocation()
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}
```

```tsx
// PagePlaceholder.tsx
import type { LucideIcon } from "lucide-react"

export function PagePlaceholder({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="size-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
        <Icon className="size-7 text-accent-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
    </div>
  )
}
```

```tsx
// StatCard.tsx
import { Link } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export function StatCard({ title, value, sub, icon: Icon, href }: {
  title: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; href?: string
}) {
  const inner = (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <CardContent className="p-5 flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tnum mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1 tnum">{sub}</p>}
        </div>
        <div className="size-9 rounded-lg bg-accent flex items-center justify-center">
          <Icon className="size-4.5 text-accent-foreground" />
        </div>
      </CardContent>
    </Card>
  )
  return href ? <Link to={href} className="block hover:opacity-90 transition-opacity">{inner}</Link> : inner
}
```

- [ ] **Step 6: pages/Login.tsx**

```tsx
import { useState, type FormEvent } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/context/AuthContext"

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(username, password)
      const from = (location.state as any)?.from?.pathname || "/"
      navigate(from, { replace: true })
    } catch (err: any) {
      toast.error(err.message || "登录失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-[0_1px_3px_rgba(0,0,0,.06)]">
        <CardHeader>
          <CardTitle>KK 控制台</CardTitle>
          <CardDescription>登录以访问你的个人数据</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="u">用户名</Label>
              <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p">密码</Label>
              <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "登录中…" : "登录"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 7: App.tsx 完整路由表**

```tsx
import { Routes, Route } from "react-router-dom"
import { TrendingUp, Languages, Dumbbell } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { PagePlaceholder } from "@/components/PagePlaceholder"
import Login from "@/pages/Login"
import Dashboard from "@/pages/Dashboard"
import PostList from "@/pages/blog/PostList"
import PostDetail from "@/pages/blog/PostDetail"
import Archive from "@/pages/blog/Archive"
import CategoryPosts from "@/pages/blog/CategoryPosts"
import TagPosts from "@/pages/blog/TagPosts"
import LifePage from "@/pages/life/LifePage"
import AdminPosts from "@/pages/admin/AdminPosts"
import PostEditor from "@/pages/admin/PostEditor"
import AdminCategories from "@/pages/admin/AdminCategories"

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/invest" element={<PagePlaceholder title="投资" description="持仓与交易记录模块将在阶段 2 上线" icon={TrendingUp} />} />
        <Route path="/learn" element={<PagePlaceholder title="学习" description="生词本与 SRS 复习将在阶段 3 上线" icon={Languages} />} />
        <Route path="/fitness" element={<PagePlaceholder title="健身" description="训练日志与身体数据将在阶段 4 上线" icon={Dumbbell} />} />
        <Route path="/life" element={<LifePage />} />
        <Route path="/blog" element={<PostList />} />
        <Route path="/blog/archive" element={<Archive />} />
        <Route path="/blog/category/:slug" element={<CategoryPosts />} />
        <Route path="/blog/tag/:name" element={<TagPosts />} />
        <Route path="/blog/:slug" element={<PostDetail />} />
        <Route path="/admin/posts" element={<AdminPosts />} />
        <Route path="/admin/posts/new" element={<PostEditor />} />
        <Route path="/admin/posts/:id/edit" element={<PostEditor />} />
        <Route path="/admin/categories" element={<AdminCategories />} />
        <Route path="*" element={<PagePlaceholder title="404" description="页面不存在" icon={Languages} />} />
      </Route>
    </Routes>
  )
}
```

注意：此任务中 `Dashboard`、`blog/*`、`life/*`、`admin/*` 页面组件尚未创建 —— 本步骤先创建**最简占位实现**（每个文件 `export default function X() { return null }` 级别即可，Dashboard 除外，见 Task 1.6），使 `tsc` 通过；Task 1.6~1.9 逐个替换为真实现。

- [ ] **Step 8: 验证 + Commit**

```bash
cd /Users/kk/data/code/blogs/frontend && npx tsc --noEmit && npm run build   # 零错误
npm run dev &   # 浏览器验证：未登录访问 / 跳转 /login；登录后见侧边栏布局；⌘K 弹出面板；主题切换生效；移动端宽度出现底部 Tab
kill %1
cd .. && git add frontend/src
git commit -m "feat(frontend): app shell — sidebar, topbar, mobile tabs, command palette, routing, login"
```

### Task 1.6: Dashboard 页

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `api.getDashboardSummary()`（Task 1.2/1.4）、`StatCard`（Task 1.5）
- Produces: `/` 路由的完整 Dashboard；后续阶段只需替换 tool 卡片的数据源

- [ ] **Step 1: 实现 Dashboard.tsx**

```tsx
import { useQuery } from "@tanstack/react-query"
import { TrendingUp, Languages, Dumbbell, Sprout, PenLine, MessageSquare, Image } from "lucide-react"
import { api } from "@/lib/api"
import { StatCard } from "@/components/StatCard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"

export default function Dashboard() {
  const { user } = useAuth()
  const { data, isPending } = useQuery({ queryKey: ["dashboard"], queryFn: api.getDashboardSummary })

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold">你好，{user?.nickname || user?.username} 👋</h1>
        <p className="text-sm text-muted-foreground">这是你的个人控制台总览</p>
      </div>

      {isPending || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="投资组合" value={data.portfolio_value == null ? "—" : `$${data.portfolio_value.toLocaleString()}`}
              sub={data.portfolio_pnl == null ? "阶段 2 上线" : undefined} icon={TrendingUp} href="/invest" />
            <StatCard title="今日复习" value={data.review_due || "—"} sub="阶段 3 上线" icon={Languages} href="/learn" />
            <StatCard title="本周训练" value={data.workouts_this_week || "—"} sub="阶段 4 上线" icon={Dumbbell} href="/fitness" />
            <StatCard title="习惯打卡" value={data.habits_total ? `${data.habits_checked_today}/${data.habits_total}` : "—"} sub="阶段 5 上线" icon={Sprout} href="/life" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="已发布文章" value={data.posts_total} icon={PenLine} href="/blog" />
            <StatCard title="评论" value={data.comments_total} icon={MessageSquare} href="/blog" />
            <StatCard title="照片" value={data.gallery_total} icon={Image} href="/life" />
          </div>

          <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
            <CardHeader><CardTitle className="text-base">收益曲线</CardTitle></CardHeader>
            <CardContent>
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                阶段 2（投资模块）上线后展示
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 验证 + Commit**

```bash
cd /Users/kk/data/code/blogs/frontend && npx tsc --noEmit   # 零错误
# 启动 docker + 后端 + 前端，浏览器登录看 /：统计卡显示真实文章/评论/照片数，工具卡显示占位
cd .. && git add frontend/src/pages/Dashboard.tsx
git commit -m "feat(frontend): dashboard page with summary cards"
```

### Task 1.7: 博客页面（列表/详情/归档/分类/标签 + 评论）

**Files:**
- Modify: `frontend/src/pages/blog/PostList.tsx`、`PostDetail.tsx`、`Archive.tsx`、`CategoryPosts.tsx`、`TagPosts.tsx`
- Create: `frontend/src/components/blog/PostCard.tsx`、`Pagination.tsx`、`CommentSection.tsx`、`Markdown.tsx`

**Interfaces:**
- Consumes: `api.getPosts/getPost/getArchive/getCategories/getTags/getComments/createComment/likeComment/checkLike/deleteComment`、`formatDate`
- Produces: `/blog` 系列页面全部可用；`<Markdown content={string} />` 组件（阶段 2-5 的笔记类页面复用）

- [ ] **Step 1: components/blog/Markdown.tsx**

```tsx
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function Markdown({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none prose-img:rounded-lg">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 2: components/blog/PostCard.tsx 与 Pagination.tsx**

```tsx
// PostCard.tsx
import { Link } from "react-router-dom"
import { CalendarDays, Eye, Tag as TagIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatDate } from "@/lib/format"
import type { Post } from "@/lib/types"

export function PostCard({ post }: { post: Post }) {
  return (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)] hover:border-primary/40 transition-colors">
      <CardContent className="p-5">
        <Link to={`/blog/${post.slug}`} className="text-lg font-semibold hover:text-primary">{post.title}</Link>
        {post.summary && <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{post.summary}</p>}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{formatDate(post.created_at)}</span>
          <span className="inline-flex items-center gap-1 tnum"><Eye className="size-3.5" />{post.view_count}</span>
          {post.category && (
            <Link to={`/blog/category/${post.category.slug}`}>
              <Badge variant="secondary">{post.category.name}</Badge>
            </Link>
          )}
          {post.tags?.map((t) => (
            <Link key={t.id} to={`/blog/tag/${t.name}`} className="inline-flex items-center gap-0.5 hover:text-primary">
              <TagIcon className="size-3" />{t.name}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

```tsx
// Pagination.tsx
import { Button } from "@/components/ui/button"

export function Pagination({ page, size, total, onChange }: {
  page: number; size: number; total: number; onChange: (p: number) => void
}) {
  const pages = Math.ceil(total / size)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</Button>
      <span className="text-sm text-muted-foreground tnum">{page} / {pages}</span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>下一页</Button>
    </div>
  )
}
```

- [ ] **Step 3: pages/blog/PostList.tsx（CategoryPosts / TagPosts 同构，仅参数不同）**

```tsx
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { PostCard } from "@/components/blog/PostCard"
import { Pagination } from "@/components/blog/Pagination"
import { Skeleton } from "@/components/ui/skeleton"

const PAGE_SIZE = 10

export function PostListPage({ category, tag, title }: { category?: string; tag?: string; title?: string }) {
  const [page, setPage] = useState(1)
  const { data, isPending } = useQuery({
    queryKey: ["posts", page, category, tag],
    queryFn: () => api.getPosts({ page, size: PAGE_SIZE, category, tag }),
  })
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">{title ?? "博客"}</h1>
      {isPending || !data
        ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        : data.posts.map((p) => <PostCard key={p.id} post={p} />)}
      {data && <Pagination page={data.page} size={data.size} total={data.total} onChange={setPage} />}
    </div>
  )
}

export default function PostList() { return <PostListPage /> }
```

```tsx
// CategoryPosts.tsx
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { PostListPage } from "./PostList"

export default function CategoryPosts() {
  const { slug } = useParams<{ slug: string }>()
  const { data } = useQuery({ queryKey: ["categories"], queryFn: api.getCategories })
  const name = data?.categories.find((c) => c.slug === slug)?.name ?? slug ?? ""
  return <PostListPage category={slug} title={`分类：${name}`} />
}
```

```tsx
// TagPosts.tsx
import { useParams } from "react-router-dom"
import { PostListPage } from "./PostList"

export default function TagPosts() {
  const { name } = useParams<{ name: string }>()
  return <PostListPage tag={name} title={`标签：${name}`} />
}
```

- [ ] **Step 4: pages/blog/Archive.tsx**

```tsx
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Archive() {
  const { data, isPending } = useQuery({ queryKey: ["archive"], queryFn: api.getArchive })
  if (isPending) return <Skeleton className="h-64 rounded-xl max-w-2xl" />
  const byYear = (data?.archives ?? []).reduce<Record<number, { month: number; count: number }[]>>((acc, a) => {
    (acc[a.year] ??= []).push(a); return acc
  }, {})
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">归档</h1>
      {Object.entries(byYear).map(([year, months]) => (
        <Card key={year} className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
          <CardHeader><CardTitle className="text-base tnum">{year} 年</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {months.sort((a, b) => a.month - b.month).map((m) => (
              <Link key={m.month} to={`/blog?year=${year}&month=${m.month}`}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40 tnum">
                {m.month} 月 <span className="text-muted-foreground">({m.count})</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

注意：`/blog?year=&month=` 过滤需要 `PostListPage` 读取 URL search 参数 —— 在 Step 3 的 `PostList()` 默认导出里加：

```tsx
import { useSearchParams } from "react-router-dom"
// PostList 默认导出改为：
export default function PostList() {
  const [params] = useSearchParams()
  const year = params.get("year") ? Number(params.get("year")) : undefined
  const month = params.get("month") ? Number(params.get("month")) : undefined
  return <PostListPage year={year} month={month} title={year ? `${year} 年${month ? ` ${month} 月` : ""}` : "博客"} />
}
```

同时 `PostListPage` props 增加 `year?: number; month?: number` 并传入 `api.getPosts` 与 queryKey。

- [ ] **Step 5: components/blog/CommentSection.tsx**

```tsx
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ThumbsUp, Trash2, CornerDownRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { useAuth } from "@/context/AuthContext"
import type { Comment } from "@/lib/types"

const getEmail = () => localStorage.getItem("comment_email") || ""
const setEmail = (e: string) => localStorage.setItem("comment_email", e)

function CommentItem({ c, slug, onReply }: { c: Comment; slug: string; onReply: (id: number) => void }) {
  const qc = useQueryClient()
  const { token } = useAuth()
  const [liked, setLiked] = useState(false)
  const email = getEmail()

  const like = useMutation({
    mutationFn: () => api.likeComment(c.id, email),
    onSuccess: (r) => { setLiked(r.liked); c.like_count = r.like_count; qc.invalidateQueries({ queryKey: ["comments", slug] }) },
    onError: (e: any) => toast.error(e.message),
  })
  const del = useMutation({
    mutationFn: () => api.deleteComment(c.id, token ? undefined : email),
    onSuccess: () => { toast.success("已删除"); qc.invalidateQueries({ queryKey: ["comments", slug] }) },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <div className="py-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{c.name}</span>
        <span className="text-xs text-muted-foreground tnum">{formatDateTime(c.created_at)}</span>
      </div>
      <p className="text-sm mt-1 whitespace-pre-wrap">{c.content}</p>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
        <button className={"inline-flex items-center gap-1 hover:text-primary " + (liked ? "text-primary" : "")}
          onClick={() => like.mutate()}><ThumbsUp className="size-3.5" /><span className="tnum">{c.like_count}</span></button>
        <button className="inline-flex items-center gap-1 hover:text-primary" onClick={() => onReply(c.id)}>
          <CornerDownRight className="size-3.5" />回复</button>
        {c.can_delete && (
          <button className="inline-flex items-center gap-1 hover:text-destructive" onClick={() => del.mutate()}>
            <Trash2 className="size-3.5" />删除</button>
        )}
      </div>
      {c.replies?.map((r) => (
        <div key={r.id} className="ml-6 border-l-2 border-border pl-4"><CommentItem c={r} slug={slug} onReply={onReply} /></div>
      ))}
    </div>
  )
}

export function CommentSection({ slug }: { slug: string }) {
  const qc = useQueryClient()
  const email = getEmail()
  const [name, setName] = useState(() => localStorage.getItem("comment_name") || "")
  const [mail, setMail] = useState(email)
  const [content, setContent] = useState("")
  const [parentId, setParentId] = useState<number | undefined>()

  const { data, isPending } = useQuery({
    queryKey: ["comments", slug, email],
    queryFn: () => api.getComments(slug, email || undefined),
  })
  const create = useMutation({
    mutationFn: () => api.createComment(slug, { name, email: mail, content, parent_id: parentId }),
    onSuccess: () => {
      toast.success("评论成功"); setContent(""); setParentId(undefined)
      localStorage.setItem("comment_name", name); setEmail(mail)
      qc.invalidateQueries({ queryKey: ["comments", slug] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold mb-3">评论 {data ? `(${data.total})` : ""}</h2>
      <div className="rounded-xl border border-border p-4 space-y-3 mb-4">
        {parentId && (
          <p className="text-xs text-muted-foreground">回复 #{parentId} <button className="underline" onClick={() => setParentId(undefined)}>取消</button></p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="昵称" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="邮箱（用于识别你的评论/点赞）" type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
        </div>
        <Textarea placeholder="说点什么…" value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
        <Button size="sm" disabled={create.isPending || !name || !mail || !content} onClick={() => create.mutate()}>
          {create.isPending ? "发送中…" : "评论"}
        </Button>
      </div>
      <div className="divide-y divide-border">
        {isPending ? <p className="text-sm text-muted-foreground py-4">加载中…</p>
          : data?.comments.length === 0 ? <p className="text-sm text-muted-foreground py-4">还没有评论，来抢沙发</p>
          : data?.comments.map((c) => <CommentItem key={c.id} c={c} slug={slug} onReply={setParentId} />)}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: pages/blog/PostDetail.tsx**

```tsx
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, Eye } from "lucide-react"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { Markdown } from "@/components/blog/Markdown"
import { CommentSection } from "@/components/blog/CommentSection"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function PostDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { data: post, isPending, error } = useQuery({
    queryKey: ["post", slug],
    queryFn: () => api.getPost(slug!),
  })
  if (isPending) return <div className="max-w-3xl space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64" /></div>
  if (error || !post) return <p className="text-muted-foreground">文章不存在</p>

  return (
    <article className="max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{post.title}</h1>
      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{formatDate(post.created_at)}</span>
        <span className="inline-flex items-center gap-1 tnum"><Eye className="size-3.5" />{post.view_count}</span>
        {post.category && <Badge variant="secondary">{post.category.name}</Badge>}
        {post.tags?.map((t) => <Badge key={t.id} variant="outline">{t.name}</Badge>)}
      </div>
      <div className="mt-6"><Markdown content={post.content} /></div>
      <CommentSection slug={post.slug} />
    </article>
  )
}
```

- [ ] **Step 7: 验证 + Commit**

```bash
cd /Users/kk/data/code/blogs/frontend && npx tsc --noEmit   # 零错误
# 起后端+前端，登录后访问 /blog /blog/archive /blog/<某slug>：
# 列表分页、分类/标签跳转、Markdown 渲染、评论发表/点赞/回复/删除 全链路可用
cd .. && git add frontend/src
git commit -m "feat(frontend): blog pages — list, detail with markdown & comments, archive, category, tag"
```

### Task 1.8: Admin —— 文章管理 + Markdown 编辑器 + 分类管理（含 section）

**Files:**
- Modify: `frontend/src/pages/admin/AdminPosts.tsx`、`PostEditor.tsx`、`AdminCategories.tsx`

**Interfaces:**
- Consumes: `api.getAdminPosts/createPost/updatePost/deletePost/getCategories/createCategory/updateCategory/deleteCategory/uploadImage`、`Markdown`
- Produces: `/admin/*` 三个页面；管理员可写文章、传图、按板块管理分类

- [ ] **Step 1: pages/admin/AdminPosts.tsx**

```tsx
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Pagination } from "@/components/blog/Pagination"

export default function AdminPosts() {
  const [page, setPage] = useState(1)
  const qc = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: ["admin-posts", page], queryFn: () => api.getAdminPosts({ page, size: 15 }) })
  const del = useMutation({
    mutationFn: (id: number) => api.deletePost(id),
    onSuccess: () => { toast.success("已删除"); qc.invalidateQueries({ queryKey: ["admin-posts"] }) },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">文章管理</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/admin/categories">分类管理</Link></Button>
          <Button asChild><Plus className="size-4" /> 写文章</Button>
        </div>
      </div>
      {/* 上面「写文章」按钮外层包一层 Link：*/}
      {isPending ? <p className="text-sm text-muted-foreground">加载中…</p> : (
        <>
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>标题</TableHead><TableHead>状态</TableHead><TableHead className="tnum">浏览</TableHead><TableHead>日期</TableHead><TableHead className="w-32">操作</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data?.posts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium max-w-64 truncate">{p.title}</TableCell>
                    <TableCell>{p.status === "published" ? <Badge>已发布</Badge> : <Badge variant="secondary">草稿</Badge>}</TableCell>
                    <TableCell className="tnum">{p.view_count}</TableCell>
                    <TableCell className="tnum text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2 text-sm">
                        <Link className="text-primary hover:underline" to={`/admin/posts/${p.id}/edit`}>编辑</Link>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><button className="text-destructive hover:underline">删除</button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除《{p.title}》？</AlertDialogTitle>
                              <AlertDialogDescription>此操作不可恢复</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(p.id)}>删除</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data && <Pagination page={data.page} size={data.size} total={data.total} onChange={setPage} />}
        </>
      )}
    </div>
  )
}
```

（注意把「写文章」按钮实现为 `<Button asChild><Link to="/admin/posts/new">…</Link></Button>`。）

- [ ] **Step 2: pages/admin/PostEditor.tsx（新建/编辑二合一，支持图片上传）**

```tsx
import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { X } from "lucide-react"
import { api, type PostInput } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Markdown } from "@/components/blog/Markdown"

export default function PostEditor() {
  const { id } = useParams<{ id: string }>()
  const editing = id !== undefined
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [content, setContent] = useState("")
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [categoryId, setCategoryId] = useState<string>("none")
  const [published, setPublished] = useState(true)
  const [preview, setPreview] = useState(false)

  const { data: cats } = useQuery({ queryKey: ["categories"], queryFn: api.getCategories })
  const { data: adminPosts } = useQuery({
    queryKey: ["admin-posts-all"], queryFn: () => api.getAdminPosts({ page: 1, size: 200 }), enabled: editing,
  })
  useEffect(() => {
    if (!editing || !adminPosts) return
    const p = adminPosts.posts.find((x) => String(x.id) === id)
    if (p) {
      setTitle(p.title); setSummary(p.summary); setContent(p.content)
      setTags((p.tags ?? []).map((t) => t.name))
      setCategoryId(p.category_id ? String(p.category_id) : "none")
      setPublished(p.status === "published")
    }
  }, [editing, id, adminPosts])

  const save = useMutation({
    mutationFn: () => {
      const body: PostInput = {
        title, summary, content, tags,
        category_id: categoryId === "none" ? null : Number(categoryId),
        status: published ? "published" : "draft",
      }
      return editing ? api.updatePost(Number(id), body) : api.createPost(body)
    },
    onSuccess: () => { toast.success(editing ? "已更新" : "已创建"); navigate("/admin/posts") },
    onError: (e: any) => toast.error(e.message),
  })

  const upload = useMutation({
    mutationFn: (f: File) => api.uploadImage(f),
    onSuccess: (r) => { setContent((c) => `${c}\n\n![图片](${r.url})\n`); toast.success("图片已插入") },
    onError: (e: any) => toast.error(e.message),
  })

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput("")
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{editing ? "编辑文章" : "写文章"}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>{preview ? "编辑" : "预览"}</Button>
          <Button size="sm" disabled={save.isPending || !title || !content} onClick={() => save.mutate()}>
            {save.isPending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      {preview ? (
        <div className="rounded-xl border border-border bg-card p-6"><Markdown content={content} /></div>
      ) : (
        <>
          <div className="space-y-2"><Label>标题</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-2"><Label>摘要（可选）</Label><Input value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>正文（Markdown）</Label>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = "" }} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>插入图片</Button>
              </div>
            </div>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={18} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label>标签</Label>
            <div className="flex gap-2">
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }} placeholder="回车添加" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Badge key={t} variant="secondary">{t}<button onClick={() => setTags(tags.filter((x) => x !== t))}><X className="size-3 ml-1" /></button></Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <Label>分类</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">无分类</SelectItem>
                  {cats?.categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="pub" checked={published} onCheckedChange={setPublished} />
              <Label htmlFor="pub">{published ? "发布" : "存为草稿"}</Label>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: pages/admin/AdminCategories.tsx（含 section 选择）**

```tsx
import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Section } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const SECTIONS: { value: Section; label: string }[] = [
  { value: "blog", label: "博客" }, { value: "invest", label: "投资" },
  { value: "learn", label: "学习" }, { value: "fitness", label: "健身" }, { value: "life", label: "生活" },
]

export default function AdminCategories() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["categories"], queryFn: api.getCategories })
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [section, setSection] = useState<Section>("blog")

  const create = useMutation({
    mutationFn: () => api.createCategory({ name, slug, section }),
    onSuccess: () => { toast.success("已创建"); setName(""); setSlug(""); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: any) => toast.error(e.message),
  })
  const updateSection = useMutation({
    mutationFn: (c: { id: number; name: string; slug: string; section: Section }) => api.updateCategory(c.id, c),
    onSuccess: () => { toast.success("已更新"); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: any) => toast.error(e.message),
  })
  const del = useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: () => { toast.success("已删除"); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">分类管理</h1>
        <Button variant="outline" asChild><Link to="/admin/posts">返回文章</Link></Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1"><p className="text-xs text-muted-foreground">名称</p><Input value={name} onChange={(e) => setName(e.target.value)} className="w-36" /></div>
        <div className="space-y-1"><p className="text-xs text-muted-foreground">Slug</p><Input value={slug} onChange={(e) => setSlug(e.target.value)} className="w-36" /></div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">板块</p>
          <Select value={section} onValueChange={(v) => setSection(v as Section)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button disabled={create.isPending || !name || !slug} onClick={() => create.mutate()}>新建分类</Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>Slug</TableHead><TableHead>板块</TableHead><TableHead className="w-20">操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                <TableCell>
                  <Select value={c.section} onValueChange={(v) => updateSection.mutate({ ...c, section: v as Section })}>
                    <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell><button className="text-sm text-destructive hover:underline" onClick={() => del.mutate(c.id)}>删除</button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 验证 + Commit**

```bash
cd /Users/kk/data/code/blogs/frontend && npx tsc --noEmit   # 零错误
# 浏览器全链路：新建分类(section=invest) → 写文章(打标签/传图/选分类/存草稿) →
# 发布 → /blog 可见 → 编辑 → 删除；管理列表分页正常
cd .. && git add frontend/src
git commit -m "feat(frontend): admin — post editor with upload & preview, post/category management"
```

### Task 1.9: 生活页（照片墙基础版）

**Files:**
- Modify: `frontend/src/pages/life/LifePage.tsx`

**Interfaces:**
- Consumes: `api.getGallery/uploadImage/deleteGalleryFile`、`useAuth().isAdmin`
- Produces: `/life` 照片墙（阶段 5 再叠加习惯热力图与随手记）

- [ ] **Step 1: 实现 LifePage.tsx**

```tsx
import { useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ImagePlus, Trash2, Sprout } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"

export default function LifePage() {
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data, isPending } = useQuery({ queryKey: ["gallery"], queryFn: api.getGallery })

  const upload = useMutation({
    mutationFn: (f: File) => api.uploadImage(f),
    onSuccess: () => { toast.success("已上传"); qc.invalidateQueries({ queryKey: ["gallery"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }) },
    onError: (e: any) => toast.error(e.message),
  })
  const del = useMutation({
    mutationFn: (filename: string) => api.deleteGalleryFile(filename),
    onSuccess: () => { toast.success("已删除"); qc.invalidateQueries({ queryKey: ["gallery"] }) },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Sprout className="size-5" /> 生活</h1>
        {isAdmin && (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = "" }} />
            <Button size="sm" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> 上传照片</Button>
          </>
        )}
      </div>

      {isPending ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}</div>
      ) : data?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-16 text-center">还没有照片，点右上角上传第一张</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data?.items.map((item) => (
            <div key={item.filename} className="group relative aspect-square rounded-xl overflow-hidden border border-border">
              <img src={item.url} alt={item.filename} className="size-full object-cover" loading="lazy" />
              {isAdmin && (
                <button onClick={() => del.mutate(item.filename)}
                  className="absolute top-2 right-2 size-7 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">习惯打卡与随手记将在阶段 5 上线</p>
    </div>
  )
}
```

- [ ] **Step 2: 验证 + Commit**

```bash
cd /Users/kk/data/code/blogs/frontend && npx tsc --noEmit
# 浏览器：/life 上传一张图 → 网格显示 → 悬停出现删除 → 删除生效；Dashboard 照片数 +1（最多等 60s 缓存过期）
cd .. && git add frontend/src/pages/life
git commit -m "feat(frontend): life page with photo wall (gallery parity)"
```

### Task 1.10: 冒烟测试 + 清理 legacy + README + 推送

**Files:**
- Create: `frontend/scripts/smoke.mjs`（Playwright 冒烟）
- Delete: `frontend-legacy/`
- Modify: `README.md`（技术栈与命令更新）、`Makefile`（frontend 目标不变，路径已同名）、`CLAUDE.md`（架构描述更新）

**Interfaces:**
- Consumes: 全部前置任务
- Produces: 可重复运行的冒烟脚本；干净的仓库；阶段 1 收尾提交已推送

- [ ] **Step 1: 安装 Playwright 并写冒烟脚本**

```bash
cd /Users/kk/data/code/blogs/frontend && npm i -D playwright && npx playwright install chromium
```

`frontend/scripts/smoke.mjs`：

```js
import { chromium } from "playwright"

const BASE = process.env.BASE_URL || "http://localhost:3000"
const USER = process.env.SMOKE_USER
const PASS = process.env.SMOKE_PASS
if (!USER || !PASS) { console.error("需要 SMOKE_USER / SMOKE_PASS 环境变量"); process.exit(1) }

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on("pageerror", (e) => errors.push(e.message))

// 1. 未登录访问 / 应跳转 /login
await page.goto(BASE + "/", { waitUntil: "networkidle" })
if (!page.url().includes("/login")) throw new Error("未跳转登录页: " + page.url())

// 2. 登录
await page.fill("#u", USER)
await page.fill("#p", PASS)
await page.click('button[type=submit]')
await page.waitForURL(BASE + "/", { timeout: 10_000 })

// 3. Dashboard 渲染统计卡
await page.waitForSelector("text=已发布文章", { timeout: 10_000 })

// 4. 博客列表可达
await page.goto(BASE + "/blog", { waitUntil: "networkidle" })
await page.waitForSelector("h1", { timeout: 10_000 })

// 5. 管理后台可达
await page.goto(BASE + "/admin/posts", { waitUntil: "networkidle" })
await page.waitForSelector("text=文章管理", { timeout: 10_000 })

// 6. 生活页可达
await page.goto(BASE + "/life", { waitUntil: "networkidle" })
await page.waitForSelector("text=生活", { timeout: 10_000 })

if (errors.length) throw new Error("页面 JS 错误:\n" + errors.join("\n"))
console.log("SMOKE PASS ✅")
await browser.close()
```

- [ ] **Step 2: 全栈跑通冒烟**

```bash
cd /Users/kk/data/code/blogs
docker compose up -d                       # MySQL + Redis
(cd backend && go run cmd/*.go &)          # 后端 8080
(cd frontend && npm run dev &)             # 前端 3000
sleep 5
SMOKE_USER=<现有账号> SMOKE_PASS=<密码> node frontend/scripts/smoke.mjs
# 期望输出 SMOKE PASS ✅；失败则修复后重跑（superpowers:systematic-debugging）
```

- [ ] **Step 3: 删除 legacy 前端**

```bash
rm -rf /Users/kk/data/code/blogs/frontend-legacy
```

- [ ] **Step 4: 更新 README.md 与 CLAUDE.md**

README「技术栈」表更新为：前端 Vite + React 18 + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query；新增「板块」一节列出五大板块与分期进度（阶段 1 已完成，2-5 见 spec）。CLAUDE.md 的 Frontend 段落同步更新（组件/页面结构、`@/` 别名、仅中文 UI、smoke 脚本用法）。

- [ ] **Step 5: 最终提交并推送**

```bash
cd /Users/kk/data/code/blogs
git add -A
git commit -m "feat: phase 1 complete — console UI rewrite with blog/gallery/admin parity"
git push origin main
gh repo view --web   # 可选：浏览器确认
```

---

## Self-Review 记录

- **Spec 覆盖**：§2 架构（Task 1.3-1.5）、§3.2 categories.section（Task 1.1）、§5 dashboard/summary + register 下线（Task 1.2）、§6 SRS 属阶段 3（本计划不含，正确）、§7 前端结构与设计 token（Task 1.3-1.9）、§8 401 跳转/toast/私有仓库（Task 1.4/0.1）、§9 冒烟链路中博客部分（Task 1.10，工具模块链路留待各阶段计划）、§10 隐私清理（Task 0.1）、§11 分期（本计划=阶段 0+1）。缺口：无。
- **占位符扫描**：所有代码块均为可运行实现；`<现有账号>/<密码>` 为执行者本地凭据，属环境变量而非 TBD。
- **类型一致性**：`useAuth().isAdmin`、`StatCard` props、`api.*` 签名、`Section` 类型、`DashboardSummary` 字段在 Task 1.4/1.5/1.6/1.8/1.9 间已对齐；`PostListPage` 的 year/month 扩展在 Task 1.7 Step 4 注意事项中显式声明。
