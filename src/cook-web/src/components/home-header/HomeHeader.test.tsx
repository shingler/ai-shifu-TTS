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
    showPersonalInfo: boolean;
    style?: Record<string, string>;
  }) => (
    <div
      data-testid='main-menu'
      data-open={props.open ? 'true' : 'false'}
      data-show-personal={props.showPersonalInfo ? 'true' : 'false'}
      data-style={props.style ? JSON.stringify(props.style) : ''}
    />
  );
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

test('hides personal info item and anchors the menu flush below the trigger', () => {
  render(<HomeHeader />);
  const menu = screen.getByTestId('main-menu');
  expect(menu.getAttribute('data-show-personal')).toBe('false');
  const style = menu.getAttribute('data-style') || '';
  expect(style).toContain('"right":0');
  expect(style).toContain('"top":"100%"');
  expect(style).toContain('"left":"auto"');
});
