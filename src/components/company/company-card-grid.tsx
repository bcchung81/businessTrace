"use client";

import { useMemo, useState } from "react";
import { CompanyCard } from "@/components/company/company-card";
import { Button } from "@/components/ui/button";
import { filterCards, sortCards, type CardFilter, type CardSort, type CompanyCardData } from "@/lib/services/companyCards";

const SORT_LABEL: Record<CardSort, string> = { triage: "긴급도순", name: "이름순", news: "최근보도순" };
const SORTS: CardSort[] = ["triage", "name", "news"];

/**
 * 기업 카드 목록 — 정렬 세그먼트와 필터 체크박스는 클라이언트 상태로 둔다.
 */
export function CompanyCardGrid({ cards }: { cards: CompanyCardData[] }) {
  const [sort, setSort] = useState<CardSort>("triage");
  const [filter, setFilter] = useState<CardFilter>({});

  const visible = useMemo(() => sortCards(filterCards(cards, filter), sort), [cards, filter, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="정렬" className="flex gap-1.5">
          {SORTS.map((option) => (
            <Button
              key={option}
              type="button"
              variant={sort === option ? "hard" : "hard-outline"}
              size="sm"
              aria-pressed={sort === option}
              onClick={() => setSort(option)}
            >
              {SORT_LABEL[option]}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filter.noticeOnly ?? false}
              onChange={(event) => setFilter((prev) => ({ ...prev, noticeOnly: event.target.checked }))}
            />
            주의만
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filter.positiveOnly ?? false}
              onChange={(event) => setFilter((prev) => ({ ...prev, positiveOnly: event.target.checked }))}
            />
            홍보 후보만
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={filter.missingBusinessNo ?? false}
              onChange={(event) => setFilter((prev) => ({ ...prev, missingBusinessNo: event.target.checked }))}
            />
            사업자번호 미확보만
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-8 text-center">
          <p className="text-sm text-muted-foreground">조건에 맞는 기업이 없습니다.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((card) => (
            <CompanyCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
