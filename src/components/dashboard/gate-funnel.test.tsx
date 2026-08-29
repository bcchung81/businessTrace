import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { GateFunnel } from "@/components/dashboard/gate-funnel";

const GATES = { analysed: 46, source: 44, faithfulness: 35, evidence: 31 };
const DROPOUTS = { source: 2, faithfulness: 9, evidence: 4 };

describe("GateFunnel", () => {
  test("lists the three gates in pipeline order with pass counts over analysed", () => {
    render(<GateFunnel gates={GATES} dropouts={DROPOUTS} />);
    const rows = screen.getAllByRole("listitem");

    expect(rows[0]).toHaveTextContent("출처 인용");
    expect(rows[0]).toHaveTextContent("44");
    expect(rows[0]).toHaveTextContent("/46");
    expect(rows[2]).toHaveTextContent("근거 일치");
    expect(rows[2]).toHaveTextContent("31");
  });

  test("sizes each bar by its pass ratio", () => {
    render(<GateFunnel gates={GATES} dropouts={DROPOUTS} />);
    const bar = within(screen.getAllByRole("listitem")[1]).getByRole("progressbar");

    expect(bar).toHaveAttribute("aria-valuenow", "35");
    expect(bar).toHaveAttribute("aria-valuemax", "46");
    expect(bar.firstElementChild).toHaveStyle({ width: "76%" });
  });

  test("explains each dropout with its fixed cause", () => {
    render(<GateFunnel gates={GATES} dropouts={DROPOUTS} />);

    expect(screen.getByText(/2개사 · 기사 링크 없음/)).toBeInTheDocument();
    expect(screen.getByText(/9개사 · 기사 원문에 없는 수치/)).toBeInTheDocument();
    expect(screen.getByText(/4개사 · 공식 원천과 불일치/)).toBeInTheDocument();
  });

  test("survives zero analysed companies", () => {
    render(<GateFunnel gates={{ analysed: 0, source: 0, faithfulness: 0, evidence: 0 }} dropouts={{ source: 0, faithfulness: 0, evidence: 0 }} />);

    expect(screen.getAllByRole("progressbar")[0].firstElementChild).toHaveStyle({ width: "0%" });
  });
});
