import { describe, it, expect } from "vitest";
import { checkSources, evidenceMatch, decide, failedGates } from "@/lib/services/verificationScores";
import type { NewsAnalysis } from "@/lib/services/analyzer";
import type { NewsItem } from "@/lib/services/newsTypes";

function analysis(patch: { link?: string; summary?: string; content?: string; title?: string } = {}) {
  const news: NewsItem = {
    title: patch.title ?? "넷록스, 시리즈A 투자 유치",
    link: patch.link ?? "https://www.etnews.com/1",
    description: "요약",
    content: patch.content ?? "넷록스가 시리즈A 투자를 유치했다고 30일 밝혔다.",
    published: "2025-01-15T00:12:00.000Z",
    source: "전자신문",
    provider: "naver",
    titleMatch: true,
    mentions: 4,
    relevance: "primary",
  };

  return {
    news,
    isAboutCompany: true,
    trend: {
      is_about_company: "Y" as const,
      news_trend_summary: patch.summary ?? "넷록스가 시리즈A 투자를 유치했다",
      sentiment_score: 6,
      sentiment_label: "긍정적",
    },
    award: { is_award_related: "N" as const, award_name: "", award_reason: "" },
    investment: { is_investment_related: "Y" as const, investment_name: "시리즈A", investment_reason: "" },
  } satisfies NewsAnalysis;
}

describe("checkSources", () => {
  it("counts only http links as citable sources", () => {
    const result = checkSources([
      analysis({ link: "https://www.etnews.com/1" }),
      analysis({ link: "not-a-url" }),
      analysis({ link: "" }),
    ]);

    expect(result.coverage).toBeCloseTo(1 / 3);
    expect(result.invalid).toHaveLength(2);
  });

  it("rejects a non-http scheme so a javascript link cannot pass as a citation", () => {
    expect(checkSources([analysis({ link: "javascript:alert(1)" })]).coverage).toBe(0);
  });

  it("reports full coverage when every article carries a real link", () => {
    expect(checkSources([analysis(), analysis()]).coverage).toBe(1);
  });

  it("treats an empty analysis as zero coverage rather than dividing by zero", () => {
    expect(checkSources([]).coverage).toBe(0);
  });

  it("does not count a blocked domain as a citation — an AI stock page is not a source", () => {
    const result = checkSources([
      analysis({ link: "https://www.etnews.com/1" }),
      analysis({ link: "https://www.judal.co.kr/?view=stockAI&shareToken=x" }),
    ]);

    expect(result.coverage).toBe(0.5);
    expect(result.cited).toBe(1);
    expect(result.invalid).toEqual([
      expect.objectContaining({ link: "https://www.judal.co.kr/?view=stockAI&shareToken=x", reason: "blocked" }),
    ]);
  });

  it("blocks subdomains of a blocked site and PR wires, which are written by the company itself", () => {
    const result = checkSources([
      analysis({ link: "https://m.blog.naver.com/someone/1" }),
      analysis({ link: "https://www.globenewswire.com/news-release/1" }),
    ]);

    expect(result.cited).toBe(0);
    expect(result.invalid.map((item) => item.reason)).toEqual(["blocked", "blocked"]);
  });

  it("keeps an outlet missing from the press list as cited but reports it as unregistered — 연합뉴스 was missing", () => {
    const result = checkSources([analysis({ link: "https://www.yna.co.kr/view/AKR1" }), analysis({ link: "https://example.org/a" })]);

    expect(result.coverage).toBe(1);
    expect(result.invalid).toEqual([]);
    expect(result.unregistered.map((item) => item.host)).toEqual(["example.org"]);
  });

  it("names why a link was not cited so the panel can tell a broken link from a blocked outlet", () => {
    const result = checkSources([analysis({ link: "javascript:alert(1)" }), analysis({ link: "https://kr.investing.com/x" })]);

    expect(result.invalid.map((item) => item.reason)).toEqual(["invalid_link", "blocked"]);
    expect(result.unregistered).toEqual([]);
  });
});

describe("evidenceMatch", () => {
  it("scores high when the summary reuses the wording of the article", () => {
    const score = evidenceMatch([
      analysis({
        summary: "넷록스가 시리즈A 투자를 유치했다",
        content: "넷록스가 시리즈A 투자를 유치했다고 30일 밝혔다.",
      }),
    ]);

    expect(score).toBeGreaterThan(0.6);
  });

  it("scores low when the summary talks about something the article never says", () => {
    const score = evidenceMatch([
      analysis({ summary: "삼성전자가 반도체 실적을 발표했다", content: "넷록스가 시리즈A 투자를 유치했다." }),
    ]);

    expect(score).toBeLessThan(0.3);
  });

  it("averages across every analysed article", () => {
    const score = evidenceMatch([
      analysis({ summary: "넷록스가 시리즈A 투자를 유치했다", content: "넷록스가 시리즈A 투자를 유치했다" }),
      analysis({ summary: "전혀 무관한 문장입니다", content: "넷록스가 시리즈A 투자를 유치했다" }),
    ]);

    expect(score).toBeGreaterThan(0.2);
    expect(score).toBeLessThan(0.8);
  });

  it("does not punish a long article for being long", () => {
    const filler = "관련 업계에 따르면 시장 상황은 다양한 변수의 영향을 받고 있다. ".repeat(40);
    const score = evidenceMatch([
      analysis({ summary: "넷록스가 시리즈A 투자를 유치했다", content: `${filler}넷록스가 시리즈A 투자를 유치했다고 밝혔다.${filler}` }),
    ]);

    expect(score).toBeGreaterThan(0.6);
  });

  it("is zero when there is nothing to compare", () => {
    expect(evidenceMatch([])).toBe(0);
    expect(evidenceMatch([analysis({ summary: "", content: "" })])).toBe(0);
  });
});

describe("decide", () => {
  const cases: Array<[number | null, number, number, string]> = [
    [0.85, 0.5, 0.5, "verified"],
    [0.849, 0.5, 0.5, "needs_review"],
    [0.85, 0.499, 0.5, "needs_review"],
    [0.85, 0.5, 0.499, "needs_review"],
    [1, 1, 1, "verified"],
    [null, 1, 1, "needs_review"],
    [0, 0, 0, "needs_review"],
  ];

  it.each(cases)(
    "faithfulness=%s coverage=%s evidence=%s decides %s",
    (faithfulness, sourceCoverage, evidenceMatchScore, expected) => {
      expect(decide({ faithfulness, sourceCoverage, evidenceMatch: evidenceMatchScore })).toBe(expected);
    },
  );

  it("never verifies when the judge score is missing, however good the other gates are", () => {
    expect(decide({ faithfulness: null, sourceCoverage: 1, evidenceMatch: 1 })).toBe("needs_review");
  });
});

describe("failedGates with an unmeasured gate", () => {
  it("does not name 근거 충실도 as failed when the judge never produced a score", () => {
    expect(failedGates({ sourceCoverage: 1, faithfulness: null, evidenceMatch: 1 })).toEqual([]);
  });
});
