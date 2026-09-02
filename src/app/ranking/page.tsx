import { listCompanies, listYears } from "@/lib/repositories/companyRepository";
import { listCompanyPipeline } from "@/lib/repositories/companyPipeline";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";
import { loadRubrics, rankCompanies, weightLabel } from "@/lib/services/benchmarking";
import { rollupVerdicts } from "@/lib/services/verdictRollup";
import { Panel } from "@/components/dashboard/panel";
import { ConfirmSelection } from "@/components/ranking/confirm-selection";
import { RankingTable, type RankingRow } from "@/components/ranking/ranking-table";
import { DownloadLink } from "@/components/ui/download-link";

export default async function RankingPage({ searchParams }: PageProps<"/ranking">) {
  const params = await searchParams;
  const years = await listYears();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) ? requested : (years[0] ?? new Date().getFullYear());

  const book = loadRubrics();
  const choices = [book.default, ...book.rubrics];
  const rubricParam = typeof params.rubric === "string" ? params.rubric : "default";
  const rubric = choices.find((entry) => entry.id === rubricParam) ?? book.default;
  const forced = rubric.id === "default" ? undefined : rubric.id;

  const companies = await listCompanies({ year });
  const registry = companies.map((company) => ({ id: company.id, name: company.name, businessNo: company.businessNo ?? null }));
  const verdicts = rollupVerdicts({
    companies: registry,
    verifications: await listLatestVerifications(year),
    pipeline: await listCompanyPipeline(year),
  });
  const verdictOf = new Map(verdicts.companies.map((entry) => [entry.companyId, entry.verdict]));
  const businessNoOf = new Map(registry.map((entry) => [entry.id, entry.businessNo]));

  const ranked = rankCompanies(await listBenchmarkInputs(year), book, forced);
  const rows: RankingRow[] = ranked.map((row) => ({
    ...row,
    verdict: verdictOf.get(row.companyId) ?? "pending",
    businessNo: businessNoOf.get(row.companyId) ?? null,
  }));
  const industries = [...new Set(rows.map((row) => row.industry).filter((value): value is string => value !== null))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
  const exportHref = `/api/companies/benchmark?year=${year}&rubric=${rubric.id}&format=xlsx`;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{year}년 우수기업 · 산업별 루브릭</span>
          <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">{year}년 벤치마킹</h1>
          <p className="text-[12.5px] text-muted-foreground">
            가중치 <b className="font-mono text-foreground">{weightLabel(rubric)}</b> · 산식 <span className="font-mono">{book.formulaVersion}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <nav aria-label="루브릭" className="flex">
            {choices.map((entry) => (
              <a
                key={entry.id}
                href={`/ranking?year=${year}&rubric=${entry.id}`}
                aria-current={entry.id === rubric.id ? "page" : undefined}
                className="-ml-px border-[1.5px] border-hairline px-3 py-1 text-[12px] font-bold text-muted-foreground first:ml-0 hover:bg-secondary aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-background"
              >
                {entry.name}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ConfirmSelection year={year} rubricId={rubric.id} count={rows.filter((row) => row.total !== null).length} formulaVersion={book.formulaVersion} />
            <DownloadLink
              href={exportHref}
              className="flex items-center border border-primary bg-primary px-3.5 py-2 text-[12.5px] font-bold text-primary-foreground hover:bg-primary/90"
            >
              엑셀 내보내기
            </DownloadLink>
          </div>
        </div>
      </header>

      <Panel index="01" title="랭킹" tag="실측" note="정규화 0~1 · 결측은 — · 리스크는 확인된 사건만 감점" empty="등록된 기업이 없습니다.">
        {rows.length === 0 ? null : <RankingTable rows={rows} industries={industries} />}
      </Panel>
    </div>
  );
}
