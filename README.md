# 个人博客系统

一个简洁的个人博客系统，前端使用 React，后端使用 Go，数据库使用 MySQL，缓存使用 Redis。

## 技术栈

| 层级     | 技术                     | 说明                  |
| -------- | ------------------------ | --------------------- |
| 前端     | React 18 + Vite          | SPA 单页应用          |
| 路由     | React Router v6          | 前端路由              |
| Markdown | react-markdown           | 博客内容 Markdown 渲染 |
| 后端     | Go 1.22 + Gin            | RESTful API           |
| 数据库   | MySQL 8.0                | 数据持久化            |
| ORM      | sqlx                     | 轻量级 SQL 操作       |
| 缓存     | Redis 7                  | 列表/分类/标签缓存    |
| 认证     | JWT (golang-jwt)         | 无状态认证            |
| 密码     | bcrypt                   | 密码加密              |

## 项目结构

```
blogs/
├── docker-compose.yml          # MySQL + Redis 快速启动
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
│   │   ├── user.go             # 用户相关 (注册/登录/资料)
│   │   ├── post.go             # 文章 CRUD + 归档
│   │   └── category.go         # 分类 + 标签
│   ├── middleware/
│   │   └── auth.go             # JWT 认证中间件
│   ├── model/
│   │   └── model.go            # 数据模型
│   ├── pkg/
│   │   └── jwt.go              # JWT 工具
│   ├── router/
│   │   └── router.go           # 路由配置
│   └── .env.example            # 环境变量示例
└── frontend/                   # React 前端
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx             # 入口
        ├── App.jsx              # 路由 + 布局
        ├── styles/
        │   └── index.css        # 全局样式
        ├── services/
        │   └── api.js           # API 封装
        ├── context/
        │   └── AuthContext.jsx  # 认证状态管理
        └── pages/
            ├── Home.jsx         # 首页 - 文章列表
            ├── PostDetail.jsx   # 文章详情
            ├── Archive.jsx      # 归档页
            ├── CategoryPosts.jsx # 分类文章
            ├── TagPosts.jsx     # 标签文章
            ├── Login.jsx        # 登录/注册
            └── Admin.jsx        # 管理后台
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

## API 文档

### 公开接口

| 方法   | 路径                    | 说明             |
| ------ | ----------------------- | ---------------- |
| POST   | /api/auth/register      | 用户注册         |
| POST   | /api/auth/login         | 用户登录         |
| GET    | /api/posts              | 文章列表         |
| GET    | /api/posts/:slug        | 文章详情         |
| GET    | /api/posts/archive      | 归档列表         |
| GET    | /api/categories         | 分类列表         |
| GET    | /api/tags               | 标签列表         |

### 需认证接口 (Bearer Token)

| 方法   | 路径                    | 说明             |
| ------ | ----------------------- | ---------------- |
| GET    | /api/user/profile       | 获取用户资料     |
| PUT    | /api/user/profile       | 更新用户资料     |
| GET    | /api/admin/posts        | 管理端文章列表   |
| POST   | /api/posts              | 创建文章         |
| PUT    | /api/posts/:id          | 更新文章         |
| DELETE | /api/posts/:id          | 删除文章         |
| POST   | /api/categories         | 创建分类         |
| PUT    | /api/categories/:id     | 更新分类         |
| DELETE | /api/categories/:id     | 删除分类         |

### 请求示例

**注册**
```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456","nickname":"博主"}'
```

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

## 功能特性

- **文章管理**：支持创建、编辑、删除文章，支持草稿/发布状态
- **分类系统**：文章可按分类浏览，每个分类有唯一 slug
- **标签系统**：文章可打多个标签，支持按标签筛选
- **时间归档**：按年月分组展示文章归档
- **浏览量统计**：每次访问文章自动增加浏览量
- **Redis 缓存**：文章列表、分类、标签数据缓存 5-30 分钟
- **JWT 认证**：注册/登录，Token 有效期 72 小时
- **密码安全**：bcrypt 加密存储
- **Markdown 支持**：文章内容使用 Markdown 编写，前端渲染显示
- **响应式布局**：支持手机和桌面端

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

1. **首次使用**：先通过前端注册页面创建管理员账号
2. **JWT_SECRET**：生产环境务必修改为长随机字符串
3. **MySQL 字符集**：确保使用 utf8mb4 以支持 emoji 等特殊字符
4. **Redis 缓存**：文章更新/删除时会自动清除相关缓存
5. **第一个用户**：注册的第一个用户即为管理员，拥有所有权限
