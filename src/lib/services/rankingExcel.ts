import ExcelJS from "exceljs";
import { METRIC_KEYS, METRIC_LABEL, type BenchmarkRow } from "@/lib/services/benchmarking";
import { fitColumns } from "@/lib/services/reportExcel";

const DASH = "—";

function verdictOf(row: BenchmarkRow): string {
  const verification = row.metrics.find((metric) => metric.key === "verification")?.raw;
  if (verification === null || verification === undefined) return "미분석";
  return verification === 1 ? "검증 통과" : "검토 필요";
}

function cell(value: number | null, digits = 2): string | number {
  return value === null ? DASH : Number(value.toFixed(digits));
}

/**
 * 랭킹 시트 하나짜리 워크북을 만든다. 첫 줄에 가중치와 산식 버전을 적는다 — 숫자만 있는 표는 근거자료가 아니다.
 */
export async function buildRankingWorkbook(input: {
  year: number;
  rows: BenchmarkRow[];
  weightLabel: string;
  formulaVersion: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("벤치마킹 랭킹");
  sheet.getCell("A1").value = `${input.year}년 벤치마킹 랭킹`;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = `가중치 ${input.weightLabel} · 산식 ${input.formulaVersion}`;
  sheet.getCell("A3").value = "정규화 0~1 · 결측은 — (가중치에서 제외) · 리스크는 확인된 사건만 감점";

  const header = sheet.getRow(4);
  header.values = ["순위", "기업", "판정", "총점", ...METRIC_KEYS.map((key) => METRIC_LABEL[key]), "리스크 감점", "산업", "루브릭"];
  header.font = { bold: true };

  for (const row of input.rows) {
    sheet.addRow([
      row.rank ?? DASH,
      row.name,
      verdictOf(row),
      cell(row.total, 3),
      ...row.metrics.map((metric) => cell(metric.normalised)),
      row.riskPenalty === 0 ? 0 : -Number(row.riskPenalty.toFixed(2)),
      row.industry ?? DASH,
      row.rubricName,
    ]);
  }
  fitColumns(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function rankingFileName(year: number): string {
  return `${year}년 벤치마킹 랭킹.xlsx`;
}
