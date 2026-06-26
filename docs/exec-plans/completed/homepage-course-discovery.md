# Homepage Course Discovery — ExecPlan

> 详细设计见 [docs/superpowers/specs/2026-06-24-homepage-course-discovery-design.md](../../superpowers/specs/2026-06-24-homepage-course-discovery-design.md)。本计划是其执行蓝图,遵循 `PLANS.md`。

## Purpose / Big Picture

把未登录时空白的首页(`/`)改造成「已发布课程发现卡片流」:任何访客都能看到课程(标题/封面/介绍/更新时间/价格);真实登录用户额外看到自有/已购入/学习进度 badge,并能看到自己有权访问的已归档课程(带「已归档」badge,排最后)。

- 后端:新增一个**半公开**接口(匿名可访问、登录附加 badge),挂 shifu 路由。
- 前端:首页改为卡片流;新增 `CourseDiscovery` 容器与 `CourseCard`(视觉参考 `/admin` 的 `ShifuCard`);badge、点击、状态、i18n。
- `/c`、`/admin` 不动。

## Progress

- [x] 2026-06-24: Spec 评审通过并提交。
- [x] 2026-06-24: 确认归档语义(用创作者归档作课程级状态)、接口鉴权模式、测试范式。
- [x] 2026-06-26: 后端 Task 1 — `get_published_course_catalog` + 6 纯函数测试(可见性/归档/排序/badge/分页/删除)。
- [x] 2026-06-26: 后端 Task 2 — `GET /api/shifu/published-courses`(`@bypass_token_validation`+`@optional_token_validation`)+ 2 路由层测试。
- [x] 2026-06-26: 前端 Task 3 — `api.ts` 新增 `getPublishedCourses`。
- [x] 2026-06-26: 前端 Task 4 — i18n 文案(zh-CN / en-US `core.json`)。
- [x] 2026-06-26: 前端 Task 5 — `CourseCard` 组件 + 7 个 Jest 测试。
- [x] 2026-06-26: 前端 Task 6 — `CourseDiscovery` 容器 + 改造 `app/page.tsx`。
- [x] 2026-06-26: Task 7 — pytest(8/8 新测试 + shifu 回归 232 passed)/ type-check(干净)/ jest 7-7 / lint(无新增问题);ExecPlan 移入 `completed/`。

## Surprises & Discoveries

- 系统的「归档」是 **(用户, 课程) 维度**的 `ShifuUserArchive`,没有课程级全局归档字段。本期约定用「创作者对该课程的归档记录」作为课程级归档状态(每个已发布课程有唯一 `created_user_bid`,判定确定)。
- `optional_token_validation` 装饰器已存在([route/user.py:93-111](../../../src/api/flaskr/route/user.py)),与 `@bypass_token_validation` 叠加正好实现「匿名放行 + 有 token 解析 user」。
- shifu 模块 `path_prefix="/api/shifu"`([route.py:233](../../../src/api/flaskr/service/shifu/route.py));前端 `api.ts` 路径不带 `/api`(request 层自动补),故前端写 `GET /shifu/published-courses`。
- `PublishedShifu` 大量字段有 `default`,测试构造时只需传业务字段。

## Decision Log

- **归档语义**:用 `ShifuUserArchive(shifu_bid=X, user_bid=X.created_user_bid).archived==1` 作为课程 `X` 的归档状态。复用现有数据,不改模型、不加迁移。原因:用户需求是课程级归档,而系统只有用户级;用创作者记录是最低风险且语义自洽的代理。
- **可见性**:匿名/访客只见未归档;登录用户额外可见「本人自有 ∪ 已购入」的归档课程。
- **排序**:`is_archived ASC, updated_at DESC`(归档总在最后,所有用户一致)。
- **Badge**:自有(优先) / 已购入 / 学习中(602) / 已完成(603) / 已归档;仅 `isLoggedIn` 渲染;匿名 item 字段统一返回但 `is_owner=false`、`is_purchased=false`、`learn_status=null`。
- **学习进度聚合**:全部 item `status==603`(≥1 条)→ 已完成;否则存在 `602` → 学习中;否则不显示。
- **范围**:只改首页;`/c` 不改;不做搜索/筛选/详情页/无限滚动。

