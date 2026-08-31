import { prisma } from "@/lib/db";
import type { AnalysisResult } from "@/lib/services/analyzer";
import type { NewsItem } from "@/lib/services/newsTypes";

/**
 * 분석 실행 기록을 running 상태로 연다.
 */
export async function createRun(input: {
  companyId: number;
  userId: number;
  model: string;
  news: NewsItem[];
  duplicatesRemoved?: number;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  return prisma.analysisRun.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      model: input.model,
      newsJson: JSON.stringify(input.news),
      duplicatesRemoved: input.duplicatesRemoved ?? 0,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
    },
  });
}

/**
 * 뉴스 수집만 한 실행을 collected 상태로 남긴다.
 * 뉴스 언급 집계는 LLM 이 필요 없다 - 수집만으로 채울 수 있는 것을 분석 비용에 묶지 않는다.
 */
export async function createCollectionRun(input: {
  companyId: number;
  userId: number;
  news: NewsItem[];
  duplicatesRemoved?: number;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  return prisma.analysisRun.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      model: "none",
      status: "collected",
      newsJson: JSON.stringify(input.news),
      duplicatesRemoved: input.duplicatesRemoved ?? 0,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
    },
  });
}

/**
 * 분석 결과와 토큰 사용량을 저장하고 실행을 닫는다.
 * 집계 대상이 0건이면 completed 가 아니라 no_news 다.
 */
export async function completeRun(id: number, result: AnalysisResult) {
  return prisma.analysisRun.update({
    where: { id },
    data: {
      status: result.stats.scoredNews === 0 ? "no_news" : "completed",
      resultJson: JSON.stringify(result),
      usageJson: JSON.stringify(result.usage),
      completedAt: new Date(),
    },
  });
}

/**
 * 실패 사유를 남기고 실행을 닫는다.
 */
export async function failRun(id: number, message: string) {
  return prisma.analysisRun.update({
    where: { id },
    data: {
      status: "failed",
      resultJson: JSON.stringify({ error: message }),
      completedAt: new Date(),
    },
  });
}

/**
 * 연도 기준 최신 실행 시각과 아직 도는 실행 수를 낸다.
 */
export async function summariseRunActivity(year: number) {
  const [latest, running] = await Promise.all([
    prisma.analysisRun.findFirst({
      where: { company: { year } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.analysisRun.count({ where: { status: "running", company: { year } } }),
  ]);
  return { latestAt: latest?.createdAt.toISOString() ?? null, running };
}

export type RunHistoryRow = {
  id: number;
  companyId: number;
  companyName: string;
  status: string;
  articleCount: number;
  verdict: "verified" | "needs_review" | "risk" | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  completedAt: string | null;
};

/**
 * 실행 이력을 최신순으로 낸다 — 기사 수는 newsJson 길이, 판정은 검증 결과에서 읽는다.
 */
export async function listRunHistory(input: { year: number; limit?: number }): Promise<RunHistoryRow[]> {
  const rows = await prisma.analysisRun.findMany({
    where: { company: { year: input.year, isActive: true } },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 100,
    include: { company: { select: { name: true } }, verification: { select: { status: true } } },
  });
  return rows.map((row) => {
    const news = JSON.parse(row.newsJson) as unknown[];
    const usage = row.usageJson ? (JSON.parse(row.usageJson) as { inputTokens?: number; outputTokens?: number }) : null;
    return {
      id: row.id,
      companyId: row.companyId,
      companyName: row.company.name,
      status: row.status,
      articleCount: Array.isArray(news) ? news.length : 0,
      verdict: (row.verification?.status as RunHistoryRow["verdict"]) ?? null,
      usage: usage ? { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 } : null,
      periodStart: row.periodStart?.toISOString() ?? null,
      periodEnd: row.periodEnd?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  });
}
