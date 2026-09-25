import { acquireJobLock, releaseJobLock, renewJobLock } from "@/lib/repositories/jobLock";
import { logEvent } from "@/lib/services/logger";

const LEASE_MS = 10 * 60_000;
const RENEW_EVERY_MS = 2 * 60_000;

type LeaseDeps = {
  acquire: (name: string, holder: string, ttlMs: number) => Promise<boolean>;
  renew: (name: string, holder: string, ttlMs: number) => Promise<boolean>;
  release: (name: string, holder: string) => Promise<void>;
  setInterval: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (handle: ReturnType<typeof setInterval>) => void;
};

const defaultDeps: LeaseDeps = {
  acquire: acquireJobLock,
  renew: renewJobLock,
  release: releaseJobLock,
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle),
};

/**
 * 작업 잠금을 짧은 임대로 잡고 보유 중에는 주기적으로 늘린다. 못 잡으면 null 이다.
 * 긴 임대 하나로 두면 죽은 프로세스가 그만큼 오래 잠금을 쥔다 — 10분 임대를 2분마다 갱신한다.
 */
export async function holdJobLock(name: string, holder: string, deps: LeaseDeps = defaultDeps): Promise<(() => Promise<void>) | null> {
  if (!(await deps.acquire(name, holder, LEASE_MS))) return null;
  const heartbeat = deps.setInterval(() => {
    deps
      .renew(name, holder, LEASE_MS)
      .then((kept) => {
        if (!kept) logEvent("warn", "job_lock.lost", { name, holder });
      })
      .catch((error: unknown) => logEvent("error", "job_lock.renew_failed", { name, holder, error }));
  }, RENEW_EVERY_MS);
  return async () => {
    deps.clearInterval(heartbeat);
    await deps.release(name, holder);
  };
}
