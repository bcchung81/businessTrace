import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/services/logger";

const STALE_MESSAGE = "서버 재기동으로 중단된 실행입니다.";

/**
 * 재기동 시점에 running 으로 남은 실행을 실패로 닫는다.
 * 배치를 이어 갈 주체가 없는데도 대시보드는 계속 "실행 중 N" 을 말하고, 지울 UI 가 없다.
 */
export async function closeStaleRuns() {
  const { count } = await prisma.analysisRun.updateMany({
    where: { status: "running" },
    data: { status: "failed", resultJson: JSON.stringify({ error: STALE_MESSAGE }), completedAt: new Date() },
  });
  if (count > 0) logEvent("warn", "boot.stale_runs_closed", { count });
  return count;
}
