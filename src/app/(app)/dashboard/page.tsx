import { listCompanies, listYears } from "@/lib/repositories/companyRepository";
import { listSelections } from "@/lib/repositories/selectionRecord";
import { periodEndYm } from "@/lib/services/periods";
import { compareRanks, fallingRanks } from "@/lib/services/rising";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";
import { RisingCompanies } from "@/components/dashboard/rising-companies";
import { listMentionArticles } from "@/lib/repositories/mentionArticles";
import { listCompanyPipeline } from "@/lib/repositories/companyPipeline";
import { latestEventAt, listEvents, summariseEvents } from "@/lib/repositories/eventRepository";
import { dashboardEvents } from "@/lib/services/eventRules";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { summariseRunActivity } from "@/lib/repositories/analysisRun";
import { summariseSourceFreshness } from "@/lib/repositories/sourceSnapshot";
import { buildRibbonGroups } from "@/lib/services/freshness";
import { countReviewCompanies, fullSourceRefreshAt, summariseCells, summariseCollection } from "@/lib/repositories/pipelineRepo";
import { buildPipelineFacts } from "@/lib/services/pipelineFacts";
import { PipelineBand } from "@/components/dashboard/pipeline-band";
import { CompanySearch } from "@/components/dashboard/company-search";
import { buildCoMentions } from "@/lib/services/coMention";
import { getDashboardSummary } from "@/lib/services/dashboardSummary";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { formatRunTime } from "@/lib/services/formatRunTime";
import { buildNewsCoverage, isStale } from "@/lib/services/newsCoverage";
import { rollupVerdicts } from "@/lib/services/verdictRollup";
import { CompanyChips } from "@/components/dashboard/company-chips";
import { EventTable } from "@/components/dashboard/event-table";
import { Panel } from "@/components/dashboard/panel";
import { Ribbon } from "@/components/ui/ribbon";

const DAY_MS = 86_400_000;

function currentYear() {
  return new Date().getFullYear();
}

function monthLabel(ym: string | undefined) {
  return ym ? `${ym.slice(0, 4)}-${ym.slice(4, 6)}` : "—";
}

/**
 * 사건을 기업 단위로 묶어 CompanyChips 에 줄 {id, name, count} 목록을 낸다.
 */
