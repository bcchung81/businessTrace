/**
 * 모든 응답에 붙는 보안 헤더.
 * `script-src` 는 아직 좁히지 않았다 — Next 가 하이드레이션용 인라인 스크립트를 스스로 넣어서
 * nonce 배포와 브라우저 확인이 함께 필요하다. 그것 없이 켜면 화면이 조용히 죽는다.
 * 지금 넣는 지시어들은 스크립트 로딩에 영향을 주지 않으면서 클릭재킹·베이스태그 주입·폼 유출을 막는다.
 */
export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: ["frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join("; "),
  },
] as const;
