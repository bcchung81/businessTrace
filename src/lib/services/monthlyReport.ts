import ExcelJS from "exceljs";
import type { EventRow } from "@/lib/repositories/eventRepository";
import type { CompanyCardData } from "@/lib/services/companyCards";
import { STATUS_LABEL } from "@/lib/services/eventReview";
import { KIND_LABEL, SEVERITY_LABEL, type Severity, type Trust } from "@/lib/services/eventRules";
import type { FreshnessInput } from "@/lib/services/freshness";
import { formatRunTime } from "@/lib/services/formatRunTime";
import { HEADER_FILL, fitColumns } from "@/lib/services/reportExcel";

export type MonthlyStats = {
  year: number;
  month: number;
  total: number;
  companiesWithEvents: number;
  events: number;
  alert: number;
  notice: number;
  positive: number;
  open: number;
  firstNoticeCompany: string | null;
};

const TRUST_LABEL: Record<"verified" | "needs_review", string> = { verified: "근거 확인", needs_review: "확인 필요" };

function trustLabel(trust: Trust): string {
  return trust ? TRUST_LABEL[trust] : "실측";
}

function pensionLabel(ym: string | undefined): string {
  return ym ? `${ym.slice(0, 4)}-${ym.slice(4, 6)}` : "—";
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${HEADER_FILL}` } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
}

/**
 * 요약 문단을 채운다. 규칙 집계값 밖의 문구(원인·전망)는 넣지 않는다.
 */
export function summaryParagraph(stats: MonthlyStats): string {
  const noticeDetail = stats.firstNoticeCompany ? `(${stats.firstNoticeCompany} 외)` : "";
  return (
    `${stats.month}월 우수기업 ${stats.total}개사 중 ${stats.companiesWithEvents}개사에서 사건 ${stats.events}건. ` +
    `주의 ${stats.notice}건${noticeDetail}, 경보 ${stats.alert}건, 홍보 후보 ${stats.positive}건. 미확인 ${stats.open}건.`
  );
}

function computeStats(year: number, month: number, events: EventRow[], cards: CompanyCardData[]): MonthlyStats {
  const bySeverity: Record<Severity, number> = { alert: 0, notice: 0, positive: 0, info: 0 };
  for (const event of events) bySeverity[event.severity] += 1;
  const firstNotice = events.find((event) => event.severity === "alert" || event.severity === "notice");

  return {
    year,
    month,
    total: cards.length,
    companiesWithEvents: new Set(events.map((event) => event.companyId)).size,
    events: events.length,
    alert: bySeverity.alert,
    notice: bySeverity.notice,
    positive: bySeverity.positive,
    open: events.filter((event) => event.status === "open").length,
    firstNoticeCompany: firstNotice?.companyName ?? null,
  };
}

function writeSummarySheet(sheet: ExcelJS.Worksheet, stats: MonthlyStats, freshness: FreshnessInput) {
  sheet.mergeCells("A1:B1");
  const paragraph = sheet.getCell("A1");
  paragraph.value = summaryParagraph(stats);
  paragraph.font = { bold: true, size: 12 };
  paragraph.alignment = { wrapText: true, vertical: "top" };
  sheet.getRow(1).height = 40;

  const rows: Array<[string, string | number]> = [
    ["사건", stats.events],
    ["주의", stats.notice],
    ["경보", stats.alert],
    ["홍보 후보", stats.positive],
    ["미확인", stats.open],
    ["뉴스 수집일", formatRunTime(freshness.latestNewsAt)],
    ["원천 수집일", formatRunTime(freshness.latestSourceAt)],
    ["연금 ym", pensionLabel(freshness.pensionYm)],
  ];

  let row = 3;
  for (const [label, value] of rows) {
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`A${row}`).font = { bold: true };
    sheet.getCell(`B${row}`).value = value;
    row += 1;
  }

  fitColumns(sheet);
}

function writeEventSheet(sheet: ExcelJS.Worksheet, events: EventRow[]) {
  styleHeaderRow(sheet.addRow(["날짜", "기업", "종류", "심각도", "제목", "근거 링크", "신뢰", "상태", "메모"]));
  for (const event of events) {
    sheet.addRow([
      dateLabel(event.occurredAt),
      event.companyName,
      KIND_LABEL[event.kind],
      SEVERITY_LABEL[event.severity],
      event.title,
      event.evidence[0]?.link ?? event.evidence[0]?.label ?? "",
      trustLabel(event.trust),
      STATUS_LABEL[event.status],
      event.note ?? "",
    ]);
  }
  fitColumns(sheet);
}

function writeNoticeCompanySheet(sheet: ExcelJS.Worksheet, events: EventRow[], cards: CompanyCardData[]) {
  styleHeaderRow(sheet.addRow(["기업", "경보 수", "주의 수", "사건 요약", "미확인"]));
  const watchlist = cards.filter((card) => card.events30d.alert + card.events30d.notice > 0);
  for (const card of watchlist) {
    const summary = events
      .filter((event) => event.companyId === card.id && (event.severity === "alert" || event.severity === "notice"))
      .slice(0, 3)
      .map((event) => event.title)
      .join(" / ");
    sheet.addRow([card.name, card.events30d.alert, card.events30d.notice, summary, card.open]);
  }
  fitColumns(sheet);
}

function writePromotionSheet(sheet: ExcelJS.Worksheet, events: EventRow[]) {
  styleHeaderRow(sheet.addRow(["날짜", "기업", "종류", "제목", "기사 제목", "링크", "출처"]));
  for (const event of events.filter((event) => event.severity === "positive")) {
    sheet.addRow([
      dateLabel(event.occurredAt),
      event.companyName,
      KIND_LABEL[event.kind],
      event.title,
      event.evidence[0]?.label ?? "",
      event.evidence[0]?.link ?? "",
      event.evidence[0]?.source ?? "",
    ]);
  }
  fitColumns(sheet);
}

function writeCompanyStatusSheet(sheet: ExcelJS.Worksheet, cards: CompanyCardData[]) {
  styleHeaderRow(sheet.addRow(["기업", "업종", "사업자번호", "가입자", "12개월 증감", "최근 보도", "판정"]));
  for (const card of cards) {
    sheet.addRow([
      card.name,
      card.industry ?? "",
      card.businessNo ? "확보" : "미확보",
      card.headcount.latest ?? "—",
      card.headcount.delta12m !== null ? `${Math.round(card.headcount.delta12m * 100)}%` : "—",
      card.latestArticle ? dateLabel(card.latestArticle) : "—",
      trustLabel(card.trust),
    ]);
  }
  fitColumns(sheet);
}

/**
 * 규칙으로 저장된 사건·카드·신선도만으로 월간 동향 워크북을 만든다. 순수 함수 — DB 접근은 호출자 몫이다.
 */
export function buildMonthlyWorkbook(input: {
  year: number;
  month: number;
  events: EventRow[];
  cards: CompanyCardData[];
  freshness: FreshnessInput;
}): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "성과돋보기";
  workbook.created = new Date();

  const stats = computeStats(input.year, input.month, input.events, input.cards);
  writeSummarySheet(workbook.addWorksheet("요약"), stats, input.freshness);
  writeEventSheet(workbook.addWorksheet("사건"), input.events);
  writeNoticeCompanySheet(workbook.addWorksheet("주의 기업"), input.events, input.cards);
  writePromotionSheet(workbook.addWorksheet("홍보 후보"), input.events);
  writeCompanyStatusSheet(workbook.addWorksheet("기업 현황"), input.cards);

  return workbook;
}

/**
 * 월간 문서 파일명을 만든다.
 */
export function monthlyReportFileName(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")} 우수기업 동향.xlsx`;
}

/**
 * 연간 집계는 Task 14 에서 구현한다.
 */
export function buildYearlyWorkbook(input: { year: number; events: EventRow[] }): ExcelJS.Workbook {
  void input;
  throw new Error("연간 집계는 Task 14 에서 구현한다");
}
