/* eslint-disable @next/next/no-html-link-for-pages -- 밴드의 aside 슬롯 렌더를 검증하는 앵커다 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PipelineBand } from "@/components/dashboard/pipeline-band";
import { buildPipelineFacts } from "@/lib/services/pipelineFacts";

const facts = buildPipelineFacts({
  companies: 50, articles: 1214, analysed: 50, noNews: 2, running: 0,
  counts: { verified: 42, review: 7, risk: 0, pending: 1 },
  cells: { found: 287, conflict: 4, pending: 51, absent: 8, unmeasurable: 0 }, staleNews: 31, reviewCompanies: 12,
});

describe("PipelineBand", () => {
  test("draws four nodes joined by plain links — no captions on the connectors", () => {
    render(<PipelineBand year={2025} facts={facts} summary={<p>요약</p>} aside={<a href="/companies">미분석 2개사 보기</a>} search={<div data-testid="search" />} />);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "분석 파이프라인" });
    const nodes = within(list).getAllByRole("listitem");
    expect(nodes.map((n) => within(n).getByRole("heading", { level: 2 }).textContent)).toEqual(["수집", "분석", "검증", "대조"]);
    expect(within(nodes[2]).getByText("42")).toBeInTheDocument();
    expect(within(nodes[2]).getByText(/검토 필요 7/)).toBeInTheDocument();
    expect(nodes[2]).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText("primary 기사만")).not.toBeInTheDocument();
    expect(screen.queryByText("사업자번호")).not.toBeInTheDocument();
  });

  test("shows one support line per node, not two", () => {
    render(<PipelineBand year={2025} facts={facts} summary={<p>요약</p>} aside={<a href="/companies">미분석 2개사 보기</a>} search={<div data-testid="search" />} />);
    const nodes = within(screen.getByRole("list", { name: "분석 파이프라인" })).getAllByRole("listitem");

    expect(within(nodes[0]).getByText(/보도 30일 초과/)).toBeInTheDocument();
    expect(within(nodes[0]).queryByText(/중복 제거/)).not.toBeInTheDocument();
    expect(within(nodes[1]).queryByText(/감성 · 수상 · 투자/)).not.toBeInTheDocument();
    expect(within(nodes[3]).queryByText(/결측/)).not.toBeInTheDocument();
  });

  test("keeps the search slot, the summary and the aside — drops the outputs row", () => {
    render(<PipelineBand year={2025} facts={facts} summary={<p>요약</p>} aside={<a href="/companies">미분석 2개사 보기</a>} search={<div data-testid="search" />} />);
    expect(screen.queryByText(/사건 18건/)).not.toBeInTheDocument();
    expect(screen.queryByText("산출")).not.toBeInTheDocument();
    expect(screen.getByTestId("search")).toBeInTheDocument();
    expect(screen.getByText("요약")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "미분석 2개사 보기" })).toBeInTheDocument();
  });

  test("names the cohort without saying the word pipeline — the diagram says it", () => {
    render(<PipelineBand year={2025} facts={facts} summary={<p>요약</p>} aside={null} search={<div data-testid="search" />} />);

    expect(screen.getByText("2025년 우수기업 · 지난 30일")).toBeInTheDocument();
  });
});