function tallyByCompany(events: EventRow[]): Array<{ id: number; name: string; count: number }> {
  const byId = new Map<number, { id: number; name: string; count: number }>();
  for (const event of events) {
    const entry = byId.get(event.companyId) ?? { id: event.companyId, name: event.companyName, count: 0 };
    entry.count += 1;
    byId.set(event.companyId, entry);
  }
  return [...byId.values()].sort((a, b) => b.count - a.count);
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const years = await listYears();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) ? requested : (years[0] ?? currentYear());
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since90 = new Date(now.getTime() - 90 * DAY_MS);

  const companies = await listCompanies({ year });
  const registry = companies.map((company) => ({ id: company.id, name: company.name, businessNo: company.businessNo ?? null }));
  const pipeline = await listCompanyPipeline(year);
  const summary = await getDashboardSummary(year);
  const verdicts = rollupVerdicts({ companies: registry, verifications: await listLatestVerifications(year), pipeline });
  const graph = buildCoMentions(await listMentionArticles(year), registry.map((company) => company.name));
  const news = buildNewsCoverage(registry, graph.articles, now);
  const activity = await summariseRunActivity(year);
  const sourceFreshness = await summariseSourceFreshness(year);

  const events = dashboardEvents(await listEvents({ year, since: since90 }));
  const eventSummary = await summariseEvents(year, since30);
  const lastEventAt = await latestEventAt(year);
  const events30 = events.filter((event) => Date.parse(event.occurredAt) >= since30.getTime());
  const silence = news.byCompany
    .filter((row) => isStale(row.latest, now))
    .map((row) => ({ companyId: row.companyId, companyName: row.name, latest: row.latest }));
  const watchlist = tallyByCompany(events30.filter((event) => event.severity === "alert" || event.severity === "notice"));
  const promoted = tallyByCompany(events30.filter((event) => event.severity === "positive"));

  const selections = await listSelections();
  const periods = [...new Set(selections.map((record) => record.period))].sort((a, b) => periodEndYm(a).localeCompare(periodEndYm(b)) || a.localeCompare(b));
  const basePeriod = periods.at(-1) ?? null;
  const liveRanked = rankCompanies(await listBenchmarkInputs(year), loadRubrics()).map((row) => ({ companyId: row.companyId, companyName: row.name, rank: row.rank, total: row.total ?? 0, metrics: row.metrics }));
  const baseline = basePeriod ? selections.filter((record) => record.period === basePeriod) : [];
  const rising = basePeriod ? compareRanks(liveRanked, baseline, 10) : [];
  const falling = basePeriod ? fallingRanks(liveRanked, baseline, 10) : [];

  const [collection, cells, fullRefreshAt, review] = await Promise.all([
    summariseCollection(year),
    summariseCells(year),
    fullSourceRefreshAt(year),
    countReviewCompanies(year),
  ]);
  const facts = buildPipelineFacts({
    companies: companies.length,
    articles: collection.articles,
    analysed: collection.analysed,
    noNews: collection.noNews,
    running: activity.running,
    counts: verdicts.counts,
    cells,
    staleNews: silence.length,
    reviewCompanies: review.companies,
  });
  const ribbon = buildRibbonGroups({
    now,
    latestNewsAt: activity.latestAt,
    fullSourceRefreshAt: fullRefreshAt,
    pensionYm: summary.months.at(-1),
    reviewCompanies: review.companies,
    openAlertNotice: review.openAlertNotice,
    needsReview: review.needsReview,
    reviewItems: review.items,
    needsReviewItems: review.items.filter((item) => review.needsReviewIds.includes(item.id)),
    openEvents: review.openEvents,
    year,
  });

  return (
    <div className="flex flex-col gap-12">
      <PipelineBand
        year={year}
        facts={facts}
        summary={
          <p className="text-[15px] font-medium leading-[1.35] text-band-foreground/78">
            최근 30일 · {companies.length}개사 중 <b className="font-black text-band-foreground">{eventSummary.companiesWithEvents}개사</b>에 사건 · 주의{" "}
            <b className="font-black text-review">{eventSummary.bySeverity.notice}</b> · 경보{" "}
            <b className="font-black text-risk">{eventSummary.bySeverity.alert}</b> · 홍보 후보{" "}
            <b className="font-black text-verified">{eventSummary.bySeverity.positive}</b> · 열린 사건{" "}
            <b className="font-black text-band-foreground">{eventSummary.open}</b>
          </p>
        }
        aside={<CompanySearch year={year} companies={registry} />}
      />

      <Ribbon groups={ribbon} year={year} className="-mt-12" />

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <Panel index="01" title="추이 상승 TOP 10" tag="실시간" tone="fresh" note="시상 후보 검토용">
          <RisingCompanies rows={rising} periodLabelText={null} />
        </Panel>
        <Panel index="02" title="추이 하락 TOP 10" tag="실시간" tone="review" note="리스크 검토용">
          <RisingCompanies rows={falling} periodLabelText={null} direction="down" />
        </Panel>
      </div>

      <Panel index="03" title="최근 이슈" tag="실측" empty="등록된 기업이 없습니다." className="scroll-mt-20" id="events">
        {companies.length === 0 ? null : <EventTable events={events} silence={silence} lastEventAt={lastEventAt} now={now} pageSize={5} />}
      </Panel>

      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <Panel index="04" title="주의 기업" tag="리스크">
          <CompanyChips items={watchlist} empty="주의 기업 없음" />
        </Panel>
        <Panel index="05" title="홍보 후보" tag="긍정">
          <CompanyChips items={promoted} empty="홍보 후보 없음" />
        </Panel>
      </div>

    </div>
  );
}
