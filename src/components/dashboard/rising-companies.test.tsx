import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RisingCompanies } from "@/components/dashboard/rising-companies";

describe("RisingCompanies", () => {
  it("lists risers with their rank move, gain and total", () => {
    render(
      <RisingCompanies
        rows={[
          { companyId: 12, companyName: "미타운", prevRank: 13, rank: 4, delta: 9, total: 0.56 },
          { companyId: 14, companyName: "써로마인드", prevRank: 13, rank: 6, delta: 7, total: 0.54 },
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

  it("explains why it is empty instead of hiding", () => {
    render(<RisingCompanies rows={[]} periodLabelText={null} />);

    expect(screen.getByText(/직전 기간 확정 기록이 없습니다/)).toBeInTheDocument();
  });
});
