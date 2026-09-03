type Token = Record<string, unknown>;
type SessionUser = { id?: string } & Record<string, unknown>;
type SessionShape = { user?: SessionUser; expires: string };

/**
 * 로그인 시점의 사용자 id 를 JWT 토큰에 싣는다.
 * next-auth JWT 전략은 기본적으로 id 를 세션에 넘기지 않는다.
 */
export function carryUserId(token: Token, user?: { id?: string | null }) {
  if (user?.id) return { ...token, uid: user.id };
  return token;
}

/**
 * 토큰에 실린 id 를 세션 사용자에 붙인다.
 * 라우트 핸들러가 분석 실행자를 기록하려면 이 값이 필요하다.
 */
export function applyUserId<T extends SessionShape>(session: T, token: Token): T {
  if (!session.user || typeof token.uid !== "string") return session;
  return { ...session, user: { ...session.user, id: token.uid } };
}

/**
 * 세션을 낼 때마다 계정이 아직 살아 있는지 확인한다.
 * JWT 는 서버가 취소할 수 없다 — 비활성 처리한 계정이 만료까지 그대로 도는 것을 막는 유일한 지점이다.
 */
export async function applyActiveUserId<T extends SessionShape>(
  session: T,
  token: Token,
  isActive: (userId: string) => Promise<boolean>,
): Promise<T> {
  const uid = typeof token.uid === "string" ? token.uid : null;
  if (!uid || !(await isActive(uid))) return { ...session, user: undefined };
  return applyUserId(session, token);
}
