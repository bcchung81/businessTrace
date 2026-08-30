import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { EmployeeCounts, FactsLine, FinanceLine, SourceDetails } from "@/components/company/company-facts";
import type { CompanyFacts } from "@/lib/services/companyFacts";

const facts: CompanyFacts = {
  ceo: { value: "김한빛", sources: ["DART", "나라장터"], agreement: "match" },
  founded: { value: "2019-03-01", sources: ["나라장터", "금융위"], agreement: "mismatch", alternatives: ["금융위 2019-04-01"] },
  address: { value: "서울특별시 금천구 가산디지털1로 1", sources: ["나라장터"], agreement: "single" },
  corporateNo: null,
  employees: [
    { source: "nps", label: "국민연금 가입자", count: 111 },
    { source: "narajangteo", label: "조달 종업원", count: 39 },
  ],
  listing: { stockCode: "654321", label: "상장 654321" },
  finance: { fiscalYear: 2025, revenue: 1200, operatingIncome: 120, netIncome: 90, totalAssets: 5000, growth: { revenue: 0.2, operatingIncome: null } },
  payroll: { averageBaseIncome: 4_200_000, annualPayroll: 5_594_400_000 },
  turnover: { hired: 24, departed: 12, rate: 0.11 },
  sourceDetails: { dart: ["주식회사 한빛", "대표 김한빛", "상장 654321"], dartFinance: [], fsc: [], nts: ["계속사업자", "부가가치세 일반과세자"], narajangteo: [], venture: [], nps: [] },
};

describe("FactsLine", () => {
  test("shows each basic with its sources and marks agreement in words", () => {
    render(<FactsLine facts={facts} />);
    const line = screen.getByRole("list", { name: "기업 기본" });
    expect(within(line).getByText("대표 김한빛")).toBeInTheDocument();
    expect(within(line).getByText("DART·나라장터 일치")).toBeInTheDocument();
    expect(within(line).getByText("설립 2019-03-01")).toBeInTheDocument();
    expect(within(line).getByText("불일치 · 금융위 2019-04-01")).toHaveClass("text-review");
    expect(within(line).getByText("상장 654321")).toBeInTheDocument();
    expect(within(line).queryByText(/법인번호/)).not.toBeInTheDocument();
  });

  test("says so when nothing is known instead of vanishing", () => {
    render(<FactsLine facts={{ ...facts, ceo: null, founded: null, address: null, listing: null }} />);
    expect(screen.getByText("기본 정보 없음 — 원천 조회 후 채워진다")).toBeInTheDocument();
  });
});

describe("EmployeeCounts", () => {
  test("lists every source count and flags a spread over 20% as a mismatch", () => {
    render(<EmployeeCounts facts={facts} />);
    const group = screen.getByRole("group", { name: "종업원수 원천 비교" });
    expect(group).toHaveTextContent("국민연금 가입자 111");
    expect(group).toHaveTextContent("조달 종업원 39");
    expect(within(group).getByText("원천 간 차이 큼")).toHaveClass("text-review");
    expect(group).toHaveTextContent("인건비 추정 55.9억 · 인당 420만");
    expect(group).toHaveTextContent("12개월 입사 24 · 퇴사 12 · 이직률 11%");
    expect(within(group).getByText("추정")).toBeInTheDocument();
  });
});

describe("FinanceLine", () => {
  test("prints the year, figures with growth, assets and listing; dashes what is missing", () => {
    render(<FinanceLine facts={facts} />);
    const line = screen.getByText(/2025 매출/);
    expect(line).toHaveTextContent("2025 매출 1,200 (▲20%) · 영업이익 120 (전년 —) · 순이익 90 · 자산총계 5,000 · 상장 654321");
  });

  test("hatches the whole line when there is no statement", () => {
    render(<FinanceLine facts={{ ...facts, finance: null, listing: { stockCode: null, label: "비상장" } }} />);
    expect(screen.getByText(/미공시/)).toHaveClass("hatch");
    expect(screen.getByText(/미공시/)).toHaveTextContent("미공시 · 비상장");
  });
});

describe("SourceDetails", () => {
  test("expands a strip cell into its detail lines and collapses again", () => {
    render(<SourceDetails details={facts.sourceDetails} />);
    expect(screen.queryByText("부가가치세 일반과세자")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "국세청 상세" }));
    expect(screen.getByText("부가가치세 일반과세자")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "국세청 상세" }));
    expect(screen.queryByText("부가가치세 일반과세자")).not.toBeInTheDocument();
  });

  test("disables the button for a source with nothing to show", () => {
    render(<SourceDetails details={facts.sourceDetails} />);
    expect(screen.getByRole("button", { name: "벤처확인 상세" })).toBeDisabled();
  });
});
