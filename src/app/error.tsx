"use client";

import { Button } from "@/components/ui/button";

/**
 * 렌더 중 예외를 잡아 다시 시도 버튼과 digest 를 보인다 — 운영자가 로그에서 찾을 열쇠는 digest 뿐이다.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4 border-t-4 border-risk pt-3">
      <h1 className="font-display text-[28px] font-black tracking-[-0.03em]">화면을 그리지 못했습니다</h1>
      <p role="alert" className="border-l-2 border-risk bg-risk-surface px-3 py-2 text-[13px] text-risk">{error.message}</p>
      {error.digest ? <p className="font-mono text-[11.5px] text-muted-foreground">digest <span className="text-foreground">{error.digest}</span></p> : null}
      <Button variant="signal" className="self-start" onClick={reset}>다시 시도</Button>
    </div>
  );
}
