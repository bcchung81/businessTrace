import Link from "next/link";
import { listCompanies, listYears } from "@/lib/repositories/companyRepository";
import { listMentionArticles } from "@/lib/repositories/mentionArticles";
import { listCompanyPipeline } from "@/lib/repositories/companyPipeline";
import { latestEventAt, listEvents, summariseEvents } from "@/lib/repositories/eventRepository";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { summariseRunActivity } from "@/lib/repositories/analysisRun";
import { summariseSourceFreshness } from "@/lib/repositories/sourceSnapshot";
import { buildFreshnessItems } from "@/lib/services/freshness";
import { buildCoMentions } from "@/lib/services/coMention";
import { getDashboardSummary } from "@/lib/services/dashboardSummary";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { formatRunTime } from "@/lib/services/formatRunTime";
import { KST_OFFSET_MS } from "@/lib/services/kst";
import { buildMatrixRows } from "@/lib/services/matrixRows";
import { buildNewsCoverage, isStale } from "@/lib/services/newsCoverage";
import { rollupVerdicts } from "@/lib/services/verdictRollup";
import { CompanyChips } from "@/components/dashboard/company-chips";
import { CompanyPipelineGrid } from "@/components/dashboard/company-pipeline-grid";
import { EventTable } from "@/components/dashboard/event-table";
import { Panel } from "@/components/dashboard/panel";
import { VerdictBoard } from "@/components/dashboard/verdict-board";
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
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const thisMonth = { year: kstNow.getUTCFullYear(), month: kstNow.getUTCMonth() + 1 };
  const lastMonthDate = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() - 1, 1));
  const lastMonth = { year: lastMonthDate.getUTCFullYear(), month: lastMonthDate.getUTCMonth() + 1 };

  const companies = await listCompanies({ year });
  const registry = companies.map((company) => ({ id: company.id, name: company.name, businessNo: company.businessNo ?? null }));
  const pipeline = await listCompanyPipeline(year);
  const summary = await getDashboardSummary(year);
  const verdicts = rollupVerdicts({ companies: registry, verifications: await listLatestVerifications(year), pipeline });
  const graph = buildCoMentions(await listMentionArticles(year), registry.map((company) => company.name));
  const news = buildNewsCoverage(registry, graph.articles, now);
  const matrix = buildMatrixRows(pipeline, verdicts.companies, news.byCompany);
  const activity = await summariseRunActivity(year);
  const sourceFreshness = await summariseSourceFreshness(year);

  const events = await listEvents({ year, since: since90 });
  const eventSummary = await summariseEvents(year, since30);
  const lastEventAt = await latestEventAt(year);
  const events30 = events.filter((event) => Date.parse(event.occurredAt) >= since30.getTime());
  const silence = news.byCompany
    .filter((row) => isStale(row.latest, now))
    .map((row) => ({ companyId: row.companyId, companyName: row.name, latest: row.latest }));
  const watchlist = tallyByCompany(events30.filter((event) => event.severity === "alert" || event.severity === "notice"));
  const promoted = tallyByCompany(events30.filter((event) => event.severity === "positive"));
  const latestRun = verdicts.companies.map((entry) => entry.runAt).filter((value): value is string => value !== null).sort().at(-1) ?? null;

  const ribbon = buildFreshnessItems({
    now,
    latestNewsAt: activity.latestAt,
    latestSourceAt: sourceFreshness.latestAt,
    sourcesUpdatedToday: sourceFreshness.updatedOnLatestDay,
    sourcesTotal: companies.length,
    pensionYm: summary.months.at(-1),
    running: activity.running,
    openEvents: eventSummary.open,
    stale: silence.length,
  });

  return (
    <div className="flex flex-col gap-12">
      <div className="bg-band text-band-foreground">
        <header className="grid gap-10 px-6 pb-8 pt-8 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              {year}년 우수기업 · 지난 30일 동향
            </span>
            <h1 className="mb-3.5 mt-1.5 font-display text-[40px] md:text-[52px] font-black leading-[0.95] tracking-[-0.04em]">이달의 동향</h1>
            <p className="text-[17px] md:text-[20px] font-medium leading-[1.35] tracking-[-0.01em] text-band-foreground/78">
              {companies.length}개사 중 <b className="font-black text-band-foreground">{eventSummary.companiesWithEvents}개사</b>에 사건 · 주의{" "}
              <b className="font-black text-[#FFB454]">{eventSummary.bySeverity.notice}</b> · 경보{" "}
              <b className="font-black text-[#FF8080]">{eventSummary.bySeverity.alert}</b> · 홍보 후보{" "}
              <b className="font-black text-[#49E57D]">{eventSummary.bySeverity.positive}</b> · 미확인{" "}
              <b className="font-black text-band-foreground">{eventSummary.open}</b>
            </p>
          </div>
          <div className="flex flex-col gap-2 self-end">
            <dl className="flex justify-between border-t border-band-foreground/25 py-1.5 text-[12px]">
              <dt className="text-band-foreground/65">연금 스냅샷</dt>
              <dd className="font-bold tabular-nums">{monthLabel(summary.months.at(-1))}</dd>
            </dl>
            <dl className="flex justify-between border-t border-band-foreground/25 py-1.5 text-[12px]">
              <dt className="text-band-foreground/65">마지막 분석</dt>
              <dd className="font-bold tabular-nums">{formatRunTime(latestRun)}</dd>
            </dl>
            <details className="group relative">
              <summary className="flex cursor-pointer select-none items-center justify-center border border-band-foreground/40 px-3.5 py-2.5 text-[13px] font-bold">
                월간 문서 ▾
              </summary>
              <div className="absolute left-0 right-0 top-full z-10 mt-1 flex flex-col overflow-hidden border border-band-foreground/40 bg-band">
                <a
                  href={`/api/reports/monthly?cohort=${year}&year=${thisMonth.year}&month=${thisMonth.month}`}
                  className="px-3.5 py-2 text-[12px] hover:bg-band-foreground/10"
                >
                  이번 달
                </a>
                <a
                  href={`/api/reports/monthly?cohort=${year}&year=${lastMonth.year}&month=${lastMonth.month}`}
                  className="px-3.5 py-2 text-[12px] hover:bg-band-foreground/10"
                >
                  지난 달
                </a>
              </div>
            </details>
            {verdicts.counts.pending > 0 ? (
              <Link
                href={`/companies?year=${year}`}
                className="flex items-center justify-center border border-primary bg-primary px-3.5 py-2.5 text-[13px] font-bold text-primary-foreground hover:bg-primary/90"
              >
                미분석 {verdicts.counts.pending}개사 보기
              </Link>
            ) : null}
          </div>
        </header>
      </div>

      <Ribbon items={ribbon} className="-mt-12" />

      <Panel index="01" title="이달의 사건" tag="실측" empty="등록된 기업이 없습니다.">
        {companies.length === 0 ? null : <EventTable events={events} silence={silence} lastEventAt={lastEventAt} now={now} />}
      </Panel>

      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <Panel index="02" title="주의 기업" tag="리스크">
          <CompanyChips items={watchlist} empty="주의 기업 없음" />
        </Panel>
        <Panel index="03" title="홍보 후보" tag="긍정">
          <CompanyChips items={promoted} empty="홍보 후보 없음" />
        </Panel>
      </div>

      <Panel index="04" title="데이터 신선도" tag="분석 산출" tone="fresh">
        <details>
          <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[12px] font-semibold text-muted-foreground">
            판정 현황 · 기업별 근거 매트릭스 펼치기
          </summary>
          <div className="flex flex-col gap-5 border-t border-hairline p-3.5">
            <VerdictBoard counts={verdicts.counts} averageCitations={verdicts.averageCitations} />
            {matrix.length === 0 ? null : <CompanyPipelineGrid rows={matrix} now={now} />}
          </div>
        </details>
      </Panel>
    </div>
  );
}
