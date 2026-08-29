import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import type { AnalysisResult, AnalyzeEvent } from "@/lib/services/analyzer";
import { runCompanyAnalysis, type PipelineDeps } from "@/lib/services/analysisPipeline";
import type { NewsItem } from "@/lib/services/newsTypes";
import type { VerificationOutput } from "@/lib/services/verification";

const NEWS: NewsItem[] = [
  { title: "크립토랩 투자 유치", link: "https://n/1", description: "", content: "본문", published: "2026-08-01", source: "전자신문", provider: "naver", titleMatch: true, mentions: 2, relevance: "primary" },
];

function result(over: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    companyName: "크립토랩",
    model: "m",
    analyses: [],
    comprehensiveOpinion: "요약",
    stats: { totalNews: 1, scoredNews: 1, excludedNews: 0, averageSentiment: 0.5, positiveCount: 1, negativeCount: 0, neutralCount: 0, awardCount: 0, investmentCount: 1 },
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
    ...over,
  };
}

function verification(status: "verified" | "needs_review"): VerificationOutput {
  return {
    status,
    faithfulness: 0.9,
    sourceCoverage: 1,
    evidenceMatch: 0.6,
    unsupportedClaims: [],
    counterEvidence: [],
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
    detail: { layer1: { coverage: 1, cited: 1, total: 1, invalid: [] }, layer2: null, layer3: 0.6 },
  };
}

async function* completes(res: AnalysisResult): AsyncGenerator<AnalyzeEvent> {
  yield { type: "progress", step: "trend", current: 1, total: 1 };
  yield { type: "complete", runId: 0, result: res };
}

async function seed() {
  const company = await prisma.company.create({ data: { name: "크립토랩", year: 2025 } });
  const user = await prisma.user.create({ data: { email: `p-${company.id}@example.com`, passwordHash: "x" } });
  return { company, user };
}

function deps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    model: "m",
    analyze: () => completes(result()),
    verify: async () => verification("verified"),
    ...over,
  };
}

describe("runCompanyAnalysis", () => {
  beforeEach(resetDatabase);

  it("persists the run, its result and its verification, and reports the verdict", async () => {
    const { company, user } = await seed();

    const outcome = await runCompanyAnalysis({ company, userId: user.id, news: NEWS }, deps());

    const run = await prisma.analysisRun.findUniqueOrThrow({ where: { id: outcome.runId }, include: { verification: true } });
    expect(run.status).toBe("completed");
    expect(run.verification?.status).toBe("verified");
    expect(outcome).toMatchObject({ status: "verified", usage: { inputTokens: 11, outputTokens: 6 } });
  });

  it("streams progress, complete, verifying and verified events in order", async () => {
    const { company, user } = await seed();
    const types: string[] = [];

    await runCompanyAnalysis({ company, userId: user.id, news: NEWS }, deps({ onEvent: (event) => types.push(event.type) }));

    expect(types).toEqual(["progress", "complete", "verifying", "verified"]);
  });

  it("marks the run failed when analysis throws", async () => {
    const { company, user } = await seed();
    const outcome = await runCompanyAnalysis(
      { company, userId: user.id, news: NEWS },
      deps({ analyze: async function* () { throw new Error("LLM down"); } }),
    );

    const run = await prisma.analysisRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(run.status).toBe("failed");
    expect(outcome).toMatchObject({ status: "failed", message: "LLM down" });
  });

  it("keeps the completed run when only verification fails", async () => {
    const { company, user } = await seed();
    const outcome = await runCompanyAnalysis(
      { company, userId: user.id, news: NEWS },
      deps({ verify: async () => { throw new Error("judge down"); } }),
    );

    const run = await prisma.analysisRun.findUniqueOrThrow({ where: { id: outcome.runId }, include: { verification: true } });
    expect(run.status).toBe("completed");
    expect(run.verification).toBeNull();
    expect(outcome).toMatchObject({ status: "verification_failed", message: "judge down" });
  });

  it("reports no_news when nothing was scored and skips verification", async () => {
    const { company, user } = await seed();
    let verified = false;
    const outcome = await runCompanyAnalysis(
      { company, userId: user.id, news: NEWS },
      deps({
        analyze: () => completes(result({ stats: { ...result().stats, scoredNews: 0 } })),
        verify: async () => { verified = true; return verification("verified"); },
      }),
    );

    expect(outcome.status).toBe("no_news");
    expect(verified).toBe(false);
  });

  it("stops early and fails the run when the consumer goes away", async () => {
    const { company, user } = await seed();
    const outcome = await runCompanyAnalysis(
      { company, userId: user.id, news: NEWS },
      deps({ isOpen: () => false }),
    );

    const run = await prisma.analysisRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(run.status).toBe("failed");
    expect(outcome.status).toBe("aborted");
  });
});

describe("runCompanyAnalysis — relevance filter", () => {
  beforeEach(resetDatabase);

  const MIXED: NewsItem[] = [
    NEWS[0],
    { ...NEWS[0], link: "https://n/2", title: "아크릴 소재 시장", relevance: "mention" },
    { ...NEWS[0], link: "https://n/3", title: "무관 기사", relevance: "unrelated" },
  ];

  it("analyses only primary articles", async () => {
    const { company, user } = await seed();
    let received: NewsItem[] = [];

    await runCompanyAnalysis(
      { company, userId: user.id, news: MIXED },
      deps({ analyze: (_name, news) => { received = news; return completes(result()); } }),
    );

    expect(received.map((item) => item.link)).toEqual(["https://n/1"]);
  });

  it("closes the run as no_news without calling the model when nothing is primary", async () => {
    const { company, user } = await seed();
    let called = false;

    const outcome = await runCompanyAnalysis(
      { company, userId: user.id, news: MIXED.slice(1) },
      deps({ analyze: () => { called = true; return completes(result()); } }),
    );

    const run = await prisma.analysisRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(called).toBe(false);
    expect(outcome.status).toBe("no_news");
    expect(run.status).toBe("no_news");
  });
});
