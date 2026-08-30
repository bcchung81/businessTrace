# Task 14 — 연도별 이력 트래킹·시상 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/ranking` 의 "시상 확정" 한 번으로 연도별 선정 기록(등급·총점·지표·산식 버전)을 남기고, `/history` 에서 점수 추이·시상 카테고리·연간 사건 피벗을 본다.

**Architecture:** 확정 시점의 `rankCompanies` 결과를 `SelectionRecord` 로 동결한다(산식이 바뀌어도 과거 기록은 그대로). 시상 카테고리는 저장된 기록만 읽는 순수 함수 `awards.ts` 로 산출하고, 사건 피벗도 순수 함수 `eventPivot.ts` 다. 화면은 기존 패턴 그대로 — 서버 컴포넌트가 리포지토리를 직접 읽고, 쓰기는 server action 하나다. 로드맵의 `api/companies/{history,awards}` 라우트는 만들지 않는다(현행 코드베이스는 서버 컴포넌트 직접 조회가 표준, 인계 문서 §4 가 우선).

**Tech Stack:** Next.js 16 App Router · Prisma(SQLite) · Recharts 3 · vitest + Testing Library

**Spec:** `docs/superpowers/plans/2026-09-01-next-session.md` §4 + 마스터 로드맵 `2026-08-26-nextjs-rearchitecture.md` §Task 14

## Global Constraints

- 주석은 함수 설명 JSDoc 만, 본문 3줄 이내 (CLAUDE.md)
- 실패 테스트 → 구현 → 통과 → 태스크 단위 커밋. 커밋 훅이 전체 스위트를 돌리므로 **파일 생성 명령과 커밋 명령을 분리**한다
- 외부 API 없음 — 이 태스크는 전부 로컬 DB·순수 함수다
- 디자인: 사각·그림자 없음. "시상 확정" 버튼은 `signal-outline` 톤(primary CTA 는 엑셀 내보내기와 충돌), 확정은 모달 안에서 primary. 숫자 열은 `tabular-nums`
- 리포지토리 테스트는 실 DB 사용: `import { resetDatabase } from "@/lib/test-support/db"` + `beforeEach(resetDatabase)` (eventRepository.test.ts 관례)
- `/history` 는 `src/proxy.ts` 가 자동 보호한다 — 라우트 접근 설정 불필요
- **가정(집행 중 되묻지 않기):** 등급은 rank 기준 상위 10 = `"우수"`, 나머지 = `"선정"`. `total === null`(미분석) 기업은 기록하지 않는다. 상수 `EXCELLENT_TOP_N = 10` 은 `awards.ts` 에 둔다

---

### Task 1: SelectionRecord 스키마 + 리포지토리

**Files:**
- Modify: `prisma/schema.prisma` (모델 추가 + Company 관계)
- Create: `src/lib/repositories/selectionRecord.ts`
- Test: `src/lib/repositories/selectionRecord.test.ts`

**Interfaces:**
- Consumes: `MetricScore` (`@/lib/services/benchmarking`)
- Produces:
  - `SelectionInput = { companyId: number; year: number; grade: string; total: number; rank: number | null; metrics: MetricScore[]; formulaVersion: string; decidedBy: number }`
  - `SelectionRow = SelectionInput & { companyName: string; decidedAt: string }`
  - `saveSelections(rows: SelectionInput[]): Promise<number>` — (companyId, year) upsert, 저장 건수 반환
  - `listSelections(filter?: { year?: number }): Promise<SelectionRow[]>` — 연도↑, 총점↓ 정렬
  - `listSelectionYears(): Promise<number[]>` — 내림차순

- [ ] **Step 1: 스키마 추가**

`prisma/schema.prisma` 의 `model Company` 관계 목록에 `selections SelectionRecord[]` 한 줄을 추가하고, 파일 끝에:

```prisma
model SelectionRecord {
  id             Int      @id @default(autoincrement())
  companyId      Int
  company        Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  year           Int
  grade          String
  total          Float
  rank           Int?
  metricsJson    String
  formulaVersion String
  decidedAt      DateTime @default(now())
  decidedBy      Int

  @@unique([companyId, year])
  @@index([year])
}
```

- [ ] **Step 2: 마이그레이션**

Run: `npx prisma migrate dev --name selection_record`
Expected: 새 마이그레이션 폴더 생성, 오류 없음 (test.db 는 test-support 가 알아서 맞춘다 — eventRepository 관례 확인)

- [ ] **Step 3: 실패 테스트 작성**

