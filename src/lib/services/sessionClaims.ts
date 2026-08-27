type Token = Record<string, unknown>;
type SessionUser = { id?: string } & Record<string, unknown>;
type SessionShape = { user?: SessionUser; expires: string };

export function carryUserId(token: Token, user?: { id?: string | null }) {
  if (user?.id) return { ...token, uid: user.id };
  return token;
}

export function applyUserId<T extends SessionShape>(session: T, token: Token): T {
  if (!session.user || typeof token.uid !== "string") return session;
  return { ...session, user: { ...session.user, id: token.uid } };
}
