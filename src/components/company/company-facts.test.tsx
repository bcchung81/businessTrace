import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { FactsTable, FinanceTable, SourceDetails } from "@/components/company/company-facts";
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
  finance: { fiscalYear: 2025, revenue: 1200, operatingIncome: 120, netIncome: 90, totalAssets: 5000, growth: { revenue: 0.2, operatingIncome: null }, ratios: { debtRatio: { value: 0.67, note: null }, roe: { value: 0.03, note: null }, operatingMargin: { value: 0.1, note: null } } },
  payroll: { averageBaseIncome: 4_200_000, annualPayroll: 5_594_400_000 },
  turnover: { hired: 24, departed: 12, rate: 0.11, months: 12 },
  sourceDetails: { dart: ["주식회사 한빛", "대표 김한빛", "상장 654321"], dartFinance: [], fsc: [], nts: ["계속사업자", "부가가치세 일반과세자"], narajangteo: [], venture: [], nps: [] },
};

describe("FactsTable", () => {
  test("lays the facts out as a real table with label cells and value cells", () => {
    render(<FactsTable facts={facts} businessNo="1234567890" industry="양자" />);

    const table = screen.getByRole("table", { name: "기업 기본" });
    expect(within(table).getByRole("rowheader", { name: "사업자번호" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "업종" })).toBeInTheDocument();
    expect(within(table).getByText("1234567890")).toBeInTheDocument();
  });

  test("pairs short facts two to a row and gives a long one the whole row", () => {
    const long = {
      value: "전남광주통합특별시 북구 첨단과기로",
      sources: ["나라장터", "금융위"],
      agreement: "mismatch" as const,
      alternatives: ["금융위 광주광역시 북구 첨단과기로 345"],
    };
    render(<FactsTable facts={{ ...facts, address: long }} businessNo="1234567890" industry="양자" />);

    const table = screen.getByRole("table", { name: "기업 기본" });
    const rows = within(table).getAllByRole("row");
    const pair = rows.find((row) => within(row).queryByRole("rowheader", { name: "사업자번호" }));
    expect(within(pair!).getAllByRole("rowheader")).toHaveLength(2);

    const wide = rows.find((row) => within(row).queryByRole("rowheader", { name: "주소" }));
    expect(within(wide!).getAllByRole("rowheader")).toHaveLength(1);
    expect(within(wide!).getAllByRole("cell")[0]).toHaveAttribute("colspan", "3");
  });

  test("keeps every fact — nothing is dropped by the packing", () => {
    render(<FactsTable facts={facts} businessNo="1234567890" industry="양자" />);

    const table = screen.getByRole("table", { name: "기업 기본" });
    for (const label of ["사업자번호", "업종", "대표", "설립", "주소", "국민연금 가입자", "조달 종업원", "인건비 추정", "12개월 입·퇴사"]) {
      expect(within(table).getByRole("rowheader", { name: label })).toBeInTheDocument();
    }
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
    const table = screen.getByRole("table", { name: "기업 기본" });
    expect(within(table).getByRole("rowheader", { name: "사업자번호" })).toBeInTheDocument();
    expect(within(table).getByText("미확보 — 뉴스 외 근거를 붙일 수 없습니다")).toHaveClass("text-review");
    expect(within(table).queryByRole("rowheader", { name: "대표" })).not.toBeInTheDocument();
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

describe("FinanceTable", () => {
  test("lays the figures out as labelled rows in 억 rather than one run-on line of raw digits", () => {
    render(
      <FinanceTable
        facts={{
          ...facts,
          finance: {
            fiscalYear: 2025,
            source: "auditReport",
            revenue: 17_781_025_951,
            operatingIncome: -1_758_542_406,
            netIncome: -2_225_941_630,
            totalAssets: 27_289_018_193,
            growth: { revenue: 0.32, operatingIncome: null },
            ratios: { debtRatio: { value: 1.32, note: null }, roe: { value: -0.19, note: null }, operatingMargin: { value: -0.1, note: null } },
          },
        }}
      />,
    );

    const table = screen.getByRole("table", { name: "DART 재무" });
    expect(within(table).getByRole("rowheader", { name: "매출" })).toBeInTheDocument();
    expect(within(table).getByText("177.8억")).toBeInTheDocument();
    expect(within(table).getByText("-17.6억")).toBeInTheDocument();
    expect(within(table).getByText("132%")).toBeInTheDocument();
    expect(within(table).getByText(/감사보고서 원문/)).toBeInTheDocument();
  });

  test("hatches the whole block when there is no statement", () => {
    render(<FinanceTable facts={{ ...facts, finance: null, listing: { stockCode: null, label: "비상장" } }} />);

    expect(screen.getByText(/미공시/)).toHaveClass("hatch");
  });
});
