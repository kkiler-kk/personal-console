# Felix 的个人控制台

Felix 的个人控制台网站（原「个人博客系统」演进而来）：单用户，以工具为主、文章次要。前端使用 React（TypeScript），后端使用 Go，数据库使用 MySQL，缓存使用 Redis。全站四大板块（投资/学习/生活/博客）已全部交付：博客功能（文章/分类/标签/归档/评论/照片墙）自旧站等价迁移，投资/学习/生活模块按阶段 2/3/4 依次上线；2026-09-13 迭代新增 ⌘K 全站搜索与管理后台扩充（总览/学习记录/习惯/资料）；13 日第二迭代移除登录（**无认证单用户直通**，打开即用）、新增持仓拖拽排序与列排序、总资产 ¥/$ 币种切换（见「安全注意」）；13 日第四迭代上线**三语界面**（中/英/西，react-i18next，默认英文，顶栏切换）。

## 板块

| 板块     | 定位                                     | 进度                                   |
| -------- | ---------------------------------------- | -------------------------------------- |
| 📈 投资 | 美股/A 股个股、ETF、场外中国基金、银行积存金的持仓与盈亏跟踪 | 已上线（阶段 2）                       |
| 🗣️ 学习 | 英语/西班牙语学习阶段记录 + 每日打卡（简化版，不做生词本/SRS） | 已上线（阶段 3）                       |
| 🌱 生活 | 习惯打卡热力图、随手记、照片墙            | 已上线（阶段 4，照片墙阶段 1 先行）    |
| ✍️ 博客 | 文章/分类/标签/归档/评论系统              | 已完成（阶段 1）                       |

分期进度：阶段 0（仓库初始化 + 隐私清理）、阶段 1（控制台壳 + 博客/图库/评论/登录功能等价迁移）、阶段 2（投资模块）、阶段 3（学习模块）、阶段 4（生活模块 + 全站收尾）已全部完成——**全站四大板块（投资/学习/生活/博客）交付完毕**；健身板块已取消（2026-09-12 用户决定，健身内容可作为博客分类存在）。设计文档见 `docs/superpowers/specs/2026-09-12-personal-site-redesign-design.md`。

## 技术栈

| 层级     | 技术                     | 说明                       |
| -------- | ------------------------ | -------------------------- |
| 前端     | Vite + React 19 + TypeScript | SPA 单页应用（仪表盘风 UI） |
| UI       | Tailwind CSS v4 + shadcn/ui（radix-nova 变体） | 设计 token 见 `frontend/src/index.css` |
| 数据     | TanStack Query v5        | 服务端状态与缓存           |
| 路由     | React Router v7          | 前端路由                   |
| 图表     | Recharts                 | Dashboard 数据可视化       |
| 通知     | sonner                   | 全局 toast                 |
| Markdown | react-markdown           | 博客内容 Markdown 渲染     |
| 后端     | Go 1.22 + Gin            | RESTful API                |
| 定时任务 | robfig/cron/v3           | 每日行情快照调度（06:00 北京时间 + 启动补跑） |
| 数据库   | MySQL 8.0                | 数据持久化                 |
| ORM      | sqlx                     | 轻量级 SQL 操作            |
| 缓存     | Redis 7                  | 列表/分类/标签缓存         |
| 认证     | 无（单用户直通）       | SingleUserMiddleware 注入 users.id=1；JWT 登录已于 2026-09-13 移除，`pkg/jwt.go` 保留为恢复认证基座（见「安全注意」） |

## 项目结构

