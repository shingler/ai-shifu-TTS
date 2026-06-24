# 首页课程发现卡片流 — 设计规格

- 日期:2026-06-24
- 状态:待评审
- 范围:前端 cook-web 首页 + 后端 shifu 新增半公开列表接口
- 关联:本次实现计划将按项目 ExecPlan 规范落在 `docs/exec-plans/active/`

## 1. 背景与目标

当前未登录用户打开首页(`/`)几乎是空白页:首页 [page.tsx](../../../src/cook-web/src/app/page.tsx) 在 `runtimeConfigLoaded` 后通过 `redirectToHomeUrlIfRootPath` 重定向到 `/c`,而 `/c` 需要登录,未登录用户最终落在空白容器上,体验很差。

目标:把首页改造成**已发布课程的发现卡片流**,任何访客都能直接看到课程;登录用户额外看到自有/已购入/学习进度的标识,并能看到自己有权访问的已归档课程。

## 2. 范围

**包含**

- 后端:新增一个半公开(匿名可访问、登录附加 badge)的课程列表接口。
- 前端:改造首页为卡片流;新增课程卡片组件(视觉参考 `/admin` 的 `ShifuCard`);badge、点击、状态处理;i18n 文案。

**非目标(YAGNI)**

- 不改动 `/c` 学习页(`/c` 保持现状)。
- 不改动 `/admin` 页面及其归档操作语义。
- 不做课程搜索 / 分类筛选 / 排序切换。
- 不做独立的公开课程详情/介绍页(系统目前没有,本期不新增)。
- 不做无限滚动等复杂加载;用分页 + "加载更多"。

## 3. 核心概念与数据基础

### 3.1 已发布课程

数据源为 `PublishedShifu` 表([shifu/models.py:610-743](../../../src/api/flaskr/service/shifu/models.py))。

- "已发布且有效" = `PublishedShifu.deleted == 0`。
- 关键字段:`shifu_bid`、`title`、`description`、`avatar_res_bid`、`price`、`created_user_bid`、`created_at`、`updated_at`。
- 封面图:`avatar_res_bid` 经 `get_shifu_res_url_dict(res_bids)`([shifu/utils.py:33-47](../../../src/api/flaskr/service/shifu/utils.py))批量转成可访问 URL。

### 3.2 归档语义(关键决策)

系统**没有**课程级全局归档字段。归档是按 `(用户, 课程)` 维度的个人记录,存在 `ShifuUserArchive` 表(`shifu_bid`、`user_bid`、`archived` 0/1、`archived_at`)。归档操作 `_set_shifu_archive_state`([shifu_draft_funcs.py:907-947](../../../src/api/flaskr/service/shifu/shifu_draft_funcs.py))要求调用者对该课程有权限,主要被课程创作者使用。

**本期约定:把「课程创作者对其课程的归档记录」当作该课程的全局归档状态。**

- 课程 `X` 的归档状态 = `ShifuUserArchive(shifu_bid=X.shifu_bid, user_bid=X.created_user_bid).archived == 1`;无记录视为未归档。
- 该判定是确定的:每个已发布课程有唯一 `created_user_bid`。
- 复用现有数据,不改数据模型、不加迁移、不影响 `/admin`。

### 3.3 Badge 数据来源

- **自有**:`PublishedShifu.created_user_bid == 当前用户 user_id`。
- **已购入**:存在 `Order(user_bid==当前用户, shifu_bid==X, status==ORDER_STATUS_SUCCESS, deleted==0)`([order/models.py:20-87](../../../src/api/flaskr/service/order/models.py))。
- **学习进度**:`LearnProgressRecord`([learn/models.py:17-89](../../../src/api/flaskr/service/learn/models.py))的 `status`:`601` 未开始 / `602` 学习中 / `603` 已完成。课程级聚合规则见 §5.3。
- **已归档**:见 §3.2 的课程级归档状态。

Badge 仅对**真实登录用户**(`isLoggedIn`)有意义。临时访客(`isGuest`,持假 token)与匿名用户不显示任何 badge;接口对任意已解析 user 查询 badge,对访客/匿名自然为空。

## 4. 后端接口设计

### 4.1 路径与鉴权

- 方法:`GET`。
- 路径:挂载于 shifu 路由模块的 `path_prefix` 下,建议路径段 `/published-courses`(最终如 `/api/shifu/published-courses`);实现时以现有 `path_prefix` 为准。
- 鉴权:`@bypass_token_validation` + `@optional_token_validation`(均已存在,[route/user.py:93-111](../../../src/api/flaskr/route/user.py))。匿名放行;有 token 则解析 `request.user`,登录真实用户时计算 badge。

