# 部署：HTTPS + 子域 + 本地 build 产物上传

服务器 `ali` (8.145.43.198, Ubuntu 22.04, **1.6G 内存**) 的完整部署方案。

## 1. 前置 — 一次性配置

### SSL 证书（Let's Encrypt 通配符 + 阿里云 DNS）

```bash
# 服务器上
sudo python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install --quiet certbot certbot-dns-aliyun
sudo ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot

# 阿里云 RAM 子账号 + AliyunDNSFullAccess 权限
sudo tee /root/.aliyun.ini > /dev/null << 'EOF'
dns_aliyun_access_key = LTAIxxxxxx
dns_aliyun_access_key_secret = xxxxxx
EOF
sudo chmod 600 /root/.aliyun.ini

# 申请通配符证书
sudo certbot certonly \
  --authenticator dns-aliyun \
  --dns-aliyun-credentials /root/.aliyun.ini \
  --dns-aliyun-propagation-seconds 30 \
  -d 'lhrst.top' -d '*.lhrst.top' \
  --email lhrst@qq.com --agree-tos --no-eff-email --non-interactive
```

证书路径：`/etc/letsencrypt/live/lhrst.top/{fullchain,privkey}.pem`。

### 自动续期

```bash
# /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
#!/bin/bash
docker exec diary-nginx-1 nginx -s reload

# crontab (sudo crontab -e)
0 3 * * * /usr/local/bin/certbot renew --quiet
```

### nginx 容器挂证书

`docker-compose.yml` 的 nginx 服务追加挂载：

```yaml
nginx:
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - /etc/letsencrypt:/etc/letsencrypt:ro
    - /home/lhrst/projects/li-mengyu-portfolio:/usr/share/nginx/portfolio:ro  # portfolio 子站
```

### nginx.conf 关键点

- 80 全部 301 → 443
- 443 server 用 `listen 443 ssl http2;` (旧语法，nginx:alpine 1.24 不支持 `http2 on;`)
- 证书路径 `/etc/letsencrypt/live/lhrst.top/...`
- portfolio 子域用 `root /usr/share/nginx/portfolio;` 直接静态服务

### 阿里云 ECS 安全组

入方向必须放行 **80 + 443**。常见坑：装了 SSL 后忘记开 443。

---

## 2. **关键问题：服务器内存太小，容器内构建会卡死**

`docker compose up -d --build web` 在 1.6G 内存机器上跑 `next build` 会让 load 飙到 7+，npm/next 静默挂起几十分钟。**禁止在服务器上构建 web**。

## 3. 推荐方案：本地 build → scp → docker cp 替换

仅适用于 **next.js standalone 输出**（`next.config.js` 必须有 `output: "standalone"`）。

### 3.1 本地准备（macOS / 任何机器）

```bash
# 1. 拉源码
mkdir -p /tmp/diary-build && cd /tmp/diary-build
rsync -az --exclude='.next' --exclude='node_modules' \
  ali:/home/lhrst/projects/diary/web/ web/
cd web

# 2. 关代理（Claude Code 注入的 HTTP_PROXY=127.0.0.1:7999 会让 npm 卡死）
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy

# 3. npm install（淘宝镜像快很多）
npm install --no-audit --no-fund \
  --registry=https://registry.npmmirror.com

# 如果 next 的 swc native 包 arch 不匹配（mac arm64 装成了 x64），手动补：
NEXT_VER=$(node -p "require('./node_modules/next/package.json').version")
npm install --no-save --ignore-scripts \
  --registry=https://registry.npmmirror.com \
  "@next/swc-darwin-arm64@$NEXT_VER"

# 4. build
NEXT_PUBLIC_API_URL=https://lhrst.top/api/v1 \
NEXT_TELEMETRY_DISABLED=1 \
./node_modules/.bin/next build
```

⚠️ `NEXT_PUBLIC_*` 是 **build-time 注入**，必须在 build 时给定正确的 HTTPS URL，否则前端 hardcoded http URL 会触发 mixed-content 被浏览器 block，**登录会失败**。

### 3.2 替换 sharp 为 linux x64

next.js standalone 会把 native 模块复制进去，mac build 出来的是 darwin-arm64 sharp，传到 linux x64 服务器会崩。

```bash
cd /tmp/diary-build/web/.next/standalone

# 删 mac 版
rm -rf node_modules/@img/sharp-darwin-arm64 node_modules/@img/sharp-libvips-darwin-arm64

# 装 linux x64 版（用 --force --os --cpu 跨平台装）
SHARP_VER=$(node -p "require('./node_modules/sharp/package.json').version")
npm install --no-save --no-audit --no-fund --ignore-scripts --force \
  --os=linux --cpu=x64 --libc=glibc \
  --registry=https://registry.npmmirror.com \
  "@img/sharp-linux-x64@$SHARP_VER" "@img/sharp-libvips-linux-x64"
```

