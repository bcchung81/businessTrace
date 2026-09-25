import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

const isUniqueViolation = (caught: unknown) => caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002";

/**
 * 이름 붙은 작업 잠금을 잡는다. 비어 있으면 만들고, 남이 잡고 있으면 임대가 끝난 경우에만 넘겨받는다.
 * 넘겨받기는 "만료된 행만 고친다"는 UPDATE 한 문장이라 두 프로세스가 동시에 노려도 하나만 이긴다.
 */
export async function acquireJobLock(name: string, holder: string, ttlMs: number, now = new Date()): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + ttlMs);
  try {
    await prisma.jobLock.create({ data: { name, holder, acquiredAt: now, expiresAt } });
    return true;
  } catch (caught) {
    if (!isUniqueViolation(caught)) throw caught;
  }
  const { count } = await prisma.jobLock.updateMany({ where: { name, expiresAt: { lte: now } }, data: { holder, acquiredAt: now, expiresAt } });
  return count === 1;
}

/**
 * 보유자만 임대를 늘린다. false 면 이미 빼앗긴 것이다.
 */
export async function renewJobLock(name: string, holder: string, ttlMs: number, now = new Date()): Promise<boolean> {
  const { count } = await prisma.jobLock.updateMany({ where: { name, holder }, data: { expiresAt: new Date(now.getTime() + ttlMs) } });
  return count === 1;
}

export async function releaseJobLock(name: string, holder: string): Promise<void> {
  await prisma.jobLock.deleteMany({ where: { name, holder } });
}

/**
 * 재기동한 프로세스가 남긴 잠금을 푼다. 잡고 있던 작업을 이어 갈 주체가 이미 없다.
 */
export async function releaseJobLocksHeldBy(prefix: string): Promise<number> {
  const { count } = await prisma.jobLock.deleteMany({ where: { holder: { startsWith: prefix } } });
  return count;
}
