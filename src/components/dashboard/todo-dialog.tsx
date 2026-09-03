"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmEventsAction, decideDartAction, decideFscAction, decideNpsAction, holdNpsAction, reviewVerificationAction, saveAliasesAction, saveBusinessNoAction } from "@/app/(app)/companies/[id]/actions";
import { confirmCompanyEventsAction, loadReviewItemsAction, markVerificationsReviewedAction, type BulkResult, type LoadReviewResult } from "@/app/(app)/dashboard/actions";
import { ReviewItems, type ReviewActions } from "@/components/company/review-block";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ReviewSummary } from "@/lib/repositories/reviewItems";
import type { TodoKind, TodoRow } from "@/lib/services/freshness";

export type { TodoKind, TodoRow };

const DETAIL_ACTIONS: ReviewActions = {
  decideNps: decideNpsAction,
  holdNps: holdNpsAction,
  decideDart: decideDartAction,
  decideFsc: decideFscAction,
  reviewVerification: reviewVerificationAction,
  confirmEvents: confirmEventsAction,
  saveAliases: saveAliasesAction,
  saveBusinessNo: saveBusinessNoAction,
};

type Bulk = (companyIds: number[], opened: number[]) => Promise<BulkResult>;

const QUEUE_BY_KIND: Record<TodoKind, "review" | "verification"> = { review: "review", events: "review", verification: "verification" };

const BULK_BY_KIND: Record<TodoKind, Bulk> = {
  review: confirmCompanyEventsAction,
  events: confirmCompanyEventsAction,
  verification: markVerificationsReviewedAction,
};

/**
 * 리본의 할 일 하나를 팝업으로 연다 — 왼쪽에서 기업을 고르면 오른쪽에 그 기업의 확인 필요 항목이 뜨고, 아래에서 여럿을 한 번에 정리한다.
 * 화면을 떠나지 않으므로 돌아오는 조작이 없다. 목록에서 사라진 행은 처리된 행이다.
 */
