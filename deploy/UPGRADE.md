# 三环境升级手册

> 日常 `git pull` 后的升级步骤，按环境抄命令即可。
> 遇到报错先查 [trouble-shoot.md](trouble-shoot.md)；首次部署见 [DEPLOY.md](DEPLOY.md)。
> 合并上游新版本（merge upstream）比日常 pull 多做的事，见文末[单独章节](#合并上游新版本时)。

## 环境一览

| 环境 | 系统 | venv | 数据库 | 用途 |
|------|------|------|--------|------|
| 本地开发 | Windows 10 | `src/api/.venv`（uv 建，无 pip） | 本地 Docker MySQL | 日常开发 |
| 服务器 A | Rocky 8 | `src/api/venv311`（标准 venv） | **在 A 上** | 生产：后台编写课程 |
| 服务器 B | Rocky 9 | `src/api/.venv`（uv 建，无 pip） | 无 | 内测 |

两台服务器与朋友共用：`/home/xingle` 只是应用存放目录（xingle 不是用户账户），
实际以 root/共享身份登录；systemd 服务统一以 `ai-shifu` 用户运行。

## 三条红线

1. **服务器上绝不用 root 直接跑后端命令**（pip / flask / gunicorn）。
   root 跑过一次，`logs/`、`/tmp/unified_migration.log` 属主就变 root，服务启动即
   PermissionError（已踩过两次）。一律 `sudo -u ai-shifu` + 绝对路径。
2. **迁移只在 A 上执行**（数据库在 A）。B 永不 `flask db upgrade`。
3. **`git pull` 后必重装两端依赖**再重启。"代码新、依赖旧"会让后端启动即崩
   （历史案例：cffi 版本冲突、缺 dnspython 导致全部 `/api/` 502、
   markdown-flow-ui 残留旧版导致 build 类型错误）。

## 升级顺序

```text
本地 Windows 验证 → （本次有数据库迁移时）A 先升级+迁移 → B 升级 → A 其余部分
```

- 判断"有迁移"：`git log --oneline -- src/api/migrations/versions` 有新提交即有。
- 若 B 的后端连接 A 的数据库（查 B 的 `src/api/.env` 里
  `SQLALCHEMY_DATABASE_URI` 指向），**A 必须先完成迁移，B 才能升级重启**，
  否则 B 的新代码查询不存在的表/列直接崩。

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

## 服务器 A（Rocky 8 · venv311 · 生产 + 数据库）

```bash
cd /home/xingle/ai-shifu-TTS && git pull

# root pull 后的收尾（每次 pull 后都跑，无害）
sudo chown -R ai-shifu:ai-shifu src/api/logs src/api/storage
sudo find src/api -name __pycache__ -type d -user root -exec rm -rf {} +
sudo rm -f /tmp/unified_migration.log

# 依赖 + 迁移 + 重启（venv311 自带 pip）
cd src/api
sudo -u ai-shifu env HOME=/home/ai-shifu FLASK_APP=app.py ./venv311/bin/pip install -r requirements.txt
sudo -u ai-shifu env HOME=/home/ai-shifu FLASK_APP=app.py ./venv311/bin/flask db upgrade
sudo systemctl restart ai-shifu-api

# 确认
journalctl -u ai-shifu-api -n 30
```

## 服务器 B（Rocky 9 · .venv · 内测无库）

与 A 相同，差异：venv 名是 `.venv`、**不跑迁移**：

```bash
cd /home/xingle/ai-shifu-TTS && git pull

sudo chown -R ai-shifu:ai-shifu src/api/logs src/api/storage
sudo find src/api -name __pycache__ -type d -user root -exec rm -rf {} +
sudo rm -f /tmp/unified_migration.log

cd src/api
sudo -u ai-shifu env HOME=/home/ai-shifu ./.venv/bin/python -m pip install -r requirements.txt

sudo systemctl restart ai-shifu-api
journalctl -u ai-shifu-api -n 30
```

B 的 `.venv` 是 uv 建的、无 pip。若上面 pip 报 `No module named pip`，先补装一次：

```bash
sudo -u ai-shifu env HOME=/home/ai-shifu ./.venv/bin/python -m ensurepip --upgrade
```

## 服务器前端（两台同理）

日常只重启，不 build：

```bash
sudo systemctl restart ai-shifu-frontend
```

必须重新 build 时（改了前端代码/依赖）：

```bash
cd /home/xingle/ai-shifu-TTS/src/web
npm ci
# 临时注释 next.config.ts 里的 output: 'standalone' 再 build（build 后还原源码）
npx next build
sudo systemctl restart ai-shifu-frontend
```

`next start` 与 `output: 'standalone'` 冲突是 Next.js 行为，源码保持仓库原始版本，
只在 build 时临时注释。

## 合并上游新版本时

比日常 pull 多做这些（参照 2026-09 合并 v2.2.12 的实战）：

> **v2.3.4 特有（2026-10 首次升级到该版本时额外做）**：
>
> 1. **后端 `.env` 必须加 `LLM_MODEL_1_ID`**（如 `LLM_MODEL_1_ID="GLM-5-Turbo"`）。
>    上游把课程模型改为编号槽位制，model 1 必填且无默认，缺失则 API 启动即报
>    `EnvironmentConfigError`。旧变量 `DEFAULT_LLM_MODEL` 已废弃可删。
>    建议参照本地做法：以 `docker/.env.example.full`（v2.3.4 版）为骨架重写，
>    把服务器原有非空值填回去。
> 2. **前端目录已从 `src/cook-web` 改名为 `src/web`**。首次升级要在新路径装依赖并
>    build（`cd src/web && npm ci` + build）；`ai-shifu-frontend` 的 systemd unit
>    里 `WorkingDirectory`/`ExecStart` 若指向旧路径，同步改成 `/home/xingle/ai-shifu-TTS/src/web`。
>    确认服务正常后旧 `src/cook-web/` 可整目录删除。
> 3. **alembic 新增 merge head `a8f3c2d9e1b4`**（v2.2.12 head 与 v2.3.4 head 的合并点）。
>    迁移照旧只在 A 上执行。


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

4. 合并提交后，按[升级顺序](#升级顺序)推到服务器：A 先（含迁移），B 后。

## 升级后的验证

```bash
# 服务器上（A/B 通用）
systemctl status ai-shifu-api ai-shifu-frontend --no-pager
journalctl -u ai-shifu-api -n 30
curl -i http://127.0.0.1:5800/api/config      # 本机直连 flask，绕过 nginx
```

排障口诀：**所有 `/api/` 集体 502 而前端首页 200 = flask 没起来**。先用上面的
curl 区分「flask 没跑」还是「nginx 配置错」，再按 [trouble-shoot.md](trouble-shoot.md)
按症状索引。