## Outcomes & Retrospective

- **验收结果**:
  - 后端:`test_published_course_catalog.py` 8/8 通过(6 纯函数 + 2 路由层);shifu 目录回归 232 passed。
  - 前端:`tsc --noEmit` 零错误;`CourseCard` Jest 7/7;ESLint 无新增 warning/error。
- **偏差**:无功能性偏差。学习进度聚合按 spec §5.3 实现(全部 item `603`→已完成;否则存在 `602`→学习中;否则不显示)。
- **预存问题(非本次引入,已验证)**:
  - `tests/service/shifu/test_admin_users.py::test_grant_operator_user_referral_reward_stacks_bucket_and_expiry` 失败(credit wallet `available_credits` 断言);stash 本次改动后仍失败 → 与本次无关。
  - cook-web `tsc` 误报 `.next/types/app/admin/{best-practice,inspiration,knowledge,template}` 找不到模块,因这些 admin 页面源文件已删除而 `.next` 缓存陈旧;清 `.next` 后消失。
- **后续改进**:学习进度聚合可对照 `/c` 现有进度逻辑再校准;首页暂不做搜索/筛选(YAGNI);归档「创作者记录作课程级状态」若未来需要真正全局归档,需加 PublishedShifu 字段。

## Context and Orientation

- 数据源:`PublishedShifu`(`deleted==0` 即已发布有效),封面经 `get_shifu_res_url_dict`,已购入查 `Order(status==502, deleted==0)`,进度查 `LearnProgressRecord`(601/602/603 见 `order/consts.py`)。
- 鉴权链:`@bypass_token_validation`(加入白名单)+ `@optional_token_validation`(有 token 设 `request.user`)→ `user_id = getattr(request, "user", None)`。
- 响应:`make_common_response(PageNationDTO(page, page_size, total, items))`,`items` 由 DTO 的 `__json__` 产出。
- 前端调用统一走 `api.<name>(params)` → `lib/api.ts gen` → `lib/request.ts`(自动附 `Authorization`/`Token`,匿名可发)。

## Plan of Work

按 TDD 推进:每个后端/前端单元先写失败测试 → 实现 → 通过 → commit。后端优先(前端依赖接口契约),前端组件独立可测。

## Concrete Steps

### Task 1 — 后端发现页查询函数(TDD)

**Files:**
- Create: `src/api/flaskr/service/shifu/discovery_funcs.py`
- Test: `src/api/tests/service/shifu/test_published_course_catalog.py`

纯函数封装全部查询逻辑(便于直接单测,参照 `test_shifu_draft_list.py` 测 `get_shifu_draft_list` 的范式)。

签名:

```python
from typing import Optional
from flask import Flask
from flaskr.service.common.dtos import PageNationDTO

def get_published_course_catalog(
    app: Flask,
    user_id: Optional[str],
    page_index: int,
    page_size: int,
) -> PageNationDTO: ...
```

返回的 item dict 字段:`shifu_bid, title, description, avatar_url, price(str), updated_at, is_archived, is_owner, is_purchased, learn_status`。匿名时 `is_owner=False, is_purchased=False, learn_status=None`。

逻辑要点(在 `with app.app_context():` 内):
1. 基础集 `PublishedShifu.deleted == 0`。
2. 课程级归档:批量查 `ShifuUserArchive` where `(shifu_bid, user_bid) == (p.shifu_bid, p.created_user_bid)` → `archive_map[shifu_bid] = bool(archived)`。
3. 登录用户预算:`purchased_set` = `Order(user_bid==user_id, status==502, deleted==0)` 的 `shifu_bid`;`owned` 判定 = `created_user_bid == user_id`。
4. 过滤:保留 `not is_archived` 或(`is_archived` 且(`owned` 或 `shifu_bid in purchased_set`))。匿名 `user_id=None` 时退化为仅未归档。
5. 排序:`is_archived ASC, updated_at DESC`。
6. 分页后,批量取封面 `get_shifu_res_url_dict([p.avatar_res_bid ...])`;登录用户再批量查 `LearnProgressRecord(user_bid==user_id, shifu_bid in page_items)` 聚合 `learn_status`。

