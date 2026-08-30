import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { EventTable } from "@/components/dashboard/event-table";
import type { EventRow } from "@/lib/repositories/eventRepository";

const NOW = new Date("2026-08-30T00:00:00.000Z");

function row(over: Partial<EventRow>): EventRow {
  return { id: 1, companyId: 1, companyName: "딥노이드", kind: "award", severity: "positive", occurredAt: "2026-08-26T00:00:00.000Z", title: "수상 — 대상", evidence: [{ label: "대상", link: "https://n/1" }], runId: 3, trust: "verified", status: "open", note: null, reviewedAt: null, ...over };
}

describe("EventTable", () => {
  test("lists events with severity, kind and trust in words — status is only a filter", () => {
    render(<EventTable events={[row({}), row({ id: 2, kind: "negative_press", severity: "notice", trust: "needs_review", title: "부정 보도 — 자본잠식", companyName: "한국첨단소재" })]} silence={[]} now={NOW} />);
    const rows = screen.getAllByRole("row").slice(1);

    expect(rows[0]).toHaveTextContent("주의");
    expect(rows[0]).toHaveTextContent("확인 필요");
    expect(rows[1]).toHaveTextContent("근거 확인");
    expect(screen.queryByRole("columnheader", { name: "상태" })).not.toBeInTheDocument();
  });

  test("has no action column — review happens on the company page", () => {
    render(<EventTable events={[row({})]} silence={[]} now={NOW} />);

    expect(screen.queryByRole("columnheader", { name: "조치" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "딥노이드" })).toHaveAttribute("href", "/companies/1");
  });

  test("shows ten rows per page by default", () => {
    const events = Array.from({ length: 12 }, (_, index) => row({ id: index + 1, title: `사건 ${index + 1}` }));
    render(<EventTable events={events} silence={[]} now={NOW} />);

    expect(screen.getAllByRole("row").slice(1)).toHaveLength(10);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(2);
  });

  test("filters to open only and by kind", () => {
    render(<EventTable events={[row({}), row({ id: 2, status: "done", kind: "investment" })]} silence={[]} now={NOW} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "미확인만" }));
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(1);
  });

  test("mixes silence in as info rows", () => {
    render(<EventTable events={[]} silence={[{ companyId: 9, companyName: "조용한회사", latest: "2026-06-01T00:00:00.000Z" }]} />);

    expect(screen.getByRole("row", { name: /조용한회사/ })).toHaveTextContent("무보도");
  });

  test("shows evidence links as underlined, not only on hover", () => {
    render(<EventTable events={[row({})]} silence={[]} now={NOW} />);

    expect(screen.getByRole("link", { name: "대상" })).toHaveClass("underline");
  });

  test("says the last event date when the window is empty", () => {
    render(<EventTable events={[]} silence={[]} lastEventAt="2026-07-14T00:00:00.000Z" />);

    expect(screen.getByText(/지난 30일 사건 없음 · 마지막 사건 07-14/)).toBeInTheDocument();
  });
});
