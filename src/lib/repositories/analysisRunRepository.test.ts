import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { completeRun, createRun, failRun } from "@/lib/repositories/analysisRun";
import type { AnalysisResult } from "@/lib/services/analyzer";

async function seed() {
  const company = await prisma.company.create({ data: { name: "넷록스", year: 2024 } });
  const user = await prisma.user.create({
    data: { email: "admin@kca.kr", passwordHash: "scrypt:32768:8:1$s$h" },
  });
  return { company, user };
}

function result(): AnalysisResult {
  return {
    companyName: "넷록스",
    model: "claude-sonnet-5",
    analyses: [],
    comprehensiveOpinion: "종합분석",
    stats: {
      totalNews: 3,
      scoredNews: 2,
      excludedNews: 1,
      averageSentiment: 6.5,
      positiveCount: 2,
      negativeCount: 0,
      neutralCount: 0,
      awardCount: 1,
      investmentCount: 0,
    },
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10 },
  fallbacks: 0,
  };
}

describe("analysis run repository", () => {
  beforeEach(resetDatabase);

  it("opens a run as running so an interrupted analysis is visible", async () => {
    const { company, user } = await seed();

    const run = await createRun({
      companyId: company.id,
      userId: user.id,
      model: "claude-sonnet-5",
      news: [],
    });

    expect(run.status).toBe("running");
    expect(run.completedAt).toBeNull();
  });

  it("stores the result and the token usage that produced it", async () => {
    const { company, user } = await seed();
    const run = await createRun({
      companyId: company.id,
      userId: user.id,
      model: "claude-sonnet-5",
      news: [],
    });

    const done = await completeRun(run.id, result());

    expect(done.status).toBe("completed");
    expect(done.completedAt).not.toBeNull();
    expect(JSON.parse(done.usageJson ?? "{}")).toMatchObject({ inputTokens: 100 });
    expect(JSON.parse(done.resultJson ?? "{}")).toMatchObject({ comprehensiveOpinion: "종합분석" });
  });

  it("marks a run with no usable articles as no_news rather than completed", async () => {
    const { company, user } = await seed();
    const run = await createRun({
      companyId: company.id,
      userId: user.id,
      model: "claude-sonnet-5",
      news: [],
    });

    const empty = result();
    empty.stats.scoredNews = 0;

    expect((await completeRun(run.id, empty)).status).toBe("no_news");
  });

  it("records why a run failed instead of leaving it running forever", async () => {
    const { company, user } = await seed();
    const run = await createRun({
      companyId: company.id,
      userId: user.id,
      model: "claude-sonnet-5",
      news: [],
    });

    const failed = await failRun(run.id, "네이버 API HUB 호출 한도를 초과했습니다.");

    expect(failed.status).toBe("failed");
    expect(failed.resultJson).toContain("한도를 초과");
    expect(failed.completedAt).not.toBeNull();
  });
});
