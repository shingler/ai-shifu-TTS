// next.config.mjs / next.config.ts
import createMDX from '@next/mdx';
import fs from 'fs';
import type { NextConfig } from 'next';
import path from 'path';

// Resolve shared i18n directory robustly for both local and Docker builds
const looksLikeI18nDir = (candidate: string): boolean => {
  try {
    const stat = fs.statSync(candidate, { throwIfNoEntry: false });
    if (!stat || !stat.isDirectory()) {
      return false;
    }

    const localesJson = path.join(candidate, 'locales.json');
    if (fs.existsSync(localesJson)) {
      return true;
    }

    const entries = fs.readdirSync(candidate, { withFileTypes: true });
    return entries.some(
      entry => entry.isDirectory() && !entry.name.startsWith('.'),
    );
  } catch {
    return false;
  }
};

const resolveSharedI18nPath = (): string | null => {
  const candidates = [
    path.resolve(__dirname, 'src/i18n'), // when building from repo root (Docker)
    path.resolve(__dirname, '../i18n'), // when running Next from src/cook-web
    path.resolve(__dirname, '../../i18n'), // monorepo-like layout
    '/app/i18n',
    '/app/src/i18n',
    '/i18n',
  ];
  for (const p of candidates) {
    if (looksLikeI18nDir(p)) {
      return p;
    }
  }
  return null;
};

const sharedI18nPath = resolveSharedI18nPath();
const sharedLocalesMetadata = (() => {
  if (!sharedI18nPath) return { default: 'en-US', locales: {}, namespaces: [] };
  const localesJsonPath = path.join(sharedI18nPath, 'locales.json');
  try {
    if (fs.existsSync(localesJsonPath)) {
      return JSON.parse(fs.readFileSync(localesJsonPath, 'utf-8'));
    }
  } catch {
    // fall through
  }
  return { default: 'en-US', locales: {}, namespaces: [] };
})();

// locales.json owns the real user-facing locale surface.
const filteredLocales = sharedLocalesMetadata.locales || {};
// Filter out any invalid namespace identifiers
const isValidNs = (s: unknown): s is string =>
  typeof s === 'string' && /^[A-Za-z0-9_.-]+$/.test(s);
const validNamespaces = Array.isArray((sharedLocalesMetadata as any).namespaces)
  ? (sharedLocalesMetadata as any).namespaces.filter(isValidNs)
  : [];

const frontendLocalesMetadata = {
  ...sharedLocalesMetadata,
  locales: filteredLocales,
  namespaces: validNamespaces,
};

const withMDX = createMDX({
  // Support both .md and .mdx
  extension: /\.mdx?$/,
  options: {
    // remarkPlugins: [],
    // rehypePlugins: [],
  },
});

const nextConfig: NextConfig = {
  // Enable standalone output to reduce production image size
  output: 'standalone',

  async redirects() {
    return [{ source: '/main', destination: '/admin', permanent: true }];
  },

  // Locally proxy backend-served storage assets (e.g. course cover images)
  // to the API server. Production relies on the reverse proxy (nginx) for
  // this, so the rewrite is dev-only and scoped to /api/storage to avoid
  // intercepting Next-owned routes such as /api/config and /api/i18n.
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') {
      return [];
    }
    const backendBase = (
      process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5800'
    ).replace(/\/+$/, '');
    return [
      {
        source: '/api/storage/:path*',
        destination: `${backendBase}/api/storage/:path*`,
      },
    ];
  },

  // Disable image optimization to avoid Sharp dependency
  images: {
    unoptimized: true,
  },

  // Effective only in Turbopack dev
  experimental: {
    externalDir: process.env.NEXT_EXTERNAL_DIR === 'true',
  },

  reactStrictMode: false,

  turbopack: {
    rules: {
      '*.less': {
        loaders: ['less-loader'],
        as: '*.css',
      },
    },
  },
  env: {
    NEXT_PUBLIC_I18N_META: JSON.stringify(frontendLocalesMetadata),
  },
  // Include MDX in page extensions if pages/ has MDX pages; for pure app/ it can be removed
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
};

export default withMDX(nextConfig);
