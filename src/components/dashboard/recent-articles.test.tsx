import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { RecentArticles } from "@/components/dashboard/recent-articles";
import type { MentionedArticle } from "@/lib/services/coMention";

const NOW = new Date("2026-08-29T00:00:00.000Z");

const ARTICLES: MentionedArticle[] = [
  { title: "크립토랩·옥타코 공동 보안 과제 수주", link: "https://n/2", source: "전자신문", published: "2026-08-26T09:00:00.000Z", companies: ["옥타코", "크립토랩"] },
  { title: "크립토랩 시리즈B 200억 유치", link: "https://n/1", source: "머니투데이", published: "2026-08-18T00:00:00.000Z", companies: ["크립토랩"] },
  { title: "아크릴 AI 플랫폼 고도화", link: "https://n/0", source: "ZDNet", published: "2026-07-01T00:00:00.000Z", companies: ["아크릴"] },
];

describe("RecentArticles", () => {
  test("keeps the order it is given, newest first", () => {
    render(<RecentArticles articles={ARTICLES} now={NOW} />);
    const items = within(screen.getByRole("list", { name: "최근 기사" })).getAllByRole("link").map((a) => a.closest("li")!);

    expect(items[0]).toHaveTextContent("크립토랩·옥타코 공동 보안 과제 수주");
    expect(items[2]).toHaveTextContent("아크릴 AI 플랫폼 고도화");
  });

  test("groups by this week, last week and earlier", () => {
    render(<RecentArticles articles={ARTICLES} now={NOW} />);
    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(heads).toEqual(["이번 주", "지난 주", "그 이전"]);
  });

  test("keeps each week group boxed as its own direct list item", () => {
    render(<RecentArticles articles={ARTICLES} now={NOW} />);
    const outer = screen.getByRole("list", { name: "최근 기사" });

    expect(outer.children).toHaveLength(3);
    for (const child of Array.from(outer.children)) {
      expect(child.tagName).toBe("LI");
    }
  });

  test("lays out date, outlet, headline and company chips as columns", () => {
    render(<RecentArticles articles={ARTICLES} now={NOW} />);
    const first = within(screen.getByRole("list", { name: "최근 기사" })).getAllByRole("link").map((a) => a.closest("li")!)[0];

    expect(within(first).getByText("08-26")).toHaveClass("font-mono");
    expect(within(first).getByText("전자신문")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "크립토랩·옥타코 공동 보안 과제 수주" })).toHaveAttribute("href", "https://n/2");
    expect(within(first).getByText("옥타코")).toBeInTheDocument();
    expect(within(first).getByText("크립토랩")).toBeInTheDocument();
  });

  test("says nothing has been collected rather than showing an empty list", () => {
    render(<RecentArticles articles={[]} now={NOW} />);

    expect(screen.getByText(/수집된 기사가 없습니다/)).toBeInTheDocument();
  });

  test("uses the given empty label when a filter yields nothing", () => {
    render(<RecentArticles articles={[]} now={NOW} emptyLabel="이 기업의 기사가 없습니다." />);

    expect(screen.getByText("이 기업의 기사가 없습니다.")).toBeInTheDocument();
  });
});
