import type { MentionedArticle } from "@/lib/services/coMention";

export type CompanyNews = { companyId: number; name: string; articles: number; latest: string | null };
export type NewsCoverage = { byCompany: CompanyNews[]; recent14: number; total: number };

export const STALE_DAYS = 30;
const RECENT_DAYS = 14;
const DAY_MS = 86_400_000;

function stamp(published: string) {
  const time = Date.parse(published);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * 최신 보도가 30일을 넘겼거나 없으면 낡은 근거다.
 */
export function isStale(latest: string | null, now = new Date()) {
  if (!latest) return true;
  return now.getTime() - stamp(latest) > STALE_DAYS * DAY_MS;
}

/**
 * 등록 기업마다 기사 수와 최신 보도일을 세고, 최근 14일·전체 건수를 함께 낸다.
 * 기사 없는 기업도 행으로 남긴다 — 화면에서 빠지면 없는 줄 모른다.
 */
export function buildNewsCoverage(
  companies: Array<{ id: number; name: string }>,
  articles: MentionedArticle[],
  now = new Date(),
): NewsCoverage {
  const byName = new Map(companies.map((company) => [company.name, { companyId: company.id, name: company.name, articles: 0, latest: null as string | null }]));

  for (const article of articles) {
    for (const name of article.companies) {
      const row = byName.get(name);
      if (!row) continue;
      row.articles += 1;
      if (row.latest === null || stamp(article.published) > stamp(row.latest)) row.latest = article.published;
    }
  }

  const cutoff = now.getTime() - RECENT_DAYS * DAY_MS;

  return {
    byCompany: [...byName.values()],
    recent14: articles.filter((article) => stamp(article.published) >= cutoff).length,
    total: articles.length,
  };
}
