# v2.3.4 升级操作清单（A/B 服务器）

> **版本**：v2.2.12 → v2.3.4（upstream 300 个提交）
> **日期**：2026-10-13 制定，2026-10-14 计划执行；**2026-10-23 实际完成（架构变更）**
> **对应提交**：`a9aa30a8f`（合并）+ `8d142b440`（部署文档路径更新）
> **通用手册**：[UPGRADE.md](UPGRADE.md)；报错先查 [trouble-shoot.md](trouble-shoot.md)

> **执行结果（2026-10-23）**：A 的应用栈升级失败弃用——A 实际是 EL7（glibc 2.17，
> 并非此前认为的 Rocky 8），装不上 litellm 1.102（Rust 扩展包，详见末章坑 1/2）。
> 改由 **B 承接全部应用**（API + 前端 + nginx + 上传存储），**A 仅保留 MySQL 与
> redis 数据服务**。本文已按实际执行情况改写。

## 本次升级的四件事（与日常 pull 的差异）

1. **前端目录改名 `cook-web` → `src/web`**：新路径要装依赖 + build + 改 systemd + 改 nginx。
2. **后端 `.env` 必须加 `LLM_MODEL_1_ID`**：上游改为编号模型槽位制，model 1 必填无默认，
   缺失则 API 启动即报 `EnvironmentConfigError`。旧变量 `DEFAULT_LLM_MODEL` 已废弃可删。
3. **数据库有迁移**（含 fork merge head `a8f3c2d9e1b4`）：由 B 执行（连的就是 A 上的库），
   执行前先做下节的数据库预修。
4. **老库零日期默认值要预修**：迁移触碰 EL7 时代老表会报 MySQL 1067，见下节。

## 数据库预修：老表零日期默认值（2026-10-23 已修，重跑无害）

**症状**：`flask db upgrade` 在触碰老表的迁移上失败（如 `a3f9c1d05b28` 给
`user_token` 加列），报 `(1067, "Invalid default value for 'created'")`——
点名的列是老列，不是本次新增的列。

**原因**：A 库（MySQL 5.7.37）里 EL7 时代建的表带
`timestamp DEFAULT '0000-00-00 00:00:00'` 默认值，严模式下任何触碰该表的
ALTER 都会重新校验全表定义并拒绝。

**修复**（在库所在机器执行；动手前 `mysqldump --single-transaction` 全量备份）：

1. 扫出全部零日期默认值列：

```sql
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND DATA_TYPE IN ('timestamp','datetime')
  AND COLUMN_DEFAULT LIKE '0000-00-00%';
```

2. 逐列查零值行，有则洗成占位时间（不洗的话 MODIFY 复制表时同样报错）：

```sql
SELECT COUNT(*) FROM <表> WHERE <列> = '0000-00-00 00:00:00';
UPDATE <表> SET <列> = '1970-01-02 00:00:00' WHERE <列> = '0000-00-00 00:00:00';
```

3. 生成并执行精确的 MODIFY（保留原类型 / NULL 性 / 注释）。注意 MySQL 5.7
   的坑：MODIFY 不显式写 DEFAULT 会隐式补 `ON UPDATE CURRENT_TIMESTAMP`，
   创建语义列会被带坏，必须显式写：

```sql
-- user_token.created 是创建语义，不能带 ON UPDATE（2026-10-23 实际执行）
ALTER TABLE user_token
  MODIFY created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
  MODIFY updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Update time';

-- 其余 updated / updated_at 列由库自动生成语句，复制输出执行
SELECT CONCAT(
  'ALTER TABLE `', TABLE_NAME, '`
  MODIFY `', COLUMN_NAME, '` ', COLUMN_TYPE,
  IF(IS_NULLABLE='YES', ' NULL', ' NOT NULL'),
  ' DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  IF(COLUMN_COMMENT='', '', CONCAT(' COMMENT ''', REPLACE(COLUMN_COMMENT, '''', ''''''), '''')),
  ';') AS ddl
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND DATA_TYPE IN ('timestamp','datetime')
  AND COLUMN_DEFAULT LIKE '0000-00-00%';
```

