const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health"];

/**
 * 인증 없이 접근할 수 있는 경로인지 판정한다.
 * 접두사 일치가 아니라 경계까지 확인해 /loginhack 같은 유사 경로를 막는다.
 * 헬스체크도 공개다 — 컨테이너 프로브에는 쿠키가 없어 로그인으로 돌리면 영원히 unhealthy 다.
 */
export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
