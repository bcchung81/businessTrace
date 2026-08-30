import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { EvidenceGrid } from "@/components/company/evidence-grid";
import { VerdictPill } from "@/components/dashboard/verdict-pill";
import { Segmented } from "@/components/ui/segmented";
import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";

const SCREENS = [
  "src/app/companies/page.tsx",
  "src/app/companies/[id]/page.tsx",
  "src/components/analysis/analysis-runner.tsx",
  "src/components/company/evidence-grid.tsx",
  "src/components/company/event-timeline.tsx",
  "src/components/company/register-dialog.tsx",
  "src/components/company/company-card-grid.tsx",
  "src/components/layout/company-bulk-form.tsx",
  "src/components/layout/company-table.tsx",
  "src/components/layout/login-form.tsx",
  "src/components/dashboard/company-pipeline-grid.tsx",
  "src/components/dashboard/headcount-trend.tsx",
  "src/components/dashboard/event-table.tsx",
  "src/components/dashboard/verdict-pill.tsx",
];

describe("signal grammar — square, rule-separated, shadowless", () => {
  test.each(SCREENS)("%s carries no rounded box or drop shadow", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/rounded-(lg|xl|md|full|sm|\[)/);
    expect(source).not.toMatch(/\brounded\b(?!-none)/);
    expect(source).not.toMatch(/shadow-(xs|sm|md|lg)\b/);
    expect(source).not.toMatch(/bg-secondary p-0\.5/);
  });

  test("page titles use the display face", () => {
    for (const file of ["src/app/companies/page.tsx", "src/app/companies/[id]/page.tsx"]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toMatch(/<h1 className="[^"]*font-display[^"]*font-black/);
    }
  });
});

describe("Segmented", () => {
  test("marks the selected option with the ink block and exposes it as a radio", () => {
    render(<Segmented label="기간" value="30" options={[{ value: "30", label: "30일" }, { value: "90", label: "90일" }]} onChange={() => {}} />);

    const selected = screen.getByRole("radio", { name: "30일" });
    expect(selected).toHaveAttribute("aria-checked", "true");
    expect(selected).toHaveClass("bg-ink", "text-background");
    expect(screen.getByRole("radio", { name: "90일" })).toHaveClass("border-hairline");
    expect(screen.getByRole("radiogroup", { name: "기간" })).toBeInTheDocument();
  });
});

describe("VerdictPill", () => {
  test("is a square tag, not a pill", () => {
    render(<VerdictPill verdict="risk" />);
    expect(screen.getByText("리스크")).toHaveClass("rounded-none");
  });
});

function snapshot(source: StoredSnapshot["source"], status: StoredSnapshot["status"]): StoredSnapshot {
  return { source, status, summary: "요약", fetchedAt: new Date("2026-08-29T00:00:00Z"), payload: null } as StoredSnapshot;
}

describe("EvidenceGrid states", () => {
  test("tells the four kinds of blank apart by texture, not colour alone", () => {
    render(
      <EvidenceGrid
        snapshots={[
          snapshot("dart", "found"),
          snapshot("dartFinance", "absent"),
          snapshot("nts", "unmeasurable"),
          snapshot("fsc", "conflict"),
          snapshot("nps", "pending"),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem").filter((li) => li.closest("[aria-label='원천 대조']"));
    expect(items).toHaveLength(5);
    for (const li of items) expect(li).toHaveClass("rounded-none", "border-[1.5px]");
    expect(items[0]).toHaveClass("bg-verified-surface");
    expect(items[1]).toHaveClass("hatch");
    expect(items[2]).toHaveClass("border-dashed");
    expect(items[3]).toHaveClass("bg-risk-surface");
    expect(items[4]).toHaveClass("bg-surface");
  });
});
