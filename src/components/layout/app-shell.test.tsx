import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

describe("AppShell", () => {
  test("shows the product name in the header", () => {
    render(<AppShell>본문</AppShell>);

    expect(
      within(screen.getByRole("banner")).getByText("성과돋보기", { selector: ".sr-only" }),
    ).toBeInTheDocument();
  });

  test("shows the three places this tool has — trends, companies, ranking", () => {
    render(<AppShell>본문</AppShell>);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });

    expect(within(nav).getAllByRole("link")).toHaveLength(3);
    expect(within(nav).getByRole("link", { name: "동향" })).toHaveAttribute("href", "/dashboard");
    expect(within(nav).getByRole("link", { name: "기업" })).toHaveAttribute("href", "/companies");
    expect(within(nav).getByRole("link", { name: "랭킹" })).toHaveAttribute("href", "/ranking");
  });

  test("renders its children inside the main region", () => {
    render(
      <AppShell>
        <p>분석 결과 없음</p>
      </AppShell>,
    );

    expect(within(screen.getByRole("main")).getByText("분석 결과 없음")).toBeInTheDocument();
  });
});