export function TodoDialog({
  text,
  kind,
  rows,
  year,
  load = loadReviewItemsAction,
  bulk = BULK_BY_KIND[kind],
  actions = DETAIL_ACTIONS,
}: {
  text: string;
  kind: TodoKind;
  rows: TodoRow[];
  year: number;
  load?: (companyId: number) => Promise<LoadReviewResult>;
  bulk?: Bulk;
  actions?: ReviewActions;
}) {
  const router = useRouter();
  const [handled, setHandled] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  const visible = rows.filter((row) => !handled.has(row.companyId));
  const selectable = visible.filter((row) => row.selectable);
  const bulkLabel = kind === "verification" ? "검토 완료" : "사건 확인";
  const queue = QUEUE_BY_KIND[kind];

  /**
   * 한 기업의 확인 필요 항목을 오른쪽에 연다. 정리 직후 다시 불렀는데 남은 항목이 없으면 그 행을 목록에서 뺀다.
   */
  async function openCompany(companyId: number, settled = false) {
    setSelected(companyId);
    setLoading(true);
    setLoadError(null);
    if (!settled) setSummary(null);
    try {
      const result = await load(companyId);
      if (!result.ok) {
        setLoadError(result.message);
        setSummary(null);
        return;
      }
      setSummary(result.summary);
      if (settled && (result.summary?.items.length ?? 0) === 0) setHandled((prev) => new Set(prev).add(companyId));
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "확인 필요 항목을 불러오지 못했습니다");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  function toggle(companyId: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  function toggleAll() {
    setChecked((prev) => (selectable.every((row) => prev.has(row.companyId)) ? new Set() : new Set(selectable.map((row) => row.companyId))));
  }

  /**
   * 일괄 처리한 기업을 다시 읽는다 — 비워진 기업은 목록에서 빼고, 남은 기업은 열린 패널을 갱신하는 데 쓴다.
   */
  async function reread(companyIds: number[]) {
    const settled = await Promise.all(
      companyIds.map(async (companyId) => {
        try {
          const result = await load(companyId);
          return result.ok ? { companyId, summary: result.summary } : null;
        } catch {
          return null;
        }
      }),
    );
    return settled.filter((row): row is { companyId: number; summary: ReviewSummary | null } => row !== null);
  }

  /**
   * 근거를 한 번도 열지 않은 기업이 섞여 있으면 먼저 묻는다.
   * 검증 검토는 되돌릴 UI 가 상세에만 있고, 문장별 지지 여부를 못 본 채 남는 감사 기록은 그 자체로 틀린 기록이다.
   */
  function requestBulk() {
    const companyIds = visible.filter((row) => checked.has(row.companyId)).map((row) => row.companyId);
    const blind = companyIds.filter((companyId) => !opened.has(companyId));
    if (kind === "verification" && blind.length > 0) {
      setConfirming(blind.length);
      return;
    }
    void runBulk();
  }

  async function runBulk() {
    setConfirming(null);
    const companyIds = visible.filter((row) => checked.has(row.companyId)).map((row) => row.companyId);
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const result = await bulk(companyIds, companyIds.filter((companyId) => opened.has(companyId)));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const reloaded = await reread(companyIds);
      const emptied = reloaded.filter((row) => (row.summary?.items.length ?? 0) === 0).map((row) => row.companyId);
      setHandled((prev) => new Set([...prev, ...emptied]));
      setChecked((prev) => new Set([...prev].filter((companyId) => !emptied.includes(companyId))));
      if (selected !== null && companyIds.includes(selected)) {
        const fresh = reloaded.find((row) => row.companyId === selected && !emptied.includes(selected));
        setSelected(fresh ? selected : null);
        setSummary(fresh ? fresh.summary : null);
        setLoadError(null);
      }
      setNotice(`${result.done}건 처리했습니다`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "일괄 처리에 실패했습니다");
    } finally {
      setRunning(false);
    }
  }

  /**
   * 닫으면 정리한 흔적을 버린다 — 다시 열 때는 서버가 새로 준 목록이 보여야 한다.
   */
  function forget() {
    setHandled(new Set());
    setChecked(new Set());
    setOpened(new Set());
    setSelected(null);
    setSummary(null);
    setLoadError(null);
    setNotice(null);
    setError(null);
    setConfirming(null);
  }

  return (
    <Dialog onOpenChange={(next) => { if (!next) forget(); }}>
      <DialogTrigger asChild>
        <button type="button" className="underline decoration-primary-foreground/60 underline-offset-4 hover:decoration-primary-foreground">
          {text}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{text}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <ul role="list" aria-label="처리할 기업" className="min-h-0 overflow-y-auto border-[1.5px] border-hairline">
            {visible.map((row) => (
              <li key={row.companyId} className={`flex items-start gap-2.5 border-b border-hairline px-2.5 py-2 last:border-0 ${selected === row.companyId ? "bg-secondary" : ""}`}>
                {row.selectable ? (
                  <label className="flex pt-0.5">
                    <input type="checkbox" aria-label={`${row.name} 선택`} disabled={running} checked={checked.has(row.companyId)} onChange={() => toggle(row.companyId)} />
                  </label>
                ) : (
                  <span className="w-[13px] shrink-0" />
                )}
                <button
                  type="button"
                  aria-label={`${row.name} 열기`}
                  aria-current={selected === row.companyId ? "true" : undefined}
                  onClick={() => openCompany(row.companyId)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                >
                  <span className="text-[12.5px] font-bold">{row.name}</span>
                  <span className="text-[11px] text-muted-foreground">{row.note}</span>
                </button>
                <Link
                  href={`/companies/${row.companyId}?queue=${queue}`}
                  aria-label={`${row.name} 상세`}
                  className="shrink-0 pt-0.5 text-[11px] underline decoration-dotted underline-offset-2"
                >
                  상세 →
                </Link>
              </li>
            ))}
          </ul>
          <div className="min-h-0 overflow-y-auto">
            {selected === null ? (
              <p className="text-[12.5px] text-muted-foreground">왼쪽에서 기업을 고르면 확인 필요 항목이 열립니다.</p>
            ) : loading ? (
              <p role="status" className="text-[12.5px] text-muted-foreground">불러오는 중…</p>
            ) : loadError ? (
              <p role="alert" className="text-[12.5px] font-medium text-risk">{loadError}</p>
            ) : summary && summary.items.length > 0 ? (
              <ReviewItems companyId={selected} year={year} summary={summary} actions={actions} onSettled={() => openCompany(selected, true)} onOpenEvidence={() => setOpened((prev) => new Set(prev).add(selected))} />
            ) : (
              <p className="text-[12.5px] text-muted-foreground">확인 필요 항목이 없습니다.</p>
            )}
          </div>
        </div>
        {confirming !== null ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 border-l-2 border-review bg-review-surface px-3 py-2 text-[12px] font-medium text-review">
            <span>{confirming}개사를 근거 확인 없이 검토 완료로 기록합니다. 이 기록은 상세 화면에서만 되돌릴 수 있습니다.</span>
            <Button variant="signal" size="sm" onClick={() => void runBulk()}>근거 없이 기록</Button>
            <Button variant="signal-outline" size="sm" onClick={() => setConfirming(null)}>취소</Button>
          </div>
        ) : null}
        {error ? <p role="alert" className="border-l-2 border-risk bg-risk-surface px-3 py-2 text-[12px] font-medium text-risk">{error}</p> : null}
        {notice && !error ? <p role="status" className="border-l-2 border-primary bg-accent px-3 py-2 text-[12px] font-medium text-accent-foreground">{notice}</p> : null}
        <DialogFooter className="sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="signal" size="sm" disabled={checked.size === 0 || running} onClick={requestBulk}>
              선택 {checked.size}건 {bulkLabel}
            </Button>
            <Button variant="signal-outline" size="sm" disabled={running || selectable.length === 0} onClick={toggleAll}>
              모두 선택
            </Button>
          </div>
          <DialogClose asChild>
            <Button variant="signal-outline" size="sm">닫기</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
