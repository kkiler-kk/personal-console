# 个人控制台网站重构设计

日期：2026-09-12（同日修订 ×2：学习模块简化，废弃生词本/SRS；健身模块整体取消）
状态：已与用户对齐，阶段 1 已按此交付
目标读者：本仓库的实施者（Claude / 用户本人）

## 1. 背景与目标

现有项目是一个通用博客系统（React SPA + Go/Gin + MySQL + Redis），需要重构为**单用户的个人控制台网站**，核心定位从"写文章"转为"个人数据工具 + 生活记录"。

五大板块：

| 板块 | 定位 | 形态 |
|---|---|---|
| 📈 投资 | 美股个股、ETF（如 QQQ）、银行积存金（按克/人民币）的持仓与盈亏跟踪 | 工具 |
| 🗣️ 学习 | 英语/西班牙语**学习阶段记录 + 每日打卡**（用户已有其他语言学习软件，不做生词本/SRS——2026-09-12 修订） | 轻工具 |
| 🌱 生活 | 习惯打卡热力图、随手记、照片墙 | 工具 + 内容 |
| ✍️ 博客 | 现有文章/分类/标签/归档/评论系统，保留并重做样式 | 内容 |

> ~~💪 健身（训练日志、身体数据曲线、打卡日历）~~ —— **2026-09-12 用户决定取消**：不建健身模块，前端导航同步移除该板块；健身相关内容可作为博客分类存在。`workouts/workout_sets/body_metrics` 表不再创建；dashboard summary 的 `workouts_this_week` 字段按"只增不改"原则保留、恒为 0，前端不再展示。

约束与决策（用户已确认）：

- **以工具为主**，文章次要。
- **部署形态：本地 docker-compose 跑 + GitHub 私有仓库存代码**。暂不做公网部署，架构预留以后上云的可能。
- **架构方案 B：前端整体重写，Go 后端保留并扩展**。现有 API 契约兼容，数据全部保留。
- **UI 风格：仪表盘风**（类 Linear/Vercel）：浅灰背景、白色卡片、细腻阴影、数据可视化优先；支持深浅色切换；移动端侧边栏收起为底部 Tab。
- 黄金为**银行积存金（人民币/克）**：成交按实际银行价格记录，参考价由国际金价自动换算（见 §5.3）。
- 行情为**免费方案，分钟级更新（约 15 分钟延迟）**，个人长期持仓跟踪够用；不做日内实时。

## 2. 架构总览

```
┌─ 前端 frontend/（推倒重写）───────────────────────┐
│ Vite + React 18 + TypeScript                       │
│ Tailwind CSS + shadcn/ui（组件库）                  │
│ React Router v6 · TanStack Query（服务端状态）      │
│ Recharts（图表）· sonner（toast）                   │
└──────────────────┬─────────────────────────────────┘
                   │ /api（JWT Bearer，全部接口需登录）
┌─ 后端 backend/（保留骨架，扩展模块）───────────────┐
│ Go 1.22 + Gin · sqlx · MySQL 8 · Redis 7           │
│ 保留: config/ middleware/ pkg/jwt handler(post,    │
│       category, user, comment, gallery, upload)    │
│ 新增: handler(trade, asset, learn,                 │
│       workout, habit, dashboard)                   │
│       pkg/quote（行情子系统）                       │
│       每日行情快照定时任务                          │
└────────────────────────────────────────────────────┘
MySQL + Redis：docker-compose 本地启动（不变）
```

原则：

- 后端沿用现有分层（handler → sqlx 直查 → Redis 缓存，mutation 后失效缓存），新模块照抄现有 `post.go`/`category.go` 的模式。
- 单用户站点：**移除注册页**，保留 JWT 登录（防止局域网内他人访问财务数据）。`users` 表及"第一个用户是管理员"机制不变。
- 前端选择 TypeScript：重写是引入类型安全的最佳时机，配合 shadcn/ui 生态默认实践。
- 前端 v1 **仅中文界面**（用户为中文母语）；组件文案集中管理，预留 i18n 恢复的可能。现有 `i18n/`、`MatrixRain`、`TerminalOverlay` 等移除；`CommandPalette`（⌘K）以 shadcn 风格重做保留。

## 3. 数据模型

### 3.1 新增表（`cmd/migrate.go` 自动建表，风格与现有表一致）

