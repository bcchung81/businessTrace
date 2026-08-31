import { prisma } from "@/lib/db";

/**
 * 컨테이너 헬스체크의 실제 판정 — DB 왕복까지 확인한다.
 * "떠 있지만 아무것도 못 하는" 상태를 살아 있음으로 읽지 않기 위해서다.
 */
export async function checkHealth(ping: () => Promise<unknown>) {
  try {
    await ping();
    return Response.json({ status: "ok", database: "up" });
  } catch (caught) {
    return Response.json(
      { status: "degraded", database: "down", reason: caught instanceof Error ? caught.message : "알 수 없는 오류" },
      { status: 503 },
    );
  }
}

/** 인증 없이 열어 둔다 — 프로브에는 쿠키가 없다. */
export async function GET() {
  return checkHealth(() => prisma.$queryRaw`SELECT 1`);
}
