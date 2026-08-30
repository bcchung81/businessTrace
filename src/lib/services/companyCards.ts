import type { EventRow } from "@/lib/repositories/eventRepository";
import type { CompanySeries } from "@/lib/services/dashboardSummary";
import { compareSeverity, type Severity, type Trust } from "@/lib/services/eventRules";
import type { CompanyNews } from "@/lib/services/newsCoverage";

export type CompanyCardData = {
  id: number; name: string; industry: string | null; businessNo: string | null;
  headcount: { latest: number | null; delta12m: number | null }; latestArticle: string | null;
  events30d: Record<Severity, number>; open: number; worstSeverity: Severity | null; trust: Trust;
};
export type CardSort = "triage" | "name" | "news";
export type CardFilter = { noticeOnly?: boolean; positiveOnly?: boolean; missingBusinessNo?: boolean };

function headcount(series: CompanySeries | undefined) {
  const measured = (series?.points ?? []).filter((p) => p.subscribers !== null);
  const latest = measured.at(-1);
  if (!latest) return { latest: null, delta12m: null };
  const yearAgo = measured.find((p) => p.ym === `${Number(latest.ym.slice(0, 4)) - 1}${latest.ym.slice(4)}`);
  const delta12m = yearAgo && yearAgo.subscribers ? Math.round(((latest.subscribers! - yearAgo.subscribers) / yearAgo.subscribers) * 100) / 100 : null;
  return { latest: latest.subscribers, delta12m };
}

/**
 * 기업 카드 한 장에 필요한 것을 모은다 — 최근 사건, 인원, 최근 보도, 최신 판정.
 */
export function buildCompanyCards(input: {
  companies: Array<{ id: number; name: string; industry: string | null; businessNo: string | null }>;
  events: EventRow[]; series: CompanySeries[]; news: CompanyNews[]; verdicts: Array<{ companyId: number; verdict: Trust }>;
}): CompanyCardData[] {
  const seriesById = new Map(input.series.map((s) => [s.companyId, s]));
  const newsById = new Map(input.news.map((n) => [n.companyId, n]));
  const trustById = new Map(input.verdicts.map((v) => [v.companyId, v.verdict]));

  return input.companies.map((company) => {
    const events = input.events.filter((e) => e.companyId === company.id);
    const events30d: Record<Severity, number> = { alert: 0, notice: 0, positive: 0, info: 0 };
    for (const e of events) events30d[e.severity] += 1;
    const worst = events.map((e) => e.severity).sort(compareSeverity)[0] ?? null;
    return {
      id: company.id, name: company.name, industry: company.industry, businessNo: company.businessNo,
      headcount: headcount(seriesById.get(company.id)), latestArticle: newsById.get(company.id)?.latest ?? null,
      events30d, open: events.filter((e) => e.status === "open").length, worstSeverity: worst, trust: trustById.get(company.id) ?? null,
    };
  });
}

/**
 * 봐야 할 순서(경보 → 미확인 많은 순 → 이름)·이름·최근 보도.
 */
export function sortCards(cards: CompanyCardData[], sort: CardSort): CompanyCardData[] {
  const rank = (s: Severity | null) => (s ? ["alert", "notice", "positive", "info"].indexOf(s) : 9);
  return [...cards].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ko");
    if (sort === "news") return (b.latestArticle ?? "").localeCompare(a.latestArticle ?? "") || a.name.localeCompare(b.name, "ko");
    return rank(a.worstSeverity) - rank(b.worstSeverity) || b.open - a.open || a.name.localeCompare(b.name, "ko");
  });
}

export function filterCards(cards: CompanyCardData[], filter: CardFilter): CompanyCardData[] {
  return cards.filter((c) =>
    (!filter.noticeOnly || c.events30d.alert + c.events30d.notice > 0) &&
    (!filter.positiveOnly || c.events30d.positive > 0) &&
    (!filter.missingBusinessNo || !c.businessNo),
  );
}
