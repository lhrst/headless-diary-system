# 部署到国内服务器

本文档介绍如何将 Headless Diary System 部署到国内云服务器（阿里云、腾讯云、矩池云等）。

---

## 前置要求

- 一台 Linux 服务器（推荐 Ubuntu 22.04+，最低 2C4G）
- 服务器已安装 Docker 和 Docker Compose
- 域名（可选，用于 HTTPS）

---

## 方式一：直接部署（推荐）

最简单的方式，在服务器上 clone 仓库直接启动。

### 1. 克隆仓库

```bash
# 国内可用 GitHub 镜像加速
git clone https://github.com/lhrst/headless-diary-system.git
cd headless-diary-system
```

如果 GitHub 访问困难：
```bash
# 使用 Gitee 镜像（需先 import 到 Gitee）
git clone https://gitee.com/你的用户名/headless-diary-system.git

# 或者从本地 rsync 上传
rsync -avz --exclude='data/' --exclude='node_modules/' --exclude='.next/' \
  ./ user@服务器IP:~/diary/
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，**必须修改**以下项：

```bash
# 生成随机密码
POSTGRES_PASSWORD=$(openssl rand -hex 16)

# 生成 JWT 密钥
JWT_SECRET=$(openssl rand -hex 32)

# OpenRouter API Key（AI 功能需要）
OPENROUTER_API_KEY=sk-or-v1-你的key

# 前端 API 地址 — 改为你的服务器 IP 或域名
NEXT_PUBLIC_API_URL=http://你的服务器IP/api/v1
# 如果有域名：
# NEXT_PUBLIC_API_URL=https://diary.example.com/api/v1
```

### 3. 国内 Docker 镜像加速

国内拉取 Docker Hub 镜像可能很慢，配置镜像加速器：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.mirrors.ustc.edu.cn"
  ]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

### 4. 构建并启动

```bash
# 生产模式启动（首次会构建镜像，需要几分钟）
make prod

# 运行数据库迁移
make migrate

# 查看日志确认正常
make logs
```

### 5. 验证

```bash
# 检查健康状态
curl http://localhost/health

# 检查 API
curl http://localhost/api/v1/auth/me

# 浏览器访问
http://你的服务器IP
```

---

## 方式二：从本地推送（rsync）

适合本地开发后直接推到服务器。

```bash
# Makefile 已经包含 deploy-to 命令
make deploy-to SERVER=user@服务器IP HOST=~/diary
```

这会：
1. rsync 代码到服务器（排除 postgres 数据）
2. rsync 数据文件
3. SSH 到服务器执行 `docker compose up -d --build`

---

## HTTPS 配置（推荐）

### 使用 Let's Encrypt（需要域名）

```bash
# 在服务器上安装 certbot
sudo apt install certbot

# 先停止 nginx 容器释放 80 端口
docker compose stop nginx

# 获取证书
sudo certbot certonly --standalone -d diary.example.com

# 复制证书到项目目录
sudo cp /etc/letsencrypt/live/diary.example.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/diary.example.com/privkey.pem nginx/ssl/
```

修改 `nginx/nginx.conf` 添加 HTTPS：

```nginx
server {
    listen 80;
    server_name diary.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name diary.example.com;

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    client_max_body_size 500M;

    location /api/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /health {
        proxy_pass http://api_backend;
    }

    location / {
        proxy_pass http://web_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

记得同步更新 `.env`：
```bash
NEXT_PUBLIC_API_URL=https://diary.example.com/api/v1
```

然后重新构建前端并重启：
```bash
make prod
```

### 自动续期

```bash
# 添加 crontab 自动续期
echo "0 3 * * * certbot renew --post-hook 'docker compose restart nginx'" | sudo crontab -
```

---

## 无域名方案（纯 IP 访问）

如果没有域名，直接用 IP 访问即可，HTTP 模式不需要任何额外配置。

确保服务器防火墙开放 80 端口：

```bash
# 阿里云/腾讯云：在控制台安全组中添加入站规则 TCP 80

# 或用 iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
```

---

## OpenRouter API 国内访问

OpenRouter 的 API 在国内可能需要代理。几个方案：

### 方案 A：服务器自带代理
如果服务器已配置代理（如 Clash），确保 Docker 容器能访问：

```bash
# 在 docker-compose.yml 的 api 和 celery-worker 中添加环境变量
environment:
  - HTTP_PROXY=http://host.docker.internal:7890
  - HTTPS_PROXY=http://host.docker.internal:7890
```

### 方案 B：使用国内可访问的 LLM API
修改 `.env`，将 OpenRouter 替换为国内可用的 API：

```bash
# 例如使用兼容 OpenAI 格式的国内 API
OPENROUTER_BASE_URL=https://你的国内api地址/v1
OPENROUTER_API_KEY=你的key
```

只要 API 兼容 OpenAI chat/completions 格式即可。

### 方案 C：关闭 AI 功能
如果不需要 AI 自动标题/标签/Agent，可以不配置 `OPENROUTER_API_KEY`，系统会正常运行但 AI 功能不可用。

---

## Whisper 语音转写

音频转写使用 faster-whisper，首次运行会下载模型（约 1.5GB for medium）。

国内下载 Hugging Face 模型可能很慢，解决方案：

```bash
# 方案 A：使用小模型
WHISPER_MODEL_SIZE=tiny   # 75MB，准确度较低但速度快

# 方案 B：配置 HF 镜像
# 在 docker-compose.yml 的 celery-worker 环境变量中添加
environment:
  - HF_ENDPOINT=https://hf-mirror.com

# 方案 C：关闭本地转写，使用云端
WHISPER_CLOUD_FALLBACK=true
```

---

## 性能建议

| 配置 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 20 GB | 50 GB+ |
| 说明 | 可运行但 Whisper 较慢 | 流畅运行所有功能 |

如果内存紧张，可以减少 Celery 并发数：

```yaml
# docker-compose.yml 中修改
celery-worker:
  command: celery -A app.tasks worker --loglevel=info --concurrency=1
  deploy:
    resources:
      limits:
        memory: 2G
```

---

## 数据备份

```bash
# 完整备份（含数据库数据文件）
make backup

# 轻量备份（SQL dump + 日记文件）
make backup-light

# 手动备份数据库
docker compose exec postgres pg_dump -U diary_user diary > backup.sql
```

建议设置定时备份：
```bash
echo "0 4 * * * cd ~/diary && make backup-light" | crontab -
```

---

## 故障排查

```bash
# 查看所有容器状态
docker compose ps

# 查看 API 日志
docker compose logs -f api

# 查看 Celery Worker 日志（AI 任务）
docker compose logs -f celery-worker

# 进入 API 容器调试
docker compose exec api bash

# 检查数据库连接
docker compose exec postgres psql -U diary_user -d diary -c "SELECT 1"

# 重启单个服务
docker compose restart api
docker compose restart celery-worker
```

---

## 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并重启
make prod

# 如果有新迁移
make migrate
```