`src/lib/repositories/selectionRecord.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listSelections, listSelectionYears, saveSelections } from "@/lib/repositories/selectionRecord";
import type { MetricScore } from "@/lib/services/benchmarking";

const METRICS: MetricScore[] = [{ key: "sentiment", raw: 5, normalised: 0.8, weight: 0.25 }];

function input(companyId: number, over: Partial<Parameters<typeof saveSelections>[0][number]> = {}) {
  return { companyId, year: 2026, grade: "우수", total: 0.71, rank: 1, metrics: METRICS, formulaVersion: "rank-v1", decidedBy: 1, ...over };
}

describe("selectionRecord repository", () => {
  beforeEach(resetDatabase);

  it("saves one record per company and year, and re-deciding overwrites it", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2026 } });
    expect(await saveSelections([input(company.id)])).toBe(1);
    await saveSelections([input(company.id, { total: 0.65, grade: "선정", rank: 11 })]);

    const rows = await listSelections({ year: 2026 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ companyName: "딥노이드", total: 0.65, grade: "선정", rank: 11, formulaVersion: "rank-v1" });
    expect(rows[0].metrics).toEqual(METRICS);
  });

  it("lists selections ordered by year then total, and years descending", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const b = await prisma.company.create({ data: { name: "나", year: 2025 } });
    await saveSelections([
      input(a.id, { year: 2025, total: 0.4, rank: 2, grade: "선정" }),
      input(b.id, { year: 2025, total: 0.9, rank: 1 }),
      input(a.id, { year: 2026, total: 0.6 }),
    ]);

    const rows = await listSelections();
    expect(rows.map((row) => [row.year, row.companyName])).toEqual([[2025, "나"], [2025, "가"], [2026, "가"]]);
    expect(await listSelectionYears()).toEqual([2026, 2025]);
  });
});
```

- [ ] **Step 4: 실패 확인**

Run: `npx vitest run src/lib/repositories/selectionRecord.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 5: 리포지토리 구현**

`src/lib/repositories/selectionRecord.ts`:

```ts
import { prisma } from "@/lib/db";
import type { MetricScore } from "@/lib/services/benchmarking";

export type SelectionInput = {
  companyId: number; year: number; grade: string; total: number; rank: number | null;
  metrics: MetricScore[]; formulaVersion: string; decidedBy: number;
};
export type SelectionRow = SelectionInput & { companyName: string; decidedAt: string };

/**
 * 시상 확정 기록을 (기업, 연도) 단위로 upsert 한다 — 재확정은 그 연도 기록을 덮어쓴다.
 */
export async function saveSelections(rows: SelectionInput[]): Promise<number> {
  for (const row of rows) {
    const data = {
      grade: row.grade, total: row.total, rank: row.rank,
      metricsJson: JSON.stringify(row.metrics), formulaVersion: row.formulaVersion,
      decidedAt: new Date(), decidedBy: row.decidedBy,
    };
    await prisma.selectionRecord.upsert({
      where: { companyId_year: { companyId: row.companyId, year: row.year } },
      create: { companyId: row.companyId, year: row.year, ...data },
      update: data,
    });
  }
  return rows.length;
}

/**
 * 확정 기록을 연도 오름차순 → 총점 내림차순으로 낸다. 추이·시상 산출이 이 순서를 전제한다.
 */
export async function listSelections(filter: { year?: number } = {}): Promise<SelectionRow[]> {
  const rows = await prisma.selectionRecord.findMany({
    where: filter.year === undefined ? {} : { year: filter.year },
    orderBy: [{ year: "asc" }, { total: "desc" }],
    include: { company: { select: { name: true } } },
  });
  return rows.map((row) => ({
    companyId: row.companyId, companyName: row.company.name, year: row.year, grade: row.grade,
    total: row.total, rank: row.rank, metrics: JSON.parse(row.metricsJson) as MetricScore[],
    formulaVersion: row.formulaVersion, decidedAt: row.decidedAt.toISOString(), decidedBy: row.decidedBy,
  }));
}

