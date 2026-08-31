import { auth } from "@/auth";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";
import { listCompanies } from "@/lib/repositories/companyRepository";
import { listCompanyPipeline } from "@/lib/repositories/companyPipeline";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { rollupVerdicts } from "@/lib/services/verdictRollup";
import { loadRubrics, rankCompanies, weightLabel } from "@/lib/services/benchmarking";
import { buildRankingWorkbook, rankingFileName } from "@/lib/services/rankingExcel";
import { parseYear } from "@/lib/services/routeParams";

export async function GET(request: Request) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const year = parseYear(url.searchParams.get("year"));
  if (year === null) return Response.json({ message: "year 가 필요합니다." }, { status: 400 });

  const book = loadRubrics();
  const rubricId = url.searchParams.get("rubric") ?? undefined;
  const rubric = rubricId ? [book.default, ...book.rubrics].find((entry) => entry.id === rubricId) : book.default;
  if (!rubric) return Response.json({ message: "알 수 없는 루브릭입니다." }, { status: 400 });

  const rows = rankCompanies(await listBenchmarkInputs(year), book, rubricId);
  const label = weightLabel(rubric);

  if (url.searchParams.get("format") === "xlsx") {
    const rollup = rollupVerdicts({
      companies: (await listCompanies({ year })).map((company) => ({ id: company.id, name: company.name })),
      verifications: await listLatestVerifications(year),
      pipeline: await listCompanyPipeline(year),
    });
    const verdicts = new Map(rollup.companies.map((entry) => [entry.companyId, entry.verdict]));
    const buffer = await buildRankingWorkbook({ year, rows, verdicts, weightLabel: label, formulaVersion: book.formulaVersion });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(rankingFileName(year))}`,
      },
    });
  }

  return Response.json({ year, formulaVersion: book.formulaVersion, rubric: { id: rubric.id, name: rubric.name, weightLabel: label }, rows });
}
