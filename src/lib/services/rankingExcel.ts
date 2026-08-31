import ExcelJS from "exceljs";
import { METRIC_KEYS, METRIC_LABEL, type BenchmarkRow } from "@/lib/services/benchmarking";
import { fitColumns } from "@/lib/services/reportExcel";
import { VERDICT_LABEL, type Verdict } from "@/lib/services/verdictRollup";

const DASH = "—";



function cell(value: number | null, digits = 2): string | number {
  return value === null ? DASH : Number(value.toFixed(digits));
}

/**
 * 랭킹 시트 하나짜리 워크북을 만든다. 첫 줄에 가중치와 산식 버전을 적는다 — 숫자만 있는 표는 근거자료가 아니다.
 * 판정은 화면과 같은 값을 받아 적는다 — 예전에는 검증 지표만 보고 따로 계산해, 동명 충돌 기업이 화면에선 리스크인데 엑셀에선 통과였다.
 */
export async function buildRankingWorkbook(input: {
  year: number;
  rows: BenchmarkRow[];
  /** 화면이 쓰는 판정 — 원천 충돌은 judge 판정을 덮으므로 검증 지표만 보면 엑셀이 다른 말을 한다. */
  verdicts: Map<number, Verdict>;
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
      VERDICT_LABEL[input.verdicts.get(row.companyId) ?? "pending"],
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
