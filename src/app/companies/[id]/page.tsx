import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { listEvents } from "@/lib/repositories/eventRepository";
import { listPensionSeries } from "@/lib/repositories/pensionSnapshot";
import { listSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { buildDashboard } from "@/lib/services/dashboardSummary";
import { AnalysisRunner } from "@/components/analysis/analysis-runner";
import { EventTimeline } from "@/components/company/event-timeline";
import { EvidenceGrid } from "@/components/company/evidence-grid";
import { RefreshSources } from "@/components/company/refresh-sources";
import { HeadcountTrend } from "@/components/dashboard/headcount-trend";
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

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            {company.year}년 평가
          </p>
          <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">{company.name}</h1>
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

      <Panel title="사건 이력">
        <EventTimeline events={events} path={`/companies/${company.id}`} />
      </Panel>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold">공식 원천 대조</h2>
          <span className="text-[11px] text-muted-foreground">
            빈칸은 네 종류다 — 결측·측정 불가·충돌·미조회는 처방이 다르다
          </span>
        </div>
        <EvidenceGrid snapshots={snapshots} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold">뉴스 분석 실행</h2>
          <span className="text-[11px] text-muted-foreground">
            수집 → 분석 → 검증. 기사 결과는 도착하는 대로 쌓인다
          </span>
        </div>
        <AnalysisRunner companies={[{ id: company.id, name: company.name }]} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold">고용 규모 12개월</h2>
          <span className="text-[11px] text-muted-foreground">국민연금 가입 사업장 · 법인 단위 합산</span>
        </div>
        <HeadcountTrend facets={summary.facets} />
      </section>
    </div>
  );
}
