import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { listYears } from "@/lib/repositories/companyRepository";
import { buildMonthlyWorkbook, monthlyReportFileName } from "@/lib/services/monthlyReport";
import { loadMonthlyReportInput } from "@/lib/services/monthlyReportData";

config({ quiet: true });

/**
 * 월간 동향 워크북을 data/ 에 저장한다. Route Handler 와 같은 빌더를 쓴다.
 * 사용: npx tsx scripts/monthly-report.ts YYYY-MM [cohortYear]
 */
async function main() {
  const arg = process.argv[2];
  const match = arg?.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error("사용법: npx tsx scripts/monthly-report.ts YYYY-MM [cohortYear]");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const cohortArg = Number(process.argv[3]);
  const cohortYear = Number.isInteger(cohortArg) ? cohortArg : ((await listYears())[0] ?? year);

  const { events, cards, freshness } = await loadMonthlyReportInput({ cohortYear, year, month });
  const workbook = buildMonthlyWorkbook({ year, month, events, cards, freshness });
  const buffer = await workbook.xlsx.writeBuffer();

  const dataDir = path.join(process.cwd(), "data");
  await mkdir(dataDir, { recursive: true });
  const filePath = path.join(dataDir, monthlyReportFileName(year, month));
  await writeFile(filePath, Buffer.from(buffer as ArrayBuffer));

  console.log(`[OK] ${filePath} (${events.length}건 사건 · ${cards.length}개사 · 코호트 ${cohortYear})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
