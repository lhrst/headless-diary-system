# Headless Diary System

自托管、API-first 的日记系统，支持 AI 自动标题/标签、多媒体处理、双向引用，前后端完全解耦。

## 系统架构

```
                     ┌──────────┐
                     │  Nginx   │ :80/:443
                     │ 反向代理  │
                     └────┬─────┘
                    ┌─────┴──────┐
              ┌─────┴──┐   ┌────┴─────┐
              │ Next.js │   │ FastAPI  │
              │  :3000  │   │  :8000   │
              │  前端    │   │  后端    │
              └────────┘   └────┬─────┘
                          ┌────┴─────┐
                    ┌─────┴──┐  ┌────┴─────┐
                    │Postgres│  │  Redis    │
                    │ :5432  │  │  :6379   │
                    └────────┘  └────┬─────┘
                                ┌────┴─────┐
                                │  Celery  │
                                │  Worker  │
                                └──────────┘
```

---

## 目录结构总览

```
headless-diary-system/
├── api/                    # 后端 — FastAPI + Celery
├── web/                    # 前端 — Next.js 15
├── nginx/                  # 反向代理配置
├── data/                   # 运行时数据卷（git 忽略）
├── tests/                  # E2E 测试
├── docker-compose.yml      # 生产部署
├── docker-compose.dev.yml  # 开发覆盖
├── Makefile                # 常用命令快捷方式
├── .env.example            # 环境变量模板
└── README.md               # 本文件
```

---

## 后端 `api/`

### 技术栈
- **Python 3.12** + **FastAPI**（异步）
- **SQLAlchemy 2.0**（async ORM）+ **Alembic**（迁移）
- **Celery** + **Redis**（异步任务队列）
- **PostgreSQL 16**（`pg_trgm` 模糊搜索 + `tsvector` 全文搜索）
- **OpenRouter API**（Claude 模型，标题生成/Agent/图片描述）
- **faster-whisper**（本地音频转写）

### 目录结构

```
api/
├── app/
│   ├── main.py              # FastAPI 应用入口，注册路由和中间件
│   ├── config.py            # Pydantic Settings，从环境变量读取所有配置
│   ├── database.py          # 异步 SQLAlchemy 引擎和 Session 工厂
│   │
│   ├── models/              # ORM 模型（数据库表结构）
│   │   ├── user.py          #   用户表：id, username, email, hashed_password
│   │   ├── diary.py         #   日记表：标题、内容路径、原文、地理/天气、时间戳
│   │   ├── tag.py           #   标签表：name, color, 层级关系(parent)
│   │   ├── reference.py     #   引用表：source_id → target_id 双向链接
│   │   ├── comment.py       #   评论表：author_role='user'|'agent'
│   │   ├── agent_task.py    #   Agent任务表：command, status, result
│   │   └── media.py         #   媒体表：file_path, media_type, media_text
│   │
│   ├── schemas/             # Pydantic 请求/响应模型（API 数据校验）
│   │   ├── user.py          #   UserCreate, UserResponse
│   │   ├── diary.py         #   DiaryCreate, DiaryUpdate, DiaryResponse
│   │   ├── tag.py           #   TagCreate, TagResponse
│   │   ├── comment.py       #   CommentCreate, CommentResponse
│   │   ├── agent.py         #   AgentTaskCreate, AgentTaskResponse
│   │   └── media.py         #   MediaResponse, MediaUploadResponse
│   │
│   ├── routers/             # API 路由处理器（HTTP 端点）
│   │   ├── auth.py          #   POST /auth/register, /login, /refresh, GET /me
│   │   ├── diary.py         #   CRUD /diary, 搜索, 分页, 标签过滤, suggest
│   │   ├── tag.py           #   GET /tags, /tags/tree, /tags/suggest, 层级管理
│   │   ├── comment.py       #   POST/GET /diary/{id}/comments
│   │   ├── agent.py         #   Agent 任务列表, 详情, 分发, 重试
│   │   └── media.py         #   上传, 下载, 缩略图, 信息, 重新描述
│   │
│   ├── services/            # 业务逻辑层（被路由调用）
│   │   ├── diary_service.py #   日记创建/更新：解析 #tag [[ref]] @agent，保存 .md
│   │   ├── tag_service.py   #   标签 CRUD、层级管理、搜索
│   │   ├── reference_service.py # 双向引用查询
│   │   ├── title_service.py #   AI 自动标题生成（Claude Haiku）
│   │   └── agent_service.py #   Agent 上下文构建 + 命令执行
│   │
│   ├── tasks/               # Celery 异步任务（后台执行）
│   │   ├── title_tasks.py   #   generate_title() — 自动生成日记标题
│   │   ├── agent_tasks.py   #   execute_agent_command() — 执行 @agent 命令
│   │   └── caption_tasks.py #   图片描述(Vision)、音频转写(Whisper)、视频处理
│   │
│   ├── utils/               # 工具函数
│   │   ├── markdown.py      #   Markdown 解析器：提取 #tag [[ref]] @agent media://
│   │   ├── file_storage.py  #   .md 文件的读写删（磁盘存储）
│   │   ├── media_storage.py #   媒体文件处理：HEIC→WebP, 缩略图, 音视频存储
│   │   └── geo_weather.py   #   经纬度 → 地址 + 天气（反向地理编码）
│   │
│   └── middleware/
│       └── auth.py          #   JWT Token 验证中间件
│
├── alembic/                 # 数据库迁移
│   └── versions/
│       ├── 001_initial_schema.py    # 初始表结构
│       ├── 002_add_geo_weather.py   # 地理/天气字段
│       └── 003_add_tag_hierarchy.py # 标签层级
│
├── tests/                   # 单元/集成测试
│   ├── conftest.py          #   测试 fixtures（数据库、客户端）
│   ├── test_diary.py        #   日记 CRUD、标签解析、搜索
│   └── test_tags.py         #   标签创建、自动补全
│
├── Dockerfile               # 生产镜像
├── Dockerfile.dev           # 开发镜像（热重载）
├── alembic.ini              # Alembic 配置
└── pyproject.toml           # Python 包定义
```

