import { config } from "dotenv";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { importCompanies } from "@/lib/repositories/companyImportRepository";
import { parseImportRows, type ImportRow } from "@/lib/services/companyImport";

config({ quiet: true });

/**
 * 선정 명단 엑셀을 읽어 기업 테이블에 반영한다.
 * 사용: npx tsx scripts/import-companies.ts <파일경로> [시트명]
 */
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("엑셀 파일 경로를 지정하세요.");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = process.argv[3] ? workbook.getWorksheet(process.argv[3]) : workbook.worksheets[0];
  if (!sheet) throw new Error("시트를 찾지 못했습니다.");

  const rows: ImportRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1);
    rows.push(
      values.map((value) => {
        if (value && typeof value === "object") {
          const rich = value as { text?: string; result?: unknown };
          return rich.text ?? String(rich.result ?? "");
        }
        return value as string | number | null;
      }),
    );
  });

  const { companies, skipped } = parseImportRows(rows);
  const result = await importCompanies(companies);

  console.log(`읽음 ${rows.length - 1}행 → 등록 ${result.created} · 갱신 ${result.updated}`);
  for (const entry of skipped) console.log(`  [SKIP] ${entry.name} — ${entry.reason}`);
  for (const company of companies.slice(0, 5)) {
    console.log(`  ${company.name} (${company.businessNo}) ${company.sector}/${company.industry}`);
  }
  if (companies.length > 5) console.log(`  … 외 ${companies.length - 5}개사`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