```
blogs/
├── docker-compose.yml          # MySQL + Redis 快速启动
├── Makefile                    # 常用命令入口
├── .gitignore
├── backend/                    # Go 后端
│   ├── go.mod
│   ├── cmd/
│   │   ├── main.go             # 入口
│   │   └── migrate.go          # 自动建表
│   ├── config/
│   │   ├── config.go           # 配置加载
│   │   ├── db.go               # MySQL 连接
│   │   └── redis.go            # Redis 连接
│   ├── handler/
│   │   ├── user.go             # 用户资料（登录已移除）
│   │   ├── post.go             # 文章 CRUD + 归档
│   │   ├── category.go         # 分类 + 标签
│   │   ├── comment.go          # 评论（嵌套回复 + 点赞）
│   │   ├── dashboard.go        # 控制台统计摘要（含投资组合字段）
│   │   ├── upload.go           # 图片上传
│   │   ├── gallery.go          # 照片墙（读取 uploads 目录）
│   │   ├── asset.go            # 资产 CRUD + 手动改价
│   │   ├── trade.go            # 交易流水 CRUD（超卖校验）
│   │   ├── invest.go           # 持仓/行情/价格历史/收益曲线
│   │   ├── learn.go            # 语言档案 + 学习记录 + 统计 + 打卡日历
│   │   ├── habit.go            # 习惯 CRUD + 打卡/撤销 + 年度热力图
│   │   └── search.go           # 全站五类聚合搜索（⌘K 命令面板数据源）
│   ├── middleware/
│   │   └── auth.go             # SingleUserMiddleware 单用户直通（JWT 版本在 git 历史）
│   ├── model/
│   │   └── model.go            # 数据模型
│   ├── pkg/
│   │   ├── jwt.go              # JWT 工具（2026-09-13 起未消费，保留为恢复认证基座）
│   │   ├── portfolio/          # 持仓盈亏 + 价值曲线纯函数（含单测）
│   │   ├── learn/              # 学习连续天数（streak）纯函数（含单测）
│   │   └── quote/              # 行情子系统：Yahoo→Stooq→天天基金(6位基金码)→兜底降级（含单测）
│   ├── service/
│   │   └── snapshot.go         # 每日价格快照 cron + 启动补跑（一年回填在建资产时异步触发）
│   ├── router/
│   │   └── router.go           # 路由配置
│   ├── uploads/                # 上传文件目录（git 忽略）
│   └── .env.example            # 环境变量示例
└── frontend/                   # React 前端（TypeScript）
    ├── package.json
    ├── vite.config.ts          # 端口 3000，/api 与 /uploads 代理到 8080
    ├── components.json         # shadcn/ui 配置
    ├── index.html
    ├── scripts/
    │   └── smoke.mjs           # Playwright 冒烟测试（十步链路）
    └── src/
        ├── main.tsx            # 入口
        ├── App.tsx             # 路由
        ├── index.css           # 设计 token + 全局样式（Tailwind v4）
        ├── components/
        │   ├── ui/             # shadcn/ui 基础组件
        │   ├── layout/         # 侧边栏/顶栏/移动端 Tab/命令面板（⌘K 全站搜索）
        │   ├── admin/          # AdminNav 管理后台横向导航条
        │   ├── charts/         # Recharts/自绘封装（收益曲线 ValueChart、学习柱状 MinutesBar、习惯热力图 HabitHeatmap）
        │   ├── blog/           # 文章卡片/评论区/Markdown/分页
        │   └── ErrorState.tsx  # 全站统一错误态（图标 + 文案 + 可选重试）
        ├── context/
        │   ├── AuthContext.tsx # 用户状态（单用户无登录：mount 拉 profile，契约 {user, refresh}）
        │   └── ThemeContext.tsx # 深浅色主题
        ├── lib/
        │   ├── api.ts          # fetch 封装（无认证：无 token 注入/401 分支）
        │   ├── types.ts        # 共享类型
        │   ├── format.ts       # 格式化工具
        │   ├── displayCurrency.ts # 汇总层 ¥/$ 显示币种（localStorage 持久 + 跨标签同步）
        │   ├── mask.ts         # 投资金额遮蔽开关（防窥隐私，非安全边界）
        │   └── dates.ts        # 日期工具（compact 热力图 16 周窗口起点，Dashboard/热力图共享）
        └── pages/
            ├── Dashboard.tsx   # 首页仪表盘（统计卡 + 收益曲线 + 习惯迷你热力图）
            ├── invest/         # 投资页（持仓表[拖拽排序 + 列头三态排序] + 类型筛选 Tab + ¥/$ 切换/交易/曲线/资产对话框：美股·A股·积存金·中国基金·手动预设）
            ├── learn/          # 学习页（阶段档案/记录学习/统计图表/打卡日历）
            ├── blog/           # 文章列表/详情/归档/分类/标签
            ├── admin/          # 管理后台：总览/文章/分类/学习记录/习惯/资料 + 编辑器
            └── life/           # 生活页（习惯打卡热力图/随手记/照片墙瀑布流+灯箱）
```

