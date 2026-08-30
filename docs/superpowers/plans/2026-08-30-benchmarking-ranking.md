# 벤치마킹 랭킹 (Task 12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 연도별 우수기업을 산업별 가중치 루브릭으로 점수화해 `/ranking` 화면과 엑셀 시트로 낸다 — 가중치를 화면에 명시하고 결측은 "—"+빗금으로 남긴다.

**Architecture:** 순수 서비스 `benchmarking.ts` 가 기업별 지표 입력을 받아 min-max 정규화·가중 합산·순위를 낸다(DB·LLM 없음). 리포지토리 `benchmarkInputs.ts` 가 최신 분석 결과·재무 스냅샷·검증·확인된 리스크 사건을 모아 입력을 만든다. Route Handler 는 얇게 — JSON 과 xlsx 만 내고 로직은 서비스에 둔다. 화면은 기존 `Panel`·`Segmented`·`VerdictPill` 문법을 재사용한다.

**Tech Stack:** Next.js 16 App Router · Prisma(SQLite) · vitest + Testing Library · exceljs

**Spec:** `docs/superpowers/plans/2026-08-26-nextjs-rearchitecture.md` §Task 12 · 화면 인벤토리 `docs/design/2026-08-30-redesign-meta-prompt.md` §4-B [벤치마킹 랭킹] · 시각 문법 `docs/superpowers/specs/2026-08-30-visual-redesign-design.md`

## Global Constraints

- 기본 가중치: **감성 0.3 · 수상 0.2 · 투자 0.2 · 재무 0.2 · 검증 0.1**, 리스크는 감점 — 산업별 루브릭이 없는 기업에 쓴다
- 리스크 감점은 **확인된 사건만**(`Event.severity = "alert"` 이고 `status ∈ {"acknowledged","done"}`) — 미확인 경보는 감점하지 않는다
- min-max 정규화는 **값이 있는 기업들 사이에서만** 하고, 결측 지표는 가중치에서 빼고 남은 가중치를 재정규화한다(결측을 0 으로 그리지 않는다 — §2-L)
- 지표 5열은 정규화 0~1, 결측은 `"—"` + 빗금(`.hatch`)
- 화면 라벨은 브리프 §3·§4-B 문자열 그대로: 헤더 `"{연도}년 벤치마킹"`, 루브릭 `ICT/제조/바이오/기본`, 가중치 표기 `"감성 0.3 · 수상 0.2 · 투자 0.2 · 재무 0.2 · 검증 0.1 · 리스크 감점"`, 열 `순위 · 기업 · 판정 · 총점 · 감성 · 수상 · 투자 · 재무 · 검증 · 리스크 감점 · 산업`
- 화면당 primary CTA 는 하나 — 여기서는 `"엑셀 내보내기"`
- 블록마다 실측/예시/미구현 태그 자리 — 랭킹 표는 `실측`, 산식 버전은 `formulaVersion` 으로 찍는다
- 주석은 JSDoc 만, 본문 3줄 이내. 줄 주석 금지
- 외부 호출 없음 — 이 태스크는 DB 만 읽는다. 테스트는 `resetDatabase()` 를 쓰는 리포지토리 테스트와 순수 서비스 테스트로 나눈다
- 새 최상위 디렉터리를 만들지 않는다 — 루브릭 JSON 은 `src/lib/services/rubrics.json`(`pressMapping.json` 관례)

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/lib/services/rubrics.json` | 산업별 가중치 루브릭과 업종 별칭 (데이터만) |
| `src/lib/services/benchmarking.ts` | 루브릭 해석 · 정규화 · 가중 합산 · 순위 (순수 함수) |
| `src/lib/repositories/benchmarkInputs.ts` | DB 에서 기업별 지표 입력 조립 |
| `src/lib/services/rankingExcel.ts` | 랭킹 워크북 생성 |
| `src/app/api/companies/benchmark/route.ts` | GET: JSON / `?format=xlsx` |
| `src/app/ranking/page.tsx` | 서버 페이지 — 입력 조립 → 점수 → 표 |
| `src/components/ranking/ranking-table.tsx` | 클라이언트 표 — 루브릭 셀렉터 · 정렬 · 필터 |
| `src/components/layout/app-shell.tsx` | 내비 3 (동향 · 기업 · 랭킹) |

---

### Task 1: 루브릭 데이터와 해석기

**Files:**
- Create: `src/lib/services/rubrics.json`
- Create: `src/lib/services/benchmarking.ts`
- Test: `src/lib/services/benchmarking.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MetricKey = "sentiment" | "award" | "investment" | "finance" | "verification";
  export type Weights = Record<MetricKey, number>;
  export type Rubric = { id: string; name: string; industries: string[]; weights: Weights; riskPenalty: number };
  export type RubricBook = { formulaVersion: string; default: Rubric; rubrics: Rubric[] };
  export const METRIC_KEYS: MetricKey[];
  export const METRIC_LABEL: Record<MetricKey, string>;
  export function loadRubrics(): RubricBook;
  export function resolveRubric(industry: string | null, book: RubricBook): Rubric;
  export function weightLabel(rubric: Rubric): string;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/services/benchmarking.test.ts
import { describe, expect, test } from "vitest";
import { loadRubrics, resolveRubric, weightLabel, METRIC_KEYS } from "@/lib/services/benchmarking";

