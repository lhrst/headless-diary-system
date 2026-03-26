# Plan: Agent 自改进系统 + AI 聊天账号

## 概述

实现一个 AI Agent 账号，能够与用户进行对话式交互，并支持通过 @agent 命令触发代码级别的自改进。

---

## 功能一：AI Agent 账号

### 需求
- 系统内置一个 AI 账号，可以和用户账号进行交互
- 用户可以在日记评论区与 Agent 聊天
- Agent 的回复以独立身份出现（不是系统消息）

### 实现方案
1. **创建系统级 Agent 用户** — 启动时自动创建，有特殊 role
2. **评论系统增强** — 支持对话式回复（而非单条评论）
3. **Agent 回复流程**：
   - 用户在日记中写 `@agent 帮我总结最近一周的心情`
   - 后端创建 AgentTask（状态：pending）
   - 前端立即显示"Agent 正在思考..."的状态指示器
   - Celery worker 执行任务，调用 LLM
   - 完成后以 Agent 账号身份在评论区发布回复
   - 前端通过轮询或 WebSocket 更新状态

### 技术要点
- `agent_tasks` 表增加 `result_comment_id` 字段，关联到回复的评论
- 前端日记详情页增加实时状态轮询（每 5 秒检查一次 agent_tasks 状态）
- Agent 评论带特殊样式标识

---

## 功能二：@agent 自改进系统

### 需求
- 特定 @agent 命令（如 `@agent 改进：希望搜索功能支持拼音`）可以触发本机的 Claude Code
- Claude Code 修改代码后自动提交到 GitHub
- 然后推送到服务器并更新网站

### 实现方案

#### 方案 A：本机 Hook（推荐）
1. 服务器上的 Celery worker 检测到"改进"类 @agent 命令
2. 通过 webhook 通知本机（需要内网穿透或轮询）
3. 本机运行 Claude Code CLI 处理需求：
   ```bash
   claude -p "根据用户需求修改代码: ${command}" --allowedTools Edit,Write,Bash
   ```
4. Claude Code 完成后自动 git commit + push
5. 服务器通过 webhook 或定时拉取更新并重建

#### 方案 B：服务器端直接执行
1. 在服务器上安装 Claude Code
2. Celery worker 检测到改进命令后直接调用 `claude` CLI
3. 修改代码、提交、重建 Docker

#### 完整流程
```
用户写 @agent 改进：添加暗色模式
  → 后端创建 AgentTask (type: improvement)
  → Agent 评论：收到改进建议，正在分析...
  → 触发 Claude Code 执行代码修改
  → Agent 评论：已完成修改，正在部署...
  → 自动 git push + 服务器 rsync + docker rebuild
  → Agent 评论：改进已上线！变更内容：[diff 摘要]
```

### 安全考虑
- 只有管理员用户的 @agent 改进命令才会被执行
- 改进命令需要人工审核（可选）
- Claude Code 运行在沙箱环境中
- 每次修改都有 git 记录可回滚

---

## 功能三：Agent 上下文增强

### 需求
- Agent 在回复时应该了解用户的历史日记、标签、偏好
- 改进类命令应该了解当前代码结构

### 实现方案
- 回复类命令：自动注入最近 7 天日记 + 相关标签的日记作为上下文
- 改进类命令：注入当前项目的 README.md + 相关文件作为上下文
- 上下文窗口控制：最多 4000 tokens 的历史内容

---

## 优先级

1. **P0**: Agent 账号 + 评论回复（基础交互能力）
2. **P1**: @agent 命令执行 + 状态反馈（LLM 回复能力）
3. **P2**: 自改进系统（Claude Code 集成）
4. **P3**: 实时状态推送（WebSocket 替代轮询）

---

## 相关文件

- `api/app/models/agent_task.py` — Agent 任务模型
- `api/app/tasks/agent_tasks.py` — Celery 异步执行
- `api/app/services/agent_service.py` — Agent 上下文构建
- `web/src/components/AgentStatus.tsx` — 前端状态展示
- `web/src/components/CommentThread.tsx` — 评论组件
