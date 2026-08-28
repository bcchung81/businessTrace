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
