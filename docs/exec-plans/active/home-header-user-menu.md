# 首页顶栏复用 `/c` 登录信息模块 — ExecPlan

> 详细设计见 [docs/superpowers/specs/2026-07-06-home-header-user-menu-design.md](../../superpowers/specs/2026-07-06-home-header-user-menu-design.md)。本计划是其执行蓝图,遵循 `PLANS.md`。

## Purpose / Big Picture

首页(`/`)目前只有课程发现网格,**没有任何登录信息入口**。给首页加一条 sticky 顶栏,**原样复用** `/c` 的登录信息模块与菜单项(`NavFooter` + `MainMenuModal`)、个人信息弹窗(`UserSettings`)、品牌 Logo(`LogoWithText`),让访客在首页即可登录与访问账户菜单。

- 新建 `HomeHeader` 组件:左 `LogoWithText` + 右 `NavFooter` 触发器,点击弹 `MainMenuModal`;「个人信息/基本信息」打开 `UserSettings`。
- 修改首页 `page.tsx`:在 `<CourseDiscovery />` 上方挂 `<HomeHeader />`。
- 不重构 `/c`、不抽通用 `UserMenu`、不引入头像、不改课程网格(YAGNI)。

## Progress

- [x] 2026-07-06: Spec 评审通过并提交(`docs: add home header user menu design spec`,`fe29adbb`)。
- [x] 2026-07-06: 确认复用组件契约:`NavFooter`(forwardRef,暴露 `containElement`)、`MainMenuModal`(仅 `onBasicInfoClick`/`onPersonalInfoClick` 需外部接线)、`UserSettings`(无 `open` prop,父级条件渲染,签名 `{onHomeClick, className, onClose, isBasicInfo}`)、`useDisclosure`(纯 `useState` 包装,测试可用真实 hook)。
- [ ] 2026-07-06: Task 1 — `HomeHeader` 组件 + 接线逻辑测试(TDD)。
- [ ] 2026-07-06: Task 2 — 首页 `page.tsx` 集成。
- [ ] 2026-07-06: Task 3 — 验证(type-check/lint/jest)+ 重建 exec-plans 索引。

## Surprises & Discoveries

- 首页 [page.tsx](../../../src/cook-web/src/app/page.tsx) 只渲染 `<CourseDiscovery />`;根 [layout.tsx](../../../src/cook-web/src/app/layout.tsx) 只挂全局 provider(`UserProvider` 等),**两者都没有任何顶栏 UI**——这是首页缺登录入口的根因。
- `/c` 的「登录信息模块」实际是 `NavFooter`(底部条,显示用户名/「未登录」+ 展开图标),不是 `NavHeader`(后者只有 Logo)。菜单项是 `MainMenuModal`,二者在 `NavDrawer` 内组合。
- `MainMenuModal` 里**只有「个人信息/基本信息」两个回调需外部接线**(打开 `UserSettings`);设置密码/管理后台/语言/登录·登出全部组件内部自处理。
- `/c` 里 `UserSettings` 不是 `page.tsx` 直接渲染,而是 `page.tsx` → `ChatUi`(`showUserSettings`/`onUserSettingsClose`/`userSettingBasicInfo` props)→ `ChatUi.tsx:162-168` 内部 `{showUserSettings && <UserSettings onClose=... onHomeClick=... isBasicInfo=... />}` 条件渲染。`UserSettings` **无 `open` prop**。
- `UserSettings` 位于 `@/app/c/[[...id]]/Components/Settings/UserSettings`,import 路径含 `[[...id]]` 较别扭但可解析;本期不移动文件(YAGNI)。
- `useDisclosure`([c-common/hooks/useDisclosure.ts](../../../src/cook-web/src/c-common/hooks/useDisclosure.ts))是纯 `useState` 包装,无外部 context 依赖,测试可直接用真实 hook。

## Decision Log

- **复用粒度(方案 A)**:新建 `HomeHeader`,原样复用 `NavFooter` + `MainMenuModal` + `UserSettings` + `LogoWithText`;不重构 `/c`、不抽通用 `UserMenu`(方案 C 风险高)、不为触发器单独写组件(方案 B,除非 `NavFooter` 样式不契合顶栏)。
- **布局**:sticky 顶栏(`max-w-6xl` 与课程网格同宽),左 Logo 右用户菜单触发器。用户已确认。
- **未登录态**:沿用 `NavFooter` 原逻辑(显示「未登录」,菜单含「登录」),**不**在顶栏另放独立「登录」按钮。用户已确认。
- **菜单回调接线**:与 `/c` [page.tsx:688-702](../../../src/cook-web/src/app/c/[[...id]]/page.tsx) 一致——`onBasicInfoClick` → `isBasicInfo=true; showUserSettings=true`;`onPersonalInfoClick` → `isBasicInfo=false; showUserSettings=true`。
- **`UserSettings` 接线**:与 `ChatUi.tsx:162-168` 一致——父级条件渲染,`onClose`/`onHomeClick` 都指向关闭,`isBasicInfo` 控制初始视图。
- **点击外部关闭菜单**:`MainMenuModal` 的 `onClose` 用 `footerRef.current.containElement(target)` 守卫(与 `NavDrawer` [NavDrawer.tsx:128-137](../../../src/cook-web/src/app/c/[[...id]]/Components/NavDrawer/NavDrawer.tsx) 同款),点击 `NavFooter` 内部不误关。

