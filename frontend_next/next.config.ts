import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow accessing the dev server from intranet IPs without
  // breaking HMR / Server Actions cross-origin checks.
  allowedDevOrigins: ["10.10.32.2", "10.10.2.17", "10.10.2.55"],
};

export default nextConfig;
