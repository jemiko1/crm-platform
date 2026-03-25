import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = process.env.API_BACKEND_URL;
    if (!backend && process.env.RAILWAY_ENVIRONMENT) {
      console.error(
        "FATAL: API_BACKEND_URL is not set on Railway. " +
          "API rewrites will target localhost inside the container, which will silently fail.",
      );
      process.exit(1);
    }
    const url = backend || "http://localhost:3000";
    return [
      { source: "/auth/:path*", destination: `${url}/auth/:path*` },
      { source: "/v1/:path*", destination: `${url}/v1/:path*` },
      { source: "/public/:path*", destination: `${url}/public/:path*` },
    ];
  },
};

export default nextConfig;
