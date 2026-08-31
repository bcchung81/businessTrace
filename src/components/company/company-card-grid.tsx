"use client";

import { useMemo, useState } from "react";
import { COMPANY_COLUMNS, CompanyRow } from "@/components/company/company-row";
import { Button } from "@/components/ui/button";
import { Pager, paginate } from "@/components/ui/pager";
import { filterCards, sortCards, type CardFilter, type CardSort, type CompanyCardData } from "@/lib/services/companyCards";

const SORT_LABEL: Record<CardSort, string> = { triage: "긴급도순", name: "이름순", news: "최근보도순" };
const SORTS: CardSort[] = ["triage", "name", "news"];

/**
 * 기업 목록 표 — 정렬 세그먼트와 필터 체크박스는 클라이언트 상태로 둔다. 기업 하나가 한 행이다.
 */
export function CompanyCardGrid({ cards, initialFilter = {} }: { cards: CompanyCardData[]; initialFilter?: CardFilter }) {
  const [sort, setSort] = useState<CardSort>("triage");
  const [filter, setFilter] = useState<CardFilter>(initialFilter);
  const [page, setPage] = useState(0);

  const visible = useMemo(() => sortCards(filterCards(cards, filter), sort), [cards, filter, sort]);
  const { slice, pages, current } = paginate(visible, page);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="정렬" className="flex gap-1.5">
          {SORTS.map((option) => (
            <Button
              key={option}
              type="button"
              variant={sort === option ? "signal" : "signal-outline"}
              size="sm"
              aria-pressed={sort === option}
              onClick={() => { setSort(option); setPage(0); }}
            >
              {SORT_LABEL[option]}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              aria-label="확인 필요만"
              checked={filter.reviewOnly ?? false}
              onChange={(event) => { setFilter((prev) => ({ ...prev, reviewOnly: event.target.checked })); setPage(0); }}
            />
            확인 필요만
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filter.noticeOnly ?? false}
              onChange={(event) => { setFilter((prev) => ({ ...prev, noticeOnly: event.target.checked })); setPage(0); }}
            />
            주의만
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filter.positiveOnly ?? false}
              onChange={(event) => { setFilter((prev) => ({ ...prev, positiveOnly: event.target.checked })); setPage(0); }}
            />
            홍보 후보만
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filter.missingBusinessNo ?? false}
              onChange={(event) => { setFilter((prev) => ({ ...prev, missingBusinessNo: event.target.checked })); setPage(0); }}
            />
            사업자번호 미확보만
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="border border-dashed border-hairline bg-background p-8 text-center">
          <p className="text-sm text-muted-foreground">조건에 맞는 기업이 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border-t-2 border-ink">
          <table className="w-full text-[12px]">
            <caption className="sr-only">기업 목록</caption>
            <thead>
              <tr className="border-b-2 border-ink text-[11px] font-bold tracking-[0.06em]">
                {COMPANY_COLUMNS.map((column, index) => (
                  <th key={column} scope="col" className={`whitespace-nowrap px-2 py-2 ${index >= 4 && index !== 7 ? "text-right" : "text-left"}`}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((card) => (
                <CompanyRow key={card.id} card={card} />
              ))}
            </tbody>
          </table>
          <Pager current={current} pages={pages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
