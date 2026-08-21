import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // allow LAN access in dev (phone testing): Turbopack dev rejects cross-origin
  // chunk requests (403) unless the origin is whitelisted
  allowedDevOrigins: ["192.168.5.146"],
};

export default nextConfig;
