import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CompanyCardGrid } from "@/components/company/company-card-grid";
import type { CompanyCardData } from "@/lib/services/companyCards";

const card = (id: number, name: string, needsReview: boolean): CompanyCardData => ({
  everHadEvents: false,
  id, name, industry: null, businessNo: "1", headcount: { latest: null, delta12m: null }, latestArticle: null,
  events30d: { alert: 0, notice: 0, positive: 0, info: 0 }, open: 0, worstSeverity: null, trust: null, needsReview,
});

describe("CompanyCardGrid review filter", () => {
  test("offers 확인 필요만 and can start with it on", () => {
    render(<CompanyCardGrid cards={[card(1, "㈜가", true), card(2, "㈜나", false)]} initialFilter={{ reviewOnly: true }} />);
    expect(screen.getByRole("checkbox", { name: "확인 필요만" })).toBeChecked();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox", { name: "확인 필요만" }));
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });
});