### 4.2 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | int | 否 | 页码,从 1 起,默认 1 |
| `page_size` | int | 否 | 每页条数,默认值与上限沿用现有 shifu 列表接口约束 |

不做搜索/筛选参数(YAGNI)。

### 4.3 响应结构

走 `make_common_response(PageNationDTO(...))`。`PageNationDTO.__json__` 将 `data` 映射为 `items`,故响应 `data` 形如:

```jsonc
{
  "page": 1,
  "page_size": 24,
  "total": 87,
  "page_count": 4,
  "items": [
    {
      "shifu_bid": "xxx",
      "title": "课程标题",
      "description": "课程介绍",
      "avatar_url": "https://.../cover.png",
      "price": "9.90",
      "updated_at": "2026-06-20T10:00:00Z",
      "is_archived": false,
      // 以下字段仅当请求来自真实登录用户时存在:
      "is_owner": false,
      "is_purchased": true,
      "learn_status": 602
    }
  ]
}
```

匿名/访客请求的 item **统一返回**这些字段,但值为 `is_owner=false`、`is_purchased=false`、`learn_status=null`;前端按 `isLoggedIn` 决定是否渲染 badge(匿名/访客一律不显示)。

### 4.4 查询与计算规则

基础查询:`PublishedShifu.deleted == 0`。

**课程级归档标记**:对每条 `PublishedShifu P`,LEFT JOIN `ShifuUserArchive A ON A.shifu_bid = P.shifu_bid AND A.user_bid = P.created_user_bid`,`is_archived = COALESCE(A.archived, 0)`。

**可见性过滤**:

- 匿名 / 访客:`is_archived == 0`。
- 登录真实用户 `U`:额外允许 `is_archived == 1` 且 `P.created_user_bid == U` 或 `P.shifu_bid IN purchased_set(U)`。
  - `purchased_set(U)` = `Order(user_bid==U, status==ORDER_STATUS_SUCCESS, deleted==0)` 的 `shifu_bid` 集合。

**排序**(对所有用户一致):

1. `is_archived ASC`(未归档在前,已归档在后)
2. `updated_at DESC`

**分页**:对过滤 + 排序后的结果分页,使用 `PageNationDTO`。

**封面 / badge 批量计算**(避免 N+1,仅对当前页 items):

- `avatar_url`:`get_shifu_res_url_dict([item.avatar_res_bid ...])`。
- `is_owner`:`item.created_user_bid == U`。
- `is_purchased`:`item.shifu_bid IN purchased_set(U)`(`purchased_set` 前面已查)。
- `learn_status`:查 `LearnProgressRecord(user_bid==U, shifu_bid IN page_items)`,按 §5.3 聚合。

## 5. 前端设计

### 5.1 首页改造

[page.tsx](../../../src/cook-web/src/app/page.tsx):

- 移除 `redirectToHomeUrlIfRootPath` 重定向逻辑与空 `<div>`。
- 改为渲染课程发现组件(如 `<CourseDiscovery />`)。
- `homeUrl` 不再驱动首页跳转;首页即卡片流。(若个别部署需要外部 landing,后续单独处理,不在本期。)

### 5.2 组件

- `CourseDiscovery`(新建,放 `src/cook-web/src/app/components/` 或共享 components):负责拉取列表、网格布局、加载/空/错误状态、"加载更多"分页。
- `CourseCard`(新建):单张课程卡片。视觉参考 `/admin` 的 `ShifuCard`(同一套 CSS 变量、复用 `components/ui/Card`、`components/ui/Badge`),但做成**封面图更突出的发现页卡片**:顶部封面图 + 标题 + 介绍(line-clamp)+ 更新时间 + 价格 + badge 组。
- badge 复用现有 `components/ui/Badge`,文案走 i18n。
- 不复用 `ShifuCard` 本体(它耦合了归档/权限/收藏等管理操作)。

### 5.3 Badge 显示规则

仅当 `useUserStore` 的 `isLoggedIn === true` 时渲染 badge。同一张卡的 badge 组合:

| Badge | 条件 | 说明 |
|------|------|------|
| 自有 | `is_owner` | 优先级最高 |
| 已购入 | `is_purchased` 且非 `is_owner` | 自有与已购入同时满足时只显示「自有」 |
| 学习中 | `learn_status == 602` | 独立显示 |
| 已完成 | `learn_status == 603` | 独立显示,与「学习中」互斥 |
| 已归档 | `is_archived` | 仅归档课可见时(自有/已购入)显示 |