export async function listSelectionYears(): Promise<number[]> {
  const rows = await prisma.selectionRecord.findMany({ select: { year: true }, distinct: ["year"], orderBy: { year: "desc" } });
  return rows.map((row) => row.year);
}
```

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run src/lib/repositories/selectionRecord.test.ts`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat(history): SelectionRecord schema and repository"
```

---

### Task 2: 등급 규칙 + 시상 카테고리 순수 함수

**Files:**
- Create: `src/lib/services/awards.ts`
- Test: `src/lib/services/awards.test.ts`

**Interfaces:**
- Consumes: `BenchmarkRow` (`@/lib/services/benchmarking`), `SelectionInput`/`SelectionRow` (Task 1)
- Produces:
  - `EXCELLENT_TOP_N = 10`
  - `gradeOf(rank: number | null): "우수" | "선정"`
  - `toSelectionInputs(rows: BenchmarkRow[], meta: { year: number; formulaVersion: string; decidedBy: number }): SelectionInput[]` — `total === null` 제외
  - `AwardWinner = { companyId: number; companyName: string; detail: string }`
  - `AwardCategory = { id: "three_year_excellent" | "top_growth" | "best_newcomer"; label: string; winners: AwardWinner[] }`
  - `computeAwards(records: SelectionRow[], targetYear: number, topN?: number): AwardCategory[]` — 항상 3개 카테고리, 해당자 없으면 `winners: []`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/services/awards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SelectionRow } from "@/lib/repositories/selectionRecord";
import { computeAwards, gradeOf, toSelectionInputs, EXCELLENT_TOP_N } from "@/lib/services/awards";
import type { BenchmarkRow } from "@/lib/services/benchmarking";

function record(companyId: number, name: string, year: number, total: number, rank: number): SelectionRow {
  return { companyId, companyName: name, year, grade: gradeOf(rank), total, rank, metrics: [], formulaVersion: "rank-v1", decidedAt: "2026-09-01T00:00:00.000Z", decidedBy: 1 };
}

function benchmarkRow(companyId: number, name: string, total: number | null, rank: number | null): BenchmarkRow {
  return { companyId, name, industry: null, rubricId: "default", rubricName: "기본", metrics: [], riskPenalty: 0, total, rank };
}

describe("gradeOf", () => {
  it("grades the top ten as 우수 and the rest as 선정", () => {
    expect(gradeOf(1)).toBe("우수");
    expect(gradeOf(EXCELLENT_TOP_N)).toBe("우수");
    expect(gradeOf(EXCELLENT_TOP_N + 1)).toBe("선정");
    expect(gradeOf(null)).toBe("선정");
  });
});

describe("toSelectionInputs", () => {
  it("freezes ranked rows and drops companies without a total", () => {
    const inputs = toSelectionInputs(
      [benchmarkRow(1, "가", 0.7, 1), benchmarkRow(2, "나", null, null)],
      { year: 2026, formulaVersion: "rank-v1", decidedBy: 7 },
    );

    expect(inputs).toEqual([
      { companyId: 1, year: 2026, grade: "우수", total: 0.7, rank: 1, metrics: [], formulaVersion: "rank-v1", decidedBy: 7 },
    ]);
  });
});

describe("computeAwards", () => {
  it("finds a company excellent three years in a row", () => {
    const records = [record(1, "가", 2024, 0.6, 3), record(1, "가", 2025, 0.62, 2), record(1, "가", 2026, 0.61, 4), record(2, "나", 2026, 0.9, 1)];
    const [threeYear] = computeAwards(records, 2026);

    expect(threeYear.id).toBe("three_year_excellent");
    expect(threeYear.winners.map((w) => w.companyName)).toEqual(["가"]);
  });

  it("awards the biggest year-over-year total growth", () => {
    const records = [
      record(1, "가", 2025, 0.5, 2), record(1, "가", 2026, 0.55, 3),
      record(2, "나", 2025, 0.4, 3), record(2, "나", 2026, 0.7, 1),
    ];
    const growth = computeAwards(records, 2026).find((c) => c.id === "top_growth")!;

    expect(growth.winners).toEqual([{ companyId: 2, companyName: "나", detail: "+0.30 (0.40 → 0.70)" }]);
  });

  it("awards the best score among companies first recorded in the target year", () => {
    const records = [record(1, "가", 2025, 0.5, 1), record(1, "가", 2026, 0.9, 1), record(2, "나", 2026, 0.6, 2), record(3, "다", 2026, 0.4, 3)];
    const newcomer = computeAwards(records, 2026).find((c) => c.id === "best_newcomer")!;

    expect(newcomer.winners.map((w) => w.companyName)).toEqual(["나"]);
  });

  it("keeps every category present with empty winners when nothing qualifies", () => {
    const categories = computeAwards([], 2026);

    expect(categories.map((c) => c.id)).toEqual(["three_year_excellent", "top_growth", "best_newcomer"]);
    expect(categories.every((c) => c.winners.length === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/services/awards.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/services/awards.ts`:

