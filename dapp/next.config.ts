import type {NextConfig} from 'next';

function treasureHuntPublicBaseUrl() {
  const configured = process.env.GAME_SYBILSLASH?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
      return null;
    }
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

const treasureHuntBaseUrl = treasureHuntPublicBaseUrl();

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cukies.s3.eu-west-3.amazonaws.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    NEXT_PUBLIC_TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID,
    NEXT_PUBLIC_GAME_SYBILSLASH: process.env.GAME_SYBILSLASH,
    NEXT_PUBLIC_GAME_HYPPIE_ROAD: process.env.GAME_HYPPIE_ROAD,
    NEXT_PUBLIC_GAME_TOWER_BUILDER: process.env.GAME_TOWER_BUILDER,
  },
  async rewrites() {
    if (!treasureHuntBaseUrl) return [];
    return {
      beforeFiles: [
        {
          source: '/assets/:path*',
          destination: `${treasureHuntBaseUrl}/assets/:path*`,
        },
        {
          source: '/joy.js',
          destination: `${treasureHuntBaseUrl}/joy.js`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
