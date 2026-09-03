import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/dashboard/actions", () => ({
  loadReviewItemsAction: vi.fn(),
  confirmCompanyEventsAction: vi.fn(),
  markVerificationsReviewedAction: vi.fn(),
}));
vi.mock("@/app/companies/[id]/actions", () => ({
  decideNpsAction: vi.fn(),
  holdNpsAction: vi.fn(),
  decideDartAction: vi.fn(),
  decideFscAction: vi.fn(),
  reviewVerificationAction: vi.fn(),
  confirmEventsAction: vi.fn(),
  saveAliasesAction: vi.fn(),
  saveBusinessNoAction: vi.fn(),
}));

import { Ribbon } from "@/components/ui/ribbon";

const GROUPS = [
  { label: "기준일", items: [{ text: "뉴스 08-30 (오늘)" }, { text: "원천 07-01 (60일 전) · 낡음", stale: true }] },
  { label: "할 일", items: [{ text: "확인 필요 12개사", href: "/companies?review=1" }, { text: "검토 필요 7", href: "/ranking" }] },
];

describe("Ribbon", () => {
  test("names both groups for assistive tech and renders every item once", () => {
    render(<Ribbon groups={GROUPS} year={2026} />);
    const band = screen.getByRole("navigation", { name: "기준일 · 할 일" });
    expect(within(band).getAllByText(/뉴스 08-30/)).toHaveLength(1);
    expect(within(band).getByText("기준일")).toBeInTheDocument();
    expect(within(band).getByText("할 일")).toBeInTheDocument();
  });

  test("stale references get the hatch, not just a colour; to-dos are links", () => {
    render(<Ribbon groups={GROUPS} year={2026} />);
    expect(screen.getByText(/60일 전/)).toHaveClass("hatch");
    expect(screen.getByText(/뉴스 08-30/)).not.toHaveClass("hatch");
    expect(screen.getByRole("link", { name: "확인 필요 12개사" })).toHaveAttribute("href", "/companies?review=1");
  });

  test("an item carrying a list opens it in a dialog instead of linking straight out", () => {
    render(
      <Ribbon
        year={2026}
        groups={[
          {
            label: "할 일",
            items: [
              { text: "확인 필요 2개사", todo: { kind: "review", rows: [{ companyId: 5, name: "㈜가", note: "사업자번호 미확보", selectable: false }] } },
              { text: "검토 필요 0" },
            ],
          },
        ]}
      />,
    );

    expect(screen.queryByRole("link", { name: "확인 필요 2개사" })).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "확인 필요 2개사" });
    expect(screen.getByText("검토 필요 0")).toBeInTheDocument();

    fireEvent.click(button);

    expect(screen.getByRole("dialog", { name: "확인 필요 2개사" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "㈜가 열기" })).toBeInTheDocument();
    expect(screen.getByText("사업자번호 미확보")).toBeInTheDocument();
  });

  test("is the primary strip in the display face, standing still", () => {
    render(<Ribbon groups={GROUPS} year={2026} />);
    const band = screen.getByRole("navigation", { name: /기준일/ });
    expect(band).toHaveClass("bg-primary", "text-primary-foreground");
    expect(band.querySelector(".ribbon-drift")).toBeNull();
  });
});
