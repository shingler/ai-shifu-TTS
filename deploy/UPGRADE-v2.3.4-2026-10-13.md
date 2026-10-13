# v2.3.4 升级操作清单（A/B 服务器）

> **版本**：v2.2.12 → v2.3.4（upstream 300 个提交）
> **日期**：2026-10-13 制定，计划 2026-10-14 执行
> **对应提交**：`a9aa30a8f`（合并）+ `8d142b440`（部署文档路径更新）
> **通用手册**：[UPGRADE.md](UPGRADE.md)；报错先查 [trouble-shoot.md](trouble-shoot.md)

## 本次升级的三件事（与日常 pull 的差异）

1. **前端目录改名 `src/cook-web` → `src/web`**：新路径要装依赖 + build + 改 systemd + 改 nginx。
2. **后端 `.env` 必须加 `LLM_MODEL_1_ID`**：上游改为编号模型槽位制，model 1 必填无默认，
   缺失则 API 启动即报 `EnvironmentConfigError`。旧变量 `DEFAULT_LLM_MODEL` 已废弃可删。
3. **数据库有迁移**（含 fork merge head `a8f3c2d9e1b4`）：照旧只在 A 上执行。

## 本地已完成（无需重做）

- [x] 合并冲突解决 + 本地功能全部迁移到 `src/web`（首页课程发现、顶栏菜单、我的课程、home 按钮等）
- [x] 前端 2797 个测试 + tsc 通过；后端 user/路由/迁移测试通过
- [x] 本地库已升到 `a8f3c2d9e1b4`（单 head 验证过）
- [x] 本地 `src/api/.env` 已按 v2.3.4 模板重写（备份 `.env.pre-v234-bak`）

## 服务器 A（Rocky 8 · venv311 · 生产 + 数据库）— 先做

### 1. 代码 + 后端

```bash
cd /home/xingle/ai-shifu-TTS && git pull

# root pull 后的收尾（每次 pull 后都跑，无害）
sudo chown -R ai-shifu:ai-shifu src/api/logs src/api/storage
sudo find src/api -name __pycache__ -type d -user root -exec rm -rf {} +
sudo rm -f /tmp/unified_migration.log
```

### 2. 后端 `.env`（关键，不做 API 起不来）

```bash
cd src/api
# 最小改法：编辑 .env，把 DEFAULT_LLM_MODEL="..." 那行改成：
#   LLM_MODEL_1_ID="GLM-5-Turbo"
# （值沿用服务器原 DEFAULT_LLM_MODEL 的值）
```

稳妥改法（推荐）：参照本地做法，以新版 `docker/.env.example.full` 为骨架重写，
把服务器原有非空值（密钥 / DB URI / SMTP 等）填回去。

### 3. 依赖 + 迁移 + 重启

```bash
cd src/api
sudo -u ai-shifu env HOME=/home/ai-shifu FLASK_APP=app.py ./venv311/bin/pip install -r requirements.txt
sudo -u ai-shifu env HOME=/home/ai-shifu FLASK_APP=app.py ./venv311/bin/flask db upgrade
sudo systemctl restart ai-shifu-api
journalctl -u ai-shifu-api -n 30
```

迁移预期输出末尾：`Running upgrade d4e6f8a2c1b9, fde432bceab4 -> a8f3c2d9e1b4, merge upstream v2.3.4 head into local head`

### 4. 前端（新路径首次构建）

```bash
cd /home/xingle/ai-shifu-TTS/src/web
sudo -u ai-shifu npm ci
# 临时注释 next.config.ts 里 output: 'standalone' 再 build（build 后还原源码）
sudo -u ai-shifu npx next build
```

### 5. systemd unit（服务器上的拷贝不会随 pull 更新）

```bash
cd /home/xingle/ai-shifu-TTS
sudo cp deploy/systemd/ai-shifu-frontend.service /etc/systemd/system/
# 编辑确认路径为 /home/xingle/ai-shifu-TTS/src/web（模板里是 /home/ai-shifu-TTS，要改）
sudo vi /etc/systemd/system/ai-shifu-frontend.service
sudo systemctl daemon-reload
sudo systemctl restart ai-shifu-frontend
```

### 6. nginx 静态资源路径

`location /_next/static/` 的 alias：`src/cook-web/.next/static/` → `src/web/.next/static/`，改后 `nginx -t && systemctl reload nginx`。

### 7. 验证 A

```bash
systemctl status ai-shifu-api ai-shifu-frontend --no-pager
curl -s http://127.0.0.1:5800/api/i18n | head -c 200   # API 正常
curl -s http://127.0.0.1:5000/ | head -c 200           # 前端正常
# 浏览器过一遍：后台编课、首页课程发现、登录（email/phone）
```

## 服务器 B（Rocky 9 · .venv · 内测无库）— A 验证通过后

与 A 相同，差异：venv 名 `.venv`、**不跑迁移**：

```bash
cd /home/xingle/ai-shifu-TTS && git pull

sudo chown -R ai-shifu:ai-shifu src/api/logs src/api/storage
sudo find src/api -name __pycache__ -type d -user root -exec rm -rf {} +
sudo rm -f /tmp/unified_migration.log

# .env 同样加 LLM_MODEL_1_ID（见 A 的第 2 步）
cd src/api
sudo -u ai-shifu env HOME=/home/ai-shifu ./.venv/bin/python -m pip install -r requirements.txt
# 若报 No module named pip：先 sudo -u ai-shifu env HOME=/home/ai-shifu ./.venv/bin/python -m ensurepip --upgrade

# 前端 + systemd + nginx：同 A 的第 4/5/6 步
sudo systemctl restart ai-shifu-api ai-shifu-frontend
journalctl -u ai-shifu-api -n 30
```

## 收尾（两台服务正常后，不着急可过几天做）

```bash
sudo rm -rf /home/xingle/ai-shifu-TTS/src/cook-web   # A、B 各一次
# 本地 Windows 同样可删 src/cook-web/
```

## 回滚要点

- 代码：`git reset --hard <旧commit>` 后按旧路径（cook-web）重启 systemd（unit 改回去）。
- 数据库：本次迁移含 drop（outline 模型设置移除），**降级需 `flask db downgrade` 逐级回退，
  先在本地验证过再在 A 上操作**；优先考虑只回滚代码不回滚库（新旧代码共存窗口内旧代码
  不访问新表即可，反之新代码查旧库会崩）。
