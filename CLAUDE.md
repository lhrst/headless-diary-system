# CLAUDE.md

## 项目概况

这是一个自托管的 headless 日记系统，前后端分离。详见 `README.md`。

## 开始前必读

- **`docs/changelog-2026-03-26.md`** — 最近一次大改动的完整记录，包含所有改过的文件和原因
- **`docs/plan-agent-system.md`** — Agent 自改进系统的设计方案（待实现）
- **`docs/deploy-china.md`** — 国内服务器部署指南

## 部署规则（极其重要）

1. **rsync 到服务器时必须排除 `.env`** — 服务器 `.env` 里 `DATABASE_URL` 用 `@postgres:5432`，本地用 `@localhost:5432`，覆盖会导致 502
2. **重建 web 镜像后必须验证** `docker compose exec web env | grep NEXT_PUBLIC` 确认是 `http://8.145.43.198/api/v1`
3. **绝对不要 `rm -rf data/postgres`** — 会丢失所有用户数据
4. 用 `make deploy-to` 部署（已内置排除规则）

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

- LLM 模型名不要硬编码，用 `settings.LLM_MODEL_FAST` / `settings.LLM_MODEL_SMART`
- 前端用 CSS 变量做主题（`var(--color-*)`），不要硬编码颜色
- 中文 UI，代码注释英文
- 服务器内存只有 1.6G，Docker 构建需要先停非必要容器释放内存
