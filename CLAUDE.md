# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal blog system with a React frontend and Go backend. Uses MySQL for persistence and Redis for caching.

- **Frontend**: React 19 + Vite + TypeScript (SPA on `localhost:3000`)
- **Backend**: Go 1.22 + Gin (REST API on `localhost:8080`)
- **Database**: MySQL 8.0 (via docker-compose)
- **Cache**: Redis 7 (via docker-compose)
- **ORM**: sqlx (not GORM)
- **Auth**: JWT (golang-jwt), bcrypt passwords

## Common Commands

| Command | Description |
|---------|-------------|
| `make docker-up` | Start MySQL + Redis via Docker Compose |
| `make docker-down` | Stop Docker containers |
| `make backend` | Tidy deps and run Go backend |
| `make frontend` | Install deps and run Vite dev server |
| `make build-backend` | Compile Go binary (CGO disabled) |
| `make build-frontend` | Build frontend static assets to `frontend/dist/` |

## Architecture

### Backend (`backend/`)

Entry point: `cmd/main.go` → loads config, init DB + Redis, auto-migrates tables, starts router.

- `config/` — Config loading (environment variables; `backend/.env` is NOT auto-loaded — export vars or rely on defaults), MySQL (`sqlx`), Redis connections; `QuoteProxy` for quote upstream
- `handler/` — HTTP handlers: `user.go` (login/profile), `post.go` (CRUD + archive), `category.go` (CRUD), `comment.go`, `dashboard.go` (summary incl. portfolio + learn fields `study_minutes_today`/`learn_streak`/`review_due`), `upload.go`/`gallery.go`, `asset.go` (asset CRUD + manual price), `trade.go` (trade CRUD + oversell guard), `invest.go` (positions/quotes/price-history/value-curve), `learn.go` (language profiles upsert, study session create/delete, stats, yearly calendar)
- `middleware/auth.go` — JWT auth middleware
- `model/model.go` — Data models (User, Post, Category, Tag, PostTag, Asset, Trade, PriceHistory, LanguageProfile, StudySession)
- `pkg/jwt.go` — JWT token generation/validation utilities
- `pkg/portfolio/` — Pure functions: weighted-average position P&L (`positions.go`), portfolio value curve (`history.go`); unit-tested
- `pkg/learn/` — Pure function: study streak computation (`ComputeStreak`, local-timezone day keys); unit-tested
- `pkg/quote/` — Quote subsystem: Yahoo → Stooq → last-known fallback chain, 60s Redis cache, gold-gram conversion (`GOLD_CNY_G`), USDCNY FX; providers unit-tested via httptest
- `service/snapshot.go` — robfig/cron daily price snapshot (06:00 Asia/Shanghai) for auto-tracked assets, with startup catch-up (the 1-year history backfill lives in `handler/asset.go`, triggered async on auto-tracked asset creation)
- `router/router.go` — Gin route setup with public and protected groups
- `cmd/migrate.go` — Auto table creation on startup

### Frontend (`frontend/`)

Entry point: `src/main.tsx` → `src/App.tsx` (routing). UI is Chinese-only (no i18n).