**测试用例清单(先写,跑红):**
- `test_anonymous_only_sees_non_archived`:造 2 个未归档 + 1 个创作者归档的已发布课;匿名(`user_id=None`)只见 2 个未归档,item 无 badge(is_owner False)。
- `test_logged_in_sees_owned_and_purchased_archived`:登录用户 U,自有归档课 + 已购入归档课 + 他人归档课;可见未归档全部 + 自有归档 + 已购入归档;不见他人归档。
- `test_archived_sorted_last`:造未归档(较旧 updated_at)+ 归档(较新 updated_at);断言未归档在前、归档在后,各自 updated_at 倒序。
- `test_badges_owner_priority_and_progress`:U 自有课(且买了)→ 只标 `is_owner=True`;已购入课(非自有,进度 602)→ `is_purchased=True, learn_status=602`;全部完成的课 → `learn_status=603`。
- `test_pagination`:page_size=2,断言 `total/page_count/page/items` 长度。
- `test_deleted_excluded`:`deleted==1` 的已发布课不出现在匿名与登录结果中。

造数据范式参照 `test_archive.py`(`dao.db.session.add(PublishedShifu(...))` + `commit()`,先 `.filter_by(shifu_bid=...).delete()` 清理)。

- [ ] 写测试 → `pytest src/api/tests/service/shifu/test_published_course_catalog.py -q`(红)
- [ ] 实现 `discovery_funcs.py` → 上述测试(绿)
- [ ] `git add src/api/flaskr/service/shifu/discovery_funcs.py src/api/tests/service/shifu/test_published_course_catalog.py && git commit -m "feat(shifu): add published course catalog discovery query with tests"`

### Task 2 — 后端半公开路由

**Files:**
- Modify: `src/api/flaskr/service/shifu/route.py`(在 `register_shifu_routes` 内,`get_shifu_list_api` 附近新增)

路由(导入 `optional_token_validation` from `flaskr.route.user`):

```python
@app.route(path_prefix + "/published-courses", methods=["GET"])
@bypass_token_validation
@optional_token_validation
def get_published_courses_api():
    user = getattr(request, "user", None)
    user_id = user.user_id if user else None
    page_index = int(request.args.get("page_index", 1))
    page_size = int(request.args.get("page_size", 10))
    if page_index < 1 or page_size < 1:
        raise_param_error("page_index or page_size is less than 1")
    return make_common_response(
        get_published_course_catalog(app, user_id, page_index, page_size)
    )
```

路由层测试(追加到 `test_published_course_catalog.py` 或同目录新文件,用 `test_client` + `monkeypatch.validate_user`,范式见 `test_shifu_public_urls.py:197-217`):
- `test_route_anonymous_ok`:`test_client.get("/api/shifu/published-courses")`(无 token)→ `code==0`,`data.items` 存在。
- `test_route_with_token_attaches_user`:monkeypatch `validate_user` 返回 `SimpleNamespace(user_id=U)`;请求带 `headers={"Token":"t"}` → 登录用户场景可见 badge 字段。

- [ ] 加路由 + 路由测试 → `pytest src/api/tests/service/shifu/ -q`(绿)
- [ ] commit `feat(shifu): expose published courses discovery endpoint`

### Task 3 — 前端接口定义

**Files:** Modify `src/cook-web/src/api/api.ts`(shifu 段)

```ts
getPublishedCourses: 'GET /shifu/published-courses',
```

- [ ] type-check:`cd src/cook-web && npm run type-check`
- [ ] commit `feat(cook-web): add published courses api definition`

### Task 4 — i18n 文案

**Files:** `src/i18n/zh-CN/common/core.json`、`src/i18n/en-US/common/core.json`

新增 key(`common.course.*` 命名空间,或在 core 内扁平加 `courseXxx`):`courseOwned=自有`、`coursePurchased=已购入`、`courseInProgress=学习中`、`courseCompleted=已完成`、`courseArchived=已归档`(可复用现有 `archived`)、`courseUpdatedAt=更新`、`discoverEmpty=暂无课程`、`discoverLoadMore=加载更多`。

