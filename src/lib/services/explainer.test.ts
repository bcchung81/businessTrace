import { describe, expect, test } from "vitest";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";
import { explainScore } from "@/lib/services/explainer";

const book = loadRubrics();

describe("explainScore", () => {
  test("splits the pre-penalty score into shares that sum to 100%", () => {
    const [row] = rankCompanies(
      [
        { companyId: 1, name: "㈜가", industry: null, sentiment: 10, awards: 2, investments: 1, revenue: 100, verification: "verified", confirmedRisks: 1 },
        { companyId: 2, name: "㈜나", industry: null, sentiment: 0, awards: 0, investments: 0, revenue: 0, verification: "needs_review", confirmedRisks: 0 },
      ],
      book,
    );
    const shares = explainScore(row);
    expect(shares.map((c) => c.key)).toEqual(["sentiment", "award", "investment", "finance", "verification"]);
    expect(shares.reduce((acc, c) => acc + (c.share ?? 0), 0)).toBeCloseTo(1, 6);
    expect(shares[0].share).toBeCloseTo(0.3, 6);
    expect(shares[4].label).toBe("검증");
  });

  test("keeps a missing metric in the list with a null share and re-weights the rest", () => {
    const [row] = rankCompanies(
      [
        { companyId: 1, name: "㈜가", industry: null, sentiment: 10, awards: null, investments: null, revenue: null, verification: "verified", confirmedRisks: 0 },
        { companyId: 2, name: "㈜나", industry: null, sentiment: 0, awards: null, investments: null, revenue: null, verification: "needs_review", confirmedRisks: 0 },
      ],
      book,
    );
    const shares = explainScore(row);
    expect(shares.find((c) => c.key === "award")!.share).toBeNull();
    expect(shares.find((c) => c.key === "sentiment")!.share).toBeCloseTo(0.75, 6);
    expect(shares.find((c) => c.key === "verification")!.share).toBeCloseTo(0.25, 6);
  });

  test("returns every metric with null shares when nothing was scored", () => {
    const [row] = rankCompanies(
      [{ companyId: 1, name: "㈜가", industry: null, sentiment: null, awards: null, investments: null, revenue: null, verification: null, confirmedRisks: 0 }],
      book,
    );
    expect(explainScore(row).every((c) => c.share === null)).toBe(true);
    expect(explainScore(row)).toHaveLength(5);
  });

  test("a metric scored 0 contributes 0, not null", () => {
    const rows = rankCompanies(
      [
        { companyId: 1, name: "㈜가", industry: null, sentiment: 10, awards: 0, investments: null, revenue: null, verification: null, confirmedRisks: 0 },
        { companyId: 2, name: "㈜나", industry: null, sentiment: 0, awards: 3, investments: null, revenue: null, verification: null, confirmedRisks: 0 },
      ],
      book,
    );
    const ga = rows.find((r) => r.companyId === 1)!;
    expect(explainScore(ga).find((c) => c.key === "award")!.share).toBe(0);
  });
});