- `src/components/ui/` — shadcn/ui primitives, `radix-nova` style variant (classic Radix API, imported from the unified `radix-ui` package)
- `src/components/layout/` — AppLayout shell: Sidebar, Topbar, MobileTabBar, CommandPalette (all consume `NAV_ITEMS` from Sidebar)
- `src/components/charts/` — Recharts wrappers (`ValueChart` portfolio value/cost area chart, `MinutesBar` 28-day study-minutes bar chart)
- `src/components/blog/` — PostCard, CommentSection, Markdown, Pagination
- `src/pages/` — Dashboard (stat cards incl. today's study minutes + 30d value curve), Login, `invest/` (InvestPage/AssetDialog/TradeDialog), `learn/` (LearnPage/SessionDialog/ProfileDialog/StudyCalendar; `constants.ts` holds `ACTIVITY_LABELS`/`LANG_META` single source), `blog/` (PostList/PostDetail/Archive/CategoryPosts/TagPosts), `admin/` (AdminPosts/AdminCategories/PostEditor), `life/` (LifePage photo wall); fitness module cancelled 2026-09-12 — no route/nav entry
- `src/lib/api.ts` — fetch wrapper (token injection, 401 → redirect to /login); `src/lib/types.ts` — shared TS types; `src/lib/format.ts` — formatters
- `src/context/` — AuthContext (JWT in localStorage), ThemeContext (light/dark)
- `src/index.css` — Tailwind v4 design tokens + global styles
- `@/` aliases `src/` (configured in both `tsconfig.json` and `vite.config.ts`)
- Smoke test: `scripts/smoke.mjs` (Playwright) — see Key Design Decisions

Vite dev server proxies `/api` and `/uploads` to `localhost:8080`.

### Database Schema

Tables: `users`, `categories`, `posts`, `tags`, `post_tags` (many-to-many), plus invest-module tables `assets`, `trades`, `price_history` (unique `symbol`+`date`), plus learn-module tables `language_profiles` (unique `lang`, upsert) and `study_sessions` (multiple rows per day, `session_date` DATE indexed). Posts have `slug`, `status` (published/draft), `view_count`. See README.md for full schema.

### Key Design Decisions

- **sqlx over GORM** — Lightweight, explicit SQL. No GORM magic.
- **Redis caching** — Post lists, categories, tags cached 5–30 min. Cache invalidated on post/category/tag mutations. Quote responses cached 60s; USDCNY FX cached 1h.
- **First user is admin** — No role column; the first user in the database gets admin privileges implicitly (registration is retired).
- **Slug-based URLs** — Posts and categories use human-readable slugs, not IDs.
- **Positions are not stored** — No positions table; holdings are derived from `trades` at request time via pure functions in `pkg/portfolio` (weighted-average cost). `trades` is the single source of truth; trade prices are historical facts, independent of live quotes.
- **Quote 3-level fallback** — Yahoo (v8 chart) → Stooq (CSV) → last-known price from `assets.current_price` (marked `stale`). The UI must never break because quotes fail. Upstream HTTP goes through `QUOTE_PROXY`. Gold accumulation (`GOLD_CNY_G`) is computed as `GC=F ÷ 31.1035 × USDCNY`. Fundamentals: Yahoo v7 quote (cookie+crumb), PE(TTM) cached in Redis for 1h; any failure yields `pe_ttm: null` and never blocks positions.
- **Daily snapshot** — robfig/cron at 06:00 Asia/Shanghai snapshots auto-tracked asset prices into `price_history` (manual assets excluded), with startup catch-up (missed runs execute on boot). The portfolio value curve is derived from these closes + trades, not stored separately. Creating an auto-tracked asset triggers an async 1-year `BackfillHistory` for that symbol.
- **学习记录 = `study_sessions` 多条/日，打卡为派生概念** — No separate check-in table/column: "studied today" means at least one `study_sessions` row exists for that date; a `minutes: 0` row is a pure check-in. Streak/today/week/calendar are all derived from `study_sessions` at request time. Session create/delete DELs the `dashboard:summary` Redis cache (profile upsert doesn't — it affects no summary field).
- **日期口径统一 Go 本地日期传参（禁 CURDATE()）** — Every "today / this week / last 28 days" SQL boundary is computed in Go (`time.Now()` formatted `2006-01-02`, local timezone) and passed as a query parameter; never MySQL `CURDATE()`/`INTERVAL` (the MySQL container runs UTC while the app runs +08:00 — phase 2 I-3 lesson). DSN keeps `loc=Local` so DATE columns scan as local midnight, same frame as `time.Now()`.
- **Playwright smoke test** — `frontend/scripts/smoke.mjs` runs a 9-step chain with a real browser: login redirect → login → Dashboard → blog → admin → life → comment create/delete → invest chain (create asset → set price → record trade → verify derived position via API → assert /invest page renders it → clean up) → learn chain (create study session dated today (local-date construction, not UTC ISO) → assert stats via API (`today.en` true, `minutes >= 25`, `streak >= 1` — `>=` tolerates the user's real same-day records) → assert /learn page renders → delete only the smoke-created session) (`SMOKE_USER=<user> SMOKE_PASS=<pass> node frontend/scripts/smoke.mjs`, expects `STEP8 INVEST PASS` + `STEP9 LEARN PASS` + `SMOKE PASS ✅`). Backend fixes are verified by targeted curl/API checks plus a full smoke re-run. Go unit tests cover `pkg/portfolio`, `pkg/quote` and `pkg/learn` pure logic; no frontend unit test suite yet.

## Configuration

- Backend config comes from environment variables (`config.go` uses plain `os.Getenv`); `backend/.env` is NOT auto-loaded — export vars before starting, or rely on defaults.
- Docker Compose uses DaoCloud mirror for images (`docker.m.daocloud.io`).
- Frontend Vite config in `vite.config.ts` — port 3000 with `/api` and `/uploads` proxy.

## No Existing Rules

No `.cursorrules`, `.cursor/rules/`, or `.github/copilot-instructions.md` files exist.
