import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ usePathname: () => "/x", useSearchParams: () => search }));

import { CompanyCardGrid } from "@/components/company/company-card-grid";
import type { CompanyCardData } from "@/lib/services/companyCards";

const card = (id: number, name: string, needsReview: boolean): CompanyCardData => ({
  everHadEvents: false,
  id, name, industry: null, businessNo: "1", headcount: { latest: null, delta12m: null }, latestArticle: null,
  events30d: { alert: 0, notice: 0, positive: 0, info: 0 }, open: 0, worstSeverity: null, trust: null, needsReview,
});

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

describe("CompanyCardGrid paging", () => {
  test("pages twenty companies at a time and resets to page one on filter change", () => {
    const cards = Array.from({ length: 25 }, (_, index) => card(index + 1, `기업${index + 1}`, index === 24));
    const view = render(<CompanyCardGrid cards={cards} />);

    expect(screen.getAllByRole("row")).toHaveLength(21);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(replace).toHaveBeenCalledWith(null, "", "/x?page=1");

    goto("page=1");
    view.rerender(<CompanyCardGrid cards={cards} />);
    expect(screen.getAllByRole("row")).toHaveLength(6);
    fireEvent.click(screen.getByRole("checkbox", { name: "확인 필요만" }));
    expect(replace).toHaveBeenCalledWith(null, "", "/x?review=1");
  });
});

describe("CompanyCardGrid search", () => {
  test("filters rows by the search box and resets the page", () => {
    const cards = Array.from({ length: 25 }, (_, i) => card(i + 1, i === 24 ? "옥타코" : `기업${i + 1}`, false));
    goto("page=1");
    const view = render(<CompanyCardGrid cards={cards} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "기업명 검색" }), { target: { value: "옥타" } });
    expect(replace).toHaveBeenCalledWith(null, "", "/x?q=%EC%98%A5%ED%83%80");

    goto("q=옥타");
    view.rerender(<CompanyCardGrid cards={cards} />);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.queryByText("2 / 2")).not.toBeInTheDocument();
  });
});

describe("CompanyCardGrid review filter", () => {
  test("offers 확인 필요만 and can start with it on from the URL", () => {
    goto("review=1");
    render(<CompanyCardGrid cards={[card(1, "㈜가", true), card(2, "㈜나", false)]} />);

    expect(screen.getByRole("checkbox", { name: "확인 필요만" })).toBeChecked();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  test("turns 확인 필요만 off by dropping it from the URL", () => {
    goto("review=1");
    const view = render(<CompanyCardGrid cards={[card(1, "㈜가", true), card(2, "㈜나", false)]} />);

    expect(screen.getByRole("checkbox", { name: "확인 필요만" })).toBeChecked();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox", { name: "확인 필요만" }));
    expect(replace).toHaveBeenCalledWith(null, "", "/x");

    goto("");
    view.rerender(<CompanyCardGrid cards={[card(1, "㈜가", true), card(2, "㈜나", false)]} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });
});

describe("CompanyCardGrid search draft", () => {
  test("keeps every keystroke in the box while the URL catches up", () => {
    render(<CompanyCardGrid cards={[card(1, "옥타코", false)]} />);
    const box = screen.getByRole("searchbox", { name: "기업명 검색" });

    fireEvent.change(box, { target: { value: "옥" } });
    fireEvent.change(box, { target: { value: "옥타" } });

    expect(box).toHaveValue("옥타");
    expect(replace).toHaveBeenNthCalledWith(1, null, "", `/x?q=${encodeURIComponent("옥")}`);
    expect(replace).toHaveBeenNthCalledWith(2, null, "", `/x?q=${encodeURIComponent("옥타")}`);
  });

  test("re-syncs the box when the URL changes under it", () => {
    const cards = [card(1, "옥타코", false), card(2, "넷록스", false)];
    const view = render(<CompanyCardGrid cards={cards} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "기업명 검색" }), { target: { value: "옥" } });

    goto("q=넷");
    view.rerender(<CompanyCardGrid cards={cards} />);
    expect(screen.getByRole("searchbox", { name: "기업명 검색" })).toHaveValue("넷");
  });
});

describe("CompanyCardGrid url state", () => {
  test("falls back to 긴급도순 when the URL asks for an unknown sort", () => {
    goto("sort=garbage");
    render(<CompanyCardGrid cards={[card(1, "㈜가", false), { ...card(2, "㈜나", false), worstSeverity: "alert" }]} />);

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("㈜나");
  });

  test("reads its state from the URL and writes changes back", () => {
    goto("sort=name");
    render(<CompanyCardGrid cards={[card(1, "나", false), card(2, "가", false)]} />);

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("가");
    fireEvent.click(screen.getByRole("checkbox", { name: "확인 필요만" }));
    expect(replace).toHaveBeenCalledWith(null, "", expect.stringContaining("review=1"));
  });
});
