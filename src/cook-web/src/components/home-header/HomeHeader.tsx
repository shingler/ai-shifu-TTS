'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

import LogoWithText from '@/c-components/logo/LogoWithText';
import NavFooterBase from '@/c-components/NavDrawer/NavFooter';
import MainMenuModalBase from '@/c-components/NavDrawer/MainMenuModal';
import { useDisclosure } from '@/c-common/hooks/useDisclosure';
import { useUiLayoutStore } from '@/c-store/useUiLayoutStore';
import { FRAME_LAYOUT_MOBILE } from '@/c-constants/uiConstants';

// Legacy /c components (forwardRef without generics, loose prop types).
// Cast to any to avoid per-attribute @ts-expect-error, consistent with the
// lenient typing used across the /c surface.
const NavFooter: any = NavFooterBase;
const MainMenuModal: any = MainMenuModalBase;

export default function HomeHeader() {
  const router = useRouter();
  const {
    open: menuOpen,
    onToggle: onMenuToggle,
    onClose: onMenuClose,
  } = useDisclosure();

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
        {/*
          Wrap the trigger + menu in a relative container so the menu's
          absolute positioning (see PopupModal.module.scss) anchors to the
          trigger, not the header. style overrides the default left:50%/top:50%
          so the menu floats flush below the name, right-aligned to it.
        */}
        <div className='relative flex items-center'>
          <NavFooter
            ref={footerRef}
            onClick={onMenuToggle}
            isMenuOpen={menuOpen}
          />
          <MainMenuModal
            open={menuOpen}
            onClose={onMenuCloseHandler}
            mobileStyle={isMobile}
            showPersonalInfo={false}
            style={{ left: 'auto', right: 0, top: '100%', transform: 'none' }}
            modalStyle={{ minWidth: '240px', background: 'var(--popover)' }}
          />
        </div>
      </div>
    </header>
  );
}
