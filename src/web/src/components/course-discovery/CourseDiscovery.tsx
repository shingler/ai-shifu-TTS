'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import api from '@/api';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useUserStore } from '@/store';

import CourseCard, { type CourseItem } from './CourseCard';

interface CatalogData {
  page: number;
  page_size: number;
  total: number;
  page_count: number;
  items: CourseItem[];
}

type LoadStatus = 'loading' | 'ready' | 'error';

const PAGE_SIZE = 24;

export default function CourseDiscovery() {
  const { t } = useTranslation();
  const router = useRouter();
  const isLoggedIn = useUserStore(state => state.isLoggedIn);

  const [items, setItems] = useState<CourseItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (pageNum: number, append: boolean) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setStatus('loading');
      }
      const data = (await api.getPublishedCourses({
        page_index: pageNum,
        page_size: PAGE_SIZE,
      })) as CatalogData;
      setItems(prev => (append ? [...prev, ...data.items] : data.items));
      setPage(data.page);
      setPageCount(data.page_count);
      setStatus('ready');
    } catch {
      setStatus('error');
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  const handleClick = (shifuBid: string) => {
    const target = `/c/${shifuBid}`;
    if (isLoggedIn) {
      router.push(target);
    } else {
      router.push(`/login?redirect=${encodeURIComponent(target)}`);
    }
  };

  if (status === 'loading') {
    return (
      <div className='mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className='h-64 w-full rounded-xl' />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className='flex flex-col items-center justify-center gap-4 p-16'>
        <p className='text-muted-foreground'>{t('common.core.networkError')}</p>
        <Button variant='outline' onClick={() => fetchPage(1, false)}>
          {t('common.core.retry')}
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className='flex items-center justify-center p-16 text-muted-foreground'>
        {t('common.core.discoverEmpty')}
      </div>
    );
  }

  return (
    <div className='mx-auto w-full max-w-6xl p-6'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {items.map(course => (
          <CourseCard
            key={course.shifu_bid}
            course={course}
            isLoggedIn={isLoggedIn}
            onClick={handleClick}
          />
        ))}
      </div>
      {page < pageCount && (
        <div className='mt-8 flex justify-center'>
          <Button
            variant='outline'
            disabled={loadingMore}
            onClick={() => fetchPage(page + 1, true)}
          >
            {loadingMore
              ? t('common.core.submitting')
              : t('common.core.discoverLoadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
