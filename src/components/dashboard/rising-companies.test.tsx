import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RisingCompanies } from "@/components/dashboard/rising-companies";

describe("RisingCompanies", () => {
  it("lists risers with their rank move, gain and total", () => {
    render(
      <RisingCompanies
        rows={[
          { companyId: 12, companyName: "미타운", prevRank: 13, rank: 4, delta: 9, total: 0.56, totalDelta: 0.08, reason: { key: "award", label: "수상 상승", delta: 0.06 } },
          { companyId: 14, companyName: "써로마인드", prevRank: 13, rank: 6, delta: 7, total: 0.54, totalDelta: 0.07, reason: null },
        ]}
        periodLabelText="2025 하반기 · 2025 상반기 대비"
      />,
    );

    expect(screen.getByRole("link", { name: "미타운" })).toHaveAttribute("href", "/companies/12");
    expect(screen.getByText("13위→4위")).toBeInTheDocument();
    expect(screen.getByText("▲9")).toBeInTheDocument();
    expect(screen.getByText("0.56")).toBeInTheDocument();
    expect(screen.getByText("2025 하반기 · 2025 상반기 대비")).toBeInTheDocument();
  });

  it("names why each company moved so a rank jump is not read as performance on its own", () => {
    render(
      <RisingCompanies
        rows={[
          { companyId: 12, companyName: "미타운", prevRank: 13, rank: 4, delta: 9, total: 0.56, totalDelta: 0.08, reason: { key: "award", label: "수상 상승", delta: 0.06 } },
          { companyId: 15, companyName: "무암", prevRank: 40, rank: 20, delta: 20, total: 0.44, totalDelta: 0.1, reason: { key: "verification", label: "검증 상태 변경", delta: 0.1 } },
        ]}
        periodLabelText={null}
      />,
    );

    expect(screen.getByText("수상 상승")).toBeInTheDocument();
    expect(screen.getByText("검증 상태 변경")).toBeInTheDocument();
    expect(screen.getByText("+0.08")).toBeInTheDocument();
  });

  it("renders a falling list with the risk tone and a down arrow", () => {
    render(
      <RisingCompanies
        rows={[{ companyId: 34, companyName: "한국첨단소재", prevRank: 3, rank: 20, delta: 17, total: 0.31, totalDelta: -0.12, reason: { key: "risk", label: "리스크 감점", delta: -0.12 } }]}
        periodLabelText="실시간 랭킹 · 2025년 확정 대비 순위 하락 순"
        direction="down"
      />,
    );

    expect(screen.getByText("3위→20위")).toBeInTheDocument();
    expect(screen.getByText("▼17")).toBeInTheDocument();
    expect(screen.getByText("▼17")).toHaveClass("text-risk");
    expect(screen.getByText("리스크 감점")).toBeInTheDocument();
    expect(screen.getByText("−0.12")).toBeInTheDocument();
  });

  it("keeps every column the same width so rows do not shift, even when a value is missing", () => {
    render(
      <RisingCompanies
        rows={[
          { companyId: 12, companyName: "미타운", prevRank: 13, rank: 4, delta: 9, total: 0.56, totalDelta: 0.08, reason: { key: "award", label: "수상 상승", delta: 0.06 } },
          { companyId: 15, companyName: "무암", prevRank: 40, rank: 20, delta: 20, total: 0.44, totalDelta: null, reason: null },
        ]}
        periodLabelText={null}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toContain("grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_2.5rem_3rem_2.75rem]");
    expect(rows[0].className).toContain("sm:grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_2.5rem_5.5rem_3rem_2.75rem]");
    expect(rows[0].className).toBe(rows[1].className);
    expect(rows[1].children).toHaveLength(rows[0].children.length);
  });

  it("explains why it is empty instead of hiding", () => {
    render(<RisingCompanies rows={[]} periodLabelText={null} />);

    expect(screen.getByText(/비교할 확정 기록이 없거나 순위가 오른 기업이 없습니다/)).toBeInTheDocument();
  });
});
