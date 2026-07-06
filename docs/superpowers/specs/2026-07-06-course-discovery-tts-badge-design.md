# 课程发现页「可听课」徽章 — 设计规格

- 日期:2026-07-06
- 状态:待评审
- 范围:后端 shifu 课程发现接口补字段 + 前端 cook-web 课程卡片新增 TTS 徽章
- 关联:本次实现计划将按项目 ExecPlan 规范落在 `docs/exec-plans/active/`
- 前置设计:[首页课程发现卡片流](./2026-06-24-homepage-course-discovery-design.md)

## 1. 背景与目标

仓库已具备**生产级 TTS 管线**:多供应商(Minimax / 火山引擎 WS+HTTP / 百度 / 阿里云)、流式 SSE + 离线拼接、字幕对齐、OSS 持久化、用量计量,见 [src/api/flaskr/service/tts/](../../../src/api/flaskr/service/tts/) 与 [src/api/flaskr/api/tts/](../../../src/api/flaskr/api/tts/)。课程表(`DraftShifu` / `PublishedShifu`)已带全套 TTS 字段(`tts_enabled` / `tts_provider` / `tts_model` / `tts_voice_id` / `tts_speed` / `tts_pitch` / `tts_emotion`),创作者端 [ShifuSetting.tsx](../../../src/cook-web/src/components/shifu-setting/ShifuSetting.tsx) 已能逐课程配置并试听,学习者端「听课模式」播放链路也已就绪。

**缺口**:首页课程发现 feed([discovery_funcs.py](../../../src/api/flaskr/service/shifu/discovery_funcs.py) 的 `get_published_course_catalog`)返回项里**不包含任何 TTS 维度**,导致访客在发现层无法识别哪些课程「可听课」。

**目标**:在课程发现卡片上用一个**颜色独特的徽章**标识「可听课课程」,让访客一眼区分。本期只做**展示**,不做筛选。

## 2. 范围

**包含**

- 后端:`get_published_course_catalog` 返回项补 `tts_enabled` 字段。
- 前端:`CourseItem` 接口加字段;`CourseCard` 新增「可听课」徽章分支;给 `Badge` 组件新增 `success` 绿色变体;`globals.css` 补 `--success` / `--success-foreground` 色变量;三语 i18n 文案。

**非目标(YAGNI)**

- 不做发现页筛选(Tab / Toggle / 后端过滤参数)。
- 不改「我的课程」列表(`get_shifu_draft_list` / `getUserCourses`)。
- 不改 `/c` 学习页、不改创作者端配置。
- 不加 provider 后缀(如「可听课 · Minimax」)、不加 provider→中文名映射表。
- 不加图标,保持与现有徽章一致的纯文字风格。
- 不改判定严格度(不校验 provider/voice 是否齐全,理由见 §4)。

## 3. 数据基础

数据源为 `PublishedShifu` 表,发现接口已在查询其全部列([discovery_funcs.py:56-60](../../../src/api/flaskr/service/shifu/discovery_funcs.py))。

- `PublishedShifu.tts_enabled`:`SmallInteger`,`0` 禁用 / `1` 启用([models.py](../../../src/api/flaskr/service/shifu/models.py) 的 `PublishedShifu` 一段,字段与 `DraftShifu.tts_enabled` 对称)。发布时随 `publish_shifu_draft` 从草稿克隆到 published。
- 课程保存 TTS 设置时已走 `validate_tts_settings_strict`([service/tts/validation.py](../../../src/api/flaskr/service/tts/validation.py))严格校验,因此 `tts_enabled == 1` 的课程其 provider/model/voice 基本齐全,**以 `tts_enabled` 单字段判定即可**,无需在发现层重复校验其它字段。

## 4. 后端改动

在 [discovery_funcs.py:94-108](../../../src/api/flaskr/service/shifu/discovery_funcs.py) 的 data dict 里补一行:

```python
"tts_enabled": bool(c.tts_enabled),
```