```ts
import type { SelectionInput, SelectionRow } from "@/lib/repositories/selectionRecord";
import type { BenchmarkRow } from "@/lib/services/benchmarking";

export const EXCELLENT_TOP_N = 10;

export type AwardWinner = { companyId: number; companyName: string; detail: string };
export type AwardCategory = { id: "three_year_excellent" | "top_growth" | "best_newcomer"; label: string; winners: AwardWinner[] };

/**
 * 순위로 등급을 정한다 — 상위 10 이 우수, 나머지는 선정이다.
 */
export function gradeOf(rank: number | null): "우수" | "선정" {
  return rank !== null && rank <= EXCELLENT_TOP_N ? "우수" : "선정";
}

/**
 * 확정 시점의 랭킹을 저장용 기록으로 동결한다. 총점 없는(미분석) 기업은 이력이 아니다.
 */
export function toSelectionInputs(rows: BenchmarkRow[], meta: { year: number; formulaVersion: string; decidedBy: number }): SelectionInput[] {
  return rows
    .filter((row): row is BenchmarkRow & { total: number } => row.total !== null)
    .map((row) => ({
      companyId: row.companyId, year: meta.year, grade: gradeOf(row.rank), total: row.total,
      rank: row.rank, metrics: row.metrics, formulaVersion: meta.formulaVersion, decidedBy: meta.decidedBy,
    }));
}

function byCompany(records: SelectionRow[]) {
  const map = new Map<number, SelectionRow[]>();
  for (const record of records) {
    map.set(record.companyId, [...(map.get(record.companyId) ?? []), record]);
  }
  return map;
}

/**
 * 저장된 확정 기록만으로 시상 카테고리를 산출한다 — 카테고리는 항상 3개, 해당자가 없으면 빈 목록이다.
 */
export function computeAwards(records: SelectionRow[], targetYear: number, topN = EXCELLENT_TOP_N): AwardCategory[] {
  const companies = byCompany(records);

  const threeYear: AwardWinner[] = [];
  const growth: Array<AwardWinner & { delta: number }> = [];
  const newcomers: Array<AwardWinner & { total: number }> = [];

  for (const [companyId, rows] of companies) {
    const of = (year: number) => rows.find((row) => row.year === year);
    const current = of(targetYear);
    if (!current) continue;

    if ([targetYear, targetYear - 1, targetYear - 2].every((year) => { const row = of(year); return row?.rank !== null && row !== undefined && (row.rank as number) <= topN; })) {
      threeYear.push({ companyId, companyName: current.companyName, detail: `${targetYear - 2}–${targetYear} 상위 ${topN}` });
    }

    const previous = of(targetYear - 1);
    if (previous) {
      const delta = current.total - previous.total;
      if (delta > 0) growth.push({ companyId, companyName: current.companyName, delta, detail: `+${delta.toFixed(2)} (${previous.total.toFixed(2)} → ${current.total.toFixed(2)})` });
    }

    const firstYear = Math.min(...rows.map((row) => row.year));
    if (firstYear === targetYear) newcomers.push({ companyId, companyName: current.companyName, total: current.total, detail: `첫 등록 · 총점 ${current.total.toFixed(2)}` });
  }

  const maxDelta = Math.max(...growth.map((w) => w.delta), 0);
  const maxNewTotal = Math.max(...newcomers.map((w) => w.total), 0);
  return [
    { id: "three_year_excellent", label: "3년 연속 우수", winners: threeYear },
    { id: "top_growth", label: "전년 대비 최다 성장", winners: growth.filter((w) => w.delta === maxDelta).map(({ delta: _delta, ...w }) => w) },
    { id: "best_newcomer", label: "신규 최고 점수", winners: newcomers.filter((w) => w.total === maxNewTotal).map(({ total: _total, ...w }) => w) },
  ];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/services/awards.test.ts`
