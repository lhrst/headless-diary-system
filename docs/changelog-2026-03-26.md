# 2026-03-26 改动记录

本次会话对 headless-diary-system 进行了大量改动，以下是完整记录。

---

## 一、前端全面重设计

### 视觉风格
- 暖色低饱和度色系：奶油白底 `#FAF7F4` + 陶土主色 `#B87351`
- 两套主题：「奶油白」（明亮温暖）和「手帐棕」（复古质感），设置页可切换
- 温色阴影（shadow 用暖色调 rgba）
- body 叠加 SVG 噪点纹理增加纸质触感
- 自定义滚动条样式

### 字体
- 衬线标题：Lora + Noto Serif SC（书卷气）
- 无衬线正文：DM Sans + Noto Sans SC（温暖圆润）
- Google Fonts 加载，带 preconnect

### 微动效
- 卡片 fadeInUp 入场（带 stagger 延迟）
- 骨架屏 shimmer 加载替代「加载中...」文字
- 按钮 hover 上浮 + shadow 增强，active 回弹
- 输入框聚焦温暖发光环（glow ring）
- 标签 hover 微弹 scale(1.03)
- 新发布日记 warmGlow 动画
- scale-in、slide-up 等多种动画类

### 首页 UX 改进
- **乐观发布**：点击发布后立即在列表显示占位卡片（带脉动指示器），标题后台异步生成
- **编辑器默认展开**（不再收起，直接可写）
- 搜索框带搜索图标
- 标签筛选器带 active 缩放效果
- 空状态有图标和引导文字

### 日记卡片改造
- **点击卡片展开全文**（懒加载内容）
- 展开后显示渲染好的 HTML/Markdown 内容
- 展开后有「收起」「详情」「编辑」操作栏
- 预览文字自动去除 HTML 标签
- 相对时间显示（刚刚/分钟前/小时前/天前）
- AI 标签去掉丑的虚线边框，改为微透明 + sparkle 图标

### 日记详情页
- 返回按钮 + 衬线大标题
- 天气/地址/时间用图标展示
- 自定义删除确认弹窗（替代浏览器 confirm）
- **编辑历史**：可展开查看所有历史版本，点击查看旧版内容
- 引用/被引用区块用图标标识

### 其他页面
- 导航栏：毛玻璃效果 + 滚动时渐变边框 + SVG 图标
- 登录/注册页：Logo + 动画入场
- 标签页：树形/云图切换，树节点带展开旋转动效
- 编辑页：衬线字体标题输入，返回按钮
- 设置页：颜色预览卡片式主题选择器

### 修复的预存 Bug
- `TagSuggest.tsx` 中 `tag.name` → `tag.tag`
- `edit/page.tsx` 中 `d.manual_title`（类型不存在）
- 首页 `useSearchParams` 添加 Suspense 包裹

### 涉及文件
- `web/src/app/globals.css` — 全新动画 + 组件类
- `web/src/app/layout.tsx` — 新字体加载
- `web/src/app/page.tsx` — 乐观发布 + 展开编辑器
- `web/src/app/login/page.tsx` — 重设计
- `web/src/app/register/page.tsx` — 重设计
- `web/src/app/settings/page.tsx` — 主题卡片选择器
- `web/src/app/diary/[id]/page.tsx` — 详情重设计 + 编辑历史
- `web/src/app/diary/[id]/edit/page.tsx` — 重设计
- `web/src/app/diary/new/page.tsx` — 重设计
- `web/src/app/tags/page.tsx` — 重设计
- `web/src/app/tags/[tag]/page.tsx` — 重设计
- `web/src/components/Navbar.tsx` — 毛玻璃 + 图标
- `web/src/components/DiaryCard.tsx` — 可展开卡片
- `web/src/components/Editor.tsx` — 暖色工具栏 + SVG 图标
- `web/src/components/CommentThread.tsx` — 重设计
- `web/src/components/AgentStatus.tsx` — 重设计
- `web/src/components/ThemeSwitcher.tsx` — 重设计
- `web/src/themes/default.css` — 全新暖色变量 + shadow + radius
- `web/src/themes/journal.css` — 手帐棕主题
- `web/tailwind.config.ts` — 新字体 + 圆角 + 阴影
- `web/Dockerfile` — 去掉 package-lock.json、去掉 darwin-arm64 依赖
- `web/package.json` — 移除 @next/swc-darwin-arm64

---

## 二、后端改动

### AI 模型配置化
- `api/app/config.py` 新增 `LLM_MODEL_FAST` 和 `LLM_MODEL_SMART` 配置项
- 所有硬编码的 `anthropic/claude-3.5-haiku`、`google/gemini-2.0-flash-001` 替换为 `settings.LLM_MODEL_FAST`
- 默认值为 `deepseek/deepseek-chat`（国内服务器可用）
- 涉及文件：`routers/diary.py`、`routers/media.py`、`tasks/title_tasks.py`、`tasks/agent_tasks.py`、`tasks/caption_tasks.py`

