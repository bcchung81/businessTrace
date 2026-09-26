import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ArticleList, type ArticleRow } from "@/components/company/article-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const row = (link: string, over: Partial<ArticleRow> = {}): ArticleRow => ({
  link,
  title: `기사 ${link}`,
  source: "전자신문",
  published: "2026-09-20",
  isAbout: false,
  held: false,
  confidence: 0.2,
  judgment: null,
  ...over,
});

describe("ArticleList", () => {
  test("shows what the analyzer decided about each article and how sure it was", () => {
    render(<ArticleList companyId={5} runId={40} articles={[row("https://n/1", { isAbout: true, confidence: 0.92 }), row("https://n/2", { held: true, confidence: 0.5 }), row("https://n/3")]} queue={vi.fn()} />);

    expect(screen.getByRole("link", { name: "기사 https://n/1" })).toHaveAttribute("href", "https://n/1");
    expect(screen.getByText("주제 0.92")).toBeInTheDocument();
    expect(screen.getByText("보류 0.50")).toBeInTheDocument();
    expect(screen.getByText("주제 아님 0.20")).toBeInTheDocument();
  });

  test("puts an article on the judgment queue and then points to it", async () => {
    const queue = vi.fn(async () => ({ ok: true as const, id: 77 }));
    render(<ArticleList companyId={5} runId={40} articles={[row("https://n/1")]} queue={queue} />);

    fireEvent.click(screen.getByRole("button", { name: "판정 대기열에 올리기" }));

    expect(await screen.findByRole("link", { name: "대기열에 있음" })).toHaveAttribute("href", "/judgments");
    expect(queue).toHaveBeenCalledWith({ companyId: 5, runId: 40, link: "https://n/1" });
  });

  test("shows the human verdict instead of the button once the article is on the queue", () => {
    render(<ArticleList companyId={5} runId={40} articles={[row("https://n/1", { judgment: { id: 3, about: "no" } }), row("https://n/2", { judgment: { id: 4, about: null } })]} queue={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "판정 대기열에 올리기" })).not.toBeInTheDocument();
    expect(screen.getByText("사람: 주제 아님")).toBeInTheDocument();
    expect(screen.getByText("사람: 미판정")).toBeInTheDocument();
  });

  test("says why an article could not be queued", async () => {
    const queue = vi.fn(async () => ({ ok: false as const, message: "그 실행에서 기사를 찾지 못했습니다." }));
    render(<ArticleList companyId={5} runId={40} articles={[row("https://n/1")]} queue={queue} />);

    fireEvent.click(screen.getByRole("button", { name: "판정 대기열에 올리기" }));

    expect(await screen.findByText("그 실행에서 기사를 찾지 못했습니다.")).toBeInTheDocument();
  });
});
