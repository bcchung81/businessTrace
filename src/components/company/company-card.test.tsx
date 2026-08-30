import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CompanyCard } from "@/components/company/company-card";
import type { CompanyCardData } from "@/lib/services/companyCards";

const CARD: CompanyCardData = { id: 1, name: "딥노이드", industry: "의료AI", businessNo: "1", headcount: { latest: 89, delta12m: 0.04 }, latestArticle: "2026-08-26T00:00:00.000Z", events30d: { alert: 0, notice: 0, positive: 1, info: 0 }, open: 1, worstSeverity: "positive", trust: "verified" };

describe("CompanyCard", () => {
  test("links to the company and shows headcount, events and trust in words", () => {
    render(<CompanyCard card={CARD} />);

    expect(screen.getByRole("link", { name: /딥노이드/ })).toHaveAttribute("href", "/companies/1");
    expect(screen.getByText(/가입자 89명/)).toBeInTheDocument();
    expect(screen.getByText("▲4%")).toBeInTheDocument();
    expect(screen.getByText("근거 확인")).toBeInTheDocument();
    expect(screen.getByText("미확인 1")).toBeInTheDocument();
  });

  test("warns about a missing business number and hides a zero open badge", () => {
    render(<CompanyCard card={{ ...CARD, businessNo: null, open: 0, worstSeverity: null, events30d: { alert: 0, notice: 0, positive: 0, info: 0 } }} />);

    expect(screen.getByText("사업자번호 미확보")).toBeInTheDocument();
    expect(screen.queryByText(/미확인/)).not.toBeInTheDocument();
  });
});
