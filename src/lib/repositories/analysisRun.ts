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
  periodStart?: Date;
  periodEnd?: Date;
}) {
  return prisma.analysisRun.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      model: input.model,
      newsJson: JSON.stringify(input.news),
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
