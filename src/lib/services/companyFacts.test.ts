import { describe, expect, test } from "vitest";
import { buildCompanyFacts } from "@/lib/services/companyFacts";
import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";

const at = new Date("2026-08-28T00:00:00Z");
const snap = (source: StoredSnapshot["source"], status: StoredSnapshot["status"], payload: unknown): StoredSnapshot => ({ source, status, summary: "", payload, fetchedAt: at });

const months = Array.from({ length: 12 }, (_, i) => ({ ym: `2025${String(i + 8).padStart(2, "0")}`.replace(/^2025(1[3-9])$/, (_m, m) => `2026${String(Number(m) - 12).padStart(2, "0")}`), subscribers: 100 + i, noticeAmount: null, hired: 2, departed: 1 }));

const SNAPSHOTS: StoredSnapshot[] = [
  snap("dart", "found", { found: true, corpName: "주식회사 한빛", ceoName: "김한빛", corporateNo: "110111-1234567", stockCode: "654321" }),
  snap("dartFinance", "found", { found: true, fiscalYear: 2025, source: "auditReport", revenue: 1200, operatingIncome: 120, netIncome: 90, totalAssets: 5000, totalLiabilities: 2000, totalEquity: 3000, previous: { revenue: 1000, operatingIncome: 80, netIncome: -10, totalAssets: 4500 } }),
  snap("narajangteo", "found", { found: true, corpName: "(주)한빛", ceoName: "김한빛", address: "서울특별시 금천구 가산디지털1로 1", openedAt: "20190301", employeeCount: 39 }),
  snap("fsc", "found", { found: true, corpName: "주식회사 한빛", establishedAt: "20190301", employeeCount: 41, address: "서울특별시 금천구 가산디지털1로 1", isSmallBusiness: true, mainBusiness: "소프트웨어 개발" }),
  snap("nps", "found", { found: true, businessNoPrefix: "123456", address: "서울 금천구 가산디지털1로", registeredAt: "20190401", subscribers: 111, averageBaseIncome: 4_200_000, annualPayroll: 5_594_400_000, months }),
  snap("nts", "found", { checked: true, isActive: true, status: "계속사업자", taxType: "부가가치세 일반과세자" }),
  snap("venture", "found", { certified: true, type: "혁신성장유형", validFrom: "2024-03-29", validUntil: "2027-03-28" }),
];

describe("buildCompanyFacts", () => {
  const facts = buildCompanyFacts({ businessNo: "1234567890", snapshots: SNAPSHOTS });

  test("merges the basics across sources and says whether they agree", () => {
    expect(facts.ceo).toEqual({ value: "김한빛", sources: ["DART", "나라장터"], agreement: "match" });
    expect(facts.founded).toEqual({ value: "2019-03-01", sources: ["나라장터", "금융위"], agreement: "match" });
    expect(facts.address).toMatchObject({ value: "서울특별시 금천구 가산디지털1로 1", agreement: "match" });
    expect(facts.corporateNo).toEqual({ value: "110111-1234567", sources: ["DART"], agreement: "single" });
  });

  test("strips html entities that leaked in from a source — 금융위 주소에 &nbsp 가 섞여 온다", () => {
    const dirty = buildCompanyFacts({
      businessNo: null,
      snapshots: [{ ...SNAPSHOTS[3], payload: { ...(SNAPSHOTS[3].payload as object), address: "대전광역시 유성구 유성대로 1476-55 &nbsp" } }],
    });

    expect(dirty.address?.value).toBe("대전광역시 유성구 유성대로 1476-55");
  });

  test("strips a trailing time from a source date — 나라장터 sends '2019-03-11 00:00:00'", () => {
    const timed = buildCompanyFacts({
      businessNo: null,
      snapshots: [{ ...SNAPSHOTS[2], payload: { ...(SNAPSHOTS[2].payload as object), openedAt: "2019-03-11 00:00:00" } }],
    });
    expect(timed.founded).toMatchObject({ value: "2019-03-11" });
  });

  test("flags a mismatch and keeps the alternatives", () => {
    const alt = buildCompanyFacts({ businessNo: null, snapshots: [SNAPSHOTS[0], { ...SNAPSHOTS[2], payload: { ...(SNAPSHOTS[2].payload as object), ceoName: "이한빛" } }] });
    expect(alt.ceo).toEqual({ value: "김한빛", sources: ["DART", "나라장터"], agreement: "mismatch", alternatives: ["나라장터 이한빛"] });
  });

  test("lists employee counts from every source that has one", () => {
    expect(facts.employees).toEqual([
      { source: "nps", label: "국민연금 가입자", count: 111 },
      { source: "narajangteo", label: "조달 종업원", count: 39 },
      { source: "fsc", label: "금융위 종업원", count: 41 },
    ]);
  });

  test("reads listing, finance growth, payroll estimate and turnover", () => {
    expect(facts.listing).toEqual({ stockCode: "654321", label: "상장 654321" });
    expect(facts.finance).toMatchObject({ fiscalYear: 2025, source: "auditReport", revenue: 1200, totalAssets: 5000, growth: { revenue: 0.2, operatingIncome: 0.5 } });
    expect(facts.payroll).toEqual({ averageBaseIncome: 4_200_000, annualPayroll: 5_594_400_000 });
    expect(facts.turnover).toEqual({ hired: 24, departed: 12, rate: 0.11, months: 12 });
  });

  test("spells out each source's detail lines for the strip", () => {
    expect(facts.sourceDetails.nts).toEqual(["계속사업자", "부가가치세 일반과세자"]);
    expect(facts.sourceDetails.venture).toEqual(["혁신성장유형", "2024-03-29 ~ 2027-03-28"]);
    expect(facts.sourceDetails.fsc).toEqual(["중소기업", "소프트웨어 개발", "종업원 41"]);
    expect(facts.sourceDetails.dartFinance).toEqual(["2025년 매출 1,200 (▲20%)", "영업이익 120 (▲50%)", "자산총계 5,000"]);
  });

  test("derives the three ratios from the balance sheet totals", () => {
    expect(facts.finance?.ratios).toMatchObject({
      debtRatio: { value: 2000 / 3000 },
      roe: { value: 90 / 3000 },
      operatingMargin: { value: 120 / 1200 },
    });
  });

  test("names 자본잠식 instead of a ratio that would flip sign", () => {
    const wiped = SNAPSHOTS.map((snap) =>
      snap.source === "dartFinance" ? { ...snap, payload: { ...(snap.payload as object), totalEquity: -400 } } : snap,
    );

    const negative = buildCompanyFacts({ businessNo: null, snapshots: wiped });

    expect(negative.finance?.ratios.debtRatio).toEqual({ value: null, note: "자본잠식" });
  });

  test("is empty but well-formed with no snapshots", () => {
    const empty = buildCompanyFacts({ businessNo: null, snapshots: [] });
    expect(empty).toMatchObject({ ceo: null, founded: null, address: null, corporateNo: null, employees: [], listing: null, finance: null, payroll: null, turnover: null });
    expect(empty.sourceDetails.dart).toEqual([]);
  });

  test("counts the months it actually observed — a new workplace has fewer than twelve", () => {
    const short = SNAPSHOTS.map((snap) =>
      snap.source === "nps" ? { ...snap, payload: { ...(snap.payload as object), months: months.slice(-5) } } : snap,
    );

    const facts = buildCompanyFacts({ businessNo: null, snapshots: short });

    expect(facts.turnover?.months).toBe(5);
  });
});
