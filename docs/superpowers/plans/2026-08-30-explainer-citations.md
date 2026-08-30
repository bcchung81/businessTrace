# 기여도 리포트 · 인용 근거 UI (Task 13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기업 상세에서 벤치마킹 총점을 지표별 기여도(합 100%)로 풀어 보이고, 종합의견 문장에 마우스를 올리면 일치하는 기사 단락이 뜨며, 검증 배지를 누르면 4층 검증 근거가 사이드 패널로 열린다 — 전부 규칙 기반, LLM 호출 없음.

**Architecture:** 순수 서비스 `explainer.ts` 가 (1) `BenchmarkRow` → 기여도, (2) 분석 결과 → 근거 요약(헤드라인 3·DART 수치·검증 상태), (3) 종합의견 문장 → 기사 단락 매핑(`containment` 바이그램)을 낸다. 기업 상세 페이지가 서버에서 조립해 클라이언트 컴포넌트 3개(기여도 막대·인용 문장·검증 패널)에 넘기고, 같은 조립을 `GET /api/companies/[id]/explain` 이 JSON 으로 낸다. 엑셀 리포트에는 "기여도" 시트를 더한다.

**Tech Stack:** Next.js 16 · Prisma · vitest + Testing Library · exceljs · 기존 `textSimilarity.containment`

**Spec:** 로드맵 `docs/superpowers/plans/2026-08-26-nextjs-rearchitecture.md` §Task 13 · 브리프 `docs/design/2026-08-30-redesign-meta-prompt.md` §4-B [기여도·인용 근거 — Task 13] · 시각 문법 `docs/superpowers/specs/2026-08-30-visual-redesign-design.md` · 선행 `docs/superpowers/plans/2026-08-30-benchmarking-ranking.md`

## Global Constraints

- 기여도는 **감점 전 점수**를 100% 로 본다 — `normalised × weight` 를 값 있는 지표끼리 합이 1이 되도록 나눈 몫. 결측 지표는 기여도 목록에 `share: null` 로 남긴다(사라지지 않는다 — §2-K·L)
- 총점이 `null`(지표 없음)이면 기여도 막대 대신 "미분석 — 기여도를 낼 수 없다" 한 줄
- 인용 매핑 임계는 `containment ≥ 0.4`(검증 게이트 근거일치와 같은 값 `EVIDENCE_MATCH_THRESHOLD`) — 그 아래는 "일치 기사 없음"
- 사이드 패널 4층 라벨: `출처 인용` · `근거 충실도` · `근거 일치` · `반증`. 값 옆에 임계(`≥0.5` · `≥0.85` · `≥0.4`)를 함께 적는다(§2-C)
- 화면 라벨: 섹션 제목 `기여도 · 인용 근거`, 태그 `분석 산출`, 배지 클릭 `검증 근거 열기`, 패널 닫기 `닫기`
- 이 태스크에서 새 primary CTA 를 만들지 않는다(기업 상세의 primary 는 "분석 실행" 하나)
- 주석은 JSDoc 만. 외부 호출 없음. 이모지 금지, 아이콘은 인라인 SVG

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/lib/services/explainer.ts` | 기여도 · 근거 요약 · 인용 매핑 (순수) |
| `src/lib/repositories/explainInputs.ts` | 기업의 최신 완료 실행+검증, 재무 스냅샷, 벤치마킹 행 조립 |
| `src/components/company/contribution-bars.tsx` | 기여도 수평 막대 (서버 컴포넌트) |
| `src/components/company/opinion-citations.tsx` | 문장 hover → 단락 팝오버 (클라이언트) |
| `src/components/company/verification-panel.tsx` | 배지 → 사이드 패널 (클라이언트) |
| `src/app/api/companies/[id]/explain/route.ts` | GET JSON |
| `src/app/companies/[id]/page.tsx` | 섹션 삽입 |
| `src/lib/services/reportExcel.ts` | "기여도" 시트 |

---

### Task 1: 기여도 분해

**Files:**
- Create: `src/lib/services/explainer.ts`
- Test: `src/lib/services/explainer.test.ts`

**Interfaces:**
- Consumes: `BenchmarkRow`, `MetricKey`, `METRIC_LABEL` (`@/lib/services/benchmarking`)
- Produces:
  ```ts
  export type Contribution = { key: MetricKey; label: string; normalised: number | null; weight: number; share: number | null }; // share 0..1
  export function explainScore(row: BenchmarkRow): Contribution[];
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/services/explainer.test.ts
import { describe, expect, test } from "vitest";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";
import { explainScore } from "@/lib/services/explainer";

const book = loadRubrics();