### 核心数据流

```
用户写日记 → 解析 #标签 [[引用]] @agent 命令
           → 保存 .md 文件到磁盘
           → 存储原文到 PostgreSQL（用于搜索）
           → 创建/更新标签和引用关系
           → 异步分发 Celery 任务（标题生成、Agent 执行）

用户上传媒体 → 存储文件 + 生成缩略图
             → 异步分发描述任务（图片 Vision / 音频 Whisper）
             → 更新 media_text 供搜索
```

### 认证流程

1. `POST /api/v1/auth/register` — 注册
2. `POST /api/v1/auth/login` — 获取 JWT（access 30min + refresh 7d）
3. `POST /api/v1/auth/refresh` — 刷新 access token
4. 其他接口需 `Authorization: Bearer <token>`

---

## 前端 `web/`

### 技术栈
- **Next.js 15**（App Router, TypeScript）
- **React 19** + **TipTap v2**（富文本编辑器）
- **Tailwind CSS 3**（CSS 变量主题系统）
- **DM Sans + Lora + Noto Sans/Serif SC**（字体）

### 目录结构

```
web/src/
├── app/                         # Next.js 页面路由
│   ├── layout.tsx               #   根布局：字体加载、主题切换
│   ├── globals.css              #   全局样式：动画、组件类、Markdown 排版
│   ├── page.tsx                 #   首页：日记列表 + 快捷发布（乐观更新）
│   ├── login/page.tsx           #   登录页
│   ├── register/page.tsx        #   注册页
│   ├── settings/page.tsx        #   设置页：主题切换
│   ├── diary/
│   │   ├── new/page.tsx         #   新建日记：TipTap 编辑器
│   │   ├── [id]/page.tsx        #   日记详情：Markdown 渲染、标签、引用、评论
│   │   └── [id]/edit/page.tsx   #   编辑日记
│   └── tags/
│       ├── page.tsx             #   标签管理：树形视图 / 云图视图
│       └── [tag]/page.tsx       #   按标签筛选日记
│
├── components/                  # 可复用组件
│   ├── Navbar.tsx               #   顶部导航栏（毛玻璃效果、搜索、图标按钮）
│   ├── DiaryCard.tsx            #   日记卡片（相对时间、标签、天气、入场动画）
│   ├── Editor.tsx               #   TipTap 编辑器（工具栏、#tag 补全、拖拽上传）
│   ├── CommentThread.tsx        #   评论列表 + 发送（用户/AI 区分）
│   ├── AgentStatus.tsx          #   AI 任务状态（等待/运行/完成/失败）
│   ├── ThemeSwitcher.tsx        #   主题选择器
│   ├── TagSuggest.tsx           #   标签自动补全弹窗
│   ├── DiarySuggest.tsx         #   日记引用自动补全弹窗
│   └── media/
│       ├── MediaEmbed.tsx       #   媒体分发器（按类型渲染）
│       ├── PhotoEmbed.tsx       #   图片展示 + OCR 文字
│       ├── AudioEmbed.tsx       #   音频播放 + 转写文字
│       ├── VideoEmbed.tsx       #   视频播放 + 画面描述 + 转写
│       └── MediaTextBadge.tsx   #   媒体处理状态指示器
│
├── lib/                         # 共享逻辑
│   ├── api.ts                   #   HTTP 客户端：fetch 封装、自动刷新 token
│   ├── types.ts                 #   TypeScript 类型定义（所有 API 响应）
│   ├── auth.ts                  #   localStorage token 管理
│   └── useAuth.ts               #   认证 Hook：mounted 状态 + 重定向
│
└── themes/                      # CSS 变量主题
    ├── default.css              #   奶油白主题（暖色调 cream + terracotta）
    └── journal.css              #   手帐棕主题（复古质感）
```

