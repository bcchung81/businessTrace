"use client";

import { useState } from "react";
import { confirmSelectionAction } from "@/app/ranking/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * 시상 확정 — 트리거는 signal-outline(주 CTA 는 엑셀 내보내기), 확정은 모달 안에서만 primary 다.
 */
export function ConfirmSelection({ year, rubricId, count, formulaVersion }: { year: number; rubricId: string; count: number; formulaVersion: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const result = await confirmSelectionAction({ year, rubricId });
    setBusy(false);
    setMessage(result.ok ? `${result.saved}건 저장 — 이력 화면에 반영됐습니다.` : result.message);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="signal-outline" size="sm">
          시상 확정
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{year}년 시상 확정</DialogTitle>
          <DialogDescription>
            총점 있는 {count}개사를 산식 <span className="font-mono">{formulaVersion}</span> 으로 동결합니다. 재확정하면 이 연도 기록을 덮어씁니다.
          </DialogDescription>
        </DialogHeader>
        {message ? <p className="text-[12.5px]">{message}</p> : null}
        <DialogFooter>
          <Button onClick={confirm} disabled={busy}>
            확정 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