```sql
-- 资产（个股/ETF/黄金等）
CREATE TABLE assets (
  id          BIGINT PK AUTO_INCREMENT,
  symbol      VARCHAR(32) UNIQUE NOT NULL,   -- AAPL / QQQ / GOLD_CNY_G
  name        VARCHAR(100) NOT NULL,         -- 显示名，如"苹果""纳指ETF""银行积存金"
  type        VARCHAR(16) NOT NULL,          -- stock / etf / metal / other（预留 crypto）
  price_source VARCHAR(16) NOT NULL,         -- yahoo / computed_gold_cny / manual
  currency    VARCHAR(8) NOT NULL DEFAULT 'USD', -- USD / CNY
  current_price DECIMAL(18,4),               -- 最近一次成功获取的价格
  price_updated_at DATETIME,
  created_at  TIMESTAMP, updated_at TIMESTAMP
);

-- 交易流水（永远按用户实际成交价记录，与行情解耦）
CREATE TABLE trades (
  id          BIGINT PK AUTO_INCREMENT,
  asset_id    BIGINT NOT NULL,               -- FK -> assets.id
  side        VARCHAR(8) NOT NULL,           -- buy / sell
  quantity    DECIMAL(18,6) NOT NULL,        -- 股数 / 克数
  price       DECIMAL(18,4) NOT NULL,        -- 成交单价（资产计价货币）
  fee         DECIMAL(12,2) DEFAULT 0,
  traded_at   DATE NOT NULL,
  note        TEXT,
  created_at  TIMESTAMP
);

-- 每日价格快照（收益曲线数据源）
CREATE TABLE price_history (
  id      BIGINT PK AUTO_INCREMENT,
  symbol  VARCHAR(32) NOT NULL,
  date    DATE NOT NULL,
  close   DECIMAL(18,4) NOT NULL,
  UNIQUE KEY uk_symbol_date (symbol, date)
);

-- 语言学习阶段档案（2026-09-12 修订：替代原 vocab_words/review_logs，用户已有其他学习软件）
CREATE TABLE language_profiles (
  id         BIGINT PK AUTO_INCREMENT,
  lang       VARCHAR(8) UNIQUE NOT NULL,      -- en / es
  level      VARCHAR(50) NOT NULL,            -- 自评阶段，如"中级 B1""入门 A2"
  goal       TEXT,                            -- 学习目标（可空）
  note       TEXT,                            -- 备注：在用什么软件、心得等
  updated_at TIMESTAMP
);

-- 学习打卡（每语言每天一条，幂等）
CREATE TABLE study_logs (
  id         BIGINT PK AUTO_INCREMENT,
  lang       VARCHAR(8) NOT NULL,             -- en / es
  log_date   DATE NOT NULL,
  note       VARCHAR(200),                    -- 今天学了什么（可选）
  created_at TIMESTAMP,
  UNIQUE KEY uk_lang_date (lang, log_date)
);

-- 训练/身体数据表已取消（2026-09-12 用户决定不做健身模块）

-- 习惯与打卡
CREATE TABLE habits (
  id         BIGINT PK AUTO_INCREMENT,
  name       VARCHAR(50) NOT NULL,
  icon       VARCHAR(16),                    -- emoji
  color      VARCHAR(16),                    -- 热力图颜色
  archived   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP
);
CREATE TABLE habit_logs (
  habit_id BIGINT NOT NULL,
  log_date DATE NOT NULL,
  PRIMARY KEY (habit_id, log_date)
);
```

### 3.2 现有表变更

- `categories` 增加 `section VARCHAR(20) DEFAULT 'blog'`（取值 invest/learn/fitness/life/blog），用于把文章归入五大板块；现有分类迁移脚本默认置 `blog`。
- `posts`、`tags`、`post_tags`、`comments`、`gallery`（如存在）不变。

### 3.3 关键决策

- **持仓不建表**：持仓数量、平均成本、已实现/未实现盈亏全部由 `trades` 实时推导（加权平均成本法），杜绝两张表数据不一致。推导逻辑为纯函数，必须有单元测试。
- **成交价与行情价分离**：`trades.price` 是历史事实，永不被行情覆盖；行情只影响展示层的浮动盈亏。
- **随手记不建新表**：复用 `posts`，归入 `section=life` 的"随手记"分类，前端提供快速录入框（一行文字即发布）。

## 4. 行情子系统（pkg/quote）

### 4.1 数据源与降级链

1. **首选 Yahoo Finance 行情**（无需 API key，v8 chart 接口）：个股、ETF、`GC=F`（COMEX 黄金期货 USD/oz；原计划的现货 `XAUUSD=X` 已被 Yahoo 下线，2026-09-12 实测 404）、`CNY=X`（美元兑人民币）。
2. **降级 Stooq 免费 CSV**（`https://stooq.com/q/l/`）：Yahoo 限流或结构变化时兜底。
3. **最终降级**：返回 `assets.current_price`（最近一次成功值）+ `price_updated_at`，前端灰显"更新于 X 分钟前"。页面永不因行情失败而白屏。

### 4.2 刷新策略

