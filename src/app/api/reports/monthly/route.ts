import { z } from "zod";
import { auth } from "@/auth";
import { listYears } from "@/lib/repositories/companyRepository";
import { buildMonthlyWorkbook, monthlyReportFileName } from "@/lib/services/monthlyReport";
import { loadMonthlyReportInput } from "@/lib/services/monthlyReportData";

const querySchema = z.object({
  cohort: z.coerce.number().int().optional(),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
});

export async function GET(request: Request) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return Response.json({ message: "year·month 파라미터가 필요합니다." }, { status: 400 });

  const { year, month } = parsed.data;
  const cohortYear = parsed.data.cohort ?? (await listYears())[0] ?? year;
  const { events, cards, freshness } = await loadMonthlyReportInput({ cohortYear, year, month });
  const workbook = buildMonthlyWorkbook({ year, month, events, cards, freshness });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = monthlyReportFileName(year, month);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
