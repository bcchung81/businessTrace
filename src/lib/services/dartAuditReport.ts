import { unzipSync } from "fflate";
import type { DartDeps, FinancialFigures } from "@/lib/services/dart";

const LIST_URL = "https://opendart.fss.or.kr/api/list.json";
const DOCUMENT_URL = "https://opendart.fss.or.kr/api/document.xml";
const REQUEST_TIMEOUT_MS = 15000;

export type AuditFinancials = FinancialFigures & { previous: FinancialFigures };

const ACCOUNTS: Array<{ field: keyof FinancialFigures; names: string[] }> = [
  { field: "revenue", names: ["매출액", "매출", "영업수익"] },
  { field: "operatingIncome", names: ["영업이익", "영업손실", "영업이익(손실)", "영업손익"] },
  { field: "netIncome", names: ["당기순이익", "당기순손실", "당기순이익(손실)", "당기순손익"] },
  { field: "totalAssets", names: ["자산총계"] },
];

function requireApiKey() {
  const key = process.env.DART_API_KEY;
  if (!key) throw new Error("DART_API_KEY 가 설정되지 않았습니다.");
  return key;
}

/**
 * 금액 셀 하나를 숫자로 읽는다 — 쉼표 제거, 괄호는 음수, '-'와 빈칸은 null.
 */
function parseAmountCell(raw: string, unit: number): number | null {
  const text = raw.replace(/<[^>]*>/g, "").trim();
  if (!text || text === "-") return null;
  const negative = /^\(.*\)$/.test(text);
  const digits = text.replace(/[(),\s]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  return (negative ? -1 : 1) * Number(digits) * unit;
}

type AccountRow = { name: string; current: number | null; previous: number | null };

/**
 * 계정명을 대조 가능한 형태로 줄인다 — 태그·공백·주석 참조·선행 번호를 걷어낸다.
 */
function normaliseName(raw: string) {
  return raw.replace(/<[^>]*>/g, "").replace(/\s+/g, "").replace(/\(주석?[0-9,.\s]*\)/g, "").replace(/^[^가-힣]+/, "");
}

/**
 * 테이블 앞 본문의 "(단위 : 천원)" 류 표기에서 배수를 읽는다.
 */
function textualUnit(before: string): number {
  const match = [...before.matchAll(/\(\s*단위\s*[:：]\s*([^)]+)\)/g)].at(-1);
  if (!match) return 1;
  const label = match[1].replace(/\s+/g, "");
  if (label.includes("백만")) return 1_000_000;
  if (label.includes("천")) return 1_000;
  return 1;
}

/**
 * FINANCE 테이블 하나를 계정 행으로 편다. 당기는 ADELIM 1→2, 전기는 3→4 순으로 첫 값을 취한다.
 */
function rowsOf(tableXml: string, unit: number): AccountRow[] {
  const rows: AccountRow[] = [];
  for (const tr of tableXml.match(/<TR[\s\S]*?<\/TR>/g) ?? []) {
    const cells = new Map<string, string>();
    for (const match of tr.matchAll(/<TE[^>]*ADELIM="(\d+)"[^>]*>([\s\S]*?)<\/TE>/g)) {
      if (!cells.has(match[1])) cells.set(match[1], match[2]);
    }
    const name = normaliseName(cells.get("0") ?? "");
    if (!name) continue;
    const pick = (a: string, b: string) => parseAmountCell(cells.get(a) ?? "", unit) ?? parseAmountCell(cells.get(b) ?? "", unit);
    rows.push({ name, current: pick("1", "2"), previous: pick("3", "4") });
  }
  return rows;
}

/**
 * ADELIM 없는 일반 TD 테이블을 계정 행으로 편다.
 * 마지막 두 숫자 셀이 당기·전기다 — 앞쪽 숫자 셀은 주석 참조 번호일 수 있다.
 */
function tdRowsOf(tableXml: string, unit: number): AccountRow[] {
  const rows: AccountRow[] = [];
  for (const tr of tableXml.match(/<TR[\s\S]*?<\/TR>/g) ?? []) {
    const cells = [...tr.matchAll(/<TD[^>]*>([\s\S]*?)<\/TD>/g)].map((match) => match[1]);
    if (cells.length < 2) continue;
    const name = normaliseName(cells[0]);
    if (!name) continue;
    const numbers = cells.slice(1).map((cell) => parseAmountCell(cell, unit)).filter((value): value is number => value !== null);
    const current = numbers.length >= 2 ? numbers[numbers.length - 2] : (numbers[0] ?? null);
    const previous = numbers.length >= 2 ? numbers[numbers.length - 1] : null;
    rows.push({ name, current, previous });
  }
  return rows;
}

