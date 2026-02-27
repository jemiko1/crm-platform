import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend =
      process.env.API_BACKEND_URL || "http://localhost:3000";
    return [
      { source: "/auth/:path*", destination: `${backend}/auth/:path*` },
      { source: "/v1/:path*", destination: `${backend}/v1/:path*` },
      { source: "/public/:path*", destination: `${backend}/public/:path*` },
    ];
  },
};

export default nextConfig;