- [ ] commit `feat(i18n): add course discovery badges and empty state copy`

### Task 5 — `CourseCard` 组件 + Jest 测试

**Files:**
- Create: `src/cook-web/src/app/components/course-discovery/CourseCard.tsx`
- Test: `src/cook-web/src/app/components/course-discovery/CourseCard.test.tsx`

Props:`{ shifu_bid, title, description, avatar_url, price, updated_at, is_archived, is_owner, is_purchased, learn_status, isLoggedIn, onClick }`。视觉参考 `admin/page.tsx` 的 `ShifuCard`(复用 `components/ui/Card`、`Badge`):顶部封面图 + 标题 + line-clamp 介绍 + 更新时间 + 价格 + badge 组。badge 仅 `isLoggedIn` 渲染,按优先级(自有>已购入;学习中/已完成互斥;已归档)。

测试:
- 未登录:不渲染任何 badge;点击触发 `onClick`(由容器决定跳转)。
- 登录:`is_owner && is_purchased` 仅显示自有;`learn_status=603` 显示已完成;`is_archived` 显示已归档。

- [ ] 测试红 → 实现组件 → 绿 → commit `feat(cook-web): add CourseCard component with badge logic`

### Task 6 — `CourseDiscovery` 容器 + 首页改造

**Files:**
- Create: `src/cook-web/src/app/components/course-discovery/CourseDiscovery.tsx`
- Modify: `src/cook-web/src/app/page.tsx`

`CourseDiscovery`(client component):用 `api.getPublishedCourses({ page, page_size })` 拉数据;`useUserStore` 取 `isLoggedIn`;响应式网格;状态:loading(`Skeleton`)、empty、error(`ErrorDisplay`)、"加载更多"分页。卡片点击:`isLoggedIn` → `router.push('/c/'+shifu_bid)`;否则 → `router.push('/login?redirect='+encodeURIComponent('/c/'+shifu_bid))`。

`page.tsx`:移除 `redirectToHomeUrlIfRootPath` 重定向与空 div,改为 `return <CourseDiscovery />`(`'use client'`)。

- [ ] type-check + lint → commit `feat(cook-web): render course discovery feed on homepage`

### Task 7 — 验证与收尾

- [ ] `cd src/api && pytest src/api/tests/service/shifu/test_published_course_catalog.py -q`
- [ ] `cd src/cook-web && npm run type-check && npm run lint`
- [ ] `cd src/cook-web && npm test -- src/app/components/course-discovery/`
- [ ] 回归:`pytest src/api/tests/service/shifu -q`(确保未破坏现有 shifu 测试)
- [ ] 移动本 ExecPlan 至 `docs/exec-plans/completed/`。

## Validation and Acceptance

- 匿名打开首页:看到未归档已发布课程卡片流(封面/标题/介绍/更新时间/价格),无 badge;点击跳 `/login?redirect=...`。
- 真实登录用户:同样卡片流 + badge;本人自有/已购入的归档课程也出现,带「已归档」badge 且排最后;点击进 `/c/[id]`。
- `/c`、`/admin` 行为不变;现有 shifu 后端测试全绿。
- 后端新测试、前端 type-check/lint/jest 通过。

## Idempotence and Recovery

- 接口为只读 GET,无副作用,可安全重试。
- 前端分页:每页独立请求,"加载更多"累加 items;失败可重试当前页(不影响已加载)。
- 改造 `page.tsx` 若需回退,恢复 `redirectToHomeUrlIfRootPath` 逻辑即可;新组件文件保留不影响。

## Interfaces and Dependencies

- 新接口契约:`GET /api/shifu/published-courses?page_index=&page_size=` → `{code,message,data:{page,page_size,total,page_count,items:[...]}}`。
- 依赖现有:`optional_token_validation`、`make_common_response`、`PageNationDTO`、`get_shifu_res_url_dict`、`Order`/`LearnProgressRecord`/`ShifuUserArchive`/`PublishedShifu` 模型、前端 `api`/`request`/`useUserStore`/`Card`/`Badge`/`Skeleton`/`ErrorDisplay`。
- 详见 spec §4–§5。
