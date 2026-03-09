import type { NextConfig } from "next";

const gitSha =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  process.env.NEXT_PUBLIC_GIT_SHA ??
  'unknown';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GIT_SHA: gitSha,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
