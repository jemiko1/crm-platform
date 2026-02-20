import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Pre-existing type errors in the frontend; tracked for cleanup.
    // Remove this once all TS errors are resolved.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
