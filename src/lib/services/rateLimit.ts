export type RateWindow = { limit: number; windowMs: number; now?: number };
export type RateVerdict = { allowed: boolean; retryAfterMs: number };

const hits = new Map<string, number[]>();

/**
 * 창 안의 시도 횟수를 세어 허용 여부를 낸다 — 프로세스 메모리에 남는 슬라이딩 윈도우다.
 * 인스턴스가 여럿이면 인스턴스마다 따로 센다. 지금은 웹 1컨테이너라 이것으로 충분하다.
 */
export function hitRateLimit(key: string, options: RateWindow): RateVerdict {
  const now = options.now ?? Date.now();
  const floor = now - options.windowMs;

  for (const [existing, stamps] of hits) {
    if (stamps[stamps.length - 1] <= floor) hits.delete(existing);
  }

  const kept = (hits.get(key) ?? []).filter((stamp) => stamp > floor);
  if (kept.length >= options.limit) {
    hits.set(key, kept);
    return { allowed: false, retryAfterMs: kept[0] + options.windowMs - now };
  }

  kept.push(now);
  hits.set(key, kept);
  return { allowed: true, retryAfterMs: 0 };
}

/** 테스트용 — 남아 있던 키 수를 돌려주고 전부 비운다. */
export function resetRateLimits() {
  const size = hits.size;
  hits.clear();
  return size;
}
