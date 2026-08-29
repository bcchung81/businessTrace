import Link from "next/link";
import { listCompanies, listYears } from "@/lib/repositories/companyRepository";
import { listMentionArticles } from "@/lib/repositories/mentionArticles";
import { listCompanyPipeline } from "@/lib/repositories/companyPipeline";
import { summariseSourceCoverage } from "@/lib/repositories/sourceSnapshot";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { summariseRunActivity } from "@/lib/repositories/analysisRun";
import { summariseSourceFreshness } from "@/lib/repositories/sourceSnapshot";
import { buildActionItems } from "@/lib/services/actionItems";
import { buildFreshnessItems } from "@/lib/services/freshness";
import { buildCoMentions } from "@/lib/services/coMention";
import { getDashboardSummary } from "@/lib/services/dashboardSummary";
import { formatRunTime } from "@/lib/services/formatRunTime";
import { buildMatrixRows } from "@/lib/services/matrixRows";
import { buildNewsCoverage } from "@/lib/services/newsCoverage";
import { rollupVerdicts } from "@/lib/services/verdictRollup";
import { ActionList } from "@/components/dashboard/action-list";
import { CompanyPipelineGrid } from "@/components/dashboard/company-pipeline-grid";
import { GateFunnel } from "@/components/dashboard/gate-funnel";
import { Panel } from "@/components/dashboard/panel";
import { RecentArticles } from "@/components/dashboard/recent-articles";
import { SourceCoverageBars } from "@/components/dashboard/source-coverage-bars";
import { VerdictBoard } from "@/components/dashboard/verdict-board";
import { Ribbon } from "@/components/ui/ribbon";

function currentYear() {
  return new Date().getFullYear();
}

function monthLabel(ym: string | undefined) {
  return ym ? `${ym.slice(0, 4)}-${ym.slice(4, 6)}` : "—";
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const years = await listYears();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) ? requested : (years[0] ?? currentYear());
  const now = new Date();

  const companies = await listCompanies({ year });
  const registry = companies.map((company) => ({ id: company.id, name: company.name, businessNo: company.businessNo ?? null }));
  const pipeline = await listCompanyPipeline(year);
  const coverage = await summariseSourceCoverage(year);
  const summary = await getDashboardSummary(year);
  const verdicts = rollupVerdicts({ companies: registry, verifications: await listLatestVerifications(year), pipeline });
  const graph = buildCoMentions(await listMentionArticles(year), registry.map((company) => company.name));
  const news = buildNewsCoverage(registry, graph.articles, now);
  const actions = buildActionItems({ companies: registry, pipeline, news, declining: summary.movers.declining, now });
  const matrix = buildMatrixRows(pipeline, verdicts.companies, news.byCompany);
  const activity = await summariseRunActivity(year);
  const sourceFreshness = await summariseSourceFreshness(year);
  const ribbon = buildFreshnessItems({
    now,
    latestNewsAt: activity.latestAt,
    latestSourceAt: sourceFreshness.latestAt,
    sourcesUpdatedToday: sourceFreshness.updatedOnLatestDay,
    sourcesTotal: companies.length,
    pensionYm: summary.months.at(-1),
    running: activity.running,
    todo: actions.reduce((sum, item) => sum + item.count, 0),
    stale: actions.find((item) => item.key === "stale")?.count ?? 0,
  });

  const needsHands = new Set([
    ...verdicts.companies.filter((entry) => entry.verdict === "risk").map((entry) => entry.companyId),
    ...registry.filter((company) => !company.businessNo).map((company) => company.id),
  ]).size;
  const latestRun = verdicts.companies.map((entry) => entry.runAt).filter((value): value is string => value !== null).sort().at(-1) ?? null;

  return (
    <div className="flex flex-col gap-9">
      <header className="flex flex-wrap items-end justify-between gap-6 pb-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {year}년 평가 · ICT기금사업 우수기업
          </span>
          <h1 className="text-[24px] font-extrabold leading-[1.15] tracking-[-0.035em]">선정 근거 준비 현황</h1>
          <p className="text-[11.5px] text-muted-foreground" title="손이 가야 하는 기업 = 리스크 판정 ∪ 사업자번호 미확보">
            {companies.length}개사 중 <b className="text-verified">{verdicts.counts.verified}개사</b>가 검증을 통과했고,{" "}
            <b className="text-risk">{needsHands}개사</b>는 오늘 손이 가야 합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <dl className="flex flex-col gap-0.5 rounded-lg border border-border bg-background px-3 py-2">
            <dt className="text-[10.5px] text-muted-foreground">연금 스냅샷</dt>
            <dd className="font-mono text-[13px] font-semibold tabular-nums">{monthLabel(summary.months.at(-1))}</dd>
          </dl>
          <dl className="flex flex-col gap-0.5 rounded-lg border border-border bg-background px-3 py-2">
            <dt className="text-[10.5px] text-muted-foreground">마지막 분석</dt>
            <dd className="font-mono text-[13px] font-semibold tabular-nums">{formatRunTime(latestRun)}</dd>
          </dl>
          {verdicts.counts.pending > 0 ? (
            <Link
              href={`/companies?year=${year}`}
              className="flex items-center rounded-lg bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              미분석 {verdicts.counts.pending}개사 보기
            </Link>
          ) : null}
        </div>
      </header>

      <Ribbon items={ribbon} />

      <Panel index="01" title="판정 현황" tag="분석 산출" tone="fresh" note="환각 검증 3게이트를 통과한 기업만 선정 근거로 쓸 수 있다">
        <VerdictBoard counts={verdicts.counts} averageCitations={verdicts.averageCitations} />
      </Panel>

      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <Panel index="02" title="검증 게이트 통과율" tag="분석 산출" tone="fresh">
          <GateFunnel gates={verdicts.gates} dropouts={verdicts.gateDropouts} />
        </Panel>
        <Panel index="03" title="원천 커버리지" tag="실측">
          <SourceCoverageBars coverage={coverage} />
        </Panel>
      </div>

      <Panel
        index="04"
        title="기업별 근거 매트릭스"
        tag="실측"
        note="봐야 할 순서로 정렬 — 리스크 · 검토 · 통과 · 미분석"
        empty="등록된 기업이 없습니다."
      >
        {matrix.length === 0 ? null : <CompanyPipelineGrid rows={matrix} now={now} />}
      </Panel>

      <div className="grid items-start gap-5 lg:grid-cols-[372px_minmax(0,1fr)]">
        <Panel index="05" title="조치 필요" tag="운영">
          <ActionList items={actions} />
        </Panel>
        <Panel
          index="06"
          title="최근 기사"
          tag="수집"
          className="lg:h-[26rem]"
          empty="수집된 기사가 없습니다."
          aside={
            <span className="text-[11px] text-muted-foreground">
              최근 14일 <b className="font-mono text-foreground tabular-nums">{news.recent14}</b>건 · 전체{" "}
              <b className="font-mono text-foreground tabular-nums">{news.total}</b>건
            </span>
          }
        >
          {graph.articles.length === 0 ? null : <RecentArticles articles={graph.articles} now={now} />}
        </Panel>
      </div>
    </div>
  );
}