- 前端持仓页/Dashboard **每 60s 轮询** `GET /api/quotes?symbols=...`（页面不可见时暂停）。
- 后端 Redis 缓存报价 60s，防止对上游限流。
- **每日快照任务**（Go 内 robfig/cron）：每天北京时间 06:00（美股收盘后）把各资产价格写入 `price_history`（积存金参考价同日快照）；服务重启当日未快照则补跑。新资产创建时回填近一年历史（Yahoo chart API / Stooq 日线）。
- 上游请求走 HTTP 代理，代理地址由 `.env` 的 `QUOTE_PROXY`（默认 `http://127.0.0.1:7890`）配置，可置空关闭。

### 4.3 银行积存金（人民币/克）

- 建为一个 `price_source=computed_gold_cny` 的特殊资产（symbol 固定 `GOLD_CNY_G`）。
- 参考价 = `GC=F ÷ 31.1035（克/盎司）× CNY=X`（GC=F 为 COMEX 黄金期货，与现货存在小幅基差，叠加银行点差后仍属"参考价"定位；2026-09-12 修订：原 XAUUSD=X 已被 Yahoo 下线）。
- 与银行报价存在每克数元以内的点差，属预期；页面标注"参考价"。用户也可将该资产改为 `manual` 手动输价。

## 5. API 设计

沿用现有风格：JSON、`/api` 前缀、JWT Bearer（除 login 外全部需认证）、错误统一 `{"error": "..."}` + 恰当状态码。

```
认证        POST /api/auth/login                    （保留；register 下线）

Dashboard   GET  /api/dashboard/summary             聚合：总市值/总盈亏、今日学习打卡状态、
                                                    学习连续天数、习惯打卡状态、收益曲线缩略数据
                                                    （Redis 缓存 60s；workouts_this_week 字段
                                                    按"只增不改"保留恒 0，前端不展示）

投资        GET/POST        /api/assets             资产列表/新增
            PUT/DELETE      /api/assets/:id
            GET/POST        /api/trades             交易流水（支持 ?symbol= 过滤）
            DELETE          /api/trades/:id
            GET             /api/positions          推导持仓+盈亏（含每资产与汇总）
            GET             /api/quotes?symbols=    批量实时价（走行情子系统）
            GET             /api/price-history?symbol=&days=

学习        GET             /api/learn/profiles      两种语言的阶段档案（无记录时返回默认空档案）
            PUT             /api/learn/profiles/:lang 更新阶段/目标/备注（upsert）
            POST            /api/learn/checkin       {lang, note?, date?} 当日打卡（幂等）
            DELETE          /api/learn/checkin       {lang, date?} 撤销打卡
            GET             /api/learn/stats         连续天数、今日打卡状态、本周/累计打卡数
            GET             /api/learn/calendar?year= 打卡日历（两语言合并视图）

健身        ——已取消（2026-09-12 用户决定，无健身端点）

生活        GET/POST        /api/habits
            PUT/DELETE      /api/habits/:id
            POST/DELETE     /api/habits/:id/check   {date}（打卡/撤销，幂等）
            GET             /api/habits/heatmap?year=

博客/图库/评论  现有接口全部保留不动
```

## 6. 学习模块（简化版，2026-09-12 修订）

> 修订说明：原设计为生词本 + SM-2 间隔重复复习。用户已有其他语言学习软件，明确"不需要太复杂，只想记录目前什么阶段"。SRS 方案整体废弃，替换为：

- **阶段档案**：每种语言（英语/西班牙语）一条档案——当前阶段（自评文本，如"中级 B1"）、学习目标、备注（在用什么软件学）。随时可编辑。
- **每日打卡**：一键记录"今天学了"，可选一句话备注；每语言每天最多一条（幂等，可撤销）。
- **连续天数**：打卡连续天数 streak 计算为纯函数（按日期序列推导，任意语言打卡即算当天学习），必须有 Go 单元测试。
- **Dashboard 字段复用**（schema 只增不改）：`learn_streak` = 连续打卡天数；`review_due` = 今日尚未打卡的语言数（0-2）；前端"今日复习"卡文案改为"今日学习"。

## 7. 前端结构

```
frontend/src/
├── main.tsx / App.tsx            路由 + QueryClient + 主题
├── components/
│   ├── ui/                       shadcn/ui 组件
│   ├── layout/                   Sidebar、Topbar、MobileTabBar、CommandPalette
│   └── charts/                   基于 Recharts 的封装（收益曲线、体重曲线、热力图）
├── pages/
│   ├── Dashboard.tsx             /            4 统计卡 + 收益曲线 + 今日学习打卡入口 + 习惯热力缩略
│   ├── invest/                   /invest      持仓表·流水·录入对话框·收益曲线·占比饼图
│   ├── learn/                    /learn       语言阶段卡(可编辑)·一键打卡·打卡日历·连续天数
│   ├── （fitness 已取消，导航与路由移除）
│   ├── life/                     /life        习惯热力图·随手记·照片墙（复用 gallery API）
│   ├── blog/                     /blog /blog/:slug /archive 文章列表/详情/归档+评论
│   ├── Login.tsx
│   └── admin/                    /admin       写文章（Markdown）+ 各模块数据管理
├── lib/api.ts                    fetch 封装（JWT 注入、401 跳登录）
└── hooks/                        usePositions 等 TanStack Query hooks
```