## Outcomes & Retrospective

(实现完成并通过 `Validation and Acceptance` 全部检查后回填。)

## Context and Orientation

- 复用组件路径:`NavFooter`、`MainMenuModal` 在 [c-components/NavDrawer/](../../../src/cook-web/src/c-components/NavDrawer/)(由 `app/c/[[...id]]/Components/NavDrawer/` re-export);`UserSettings` 在 [app/c/[[...id]]/Components/Settings/UserSettings.tsx](../../../src/cook-web/src/app/c/[[...id]]/Components/Settings/UserSettings.tsx);`LogoWithText` 在 [c-components/logo/LogoWithText.tsx](../../../src/cook-web/src/c-components/logo/LogoWithText.tsx)。
- 登录态来自 `useUserStore`(`NavFooter`/`MainMenuModal`/`UserSettings` 内部各自消费),`HomeHeader` 本身**不直接读登录态**。
- `useDisclosure` 提供菜单开关;`useUiLayoutStore.frameLayout` 判定移动端(`FRAME_LAYOUT_MOBILE`)传给 `MainMenuModal.mobileStyle`。
- 前端请求/文案规范:文案走 i18n(复用现有 `module.user.*`/`component.menus.*` key,不新增);无新增请求。

## Plan of Work

TDD:Task 1 先写 `HomeHeader` 接线测试(红)→ 实现(绿);Task 2 集成;Task 3 全量验证 + 重建索引。`HomeHeader` 是纯组合组件,测试聚焦接线逻辑(点击触发器弹菜单、菜单回调打开 `UserSettings`),复用子组件用 mock 隔离(它们各自的测试不在本期范围)。

## Concrete Steps

### Task 1 — `HomeHeader` 组件 + 接线测试(TDD)

**Files:**
- Create: `src/cook-web/src/components/home-header/HomeHeader.tsx`
- Test: `src/cook-web/src/components/home-header/HomeHeader.test.tsx`