### 编辑历史
- 新增 `api/app/models/version.py` — DiaryVersion 模型
- `api/app/models/__init__.py` 注册 DiaryVersion
- `api/app/models/diary.py` 添加 versions relationship
- `api/app/routers/diary.py` — update_diary 时自动保存历史版本
- 新增 `GET /diary/{id}/versions` 端点

### 预览文字 HTML 剥离
- `api/app/routers/diary.py` 的 `_entry_to_brief()` 用 `_strip_html()` 清理预览文字

### 地理编码修复
- `api/app/utils/geo_weather.py` — 新增 BigDataCloud 作为首选反向地理编码（国内可用），Nominatim 降为 fallback

### API 启动重试
- `api/app/main.py` — lifespan 中 DB 连接失败时重试 10 次（间隔 2 秒）

### Agent 系统增强
- `api/app/services/agent_user.py` — 自动创建 ai-agent 系统用户
- `api/app/models/agent_task.py` — 新增 `task_type`、`result_comment_id` 字段
- `api/alembic/versions/004_agent_task_enhancements.py` — 对应迁移
- `api/app/routers/diary.py` — @agent 命令自动分类（improvement/chat）并分发到 Celery

### 其他
- `api/Dockerfile` — 去掉 ffmpeg（节省内存），添加清华 pip 镜像
- `api/pyproject.toml` — 固定 bcrypt==4.1.3（passlib 兼容性）

---

## 三、基础设施

### 项目结构整理
- 删除 `diary-system-spec.md`、`diary-system-spec-multimedia-v2.md`、`ARCHITECTURE.md`、`PROGRESS.md`
- 根目录测试文件移到 `tests/e2e/`
- 新建 `README.md` — 完整的项目文档（所有目录结构和文件说明）
- 新建 `docs/deploy-china.md` — 国内服务器部署指南
- 新建 `docs/plan-agent-system.md` — Agent 自改进系统设计方案

### Docker / 部署
- `docker-compose.yml` — 所有容器添加 `TZ=Asia/Shanghai`
- `docker-compose.yml` — web 服务添加 `NEXT_PUBLIC_API_URL` build arg
- `nginx/nginx.conf` — 添加 `http {}` 包裹（修复 upstream 指令错误）
- `Makefile` — deploy-to 命令排除 `.env`、`data/`、`node_modules/` 等
- 服务器添加 2G swap（`/swapfile`）

### NAS 备份系统
- 在群晖 NAS（192.168.1.5）上配置了 SSH 免密登录
- NAS → 服务器 SSH 密钥对已设置
- `/volume1/docker/diary-backup/sync.sh` — Time Machine 风格增量备份脚本
  - rsync --link-dest 硬链接增量（相同文件不重复占空间）
  - 每 30 分钟执行一次
  - 保留策略：24h 内每 30min / 1-7 天每小时 / 7-30 天每天 / 30+ 天每周
- `/volume1/docker/diary-backup/daemon.sh` — 后台守护进程
- 开机自启配置在 `~/.profile`

### 数据库操作记录
- 执行过一次 postgres 数据完全重置（修复连接问题时）
- 从 NAS 备份恢复了数据
- 手动添加了 `agent_tasks.task_type` 和 `agent_tasks.result_comment_id` 列
- 手动创建了 `diary_versions` 表
- 执行了 `UPDATE diary_entries SET created_at = created_at + interval '8 hours'` 修复时区

---

## 四、服务器信息

- **服务器**：阿里云 8.145.43.198（2C 1.6G，Ubuntu）
- **SSH**：`ssh lhrst@8.145.43.198`（本机 alias `2me`）
- **NAS**：群晖 192.168.1.5，SSH 用户 lhrst
- **用户账号**：`lhrst` / `ltq990814`
- **Docker 镜像加速**：已配置阿里云/DaoCloud 等镜像
- **API URL**：服务器 .env 里必须是 `http://8.145.43.198/api/v1`
- **DATABASE_URL**：服务器 .env 里必须用 `@postgres:5432`（不是 localhost）

---

## 五、已知问题 / 待做

- [ ] @agent 自改进系统（触发 Claude Code 修改代码）— 方案在 `docs/plan-agent-system.md`
- [ ] AI 聊天账号交互完善
- [ ] # 和 @ 编辑器内自动补全待验证
- [ ] 注册开关（REGISTRATION_ENABLED 环境变量）
- [ ] PWA Service Worker（离线支持）
- [ ] ffmpeg 重新加入（视频处理功能，需要更大内存的服务器）

---

## 六、Git 提交记录

```
e2a2012 Redesign diary cards: expandable preview with rendered content
6f0fb8b Fix: add DB connection retry on startup (10 attempts, 2s interval)
ba8c600 Fix: strip HTML from preview, clean up AI tag styling
ce24b18 Fix: set TZ=Asia/Shanghai for all containers
0df7e31 Fix: register DiaryVersion model in __init__.py
6791390 Add edit history, fix geolocation, show editor directly on homepage
b6dcda0 Fix deployment: use DeepSeek model, fix nginx, bcrypt, Dockerfile
d8be402 Restructure project: add README, deploy docs, remove old specs
9d57cb5 Redesign frontend: warm cream/terracotta palette, animations, optimistic publish
```
