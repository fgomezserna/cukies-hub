import type {NextConfig} from 'next';
import { buildFrameAncestorsPolicy } from './src/lib/parent-origin';

const configuredBasePath = process.env.NEXT_PUBLIC_GAME_BASE_PATH?.trim() ?? '';
if (configuredBasePath && !/^\/[a-z0-9][a-z0-9/_-]*$/i.test(configuredBasePath)) {
  throw new Error('NEXT_PUBLIC_GAME_BASE_PATH must be empty or an absolute URL path');
}

const nextConfig: NextConfig = {

  basePath: configuredBasePath,

  /* config options here */
  env: {
    NEXT_PUBLIC_GAME_CACHE_VERSION:
      process.env.NEXT_PUBLIC_GAME_CACHE_VERSION ??
      process.env.SOURCE_COMMIT ??
      'dev',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    const frameAncestors = buildFrameAncestorsPolicy(
      process.env.NODE_ENV,
      process.env.NEXT_PUBLIC_DAPP_ORIGIN,
      process.env.NEXT_PUBLIC_PARENT_URL,
    );
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
