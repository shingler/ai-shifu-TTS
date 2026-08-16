# Mac 本地局域网部署（测试机）

> 本文只列 Mac 与 Linux 服务器的**差异**，基础流程（.env、后端、前端、Nginx
> 路由）见 [DEPLOY.md](DEPLOY.md)，报错查 [trouble-shoot.md](trouble-shoot.md)。

## 差异速查

| 环节 | Linux 服务器 | Mac（Homebrew） |
|------|--------------|-----------------|
| 项目路径 | `/home/xingle/ai-shifu-TTS` | `/Users/benben/ai-shifu-TTS` |
| MySQL/Redis | `systemctl enable --now` | `brew services start mysql redis` |
| Nginx 配置位置 | `/etc/nginx/conf.d/` | `/opt/homebrew/etc/nginx/servers/` |
| 进程托管 | systemd | 手动前台 / `brew services` |
| 访问地址 | IP 或域名 | `http://benben.local`（局域网内均可） |

## 步骤

### 1. 安装依赖

```bash
brew install mysql redis nginx node@22 uv
brew services start mysql redis
```

### 2. 克隆与配置

```bash
git clone <repo> /Users/benben/ai-shifu-TTS
cd /Users/benben/ai-shifu-TTS
```

`.env` 必改项同 DEPLOY.md 步骤 2，其中 Mac 特有的路径：

| 变量 | Mac 值 |
|------|--------|
| `LOCAL_STORAGE_ROOT` | `/Users/benben/ai-shifu-TTS/storage` |
| `I18N_ROOT` / `SHARED_I18N_ROOT` | `/Users/benben/ai-shifu-TTS/src/i18n` |

### 3. 后端 / 前端

与 DEPLOY.md 步骤 3、4 完全相同（`uv venv`、`uv pip install -r`、
`flask db upgrade`、`npm run build`）。Mac 上 Node 22 可正常 `npm run build`，
无需变体 B。

### 4. 手动启动

```bash
# 终端 1：后端
cd src/api && .venv/bin/gunicorn -w 4 -b 127.0.0.1:5800 --timeout 300 'app:app'

# 终端 2：前端（I18N_ROOT 同样必须显式传，原因见 trouble-shoot §13）
cd src/cook-web
I18N_ROOT="$(pwd)/../i18n" node .next/standalone/server.js
```

### 5. Nginx

```bash
sudo cp deploy/nginx/ai-shifu.conf /opt/homebrew/etc/nginx/servers/ai-shifu.conf
```

改两处：

```nginx
server_name _ benben.local;
alias /Users/benben/ai-shifu-TTS/src/cook-web/.next/static/;
```

hosts 里确认有（局域网其他设备通过 Bonjour 解析 `benben.local`）：

```bash
grep benben.local /etc/hosts || sudo sh -c 'echo "127.0.0.1  benben.local" >> /etc/hosts'
```

监听 80 需要 root 启动：

```bash
sudo nginx -t && sudo nginx
# 已在跑则 reload：sudo nginx -s reload
```

### 6. 验证

- 本机：`curl http://benben.local/`
- 局域网其他设备：浏览器直接访问 `http://benben.local`
- 不走 Nginx 直连前端时，前端会自动用 `window.location.hostname` 拼后端
  地址（`hostname:5800`），无需额外配置
