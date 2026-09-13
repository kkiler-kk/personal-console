# 个人控制台网站重构设计

日期：2026-09-12（修订：12 日学习模块简化废弃生词本/SRS、健身模块取消；13 日学习模块增补时长记录与统计；13 日增补：中国基金支持；13 日：移除登录（单用户直通）、持仓排序、币种切换）
状态：已与用户对齐，阶段 1 已按此交付
目标读者：本仓库的实施者（Claude / 用户本人）

## 1. 背景与目标

现有项目是一个通用博客系统（React SPA + Go/Gin + MySQL + Redis），需要重构为**单用户的个人控制台网站**，核心定位从"写文章"转为"个人数据工具 + 生活记录"。

五大板块：

| 板块 | 定位 | 形态 |
|---|---|---|
| 📈 投资 | 美股个股、ETF（如 QQQ）、**A 股（沪 .SS / 深 .SZ，2026-09-13 增补）**、**场外中国基金（6 位代码，天天基金净值源，2026-09-13 增补）**、银行积存金（按克/人民币）的持仓与盈亏跟踪；持仓行显示 **PE(TTM)**（2026-09-13 增补） | 工具 |
| 🗣️ 学习 | 英语/西班牙语**学习阶段记录 + 学习时长记录与统计 + 打卡日历**（按类型记时长：背单词/听力/口语等；用户已有其他学习软件，不做生词本/SRS——2026-09-12/13 两次修订） | 轻工具 |
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
                   │ /api（无认证：SingleUserMiddleware 直通，2026-09-13）
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
- 单用户站点：**无认证单用户直通**（2026-09-13 用户决定）：登录/注册全部移除，`SingleUserMiddleware` 对每个请求注入 `users.id=1`；**公网部署前必须恢复 JWT 认证**（`pkg/jwt.go` 保留为基座，`middleware/auth.go` 的 git 历史有完整 JWT 实现，裁决清单见 §8）。`users` 表及"第一个用户是管理员"机制不变（felix 用户 id=1 由 migrate 幂等种子）。
- 前端选择 TypeScript：重写是引入类型安全的最佳时机，配合 shadcn/ui 生态默认实践。
- 前端 v1 **仅中文界面**（用户为中文母语）；组件文案集中管理，预留 i18n 恢复的可能。现有 `i18n/`、`MatrixRain`、`TerminalOverlay` 等移除；`CommandPalette`（⌘K）以 shadcn 风格重做保留。

## 3. 数据模型

### 3.1 新增表（`cmd/migrate.go` 自动建表，风格与现有表一致）

