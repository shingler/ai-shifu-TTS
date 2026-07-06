'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import LogoWithText from '@/c-components/logo/LogoWithText';
import NavFooterBase from '@/c-components/NavDrawer/NavFooter';
import MainMenuModalBase from '@/c-components/NavDrawer/MainMenuModal';
import UserSettingsBase from '@/app/c/[[...id]]/Components/Settings/UserSettings';
import { useDisclosure } from '@/c-common/hooks/useDisclosure';
import { useUiLayoutStore } from '@/c-store/useUiLayoutStore';
import { FRAME_LAYOUT_MOBILE } from '@/c-constants/uiConstants';

// Legacy /c components (forwardRef without generics, non-optional className)
// have loose prop types. Cast to any to avoid per-attribute @ts-expect-error,
// consistent with the lenient typing used across the /c surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NavFooter: any = NavFooterBase;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MainMenuModal: any = MainMenuModalBase;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const UserSettings: any = UserSettingsBase;

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
  const footerRef = useRef<{ containElement?: (el: unknown) => boolean } | null>(
    null,
  );

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
      if (target && footerRef.current?.containElement?.(target)) {
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
        <NavFooter
          ref={footerRef}
          onClick={onMenuToggle}
          isMenuOpen={menuOpen}
        />
      </div>
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
