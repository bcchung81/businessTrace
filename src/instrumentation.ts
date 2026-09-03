/**
 * 서버가 요청을 받기 전에 한 번 돈다.
 * 환경변수가 모자라면 프로세스를 끝낸다 — Next 는 register 의 예외를 삼키고 계속 뜨므로,
 * 던지기만 해서는 절반만 뜬 서버를 막지 못한다(실측 확인).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkEnv } = await import("@/lib/env");
  const { logEvent } = await import("@/lib/services/logger");

  const problems = checkEnv();
  if (problems.length > 0) {
    logEvent("error", "boot.env_incomplete", { problems });
    process.exit(1);
  }

  const { closeStaleRuns } = await import("@/lib/services/bootstrap");
  try {
    await closeStaleRuns();
  } catch (caught) {
    logEvent("error", "boot.stale_runs_failed", { error: caught });
  }
  logEvent("info", "boot.ready", { runtime: "nodejs" });
}