```sql
-- 资产（个股/ETF/黄金等）
CREATE TABLE assets (
  id          BIGINT PK AUTO_INCREMENT,
  symbol      VARCHAR(32) UNIQUE NOT NULL,   -- AAPL / QQQ / GOLD_CNY_G / 110022（中国基金为纯 6 位数字）
  name        VARCHAR(100) NOT NULL,         -- 显示名，如"苹果""纳指ETF""银行积存金"
  type        VARCHAR(16) NOT NULL,          -- stock / etf / metal / fund / other（预留 crypto；2026-09-13 增补 fund）
  price_source VARCHAR(32) NOT NULL,         -- yahoo / computed_gold_cny / manual / fund_cn（勘误：原 16 装不下 computed_gold_cny；2026-09-13 增补 fund_cn）
  currency    VARCHAR(8) NOT NULL DEFAULT 'USD', -- USD / CNY
  current_price DECIMAL(18,4),               -- 最近一次成功获取的价格
  price_updated_at DATETIME,
  created_at  TIMESTAMP, updated_at TIMESTAMP,
  sort_order  INT NOT NULL DEFAULT 0         -- 自定义展示顺序（2026-09-13 增补，ALTER 追加于表尾；拖拽排序持久化，
                                             -- List/positions ORDER BY sort_order，legacy 行迁移时归一为 id）
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

-- 学习记录（每条 = 一次学习活动；某天有任意一条即算当天打卡；2026-09-13 修订：加时长与类型）
CREATE TABLE study_sessions (
  id           BIGINT PK AUTO_INCREMENT,
  lang         VARCHAR(8) NOT NULL,          -- en / es
  activity     VARCHAR(20) NOT NULL,         -- vocab(背单词)/listening(听力)/speaking(口语)/reading(阅读)/grammar(语法)/other(其他)
  minutes      INT NOT NULL DEFAULT 0,       -- 学习时长（分钟，0=纯打卡）
  session_date DATE NOT NULL,
  note         VARCHAR(200),                 -- 学了什么（可选）
  created_at   TIMESTAMP,
  KEY idx_session_date (session_date),
  KEY idx_lang_date (lang, session_date)
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

1. **首选 Yahoo Finance 行情**（无需 API key，v8 chart 接口）：个股、ETF、A 股（`600519.SS`/`000001.SZ`）、`GC=F`（COMEX 黄金期货 USD/oz；原计划的现货 `XAUUSD=X` 已被 Yahoo 下线，2026-09-12 实测 404）、`CNY=X`（美元兑人民币）。
2. **降级 Stooq 免费 CSV**（`https://stooq.com/q/l/`）：Yahoo 限流或结构变化时兜底。
3. **中国场外基金源：天天基金/东方财富**（2026-09-13 增补，`price_source=fund_cn`；链上位于 Stooq 之后、DB 兜底之前）：
   - **实时/最新净值** `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo`（JSON，无需 key）：盘中 `GSZ`（估值）作 price、官方净值 `NAV` 作 previous_close（使日涨跌有语义）；收盘后/非交易日 `GSZ` 为 null → price 用 `NAV`。上游回显的 `FCODE` 必须与请求 symbol 一致，否则整条报价作废并降级（防上游/CDN 串数据把别的标的净值写进账本）；数值字段兼容「字符串/数字/null」与占位符 `--`，**NaN/Inf 显式按缺失处理**（否则会击穿 `json.Marshal` → gin 500）。
   - **历史净值** `https://api.fund.eastmoney.com/f10/lsjz`：**必须带 `Referer: http://fundf10.eastmoney.com/`（缺失即 403）** 与浏览器 UA；上游按「新→旧」返回且**单页硬上限 20 行**（实测 pageSize=21..200 仍只回 20 行，≥365 直接回 `Data:null`），故按 `pageIndex` 翻页凑够 days（上限 20 页 = 400 点，覆盖 days≤365），输出反转为升序对齐 Yahoo 契约。
   - **symbol 契约：纯 6 位数字**（`quote.IsFundCNSymbol`，全链唯一判定来源）。Yahoo 对裸 6 位码在**发请求前**即返回 `ErrUnsupported`（A 股带交易所后缀如 `600519.SS` 不匹配该正则，仍走 Yahoo），Stooq 的符号映射天然拒绝——基金码零无效外网往返；服务端对 `fund_cn` 强制 `type=fund`、`currency=CNY`，PE 恒 null（§4.4），创建后同样异步回填 365 天历史、并纳入每日快照（06:00 CST 时 D-1 官方净值已公布、D 日净值尚未产生，口径与股票一致）。
   - **日频语义**：基金净值每日一次而非分钟级；盘中 `/api/quotes` 返回的是**估值**（非成交价），Redis 60s 缓存与整条降级链口径不变。
   - ⚠️ **踩坑记录**：早期公开资料常见的 jsonp 估值源 `fundgz.1234567.com.cn/js/{code}.js` **已下线**（2026-09 实测返回 CDN 静态「页面未找到」页），**不要再用**；`FundMNFInfo` 字段语义与其一一对应（`NAV`≈`dwjz`、`GSZ`≈`gsz`、`PDATE`≈`jzrq`、`GZTIME`≈`gztime`），可直接替代。
4. **最终降级**：返回 `assets.current_price`（最近一次成功值）+ `price_updated_at`，前端灰显"更新于 X 分钟前"。页面永不因行情失败而白屏。

### 4.2 刷新策略

