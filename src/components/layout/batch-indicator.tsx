"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BatchStatus } from "@/lib/services/batchRegistry";

/**
 * 상단 밴드의 진행 배지 — 배치가 도는 동안만 보이고, 주기적으로 상태를 읽어 끝나면 사라진다. 누르면 실행 화면으로 돌아간다.
 * 다른 탭에서 시작한 배치도 잡아야 하므로 초기값이 없어도 계속 묻는다. 네트워크 오류는 다음 주기에 다시 본다.
 */
export function BatchIndicator({
  initial,
  fetchImpl = fetch,
  intervalMs = 5000,
}: {
  initial: BatchStatus | null;
  fetchImpl?: typeof fetch;
  intervalMs?: number;
}) {
  const [batch, setBatch] = useState<BatchStatus | null>(initial);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const response = await fetchImpl("/api/analyze/status", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { batch: BatchStatus | null };
        if (alive) setBatch(body.batch);
      } catch {
        return;
      }
    };
    const timer = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [fetchImpl, intervalMs]);

  if (!batch) return null;
  return (
    <Link href="/companies#batch" role="status" className="ml-auto flex items-center gap-2 border border-primary bg-primary/15 px-2.5 py-1 text-[11.5px] font-bold text-band-foreground">
      <span aria-hidden className="h-2 w-2 animate-pulse bg-primary" />
      {batch.total}개사 분석 중 · {batch.done}/{batch.total}
      {batch.current ? <span className="font-medium text-band-foreground/70">{batch.current}</span> : null}
    </Link>
  );
}
