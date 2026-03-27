# CLAUDE.md

## 项目概况

「革命启示录」— 自托管的 headless 日记系统，前后端分离。详见 `README.md`。

## 开始前必读

- **`docs/changelog-2026-03-26.md`** — 最近一次大改动的完整记录，包含所有改过的文件和原因
- **`docs/plan-agent-system.md`** — Agent 自改进系统的设计方案（待实现）
- **`docs/deploy-china.md`** — 国内服务器部署指南

## 部署流程

### 快速部署命令

| 命令 | 用途 | 场景 |
|------|------|------|
| `make deploy` | 只构建 web 镜像，重启 web+nginx | **前端改动**（最常用） |
| `make deploy-api` | 只构建 api 镜像，重启 api+celery+nginx | **后端改动** |
| `make deploy-all` | 重建所有镜像，全部重启 | **全量部署** |

所有命令自动完成：rsync 同步 → Docker 构建 → 重启服务 → 验证环境变量。

远程项目目录：`/home/lhrst/projects/diary/`

### 部署后必须测试

部署完成后用 curl 或 Playwright 验证改动生效。常见检查：
- `curl -s -o /dev/null -w "%{http_code}" http://8.145.43.198/` — 首页 200
- `curl -s -o /dev/null -w "%{http_code}" http://8.145.43.198/api/v1/health` — API 健康检查
- 前后端改动：手动重启容器 **不会** 使用新代码，必须先 `docker compose build <service>`（make 命令已内置）

### 部署红线（极其重要）

1. **rsync 到服务器时必须排除 `.env`** — 服务器 `.env` 里 `DATABASE_URL` 用 `@postgres:5432`、`REDIS_URL` 用 `redis://redis:6379`，本地用 localhost，覆盖会导致 502
2. **重建 web 镜像后必须验证** `docker compose exec web env | grep NEXT_PUBLIC` 确认是 `http://8.145.43.198/api/v1`
3. **绝对不要 `rm -rf data/postgres`** — 会丢失所有用户数据
4. rsync 排除列表：`.env`、`data/`、`node_modules/`、`.next/`、`__pycache__/`、`.git/`、`.venv/`、`.playwright-mcp/`、`.claude/`（均已内置在 Makefile 中）

### 踩坑记录

- **celery-worker 和 api 是独立镜像**：虽然都 `build: ./api`，但 `docker compose build api` 不会重建 celery-worker，改了后端代码必须两个都 build（`make deploy-api` 已内置）
- **构建必须先停容器**：服务器只有 1.6G 内存，边跑服务边 build 会 OOM 导致 SSH 断开、服务器卡死（需要去阿里云控制台重启）。所有 make deploy 命令已改为先 stop 再 build
- **DiaryEntry 模型没有 `title` 字段**：用 `manual_title` / `auto_title`，写 Celery 任务时注意
- **空 body POST 请求**：nginx 对 Content-Type: application/json 但无 body 的 POST 返回 400，前端需要发 `body: JSON.stringify({})`
- **git push 不需要代理**：环境变量可能带了代理配置，用 `https_proxy="" git push` 绕过

## 服务器信息

- 阿里云：`ssh lhrst@8.145.43.198`（2C 1.6G，内存紧张）
- 群晖 NAS：`ssh lhrst@192.168.1.5`（每 30 分钟增量备份）
- 用户账号：`lhrst` / `ltq990814`

## 技术栈

- 后端：FastAPI + SQLAlchemy async + Celery + Redis + PostgreSQL
- 前端：Next.js 15 + TipTap + Tailwind CSS
- AI：DeepSeek（通过 OpenRouter，因为 Anthropic 模型在国内被 region block）
- 部署：Docker Compose + Nginx 反向代理

## 开发约定

- 品牌名「革命启示录」，logo 在 `web/public/logo.svg`
- LLM 模型名不要硬编码，用 `settings.LLM_MODEL_FAST` / `settings.LLM_MODEL_SMART`
- 前端用 CSS 变量做主题（`var(--color-*)`），不要硬编码颜色
- 中文 UI，代码注释英文
- 服务器内存只有 1.6G，Docker 构建需要先停非必要容器释放内存
