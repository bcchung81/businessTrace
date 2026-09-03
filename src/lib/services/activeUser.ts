import { prisma } from "@/lib/db";

/**
 * 계정이 아직 로그인 가능한지 본다 — 세션 콜백이 매 요청 부른다.
 * id 가 숫자가 아니면 조회하지 않고 거절한다. 토큰은 서명돼 있지만 형식까지 믿을 이유는 없다.
 */
export async function isActiveUser(userId: string): Promise<boolean> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const user = await prisma.user.findUnique({ where: { id }, select: { isActive: true } });
  return user?.isActive === true;
}
