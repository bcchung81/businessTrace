"use client";

import { useState } from "react";
import { VerdictPill } from "@/components/dashboard/verdict-pill";
import type { CellState, PipelineCell } from "@/lib/repositories/companyPipeline";
import { MATRIX_COLUMNS, sortMatrixRows, type MatrixRow, type MatrixSort } from "@/lib/services/matrixRows";
import { isStale } from "@/lib/services/newsCoverage";
import { MATRIX_STAGES } from "@/lib/services/pipelineMatrix";

const STAGES = MATRIX_STAGES.filter((stage) => (MATRIX_COLUMNS as readonly string[]).includes(stage.key));

const STATE_LABEL: Record<CellState, string> = {
  ok: "확인",
  absent: "결측",
  unmeasurable: "측정 불가",
  conflict: "충돌",
  pending: "미조회",
};

const STATE_CLASS: Record<CellState, string> = {
  ok: "bg-verified-surface",
  absent: "bg-pending-surface",
  unmeasurable: "border border-dashed border-muted-foreground/50",
  conflict: "bg-risk-surface",
  pending: "",
};

const VALUE_CLASS: Record<CellState, string> = {
  ok: "text-verified",
  absent: "text-muted-foreground",
  unmeasurable: "text-muted-foreground",
  conflict: "text-risk",
  pending: "text-muted-foreground/45",
};

const ABSENT_LABEL: Record<string, string> = {
  dart: "미등록",
  dartFinance: "미공시",
  venture: "미확인",
  nps: "미가입",
  nts: "조회 불가",
  narajangteo: "미등록",
};

const SORTS: Array<{ key: MatrixSort; label: string }> = [
  { key: "triage", label: "봐야 할 순서" },
  { key: "name", label: "기업명" },
  { key: "score", label: "검증 점수" },
  { key: "news", label: "최근 보도" },
];

const EDGE: Partial<Record<MatrixRow["verdict"], string>> = {
  risk: "shadow-[inset_3px_0_0_var(--risk-fill)]",
  review: "shadow-[inset_3px_0_0_var(--review-fill)]",
};

const LEGEND: Array<{ label: string; swatch: string }> = [
  { label: "확인", swatch: "bg-verified-surface border border-verified/40" },
  { label: "결측", swatch: "bg-pending-surface border border-border" },
  { label: "충돌", swatch: "bg-risk-surface border border-risk/40" },
  { label: "미조회", swatch: "border border-dashed border-pending-fill" },
];

const FINANCE_REVENUE = /^(\d{4})년 매출 (\d+)$/;

/**
 * 격자 칸에 들어갈 짧은 말로 줄인다.
 * 사유 문장은 길어서 열을 넘긴다 - 전체 문장은 title 과 기업 상세 화면에 그대로 남는다.
 */
export function compactValue(stageKey: string, cell: PipelineCell) {
  switch (cell.state) {
    case "pending":
      return "—";
    case "absent":
      return ABSENT_LABEL[stageKey] ?? "없음";
    case "unmeasurable":
      return "미참여";
    case "conflict":
      return /후보\s*\d+건/.test(cell.note) ? cell.note : "충돌";
    case "ok": {
      const match = stageKey === "dartFinance" ? FINANCE_REVENUE.exec(cell.value) : null;
      if (!match) return cell.value || "—";
      const [, year, amount] = match;
      return `${year} 매출 ${Math.round(Number(amount) / 1e8)}억`;
    }
    default:
      return cell.value || "—";
  }
}

function formatBusinessNo(businessNo: string) {
  return `${businessNo.slice(0, 3)}-${businessNo.slice(3, 5)}-${businessNo.slice(5)}`;
}

function monthDay(iso: string | null) {
  return iso ? iso.slice(5, 10) : "—";
}

function score(value: number | null, verdict: MatrixRow["verdict"]) {
  if (value === null) return <span className="text-muted-foreground/45">—</span>;
  const colour = verdict === "risk" ? "text-risk" : verdict === "review" ? "text-review" : verdict === "verified" ? "text-verified" : "";
  return <span className={`font-semibold ${colour}`}>{value.toFixed(2)}</span>;
}

/**
 * 기업마다 판정과 각 원천이 무엇을 돌려줬는지 값으로 낸다.
 * 상태만 두면 "돌았다"까지만 알 수 있다. 빈칸도 사유를 적어 결측과 미조회가 갈리게 한다.
 */
