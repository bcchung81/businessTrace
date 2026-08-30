"use client";

import { useState } from "react";
import type { CompanyFacts, FactValue } from "@/lib/services/companyFacts";
import type { SourceKey } from "@/lib/services/sourceEvidence";

const SOURCE_LABEL: Record<SourceKey, string> = { dart: "DART", dartFinance: "재무제표", fsc: "금융위", nts: "국세청", narajangteo: "나라장터", venture: "벤처확인", nps: "국민연금" };
const SOURCE_ORDER: SourceKey[] = ["dart", "dartFinance", "fsc", "nts", "narajangteo", "venture", "nps"];

function Agreement({ fact }: { fact: FactValue }) {
  if (fact.agreement === "single") return <span className="text-[10.5px] text-muted-foreground">{fact.sources.join("·")}</span>;
  if (fact.agreement === "match") return <span className="text-[10.5px] text-muted-foreground">{fact.sources.join("·")} 일치</span>;
  return <span className="text-[10.5px] font-semibold text-review">불일치 · {fact.alternatives?.join(" · ")}</span>;
}

/**
 * 헤더 아래 기본 정보 한 줄 — 대표·설립·주소·법인번호·상장. 원천이 둘이면 일치 여부를 말로 적는다(§2-D 문법).
 */
export function FactsLine({ facts }: { facts: CompanyFacts }) {
  const items: Array<{ key: string; text: string; fact: FactValue | null }> = [
    { key: "ceo", text: facts.ceo ? `대표 ${facts.ceo.value}` : "", fact: facts.ceo },
    { key: "founded", text: facts.founded ? `설립 ${facts.founded.value}` : "", fact: facts.founded },
    { key: "address", text: facts.address ? facts.address.value : "", fact: facts.address },
    { key: "corporateNo", text: facts.corporateNo ? `법인번호 ${facts.corporateNo.value}` : "", fact: facts.corporateNo },
    { key: "listing", text: facts.listing ? facts.listing.label : "", fact: null },
  ].filter((item) => item.text);
  if (items.length === 0) return <p className="text-[12px] text-muted-foreground">기본 정보 없음 — 원천 조회 후 채워진다</p>;
  return (
    <ul aria-label="기업 기본" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
      {items.map((item) => (
        <li key={item.key} className="flex items-baseline gap-1.5">
          <span>{item.text}</span>
          {item.fact ? <Agreement fact={item.fact} /> : null}
        </li>
      ))}
    </ul>
  );
}

function money(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (value >= 10_000) return `${Math.round(value / 10_000)}만`;
  return value.toLocaleString("en-US");
}

/**
 * 종업원수 원천 비교 — 연금·조달·금융위가 20% 넘게 갈리면 동명 타사·지점 합산을 의심하라고 적는다. 인건비는 추정이다.
 */
export function EmployeeCounts({ facts }: { facts: CompanyFacts }) {
  const counts = facts.employees.map((e) => e.count);
  const spread = counts.length > 1 ? (Math.max(...counts) - Math.min(...counts)) / Math.max(...counts) : 0;
  return (
    <div role="group" aria-label="종업원수 원천 비교" className="flex flex-col gap-1 text-[11.5px] text-muted-foreground">
      <div className="flex flex-wrap items-baseline gap-x-3">
        {facts.employees.length === 0 ? <span>종업원수 원천 없음</span> : facts.employees.map((e) => (
          <span key={e.source}>{e.label} <b className="font-mono text-foreground">{e.count}</b></span>
        ))}
        {spread > 0.2 ? <span className="font-semibold text-review">원천 간 차이 큼</span> : null}
      </div>
      {facts.payroll ? (
        <span>
          인건비 추정 <b className="font-mono text-foreground">{money(facts.payroll.annualPayroll)}</b> · 인당 <b className="font-mono text-foreground">{money(facts.payroll.averageBaseIncome)}</b>
          <span className="ml-1.5 border border-hairline px-1 text-[10px] font-bold tracking-[0.08em]">추정</span>
        </span>
      ) : null}
      {facts.turnover ? (
        <span>
          12개월 입사 <b className="font-mono text-foreground">{facts.turnover.hired}</b> · 퇴사 <b className="font-mono text-foreground">{facts.turnover.departed}</b> · 이직률{" "}
          <b className="font-mono text-foreground">{facts.turnover.rate === null ? "—" : `${Math.round(facts.turnover.rate * 100)}%`}</b>
        </span>
      ) : null}
    </div>
  );
}

function amount(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function growth(value: number | null) {
  if (value === null) return "(전년 —)";
  const p = Math.round(value * 100);
  return `(${p >= 0 ? "▲" : "▼"}${Math.abs(p)}%)`;
}

/**
 * DART 재무 한 줄 — 규모(매출·자산) · 성장(전년비) · 상장 여부. 미공시는 빗금이다.
 */
export function FinanceLine({ facts }: { facts: CompanyFacts }) {
  const listing = facts.listing?.label ?? "상장 여부 미상";
  if (!facts.finance) return <span className="hatch px-2 text-muted-foreground">미공시 · {listing}</span>;
  const f = facts.finance;
  return (
    <span className="font-mono tabular-nums">
      {f.fiscalYear} 매출 {amount(f.revenue)} {growth(f.growth.revenue)} · 영업이익 {amount(f.operatingIncome)} {growth(f.growth.operatingIncome)} · 순이익 {amount(f.netIncome)} · 자산총계 {amount(f.totalAssets)} · {listing}
    </span>
  );
}

/**
 * 원천 스트립 아래 펼침 — 칸마다 "무엇을 확인했는지" 줄 몇 개. 보여줄 것이 없는 원천은 버튼을 잠근다.
 */
export function SourceDetails({ details }: { details: Record<SourceKey, string[]> }) {
  const [open, setOpen] = useState<SourceKey | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1.5">
        {SOURCE_ORDER.map((source) => (
          <button
            key={source}
            type="button"
            aria-label={`${SOURCE_LABEL[source]} 상세`}
            aria-expanded={open === source}
            disabled={details[source].length === 0}
            onClick={() => setOpen(open === source ? null : source)}
            className={`border-b-2 px-1 py-0.5 text-[10.5px] font-bold ${open === source ? "border-primary text-foreground" : "border-transparent text-muted-foreground"} disabled:opacity-40`}
          >
            {open === source ? "접기" : "상세"}
          </button>
        ))}
      </div>
      {open ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 border-l-2 border-ink pl-3 text-[12px]">
          {details[open].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