- 前端持仓页/Dashboard **每 60s 轮询** `GET /api/quotes?symbols=...`（页面不可见时暂停）。
- 后端 Redis 缓存报价 60s，防止对上游限流。
- **每日快照任务**（Go 内 robfig/cron）：每天北京时间 06:00（美股收盘后）把各资产价格写入 `price_history`（积存金参考价同日快照）；服务重启当日未快照则补跑。新资产创建时回填近一年历史（Yahoo chart API / 天天基金 `lsjz` 分页，按 symbol 形态自动选源；Stooq 仅供实时报价不提供历史）。
- 上游请求走 HTTP 代理，代理地址由 `.env` 的 `QUOTE_PROXY`（默认 `http://127.0.0.1:7890`）配置，可置空关闭。

### 4.3 银行积存金（人民币/克）

- 建为一个 `price_source=computed_gold_cny` 的特殊资产（symbol 固定 `GOLD_CNY_G`）。
- 参考价 = `GC=F ÷ 31.1035（克/盎司）× CNY=X`（GC=F 为 COMEX 黄金期货，与现货存在小幅基差，叠加银行点差后仍属"参考价"定位；2026-09-12 修订：原 XAUUSD=X 已被 Yahoo 下线）。
- 与银行报价存在每克数元以内的点差，属预期；页面标注"参考价"。用户也可将该资产改为 `manual` 手动输价。

### 4.4 基本面（PE，2026-09-13 增补）

- **PE(TTM)** 来自 Yahoo v7 quote 接口（需 crumb：cookie → `GET /v1/test/getcrumb` → 带 crumb 调 v7；crumb 内存缓存，401 时重取一次）。批量 symbols 一次调用。
- Redis 缓存 `fund:<symbol>` 1 小时（PE 无需分钟级新鲜度）。
- **只降级不报错**：manual 资产、GOLD_CNY_G 与 `fund_cn` 基金不请求（恒 null——基金无市盈率概念，净值源也不提供 PE）；接口失败/字段缺失（多数 ETF 有 PE、期货无）→ null + log；持仓行 `pe_ttm` 字段 null 时前端显示 "—"。
- `/api/positions` 的行结构**新增** `pe_ttm`（可 null）——遵守 schema 只增不改。

## 5. API 设计

沿用现有风格：JSON、`/api` 前缀、错误统一 `{"error": "..."}` + 恰当状态码。**无认证**（2026-09-13）：原"需认证"分组现为 SingleUserMiddleware 直通，全部接口不要求 token。

```
认证        ——已移除（2026-09-13 用户决定，无认证单用户直通，见 §2 原则与 §8 安全裁决）

Dashboard   GET  /api/dashboard/summary             聚合：总市值/总盈亏、今日学习分钟数与打卡状态、
                                                    学习连续天数、习惯打卡状态、收益曲线缩略数据
                                                    （Redis 缓存 60s；workouts_this_week 字段
                                                    按"只增不改"保留恒 0，前端不展示；
                                                    study_minutes_today 为 2026-09-13 新增字段）

投资        GET/POST        /api/assets             资产列表/新增
            PUT/DELETE      /api/assets/:id
            PUT             /api/assets/reorder     {ids:[...]} 拖拽排序持久化（2026-09-13 增补；ids 须与全部
                                                    现存资产 id 集合严格一致否则 400；事务内逐位写 sort_order=1..N）
            GET/POST        /api/trades             交易流水（支持 ?symbol= 过滤）
            DELETE          /api/trades/:id
            GET             /api/positions          推导持仓+盈亏（含每资产与汇总）
            GET             /api/quotes?symbols=    批量实时价（走行情子系统）
            GET             /api/price-history?symbol=&days=

学习        GET             /api/learn/profiles      两种语言的阶段档案（仅返回已有行，前端补空卡）
            PUT             /api/learn/profiles/:lang 更新阶段/目标/备注（upsert）
            POST            /api/learn/sessions      {lang, activity, minutes, date?, note?} 记录一次学习
            GET             /api/learn/sessions?limit= 学习记录列表（session_date 倒序；limit 默认 100、
                                                    clamp 1–200，非数字 400；返回 sessions + 全量 total）
            DELETE          /api/learn/sessions/:id  删除一条记录
            GET             /api/learn/stats         streak/今日(总分钟+分语言+分类型)/本周/累计/近28天逐日
            GET             /api/learn/calendar?year= 打卡日历（逐日分钟数+语言集合）

健身        ——已取消（2026-09-12 用户决定，无健身端点）

生活        GET/POST        /api/habits
            PUT/DELETE      /api/habits/:id
            POST/DELETE     /api/habits/:id/check   {date}（打卡/撤销，幂等）
            GET             /api/habits/heatmap?year=

搜索        GET             /api/search?q=          ⌘K 全站搜索：文章(仅已发布)/资产/习惯(未归档)/分类/标签
                                                    五类聚合；q 按 rune 计 1–50（越界 400）；LIKE 通配符转义；
                                                    各类独立失败降级为 []，响应五键恒在

博客/图库/评论  现有接口全部保留不动
```

