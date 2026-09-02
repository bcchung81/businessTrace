import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCompanies, listCompanies, listYears } from "@/lib/repositories/companyRepository";
import { listCompanyIdsWithEvents, listEvents } from "@/lib/repositories/eventRepository";
import { listMentionArticles } from "@/lib/repositories/mentionArticles";
import { listPensionSeries } from "@/lib/repositories/pensionSnapshot";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { buildCoMentions } from "@/lib/services/coMention";
import { buildCompanyCards } from "@/lib/services/companyCards";
import { parseRegisterLines } from "@/lib/services/companyImport";
import { countReviewCompanies } from "@/lib/repositories/pipelineRepo";
import { buildNewsCoverage } from "@/lib/services/newsCoverage";
import { hasBatchEvents, readBatch } from "@/lib/services/batchRegistry";
import { BatchRunner } from "@/components/analysis/batch-runner";
import { CompanyCardGrid } from "@/components/company/company-card-grid";
import { CompanyPipelineGrid } from "@/components/dashboard/company-pipeline-grid";
import { VerdictBoard } from "@/components/dashboard/verdict-board";
import { listCompanyPipeline } from "@/lib/repositories/companyPipeline";
import { buildMatrixRows } from "@/lib/services/matrixRows";
import { rollupVerdicts } from "@/lib/services/verdictRollup";
import { Panel } from "@/components/dashboard/panel";
import { RegisterDialog } from "@/components/company/register-dialog";

const DAY_MS = 86_400_000;

function currentYear() {
  return new Date().getFullYear();
}

export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  const params = await searchParams;
  const years = await listYears();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) ? requested : (years[0] ?? currentYear());
  const notice = typeof params.notice === "string" ? params.notice : undefined;
  const preselected = typeof params.run === "string" ? params.run.split(",").map(Number).filter(Number.isInteger) : [];
  const initialStage = params.stage === "news" || params.stage === "sources" ? params.stage : "full";
  const companies = await listCompanies({ year, includeInactive: true });
  const active = companies.filter((company) => company.isActive).length;

  const now = new Date();
  const activeCompanies = await listCompanies({ year });
  const events = await listEvents({ year, since: new Date(now.getTime() - 30 * DAY_MS) });
  const series = await listPensionSeries(year);
  const graph = buildCoMentions(await listMentionArticles(year), activeCompanies.map((company) => company.name));
  const news = buildNewsCoverage(activeCompanies, graph.articles, now);
  const verifications = await listLatestVerifications(year);
  const verdicts = verifications
    .filter((row) => row.status !== "failed")
    .map((row) => ({ companyId: row.companyId, verdict: row.status as "verified" | "needs_review" }));
  const pipeline = await listCompanyPipeline(year);
  const rollup = rollupVerdicts({ companies: activeCompanies.map((company) => ({ id: company.id, name: company.name, businessNo: company.businessNo ?? null })), verifications, pipeline });
  const matrix = buildMatrixRows(pipeline, rollup.companies, news.byCompany);
  const review = await countReviewCompanies(year);
  const cards = buildCompanyCards({ companies: activeCompanies, events, series, news: news.byCompany, verdicts, reviewIds: review.ids, everEventIds: await listCompanyIdsWithEvents(year) });
  const initialFilter = params.filter === "review" ? { reviewOnly: true } : {};
  const candidates = cards.map((card) => ({
    id: card.id,
    name: card.name,
    verified: card.trust !== null,
    hasWarning: card.events30d.notice + card.events30d.alert > 0,
    businessNo: card.businessNo,
  }));
  const batch = readBatch();
  const resume = batch !== null || hasBatchEvents();
  const runHref = preselected.length > 0 ? `/companies?year=${year}&run=${preselected.join(",")}#batch` : undefined;

  async function register(formData: FormData) {
    "use server";
    const targetYear = Number(formData.get("year"));
    const lines = String(formData.get("names") ?? "").split(/\r?\n/);
    const { entries, invalid } = parseRegisterLines(lines);
    const { created, skipped, createdIds } = await createCompanies({ year: targetYear, entries });

    const parts = [`${created}건 등록`];
    if (skipped.length) parts.push(`${skipped.length}건 중복 제외 (${skipped.join(", ")})`);
    if (invalid.length) parts.push(`${invalid.length}건 형식 오류 (${invalid.join(" · ")})`);
    const message = parts.join(", ");

    revalidatePath("/companies");
    const run = createdIds.length > 0 ? `&run=${createdIds.join(",")}` : "";
    redirect(`/companies?year=${targetYear}&notice=${encodeURIComponent(message)}${run}`);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            {year}년 평가
          </p>
          <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">기업</h1>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <dl className="flex items-end gap-6">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-muted-foreground">분석 대상</dt>
              <dd className="font-display text-[28px] font-black leading-none tracking-[-0.03em] tabular-nums">{active}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-muted-foreground">등록 전체</dt>
              <dd className="font-display text-[28px] font-black leading-none tracking-[-0.03em] tabular-nums text-muted-foreground">
                {companies.length}
              </dd>
            </div>
          </dl>
          <RegisterDialog year={year} companies={companies} action={register} notice={notice} runHref={runHref} />
        </div>
      </header>

      {years.length > 1 ? (
        <nav aria-label="평가연도" className="flex flex-wrap gap-1.5">
          {years.map((entry) => (
            <a
              key={entry}
              href={`/companies?year=${entry}`}
              aria-current={entry === year ? "page" : undefined}
              className="-ml-px border-[1.5px] border-hairline px-2.5 py-1 font-mono text-[12px] font-bold text-muted-foreground transition-colors first:ml-0 hover:bg-secondary aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-background"
            >
              {entry}
            </a>
          ))}
        </nav>
      ) : null}

      <Panel id="batch" index="01" title="일괄 분석 실행" tag="실측" className="scroll-mt-20" empty="등록된 기업이 없습니다.">
        {candidates.length === 0 ? null : (
          <details open={preselected.length > 0 || resume}>
            <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[12px] font-semibold text-muted-foreground">
              대상 선택 · 실행 펼치기
            </summary>
            <div className="border-t border-hairline p-3.5">
              <BatchRunner key={`${preselected.join(",")}-${initialStage}`} candidates={candidates} preselected={preselected} initialStage={initialStage} resume={resume} />
            </div>
          </details>
        )}
      </Panel>

      <Panel index="02" title="기업 목록" tag="실측">
        <CompanyCardGrid cards={cards} initialFilter={initialFilter} />
      </Panel>

      <Panel index="03" title="분석 현황" tag="분석 산출" tone="fresh">
        <details>
          <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[12px] font-semibold text-muted-foreground">
            판정 현황 · 기업별 근거 매트릭스 펼치기
          </summary>
          <div className="flex flex-col gap-5 border-t border-hairline p-3.5">
            <VerdictBoard counts={rollup.counts} averageCitations={rollup.averageCitations} />
            {matrix.length === 0 ? null : <CompanyPipelineGrid rows={matrix} now={now} />}
          </div>
        </details>
      </Panel>
    </div>
  );
}