## 快速开始

### 1. 启动 MySQL 和 Redis

使用 Docker Compose 一键启动（需要安装 Docker）：

```bash
docker-compose up -d
```

这会在后台启动 MySQL（端口 3306）和 Redis（端口 6379）。MySQL 会自动创建 `blog` 数据库。

如果没有 Docker，也可以手动安装：

```bash
# macOS
brew install mysql redis
brew services start mysql
brew services start redis

# 创建数据库
mysql -u root -p -e "CREATE DATABASE blog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 2. 启动后端

```bash
cd backend

# 复制环境变量
cp .env.example .env
# 编辑 .env 修改密码等配置

# 下载依赖并运行
go mod tidy
go run cmd/*.go
```

后端启动后会自动建表，监听 `http://localhost:8080`。

### 3. 启动前端

```bash
cd frontend

npm install
npm run dev
```

前端会在 `http://localhost:3000` 启动，API 请求会自动代理到后端。打开 `http://localhost:3000` **即用，无需登录**——单用户直通，后端建表时自动种子 `felix` 用户（id=1），所有请求都视为该用户。

### 4. 冒烟测试（可选）

全栈跑起来后执行：`node frontend/scripts/smoke.mjs`（**无需任何凭据环境变量**；`BASE_URL` 可覆盖前端地址，默认 `http://localhost:3000`），十步链路（直达 Dashboard → 博客 → 管理后台 → 管理总览 → 全站搜索 → 生活页 → 评论发删、投资链路：建资产→录交易→持仓校验→清理、学习链路：记录时长→统计校验→/learn 页面→清理、习惯链路：建习惯→打卡→热力图含今天→/life 页面→清理）全过输出 `STEP5 SEARCH PASS` + `STEP8 INVEST PASS` + `STEP9 LEARN PASS` + `STEP10 HABIT PASS` + `SMOKE PASS ✅`。

## API 文档

> 2026-09-13 起全站**无认证**：所有接口都不需要 token（后端 SingleUserMiddleware 把每个请求视为用户 felix/id=1）。下方分组为历史沿用划分。

### 公开接口

| 方法   | 路径                          | 说明             |
| ------ | ----------------------------- | ---------------- |
| GET    | /api/posts                    | 文章列表         |
| GET    | /api/posts/:slug              | 文章详情         |
| GET    | /api/posts/archive            | 归档列表         |
| GET    | /api/categories               | 分类列表         |
| GET    | /api/tags                     | 标签列表         |
| GET    | /api/posts/:slug/comments     | 评论列表（嵌套） |
| POST   | /api/posts/:slug/comments     | 发表评论         |
| GET    | /api/comments/:id/like        | 查询点赞状态     |
| POST   | /api/comments/:id/like        | 点赞/取消点赞    |
| DELETE | /api/comments/:id             | 删除评论         |

### 管理/数据接口

| 方法   | 路径                       | 说明               |
| ------ | -------------------------- | ------------------ |
| GET    | /api/user/profile          | 获取用户资料       |
| PUT    | /api/user/profile          | 更新用户资料       |
| GET    | /api/admin/posts           | 管理端文章列表     |
| POST   | /api/posts                 | 创建文章           |
| PUT    | /api/posts/:id             | 更新文章           |
| DELETE | /api/posts/:id             | 删除文章           |
| POST   | /api/categories            | 创建分类           |
| PUT    | /api/categories/:id        | 更新分类           |
| DELETE | /api/categories/:id        | 删除分类           |
| POST   | /api/upload                | 上传图片           |
| GET    | /api/gallery               | 照片墙列表         |
| DELETE | /api/gallery/:filename     | 删除照片           |
| GET    | /api/dashboard/summary     | 控制台统计摘要（含 learn_streak/review_due/study_minutes_today 学习字段与 habits_checked_today/habits_total 习惯字段） |
| GET    | /api/search?q=             | 全站搜索（文章/资产/习惯/分类/标签五类聚合；q 按 rune 计 1–50，越界 400；响应五键恒在，空为 []） |

### 投资接口

| 方法   | 路径                              | 说明                                       |
| ------ | --------------------------------- | ------------------------------------------ |
| GET    | /api/assets                       | 资产列表                                   |
| POST   | /api/assets                       | 创建资产（symbol/name/type/price_source/currency；type ∈ stock/etf/metal/fund/other，price_source ∈ yahoo/computed_gold_cny/manual/fund_cn；`fund_cn` 要求 symbol 为纯 6 位数字，服务端强制 `type=fund`、`currency=CNY`） |
| PUT    | /api/assets/:id                   | 更新资产名称                               |
| PUT    | /api/assets/reorder               | 拖拽排序持久化（body `{ids:[...]}`；ids 须与全部现存资产 id 集合严格一致——缺一/多一/重复均 400；事务内逐位写 sort_order=1..N） |
| DELETE | /api/assets/:id                   | 删除资产（有交易记录时 400）               |
| PUT    | /api/assets/:id/price             | 手动更新现价（manual 资产）                |
| GET    | /api/trades?asset_id=             | 交易流水（含资产联表，traded_at 倒序，上限 200） |
| POST   | /api/trades                       | 录入交易（超卖校验，超卖 400）             |
| DELETE | /api/trades/:id                   | 删除交易                                   |
| GET    | /api/positions                    | 持仓 + CNY 汇总（加权平均成本，实时推导；含 PE(TTM)） |
| GET    | /api/quotes?symbols=A,B           | 批量行情（Yahoo→Stooq→天天基金(仅 6 位基金码)→本地兜底降级）   |
| GET    | /api/price-history?symbol=&days=  | 单资产收盘价历史（days 默认 90，上限 365） |
| GET    | /api/positions/history?days=      | 组合价值曲线（市值/成本/盈亏，CNY 计价）   |

### 学习接口

| 方法   | 路径                          | 说明                                             |
| ------ | ----------------------------- | ------------------------------------------------ |
| GET    | /api/learn/profiles           | 语言阶段档案（仅返回已有行，缺失语言前端渲染空卡） |
| PUT    | /api/learn/profiles/:lang     | 更新阶段/目标/备注（upsert；lang 仅 en/es）        |
| POST   | /api/learn/sessions           | 记录一次学习（lang/activity/minutes/date?/note?）  |
| GET    | /api/learn/sessions?limit=    | 学习记录列表（session_date 倒序；limit 默认 100、clamp 1–200，非数字 400；返回 `sessions` + 全量 `total`） |
| DELETE | /api/learn/sessions/:id       | 删除一条学习记录（不存在返回 404）                 |
| GET    | /api/learn/stats              | 统计（streak/今日/本周/累计/分语言/近 28 天逐日）   |
| GET    | /api/learn/calendar?year=     | 年度打卡日历（仅返回有记录的日期；year 默认当年）   |

### 生活接口

| 方法   | 路径                          | 说明                                             |
| ------ | ----------------------------- | ------------------------------------------------ |
| GET    | /api/habits                   | 习惯列表（每行含 `checked_today` 当日打卡状态；`?all=1` 含归档） |
| POST   | /api/habits                   | 创建习惯（name 必填，icon/color 可选）             |
| PUT    | /api/habits/:id               | 更新习惯（合并语义：只改传入字段；支持 `archived` 归档） |
| DELETE | /api/habits/:id               | 删除习惯（级联删除其打卡记录；不存在返回 404）     |
| POST   | /api/habits/:id/check         | 打卡（body `date?` 缺省今天，幂等：重复打卡仍 200） |
| DELETE | /api/habits/:id/check         | 撤销打卡（body `date?` 缺省今天；当日无记录返回 404） |
| GET    | /api/habits/heatmap?year=     | 年度打卡热力图（仅返回有打卡的日期；year 默认当年，clamp 2000–2100） |

> 随手记无独立端点：复用 `POST /api/posts` + 分类 `slug=notes`（建表时自动种子），列表走公开接口 `GET /api/posts?category=notes`。

### 请求示例

**创建文章**
```bash
curl -X POST http://localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Hello World",
    "summary":"我的第一篇博客",
    "content":"# Hello World\n\n这是我的第一篇博客文章。",
    "tags":["Go","React"]
  }'
```

**文章列表（带筛选）**
```bash
# 分页
GET /api/posts?page=1&size=10

# 按分类筛选
GET /api/posts?category=tech

# 按标签筛选
GET /api/posts?tag=React

# 按时间筛选
GET /api/posts?year=2026&month=5
```

## 数据库设计

### users 表
```sql
id         BIGINT PK AUTO_INCREMENT
username   VARCHAR(50) UNIQUE NOT NULL
password   VARCHAR(255) NOT NULL  -- bcrypt 加密
nickname   VARCHAR(50)
avatar     VARCHAR(255)
bio        TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### categories 表
```sql
id         BIGINT PK AUTO_INCREMENT
name       VARCHAR(50) NOT NULL
slug       VARCHAR(50) UNIQUE NOT NULL
section    VARCHAR(20) NOT NULL DEFAULT 'blog'  -- invest/learn/fitness/life/blog
created_at TIMESTAMP
```

### posts 表
```sql
id          BIGINT PK AUTO_INCREMENT
title       VARCHAR(200) NOT NULL
slug        VARCHAR(255) UNIQUE NOT NULL
summary     TEXT
content     LONGTEXT NOT NULL
author_id   BIGINT FK -> users.id
category_id BIGINT FK -> categories.id (可空)
status      VARCHAR(20)  -- published / draft
view_count  INT DEFAULT 0
created_at  TIMESTAMP
updated_at  TIMESTAMP
```

### tags 表
```sql
id   BIGINT PK AUTO_INCREMENT
name VARCHAR(50) UNIQUE NOT NULL
```

### post_tags 表 (多对多)
```sql
post_id BIGINT FK -> posts.id
tag_id  BIGINT FK -> tags.id
PRIMARY KEY (post_id, tag_id)
```

### comments / comment_likes 表
```sql
-- comments：文章评论，支持嵌套回复
id         BIGINT PK AUTO_INCREMENT
post_id    BIGINT FK -> posts.id
parent_id  BIGINT (可空，回复的父评论)
name       VARCHAR(50)   -- 昵称
email      VARCHAR(255)  -- 评论者邮箱（点赞去重标识）
content    TEXT
like_count INT DEFAULT 0
created_at TIMESTAMP
updated_at TIMESTAMP

-- comment_likes：评论点赞（comment_id + email 唯一）
id         BIGINT PK AUTO_INCREMENT
comment_id BIGINT FK -> comments.id
email      VARCHAR(255)
created_at TIMESTAMP
```

### assets / trades / price_history 表（投资模块，阶段 2）
```sql
-- assets：资产（个股/ETF/场外中国基金/银行积存金/手动资产）
id               BIGINT PK AUTO_INCREMENT
symbol           VARCHAR(32) UNIQUE NOT NULL   -- 如 AAPL / 600519.SS；积存金固定 GOLD_CNY_G；中国基金为纯 6 位数字（如 110022）
name             VARCHAR(100) NOT NULL
type             VARCHAR(16)  -- stock / etf / metal / fund / other
price_source     VARCHAR(32)  -- yahoo / computed_gold_cny / manual / fund_cn
currency         VARCHAR(8)   -- USD / CNY（fund_cn 强制 CNY）
current_price    DECIMAL(18,4) (可空，行情兜底价)
price_updated_at DATETIME (可空)
created_at       TIMESTAMP
updated_at       TIMESTAMP

-- trades：交易流水（持仓不落表，由 trades 实时推导）
id         BIGINT PK AUTO_INCREMENT
asset_id   BIGINT FK -> assets.id
side       VARCHAR(8)   -- buy / sell
quantity   DECIMAL(18,6) NOT NULL
price      DECIMAL(18,4) NOT NULL   -- 成交价（历史事实，与行情价分离）
fee        DECIMAL(12,2) DEFAULT 0
traded_at  DATE NOT NULL
note       TEXT
created_at TIMESTAMP

-- price_history：每日收盘价快照（symbol + date 唯一）
id     BIGINT PK AUTO_INCREMENT
symbol VARCHAR(32) NOT NULL
date   DATE NOT NULL
close  DECIMAL(18,4) NOT NULL
UNIQUE KEY uk_symbol_date (symbol, date)
```

### language_profiles / study_sessions 表（学习模块，阶段 3）
```sql
-- language_profiles：语言阶段档案（lang 唯一，可空列查询侧 IFNULL 兜底）
id         BIGINT PK AUTO_INCREMENT
lang       VARCHAR(8) UNIQUE NOT NULL   -- en / es
level      VARCHAR(50) NOT NULL DEFAULT ''   -- 自评阶段，如「中级 B1」
goal       TEXT (可空)                  -- 学习目标
note       TEXT (可空)                  -- 备注（在用什么软件学）
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

-- study_sessions：学习记录（一天可多条；打卡=当日存在记录的派生概念，不落表）
id           BIGINT PK AUTO_INCREMENT
lang         VARCHAR(8) NOT NULL        -- en / es
activity     VARCHAR(20) NOT NULL DEFAULT 'other'  -- vocab/listening/speaking/reading/grammar/other
minutes      INT NOT NULL DEFAULT 0     -- 学习分钟数（0=纯打卡）
session_date DATE NOT NULL              -- 学习日期（「今天」一律 Go 本地日期传参，不用 CURDATE()）
note         VARCHAR(200) (可空)
created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
KEY idx_session_date (session_date)
KEY idx_lang_date (lang, session_date)
```

### habits / habit_logs 表（生活模块，阶段 4）
```sql
-- habits：习惯定义（icon/color 可空，查询侧 IFNULL 兜底）
id         BIGINT PK AUTO_INCREMENT
name       VARCHAR(50) NOT NULL
icon       VARCHAR(16) (可空)      -- emoji 图标
color      VARCHAR(16) (可空)      -- 主题色
archived   BOOLEAN NOT NULL DEFAULT FALSE   -- 归档（软隐藏，历史打卡保留）
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

-- habit_logs：打卡记录（一天一习惯一行，复合主键天然幂等，INSERT IGNORE 打卡）
habit_id BIGINT NOT NULL
log_date DATE NOT NULL            -- 打卡日期（「今天」一律 Go 本地日期传参，不用 CURDATE()）
PRIMARY KEY (habit_id, log_date)
```

> 随手记不落新表：复用 `posts` 表 + `categories` 中 `slug=notes` 的种子分类（建表时 `INSERT IGNORE` 写入，section=life）。

## 功能特性

- **三语界面（中/英/西）**：全站文案 i18n（react-i18next），默认英文；顶栏 Globe 下拉即时切换（无需刷新），localStorage（`ui-lang`）持久化 + 跨标签页同步；三语键集合一致性由 `frontend/scripts/check-i18n.mjs` 自检
- **控制台 Dashboard**：统计卡（投资组合/今日学习分钟数/习惯/文章/评论/照片）+ 近 30 天收益曲线 + 习惯近 16 周迷你热力图
- **⌘K 全站搜索**：命令面板（⌘K/Ctrl+K）服务端聚合搜索文章/资产/习惯/分类/标签五类 + 导航快速跳转；q 限 1–50 字符，输入 250ms 防抖
- **管理后台**：顶部 AdminNav 横向导航串起总览（六路统计卡聚合）/文章/分类/学习记录（逐条删除）/习惯（含归档切换）/资料（昵称/头像/简介）六页
- **投资组合**：资产/交易流水/加权平均成本持仓盈亏（CNY 汇总，美元资产按实时汇率折算）；银行积存金按 `GC=F ÷ 31.1035 × USDCNY` 换算克价；持仓表支持按资产类型筛选（全部/股票/ETF/基金/黄金/其他，仅过滤持仓行，汇总卡与曲线保持全局口径）
- **持仓拖拽排序 + 列排序**：自定义顺序持久化到 `assets.sort_order`（HTML5 原生拖拽，乐观更新失败自动回滚；仅「全部」筛选且未列排序时可拖）；7 个数值列列头三态排序（不排序→降序→升序，null 恒沉底、并列保持自定义序）
- **总资产 ¥/$ 币种切换**：投资页总资产/总盈亏/今日盈亏三卡一键切换人民币/美元显示（按后端汇总同一汇率折算，localStorage 持久 + 跨标签同步），Dashboard 投资组合卡自动跟随；汇率不可用时禁用切换并强制回落 ¥；持仓表行级保持资产原币不动
- **行情降级链**：Yahoo → Stooq → 天天基金（仅 6 位基金码）→ 本地兜底价（标记 stale），页面永不因行情失败而不可用；Redis 缓存 60 秒
- **场外中国基金**：6 位纯数字基金代码（如 `110022`），净值源为天天基金/东方财富——盘中取估值 `GSZ`（官方净值作前收，日涨跌有语义）、收盘后取官方净值 `NAV`；历史净值走 `f10/lsjz`（需 Referer，单页 20 行分页拉取）；服务端强制 `type=fund`/`currency=CNY`，纳入每日快照与一年历史回填；Yahoo/Stooq 对裸 6 位码零成本跳过，不发无效外网请求
- **PE(TTM) 与 A 股**：持仓含 PE(TTM)（Yahoo 基本面，1h 缓存，失败恒 null 不阻塞；manual/积存金/中国基金不请求 PE，基金无市盈率概念）；支持 A 股（.SS/.SZ 后缀，CNY 计价）
- **每日快照**：robfig/cron 每日 06:00（北京时间）快照自动跟踪资产（Yahoo/积存金/中国基金）价格，启动时补跑漏掉的快照；创建自动跟踪资产时异步回填一年历史；收益曲线由快照收盘价 + 交易流水推导
- **学习模块**：英语/西班牙语阶段档案（自评阶段/目标/备注，随时编辑）；按活动类型（背单词/听力/口语/阅读/语法/其他）记录学习时长；统计五件套（连续天数 streak/今日/本周/累计/分语言）+ 近 28 天柱状图 + 年度打卡日历；快速打卡（0 分钟记录标记「今天学过」）
- **习惯打卡**：习惯 CRUD + 归档；年度打卡热力图（GitHub 风，仅渲染有记录的日期）；当日打卡状态由服务端驱动（列表行级 `checked_today` 字段，前端不做本地推导）；Dashboard 复用近 16 周 compact 热力缩略
- **随手记**：生活页轻量输入框，复用博客 `posts` 表 + `notes` 种子分类（自动建、可跳转分类页查看更多）；种子分类被删时优雅降级为禁用 + 提示
- **文章管理**：Markdown 编辑器（图片上传 + 预览），草稿/发布状态
- **分类系统**：文章可按分类浏览，分类带 `section` 字段归属板块（白名单 invest/learn/fitness/life/blog，越界值回退 blog；fitness 为已取消健身板块的遗留枚举值，仍可作普通博客分类使用）
- **标签系统**：文章可打多个标签，支持按标签筛选
- **时间归档**：按年月分组展示文章归档
- **评论系统**：嵌套回复 + 点赞；评论删除凭邮箱匹配门控（与站点认证无关）：查询评论时带 `email` 参数、与评论邮箱匹配才置 `can_delete` 显示删除入口，DELETE 端点侧再强制校验 body `email`（不匹配 403）
- **照片墙**：生活页图库——保留原图比例的瀑布流（CSS columns，加载渐显 + 骨架占位），悬停渐变信息浮层（日期/大小/文件名，键盘聚焦亦可见），删除走 AlertDialog 二次确认；灯箱放大浏览（大图加载态 + 键盘导航 + 循环切换），单用户上传即传即显
- **浏览量统计**：每次访问文章自动增加浏览量
- **Redis 缓存**：文章列表、分类、标签数据缓存 5-30 分钟
- **无登录直入**：单用户本地部署，打开即用（2026-09-13 移除登录/注册，后端 SingleUserMiddleware 将所有请求视为 felix/id=1；公网部署前必须恢复认证，见「安全注意」）
- **深浅色主题**：仪表盘风 UI，支持明暗切换；移动端底部 Tab 导航
- **冒烟测试**：Playwright 脚本十步链路（无需凭据）：直达 Dashboard（无登录）→ 博客 → 管理后台 → 管理总览 → 全站搜索 → 生活页 → 评论发删 → 投资链路（建资产/录交易/持仓校验/清理）→ 学习链路（记录时长/统计校验/页面断言/清理）→ 习惯链路（建习惯/打卡/热力图含今天/页面断言/清理）

## 环境变量配置

> 注意：当前代码不自动加载 `.env`（`config.go` 纯 `os.Getenv`）。需通过 docker-compose `environment`、启动前 `export` 等方式注入环境变量；未注入时使用下表默认值。

变量清单参考 `backend/.env.example`（注意：当前代码不自动加载 `.env`，需以环境变量方式注入）：

| 变量         | 默认值              | 说明               |
| ------------ | ------------------- | ------------------ |
| DB_HOST      | 127.0.0.1           | MySQL 地址         |
| DB_PORT      | 3306                | MySQL 端口         |
| DB_USER      | root                | MySQL 用户名       |
| DB_PASSWORD  | 123456              | MySQL 密码         |
| DB_NAME      | blog                | 数据库名           |
| REDIS_ADDR   | 127.0.0.1:6379      | Redis 地址         |
| REDIS_PASS   | (空)                | Redis 密码         |
| JWT_SECRET   | change-me-in...     | JWT 密钥（当前无认证未消费，仅 pkg/jwt.go 恢复认证时使用；届时务必修改） |
| PORT         | 8080                | 后端端口           |
| QUOTE_PROXY  | http://127.0.0.1:7890 | 行情上游 HTTP 代理（Yahoo/Stooq/天天基金/汇率，全 provider 共用同一 client）；未设置或置空时使用该默认值（quote 子系统内部支持空代理直连，但 `envOr` 会把空值替换为默认） |

## 部署建议

### 后端编译

```bash
cd backend
CGO_ENABLED=0 GOOS=linux go build -o blog cmd/*.go
```

### 前端编译

```bash
cd frontend
npm run build
# 产物在 frontend/dist/
```

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 代理到后端
    location /api {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 注意事项

1. **单用户系统（无认证）**：登录/注册接口均已移除（2026-09-13），后端将所有请求视为首个用户（felix，id=1，建表时自动种子，密码为不可登录的占位 bcrypt hash）；第一个用户即为管理员
2. **JWT_SECRET**：当前无认证未消费；恢复认证时（见「安全注意」）务必改为长随机字符串
3. **MySQL 字符集**：确保使用 utf8mb4 以支持 emoji 等特殊字符
4. **Redis 缓存**：文章更新/删除时会自动清除相关缓存
5. **UI 语言**：三语界面（中/英/西，react-i18next），默认英文；顶栏切换即时生效，localStorage `ui-lang` 持久化并跨标签同步。后端错误消息仍为中文原样透传（错误码 i18n 方案见 `BACKLOG.md`）

## 安全注意

- **本站当前无任何认证**（2026-09-13 用户决定：单用户本地部署，`SingleUserMiddleware` 对所有请求直通注入 `users.id=1`）。
- **LAN 暴露面**：后端监听所有网卡（`*:8080`），无认证、无 IP 白名单——**同网段任何设备可直接读写全部数据（含持仓/交易流水等财务数据）**，并可删改文章/学习记录/习惯。
- **缓解**：仅在本地或完全可信的局域网使用；不做端口映射、内网穿透或公网反代。
- **公网/上云部署前必须恢复认证**：`pkg/jwt.go` 保留为基座，`middleware/auth.go` 的 git 历史有完整 JWT 实现（恢复路径见 `BACKLOG.md` 置顶项与 spec §8 裁决清单）；felix 种子密码为占位 hash，恢复认证后须先改密。
- 前端金额遮蔽（`lib/mask.ts`）是**防窥隐私而非安全边界**——只隐藏页面数字，API 仍明文返回全量数据。
