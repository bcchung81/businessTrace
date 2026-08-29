export type ImportRow = Array<string | number | null | undefined>;

export type ImportedCompany = {
  name: string;
  officialName: string;
  year: number;
  businessNo: string;
  industry: string | null;
  sector: string | null;
  ceoName: string | null;
};

export type ImportResult = {
  companies: ImportedCompany[];
  skipped: Array<{ name: string; reason: string }>;
};

const COLUMN = { year: 0, sector: 1, industry: 2, name: 3, ceo: 5, businessNo: 6 } as const;

/**
 * 상호에서 법인 형태 표기를 걷어내 검색·매칭용 이름을 만든다.
 * 뉴스 검색어이자 원천 매칭 키라 정식 상호가 아니라 통용 명칭이어야 한다. 내부 공백은 남긴다.
 */
export function searchName(official: string) {
  return (official ?? "")
    .replace(/^\s*(㈜|\(주\)|주식회사)\s*/, "")
    .replace(/\s*(㈜|\(주\)|주식회사)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cell(row: ImportRow, index: number) {
  const value = row[index];
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * 선정 명단 시트를 등록 가능한 기업 목록으로 바꾼다.
 * 사업자번호가 성립하지 않는 행은 조용히 버리지 않고 사유와 함께 남긴다.
 */
export function parseImportRows(rows: ImportRow[]): ImportResult {
  const companies: ImportedCompany[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    if (index === 0) continue;
    const official = cell(row, COLUMN.name);
    if (!official) continue;

    const businessNo = cell(row, COLUMN.businessNo).replace(/\D/g, "");
    if (businessNo.length !== 10) {
      skipped.push({ name: official, reason: "사업자번호가 10자리가 아닙니다." });
      continue;
    }
    if (seen.has(businessNo)) {
      skipped.push({ name: official, reason: "사업자번호가 중복입니다." });
      continue;
    }
    seen.add(businessNo);

    companies.push({
      name: searchName(official),
      officialName: official,
      year: Number(cell(row, COLUMN.year)),
      businessNo,
      industry: cell(row, COLUMN.industry) || null,
      sector: cell(row, COLUMN.sector) || null,
      ceoName: cell(row, COLUMN.ceo) || null,
    });
  }

  return { companies, skipped };
}
