import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * DB 파일을 WAL 로 바꾸고 적용된 저널 모드를 돌려준다. 파일에 영속되므로 기동 때 한 번이면 된다.
 * 웹 배치와 정기 스크립트가 같은 파일을 쓸 때 읽기가 쓰기를 막지 않게 한다 — 대기(busy timeout)는 better-sqlite3 기본 5초다.
 */
export async function enableWal(client: PrismaClient = prisma): Promise<string> {
  const [row] = await client.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode = WAL");
  return row?.journal_mode ?? "unknown";
}
