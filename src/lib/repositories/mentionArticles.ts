import { prisma } from "@/lib/db";
import type { MentionArticle } from "@/lib/services/coMention";

type StoredNews = {
  title?: string;
  content?: string;
  description?: string;
  link?: string;
  source?: string;
  published?: string;
};

function parse(raw: string): StoredNews[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredNews[]) : [];
  } catch {
    return [];
  }
}

/**
 * 해당 연도 기업별 최신 분석의 수집 기사를 동시언급 계산용으로 낸다.
 * 기업당 최신 실행 하나만 쓴다 - 재실행분까지 세면 같은 기사가 두 번 잡혀 언급 수가 부풀려진다.
 */
export async function listMentionArticles(year: number): Promise<MentionArticle[]> {
  const runs = await prisma.analysisRun.findMany({
    where: { company: { year } },
    orderBy: { createdAt: "desc" },
    include: { company: true },
  });

  const seen = new Set<number>();
  const articles: MentionArticle[] = [];

  for (const run of runs) {
    if (seen.has(run.companyId)) continue;
    seen.add(run.companyId);

    for (const news of parse(run.newsJson)) {
      if (!news.link) continue;
      articles.push({
        subject: run.company.name,
        title: news.title ?? "",
        content: news.content ?? news.description ?? "",
        link: news.link,
        source: news.source ?? "",
        published: news.published ?? "",
      });
    }
  }

  return articles;
}