## 6. 学习模块（简化版，2026-09-12 修订，2026-09-13 增补时长统计）

> 修订说明：原设计为生词本 + SM-2 间隔重复复习。用户已有其他语言学习软件，明确"不需要太复杂，只想记录目前什么阶段"。SRS 方案整体废弃。13 日增补：用户要求记录**学习时长与统计**（如"今天背单词 60 分钟、听力 60 分钟"）。

- **阶段档案**：每种语言（英语/西班牙语）一条档案——当前阶段（自评文本，如"中级 B1"）、学习目标、备注（在用什么软件学）。随时可编辑。
- **学习记录**：每条记录 = 语言 + 活动类型（背单词/听力/口语/阅读/语法/其他）+ 分钟数 + 日期 + 可选备注。一天可多条；快速打卡 = 记一条 minutes=0 的 other。
- **统计**：连续天数 streak（任一语言有记录即算当天学习，纯函数必须有 Go 单测）；今日总分钟 + 分语言 + 分活动类型；本周分钟/天数；累计分钟/天数/次数；近 28 天逐日分钟（前端柱状图）。
- **打卡日历**：年度视图，每格显示当日分钟数强度；语言构成以格 title 提示呈现（2026-09-13 精化：替代原"格内语言点"方案，实现更简洁）。
- **Dashboard 字段**（schema 只增不改）：`learn_streak` = 连续天数；`review_due` = 今日尚未学习的语言数（0-2）；**新增** `study_minutes_today` = 今日总分钟；前端「今日学习」卡显示分钟数。

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
│   ├── invest/                   /invest      持仓表(含 PE(TTM) 列 + 类型筛选 Tab + 拖拽排序[sort_order 持久化自定义序] + 列头三态排序)·流水·录入对话框(美股/ETF/A股/积存金/中国基金/手动)·收益曲线·占比条·总资产 ¥/$ 币种切换(2026-09-13 增补，Dashboard 组合卡跟随)
│   ├── learn/                    /learn       语言阶段卡(可编辑)·一键打卡·打卡日历·连续天数
│   ├── （fitness 已取消，导航与路由移除）
│   ├── life/                     /life        习惯热力图·随手记·照片墙（复用 gallery API）
│   ├── blog/                     /blog /blog/:slug /archive 文章列表/详情/归档+评论
│   ├── （Login.tsx 已移除——2026-09-13 无认证单用户直通）
│   └── admin/                    /admin       写文章（Markdown）+ 各模块数据管理
├── lib/api.ts                    fetch 封装（无 token 注入/401 分支——2026-09-13 去认证）
└── hooks/                        usePositions 等 TanStack Query hooks
```

设计系统（仪表盘风）：

- 色板：背景 `#F7F8FA`（深色 `#0E0F12`）、卡片纯白、主色一种（建议靛蓝）、涨绿跌红遵循**美股习惯**（绿涨红跌，可配置项预留）。
- 字体：系统字体栈；数字用 `font-variant-numeric: tabular-nums`；金额等宽对齐。
- 圆角 12px、细边框 `#E5E7EB`、阴影仅一级（`0 1px 3px rgba(0,0,0,.06)`）。
- 全部数据卡片骨架屏加载（TanStack Query loading 态），空状态给插画+引导按钮。

