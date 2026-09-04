import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { DetailToolbar } from "@/components/company/detail-toolbar";

describe("DetailToolbar", () => {
  test("keeps movement on the left and actions on the right", () => {
    render(<DetailToolbar nav={<a href="/x">← 앞</a>} actions={<button type="button">원천 재조회</button>} />);

    const [move, act] = [...screen.getByRole("group", { name: "기업 도구" }).children] as HTMLElement[];
    expect(within(move).getByRole("link", { name: "← 앞" })).toBeInTheDocument();
    expect(within(act).getByRole("button", { name: "원천 재조회" })).toBeInTheDocument();
  });

  test("renders without a nav slot — a company outside any queue still gets its actions", () => {
    render(<DetailToolbar actions={<button type="button">기업 편집</button>} />);

    expect(screen.getByRole("button", { name: "기업 편집" })).toBeInTheDocument();
  });

  test("is a rule-separated band, not a box — the signal grammar has no rounded cards", () => {
    render(<DetailToolbar actions={<span>x</span>} />);

    const bar = screen.getByRole("group", { name: "기업 도구" });
    expect(bar.className).toMatch(/border-y/);
    expect(bar.className).not.toMatch(/rounded|shadow/);
  });

  test("wraps instead of overflowing — the detail header used to push actions off a 1280px laptop", () => {
    render(<DetailToolbar actions={<span>x</span>} />);

    expect(screen.getByRole("group", { name: "기업 도구" }).className).toMatch(/flex-wrap/);
  });
});

describe("company detail page", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/companies/[id]/page.tsx"), "utf8");

  test("puts the toolbar after the header, not inside it", () => {
    expect(source).toMatch(/<\/header>\s*\n\s*<DetailToolbar/);
  });

  test("no longer crowds the heading with navigation and actions", () => {
    const header = source.slice(source.indexOf("<header"), source.indexOf("</header>"));

    for (const moved of ["NeighbourNav", "EditCompanyDialog", "RefreshSources", "목록으로"]) {
      expect(header, `${moved} 가 아직 헤더 안에 있다`).not.toContain(moved);
    }
  });
});