describe("explainScore", () => {
  test("splits the pre-penalty score into shares that sum to 100%", () => {
    const [row] = rankCompanies(
      [
        { companyId: 1, name: "㈜가", industry: null, sentiment: 10, awards: 2, investments: 1, revenue: 100, verification: "verified", confirmedRisks: 1 },
        { companyId: 2, name: "㈜나", industry: null, sentiment: 0, awards: 0, investments: 0, revenue: 0, verification: "needs_review", confirmedRisks: 0 },
      ],
      book,
    );
    const shares = explainScore(row);
    expect(shares.map((c) => c.key)).toEqual(["sentiment", "award", "investment", "finance", "verification"]);
    expect(shares.reduce((acc, c) => acc + (c.share ?? 0), 0)).toBeCloseTo(1, 6);
    expect(shares[0].share).toBeCloseTo(0.3, 6);
    expect(shares[4].label).toBe("검증");
  });

  test("keeps a missing metric in the list with a null share and re-weights the rest", () => {
    const [row] = rankCompanies(
      [
        { companyId: 1, name: "㈜가", industry: null, sentiment: 10, awards: null, investments: null, revenue: null, verification: "verified", confirmedRisks: 0 },
        { companyId: 2, name: "㈜나", industry: null, sentiment: 0, awards: null, investments: null, revenue: null, verification: "needs_review", confirmedRisks: 0 },
      ],
      book,
    );
    const shares = explainScore(row);
    expect(shares.find((c) => c.key === "award")!.share).toBeNull();
    expect(shares.find((c) => c.key === "sentiment")!.share).toBeCloseTo(0.75, 6);
    expect(shares.find((c) => c.key === "verification")!.share).toBeCloseTo(0.25, 6);
  });

  test("returns every metric with null shares when nothing was scored", () => {
    const [row] = rankCompanies([{ companyId: 1, name: "㈜가", industry: null, sentiment: null, awards: null, investments: null, revenue: null, verification: null, confirmedRisks: 0 }], book);
    expect(explainScore(row).every((c) => c.share === null)).toBe(true);
    expect(explainScore(row)).toHaveLength(5);
  });

  test("a metric scored 0 contributes 0, not null", () => {
    const rows = rankCompanies(
      [
        { companyId: 1, name: "㈜가", industry: null, sentiment: 10, awards: 0, investments: null, revenue: null, verification: null, confirmedRisks: 0 },
        { companyId: 2, name: "㈜나", industry: null, sentiment: 0, awards: 3, investments: null, revenue: null, verification: null, confirmedRisks: 0 },
      ],
      book,
    );
    const ga = rows.find((r) => r.companyId === 1)!;
    expect(explainScore(ga).find((c) => c.key === "award")!.share).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/services/explainer.test.ts` → import unresolved

- [ ] **Step 3: Implement**

```ts
// src/lib/services/explainer.ts
import { METRIC_LABEL, type BenchmarkRow, type MetricKey } from "@/lib/services/benchmarking";

export type Contribution = { key: MetricKey; label: string; normalised: number | null; weight: number; share: number | null };

/**
 * 총점(감점 전)을 지표별 몫으로 가른다 — 값 있는 지표의 normalised×weight 합을 100% 로 본다.
 * 결측 지표는 지우지 않고 share null 로 남긴다. 합이 0 이면 전부 0 이다.
 */
export function explainScore(row: BenchmarkRow): Contribution[] {
  const present = row.metrics.filter((metric) => metric.normalised !== null);
  const weightSum = present.reduce((acc, metric) => acc + metric.weight, 0);
  const raw = row.metrics.map((metric) => (metric.normalised === null || weightSum === 0 ? null : metric.normalised * (metric.weight / weightSum)));
  const rawSum = raw.reduce<number>((acc, value) => acc + (value ?? 0), 0);
  return row.metrics.map((metric, index) => ({
    key: metric.key,
    label: METRIC_LABEL[metric.key],
    normalised: metric.normalised,
    weight: metric.weight,
    share: raw[index] === null ? null : rawSum === 0 ? 0 : (raw[index] as number) / rawSum,
  }));
}
```

- [ ] **Step 4: Run to verify it passes** — 4 tests
- [ ] **Step 5: Commit** — `git add src/lib/services/explainer.ts src/lib/services/explainer.test.ts && git commit -m "feat(explain): split the benchmark score into metric contributions"`

---

### Task 2: 근거 요약과 인용 매핑

**Files:**
- Modify: `src/lib/services/explainer.ts`
- Test: `src/lib/services/explainer.test.ts`

**Interfaces:**
- Consumes: `NewsAnalysis`, `AnalysisResult` (`@/lib/services/analyzer`), `FinancialSummary` (`@/lib/services/dart`), `containment` (`@/lib/services/textSimilarity`), `EVIDENCE_MATCH_THRESHOLD` (`@/lib/services/verificationScores`)
- Produces:
  ```ts
  export type Headline = { title: string; link: string; source: string; published: string; sentiment: number };
  export type EvidenceSummary = {
    headlines: Headline[];                       // 최대 3, |감성| 큰 순
    finance: { fiscalYear: number; revenue: number | null; operatingIncome: number | null; netIncome: number | null } | null;
    verification: "verified" | "needs_review" | null;
  };
  export function summariseEvidence(input: { result: AnalysisResult | null; finance: FinancialSummary | null; verification: "verified" | "needs_review" | null }): EvidenceSummary;
  export type Snippet = { title: string; link: string; paragraph: string; score: number };
  export type CitedSentence = { sentence: string; snippets: Snippet[] };  // snippets 최대 2, score 내림차순
  export function splitSentences(text: string): string[];
  export function citeOpinion(opinion: string, analyses: NewsAnalysis[]): CitedSentence[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/lib/services/explainer.test.ts
import { citeOpinion, splitSentences, summariseEvidence } from "@/lib/services/explainer";
import type { NewsAnalysis, AnalysisResult } from "@/lib/services/analyzer";

function analysis(over: Partial<NewsAnalysis["news"]> & { sentiment?: number; about?: boolean }): NewsAnalysis {
  const { sentiment = 0, about = true, ...news } = over;
  return {
    news: { title: "제목", link: "https://n.example/1", description: "", content: "", published: "2026-08-01", source: "전자신문", provider: "naver", titleMatch: true, mentions: 1, relevance: "primary", ...news },
    isAboutCompany: about,
    trend: { is_about_company: about ? "Y" : "N", news_trend_summary: "", sentiment_score: sentiment, sentiment_label: "" },
    award: { is_award_related: "N", award_name: "", award_reason: "" },
    investment: { is_investment_related: "N", investment_name: "", investment_reason: "" },
  };
}

function result(analyses: NewsAnalysis[], opinion = ""): AnalysisResult {
  return { companyName: "㈜가", model: "m", analyses, comprehensiveOpinion: opinion, stats: { totalNews: analyses.length, scoredNews: analyses.length, excludedNews: 0, averageSentiment: 0, positiveCount: 0, negativeCount: 0, neutralCount: 0, awardCount: 0, investmentCount: 0 }, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 } };
}

describe("summariseEvidence", () => {
  test("picks the three strongest headlines about the company and carries DART numbers and verification", () => {
    const summary = summariseEvidence({
      result: result([
        analysis({ title: "약한", link: "https://n.example/a", sentiment: 1 }),
        analysis({ title: "강한 긍정", link: "https://n.example/b", sentiment: 9 }),
        analysis({ title: "강한 부정", link: "https://n.example/c", sentiment: -8 }),
        analysis({ title: "중간", link: "https://n.example/d", sentiment: 4 }),
        analysis({ title: "타사", link: "https://n.example/e", sentiment: 10, about: false }),
      ]),
      finance: { found: true, fiscalYear: 2025, revenue: 1_000, operatingIncome: 100, netIncome: 50, totalAssets: 900 },
      verification: "verified",
    });
    expect(summary.headlines.map((h) => h.title)).toEqual(["강한 긍정", "강한 부정", "중간"]);
    expect(summary.finance).toEqual({ fiscalYear: 2025, revenue: 1_000, operatingIncome: 100, netIncome: 50 });
    expect(summary.verification).toBe("verified");
  });

  test("is empty but well-formed with nothing analysed", () => {
    expect(summariseEvidence({ result: null, finance: null, verification: null })).toEqual({ headlines: [], finance: null, verification: null });
    expect(summariseEvidence({ result: null, finance: { found: false, fiscalYear: 2025, revenue: null, operatingIncome: null, netIncome: null, totalAssets: null }, verification: null }).finance).toBeNull();
  });
});

describe("splitSentences", () => {
  test("cuts on Korean sentence enders and keeps the ender", () => {
    expect(splitSentences("시리즈B 120억 원을 유치했다. 수상도 있었다! 리스크는 없나?")).toEqual(["시리즈B 120억 원을 유치했다.", "수상도 있었다!", "리스크는 없나?"]);
  });
  test("drops blanks", () => {
    expect(splitSentences("  ")).toEqual([]);
  });
});

describe("citeOpinion", () => {
  const body = "㈜가는 2026년 8월 시리즈B 투자로 120억 원을 유치했다고 밝혔다.\n\n회사는 이번 자금을 연구개발에 쓴다.\n\n별개로 날씨가 좋았다.";
  const analyses = [analysis({ title: "㈜가 120억 유치", link: "https://n.example/1", content: body }), analysis({ title: "무관", link: "https://n.example/2", content: "전혀 다른 기사 내용이다." })];

  test("attaches the best-matching paragraph to each sentence above the evidence threshold", () => {
    const cited = citeOpinion("㈜가는 시리즈B 투자로 120억 원을 유치했다. 날씨 이야기는 근거가 없다.", analyses);
    expect(cited).toHaveLength(2);
    expect(cited[0].snippets[0]).toMatchObject({ link: "https://n.example/1", paragraph: "㈜가는 2026년 8월 시리즈B 투자로 120억 원을 유치했다고 밝혔다." });
    expect(cited[0].snippets[0].score).toBeGreaterThanOrEqual(0.4);
    expect(cited[0].snippets.length).toBeLessThanOrEqual(2);
  });

  test("leaves a sentence uncited when no paragraph clears the threshold", () => {
    const cited = citeOpinion("이 문장은 어느 기사에도 없다.", analyses);
    expect(cited[0].snippets).toEqual([]);
  });

  test("ignores articles the analyser marked as not about the company", () => {
    const cited = citeOpinion("㈜가는 시리즈B 투자로 120억 원을 유치했다.", [analysis({ content: body, about: false })]);
    expect(cited[0].snippets).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `summariseEvidence is not a function`

- [ ] **Step 3: Implement**

```ts
// append to src/lib/services/explainer.ts
import type { AnalysisResult, NewsAnalysis } from "@/lib/services/analyzer";
import type { FinancialSummary } from "@/lib/services/dart";
import { containment } from "@/lib/services/textSimilarity";
import { EVIDENCE_MATCH_THRESHOLD } from "@/lib/services/verificationScores";

export type Headline = { title: string; link: string; source: string; published: string; sentiment: number };
export type EvidenceSummary = {
  headlines: Headline[];
  finance: { fiscalYear: number; revenue: number | null; operatingIncome: number | null; netIncome: number | null } | null;
  verification: "verified" | "needs_review" | null;
};

/**
 * 화면 한 줄에 들어갈 근거 요약 — 감성이 센 헤드라인 3, DART 수치, 검증 상태.
 * 타사 기사는 뺀다. 재무는 found 일 때만 싣는다.
 */
export function summariseEvidence(input: { result: AnalysisResult | null; finance: FinancialSummary | null; verification: "verified" | "needs_review" | null }): EvidenceSummary {
  const headlines = (input.result?.analyses ?? [])
    .filter((entry) => entry.isAboutCompany)
    .sort((a, b) => Math.abs(b.trend.sentiment_score) - Math.abs(a.trend.sentiment_score))
    .slice(0, 3)
    .map((entry) => ({ title: entry.news.title, link: entry.news.link, source: entry.news.source, published: entry.news.published, sentiment: entry.trend.sentiment_score }));
  const finance = input.finance?.found
    ? { fiscalYear: input.finance.fiscalYear, revenue: input.finance.revenue, operatingIncome: input.finance.operatingIncome, netIncome: input.finance.netIncome }
    : null;
  return { headlines, finance, verification: input.verification };
}

export type Snippet = { title: string; link: string; paragraph: string; score: number };
export type CitedSentence = { sentence: string; snippets: Snippet[] };

/**
 * 종결 부호(. ! ?) 뒤에서 자른다. 부호는 문장에 남긴다.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function paragraphs(content: string): string[] {
  return content
    .split(/\n{2,}|(?<=[.!?。])\s+(?=\S)/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 10);
}

/**
 * 종합의견의 문장마다 가장 닮은 기사 단락을 붙인다 — containment 바이그램, 임계는 검증 게이트와 같다.
 * LLM 을 쓰지 않는다. 화면에서 hover 마다 뜨는 근거는 결정론이어야 재현된다.
 */
export function citeOpinion(opinion: string, analyses: NewsAnalysis[]): CitedSentence[] {
  const pool = analyses
    .filter((entry) => entry.isAboutCompany)
    .flatMap((entry) => paragraphs(entry.news.content || entry.news.description).map((paragraph) => ({ title: entry.news.title, link: entry.news.link, paragraph })));

  return splitSentences(opinion).map((sentence) => {
    const scored = pool
      .map((candidate) => ({ ...candidate, score: containment(sentence, candidate.paragraph) }))
      .filter((candidate) => candidate.score >= EVIDENCE_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const snippets = scored.filter((candidate) => (seen.has(candidate.link) ? false : (seen.add(candidate.link), true))).slice(0, 2);
    return { sentence, snippets };
  });
}
```

- [ ] **Step 4: Run to verify they pass** — 11 tests. `paragraphs` 가 문장 단위까지 자르므로 "날씨" 문장은 다른 단락과 짝지어지지 않는다.
- [ ] **Step 5: Commit** — `git commit -m "feat(explain): evidence summary and deterministic opinion-to-paragraph citations"`

---

### Task 3: 화면 컴포넌트 3개

**Files:**
- Create: `src/components/company/contribution-bars.tsx`
- Create: `src/components/company/opinion-citations.tsx`
- Create: `src/components/company/verification-panel.tsx`
- Test: `src/components/company/explain-ui.test.tsx`

**Interfaces:**
- Consumes: `Contribution`, `CitedSentence`, `EvidenceSummary` (Task 1·2), `VerificationOutput["detail"]` (`@/lib/services/verification`), `SOURCE_COVERAGE_THRESHOLD`·`FAITHFULNESS_THRESHOLD`·`EVIDENCE_MATCH_THRESHOLD` (`@/lib/services/verificationScores`), `VerdictPill`
- Produces:
  ```tsx
  export function ContributionBars({ contributions, total }: { contributions: Contribution[]; total: number | null }): JSX.Element;
  export function OpinionCitations({ sentences }: { sentences: CitedSentence[] }): JSX.Element;         // "use client"
  export type VerificationLayers = { status: "verified" | "needs_review"; faithfulness: number | null; sourceCoverage: number; evidenceMatch: number; counterEvidence: string[]; invalid: Array<{ title: string; link: string }>; cited: number; total: number; claims: Array<{ claim: string; supported: boolean; evidence: string }> };
  export function VerificationPanel({ layers }: { layers: VerificationLayers | null }): JSX.Element;    // "use client"
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/company/explain-ui.test.tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ContributionBars } from "@/components/company/contribution-bars";
import { OpinionCitations } from "@/components/company/opinion-citations";
import { VerificationPanel, type VerificationLayers } from "@/components/company/verification-panel";

describe("ContributionBars", () => {
  const contributions = [
    { key: "sentiment" as const, label: "감성", normalised: 1, weight: 0.3, share: 0.6 },
    { key: "award" as const, label: "수상", normalised: 0.5, weight: 0.2, share: 0.4 },
    { key: "investment" as const, label: "투자", normalised: null, weight: 0.2, share: null },
    { key: "finance" as const, label: "재무", normalised: null, weight: 0.2, share: null },
    { key: "verification" as const, label: "검증", normalised: null, weight: 0.1, share: null },
  ];

  test("draws one bar per metric with the percentage beside it and hatch for missing", () => {
    render(<ContributionBars contributions={contributions} total={0.8} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText("60%")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("img", { name: "감성 기여도 60%" })).toHaveStyle({ width: "60%" });
    expect(within(rows[2]).getByText("—")).toBeInTheDocument();
    expect(within(rows[2]).getByText("—")).toHaveClass("hatch");
  });

  test("shows the total next to the weights sum note", () => {
    render(<ContributionBars contributions={contributions} total={0.8} />);
    expect(screen.getByText(/총점 0\.800/)).toBeInTheDocument();
    expect(screen.getByText(/합계 100%/)).toBeInTheDocument();
  });

  test("says why there are no bars when nothing was scored", () => {
    render(<ContributionBars contributions={contributions.map((c) => ({ ...c, share: null, normalised: null }))} total={null} />);
    expect(screen.getByText("미분석 — 기여도를 낼 수 없다")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("OpinionCitations", () => {
  const sentences = [
    { sentence: "시리즈B 120억 원을 유치했다.", snippets: [{ title: "㈜가 120억 유치", link: "https://n.example/1", paragraph: "㈜가는 시리즈B 투자로 120억 원을 유치했다고 밝혔다.", score: 0.7 }] },
    { sentence: "근거 없는 문장이다.", snippets: [] },
  ];

  test("marks cited sentences and opens the paragraph on hover", () => {
    render(<OpinionCitations sentences={sentences} />);
    const cited = screen.getByText("시리즈B 120억 원을 유치했다.");
    expect(cited).toHaveAttribute("data-cited", "true");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(cited);
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByRole("link", { name: "㈜가 120억 유치" })).toHaveAttribute("href", "https://n.example/1");
    expect(within(tip).getByText(/일치 0\.70/)).toBeInTheDocument();
    expect(within(tip).getByText(/120억 원을 유치/)).toBeInTheDocument();
    fireEvent.mouseLeave(cited);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("labels an uncited sentence instead of colouring it", () => {
    render(<OpinionCitations sentences={sentences} />);
    const bare = screen.getByText("근거 없는 문장이다.");
    expect(bare).toHaveAttribute("data-cited", "false");
    fireEvent.mouseEnter(bare);
    expect(screen.getByRole("tooltip")).toHaveTextContent("일치 기사 없음");
  });

  test("opens on focus too, so keyboards get the same evidence", () => {
    render(<OpinionCitations sentences={sentences} />);
    fireEvent.focus(screen.getByText("시리즈B 120억 원을 유치했다."));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

describe("VerificationPanel", () => {
  const layers: VerificationLayers = {
    status: "needs_review", faithfulness: 0.8, sourceCoverage: 1, evidenceMatch: 0.62,
    counterEvidence: ["보도자료 의존"], invalid: [], cited: 4, total: 4,
    claims: [{ claim: "120억 유치", supported: true, evidence: "기사 1" }, { claim: "흑자 전환", supported: false, evidence: "" }],
  };

  test("is a badge until clicked, then a side panel with the four layers and thresholds", () => {
    render(<VerificationPanel layers={layers} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "검증 근거 열기" }));
    const panel = screen.getByRole("complementary", { name: "검증 근거" });
    expect(within(panel).getByText("출처 인용")).toBeInTheDocument();
    expect(within(panel).getByText(/1\.00 · ≥0\.5/)).toBeInTheDocument();
    expect(within(panel).getByText("근거 충실도")).toBeInTheDocument();
    expect(within(panel).getByText(/0\.80 · ≥0\.85/)).toBeInTheDocument();
    expect(within(panel).getByText("근거 일치")).toBeInTheDocument();
    expect(within(panel).getByText(/0\.62 · ≥0\.4/)).toBeInTheDocument();
    expect(within(panel).getByText("반증")).toBeInTheDocument();
    expect(within(panel).getByText("보도자료 의존")).toBeInTheDocument();
    expect(within(panel).getByText("흑자 전환")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  test("names the failed gate so the reader knows why it is 검토 필요", () => {
    render(<VerificationPanel layers={layers} />);
    fireEvent.click(screen.getByRole("button", { name: "검증 근거 열기" }));
    expect(screen.getByText(/탈락 사유: 근거 충실도/)).toBeInTheDocument();
  });

  test("shows 미분석 and no button without a verification", () => {
    render(<VerificationPanel layers={null} />);
    expect(screen.getByText("미분석")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail** — imports unresolved

- [ ] **Step 3: Implement ContributionBars**

```tsx
// src/components/company/contribution-bars.tsx
import type { Contribution } from "@/lib/services/explainer";

function percent(share: number) {
  return `${Math.round(share * 100)}%`;
}

/**
 * 기여도 수평 막대 — 지표 이름·정규화 값·가중치·몫. 결측은 빗금 — 로 남겨 다섯 줄이 늘 보인다.
 * 총점이 없으면 막대를 그리지 않고 이유를 적는다 — 0% 막대 다섯 개는 결측이 아니라 무기여로 읽힌다.
 */
export function ContributionBars({ contributions, total }: { contributions: Contribution[]; total: number | null }) {
  if (total === null) {
    return <p className="py-3 text-[12.5px] text-muted-foreground">미분석 — 기여도를 낼 수 없다</p>;
  }
  return (
    <div className="flex flex-col gap-3 py-3">
      <p className="text-[11.5px] text-muted-foreground">
        총점 <b className="font-mono text-foreground">{total.toFixed(3)}</b> · 감점 전 점수를 100% 로 나눈 몫 · 합계 100%
      </p>
      <ul className="flex flex-col gap-2">
        {contributions.map((entry) => (
          <li key={entry.key} className="grid grid-cols-[56px_minmax(0,1fr)_120px] items-center gap-3 text-[12px]">
            <span className="font-bold">{entry.label}</span>
            <span className="relative block h-3 bg-surface">
              {entry.share === null ? (
                <span className="hatch absolute inset-0 text-center text-[10px] leading-3 text-muted-foreground">—</span>
              ) : (
                <span role="img" aria-label={`${entry.label} 기여도 ${percent(entry.share)}`} className="absolute inset-y-0 left-0 bg-primary" style={{ width: percent(entry.share) }} />
              )}
            </span>
            <span className="flex justify-end gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>{entry.normalised === null ? "—" : entry.normalised.toFixed(2)}</span>
              <span>×{entry.weight}</span>
              <b className="text-foreground">{entry.share === null ? "—" : percent(entry.share)}</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

테스트의 `getByText("—")` 는 결측 줄에서 빗금 span 과 오른쪽 열의 "—" 두 개가 잡힌다 — 오른쪽 열의 결측 표시는 `"—"` 대신 `"결측"` 으로 적어 하나만 남긴다: `{entry.normalised === null ? "결측" : ...}`.

- [ ] **Step 4: Implement OpinionCitations**

```tsx
// src/components/company/opinion-citations.tsx
"use client";

import { useState } from "react";
import type { CitedSentence } from "@/lib/services/explainer";

/**
 * 종합의견을 문장 단위로 펼치고, 올리면 일치 기사 단락을 팝오버로 보인다.
 * 인용 여부는 색이 아니라 점선 밑줄과 data-cited 로 말한다 — 근거 없는 문장도 "없음" 이라고 적는다.
 */
export function OpinionCitations({ sentences }: { sentences: CitedSentence[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <p className="relative text-[13px] leading-[1.8]">
      {sentences.map((entry, index) => {
        const cited = entry.snippets.length > 0;
        return (
          <span key={index} className="relative">
            <span
              tabIndex={0}
              data-cited={cited ? "true" : "false"}
              onMouseEnter={() => setOpen(index)}
              onMouseLeave={() => setOpen(null)}
              onFocus={() => setOpen(index)}
              onBlur={() => setOpen(null)}
              className={cited ? "cursor-help underline decoration-dotted decoration-primary underline-offset-4" : "text-muted-foreground"}
            >
              {entry.sentence}
            </span>{" "}
            {open === index ? (
              <span role="tooltip" className="absolute left-0 top-full z-20 mt-1 flex w-[360px] flex-col gap-2 border-[1.5px] border-ink bg-background p-3 text-[12px] leading-snug">
                {cited ? (
                  entry.snippets.map((snippet) => (
                    <span key={snippet.link} className="flex flex-col gap-1">
                      <a href={snippet.link} target="_blank" rel="noreferrer" className="font-bold underline decoration-dotted underline-offset-2">
                        {snippet.title}
                      </a>
                      <span className="font-mono text-[10.5px] text-muted-foreground">일치 {snippet.score.toFixed(2)}</span>
                      <mark className="bg-accent text-foreground">{snippet.paragraph}</mark>
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">일치 기사 없음</span>
                )}
              </span>
            ) : null}
          </span>
        );
      })}
    </p>
  );
}
```

- [ ] **Step 5: Implement VerificationPanel**

```tsx
// src/components/company/verification-panel.tsx
"use client";

import { useState } from "react";
import { VerdictPill } from "@/components/dashboard/verdict-pill";
import { EVIDENCE_MATCH_THRESHOLD, FAITHFULNESS_THRESHOLD, SOURCE_COVERAGE_THRESHOLD } from "@/lib/services/verificationScores";

export type VerificationLayers = {
  status: "verified" | "needs_review";
  faithfulness: number | null;
  sourceCoverage: number;
  evidenceMatch: number;
  counterEvidence: string[];
  invalid: Array<{ title: string; link: string }>;
  cited: number;
  total: number;
  claims: Array<{ claim: string; supported: boolean; evidence: string }>;
};

function score(value: number | null, threshold: number) {
  return `${value === null ? "—" : value.toFixed(2)} · ≥${threshold}`;
}

/**
 * 판정 배지 하나로 시작해, 누르면 4층 검증 근거를 사이드 패널로 편다.
 * 탈락한 게이트를 이름으로 적는다 — "검토 필요" 만으로는 무엇을 봐야 하는지 모른다.
 */
export function VerificationPanel({ layers }: { layers: VerificationLayers | null }) {
  const [open, setOpen] = useState(false);
  if (!layers) return <VerdictPill verdict="pending" />;

  const failed = [
    layers.sourceCoverage < SOURCE_COVERAGE_THRESHOLD ? "출처 인용" : null,
    (layers.faithfulness ?? 0) < FAITHFULNESS_THRESHOLD ? "근거 충실도" : null,
    layers.evidenceMatch < EVIDENCE_MATCH_THRESHOLD ? "근거 일치" : null,
  ].filter((name): name is string => name !== null);

  return (
    <>
      <button type="button" aria-label="검증 근거 열기" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 border-[1.5px] border-ink px-2 py-1 text-[11px] font-bold hover:bg-secondary">
        <VerdictPill verdict={layers.status === "verified" ? "verified" : "review"} />
        검증 근거
      </button>
      {open ? (
        <aside aria-label="검증 근거" className="fixed inset-y-0 right-0 z-30 flex w-[380px] max-w-full flex-col gap-5 overflow-y-auto border-l-[1.5px] border-ink bg-background p-5 text-[12.5px]">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[18px] font-black">검증 근거</h3>
            <button type="button" onClick={() => setOpen(false)} className="border-[1.5px] border-ink px-2 py-0.5 text-[11px] font-bold">닫기</button>
          </div>
          {failed.length > 0 ? <p className="font-semibold text-review">탈락 사유: {failed.join(" · ")}</p> : <p className="font-semibold text-verified">세 게이트 모두 통과</p>}
          <dl className="flex flex-col gap-3">
            <div className="border-t-2 border-ink pt-2"><dt className="font-bold">출처 인용</dt><dd className="font-mono tabular-nums">{score(layers.sourceCoverage, SOURCE_COVERAGE_THRESHOLD)} · {layers.cited}/{layers.total}건</dd>
              {layers.invalid.length > 0 ? <ul className="mt-1 text-muted-foreground">{layers.invalid.map((item) => <li key={item.link}>{item.title} — 인용 불가 링크</li>)}</ul> : null}</div>
            <div className="border-t-2 border-ink pt-2"><dt className="font-bold">근거 충실도</dt><dd className="font-mono tabular-nums">{score(layers.faithfulness, FAITHFULNESS_THRESHOLD)}</dd>
              <ul className="mt-1 flex flex-col gap-1">{layers.claims.map((claim, index) => <li key={index} className={claim.supported ? "" : "text-review"}>{claim.supported ? "지지" : "불지지"} · {claim.claim}{claim.evidence ? <span className="text-muted-foreground"> — {claim.evidence}</span> : null}</li>)}</ul></div>
            <div className="border-t-2 border-ink pt-2"><dt className="font-bold">근거 일치</dt><dd className="font-mono tabular-nums">{score(layers.evidenceMatch, EVIDENCE_MATCH_THRESHOLD)}</dd></div>
            <div className="border-t-2 border-ink pt-2"><dt className="font-bold">반증</dt><dd>{layers.counterEvidence.length === 0 ? <span className="text-muted-foreground">없음</span> : <ul>{layers.counterEvidence.map((item) => <li key={item}>{item}</li>)}</ul>}</dd></div>
          </dl>
        </aside>
      ) : null}
    </>
  );
}
```

- [ ] **Step 6: Run to verify they pass** — 9 tests
- [ ] **Step 7: Commit** — `git commit -m "feat(explain): contribution bars, hover citations and the verification side panel"`

---

### Task 4: 입력 조립 · Route · 기업 상세 섹션 · 엑셀 시트

**Files:**
- Create: `src/lib/repositories/explainInputs.ts`
- Create: `src/app/api/companies/[id]/explain/route.ts`
- Modify: `src/app/companies/[id]/page.tsx` — "뉴스 분석 실행" 섹션 아래에 섹션 추가
- Modify: `src/lib/services/reportExcel.ts` — `buildReport` 에 `contributions?: Contribution[]` 옵션과 "기여도" 시트
- Modify: `src/app/api/reports/[runId]/route.ts` — 기여도 계산해 전달
- Test: `src/lib/repositories/explainInputs.test.ts`, `src/app/api/companies/[id]/explain/route.test.ts`, `src/lib/services/reportExcel.test.ts`(케이스 추가)

**Interfaces:**
- Produces:
  ```ts
  export type Explanation = { contributions: Contribution[]; total: number | null; evidence: EvidenceSummary; sentences: CitedSentence[]; layers: VerificationLayers | null; runId: number | null };
  export async function buildExplanation(companyId: number): Promise<Explanation | null>;   // 기업 없으면 null
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/repositories/explainInputs.test.ts
import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { buildExplanation } from "@/lib/repositories/explainInputs";

async function seed() {
  const user = await prisma.user.create({ data: { email: `e-${Math.random()}@example.com`, passwordHash: "scrypt:32768:8:1$s$h" } });
  const company = await prisma.company.create({ data: { name: "㈜가", year: 2026, industry: "SW" } });
  const analyses = [{
    news: { title: "㈜가 120억 유치", link: "https://n.example/1", description: "", content: "㈜가는 시리즈B 투자로 120억 원을 유치했다고 밝혔다.", published: "2026-08-01", source: "전자신문", provider: "naver", titleMatch: true, mentions: 1, relevance: "primary" },
    isAboutCompany: true,
    trend: { is_about_company: "Y", news_trend_summary: "", sentiment_score: 7, sentiment_label: "긍정" },
    award: { is_award_related: "N", award_name: "", award_reason: "" },
    investment: { is_investment_related: "Y", investment_name: "시리즈B", investment_reason: "" },
  }];
  const run = await prisma.analysisRun.create({
    data: {
      companyId: company.id, userId: user.id, model: "m", status: "completed", newsJson: "[]", completedAt: new Date("2026-08-02"),
      resultJson: JSON.stringify({ companyName: "㈜가", model: "m", analyses, comprehensiveOpinion: "㈜가는 시리즈B 투자로 120억 원을 유치했다.", stats: { totalNews: 1, scoredNews: 1, excludedNews: 0, averageSentiment: 7, positiveCount: 1, negativeCount: 0, neutralCount: 0, awardCount: 0, investmentCount: 1 }, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 } }),
    },
  });
  await prisma.verificationResult.create({
    data: { analysisRunId: run.id, status: "needs_review", faithfulness: 0.5, sourceCoverage: 1, evidenceMatch: 0.7, unsupportedClaims: "[]", counterEvidence: JSON.stringify(["보도자료 의존"]), detailJson: JSON.stringify({ layer1: { coverage: 1, cited: 1, total: 1, invalid: [] }, layer2: { claims: [{ claim: "120억", supported: true, evidence: "기사" }, { claim: "흑자", supported: false, evidence: "" }], counter_evidence: ["보도자료 의존"] }, layer3: 0.7 }) },
  });
  await prisma.sourceSnapshot.create({ data: { companyId: company.id, source: "dartFinance", status: "found", payload: JSON.stringify({ found: true, fiscalYear: 2025, revenue: 1000, operatingIncome: 10, netIncome: 5, totalAssets: 900 }) } });
  return { company, run };
}

describe("buildExplanation", () => {
  beforeEach(resetDatabase);

  test("assembles contributions, evidence, citations and layers for a company", async () => {
    const { company, run } = await seed();
    const explanation = (await buildExplanation(company.id))!;
    expect(explanation.runId).toBe(run.id);
    expect(explanation.contributions).toHaveLength(5);
    expect(explanation.total).not.toBeNull();
    expect(explanation.evidence.headlines[0].title).toBe("㈜가 120억 유치");
    expect(explanation.evidence.finance?.revenue).toBe(1000);
    expect(explanation.sentences[0].snippets[0].link).toBe("https://n.example/1");
    expect(explanation.layers).toMatchObject({ status: "needs_review", faithfulness: 0.5, cited: 1, total: 1, counterEvidence: ["보도자료 의존"] });
    expect(explanation.layers?.claims).toHaveLength(2);
  });

  test("returns an empty explanation for a company never analysed and null for a missing one", async () => {
    const company = await prisma.company.create({ data: { name: "㈜나", year: 2026 } });
    const explanation = (await buildExplanation(company.id))!;
    expect(explanation).toMatchObject({ runId: null, total: null, layers: null, sentences: [] });
    expect(explanation.evidence).toEqual({ headlines: [], finance: null, verification: null });
    expect(await buildExplanation(999)).toBeNull();
  });
});
```

```ts
// src/app/api/companies/[id]/explain/route.test.ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { GET } from "@/app/api/companies/[id]/explain/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("GET /api/companies/[id]/explain", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "1" } } as never);
  });

  test("401 without a session, 404 without the company, 200 with the explanation", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect((await GET(new Request("http://localhost"), ctx("1"))).status).toBe(401);
    expect((await GET(new Request("http://localhost"), ctx("999"))).status).toBe(404);
    const company = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const response = await GET(new Request("http://localhost"), ctx(String(company.id)));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: null, contributions: expect.any(Array) });
  });
});
```

```ts
// add to src/lib/services/reportExcel.test.ts (inside the existing describe, reuse its fixtures; if none fit, build a minimal AnalysisResult the way the file already does)
  test("adds a 기여도 sheet when contributions are given", async () => {
    const buffer = await buildReport({ result, verification: undefined, contributions: [{ key: "sentiment", label: "감성", normalised: 1, weight: 0.3, share: 0.6 }, { key: "award", label: "수상", normalised: null, weight: 0.2, share: null }] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet("기여도")!;
    expect(sheet.getRow(1).values).toEqual([undefined, "지표", "정규화", "가중치", "기여도"]);
    expect(sheet.getCell("A2").value).toBe("감성");
    expect(sheet.getCell("D2").value).toBe("60%");
    expect(sheet.getCell("B3").value).toBe("—");
  });
```
`reportExcel.test.ts` 를 먼저 열어 `buildReport` 의 기존 호출 형태와 fixture 이름(`result` 등)을 확인하고 그대로 쓴다.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement the repository**

```ts
// src/lib/repositories/explainInputs.ts
import { prisma } from "@/lib/db";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";
import { findVerification } from "@/lib/repositories/verificationResult";
import type { VerificationLayers } from "@/components/company/verification-panel";
import type { AnalysisResult } from "@/lib/services/analyzer";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";
import type { FinancialSummary } from "@/lib/services/dart";
import { citeOpinion, explainScore, summariseEvidence, type CitedSentence, type Contribution, type EvidenceSummary } from "@/lib/services/explainer";
import type { VerificationOutput } from "@/lib/services/verification";

export type Explanation = {
  contributions: Contribution[];
  total: number | null;
  evidence: EvidenceSummary;
  sentences: CitedSentence[];
  layers: VerificationLayers | null;
  runId: number | null;
};

function parse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function toLayers(stored: NonNullable<Awaited<ReturnType<typeof findVerification>>>): VerificationLayers {
  const detail = parse<VerificationOutput["detail"]>(stored.detailJson);
  return {
    status: stored.status === "verified" ? "verified" : "needs_review",
    faithfulness: stored.faithfulness,
    sourceCoverage: stored.sourceCoverage ?? 0,
    evidenceMatch: stored.evidenceMatch ?? 0,
    counterEvidence: parse<string[]>(stored.counterEvidence) ?? [],
    invalid: detail?.layer1?.invalid ?? [],
    cited: detail?.layer1?.cited ?? 0,
    total: detail?.layer1?.total ?? 0,
    claims: detail?.layer2?.claims ?? [],
  };
}

/**
 * 기업 하나의 설명 자료를 조립한다 — 벤치마킹 행은 같은 연도 전체를 다시 점수화해서 얻는다(정규화는 코호트 상대값이다).
 */
export async function buildExplanation(companyId: number): Promise<Explanation | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      analysisRuns: { where: { status: "completed" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, resultJson: true } },
      sourceSnapshots: { where: { source: "dartFinance", status: "found" }, select: { payload: true } },
    },
  });
  if (!company) return null;

  const run = company.analysisRuns[0] ?? null;
  const result = run ? parse<AnalysisResult>(run.resultJson) : null;
  const stored = run ? await findVerification(run.id) : null;
  const layers = stored ? toLayers(stored) : null;
  const finance = company.sourceSnapshots[0] ? parse<FinancialSummary>(company.sourceSnapshots[0].payload) : null;

  const book = loadRubrics();
  const row = rankCompanies(await listBenchmarkInputs(company.year), book).find((entry) => entry.companyId === company.id);

  return {
    contributions: row ? explainScore(row) : [],
    total: row?.total ?? null,
    evidence: summariseEvidence({ result, finance, verification: layers?.status ?? null }),
    sentences: result ? citeOpinion(result.comprehensiveOpinion, result.analyses) : [],
    layers,
    runId: run?.id ?? null,
  };
}
```

- [ ] **Step 4: Implement the route**

```ts
// src/app/api/companies/[id]/explain/route.ts
import { auth } from "@/auth";
import { buildExplanation } from "@/lib/repositories/explainInputs";

export async function GET(_request: Request, context: RouteContext<"/api/companies/[id]/explain">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const explanation = await buildExplanation(Number(id));
  if (!explanation) return Response.json({ message: "기업을 찾을 수 없습니다." }, { status: 404 });
  return Response.json(explanation);
}
```

- [ ] **Step 5: Insert the section in the detail page** (after the "뉴스 분석 실행" section)

```tsx
// src/app/companies/[id]/page.tsx — imports
import { buildExplanation } from "@/lib/repositories/explainInputs";
import { ContributionBars } from "@/components/company/contribution-bars";
import { OpinionCitations } from "@/components/company/opinion-citations";
import { VerificationPanel } from "@/components/company/verification-panel";

// in the body, after `const events = ...`
  const explanation = await buildExplanation(company.id);

// JSX, after the 뉴스 분석 실행 section
      <Panel title="기여도 · 인용 근거" tag="분석 산출" note="감점 전 점수를 100% 로 나눈 몫 · 문장에 올리면 일치 기사 단락" aside={explanation ? <VerificationPanel layers={explanation.layers} /> : null}>
        {explanation ? (
          <div className="flex flex-col gap-5">
            <ContributionBars contributions={explanation.contributions} total={explanation.total} />
            <div className="grid gap-5 border-t border-hairline pt-4 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex flex-col gap-2">
                <h3 className="text-[12px] font-bold">종합의견</h3>
                {explanation.sentences.length === 0 ? <p className="text-[12.5px] text-muted-foreground">분석을 아직 실행하지 않았다</p> : <OpinionCitations sentences={explanation.sentences} />}
              </div>
              <dl className="flex flex-col gap-2 text-[12px]">
                <dt className="font-bold">헤드라인</dt>
                <dd>{explanation.evidence.headlines.length === 0 ? <span className="text-muted-foreground">없음</span> : <ul className="flex flex-col gap-1">{explanation.evidence.headlines.map((h) => <li key={h.link}><a href={h.link} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">{h.title}</a> <span className="font-mono text-[10.5px] text-muted-foreground">{h.sentiment > 0 ? "+" : ""}{h.sentiment}</span></li>)}</ul>}</dd>
                <dt className="font-bold">DART 재무</dt>
                <dd className="font-mono tabular-nums">{explanation.evidence.finance ? `${explanation.evidence.finance.fiscalYear} 매출 ${explanation.evidence.finance.revenue ?? "—"} · 영업이익 ${explanation.evidence.finance.operatingIncome ?? "—"} · 순이익 ${explanation.evidence.finance.netIncome ?? "—"}` : <span className="hatch px-2 font-sans text-muted-foreground">미공시</span>}</dd>
              </dl>
            </div>
          </div>
        ) : null}
      </Panel>
```

- [ ] **Step 6: Excel sheet** — in `reportExcel.ts` add to `buildReport` input `contributions?: Contribution[]` and, after the verification sheet:

```ts
function writeContributionSheet(sheet: ExcelJS.Worksheet, contributions: Contribution[]) {
  sheet.getRow(1).values = ["지표", "정규화", "가중치", "기여도"];
  sheet.getRow(1).font = { bold: true };
  for (const entry of contributions) {
    sheet.addRow([entry.label, entry.normalised === null ? "—" : Number(entry.normalised.toFixed(2)), entry.weight, entry.share === null ? "—" : `${Math.round(entry.share * 100)}%`]);
  }
  fitColumns(sheet);
}
// in buildReport, after the verification sheet:
  if (input.contributions) writeContributionSheet(workbook.addWorksheet("기여도"), input.contributions);
```
And in `src/app/api/reports/[runId]/route.ts`, before `buildReport`: `const explanation = await buildExplanation(run.companyId);` and pass `contributions: explanation?.contributions`.

- [ ] **Step 7: Run all four test files, then the whole gate** — `npx vitest run && npm run lint && npm run build`
- [ ] **Step 8: Commit** — `git commit -m "feat: explainable score breakdown and interactive citation ui"`

---

### Task 5: 문서

- [ ] CLAUDE.md 진행 문장을 "Phase B 중 14(12·13 완료, 11 은 사건 모니터링이 대체)" 로. 로드맵 Task 13 항목에 실측 경로(`src/app/api/companies/[id]/explain`, Recharts 미사용 — 막대는 div, `EvidenceHighlight.tsx` 대신 `opinion-citations.tsx`)와 완료일 2026-08-30, 실행 플랜 경로 추가.
- [ ] Commit — `docs: record explainer and citation ui as done`
