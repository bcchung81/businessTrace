"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * 표의 정렬·필터·페이지를 URL 쿼리에 둔다 — 상세에 갔다 돌아와도, 새로고침해도 그 자리다.
 * 기본값과 같은 키는 지워 URL 을 짧게 유지하고, 다른 키(year 등)는 건드리지 않는다.
 * `defaults` 는 호출자가 모듈 상수로 둔다 — 렌더마다 새 객체면 메모가 매번 다시 돈다.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void] {
  const router = useRouter();
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
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries({ ...state, ...patch }) as Array<[string, string | undefined]>) {
        if (value === undefined || value === defaults[key]) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [defaults, params, pathname, router, state],
  );

  return [state, set];
}
