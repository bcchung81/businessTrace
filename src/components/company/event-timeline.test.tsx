import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { EventTimeline } from "@/components/company/event-timeline";
import type { EventRow } from "@/lib/repositories/eventRepository";


const ROWS: EventRow[] = [
  { id: 1, companyId: 1, companyName: "알체라", kind: "negative_press", severity: "notice", occurredAt: "2026-08-28T00:00:00.000Z", title: "부정 보도 — 자본잠식", evidence: [{ label: "기사", link: "https://n/1" }], runId: 3, trust: "needs_review", status: "open", note: null, reviewedAt: null },
  { id: 2, companyId: 1, companyName: "알체라", kind: "headcount_down", severity: "notice", occurredAt: "2026-07-31T00:00:00.000Z", title: "인원 63 → 41명 (−35%)", evidence: [], runId: null, trust: null, status: "done", note: "본사 이전 확인(8/5)", reviewedAt: "2026-08-05T00:00:00.000Z" },
];

describe("EventTimeline", () => {
  test("lists events newest first with evidence link, trust and status", () => {
    render(<EventTimeline events={ROWS} />);
    const items = screen.getAllByRole("listitem");

    expect(items[0]).toHaveTextContent("2026-08-28");
    expect(within(items[0]).getByRole("link", { name: "기사" })).toHaveAttribute("href", "https://n/1");
    expect(items[0]).toHaveTextContent("확인 필요");
    expect(items[1]).toHaveTextContent("조치완료");
  });

  test("is read-only — no review buttons, no note field", () => {
    render(<EventTimeline events={ROWS} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("본사 이전 확인(8/5)")).not.toBeInTheDocument();
  });

  test("shows evidence links as underlined, not only on hover", () => {
    render(<EventTimeline events={ROWS} />);

    expect(screen.getByRole("link", { name: "기사" })).toHaveClass("underline");
  });

  test("says so when a company has no events", () => {
    render(<EventTimeline events={[]} />);
    expect(screen.getByText(/기록된 사건이 없습니다/)).toBeInTheDocument();
  });
});
