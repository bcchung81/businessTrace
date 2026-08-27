import { prisma } from "@/lib/db";
import type { AnalysisResult } from "@/lib/services/analyzer";
import type { NewsItem } from "@/lib/services/newsTypes";

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
