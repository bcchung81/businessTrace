import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SourceCoverageBars } from "@/components/dashboard/source-coverage-bars";
import type { SourceCoverage } from "@/lib/repositories/sourceSnapshot";

const COVERAGE: SourceCoverage = {
  total: 50,
  bySource: [
    { source: "dart", found: 22 },
    { source: "dartFinance", found: 9 },
    { source: "fsc", found: 44 },
    { source: "nts", found: 50 },
    { source: "narajangteo", found: 31 },
    { source: "venture", found: 38 },
    { source: "nps", found: 46 },
  ],
};

describe("SourceCoverageBars", () => {
  test("orders sources by how many companies they confirmed", () => {
    render(<SourceCoverageBars coverage={COVERAGE} />);
    const rows = screen.getAllByRole("listitem");

    expect(rows[0]).toHaveTextContent("국세청");
    expect(rows[6]).toHaveTextContent("재무제표");
  });

  test("sizes each bar by found over total and hatches the rest", () => {
    render(<SourceCoverageBars coverage={COVERAGE} />);
    const row = screen.getByRole("listitem", { name: /국민연금/ });
    const bar = within(row).getByRole("progressbar");

    expect(bar).toHaveClass("hatch");
    expect(bar.firstElementChild).toHaveStyle({ width: "92%" });
    expect(row).toHaveTextContent("46");
    expect(row).toHaveTextContent("/50");
  });

  test("colours a full source as verified", () => {
    render(<SourceCoverageBars coverage={COVERAGE} />);
    const row = screen.getByRole("listitem", { name: /국세청/ });

    expect(within(row).getByRole("progressbar").firstElementChild).toHaveClass("bg-verified-fill");
  });

  test("explains why financial statements are structurally missing", () => {
    render(<SourceCoverageBars coverage={COVERAGE} />);

    expect(screen.getByText(/감사보고서 원문에서 추출/)).toBeInTheDocument();
  });

  test("names each progressbar for assistive tech", () => {
    render(<SourceCoverageBars coverage={COVERAGE} />);

    expect(screen.getByRole("progressbar", { name: "국민연금 확인" })).toBeInTheDocument();
  });
});
