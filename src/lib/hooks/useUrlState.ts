"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * 표의 정렬·필터·페이지를 URL 쿼리에 둔다 — 상세에 갔다 돌아와도, 새로고침해도 그 자리다.
 * 쓰기는 지금 주소창에서 합성해 history.replaceState 로만 한다 — 서버 왕복도, 한 전환에 겹친 쓰기의 유실도 없다.
 * 기본값과 같은 키는 지워 URL 을 짧게 유지하고, 다른 키(year 등)는 건드리지 않는다.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void] {
  const pathname = usePathname();
  const params = useSearchParams();

  const state = useMemo(() => {
    const next = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const value = params.get(String(key));
      if (value !== null) next[key] = value as T[keyof T];
    }
    return next;
  }, [defaults, params]);

  const set = useCallback(
    (patch: Partial<T>) => {
      const live = typeof window === "undefined" ? params.toString() : window.location.search;
      const next = new URLSearchParams(live);
      const patched: Record<string, string | undefined> = {};
      for (const key of Object.keys(defaults)) patched[key] = next.get(key) ?? defaults[key];
      Object.assign(patched, patch);

      for (const [key, value] of Object.entries(patched)) {
        if (value === undefined || value === defaults[key]) next.delete(key);
        else next.set(key, value);
      }

      const query = next.toString();
      if (query === new URLSearchParams(live).toString()) return;
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [defaults, params, pathname],
  );

  return [state, set];
}
