# 대시보드 재구성(근거 준비 현황판) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dashboard` 를 운영자용 "근거 준비 현황판"(판정 현황 → 검증 게이트 → 원천 커버리지 → 근거 매트릭스 → 조치 필요 → 최근 기사)으로 재구성하고, 그 전에 상태 토큰·Panel·VerdictPill 프리미티브를 세운다.

**Architecture:** 판정 4분류(verified/review/risk/pending)는 검증 파이프라인의 2분류에서 순수 함수 `rollupVerdicts` 로 파생한다. 화면 데이터는 전부 서비스 층의 순수 함수(`verdictRollup`·`newsCoverage`·`actionItems`·`matrixRows`)가 만들고, `page.tsx` 는 리포지토리 호출과 조립만 한다. 지도·워드클라우드·증감 랭킹은 페이지에서만 빠지고 파일은 남는다.

**Tech Stack:** Next.js 16.3 App Router · React 19 · Tailwind v4 · Prisma(SQLite) · vitest + Testing Library(jsdom)

**Spec:** `docs/superpowers/specs/2026-08-29-dashboard-redesign-design.md`

## Global Constraints

- 주석은 함수 설명 JSDoc 만, 본문 3줄 이내. 줄 주석(`//`)으로 흐름을 설명하지 않는다 (CLAUDE.md)
- 각 태스크는 실패 테스트 → 구현 → 통과. 외부 API 는 없다 — 이 플랜은 DB 와 순수 함수만 다룬다
- 테스트는 `src/**/*.test.{ts,tsx}` 만 수집된다. DB 테스트는 `resetDatabase()` 를 `beforeEach` 로 쓴다
- Route Handler 는 없다. `page.tsx` 는 서버 컴포넌트이며 로직은 `src/lib/services` 에 둔다
- 상태색은 `verified`·`review`·`risk`(+신설 `pending`) 의미에만 쓴다. 새 색을 들이지 않는다
- 판정 임계값은 `src/lib/services/verificationScores.ts` 의 상수(`FAITHFULNESS_THRESHOLD` 0.85 · `SOURCE_COVERAGE_THRESHOLD` 0.5 · `EVIDENCE_MATCH_THRESHOLD` 0.4)를 import 해서 쓴다. 숫자를 다시 쓰지 않는다
- 기존 컴포넌트 파일(`naver-map` `region-grid` `cloud-board` `word-cloud` `growth-ranking` `scale-scatter` `headcount-trend` `state-legend` `source-coverage-strip`)은 **삭제하지 않는다**
- 커밋 메시지는 각 태스크 마지막 스텝에 적힌 그대로 쓴다
- 태스크 순서를 바꾸지 않는다. A(1) → B(2, 2b) → C(3~5) → D(6~14)

---

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `src/app/globals.css` | 상태 토큰 3단(text/surface/fill) + `pending` | 1 |
| `src/components/dashboard/design-primitives.test.tsx` | 토큰·SectionHead·Panel 테스트 | 1, 2 |
| `src/components/dashboard/section-head.tsx` | `index` prop 추가 | 2 |
| `src/components/dashboard/panel.tsx` | 카드 문법(헤더·본문·푸터·빈 상태) | 2 |
| `src/lib/services/verdictRollup.ts` | 2분류 → 4분류 파생, 게이트 퍼널, 트리아지 정렬 | 3 |
| `src/lib/repositories/verificationResult.ts` | `listLatestVerifications(year)` | 4 |
| `src/components/dashboard/verdict-pill.tsx` | 판정 필(아이콘+텍스트) | 5 |
| `src/lib/services/newsCoverage.ts` | 기업별 기사 수·최신 보도일, 14일/전체 건수 | 6 |
| `src/lib/services/actionItems.ts` | 조치 필요 4항목 | 7 |
| `src/components/dashboard/verdict-board.tsx` | 01 판정 현황 | 8 |
| `src/components/dashboard/gate-funnel.tsx` | 02 검증 게이트 | 9 |
| `src/components/dashboard/source-coverage-bars.tsx` | 03 원천 커버리지 | 10 |
| `src/components/dashboard/action-list.tsx` | 05 조치 필요 | 11 |
| `src/lib/services/matrixRows.ts` | 파이프라인 행 + 판정 + 보도일 결합, 정렬 | 12 |
| `src/lib/repositories/companyPipeline.ts` | 행에 `businessNo` 추가 | 2b |
| `src/components/dashboard/company-pipeline-grid.tsx` | 04 매트릭스 개편 | 12 |
| `src/components/dashboard/recent-articles.tsx` | 06 4열 그리드·그룹 헤더·`emptyLabel` | 13 |
| `src/app/dashboard/page.tsx` | 조립 | 14 |

---

### Task 1: 상태 토큰 3단 확장 (A)

**Files:**
- Modify: `src/app/globals.css` (`@theme inline` 블록, `:root`, `.dark`)
- Test: `src/components/dashboard/design-primitives.test.tsx`

**Interfaces:**
- Produces: Tailwind 클래스 `bg-verified-fill` `bg-review-fill` `bg-risk-fill` `bg-pending-fill` · `text-pending` `bg-pending-surface`. 이후 모든 컴포넌트가 쓴다.

- [ ] **Step 1: 실패 테스트 작성**

`src/components/dashboard/design-primitives.test.tsx` 맨 위 import 아래에 추가:

```tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STATUS_TOKENS = [
  "--verified", "--verified-surface", "--verified-fill",
  "--review", "--review-surface", "--review-fill",
  "--risk", "--risk-surface", "--risk-fill",
  "--pending", "--pending-surface", "--pending-fill",
];

function cssBlock(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("}", start));
}

describe("status tokens", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  test("defines text, surface and fill for every status in light and dark", () => {
    for (const selector of [":root", ".dark"]) {
      const block = cssBlock(css, selector);
      for (const token of STATUS_TOKENS) {
        expect(block, `${selector} ${token}`).toMatch(new RegExp(`${token}:\\s*#`));
      }
    }
  });

  test("exposes fill and pending tokens as Tailwind colours", () => {
    for (const name of ["verified-fill", "review-fill", "risk-fill", "pending", "pending-surface", "pending-fill"]) {
      expect(css).toContain(`--color-${name}: var(--${name});`);
    }
  });

  test("moves review text off brown so it reads as the same family as its fill", () => {
    expect(cssBlock(css, ":root")).not.toContain("--review: #b36600");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/dashboard/design-primitives.test.tsx`
Expected: FAIL — `--verified-fill` 없음, `--color-pending` 없음, `#b36600` 존재

- [ ] **Step 3: 토큰 추가**

`src/app/globals.css` `@theme inline` 의 `--color-risk-surface: var(--risk-surface);` 다음에 추가:

```css
  --color-verified-fill: var(--verified-fill);
  --color-review-fill: var(--review-fill);
  --color-risk-fill: var(--risk-fill);
  --color-pending: var(--pending);
  --color-pending-surface: var(--pending-surface);
  --color-pending-fill: var(--pending-fill);
```

`:root` 의 상태 블록을 이렇게 교체:

```css
  --verified: #009632;
  --verified-surface: #f2fff6;
  --verified-fill: #009632;
  --review: #b85c00;
  --review-surface: #fff6e8;
  --review-fill: #ff9200;
  --risk: #d92b2b;
  --risk-surface: #fff0f0;
  --risk-fill: #d92b2b;
  --pending: #5a5c63;
  --pending-surface: #f4f4f5;
  --pending-fill: #c9cbd0;
```

`.dark` 의 상태 블록을 이렇게 교체:

```css
  --verified: #49e57d;
  --verified-surface: #00240c;
  --verified-fill: #2fd06a;
  --review: #ffb454;
  --review-surface: #2b1a00;
  --review-fill: #ff9200;
  --risk: #ff8080;
  --risk-surface: #2e0d0d;
  --risk-fill: #f05252;
  --pending: #989ba2;
  --pending-surface: #212225;
  --pending-fill: #4a4c52;
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/dashboard/design-primitives.test.tsx`
Expected: PASS (기존 SectionHead·StateLegend 테스트 포함)

- [ ] **Step 5: 회귀 확인 후 커밋**

Run: `npm test`
Expected: 전부 PASS (`#b36600` 을 직접 쓰는 곳은 없다 — `grep -rn b36600 src/` 로 확인)

```bash
git add src/app/globals.css src/components/dashboard/design-primitives.test.tsx
git commit -m "feat(design): three-step status tokens and pending state"
```

---

### Task 2: `Panel` 프리미티브 + `SectionHead.index` (B)

**Files:**
- Modify: `src/components/dashboard/section-head.tsx`
- Create: `src/components/dashboard/panel.tsx`
- Test: `src/components/dashboard/design-primitives.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  SectionHead({ index?: string; title; tag?; tone?; note? })
  Panel({ index?: string; title: string; tag?: string; tone?: "plain" | "fresh"; note?: string;
          aside?: ReactNode; footer?: ReactNode; empty?: string; className?: string; children?: ReactNode })
  ```
  `children` 이 `null`/`undefined`/`false` 면 `empty` 문구를 대시 테두리로 그린다.

- [ ] **Step 1: 실패 테스트 작성**

`design-primitives.test.tsx` 에 추가:

```tsx
import { Panel } from "@/components/dashboard/panel";

describe("SectionHead index", () => {
  test("prints the section number before the heading", () => {
    render(<SectionHead index="04" title="기업별 근거 매트릭스" />);

    expect(screen.getByText("04")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "기업별 근거 매트릭스" })).toBeInTheDocument();
  });
});

describe("Panel", () => {
  test("renders head, aside, body and footer in one card", () => {
    render(
      <Panel index="01" title="판정 현황" tag="분석 산출" tone="fresh" aside={<span>정렬</span>} footer={<span>범례</span>}>
        <p>본문</p>
      </Panel>,
    );

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "판정 현황" })).toBeInTheDocument();
    expect(screen.getByText("정렬")).toBeInTheDocument();
    expect(screen.getByText("본문")).toBeInTheDocument();
    expect(screen.getByText("범례")).toBeInTheDocument();
  });

  test("shows the empty label instead of a card when there is no body", () => {
    render(<Panel title="최근 기사" empty="수집된 기사가 없습니다.">{null}</Panel>);

    expect(screen.getByText("수집된 기사가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-footer")).not.toBeInTheDocument();
  });

  test("omits the footer strip when none is given", () => {
    render(<Panel title="최근 기사"><p>본문</p></Panel>);

    expect(screen.queryByTestId("panel-footer")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/dashboard/design-primitives.test.tsx`
Expected: FAIL — `panel` 모듈 없음

- [ ] **Step 3: `SectionHead` 에 `index` 추가**

`src/components/dashboard/section-head.tsx` 전체 교체:

```tsx
/**
 * 절 번호·제목·성격 표시·한 줄 설명을 한 덩어리로 세운다.
 * 표시가 없으면 어디까지가 실측이고 어디부터가 추정인지 화면에서 구분되지 않는다.
 */
export function SectionHead({
  index,
  title,
  tag,
  tone = "plain",
  note,
}: {
  index?: string;
  title: string;
  tag?: string;
  tone?: "plain" | "fresh";
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-2">
        {index ? (
          <span className="font-mono text-[11px] font-semibold text-primary">{index}</span>
        ) : null}
        <h2 className="text-[15px] font-bold tracking-[-0.025em]">{title}</h2>
        {tag ? (
          <span
            className={`rounded-full border px-2 py-[1px] text-[10.5px] font-bold tracking-[0.08em] ${
              tone === "fresh"
                ? "border-verified/40 bg-verified-surface text-verified"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            {tag}
          </span>
        ) : null}
        {note ? <p className="text-[11.5px] text-muted-foreground">{note}</p> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `Panel` 작성**

`src/components/dashboard/panel.tsx`:

```tsx
import type { ReactNode } from "react";
import { SectionHead } from "@/components/dashboard/section-head";

/**
 * 절 머리·카드 본문·푸터 띠를 한 문법으로 고정한다.
 * 카드마다 테두리·여백이 다르면 스캔이 끊긴다. 본문 패딩은 호출자가 준다 — 표는 가장자리까지 닿아야 한다.
 */
export function Panel({
  index,
  title,
  tag,
  tone,
  note,
  aside,
  footer,
  empty = "표시할 내용이 없습니다.",
  className = "",
  children,
}: {
  index?: string;
  title: string;
  tag?: string;
  tone?: "plain" | "fresh";
  note?: string;
  aside?: ReactNode;
  footer?: ReactNode;
  empty?: string;
  className?: string;
  children?: ReactNode;
}) {
  const hasBody = children !== null && children !== undefined && children !== false;

  return (
    <section className={`flex min-h-0 flex-col gap-3.5 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <SectionHead index={index} title={title} tag={tag} tone={tone} note={note} />
        {aside}
      </div>
      {hasBody ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-background shadow-[0_1px_2px_rgba(23,23,25,0.04)]">
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          {footer ? (
            <div
              data-testid="panel-footer"
              className="border-t border-border bg-surface px-3.5 py-2 text-[11px] text-muted-foreground"
            >
              {footer}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/components/dashboard/design-primitives.test.tsx`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/components/dashboard/section-head.tsx src/components/dashboard/panel.tsx src/components/dashboard/design-primitives.test.tsx
git commit -m "feat(design): Panel primitive and numbered section heads"
```

---

### Task 2b: `CompanyPipelineRow.businessNo`

**Files:**
- Modify: `src/lib/repositories/companyPipeline.ts`
- Test: `src/lib/repositories/companyPipeline.test.ts`

**Interfaces:**
- Produces: `CompanyPipelineRow = { id: number; name: string; businessNo: string | null; cells: Record<string, PipelineCell> }`. Task 3·7·12 의 테스트 헬퍼가 이 필드를 쓴다.

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/repositories/companyPipeline.test.ts` 의 `describe("listCompanyPipeline"` 안에 추가:

```ts
  it("carries the business number so the grid can warn when it is missing", async () => {
    await prisma.company.create({ data: { name: "크립토랩", year: 2025, businessNo: "1198701587" } });
    await prisma.company.create({ data: { name: "아크릴", year: 2025 } });

    const rows = await listCompanyPipeline(2025);

    expect(rows.find((row) => row.name === "크립토랩")?.businessNo).toBe("1198701587");
    expect(rows.find((row) => row.name === "아크릴")?.businessNo).toBeNull();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/repositories/companyPipeline.test.ts`
Expected: FAIL — `businessNo` undefined

- [ ] **Step 3: 구현**

`companyPipeline.ts`: `CompanyPipelineRow` 타입에 `businessNo: string | null;` 을 추가하고, 마지막 `return { id: company.id, name: company.name, cells };` 를 `return { id: company.id, name: company.name, businessNo: company.businessNo ?? null, cells };` 로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/repositories/companyPipeline.test.ts src/components/dashboard/company-pipeline-grid.test.tsx`
Expected: PASS. 그리드 테스트의 `row()` 헬퍼는 `Partial` 스프레드라 타입 오류가 나면 `businessNo: null` 을 기본값에 추가한다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/repositories/companyPipeline.ts src/lib/repositories/companyPipeline.test.ts src/components/dashboard/company-pipeline-grid.test.tsx
git commit -m "feat(dashboard): carry business number on pipeline rows"
```

---

### Task 3: 판정 롤업 서비스 (C-1)

**Files:**
- Create: `src/lib/services/verdictRollup.ts`
- Test: `src/lib/services/verdictRollup.test.ts`

**Interfaces:**
- Consumes: `CompanyPipelineRow` (`src/lib/repositories/companyPipeline.ts`), 임계 상수 (`verificationScores.ts`)
- Produces:
  ```ts
  export type Verdict = "verified" | "review" | "risk" | "pending";
  export type VerificationRow = {
    companyId: number; status: "verified" | "needs_review";
    faithfulness: number | null; sourceCoverage: number | null; evidenceMatch: number | null;
    counterEvidence: number; citations: number; runAt: string;
  };
  export type CompanyVerdict = {
    companyId: number; name: string; verdict: Verdict;
    faithfulness: number | null; sourceCoverage: number | null; evidenceMatch: number | null;
    citations: number; counterEvidence: number; conflicts: string[]; runAt: string | null;
  };
  export type VerdictSummary = {
    companies: CompanyVerdict[];
    counts: Record<Verdict, number>;
    gates: { source: number; faithfulness: number; evidence: number; analysed: number };
    gateDropouts: { source: number; faithfulness: number; evidence: number };
    averageCitations: number;
  };
  export const COUNTER_EVIDENCE_RISK_THRESHOLD = 1;
  export const VERDICT_ORDER: Verdict[] = ["risk", "review", "verified", "pending"];
  export function rollupVerdicts(input: { companies: Array<{ id: number; name: string }>; verifications: VerificationRow[]; pipeline: CompanyPipelineRow[] }): VerdictSummary;
  export function sortForTriage<T extends { verdict: Verdict; faithfulness: number | null; name: string }>(rows: T[]): T[];
  ```

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/services/verdictRollup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import {
  rollupVerdicts,
  sortForTriage,
  type VerificationRow,
} from "@/lib/services/verdictRollup";

const COMPANIES = [
  { id: 1, name: "크립토랩" },
  { id: 2, name: "옥타코" },
  { id: 3, name: "아크릴" },
  { id: 4, name: "셀바스" },
];

function verification(over: Partial<VerificationRow> & { companyId: number }): VerificationRow {
  return {
    status: "verified",
    faithfulness: 0.9,
    sourceCoverage: 0.8,
    evidenceMatch: 0.6,
    counterEvidence: 0,
    citations: 6,
    runAt: "2026-08-28T13:19:00.000Z",
    ...over,
  };
}

function pipeline(id: number, conflict = false): CompanyPipelineRow {
  return {
    id,
    name: COMPANIES.find((c) => c.id === id)?.name ?? "",
    businessNo: null,
    cells: { dart: { state: conflict ? "conflict" : "ok", value: "", note: "" } },
  };
}

describe("rollupVerdicts", () => {
  it("marks a company with no completed run as pending", () => {
    const summary = rollupVerdicts({ companies: COMPANIES, verifications: [], pipeline: [] });

    expect(summary.counts).toEqual({ verified: 0, review: 0, risk: 0, pending: 4 });
    expect(summary.companies.every((entry) => entry.verdict === "pending")).toBe(true);
  });

  it("passes a verified run through as verified", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 1 })],
      pipeline: [],
    });

    expect(summary.companies.find((entry) => entry.companyId === 1)?.verdict).toBe("verified");
  });

  it("turns needs_review into review", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 1, status: "needs_review", faithfulness: 0.7 })],
      pipeline: [],
    });

    expect(summary.companies.find((entry) => entry.companyId === 1)?.verdict).toBe("review");
  });

  it("raises risk on counter-evidence even when the judge said verified", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 1, counterEvidence: 1 })],
      pipeline: [],
    });

    expect(summary.companies.find((entry) => entry.companyId === 1)?.verdict).toBe("risk");
  });

  it("raises risk on a source conflict and names the stage", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 2 })],
      pipeline: [pipeline(2, true)],
    });
    const entry = summary.companies.find((row) => row.companyId === 2);

    expect(entry?.verdict).toBe("risk");
    expect(entry?.conflicts).toEqual(["dart"]);
  });

  it("does not let a conflict alone promote a pending company", () => {
    const summary = rollupVerdicts({ companies: COMPANIES, verifications: [], pipeline: [pipeline(2, true)] });

    expect(summary.companies.find((row) => row.companyId === 2)?.verdict).toBe("pending");
  });

  it("counts gates as a cumulative funnel that never grows", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [
        verification({ companyId: 1 }),
        verification({ companyId: 2, status: "needs_review", faithfulness: 0.7 }),
        verification({ companyId: 3, status: "needs_review", sourceCoverage: 0.2 }),
      ],
      pipeline: [],
    });

    expect(summary.gates).toEqual({ analysed: 3, source: 2, faithfulness: 1, evidence: 1 });
    expect(summary.gateDropouts).toEqual({ source: 1, faithfulness: 1, evidence: 0 });
  });

  it("averages citations over analysed companies only", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 1, citations: 4 }), verification({ companyId: 2, citations: 8 })],
      pipeline: [],
    });

    expect(summary.averageCitations).toBe(6);
  });
});

describe("sortForTriage", () => {
  it("orders risk, review, verified, pending and lowest faithfulness first within a group", () => {
    const sorted = sortForTriage([
      { verdict: "verified" as const, faithfulness: 0.9, name: "가" },
      { verdict: "pending" as const, faithfulness: null, name: "나" },
      { verdict: "review" as const, faithfulness: 0.8, name: "다" },
      { verdict: "review" as const, faithfulness: 0.6, name: "라" },
      { verdict: "risk" as const, faithfulness: 0.4, name: "마" },
    ]);

    expect(sorted.map((row) => row.name)).toEqual(["마", "라", "다", "가", "나"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/services/verdictRollup.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/services/verdictRollup.ts`:

```ts
import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import {
  EVIDENCE_MATCH_THRESHOLD,
  FAITHFULNESS_THRESHOLD,
  SOURCE_COVERAGE_THRESHOLD,
} from "@/lib/services/verificationScores";

export type Verdict = "verified" | "review" | "risk" | "pending";

export type VerificationRow = {
  companyId: number;
  status: "verified" | "needs_review";
  faithfulness: number | null;
  sourceCoverage: number | null;
  evidenceMatch: number | null;
  counterEvidence: number;
  citations: number;
  runAt: string;
};

export type CompanyVerdict = {
  companyId: number;
  name: string;
  verdict: Verdict;
  faithfulness: number | null;
  sourceCoverage: number | null;
  evidenceMatch: number | null;
  citations: number;
  counterEvidence: number;
  conflicts: string[];
  runAt: string | null;
};

export type VerdictSummary = {
  companies: CompanyVerdict[];
  counts: Record<Verdict, number>;
  gates: { source: number; faithfulness: number; evidence: number; analysed: number };
  gateDropouts: { source: number; faithfulness: number; evidence: number };
  averageCitations: number;
};

/** 반증이 이 건수 이상이면 리스크다. 첫 실측 뒤 조정한다. */
export const COUNTER_EVIDENCE_RISK_THRESHOLD = 1;

/** 봐야 할 순서 — 막힌 것이 먼저다. */
export const VERDICT_ORDER: Verdict[] = ["risk", "review", "verified", "pending"];

function conflictStages(row: CompanyPipelineRow | undefined) {
  if (!row) return [];
  return Object.entries(row.cells)
    .filter(([, cell]) => cell.state === "conflict")
    .map(([stage]) => stage);
}

function decideVerdict(row: VerificationRow | undefined, conflicts: string[]): Verdict {
  if (!row) return "pending";
  if (row.counterEvidence >= COUNTER_EVIDENCE_RISK_THRESHOLD || conflicts.length > 0) return "risk";
  return row.status === "verified" ? "verified" : "review";
}

/**
 * 검증 2분류(verified/needs_review)를 대시보드 4분류로 파생한다.
 * 리스크는 파이프라인이 내는 상태가 아니다 — 반증 또는 원천 충돌이 있으면 judge 판정보다 우선한다.
 */
export function rollupVerdicts(input: {
  companies: Array<{ id: number; name: string }>;
  verifications: VerificationRow[];
  pipeline: CompanyPipelineRow[];
}): VerdictSummary {
  const byCompany = new Map(input.verifications.map((row) => [row.companyId, row]));
  const pipelineById = new Map(input.pipeline.map((row) => [row.id, row]));
  const counts: Record<Verdict, number> = { verified: 0, review: 0, risk: 0, pending: 0 };

  const companies = input.companies.map((company) => {
    const row = byCompany.get(company.id);
    const conflicts = conflictStages(pipelineById.get(company.id));
    const verdict = decideVerdict(row, conflicts);
    counts[verdict] += 1;
    return {
      companyId: company.id,
      name: company.name,
      verdict,
      faithfulness: row?.faithfulness ?? null,
      sourceCoverage: row?.sourceCoverage ?? null,
      evidenceMatch: row?.evidenceMatch ?? null,
      citations: row?.citations ?? 0,
      counterEvidence: row?.counterEvidence ?? 0,
      conflicts,
      runAt: row?.runAt ?? null,
    };
  });

  const analysed = input.verifications;
  const passedSource = analysed.filter((row) => (row.sourceCoverage ?? 0) >= SOURCE_COVERAGE_THRESHOLD);
  const passedFaith = passedSource.filter((row) => (row.faithfulness ?? 0) >= FAITHFULNESS_THRESHOLD);
  const passedEvidence = passedFaith.filter((row) => (row.evidenceMatch ?? 0) >= EVIDENCE_MATCH_THRESHOLD);

  const totalCitations = analysed.reduce((sum, row) => sum + row.citations, 0);

  return {
    companies,
    counts,
    gates: {
      analysed: analysed.length,
      source: passedSource.length,
      faithfulness: passedFaith.length,
      evidence: passedEvidence.length,
    },
    gateDropouts: {
      source: analysed.length - passedSource.length,
      faithfulness: passedSource.length - passedFaith.length,
      evidence: passedFaith.length - passedEvidence.length,
    },
    averageCitations: analysed.length === 0 ? 0 : Math.round((totalCitations / analysed.length) * 10) / 10,
  };
}

/**
 * 리스크 → 검토 → 통과 → 미분석, 같은 판정 안에서는 근거충실도가 낮은 순.
 */
export function sortForTriage<T extends { verdict: Verdict; faithfulness: number | null; name: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) => {
    const order = VERDICT_ORDER.indexOf(left.verdict) - VERDICT_ORDER.indexOf(right.verdict);
    if (order !== 0) return order;
    const faith = (left.faithfulness ?? Number.POSITIVE_INFINITY) - (right.faithfulness ?? Number.POSITIVE_INFINITY);
    if (faith !== 0) return faith;
    return left.name.localeCompare(right.name, "ko");
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/services/verdictRollup.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/services/verdictRollup.ts src/lib/services/verdictRollup.test.ts
git commit -m "feat(dashboard): derive four-way verdicts and gate funnel from verification results"
```

---

### Task 4: `listLatestVerifications(year)` (C-2)

**Files:**
- Modify: `src/lib/repositories/verificationResult.ts`
- Test: `src/lib/repositories/verificationResult.test.ts` (기존 파일에 describe 추가)

**Interfaces:**
- Produces: `listLatestVerifications(year: number): Promise<VerificationRow[]>` — 기업당 최신 **완료** 실행의 검증 결과. `citations` 는 그 실행 `newsJson` 배열 길이, `counterEvidence` 는 JSON 배열 길이, `runAt` 은 `completedAt ?? createdAt` ISO.

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/repositories/verificationResult.test.ts` 맨 아래에 추가 (파일 상단 import 에 `listLatestVerifications` 와 `resetDatabase`·`prisma` 가 없으면 추가):

```ts
import { listLatestVerifications } from "@/lib/repositories/verificationResult";

async function seedCompanyWithUser(name: string, year: number) {
  const company = await prisma.company.create({ data: { name, year } });
  const user = await prisma.user.create({
    data: { email: `v-${company.id}@example.com`, passwordHash: "scrypt:32768:8:1$s$h" },
  });
  return { company, user };
}

async function seedRun(input: {
  companyId: number;
  userId: number;
  status: string;
  createdAt: Date;
  news?: number;
  verification?: { status: string; faithfulness?: number; counterEvidence?: string[] };
}) {
  const run = await prisma.analysisRun.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      model: "claude-sonnet-5",
      status: input.status,
      createdAt: input.createdAt,
      completedAt: input.status === "completed" ? input.createdAt : null,
      newsJson: JSON.stringify(Array.from({ length: input.news ?? 0 }, (_, i) => ({ link: `https://n/${i}` }))),
    },
  });
  if (input.verification) {
    await prisma.verificationResult.create({
      data: {
        analysisRunId: run.id,
        status: input.verification.status,
        faithfulness: input.verification.faithfulness ?? null,
        unsupportedClaims: "[]",
        counterEvidence: JSON.stringify(input.verification.counterEvidence ?? []),
        detailJson: "{}",
      },
    });
  }
  return run;
}

describe("listLatestVerifications", () => {
  beforeEach(resetDatabase);

  it("returns one row per company from its newest completed run", async () => {
    const { company, user } = await seedCompanyWithUser("크립토랩", 2025);
    await seedRun({
      companyId: company.id, userId: user.id, status: "completed",
      createdAt: new Date("2026-08-01"), news: 3,
      verification: { status: "needs_review", faithfulness: 0.6 },
    });
    await seedRun({
      companyId: company.id, userId: user.id, status: "completed",
      createdAt: new Date("2026-08-20"), news: 5,
      verification: { status: "verified", faithfulness: 0.9, counterEvidence: ["반증 1"] },
    });

    const rows = await listLatestVerifications(2025);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      companyId: company.id, status: "verified", faithfulness: 0.9, citations: 5, counterEvidence: 1,
    });
    expect(rows[0].runAt).toBe(new Date("2026-08-20").toISOString());
  });

  it("skips runs that are still running or failed", async () => {
    const { company, user } = await seedCompanyWithUser("옥타코", 2025);
    await seedRun({
      companyId: company.id, userId: user.id, status: "completed",
      createdAt: new Date("2026-08-01"), verification: { status: "verified", faithfulness: 0.9 },
    });
    await seedRun({ companyId: company.id, userId: user.id, status: "running", createdAt: new Date("2026-08-25") });

    const rows = await listLatestVerifications(2025);

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("verified");
  });

  it("leaves out a completed run that has no verification and other years", async () => {
    const a = await seedCompanyWithUser("아크릴", 2025);
    await seedRun({ companyId: a.company.id, userId: a.user.id, status: "completed", createdAt: new Date("2026-08-01") });
    const b = await seedCompanyWithUser("셀바스", 2024);
    await seedRun({
      companyId: b.company.id, userId: b.user.id, status: "completed",
      createdAt: new Date("2026-08-01"), verification: { status: "verified" },
    });

    expect(await listLatestVerifications(2025)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/repositories/verificationResult.test.ts`
Expected: FAIL — `listLatestVerifications` 없음

- [ ] **Step 3: 구현**

`src/lib/repositories/verificationResult.ts` 맨 아래에 추가:

```ts
import type { VerificationRow } from "@/lib/services/verdictRollup";

function jsonLength(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * 해당 연도 기업별 최신 완료 실행의 검증 결과를 낸다.
 * 기업당 하나만 쓴다 — 재실행분까지 세면 같은 기업이 두 번 잡혀 판정 수가 부풀려진다.
 */
export async function listLatestVerifications(year: number): Promise<VerificationRow[]> {
  const runs = await prisma.analysisRun.findMany({
    where: { status: "completed", company: { year }, verification: { isNot: null } },
    orderBy: { createdAt: "desc" },
    include: { verification: true },
  });

  const seen = new Set<number>();
  const rows: VerificationRow[] = [];

  for (const run of runs) {
    if (seen.has(run.companyId) || !run.verification) continue;
    seen.add(run.companyId);
    rows.push({
      companyId: run.companyId,
      status: run.verification.status === "verified" ? "verified" : "needs_review",
      faithfulness: run.verification.faithfulness,
      sourceCoverage: run.verification.sourceCoverage,
      evidenceMatch: run.verification.evidenceMatch,
      counterEvidence: jsonLength(run.verification.counterEvidence),
      citations: jsonLength(run.newsJson),
      runAt: (run.completedAt ?? run.createdAt).toISOString(),
    });
  }

  return rows;
}
```

`import type { VerificationRow }` 는 파일 상단 import 묶음으로 옮긴다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/repositories/verificationResult.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/repositories/verificationResult.ts src/lib/repositories/verificationResult.test.ts
git commit -m "feat(dashboard): list latest completed verification per company"
```

---

### Task 5: `VerdictPill` (C-3)

**Files:**
- Create: `src/components/dashboard/verdict-pill.tsx`
- Test: `src/components/dashboard/verdict-pill.test.tsx`

**Interfaces:**
- Consumes: `Verdict` (Task 3)
- Produces: `VerdictPill({ verdict: Verdict; className?: string })`, `VERDICT_LABEL: Record<Verdict, string>` = 통과·검토·리스크·미분석

- [ ] **Step 1: 실패 테스트 작성**

`src/components/dashboard/verdict-pill.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { VerdictPill } from "@/components/dashboard/verdict-pill";

describe("VerdictPill", () => {
  test.each([
    ["verified", "통과"],
    ["review", "검토"],
    ["risk", "리스크"],
    ["pending", "미분석"],
  ] as const)("names %s as %s in text, not colour alone", (verdict, label) => {
    const { container } = render(<VerdictPill verdict={verdict} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  test("wears the status surface and text tokens", () => {
    render(<VerdictPill verdict="risk" />);

    expect(screen.getByText("리스크").closest("span")).toHaveClass("bg-risk-surface", "text-risk");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/dashboard/verdict-pill.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/components/dashboard/verdict-pill.tsx`:

```tsx
import type { Verdict } from "@/lib/services/verdictRollup";

export const VERDICT_LABEL: Record<Verdict, string> = {
  verified: "통과",
  review: "검토",
  risk: "리스크",
  pending: "미분석",
};

const VERDICT_CLASS: Record<Verdict, string> = {
  verified: "bg-verified-surface text-verified",
  review: "bg-review-surface text-review",
  risk: "bg-risk-surface text-risk",
  pending: "bg-pending-surface text-pending",
};

function Icon({ verdict }: { verdict: Verdict }) {
  const common = { viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true, className: "h-3 w-3" };
  switch (verdict) {
    case "verified":
      return <svg {...common} strokeWidth={1.8}><path d="M2.5 6.5 5 9l4.5-6" /></svg>;
    case "review":
      return <svg {...common}><circle cx="6" cy="6" r="4.5" /><path d="M6 3.5v3l2 1" /></svg>;
    case "risk":
      return <svg {...common}><path d="M6 1.5 11 10.5H1z" /><path d="M6 5v2.5" /></svg>;
    default:
      return <svg {...common}><circle cx="6" cy="6" r="4.5" strokeDasharray="2 2" /></svg>;
  }
}

/**
 * 판정을 아이콘+글자로 찍는다. 색은 보조다.
 * 색만으로는 색각 이상과 흑백 인쇄에서 통과와 리스크가 갈리지 않는다.
 */
export function VerdictPill({ verdict, className = "" }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-[2px] pl-1.5 pr-2 text-[11px] font-bold ${VERDICT_CLASS[verdict]} ${className}`}
    >
      <Icon verdict={verdict} />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/dashboard/verdict-pill.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/verdict-pill.tsx src/components/dashboard/verdict-pill.test.tsx
git commit -m "feat(dashboard): VerdictPill with icon and label"
```

---

### Task 6: 뉴스 커버리지 서비스 (D)

**Files:**
- Create: `src/lib/services/newsCoverage.ts`
- Test: `src/lib/services/newsCoverage.test.ts`

**Interfaces:**
- Consumes: `MentionedArticle` (`src/lib/services/coMention.ts`)
- Produces:
  ```ts
  export type CompanyNews = { companyId: number; name: string; articles: number; latest: string | null };
  export type NewsCoverage = { byCompany: CompanyNews[]; recent14: number; total: number };
  export const STALE_DAYS = 30;
  export function buildNewsCoverage(companies: Array<{ id: number; name: string }>, articles: MentionedArticle[], now?: Date): NewsCoverage;
  export function isStale(latest: string | null, now?: Date): boolean;
  ```

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/services/newsCoverage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MentionedArticle } from "@/lib/services/coMention";
import { buildNewsCoverage, isStale } from "@/lib/services/newsCoverage";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const COMPANIES = [
  { id: 1, name: "크립토랩" },
  { id: 2, name: "옥타코" },
  { id: 3, name: "아크릴" },
];

function article(over: Partial<MentionedArticle> & { link: string }): MentionedArticle {
  return { title: "", source: "", published: "2026-08-20T00:00:00.000Z", companies: [], ...over };
}

describe("buildNewsCoverage", () => {
  it("counts articles per company and keeps the newest date", () => {
    const coverage = buildNewsCoverage(
      COMPANIES,
      [
        article({ link: "a", published: "2026-08-10T00:00:00.000Z", companies: ["크립토랩"] }),
        article({ link: "b", published: "2026-08-26T00:00:00.000Z", companies: ["크립토랩", "옥타코"] }),
      ],
      NOW,
    );

    expect(coverage.byCompany.find((row) => row.companyId === 1)).toEqual({
      companyId: 1, name: "크립토랩", articles: 2, latest: "2026-08-26T00:00:00.000Z",
    });
    expect(coverage.byCompany.find((row) => row.companyId === 2)?.articles).toBe(1);
  });

  it("keeps companies with no article so silence is visible", () => {
    const coverage = buildNewsCoverage(COMPANIES, [], NOW);

    expect(coverage.byCompany.find((row) => row.companyId === 3)).toEqual({
      companyId: 3, name: "아크릴", articles: 0, latest: null,
    });
  });

  it("counts the last 14 days and the whole set separately", () => {
    const coverage = buildNewsCoverage(
      COMPANIES,
      [
        article({ link: "a", published: "2026-08-26T00:00:00.000Z", companies: ["크립토랩"] }),
        article({ link: "b", published: "2026-07-01T00:00:00.000Z", companies: ["크립토랩"] }),
      ],
      NOW,
    );

    expect(coverage.recent14).toBe(1);
    expect(coverage.total).toBe(2);
  });

  it("ignores names that are not registered companies", () => {
    const coverage = buildNewsCoverage(COMPANIES, [article({ link: "a", companies: ["없는회사"] })], NOW);

    expect(coverage.byCompany.every((row) => row.articles === 0)).toBe(true);
    expect(coverage.total).toBe(1);
  });
});

describe("isStale", () => {
  it("treats no article and anything over 30 days as stale", () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale("2026-07-29T00:00:00.000Z", NOW)).toBe(true);
    expect(isStale("2026-08-01T00:00:00.000Z", NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/services/newsCoverage.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/services/newsCoverage.ts`:

```ts
import type { MentionedArticle } from "@/lib/services/coMention";

export type CompanyNews = { companyId: number; name: string; articles: number; latest: string | null };
export type NewsCoverage = { byCompany: CompanyNews[]; recent14: number; total: number };

export const STALE_DAYS = 30;
const RECENT_DAYS = 14;
const DAY_MS = 86_400_000;

function stamp(published: string) {
  const time = Date.parse(published);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * 최신 보도가 30일을 넘겼거나 없으면 낡은 근거다.
 */
export function isStale(latest: string | null, now = new Date()) {
  if (!latest) return true;
  return now.getTime() - stamp(latest) > STALE_DAYS * DAY_MS;
}

/**
 * 등록 기업마다 기사 수와 최신 보도일을 세고, 최근 14일·전체 건수를 함께 낸다.
 * 기사 없는 기업도 행으로 남긴다 — 화면에서 빠지면 없는 줄 모른다.
 */
export function buildNewsCoverage(
  companies: Array<{ id: number; name: string }>,
  articles: MentionedArticle[],
  now = new Date(),
): NewsCoverage {
  const byName = new Map(companies.map((company) => [company.name, { companyId: company.id, name: company.name, articles: 0, latest: null as string | null }]));

  for (const article of articles) {
    for (const name of article.companies) {
      const row = byName.get(name);
      if (!row) continue;
      row.articles += 1;
      if (row.latest === null || stamp(article.published) > stamp(row.latest)) row.latest = article.published;
    }
  }

  const cutoff = now.getTime() - RECENT_DAYS * DAY_MS;

  return {
    byCompany: [...byName.values()],
    recent14: articles.filter((article) => stamp(article.published) >= cutoff).length,
    total: articles.length,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/services/newsCoverage.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/services/newsCoverage.ts src/lib/services/newsCoverage.test.ts
git commit -m "feat(dashboard): per-company news coverage and staleness"
```

---

### Task 7: 조치 필요 서비스 (D)

**Files:**
- Create: `src/lib/services/actionItems.ts`
- Test: `src/lib/services/actionItems.test.ts`

**Interfaces:**
- Consumes: `CompanyPipelineRow`, `NewsCoverage`·`isStale` (Task 6), `RankEntry` (`dashboardSummary.ts`), `MATRIX_STAGES` (`pipelineMatrix.ts`)
- Produces:
  ```ts
  export type ActionKey = "businessNo" | "conflict" | "stale" | "decline";
  export type ActionItem = {
    key: ActionKey; title: string; tone: "review" | "risk" | "plain";
    count: number; companies: Array<{ id: number; name: string; detail?: string }>; remedy: string;
  };
  export const DECLINE_RATIO = -0.2;
  export function buildActionItems(input: {
    companies: Array<{ id: number; name: string; businessNo: string | null }>;
    pipeline: CompanyPipelineRow[]; news: NewsCoverage; declining: RankEntry[]; now?: Date;
  }): ActionItem[];   // 항상 4개, 순서 고정
  ```

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/services/actionItems.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import type { RankEntry } from "@/lib/services/dashboardSummary";
import { buildActionItems } from "@/lib/services/actionItems";
import type { NewsCoverage } from "@/lib/services/newsCoverage";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const COMPANIES = [
  { id: 1, name: "크립토랩", businessNo: "1198701587" },
  { id: 2, name: "옥타코", businessNo: "1058744210" },
  { id: 3, name: "아크릴", businessNo: null },
];

function pipeline(id: number, conflicts: string[] = []): CompanyPipelineRow {
  return {
    id,
    name: COMPANIES.find((c) => c.id === id)?.name ?? "",
    businessNo: null,
    cells: Object.fromEntries(conflicts.map((stage) => [stage, { state: "conflict", value: "", note: "" }])),
  };
}

function news(latestById: Record<number, string | null>): NewsCoverage {
  return {
    byCompany: COMPANIES.map((c) => ({ companyId: c.id, name: c.name, articles: latestById[c.id] ? 1 : 0, latest: latestById[c.id] ?? null })),
    recent14: 0,
    total: 0,
  };
}

function rank(id: number, ratio: number): RankEntry {
  const name = COMPANIES.find((c) => c.id === id)?.name ?? "";
  return { companyId: id, name, from: 100, latest: Math.round(100 * (1 + ratio)), delta: Math.round(100 * ratio), ratio, points: [] };
}

describe("buildActionItems", () => {
  it("always returns the four items in a fixed order, even at zero", () => {
    const items = buildActionItems({ companies: [], pipeline: [], news: { byCompany: [], recent14: 0, total: 0 }, declining: [], now: NOW });

    expect(items.map((item) => item.key)).toEqual(["businessNo", "conflict", "stale", "decline"]);
    expect(items.every((item) => item.count === 0)).toBe(true);
  });

  it("lists companies without a business number", () => {
    const items = buildActionItems({ companies: COMPANIES, pipeline: [], news: news({}), declining: [], now: NOW });
    const item = items.find((entry) => entry.key === "businessNo");

    expect(item?.count).toBe(1);
    expect(item?.companies).toEqual([{ id: 3, name: "아크릴" }]);
    expect(item?.remedy).toBe("금융위 폴백도 실패 — 수기 입력 필요");
  });

  it("names the conflicting stage in the remedy", () => {
    const items = buildActionItems({ companies: COMPANIES, pipeline: [pipeline(2, ["dart"])], news: news({}), declining: [], now: NOW });
    const item = items.find((entry) => entry.key === "conflict");

    expect(item?.companies).toEqual([{ id: 2, name: "옥타코", detail: "DART" }]);
    expect(item?.remedy).toBe("DART 가 다른 기업을 물어옴 — 두 원천 교차 일치로 확정");
  });

  it("flags companies whose newest article is older than 30 days or missing", () => {
    const items = buildActionItems({
      companies: COMPANIES,
      pipeline: [],
      news: news({ 1: "2026-08-26T00:00:00.000Z", 2: "2026-07-01T00:00:00.000Z", 3: null }),
      declining: [],
      now: NOW,
    });
    const item = items.find((entry) => entry.key === "stale");

    expect(item?.companies.map((c) => c.name)).toEqual(["옥타코", "아크릴"]);
  });

  it("keeps only declines of 20 percent or more and prints the ratio", () => {
    const items = buildActionItems({
      companies: COMPANIES,
      pipeline: [],
      news: news({}),
      declining: [rank(1, -0.31), rank(2, -0.1)],
      now: NOW,
    });
    const item = items.find((entry) => entry.key === "decline");

    expect(item?.companies).toEqual([{ id: 1, name: "크립토랩", detail: "▼31%" }]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/services/actionItems.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/services/actionItems.ts`:

```ts
import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import type { RankEntry } from "@/lib/services/dashboardSummary";
import { isStale, type NewsCoverage } from "@/lib/services/newsCoverage";
import { MATRIX_STAGES } from "@/lib/services/pipelineMatrix";

export type ActionKey = "businessNo" | "conflict" | "stale" | "decline";

export type ActionItem = {
  key: ActionKey;
  title: string;
  tone: "review" | "risk" | "plain";
  count: number;
  companies: Array<{ id: number; name: string; detail?: string }>;
  remedy: string;
};

/** 12개월 인원이 이 비율 이하로 줄면 조치 대상이다. */
export const DECLINE_RATIO = -0.2;

const STAGE_SHORT = new Map(MATRIX_STAGES.map((stage) => [stage.key, stage.short]));

function conflictStages(row: CompanyPipelineRow) {
  return Object.entries(row.cells)
    .filter(([, cell]) => cell.state === "conflict")
    .map(([stage]) => STAGE_SHORT.get(stage) ?? stage);
}

/**
 * 운영자가 오늘 손대야 할 네 가지를 건수·기업·처방으로 낸다.
 * 0건이어도 항목을 남긴다 — 항목이 사라지면 점검했는지 알 수 없다.
 */
export function buildActionItems(input: {
  companies: Array<{ id: number; name: string; businessNo: string | null }>;
  pipeline: CompanyPipelineRow[];
  news: NewsCoverage;
  declining: RankEntry[];
  now?: Date;
}): ActionItem[] {
  const now = input.now ?? new Date();
  const nameById = new Map(input.companies.map((company) => [company.id, company.name]));

  const missingBusinessNo = input.companies
    .filter((company) => !company.businessNo)
    .map((company) => ({ id: company.id, name: company.name }));

  const conflicts = input.pipeline
    .map((row) => ({ id: row.id, name: row.name, stages: conflictStages(row) }))
    .filter((row) => row.stages.length > 0)
    .map((row) => ({ id: row.id, name: row.name, detail: row.stages.join("·") }));
  const conflictSources = [...new Set(conflicts.flatMap((row) => row.detail.split("·")))];

  const stale = input.news.byCompany
    .filter((row) => isStale(row.latest, now))
    .map((row) => ({ id: row.companyId, name: row.name }));

  const declines = input.declining
    .filter((entry) => entry.ratio <= DECLINE_RATIO)
    .map((entry) => ({
      id: entry.companyId,
      name: nameById.get(entry.companyId) ?? entry.name,
      detail: `▼${Math.round(Math.abs(entry.ratio) * 100)}%`,
    }));

  return [
    {
      key: "businessNo",
      title: "사업자번호 미확보",
      tone: "review",
      count: missingBusinessNo.length,
      companies: missingBusinessNo,
      remedy: "금융위 폴백도 실패 — 수기 입력 필요",
    },
    {
      key: "conflict",
      title: "동명 타사 충돌",
      tone: "risk",
      count: conflicts.length,
      companies: conflicts,
      remedy: `${conflictSources.length > 0 ? conflictSources.join("·") : "원천"} 가 다른 기업을 물어옴 — 두 원천 교차 일치로 확정`,
    },
    {
      key: "stale",
      title: "30일 이상 보도 없음",
      tone: "plain",
      count: stale.length,
      companies: stale,
      remedy: "뉴스 근거가 낡았다 — 재수집 후 재분석",
    },
    {
      key: "decline",
      title: "12개월 인원 20% 이상 감소",
      tone: "plain",
      count: declines.length,
      companies: declines,
      remedy: "국민연금 실측 — 본사 이전 여부를 상세에서 확인",
    },
  ];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/services/actionItems.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/services/actionItems.ts src/lib/services/actionItems.test.ts
git commit -m "feat(dashboard): action items for operators"
```

---

### Task 8: `VerdictBoard` — 01 판정 현황

**Files:**
- Create: `src/components/dashboard/verdict-board.tsx`
- Test: `src/components/dashboard/verdict-board.test.tsx`

**Interfaces:**
- Consumes: `Verdict`·`VERDICT_ORDER` (Task 3), `VERDICT_LABEL` (Task 5)
- Produces: `VerdictBoard({ counts: Record<Verdict, number>; averageCitations: number })`

- [ ] **Step 1: 실패 테스트 작성**

`src/components/dashboard/verdict-board.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { VerdictBoard } from "@/components/dashboard/verdict-board";

const COUNTS = { verified: 31, review: 12, risk: 3, pending: 4 };

describe("VerdictBoard", () => {
  test("prints each verdict with its count and share", () => {
    render(<VerdictBoard counts={COUNTS} averageCitations={6.2} />);

    const verified = screen.getByRole("group", { name: "검증 통과" });
    expect(within(verified).getByText("31")).toBeInTheDocument();
    expect(within(verified).getByText("62%")).toBeInTheDocument();
    expect(within(verified).getByText(/6\.2/)).toBeInTheDocument();
  });

  test("draws the share bar with one segment per verdict, pending hatched", () => {
    render(<VerdictBoard counts={COUNTS} averageCitations={6.2} />);
    const bar = screen.getByRole("img", { name: /판정 비율/ });

    expect(bar.children).toHaveLength(4);
    expect(bar.children[3]).toHaveClass("hatch");
  });

  test("shows zero shares without dividing by zero", () => {
    render(<VerdictBoard counts={{ verified: 0, review: 0, risk: 0, pending: 0 }} averageCitations={0} />);

    expect(screen.getAllByText("0%")).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/dashboard/verdict-board.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/components/dashboard/verdict-board.tsx`:

```tsx
import { VERDICT_LABEL } from "@/components/dashboard/verdict-pill";
import type { Verdict } from "@/lib/services/verdictRollup";

const BOARD_ORDER: Verdict[] = ["verified", "review", "risk", "pending"];

const TITLE: Record<Verdict, string> = {
  verified: "검증 통과",
  review: "검토 필요",
  risk: "리스크",
  pending: "미분석",
};

const FILL: Record<Verdict, string> = {
  verified: "bg-verified-fill",
  review: "bg-review-fill",
  risk: "bg-risk-fill",
  pending: "hatch border border-border bg-background",
};

const EDGE: Record<Verdict, string> = {
  verified: "border-verified-fill",
  review: "border-review-fill",
  risk: "border-risk-fill",
  pending: "border-pending-fill",
};

function note(verdict: Verdict, averageCitations: number) {
  switch (verdict) {
    case "verified":
      return (
        <>
          근거 인용 평균 <b className="font-mono text-foreground">{averageCitations}</b>건
        </>
      );
    case "review":
      return "근거충실도 0.5~0.85 · 사람이 봐야 한다";
    case "risk":
      return "반증 발견 또는 원천 충돌";
    default:
      return "뉴스 수집 전 · 분석을 돌리지 않았다";
  }
}

/**
 * 판정 4분류를 비율 막대 하나와 네 칸으로 보인다.
 * 미분석은 색이 아니라 빗금이다 — 매트릭스의 결측과 같은 문법이어야 한다.
 */
export function VerdictBoard({
  counts,
  averageCitations,
}: {
  counts: Record<Verdict, number>;
  averageCitations: number;
}) {
  const total = BOARD_ORDER.reduce((sum, verdict) => sum + counts[verdict], 0);
  const share = (verdict: Verdict) => (total === 0 ? 0 : Math.round((counts[verdict] / total) * 100));

  return (
    <div className="flex flex-col gap-4 p-5">
      <div
        role="img"
        aria-label={`판정 비율 — ${BOARD_ORDER.map((v) => `${VERDICT_LABEL[v]} ${counts[v]}`).join(", ")}`}
        className="flex h-3.5 gap-0.5 overflow-hidden rounded-md"
      >
        {BOARD_ORDER.map((verdict) => (
          <div
            key={verdict}
            className={FILL[verdict]}
            style={{ flexGrow: total === 0 ? 1 : counts[verdict], flexBasis: 0 }}
          />
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {BOARD_ORDER.map((verdict) => (
          <div
            key={verdict}
            role="group"
            aria-label={TITLE[verdict]}
            className={`flex flex-col gap-1 border-l-[3px] pl-3 ${EDGE[verdict]}`}
          >
            <span className="text-[11.5px] font-semibold text-muted-foreground">{TITLE[verdict]}</span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-[30px] font-semibold leading-none tabular-nums">{counts[verdict]}</span>
              <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{share(verdict)}%</span>
            </span>
            <span className="text-[11.5px] text-muted-foreground">{note(verdict, averageCitations)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/dashboard/verdict-board.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/verdict-board.tsx src/components/dashboard/verdict-board.test.tsx
git commit -m "feat(dashboard): VerdictBoard share bar and tiles"
```

---

### Task 9: `GateFunnel` — 02 검증 게이트

**Files:**
- Create: `src/components/dashboard/gate-funnel.tsx`
- Test: `src/components/dashboard/gate-funnel.test.tsx`

**Interfaces:**
- Consumes: `VerdictSummary["gates"]`·`["gateDropouts"]` (Task 3)
- Produces: `GateFunnel({ gates, dropouts })`

- [ ] **Step 1: 실패 테스트 작성**

`src/components/dashboard/gate-funnel.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { GateFunnel } from "@/components/dashboard/gate-funnel";

const GATES = { analysed: 46, source: 44, faithfulness: 35, evidence: 31 };
const DROPOUTS = { source: 2, faithfulness: 9, evidence: 4 };

describe("GateFunnel", () => {
  test("lists the three gates in pipeline order with pass counts over analysed", () => {
    render(<GateFunnel gates={GATES} dropouts={DROPOUTS} />);
    const rows = screen.getAllByRole("listitem");

    expect(rows[0]).toHaveTextContent("출처 인용");
    expect(rows[0]).toHaveTextContent("44");
    expect(rows[0]).toHaveTextContent("/46");
    expect(rows[2]).toHaveTextContent("근거 일치");
    expect(rows[2]).toHaveTextContent("31");
  });

  test("sizes each bar by its pass ratio", () => {
    render(<GateFunnel gates={GATES} dropouts={DROPOUTS} />);
    const bar = within(screen.getAllByRole("listitem")[1]).getByRole("progressbar");

    expect(bar).toHaveAttribute("aria-valuenow", "35");
    expect(bar).toHaveAttribute("aria-valuemax", "46");
    expect(bar.firstElementChild).toHaveStyle({ width: "76%" });
  });

  test("explains each dropout with its fixed cause", () => {
    render(<GateFunnel gates={GATES} dropouts={DROPOUTS} />);

    expect(screen.getByText(/2개사 · 기사 링크 없음/)).toBeInTheDocument();
    expect(screen.getByText(/9개사 · 기사 원문에 없는 수치/)).toBeInTheDocument();
    expect(screen.getByText(/4개사 · 공식 원천과 불일치/)).toBeInTheDocument();
  });

  test("survives zero analysed companies", () => {
    render(<GateFunnel gates={{ analysed: 0, source: 0, faithfulness: 0, evidence: 0 }} dropouts={{ source: 0, faithfulness: 0, evidence: 0 }} />);

    expect(screen.getAllByRole("progressbar")[0].firstElementChild).toHaveStyle({ width: "0%" });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/dashboard/gate-funnel.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/components/dashboard/gate-funnel.tsx`:

```tsx
import type { VerdictSummary } from "@/lib/services/verdictRollup";

type Gates = VerdictSummary["gates"];
type Dropouts = VerdictSummary["gateDropouts"];

const STEPS: Array<{ key: keyof Dropouts; label: string; cause: string }> = [
  { key: "source", label: "① 출처 인용", cause: "기사 링크 없음" },
  { key: "faithfulness", label: "② 근거충실도", cause: "기사 원문에 없는 수치" },
  { key: "evidence", label: "③ 근거 일치", cause: "공식 원천과 불일치" },
];

/**
 * 세 검증 게이트를 차례로 지나며 줄어드는 기업 수를 막대로 그린다.
 * 어느 게이트에서 떨어지는지가 처방을 정하므로 탈락 원인을 함께 적는다.
 */
export function GateFunnel({ gates, dropouts }: { gates: Gates; dropouts: Dropouts }) {
  const width = (passed: number) => (gates.analysed === 0 ? 0 : Math.round((passed / gates.analysed) * 100));

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <p className="text-[11.5px] text-muted-foreground">
        분석 {gates.analysed}개사가 세 게이트를 차례로 지난다. 어느 게이트에서 떨어지는지가 처방을 정한다.
      </p>
      <ul className="flex flex-col gap-3">
        {STEPS.map((step) => {
          const passed = gates[step.key];
          return (
            <li key={step.key} className="grid grid-cols-[96px_minmax(0,1fr)_72px] items-center gap-3">
              <span className="text-[12px] font-semibold">{step.label}</span>
              <div
                role="progressbar"
                aria-label={`${step.label} 통과`}
                aria-valuenow={passed}
                aria-valuemin={0}
                aria-valuemax={gates.analysed}
                className="h-[22px] overflow-hidden rounded-[5px] bg-secondary"
              >
                <div className="h-full rounded-[5px] bg-primary" style={{ width: `${width(passed)}%` }} />
              </div>
              <span className="text-right font-mono text-[12px] tabular-nums">
                <b>{passed}</b>
                <span className="text-muted-foreground">/{gates.analysed}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-3 gap-2.5 border-t border-hairline pt-3">
        {STEPS.map((step) => (
          <div key={step.key} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">{step.label.slice(0, 1)}에서 탈락</span>
            <span className="text-[12px]">
              <b className="font-mono tabular-nums">{dropouts[step.key]}</b>개사 · {step.cause}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/dashboard/gate-funnel.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/gate-funnel.tsx src/components/dashboard/gate-funnel.test.tsx
git commit -m "feat(dashboard): GateFunnel for the three verification gates"
```

---

### Task 10: `SourceCoverageBars` — 03 원천 커버리지

**Files:**
- Create: `src/components/dashboard/source-coverage-bars.tsx`
- Test: `src/components/dashboard/source-coverage-bars.test.tsx`

**Interfaces:**
- Consumes: `SourceCoverage` (`sourceSnapshot.ts`), `SourceKey`
- Produces: `SourceCoverageBars({ coverage: SourceCoverage })`. 표시 순서는 `found` 내림차순.

- [ ] **Step 1: 실패 테스트 작성**

`src/components/dashboard/source-coverage-bars.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SourceCoverageBars } from "@/components/dashboard/source-coverage-bars";
import type { SourceCoverage } from "@/lib/repositories/sourceSnapshot";

const COVERAGE: SourceCoverage = {
  total: 50,
  bySource: [
    { source: "dart", found: 22 },
    { source: "dartFinance", found: 9 },
    { source: "fsc", found: 44 },
    { source: "nts", found: 50 },
    { source: "narajangteo", found: 31 },
    { source: "venture", found: 38 },
    { source: "nps", found: 46 },
  ],
};

describe("SourceCoverageBars", () => {
  test("orders sources by how many companies they confirmed", () => {
    render(<SourceCoverageBars coverage={COVERAGE} />);
    const rows = screen.getAllByRole("listitem");

    expect(rows[0]).toHaveTextContent("국세청");
    expect(rows[6]).toHaveTextContent("재무제표");
  });

  test("sizes each bar by found over total and hatches the rest", () => {
    render(<SourceCoverageBars coverage={COVERAGE} />);
    const row = screen.getByRole("listitem", { name: /국민연금/ });
    const bar = within(row).getByRole("progressbar");

    expect(bar).toHaveClass("hatch");
    expect(bar.firstElementChild).toHaveStyle({ width: "92%" });
    expect(row).toHaveTextContent("46");
    expect(row).toHaveTextContent("/50");
  });

  test("colours a full source as verified", () => {
    render(<SourceCoverageBars coverage={COVERAGE} />);
    const row = screen.getByRole("listitem", { name: /국세청/ });

    expect(within(row).getByRole("progressbar").firstElementChild).toHaveClass("bg-verified-fill");
  });

  test("explains why financial statements are structurally missing", () => {
    render(<SourceCoverageBars coverage={COVERAGE} />);

    expect(screen.getByText(/비상장·비외감이라 구조적 결측/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/dashboard/source-coverage-bars.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/components/dashboard/source-coverage-bars.tsx`:

```tsx
import type { SourceCoverage } from "@/lib/repositories/sourceSnapshot";
import type { SourceKey } from "@/lib/services/sourceEvidence";

const SOURCE_NAME: Record<SourceKey, string> = {
  dart: "DART",
  dartFinance: "재무제표",
  fsc: "금융위",
  nts: "국세청",
  narajangteo: "나라장터",
  venture: "벤처확인",
  nps: "국민연금",
};

/**
 * 원천별 확인 기업 수를 막대로 세운다. 빈 구간은 빗금이다 — 결측 문법을 매트릭스와 맞춘다.
 * 전수 확인만 verified 색을 쓴다. 나머지는 primary 로 두어 상태색을 장식에 쓰지 않는다.
 */
export function SourceCoverageBars({ coverage }: { coverage: SourceCoverage }) {
  const rows = [...coverage.bySource].sort((left, right) => right.found - left.found);
  const width = (found: number) => (coverage.total === 0 ? 0 : Math.round((found / coverage.total) * 100));

  return (
    <div className="flex flex-1 flex-col gap-2.5 p-5">
      <p className="text-[11.5px] text-muted-foreground">원천별로 몇 개사를 확인했나. 빗금은 원천에 기업이 없는 결측이다.</p>
      <ul className="flex flex-col gap-2 pt-1">
        {rows.map((entry) => {
          const full = coverage.total > 0 && entry.found >= coverage.total;
          return (
            <li
              key={entry.source}
              aria-label={`${SOURCE_NAME[entry.source]} ${entry.found}/${coverage.total}`}
              className="grid grid-cols-[64px_minmax(0,1fr)_52px] items-center gap-2.5"
            >
              <span className="text-[12px] font-medium">{SOURCE_NAME[entry.source]}</span>
              <div
                role="progressbar"
                aria-valuenow={entry.found}
                aria-valuemin={0}
                aria-valuemax={coverage.total}
                className="hatch relative h-2 overflow-hidden rounded bg-secondary"
              >
                <div
                  className={`h-full rounded ${full ? "bg-verified-fill" : "bg-primary"}`}
                  style={{ width: `${width(entry.found)}%` }}
                />
              </div>
              <span className={`text-right font-mono text-[12px] tabular-nums ${full ? "text-verified" : ""}`}>
                <b>{entry.found}</b>
                <span className="text-muted-foreground">/{coverage.total}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-hairline pt-2 text-[11.5px] text-muted-foreground">
        재무제표는 비상장·비외감이라 구조적 결측 — 나라장터 낙찰·연금 인건비가 대리지표다.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/dashboard/source-coverage-bars.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/source-coverage-bars.tsx src/components/dashboard/source-coverage-bars.test.tsx
git commit -m "feat(dashboard): SourceCoverageBars with hatched shortfall"
```

---

### Task 11: `ActionList` — 05 조치 필요

**Files:**
- Create: `src/components/dashboard/action-list.tsx`
- Test: `src/components/dashboard/action-list.test.tsx`

**Interfaces:**
- Consumes: `ActionItem` (Task 7)
- Produces: `ActionList({ items: ActionItem[]; year: number })`. 기업 칩은 `/companies/{id}` 링크. 칩 4개 초과 시 `외 n`.

- [ ] **Step 1: 실패 테스트 작성**

`src/components/dashboard/action-list.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ActionList } from "@/components/dashboard/action-list";
import type { ActionItem } from "@/lib/services/actionItems";

function item(over: Partial<ActionItem>): ActionItem {
  return { key: "stale", title: "30일 이상 보도 없음", tone: "plain", count: 0, companies: [], remedy: "재수집", ...over };
}

describe("ActionList", () => {
  test("prints title, count, chips and remedy for an item", () => {
    render(
      <ActionList
        year={2025}
        items={[item({ key: "businessNo", title: "사업자번호 미확보", tone: "review", count: 1, companies: [{ id: 3, name: "아크릴" }], remedy: "수기 입력" })]}
      />,
    );
    const row = screen.getByRole("listitem", { name: "사업자번호 미확보" });

    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "아크릴" })).toHaveAttribute("href", "/companies/3");
    expect(within(row).getByText("수기 입력")).toBeInTheDocument();
  });

  test("keeps a zero item visible and says none", () => {
    render(<ActionList year={2025} items={[item({})]} />);
    const row = screen.getByRole("listitem", { name: "30일 이상 보도 없음" });

    expect(within(row).getByText("0")).toBeInTheDocument();
    expect(within(row).getByText("없음")).toBeInTheDocument();
  });

  test("collapses more than four companies into a remainder", () => {
    const companies = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `기업${i + 1}` }));
    render(<ActionList year={2025} items={[item({ count: 7, companies })]} />);

    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.getByText("외 3")).toBeInTheDocument();
  });

  test("appends the detail after the name", () => {
    render(<ActionList year={2025} items={[item({ key: "decline", count: 1, companies: [{ id: 1, name: "알체라", detail: "▼31%" }] })]} />);

    expect(screen.getByRole("link", { name: /알체라/ })).toHaveTextContent("▼31%");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/dashboard/action-list.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/components/dashboard/action-list.tsx`:

```tsx
import Link from "next/link";
import type { ActionItem } from "@/lib/services/actionItems";

const CHIP_LIMIT = 4;

const TONE_CLASS: Record<ActionItem["tone"], string> = {
  review: "text-review",
  risk: "text-risk",
  plain: "text-foreground",
};

function Icon({ item }: { item: ActionItem }) {
  const common = { width: 14, height: 14, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true };
  switch (item.key) {
    case "businessNo":
      return <svg {...common}><path d="M6 1.5 11 10.5H1z" /><path d="M6 5v2.5" /></svg>;
    case "conflict":
      return <svg {...common}><circle cx="4" cy="6" r="2.6" /><circle cx="8" cy="6" r="2.6" /></svg>;
    case "stale":
      return <svg {...common}><circle cx="6" cy="6" r="4.5" /><path d="M6 3.5v3l2 1" /></svg>;
    default:
      return <svg {...common}><path d="M1.5 3.5 5 7l2-2 3.5 3.5" /><path d="M10.5 6v2.5H8" /></svg>;
  }
}

/**
 * 조치 필요 항목을 건수·기업 칩·처방으로 세운다.
 * 0건도 행을 남긴다 — 항목이 사라지면 점검했는지 알 수 없다.
 */
export function ActionList({ items }: { items: ActionItem[]; year: number }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const shown = item.companies.slice(0, CHIP_LIMIT);
        const rest = item.companies.length - shown.length;
        return (
          <li key={item.key} aria-label={item.title} className="flex flex-col gap-2 border-b border-hairline px-4 py-3.5 last:border-0">
            <div className="flex items-center justify-between gap-3">
              <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${TONE_CLASS[item.tone]}`}>
                <Icon item={item} />
                {item.title}
              </span>
              <span className={`font-mono text-[16px] font-semibold tabular-nums ${TONE_CLASS[item.tone]}`}>{item.count}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {shown.length === 0 ? (
                <span className="text-[11.5px] text-muted-foreground">없음</span>
              ) : (
                shown.map((company) => (
                  <Link
                    key={company.id}
                    href={`/companies/${company.id}`}
                    className="rounded-[5px] bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground hover:underline"
                  >
                    {company.name}
                    {company.detail ? <span className="ml-1 font-mono font-medium">{company.detail}</span> : null}
                  </Link>
                ))
              )}
              {rest > 0 ? <span className="text-[11.5px] text-muted-foreground">외 {rest}</span> : null}
            </div>
            <span className="text-[11.5px] text-muted-foreground">{item.remedy}</span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/dashboard/action-list.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/action-list.tsx src/components/dashboard/action-list.test.tsx
git commit -m "feat(dashboard): ActionList for operator follow-ups"
```

---

### Task 12: 근거 매트릭스 개편 — `matrixRows` + `CompanyPipelineGrid`

**Files:**
- Create: `src/lib/services/matrixRows.ts`
- Test: `src/lib/services/matrixRows.test.ts`
- Modify: `src/components/dashboard/company-pipeline-grid.tsx`
- Modify: `src/components/dashboard/company-pipeline-grid.test.tsx`

**Interfaces:**
- Consumes: `CompanyPipelineRow` (Task 2b), `CompanyVerdict`·`sortForTriage` (Task 3), `CompanyNews`·`isStale` (Task 6), `VerdictPill` (Task 5), `Panel` (Task 2)
- Produces:
  ```ts
  // matrixRows.ts
  export type MatrixRow = CompanyPipelineRow & { verdict: Verdict; faithfulness: number | null; citations: number; latestArticle: string | null };
  export type MatrixSort = "triage" | "name" | "score" | "news";
  export const MATRIX_COLUMNS = ["nts", "nps", "narajangteo", "venture", "dart", "dartFinance"] as const;
  export function buildMatrixRows(pipeline: CompanyPipelineRow[], verdicts: CompanyVerdict[], news: CompanyNews[]): MatrixRow[];
  export function sortMatrixRows(rows: MatrixRow[], sort: MatrixSort): MatrixRow[];
  // company-pipeline-grid.tsx
  export function CompanyPipelineGrid({ rows: MatrixRow[]; pageSize?: number; now?: Date }): JSX  — Panel 없이 표+푸터만 반환 (Panel 은 page.tsx 가 감싼다)
  export function MatrixFooter(...)  — 내부 사용
  ```

- [ ] **Step 1: `matrixRows` 실패 테스트**

`src/lib/services/matrixRows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import { buildMatrixRows, sortMatrixRows } from "@/lib/services/matrixRows";
import type { CompanyNews } from "@/lib/services/newsCoverage";
import type { CompanyVerdict } from "@/lib/services/verdictRollup";

function pipeline(id: number, name: string): CompanyPipelineRow {
  return { id, name, businessNo: null, cells: {} };
}

function verdict(id: number, name: string, over: Partial<CompanyVerdict> = {}): CompanyVerdict {
  return { companyId: id, name, verdict: "verified", faithfulness: 0.9, sourceCoverage: 0.8, evidenceMatch: 0.6, citations: 5, counterEvidence: 0, conflicts: [], runAt: null, ...over };
}

function news(id: number, name: string, latest: string | null): CompanyNews {
  return { companyId: id, name, articles: latest ? 1 : 0, latest };
}

describe("buildMatrixRows", () => {
  it("joins verdict, score, citations and newest article onto the pipeline row", () => {
    const rows = buildMatrixRows(
      [pipeline(1, "크립토랩")],
      [verdict(1, "크립토랩", { verdict: "review", faithfulness: 0.7, citations: 3 })],
      [news(1, "크립토랩", "2026-08-26T00:00:00.000Z")],
    );

    expect(rows[0]).toMatchObject({ id: 1, verdict: "review", faithfulness: 0.7, citations: 3, latestArticle: "2026-08-26T00:00:00.000Z" });
  });

  it("falls back to pending with no score when the company was never analysed", () => {
    const rows = buildMatrixRows([pipeline(2, "옥타코")], [], []);

    expect(rows[0]).toMatchObject({ verdict: "pending", faithfulness: null, citations: 0, latestArticle: null });
  });
});

describe("sortMatrixRows", () => {
  const rows = buildMatrixRows(
    [pipeline(1, "나"), pipeline(2, "가"), pipeline(3, "다")],
    [verdict(1, "나", { verdict: "verified", faithfulness: 0.9 }), verdict(2, "가", { verdict: "risk", faithfulness: 0.4 }), verdict(3, "다", { verdict: "review", faithfulness: 0.7 })],
    [news(1, "나", "2026-08-01T00:00:00.000Z"), news(2, "가", null), news(3, "다", "2026-08-20T00:00:00.000Z")],
  );

  it("triage puts risk first", () => {
    expect(sortMatrixRows(rows, "triage").map((row) => row.name)).toEqual(["가", "다", "나"]);
  });

  it("name sorts in Korean order", () => {
    expect(sortMatrixRows(rows, "name").map((row) => row.name)).toEqual(["가", "나", "다"]);
  });

  it("score sorts by faithfulness ascending with nulls last", () => {
    expect(sortMatrixRows(rows, "score").map((row) => row.name)).toEqual(["가", "다", "나"]);
  });

  it("news sorts oldest article first with none at the top", () => {
    expect(sortMatrixRows(rows, "news").map((row) => row.name)).toEqual(["가", "나", "다"]);
  });
});
```

Run: `npx vitest run src/lib/services/matrixRows.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 2: `matrixRows` 구현**

`src/lib/services/matrixRows.ts`:

```ts
import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import type { CompanyNews } from "@/lib/services/newsCoverage";
import { sortForTriage, type CompanyVerdict, type Verdict } from "@/lib/services/verdictRollup";

export type MatrixRow = CompanyPipelineRow & {
  verdict: Verdict;
  faithfulness: number | null;
  citations: number;
  latestArticle: string | null;
};

export type MatrixSort = "triage" | "name" | "score" | "news";

/** 매트릭스에 남기는 원천 열. 뉴스·금융위·분석·검증은 다른 열이 대신한다. */
export const MATRIX_COLUMNS = ["nts", "nps", "narajangteo", "venture", "dart", "dartFinance"] as const;

function stamp(published: string | null) {
  if (!published) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(published);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * 파이프라인 행에 판정·점수·인용·최신 보도일을 붙인다.
 */
export function buildMatrixRows(
  pipeline: CompanyPipelineRow[],
  verdicts: CompanyVerdict[],
  news: CompanyNews[],
): MatrixRow[] {
  const verdictById = new Map(verdicts.map((entry) => [entry.companyId, entry]));
  const newsById = new Map(news.map((entry) => [entry.companyId, entry]));

  return pipeline.map((row) => {
    const verdict = verdictById.get(row.id);
    return {
      ...row,
      verdict: verdict?.verdict ?? "pending",
      faithfulness: verdict?.faithfulness ?? null,
      citations: verdict?.citations ?? 0,
      latestArticle: newsById.get(row.id)?.latest ?? null,
    };
  });
}

/**
 * 봐야 할 순서·기업명·검증 점수·최근 보도 네 기준 중 하나로 세운다.
 */
export function sortMatrixRows(rows: MatrixRow[], sort: MatrixSort): MatrixRow[] {
  switch (sort) {
    case "name":
      return [...rows].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    case "score":
      return [...rows].sort(
        (a, b) => (a.faithfulness ?? Number.POSITIVE_INFINITY) - (b.faithfulness ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name, "ko"),
      );
    case "news":
      return [...rows].sort((a, b) => stamp(a.latestArticle) - stamp(b.latestArticle) || a.name.localeCompare(b.name, "ko"));
    default:
      return sortForTriage(rows);
  }
}
```

Run: `npx vitest run src/lib/services/matrixRows.test.ts`
Expected: PASS

- [ ] **Step 3: 그리드 테스트 교체**

`src/components/dashboard/company-pipeline-grid.test.tsx` 전체 교체:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CompanyPipelineGrid, compactValue } from "@/components/dashboard/company-pipeline-grid";
import type { MatrixRow } from "@/lib/services/matrixRows";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function row(id: number, over: Partial<MatrixRow> = {}): MatrixRow {
  return {
    id,
    name: `기업${id}`,
    businessNo: "1198701587",
    verdict: "verified",
    faithfulness: 0.9,
    citations: 5,
    latestArticle: "2026-08-26T00:00:00.000Z",
    cells: {
      nts: { state: "ok", value: "계속사업자", note: "부가가치세 일반과세자" },
      nps: { state: "ok", value: "가입자 61명", note: "625870" },
      narajangteo: { state: "unmeasurable", value: "조달업체 미등록", note: "공공조달 미참여" },
      venture: { state: "absent", value: "벤처확인 명단에 없음", note: "" },
      dart: { state: "conflict", value: "이름이 정확히 맞는 기업이 없다", note: "후보 2건" },
      dartFinance: { state: "absent", value: "재무제표 미공시 (비외감)", note: "" },
    },
    ...over,
  };
}

const ROWS = Array.from({ length: 24 }, (_, index) => row(index + 1));

describe("CompanyPipelineGrid", () => {
  test("prints the value each stage returned, not a tick", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} now={NOW} />);
    const line = screen.getByRole("row", { name: /기업1/ });

    expect(within(line).getByText("계속사업자")).toBeInTheDocument();
    expect(within(line).getByText("가입자 61명")).toBeInTheDocument();
  });

  test("leads with the verdict and ends with score, citations and newest article", () => {
    render(<CompanyPipelineGrid rows={[row(1, { verdict: "review", faithfulness: 0.72, citations: 3 })]} pageSize={10} now={NOW} />);
    const line = screen.getByRole("row", { name: /기업1/ });
    const cells = within(line).getAllByRole("cell");

    expect(within(line).getByText("검토")).toBeInTheDocument();
    expect(cells.at(-3)).toHaveTextContent("0.72");
    expect(cells.at(-2)).toHaveTextContent("3");
    expect(cells.at(-1)).toHaveTextContent("08-26");
  });

  test("warns instead of leaving the business number blank", () => {
    render(<CompanyPipelineGrid rows={[row(1, { businessNo: null })]} pageSize={10} now={NOW} />);

    expect(screen.getByText("미확보 · 대조 불가")).toHaveClass("text-review");
  });

  test("formats a present business number with dashes in tabular figures", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} now={NOW} />);

    expect(screen.getByText("119-87-01587")).toHaveClass("font-mono");
  });

  test("marks a newest article older than 30 days in risk colour", () => {
    render(<CompanyPipelineGrid rows={[row(1, { latestArticle: "2026-05-11T00:00:00.000Z" })]} pageSize={10} now={NOW} />);

    expect(screen.getByText("05-11")).toHaveClass("text-risk");
  });

  test("draws a left edge on risk and review rows only", () => {
    render(<CompanyPipelineGrid rows={[row(1, { verdict: "risk" }), row(2, { verdict: "verified" })]} pageSize={10} now={NOW} />);

    expect(screen.getByRole("row", { name: /기업1/ })).toHaveClass("shadow-[inset_3px_0_0_var(--risk-fill)]");
    expect(screen.getByRole("row", { name: /기업2/ })).not.toHaveClass("shadow-[inset_3px_0_0_var(--risk-fill)]");
  });

  test("sorts in triage order by default and re-sorts by name on request", () => {
    render(<CompanyPipelineGrid rows={[row(1, { name: "나", verdict: "verified" }), row(2, { name: "가", verdict: "risk" })]} pageSize={10} now={NOW} />);
    const names = () => screen.getAllByRole("rowheader").map((cell) => cell.textContent);

    expect(names()).toEqual(["가", "나"]);
    fireEvent.click(screen.getByRole("radio", { name: "기업명" }));
    expect(names()).toEqual(["가", "나"]);
    fireEvent.click(screen.getByRole("radio", { name: "검증 점수" }));
    expect(names()).toEqual(["나", "가"].sort((a, b) => a.localeCompare(b, "ko")));
  });

  test("keeps a blank short in the grid but explains it on hover", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} now={NOW} />);
    const cell = screen.getByLabelText(/기업1 재무 결측/);

    expect(cell).toHaveTextContent("미공시");
    expect(cell).toHaveAttribute("title", expect.stringContaining("재무제표 미공시 (비외감)"));
  });

  test("holds the block at a constant height so paging does not resize the table", () => {
    const { container } = render(<CompanyPipelineGrid rows={ROWS} pageSize={10} now={NOW} />);
    const height = () => container.querySelectorAll("tbody tr").length;

    expect(height()).toBe(10);
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(height()).toBe(10);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  test("names the four blank kinds and the business-number warning in the footer", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} now={NOW} />);

    for (const label of ["확인", "결측", "충돌", "미조회"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(/사업자번호 미확보는 뉴스 외 근거를 붙일 수 없다/)).toBeInTheDocument();
  });

  test("says so when there are no companies", () => {
    render(<CompanyPipelineGrid rows={[]} now={NOW} />);

    expect(screen.getByText(/등록된 기업이 없습니다/)).toBeInTheDocument();
  });
});

describe("compactValue", () => {
  test("turns a conflict with candidates into the candidate count", () => {
    expect(compactValue("dart", { state: "conflict", value: "x", note: "후보 3건" })).toBe("후보 3건");
  });

  test("shortens absent per stage", () => {
    expect(compactValue("dartFinance", { state: "absent", value: "x", note: "" })).toBe("미공시");
    expect(compactValue("nps", { state: "absent", value: "x", note: "" })).toBe("미가입");
  });

  test("prints a dash for pending", () => {
    expect(compactValue("nts", { state: "pending", value: "", note: "" })).toBe("—");
  });
});
```

Run: `npx vitest run src/components/dashboard/company-pipeline-grid.test.tsx`
Expected: FAIL — 판정 열·정렬 라디오 등 없음

- [ ] **Step 4: 그리드 구현 교체**

`src/components/dashboard/company-pipeline-grid.tsx` 전체 교체:

```tsx
"use client";

import { useState } from "react";
import { VerdictPill } from "@/components/dashboard/verdict-pill";
import type { CellState, PipelineCell } from "@/lib/repositories/companyPipeline";
import { MATRIX_COLUMNS, sortMatrixRows, type MatrixRow, type MatrixSort } from "@/lib/services/matrixRows";
import { isStale } from "@/lib/services/newsCoverage";
import { MATRIX_STAGES } from "@/lib/services/pipelineMatrix";

const STAGES = MATRIX_STAGES.filter((stage) => (MATRIX_COLUMNS as readonly string[]).includes(stage.key));

const STATE_LABEL: Record<CellState, string> = {
  ok: "확인",
  absent: "결측",
  unmeasurable: "측정 불가",
  conflict: "충돌",
  pending: "미조회",
};

const STATE_CLASS: Record<CellState, string> = {
  ok: "bg-verified-surface",
  absent: "bg-pending-surface",
  unmeasurable: "border border-dashed border-muted-foreground/50",
  conflict: "bg-risk-surface",
  pending: "",
};

const VALUE_CLASS: Record<CellState, string> = {
  ok: "text-verified",
  absent: "text-muted-foreground",
  unmeasurable: "text-muted-foreground",
  conflict: "text-risk",
  pending: "text-muted-foreground/45",
};

const ABSENT_LABEL: Record<string, string> = {
  dart: "미등록",
  dartFinance: "미공시",
  venture: "미확인",
  nps: "미가입",
  nts: "조회 불가",
  narajangteo: "미등록",
};

const SORTS: Array<{ key: MatrixSort; label: string }> = [
  { key: "triage", label: "봐야 할 순서" },
  { key: "name", label: "기업명" },
  { key: "score", label: "검증 점수" },
  { key: "news", label: "최근 보도" },
];

const EDGE: Partial<Record<MatrixRow["verdict"], string>> = {
  risk: "shadow-[inset_3px_0_0_var(--risk-fill)]",
  review: "shadow-[inset_3px_0_0_var(--review-fill)]",
};

const LEGEND: Array<{ label: string; swatch: string }> = [
  { label: "확인", swatch: "bg-verified-surface border border-verified/40" },
  { label: "결측", swatch: "bg-pending-surface border border-border" },
  { label: "충돌", swatch: "bg-risk-surface border border-risk/40" },
  { label: "미조회", swatch: "border border-dashed border-pending-fill" },
];

/**
 * 격자 칸에 들어갈 짧은 말로 줄인다.
 * 사유 문장은 길어서 열을 넘긴다 - 전체 문장은 title 과 기업 상세 화면에 그대로 남는다.
 */
export function compactValue(stageKey: string, cell: PipelineCell) {
  switch (cell.state) {
    case "pending":
      return "—";
    case "absent":
      return ABSENT_LABEL[stageKey] ?? "없음";
    case "unmeasurable":
      return "미참여";
    case "conflict":
      return /후보\s*\d+건/.test(cell.note) ? cell.note : "충돌";
    default:
      return cell.value || "—";
  }
}

function formatBusinessNo(businessNo: string) {
  return `${businessNo.slice(0, 3)}-${businessNo.slice(3, 5)}-${businessNo.slice(5)}`;
}

function monthDay(iso: string | null) {
  return iso ? iso.slice(5, 10) : "—";
}

function score(value: number | null, verdict: MatrixRow["verdict"]) {
  if (value === null) return <span className="text-muted-foreground/45">—</span>;
  const colour = verdict === "risk" ? "text-risk" : verdict === "review" ? "text-review" : verdict === "verified" ? "text-verified" : "";
  return <span className={`font-semibold ${colour}`}>{value.toFixed(2)}</span>;
}

/**
 * 기업마다 판정과 각 원천이 무엇을 돌려줬는지 값으로 낸다.
 * 상태만 두면 "돌았다"까지만 알 수 있다. 빈칸도 사유를 적어 결측과 미조회가 갈리게 한다.
 */
export function CompanyPipelineGrid({
  rows,
  pageSize = 10,
  now,
}: {
  rows: MatrixRow[];
  pageSize?: number;
  now?: Date;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<MatrixSort>("triage");

  if (rows.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
        등록된 기업이 없습니다.
      </p>
    );
  }

  const sorted = sortMatrixRows(rows, sort);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const filler = Array.from({ length: pageSize - slice.length }, (_, index) => index);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end gap-1 border-b border-hairline px-3 py-2">
        <div role="radiogroup" aria-label="정렬" className="flex items-center gap-1 rounded-[7px] bg-secondary p-0.5 text-[11.5px]">
          {SORTS.map((entry) => {
            const selected = entry.key === sort;
            return (
              <button
                key={entry.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setSort(entry.key);
                  setPage(0);
                }}
                className={`rounded-[5px] px-2.5 py-1 ${selected ? "bg-background font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground"}`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] table-fixed text-[12px]">
          <caption className="sr-only">기업별 근거 매트릭스</caption>
          <thead>
            <tr className="border-b border-border bg-surface text-[11px] text-muted-foreground">
              <th scope="col" className="w-[84px] px-2.5 py-2 text-left font-semibold">판정</th>
              <th scope="col" className="sticky left-0 z-10 w-[120px] bg-surface px-2.5 py-2 text-left font-semibold">기업</th>
              <th scope="col" className="w-[112px] px-2.5 py-2 text-left font-semibold">사업자번호</th>
              {STAGES.map((stage) => (
                <th key={stage.key} scope="col" title={`${stage.label} — ${stage.purpose} · ${stage.endpoint}`} className="px-2 py-2 text-left font-semibold">
                  {stage.short}
                </th>
              ))}
              <th scope="col" className="w-[68px] px-2.5 py-2 text-right font-semibold">충실도</th>
              <th scope="col" className="w-[44px] px-2.5 py-2 text-right font-semibold">인용</th>
              <th scope="col" className="w-[72px] px-2.5 py-2 text-left font-semibold">최근 보도</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((entry) => (
              <tr key={entry.id} className={`border-b border-hairline align-middle last:border-0 ${EDGE[entry.verdict] ?? ""}`}>
                <td className="px-2.5 py-1.5"><VerdictPill verdict={entry.verdict} /></td>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-background px-2.5 py-1.5 text-left font-semibold">
                  {entry.name}
                </th>
                <td className="px-2.5 py-1.5">
                  {entry.businessNo ? (
                    <span className="font-mono tabular-nums">{formatBusinessNo(entry.businessNo)}</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-review">미확보 · 대조 불가</span>
                  )}
                </td>
                {STAGES.map((stage) => {
                  const cell = entry.cells[stage.key] ?? { state: "pending" as CellState, value: "", note: "" };
                  return (
                    <td key={stage.key} className="px-1 py-1">
                      <div
                        aria-label={`${entry.name} ${stage.short} ${STATE_LABEL[cell.state]}${cell.value ? ` ${cell.value}` : ""}`}
                        title={cell.note ? `${cell.value} · ${cell.note}` : cell.value}
                        className={`rounded px-1.5 py-1 ${STATE_CLASS[cell.state]}`}
                      >
                        <span className={`block truncate text-[11px] font-semibold ${VALUE_CLASS[cell.state]}`}>
                          {compactValue(stage.key, cell)}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">{score(entry.faithfulness, entry.verdict)}</td>
                <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                  {entry.verdict === "pending" ? <span className="text-muted-foreground/45">—</span> : entry.citations}
                </td>
                <td className="px-2.5 py-1.5">
                  <span className={`font-mono tabular-nums ${entry.latestArticle && isStale(entry.latestArticle, now) ? "text-risk" : "text-muted-foreground"}`}>
                    {monthDay(entry.latestArticle)}
                  </span>
                </td>
              </tr>
            ))}
            {filler.map((index) => (
              <tr key={`filler-${index}`} aria-hidden className="border-b border-hairline last:border-0">
                <td colSpan={STAGES.length + 6} className="px-2.5 py-1.5">
                  <span className="block h-[22px]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-3.5 py-2 text-[11px] text-muted-foreground">
        <span className="flex flex-wrap items-center gap-3">
          {LEGEND.map((entry) => (
            <span key={entry.label} className="flex items-center gap-1.5">
              <span aria-hidden className={`h-3 w-3 rounded-[3px] ${entry.swatch}`} />
              {entry.label}
            </span>
          ))}
          <span className="font-semibold text-review">사업자번호 미확보는 뉴스 외 근거를 붙일 수 없다</span>
        </span>
        <span className="flex items-center gap-2">
          <span>{rows.length}개사</span>
          <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} className="rounded-[5px] border border-border bg-background px-2 py-0.5 disabled:opacity-40">
            이전
          </button>
          <span className="font-mono tabular-nums">{current + 1} / {pages}</span>
          <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} className="rounded-[5px] border border-border bg-background px-2 py-0.5 disabled:opacity-40">
            다음
          </button>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/components/dashboard/company-pipeline-grid.test.tsx src/lib/services/matrixRows.test.ts`
Expected: PASS. `page.tsx` 는 아직 옛 시그니처로 그리드를 부르므로 `npm run build` 는 이 태스크에서 돌리지 않는다 (Task 14 에서 맞춘다).

- [ ] **Step 6: 커밋**

```bash
git add src/lib/services/matrixRows.ts src/lib/services/matrixRows.test.ts src/components/dashboard/company-pipeline-grid.tsx src/components/dashboard/company-pipeline-grid.test.tsx
git commit -m "feat(dashboard): evidence matrix with verdict column and triage sort"
```

---

### Task 13: `RecentArticles` 개편 — 06

**Files:**
- Modify: `src/components/dashboard/recent-articles.tsx`
- Modify: `src/components/dashboard/recent-articles.test.tsx`

**Interfaces:**
- Produces: `RecentArticles({ articles: MentionedArticle[]; now?: Date; emptyLabel?: string })` — Panel 없이 목록만 반환. 그룹 `이번 주`(7일 이내) / `지난 주`(8~14일) / `그 이전`.

- [ ] **Step 1: 테스트 교체**

`src/components/dashboard/recent-articles.test.tsx` 전체 교체:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { RecentArticles } from "@/components/dashboard/recent-articles";
import type { MentionedArticle } from "@/lib/services/coMention";

const NOW = new Date("2026-08-29T00:00:00.000Z");

const ARTICLES: MentionedArticle[] = [
  { title: "크립토랩·옥타코 공동 보안 과제 수주", link: "https://n/2", source: "전자신문", published: "2026-08-26T09:00:00.000Z", companies: ["옥타코", "크립토랩"] },
  { title: "크립토랩 시리즈B 200억 유치", link: "https://n/1", source: "머니투데이", published: "2026-08-18T00:00:00.000Z", companies: ["크립토랩"] },
  { title: "아크릴 AI 플랫폼 고도화", link: "https://n/0", source: "ZDNet", published: "2026-07-01T00:00:00.000Z", companies: ["아크릴"] },
];

describe("RecentArticles", () => {
  test("keeps the order it is given, newest first", () => {
    render(<RecentArticles articles={ARTICLES} now={NOW} />);
    const items = within(screen.getByRole("list", { name: "최근 기사" })).getAllByRole("listitem");

    expect(items[0]).toHaveTextContent("크립토랩·옥타코 공동 보안 과제 수주");
    expect(items[2]).toHaveTextContent("아크릴 AI 플랫폼 고도화");
  });

  test("groups by this week, last week and earlier", () => {
    render(<RecentArticles articles={ARTICLES} now={NOW} />);
    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(heads).toEqual(["이번 주", "지난 주", "그 이전"]);
  });

  test("lays out date, outlet, headline and company chips as columns", () => {
    render(<RecentArticles articles={ARTICLES} now={NOW} />);
    const first = within(screen.getByRole("list", { name: "최근 기사" })).getAllByRole("listitem")[0];

    expect(within(first).getByText("08-26")).toHaveClass("font-mono");
    expect(within(first).getByText("전자신문")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "크립토랩·옥타코 공동 보안 과제 수주" })).toHaveAttribute("href", "https://n/2");
    expect(within(first).getByText("옥타코")).toBeInTheDocument();
    expect(within(first).getByText("크립토랩")).toBeInTheDocument();
  });

  test("says nothing has been collected rather than showing an empty list", () => {
    render(<RecentArticles articles={[]} now={NOW} />);

    expect(screen.getByText(/수집된 기사가 없습니다/)).toBeInTheDocument();
  });

  test("uses the given empty label when a filter yields nothing", () => {
    render(<RecentArticles articles={[]} now={NOW} emptyLabel="이 기업의 기사가 없습니다." />);

    expect(screen.getByText("이 기업의 기사가 없습니다.")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/dashboard/recent-articles.test.tsx`
Expected: FAIL — 그룹 헤더 없음, `emptyLabel` 없음

- [ ] **Step 2: 구현 교체**

`src/components/dashboard/recent-articles.tsx` 전체 교체:

```tsx
import type { MentionedArticle } from "@/lib/services/coMention";

const DAY_MS = 86_400_000;
const GROUPS = [
  { label: "이번 주", maxDays: 7 },
  { label: "지난 주", maxDays: 14 },
  { label: "그 이전", maxDays: Number.POSITIVE_INFINITY },
];

function monthDay(published: string) {
  return published.slice(5, 10);
}

function groupOf(published: string, now: Date) {
  const age = (now.getTime() - Date.parse(published)) / DAY_MS;
  return GROUPS.find((group) => age <= group.maxDays)?.label ?? GROUPS[GROUPS.length - 1].label;
}

/**
 * 수집한 기사를 최신순으로 세우고 주 단위로 묶어, 그 기사가 다루는 등록 기업을 함께 붙인다.
 * 심사에서 먼저 찾는 것은 관계 요약이 아니라 최근에 무슨 일이 있었는지다.
 */
export function RecentArticles({
  articles,
  now = new Date(),
  emptyLabel = "수집된 기사가 없습니다.",
}: {
  articles: MentionedArticle[];
  now?: Date;
  emptyLabel?: string;
}) {
  if (articles.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  const grouped = GROUPS.map((group) => ({
    label: group.label,
    items: articles.filter((entry) => groupOf(entry.published, now) === group.label),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ul aria-label="최근 기사" className="flex flex-col">
        {grouped.map((group) => (
          <li key={group.label} className="contents">
            <h3 className="border-b border-hairline bg-surface px-3.5 py-1.5 text-[10.5px] font-bold tracking-[0.08em] text-muted-foreground">
              {group.label}
            </h3>
            <ul className="flex flex-col">
              {group.items.map((entry) => (
                <li key={entry.link} className="grid grid-cols-[48px_76px_minmax(0,1fr)_auto] items-baseline gap-2.5 border-b border-hairline px-3.5 py-2 last:border-0">
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{monthDay(entry.published)}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{entry.source}</span>
                  <a href={entry.link} target="_blank" rel="noreferrer" className="truncate text-[12.5px] font-medium underline-offset-2 hover:underline">
                    {entry.title}
                  </a>
                  <span className="flex gap-1">
                    {entry.companies.map((name) => (
                      <span key={name} className="rounded-[5px] bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                        {name}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`getAllByRole("listitem")` 이 그룹 `li` 까지 잡지 않도록 첫 테스트의 `items` 선택자는 안쪽 목록만 세야 한다 — 테스트에서 `within(list).getAllByRole("listitem")` 은 중첩 li 도 포함하므로, 테스트 1·3 의 `getAllByRole("listitem")` 을 `getAllByRole("link").map((a) => a.closest("li")!)` 로 바꾼다.

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run src/components/dashboard/recent-articles.test.tsx`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add src/components/dashboard/recent-articles.tsx src/components/dashboard/recent-articles.test.tsx
git commit -m "feat(dashboard): RecentArticles in weekly groups with column layout"
```

---

### Task 14: `/dashboard` 조립

**Files:**
- Modify: `src/app/dashboard/page.tsx` (전체 교체)

**Interfaces:**
- Consumes: Task 2~13 의 모든 산출물. 기존 `listCompanies`·`listYears`·`listMentionArticles`·`listCompanyPipeline`·`summariseSourceCoverage`·`buildCoMentions`·`getDashboardSummary`

- [ ] **Step 1: `page.tsx` 전체 교체**

```tsx
import Link from "next/link";
import { listCompanies, listYears } from "@/lib/repositories/companyRepository";
import { listMentionArticles } from "@/lib/repositories/mentionArticles";
import { listCompanyPipeline } from "@/lib/repositories/companyPipeline";
import { summariseSourceCoverage } from "@/lib/repositories/sourceSnapshot";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { buildActionItems } from "@/lib/services/actionItems";
import { buildCoMentions } from "@/lib/services/coMention";
import { getDashboardSummary } from "@/lib/services/dashboardSummary";
import { buildMatrixRows } from "@/lib/services/matrixRows";
import { buildNewsCoverage } from "@/lib/services/newsCoverage";
import { rollupVerdicts } from "@/lib/services/verdictRollup";
import { ActionList } from "@/components/dashboard/action-list";
import { CompanyPipelineGrid } from "@/components/dashboard/company-pipeline-grid";
import { GateFunnel } from "@/components/dashboard/gate-funnel";
import { Panel } from "@/components/dashboard/panel";
import { RecentArticles } from "@/components/dashboard/recent-articles";
import { SourceCoverageBars } from "@/components/dashboard/source-coverage-bars";
import { VerdictBoard } from "@/components/dashboard/verdict-board";

function currentYear() {
  return new Date().getFullYear();
}

function monthLabel(ym: string | undefined) {
  return ym ? `${ym.slice(0, 4)}-${ym.slice(4, 6)}` : "—";
}

function runLabel(iso: string | null) {
  return iso ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}` : "—";
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const years = await listYears();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) ? requested : (years[0] ?? currentYear());
  const now = new Date();

  const companies = await listCompanies({ year });
  const registry = companies.map((company) => ({ id: company.id, name: company.name, businessNo: company.businessNo ?? null }));
  const pipeline = await listCompanyPipeline(year);
  const coverage = await summariseSourceCoverage(year);
  const summary = await getDashboardSummary(year);
  const verdicts = rollupVerdicts({ companies: registry, verifications: await listLatestVerifications(year), pipeline });
  const graph = buildCoMentions(await listMentionArticles(year), registry.map((company) => company.name));
  const news = buildNewsCoverage(registry, graph.articles, now);
  const actions = buildActionItems({ companies: registry, pipeline, news, declining: summary.movers.declining, now });
  const matrix = buildMatrixRows(pipeline, verdicts.companies, news.byCompany);

  const needsHands = new Set([
    ...verdicts.companies.filter((entry) => entry.verdict === "risk").map((entry) => entry.companyId),
    ...registry.filter((company) => !company.businessNo).map((company) => company.id),
  ]).size;
  const latestRun = verdicts.companies.map((entry) => entry.runAt).filter((value): value is string => value !== null).sort().at(-1) ?? null;

  return (
    <div className="flex flex-col gap-9">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {year}년 평가 · ICT기금사업 우수기업
          </span>
          <h1 className="text-[24px] font-extrabold leading-[1.15] tracking-[-0.035em]">선정 근거 준비 현황</h1>
          <p className="text-[11.5px] text-muted-foreground" title="손이 가야 하는 기업 = 리스크 판정 ∪ 사업자번호 미확보">
            {companies.length}개사 중 <b className="text-verified">{verdicts.counts.verified}개사</b>가 검증을 통과했고,{" "}
            <b className="text-risk">{needsHands}개사</b>는 오늘 손이 가야 합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <dl className="flex flex-col gap-0.5 rounded-lg border border-border bg-background px-3 py-2">
            <dt className="text-[10.5px] text-muted-foreground">연금 스냅샷</dt>
            <dd className="font-mono text-[13px] font-semibold tabular-nums">{monthLabel(summary.months.at(-1))}</dd>
          </dl>
          <dl className="flex flex-col gap-0.5 rounded-lg border border-border bg-background px-3 py-2">
            <dt className="text-[10.5px] text-muted-foreground">마지막 분석</dt>
            <dd className="font-mono text-[13px] font-semibold tabular-nums">{runLabel(latestRun)}</dd>
          </dl>
          {verdicts.counts.pending > 0 ? (
            <Link
              href={`/companies?year=${year}`}
              className="flex items-center rounded-lg bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              미분석 {verdicts.counts.pending}개사 보기
            </Link>
          ) : null}
        </div>
      </header>

      <Panel index="01" title="판정 현황" tag="분석 산출" tone="fresh" note="환각 검증 3게이트를 통과한 기업만 선정 근거로 쓸 수 있다">
        <VerdictBoard counts={verdicts.counts} averageCitations={verdicts.averageCitations} />
      </Panel>

      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <Panel index="02" title="검증 게이트 통과율" tag="분석 산출" tone="fresh">
          <GateFunnel gates={verdicts.gates} dropouts={verdicts.gateDropouts} />
        </Panel>
        <Panel index="03" title="원천 커버리지" tag="실측">
          <SourceCoverageBars coverage={coverage} />
        </Panel>
      </div>

      <Panel index="04" title="기업별 근거 매트릭스" tag="실측" note="봐야 할 순서로 정렬 — 리스크 · 검토 · 통과 · 미분석">
        <CompanyPipelineGrid rows={matrix} now={now} />
      </Panel>

      <div className="grid items-start gap-5 lg:grid-cols-[372px_minmax(0,1fr)]">
        <Panel index="05" title="조치 필요" tag="운영">
          <ActionList items={actions} year={year} />
        </Panel>
        <Panel
          index="06"
          title="최근 기사"
          tag="수집"
          className="lg:h-[26rem]"
          aside={
            <span className="text-[11px] text-muted-foreground">
              최근 14일 <b className="font-mono text-foreground tabular-nums">{news.recent14}</b>건 · 전체{" "}
              <b className="font-mono text-foreground tabular-nums">{news.total}</b>건
            </span>
          }
        >
          <RecentArticles articles={graph.articles} now={now} />
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `Panel` 빈 상태와 그리드 빈 상태 중복 정리**

`CompanyPipelineGrid`·`RecentArticles` 는 스스로 빈 상태 문구를 그린다. `Panel` 안에서 두 번 테두리가 생기지 않도록 `page.tsx` 에서 `matrix.length === 0 ? null : <CompanyPipelineGrid …/>` 와 `graph.articles.length === 0 ? null : <RecentArticles …/>` 로 넘기고, `Panel` 에 `empty="등록된 기업이 없습니다."` / `empty="수집된 기사가 없습니다."` 를 준다.

- [ ] **Step 3: 타입·빌드 확인**

Run: `npx next typegen && npm run build`
Expected: 빌드 성공. 실패하면 오류 메시지의 파일·줄을 고친다 — 흔한 것: `company.businessNo` 가 `CompanyModel` 에 없으면 `prisma/schema.prisma` 의 `Company.businessNo` 를 확인(있음).

- [ ] **Step 4: 전체 테스트**

Run: `npm test`
Expected: 전부 PASS. `growth-ranking`·`cloud-board`·`naver-map`·`region-grid` 테스트는 컴포넌트가 남아 있으므로 그대로 통과한다.

- [ ] **Step 5: 린트**

Run: `npm run lint`
Expected: 오류 없음. 미사용 import 가 있으면 제거.

- [ ] **Step 6: 육안 확인**

Run: `./scripts/dev.sh` 후 `http://localhost:3000/dashboard` 를 연다. 확인할 것:
- 01 막대 4구간이 보이고 미분석이 빗금이다
- 04 매트릭스가 리스크 행부터 시작하고, 사업자번호 없는 기업이 주황 경고로 보인다
- 05 항목 4개가 0건이어도 보인다
- 06 이 `lg` 에서 26rem 높이 안에서 스크롤된다
- 지도·워드클라우드·증감 랭킹이 없다

- [ ] **Step 7: 커밋**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): rebuild as evidence readiness board"
```

---

## Self-Review

**Spec coverage**
- A 토큰 → Task 1 ✓ · B Panel → Task 2 ✓ · C-1/C-2/C-3 → Task 3/4/5 ✓
- D 헤더(킥커·제목·요약·스냅샷·마지막 분석·미분석 링크) → Task 14 ✓ · 01 → Task 8 · 02 → Task 9 · 03 → Task 10 · 04 → Task 12 · 05 → Task 7+11 · 06 → Task 13
- 새 서비스 `newsCoverage`·`actionItems` → Task 6·7 ✓, 추가로 `matrixRows` 를 두어 그리드가 페이지 조립 로직을 갖지 않게 했다
- 제거 대상(지도·워드클라우드·랭킹)은 Task 14 에서 import 를 빼는 것으로 처리, 파일 보존 ✓
- 스펙의 `/companies?year=…&verdict=pending` 은 `/companies` 가 `verdict` 를 받지 않아 **`?year=` 만** 붙인다. 필터는 후속 과제
- 스펙의 "기업별 보도 현황 보기" 링크는 범위 밖 ✓ (미구현)

**Type consistency**
- `VerificationRow`·`CompanyVerdict`·`VerdictSummary` 는 Task 3 정의를 Task 4·8·9·12·14 가 그대로 쓴다
- `CompanyPipelineRow.businessNo` 는 Task 2b 에서 추가되며 Task 3·7·12 의 테스트 헬퍼가 `businessNo: null` 을 포함한다
- `MatrixRow`·`MatrixSort`·`MATRIX_COLUMNS` 는 Task 12 정의를 Task 14 가 쓴다

**Placeholder scan** — "TBD/TODO/적절히" 없음. 모든 코드 스텝에 실제 코드가 있다.
