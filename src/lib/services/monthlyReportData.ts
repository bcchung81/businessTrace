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

export const KST_OFFSET_MS = 9 * 3_600_000;

/**
 * 달력월(KST)의 시작·끝을 UTC 로 낸다. occurredAt 은 UTC 로 저장되므로 KST 자정 경계를 직접 보정해야 한다.
 */
export function monthRange(year: number, month: number): { since: Date; until: Date } {
  const kstSinceWall = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  const kstUntilWall = Date.UTC(year, month, 1, 0, 0, 0, 0) - 1;
  return {
    since: new Date(kstSinceWall - KST_OFFSET_MS),
    until: new Date(kstUntilWall - KST_OFFSET_MS),
  };
}

/**
 * 월간 문서(Route Handler·CLI 스크립트)에 필요한 사건·카드·신선도를 DB 에서 모은다.
 * `cohortYear` 는 기업이 속한 평가연도(Company.year), `year`/`month` 는 사건을 볼 달력월이다 — 둘은 별개다.
 */
export async function loadMonthlyReportInput(input: {
  cohortYear: number;
  year: number;
  month: number;
}): Promise<{ events: EventRow[]; cards: CompanyCardData[]; freshness: FreshnessInput }> {
  const { cohortYear, year, month } = input;
  const now = new Date();
  const { since, until } = monthRange(year, month);

  const companies = await listCompanies({ year: cohortYear });
  const events = await listEvents({ year: cohortYear, since, until });
  const series = await listPensionSeries(cohortYear);
  const graph = buildCoMentions(await listMentionArticles(cohortYear), companies.map((company) => company.name));
  const news = buildNewsCoverage(companies, graph.articles, now);
  const verdicts = (await listLatestVerifications(cohortYear)).map((row) => ({ companyId: row.companyId, verdict: row.status }));
  const cards = buildCompanyCards({ companies, events, series, news: news.byCompany, verdicts });

  const activity = await summariseRunActivity(cohortYear);
  const sourceFreshness = await summariseSourceFreshness(cohortYear);
  const eventSummary = await summariseEvents(cohortYear, since);
  const summary = await getDashboardSummary(cohortYear);
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
