import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { listEvents } from "@/lib/repositories/eventRepository";
import { listNeighbours } from "@/lib/repositories/companyRepository";
import { countReviewCompanies } from "@/lib/repositories/pipelineRepo";
import { listPensionSeries } from "@/lib/repositories/pensionSnapshot";
import { listSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { parseId } from "@/lib/services/routeParams";
import { buildExplanation } from "@/lib/repositories/explainInputs";
import { buildReviewItems } from "@/lib/repositories/reviewItems";
import { ReviewBlock } from "@/components/company/review-block";
import { confirmEventsAction, decideDartAction, decideFscAction, decideNpsAction, holdNpsAction, reviewVerificationAction, saveAliasesAction, saveBusinessNoAction, undoVerificationReviewAction } from "@/app/(app)/companies/[id]/actions";
import { EditCompanyDialog } from "@/components/company/edit-company-dialog";
import { editCompanyAction, setCompanyActiveAction } from "@/app/(app)/companies/actions";
import { parseAliases } from "@/lib/services/collectForCompany";
import { buildDashboard } from "@/lib/services/dashboardSummary";
import { ContributionBars } from "@/components/company/contribution-bars";
import { OpinionCitations } from "@/components/company/opinion-citations";
import { VerificationPanel } from "@/components/company/verification-panel";
import { EventTimeline } from "@/components/company/event-timeline";
import { EvidenceStrip } from "@/components/company/evidence-grid";
import { FactsTable, FinanceTable, ProcurementTable, SourceDetails } from "@/components/company/company-facts";
import { buildCompanyFacts } from "@/lib/services/companyFacts";
import { RefreshSources } from "@/components/company/refresh-sources";
import { HeadcountInline } from "@/components/dashboard/headcount-trend";
import { Panel } from "@/components/dashboard/panel";
import { NeighbourNav, type Queue } from "@/components/company/neighbour-nav";
import { DetailToolbar } from "@/components/company/detail-toolbar";

function formatBusinessNo(businessNo: string | null) {
  if (!businessNo) return null;
  return `${businessNo.slice(0, 3)}-${businessNo.slice(3, 5)}-${businessNo.slice(5)}`;
}

function parseQueue(value: string | string[] | undefined): Queue | null {
  return value === "review" || value === "verification" ? value : null;
}

/**
 * 큐를 따라 열었으면 그 큐의 id 목록을 준다 — 이전·다음이 할 일 안에서만 움직이도록.
 */
async function queueIds(queue: Queue | null, year: number) {
  if (!queue) return undefined;
  const review = await countReviewCompanies(year);
  return queue === "review" ? review.ids : review.needsReviewIds;
}

export default async function CompanyDetailPage({ params, searchParams }: PageProps<"/companies/[id]">) {
  const companyId = parseId((await params).id);
  if (companyId === null) notFound();
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) notFound();

  const snapshots = await listSourceSnapshots(company.id);
  const series = await listPensionSeries(company.year);
  const summary = buildDashboard(series.filter((entry) => entry.companyId === company.id));
  const businessNo = formatBusinessNo(company.businessNo);
  const events = await listEvents({ year: company.year, companyId: company.id });
  const explanation = await buildExplanation(company.id);
  const review = await buildReviewItems(company.id);
  const facts = buildCompanyFacts({ businessNo: company.businessNo, snapshots });
  const queue = parseQueue((await searchParams).queue);
  const neighbours = await listNeighbours(company.id, await queueIds(queue, company.year));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <header className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            {company.year}년 평가
          </p>
          <div className="flex flex-wrap items-end gap-5">
            <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">{company.name}</h1>
            <HeadcountInline facet={summary.facets.find((facet) => facet.companyId === company.id) ?? summary.facets[0] ?? null} />
          </div>
        </header>

        <DetailToolbar
          nav={
            <>
              <NeighbourNav prev={neighbours.prev} next={neighbours.next} position={neighbours.position} total={neighbours.total} queue={queue} />
              <Link
                href={`/companies?year=${company.year}`}
                className="text-[12px] text-muted-foreground underline-offset-2 hover:underline"
              >
                목록으로
              </Link>
            </>
          }
          actions={
            <>
              <EditCompanyDialog
                company={{ id: company.id, year: company.year, name: company.name, industry: company.industry, businessNo: company.businessNo, aliases: parseAliases(company.aliases), isActive: company.isActive }}
                actions={{ edit: editCompanyAction, setActive: setCompanyActiveAction }}
              />
              <RefreshSources companyId={company.id} />
            </>
          }
        />

        <FactsTable facts={facts} businessNo={businessNo} industry={company.industry} />
      </div>

      {review ? (
        <ReviewBlock
          companyId={company.id}
          year={company.year}
          summary={review}
          actions={{
            decideNps: decideNpsAction,
            holdNps: holdNpsAction,
            decideDart: decideDartAction,
            decideFsc: decideFscAction,
            reviewVerification: reviewVerificationAction,
            confirmEvents: confirmEventsAction,
            saveAliases: saveAliasesAction,
            saveBusinessNo: saveBusinessNoAction,
          }}
        />
      ) : null}

      <Panel
        index="01"
        title="기여도 · 인용 근거"
        tag="분석 산출"
        aside={explanation ? <VerificationPanel layers={explanation.layers} runId={explanation.runId} undo={undoVerificationReviewAction} /> : null}
      >
        {explanation ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5 pt-3">
              <h3 className="text-[12px] font-bold">공식 원천 대조</h3>
              <EvidenceStrip snapshots={snapshots} />
              <SourceDetails details={facts.sourceDetails} />
            </div>
            <ContributionBars contributions={explanation.contributions} total={explanation.total} />
            <div className="grid gap-6 border-t border-hairline pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
              <div className="flex flex-col gap-2">
                <h3 className="border-b-2 border-ink pb-1 text-[10px] font-bold tracking-[0.1em] text-muted-foreground">종합의견</h3>
                {explanation.sentences.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">분석을 아직 실행하지 않았다</p>
                ) : (
                  <OpinionCitations sentences={explanation.sentences} />
                )}
              </div>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <h3 className="border-b-2 border-ink pb-1 text-[10px] font-bold tracking-[0.1em] text-muted-foreground">헤드라인</h3>
                  {explanation.evidence.headlines.length === 0 ? (
                    <span className="text-[12px] text-muted-foreground">없음</span>
                  ) : (
                    <ul className="flex flex-col">
                      {explanation.evidence.headlines.map((headline) => (
                        <li key={headline.link} className="flex items-baseline gap-2 border-b border-hairline py-1.5 text-[12px] last:border-0">
                          <a
                            href={headline.link}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 break-keep underline decoration-dotted underline-offset-2"
                          >
                            {headline.title}
                          </a>
                          <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                            {headline.sentiment > 0 ? "+" : ""}
                            {headline.sentiment}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="border-b-2 border-ink pb-1 text-[10px] font-bold tracking-[0.1em] text-muted-foreground">DART 재무</h3>
                  <FinanceTable facts={facts} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="border-b-2 border-ink pb-1 text-[10px] font-bold tracking-[0.1em] text-muted-foreground">조달 낙찰</h3>
                  <ProcurementTable facts={facts} />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel index="02" title="사건 이력" id="events" className="scroll-mt-20">
        <EventTimeline events={events} />
      </Panel>
    </div>
  );
}
