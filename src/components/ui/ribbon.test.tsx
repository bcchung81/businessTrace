import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Ribbon } from "@/components/ui/ribbon";

const GROUPS = [
  { label: "기준일", items: [{ text: "뉴스 08-30 (오늘)" }, { text: "원천 07-01 (60일 전) · 낡음", stale: true }] },
  { label: "할 일", items: [{ text: "확인 필요 12개사", href: "/companies?review=1" }, { text: "검토 필요 7", href: "/ranking" }] },
];

describe("Ribbon", () => {
  test("names both groups for assistive tech and renders every item once", () => {
    render(<Ribbon groups={GROUPS} />);
    const band = screen.getByRole("navigation", { name: "기준일 · 할 일" });
    expect(within(band).getAllByText(/뉴스 08-30/)).toHaveLength(1);
    expect(within(band).getByText("기준일")).toBeInTheDocument();
    expect(within(band).getByText("할 일")).toBeInTheDocument();
  });

  test("stale references get the hatch, not just a colour; to-dos are links", () => {
    render(<Ribbon groups={GROUPS} />);
    expect(screen.getByText(/60일 전/)).toHaveClass("hatch");
    expect(screen.getByText(/뉴스 08-30/)).not.toHaveClass("hatch");
    expect(screen.getByRole("link", { name: "확인 필요 12개사" })).toHaveAttribute("href", "/companies?review=1");
  });

  test("is the primary strip in the display face, standing still", () => {
    render(<Ribbon groups={GROUPS} />);
    const band = screen.getByRole("navigation", { name: /기준일/ });
    expect(band).toHaveClass("bg-primary", "text-primary-foreground");
    expect(band.querySelector(".ribbon-drift")).toBeNull();
  });
});
