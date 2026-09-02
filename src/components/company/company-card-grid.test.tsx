import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/x", useSearchParams: () => search }));

import { CompanyCardGrid } from "@/components/company/company-card-grid";
import type { CompanyCardData } from "@/lib/services/companyCards";

const card = (id: number, name: string, needsReview: boolean): CompanyCardData => ({
  everHadEvents: false,
  id, name, industry: null, businessNo: "1", headcount: { latest: null, delta12m: null }, latestArticle: null,
  events30d: { alert: 0, notice: 0, positive: 0, info: 0 }, open: 0, worstSeverity: null, trust: null, needsReview,
});

beforeEach(() => {
  search = new URLSearchParams();
  replace.mockClear();
});

describe("CompanyCardGrid paging", () => {
  test("pages twenty companies at a time and resets to page one on filter change", () => {
    const cards = Array.from({ length: 25 }, (_, index) => card(index + 1, `기업${index + 1}`, index === 24));
    const view = render(<CompanyCardGrid cards={cards} />);

    expect(screen.getAllByRole("row")).toHaveLength(21);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(replace).toHaveBeenCalledWith("/x?page=1", { scroll: false });

    search = new URLSearchParams("page=1");
    view.rerender(<CompanyCardGrid cards={cards} />);
    expect(screen.getAllByRole("row")).toHaveLength(6);
    fireEvent.click(screen.getByRole("checkbox", { name: "확인 필요만" }));
    expect(replace).toHaveBeenCalledWith("/x?review=1", { scroll: false });
  });
});

describe("CompanyCardGrid search", () => {
  test("filters rows by the search box and resets the page", () => {
    const cards = Array.from({ length: 25 }, (_, i) => card(i + 1, i === 24 ? "옥타코" : `기업${i + 1}`, false));
    search = new URLSearchParams("page=1");
    const view = render(<CompanyCardGrid cards={cards} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "기업명 검색" }), { target: { value: "옥타" } });
    expect(replace).toHaveBeenCalledWith("/x?q=%EC%98%A5%ED%83%80", { scroll: false });

    search = new URLSearchParams("q=옥타");
    view.rerender(<CompanyCardGrid cards={cards} />);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.queryByText("2 / 2")).not.toBeInTheDocument();
  });
});

describe("CompanyCardGrid review filter", () => {
  test("offers 확인 필요만 and can start with it on", () => {
    render(<CompanyCardGrid cards={[card(1, "㈜가", true), card(2, "㈜나", false)]} initialFilter={{ reviewOnly: true }} />);

    expect(screen.getByRole("checkbox", { name: "확인 필요만" })).toBeChecked();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  test("turns 확인 필요만 off by dropping it from the URL", () => {
    search = new URLSearchParams("review=1");
    const view = render(<CompanyCardGrid cards={[card(1, "㈜가", true), card(2, "㈜나", false)]} />);

    expect(screen.getByRole("checkbox", { name: "확인 필요만" })).toBeChecked();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox", { name: "확인 필요만" }));
    expect(replace).toHaveBeenCalledWith("/x", { scroll: false });

    search = new URLSearchParams();
    view.rerender(<CompanyCardGrid cards={[card(1, "㈜가", true), card(2, "㈜나", false)]} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });
});

describe("CompanyCardGrid url state", () => {
  test("reads its state from the URL and writes changes back", () => {
    search = new URLSearchParams("sort=name");
    render(<CompanyCardGrid cards={[card(1, "나", false), card(2, "가", false)]} />);

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("가");
    fireEvent.click(screen.getByRole("checkbox", { name: "확인 필요만" }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("review=1"), { scroll: false });
  });
});
