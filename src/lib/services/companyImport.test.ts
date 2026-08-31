import { describe, it, expect } from "vitest";
import { parseImportRows, parseRegisterLines, searchName } from "@/lib/services/companyImport";

const HEADER = ["선정년도", "구분", "분야", "기업명", "전담기관", "대표자", "사업자등록번호", "내역사업명", "성과정보"];

function row(over: Record<number, string> = {}) {
  const base = ["2025", "AI테크", "교육", "㈜동아사이언스", "NIA", "장경애", "1018162201", "사업", "성과"];
  for (const [index, value] of Object.entries(over)) base[Number(index)] = String(value);
  return base;
}

describe("searchName", () => {
  it("strips a corporate prefix so the name matches news and registries", () => {
    expect(searchName("㈜동아사이언스")).toBe("동아사이언스");
    expect(searchName("주식회사 트위그팜")).toBe("트위그팜");
  });

  it("strips a corporate suffix too", () => {
    expect(searchName("흥일기업(주)")).toBe("흥일기업");
    expect(searchName("다온플레이스㈜")).toBe("다온플레이스");
    expect(searchName("나이스지니데이타 주식회사")).toBe("나이스지니데이타");
  });

  it("keeps an inner space, because removing it breaks the news query", () => {
    expect(searchName("㈜코난 테크놀로지")).toBe("코난 테크놀로지");
  });

  it("leaves a name that carries no corporate form alone", () => {
    expect(searchName("아주대학교 산학협력단")).toBe("아주대학교 산학협력단");
  });
});

describe("parseRegisterLines", () => {
  it("reads a bare name, and a name with its business number after a comma or tab", () => {
    const { entries, invalid } = parseRegisterLines(["크립토랩", "올림플래닛, 120-88-24298", "넷록스\t6258700800", "  "]);

    expect(entries).toEqual([
      { name: "크립토랩", businessNo: null },
      { name: "올림플래닛", businessNo: "1208824298" },
      { name: "넷록스", businessNo: "6258700800" },
    ]);
    expect(invalid).toEqual([]);
  });

  it("treats a trailing ten-digit token as the number even with only spaces", () => {
    const { entries } = parseRegisterLines(["코난 테크놀로지 123-45-67890"]);

    expect(entries).toEqual([{ name: "코난 테크놀로지", businessNo: "1234567890" }]);
  });

  it("rejects a malformed number with the line instead of silently dropping it", () => {
    const { entries, invalid } = parseRegisterLines(["페어리, 12345"]);

    expect(entries).toEqual([]);
    expect(invalid).toEqual(["페어리 — 사업자번호가 10자리가 아닙니다"]);
  });

  it("keeps a name that merely contains digits as a name", () => {
    const { entries } = parseRegisterLines(["3D시스템즈"]);

    expect(entries).toEqual([{ name: "3D시스템즈", businessNo: null }]);
  });
});

describe("parseImportRows", () => {
  it("skips the header row and reads the companies below it", () => {
    const result = parseImportRows([HEADER, row()]);

    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]).toMatchObject({
      name: "동아사이언스",
      officialName: "㈜동아사이언스",
      year: 2025,
      businessNo: "1018162201",
      industry: "교육",
      sector: "AI테크",
      ceoName: "장경애",
    });
  });

  it("keeps only the digits of a formatted business number", () => {
    const result = parseImportRows([HEADER, row({ 6: "101-81-62201" })]);

    expect(result.companies[0].businessNo).toBe("1018162201");
  });

  it("skips a row whose business number is not ten digits and says which one", () => {
    const result = parseImportRows([HEADER, row({ 3: "㈜반쪽", 6: "12345" })]);

    expect(result.companies).toHaveLength(0);
    expect(result.skipped).toEqual([{ name: "㈜반쪽", reason: "사업자번호가 10자리가 아닙니다." }]);
  });

  it("keeps the first row when the same business number appears twice", () => {
    const result = parseImportRows([HEADER, row(), row({ 3: "㈜같은번호" })]);

    expect(result.companies).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ name: "㈜같은번호" });
  });

  it("ignores a blank row rather than importing an empty company", () => {
    const result = parseImportRows([HEADER, [], row()]);

    expect(result.companies).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });

  it("reads the evaluation year from the row, not from the clock", () => {
    const result = parseImportRows([HEADER, row({ 0: "2024" })]);

    expect(result.companies[0].year).toBe(2024);
  });
});
