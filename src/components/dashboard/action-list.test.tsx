import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ActionList } from "@/components/dashboard/action-list";
import type { ActionItem } from "@/lib/services/actionItems";

function item(over: Partial<ActionItem>): ActionItem {
  return { key: "stale", title: "30일 이상 보도 없음", tone: "plain", count: 0, companies: [], remedy: "재수집", ...over };
}

describe("ActionList", () => {
  test("prints title, count, chips and remedy for an item", () => {
    render(
      <ActionList
        items={[item({ key: "businessNo", title: "사업자번호 미확보", tone: "review", count: 1, companies: [{ id: 3, name: "아크릴" }], remedy: "수기 입력" })]}
      />,
    );
    const row = screen.getByRole("listitem", { name: "사업자번호 미확보" });

    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "아크릴" })).toHaveAttribute("href", "/companies/3");
    expect(row).toHaveAttribute("title", "수기 입력");
  });

  test("keeps a zero item visible and says none", () => {
    render(<ActionList items={[item({})]} />);
    const row = screen.getByRole("listitem", { name: "30일 이상 보도 없음" });

    expect(within(row).getByText("0")).toBeInTheDocument();
    expect(within(row).getByText("없음")).toBeInTheDocument();
  });

  test("collapses more than three companies into a remainder", () => {
    const companies = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `기업${i + 1}` }));
    render(<ActionList items={[item({ count: 7, companies })]} />);

    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText("외 4")).toBeInTheDocument();
  });

  test("appends the detail after the name", () => {
    render(<ActionList items={[item({ key: "decline", count: 1, companies: [{ id: 1, name: "알체라", detail: "▼31%" }] })]} />);

    expect(screen.getByRole("link", { name: /알체라/ })).toHaveTextContent("▼31%");
  });
});
