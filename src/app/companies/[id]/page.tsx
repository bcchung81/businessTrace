import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { listEvents } from "@/lib/repositories/eventRepository";
import { listPensionSeries } from "@/lib/repositories/pensionSnapshot";
import { listSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { buildExplanation } from "@/lib/repositories/explainInputs";
import { buildReviewItems } from "@/lib/repositories/reviewItems";
import { ReviewBlock } from "@/components/company/review-block";
import { confirmEventsAction, decideDartAction, decideNpsAction, holdNpsAction, reviewVerificationAction, saveAliasesAction, saveBusinessNoAction } from "@/app/companies/[id]/actions";
import { buildDashboard } from "@/lib/services/dashboardSummary";
import { ContributionBars } from "@/components/company/contribution-bars";
import { OpinionCitations } from "@/components/company/opinion-citations";
import { VerificationPanel } from "@/components/company/verification-panel";
import { EventTimeline } from "@/components/company/event-timeline";
import { EvidenceStrip } from "@/components/company/evidence-grid";
import { RefreshSources } from "@/components/company/refresh-sources";
import { HeadcountInline } from "@/components/dashboard/headcount-trend";
import { Panel } from "@/components/dashboard/panel";

function formatBusinessNo(businessNo: string | null) {
  if (!businessNo) return null;
  return `${businessNo.slice(0, 3)}-${businessNo.slice(3, 5)}-${businessNo.slice(5)}`;
}

export default async function CompanyDetailPage({ params }: PageProps<"/companies/[id]">) {
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id: Number(id) } });
  if (!company) notFound();

  const snapshots = await listSourceSnapshots(company.id);
  const series = await listPensionSeries(company.year);
  const summary = buildDashboard(series.filter((entry) => entry.companyId === company.id));
  const businessNo = formatBusinessNo(company.businessNo);
  const events = await listEvents({ year: company.year, companyId: company.id });
  const explanation = await buildExplanation(company.id);
  const review = await buildReviewItems(company.id);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            {company.year}년 평가
          </p>
          <div className="flex flex-wrap items-end gap-5">
            <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">{company.name}</h1>
            <HeadcountInline facet={summary.facets.find((facet) => facet.companyId === company.id) ?? summary.facets[0] ?? null} />
          </div>
          <p className="text-[12px] text-muted-foreground">
            {businessNo ? (
              <span className="font-mono">{businessNo}</span>
            ) : (
              <span className="font-medium text-review">
                사업자번호 미확보 — 뉴스 외 근거를 붙일 수 없습니다
              </span>
            )}
            {company.industry ? <span> · {company.industry}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/companies?year=${company.year}`}
            className="text-[12px] text-muted-foreground underline-offset-2 hover:underline"
          >
            목록으로
          </Link>
          <RefreshSources companyId={company.id} />
        </div>
      </header>

      {review ? (
        <ReviewBlock
          companyId={company.id}
          year={company.year}
          summary={review}
          actions={{
            decideNps: decideNpsAction,
            holdNps: holdNpsAction,
            decideDart: decideDartAction,
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
        note="감점 전 점수를 100% 로 나눈 몫 · 문장에 올리면 일치 기사 단락"
        aside={explanation ? <VerificationPanel layers={explanation.layers} /> : null}
      >
        {explanation ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5 pt-3">
              <h3 className="text-[12px] font-bold">공식 원천 대조</h3>
              <EvidenceStrip snapshots={snapshots} />
            </div>
            <ContributionBars contributions={explanation.contributions} total={explanation.total} />
            <div className="grid gap-5 border-t border-hairline pt-4 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex flex-col gap-2">
                <h3 className="text-[12px] font-bold">종합의견</h3>
                {explanation.sentences.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">분석을 아직 실행하지 않았다</p>
                ) : (
                  <OpinionCitations sentences={explanation.sentences} />
                )}
              </div>
              <dl className="flex flex-col gap-2 text-[12px]">
                <dt className="font-bold">헤드라인</dt>
                <dd>
                  {explanation.evidence.headlines.length === 0 ? (
                    <span className="text-muted-foreground">없음</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {explanation.evidence.headlines.map((headline) => (
                        <li key={headline.link}>
                          <a href={headline.link} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
                            {headline.title}
                          </a>{" "}
                          <span className="font-mono text-[10.5px] text-muted-foreground">
                            {headline.sentiment > 0 ? "+" : ""}
                            {headline.sentiment}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
                <dt className="font-bold">DART 재무</dt>
                <dd className="font-mono tabular-nums">
                  {explanation.evidence.finance
                    ? `${explanation.evidence.finance.fiscalYear} 매출 ${explanation.evidence.finance.revenue ?? "—"} · 영업이익 ${explanation.evidence.finance.operatingIncome ?? "—"} · 순이익 ${explanation.evidence.finance.netIncome ?? "—"}`
                    : <span className="hatch px-2 font-sans text-muted-foreground">미공시</span>}
                </dd>
              </dl>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel index="02" title="사건 이력" note="원천·분석에서 추출한 기록 · 최신순">
        <EventTimeline events={events} />
      </Panel>
    </div>
  );
}
