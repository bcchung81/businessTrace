import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/services/password";
import { checkPasswordStrength } from "@/lib/services/passwordPolicy";

const emailSchema = z.email();

export type CreateAdminResult =
  | { ok: true; id: number; email: string }
  | { ok: false; message: string };

export async function createAdminAccount(input: {
  email: string;
  password: string;
}): Promise<CreateAdminResult> {
  const email = input.email.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) {
    return { ok: false, message: "올바른 이메일 형식이 아닙니다." };
  }

  const strength = checkPasswordStrength(input.password);
  if (!strength.ok) return { ok: false, message: strength.message };

  if (await prisma.user.findUnique({ where: { email } })) {
    return { ok: false, message: "이미 등록된 이메일입니다." };
  }

  const created = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(input.password) },
  });

  return { ok: true, id: created.id, email: created.email };
}
