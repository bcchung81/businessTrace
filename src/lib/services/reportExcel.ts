import type { Contribution } from "@/lib/services/explainer";
import ExcelJS from "exceljs";
import type { AnalysisResult, NewsAnalysis } from "@/lib/services/analyzer";
import type { VerificationOutput } from "@/lib/services/verification";
import {
  EVIDENCE_MATCH_THRESHOLD,
  FAITHFULNESS_THRESHOLD,
  SOURCE_COVERAGE_THRESHOLD,
} from "@/lib/services/verificationScores";

export const HEADER_FILL = "366092";
export const TITLE_FILL = "2E86AB";
export const SECTION_FILL = "A23B72";
export const CAUTION_FILL = "FFF6E8";

const NEWS_HEADERS = [
  "분석소스",
  "뉴스 제목",
  "뉴스 내용",
  "출처",
  "날짜",
  "링크",
  "동향분석 요약",
  "감정점수",
  "감정라벨",
  "수상여부",
  "수상명",
  "수상이유",
  "투자여부",
  "투자명",
  "투자이유",
  "집계 반영",
] as const;

const DASH = "—";

const VERDICT_LABEL: Record<VerificationOutput["status"], string> = {
  verified: "검증 완료",
  needs_review: "검토 필요",
  failed: "검증 실패",
};

function koreanDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function sourceCode(analysis: NewsAnalysis) {
  return analysis.news.provider === "naver" ? "N" : "G";
}

export function fitColumns(sheet: ExcelJS.Worksheet, max = 50) {
  sheet.columns.forEach((column) => {
    let longest = 10;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const length = String(cell.value ?? "").length;
      if (length > longest) longest = length;
    });
    column.width = Math.min(longest + 2, max);
  });
}

function writeSummarySheet(sheet: ExcelJS.Worksheet, result: AnalysisResult) {
  sheet.mergeCells("A1:E1");
  const title = sheet.getCell("A1");
  title.value = `${result.companyName} AI 종합 분석 보고서`;
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${TITLE_FILL}` } };
  sheet.getRow(1).height = 35;

  sheet.mergeCells("A2:E2");
  const meta = sheet.getCell("A2");
  meta.value = `분석 모델 ${result.model} · 입력 ${result.usage.inputTokens} 토큰 · 출력 ${result.usage.outputTokens} 토큰`;
  meta.font = { size: 10, color: { argb: "FF666666" } };
  meta.alignment = { horizontal: "right" };

  sheet.mergeCells("A4:E4");
  const heading = sheet.getCell("A4");
  heading.value = "종합 분석 결과";
  heading.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  heading.alignment = { horizontal: "center", vertical: "middle" };
  heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${SECTION_FILL}` } };
  sheet.getRow(4).height = 30;

  sheet.mergeCells("A5:E12");
  const opinion = sheet.getCell("A5");
  opinion.value = result.comprehensiveOpinion;
  opinion.alignment = { wrapText: true, vertical: "top", horizontal: "left" };

  const stats: Array<[string, string | number]> = [
    ["수집 뉴스", `${result.stats.totalNews}건`],
    ["감성 집계 대상", `${result.stats.scoredNews}건`],
    ["집계 제외", `${result.stats.excludedNews}건 (회사가 기사 주제가 아님)`],
    ["평균 감성 점수", result.stats.averageSentiment ?? DASH],
    ["긍정 / 중립 / 부정", `${result.stats.positiveCount} / ${result.stats.neutralCount} / ${result.stats.negativeCount}`],
    ["수상 관련", `${result.stats.awardCount}건`],
    ["투자 관련", `${result.stats.investmentCount}건`],
  ];

  let row = 14;
  for (const [label, value] of stats) {
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`A${row}`).font = { bold: true };
    sheet.getCell(`B${row}`).value = value;
    row += 1;
  }

  fitColumns(sheet);
}