**课程级学习进度聚合**(初版规则,实现时参照 `/c` 现有进度逻辑 [CourseSection.tsx](../../../src/cook-web/src/app/c/[[...id]]/Components/CourseCatalog/CourseSection.tsx)、[useLessonTree.ts:120](../../../src/cook-web/src/app/c/[[...id]]/hooks/useLessonTree.ts) 校准):

- 该用户在该课程下所有 `LearnProgressRecord` 中,若全部 `status == 603`(且至少 1 条)→ 已完成。
- 否则存在任意 `602` → 学习中。
- 否则(全 601 或无记录)→ 不显示。

### 5.4 点击行为

- `isLoggedIn`:`router.push(学习页/${shifu_bid})`。学习页路由在 `/c/[id]` 与 `/shifu/[id]` 之间确认(两者均存在),实现时统一选用与现有入口一致的那个。
- 未登录 / `isGuest`:`router.push('/login?redirect=' + encodeURIComponent(点击目标的课程路径或首页路径))`,登录后回到该课程。

### 5.5 请求与鉴权

- 在 [api/api.ts](../../../src/cook-web/src/api/api.ts) 新增接口定义(如 `getPublishedCourses: 'GET /shifu/published-courses'`),经 [api/index.ts](../../../src/cook-web/src/api/index.ts) 生成请求函数,统一走 [lib/request.ts](../../../src/cook-web/src/lib/request.ts)(自动附加 `Authorization`/`Token` header,匿名时无 token 也可发)。
- 不在组件内另起 fetch。

### 5.6 i18n

badge 文案、更新时间标签、空状态、加载更多等用户可见文案,加入 `src/i18n/` 共享 JSON 命名空间,不硬编码。

### 5.7 状态与边界

- 加载中:骨架屏。
- 空列表(无已发布课程或当前页为空):友好空状态。
- 请求失败:复用 `ErrorDisplay`。
- 响应式:移动端单列、桌面多列网格。

## 6. 归档与可见性规则汇总

| 访客类型 | 未归档课程 | 已归档课程(自有) | 已归档课程(已购入) | 已归档课程(其他) |
|----------|------------|--------------------|----------------------|--------------------|
| 匿名 / isGuest | 可见,无 badge | 不可见 | 不可见 | 不可见 |
| 登录用户 U | 可见,带 badge | 可见,带「自有」「已归档」 | 可见,带「已购入」「已归档」 | 不可见 |

排序:所有可见课程中,未归档在前、已归档在后,各自按 `updated_at` 倒序。

## 7. 测试策略

**后端**(`src/api/tests/service/shifu/`,新增接口单测):

- 匿名请求:只返回未归档课程,无 badge 字段。
- 登录请求:返回未归档 + 本人自有/已购入的归档课程;badge(`is_owner`/`is_purchased`/`learn_status`)正确。
- 归档过滤:他人归档课程对当前用户不可见。
- 排序:归档课程排在未归档之后,各自 `updated_at` 倒序。
- 分页:`page`/`page_size`/`total`/`page_count` 正确。
- 性能:无 N+1(封面、badge 为批量查询)。

**前端**:

- `npm run type-check`、`npm run lint`。
- `CourseCard` 渲染:各 badge 组合显示正确;`isLoggedIn=false` 时不显示 badge。
- 点击行为:未登录跳 `/login?redirect=...`;登录跳学习页。

不强制跑全量 e2e;如改动到浏览器 smoke 选择器再跑 `npm run test:e2e`。

## 8. 风险与开放问题

1. **课程级学习进度聚合**:§5.3 给了初版规则,实现时需对照 `LearnProgressRecord` 的实际记录粒度与 `/c` 现有判断校准。
2. **学习页路由**:`/c/[id]` 与 `/shifu/[id]` 的选用,实现时确认与现有入口一致。
3. **接口路径前缀**:以 shifu 模块现有 `path_prefix` 为准。
4. **访客(`isGuest`)token**:badge 对访客自然为空,无副作用;前端统一按 `isLoggedIn` 渲染。
5. **首页 `homeUrl` 移除重定向的影响**:需确认无部署依赖根路径重定向到外部 landing;若有,后续单独处理。

## 9. 验收标准

- 未登录打开首页:看到已发布且未归档课程的卡片流(封面/标题/介绍/更新时间/价格),无 badge;点击任一卡片跳转 `/login?redirect=...`。
- 真实登录用户打开首页:同样卡片流 + badge(自有/已购入/学习中/已完成);本人自有或已购入的归档课程也出现,带「已归档」badge 且排在列表最后;点击进入学习页。
- `/c`、`/admin` 行为不受影响。
- 后端接口单测通过;前端 `type-check`、`lint` 通过。
