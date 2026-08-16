# AI-Shifu-TTS 部署指南

> 部署/运维中遇到报错，先查 [trouble-shoot.md](trouble-shoot.md)（按症状索引的排障手册）。
> Mac 本地局域网测试机见 [DEPLOY-MAC.md](DEPLOY-MAC.md)（仅差异点）。

## 架构

```
浏览器 :80 → Nginx → /_next/static/  → 直接读磁盘（缓存 30 天）
              ├─ /api/i18n、/api/config → Next.js (standalone) :5000
              ├─ /api/*                 → Flask (gunicorn) :5800（SSE，3600s 超时）
              └─ 其余所有               → Next.js (standalone) :5000
```

需要 3 个进程：Nginx + gunicorn + Next.js。

两个变体（见文末章节，可组合）：

- **A：[Apache 占用 80 端口](#变体-aapache-占用-80-端口apache-80--nginx-88)** —
  Apache :80 整体转发 → Nginx :88，内部路由不变
- **B：[CentOS 7（Node 20）](#变体-bcentos-7node-20turbopack-构建--npm-start-运行)** —
  turbopack 构建 + `npm start` 运行

## 依赖

| 依赖 | 版本 |
|------|------|
| Node.js | 22.x（CentOS 7 老机器只能 20.x，见变体 B） |
| Python | 3.11+ |
| MySQL | 8.x |
| Redis | 7.x |
| uv | 最新 |
| Nginx | 最新 |

> 约定：下文 `<项目>` 统一指 `/home/xingle/ai-shifu-TTS`，运行用户统一 `ai-shifu`，
> 按实际情况替换。

## 部署步骤

### 1. 克隆项目、启动基础服务

```bash
git clone <repo> /home/xingle/ai-shifu-TTS && cd /home/xingle/ai-shifu-TTS

sudo systemctl enable --now mysql redis

mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`ai-shifu\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
```

### 2. 配置环境变量

```bash
cp docker/.env.example.full src/api/.env
cp docker/.env.example.full src/cook-web/.env   # 两份内容相同
```

必改项：

| 变量 | 改什么 |
|------|--------|
| `SECRET_KEY` | 随机值：`python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `SQLALCHEMY_DATABASE_URI` | 设 MySQL 密码；`ai-shifu-mysql` → `127.0.0.1` |
| LLM key | 至少一个，如 `OPENAI_API_KEY` |
| `REDIS_HOST` | `ai-shifu-redis` → `127.0.0.1` |
| `LOCAL_STORAGE_ROOT` | `<项目>/storage`（目录在步骤 3 前建好：`mkdir -p storage`） |
| `I18N_ROOT` / `SHARED_I18N_ROOT` | 指向 `<项目>/src/i18n`（构建与运行都需要） |

若 `.env` 里有 `NEXT_PUBLIC_API_BASE_URL`，删除或注释（前端自动按访问地址拼接），
修改后需要重新 build。

### 3. 后端

```bash
cd src/api
uv venv .venv
uv pip install -r requirements.txt   # 不要用 pip sync，会删包（trouble-shoot §10）
export FLASK_APP=app.py
.venv/bin/flask db upgrade
```

### 4. 前端

```bash
cd src/cook-web
npm install
npm run build        # CentOS 7 / Node 20 机器改用变体 B，webpack 会 segfault
```

静态资源由 Nginx 直接服务（步骤 5），build 后**无需**复制到 standalone 目录。

### 5. Nginx

```bash
sudo cp deploy/nginx/ai-shifu.conf /etc/nginx/conf.d/ai-shifu.conf
```

改两处再 reload：

- `server_name`：域名，或保持 `_`
- `location /_next/static/` 的 `alias`：指向 `<项目>/src/cook-web/.next/static/`

```bash
nginx -t && sudo nginx -s reload
```

### 6. 首次手动启动验证（可选）

```bash
# 终端 1：后端
cd src/api && .venv/bin/gunicorn -w 4 -b 127.0.0.1:5800 --timeout 300 'app:app'

# 终端 2：前端。server.js 会 chdir，.env 读不到，I18N_ROOT 必须显式传
cd src/cook-web
I18N_ROOT="$(pwd)/../i18n" node .next/standalone/server.js
```

验证：`curl http://127.0.0.1:5800/api/health`、`curl http://127.0.0.1:5000`，
浏览器经 Nginx 走一遍页面/登录/对话。通过后 Ctrl+C 停掉，转步骤 7。

### 7. systemd 托管（生产）

| 服务 | 模板 | 进程 |
|------|------|------|
| `ai-shifu-api` | `deploy/systemd/ai-shifu-api.service` | gunicorn :5800 |
| `ai-shifu-frontend` | `deploy/systemd/ai-shifu-frontend.service` | standalone server.js :5000 |

**7.1 运行用户**（CentOS/RHEL 没有 `www-data`，完整说明见 trouble-shoot §1）：

```bash
sudo useradd -r -m -d /home/ai-shifu -s /sbin/nologin ai-shifu
sudo chown -R ai-shifu:ai-shifu <项目>     # git pull 等操作也统一用该用户
sudo chmod 755 /home/xingle                # home 默认 700，运行用户要能穿透
```

**7.2 可执行路径**：`ExecStart` 必须绝对路径。nvm 装的 Node 先挪到 `/opt`
再软链（详见 trouble-shoot §3/§4）：

```bash
sudo ln -sf /opt/node-v22.x.x/bin/node /usr/local/bin/node
sudo ln -sf /opt/node-v22.x.x/bin/npm  /usr/local/bin/npm
sudo ln -sf /opt/node-v22.x.x/bin/npx  /usr/local/bin/npx
```

**7.3 安装启动**：

```bash
sudo cp deploy/systemd/ai-shifu-{api,frontend}.service /etc/systemd/system/
# 按上面确认的结果改两份文件里的 User / Group / 路径
sudo vi /etc/systemd/system/ai-shifu-api.service /etc/systemd/system/ai-shifu-frontend.service

sudo systemctl daemon-reload
sudo systemctl enable --now ai-shifu-api ai-shifu-frontend

systemctl status ai-shifu-api ai-shifu-frontend
curl http://127.0.0.1:5800/api/health && curl http://127.0.0.1:5000
```

**7.4 日常运维**：

```bash
journalctl -u ai-shifu-api -f              # 看日志（前端同理）
sudo systemctl restart ai-shifu-api ai-shifu-frontend
```

前端服务的 `I18N_ROOT` / `PORT` / `HOSTNAME` 必须写在 `Environment=` 里
（原因同步骤 6，模板已含）。

## 更新代码

> **所有 git/npm/uv/flask 命令以运行用户执行**（`sudo -u ai-shifu ...`），root 只做
> `systemctl`/`chown` 等提权操作。混用身份会制造 root 属主文件导致服务崩
> （trouble-shoot 通用教训）。

```bash
cd <项目> && sudo -u ai-shifu git pull

# 后端（有新依赖/迁移时）
cd src/api
sudo -u ai-shifu /usr/local/bin/uv pip install -r requirements.txt --python .venv/bin/python
sudo -u ai-shifu .venv/bin/flask db upgrade

# 前端（有前端改动时）
cd src/cook-web && sudo -u ai-shifu npm install && sudo -u ai-shifu npm run build
# 变体 B 机器走变体章节的 turbopack 流程

sudo systemctl restart ai-shifu-api ai-shifu-frontend
```

只改了后端只重启 `ai-shifu-api`；只重新 build 前端只重启 `ai-shifu-frontend`。

## 变体 A：Apache 占用 80 端口（Apache :80 → Nginx :88）

场景：Apache 已监听 80 且还在服务其他站点，80 不能让给 Nginx。Apache 做一层整体
转发，路由规则仍在 Nginx 维护，与主方案一致。

| 文件 | 安装位置（CentOS/RHEL） |
|------|------------------------|
| `deploy/apache/ai-shifu-apache.conf` | `/etc/httpd/conf.d/ai-shifu.conf` |
| `deploy/nginx/ai-shifu-88.conf` | `/etc/nginx/conf.d/ai-shifu-88.conf` |

1. **Nginx**：cp `ai-shifu-88.conf` 并改 `alias` 路径；删掉主方案的 `ai-shifu.conf`
   避免重复 server 块；`nginx -t && sudo nginx -s reload`。
2. **Apache**：确认 `mod_proxy`、`mod_proxy_http` 已加载（Debian/Ubuntu 需
   `a2enmod proxy proxy_http`）；cp vhost 改 `ServerName`；
   `apachectl configtest && sudo systemctl reload httpd`。
3. **SELinux**（CentOS/RHEL）：`sudo setsebool -P httpd_can_network_connect 1`，
   否则 Apache 连 88、Nginx 连后端会被拦，表现为 502/503。
4. **验证**：`curl http://127.0.0.1:88/` → `curl http://127.0.0.1/ -H 'Host: <域名>'`
   → 浏览器全链路（页面、登录、SSE 对话）。

注意：vhost 保持 `ProxyPreserveHost On`（前端靠 Host 拼 API 地址）；
`flushpackets=on`（SSE 不被 Apache 缓冲）；真实客户端 IP 经 `X-Forwarded-For`
透传（`ai-shifu-88.conf` 已处理）。

## 变体 B：CentOS 7（Node 20，turbopack 构建 + npm start 运行）

场景：CentOS 7（glibc 2.17）装不上 Node 22，只能 Node 20。可与变体 A 组合，
后端不受影响。

| 环节 | 主方案（Node 22） | 变体 B（Node 20） |
|------|-------------------|-------------------|
| 构建 | `npm run build` | `npx next build --turbopack`（webpack 在 glibc 2.17 上 segfault） |
| `next.config.ts` | 原样 | build 前临时注释 `output: 'standalone'`，build 后可还原 |
| 运行 | `node .next/standalone/server.js` | `npm start`（`next start`，与 standalone 产物不兼容） |
| `/_next/static/` | Nginx alias 直读 | Next 自己 serve，**删掉 Nginx 的 alias 段** |
| `I18N_ROOT` | 必须显式传入 | 不需要（cwd 正常，`/api/i18n` 自动回退到 `../i18n`） |

1. **注释 standalone**：`src/cook-web/next.config.ts` 里 `output: 'standalone',`
   前加 `//`。
2. **构建**（跨用户执行要带 PATH，原因见 trouble-shoot §4）：

   ```bash
   sudo -u ai-shifu env PATH=/opt/node-v20.x.x/bin:/usr/local/bin:/usr/bin:/bin \
     npx next build --turbopack
   ```

   完成后还原 `next.config.ts`（不影响已构建产物）。
3. **启动**：手动验证 `cd src/cook-web && PORT=5000 npm start`
   （`curl http://127.0.0.1:5000` 与 `/api/i18n`）；systemd 改用
   `deploy/systemd/ai-shifu-frontend-npmstart.service`（`ExecStart` 必须指向
   构建所用 Node 20 的 npm）。
4. **Nginx**：删掉 `location /_next/static/ { ... }` 整段（Next 自己 serve），
   其余路由不变。

注意：日常重启不受影响；**重新 build 必须重做第 1、2 步**。`npm start` 端口由
`PORT` 控制，与其他项目冲突时换端口并同步 Nginx upstream。系统升级到
glibc ≥ 2.28（Rocky 9 等）后回归主方案。

## 端口与路由参考

| 端口 | 服务 | 访问方式 |
|------|------|----------|
| 80 | Nginx（主方案）/ Apache（变体 A） | 浏览器直接访问 |
| 88 | Nginx（仅变体 A） | 仅本机，Apache 转发 |
| 5800 | Flask | 仅本机，Nginx 代理 |
| 5000 | Next.js（端口可换，与 Nginx upstream 同步） | 仅本机，Nginx 代理 |
| 3306 / 6379 | MySQL / Redis | 仅本机 |