## 8. 错误处理与数据安全（2026-09-13 修订：无认证现实）

> **上云前置裁决（置顶）**：本站当前**无任何认证**。公网或任何不可信网络部署**之前**，必须恢复 JWT 认证——`pkg/jwt.go` 保留为基座，`middleware/auth.go` 的 git 历史有完整 JWT 实现（恢复路径见 BACKLOG.md 置顶项）；felix 种子用户密码为占位 bcrypt hash（不可登录），恢复认证后须先改密。

- **LAN 暴露面（明示）**：后端监听所有网卡（`*:8080`），无认证、无 IP 白名单——**同网段任何设备可直接读写全部数据（含持仓/交易流水等财务数据）**，并可删改文章/学习记录/习惯。前端 Vite dev server 未配 `--host`/`server.host`，默认仅绑 localhost，其 `/api` 代理不新增暴露面——LAN 实际暴露面只有后端 `*:8080`。
- **缓解（当前裁决）**：仅在本地或完全可信的局域网使用；不做端口映射/内网穿透/公网反代；本迭代不补认证（2026-09-13 用户决定，见 §2 原则）。
- 后端：handler 统一错误返回；行情子系统错误只降级不抛出；所有 mutation 后失效对应 Redis 缓存（沿用现有模式）。
- 前端：TanStack Query 全局 `onError` → sonner toast；表单 zod 校验。（原"401 → 跳登录页"随 2026-09-13 去认证移除，api.ts 已无 token/401 分支。）
- 安全：仓库**必须私有**（财务数据）；`.env`、`backend/uploads` 已 gitignore；行情代理地址不含密钥。金额遮蔽开关（`lib/mask.ts`）是**防窥隐私而非安全边界**——只隐藏 DOM 数字，API 仍明文返回全量数据。
- 备份：`mysqldump` 每日快照到本地 `backups/`（gitignore），Makefile 提供 `make backup`。

## 9. 测试策略

- **Go 单元测试**（当前项目零测试，本期只测最值得测的纯逻辑）：
  - 盈亏推导（加权平均成本、部分卖出、清仓、手续费计入）
  - 学习打卡 streak 连续天数计算（修订：替代原 SM-2 算法测试）
  - 积存金换算
- **前端**：`tsc --noEmit` + `npm run build` 零错误。
- **冒烟测试**（webapp-testing skill / Playwright）：直达 Dashboard（无登录，2026-09-13 起）→ 建资产录交易 → 持仓盈亏正确显示 → 记录学习时长 → 统计出现 → 习惯打卡出现在热力图。
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
| 3 | 学习模块（阶段档案 + 学习时长记录与统计 + 打卡日历，简化版） | 记时长→统计/连续天数/日历可见 |
| 4 | ~~健身模块~~ **已取消**（2026-09-12 用户决定；导航/路由/卡片移除并入阶段 2 收尾执行） | — |
| 5 | 生活模块（habits 热力图 + 随手记 + 照片墙升级）+ 全站收尾 | 四大板块完整（投资/学习/生活/博客） |

每期独立走 spec→plan→实现→测试→提交；本文件为总设计，各期细节在实施计划中展开。

## 12. 明确不做（YAGNI）

- 多用户/注册/权限体系（单用户；无认证直通——JWT 登录已于 2026-09-13 移除，公网部署前必须恢复，见 §8）
- WebSocket 毫秒级行情、日内交易功能
- 券商/银行接口自动同步（手动录入成交）
- 加密货币行情（`type=other` 预留字段即可）
- 移动原生 App（响应式 Web 即可）
- 公网部署（本期本地跑；架构不阻碍以后上云）
- 英文/西语界面 i18n（文案集中管理，预留恢复可能）
- 生词本 / SRS 间隔重复复习 / 复习队列（用户已有其他语言学习软件，网站只做阶段记录与打卡——2026-09-12 修订）
- 健身模块：训练日志/身体数据/打卡日历（2026-09-12 用户决定取消；健身内容可作为博客分类存在）
