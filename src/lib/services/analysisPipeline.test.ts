import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { findVerification } from "@/lib/repositories/verificationResult";
import { listEvents } from "@/lib/repositories/eventRepository";
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
    fallbacks: 0,
    ...over,
  };
}

function verification(status: "verified" | "needs_review" | "failed"): VerificationOutput {
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

describe("runCompanyAnalysis — events", () => {
  beforeEach(resetDatabase);

  it("records award and press events with the verification trust after a verified run", async () => {
    const { company, user } = await seed();
    const awarded: AnalysisResult = { ...result(), analyses: [
      { news: NEWS[0], isAboutCompany: true, trend: { is_about_company: "Y", news_trend_summary: "요약", sentiment_score: 7, sentiment_label: "긍정적" }, award: { is_award_related: "Y", award_name: "대상", award_reason: "" }, investment: { is_investment_related: "N", investment_name: "", investment_reason: "" } },
    ] };

    await runCompanyAnalysis({ company, userId: user.id, news: NEWS }, deps({ analyze: () => completes(awarded) }));

    const events = await listEvents({ year: 2025, companyId: company.id });
    expect(events.map((e) => [e.kind, e.trust]).sort()).toEqual([["award", "verified"], ["positive_press", "verified"]]);
  });

  it("records nothing when verification failed", async () => {
    const { company, user } = await seed();
    await runCompanyAnalysis({ company, userId: user.id, news: NEWS }, deps({ verify: async () => { throw new Error("judge down"); } }));

    expect(await listEvents({ year: 2025, companyId: company.id })).toEqual([]);
  });

  it("reports a judge that produced no verdict as a verification failure, not as a verdict", async () => {
    const { company, user } = await seed();
    const types: string[] = [];
    const outcome = await runCompanyAnalysis(
      { company, userId: user.id, news: NEWS },
      deps({
        verify: async () => ({ ...verification("failed"), faithfulness: null, detail: { layer1: { coverage: 1, cited: 1, total: 1, invalid: [] }, layer2: null, layer3: 0.6, error: "timeout" } }),
        onEvent: (event) => types.push(event.type),
      }),
    );

    expect(outcome).toMatchObject({ status: "verification_failed", message: "timeout" });
    expect(types).not.toContain("verified");
    expect(await listEvents({ year: 2025, companyId: company.id })).toEqual([]);
    expect((await findVerification(outcome.runId))?.status).toBe("failed");
  });

  it("keeps the run verified when event extraction fails after the verification is saved", async () => {
    const { company, user } = await seed();
    const types: string[] = [];

    const outcome = await runCompanyAnalysis(
      { company, userId: user.id, news: NEWS },
      deps({
        persistEvents: async () => { throw new Error("event extraction down"); },
        onEvent: (event) => types.push(event.type),
      }),
    );

    const run = await prisma.analysisRun.findUniqueOrThrow({ where: { id: outcome.runId }, include: { verification: true } });
    expect(run.verification?.status).toBe("verified");
    expect(outcome).toMatchObject({ status: "verified" });
    expect(types).toEqual(["progress", "complete", "verifying", "verified", "events_failed"]);
  });
});

describe("runCompanyAnalysis and silent LLM failures", () => {
  beforeEach(resetDatabase);

  it("closes the run as failed with the analyser's own message, not a generic one", async () => {
    const { company, user } = await seed();
    async function* onlyError(): AsyncGenerator<AnalyzeEvent> {
      yield { type: "error", message: "LLM 호출이 3건 모두 실패했습니다 — 401 invalid api key" };
    }

    const outcome = await runCompanyAnalysis(
      { company, userId: user.id, news: NEWS },
      deps({ analyze: () => onlyError() }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.message).toContain("401 invalid api key");
    const run = await prisma.analysisRun.findUnique({ where: { id: outcome.runId } });
    expect(run?.status).toBe("failed");
  });

  it("says on the row when part of the answer was a fallback", async () => {
    const { company, user } = await seed();

    const outcome = await runCompanyAnalysis(
      { company, userId: user.id, news: NEWS },
      deps({ analyze: () => completes(result({ fallbacks: 2 })) }),
    );

    expect(outcome.status).toBe("verified");
    expect(outcome.message).toContain("2건");
  });

  it("says nothing extra when every answer came from the model", async () => {
    const { company, user } = await seed();

    const outcome = await runCompanyAnalysis({ company, userId: user.id, news: NEWS }, deps());

    expect(outcome.message).toBeUndefined();
  });
});

describe("runCompanyAnalysis — 공식 원천 사실", () => {
  beforeEach(resetDatabase);

  it("loads the facts for the company and hands them to the analyser and the verifier", async () => {
    const { company, user } = await seed();
    let askedFor: number | null = null;
    let analyserGot: string[] | undefined;
    let verifierGot: string[] | undefined;

    await runCompanyAnalysis(
      { company, userId: user.id, news: NEWS },
      deps({
        loadFacts: async (companyId) => { askedFor = companyId; return ["국민연금 가입자 52명 — 국민연금"]; },
        analyze: (_name, _news, options) => { analyserGot = options.facts; return completes(result({ facts: options.facts })); },
        verify: async (res) => { verifierGot = res.facts; return verification("verified"); },
      }),
    );

    expect(askedFor).toBe(company.id);
    expect(analyserGot).toEqual(["국민연금 가입자 52명 — 국민연금"]);
    expect(verifierGot).toEqual(["국민연금 가입자 52명 — 국민연금"]);
  });

  it("still analyses when no fact loader is wired", async () => {
    const { company, user } = await seed();

    const outcome = await runCompanyAnalysis({ company, userId: user.id, news: NEWS }, deps());

    expect(outcome.status).toBe("verified");
  });
});