describe("rubrics", () => {
  const book = loadRubrics();

  test("ships ICT, 제조, 바이오 and a default whose weights sum to 1", () => {
    expect(book.rubrics.map((r) => r.id)).toEqual(["ict", "manufacturing", "bio"]);
    for (const rubric of [book.default, ...book.rubrics]) {
      const sum = METRIC_KEYS.reduce((acc, key) => acc + rubric.weights[key], 0);
      expect(sum, rubric.id).toBeCloseTo(1, 6);
      expect(rubric.riskPenalty).toBeGreaterThan(0);
    }
  });

  test("default weights are the roadmap values", () => {
    expect(book.default.weights).toEqual({ sentiment: 0.3, award: 0.2, investment: 0.2, finance: 0.2, verification: 0.1 });
  });

  test("maps the cohort's industry names onto rubrics and falls back to default", () => {
    expect(resolveRubric("SW", book).id).toBe("ict");
    expect(resolveRubric("의료/헬스케어", book).id).toBe("bio");
    expect(resolveRubric("첨단로봇", book).id).toBe("manufacturing");
    expect(resolveRubric("ESG", book).id).toBe("default");
    expect(resolveRubric(null, book).id).toBe("default");
  });

  test("spells the weights out the way the screen shows them", () => {
    expect(weightLabel(book.default)).toBe("감성 0.3 · 수상 0.2 · 투자 0.2 · 재무 0.2 · 검증 0.1 · 리스크 감점");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/benchmarking.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/services/benchmarking"`

- [ ] **Step 3: Write the rubric data**

```json
// src/lib/services/rubrics.json
{
  "formulaVersion": "rank-v1",
  "default": {
    "id": "default",
    "name": "기본",
    "industries": [],
    "weights": { "sentiment": 0.3, "award": 0.2, "investment": 0.2, "finance": 0.2, "verification": 0.1 },
    "riskPenalty": 0.15
  },
  "rubrics": [
    {
      "id": "ict",
      "name": "ICT",
      "industries": ["SW", "데이터", "클라우드", "사이버보안", "블록체인", "양자", "IoT", "AI", "미디어콘텐츠"],
      "weights": { "sentiment": 0.25, "award": 0.2, "investment": 0.25, "finance": 0.15, "verification": 0.15 },
      "riskPenalty": 0.15
    },
    {
      "id": "manufacturing",
      "name": "제조",
      "industries": ["첨단로봇", "첨단모빌리티", "반도체", "제조"],
      "weights": { "sentiment": 0.2, "award": 0.15, "investment": 0.15, "finance": 0.35, "verification": 0.15 },
      "riskPenalty": 0.2
    },
    {
      "id": "bio",
      "name": "바이오",
      "industries": ["의료/헬스케어", "바이오", "디지털헬스"],
      "weights": { "sentiment": 0.2, "award": 0.25, "investment": 0.3, "finance": 0.1, "verification": 0.15 },
      "riskPenalty": 0.2
    }
  ]
}
```

- [ ] **Step 4: Write the resolver**

```ts
// src/lib/services/benchmarking.ts
import rubricsJson from "@/lib/services/rubrics.json";

export type MetricKey = "sentiment" | "award" | "investment" | "finance" | "verification";
export type Weights = Record<MetricKey, number>;
export type Rubric = { id: string; name: string; industries: string[]; weights: Weights; riskPenalty: number };
export type RubricBook = { formulaVersion: string; default: Rubric; rubrics: Rubric[] };

export const METRIC_KEYS: MetricKey[] = ["sentiment", "award", "investment", "finance", "verification"];
export const METRIC_LABEL: Record<MetricKey, string> = {
  sentiment: "감성",
  award: "수상",
  investment: "투자",
  finance: "재무",
  verification: "검증",
};

/**
 * 루브릭 책을 읽는다. JSON 이 원천이라 코드에는 숫자가 없다.
 */
export function loadRubrics(): RubricBook {
  return rubricsJson as RubricBook;
}

/**
 * 업종 이름으로 루브릭을 고른다. 별칭 표에 없으면 기본 가중치다 — 추측하지 않는다.
 */
export function resolveRubric(industry: string | null, book: RubricBook): Rubric {
  const name = (industry ?? "").trim();
  return book.rubrics.find((rubric) => rubric.industries.includes(name)) ?? book.default;
}

/**
 * 가중치를 화면 문구로 적는다 — 숫자가 보이지 않는 점수는 근거가 아니다.
 */
export function weightLabel(rubric: Rubric): string {
  const parts = METRIC_KEYS.map((key) => `${METRIC_LABEL[key]} ${rubric.weights[key]}`);
  return `${parts.join(" · ")} · 리스크 감점`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/services/benchmarking.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/rubrics.json src/lib/services/benchmarking.ts src/lib/services/benchmarking.test.ts
git commit -m "feat(benchmark): industry rubric book with default weights"
```

---

### Task 2: 정규화·가중 합산·순위

**Files:**
- Modify: `src/lib/services/benchmarking.ts`
- Test: `src/lib/services/benchmarking.test.ts`

**Interfaces:**
- Consumes: `Rubric`, `RubricBook`, `METRIC_KEYS`, `resolveRubric` (Task 1)
- Produces:
  ```ts
  export type BenchmarkInput = {
    companyId: number; name: string; industry: string | null;
    sentiment: number | null;      // 평균 감성 -10..10
    awards: number | null;         // 수상 기사 수
    investments: number | null;    // 투자 기사 수
    revenue: number | null;        // 최근 회계연도 매출 (원)
    verification: "verified" | "needs_review" | null;
    confirmedRisks: number;        // 확인된 경보 사건 수
  };
  export type MetricScore = { key: MetricKey; raw: number | null; normalised: number | null; weight: number };
  export type BenchmarkRow = {
    companyId: number; name: string; industry: string | null; rubricId: string; rubricName: string;
    metrics: MetricScore[]; riskPenalty: number; total: number | null; rank: number | null;
  };
  export function rankCompanies(inputs: BenchmarkInput[], book: RubricBook, rubricId?: string): BenchmarkRow[];
  ```
  `rubricId` 를 주면 모든 기업에 그 루브릭을 강제한다(화면 셀렉터). 주지 않으면 업종별로 고른다.

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/lib/services/benchmarking.test.ts
import { rankCompanies, type BenchmarkInput } from "@/lib/services/benchmarking";

function input(over: Partial<BenchmarkInput> & { companyId: number; name: string }): BenchmarkInput {
  return { industry: null, sentiment: null, awards: null, investments: null, revenue: null, verification: null, confirmedRisks: 0, ...over };
}

describe("rankCompanies", () => {
  const book = loadRubrics();

  test("min-max normalises each metric across the companies that have it", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "㈜가", sentiment: 8, awards: 2, investments: 0, revenue: 1_000, verification: "verified" }),
        input({ companyId: 2, name: "㈜나", sentiment: -2, awards: 0, investments: 2, revenue: 3_000, verification: "needs_review" }),
      ],
      book,
    );
    const ga = rows.find((row) => row.companyId === 1)!;
    const metric = (key: string) => ga.metrics.find((m) => m.key === key)!.normalised;
    expect(metric("sentiment")).toBe(1);
    expect(metric("award")).toBe(1);
    expect(metric("investment")).toBe(0);
    expect(metric("finance")).toBe(0);
    expect(metric("verification")).toBe(1);
  });

  test("a metric nobody varies on scores 0.5 for everyone rather than dividing by zero", () => {
    const rows = rankCompanies(
      [input({ companyId: 1, name: "㈜가", sentiment: 3 }), input({ companyId: 2, name: "㈜나", sentiment: 3 })],
      book,
    );
    expect(rows[0].metrics.find((m) => m.key === "sentiment")!.normalised).toBe(0.5);
  });

  test("drops missing metrics from the weights instead of counting them as zero", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "㈜가", sentiment: 10, awards: 1, investments: 1, revenue: null, verification: "verified" }),
        input({ companyId: 2, name: "㈜나", sentiment: 0, awards: 0, investments: 0, revenue: 5_000, verification: "needs_review" }),
      ],
      book,
    );
    const ga = rows.find((row) => row.companyId === 1)!;
    expect(ga.metrics.find((m) => m.key === "finance")!.normalised).toBeNull();
    expect(ga.total).toBeCloseTo(1, 6);
  });

  test("a company with no metrics at all is unranked, not last", () => {
    const rows = rankCompanies([input({ companyId: 1, name: "㈜가", sentiment: 1 }), input({ companyId: 2, name: "㈜나" })], book);
    const na = rows.find((row) => row.companyId === 2)!;
    expect(na.total).toBeNull();
    expect(na.rank).toBeNull();
    expect(rows.find((row) => row.companyId === 1)!.rank).toBe(1);
  });

  test("subtracts the rubric penalty per confirmed risk, floored at zero", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "㈜가", sentiment: 5, confirmedRisks: 1 }),
        input({ companyId: 2, name: "㈜나", sentiment: 5, confirmedRisks: 0 }),
      ],
      book,
    );
    const ga = rows.find((row) => row.companyId === 1)!;
    const na = rows.find((row) => row.companyId === 2)!;
    expect(na.total).toBe(0.5);
    expect(ga.riskPenalty).toBe(book.default.riskPenalty);
    expect(ga.total).toBeCloseTo(0.5 - book.default.riskPenalty, 6);
    expect(rankCompanies([input({ companyId: 3, name: "㈜다", sentiment: 1, confirmedRisks: 9 })], book)[0].total).toBe(0);
  });

  test("ranks by total descending with ties sharing a rank", () => {
    const rows = rankCompanies(
      [
        input({ companyId: 1, name: "㈜가", sentiment: 5 }),
        input({ companyId: 2, name: "㈜나", sentiment: 5 }),
        input({ companyId: 3, name: "㈜다", sentiment: 1 }),
      ],
      book,
    );
    expect(rows.map((row) => [row.name, row.rank])).toEqual([["㈜가", 1], ["㈜나", 1], ["㈜다", 3]]);
  });

  test("applies the industry rubric per company unless one is forced", () => {
    const inputs = [input({ companyId: 1, name: "㈜가", industry: "SW", sentiment: 1 }), input({ companyId: 2, name: "㈜나", industry: "ESG", sentiment: 1 })];
    expect(rankCompanies(inputs, book).map((row) => row.rubricId)).toEqual(["ict", "default"]);
    expect(rankCompanies(inputs, book, "bio").map((row) => row.rubricId)).toEqual(["bio", "bio"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/services/benchmarking.test.ts`
Expected: FAIL — `rankCompanies is not a function`

- [ ] **Step 3: Implement**

```ts
// append to src/lib/services/benchmarking.ts
export type BenchmarkInput = {
  companyId: number;
  name: string;
  industry: string | null;
  sentiment: number | null;
  awards: number | null;
  investments: number | null;
  revenue: number | null;
  verification: "verified" | "needs_review" | null;
  confirmedRisks: number;
};

export type MetricScore = { key: MetricKey; raw: number | null; normalised: number | null; weight: number };

export type BenchmarkRow = {
  companyId: number;
  name: string;
  industry: string | null;
  rubricId: string;
  rubricName: string;
  metrics: MetricScore[];
  riskPenalty: number;
  total: number | null;
  rank: number | null;
};

function rawMetric(input: BenchmarkInput, key: MetricKey): number | null {
  switch (key) {
    case "sentiment": return input.sentiment;
    case "award": return input.awards;
    case "investment": return input.investments;
    case "finance": return input.revenue;
    case "verification": return input.verification === null ? null : input.verification === "verified" ? 1 : 0;
  }
}

/**
 * 값이 있는 기업들 사이에서 0~1 로 편다. 모두 같은 값이면 0.5 — 차이가 없는데 순위를 가르지 않는다.
 */
function normalise(values: Array<number | null>): Array<number | null> {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return values.map(() => null);
  const min = Math.min(...present);
  const max = Math.max(...present);
  return values.map((value) => (value === null ? null : max === min ? 0.5 : (value - min) / (max - min)));
}

function total(metrics: MetricScore[], penalty: number): number | null {
  const present = metrics.filter((metric) => metric.normalised !== null);
  if (present.length === 0) return null;
  const weightSum = present.reduce((acc, metric) => acc + metric.weight, 0);
  const score = present.reduce((acc, metric) => acc + (metric.normalised as number) * (metric.weight / weightSum), 0);
  return Math.max(0, score - penalty);
}

/**
 * 기업들을 루브릭으로 점수화해 순위를 매긴다. 결측 지표는 가중치에서 빼고, 리스크는 확인된 것만 감점한다.
 * 지표가 하나도 없는 기업은 꼴찌가 아니라 순위 없음이다 — 0 으로 그리면 결측이 사라진다.
 */
export function rankCompanies(inputs: BenchmarkInput[], book: RubricBook, rubricId?: string): BenchmarkRow[] {
  const forced = rubricId ? [book.default, ...book.rubrics].find((rubric) => rubric.id === rubricId) : undefined;
  const columns = Object.fromEntries(METRIC_KEYS.map((key) => [key, normalise(inputs.map((input) => rawMetric(input, key)))])) as Record<MetricKey, Array<number | null>>;

  const rows = inputs.map((input, index) => {
    const rubric = forced ?? resolveRubric(input.industry, book);
    const metrics = METRIC_KEYS.map((key) => ({ key, raw: rawMetric(input, key), normalised: columns[key][index], weight: rubric.weights[key] }));
    const riskPenalty = input.confirmedRisks * rubric.riskPenalty;
    return { companyId: input.companyId, name: input.name, industry: input.industry, rubricId: rubric.id, rubricName: rubric.name, metrics, riskPenalty, total: total(metrics, riskPenalty), rank: null as number | null };
  });

  rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.name.localeCompare(b.name, "ko"));
  rows.forEach((row, index) => {
    if (row.total === null) return;
    const prev = rows[index - 1];
    row.rank = prev && prev.total === row.total ? prev.rank : index + 1;
  });
  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/services/benchmarking.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/benchmarking.ts src/lib/services/benchmarking.test.ts
git commit -m "feat(benchmark): normalise, weight and rank companies with missing-metric handling"
```

---

### Task 3: 지표 입력 리포지토리

**Files:**
- Create: `src/lib/repositories/benchmarkInputs.ts`
- Test: `src/lib/repositories/benchmarkInputs.test.ts`

**Interfaces:**
- Consumes: `BenchmarkInput` (Task 2), `prisma`, `resetDatabase` (`@/lib/test-support/db`)
- Produces: `export async function listBenchmarkInputs(year: number): Promise<BenchmarkInput[]>`

데이터 원천 (기업당 하나씩):
- 감성·수상·투자: 최신 `AnalysisRun(status="completed")` 의 `resultJson` → `stats.averageSentiment` · `stats.awardCount` · `stats.investmentCount`. 없으면 셋 다 `null`
- 재무: `SourceSnapshot(source="dartFinance", status="found")` 의 `payload.revenue`. 없거나 `null` 이면 `null`
- 검증: `listLatestVerifications(year)` 의 `status`
- 확인된 리스크: `Event(severity="alert", status in ["acknowledged","done"])` 수

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/repositories/benchmarkInputs.test.ts
import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";

const YEAR = 2026;

async function user() {
  return prisma.user.create({ data: { email: `b-${Date.now()}-${Math.random()}@example.com`, passwordHash: "scrypt:32768:8:1$s$h" } });
}

async function completedRun(companyId: number, userId: number, stats: Partial<{ averageSentiment: number; awardCount: number; investmentCount: number }>, createdAt: Date) {
  return prisma.analysisRun.create({
    data: {
      companyId, userId, model: "claude-sonnet-5", status: "completed", createdAt, completedAt: createdAt,
      newsJson: "[]",
      resultJson: JSON.stringify({ stats: { averageSentiment: 0, awardCount: 0, investmentCount: 0, ...stats } }),
    },
  });
}

describe("listBenchmarkInputs", () => {
  beforeEach(resetDatabase);

  test("takes sentiment, awards and investments from the latest completed run only", async () => {
    const u = await user();
    const company = await prisma.company.create({ data: { name: "㈜가", year: YEAR, industry: "SW" } });
    await completedRun(company.id, u.id, { averageSentiment: 2, awardCount: 0, investmentCount: 0 }, new Date("2026-07-01"));
    await completedRun(company.id, u.id, { averageSentiment: 6, awardCount: 1, investmentCount: 2 }, new Date("2026-08-01"));

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row).toMatchObject({ companyId: company.id, name: "㈜가", industry: "SW", sentiment: 6, awards: 1, investments: 2 });
  });

  test("leaves every metric null for a company that was never analysed", async () => {
    await prisma.company.create({ data: { name: "㈜나", year: YEAR } });
    const [row] = await listBenchmarkInputs(YEAR);
    expect(row).toMatchObject({ sentiment: null, awards: null, investments: null, revenue: null, verification: null, confirmedRisks: 0 });
  });

  test("reads revenue only from a found dartFinance snapshot", async () => {
    const found = await prisma.company.create({ data: { name: "㈜다", year: YEAR } });
    const absent = await prisma.company.create({ data: { name: "㈜라", year: YEAR } });
    await prisma.sourceSnapshot.create({ data: { companyId: found.id, source: "dartFinance", status: "found", payload: JSON.stringify({ found: true, revenue: 12_000 }) } });
    await prisma.sourceSnapshot.create({ data: { companyId: absent.id, source: "dartFinance", status: "absent", payload: JSON.stringify({ found: false, revenue: null }) } });

    const rows = await listBenchmarkInputs(YEAR);
    expect(rows.find((row) => row.companyId === found.id)?.revenue).toBe(12_000);
    expect(rows.find((row) => row.companyId === absent.id)?.revenue).toBeNull();
  });

  test("counts only confirmed alert events as risks", async () => {
    const company = await prisma.company.create({ data: { name: "㈜마", year: YEAR } });
    const base = { companyId: company.id, kind: "closure", occurredAt: new Date("2026-08-01"), title: "t", evidenceJson: "[]" };
    await prisma.event.create({ data: { ...base, severity: "alert", status: "open", evidenceKey: "1" } });
    await prisma.event.create({ data: { ...base, severity: "alert", status: "acknowledged", evidenceKey: "2" } });
    await prisma.event.create({ data: { ...base, severity: "alert", status: "done", evidenceKey: "3" } });
    await prisma.event.create({ data: { ...base, severity: "notice", status: "done", evidenceKey: "4" } });

    const [row] = await listBenchmarkInputs(YEAR);
    expect(row.confirmedRisks).toBe(2);
  });

  test("skips inactive companies and other years", async () => {
    await prisma.company.create({ data: { name: "㈜바", year: YEAR, isActive: false } });
    await prisma.company.create({ data: { name: "㈜사", year: YEAR - 1 } });
    expect(await listBenchmarkInputs(YEAR)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/repositories/benchmarkInputs.test.ts`
Expected: FAIL — cannot resolve `@/lib/repositories/benchmarkInputs`

- [ ] **Step 3: Implement**

```ts
// src/lib/repositories/benchmarkInputs.ts
import { prisma } from "@/lib/db";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import type { BenchmarkInput } from "@/lib/services/benchmarking";

type Stats = { averageSentiment?: number; awardCount?: number; investmentCount?: number };

function parseStats(resultJson: string | null): Stats | null {
  if (!resultJson) return null;
  try {
    const stats = (JSON.parse(resultJson) as { stats?: Stats }).stats;
    return stats ?? null;
  } catch {
    return null;
  }
}

function parseRevenue(payload: string): number | null {
  try {
    const revenue = (JSON.parse(payload) as { revenue?: number | null }).revenue;
    return typeof revenue === "number" ? revenue : null;
  } catch {
    return null;
  }
}

/**
 * 연도의 활성 기업마다 벤치마킹 지표 입력을 한 줄로 모은다.
 * 분석은 최신 완료 실행 하나만, 재무는 found 스냅샷만, 리스크는 확인된 경보만 센다 — 미확인 경보는 감점 근거가 아니다.
 */
export async function listBenchmarkInputs(year: number): Promise<BenchmarkInput[]> {
  const companies = await prisma.company.findMany({
    where: { year, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    include: {
      analysisRuns: { where: { status: "completed" }, orderBy: { createdAt: "desc" }, take: 1, select: { resultJson: true } },
      sourceSnapshots: { where: { source: "dartFinance", status: "found" }, select: { payload: true } },
      events: { where: { severity: "alert", status: { in: ["acknowledged", "done"] } }, select: { id: true } },
    },
  });
  const verification = new Map((await listLatestVerifications(year)).map((row) => [row.companyId, row.status]));

  return companies.map((company) => {
    const stats = parseStats(company.analysisRuns[0]?.resultJson ?? null);
    return {
      companyId: company.id,
      name: company.name,
      industry: company.industry,
      sentiment: stats?.averageSentiment ?? null,
      awards: stats?.awardCount ?? null,
      investments: stats?.investmentCount ?? null,
      revenue: company.sourceSnapshots[0] ? parseRevenue(company.sourceSnapshots[0].payload) : null,
      verification: verification.get(company.id) ?? null,
      confirmedRisks: company.events.length,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/repositories/benchmarkInputs.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/benchmarkInputs.ts src/lib/repositories/benchmarkInputs.test.ts
git commit -m "feat(benchmark): assemble per-company metric inputs from runs, snapshots, verification and confirmed risks"
```

---

### Task 4: 엑셀 랭킹 시트와 Route Handler

**Files:**
- Create: `src/lib/services/rankingExcel.ts`
- Create: `src/app/api/companies/benchmark/route.ts`
- Test: `src/lib/services/rankingExcel.test.ts`
- Test: `src/app/api/companies/benchmark/route.test.ts`

**Interfaces:**
- Consumes: `rankCompanies`, `loadRubrics`, `weightLabel`, `METRIC_LABEL`, `BenchmarkRow` (Task 1·2), `listBenchmarkInputs` (Task 3), `fitColumns` from `@/lib/services/reportExcel`, `auth` from `@/auth`
- Produces:
  ```ts
  export async function buildRankingWorkbook(input: { year: number; rows: BenchmarkRow[]; weightLabel: string; formulaVersion: string }): Promise<Buffer>;
  export function rankingFileName(year: number): string; // `${year}년 벤치마킹 랭킹.xlsx`
  ```
  `GET /api/companies/benchmark?year=2026&rubric=ict` → `{ year, formulaVersion, rubric: { id, name, weightLabel }, rows }`; `&format=xlsx` → xlsx 첨부

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/services/rankingExcel.test.ts
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
    const buffer = await buildRankingWorkbook({ year: 2026, rows, weightLabel: weightLabel(book.default), formulaVersion: book.formulaVersion });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("벤치마킹 랭킹")!;

    expect(String(sheet.getCell("A2").value)).toContain("감성 0.3 · 수상 0.2");
    expect(sheet.getRow(4).values).toEqual([undefined, "순위", "기업", "판정", "총점", "감성", "수상", "투자", "재무", "검증", "리스크 감점", "산업", "루브릭"]);
    expect(sheet.getCell("B5").value).toBe("㈜가");
    expect(sheet.getCell("I5").value).toBe("—");
    expect(sheet.getCell("A6").value).toBe("—");
    expect(sheet.getCell("D6").value).toBe("—");
  });

  test("names the file by year", () => {
    expect(rankingFileName(2026)).toBe("2026년 벤치마킹 랭킹.xlsx");
  });
});
```

```ts
// src/app/api/companies/benchmark/route.test.ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { GET } from "@/app/api/companies/benchmark/route";

