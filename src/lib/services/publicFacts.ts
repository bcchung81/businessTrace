import type { CompanyFacts } from "@/lib/services/companyFacts";

/** 원 → 억 문구. 정수면 .0 을 뗀다. */
function eok(amount: number | null): string | null {
  if (amount === null) return null;
  const value = Math.round((amount / 100_000_000) * 10) / 10;
  return `${Number.isInteger(value) ? value.toFixed(0) : value}억`;
}

function pct(rate: number | null): string {
  if (rate === null) return "";
  const value = Math.round(rate * 100);
  return ` (${value >= 0 ? "+" : ""}${value}%)`;
}

/**
 * 공공데이터 사실을 종합의견·검증 프롬프트에 넣을 한 줄 문장들로 낸다.
 * 숫자는 전부 코드가 계산한 값이다 — LLM 은 문장으로만 받고, 없는 값은 줄 자체를 내지 않는다(0 으로 메우지 않는다).
 */
export function publicFactLines(facts: CompanyFacts): string[] {
  const lines: string[] = [];

  if (facts.founded) {
    const age = facts.ageYears === null ? "" : ` (${facts.ageYears}년차)`;
    lines.push(`설립 ${facts.founded.value}${age} — ${facts.founded.sources.join("·")}`);
  }

  const nps = facts.employees.find((entry) => entry.source === "nps");
  if (nps) {
    const flow = facts.turnover ? ` · ${facts.turnover.months}개월 입사 ${facts.turnover.hired} 퇴사 ${facts.turnover.departed}` : "";
    lines.push(`국민연금 가입자 ${nps.count}명${flow} — 국민연금`);
  }

  if (facts.finance) {
    const parts: string[] = [];
    const revenue = eok(facts.finance.revenue);
    if (revenue) parts.push(`매출 ${revenue}${facts.finance.growth.revenue === null ? "" : pct(facts.finance.growth.revenue).replace("(", "(전년 대비 ")}`);
    const operating = eok(facts.finance.operatingIncome);
    if (operating) parts.push(`영업이익 ${operating}${pct(facts.finance.growth.operatingIncome)}`);
    if (parts.length > 0) lines.push(`${facts.finance.fiscalYear}년 ${parts.join(" · ")} — DART`);
  }

  if (facts.procurement && facts.procurement.count > 0) {
    lines.push(`공공조달 낙찰 ${facts.procurement.count}건 ${eok(facts.procurement.total) ?? ""} — 나라장터`.replace(/\s+—/, " —"));
  }

  const status = facts.sourceDetails.nts[0];
  if (status) lines.push(`${status} — 국세청`);

  if (facts.sourceDetails.venture.length > 0) lines.push(`${facts.sourceDetails.venture.join(" · ")} — 벤처확인`);

  return lines;
}
