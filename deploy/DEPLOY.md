# AI-Shifu-TTS 部署指南

## 架构

```
浏览器 :80 → Nginx → /api/*      → Flask (gunicorn) :5800
                       → /_next/static/ → 直接读磁盘（缓存 30 天）
                       → 其余所有      → Next.js (standalone) :5000
```

需要 **3 个进程**：Nginx + gunicorn + Next.js standalone。Nginx 只代理静态资源从磁盘直接读取。

**变体**：如果服务器上 Apache 已经占用了 80 端口（例如同机还跑着其他站点），可以让
Apache 监听 80 并整体转发给监听 88 的 Nginx，Nginx 内部再照常代理到后端和前端：

```
浏览器 :80 → Apache (:80) → Nginx (:88) → Flask :5800 / Next.js :5000
```

详见下文「[变体：Apache 占用 80 端口](#变体apache-占用-80-端口apache-80--nginx-88)」。

**前端变体**：从 CentOS 7 升级而来的服务器（glibc 2.17）装不上 Node 22，只能用
Node 20 + `npx next build --turbopack` 构建、`npm start` 运行。详见下文
「[变体：CentOS 7（Node 20）](#变体centos-7node-20turbopack-构建--npm-start-运行)」。

## 依赖

| 依赖 | 版本 |
|------|------|
| Node.js | 22.x（CentOS 7 老机器只能装 20.x，见前端变体章节） |
| Python | 3.11+ |
| MySQL | 8.x |
| Redis | 7.x |
| uv | 最新（Python 包管理） |
| Nginx | 最新 |

## 步骤

### 1. 克隆项目

```bash
# Linux 服务器
git clone <repo> /home/ai-shifu-TTS
cd /home/ai-shifu-TTS

# Mac 本地
git clone <repo> /Users/benben/ai-shifu-TTS
cd /Users/benben/ai-shifu-TTS
```

### 2. 启动 MySQL 和 Redis

```bash
# Linux
sudo systemctl enable --now mysql redis

# Mac
brew services start mysql redis
```

### 3. 创建数据库

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`ai-shifu\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
```

### 4. 配置环境变量

```bash
cp docker/.env.example.full src/api/.env
cp docker/.env.example.full src/cook-web/.env
```

编辑 `src/api/.env`（`src/cook-web/.env` 内容相同），**必须修改**：

| 变量 | 改什么 |
|------|--------|
| `SECRET_KEY` | 生成随机值：`python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `SQLALCHEMY_DATABASE_URI` | 设 MySQL 密码，Docker 环境把 `ai-shifu-mysql` 改为 `127.0.0.1` |
| LLM key | 至少一个，如 `OPENAI_API_KEY="sk-..."` |
| `REDIS_HOST` | Docker 环境把 `ai-shifu-redis` 改为 `127.0.0.1` |
| `LOCAL_STORAGE_ROOT` | Linux 改为 `/home/ai-shifu-TTS/storage` / Mac 改为 `/Users/benben/ai-shifu-TTS/storage` |
| `I18N_ROOT` | 指向 i18n 目录，解决 standalone 模式下 `/api/i18n` 返回 500 |
| `SHARED_I18N_ROOT` | 同上，构建时需要 |

**⚠️ `I18N_ROOT` 不能只写在 `.env` 里。**因为 `server.js` 内部会执行 `process.chdir()` 把 CWD 改成 `.next/standalone/`，导致 `.env` 无法被加载。必须通过命令行传递：

```bash
export I18N_ROOT="$(cd src/cook-web && pwd)/../i18n"
node .next/standalone/server.js
```

Windows PowerShell：

```powershell
$env:I18N_ROOT="$PWD\..\i18n"
node .next\standalone\server.js
```

### 局域网访问

如果从其他设备直接访问（不走 Nginx），前端会自动用 `window.location.hostname` 拼接后端地址 `hostname:5800`，无需额外配置。

如果通过 Nginx（端口 80）访问，所有 `/api/...` 请求由 Nginx 路由。

如果之前 `.env` 中有 `NEXT_PUBLIC_API_BASE_URL="http://localhost:5800/"`，请删除或注释，然后 **rebuild**：
```bash
cd src/cook-web
npm run build
cp -r .next/static .next/standalone/.next/static
```

### 5. 后端

```bash
cd src/api

# 安装 Python 依赖
uv venv .venv
uv pip sync requirements.txt

# 数据库迁移
export FLASK_APP=app.py
.venv/bin/flask db upgrade
```

### 6. 前端

```bash
cd src/cook-web

npm install
npm run build

# 修复 standalone 模式下 CSS 等静态资源 404
cp -r .next/static .next/standalone/.next/static
```

> 这是 Next.js standalone 构建的已知限制——`npm run build` 不会把 `.next/static/` 自动复制到 standalone 输出目录。每次重新构建后都需要执行一次。

> ⚠️ CentOS 7 / Node 20 的机器**不要执行本节命令**，webpack 构建会 segfault。改用
> 「变体：CentOS 7（Node 20）」章节的 `npx next build --turbopack` 流程。

### 7. 创建存储目录

```bash
mkdir -p storage
```

### 8. 启动应用

```bash
# 终端 1 - 后端（gunicorn）
cd src/api
.venv/bin/gunicorn -w 4 -b 127.0.0.1:5800 --timeout 300 'app:app'

# 终端 2 - 前端（Next.js standalone server）
cd src/cook-web

# server.js 内部会改变工作目录，.env 无法被加载，所以先 export 环境变量
export I18N_ROOT="$(pwd)/../i18n"
node .next/standalone/server.js
```

Windows PowerShell：

```powershell
cd src/cook-web
$env:I18N_ROOT="$PWD\..\i18n"
node .next\standalone\server.js
```

验证：
- 后端：`curl http://127.0.0.1:5800/api/health`
- 前端：`curl http://127.0.0.1:5000`

### 9. 配置 Nginx

```bash
# Linux
sudo cp deploy/nginx/ai-shifu.conf /etc/nginx/conf.d/ai-shifu.conf

# Mac (Homebrew)
sudo cp deploy/nginx/ai-shifu.conf /opt/homebrew/etc/nginx/servers/ai-shifu.conf
```

**修改 nginx 配置中的两处路径**（`deploy/nginx/ai-shifu.conf`）：

```nginx
# 第 25 行：server_name（域名或保持 _）
server_name _ benben.local;    # Mac 局域网
server_name your-domain.com;   # Linux 云服务器

# 第 30 行：alias 路径（指向你的实际项目路径）
alias /Users/benben/ai-shifu-TTS/src/cook-web/.next/standalone/.next/static/;   # Mac 路径
alias /home/ai-shifu-TTS/src/cook-web/.next/standalone/.next/static/;         # Linux 路径
```

Mac 局域网用 `benben.local` 访问，需在 `/etc/hosts` 确认：

```
127.0.0.1  benben.local
```

验证并启动：

```bash
nginx -t && sudo nginx -s reload
```

## 变体：Apache 占用 80 端口（Apache :80 → Nginx :88）

适用场景：Linux 服务器（如 CentOS 7）上 Apache/httpd 已经监听 80 端口、还在服务其他
站点，不能直接把 80 让给 Nginx。此时链路为：

```
浏览器 :80 → Apache (:80，整体转发) → Nginx (:88) → /api/* → Flask :5800
                                                       → 其余   → Next.js :5000
```

Apache 只做一层透明转发，所有路由规则仍然在 Nginx 里维护，与前文主方案完全一致。

配置模板：

| 文件 | 作用 | 安装位置（CentOS 7） |
|------|------|----------------------|
| `deploy/apache/ai-shifu-apache.conf` | Apache vhost，:80 → 127.0.0.1:88 | `/etc/httpd/conf.d/ai-shifu.conf` |
| `deploy/nginx/ai-shifu-88.conf` | Nginx，监听 88，内部照常代理 | `/etc/nginx/conf.d/ai-shifu-88.conf` |

### 1. 安装 Nginx 侧（监听 88）

```bash
sudo cp deploy/nginx/ai-shifu-88.conf /etc/nginx/conf.d/
# 改 alias 路径等项目实际路径（同上文步骤 9）
sudo vi /etc/nginx/conf.d/ai-shifu-88.conf

# 如果主方案的 ai-shifu.conf 也在，先删掉，避免两个 server 块重复
sudo rm -f /etc/nginx/conf.d/ai-shifu.conf

nginx -t && sudo nginx -s reload
```

验证 Nginx 单独工作：`curl -H 'Host: your-domain.com' http://127.0.0.1:88/`

### 2. 安装 Apache 侧（监听 80，转发到 88）

确认 `mod_proxy` / `mod_proxy_http` 已启用（CentOS 7 默认已加载）：

```bash
httpd -M | grep -E 'proxy|proxy_http'
```

Debian/Ubuntu 需要手动启用：

```bash
sudo a2enmod proxy proxy_http
```

安装 vhost：

```bash
# CentOS 7
sudo cp deploy/apache/ai-shifu-apache.conf /etc/httpd/conf.d/ai-shifu.conf
sudo vi /etc/httpd/conf.d/ai-shifu.conf   # 改 ServerName

# Debian/Ubuntu
sudo cp deploy/apache/ai-shifu-apache.conf /etc/apache2/sites-available/ai-shifu.conf
sudo vi /etc/apache2/sites-available/ai-shifu.conf
sudo a2ensite ai-shifu

apachectl configtest && sudo systemctl reload httpd   # Debian/Ubuntu: apache2
```

### 3. SELinux（CentOS 7 / RHEL）

SELinux 默认禁止 Web 服务进程主动连接本地端口，Apache 连 88、Nginx 连 5800/5000
都会被拦截，表现为 502/503 且 audit.log 里有 `httpd_can_network_connect` 拒绝记录：

```bash
sudo setsebool -P httpd_can_network_connect 1
```

### 4. 验证

```bash
curl http://127.0.0.1:88/                       # Nginx 直连，应返回前端页面
curl http://127.0.0.1/ -H 'Host: your-domain.com'   # 走完整链路 Apache→Nginx
curl http://127.0.0.1/api/health -H 'Host: your-domain.com'
```

浏览器访问 `http://your-domain.com`，确认页面、登录、SSE 流式输出正常。

### 注意事项

- Apache vhost 必须 `ProxyPreserveHost On`：前端用 `window.location.hostname` 拼后端
  地址，Host 丢了会导致 API 地址错误。
- `flushpackets=on` 保证 SSE / 流式响应不被 Apache 缓冲，否则对话输出会成块卡顿。
- 真实客户端 IP 通过 `X-Forwarded-For` 链路传递：`ai-shifu-88.conf` 里已经改为透传
  Apache 传来的头（`$http_x_forwarded_for` 等），不会把 127.0.0.1 记成客户端 IP。

## 变体：CentOS 7（Node 20，turbopack 构建 + npm start 运行）

适用场景：从 CentOS 7 升级而来的服务器（glibc 2.17）。Node 22 官方二进制要求更高
glibc 版本，装不上，只能装 **Node 20**。这会连带改变前端的构建和运行方式：

| 环节 | 主方案（Node 22） | CentOS 7 变体（Node 20） |
|------|-------------------|--------------------------|
| 构建 | `npm run build`（webpack） | `npx next build --turbopack`（webpack 在 glibc 2.17 上 segfault） |
| `next.config.ts` | 保持原样 | **build 前临时注释 `output: 'standalone'`** |
| 运行 | `node .next/standalone/server.js` | `npm start`（即 `next start`，与 standalone 产物不兼容） |
| `/_next/static/` | Nginx 从磁盘 alias 直读 | 由 Next.js 自己 serve，**删掉 Nginx 的 alias 段** |
| 复制 `.next/static` | 每次 build 后需要 | 不需要 |
| `I18N_ROOT` | 必须显式传入（server.js 会 chdir） | 不需要（cwd 正常，`/api/i18n` 自动回退到 `../i18n`） |

> 本变体可与上文「Apache 占用 80 端口」变体组合使用（实际 CentOS 7 老机器往往两者
> 都要）。后端 Python 侧不受此变体影响。

### 1. 构建前临时注释 standalone

`next start` 与 `output: 'standalone'` 不兼容，构建产物必须是普通模式。编辑
`src/cook-web/next.config.ts`：

```ts
  // 临时注释，build 完可还原（还原不影响已构建的 .next 产物）
  // output: 'standalone',
```

### 2. 用 turbopack 构建

```bash
cd src/cook-web
npm install
npx next build --turbopack    # 不要用 npm run build，webpack 在 glibc 2.17 上 segfault
```

不需要执行 `cp -r .next/static .next/standalone/.next/static`，那是 standalone 模式
专属的修复。

### 3. 启动

```bash
cd src/cook-web
PORT=5000 npm start
```

验证：`curl http://127.0.0.1:5000` 和 `curl http://127.0.0.1:5000/api/i18n`。

### 4. 调整 Nginx

`next start` 会自己 serve `/_next/static/`，Nginx 里对应的 alias 段必须删掉（否则
路径对不上返回 404）：删掉 `location /_next/static/ { ... }` 整段即可，其余路由规则
（`/api/*` → 5800，其余 → 5000）不变。

```bash
sudo vi /etc/nginx/conf.d/ai-shifu.conf   # 或 ai-shifu-88.conf
nginx -t && sudo nginx -s reload
```

### 5. systemd

用 `deploy/systemd/ai-shifu-frontend-npmstart.service` 替代主方案的前端 service：

```bash
sudo cp deploy/systemd/ai-shifu-frontend-npmstart.service /etc/systemd/system/
# 同样按实际情况改 User / 路径 / npm 绝对路径
sudo systemctl daemon-reload
sudo systemctl enable --now ai-shifu-frontend
```

### 注意事项

- **重启没事，build 才有事**：已构建的 `.next` 产物不受源码还原影响，日常只需
  `systemctl restart ai-shifu-frontend`；一旦重新 build，必须重做上面第 1、2 步。
- `npm start` 默认监听 3000，端口由 `PORT` 环境变量控制；如果 3000 被同机其他项目
  占用，换一个（如 3001），并同步修改 Nginx upstream。
- 升级系统（glibc ≥ 2.28，如 Rocky 9 / Ubuntu 22.04）后即可回到主方案：装 Node 22、
  还原 `next.config.ts`、用 `npm run build` + standalone server。

## 端口说明

| 端口 | 服务 | 访问方式 |
|------|------|----------|
| 80 | Nginx（主方案）/ Apache（变体） | 浏览器直接访问 `http://IP` 或域名 |
| 88 | Nginx（仅变体） | 仅本机，Apache 转发 |
| 5800 | Flask | 仅本机，Nginx 代理 |
| 5000 | Next.js | 仅本机，Nginx 代理 |
| 3306 | MySQL | 仅本机 |
| 6379 | Redis | 仅本机 |

## Nginx 路由规则

| 请求路径 | 处理方式 |
|----------|----------|
| `/_next/static/*` | Nginx 直接从磁盘读取，不经过 Node |
| `/api/i18n` | 代理到 Next.js :5000 |
| `/api/config` | 代理到 Next.js :5000 |
| `/api/*` | 代理到 Flask :5800（SSE 流式，3600s 超时） |
| 其余所有 | 代理到 Next.js :5000 |

## 更新代码

```bash
cd /home/ai-shifu-TTS   # Mac: /Users/benben/ai-shifu-TTS
git pull

# 后端
cd src/api && uv pip sync requirements.txt && cd ../..

# 前端
cd src/cook-web && npm install && npm run build && cp -r .next/static .next/standalone/.next/static && cd ../..
# CentOS 7 / Node 20 变体改为：先注释 next.config.ts 的 output: 'standalone'，再
# npx next build --turbopack（不需要 cp 静态资源那步）

# 重启应用进程（kill 旧的再启动，或 systemd restart）
```

## 生产部署（systemd 托管）

Linux 服务器上建议用 systemd 托管应用进程：开机自启、崩溃自动重启、日志走 journald。
两个服务分别对应两种运行时：

| 服务 | 运行时 | 进程 |
|------|--------|------|
| `ai-shifu-api` | Python（uv venv 里的 gunicorn） | Flask API :5800 |
| `ai-shifu-frontend` | Node.js（npm 构建产物 standalone server.js） | Next.js :5000 |

模板文件已放在 `deploy/systemd/` 下，安装前先确认路径和可执行文件位置。

### 1. 确认两个运行时的可执行路径

systemd 需要 `ExecStart` 使用**绝对路径**，且 nvm 安装的 Node 不在 systemd 默认 `PATH` 里：

```bash
# Python：gunicorn 在 uv 创建的 venv 中，路径固定
ls src/api/.venv/bin/gunicorn    # /home/ai-shifu-TTS/src/api/.venv/bin/gunicorn

# Node：取决于安装方式
which node
# /usr/bin/node 或 /usr/local/bin/node  → 包管理器安装，直接用
# /home/<user>/.nvm/versions/node/v22.x.x/bin/node  → nvm 安装，见下方处理
node -v    # 确认是 22.x
```

**nvm 安装的 Node 有两种处理方式**（任选其一）：

```bash
# 方式 A（推荐）：软链到系统路径，service 文件不用改
sudo ln -s "$(which node)" /usr/local/bin/node

# 方式 B：把 service 文件里的 /usr/bin/node 改成 `which node` 的完整路径
```

### 2. 准备运行用户和目录权限

**CentOS 7 / RHEL 上没有 `www-data`**（那是 Debian/Ubuntu 的用户），模板里的
`User=www-data` 会直接报 `status=217/USER` 起不来。三种选法：

- **最省事**：直接用检出代码的那个登录用户（如 `xingle`）——文件属主本来就是它，
  什么都不用改；
- **推荐**：新建一个专用运行用户，权限最小化（不能登录、没有密码）：

  ```bash
  # -r 系统账号（不建密码、UID 从系统区间分配）
  # -m 创建 home 目录（gunicorn 等工具需要 home 存在）
  # -s /sbin/nologin 禁止交互登录
  sudo useradd -r -m -d /home/ai-shifu -s /sbin/nologin ai-shifu

  # 只把需要写的目录交给它；代码目录保持原属主（否则你自己 git pull 会失败），
  # 默认 755/644 权限下 ai-shifu 已可读
  sudo chown -R ai-shifu:ai-shifu /home/xingle/ai-shifu-TTS/storage \
      /home/xingle/ai-shifu-TTS/logs
  # 确保它所在路径可穿透（CentOS 的 home 默认 700，其他用户进不去）
  sudo chmod 755 /home/xingle
  # 之后 service 文件里写 User=ai-shifu / Group=ai-shifu
  ```

- 或者**让 `www-data` 在 CentOS 上存在**，模板文件就不用改用户名：

  ```bash
  sudo useradd -r -m -d /home/www-data -s /sbin/nologin www-data
  sudo chown -R www-data:www-data /home/xingle/ai-shifu-TTS/storage \
      /home/xingle/ai-shifu-TTS/logs
  # 代码目录仍属原用户，但要保证 www-data 能读（home 可穿透 + 文件可读）
  sudo chmod 755 /home/xingle
  ```

```bash
# 用 www-data（或你选的运行用户）时，让其能读写存储和日志目录
sudo chown -R www-data:www-data /home/ai-shifu-TTS/storage
sudo chown -R www-data:www-data /home/ai-shifu-TTS/logs

# 项目代码只需可读；如果上层目录权限过严，放开执行权限
sudo chmod 755 /home /home/ai-shifu-TTS
```

### 3. 安装并启动服务

```bash
sudo cp deploy/systemd/ai-shifu-api.service /etc/systemd/system/
sudo cp deploy/systemd/ai-shifu-frontend.service /etc/systemd/system/

# 按上面第 1、2 步确认的结果修改两个文件中的 User、路径、node 可执行文件
sudo vi /etc/systemd/system/ai-shifu-api.service
sudo vi /etc/systemd/system/ai-shifu-frontend.service

sudo systemctl daemon-reload
sudo systemctl enable --now ai-shifu-api ai-shifu-frontend
```

验证：

```bash
systemctl status ai-shifu-api ai-shifu-frontend
curl http://127.0.0.1:5800/api/health
curl http://127.0.0.1:5000
```

### 4. 日常运维

```bash
# 查看日志（-f 跟随输出）
journalctl -u ai-shifu-api -f
journalctl -u ai-shifu-frontend -f

# 重启 / 停止
sudo systemctl restart ai-shifu-api ai-shifu-frontend
sudo systemctl stop ai-shifu-api ai-shifu-frontend
```

### 5. 更新代码后的操作

对应上文「更新代码」一节，`git pull` + 重新安装依赖 + 重新构建之后：

```bash
sudo systemctl restart ai-shifu-api ai-shifu-frontend
```

后端只改了 Python 代码时只需重启 `ai-shifu-api`；前端重新 `npm run build` 后只需重启 `ai-shifu-frontend`。

### 注意事项

- 前端服务的 `I18N_ROOT` / `PORT` / `HOSTNAME` 必须写在 `Environment=` 里：`server.js` 启动时会 `process.chdir()` 到 `.next/standalone/`，`.env` 加载不到（见上文步骤 4 的说明）。
- `ai-shifu-api` 使用 `Type=notify`，gunicorn 原生支持 systemd 通知协议；如果你的发行版上启动卡在 `activating`，改成 `Type=simple` 即可。
- Celery worker/beat 如有需要，按 `ai-shifu-api` 的模板同理添加。