const STATEMENT_HINTS = new Set([
  ...ACCOUNTS.flatMap((entry) => entry.names),
  "부채총계", "자본총계", "유동자산", "매출총이익", "매출총손실", "법인세비용차감전순이익", "법인세비용차감전순손실",
]);

/**
 * 재무제표 본문 표인지 가른다 — 목차·주석은 계정을 한 번 스치듯 언급할 뿐이다.
 */
function looksLikeStatement(rows: AccountRow[]): boolean {
  return new Set(rows.filter((row) => STATEMENT_HINTS.has(row.name)).map((row) => row.name)).size >= 2;
}

function isLossAccount(name: string) {
  return name.includes("손실") && !name.includes("이익");
}

/**
 * 감사보고서 원문 XML 에서 매출·영업이익·순이익·자산총계와 전기값을 뽑는다. 계정마다 문서 순서상 첫 등장을 취한다
 * — 재무상태표·손익계산서가 자본변동표보다 앞서므로, 자본변동표의 당기순손실 재등장은 자연히 무시된다.
 */
export function parseAuditReportFinancials(xml: string): AuditFinancials | null {
  const financeTables = [...xml.matchAll(/<TABLE[^>]*ACLASS="FINANCE"[\s\S]*?<\/TABLE>/g)];
  const useDelim = financeTables.length > 0;
  const tables = useDelim ? financeTables : [...xml.matchAll(/<TABLE[\s\S]*?<\/TABLE>/g)];

  const result: AuditFinancials = {
    revenue: null, operatingIncome: null, netIncome: null, totalAssets: null,
    previous: { revenue: null, operatingIncome: null, netIncome: null, totalAssets: null },
  };
  let found = false;

  for (const table of tables) {
    const before = xml.slice(0, table.index);
    const unitMatch = useDelim ? [...before.matchAll(/AUNITVALUE="(\d+)"/g)].at(-1) : undefined;
    const unit = unitMatch ? Number(unitMatch[1]) : textualUnit(before);
    const rows = useDelim ? rowsOf(table[0], unit) : tdRowsOf(table[0], unit);
    if (!useDelim && !looksLikeStatement(rows)) continue;
    for (const row of rows) {
      const account = ACCOUNTS.find((entry) => entry.names.includes(row.name));
      if (!account || result[account.field] !== null) continue;
      if (row.current === null && row.previous === null) continue;
      const loss = isLossAccount(row.name);
      const signed = (value: number | null) => (value === null ? null : loss ? -Math.abs(value) : value);
      result[account.field] = signed(row.current);
      result.previous[account.field] = signed(row.previous);
      found = true;
    }
  }
  return found ? result : null;
}

type ListRow = { rcept_no?: string; report_nm?: string };

/**
 * 해당 결산연도의 감사보고서 접수번호를 찾는다. 별도를 연결보다 우선한다 — 기존 재무 API 값과 기준을 맞추기 위해서다.
 */
async function findAuditReport(corpCode: string, fiscalYear: number, fetchImpl: typeof fetch): Promise<string | null> {
  const url = new URL(LIST_URL);
  url.searchParams.set("crtfc_key", requireApiKey());
  url.searchParams.set("corp_code", corpCode);
  url.searchParams.set("bgn_de", `${fiscalYear}0101`);
  url.searchParams.set("end_de", `${fiscalYear + 1}1231`);
  url.searchParams.set("page_count", "100");

  const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) return null;
  const body = (await response.json()) as { status?: string; list?: ListRow[] };
  if (body.status !== "000") return null;

  const rows = (body.list ?? []).filter(
    (row) => row.rcept_no && row.report_nm?.includes("감사보고서") && row.report_nm.includes(`(${fiscalYear}.`),
  );
  const standalone = rows.find((row) => !(row.report_nm ?? "").includes("연결"));
  return (standalone ?? rows[0])?.rcept_no ?? null;
}

/**
 * 정기보고서가 없는 외감 기업의 재무를 감사보고서 원문(document.xml zip)에서 추출한다.
 * 어느 단계든 실패하면 null — 폴백이므로 조용히 물러나고 원래의 미공시 판정을 남긴다.
 */
export async function getAuditReportFinancials(
  corpCode: string,
  fiscalYear: number,
  deps: DartDeps = {},
): Promise<(AuditFinancials & { rceptNo: string }) | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const rceptNo = await findAuditReport(corpCode, fiscalYear, fetchImpl);
  if (!rceptNo) return null;

  const url = new URL(DOCUMENT_URL);
  url.searchParams.set("crtfc_key", requireApiKey());
  url.searchParams.set("rcept_no", rceptNo);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) return null;

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
  const decoder = new TextDecoder("utf-8");
  for (const name of Object.keys(files).sort()) {
    const parsed = parseAuditReportFinancials(decoder.decode(files[name]));
    if (parsed) return { ...parsed, rceptNo };
  }
  return null;
}
