const PUBLIC_PATHS = ["/login", "/api/auth"];

/**
 * 인증 없이 접근할 수 있는 경로인지 판정한다.
 * 접두사 일치가 아니라 경계까지 확인해 /loginhack 같은 유사 경로를 막는다.
 */
export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
