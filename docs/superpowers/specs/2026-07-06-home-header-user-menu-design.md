# 首页顶栏复用 `/c` 登录信息模块 — 设计规格

- 日期:2026-07-06
- 状态:待评审
- 范围:前端 cook-web 首页(`/`)新增 sticky 顶栏,复用 `/c` 的登录信息模块与菜单项
- 关联:[首页课程发现卡片流](./2026-06-24-homepage-course-discovery-design.md)、[课程发现页「可听课」徽章](./2026-07-06-course-discovery-tts-badge-design.md)

## 1. 背景与目标

首页([page.tsx](../../../src/cook-web/src/app/page.tsx))当前只渲染 `<CourseDiscovery />`,**没有任何顶栏或登录信息入口**:访客能看到课程卡片,但无法登录、查看个人信息、切换语言、进入管理后台或登出。这些能力目前只存在于 `/c` 学习页的左侧 `NavDrawer` 里。

**目标**:给首页加一条 sticky 顶栏,**复用** `/c` 已有的「登录信息模块 + 菜单项」,让首页访客也能登录与访问账户菜单——不新建一套并行的用户菜单。

## 2. 范围

**包含**

- 新增 `HomeHeader` 组件(sticky 顶栏:左 Logo + 右用户菜单)。
- 修改首页 `page.tsx`,在 `<CourseDiscovery />` 上方挂载 `<HomeHeader />`。
- 复用(不改)现有组件:`NavFooter`、`MainMenuModal`、`UserSettings`、`LogoWithText`。

**非目标(YAGNI)**

- 不重构 `/c` 的 `NavDrawer`,不抽通用 `UserMenu`(方案 C,风险高、收益低)。
- 不引入用户头像(`NavFooter` 现无头像,本期不加)。
- 不改课程发现网格、不改 `/c`、不改创作者端。
- 不加搜索、通知、面包屑等其它顶栏入口。
- 不把 `UserSettings` 移到更通用的目录(尽管其 `import` 路径含 `[[...id]]` 较别扭,本期 YAGNI;见 §7)。

## 3. 复用的现有组件

| 组件 | 路径 | 职责 | 关键依赖 |
|------|------|------|----------|
| `NavFooter` | [c-components/NavDrawer/NavFooter.tsx](../../../src/cook-web/src/c-components/NavDrawer/NavFooter.tsx) | 登录信息触发器:显示用户名(登录用 `userInfo.name`,未登录显示「未登录」)+ 展开/收起图标;点击触发菜单;`forwardRef` 暴露 `containElement` 供点击外部关闭 | `useUserStore`、i18n |
| `MainMenuModal` | [c-components/NavDrawer/MainMenuModal.tsx](../../../src/cook-web/src/c-components/NavDrawer/MainMenuModal.tsx) | 弹出菜单项:个人信息、设置密码(条件)、管理后台/创建课程、语言切换、登录·登出。**除「个人信息/基本信息」外全部内部自处理**(设置密码走 `SetPasswordModal`、管理后台 `window.open('/admin')`、语言走 `LanguageSelect`、登录登出走 `shifu.loginTools`/`useUserStore.logout`) | `useUserStore`、`useEnvStore`、`shifu.loginTools`、i18n、tracking |
| `UserSettings` | [app/c/[[...id]]/Components/Settings/UserSettings.tsx](../../../src/cook-web/src/app/c/[[...id]]/Components/Settings/UserSettings.tsx) | 个人信息编辑弹窗(昵称/头像/性别/生日 + 动态 profile 项);`isBasicInfo` 区分 basic/personal 初始视图 | `useUserStore`、`useEnvStore.courseId`、`c-api/user`、i18n |
| `LogoWithText` | [c-components/logo/LogoWithText.tsx](../../../src/cook-web/src/c-components/logo/LogoWithText.tsx) | 品牌 Logo + 文字 | — |

`MainMenuModal` 的 `onBasicInfoClick` / `onPersonalInfoClick` 是**仅有的两个需外部接线**的回调(在 `/c` 里打开 `UserSettings`,见 [page.tsx:688-702](../../../src/cook-web/src/app/c/[[...id]]/page.tsx));其余菜单项自包含。

## 4. `HomeHeader` 组件设计

**文件**:`src/components/home-header/HomeHeader.tsx`(`'use client'`)。

**职责**:首页 sticky 顶栏;组合 Logo + 用户菜单触发器 + 菜单弹窗 + 设置弹窗。

**结构**:

```tsx
'use client';
// sticky 顶栏,宽度与 CourseDiscovery 的 max-w-6xl 对齐
<div className='sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur'>
  <div className='mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3'>
    {/* 左:Logo,点击回首页 */}
    <LogoWithText direction='row' size={32} onClick={() => router.push('/')} />

    {/* 右:用户菜单触发器(复用 NavFooter) */}
    <NavFooter
      ref={footerRef}
      onClick={onToggle}          // useDisclosure 的 toggle
      isMenuOpen={open}           // 菜单展开态 → 控制 Chevron 图标方向
    />
  </div>

  {/* 菜单弹窗(复用 MainMenuModal) */}
  <MainMenuModal
    open={open}
    onClose={onClose}
    mobileStyle={isMobile}
    onBasicInfoClick={() => { setIsBasicInfo(true); setShowUserSettings(true); }}
    onPersonalInfoClick={() => { setIsBasicInfo(false); setShowUserSettings(true); }}
  />

  {/* 个人信息弹窗(复用 UserSettings;无 open prop,父级条件渲染,见 §7.4) */}
  {showUserSettings && (
    <UserSettings
      onClose={() => setShowUserSettings(false)}
      isBasicInfo={isBasicInfo}
    />
  )}
</div>
```

