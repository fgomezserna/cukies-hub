import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/games/sybil-slayer/play/:path*",
        // The destination URL should be the one where your game is running
        destination: "http://localhost:9002/games/sybil-slayer/play/:path*",
      },
    ];
  },
};

export default nextConfig;
