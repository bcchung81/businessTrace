import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateUser } from "@/lib/services/authenticate";
import { isActiveUser } from "@/lib/services/activeUser";
import { applyActiveUserId, carryUserId } from "@/lib/services/sessionClaims";

/** 12시간. 기본 30일은 이 도구의 위험 대비 너무 길다 — 하루 일과보다 조금 길게만 둔다. */
const SESSION_MAX_AGE_SEC = 12 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SEC },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (raw) => authenticateUser(raw),
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => carryUserId(token, user),
    session: ({ session, token }) => applyActiveUserId(session as never, token, isActiveUser) as never,
  },
});
