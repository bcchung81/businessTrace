import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/services/password";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export type AuthenticatedUser = { id: string; email: string };

/**
 * 이메일과 비밀번호로 로그인 가능한 사용자를 찾는다.
 * 비활성 계정은 비밀번호가 맞아도 거부하고, 반환값에 해시를 담지 않는다.
 */
export async function authenticateUser(raw: unknown): Promise<AuthenticatedUser | null> {
  const parsed = credentialsSchema.safeParse(
    typeof raw === "object" && raw !== null && "email" in raw
      ? { ...raw, email: String((raw as { email: unknown }).email).trim().toLowerCase() }
      : raw,
  );
  if (!parsed.success) return null;

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.isActive) return null;
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return null;

  return { id: String(user.id), email: user.email };
}