describe("GET /api/companies/benchmark", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "1" } } as never);
  });

  test("rejects anonymous callers", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await GET(new Request("http://localhost/api/companies/benchmark?year=2026"));
    expect(response.status).toBe(401);
  });

  test("returns ranked rows with the rubric spelled out", async () => {
    await prisma.company.create({ data: { name: "㈜가", year: 2026, industry: "SW" } });
    const response = await GET(new Request("http://localhost/api/companies/benchmark?year=2026&rubric=ict"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.rubric).toMatchObject({ id: "ict", name: "ICT" });
    expect(body.rubric.weightLabel).toContain("리스크 감점");
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ name: "㈜가", rubricId: "ict", total: null, rank: null });
  });

  test("streams xlsx when asked", async () => {
    await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const response = await GET(new Request("http://localhost/api/companies/benchmark?year=2026&format=xlsx"));
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });

  test("400s on a rubric it does not know", async () => {
    const response = await GET(new Request("http://localhost/api/companies/benchmark?year=2026&rubric=nope"));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/services/rankingExcel.test.ts src/app/api/companies/benchmark/route.test.ts`
Expected: FAIL — unresolved imports

- [ ] **Step 3: Implement the workbook**

```ts
// src/lib/services/rankingExcel.ts
import ExcelJS from "exceljs";
import { METRIC_KEYS, METRIC_LABEL, type BenchmarkRow } from "@/lib/services/benchmarking";
import { fitColumns } from "@/lib/services/reportExcel";

const DASH = "—";

function verdictOf(row: BenchmarkRow): string {
  const verification = row.metrics.find((metric) => metric.key === "verification")?.raw;
  if (verification === null || verification === undefined) return "미분석";
  return verification === 1 ? "검증 통과" : "검토 필요";
}

function cell(value: number | null, digits = 2): string | number {
  return value === null ? DASH : Number(value.toFixed(digits));
}

/**
 * 랭킹 시트 하나짜리 워크북을 만든다. 첫 줄에 가중치와 산식 버전을 적는다 — 숫자만 있는 표는 근거자료가 아니다.
 */
export async function buildRankingWorkbook(input: { year: number; rows: BenchmarkRow[]; weightLabel: string; formulaVersion: string }): Promise<Buffer> {
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
      verdictOf(row),
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
```

- [ ] **Step 4: Implement the route**

```ts
// src/app/api/companies/benchmark/route.ts
import { auth } from "@/auth";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";
import { loadRubrics, rankCompanies, weightLabel } from "@/lib/services/benchmarking";
import { buildRankingWorkbook, rankingFileName } from "@/lib/services/rankingExcel";

export async function GET(request: Request) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  if (!Number.isInteger(year)) return Response.json({ message: "year 가 필요합니다." }, { status: 400 });

  const book = loadRubrics();
  const rubricId = url.searchParams.get("rubric") ?? undefined;
  const rubric = rubricId ? [book.default, ...book.rubrics].find((entry) => entry.id === rubricId) : book.default;
  if (!rubric) return Response.json({ message: "알 수 없는 루브릭입니다." }, { status: 400 });

  const rows = rankCompanies(await listBenchmarkInputs(year), book, rubricId);
  const label = weightLabel(rubric);

  if (url.searchParams.get("format") === "xlsx") {
    const buffer = await buildRankingWorkbook({ year, rows, weightLabel: label, formulaVersion: book.formulaVersion });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(rankingFileName(year))}`,
      },
    });
  }

  return Response.json({ year, formulaVersion: book.formulaVersion, rubric: { id: rubric.id, name: rubric.name, weightLabel: label }, rows });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/services/rankingExcel.test.ts src/app/api/companies/benchmark/route.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/rankingExcel.ts src/lib/services/rankingExcel.test.ts src/app/api/companies/benchmark
git commit -m "feat(benchmark): ranking workbook and benchmark route with xlsx export"
```

---

### Task 5: 랭킹 표 컴포넌트

**Files:**
- Create: `src/components/ranking/ranking-table.tsx`
- Test: `src/components/ranking/ranking-table.test.tsx`

**Interfaces:**
- Consumes: `BenchmarkRow`, `METRIC_KEYS`, `METRIC_LABEL` (Task 2), `Segmented` (`@/components/ui/segmented`), `VerdictPill` (`@/components/dashboard/verdict-pill`), `Verdict` (`@/lib/services/verdictRollup`)
- Produces:
  ```ts
  export type RankingRow = BenchmarkRow & { verdict: Verdict; businessNo: string | null };
  export function RankingTable({ rows, industries }: { rows: RankingRow[]; industries: string[] }): JSX.Element;
  ```
  클라이언트 컴포넌트. 정렬(총점·기업명·순위)·산업 필터를 상태로 가진다. 루브릭 셀렉터와 내보내기는 페이지(Task 6)가 URL 로 다룬다.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ranking/ranking-table.test.tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { RankingTable, type RankingRow } from "@/components/ranking/ranking-table";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";

function rows(): RankingRow[] {
  const ranked = rankCompanies(
    [
      { companyId: 1, name: "㈜가", industry: "SW", sentiment: 8, awards: 1, investments: 1, revenue: 100, verification: "verified", confirmedRisks: 0 },
      { companyId: 2, name: "㈜나", industry: "의료/헬스케어", sentiment: 2, awards: 0, investments: 0, revenue: null, verification: "needs_review", confirmedRisks: 1 },
      { companyId: 3, name: "㈜다", industry: null, sentiment: null, awards: null, investments: null, revenue: null, verification: null, confirmedRisks: 0 },
    ],
    loadRubrics(),
  );
  return ranked.map((row) => ({
    ...row,
    businessNo: row.companyId === 3 ? null : "1234567890",
    verdict: row.companyId === 1 ? "verified" : row.companyId === 2 ? "review" : "pending",
  }));
}

describe("RankingTable", () => {
  test("shows the eleven columns in the brief's order", () => {
    render(<RankingTable rows={rows()} industries={["SW", "의료/헬스케어"]} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["순위", "기업", "판정", "총점", "감성", "수상", "투자", "재무", "검증", "리스크 감점", "산업"]);
  });

  test("marks a missing metric with — and the hatch, never 0", () => {
    render(<RankingTable rows={rows()} industries={[]} />);
    const na = screen.getByRole("row", { name: /㈜나/ });
    const finance = within(na).getAllByRole("cell")[7];
    expect(finance).toHaveTextContent("—");
    expect(finance.firstElementChild).toHaveClass("hatch");
  });

  test("leaves an unanalysed company unranked and warns when there is no business number", () => {
    render(<RankingTable rows={rows()} industries={[]} />);
    const da = screen.getByRole("row", { name: /㈜다/ });
    expect(within(da).getAllByRole("cell")[0]).toHaveTextContent("—");
    expect(within(da).getByText("사업자번호 미확보")).toBeInTheDocument();
    expect(within(da).getByText("미분석")).toBeInTheDocument();
  });

  test("filters by industry and sorts by name", () => {
    render(<RankingTable rows={rows()} industries={["SW", "의료/헬스케어"]} />);
    fireEvent.click(screen.getByRole("radio", { name: "기업명" }));
    const names = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names[0]).toContain("㈜가");
    fireEvent.change(screen.getByRole("combobox", { name: "산업" }), { target: { value: "SW" } });
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  test("prints the penalty as a negative number only when a risk was confirmed", () => {
    render(<RankingTable rows={rows()} industries={[]} />);
    expect(within(screen.getByRole("row", { name: /㈜나/ })).getAllByRole("cell")[9]).toHaveTextContent("-0.20");
    expect(within(screen.getByRole("row", { name: /㈜가/ })).getAllByRole("cell")[9]).toHaveTextContent("0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ranking/ranking-table.test.tsx`
Expected: FAIL — unresolved import

- [ ] **Step 3: Implement**

```tsx
// src/components/ranking/ranking-table.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { VerdictPill } from "@/components/dashboard/verdict-pill";
import { Segmented } from "@/components/ui/segmented";
import { METRIC_KEYS, METRIC_LABEL, type BenchmarkRow } from "@/lib/services/benchmarking";
import type { Verdict } from "@/lib/services/verdictRollup";

export type RankingRow = BenchmarkRow & { verdict: Verdict; businessNo: string | null };

type Sort = "rank" | "name" | "total";

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "rank", label: "순위" },
  { value: "total", label: "총점" },
  { value: "name", label: "기업명" },
];

function compare(sort: Sort) {
  return (a: RankingRow, b: RankingRow) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ko");
    return (b.total ?? -1) - (a.total ?? -1) || a.name.localeCompare(b.name, "ko");
  };
}

function Missing() {
  return <span className="hatch block h-4 w-10 text-center text-[11px] leading-4 text-muted-foreground">—</span>;
}

function score(value: number | null, digits = 2) {
  return value === null ? <Missing /> : <span className="font-mono tabular-nums">{value.toFixed(digits)}</span>;
}

/**
 * 랭킹 표 — 순위·판정·총점·지표 5·감점·산업. 결측은 빗금 — 이고, 순위 없는 기업도 표에 남는다.
 * 루브릭 선택과 내보내기는 URL 로 다루므로 여기에는 정렬·산업 필터만 있다.
 */
export function RankingTable({ rows, industries }: { rows: RankingRow[]; industries: string[] }) {
  const [sort, setSort] = useState<Sort>("rank");
  const [industry, setIndustry] = useState("");

  const visible = rows.filter((row) => industry === "" || row.industry === industry).sort(compare(sort));

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline py-2 text-[11.5px]">
        <Segmented label="정렬" value={sort} options={SORTS} onChange={setSort} />
        <label className="ml-auto flex items-center gap-2 text-muted-foreground">
          산업
          <select aria-label="산업" value={industry} onChange={(event) => setIndustry(event.target.value)} className="border-[1.5px] border-hairline bg-background px-2 py-0.5 text-[11.5px] text-foreground">
            <option value="">전체</option>
            {industries.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <caption className="sr-only">벤치마킹 랭킹</caption>
          <thead>
            <tr className="border-b-2 border-ink text-[11px] font-bold tracking-[0.06em]">
              <th scope="col" className="px-2 py-2 text-left">순위</th>
              <th scope="col" className="px-2 py-2 text-left">기업</th>
              <th scope="col" className="px-2 py-2 text-left">판정</th>
              <th scope="col" className="px-2 py-2 text-right">총점</th>
              {METRIC_KEYS.map((key) => (
                <th key={key} scope="col" className="px-2 py-2 text-right">{METRIC_LABEL[key]}</th>
              ))}
              <th scope="col" className="whitespace-nowrap px-2 py-2 text-right">리스크 감점</th>
              <th scope="col" className="px-2 py-2 text-left">산업</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.companyId} className="border-b border-hairline align-middle last:border-0">
                <td className="px-2 py-1.5 font-display text-[16px] font-black tabular-nums">{row.rank ?? "—"}</td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-col gap-0.5">
                    <Link href={`/companies/${row.companyId}`} className="font-semibold hover:underline">{row.name}</Link>
                    {row.businessNo ? null : <span className="text-[11px] font-semibold text-review">사업자번호 미확보</span>}
                  </div>
                </td>
                <td className="px-2 py-1.5"><VerdictPill verdict={row.verdict} /></td>
                <td className="px-2 py-1.5 text-right">{score(row.total, 3)}</td>
                {row.metrics.map((metric) => (
                  <td key={metric.key} className="px-2 py-1.5 text-right">{score(metric.normalised)}</td>
                ))}
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">{row.riskPenalty === 0 ? "0" : `-${row.riskPenalty.toFixed(2)}`}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{row.industry ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ranking/ranking-table.test.tsx`
Expected: PASS (5 tests). `Missing` 은 `<span class="hatch">` 가 셀의 첫 자식이 되도록 셀 안에 바로 둔다.

- [ ] **Step 5: Commit**

```bash
git add src/components/ranking
git commit -m "feat(benchmark): ranking table with hatch for missing metrics"
```

---

### Task 6: `/ranking` 페이지와 내비

**Files:**
- Create: `src/app/ranking/page.tsx`
- Modify: `src/components/layout/app-shell.tsx:5-8` (NAV_ITEMS)
- Modify: `src/components/layout/app-shell.test.tsx:14-27`
- Modify: `src/proxy.ts` — `/ranking` 이 보호 경로 목록에 있는지 확인, 없으면 추가
- Test: `src/app/ranking/page.test.tsx`

**Interfaces:**
- Consumes: `listBenchmarkInputs` (Task 3), `rankCompanies`·`loadRubrics`·`weightLabel` (Task 1·2), `RankingTable` (Task 5), `rollupVerdicts`·`listLatestVerifications`·`listCompanyPipeline`·`listCompanies`·`listYears` (기존), `Panel`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/layout/app-shell.test.tsx — replace the nav test
  test("shows the three places this tool has — trends, companies, ranking", () => {
    render(<AppShell>본문</AppShell>);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });

    expect(within(nav).getAllByRole("link")).toHaveLength(3);
    expect(within(nav).getByRole("link", { name: "동향" })).toHaveAttribute("href", "/dashboard");
    expect(within(nav).getByRole("link", { name: "기업" })).toHaveAttribute("href", "/companies");
    expect(within(nav).getByRole("link", { name: "랭킹" })).toHaveAttribute("href", "/ranking");
  });
```

```tsx
// src/app/ranking/page.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import RankingPage from "@/app/ranking/page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("/ranking", () => {
  beforeEach(resetDatabase);

  test("names the year, the rubric weights and the single export action", async () => {
    await prisma.company.create({ data: { name: "㈜가", year: 2026, industry: "SW" } });
    const page = await RankingPage({ params: Promise.resolve({}), searchParams: Promise.resolve({ year: "2026", rubric: "ict" }) } as never);
    render(page);

    expect(screen.getByRole("heading", { level: 1, name: "2026년 벤치마킹" })).toBeInTheDocument();
    expect(screen.getByText(/감성 0\.25 · 수상 0\.2 · 투자 0\.25 · 재무 0\.15 · 검증 0\.15 · 리스크 감점/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "엑셀 내보내기" })).toHaveAttribute("href", "/api/companies/benchmark?year=2026&rubric=ict&format=xlsx");
    expect(screen.getByRole("link", { name: "ICT" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("row", { name: /㈜가/ })).toBeInTheDocument();
  });

  test("uses the default rubric and the latest year when nothing is asked", async () => {
    await prisma.company.create({ data: { name: "㈜나", year: 2025 } });
    render(await RankingPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) } as never));
    expect(screen.getByRole("heading", { level: 1, name: "2025년 벤치마킹" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기본" })).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/ranking/page.test.tsx src/components/layout/app-shell.test.tsx`
Expected: FAIL — page module missing; nav has 2 links

- [ ] **Step 3: Add the nav item**

```ts
// src/components/layout/app-shell.tsx
const NAV_ITEMS = [
  { href: "/dashboard", label: "동향" },
  { href: "/companies", label: "기업" },
  { href: "/ranking", label: "랭킹" },
] as const;
```

`src/proxy.ts` 를 열어 보호 경로가 목록형이면 `/ranking` 을 넣는다(모든 경로를 보호하는 matcher 면 손대지 않는다).

- [ ] **Step 4: Write the page**

```tsx
// src/app/ranking/page.tsx
import { listCompanies, listYears } from "@/lib/repositories/companyRepository";
import { listCompanyPipeline } from "@/lib/repositories/companyPipeline";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";
import { loadRubrics, rankCompanies, weightLabel } from "@/lib/services/benchmarking";
import { rollupVerdicts } from "@/lib/services/verdictRollup";
import { Panel } from "@/components/dashboard/panel";
import { RankingTable, type RankingRow } from "@/components/ranking/ranking-table";

export default async function RankingPage({ searchParams }: PageProps<"/ranking">) {
  const params = await searchParams;
  const years = await listYears();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) ? requested : (years[0] ?? new Date().getFullYear());

  const book = loadRubrics();
  const choices = [book.default, ...book.rubrics];
  const rubricParam = typeof params.rubric === "string" ? params.rubric : "default";
  const rubric = choices.find((entry) => entry.id === rubricParam) ?? book.default;
  const forced = rubric.id === "default" ? undefined : rubric.id;

  const companies = await listCompanies({ year });
  const registry = companies.map((company) => ({ id: company.id, name: company.name, businessNo: company.businessNo ?? null }));
  const verdicts = rollupVerdicts({ companies: registry, verifications: await listLatestVerifications(year), pipeline: await listCompanyPipeline(year) });
  const verdictOf = new Map(verdicts.companies.map((entry) => [entry.companyId, entry.verdict]));
  const businessNoOf = new Map(registry.map((entry) => [entry.id, entry.businessNo]));

  const ranked = rankCompanies(await listBenchmarkInputs(year), book, forced);
  const rows: RankingRow[] = ranked.map((row) => ({ ...row, verdict: verdictOf.get(row.companyId) ?? "pending", businessNo: businessNoOf.get(row.companyId) ?? null }));
  const industries = [...new Set(rows.map((row) => row.industry).filter((value): value is string => value !== null))].sort((a, b) => a.localeCompare(b, "ko"));
  const exportHref = `/api/companies/benchmark?year=${year}&rubric=${rubric.id}&format=xlsx`;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{year}년 우수기업 · 산업별 루브릭</span>
          <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">{year}년 벤치마킹</h1>
          <p className="text-[12.5px] text-muted-foreground">
            가중치 <b className="font-mono text-foreground">{weightLabel(rubric)}</b> · 산식 <span className="font-mono">{book.formulaVersion}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <nav aria-label="루브릭" className="flex">
            {choices.map((entry) => (
              <a
                key={entry.id}
                href={`/ranking?year=${year}&rubric=${entry.id}`}
                aria-current={entry.id === rubric.id ? "page" : undefined}
                className="-ml-px border-[1.5px] border-hairline px-3 py-1 text-[12px] font-bold text-muted-foreground first:ml-0 hover:bg-secondary aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-background"
              >
                {entry.name}
              </a>
            ))}
          </nav>
          <a href={exportHref} className="flex items-center border border-primary bg-primary px-3.5 py-2 text-[12.5px] font-bold text-primary-foreground hover:bg-primary/90">
            엑셀 내보내기
          </a>
        </div>
      </header>

      <Panel index="01" title="랭킹" tag="실측" note="정규화 0~1 · 결측은 — · 리스크는 확인된 사건만 감점" empty="등록된 기업이 없습니다.">
        {rows.length === 0 ? null : <RankingTable rows={rows} industries={industries} />}
      </Panel>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/ranking/page.test.tsx src/components/layout/app-shell.test.tsx`
Expected: PASS. `PageProps<"/ranking">` 타입이 없다고 하면 `npx next typegen` 을 먼저 돌린다.

- [ ] **Step 6: Whole-suite gate**

Run: `npx vitest run && npm run lint && npm run build`
Expected: 전부 통과, lint 오류 0

- [ ] **Step 7: Commit**

```bash
git add src/app/ranking src/components/layout/app-shell.tsx src/components/layout/app-shell.test.tsx src/proxy.ts
git commit -m "feat: industry-weighted benchmarking ranking"
```

---

### Task 7: 문서 갱신

**Files:**
- Modify: `CLAUDE.md` §프로젝트 (Phase B 진행 상태 한 줄)
- Modify: `docs/superpowers/plans/2026-08-26-nextjs-rearchitecture.md` §Task 12 — 파일 경로 실측(`src/lib/services/rubrics.json`, TanStack 미채택) 반영

- [ ] **Step 1: Edit** — CLAUDE.md 의 "남은 것은 사이드카(3·6·15), Phase B(11~14), 배포(16)다." 를 "남은 것은 사이드카(3·6·15), Phase B 중 13·14(12 벤치마킹 랭킹은 완료, 11 은 사건 모니터링이 대체), 배포(16)다." 로 바꾼다. 로드맵 Task 12 항목의 `config/rubrics.json` 을 `src/lib/services/rubrics.json` 으로, `UI(TanStack Table)` 을 `UI(자체 표 — Segmented·Panel 재사용)` 로 고친다.
- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-08-26-nextjs-rearchitecture.md
git commit -m "docs: record benchmarking ranking as done"
```