- [ ] **Step 1: 写失败测试**

  创建 `src/cook-web/src/components/home-header/HomeHeader.test.tsx`:

  ```tsx
  import { fireEvent, render, screen } from '@testing-library/react';
  import React from 'react';

  import HomeHeader from './HomeHeader';

  jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
  }));
  jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
  }));
  jest.mock('@/c-components/logo/LogoWithText', () => {
    const Mock = () => <div data-testid='logo' />;
    return { __esModule: true, default: Mock };
  });
  jest.mock('@/c-components/NavDrawer/NavFooter', () => {
    const Mock = (props: { onClick: () => void }) => (
      <button data-testid='nav-footer' onClick={props.onClick} />
    );
    return { __esModule: true, default: Mock, NavFooter: Mock };
  });
  jest.mock('@/c-components/NavDrawer/MainMenuModal', () => {
    const Mock = (props: {
      open: boolean;
      onBasicInfoClick: () => void;
      onPersonalInfoClick: () => void;
    }) => (
      <div data-testid='main-menu' data-open={props.open ? 'true' : 'false'}>
        <button data-testid='basic-info' onClick={props.onBasicInfoClick} />
        <button
          data-testid='personal-info'
          onClick={props.onPersonalInfoClick}
        />
      </div>
    );
    return { __esModule: true, default: Mock };
  });
  jest.mock('@/app/c/[[...id]]/Components/Settings/UserSettings', () => {
    const Mock = () => <div data-testid='user-settings' />;
    return { __esModule: true, default: Mock };
  });
  jest.mock('@/c-store/useUiLayoutStore', () => ({
    useUiLayoutStore: (selector: (s: { frameLayout: string }) => string) =>
      selector({ frameLayout: 'desktop' }),
  }));

  test('renders logo and nav footer trigger; menu initially closed', () => {
    render(<HomeHeader />);
    expect(screen.getByTestId('logo')).toBeInTheDocument();
    expect(screen.getByTestId('nav-footer')).toBeInTheDocument();
    expect(screen.getByTestId('main-menu').getAttribute('data-open')).toBe(
      'false',
    );
  });

  test('clicking the nav footer trigger opens the menu', () => {
    render(<HomeHeader />);
    fireEvent.click(screen.getByTestId('nav-footer'));
    expect(screen.getByTestId('main-menu').getAttribute('data-open')).toBe(
      'true',
    );
  });

  test('basic-info menu item opens UserSettings', () => {
    render(<HomeHeader />);
    fireEvent.click(screen.getByTestId('nav-footer'));
    fireEvent.click(screen.getByTestId('basic-info'));
    expect(screen.getByTestId('user-settings')).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: 跑测试确认失败**

  Run: `cd src/cook-web && npm test -- src/components/home-header/HomeHeader.test.tsx`
  Expected: FAIL(`Cannot find module './HomeHeader'`,组件尚未创建)。

- [ ] **Step 3: 实现 `HomeHeader`**

  创建 `src/cook-web/src/components/home-header/HomeHeader.tsx`:

  ```tsx
  'use client';

  import { useCallback, useRef, useState } from 'react';
  import { useRouter } from 'next/navigation';

  import LogoWithText from '@/c-components/logo/LogoWithText';
  import NavFooter from '@/c-components/NavDrawer/NavFooter';
  import MainMenuModal from '@/c-components/NavDrawer/MainMenuModal';
  import UserSettings from '@/app/c/[[...id]]/Components/Settings/UserSettings';
  import { useDisclosure } from '@/c-common/hooks/useDisclosure';
  import { useUiLayoutStore } from '@/c-store/useUiLayoutStore';
  import { FRAME_LAYOUT_MOBILE } from '@/c-constants/uiConstants';

  export default function HomeHeader() {
    const router = useRouter();
    const {
      open: menuOpen,
      onToggle: onMenuToggle,
      onClose: onMenuClose,
    } = useDisclosure();

    const [showUserSettings, setShowUserSettings] = useState(false);
    const [isBasicInfo, setIsBasicInfo] = useState(false);

    // NavFooter exposes containElement via forwardRef so clicks inside the
    // trigger don't immediately close the menu via the modal's outside-click.
    // Mirrors NavDrawer's wiring (NavDrawer.tsx:128-137).
    // @ts-expect-error EXPECT
    const footerRef = useRef(null);

    const frameLayout = useUiLayoutStore(state => state.frameLayout);
    const isMobile = frameLayout === FRAME_LAYOUT_MOBILE;

    const onLogoClick = useCallback(() => {
      router.push('/');
    }, [router]);

    const onBasicInfoClick = useCallback(() => {
      setIsBasicInfo(true);
      setShowUserSettings(true);
      onMenuClose();
    }, [onMenuClose]);

    const onPersonalInfoClick = useCallback(() => {
      setIsBasicInfo(false);
      setShowUserSettings(true);
      onMenuClose();
    }, [onMenuClose]);

    const onMenuCloseHandler = useCallback(
      (event?: { target?: unknown }) => {
        const target = event?.target;
        // @ts-expect-error EXPECT
        if (target && footerRef.current && footerRef.current.containElement(target)) {
          return;
        }
        onMenuClose();
      },
      [onMenuClose],
    );

    return (
      <header className='sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur'>
        <div className='mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3'>
          <button
            type='button'
            onClick={onLogoClick}
            className='cursor-pointer'
            aria-label='home'
          >
            <LogoWithText direction='row' size={32} />
          </button>
          {/* @ts-expect-error EXPECT */}
          <NavFooter
            ref={footerRef}
            onClick={onMenuToggle}
            isMenuOpen={menuOpen}
          />
        </div>
        {/* @ts-expect-error EXPECT */}
        <MainMenuModal
          open={menuOpen}
          onClose={onMenuCloseHandler}
          mobileStyle={isMobile}
          onBasicInfoClick={onBasicInfoClick}
          onPersonalInfoClick={onPersonalInfoClick}
        />
        {showUserSettings && (
          <UserSettings
            onClose={() => setShowUserSettings(false)}
            onHomeClick={() => setShowUserSettings(false)}
            isBasicInfo={isBasicInfo}
          />
        )}
      </header>
    );
  }
  ```

  > 注:`NavFooter`/`MainMenuModal` 是 legacy 组件(无 TS 类型声明),`@ts-expect-error` 与 `/c` 现有用法一致([NavDrawer.tsx](../../../src/cook-web/src/app/c/[[...id]]/Components/NavDrawer/NavDrawer.tsx) 大量使用)。`UserSettings` import 路径含 `[[...id]]`,见 Surprises。

- [ ] **Step 4: 跑测试确认通过**

  Run: `cd src/cook-web && npm test -- src/components/home-header/HomeHeader.test.tsx`
  Expected: PASS(3 个用例)。

- [ ] **Step 5: type-check**

  Run: `cd src/cook-web && npm run type-check`
  Expected: 零错误。(若 `@/app/c/[[...id]]/...` import 报模块解析错误,见 Idempotence and Recovery。)

- [ ] **Step 6: Commit**

  ```bash
  git add src/cook-web/src/components/home-header/HomeHeader.tsx src/cook-web/src/components/home-header/HomeHeader.test.tsx
  git commit -m "feat(cook-web): add HomeHeader reusing /c login info and menu"
  ```

### Task 2 — 首页集成

**Files:**
- Modify: `src/cook-web/src/app/page.tsx`

- [ ] **Step 1: 改 page.tsx**

  把 [page.tsx](../../../src/cook-web/src/app/page.tsx) 整体替换为:

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

- [ ] **Step 2: type-check + lint**

  Run: `cd src/cook-web && npm run type-check && npm run lint`
  Expected: type-check 零错误;lint 无新增 error/warning。

- [ ] **Step 3: Commit**

  ```bash
  git add src/cook-web/src/app/page.tsx
  git commit -m "feat(cook-web): mount HomeHeader on the homepage"
  ```

### Task 3 — 验证与收尾

- [ ] **Step 1: 组件测试**

  Run: `cd src/cook-web && npm test -- src/components/home-header/`
  Expected: `HomeHeader.test.tsx` 3/3 通过。

- [ ] **Step 2: 前端类型 + lint 总检**

  Run: `cd src/cook-web && npm run type-check && npm run lint`
  Expected: 通过。

- [ ] **Step 3: 重建 exec-plans 索引**

  Run(从仓库根): `python scripts/build_repo_knowledge_index.py`
  Expected: [docs/exec-plans/index.md](./../index.md) `## Active` 出现本 plan。该文件由脚本生成,勿手编。

