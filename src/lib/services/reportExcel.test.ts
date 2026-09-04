import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildReport } from "@/lib/services/reportExcel";
import type { AnalysisResult, NewsAnalysis } from "@/lib/services/analyzer";
import type { NewsItem } from "@/lib/services/newsTypes";
import type { VerificationOutput } from "@/lib/services/verification";

function analysis(patch: Partial<NewsItem> = {}): NewsAnalysis {
  const news: NewsItem = {
    title: "넷록스, 시리즈A 투자 유치",
    link: "https://www.etnews.com/1",
    description: "요약",
    content: "넷록스가 시리즈A 투자를 유치했다.",
    published: "2025-01-15T00:12:00.000Z",
    source: "전자신문",
    provider: "naver",
    titleMatch: true,
    mentions: 4,
    relevance: "primary",
    ...patch,
  };

  return {
    news,
    isAboutCompany: news.relevance === "primary",
    trend: {
      is_about_company: news.relevance === "primary" ? "Y" : "N",
      news_trend_summary: "넷록스가 시리즈A 투자를 유치했다",
      sentiment_score: 6,
      sentiment_label: "긍정적",
    },
    award: { is_award_related: "N", award_name: "", award_reason: "해당 없음" },
    investment: { is_investment_related: "Y", investment_name: "시리즈A", investment_reason: "유치" },
  };
}

function result(analyses: NewsAnalysis[] = [analysis()]): AnalysisResult {
  return {
    companyName: "넷록스",
    model: "claude-sonnet-5",
    analyses,
    comprehensiveOpinion: "넷록스는 투자 유치로 성장세를 보인다",
    stats: {
      totalNews: analyses.length,
      scoredNews: analyses.filter((entry) => entry.isAboutCompany).length,
      excludedNews: analyses.filter((entry) => !entry.isAboutCompany).length,
      averageSentiment: 6,
      positiveCount: 1,
      negativeCount: 0,
      neutralCount: 0,
      awardCount: 0,
      investmentCount: 1,
    },
    usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0 },
  fallbacks: 0,
  };
}

const verification: VerificationOutput = {
  status: "needs_review",
  faithfulness: 0.8,
  sourceCoverage: 1,
  evidenceMatch: 0.3,
  unsupportedClaims: ["업계 1위로 올라섰다"],
  counterEvidence: ["단일 출처에 의존한 보도입니다"],
  usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0 },
  detail: { layer1: { coverage: 1, cited: 1, total: 1, invalid: [], unregistered: [] }, layer2: null, layer3: 0.3 },
};

async function open(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

describe("buildReport", () => {
  it("keeps the two legacy sheets so the committee sees the familiar layout", async () => {
    const workbook = await open(await buildReport({ result: result() }));

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "종합 분석 결과",
      "뉴스별 분석 결과",
      "다차원 검증",
    ]);
  });

  it("keeps the legacy per-news column order", async () => {
    const workbook = await open(await buildReport({ result: result() }));
    const header = workbook.getWorksheet("뉴스별 분석 결과")?.getRow(1).values as string[];

    expect(header.slice(1)).toEqual([
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
    ]);
  });

  it("marks an article excluded from the score so the reader is not misled", async () => {
    const workbook = await open(
      await buildReport({ result: result([analysis({ relevance: "mention" })]) }),
    );
    const row = workbook.getWorksheet("뉴스별 분석 결과")?.getRow(2).values as string[];

    expect(row[16]).toBe("제외");
  });

  it("writes the verdict and every gate score on the verification sheet", async () => {
    const workbook = await open(await buildReport({ result: result(), verification }));
    const sheet = workbook.getWorksheet("다차원 검증");
    const text = JSON.stringify(sheet?.getSheetValues());

    expect(text).toContain("검토 필요");
    expect(text).toContain("0.85");
    expect(text).toContain("0.8");
  });

  it("shows the counter evidence as a caution, not buried", async () => {
    const workbook = await open(await buildReport({ result: result(), verification }));
    const text = JSON.stringify(workbook.getWorksheet("다차원 검증")?.getSheetValues());

    expect(text).toContain("단일 출처에 의존한 보도입니다");
    expect(text).toContain("업계 1위로 올라섰다");
  });

  it("still produces a workbook when verification never ran", async () => {
    const workbook = await open(await buildReport({ result: result() }));
    const text = JSON.stringify(workbook.getWorksheet("다차원 검증")?.getSheetValues());

    expect(text).toContain("검증 미실행");
  });

  it("records the model and token cost so a run can be audited later", async () => {
    const workbook = await open(await buildReport({ result: result() }));
    const text = JSON.stringify(workbook.getWorksheet("종합 분석 결과")?.getSheetValues());

    expect(text).toContain("claude-sonnet-5");
    expect(text).toContain("1000");
  });

  it("states on the summary sheet how many articles were left out of the score", async () => {
    const workbook = await open(
      await buildReport({ result: result([analysis(), analysis({ relevance: "mention" })]) }),
    );
    const text = JSON.stringify(workbook.getWorksheet("종합 분석 결과")?.getSheetValues());

    expect(text).toContain("1건");
  });

  it("produces a workbook with no news at all rather than throwing", async () => {
    const workbook = await open(await buildReport({ result: result([]) }));

    expect(workbook.getWorksheet("뉴스별 분석 결과")?.rowCount).toBe(1);
  });

  it("adds a 기여도 sheet when contributions are given", async () => {
    const workbook = await open(
      await buildReport({
        result: result(),
        contributions: [
          { key: "sentiment", label: "감성", normalised: 1, weight: 0.3, share: 0.6 },
          { key: "award", label: "수상", normalised: null, weight: 0.2, share: null },
        ],
      }),
    );
    const sheet = workbook.getWorksheet("기여도")!;
    expect(sheet.getRow(1).values).toEqual([undefined, "지표", "정규화", "가중치", "기여도"]);
    expect(sheet.getCell("A2").value).toBe("감성");
    expect(sheet.getCell("D2").value).toBe("60%");
    expect(sheet.getCell("B3").value).toBe("—");
  });
});
describe("buildReport with nothing scored", () => {
  it("prints a dash for the average sentiment — 0 would read as neutral", async () => {
    const empty = result([]);
    const workbook = await open(await buildReport({ result: { ...empty, stats: { ...empty.stats, totalNews: 3, excludedNews: 3, averageSentiment: null } } }));
    const sheet = workbook.getWorksheet("종합 분석 결과")!;
    const row = sheet.getRows(1, sheet.rowCount)!.find((entry) => entry.getCell(1).value === "평균 감성 점수")!;

    expect(row.getCell(2).value).toBe("—");
  });
});
