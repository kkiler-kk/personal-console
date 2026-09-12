# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal blog system with a React frontend and Go backend. Uses MySQL for persistence and Redis for caching.

- **Frontend**: React 18 + Vite (SPA on `localhost:3000`)
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

- `config/` — Config loading (`.env` via godotenv), MySQL (`sqlx`), Redis connections
- `handler/` — HTTP handlers: `user.go` (register/login/profile), `post.go` (CRUD + archive), `category.go` (CRUD)
- `middleware/auth.go` — JWT auth middleware
- `model/model.go` — Data models (User, Post, Category, Tag, PostTag)
- `pkg/jwt.go` — JWT token generation/validation utilities
- `router/router.go` — Gin route setup with public and protected groups
- `cmd/migrate.go` — Auto table creation on startup

### Frontend (`frontend/`)

Entry point: `src/main.jsx` → `src/App.jsx` (routing + layout).

- `src/pages/` — Route pages: Home, PostDetail, Archive, CategoryPosts, TagPosts, Login, Admin
- `src/services/api.js` — Axios-like fetch wrapper for API calls
- `src/context/AuthContext.jsx` — Auth state via React Context
- `src/styles/index.css` — Global styles

Vite dev server proxies `/api` to `localhost:8080`.

### Database Schema

Tables: `users`, `categories`, `posts`, `tags`, `post_tags` (many-to-many). Posts have `slug`, `status` (published/draft), `view_count`. See README.md for full schema.

### Key Design Decisions

- **sqlx over GORM** — Lightweight, explicit SQL. No GORM magic.
- **Redis caching** — Post lists, categories, tags cached 5–30 min. Cache invalidated on post/category/tag mutations.
- **First user is admin** — No role column; the first registered user gets admin privileges implicitly.
- **Slug-based URLs** — Posts and categories use human-readable slugs, not IDs.
- **No test suite** — Project currently has no automated tests.

## Configuration

- Backend reads from `backend/.env` (copy from `.env.example`).
- Docker Compose uses DaoCloud mirror for images (`docker.m.daocloud.io`).
- Frontend Vite config in `vite.config.js` — port 3000 with `/api` proxy.

## No Existing Rules

No `.cursorrules`, `.cursor/rules/`, or `.github/copilot-instructions.md` files exist.