- [ ] **Step 4: 提交索引刷新**

  ```bash
  git add docs/exec-plans/index.md
  git commit -m "chore(docs): refresh exec-plans index for home header plan"
  ```
  (仅提交 `index.md`;脚本可能同时再生 `docs/generated/*`,若需保持生成物同步可一并 `git add docs/generated/` 加入此 commit。)

- [ ] **Step 5: 手测**(需本地起前端)

  打开首页 `/`:顶栏左 Logo(点击回首页)、右触发器(登录态显示用户名/未登录显示「未登录」)。点触发器弹菜单:个人信息 → 打开 `UserSettings` 弹窗;管理后台/创建课程 → 新窗 `/admin`;语言切换生效;登出/登录流程正常。课程网格、`/c`、创作者端不受影响。

## Validation and Acceptance

- 首页顶部出现 sticky 顶栏:左 Logo、右用户菜单触发器。
- 已登录:触发器显示用户名;菜单含「个人信息/设置密码/管理后台或创建课程/语言/登出」;「个人信息」打开 `UserSettings` 弹窗且可编辑保存。
- 未登录:触发器显示「未登录」;菜单含「登录」;点「登录」弹出登录框;点「个人信息」先触发登录。
- 课程发现网格(`/`)、`/c`、创作者端(`/admin`、`/shifu/[id]`)行为不受影响。
- `type-check`、`lint`、`HomeHeader` Jest 通过。

## Idempotence and Recovery

- `HomeHeader` 是纯新增组件,回退即删除该目录。
- `page.tsx` 回退即恢复 `return <CourseDiscovery />;`。
- **import 路径风险**:若 `@/app/c/[[...id]]/Components/Settings/UserSettings` 在 TS/构建报模块解析错误,退化方案——在 `src/cook-web/src/components/settings/index.ts` 建 re-export 桥接(`export { default } from '@/app/c/[[...id]]/Components/Settings/UserSettings';`),`HomeHeader` 改从 `@/components/settings` import。若仍不行,则把 `UserSettings` 视作需移动(超出本期,转单独重构)。
- **`NavFooter` 样式风险**:若其 scss 在顶栏右侧视觉不契合(它是 NavDrawer 底部条样式),保留 `HomeHeader` 接线逻辑,把 `<NavFooter>` 替换为一个简化触发器(`<button>{isLoggedIn ? userInfo?.name : t('module.user.notLogin')} <ChevronDown/></button>`),复用同样的 `onClick=onMenuToggle` 与 `MainMenuModal`。显示逻辑与 `NavFooter` 保持一致。
- 重建索引产生意外 diff 时可 `git checkout docs/exec-plans/index.md` 后重跑脚本。

## Interfaces and Dependencies

- **新组件契约**:`HomeHeader()`(无 props),`'use client'`,默认导出。
- **依赖现有**:`NavFooter`、`MainMenuModal`、`UserSettings`、`LogoWithText`、`useDisclosure`、`useUiLayoutStore`、`FRAME_LAYOUT_MOBILE`、`useRouter`。无新增 store/hook/request/i18n key。
- **不改**:课程发现网格、`/c`、创作者端、后端。
- 详见 spec §3–§5。
