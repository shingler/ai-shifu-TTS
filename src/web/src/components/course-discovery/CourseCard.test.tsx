import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import CourseCard, { type CourseItem } from './CourseCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseCourse: CourseItem = {
  shifu_bid: 'c1',
  title: 'My Course',
  description: 'desc',
  avatar_url: '',
  price: '0',
  updated_at: '2026-05-15T10:00:00',
  is_archived: false,
  is_owner: false,
  is_purchased: false,
  learn_status: null,
  tts_enabled: false,
};

const renderCard = (
  overrides: Partial<CourseItem> = {},
  isLoggedIn = false,
  onClick = jest.fn(),
) =>
  render(
    <CourseCard
      course={{ ...baseCourse, ...overrides }}
      isLoggedIn={isLoggedIn}
      onClick={onClick}
    />,
  );

test('renders no badges when logged out even if flags are set', () => {
  renderCard(
    {
      is_owner: true,
      is_purchased: true,
      learn_status: 603,
      is_archived: true,
    },
    false,
  );
  expect(screen.queryByText('common.core.courseOwned')).toBeNull();
  expect(screen.queryByText('common.core.coursePurchased')).toBeNull();
  expect(screen.queryByText('common.core.courseCompleted')).toBeNull();
  expect(screen.queryByText('common.core.archived')).toBeNull();
});

test('renders owner badge and hides purchased when both are true', () => {
  renderCard({ is_owner: true, is_purchased: true }, true);
  expect(screen.getByText('common.core.courseOwned')).toBeInTheDocument();
  expect(screen.queryByText('common.core.coursePurchased')).toBeNull();
});

test('renders purchased badge for a non-owner buyer', () => {
  renderCard({ is_owner: false, is_purchased: true }, true);
  expect(screen.getByText('common.core.coursePurchased')).toBeInTheDocument();
});

test('renders completed badge for learn_status 603', () => {
  renderCard({ is_purchased: true, learn_status: 603 }, true);
  expect(screen.getByText('common.core.courseCompleted')).toBeInTheDocument();
});

test('renders in-progress badge for learn_status 602', () => {
  renderCard({ is_purchased: true, learn_status: 602 }, true);
  expect(screen.getByText('common.core.courseInProgress')).toBeInTheDocument();
});

test('renders archived badge when archived', () => {
  renderCard({ is_owner: true, is_archived: true }, true);
  expect(screen.getByText('common.core.archived')).toBeInTheDocument();
});

test('calls onClick with shifu_bid when the card is clicked', () => {
  const onClick = jest.fn();
  render(
    <CourseCard
      course={baseCourse}
      isLoggedIn={false}
      onClick={onClick}
    />,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(onClick).toHaveBeenCalledWith('c1');
});

test('renders audio badge when tts_enabled is true (independent of login)', () => {
  renderCard({ tts_enabled: true }, false);
  expect(screen.getByText('common.core.courseAudioAvailable')).toBeInTheDocument();
});

test('does not render audio badge when tts_enabled is false', () => {
  renderCard({ tts_enabled: false }, true);
  expect(screen.queryByText('common.core.courseAudioAvailable')).toBeNull();
});
