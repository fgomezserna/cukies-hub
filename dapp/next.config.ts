import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
    ],
  },
  env: {
    NEXT_PUBLIC_DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    NEXT_PUBLIC_TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID,
    NEXT_PUBLIC_GAME_SYBILSLASH: process.env.GAME_SYBILSLASH,
    NEXT_PUBLIC_GAME_HYPPIE_ROAD: process.env.GAME_HYPPIE_ROAD,
    NEXT_PUBLIC_GAME_TOWER_BUILDER: process.env.GAME_TOWER_BUILDER,
  },
};

export default nextConfig;
