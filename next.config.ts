import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 컨테이너 배포용 — 런타임에 필요한 것만 추린 .next/standalone 을 낸다.
  output: "standalone",
};

export default nextConfig;