### 设计特点

- **暖色低饱和度配色** — 奶油底色 `#FAF7F4` + 陶土强调色 `#B87351`
- **衬线+无衬线字体搭配** — Lora（日记标题）+ DM Sans（界面文字）
- **微动效** — 卡片 fadeInUp 入场、hover 上浮、骨架屏加载、标签弹性缩放
- **乐观更新** — 发布日记后立即显示占位卡片，标题在后台异步生成
- **可收起编辑器** — 首页编辑器默认收起，点击展开

---

## Nginx `nginx/`

```
nginx/
├── nginx.conf    # 反向代理配置
│                 #   /api/   → FastAPI :8000
│                 #   /       → Next.js :3000
│                 #   /health → 健康检查
│                 #   /ws/    → WebSocket（预留）
│                 #   client_max_body_size 500M（媒体上传）
└── ssl/          # SSL 证书目录（Let's Encrypt）
```

---

## 数据卷 `data/`（git 忽略）

```
data/
├── postgres/     # PostgreSQL 数据文件
├── redis/        # Redis 持久化数据
├── diaries/      # .md 日记文件（磁盘存储）
└── media/        # 上传的图片/音频/视频 + 缩略图
```

---

## E2E 测试 `tests/`

```
tests/e2e/
├── test_e2e.py          # Playwright E2E 基础流程（注册、截图）
├── test_e2e_v2.py       # 完整流程（注册→发日记→查看详情）
└── test_autocomplete.py # TipTap 自动补全测试（#tag [[ref]] @agent）
```

后端单元测试在 `api/tests/`。

---

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 说明 |
|------|------|
| `POSTGRES_PASSWORD` | 数据库密码 |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `REDIS_URL` | Redis 连接串 |
| `JWT_SECRET` | JWT 签名密钥（随机 64 字符） |
| `OPENROUTER_API_KEY` | OpenRouter API Key（AI 功能） |
| `DIARY_STORAGE_PATH` | 日记 .md 文件存储路径 |
| `MEDIA_STORAGE_PATH` | 媒体文件存储路径 |
| `WHISPER_MODEL_SIZE` | Whisper 模型大小（tiny/base/small/medium） |
| `NEXT_PUBLIC_API_URL` | 前端访问的 API 地址 |

---

## 快速开始

### 开发环境

```bash
cp .env.example .env     # 编辑 .env 填写配置
make dev                 # 启动所有服务（开发模式，热重载）
make migrate             # 运行数据库迁移
```

访问 http://localhost:3000（前端）或 http://localhost:8000/docs（API 文档）

### 生产部署

```bash
make prod                # 构建并启动所有服务
make migrate             # 运行数据库迁移
```

### 常用命令

```bash
make dev              # 开发模式启动
make prod             # 生产模式启动
make stop             # 停止所有服务
make logs             # 查看所有日志
make logs-api         # 查看后端+Celery 日志
make migrate          # 运行数据库迁移
make migration msg=x  # 创建新迁移
make test             # 运行后端测试
make backup           # 完整备份 data/
make backup-light     # 轻量备份（数据库+日记文件）
```

---

## 部署到国内服务器

详见 [docs/deploy-china.md](docs/deploy-china.md)。
