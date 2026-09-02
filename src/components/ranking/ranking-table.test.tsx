import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ usePathname: () => "/x", useSearchParams: () => search }));

import { RankingTable, type RankingRow } from "@/components/ranking/ranking-table";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";

let replace: MockInstance<History["replaceState"]>;

function goto(query: string) {
  search = new URLSearchParams(query);
  window.history.replaceState(null, "", query ? `/x?${query}` : "/x");
  replace.mockClear();
}

beforeEach(() => {
  replace = vi.spyOn(window.history, "replaceState");
  goto("");
});

afterEach(() => {
  replace.mockRestore();
});

function row(overrides: Partial<RankingRow> & { companyId: number; name: string }): RankingRow {
  return {
    industry: null, rubricId: "default", rubricName: "기본", metrics: [], riskPenalty: 0, total: null, rank: null,
    verdict: "pending", businessNo: "1234567890",
    ...overrides,
  };
}

function rows(): RankingRow[] {
  const ranked = rankCompanies(
    [
      { companyId: 1, name: "㈜가", industry: "SW", sentiment: 8, awards: 1, investments: 1, revenue: 100, verification: "verified", confirmedRisks: 0 },
      { companyId: 2, name: "㈜나", industry: "의료/헬스케어", sentiment: 2, awards: 0, investments: 0, revenue: null, verification: "needs_review", confirmedRisks: 1 },
      { companyId: 3, name: "㈜다", industry: null, sentiment: null, awards: null, investments: null, revenue: null, verification: null, confirmedRisks: 0 },
    ],
    loadRubrics(),
  );
  return ranked.map((row) => ({
    ...row,
    businessNo: row.companyId === 3 ? null : "1234567890",
    verdict: row.companyId === 1 ? "verified" : row.companyId === 2 ? "review" : "pending",
  }));
}

