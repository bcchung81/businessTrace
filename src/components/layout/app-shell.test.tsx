import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

describe("AppShell", () => {
  test("shows the product name in the header", () => {
    render(<AppShell>본문</AppShell>);

    expect(
      within(screen.getByRole("banner")).getByText("성과돋보기"),
    ).toBeInTheDocument();
  });

  test("links to every main section from the sidebar", () => {
    render(<AppShell>본문</AppShell>);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });

    expect(within(nav).getByRole("link", { name: "대시보드" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(within(nav).getByRole("link", { name: "기업 관리" })).toHaveAttribute(
      "href",
      "/companies",
    );
    expect(within(nav).getByRole("link", { name: "분석" })).toHaveAttribute(
      "href",
      "/analysis",
    );
    expect(within(nav).getByRole("link", { name: "리포트" })).toHaveAttribute(
      "href",
      "/reports",
    );
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
