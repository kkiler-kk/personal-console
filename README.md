# KK 控制台（个人博客系统）

单用户的个人控制台网站：以工具为主、文章次要。前端使用 React（TypeScript），后端使用 Go，数据库使用 MySQL，缓存使用 Redis。现有博客功能（文章/分类/标签/归档/评论/照片墙）已全部迁移至新 UI，其余板块按分期逐步上线。

## 板块

| 板块     | 定位                                     | 进度                                   |
| -------- | ---------------------------------------- | -------------------------------------- |
| 📈 投资 | 美股个股、ETF、银行积存金的持仓与盈亏跟踪 | 阶段 2 上线                            |
| 🗣️ 学习 | 英语/西班牙语生词本 + 间隔重复复习（SRS） | 阶段 3 上线                            |
| 💪 健身 | 训练日志、身体数据曲线、打卡日历          | 阶段 4 上线                            |
| 🌱 生活 | 习惯打卡热力图、随手记、照片墙            | 照片墙已上线（阶段 1），完整版见阶段 5 |
| ✍️ 博客 | 文章/分类/标签/归档/评论系统              | 已完成（阶段 1）                       |

分期进度：阶段 0（仓库初始化 + 隐私清理）、阶段 1（控制台壳 + 博客/图库/评论/登录功能等价迁移）已完成；阶段 2-5 详见 `docs/superpowers/specs/2026-09-12-personal-site-redesign-design.md`。

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
| 数据库   | MySQL 8.0                | 数据持久化                 |
| ORM      | sqlx                     | 轻量级 SQL 操作            |
| 缓存     | Redis 7                  | 列表/分类/标签缓存         |
| 认证     | JWT (golang-jwt)         | 无状态认证（注册接口已下线，单用户） |
| 密码     | bcrypt                   | 密码加密                   |

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
│   │   ├── user.go             # 登录/资料
│   │   ├── post.go             # 文章 CRUD + 归档
│   │   ├── category.go         # 分类 + 标签
│   │   ├── comment.go          # 评论（嵌套回复 + 点赞）
│   │   ├── dashboard.go        # 控制台统计摘要
│   │   ├── upload.go           # 图片上传
│   │   └── gallery.go          # 照片墙（读取 uploads 目录）
│   ├── middleware/
│   │   └── auth.go             # JWT 认证中间件
│   ├── model/
│   │   └── model.go            # 数据模型
│   ├── pkg/
│   │   └── jwt.go              # JWT 工具
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
    │   └── smoke.mjs           # Playwright 冒烟测试
    └── src/
        ├── main.tsx            # 入口
        ├── App.tsx             # 路由
        ├── index.css           # 设计 token + 全局样式（Tailwind v4）
        ├── components/
        │   ├── ui/             # shadcn/ui 基础组件
        │   ├── layout/         # 侧边栏/顶栏/移动端 Tab/命令面板
        │   └── blog/           # 文章卡片/评论区/Markdown/分页
        ├── context/
        │   ├── AuthContext.tsx # 认证状态
        │   └── ThemeContext.tsx # 深浅色主题
        ├── lib/
        │   ├── api.ts          # fetch 封装（token 注入 + 401 处理）
        │   ├── types.ts        # 共享类型
        │   └── format.ts       # 格式化工具
        └── pages/
            ├── Dashboard.tsx   # 首页仪表盘（统计卡 + 图表）
            ├── Login.tsx       # 登录
            ├── blog/           # 文章列表/详情/归档/分类/标签
            ├── admin/          # 文章管理/分类管理/编辑器
            └── life/           # 生活页（照片墙）
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

前端会在 `http://localhost:3000` 启动，API 请求会自动代理到后端。

### 4. 冒烟测试（可选）

全栈跑起来后执行：`SMOKE_USER=<用户名> SMOKE_PASS=<密码> node frontend/scripts/smoke.mjs`，六步链路全过输出 `SMOKE PASS ✅`。

## API 文档

### 公开接口

| 方法   | 路径                          | 说明             |
| ------ | ----------------------------- | ---------------- |
| POST   | /api/auth/login               | 用户登录         |
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

### 需认证接口 (Bearer Token)

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
| GET    | /api/dashboard/summary     | 控制台统计摘要     |

### 请求示例

**登录**
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

**创建文章**
```bash
curl -X POST http://localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
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
section    VARCHAR(20) DEFAULT 'blog'  -- invest/learn/fitness/life/blog
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

## 功能特性

- **控制台 Dashboard**：统计卡（文章/分类/评论/照片）+ 发布趋势图表
- **文章管理**：Markdown 编辑器（图片上传 + 预览），草稿/发布状态
- **分类系统**：文章可按分类浏览，分类带 `section` 字段归属五大板块
- **标签系统**：文章可打多个标签，支持按标签筛选
- **时间归档**：按年月分组展示文章归档
- **评论系统**：嵌套回复 + 点赞，管理端可删除
- **照片墙**：生活页图库，管理端上传/删除
- **浏览量统计**：每次访问文章自动增加浏览量
- **Redis 缓存**：文章列表、分类、标签数据缓存 5-30 分钟
- **JWT 认证**：登录签发 Token，有效期 72 小时（注册已下线，单用户）
- **深浅色主题**：仪表盘风 UI，支持明暗切换；移动端底部 Tab 导航
- **冒烟测试**：Playwright 脚本覆盖登录 → Dashboard → 博客 → 管理后台 → 生活页链路

## 环境变量配置

复制 `backend/.env.example` 为 `backend/.env` 后修改：

| 变量         | 默认值              | 说明               |
| ------------ | ------------------- | ------------------ |
| DB_HOST      | 127.0.0.1           | MySQL 地址         |
| DB_PORT      | 3306                | MySQL 端口         |
| DB_USER      | root                | MySQL 用户名       |
| DB_PASSWORD  | 123456              | MySQL 密码         |
| DB_NAME      | blog                | 数据库名           |
| REDIS_ADDR   | 127.0.0.1:6379      | Redis 地址         |
| REDIS_PASS   | (空)                | Redis 密码         |
| JWT_SECRET   | change-me-in...     | JWT 密钥 (务必修改) |
| PORT         | 8080                | 后端端口           |

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

1. **单用户系统**：注册接口已下线，账号直接在数据库中创建；第一个用户即为管理员
2. **JWT_SECRET**：生产环境务必修改为长随机字符串
3. **MySQL 字符集**：确保使用 utf8mb4 以支持 emoji 等特殊字符
4. **Redis 缓存**：文章更新/删除时会自动清除相关缓存
5. **UI 语言**：前端仅提供中文界面（无 i18n）