2026-10-23 实际修复清单：`user_token.created / updated`，以及
`ai_course_auth.updated_at`、`resource.updated_at`、`resource_usage.updated_at`、
`risk_control_result.updated`、`scenario_favorite.updated_at`、
`user_conversion.updated`、`user_feedback.updated`、`user_verify_code.updated`。
（重跑第 1 步扫描，扫不出即已修复。）

## 本地已完成（无需重做）

- [x] 合并冲突解决 + 本地功能全部迁移到 `src/web`（首页课程发现、顶栏菜单、我的课程、home 按钮等）
- [x] 前端 2797 个测试 + tsc 通过；后端 user/路由/迁移测试通过
- [x] 本地库已升到 `a8f3c2d9e1b4`（单 head 验证过）
- [x] 本地 `src/api/.env` 已按 v2.3.4 模板重写（备份 `.env.pre-v234-bak`）

## 现在的生产架构（2026-10-23 起）

| 机器 | 系统 | 角色 |
|---|---|---|
| **B（noah）** | Rocky 9，glibc 2.34 | 生产应用服务器：代码、`.venv`、`ai-shifu-api`（gunicorn :5800）、`ai-shifu-frontend`（standalone server.js :5000）、nginx 入口（:8090）、**上传存储 `src/api/storage/`** |
| **A（VM-0-15-centos）** | 实际 EL7，glibc 2.17（当年"原地升级 Rocky 8"未生效） | **仅数据服务**：MySQL 5.7.37（生产库）、redis。ai-shifu 应用服务已 `stop` + `disable`，代码栈停留在 v2.2.12，不再升级 |

关键约束：

- B 的 `.env` 里 DATABASE / REDIS 配置指向 A 的内网地址；**A 的 `mysqld` 与 redis
  必须保持运行**，其余 ai-shifu 服务一律停用。
- 今后数据库迁移（`flask db upgrade`）都在 B 上执行（连 A 的库）；A 不再跑任何迁移。
- storage 文件已自 A 一次性 rsync 迁入 B，**B 是唯一写入方**，不要再从 A 回同步
  （会用旧文件覆盖 B 上的新上传）。

### B 日常升级流程（今后 pull 后）

```bash
cd /home/xingle/ai-shifu-TTS && git pull
sudo chown -R ai-shifu:ai-shifu src/api/logs src/api/storage

cd src/api
sudo -u ai-shifu env HOME=/home/ai-shifu FLASK_APP=app.py ./.venv/bin/pip install \
  -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
# 有迁移时（以 ai-shifu 身份）：
#   sudo -u ai-shifu env HOME=/home/ai-shifu FLASK_APP=app.py ./.venv/bin/flask db upgrade

cd ../web
sudo -u ai-shifu npm ci && sudo -u ai-shifu npm run build

sudo systemctl restart ai-shifu-api ai-shifu-frontend
```

## B 的部署要点（本次实录，含踩坑修正后的最终形态）

1. **systemd `ai-shifu-frontend.service`**：

```ini
[Service]
User=ai-shifu
Group=ai-shifu
WorkingDirectory=/home/xingle/ai-shifu-TTS/src/web
Environment=I18N_ROOT=/home/xingle/ai-shifu-TTS/src/i18n
Environment=PORT=5000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/local/bin/node /home/xingle/ai-shifu-TTS/src/web/.next/standalone/server.js
```

   - node 必须走 `/usr/local/bin/node`（软链到 `/opt/node-v20.20.2`，自 root 的
     nvm 拷出，见末章坑 6）；不要直接指向 `/root/.nvm/...`（服务用户穿不透 /root）。
   - standalone 运行方式下，`next.config.ts` 的 `output: 'standalone'` **保持不动**，
     直接 `npm run build`（Rocky 9 无需 `--turbopack`，见末章坑 7）。
   - build 后若产物属主是 root：`chown -R ai-shifu:ai-shifu src/web/.next`。

