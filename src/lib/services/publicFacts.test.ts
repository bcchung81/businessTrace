import { describe, expect, it } from "vitest";
import { publicFactLines } from "@/lib/services/publicFacts";
import type { CompanyFacts } from "@/lib/services/companyFacts";

const EMPTY: CompanyFacts = {
  ageYears: null, ceo: null, founded: null, address: null, corporateNo: null, employees: [], listing: null,
  finance: null, payroll: null, procurement: null, turnover: null,
  sourceDetails: { dart: [], dartFinance: [], fsc: [], nts: [], narajangteo: [], procurement: [], venture: [], nps: [] },
};

const FULL: CompanyFacts = {
  ...EMPTY,
  ageYears: 7,
  founded: { value: "2019-03-01", sources: ["나라장터", "금융위"], agreement: "match" },
  employees: [{ source: "nps", label: "국민연금 가입자", count: 52 }],
  finance: {
    fiscalYear: 2025, source: "auditReport", revenue: 1_200_000_000, operatingIncome: 120_000_000, netIncome: 90_000_000, totalAssets: 5_000_000_000,
    growth: { revenue: 0.4, operatingIncome: 0.5 },
    ratios: { debtRatio: { value: 0.67, note: null }, roe: { value: 0.03, note: null }, operatingMargin: { value: 0.1, note: null } },
  },
  procurement: { count: 3, total: 120_000_000, candidates: 0, years: [] },
  turnover: { hired: 24, departed: 12, rate: 0.12, months: 12 },
  sourceDetails: { ...EMPTY.sourceDetails, nts: ["계속사업자", "부가가치세 일반과세자"], venture: ["벤처투자유형", "2024-03-29 ~ 2027-03-28"] },
};

describe("publicFactLines", () => {
  it("gives nothing for a company with no source data — an empty block is not a fact", () => {
    expect(publicFactLines(EMPTY)).toEqual([]);
  });

  it("writes each known fact as one plain sentence with its source", () => {
    const lines = publicFactLines(FULL);

    expect(lines).toContain("설립 2019-03-01 (7년차) — 나라장터·금융위");
    expect(lines).toContain("국민연금 가입자 52명 · 12개월 입사 24 퇴사 12 — 국민연금");
    expect(lines).toContain("2025년 매출 12억 (전년 대비 +40%) · 영업이익 1.2억 (+50%) — DART");
    expect(lines).toContain("공공조달 낙찰 3건 1.2억 — 나라장터");
    expect(lines).toContain("계속사업자 — 국세청");
    expect(lines).toContain("벤처투자유형 · 2024-03-29 ~ 2027-03-28 — 벤처확인");
  });

  it("never fills a missing number with zero", () => {
    const lines = publicFactLines({ ...FULL, finance: { ...FULL.finance!, growth: { revenue: null, operatingIncome: null } } });

    expect(lines.find((line) => line.includes("매출"))).toBe("2025년 매출 12억 · 영업이익 1.2억 — DART");
  });

  it("leaves out a company\'s age when only the date is known", () => {
    const lines = publicFactLines({ ...EMPTY, founded: FULL.founded, ageYears: null });

    expect(lines).toEqual(["설립 2019-03-01 — 나라장터·금융위"]);
  });
});