设计系统（仪表盘风）：

- 色板：背景 `#F7F8FA`（深色 `#0E0F12`）、卡片纯白、主色一种（建议靛蓝）、涨绿跌红遵循**美股习惯**（绿涨红跌，可配置项预留）。
- 字体：系统字体栈；数字用 `font-variant-numeric: tabular-nums`；金额等宽对齐。
- 圆角 12px、细边框 `#E5E7EB`、阴影仅一级（`0 1px 3px rgba(0,0,0,.06)`）。
- 全部数据卡片骨架屏加载（TanStack Query loading 态），空状态给插画+引导按钮。

## 8. 错误处理与数据安全

- 后端：handler 统一错误返回；行情子系统错误只降级不抛出；所有 mutation 后失效对应 Redis 缓存（沿用现有模式）。
- 前端：TanStack Query 全局 `onError` → sonner toast；401 → 跳登录页；表单 zod 校验。
- 安全：仓库**必须私有**（财务数据）；`.env`、`backend/uploads` 已 gitignore；行情代理地址不含密钥。
- 备份：`mysqldump` 每日快照到本地 `backups/`（gitignore），Makefile 提供 `make backup`。

## 9. 测试策略

- **Go 单元测试**（当前项目零测试，本期只测最值得测的纯逻辑）：
  - 盈亏推导（加权平均成本、部分卖出、清仓、手续费计入）
  - 学习打卡 streak 连续天数计算（修订：替代原 SM-2 算法测试）
  - 积存金换算
- **前端**：`tsc --noEmit` + `npm run build` 零错误。
- **冒烟测试**（webapp-testing skill / Playwright）：登录 → 建资产录交易 → 持仓盈亏正确显示 → 学习打卡 → 习惯打卡出现在热力图。
- 每期收尾手动过一遍该期页面（桌面 + 移动视口）。

## 10. GitHub 上线准备（阶段 0）

1. **隐私清理**（先于任何 commit/push）：`edit_wedding_videos.py`、`edit_wedding_videos.sh`、`女本位主义核心思想综述.md` 移至仓库外 `~/personal/`（移动不删除）；复查 `.gitignore`（已含 `.env`、`uploads`、`node_modules`、`dist`），追加 `backups/`。
2. `git init`（主分支 `main`），首次提交完整项目。
3. `gh repo create` 建**私有**仓库并推送。
4. 此后每个阶段完成即 commit + push。

## 11. 实施分期

| 期 | 内容 | 交付标志 |
|---|---|---|
| 0 | GitHub 初始化 + 隐私清理 | 私有仓库有首次提交 |
| 1 | 前端脚手架 + 设计系统 + 布局 + Dashboard 壳 + 博客/图库/评论/登录迁移（功能等价） | 新 UI 跑通现有全部功能 |
| 2 | 投资模块（assets/trades/positions/行情子系统/收益曲线） | 录交易→实时盈亏→曲线可见 |
| 3 | 学习模块（阶段档案 + 每日打卡 + streak + 日历，简化版） | 编辑阶段→打卡→连续天数可见 |
| 4 | ~~健身模块~~ **已取消**（2026-09-12 用户决定；导航/路由/卡片移除并入阶段 2 收尾执行） | — |
| 5 | 生活模块（habits 热力图 + 随手记 + 照片墙升级）+ 全站收尾 | 四大板块完整（投资/学习/生活/博客） |

每期独立走 spec→plan→实现→测试→提交；本文件为总设计，各期细节在实施计划中展开。

## 12. 明确不做（YAGNI）

- 多用户/注册/权限体系（单用户，仅 JWT 登录）
- WebSocket 毫秒级行情、日内交易功能
- 券商/银行接口自动同步（手动录入成交）
- 加密货币行情（`type=other` 预留字段即可）
- 移动原生 App（响应式 Web 即可）
- 公网部署（本期本地跑；架构不阻碍以后上云）
- 英文/西语界面 i18n（文案集中管理，预留恢复可能）
- 生词本 / SRS 间隔重复复习 / 复习队列（用户已有其他语言学习软件，网站只做阶段记录与打卡——2026-09-12 修订）
- 健身模块：训练日志/身体数据/打卡日历（2026-09-12 用户决定取消；健身内容可作为博客分类存在）
