import { checkEnv } from "@/lib/env";
import { closeStaleRuns } from "@/lib/services/bootstrap";
import { logEvent } from "@/lib/services/logger";

/**
 * 노드 서버 기동 시 한 번 도는 준비 작업.
 * 환경변수가 모자라면 프로세스를 끝낸다 — Next 는 register 의 예외를 삼키고 계속 뜨므로,
 * 던지기만 해서는 절반만 뜬 서버를 막지 못한다(실측 확인).
 */
export async function bootNodeServer() {
  const problems = checkEnv();
  if (problems.length > 0) {
    logEvent("error", "boot.env_incomplete", { problems });
    process.exit(1);
  }

  try {
    await closeStaleRuns();
  } catch (caught) {
    logEvent("error", "boot.stale_runs_failed", { error: caught });
  }
  logEvent("info", "boot.ready", { runtime: "nodejs" });
}