### 3.3 打包 + 上传

```bash
cd /tmp/diary-build/web
tar czf /tmp/web-build.tar.gz -C .next standalone static
tar czf /tmp/web-public.tar.gz public
scp -C /tmp/web-build.tar.gz /tmp/web-public.tar.gz ali:/tmp/
```

约 60MB tar，传 5-10s。

### 3.4 服务器端解压 + docker cp 替换 + restart

```bash
ssh ali bash << 'REMOTE'
set -e
mkdir -p /tmp/web-deploy && cd /tmp/web-deploy
rm -rf standalone static public
tar xzf /tmp/web-build.tar.gz
tar xzf /tmp/web-public.tar.gz

# 把产物拷进运行中的 web 容器
docker cp standalone/. diary-web-1:/app/
docker cp static diary-web-1:/app/.next/
docker cp public diary-web-1:/app/

docker restart diary-web-1
sleep 3
docker logs diary-web-1 --tail 10
REMOTE
```

容器内 `node server.js` 会直接加载新产物。Web 服务**无需 rebuild 镜像**。

---

## 4. Portfolio 子站（`li-mengyu-portfolio.lhrst.top`）

纯静态站。在服务器上 clone 一份，nginx 直接 serve：

```bash
# 服务器上准备 deploy key（已加到 GitHub repo Settings → Deploy keys）
ssh-keygen -t ed25519 -N '' -f ~/.ssh/portfolio_deploy
cat >> ~/.ssh/config << 'EOF'
Host github-portfolio
    HostName github.com
    User git
    IdentityFile ~/.ssh/portfolio_deploy
    IdentitiesOnly yes
EOF

cd /home/lhrst/projects && git clone git@github-portfolio:lhrst/li-mengyu-portfolio.git
```

`nginx.conf` 子站 server 块：

```nginx
server {
    listen 443 ssl http2;
    server_name li-mengyu-portfolio.lhrst.top;
    ssl_certificate     /etc/letsencrypt/live/lhrst.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lhrst.top/privkey.pem;
    root /usr/share/nginx/portfolio;
    index index.html;
    location ~* ^/(articles|posters)/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location / {
        try_files $uri $uri.html $uri/ =404;
    }
}
```

### Portfolio 自动部署（push main 自动同步）

GitHub Actions `.github/workflows/deploy.yml`（在 portfolio repo）：

```yaml
name: Deploy to ali server
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H ${{ secrets.SSH_HOST }} >> ~/.ssh/known_hosts
      - run: |
          ssh ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }} \
            "bash /home/lhrst/projects/li-mengyu-portfolio/.deploy.sh"
```

服务器上 `/home/lhrst/projects/li-mengyu-portfolio/.deploy.sh`：

```bash
#!/bin/bash
set -e
cd /home/lhrst/projects/li-mengyu-portfolio
git fetch origin main
git reset --hard origin/main
echo "deployed: $(git rev-parse --short HEAD)"
```

GitHub repo secrets:
- `SSH_PRIVATE_KEY`: 服务器上 `~/.ssh/gh_actions_deploy` 的私钥（公钥追加进 `~/.ssh/authorized_keys`）
- `SSH_HOST`: `8.145.43.198`
- `SSH_USER`: `lhrst`

---

## 5. 踩坑记录

| 现象 | 原因 | 解决 |
|---|---|---|
| 服务器 docker build 卡几十分钟 npm 静默 | 1.6G 内存太小 | 本地 build → docker cp |
| 浏览器登录无响应 | mixed content：HTTPS 页面调 http://8.145.43.198/api | build 时 `NEXT_PUBLIC_API_URL=https://lhrst.top/api/v1` |
| nginx 启动报 `unknown directive "http2"` | nginx:alpine 镜像版本旧 | 用 `listen 443 ssl http2;` 代替 `http2 on;` |
| 域名能 DNS 解析但 https 打不开 | 阿里云 ECS 安全组没开 443 | 安全组入方向加 443/0.0.0.0/0 |
| 本地 npm install 0% CPU 卡死 | Claude Code 注入 `HTTP_PROXY=127.0.0.1:7999` | 每次 shell 先 `unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy` |
| Mac arm64 跑 next build 报缺 swc | npm 选了 darwin-x64 native 包 | `npm install --no-save @next/swc-darwin-arm64@$NEXT_VER` 补装 |
| linux 服务器 sharp 报 platform 不匹配 | mac build 把 darwin-arm64 sharp 复制进 standalone | standalone 里删 darwin sharp，`--force --os=linux --cpu=x64` 装 linux 版 |
| 服务器 git clone 私有 repo 报 Permission denied | 没配 SSH key | GitHub repo Deploy keys 加服务器公钥 + ~/.ssh/config 加 Host alias |
