"use client";

import Link from "next/link";
import { useState } from "react";
import { Pager, paginate } from "@/components/ui/pager";
import { VerdictPill } from "@/components/dashboard/verdict-pill";
import { Segmented } from "@/components/ui/segmented";
import { METRIC_KEYS, METRIC_LABEL, type BenchmarkRow } from "@/lib/services/benchmarking";
import type { Verdict } from "@/lib/services/verdictRollup";

export type RankingRow = BenchmarkRow & { verdict: Verdict; businessNo: string | null };

type Sort = "rank" | "name" | "total";

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "rank", label: "순위" },
  { value: "total", label: "총점" },
  { value: "name", label: "기업명" },
];

function compare(sort: Sort) {
  return (a: RankingRow, b: RankingRow) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ko");
    return (b.total ?? -1) - (a.total ?? -1) || a.name.localeCompare(b.name, "ko");
  };
}

function Missing() {
  return <span className="hatch ml-auto block h-4 w-10 text-center text-[11px] leading-4 text-muted-foreground">—</span>;
}

function score(value: number | null, digits = 2) {
  return value === null ? <Missing /> : <span className="font-mono tabular-nums">{value.toFixed(digits)}</span>;
}

/**
 * 랭킹 표 — 순위·판정·총점·지표 5·감점·산업. 결측은 빗금 — 이고, 순위 없는 기업도 표에 남는다.
 * 루브릭 선택과 내보내기는 URL 로 다루므로 여기에는 정렬·산업 필터만 있다.
 */
export function RankingTable({ rows, industries }: { rows: RankingRow[]; industries: string[] }) {
  const [sort, setSort] = useState<Sort>("rank");
  const [industry, setIndustry] = useState("");
  const [page, setPage] = useState(0);

  const filtered = rows.filter((row) => industry === "" || row.industry === industry).sort(compare(sort));
  const { slice: visible, pages, current } = paginate(filtered, page);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline py-2 text-[11.5px]">
        <Segmented label="정렬" value={sort} options={SORTS} onChange={(value) => { setSort(value); setPage(0); }} />
        <label className="ml-auto flex items-center gap-2 text-muted-foreground">
          산업
          <select
            aria-label="산업"
            value={industry}
            onChange={(event) => { setIndustry(event.target.value); setPage(0); }}
            className="border-[1.5px] border-hairline bg-background px-2 py-0.5 text-[11.5px] text-foreground"
          >
            <option value="">전체</option>
            {industries.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <caption className="sr-only">벤치마킹 랭킹</caption>
          <thead>
            <tr className="border-b-2 border-ink text-[11px] font-bold tracking-[0.06em]">
              <th scope="col" className="px-2 py-2 text-left">순위</th>
              <th scope="col" className="px-2 py-2 text-left">기업</th>
              <th scope="col" className="px-2 py-2 text-left">판정</th>
              <th scope="col" className="px-2 py-2 text-right">총점</th>
              {METRIC_KEYS.map((key) => (
                <th key={key} scope="col" className="px-2 py-2 text-right">
                  {METRIC_LABEL[key]}
                </th>
              ))}
              <th scope="col" className="whitespace-nowrap px-2 py-2 text-right">리스크 감점</th>
              <th scope="col" className="px-2 py-2 text-left">산업</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.companyId} className="border-b border-hairline align-middle last:border-0">
                <td className="px-2 py-1.5 font-display text-[16px] font-black tabular-nums">{row.rank ?? "—"}</td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-col gap-0.5">
                    <Link href={`/companies/${row.companyId}`} className="font-semibold hover:underline">
                      {row.name}
                    </Link>
                    {row.businessNo ? null : <span className="text-[11px] font-semibold text-review">사업자번호 미확보</span>}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <VerdictPill verdict={row.verdict} />
                </td>
                <td className="px-2 py-1.5 text-right">{score(row.total, 3)}</td>
                {row.metrics.map((metric) => (
                  <td key={metric.key} className="px-2 py-1.5 text-right">
                    {score(metric.normalised)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">{row.riskPenalty === 0 ? "0" : `-${row.riskPenalty.toFixed(2)}`}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{row.industry ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager current={current} pages={pages} onPage={setPage} />
    </div>
  );
}