2. **nginx（:8090 入口）**，上游一律显式写 `127.0.0.1`：

```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location /api/ {
    # storage 也归这里（Flask API 从本机盘出文件），不再单独反代 A
    proxy_pass http://127.0.0.1:5800;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location /_next/static/ {
    # 注意：不是 standalone 子路径
    alias /home/xingle/ai-shifu-TTS/src/web/.next/static/;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

3. **storage 迁移（一次性，已完成）**：

```bash
rsync -av <A登录账号>@<A内网IP>:/home/xingle/ai-shifu-TTS/src/api/storage/ \
  /home/xingle/ai-shifu-TTS/src/api/storage/
sudo chown -R ai-shifu:ai-shifu /home/xingle/ai-shifu-TTS/src/api/storage
```

## 收尾与域名

- [ ] `course.startspace.cn` 确认已指向 B：DNS 直指 B 公网 IP（证书在 B 可用），
      或保留 A 的 nginx 仅作反代到 B 内网 IP——二选一，浏览器 https 访问正常即算过。
- [ ] A：确认仅 `mysqld`、`redis`（及 nginx，若选反代方案）在运行；ai-shifu 应用
      服务保持 `stop` + `disable`，机器重启也不会复活。
- [ ] 删除旧目录 `cook-web`（B 和本地 Windows 各一次；A 上的残留不影响运行，
      机器不再升级，可不动）。

## 回滚要点

- 代码：B 上 `git reset --hard <旧commit>` → 重装旧依赖 + 重新 build → 重启两个服务。
- 数据库：本次迁移含 drop（outline 模型设置移除），**降级需 `flask db downgrade`
  逐级回退，先在本地验证过再在库上操作**；优先考虑只回滚代码不回滚库（新旧代码
  共存窗口内旧代码不访问新表即可，反之新代码查旧库会崩）。
- storage：回滚只动代码不动文件；迁移后 B 上的新上传以 B 为准，不要拿 A 的旧
  storage 覆盖回来。

## 踩坑实录（2026-10-23 迁移全记录）

> 症状 → 根因 → 修法，按遭遇顺序排列；编号被上文引用。与
> [trouble-shoot.md](trouble-shoot.md) 重复的老坑只标注条号不展开。

### 坑 1：`pip install` 报 `metadata-generation-failed`（litellm）

- **症状**：装 `litellm==1.102.0` 元数据生成失败；升到 pip 26 + 换清华源仍复现。
- **根因**：litellm ≥1.9x 是带 Rust 扩展的原生包（sdist 构建后端是 maturin），
  PyPI 只发布 `cp310-abi3-manylinux_2_28` 编译 wheel，要求 glibc ≥ 2.28。glibc
  不够的机器上 pip 只能退回 sdist 源码编译，maturin 的 puccinialin 自动下载
  Rust 工具链走 `static.rust-lang.org`，被墙超时。
- **修法**：glibc ≥ 2.28 的机器（B）直接命中 wheel，无事。若必须在老机器装：以
  运行用户 rustup 走清华镜像预装 Rust
  （`RUSTUP_DIST_SERVER=https://mirrors.tuna.tsinghua.edu.cn/rustup`），带
  `~/.cargo/bin` 的 PATH 跑 pip（puccinialin 检测到 cargo 就不自己下载）；
  crates.io 也不通时 `~/.cargo/config.toml` 配 `sparse+https://rsproxy.cn/index/`。
  **不要**反过来给机器装 Rust 硬啃 sdist——wheel 存在时就该让 pip 用 wheel。

### 坑 2：机器身份认知错误（以为在 Rocky 8，实际 EL7）

- **症状**：坚信 A 已原地升级 Rocky 8 且此前 `ldd` 正常，当天 `ldd --version`
  显示 2.17。
