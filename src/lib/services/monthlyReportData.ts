import { listCompanies } from "@/lib/repositories/companyRepository";
import { listEvents, summariseEvents, type EventRow } from "@/lib/repositories/eventRepository";
import { listMentionArticles } from "@/lib/repositories/mentionArticles";
import { listPensionSeries } from "@/lib/repositories/pensionSnapshot";
import { summariseRunActivity } from "@/lib/repositories/analysisRun";
import { summariseSourceFreshness } from "@/lib/repositories/sourceSnapshot";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { buildCoMentions } from "@/lib/services/coMention";
import { buildCompanyCards, type CompanyCardData } from "@/lib/services/companyCards";
import { getDashboardSummary } from "@/lib/services/dashboardSummary";
import type { FreshnessInput } from "@/lib/services/freshness";
import { buildNewsCoverage, isStale } from "@/lib/services/newsCoverage";

function monthRange(year: number, month: number) {
  const since = new Date(Date.UTC(year, month - 1, 1));
  const until = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { since, until };
}

/**
 * 월간 문서(Route Handler·CLI 스크립트)에 필요한 사건·카드·신선도를 DB 에서 모은다.
 * 대시보드·기업 페이지와 같은 조합 호출을 재사용한다.
 */
export async function loadMonthlyReportInput(
  year: number,
  month: number,
): Promise<{ events: EventRow[]; cards: CompanyCardData[]; freshness: FreshnessInput }> {
  const now = new Date();
  const { since, until } = monthRange(year, month);

  const companies = await listCompanies({ year });
  const events = await listEvents({ year, since, until });
  const series = await listPensionSeries(year);
  const graph = buildCoMentions(await listMentionArticles(year), companies.map((company) => company.name));
  const news = buildNewsCoverage(companies, graph.articles, now);
  const verdicts = (await listLatestVerifications(year)).map((row) => ({ companyId: row.companyId, verdict: row.status }));
  const cards = buildCompanyCards({ companies, events, series, news: news.byCompany, verdicts });

  const activity = await summariseRunActivity(year);
  const sourceFreshness = await summariseSourceFreshness(year);
  const eventSummary = await summariseEvents(year, since);
  const summary = await getDashboardSummary(year);
  const stale = news.byCompany.filter((row) => isStale(row.latest, now)).length;

  const freshness: FreshnessInput = {
    now,
    latestNewsAt: activity.latestAt,
    latestSourceAt: sourceFreshness.latestAt,
    sourcesUpdatedToday: sourceFreshness.updatedOnLatestDay,
    sourcesTotal: companies.length,
    pensionYm: summary.months.at(-1),
    running: activity.running,
    openEvents: eventSummary.open,
    stale,
  };

  return { events, cards, freshness };
}