**状态**:
- `useDisclosure()` → `MainMenuModal` 的 `open`/`onToggle`/`onClose`。
- `showUserSettings`(bool)、`isBasicInfo`(bool) → `UserSettings` 弹窗。
- `footerRef` → 传给 `NavFooter`(其 `containElement` 用于点击外部关闭菜单,与 `/c` 的 [NavDrawer.tsx:128-137](../../../src/cook-web/src/app/c/[[...id]]/Components/NavDrawer/NavDrawer.tsx) 同款接线)。

**响应式**:顶栏 `max-w-6xl` 与课程网格对齐;`MainMenuModal` 的 `mobileStyle` 由 `useUiLayoutStore.frameLayout === FRAME_LAYOUT_MOBILE` 派生(沿用 `/c` 判定)。

## 5. 首页集成

[page.tsx](../../../src/cook-web/src/app/page.tsx) 改为:

```tsx
import CourseDiscovery from '@/components/course-discovery/CourseDiscovery';
import HomeHeader from '@/components/home-header/HomeHeader';

export default function Home() {
  return (
    <>
      <HomeHeader />
      <CourseDiscovery />
    </>
  );
}
```

`HomeHeader` 是 `sticky`,`CourseDiscovery` 的 `p-6` 内边距保持;顶栏不挤占网格内容(网格在顶栏下方自然流动)。

## 6. 登录态行为

| 状态 | NavFooter 显示 | MainMenuModal 菜单项 |
|------|----------------|----------------------|
| 已登录 | `userInfo.name`(或默认名)+ 收起图标 | 个人信息 / 设置密码(条件) / 管理后台(creator)或创建课程 / 语言 / **登出** |
| 未登录 | 「未登录」+ 展开图标 | 个人信息(触发登录) / 设置密码(触发登录) / 创建课程 / 语言 / **登录** |

未登录时点「个人信息/设置密码」会先 `shifu.loginTools.openLogin()`(MainMenuModal 内部逻辑,见 [MainMenuModal.tsx:70-107](../../../src/cook-web/src/c-components/NavDrawer/MainMenuModal.tsx))。**沿用 NavFooter 原逻辑**,不在顶栏额外放独立「登录」按钮(已在设计中与用户确认)。

## 7. 边界与风险

1. **NavFooter 样式契合度**:`NavFooter` 的 scss 是 `NavDrawer` 底部条样式;放在顶栏右侧若视觉不契合,触发器退化为简化版(用户名 + `ChevronDown`),但**显示逻辑与 NavFooter 保持一致**。实现时目测决定,默认先原样复用。
2. **`UserSettings` 的 import 路径**:组件位于 `@/app/c/[[...id]]/Components/Settings/UserSettings`,路径含 `[[...id]]` 较别扭但可解析;本期 YAGNI 不移动文件。若构建/解析对方括号路径报错,退化方案:在 UserSettings 现位置加一个 `@/components/settings` re-export 桥接(不在本期预设)。
3. **`UserSettings` 依赖 `courseId`**:首页 `useEnvStore.courseId` 为空。fixed 项(昵称/头像/性别/生日)不依赖课程;动态 profile 项(`DynamicSettingItem`)在无课程时应为空列表——实现时验证不报错。
4. **`UserSettings` props 契约**:其签名是 `{ onHomeClick, className, onClose, isBasicInfo }`(见 [UserSettings.tsx:28-33](../../../src/cook-web/src/app/c/[[...id]]/Components/Settings/UserSettings.tsx)),**无 `open` prop**——它本身可能是常驻/由父级条件渲染。实现时按实际契约接线(父级 `{showUserSettings && <UserSettings .../>}` 或组件内部门控),以源码为准。
5. **移动端**:`MainMenuModal` 已支持 `mobileStyle`;顶栏 sticky 在移动端同样适用。

## 8. 测试策略

- `cd src/cook-web && npm run type-check && npm run lint`。
- `HomeHeader` 基础渲染测试(若有 Jest 范式):登录态显示用户名、未登录显示「未登录」、点击 NavFooter 触发器弹出 MainMenuModal。复用组件(NavFooter/MainMenuModal/UserSettings)不重测。
- 手测:匿名 → 顶栏「未登录」→ 点开菜单 → 「登录」弹出登录框;登录后 → 用户名 → 「个人信息」打开 UserSettings → 编辑保存 → 「登出」;「管理后台/创建课程」新窗打开 `/admin`;语言切换生效。

## 9. 验收标准

- 首页顶部出现 sticky 顶栏:左 Logo(点击回首页)、右用户菜单触发器。
- 已登录:触发器显示用户名,菜单含「个人信息/设置密码/管理后台或创建课程/语言/登出」,「个人信息」打开 UserSettings 弹窗。
- 未登录:触发器显示「未登录」,菜单含「登录」,点「登录」弹出登录框。
- 课程发现网格、`/c`、创作者端行为不受影响。
- `type-check`、`lint` 通过。
