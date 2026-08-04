import styles from './ChatMobileHeader.module.scss';

import { memo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useSystemStore } from '@/c-store/useSystemStore';
import { useEnvStore } from '@/c-store/envStore';
import { Home, Menu, X } from 'lucide-react';
import MobileHeaderIconPopover from './MobileHeaderIconPopover';
import { useDisclosure } from '@/c-common/hooks/useDisclosure';
import { shifu } from '@/c-service/Shifu';
import CourseHeaderSummary from './CourseHeaderSummary';
import LearningModeSwitch from './LearningModeSwitch';
import PreviewHeaderBanner from './PreviewHeaderBanner';
import LessonUpdateNotice from './LessonUpdateNotice';

export const ChatMobileHeader = ({
  className,
  onSettingClick,
  navOpen,
  iconPopoverPayload,
  lessonUpdateNoticeVisible = false,
  chapterId,
  lessonId,
  lessonTitle,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const homeUrl = useEnvStore(state => state.homeUrl);
  const { onOpen: onIconPopoverOpen, onClose: onIconPopoverClose } =
    useDisclosure();

  const onGoHomeClick = () => {
    const target = homeUrl || '/';
    if (target === '/') {
      router.push('/');
    } else {
      window.open(target, '_blank', 'noreferrer');
    }
  };

  const hasPopoverContentControl = shifu.hasControl(
    shifu.ControlTypes.MOBILE_HEADER_ICON_POPOVER,
  );

  const { previewMode, showLearningModeToggle } = useSystemStore(
    useShallow(state => ({
      previewMode: state.previewMode,
      showLearningModeToggle: state.showLearningModeToggle,
    })),
  );
  const MenuIcon = navOpen ? X : Menu;

  return (
    <div className={cn(styles.ChatMobileHeader, className)}>
      {iconPopoverPayload && hasPopoverContentControl ? (
        <div
          className='hidden'
          style={{ display: 'none' }}
        >
          <MobileHeaderIconPopover
            payload={iconPopoverPayload}
            onOpen={onIconPopoverOpen}
            onClose={onIconPopoverClose}
          />
        </div>
      ) : null}
      {previewMode ? <PreviewHeaderBanner /> : null}
      <div className={styles.headerRow}>
        <button
          type='button'
          aria-label={t('component.menus.navigationMenus.home')}
          className={cn(styles.iconButton, 'mr-3')}
          onClick={onGoHomeClick}
        >
          <Home
            size={20}
            strokeWidth={2}
            className='text-neutral-500'
          />
        </button>
        <CourseHeaderSummary />

        <div className={styles.actionGroup}>
          {showLearningModeToggle ? <LearningModeSwitch /> : null}

          <button
            type='button'
            aria-label={
              navOpen
                ? t('module.chat.closeCatalog')
                : t('module.chat.openCatalog')
            }
            className={styles.iconButton}
            onClick={onSettingClick}
          >
            <MenuIcon
              size={20}
              strokeWidth={2}
              className='text-neutral-500'
            />
          </button>
        </div>
      </div>
      {lessonUpdateNoticeVisible ? (
        <div className={styles.noticeRow}>
          <LessonUpdateNotice
            chapterId={chapterId}
            lessonId={lessonId}
            lessonTitle={lessonTitle}
            compact
            className={styles.lessonUpdateNotice}
          />
        </div>
      ) : null}
    </div>
  );
};

export default memo(ChatMobileHeader);
