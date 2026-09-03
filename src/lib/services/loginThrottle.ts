import { hitRateLimit } from "@/lib/services/rateLimit";

export const WINDOW_MS = 5 * 60_000;
/** 한 계정을 겨냥한 대입. */
export const EMAIL_ATTEMPTS = 10;
/** 한 주소가 계정을 갈아 가며 뿌리는 경우 — 계정별 카운터만으로는 이것이 안 걸린다. */
export const IP_ATTEMPTS = 30;

export type LoginGate = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * 로그인 시도에 제동을 건다. 막히면 몇 초 뒤에 다시 되는지 함께 준다.
 * scrypt(요청당 약 32MB)가 비인증 엔드포인트에 붙어 있어, 이 문은 대입뿐 아니라 자원 고갈도 막는다.
 */
export function checkLoginAttempt(input: { ip: string; email: string; now?: number }): LoginGate {
  const now = input.now ?? Date.now();
  const email = input.email.trim().toLowerCase();

  const verdicts = [
    hitRateLimit(`login:ip:${input.ip}`, { limit: IP_ATTEMPTS, windowMs: WINDOW_MS, now }),
    hitRateLimit(`login:id:${input.ip}|${email}`, { limit: EMAIL_ATTEMPTS, windowMs: WINDOW_MS, now }),
  ];

  const blocked = verdicts.filter((verdict) => !verdict.allowed);
  if (blocked.length === 0) return { ok: true };
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil(Math.max(...blocked.map((v) => v.retryAfterMs)) / 1000)) };
}
