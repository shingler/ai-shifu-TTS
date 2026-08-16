# AI-Shifu-TTS 部署排障手册

记录实际部署中踩过的坑，按「症状」索引。场景以 CentOS 7（glibc 2.17、
systemd 219、Apache :80 → Nginx :88、systemd 托管）为主，多数坑在其他
发行版上同样会出现。

## 症状速查表

| 症状 | 根因 | 见章节 |
|------|------|--------|
| service 起不来，`status=217/USER` | `User=` 用户不存在 | [1](#1-217user--用户不存在) |
| gunicorn `status=1`，日志有 `PermissionError: /tmp/unified_migration.log` | `/tmp` 日志文件属主是 root | [2](#2-permissionerror--tmpunified_migrationlog) |
| 前端 `status=1`，日志提示 Node 版本不满足 Next.js 要求 | `ExecStart` 指到了系统老版本 Node | [3](#3-node-版本不满足-nextjs-要求) |
| `status=203/EXEC`，路径明明存在 | 路径不存在 / shebang 解释器悬空（venv 拷贝来的）/ 运行用户进不去文件路径 | [4](#4-203exec--可执行文件起不来) |
| `status=200/CHDIR`，Changing to the requested working directory failed | 运行用户无法穿透 `WorkingDirectory` 上层目录 | [9](#9-200chdir--进不了工作目录) |
| `Error: listen EADDRINUSE` | 端口被其他项目 / pm2 旧进程占用 | [5](#5-eaddrinuse--端口被占) |
| `npx next build` 段错误（segfault） | glibc 2.17 上 webpack 跑不了 | [6](#6-webpack-构建-segfault) |
| `next start` 报与 `output: standalone` 不兼容 | 构建时没注释 standalone | [7](#7-next-start-与-standalone-冲突) |
| 反复 `ModuleNotFoundError` | `uv pip sync` 卸载了 requirements 之外的依赖 | [10](#10-反复-modulenotfounderror--pip-sync-的删除语义) |
| 改了 service / nginx 配置不生效 | 忘了 `daemon-reload` / `reload` | [8](#8-改了配置不生效) |

---

## 1. `217/USER` — 用户不存在

**症状**：`systemctl status` 显示 `code=exited, status=217/USER`，service
反复 auto-restart。

**原因**：模板里的 `User=www-data` 是 Debian/Ubuntu 的用户，CentOS 7 / RHEL
上没有这个用户。

**修复**：三选一。

```bash
# 方案 A：直接用检出代码的登录用户（最省事，文件属主本来就是它）
#   service 里 User=xingle / Group=xingle

# 方案 B：新建专用运行用户
sudo useradd -r -m -d /home/ai-shifu -s /sbin/nologin ai-shifu
sudo chown -R ai-shifu:ai-shifu <项目>/storage <项目>/logs   # 只交可写目录，代码别动
sudo chmod 755 /home/<登录用户>   # home 默认 700，其他用户要能穿透

# 方案 C：把 www-data 建出来，模板用户名就不用改
sudo useradd -r -m -d /home/www-data -s /sbin/nologin www-data
```

**注意**：`-m` 必须带（gunicorn 等工具要求 home 存在）；如果还要用登录用户
`git pull`，**不要**把整个项目 chown 给运行用户，否则 `.git` 写不进去。

## 2. `PermissionError` — `/tmp/unified_migration.log`

**症状**：gunicorn `status=1`，journalctl 里的 traceback 末端是：

```
PermissionError: [Errno 13] Permission denied: '/tmp/unified_migration.log'
```

**原因**：`src/api/flaskr/command/unified_migration_task.py` 在**模块导入时**
创建 `logging.FileHandler("/tmp/unified_migration.log")`。只要此前用 root
跑过一次 flask（比如手动启动、`flask db upgrade`），该文件属主就是 root；
之后 service 换成普通用户运行，打开失败，整个 API 加载即崩。

**修复**：

```bash
sudo rm -f /tmp/unified_migration.log
sudo systemctl restart ai-shifu-api
```

普通用户的进程会自己重建该文件。**预防**：迁移等管理命令一律以 service 的
运行用户执行，别用 root：

```bash
cd <项目>/src/api
sudo -u xingle ./venv311/bin/flask db upgrade
```

一旦再用 root 跑过，此文件又变回 root 属主，下次 service 重启复发。

## 3. Node 版本不满足 Next.js 要求

**症状**：前端 `status=1`，journalctl 显示：

```
You are using Node.js 16.18.0. For Next.js, Node.js version
"^18.18.0 || ^19.8.0 || >= 20.0.0" is required.
```

**原因**：`ExecStart=/usr/bin/npm` 指向的是发行版软件源里的老 Node
（CentOS 7 上是 Node 16）。构建用的 Node 20（nvm 装的）和运行时不是同一个。

**诊断**：交互 shell 里 `node -v` 显示 20 不代表 service 用的也是 20——
nvm 只在登录 shell 生效，systemd 只认 `ExecStart` 里的绝对路径。

**修复**：`ExecStart` 指向与构建时**相同大版本**的 npm（结合下面第 4 条的
`/usr/local/bin` 软链最省事）。

## 4. `203/EXEC` — 可执行文件起不来

**症状**：`status=203/EXEC`。

**含义**：内核无法执行 `ExecStart` 指向的文件。不只是"没权限"，常见原因
按概率排：

1. **路径不存在**——`ExecStart` 写的是模板默认值，机器上实际不是这个
   （如 venv 叫 `venv311` 而不是 `.venv`）；
2. **shebang 解释器悬空**——脚本文件本身在，但第一行指向的解释器不存在。
   典型：venv 是从别的机器拷来的 / 创建时用的 Python 后来被删，`.venv/bin/python*`
   成为断链。**venv 不可跨机器迁移**，唯一正解是在本机重建；
3. **运行用户进不去文件所在路径**——如 Node 装在 `/root/.nvm/...` 下而
   `/root` 是 700，普通用户的服务无法执行（root 登录时一切正常，极具迷惑性）；
4. 文件缺可执行位（少见）。

**诊断**：

```bash
ls -l <ExecStart 路径>            # 文件在不在、有没有 x 位
head -1 <ExecStart 路径>          # shebang 指向谁
ls -l <解释器路径>                # 是否悬空链接
sudo -u <运行用户> <ExecStart 路径> --version   # 直接执行一次，错误会直说
```

**修复实例（root 的 nvm）**：把 Node 挪到公共位置（nvm 的版本目录自包含，
整拷即可）：

```bash
sudo cp -a /root/.nvm/versions/node/v20.18.3 /opt/node-v20.18.3
sudo chmod -R a+rX /opt/node-v20.18.3
sudo ln -sf /opt/node-v20.18.3/bin/node /usr/local/bin/node
sudo ln -sf /opt/node-v20.18.3/bin/npm  /usr/local/bin/npm
sudo ln -sf /opt/node-v20.18.3/bin/npx  /usr/local/bin/npx

# 用运行用户验证
sudo -u xingle /usr/local/bin/node -v   # v20.18.3
```

之后 service 用 `ExecStart=/usr/local/bin/npm start`；构建也统一用这套，
保证构建与运行时是同一个 Node。

**修复实例（venv 悬空/名字对不上）**：在本机重建 venv，service 指向真实路径：

```bash
cd <项目>/src/api
uv venv .venv && uv pip install -r requirements.txt
```

**同族变体（工具按用户安装）**：uv / nvm 这类工具默认装进**某个用户的家目录**
（`~/.local/bin`、`~/.nvm`）。切用户执行时会遇到两层障碍：`sudo -u` 重置了
PATH 找不到命令（command not found）；装在 `/root` 名下时其他用户根本无权执行
（`/root` 是 700）。修法：工具二进制挪到系统路径，所有用户共用：

```bash
cp <uv 实际路径> /usr/local/bin/uv   # uv 是单个静态二进制，直接拷即可
# 注意 sudo 的 secure_path 不含 /usr/local/bin，跨用户调用要写全路径：
sudo -u <运行用户> /usr/local/bin/uv venv .venv --python /usr/bin/python3.11
```

**uv 安装的 Python 同理**：`uv python install` 落在执行用户的
`~/.local/share/uv/python/`。root 装的在其他用户名下不可执行（`/root` 700），
203 复发。要用 uv 装，必须以运行用户身份：

```bash
sudo -u <运行用户> /usr/local/bin/uv python install 3.11
sudo -u <运行用户> /usr/local/bin/uv venv .venv --python 3.11
```

更稳的是系统包：`dnf install python3.11`，venv 指 `/usr/bin/python3.11`，
不依赖任何用户目录，也不怕 `uv cache clean`。

## 5. `EADDRINUSE` — 端口被占

**症状**：`Error: listen EADDRINUSE: address already in use :::5000`。

**诊断**（必须 root 身份，否则看不到进程名）：

```bash
ss -ltnp | grep 5000
systemctl list-units --all 'ai-shifu-*'
pm2 list
```

**常见占用者与处理**：

| 占用者 | 处理 |
|--------|------|
| pm2 里的旧 ai-shifu 进程 | `pm2 delete <名>` + **`pm2 save`**（不 save 机器重启后会复活），再重启 service |
| 同机其他项目（误选了它的端口） | ai-shifu 前端换端口：改 service 的 `Environment=PORT=` **和** nginx 的 `frontend_backend` upstream，两处必须一致 |
| 手动起的测试进程 | `kill` 主进程 |

**注意**：改端口是两处联动（service + nginx upstream），只改一边会 502。
选端口前先 `ss -ltnp` 确认目标端口空闲；同机多项目时建议先规划好端口表。

## 6. webpack 构建 segfault

**症状**：`npm run build` 在 CentOS 7（glibc 2.17）上段错误退出。

**原因**：Next.js 的 webpack 构建链在老 glibc 上崩溃。

**修复**：改用 turbopack：

```bash
npx next build --turbopack
```

这是 CentOS 7 变体的固定做法，见 DEPLOY.md「变体：CentOS 7（Node 20）」。
升级到 glibc ≥ 2.28 的系统后可恢复 `npm run build`。

## 7. `next start` 与 standalone 冲突

**症状**：`next start` 拒绝启动，报与 `output: 'standalone'` 配置不兼容。

**原因**：`npm start`（`next start`）只能运行普通构建产物；standalone 产物
要用 `node .next/standalone/server.js` 跑。构建时 `next.config.ts` 里
`output: 'standalone'` 没注释掉，产物就成了 standalone 的。

**修复**：重新构建——注释 `output: 'standalone'` → `npx next build
--turbopack` → 还原配置 → 重启 service。构建产物不受配置还原影响。

**关联**：用 `next start` 时 Next 自己 serve 静态资源，nginx 里
`/_next/static/` 的 alias 段要删掉，否则静态资源 404。

## 8. 改了配置不生效

| 改动 | 必须执行 |
|------|----------|
| `/etc/systemd/system/*.service` | `sudo systemctl daemon-reload` 再 restart |
| `/etc/nginx/**` | `nginx -t && sudo nginx -s reload` |
| `/etc/httpd/**`（Apache） | `apachectl configtest && sudo systemctl reload httpd` |
| `.env`（后端） | 重启对应 service |

`daemon-reload` 漏掉最常见：systemd 读的是它自己缓存的 unit 定义，直接
`restart` 用的还是旧配置。

## 9. `200/CHDIR` — 进不了工作目录

**症状**：`status=200/CHDIR`，日志显示：

```
Changing to the requested working directory failed: Permission denied
Failed at step CHDIR spawning <ExecStart 路径>
```

**原因**：systemd 启动进程前要先 `cd` 到 `WorkingDirectory`。运行用户在路径的
**某一级上层目录**上没有执行（穿透）权限。典型情形：

- service `User=` 不是检出代码的用户（如 `www-data`），而 `/home/<用户>`
  是默认的 700/750，别人进不去；
- 项目某层目录属主是 root（用 root 克隆 / 构建过），运行用户穿不过去。

与第 4 条 `203/EXEC` 同源：**路径权限对运行用户不透明**，只是这次卡在
chdir 阶段，还没轮到执行二进制。

**诊断**：

```bash
grep -E '^(User|Group|WorkingDirectory)' /etc/systemd/system/ai-shifu-api.service
namei -l /home/<用户>/ai-shifu-TTS/src/api   # 逐级列出每层权限/属主，哪层挡住一目了然
```

**修复**（按 namei 指出的那层对症）：

```bash
# 情况 A：home 挡住了其他运行用户 → 放开穿透权限（不需要放开读写）
sudo chmod 755 /home/<用户>
# 或更彻底：service 改 User=<检出代码的用户>，不动 home 权限

# 情况 B：项目目录本身属主不对（曾被 root 接管）→ 交还给运行用户
sudo chown -R <用户>:<用户> /home/<用户>/ai-shifu-TTS
```

## 10. 反复 `ModuleNotFoundError` — pip sync 的删除语义

**症状**：装完依赖启动仍缺模块，补一个又冒一个
（`importlib_metadata`、`opentelemetry.exporter.otlp.proto.common` 等）。

**原因**：`uv pip sync` 让环境**严格等于** requirements.txt——不在文件里的包
一律**卸载**。本仓库 requirements.txt 落后于代码（fork 历史冻结 + 上游新增依赖），
sync 会把代码实际需要的传递依赖清掉。

**修复**：改用只加不减的安装方式：

```bash
sudo -u <运行用户> /usr/local/bin/uv pip install -r requirements.txt
# 手动补缺的包也用 install，下次 sync 前不会再被删
```

**预防**：requirements.txt 与代码同步落后时，一律 `install -r`，不用 `sync`。

## 通用教训

- **root 与运行用户的隔离是这批坑的共同根源**：root 跑过的进程会在 `/tmp`、
  项目目录、nvm 目录留下 root 属主的文件和工具链，普通用户的服务全部碰壁。
  部署、构建、迁移尽量全程用同一个普通用户（需要提权时 `sudo -u <用户>`
  执行具体命令，而不是全程 root shell）。
- **systemd 看到的世界 ≠ 登录 shell 看到的世界**：PATH、nvm、环境变量都
  不共享，一切以 service 文件里的绝对路径和 `Environment=` 为准。
- **迁移进程管理器（pm2 → systemd）要一次切干净**：删掉 pm2 里的旧进程并
  `pm2 save`，否则每次机器重启都会发生端口争夺。
