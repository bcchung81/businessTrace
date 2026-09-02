"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { matchesQuery } from "@/lib/services/companyCards";

export type SearchCompany = { id: number; name: string; businessNo: string | null };

const MAX_RESULTS = 8;

/**
 * 히어로 검색 상자 — 기업명으로 걸러 목록을 보이고, 항목 선택은 상세로, 무선택 엔터는 기업 목록 필터로 보낸다.
 */
export function CompanySearch({ year, companies }: { year: number; companies: SearchCompany[] }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);

  const matches = useMemo(
    () => (query.length === 0 ? [] : companies.filter((c) => matchesQuery(c.name, query)).slice(0, MAX_RESULTS)),
    [companies, query],
  );
  const open = matches.length > 0;
  const activeOption = highlight >= 0 && highlight < matches.length ? matches[highlight] : null;

  function optionId(id: number) {
    return `${listId}-${id}`;
  }

  function reset() {
    setQuery("");
    setHighlight(-1);
  }

  function select(company: SearchCompany) {
    reset();
    router.push(`/companies/${company.id}`);
  }

  function handleChange(value: string) {
    setQuery(value);
    setHighlight(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (matches.length > 0) setHighlight((prev) => (prev + 1) % matches.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length > 0) setHighlight((prev) => (prev - 1 + matches.length) % matches.length);
      return;
    }
    if (event.key === "Enter") {
      if (activeOption) {
        select(activeOption);
      } else if (query.length > 0) {
        router.push(`/companies?year=${year}&q=${encodeURIComponent(query)}`);
      }
      return;
    }
    if (event.key === "Escape") {
      reset();
    }
  }

  return (
    <div className="relative w-full sm:w-[280px]">
      <input
        type="search"
        aria-label="기업 검색"
        placeholder="기업명"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? optionId(activeOption.id) : undefined}
        value={query}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={reset}
        className="h-8 w-full border-[1.5px] border-band-foreground/30 bg-transparent px-2.5 text-[12.5px] text-band-foreground placeholder:text-band-foreground/50 focus-visible:border-band-foreground/70 focus-visible:outline-none"
      />
      {open ? (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-10 mt-1 flex flex-col border border-band-foreground/40 bg-band">
          {matches.map((company, index) => (
            <li
              key={company.id}
              id={optionId(company.id)}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(event) => {
                event.preventDefault();
                select(company);
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 text-[12px] hover:bg-band-foreground/10 ${index === highlight ? "bg-band-foreground/10" : ""}`}
            >
              <span>{company.name}</span>
              {company.businessNo === null ? <span className="text-[10.5px] font-semibold text-review">미확보</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
