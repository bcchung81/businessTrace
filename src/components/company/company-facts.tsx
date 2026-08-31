"use client";

import { useState } from "react";
import type { CompanyFacts, FactValue } from "@/lib/services/companyFacts";
import type { SourceKey } from "@/lib/services/sourceEvidence";

const SOURCE_LABEL: Record<SourceKey, string> = { dart: "DART", dartFinance: "재무제표", fsc: "금융위", nts: "국세청", narajangteo: "나라장터", venture: "벤처확인", nps: "국민연금" };
const SOURCE_ORDER: SourceKey[] = ["dart", "dartFinance", "fsc", "nts", "narajangteo", "venture", "nps"];

function agreementText(fact: FactValue) {
  if (fact.agreement === "single") return fact.sources.join("·");
  if (fact.agreement === "match") return `${fact.sources.join("·")} 일치`;
  return `불일치 · ${fact.alternatives?.join(" · ") ?? ""}`;
}

function Agreement({ fact }: { fact: FactValue }) {
  const tone = fact.agreement === "mismatch" ? "font-semibold text-review" : "text-muted-foreground";
  return <span className={`text-[10.5px] ${tone}`}>{agreementText(fact)}</span>;
}

function money(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (value >= 10_000) return `${Math.round(value / 10_000)}만`;
  return value.toLocaleString("en-US");
}

type Cell = { key: string; label: string; value: React.ReactNode; chars: number; note?: React.ReactNode };

/**
 * 셀 폭을 데이터 길이로 정한다 — 짧은 값 1칸, 긴 값일수록 넓게. 값이 셀 안에서 꺾이지 않게 하기 위해서다.
 */
function spanClass(chars: number) {
  if (chars > 52) return "col-span-2 sm:col-span-3 lg:col-span-4";
  if (chars > 34) return "col-span-2 lg:col-span-3";
  if (chars > 17) return "col-span-2";
  return "";
}

/**
 * 헤더 아래 기본 정보를 key-value 격자로 편다 — 번호·업종·기본·종업원 3원천·인건비·입퇴사가 한 표다.
 * 원천이 둘이면 일치 여부를, 3원천 인원이 20% 넘게 갈리면 동명 타사·지점 합산 의심을 셀 안에 적는다.
 */
export function FactsTable({ facts, businessNo, industry }: { facts: CompanyFacts; businessNo: string | null; industry: string | null }) {
  const counts = facts.employees.map((e) => e.count);
  const spread = counts.length > 1 ? (Math.max(...counts) - Math.min(...counts)) / Math.max(...counts) : 0;

  const factCell = (label: string, fact: FactValue | null): Cell | null =>
    fact ? { key: label, label, value: fact.value, chars: fact.value.length + agreementText(fact).length, note: <Agreement fact={fact} /> } : null;

  const payrollText = facts.payroll ? `${money(facts.payroll.annualPayroll)} · 인당 ${money(facts.payroll.averageBaseIncome)}` : "";
  const turnoverText = facts.turnover
    ? `입사 ${facts.turnover.hired} · 퇴사 ${facts.turnover.departed} · 이직률 ${facts.turnover.rate === null ? "—" : `${Math.round(facts.turnover.rate * 100)}%`}`
    : "";

  const cells: Cell[] = [
    {
      key: "businessNo",
      label: "사업자번호",
      chars: businessNo ? businessNo.length : 24,
      value: businessNo ? (
        <span className="font-mono tabular-nums">{businessNo}</span>
      ) : (
        <span className="font-medium text-review">미확보 — 뉴스 외 근거를 붙일 수 없습니다</span>
      ),
    },
    industry ? { key: "industry", label: "업종", value: industry, chars: industry.length } : null,
    factCell("대표", facts.ceo),
    factCell("설립", facts.founded),
    factCell("주소", facts.address),
    factCell("법인번호", facts.corporateNo),
    facts.listing ? { key: "listing", label: "상장", value: facts.listing.label, chars: facts.listing.label.length } : null,
    ...facts.employees.map((e, index) => ({
      key: e.source,
      label: e.label,
      value: <span className="font-mono tabular-nums">{e.count}</span>,
      chars: String(e.count).length + (index === 0 && spread > 0.2 ? 9 : 0),
      note: index === 0 && spread > 0.2 ? <span className="text-[10.5px] font-semibold text-review">원천 간 차이 큼</span> : undefined,
    })),
    facts.payroll
      ? {
          key: "payroll",
          label: "인건비 추정",
          chars: payrollText.length + 3,
          value: (
            <span>
              <b className="font-mono tabular-nums">{money(facts.payroll.annualPayroll)}</b> · 인당 <b className="font-mono tabular-nums">{money(facts.payroll.averageBaseIncome)}</b>
            </span>
          ),
          note: <span className="border border-hairline px-1 text-[10px] font-bold tracking-[0.08em]">추정</span>,
        }
      : null,
    facts.turnover
      ? {
          key: "turnover",
          label: "12개월 입·퇴사",
          chars: turnoverText.length,
          value: (
            <span>
              입사 <b className="font-mono tabular-nums">{facts.turnover.hired}</b> · 퇴사 <b className="font-mono tabular-nums">{facts.turnover.departed}</b> · 이직률{" "}
              <b className="font-mono tabular-nums">{facts.turnover.rate === null ? "—" : `${Math.round(facts.turnover.rate * 100)}%`}</b>
            </span>
          ),
        }
      : null,
  ].filter((cell): cell is Cell => cell !== null);

  return (
    <dl aria-label="기업 기본" className="mt-1 grid grid-flow-dense grid-cols-2 gap-x-6 gap-y-2.5 border-t border-hairline pt-2.5 text-[12px] sm:grid-cols-3 lg:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.key} className={`flex min-w-0 flex-col gap-0.5 ${spanClass(cell.chars)}`}>
          <dt className="whitespace-nowrap text-[10.5px] font-bold tracking-[0.06em] text-muted-foreground">{cell.label}</dt>
          <dd className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="min-w-0 break-keep lg:whitespace-nowrap">{cell.value}</span>
            {cell.note}
          </dd>
        </div>
      ))}
    </dl>
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
      {f.source === "auditReport" ? <span className="text-muted-foreground"> · 감사보고서 원문</span> : null}
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
