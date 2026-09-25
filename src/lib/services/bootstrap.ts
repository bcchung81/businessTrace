import { prisma } from "@/lib/db";
import { releaseJobLocksHeldBy } from "@/lib/repositories/jobLock";
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

/**
 * 이전 웹 프로세스가 쥐고 있던 작업 잠금을 푼다. 임대 만료(최대 10분)를 기다리면 그동안 배치 버튼이 "정기 작업 실행 중"으로 막힌다.
 */
export async function releaseWebLocks() {
  const count = await releaseJobLocksHeldBy("web:");
  if (count > 0) logEvent("warn", "boot.web_locks_released", { count });
  return count;
}