Expected: PASS (성장·신규 카테고리가 빈 배열 케이스에서 `Math.max(..., 0)` 기본값 때문에 위양성이 나지 않는지 확인 — `growth.length === 0`/`newcomers.length === 0`이면 filter 결과도 빈 배열이다)

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(history): award categories and grade rules"
```

---

### Task 3: 연간 사건 피벗 순수 함수

**Files:**
- Create: `src/lib/services/eventPivot.ts`
- Test: `src/lib/services/eventPivot.test.ts`

**Interfaces:**
- Consumes: `EventRow` (`@/lib/repositories/eventRepository` — `occurredAt: string(ISO)`, `kind: EventKind`, `companyId`, `companyName`)
- Produces:
  - `PivotCell = { ym: string; total: number; byKind: Partial<Record<EventKind, number>> }`
  - `PivotRow = { companyId: number; companyName: string; total: number; cells: PivotCell[] }` — cells 는 12개(1~12월) 고정
  - `pivotEvents(events: EventRow[], year: number): { months: string[]; rows: PivotRow[] }` — rows 는 total 내림차순, 사건 없는 기업은 없음

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/services/eventPivot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { pivotEvents } from "@/lib/services/eventPivot";

function event(companyId: number, companyName: string, occurredAt: string, kind: EventRow["kind"]): EventRow {
  return { id: 0, companyId, companyName, kind, severity: "notice", occurredAt, title: "t", evidence: [], runId: null, trust: null, status: "open", note: null, reviewedAt: null };
}

describe("pivotEvents", () => {
  it("pivots events into company × month × kind counts over a fixed 12-month row", () => {
    const { months, rows } = pivotEvents(
      [
        event(1, "가", "2026-03-05T00:00:00.000Z", "award"),
        event(1, "가", "2026-03-20T00:00:00.000Z", "award"),
        event(1, "가", "2026-07-01T00:00:00.000Z", "closure"),
        event(2, "나", "2026-01-15T00:00:00.000Z", "investment"),
      ],
      2026,
    );

    expect(months).toHaveLength(12);
    expect(months[0]).toBe("202601");
    expect(rows.map((row) => row.companyName)).toEqual(["가", "나"]);
    expect(rows[0].total).toBe(3);
    expect(rows[0].cells[2]).toEqual({ ym: "202603", total: 2, byKind: { award: 2 } });
    expect(rows[0].cells[6]).toEqual({ ym: "202607", total: 1, byKind: { closure: 1 } });
  });

  it("ignores events outside the year and returns no row for silent companies", () => {
    const { rows } = pivotEvents([event(1, "가", "2025-12-31T00:00:00.000Z", "award")], 2026);

    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/services/eventPivot.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/services/eventPivot.ts`:

```ts
import type { EventRow } from "@/lib/repositories/eventRepository";
import type { EventKind } from "@/lib/services/eventRules";

export type PivotCell = { ym: string; total: number; byKind: Partial<Record<EventKind, number>> };
export type PivotRow = { companyId: number; companyName: string; total: number; cells: PivotCell[] };

/**
 * 사건 목록을 기업×월×종류 집계로 편다. 12칸이 고정이라 화면이 달마다 흔들리지 않는다.
 */
export function pivotEvents(events: EventRow[], year: number): { months: string[]; rows: PivotRow[] } {
  const months = Array.from({ length: 12 }, (_, index) => `${year}${String(index + 1).padStart(2, "0")}`);
  const byCompany = new Map<number, PivotRow>();

  for (const event of events) {
    const occurred = new Date(event.occurredAt);
    if (occurred.getUTCFullYear() !== year) continue;
    const row = byCompany.get(event.companyId) ?? {
      companyId: event.companyId, companyName: event.companyName, total: 0,
      cells: months.map((ym) => ({ ym, total: 0, byKind: {} })),
    };
    const cell = row.cells[occurred.getUTCMonth()];
    cell.total += 1;
    cell.byKind[event.kind] = (cell.byKind[event.kind] ?? 0) + 1;
    row.total += 1;
    byCompany.set(event.companyId, row);
  }

  return { months, rows: [...byCompany.values()].sort((a, b) => b.total - a.total || a.companyName.localeCompare(b.companyName, "ko")) };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/services/eventPivot.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(history): annual event pivot"
```

---

### Task 4: `/ranking` 시상 확정 액션 + 모달

**Files:**
- Create: `src/app/ranking/actions.ts`
- Create: `src/components/ranking/confirm-selection.tsx`
- Modify: `src/app/ranking/page.tsx` (헤더 우측, 엑셀 내보내기 아래에 배치)
- Test: `src/components/ranking/confirm-selection.test.tsx`

**Interfaces:**
- Consumes: `rankCompanies`·`loadRubrics` (benchmarking), `toSelectionInputs` (Task 2), `saveSelections` (Task 1), `listBenchmarkInputs` (`@/lib/repositories/benchmarkInputs`), `Dialog` 계열 (`@/components/ui/dialog`)
- Produces: `confirmSelectionAction(input: { year: number; rubricId: string }): Promise<{ ok: true; saved: number } | { ok: false; message: string }>`

- [ ] **Step 1: 실패 테스트 작성**

`src/components/ranking/confirm-selection.test.tsx` — 액션은 서버 재계산이라 컴포넌트 테스트는 mock 액션으로 흐름만 본다:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmSelection } from "@/components/ranking/confirm-selection";

const confirm = vi.fn(async () => ({ ok: true as const, saved: 48 }));
vi.mock("@/app/ranking/actions", () => ({ confirmSelectionAction: (input: unknown) => confirm(input) }));

