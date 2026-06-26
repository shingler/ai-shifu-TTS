import { initializeEnvData } from './initializeEnvData';
import { redirectToHomeUrlIfRootPath } from '@/lib/utils';

jest.mock('@/c-store', () => {
  // Minimal stand-in for the env store: data fields are concrete values,
  // any other access (the many update* setters) returns a noop mock.
  const state = new Proxy(
    {
      runtimeConfigLoaded: false,
      baseURL: '',
      paymentChannels: [] as string[],
      loginMethodsEnabled: [] as string[],
      defaultLoginMethod: '',
      legalUrls: {} as Record<string, unknown>,
    },
    {
      get: (target, prop: string | symbol) =>
        prop in target
          ? (target as Record<string | symbol, unknown>)[prop]
          : jest.fn(),
    },
  );
  return { useEnvStore: { getState: () => state } };
});

jest.mock('@/config/environment', () => ({
  getDynamicApiBaseUrl: jest.fn(async () => ''),
}));

jest.mock('@/c-utils/envUtils', () => ({
  getBoolEnv: jest.fn(() => false),
}));

jest.mock('@/lib/utils', () => ({
  ...jest.requireActual('@/lib/utils'),
  redirectToHomeUrlIfRootPath: jest.fn(() => false),
}));

describe('initializeEnvData', () => {
  beforeEach(() => {
    (redirectToHomeUrlIfRootPath as jest.Mock).mockClear();
    (global as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { homeUrl: '/c' } }),
    });
  });

  test('does not redirect away from the homepage discovery feed', async () => {
    // Homepage `/` must render the course discovery feed, not bounce to /c.
    await initializeEnvData();
    expect(redirectToHomeUrlIfRootPath).not.toHaveBeenCalled();
  });
});
