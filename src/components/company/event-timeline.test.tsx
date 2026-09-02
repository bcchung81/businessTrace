import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { EventTimeline } from "@/components/company/event-timeline";
import type { EventRow } from "@/lib/repositories/eventRepository";


const ROWS: EventRow[] = [
  { id: 1, companyId: 1, companyName: "알체라", kind: "negative_press", severity: "notice", occurredAt: "2026-08-28T00:00:00.000Z", title: "부정 보도 — 자본잠식", evidence: [{ label: "기사", link: "https://n/1" }], runId: 3, trust: "needs_review", status: "open", note: null, reviewedAt: null },
  { id: 2, companyId: 1, companyName: "알체라", kind: "headcount_down", severity: "notice", occurredAt: "2026-07-31T00:00:00.000Z", title: "인원 63 → 41명 (−35%)", evidence: [], runId: null, trust: null, status: "done", note: "본사 이전 확인(8/5)", reviewedAt: "2026-08-05T00:00:00.000Z" },
];

describe("EventTimeline", () => {
  test("puts each event on one table row, newest first, with date, kind, trust, status, title and evidence", () => {
    render(<EventTimeline events={ROWS} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["날짜", "심각도", "종류", "신뢰", "상태", "사건", "근거"]);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const cells = within(rows[0]).getAllByRole("cell");
    expect(cells).toHaveLength(7);
    expect(cells[0]).toHaveTextContent("2026-08-28");
    expect(cells[1]).toHaveTextContent("주의");
    expect(cells[2]).toHaveTextContent("부정 보도");
    expect(cells[3]).toHaveTextContent("확인 필요");
    expect(cells[4]).toHaveTextContent("미확인");
    expect(cells[5]).toHaveTextContent("부정 보도 — 자본잠식");
    expect(within(cells[6]).getByRole("link", { name: "기사" })).toHaveAttribute("href", "https://n/1");
    expect(within(rows[1]).getAllByRole("cell")[4]).toHaveTextContent("조치완료");
    expect(within(rows[1]).getAllByRole("cell")[6]).toHaveTextContent("—");
  });

  test("keeps long titles and evidence on one line with an ellipsis and the full text on hover", () => {
    const long = "부정 보도 — 한국첨단소재 유증 흥행에도 씁쓸한 뒷맛, 소액공모 틈새 노렸나 하는 아주 긴 제목";
    render(<EventTimeline events={[{ ...ROWS[0], title: long, evidence: [{ label: long, link: "https://n/1" }] }]} />);

    const titleCell = screen.getByText(long, { selector: "td" });
    expect(titleCell.className).toContain("truncate");
    expect(titleCell).toHaveAttribute("title", long);

    const evidenceCell = screen.getByRole("link", { name: long }).closest("td")!;
    expect(evidenceCell.className).toContain("truncate");
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

  test("anchors each row so a dashboard link can land on the specific event", () => {
    const { container } = render(<EventTimeline events={ROWS} />);
    expect(container.querySelector("#event-1")).not.toBeNull();
  });
});