describe("ConfirmSelection", () => {
  it("opens a modal and calls the action with year and rubric, then reports the count", async () => {
    render(<ConfirmSelection year={2026} rubricId="default" count={48} formulaVersion="rank-v1" />);

    fireEvent.click(screen.getByRole("button", { name: "시상 확정" }));
    expect(screen.getByText(/48개사.*rank-v1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "확정 저장" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith({ year: 2026, rubricId: "default" }));
    await waitFor(() => expect(screen.getByText(/48건 저장/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/ranking/confirm-selection.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 액션 구현**

`src/app/ranking/actions.ts` — 클라이언트가 보낸 표를 믿지 않고 서버에서 재계산한다:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";
import { saveSelections } from "@/lib/repositories/selectionRecord";
import { toSelectionInputs } from "@/lib/services/awards";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";

export type ConfirmResult = { ok: true; saved: number } | { ok: false; message: string };

/**
 * 지금 화면의 산식 그대로 서버에서 다시 계산해 연도 기록으로 동결한다 — 클라이언트 표는 믿지 않는다.
 */
export async function confirmSelectionAction(input: { year: number; rubricId: string }): Promise<ConfirmResult> {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, message: "unauthorized" };

  const book = loadRubrics();
  const forced = input.rubricId === "default" ? undefined : input.rubricId;
  const ranked = rankCompanies(await listBenchmarkInputs(input.year), book, forced);
  const saved = await saveSelections(toSelectionInputs(ranked, { year: input.year, formulaVersion: book.formulaVersion, decidedBy: userId }));
  revalidatePath("/ranking");
  revalidatePath("/history");
  return { ok: true, saved };
}
```

- [ ] **Step 4: 모달 컴포넌트 구현**

`src/components/ranking/confirm-selection.tsx`:

```tsx
"use client";

import { useState } from "react";
import { confirmSelectionAction } from "@/app/ranking/actions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * 시상 확정 — 트리거는 signal-outline(주 CTA 는 엑셀 내보내기), 확정은 모달 안에서만 primary 다.
 */
export function ConfirmSelection({ year, rubricId, count, formulaVersion }: { year: number; rubricId: string; count: number; formulaVersion: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const result = await confirmSelectionAction({ year, rubricId });
    setBusy(false);
    setMessage(result.ok ? `${result.saved}건 저장 — /history 에 반영됐습니다.` : result.message);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="signal-outline" size="sm">시상 확정</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{year}년 시상 확정</DialogTitle>
          <DialogDescription>
            총점 있는 {count}개사를 산식 <span className="font-mono">{formulaVersion}</span> 으로 동결합니다. 재확정하면 이 연도 기록을 덮어씁니다.
          </DialogDescription>
        </DialogHeader>
        {message ? <p className="text-[12.5px]">{message}</p> : null}
        <DialogFooter>
          <Button onClick={confirm} disabled={busy}>확정 저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

주의: `Button` 의 variant 목록에 `signal-outline` 이 실제로 있는지 `src/components/ui/button.tsx` 에서 확인하고, 이름이 다르면(예: `signalOutline`) 그쪽을 따른다. `DialogDescription`/`DialogFooter` 도 `dialog.tsx` 의 실제 export 이름을 확인해 맞춘다.

- [ ] **Step 5: 페이지 wiring**

`src/app/ranking/page.tsx` 헤더 우측 열(`flex flex-col items-end gap-3`) 마지막에:

```tsx
<ConfirmSelection year={year} rubricId={rubric.id} count={rows.filter((row) => row.total !== null).length} formulaVersion={book.formulaVersion} />
```

import 추가: `import { ConfirmSelection } from "@/components/ranking/confirm-selection";`

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run src/components/ranking/confirm-selection.test.tsx`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat(ranking): selection confirm action and modal"
```

---

### Task 5: `/history` 페이지 + 점수 추이 + 내비 04 탭

**Files:**
- Create: `src/app/history/page.tsx`
- Create: `src/components/history/award-board.tsx`
- Create: `src/components/history/score-trend.tsx`
- Create: `src/components/history/event-pivot-table.tsx`
- Modify: `src/components/layout/side-tabs.tsx` (`NAV_ITEMS` 에 04 이력)
- Test: `src/components/history/score-trend.test.tsx`, `src/components/history/event-pivot-table.test.tsx`

**Interfaces:**
- Consumes: `listSelections`·`listSelectionYears` (Task 1), `computeAwards` (Task 2), `pivotEvents` (Task 3), `listEvents` (`@/lib/repositories/eventRepository`), `Panel` (`@/components/dashboard/panel`), Recharts (headcount-trend 문법: `ResponsiveContainer > LineChart > YAxis hide + Tooltip + Line`)
- Produces: `/history` 라우트, `TrendFacet = { companyId: number; name: string; grade: string; points: Array<{ year: number; total: number }> }`

- [ ] **Step 1: 실패 테스트 작성 (컴포넌트 2개)**

`src/components/history/score-trend.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreTrend } from "@/components/history/score-trend";

describe("ScoreTrend", () => {
  it("renders one facet per company with its latest total and grade", () => {
    render(
      <ScoreTrend facets={[{ companyId: 1, name: "딥노이드", grade: "우수", points: [{ year: 2025, total: 0.5 }, { year: 2026, total: 0.71 }] }]} />,
    );

    expect(screen.getByText("딥노이드")).toBeInTheDocument();
    expect(screen.getByText("0.71")).toBeInTheDocument();
    expect(screen.getByText("우수")).toBeInTheDocument();
  });

  it("explains the empty state instead of a blank panel", () => {
    render(<ScoreTrend facets={[]} />);

    expect(screen.getByText(/시상 확정이 없습니다/)).toBeInTheDocument();
  });
});
```

`src/components/history/event-pivot-table.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventPivotTable } from "@/components/history/event-pivot-table";

describe("EventPivotTable", () => {
  it("renders a company row with monthly counts", () => {
    render(
      <EventPivotTable
        months={["202601", "202602", "202603", "202604", "202605", "202606", "202607", "202608", "202609", "202610", "202611", "202612"]}
        rows={[{ companyId: 1, companyName: "가", total: 3, cells: Array.from({ length: 12 }, (_, i) => ({ ym: `2026${String(i + 1).padStart(2, "0")}`, total: i === 2 ? 3 : 0, byKind: i === 2 ? { award: 3 } : {} })) }]}
      />,
    );

    expect(screen.getByText("가")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/history`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 컴포넌트 구현**

`src/components/history/score-trend.tsx` — headcount-trend 의 facet 문법을 그대로 옮긴다(기업당 작은 차트, 선 겹치기 금지):

```tsx
"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

export type TrendFacet = { companyId: number; name: string; grade: string; points: Array<{ year: number; total: number }> };

/**
 * 기업마다 연도별 총점 라인을 하나씩 둔다 — 한 축에 50개 선을 겹치면 색으로만 갈라야 해서 읽을 수 없다.
 */
export function ScoreTrend({ facets }: { facets: TrendFacet[] }) {
  if (facets.length === 0) {
    return <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">시상 확정이 없습니다. /ranking 에서 시상 확정을 실행하세요.</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {facets.map((facet) => (
        <li key={facet.companyId} className="border-t-2 border-ink bg-background pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold">{facet.name}</span>
            <span className="font-mono text-[16px] font-bold tabular-nums">{facet.points.at(-1)?.total.toFixed(2) ?? "—"}</span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{facet.points.length}개 연도</span>
            <span>{facet.grade}</span>
          </div>
          <div className="mt-2 h-[52px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={facet.points} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                <YAxis hide domain={[0, 1]} />
                <Tooltip labelFormatter={(year) => `${year}년`} formatter={(value) => [Number(value).toFixed(2), "총점"] as [string, string]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

`src/components/history/award-board.tsx` (서버 컴포넌트, 테스트는 페이지 수준 생략 — 표시 전용):

```tsx
import type { AwardCategory } from "@/lib/services/awards";

export function AwardBoard({ categories }: { categories: AwardCategory[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {categories.map((category) => (
        <div key={category.id} className="border-t-2 border-ink pt-3">
          <h3 className="font-display text-[15px] font-black">{category.label}</h3>
          {category.winners.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-muted-foreground">해당 기업 없음</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {category.winners.map((winner) => (
                <li key={winner.companyId} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="font-semibold">{winner.companyName}</span>
                  <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">{winner.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
```

`src/components/history/event-pivot-table.tsx`:

```tsx
import type { PivotRow } from "@/lib/services/eventPivot";

/**
 * 기업×월 사건 수 피벗 — 숫자만 적고 0 은 비워 스캔이 되게 한다. 종류별 상세는 title 로 단다.
 */
export function EventPivotTable({ months, rows }: { months: string[]; rows: PivotRow[] }) {
  if (rows.length === 0) {
    return <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">이 연도의 사건이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className="py-1.5 pr-2 font-semibold">기업</th>
            {months.map((ym) => (
              <th key={ym} className="px-1 py-1.5 text-right font-mono text-[10.5px] text-muted-foreground">{ym.slice(4)}</th>
            ))}
            <th className="py-1.5 pl-2 text-right font-semibold">계</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.companyId} className="border-b border-hairline">
              <td className="whitespace-nowrap py-1.5 pr-2 font-semibold">{row.companyName}</td>
              {row.cells.map((cell) => (
                <td key={cell.ym} title={Object.entries(cell.byKind).map(([kind, count]) => `${kind} ${count}`).join(" · ")} className="px-1 py-1.5 text-right font-mono tabular-nums">
                  {cell.total === 0 ? "" : cell.total}
                </td>
              ))}
              <td className="py-1.5 pl-2 text-right font-mono font-bold tabular-nums">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/history`
Expected: PASS

- [ ] **Step 5: 페이지 + 내비**

`src/app/history/page.tsx`:

```tsx
import { listEvents } from "@/lib/repositories/eventRepository";
import { listSelections, listSelectionYears } from "@/lib/repositories/selectionRecord";
import { computeAwards } from "@/lib/services/awards";
import { pivotEvents } from "@/lib/services/eventPivot";
import { Panel } from "@/components/dashboard/panel";
import { AwardBoard } from "@/components/history/award-board";
import { ScoreTrend, type TrendFacet } from "@/components/history/score-trend";
import { EventPivotTable } from "@/components/history/event-pivot-table";

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const params = await searchParams;
  const years = await listSelectionYears();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) ? requested : (years[0] ?? new Date().getFullYear());

  const records = await listSelections();
  const facets = new Map<number, TrendFacet>();
  for (const record of records) {
    const facet = facets.get(record.companyId) ?? { companyId: record.companyId, name: record.companyName, grade: record.grade, points: [] };
    facet.points.push({ year: record.year, total: record.total });
    facet.grade = record.grade;
    facets.set(record.companyId, facet);
  }

  const events = await listEvents({ year, since: new Date(Date.UTC(year, 0, 1)) });
  const pivot = pivotEvents(events, year);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{year}년 · 확정 기록 기준</span>
          <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">이력·시상</h1>
        </div>
        <nav aria-label="연도" className="flex">
          {years.map((entry) => (
            <a key={entry} href={`/history?year=${entry}`} aria-current={entry === year ? "page" : undefined} className="-ml-px border-[1.5px] border-hairline px-3 py-1 text-[12px] font-bold text-muted-foreground first:ml-0 hover:bg-secondary aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-background">
              {entry}
            </a>
          ))}
        </nav>
      </header>

      <Panel index="01" title="시상 카테고리" tag="자동 산출" note="확정된 연도 기록만 근거다 — 산출식은 awards.ts" empty="">
        <AwardBoard categories={computeAwards(records, year)} />
      </Panel>
      <Panel index="02" title="점수 추이" tag="확정 기록" note="연도별 총점 0~1 · 산식 버전은 기록마다 저장" empty="">
        <ScoreTrend facets={[...facets.values()]} />
      </Panel>
      <Panel index="03" title="사건 연간 피벗" tag="실측" note="기업×월 사건 수 · 종류는 셀에 마우스를 올리면" empty="">
        <EventPivotTable months={pivot.months} rows={pivot.rows} />
      </Panel>
    </div>
  );
}
```

`Panel` 의 props 시그니처(`index`·`title`·`tag`·`note`·`empty`)는 `src/components/dashboard/panel.tsx` 를 열어 실제와 맞춘다. `PageProps<"/history">` 는 라우트 생성 후 `npx next typegen` 을 돌려야 생긴다.

`src/components/layout/side-tabs.tsx` 의 `NAV_ITEMS` 에:

```ts
  { href: "/history", index: "04", label: "이력" },
```

- [ ] **Step 6: 타입 생성 + 전체 검증**

Run: `npx next typegen && npm run build && npm run lint && npm test`
Expected: 빌드·린트(경고만)·전체 스위트 PASS

- [ ] **Step 7: 실물 확인**

개발 서버에서 `/ranking` → 시상 확정 → `/history` 가 카테고리·추이·피벗을 보여주는지 확인 (로그인 세션 필요).

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: selection history tracking and award categories"
```

---

## Self-Review

- **Spec coverage:** 인계 §4 의 SelectionRecord(Task 1) · 시상 확정 signal-outline+모달 primary(Task 4) · `/history` Recharts 추이(Task 5) · awards.ts 3개 카테고리(Task 2) · 연간 피벗(Task 3) · 내비 04 탭(Task 5) — 전부 태스크에 매핑됨. 로드맵의 API 라우트 2개는 의도적으로 제외(아키텍처 절에 근거 명시).
- **Placeholder scan:** 코드 블록 전부 실제 구현. "실제 export 이름 확인" 지시 2곳은 placeholder 가 아니라 검증 지시다.
- **Type consistency:** `SelectionInput.metrics: MetricScore[]`(Task 1) ↔ `toSelectionInputs`(Task 2) ↔ `confirmSelectionAction`(Task 4) 일치. `PivotRow`(Task 3) ↔ `EventPivotTable`(Task 5) 일치. `gradeOf` 는 Task 2 정의를 Task 1 테스트가 쓰지 않도록 리터럴로 적었다.
