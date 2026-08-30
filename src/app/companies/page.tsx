import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCompanies, listCompanies, listYears } from "@/lib/repositories/companyRepository";
import { listEvents } from "@/lib/repositories/eventRepository";
import { listMentionArticles } from "@/lib/repositories/mentionArticles";
import { listPensionSeries } from "@/lib/repositories/pensionSnapshot";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { buildCoMentions } from "@/lib/services/coMention";
import { buildCompanyCards } from "@/lib/services/companyCards";
import { buildNewsCoverage } from "@/lib/services/newsCoverage";
import { CompanyCardGrid } from "@/components/company/company-card-grid";
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
  const companies = await listCompanies({ year, includeInactive: true });
  const active = companies.filter((company) => company.isActive).length;

  const now = new Date();
  const activeCompanies = await listCompanies({ year });
  const events = await listEvents({ year, since: new Date(now.getTime() - 30 * DAY_MS) });
  const series = await listPensionSeries(year);
  const graph = buildCoMentions(await listMentionArticles(year), activeCompanies.map((company) => company.name));
  const news = buildNewsCoverage(activeCompanies, graph.articles, now);
  const verdicts = (await listLatestVerifications(year)).map((row) => ({ companyId: row.companyId, verdict: row.status }));
  const cards = buildCompanyCards({ companies: activeCompanies, events, series, news: news.byCompany, verdicts });

  async function register(formData: FormData) {
    "use server";
    const targetYear = Number(formData.get("year"));
    const names = String(formData.get("names") ?? "").split(/\r?\n/);
    const { created, skipped } = await createCompanies({ year: targetYear, names });

    const message = skipped.length
      ? `${created}건 등록, ${skipped.length}건 중복 제외 (${skipped.join(", ")})`
      : `${created}건 등록`;

    revalidatePath("/companies");
    redirect(`/companies?year=${targetYear}&notice=${encodeURIComponent(message)}`);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {year}년 평가
          </p>
          <h1 className="text-[24px] font-bold tracking-[-0.03em]">기업</h1>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <dl className="flex items-end gap-6">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-muted-foreground">분석 대상</dt>
              <dd className="font-mono text-[20px] font-semibold leading-none">{active}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-muted-foreground">등록 전체</dt>
              <dd className="font-mono text-[20px] font-semibold leading-none text-muted-foreground">
                {companies.length}
              </dd>
            </div>
          </dl>
          <RegisterDialog year={year} companies={companies} action={register} notice={notice} />
        </div>
      </header>

      {years.length > 1 ? (
        <nav aria-label="평가연도" className="flex flex-wrap gap-1.5">
          {years.map((entry) => (
            <a
              key={entry}
              href={`/companies?year=${entry}`}
              aria-current={entry === year ? "page" : undefined}
              className="rounded-md border border-border px-2.5 py-1 font-mono text-[12px] text-muted-foreground transition-colors hover:bg-surface aria-[current=page]:border-primary aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
            >
              {entry}
            </a>
          ))}
        </nav>
      ) : null}

      <CompanyCardGrid cards={cards} />
    </div>
  );
}
