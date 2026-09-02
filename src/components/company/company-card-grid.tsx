"use client";

import { useState } from "react";
import { COLUMN_HINT, COMPANY_COLUMNS, CompanyRow } from "@/components/company/company-row";
import { Button } from "@/components/ui/button";
import { Pager, paginate } from "@/components/ui/pager";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { filterCards, sortCards, type CardFilter, type CardSort, type CompanyCardData } from "@/lib/services/companyCards";

const SORT_LABEL: Record<CardSort, string> = { triage: "긴급도순", name: "이름순", news: "최근보도순" };
const SORTS: CardSort[] = ["triage", "name", "news"];
const DEFAULTS = { sort: "triage", q: "", review: "", notice: "", positive: "", nobn: "", page: "0" };

/**
 * 기업 목록 표 — 정렬 세그먼트와 필터 체크박스는 URL 쿼리에 둔다. 기업 하나가 한 행이다.
 * 확인 필요 필터는 `?review=1` 하나가 원천이라 켠 뒤 다시 끌 수 있다.
 */
export function CompanyCardGrid({ cards }: { cards: CompanyCardData[] }) {
  const [url, setUrl] = useUrlState(DEFAULTS);
  const [draft, setDraft] = useState(url.q);
  const [synced, setSynced] = useState(url.q);

  if (synced !== url.q) {
    setSynced(url.q);
    setDraft(url.q);
  }

  const sort = SORTS.includes(url.sort as CardSort) ? (url.sort as CardSort) : "triage";
  const filter: CardFilter = {
    query: url.q,
    reviewOnly: url.review === "1",
    noticeOnly: url.notice === "1",
    positiveOnly: url.positive === "1",
    missingBusinessNo: url.nobn === "1",
  };
  const page = Number(url.page) || 0;

  const visible = sortCards(filterCards(cards, filter), sort);
  const { slice, pages, current } = paginate(visible, page);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          aria-label="기업명 검색"
          placeholder="기업명"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setUrl({ q: event.target.value, page: "0" });
          }}
          className="h-7 w-40 border-[1.5px] border-hairline bg-background px-2 text-[12px] focus-visible:border-ink focus-visible:outline-none"
        />

        <div role="group" aria-label="정렬" className="flex gap-1.5">
          {SORTS.map((option) => (
            <Button
              key={option}
              type="button"
              variant={sort === option ? "signal" : "signal-outline"}
              size="sm"
              aria-pressed={sort === option}
              onClick={() => setUrl({ sort: option, page: "0" })}
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
              onChange={(event) => setUrl({ review: event.target.checked ? "1" : "", page: "0" })}
            />
            확인 필요만
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filter.noticeOnly ?? false}
              onChange={(event) => setUrl({ notice: event.target.checked ? "1" : "", page: "0" })}
            />
            주의만
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filter.positiveOnly ?? false}
              onChange={(event) => setUrl({ positive: event.target.checked ? "1" : "", page: "0" })}
            />
            홍보 후보만
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filter.missingBusinessNo ?? false}
              onChange={(event) => setUrl({ nobn: event.target.checked ? "1" : "", page: "0" })}
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
                  <th
                    key={column}
                    scope="col"
                    title={COLUMN_HINT[column]}
                    className={`whitespace-nowrap px-2 py-2 ${index >= 4 && index !== 7 ? "text-right" : "text-left"}`}
                  >
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
          <Pager current={current} pages={pages} onPage={(next) => setUrl({ page: String(next) })} />
        </div>
      )}
    </div>
  );
}