- 无新查询(字段已在 `c` 上)、无 DB 迁移、无 DTO 结构变更(dict 直出)。
- 路由层 `get_published_courses_api`([route.py:451 附近](../../../src/api/flaskr/service/shifu/route.py))与 `PageNationDTO` 透传无需改动。
- 该字段对**匿名与登录用户一致返回**(与 `title` / `price` 等公开字段同类),不属于「仅登录可见」的 badge 数据。

## 5. 前端改动

### 5.1 Badge 新增 `success` 变体

现状:[Badge.tsx](../../../src/cook-web/src/components/ui/Badge.tsx) 只有 `default`(主色)/`secondary`/`destructive`(红)/`outline` 四个变体。现有徽章已占用 `courseOwned`=default、`coursePurchased`=secondary、`学习中/已完成/归档`=outline、`destructive` 为危险语义。为让「可听课」徽章颜色独特且语义正向,新增 `success`(绿)变体:

- [Badge.tsx](../../../src/cook-web/src/components/ui/Badge.tsx) 的 `badgeVariants` 增加:
  ```ts
  success:
    'border-transparent bg-success text-success-foreground hover:bg-success/80',
  ```
- [globals.css](../../../src/cook-web/src/app/globals.css) 与 [tailwind.config.ts](../../../src/cook-web/tailwind.config.ts) 各补一组 `success` 变量/token(`bg-success` utility 需两者同时存在才生效):
  ```css
  /* :root */
  --success: #16a34a;
  --success-foreground: #ffffff;
  /* .dark(深底浅字,对齐 .dark 里 --destructive 的模式) */
  --success: #166534;
  --success-foreground: #f9fafb;
  ```

### 5.2 `CourseItem` 与 `CourseCard`

- [CourseCard.tsx:7-18](../../../src/cook-web/src/components/course-discovery/CourseCard.tsx) 的 `CourseItem` 接口加字段:
  ```ts
  tts_enabled: boolean;
  ```
- 徽章区([CourseCard.tsx:81-97](../../../src/cook-web/src/components/course-discovery/CourseCard.tsx))新增一个分支,**不依赖 `isLoggedIn`**(与 owner/purchased 等「需登录」徽章不同,匿名也可见):
  ```tsx
  {course.tts_enabled && (
    <Badge variant='success'>{t('common.core.courseAudioAvailable')}</Badge>
  )}
  ```
- [CourseDiscovery.tsx](../../../src/cook-web/src/components/course-discovery/CourseDiscovery.tsx) 无需改动(纯透传)。

### 5.3 i18n

在共享文案 `src/i18n/{lang}/common/core.json`(前后端共享命名空间 `common.core`)三份各新增 `courseAudioAvailable`:

| 语言 | 文件 | 文案 |
|------|------|------|
| en-US | [src/i18n/en-US/common/core.json](../../../src/i18n/en-US/common/core.json) | `Audio Available` |
| zh-CN | [src/i18n/zh-CN/common/core.json](../../../src/i18n/zh-CN/common/core.json) | `可听课` |
| fr-FR | [src/i18n/fr-FR/common/core.json](../../../src/i18n/fr-FR/common/core.json) | `Audio disponible` |

## 6. 徽章判定与显示规则

| 维度 | 规则 |
|------|------|
| 判定条件 | `course.tts_enabled === true` |
| 登录态 | 与登录态**无关**,匿名 / isGuest / 登录用户均显示 |
| 颜色 | `success`(绿),与其它徽章区分 |
| 优先级 | 独立显示,不与 owner / purchased / 学习状态 / 归档互斥 |
| 文案 | `common.core.courseAudioAvailable` |

## 7. 测试策略

**后端**(`src/api/tests/service/shifu/test_published_course_catalog.py` 增断言):

- `tts_enabled == 1` 的课程,返回项 `tts_enabled === True`。
- `tts_enabled == 0` 的课程,返回项 `tts_enabled === False`。
- 匿名请求同样带该字段(不依赖 `user_id`)。