export function CompanyPipelineGrid({
  rows,
  pageSize = 10,
  now,
}: {
  rows: MatrixRow[];
  pageSize?: number;
  now?: Date;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<MatrixSort>("triage");

  if (rows.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
        등록된 기업이 없습니다.
      </p>
    );
  }

  const sorted = sortMatrixRows(rows, sort);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const filler = Array.from({ length: pageSize - slice.length }, (_, index) => index);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end gap-1 border-b border-hairline px-3 py-2">
        <div role="radiogroup" aria-label="정렬" className="flex items-center gap-1 rounded-[7px] bg-secondary p-0.5 text-[11.5px]">
          {SORTS.map((entry) => {
            const selected = entry.key === sort;
            return (
              <button
                key={entry.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setSort(entry.key);
                  setPage(0);
                }}
                className={`rounded-[5px] px-2.5 py-1 ${selected ? "bg-background font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground"}`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] table-fixed text-[12px]">
          <caption className="sr-only">기업별 근거 매트릭스</caption>
          <thead>
            <tr className="border-b border-border bg-surface text-[11px] text-muted-foreground">
              <th scope="col" className="w-[84px] px-2.5 py-2 text-left font-semibold">판정</th>
              <th scope="col" className="sticky left-0 z-10 w-[120px] bg-surface px-2.5 py-2 text-left font-semibold">기업</th>
              <th scope="col" className="w-[112px] px-2.5 py-2 text-left font-semibold">사업자번호</th>
              {STAGES.map((stage) => (
                <th key={stage.key} scope="col" title={`${stage.label} — ${stage.purpose} · ${stage.endpoint}`} className="px-2 py-2 text-left font-semibold">
                  {stage.short}
                </th>
              ))}
              <th scope="col" className="w-[68px] px-2.5 py-2 text-right font-semibold">충실도</th>
              <th scope="col" className="w-[44px] px-2.5 py-2 text-right font-semibold">인용</th>
              <th scope="col" className="w-[72px] px-2.5 py-2 text-left font-semibold">최근 보도</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((entry) => (
              <tr key={entry.id} className="border-b border-hairline align-middle last:border-0">
                <td className={`px-2.5 py-1.5 ${EDGE[entry.verdict] ?? ""}`}><VerdictPill verdict={entry.verdict} /></td>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-background px-2.5 py-1.5 text-left font-semibold">
                  {entry.name}
                </th>
                <td className="px-2.5 py-1.5">
                  {entry.businessNo ? (
                    <span className="font-mono tabular-nums">{formatBusinessNo(entry.businessNo)}</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-review">미확보 · 대조 불가</span>
                  )}
                </td>
                {STAGES.map((stage) => {
                  const cell = entry.cells[stage.key] ?? { state: "pending" as CellState, value: "", note: "" };
                  return (
                    <td key={stage.key} className="px-1 py-1">
                      <div
                        aria-label={`${entry.name} ${stage.short} ${STATE_LABEL[cell.state]}${cell.value ? ` ${cell.value}` : ""}`}
                        title={cell.note ? `${cell.value} · ${cell.note}` : cell.value}
                        className={`rounded px-1.5 py-1 ${STATE_CLASS[cell.state]}`}
                      >
                        <span className={`block truncate text-[11px] font-semibold ${VALUE_CLASS[cell.state]}`}>
                          {compactValue(stage.key, cell)}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">{score(entry.faithfulness, entry.verdict)}</td>
                <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                  {entry.verdict === "pending" ? <span className="text-muted-foreground/45">—</span> : entry.citations}
                </td>
                <td className="px-2.5 py-1.5">
                  <span className={`font-mono tabular-nums ${entry.latestArticle && isStale(entry.latestArticle, now) ? "text-risk" : "text-muted-foreground"}`}>
                    {monthDay(entry.latestArticle)}
                  </span>
                </td>
              </tr>
            ))}
            {filler.map((index) => (
              <tr key={`filler-${index}`} aria-hidden className="border-b border-hairline last:border-0">
                <td colSpan={STAGES.length + 6} className="px-2.5 py-1.5">
                  <span className="block h-[22px]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-3.5 py-2 text-[11px] text-muted-foreground">
        <span className="flex flex-wrap items-center gap-3">
          {LEGEND.map((entry) => (
            <span key={entry.label} className="flex items-center gap-1.5">
              <span aria-hidden className={`h-3 w-3 rounded-[3px] ${entry.swatch}`} />
              {entry.label}
            </span>
          ))}
          <span className="font-semibold text-review">사업자번호 미확보는 뉴스 외 근거를 붙일 수 없다</span>
        </span>
        <span className="flex items-center gap-2">
          <span>{rows.length}개사</span>
          <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} className="rounded-[5px] border border-border bg-background px-2 py-0.5 disabled:opacity-40">
            이전
          </button>
          <span className="font-mono tabular-nums">{current + 1} / {pages}</span>
          <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} className="rounded-[5px] border border-border bg-background px-2 py-0.5 disabled:opacity-40">
            다음
          </button>
        </span>
      </div>
    </div>
  );
}
