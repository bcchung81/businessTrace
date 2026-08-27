import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateUser } from "@/lib/services/authenticate";
import { applyUserId, carryUserId } from "@/lib/services/sessionClaims";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (raw) => authenticateUser(raw),
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => carryUserId(token, user),
    session: ({ session, token }) => applyUserId(session as never, token) as never,
  },
});
