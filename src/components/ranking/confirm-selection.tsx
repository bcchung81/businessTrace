"use client";

import { useState } from "react";
import { confirmSelectionAction } from "@/app/(app)/ranking/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { periodLabel, periodsOfYear, type PeriodKind } from "@/lib/services/periods";

const KIND_LABEL: Array<{ kind: PeriodKind; label: string }> = [
  { kind: "year", label: "연간" },
  { kind: "half", label: "반기" },
  { kind: "quarter", label: "분기" },
];

/**
 * 시상 확정 — 트리거는 signal-outline(주 CTA 는 엑셀 내보내기), 확정은 모달 안에서만 primary 다.
 * 기간 단위(연간·반기·분기)를 골라 그 기간 기록으로 동결한다.
 */
export function ConfirmSelection({ year, rubricId, count, formulaVersion }: { year: number; rubricId: string; count: number; formulaVersion: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<PeriodKind>("year");
  const [period, setPeriod] = useState(String(year));

  function pickKind(next: PeriodKind) {
    setKind(next);
    setPeriod(periodsOfYear(year, next)[0]);
  }

  async function confirm() {
    setBusy(true);
    const result = await confirmSelectionAction({ year, rubricId, period });
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
            총점 있는 {count}개사를 산식 <span className="font-mono">{formulaVersion}</span> 으로 동결합니다. 같은 기간을 재확정하면 덮어씁니다.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <div role="group" aria-label="기간 단위" className="flex">
            {KIND_LABEL.map((entry) => (
              <button
                key={entry.kind}
                type="button"
                aria-pressed={kind === entry.kind}
                onClick={() => pickKind(entry.kind)}
                className="-ml-px border-[1.5px] border-hairline px-3 py-1 text-[12px] font-bold text-muted-foreground first:ml-0 hover:bg-secondary aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-background"
              >
                {entry.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-muted-foreground">
            기간
            <select
              aria-label="기간"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="border-[1.5px] border-hairline bg-background px-2 py-1 text-[12.5px] text-foreground"
            >
              {periodsOfYear(year, kind).map((entry) => (
                <option key={entry} value={entry}>
                  {periodLabel(entry)}
                </option>
              ))}
            </select>
          </label>
        </div>
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