function writeNewsSheet(sheet: ExcelJS.Worksheet, result: AnalysisResult) {
  const header = sheet.addRow([...NEWS_HEADERS]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${HEADER_FILL}` } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  for (const analysis of result.analyses) {
    sheet.addRow([
      sourceCode(analysis),
      analysis.news.title,
      analysis.news.content,
      analysis.news.source,
      koreanDate(analysis.news.published),
      analysis.news.link,
      analysis.trend.news_trend_summary,
      analysis.trend.sentiment_score,
      analysis.trend.sentiment_label,
      analysis.award.is_award_related,
      analysis.award.award_name,
      analysis.award.award_reason,
      analysis.investment.is_investment_related,
      analysis.investment.investment_name,
      analysis.investment.investment_reason,
      analysis.isAboutCompany ? "반영" : "제외",
    ]);
  }

  fitColumns(sheet);
}

function writeVerificationSheet(sheet: ExcelJS.Worksheet, verification?: VerificationOutput) {
  sheet.mergeCells("A1:D1");
  const title = sheet.getCell("A1");
  title.value = "다차원 검증";
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${SECTION_FILL}` } };
  sheet.getRow(1).height = 30;

  if (!verification) {
    sheet.getCell("A3").value = "검증 미실행";
    sheet.getCell("A4").value =
      "이 분석은 아직 출처·근거 대조를 거치지 않았습니다. 선정 근거로 쓰기 전에 검증을 실행하세요.";
    fitColumns(sheet);
    return;
  }

  sheet.getCell("A3").value = "판정";
  sheet.getCell("A3").font = { bold: true };
  sheet.getCell("B3").value = VERDICT_LABEL[verification.status];

  const gates: Array<[string, number | string, number]> = [
    ["① 출처 커버리지", verification.sourceCoverage, SOURCE_COVERAGE_THRESHOLD],
    ["② 근거 충실도", verification.faithfulness ?? "판정 실패", FAITHFULNESS_THRESHOLD],
    ["③ evidence-match", verification.evidenceMatch, EVIDENCE_MATCH_THRESHOLD],
  ];

  sheet.getRow(5).values = ["항목", "점수", "기준", "통과"];
  sheet.getRow(5).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${HEADER_FILL}` } };
  });

  gates.forEach(([label, score, threshold], index) => {
    const passed = typeof score === "number" && score >= threshold;
    sheet.getRow(6 + index).values = [label, score, threshold, passed ? "통과" : "미달"];
  });

  let row = 10;
  sheet.getCell(`A${row}`).value = "근거를 찾지 못한 주장";
  sheet.getCell(`A${row}`).font = { bold: true };
  row += 1;

  if (verification.unsupportedClaims.length === 0) {
    sheet.getCell(`A${row}`).value = "없음";
    row += 1;
  } else {
    for (const claim of verification.unsupportedClaims) {
      sheet.getCell(`A${row}`).value = claim;
      sheet.getCell(`A${row}`).alignment = { wrapText: true, vertical: "top" };
      row += 1;
    }
  }

  row += 1;
  sheet.getCell(`A${row}`).value = "유의사항 — 이 평가가 틀릴 수 있는 이유";
  sheet.getCell(`A${row}`).font = { bold: true };
  row += 1;

  const cautions = verification.counterEvidence.length > 0 ? verification.counterEvidence : ["없음"];
  for (const caution of cautions) {
    const cell = sheet.getCell(`A${row}`);
    cell.value = caution;
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${CAUTION_FILL}` } };
    row += 1;
  }

  fitColumns(sheet);
}

/**
 * 평가위원회 제출용 엑셀 리포트를 만든다.
 * 검증이 없으면 '검증 미실행' 을 명시한다. 빈칸으로 두면 통과로 오해된다.
 */
function writeContributionSheet(sheet: ExcelJS.Worksheet, contributions: Contribution[]) {
  sheet.getRow(1).values = ["지표", "정규화", "가중치", "기여도"];
  sheet.getRow(1).font = { bold: true };
  for (const entry of contributions) {
    sheet.addRow([
      entry.label,
      entry.normalised === null ? "—" : Number(entry.normalised.toFixed(2)),
      entry.weight,
      entry.share === null ? "—" : `${Math.round(entry.share * 100)}%`,
    ]);
  }
  fitColumns(sheet);
}

export async function buildReport(input: {
  result: AnalysisResult;
  verification?: VerificationOutput;
  contributions?: Contribution[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "기업성과추적";
  workbook.created = new Date();

  writeSummarySheet(workbook.addWorksheet("종합 분석 결과"), input.result);
  writeNewsSheet(workbook.addWorksheet("뉴스별 분석 결과"), input.result);
  writeVerificationSheet(workbook.addWorksheet("다차원 검증"), input.verification);
  if (input.contributions) writeContributionSheet(workbook.addWorksheet("기여도"), input.contributions);

  return workbook.xlsx.writeBuffer();
}

/**
 * 레거시와 같은 규칙으로 리포트 파일명을 만든다.
 */
export function reportFileName(companyName: string, at: Date) {
  const stamp = [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("");
  return `${companyName}_AI분석결과_${stamp}.xlsx`;
}
