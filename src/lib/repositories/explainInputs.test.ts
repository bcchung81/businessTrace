import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { buildExplanation } from "@/lib/repositories/explainInputs";

async function seed() {
  const user = await prisma.user.create({ data: { email: `e-${Math.random()}@example.com`, passwordHash: "scrypt:32768:8:1$s$h" } });
  const company = await prisma.company.create({ data: { name: "㈜가", year: 2026, industry: "SW" } });
  const analyses = [
    {
      news: { title: "㈜가 120억 유치", link: "https://n.example/1", description: "", content: "㈜가는 시리즈B 투자로 120억 원을 유치했다고 밝혔다.", published: "2026-08-01", source: "전자신문", provider: "naver", titleMatch: true, mentions: 1, relevance: "primary" },
      isAboutCompany: true,
      trend: { is_about_company: "Y", news_trend_summary: "", sentiment_score: 7, sentiment_label: "긍정" },
      award: { is_award_related: "N", award_name: "", award_reason: "" },
      investment: { is_investment_related: "Y", investment_name: "시리즈B", investment_reason: "" },
    },
  ];
  const run = await prisma.analysisRun.create({
    data: {
      companyId: company.id,
      userId: user.id,
      model: "m",
      status: "completed",
      newsJson: "[]",
      completedAt: new Date("2026-08-02"),
      resultJson: JSON.stringify({
        companyName: "㈜가",
        model: "m",
        analyses,
        comprehensiveOpinion: "㈜가는 시리즈B 투자로 120억 원을 유치했다.",
        stats: { totalNews: 1, scoredNews: 1, excludedNews: 0, averageSentiment: 7, positiveCount: 1, negativeCount: 0, neutralCount: 0, awardCount: 0, investmentCount: 1 },
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      }),
    },
  });
  await prisma.verificationResult.create({
    data: {
      analysisRunId: run.id,
      status: "needs_review",
      faithfulness: 0.5,
      sourceCoverage: 1,
      evidenceMatch: 0.7,
      unsupportedClaims: "[]",
      counterEvidence: JSON.stringify(["보도자료 의존"]),
      detailJson: JSON.stringify({
        layer1: { coverage: 1, cited: 1, total: 1, invalid: [] },
        layer2: { claims: [{ claim: "120억", supported: true, evidence: "기사" }, { claim: "흑자", supported: false, evidence: "" }], counter_evidence: ["보도자료 의존"] },
        layer3: 0.7,
      }),
    },
  });
  await prisma.sourceSnapshot.create({
    data: { companyId: company.id, source: "dartFinance", status: "found", payload: JSON.stringify({ found: true, fiscalYear: 2025, revenue: 1000, operatingIncome: 10, netIncome: 5, totalAssets: 900 }) },
  });
  return { company, run };
}

describe("buildExplanation", () => {
  beforeEach(resetDatabase);

  test("assembles contributions, evidence, citations and layers for a company", async () => {
    const { company, run } = await seed();
    const explanation = (await buildExplanation(company.id))!;
    expect(explanation.runId).toBe(run.id);
    expect(explanation.contributions).toHaveLength(7);
    expect(explanation.total).not.toBeNull();
    expect(explanation.evidence.headlines[0].title).toBe("㈜가 120억 유치");
    expect(explanation.evidence.finance?.revenue).toBe(1000);
    expect(explanation.sentences[0].snippets[0].link).toBe("https://n.example/1");
    expect(explanation.layers).toMatchObject({ status: "needs_review", faithfulness: 0.5, cited: 1, total: 1, counterEvidence: ["보도자료 의존"] });
    expect(explanation.layers?.claims).toHaveLength(2);
    expect(explanation.layers).toMatchObject({ reviewedAt: null, reviewNote: null });
  });

  test("carries the review record out as an ISO string so the panel can date it", async () => {
    const { company, run } = await seed();
    await prisma.verificationResult.update({
      where: { analysisRunId: run.id },
      data: { reviewedAt: new Date("2026-09-02T04:00:00.000Z"), reviewNote: "일괄 검토 완료 · 근거 미열람" },
    });

    const explanation = (await buildExplanation(company.id))!;

    expect(explanation.layers).toMatchObject({ reviewedAt: "2026-09-02T04:00:00.000Z", reviewNote: "일괄 검토 완료 · 근거 미열람" });
  });

  test("returns an empty explanation for a company never analysed and null for a missing one", async () => {
    const company = await prisma.company.create({ data: { name: "㈜나", year: 2026 } });
    const explanation = (await buildExplanation(company.id))!;
    expect(explanation).toMatchObject({ runId: null, total: null, layers: null, sentences: [] });
    expect(explanation.evidence).toEqual({ headlines: [], finance: null, verification: null });
    expect(await buildExplanation(999)).toBeNull();
  });
});
