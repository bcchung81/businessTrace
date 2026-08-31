import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";
import { loadRubrics, rankCompanies, weightLabel } from "@/lib/services/benchmarking";
import { buildRankingWorkbook, rankingFileName } from "@/lib/services/rankingExcel";

describe("ranking workbook", () => {
  test("writes the weight line, one row per company and — for missing metrics", async () => {
    const book = loadRubrics();
    const rows = rankCompanies(
      [
        { companyId: 1, name: "㈜가", industry: "SW", sentiment: 5, awards: 1, investments: 0, revenue: null, verification: "verified", confirmedRisks: 0 },
        { companyId: 2, name: "㈜나", industry: null, sentiment: null, awards: null, investments: null, revenue: null, verification: null, confirmedRisks: 0 },
      ],
      book,
    );
    const buffer = await buildRankingWorkbook({ year: 2026, rows, verdicts: new Map(), weightLabel: weightLabel(book.default), formulaVersion: book.formulaVersion });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("벤치마킹 랭킹")!;

    expect(String(sheet.getCell("A2").value)).toContain("감성 0.3 · 수상 0.2");
    expect(sheet.getRow(4).values).toEqual([undefined, "순위", "기업", "판정", "총점", "감성", "수상", "투자", "재무", "검증", "리스크 감점", "산업", "루브릭"]);
    expect(sheet.getCell("B5").value).toBe("㈜가");
    expect(sheet.getCell("H5").value).toBe("—");
    expect(sheet.getCell("A6").value).toBe("—");
    expect(sheet.getCell("D6").value).toBe("—");
  });

  test("prints the verdict the screen shows — a namesake conflict outranks the judge", async () => {
    const book = loadRubrics();
    const rows = rankCompanies(
      [
        { companyId: 1, name: "㈜충돌", industry: "SW", sentiment: 5, awards: 1, investments: 0, revenue: null, verification: "verified", confirmedRisks: 0 },
        { companyId: 2, name: "㈜통과", industry: "SW", sentiment: 9, awards: 3, investments: 1, revenue: null, verification: "verified", confirmedRisks: 0 },
      ],
      book,
    );
    const verdicts = new Map<number, "verified" | "review" | "risk" | "pending">([[1, "risk"], [2, "verified"]]);

    const buffer = await buildRankingWorkbook({ year: 2026, rows, verdicts, weightLabel: weightLabel(book.default), formulaVersion: book.formulaVersion });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("벤치마킹 랭킹")!;
    const byName = new Map(sheet.getRows(5, 2)!.map((row) => [row.getCell(2).value, row.getCell(3).value]));

    expect(byName.get("㈜충돌")).toBe("리스크");
    expect(byName.get("㈜통과")).toBe("통과");
  });

  test("names the file by year", () => {
    expect(rankingFileName(2026)).toBe("2026년 벤치마킹 랭킹.xlsx");
  });
});
