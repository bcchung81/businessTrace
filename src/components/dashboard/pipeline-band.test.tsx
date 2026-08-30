/* eslint-disable @next/next/no-html-link-for-pages -- 밴드의 aside 슬롯 렌더를 검증하는 앵커다 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PipelineBand } from "@/components/dashboard/pipeline-band";
import { buildPipelineFacts } from "@/lib/services/pipelineFacts";

const facts = buildPipelineFacts({
  companies: 50, articles: 1214, duplicatesRemoved: 312, analysed: 50, noNews: 2, running: 0, latestRunAt: "2026-08-30T03:31:00.000Z",
  counts: { verified: 42, review: 7, risk: 0, pending: 1 }, gateDropouts: { source: 1, faithfulness: 5, evidence: 1 },
  cells: { found: 287, conflict: 4, pending: 51, absent: 8, unmeasurable: 0 }, events30: 18, staleNews: 31, reviewCompanies: 12, monthLabel: "2026-08",
});

describe("PipelineBand", () => {
  test("draws four nodes joined by labelled links, without a headline", () => {
    render(<PipelineBand year={2025} facts={facts} summary={<p>요약</p>} aside={<a href="/companies">미분석 2개사 보기</a>} />);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "분석 파이프라인" });
    const nodes = within(list).getAllByRole("listitem");
    expect(nodes.map((n) => within(n).getByRole("heading", { level: 2 }).textContent)).toEqual(["수집", "분석", "검증", "대조"]);
    expect(within(nodes[2]).getByText("42")).toBeInTheDocument();
    expect(within(nodes[2]).getByText(/탈락 사유 1위 근거 충실도/)).toBeInTheDocument();
    expect(nodes[2]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("primary 기사만")).toBeInTheDocument();
    expect(screen.getByText("사업자번호")).toBeInTheDocument();
  });

  test("ends with outputs and the human queue link, and keeps the summary and aside", () => {
    render(<PipelineBand year={2025} facts={facts} summary={<p>요약</p>} aside={<a href="/companies">미분석 2개사 보기</a>} />);
    expect(screen.getByText("사건 18건 (30일)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /확인 필요 12개사/ })).toHaveAttribute("href", "/companies?year=2025&filter=review");
    expect(screen.getByText("요약")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "미분석 2개사 보기" })).toBeInTheDocument();
  });
});