运行:`cd src/api && pytest tests/service/shifu/ -q`。

**前端**:

- `cd src/cook-web && npm run type-check && npm run lint`。
- 若 `CourseCard` 已有单测,补一个 `tts_enabled=true` 渲染绿色徽章、`false` 不渲染的用例;无则不强求(组件纯展示)。

## 8. 风险与开放问题

1. **success 色变量**:globals.css 当前只有 `--destructive`,无 `--success`;本期新增。暗色值需以实际暗色基调校准对比度,实现时确认。
2. **判定准确性**:`tts_enabled` 由创作者在保存时经严格校验后开启,理论上配置齐全;若极端情况下出现「开启但 provider/key 失效」,徽章仍会显示——本期接受这一近似,准确性问题在「听课」时由试听/播放报错暴露,不回溯到发现层。
3. **字段命名**:后端直出 `tts_enabled`(snake_case),与同返回项 `is_archived` / `is_owner` 的 `is_` 前缀风格略不同;沿用数据库列名 `tts_enabled`,与 `ShifuDetailDto` 一致,避免引入映射。前端 `CourseItem.tts_enabled` 同名承接。

## 9. 验收标准

- 已开启 TTS(`tts_enabled == 1`)的课程卡片显示绿色「可听课」徽章;未开启的不显示。
- 徽章在匿名、isGuest、登录三种状态下**均显示**(区别于 owner/purchased 等「需登录」徽章)。
- 其它徽章颜色与逻辑不受影响。
- 后端发现接口单测通过;前端 `type-check`、`lint` 通过。
- `/c` 学习页、创作者端、`/admin` 行为不受影响。

## 附录 A:让课程语音立即可用(Minimax)

本徽章只反映课程 `tts_enabled` 标记;要让一门课程**真正能听课**,后端还需配通 TTS 供应商。以 Minimax 为例,只需 2 个必填环境变量([config.py:1315-1327](../../../src/api/flaskr/common/config.py)、[docker/.env.example.full:977-984](../../../docker/.env.example.full)):

| 变量 | 必填 | 说明 |
|------|------|------|
| `MINIMAX_API_KEY` | 是 | Minimax API Key(控制台鉴权页) |
| `MINIMAX_GROUP_ID` | 是 | Minimax Group ID(控制台账户管理;t2a_v2 请求头必带) |

其余 `MINIMAX_TTS_SAMPLE_RATE`(24000)、`MINIMAX_TTS_BITRATE`(128000)、`MINIMAX_TTS_RPM_LIMIT`(0=不限)、`TTS_MAX_SEGMENT_CHARS`(300) 均有默认值,无需改动。

步骤:

1. 把上述两项写入后端实际加载的 `.env`(本地直跑:`src/api/.env`;Docker:`docker/.env`;systemd/部署脚本则注入到 Flask 进程环境)。
2. 重启后端,使 `get_config()` 重新加载。
3. 创作者端进课程 → 设置([ShifuSetting.tsx](../../../src/cook-web/src/components/shifu-setting/ShifuSetting.tsx))→ 开启 TTS → provider 选 **Minimax** → 选 model(如 `speech-01-turbo`)、voice(如 `female-shaonv`)→ 点「试听」(`POST /shifu/tts/preview`,真实调用 Minimax,可验证 key+group_id 是否有效)→ 保存。
4. 学习者进入该课程即可「听课」,流式播放走 Minimax。

备注:

- provider 自动探测顺序为 Minimax → 火山 → 百度 → 阿里云([api/tts/__init__.py:65-84](../../../src/api/flaskr/api/tts/__init__.py));配了 Minimax 即被优先选中。课程字段 `tts_provider` 为显式存储,**建议在课程设置里明确选 Minimax** 最稳妥。
- 流式听课用 base64 实时推流,**不依赖 OSS**;OSS 仅用于课后回放/补音频。
- `.env` 含 secret,勿提交 git。