- **根因**：当年的"原地升级"没有落到这台机器 / SSH 连到了 EL7 原始机。
- **教训**：动手前先验身：`cat /etc/os-release && hostnamectl && ldd --version | head -1`。
  `/usr/local/python311` 手工编译 python 是 EL7 特征（Rocky 8 正常 `dnf install
  python3.11`）。pip 判定 glibc 用的是进程内 `gnu_get_libc_version()`，与 PATH 里
  的 ldd 无关——"新版 pip 仍选 sdist"本身就是 glibc 不够的独立证据。
- **结果**：放弃 A 应用栈升级，B 承接全部应用（见上文架构一节）。

### 坑 3：迁移报 `(1067, "Invalid default value for 'created'")`

老表零日期默认值，详见上文「数据库预修」一节（洗数据 + MODIFY，共修 9 张表）。

### 坑 4：`systemctl status` 的日志被截断，看不到真错误

- 排查服务崩溃用 `journalctl -u <svc> --no-pager -o cat -n 300`（管道输出不截行）。
- 复现启动错误最快的方法：以运行用户前台手动跑
  `sudo -u ai-shifu env HOME=/home/ai-shifu sh -c 'cd .../src/api && ./.venv/bin/gunicorn -w 1 -b 127.0.0.1:5801 app:app'`，
  报错直接打在终端上。本次 B 的 API 启动崩溃即靠这两招定位（缺环境变量 / 数据
  服务连不上类问题按日志对症处理）。

### 坑 5：前端 unit `User=www-data` → `217/USER`

新拷贝的模板没改用户，Rocky 系无 www-data（trouble-shoot §1）。改
`User=ai-shifu`、`Group=ai-shifu` 后 `daemon-reload` + restart。

### 坑 6：`ExecStart=/usr/bin/node` → `203/EXEC`

node 实际在 `/root/.nvm/...`，`/root` 是 700，服务用户穿不透（trouble-shoot §4；
root 手动跑一切正常的假象极具迷惑性）。nvm 版本目录自包含，整拷到公共位置：

```bash
sudo cp -a /root/.nvm/versions/node/v20.20.2 /opt/node-v20.20.2
sudo chmod -R a+rX /opt/node-v20.20.2
sudo ln -sf /opt/node-v20.20.2/bin/node /usr/local/bin/node
sudo -u ai-shifu /usr/local/bin/node -v   # 必须以运行用户验证通过
```

### 坑 7：B 的构建方式与 A 不同

Rocky 9 上 `npm run build` 直接可用，`--turbopack` 是 EL7/glibc 2.17 的专属规避
（trouble-shoot §6）。standalone server.js 运行方式下 `output: 'standalone'`
保持不动（需要临时注释的是用 `next start` 跑的场景，§7）；unit 必须显式给
`I18N_ROOT`（§13）、`PORT`、`HOSTNAME`。

### 坑 8：nginx 502 两连

1. 前端块 `proxy_pass` 指旧端口，或写 `localhost`——后者可能解析为 IPv6 `::1`，
   而 standalone 服务只听 `127.0.0.1`（由 unit 的 `HOSTNAME` 决定）。
   **上游一律显式写 `http://127.0.0.1:<port>`**。
2. `/api/storage/` 曾单独反代到 A：storage 本来就是 Flask API 从**本机磁盘**读文件
   响应（`flaskr/route/storage.py`），API 搬到哪、文件就得跟到哪。修法：该
   location 并回 `/api/` 主块（`127.0.0.1:5800`）+ 把 A 的 `src/api/storage/`
   rsync 到 B。判断标准：改完但文件未迁时，图片应从 502 变 404（说明流量已回
   本机），迁完变 200。

### 坑 9：root 跑 build 的产物属主是 root

root 执行的 `npm run build` / pip 产物属主是 root，按 §11 纪律统一
`chown -R ai-shifu:ai-shifu`（本次涉及 `src/web/.next`、`src/api/storage`）。

### 坑 10：停 A 服务的边界

库升到 v2.3.4 schema 后，A 的旧代码必须停（旧代码对新 schema 不兼容）；但
**A 的 `mysqld` 和 redis 绝不能停**——B 的 API 连的就是它们。旧服务已
`disable`，机器重启后不会复活。
