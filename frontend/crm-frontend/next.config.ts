import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = process.env.API_BACKEND_URL;
    if (!backend) {
      if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production") {
        console.error(
          "FATAL: API_BACKEND_URL is not set in production. " +
            "API rewrites will target localhost inside the container, which will silently fail.",
        );
        process.exit(1);
      }
      console.warn("API_BACKEND_URL not set — defaulting to http://localhost:3000 (local dev)");
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
