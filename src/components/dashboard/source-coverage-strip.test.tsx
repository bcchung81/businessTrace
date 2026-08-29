import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SourceCoverageStrip } from "@/components/dashboard/source-coverage-strip";

const COVERAGE = {
  total: 50,
  bySource: [
    { source: "nts" as const, found: 50 },
    { source: "dart" as const, found: 16 },
    { source: "fsc" as const, found: 0 },
  ],
};

describe("SourceCoverageStrip", () => {
  test("reads as one compact line beside the table it belongs to", () => {
    render(<SourceCoverageStrip coverage={COVERAGE} />);
    const list = screen.getByRole("list", { name: "원천별 확인 기업 수" });

    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(list).toHaveTextContent("국세청 50");
  });

  test("drops the progress bars, because the number already says it", () => {
    const { container } = render(<SourceCoverageStrip coverage={COVERAGE} />);

    expect(container.querySelector("[data-fill]")).toBeNull();
  });

  test("keeps the total behind each number so the share stays readable", () => {
    render(<SourceCoverageStrip coverage={COVERAGE} />);

    expect(screen.getByRole("listitem", { name: "국세청 50/50" })).toBeInTheDocument();
  });

  test("marks a source that confirmed nothing rather than hiding it", () => {
    render(<SourceCoverageStrip coverage={COVERAGE} />);
    const chip = screen.getByRole("listitem", { name: "금융위 0/50" });

    expect(within(chip).getByText("0")).toBeInTheDocument();
  });

  test("shows a fully covered source differently from a partial one", () => {
    render(<SourceCoverageStrip coverage={COVERAGE} />);

    expect(screen.getByRole("listitem", { name: "국세청 50/50" }).className).toContain("text-verified");
    expect(screen.getByRole("listitem", { name: "DART 16/50" }).className).not.toContain("text-verified");
  });

  test("does not divide by zero when no company is registered", () => {
    render(<SourceCoverageStrip coverage={{ total: 0, bySource: [{ source: "nts", found: 0 }] }} />);

    expect(screen.getByRole("listitem", { name: "국세청 0/0" })).toBeInTheDocument();
  });
});
