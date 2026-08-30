import { render, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CompanyRow, COMPANY_COLUMNS } from "@/components/company/company-row";
import type { CompanyCardData } from "@/lib/services/companyCards";

const CARD: CompanyCardData = { id: 1, name: "딥노이드", industry: "의료AI", businessNo: "1", headcount: { latest: 89, delta12m: 0.04 }, latestArticle: "2026-08-26T00:00:00.000Z", events30d: { alert: 0, notice: 0, positive: 1, info: 0 }, open: 1, worstSeverity: "positive", trust: "verified", needsReview: false, everHadEvents: true };

function renderRow(card: CompanyCardData) {
  const { container } = render(
    <table>
      <tbody>
        <CompanyRow card={card} now={new Date("2026-08-31T00:00:00.000Z")} />
      </tbody>
    </table>,
  );
  return within(container.querySelector("tr") as HTMLElement).getAllByRole("cell");
}

describe("CompanyRow", () => {
  test("declares the list columns in the brief's order", () => {
    expect(COMPANY_COLUMNS).toEqual(["심각도", "기업", "신뢰", "업종", "가입자", "수상·투자·긍정", "주의", "최근 보도", "미확인"]);
  });

  test("puts one company on one row with headcount, events and trust in words", () => {
    const cells = renderRow(CARD);
    expect(cells).toHaveLength(9);
    expect(cells[0]).toHaveTextContent("긍정");
    expect(within(cells[1]).getByRole("link", { name: /딥노이드/ })).toHaveAttribute("href", "/companies/1");
    expect(cells[2]).toHaveTextContent("근거 확인");
    expect(cells[3]).toHaveTextContent("의료AI");
    expect(cells[4]).toHaveTextContent("89");
    expect(cells[4]).toHaveTextContent("▲4%");
    expect(cells[5]).toHaveTextContent("1");
    expect(cells[6]).toHaveTextContent("0");
    expect(cells[7]).toHaveTextContent("08-26");
    expect(cells[8]).toHaveTextContent("1");
  });

  test("says 무보도 with the info mark when there were no events in 30 days, and 사건 없음 when there never were", () => {
    const quiet = renderRow({ ...CARD, worstSeverity: null, events30d: { alert: 0, notice: 0, positive: 0, info: 0 }, everHadEvents: true, latestArticle: "2026-05-20T00:00:00.000Z" });
    expect(quiet[0]).toHaveTextContent("무보도");
    expect(quiet[7]).toHaveTextContent("05-20 · 낡음");
    expect(quiet[7].firstElementChild).toHaveClass("hatch");
    const never = renderRow({ ...CARD, worstSeverity: null, events30d: { alert: 0, notice: 0, positive: 0, info: 0 }, everHadEvents: false });
    expect(never[0]).toHaveTextContent("사건 없음");
  });

  test("warns about a missing business number under the name and leaves zero open as 0, not blank", () => {
    const cells = renderRow({ ...CARD, businessNo: null, open: 0, worstSeverity: null, events30d: { alert: 0, notice: 0, positive: 0, info: 0 }, headcount: { latest: null, delta12m: null }, everHadEvents: false });
    expect(within(cells[1]).getByText("사업자번호 미확보")).toBeInTheDocument();
    expect(cells[0]).toHaveTextContent("사건 없음");
    expect(cells[4]).toHaveTextContent("미확보");
    expect(cells[8]).toHaveTextContent("0");
  });
});
