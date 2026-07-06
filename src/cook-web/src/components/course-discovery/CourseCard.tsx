'use client';

import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/Badge';

export interface CourseItem {
  shifu_bid: string;
  title: string;
  description: string;
  avatar_url: string;
  price: string;
  updated_at: string;
  is_archived: boolean;
  is_owner: boolean;
  is_purchased: boolean;
  learn_status: number | null;
  tts_enabled: boolean;
}

export interface CourseCardProps {
  course: CourseItem;
  isLoggedIn: boolean;
  onClick: (shifuBid: string) => void;
}

const LEARN_STATUS_IN_PROGRESS = 602;
const LEARN_STATUS_COMPLETED = 603;

export default function CourseCard({
  course,
  isLoggedIn,
  onClick,
}: CourseCardProps) {
  const { t } = useTranslation();

  const showOwner = isLoggedIn && course.is_owner;
  const showPurchased = isLoggedIn && !course.is_owner && course.is_purchased;
  const showInProgress =
    isLoggedIn && course.learn_status === LEARN_STATUS_IN_PROGRESS;
  const showCompleted =
    isLoggedIn && course.learn_status === LEARN_STATUS_COMPLETED;
  const showArchived = isLoggedIn && course.is_archived;

  const updatedLabel = course.updated_at
    ? `${t('common.core.courseUpdatedAt')} ${course.updated_at.slice(0, 10)}`
    : '';
  const showPrice = Number(course.price) > 0;

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={() => onClick(course.shifu_bid)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(course.shifu_bid);
        }
      }}
      className='group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md'
    >
      <div className='aspect-[16/9] w-full bg-muted'>
        {course.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.avatar_url}
            alt={course.title}
            className='h-full w-full object-cover'
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center text-sm text-muted-foreground'>
            {t('common.core.shifu')}
          </div>
        )}
      </div>
      <div className='flex flex-1 flex-col gap-2 p-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <h3 className='line-clamp-1 text-base font-semibold text-foreground'>
            {course.title}
          </h3>
          {showOwner && (
            <Badge variant='default'>{t('common.core.courseOwned')}</Badge>
          )}
          {showPurchased && (
            <Badge variant='secondary'>
              {t('common.core.coursePurchased')}
            </Badge>
          )}
          {showInProgress && (
            <Badge variant='outline'>{t('common.core.courseInProgress')}</Badge>
          )}
          {showCompleted && (
            <Badge variant='outline'>{t('common.core.courseCompleted')}</Badge>
          )}
          {showArchived && (
            <Badge variant='outline'>{t('common.core.archived')}</Badge>
          )}
          {course.tts_enabled && (
            <Badge variant='success'>{t('common.core.courseAudioAvailable')}</Badge>
          )}
        </div>
        <p className='line-clamp-2 text-sm text-muted-foreground'>
          {course.description}
        </p>
        <div className='mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground'>
          <span>{updatedLabel}</span>
          {showPrice && <span>{`¥${course.price}`}</span>}
        </div>
      </div>
    </div>
  );
}
