import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCompanies, listCompanies, listYears } from "@/lib/repositories/companyRepository";
import { CompanyBulkForm } from "@/components/layout/company-bulk-form";
import { CompanyTable } from "@/components/layout/company-table";

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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">기업 관리</h1>
        <p className="text-sm text-muted-foreground">
          분석 대상 기업을 평가연도별로 등록합니다. {year}년 {companies.length}개사.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">일괄 등록</h2>
        <CompanyBulkForm year={year} action={register} notice={notice} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">등록된 기업</h2>
        <CompanyTable companies={companies} />
      </section>
    </main>
  );
}