describe("RankingTable", () => {
  test("pages twenty rows at a time", () => {
    const many = rankCompanies(
      Array.from({ length: 25 }, (_, index) => ({
        companyId: index + 1, name: `기업${String(index + 1).padStart(2, "0")}`, industry: "SW",
        sentiment: index, awards: 0, investments: 0, revenue: null, verification: "verified" as const, confirmedRisks: 0,
      })),
      loadRubrics(),
    ).map((row) => ({ ...row, businessNo: "1234567890", verdict: "verified" as const }));
    const view = render(<RankingTable rows={many} industries={["SW"]} />);

    expect(screen.getAllByRole("row")).toHaveLength(21);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(replace).toHaveBeenCalledWith(null, "", "/x?page=1");

    goto("page=1");
    view.rerender(<RankingTable rows={many} industries={["SW"]} />);
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  test("shows the eleven columns in the brief's order", () => {
    render(<RankingTable rows={rows()} industries={["SW", "의료/헬스케어"]} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["순위", "기업", "판정", "총점", "감성", "수상", "투자", "재무", "검증", "리스크 감점", "산업"]);
  });

  test("marks a missing metric with — and the hatch, never 0", () => {
    render(<RankingTable rows={rows()} industries={[]} />);
    const na = screen.getByRole("row", { name: /㈜나/ });
    const finance = within(na).getAllByRole("cell")[7];
    expect(finance).toHaveTextContent("—");
    expect(finance.firstElementChild).toHaveClass("hatch");
  });

  test("leaves an unanalysed company unranked and warns when there is no business number", () => {
    render(<RankingTable rows={rows()} industries={[]} />);
    const da = screen.getByRole("row", { name: /㈜다/ });
    expect(within(da).getAllByRole("cell")[0]).toHaveTextContent("—");
    expect(within(da).getByText("사업자번호 미확보")).toBeInTheDocument();
    expect(within(da).getByText("미분석")).toBeInTheDocument();
  });

  test("offers only 순위 and 기업명 sorts — 총점 duplicated the rank order", () => {
    render(<RankingTable rows={rows()} industries={["SW"]} />);
    const group = screen.getByRole("radiogroup", { name: "정렬" });

    expect(within(group).getAllByRole("radio").map((b) => b.textContent)).toEqual(["순위", "기업명"]);
  });

  test("filters by industry and sorts by name", () => {
    const view = render(<RankingTable rows={rows()} industries={["SW", "의료/헬스케어"]} />);
    fireEvent.click(screen.getByRole("radio", { name: "기업명" }));
    expect(replace).toHaveBeenCalledWith(null, "", "/x?sort=name");

    goto("sort=name");
    view.rerender(<RankingTable rows={rows()} industries={["SW", "의료/헬스케어"]} />);
    const names = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names[0]).toContain("㈜가");

    fireEvent.change(screen.getByRole("combobox", { name: "산업" }), { target: { value: "SW" } });
    expect(replace).toHaveBeenCalledWith(null, "", "/x?sort=name&industry=SW");
    goto("sort=name&industry=SW");
    view.rerender(<RankingTable rows={rows()} industries={["SW", "의료/헬스케어"]} />);
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  test("prints the penalty as a negative number only when a risk was confirmed", () => {
    render(<RankingTable rows={rows()} industries={[]} />);
    expect(within(screen.getByRole("row", { name: /㈜나/ })).getAllByRole("cell")[9]).toHaveTextContent("-0.20");
    expect(within(screen.getByRole("row", { name: /㈜가/ })).getAllByRole("cell")[9]).toHaveTextContent("0");
  });

  test("filters rows by the search box", () => {
    const rows = [row({ companyId: 1, name: "옥타코" }), row({ companyId: 2, name: "넷록스" })];
    const view = render(<RankingTable rows={rows} industries={[]} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "기업명 검색" }), { target: { value: "넷" } });
    expect(replace).toHaveBeenCalledWith(null, "", `/x?q=${encodeURIComponent("넷")}`);

    goto("q=넷");
    view.rerender(<RankingTable rows={rows} industries={[]} />);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("넷록스")).toBeInTheDocument();
  });

  test("keeps every keystroke in the box while the URL catches up", () => {
    render(<RankingTable rows={[row({ companyId: 1, name: "옥타코" })]} industries={[]} />);
    const box = screen.getByRole("searchbox", { name: "기업명 검색" });

    fireEvent.change(box, { target: { value: "옥" } });
    fireEvent.change(box, { target: { value: "옥타" } });

    expect(box).toHaveValue("옥타");
    expect(replace).toHaveBeenNthCalledWith(1, null, "", `/x?q=${encodeURIComponent("옥")}`);
    expect(replace).toHaveBeenNthCalledWith(2, null, "", `/x?q=${encodeURIComponent("옥타")}`);
  });

  test("re-syncs the box when the URL changes under it", () => {
    const rows = [row({ companyId: 1, name: "옥타코" }), row({ companyId: 2, name: "넷록스" })];
    const view = render(<RankingTable rows={rows} industries={[]} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "기업명 검색" }), { target: { value: "옥" } });

    goto("q=넷");
    view.rerender(<RankingTable rows={rows} industries={[]} />);
    expect(screen.getByRole("searchbox", { name: "기업명 검색" })).toHaveValue("넷");
  });

  test("shows the first page when the URL page is not a number", () => {
    goto("page=abc");
    const many = rankCompanies(
      Array.from({ length: 25 }, (_, index) => ({
        companyId: index + 1, name: `기업${String(index + 1).padStart(2, "0")}`, industry: "SW",
        sentiment: index, awards: 0, investments: 0, revenue: null, verification: "verified" as const, confirmedRisks: 0,
      })),
      loadRubrics(),
    ).map((row) => ({ ...row, businessNo: "1234567890", verdict: "verified" as const }));
    render(<RankingTable rows={many} industries={["SW"]} />);

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  test("reads its state from the URL and writes changes back", () => {
    goto("industry=ICT");
    const rows = [row({ companyId: 1, name: "옥타코", industry: "ICT" }), row({ companyId: 2, name: "넷록스", industry: "SW" })];
    render(<RankingTable rows={rows} industries={["ICT", "SW"]} />);

    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("옥타코")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "기업명" }));
    expect(replace).toHaveBeenCalledWith(null, "", expect.stringContaining("sort=name"));
  });
});
