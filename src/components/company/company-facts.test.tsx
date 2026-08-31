import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { FactsTable, FinanceLine, SourceDetails } from "@/components/company/company-facts";
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

describe("FactsTable", () => {
  test("lays every basic out as key-value cells with sources and agreement in words", () => {
    render(<FactsTable facts={facts} businessNo="1234567890" industry="SW" />);
    const table = screen.getByLabelText("기업 기본");
    expect(within(table).getByText("사업자번호")).toBeInTheDocument();
    expect(within(table).getByText("1234567890")).toBeInTheDocument();
    expect(within(table).getByText("업종")).toBeInTheDocument();
    expect(within(table).getByText("SW")).toBeInTheDocument();
    expect(within(table).getByText("대표")).toBeInTheDocument();
    expect(within(table).getByText("김한빛")).toBeInTheDocument();
    expect(within(table).getByText("DART·나라장터 일치")).toBeInTheDocument();
    expect(within(table).getByText("설립")).toBeInTheDocument();
    expect(within(table).getByText("2019-03-01")).toBeInTheDocument();
    expect(within(table).getByText("불일치 · 금융위 2019-04-01")).toHaveClass("text-review");
    expect(within(table).getByText("상장")).toBeInTheDocument();
    expect(within(table).getByText("상장 654321")).toBeInTheDocument();
    expect(within(table).queryByText("법인번호")).not.toBeInTheDocument();
  });

  test("folds the employee sources, payroll estimate and turnover into the same table", () => {
    render(<FactsTable facts={facts} businessNo="1234567890" industry={null} />);
    const table = screen.getByLabelText("기업 기본");
    expect(within(table).getByText("국민연금 가입자")).toBeInTheDocument();
    expect(within(table).getByText("111")).toBeInTheDocument();
    expect(within(table).getByText("조달 종업원")).toBeInTheDocument();
    expect(within(table).getByText("원천 간 차이 큼")).toHaveClass("text-review");
    expect(within(table).getByText("인건비 추정")).toBeInTheDocument();
    expect(table).toHaveTextContent("55.9억 · 인당 420만");
    expect(within(table).getByText("추정")).toBeInTheDocument();
    expect(within(table).getByText("12개월 입·퇴사")).toBeInTheDocument();
    expect(table).toHaveTextContent("입사 24 · 퇴사 12 · 이직률 11%");
  });

  test("widens a long cell to fit its data and keeps short cells single-column", () => {
    const long = {
      value: "경기도 고양시 덕양구 삼원로",
      sources: ["나라장터"],
      agreement: "mismatch" as const,
      alternatives: ["금융위 경기도 고양시 덕양구 원흥동 삼원로 73"],
    };
    render(<FactsTable facts={{ ...facts, address: long }} businessNo="1234567890" industry={null} />);

    const address = screen.getByText("주소").closest("div")!;
    expect(address.className).toContain("lg:col-span-3");
    const ceo = screen.getByText("대표").closest("div")!;
    expect(ceo.className).not.toContain("col-span");
  });

  test("warns in the 사업자번호 cell when the number is missing", () => {
    render(<FactsTable facts={facts} businessNo={null} industry={null} />);
    expect(screen.getByText("미확보 — 뉴스 외 근거를 붙일 수 없습니다")).toHaveClass("text-review");
  });

  test("still shows the 사업자번호 warning cell when nothing else is known", () => {
    render(
      <FactsTable
        facts={{ ...facts, ceo: null, founded: null, address: null, listing: null, employees: [], payroll: null, turnover: null }}
        businessNo={null}
        industry={null}
      />,
    );
    const table = screen.getByLabelText("기업 기본");
    expect(within(table).getByText("사업자번호")).toBeInTheDocument();
    expect(within(table).getByText("미확보 — 뉴스 외 근거를 붙일 수 없습니다")).toHaveClass("text-review");
    expect(within(table).queryByText("대표")).not.toBeInTheDocument();
  });
});

describe("FinanceLine", () => {
  test("prints the year, figures with growth, assets and listing; dashes what is missing", () => {
    render(<FinanceLine facts={facts} />);
    const line = screen.getByText(/2025 매출/);
    expect(line).toHaveTextContent("2025 매출 1,200 (▲20%) · 영업이익 120 (전년 —) · 순이익 90 · 자산총계 5,000 · 상장 654321");
  });

  test("cites the audit report when the figures came from its document", () => {
    render(<FinanceLine facts={{ ...facts, finance: { ...facts.finance!, source: "auditReport" } }} />);
    expect(screen.getByText(/감사보고서/)).toBeInTheDocument();
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
