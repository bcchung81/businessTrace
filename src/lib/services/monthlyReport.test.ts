import { describe, expect, it } from "vitest";
import type { EventRow } from "@/lib/repositories/eventRepository";
import type { CompanyCardData } from "@/lib/services/companyCards";
import { buildMonthlyWorkbook, monthlyReportFileName, summaryParagraph } from "@/lib/services/monthlyReport";

const EVENT: EventRow = { id: 1, companyId: 1, companyName: "한국첨단소재", kind: "negative_press", severity: "notice", occurredAt: "2026-08-28T00:00:00.000Z", title: "부정 보도 — 자본잠식", evidence: [{ label: "기사", link: "https://n/1" }], runId: 1, trust: "needs_review", status: "open", note: null, reviewedAt: null };
const CARD: CompanyCardData = { id: 1, name: "한국첨단소재", industry: "소재", businessNo: "1", headcount: { latest: 40, delta12m: -0.1 }, latestArticle: "2026-08-28T00:00:00.000Z", events30d: { alert: 0, notice: 1, positive: 0, info: 0 }, open: 1, worstSeverity: "notice", trust: "needs_review", needsReview: false };
const FRESH = { now: new Date("2026-09-01"), latestNewsAt: "2026-08-30T03:03:00.000Z", latestSourceAt: null, sourcesUpdatedToday: 0, sourcesTotal: 50, pensionYm: "202607", running: 0, openEvents: 1, stale: 0 };

describe("summaryParagraph", () => {
  it("fills the template without inventing anything", () => {
    expect(summaryParagraph({ year: 2026, month: 8, total: 50, companiesWithEvents: 12, events: 18, alert: 0, notice: 3, positive: 7, open: 9, firstNoticeCompany: "한국첨단소재" }))
      .toBe("8월 우수기업 50개사 중 12개사에서 사건 18건. 주의 3건(한국첨단소재 외), 경보 0건, 홍보 후보 7건. 미확인 9건.");
    expect(summaryParagraph({ year: 2026, month: 8, total: 50, companiesWithEvents: 0, events: 0, alert: 0, notice: 0, positive: 0, open: 0, firstNoticeCompany: null }))
      .toBe("8월 우수기업 50개사 중 0개사에서 사건 0건. 주의 0건, 경보 0건, 홍보 후보 0건. 미확인 0건.");
  });
});

describe("buildMonthlyWorkbook", () => {
  it("has the five sheets and puts the event on the event and notice sheets", () => {
    const wb = buildMonthlyWorkbook({ year: 2026, month: 8, events: [EVENT], cards: [CARD], freshness: FRESH });

    expect(wb.worksheets.map((s) => s.name)).toEqual(["요약", "사건", "주의 기업", "홍보 후보", "기업 현황"]);
    expect(wb.getWorksheet("사건")!.getRow(2).getCell(2).value).toBe("한국첨단소재");
    expect(wb.getWorksheet("주의 기업")!.rowCount).toBe(2);
    expect(wb.getWorksheet("홍보 후보")!.rowCount).toBe(1);
    expect(String(wb.getWorksheet("요약")!.getCell("A1").value)).toContain("8월 우수기업");
  });

  it("names the file by month", () => {
    expect(monthlyReportFileName(2026, 8)).toBe("2026-08 우수기업 동향.xlsx");
  });
});
