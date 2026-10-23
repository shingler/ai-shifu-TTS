# 升级手册（本地开发 + 生产服务器 B）

> 日常 `git pull` 后的升级步骤，按环境抄命令即可。
> 遇到报错先查 [trouble-shoot.md](trouble-shoot.md)；首次部署见 [DEPLOY.md](DEPLOY.md)。
> 合并上游新版本（merge upstream）比日常 pull 多做的事，见文末[单独章节](#合并上游新版本时)。
> 2026-10-23 架构变更（A 应用栈弃用、B 承接全部应用、A 仅剩数据服务）的背景与
> 完整实录见 [UPGRADE-v2.3.4-2026-10-13.md](UPGRADE-v2.3.4-2026-10-13.md)。

## 环境一览

| 环境 | 系统 | venv | 数据库 | 角色 |
|------|------|------|--------|------|
| 本地开发 | Windows 10 | `src/api/.venv`（uv 建，无 pip） | 本地 Docker MySQL | 日常开发 |
| **服务器 B（noah）** | Rocky 9 | `src/api/.venv`（uv 建） | 远程：A 上的 MySQL | **唯一生产应用服务器**（API + 前端 + nginx + 上传存储），**唯一执行 `flask db upgrade` 的机器**（连 A 的库） |
| 服务器 A | 实际 EL7（glibc 2.17） | —（应用栈已弃用） | MySQL + redis 在本机 | **仅数据服务**：不跑任何应用进程，不做升级 |

两台服务器与朋友共用：`/home/xingle` 只是应用存放目录（xingle 不是用户账户），
实际以 root/共享身份登录；systemd 服务统一以 `ai-shifu` 用户运行。上传存储
`src/api/storage/` 在 B 上，**B 是唯一写入方**（A 上的旧副本已过时，禁止回同步）。

## 三条红线

1. **服务器上绝不用 root 直接跑后端命令**（pip / flask / gunicorn）。
   root 跑过一次，`logs/`、`/tmp/unified_migration.log` 属主就变 root，服务启动即
   PermissionError（已踩过两次）。一律 `sudo -u ai-shifu` + 绝对路径。
2. **迁移只在 B 上执行**（数据库在 A，B 连库执行）。A 不再跑任何
   pip / flask / systemctl 应用命令——A 上需要照看的只有 `mysqld`、`redis`
   （以及若域名仍从 A 反代时的 nginx）。
3. **`git pull` 后必重装两端依赖**再重启。"代码新、依赖旧"会让后端启动即崩
   （历史案例：cffi 版本冲突、缺 dnspython 导致全部 `/api/` 502、
   markdown-flow-ui 残留旧版导致 build 类型错误）。

## 升级顺序

```text
本地 Windows 验证 → B 升级（含迁移，如本次有）→ A 无应用，无需操作
```

- 判断"有迁移"：`git log --oneline -- src/api/migrations/versions` 有新提交即有。
- B 跑迁移连的是 A 的库，**先确认 A 的 `mysqld` 存活**再执行。

## 本地 Windows 开发机

```bash
git pull

# 前端依赖
cd src/web && npm ci && cd ../..

# 后端依赖（uv venv，用 uv）
cd src/api && uv pip install -r requirements.txt && cd ../..

# 本地 Docker 库迁移
cd src/api && FLASK_APP=app.py .venv/Scripts/python.exe -m flask db upgrade && cd ../..

# 快速验证
cd src/web && npm run type-check && cd ../..
python scripts/check_repo_harness.py
```

## 服务器 B（Rocky 9 · .venv · 生产应用 + 迁移）

```bash
cd /home/xingle/ai-shifu-TTS && git pull

# root pull 后的收尾（每次 pull 后都跑，无害）
sudo chown -R ai-shifu:ai-shifu src/api/logs src/api/storage
sudo find src/api -name __pycache__ -type d -user root -exec rm -rf {} +
sudo rm -f /tmp/unified_migration.log

# 依赖 + 迁移 + 重启
cd src/api
sudo -u ai-shifu env HOME=/home/ai-shifu FLASK_APP=app.py ./.venv/bin/python -m pip install -r requirements.txt
sudo -u ai-shifu env HOME=/home/ai-shifu FLASK_APP=app.py ./.venv/bin/flask db upgrade
sudo systemctl restart ai-shifu-api

# 确认
journalctl -u ai-shifu-api -n 30
```

B 的 `.venv` 是 uv 建的、无 pip。若上面 pip 报 `No module named pip`，先补装一次：

```bash
sudo -u ai-shifu env HOME=/home/ai-shifu ./.venv/bin/python -m ensurepip --upgrade
```

## 服务器 A（仅数据服务，无升级操作）

不 pull、不跑应用命令。只需保证数据服务存活：

```bash
systemctl status mysqld redis     # 按实际服务名；B 的 API 连的就是它们
```

A 的 `mysqld` / redis 挂了 = 生产全挂。数据库侧运维（备份、账号、库内修数）
照常在 A 上做——这是 A 唯一还参与的环节。

## 服务器前端（B）

日常只重启，不 build：

```bash
sudo systemctl restart ai-shifu-frontend
```

必须重新 build 时（改了前端代码/依赖）：

```bash
cd /home/xingle/ai-shifu-TTS/src/web
sudo -u ai-shifu npm ci
sudo -u ai-shifu npm run build
sudo systemctl restart ai-shifu-frontend
# root 执行过 build 的话：sudo chown -R ai-shifu:ai-shifu .next
```

Rocky 9 上 `npm run build` 直接可用（`--turbopack` 是 EL7/glibc 2.17 专属规避，
见 trouble-shoot §6）；standalone server.js 运行方式下 `next.config.ts` 的
`output: 'standalone'` **保持不动**（需要临时注释的是 `next start` 运行场景，
见 trouble-shoot §7）。

## 合并上游新版本时

比日常 pull 多做这些（参照 2026-09 合并 v2.2.12 的实战）：

> **v2.3.4 特有（2026-10 首次升级到该版本时额外做，已完成）**：
>
> 1. **后端 `.env` 必须加 `LLM_MODEL_1_ID`**（如 `LLM_MODEL_1_ID="GLM-5-Turbo"`）。
>    上游把课程模型改为编号槽位制，model 1 必填且无默认，缺失则 API 启动即报
>    `EnvironmentConfigError`。旧变量 `DEFAULT_LLM_MODEL` 已废弃可删。
>    建议参照本地做法：以 `docker/.env.example.full`（v2.3.4 版）为骨架重写，
>    把服务器原有非空值填回去。
> 2. **前端目录已从 `cook-web` 改名为 `src/web`**。首次升级要在新路径装依赖并
>    build（`cd src/web && npm ci` + build）；`ai-shifu-frontend` 的 systemd unit
>    里 `WorkingDirectory`/`ExecStart` 若指向旧路径，同步改成 `/home/xingle/ai-shifu-TTS/src/web`。
>    确认服务正常后旧 `cook-web/` 可整目录删除。
> 3. **alembic 新增 merge head `a8f3c2d9e1b4`**（v2.2.12 head 与 v2.3.4 head 的合并点）。
>    迁移在 B 上执行（连 A 的库）；老库零日期默认值需先预修，见
>    [UPGRADE-v2.3.4-2026-10-13.md](UPGRADE-v2.3.4-2026-10-13.md)。

1. **解决冲突后必查 Alembic 双 head**。fork 与上游各自新增迁移时会分叉：

   ```bash
   # 本地快速检查（离线，不连库）
   cd src/api && python -c "
   import re, pathlib
   revs, downs = {}, set()
   for p in pathlib.Path('migrations/versions').glob('*.py'):
       t = p.read_text(encoding='utf-8', errors='replace')
       m = re.search(r'^revision\s*=\s*[\"\']([^\"\']+)', t, re.M)
       d = re.search(r'^down_revision\s*=\s*(.+)$', t, re.M)
       if not m: continue
       revs[m.group(1)] = True
       for tok in re.findall(r'[\"\']([^\"\']+)[\"\']', d.group(1) if d else ''): downs.add(tok)
   print('HEADS:', [r for r in revs if r not in downs])"
   ```

   输出超过 1 个 head 时，手写一个空 merge 迁移（模板照抄
   `migrations/versions/d4e6f8a2c1b9_*.py`：`down_revision = ('head1', 'head2')`，
   upgrade/downgrade 均 `pass`），收敛回单 head。

2. **重新生成知识索引**（`docs/exec-plans/index.md` 等生成文档冲突解决后）：

   ```bash
   python scripts/build_repo_knowledge_index.py
   python scripts/check_repo_harness.py
   ```

3. **验证**：前端 `npm run type-check` + 触及组件的 jest；后端 `python -m py_compile`
   改动的 .py。

4. 合并提交后，按[升级顺序](#升级顺序)推到服务器：B（含迁移，若本次有）。

## 升级后的验证

```bash
# 服务器 B 上
systemctl status ai-shifu-api ai-shifu-frontend --no-pager
journalctl -u ai-shifu-api -n 30
curl -i http://127.0.0.1:5800/api/config      # 本机直连 flask，绕过 nginx
```

排障口诀：**所有 `/api/` 集体 502 而前端首页 200 = flask 没起来**。先用上面的
curl 区分「flask 没跑」还是「nginx 配置错」，再按 [trouble-shoot.md](trouble-shoot.md)
按症状索引。nginx 上游一律显式写 `127.0.0.1:<port>`（`localhost` 可能解析为
IPv6 `::1`，表现为 502）。
