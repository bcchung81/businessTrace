import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  headers: async () => [{ source: "/:path*", headers: [...SECURITY_HEADERS] }],
};

export default nextConfig;
