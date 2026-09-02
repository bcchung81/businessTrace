import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import RankingPage from "@/app/ranking/page";

vi.mock("next/navigation", () => ({ redirect: vi.fn(), usePathname: () => "/ranking", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "1" } })) }));

describe("/ranking", () => {
  beforeEach(resetDatabase);

  test("names the year, the rubric weights and the single export action", async () => {
    await prisma.company.create({ data: { name: "㈜가", year: 2026, industry: "SW" } });
    const page = await RankingPage({ params: Promise.resolve({}), searchParams: Promise.resolve({ year: "2026", rubric: "ict" }) } as never);
    render(page);

    expect(screen.getByRole("heading", { level: 1, name: "2026년 벤치마킹" })).toBeInTheDocument();
    expect(screen.getByText(/감성 0\.25 · 수상 0\.2 · 투자 0\.25 · 재무 0\.15 · 검증 0\.15 · 리스크 감점/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "엑셀 내보내기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ICT" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("row", { name: /㈜가/ })).toBeInTheDocument();
  });

  test("uses the default rubric and the latest year when nothing is asked", async () => {
    await prisma.company.create({ data: { name: "㈜나", year: 2025 } });
    render(await RankingPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) } as never));
    expect(screen.getByRole("heading", { level: 1, name: "2025년 벤치마킹" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기본" })).toHaveAttribute("aria-current", "page");
  });
});
