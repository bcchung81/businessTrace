# 사건 중심 모니터링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 담당자가 월 1회 열어 "지난 30일 우리 기업들에 무슨 일이 있었나"를 사건 단위로 보고, 확인·조치 상태를 기록하고, 월간 문서를 내려받을 수 있게 한다.

**Architecture:** `Event` 테이블을 1급 데이터로 두고, 분석·연금·원천 수집 끝에서 순수 규칙 함수가 사건을 추출해 upsert 한다(담당자 처리 기록은 보존). 대시보드·기업 카드·기업 상세·월간 문서는 전부 `listEvents` 에서 파생한다. LLM 은 사건 추출·요약에 쓰지 않는다.

**Tech Stack:** Next.js 16.3 App Router(Server Actions) · Prisma(SQLite) · Tailwind v4 + shadcn(new-york, `Card`/`Badge`/`Dialog`) · exceljs · vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-08-30-event-monitoring-design.md`

## Global Constraints

- 주석은 JSDoc 만, 본문 3줄 이내. `//` 줄 주석 금지 (CLAUDE.md)
- 실패 테스트 → 구현 → 통과. DB 테스트는 `resetDatabase()` 를 `beforeEach` 로. 외부 네트워크 없음
- Route Handler·페이지는 얇게, 로직은 `src/lib/services`, DB 는 `src/lib/repositories`
- 사건 9종·심각도·임계값은 스펙 §1 그대로: `POSITIVE_PRESS_MIN = 6`, `NEGATIVE_PRESS_MAX = -4`, `HEADCOUNT_RATIO = 0.2`, `VENTURE_EXPIRY_DAYS = 60`, `SILENCE_DAYS = STALE_DAYS(30)`. severity 순서 `alert > notice > positive > info`
- dedupe 키 `(companyId, kind, evidenceKey)`; upsert 는 `status/note/reviewedAt/reviewedBy` 를 **보존**
- 상태 전이 허용: `open→acknowledge`, `open→done`, `acknowledged→done`, `done→reopen`. 그 외 throw
- 상태색은 verified/review/risk/pending 의미에만. 심각도는 아이콘+텍스트가 주, 색은 보조
- 월간 문서 요약은 템플릿 문자열. LLM 없음. 이메일 없음
- `actionItems.ts`·`action-list.tsx` 는 삭제. `recent-articles.tsx`·`verdict-board.tsx` 등은 보존
- 각 태스크 끝에 `npx tsc --noEmit -p tsconfig.json` 클린 (vitest 는 타입 검사를 안 함). 커밋 메시지는 태스크 마지막 스텝 그대로

---

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `prisma/schema.prisma` + migration `event_monitoring` | `Event` 모델 | 1 |
| `src/lib/test-support/db.ts` | reset 에 event 추가 | 1 |
| `src/lib/services/eventRules.ts` | 타입·상수·추출 순수 함수 3개 | 2 |
| `src/lib/services/eventReview.ts` | 상태 전이 | 3 |
| `src/lib/repositories/eventRepository.ts` | upsert / list / review / summarise | 3 |
| `src/lib/services/analysisPipeline.ts` · `scripts/collect-pension.ts` · `scripts/collect-sources.ts` · `src/app/api/companies/[id]/dart/route.ts` | 추출 훅 | 4 |
| `scripts/backfill-events.ts` | 기존 데이터 백필 | 4 |
| `src/lib/services/companyCards.ts` | 카드 집계·정렬·필터 | 5 |
| `src/app/dashboard/actions.ts` | Server Action `reviewEventAction` | 6 |
| `src/components/dashboard/event-table.tsx` · `event-review-buttons.tsx` · `company-chips.tsx` | 01·02·03 | 6 |
| `src/app/dashboard/page.tsx` · `src/lib/services/freshness.ts` | 재조립 | 6 |
| `src/components/company/company-card.tsx` · `company-card-grid.tsx` · `register-dialog.tsx` · `src/app/companies/page.tsx` | 기업 카드 | 7 |
| `src/components/company/event-timeline.tsx` · `src/app/companies/[id]/page.tsx` | 사건 이력 | 8 |
| `src/lib/services/monthlyReport.ts` · `src/app/api/reports/monthly/route.ts` · `scripts/monthly-report.ts` | 월간 문서 | 9 |
| `src/components/layout/app-shell.tsx` | 메뉴 | 10 |

---

### Task 1: `Event` 모델과 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_event_monitoring/` (prisma 가 생성)
- Modify: `src/lib/test-support/db.ts`
- Test: `src/lib/repositories/eventRepository.test.ts` (스키마 존재만 검사; Task 3 에서 확장)

**Interfaces:**
- Produces: Prisma `Event` 모델(스펙 §2 그대로), `Company.events`, `AnalysisRun.events`

- [ ] **Step 1: 실패 테스트**

`src/lib/repositories/eventRepository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

describe("Event schema", () => {
  beforeEach(resetDatabase);

  it("stores one event per company, kind and evidence key", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2025 } });
    const data = {
      companyId: company.id, kind: "award", severity: "positive", occurredAt: new Date("2026-08-26"),
      title: "식약처 허가", evidenceKey: "https://n/1", evidenceJson: "[]",
    };
    await prisma.event.create({ data });

    await expect(prisma.event.create({ data })).rejects.toThrow();
    expect(await prisma.event.count()).toBe(1);
  });

  it("defaults status to open and keeps trust nullable", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2025 } });
    const saved = await prisma.event.create({
      data: { companyId: company.id, kind: "headcount_down", severity: "notice", occurredAt: new Date(), title: "t", evidenceKey: "202607", evidenceJson: "[]" },
    });

    expect(saved.status).toBe("open");
    expect(saved.trust).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/repositories/eventRepository.test.ts` → FAIL (`prisma.event` 없음)

- [ ] **Step 3: 스키마**

`prisma/schema.prisma` — `model Company` 에 `events Event[]`, `model AnalysisRun` 에 `events Event[]` 추가. 파일 끝에:

```prisma
model Event {
  id           Int          @id @default(autoincrement())
  companyId    Int
  company      Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  kind         String
  severity     String
  occurredAt   DateTime
  title        String
  evidenceKey  String
  evidenceJson String
  runId        Int?
  run          AnalysisRun? @relation(fields: [runId], references: [id], onDelete: SetNull)
  trust        String?
  status       String       @default("open")
  note         String?
  reviewedAt   DateTime?
  reviewedBy   Int?
  createdAt    DateTime     @default(now())

  @@unique([companyId, kind, evidenceKey])
  @@index([occurredAt])
  @@index([companyId, status])
}
```

`src/lib/test-support/db.ts` `resetDatabase()` 맨 앞에 `await prisma.event.deleteMany();` 추가.

- [ ] **Step 4: 마이그레이션** — `npx prisma migrate dev --name event_monitoring && npx prisma generate && DATABASE_URL="file:./prisma/test.db" npx prisma migrate deploy`
- [ ] **Step 5: 통과 확인** — 테스트 PASS, `npx tsc --noEmit -p tsconfig.json` 클린, `npm test`
- [ ] **Step 6: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/test-support/db.ts src/lib/repositories/eventRepository.test.ts
git commit -m "feat(events): Event model for company monitoring"
```

---

### Task 2: 사건 추출 규칙 (순수 함수)

**Files:**
- Create: `src/lib/services/eventRules.ts`, `src/lib/services/eventRules.test.ts`

**Interfaces:**
- Consumes: `AnalysisResult`·`NewsAnalysis` (`analyzer.ts`), `VerificationStatus` (`verificationScores.ts`), `PensionPoint` (`pensionSnapshot.ts`), `StoredSnapshot` (`sourceSnapshot.ts`), `CONFLICT_STAGES` (`pipelineMatrix.ts`), `STALE_DAYS` (`newsCoverage.ts`)
- Produces:
  ```ts
  export type EventKind = "award" | "investment" | "positive_press" | "negative_press" | "headcount_up" | "headcount_down" | "closure" | "venture_expiry" | "source_conflict" | "silence";
  export type Severity = "alert" | "notice" | "positive" | "info";
  export type Trust = "verified" | "needs_review" | null;
  export type Evidence = { label: string; link?: string; ym?: [string, string]; source?: string };
  export type NewEvent = { companyId: number; kind: EventKind; severity: Severity; occurredAt: Date; title: string; evidenceKey: string; evidence: Evidence[]; runId: number | null; trust: Trust };
  export const SEVERITY_ORDER: Severity[]; export const KIND_LABEL: Record<EventKind, string>; export const SEVERITY_LABEL: Record<Severity, string>;
  export const POSITIVE_PRESS_MIN = 6; NEGATIVE_PRESS_MAX = -4; HEADCOUNT_RATIO = 0.2; VENTURE_EXPIRY_DAYS = 60; SILENCE_DAYS = STALE_DAYS;
  export function extractAnalysisEvents(input: { companyId; runId; result: AnalysisResult; trust: Trust }): NewEvent[];
  export function extractPensionEvents(input: { companyId; points: PensionPoint[] }): NewEvent[];
  export function extractSourceEvents(input: { companyId; snapshots: StoredSnapshot[]; now: Date }): NewEvent[];
  export function compareSeverity(a: Severity, b: Severity): number;   // 정렬용, alert 가 앞
  ```

- [ ] **Step 1: 실패 테스트**

`src/lib/services/eventRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AnalysisResult, NewsAnalysis } from "@/lib/services/analyzer";
import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";
import {
  compareSeverity, extractAnalysisEvents, extractPensionEvents, extractSourceEvents,
  HEADCOUNT_RATIO, NEGATIVE_PRESS_MAX, POSITIVE_PRESS_MIN,
} from "@/lib/services/eventRules";

const NOW = new Date("2026-08-30T00:00:00.000Z");

function analysis(over: { link: string; about?: boolean; score?: number; award?: string; investment?: string; title?: string }): NewsAnalysis {
  return {
    news: { title: over.title ?? "기사", link: over.link, description: "", content: "본문", published: "2026-08-26T00:00:00.000Z", source: "전자신문", provider: "naver", titleMatch: true, mentions: 2, relevance: "primary" },
    isAboutCompany: over.about ?? true,
    trend: { is_about_company: over.about === false ? "N" : "Y", news_trend_summary: "요약", sentiment_score: over.score ?? 0, sentiment_label: "중립" },
    award: { is_award_related: over.award ? "Y" : "N", award_name: over.award ?? "", award_reason: "" },
    investment: { is_investment_related: over.investment ? "Y" : "N", investment_name: over.investment ?? "", investment_reason: "" },
  };
}

function result(analyses: NewsAnalysis[]): AnalysisResult {
  return { companyName: "딥노이드", model: "m", analyses, comprehensiveOpinion: "", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    stats: { totalNews: analyses.length, scoredNews: analyses.length, excludedNews: 0, averageSentiment: 0, positiveCount: 0, negativeCount: 0, neutralCount: 0, awardCount: 0, investmentCount: 0 } };
}

describe("extractAnalysisEvents", () => {
  it("turns an award into a positive event carrying the article as evidence and the run's trust", () => {
    const events = extractAnalysisEvents({ companyId: 1, runId: 9, result: result([analysis({ link: "https://n/1", award: "CES 혁신상" })]), trust: "verified" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "award", severity: "positive", title: "수상 — CES 혁신상", evidenceKey: "https://n/1", runId: 9, trust: "verified", occurredAt: new Date("2026-08-26T00:00:00.000Z") });
    expect(events[0].evidence[0]).toEqual({ label: "CES 혁신상", link: "https://n/1" });
  });

  it("emits investment, positive and negative press by their thresholds", () => {
    const events = extractAnalysisEvents({ companyId: 1, runId: 9, trust: "needs_review", result: result([
      analysis({ link: "https://n/1", investment: "시리즈B 200억" }),
      analysis({ link: "https://n/2", score: POSITIVE_PRESS_MIN, title: "매출 급증" }),
      analysis({ link: "https://n/3", score: POSITIVE_PRESS_MIN - 1 }),
      analysis({ link: "https://n/4", score: NEGATIVE_PRESS_MAX, title: "자본잠식 우려" }),
      analysis({ link: "https://n/5", score: NEGATIVE_PRESS_MAX + 1 }),
    ]) });

    expect(events.map((e) => [e.kind, e.evidenceKey])).toEqual([
      ["investment", "https://n/1"], ["positive_press", "https://n/2"], ["negative_press", "https://n/4"],
    ]);
    expect(events.find((e) => e.kind === "negative_press")).toMatchObject({ severity: "notice", title: "부정 보도 — 자본잠식 우려", trust: "needs_review" });
  });

  it("ignores articles the model says are not about the company", () => {
    const events = extractAnalysisEvents({ companyId: 1, runId: 9, trust: "verified", result: result([analysis({ link: "https://n/1", about: false, award: "대상", score: 9 })]) });

    expect(events).toEqual([]);
  });

  it("can emit several kinds from one article, each with its own key space", () => {
    const events = extractAnalysisEvents({ companyId: 1, runId: 9, trust: "verified", result: result([analysis({ link: "https://n/1", award: "대상", score: 8 })]) });

    expect(events.map((e) => e.kind).sort()).toEqual(["award", "positive_press"]);
  });
});

describe("extractPensionEvents", () => {
  const point = (ym: string, subscribers: number | null) => ({ ym, subscribers, noticeAmount: null, hired: null, departed: null });

  it("flags a month-over-month drop of 20 percent or more", () => {
    const events = extractPensionEvents({ companyId: 1, points: [point("202606", 63), point("202607", 41)] });

    expect(events).toEqual([expect.objectContaining({ kind: "headcount_down", severity: "notice", title: "인원 63 → 41명 (−35%)", evidenceKey: "202607", trust: null, occurredAt: new Date("2026-07-31T00:00:00.000Z") })]);
    expect(events[0].evidence[0]).toEqual({ label: "63 → 41명", ym: ["202606", "202607"] });
  });

  it("flags a 12-month rise even when the last step is small", () => {
    const points = Array.from({ length: 13 }, (_, i) => point(`2025${String(8 + i).padStart(2, "0")}`.replace(/2025(1[3-9]|2\d)/, (m) => `2026${String(Number(m.slice(4)) - 12).padStart(2, "0")}`), i === 12 ? 130 : 100));
    const events = extractPensionEvents({ companyId: 1, points });

    expect(events.map((e) => e.kind)).toEqual(["headcount_up"]);
  });

  it("stays quiet under the ratio and skips null months", () => {
    expect(extractPensionEvents({ companyId: 1, points: [point("202606", 100), point("202607", Math.round(100 * (1 - HEADCOUNT_RATIO)) + 1)] })).toEqual([]);
    expect(extractPensionEvents({ companyId: 1, points: [point("202606", null), point("202607", 41)] })).toEqual([]);
  });
});

describe("extractSourceEvents", () => {
  const snap = (source: StoredSnapshot["source"], status: StoredSnapshot["status"], summary: string, payload: unknown = {}): StoredSnapshot => ({ source, status, summary, payload, fetchedAt: new Date("2026-08-29T11:20:00.000Z") });

  it("raises an alert when the tax office says the business closed", () => {
    const events = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("nts", "found", "폐업 · 2026-07-01")] });

    expect(events).toEqual([expect.objectContaining({ kind: "closure", severity: "alert", title: "휴·폐업 — 폐업 · 2026-07-01", evidenceKey: "nts:폐업", occurredAt: new Date("2026-08-29T11:20:00.000Z") })]);
  });

  it("notices a venture certificate expiring within 60 days or already expired", () => {
    const soon = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("venture", "found", "벤처투자유형 · 2026-10-01 까지", { validUntil: "2026-10-01" })] });
    const far = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("venture", "found", "벤처투자유형 · 2027-03-01 까지", { validUntil: "2027-03-01" })] });

    expect(soon.map((e) => e.kind)).toEqual(["venture_expiry"]);
    expect(soon[0]).toMatchObject({ severity: "notice", evidenceKey: "venture:2026-10-01", title: "벤처확인 만료 임박 — 2026-10-01 까지" });
    expect(far).toEqual([]);
  });

  it("notices a same-name conflict on source stages only", () => {
    const events = extractSourceEvents({ companyId: 1, now: NOW, snapshots: [snap("dart", "conflict", "이름이 정확히 맞는 기업이 없다 · 후보 1건"), snap("nts", "found", "계속사업자 · 일반과세자")] });

    expect(events).toEqual([expect.objectContaining({ kind: "source_conflict", severity: "notice", evidenceKey: "dart:conflict", title: "동명 타사 충돌 — DART" })]);
  });
});

describe("compareSeverity", () => {
  it("sorts alert before notice before positive before info", () => {
    expect((["info", "positive", "alert", "notice"] as const).slice().sort(compareSeverity)).toEqual(["alert", "notice", "positive", "info"]);
  });
});
```

- [ ] **Step 2: 실패 확인** → 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/services/eventRules.ts`:

```ts
import type { AnalysisResult, NewsAnalysis } from "@/lib/services/analyzer";
import type { PensionPoint } from "@/lib/repositories/pensionSnapshot";
import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";
import { STALE_DAYS } from "@/lib/services/newsCoverage";
import { CONFLICT_STAGES, MATRIX_STAGES } from "@/lib/services/pipelineMatrix";

export type EventKind =
  | "award" | "investment" | "positive_press" | "negative_press"
  | "headcount_up" | "headcount_down" | "closure" | "venture_expiry" | "source_conflict" | "silence";
export type Severity = "alert" | "notice" | "positive" | "info";
export type Trust = "verified" | "needs_review" | null;
export type Evidence = { label: string; link?: string; ym?: [string, string]; source?: string };
export type NewEvent = {
  companyId: number; kind: EventKind; severity: Severity; occurredAt: Date; title: string;
  evidenceKey: string; evidence: Evidence[]; runId: number | null; trust: Trust;
};

export const POSITIVE_PRESS_MIN = 6;
export const NEGATIVE_PRESS_MAX = -4;
export const HEADCOUNT_RATIO = 0.2;
export const VENTURE_EXPIRY_DAYS = 60;
export const SILENCE_DAYS = STALE_DAYS;

export const SEVERITY_ORDER: Severity[] = ["alert", "notice", "positive", "info"];
export const SEVERITY_LABEL: Record<Severity, string> = { alert: "경보", notice: "주의", positive: "긍정", info: "정보" };
export const KIND_LABEL: Record<EventKind, string> = {
  award: "수상", investment: "투자", positive_press: "긍정 보도", negative_press: "부정 보도",
  headcount_up: "인원 증가", headcount_down: "인원 감소", closure: "휴·폐업", venture_expiry: "벤처확인 만료",
  source_conflict: "동명 타사 충돌", silence: "무보도",
};

const DAY_MS = 86_400_000;
const STAGE_SHORT = new Map(MATRIX_STAGES.map((stage) => [stage.key, stage.short]));

export function compareSeverity(a: Severity, b: Severity) {
  return SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b);
}

function articleEvent(companyId: number, runId: number, trust: Trust, analysis: NewsAnalysis, kind: EventKind, severity: Severity, title: string, label: string): NewEvent {
  return {
    companyId, kind, severity, runId, trust, title,
    occurredAt: new Date(analysis.news.published),
    evidenceKey: analysis.news.link,
    evidence: [{ label, link: analysis.news.link }],
  };
}

/**
 * 분석 결과에서 수상·투자·긍정/부정 보도 사건을 뽑는다. 회사가 주제인 기사만 본다.
 * 한 기사가 여러 사건을 낼 수 있다 — 종류마다 키 공간이 다르다.
 */
export function extractAnalysisEvents(input: { companyId: number; runId: number; result: AnalysisResult; trust: Trust }): NewEvent[] {
  const events: NewEvent[] = [];
  for (const analysis of input.result.analyses) {
    if (!analysis.isAboutCompany) continue;
    const make = (kind: EventKind, severity: Severity, title: string, label: string) =>
      events.push(articleEvent(input.companyId, input.runId, input.trust, analysis, kind, severity, title, label));

    if (analysis.award.is_award_related === "Y") make("award", "positive", `수상 — ${analysis.award.award_name}`, analysis.award.award_name);
    if (analysis.investment.is_investment_related === "Y") make("investment", "positive", `투자 — ${analysis.investment.investment_name}`, analysis.investment.investment_name);
    if (analysis.trend.sentiment_score >= POSITIVE_PRESS_MIN) make("positive_press", "positive", `긍정 보도 — ${analysis.news.title}`, analysis.news.title);
    if (analysis.trend.sentiment_score <= NEGATIVE_PRESS_MAX) make("negative_press", "notice", `부정 보도 — ${analysis.news.title}`, analysis.news.title);
  }
  return events;
}

function endOfMonth(ym: string) {
  return new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(4, 6)), 0));
}

function ratioEvent(companyId: number, from: PensionPoint, to: PensionPoint): NewEvent | null {
  if (from.subscribers === null || to.subscribers === null || from.subscribers === 0) return null;
  const ratio = (to.subscribers - from.subscribers) / from.subscribers;
  if (Math.abs(ratio) < HEADCOUNT_RATIO) return null;
  const pct = `${ratio > 0 ? "+" : "−"}${Math.round(Math.abs(ratio) * 100)}%`;
  return {
    companyId, kind: ratio > 0 ? "headcount_up" : "headcount_down", severity: ratio > 0 ? "positive" : "notice",
    occurredAt: endOfMonth(to.ym), title: `인원 ${from.subscribers} → ${to.subscribers}명 (${pct})`,
    evidenceKey: to.ym, evidence: [{ label: `${from.subscribers} → ${to.subscribers}명`, ym: [from.ym, to.ym] }],
    runId: null, trust: null,
  };
}

/**
 * 최신 달을 직전 달·12개월 전과 비교해 ±20% 이상이면 인원 사건을 낸다. 둘 다 걸려도 하나만 낸다.
 */
export function extractPensionEvents(input: { companyId: number; points: PensionPoint[] }): NewEvent[] {
  const points = [...input.points].sort((a, b) => a.ym.localeCompare(b.ym));
  const latest = points.at(-1);
  if (!latest) return [];
  const previous = points.at(-2);
  const yearAgo = points.find((p) => p.ym === `${Number(latest.ym.slice(0, 4)) - 1}${latest.ym.slice(4)}`);
  const hit = (previous && ratioEvent(input.companyId, previous, latest)) || (yearAgo && ratioEvent(input.companyId, yearAgo, latest)) || null;
  return hit ? [hit] : [];
}

/**
 * 원천 스냅샷에서 휴·폐업, 벤처확인 만료, 동명 타사 충돌을 뽑는다.
 */
export function extractSourceEvents(input: { companyId: number; snapshots: StoredSnapshot[]; now: Date }): NewEvent[] {
  const events: NewEvent[] = [];
  for (const snap of input.snapshots) {
    const base = { companyId: input.companyId, occurredAt: snap.fetchedAt, runId: null, trust: null } as const;

    if (snap.source === "nts" && /^(폐업|휴업)/.test(snap.summary)) {
      const state = snap.summary.split(" · ")[0];
      events.push({ ...base, kind: "closure", severity: "alert", title: `휴·폐업 — ${snap.summary}`, evidenceKey: `nts:${state}`, evidence: [{ label: snap.summary, source: "nts" }] });
    }

    if (snap.source === "venture" && snap.status === "found") {
      const validUntil = (snap.payload as { validUntil?: string } | null)?.validUntil;
      if (validUntil) {
        const daysLeft = (Date.parse(validUntil) - input.now.getTime()) / DAY_MS;
        if (daysLeft <= VENTURE_EXPIRY_DAYS) {
          const title = daysLeft < 0 ? `벤처확인 만료 — ${validUntil}` : `벤처확인 만료 임박 — ${validUntil} 까지`;
          events.push({ ...base, kind: "venture_expiry", severity: "notice", title, evidenceKey: `venture:${validUntil}`, evidence: [{ label: `유효기간 ${validUntil} 까지`, source: "venture" }] });
        }
      }
    }

    if (snap.status === "conflict" && (CONFLICT_STAGES as readonly string[]).includes(snap.source)) {
      events.push({ ...base, kind: "source_conflict", severity: "notice", title: `동명 타사 충돌 — ${STAGE_SHORT.get(snap.source) ?? snap.source}`, evidenceKey: `${snap.source}:conflict`, evidence: [{ label: snap.summary, source: snap.source }] });
    }
  }
  return events;
}
```

- [ ] **Step 4: 통과 확인** — 테스트 PASS, tsc 클린. (Step 1 의 12개월 픽스처 생성식이 어색하면 `ym` 배열을 문자열 리터럴 13개로 풀어 써도 된다 — 의도는 `202508`~`202608`, 마지막만 130.)
- [ ] **Step 5: 커밋** — `git add src/lib/services/eventRules.ts src/lib/services/eventRules.test.ts && git commit -m "feat(events): rule-based event extraction from analysis, pension and sources"`

---

### Task 3: 상태 전이 + 리포지토리

**Files:**
- Create: `src/lib/services/eventReview.ts`, `src/lib/services/eventReview.test.ts`
- Create: `src/lib/repositories/eventRepository.ts`; Modify: `src/lib/repositories/eventRepository.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // eventReview.ts
  export type EventStatus = "open" | "acknowledged" | "done";
  export type ReviewAction = "acknowledge" | "done" | "reopen";
  export class InvalidTransitionError extends Error {}
  export function transition(status: EventStatus, action: ReviewAction): EventStatus;
  export const STATUS_LABEL: Record<EventStatus, string>;   // 미확인 · 확인 · 조치완료
  // eventRepository.ts
  export type EventRow = { id: number; companyId: number; companyName: string; kind: EventKind; severity: Severity; occurredAt: string; title: string; evidence: Evidence[]; runId: number | null; trust: Trust; status: EventStatus; note: string | null; reviewedAt: string | null };
  export async function upsertEvents(events: NewEvent[]): Promise<{ created: number; updated: number }>;
  export async function listEvents(input: { year: number; since?: Date; until?: Date; kinds?: EventKind[]; status?: EventStatus[]; companyId?: number }): Promise<EventRow[]>;   // severity → occurredAt desc
  export async function reviewEvent(id: number, action: ReviewAction, note: string | null, userId: number): Promise<EventRow>;
  export async function summariseEvents(year: number, since: Date): Promise<{ total: number; companiesWithEvents: number; bySeverity: Record<Severity, number>; open: number }>;
  ```

- [ ] **Step 1: 전이 테스트** — `src/lib/services/eventReview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InvalidTransitionError, transition } from "@/lib/services/eventReview";

describe("transition", () => {
  it.each([
    ["open", "acknowledge", "acknowledged"],
    ["open", "done", "done"],
    ["acknowledged", "done", "done"],
    ["done", "reopen", "open"],
  ] as const)("%s + %s → %s", (from, action, to) => {
    expect(transition(from, action)).toBe(to);
  });

  it.each([["acknowledged", "acknowledge"], ["done", "done"], ["open", "reopen"]] as const)("rejects %s + %s", (from, action) => {
    expect(() => transition(from, action)).toThrow(InvalidTransitionError);
  });
});
```

- [ ] **Step 2: 리포지토리 테스트** — `eventRepository.test.ts` 에 추가 (기존 import 유지 + `upsertEvents, listEvents, reviewEvent, summariseEvents` import, `NewEvent` 타입 import):

```ts
function fresh(over: Partial<NewEvent> & { companyId: number }): NewEvent {
  return { kind: "award", severity: "positive", occurredAt: new Date("2026-08-26T00:00:00.000Z"), title: "수상 — 대상", evidenceKey: "https://n/1", evidence: [{ label: "대상", link: "https://n/1" }], runId: null, trust: "verified", ...over };
}

describe("event repository", () => {
  beforeEach(resetDatabase);

  it("upserts by company, kind and evidence key and keeps the reviewer's record", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2025 } });
    const user = await prisma.user.create({ data: { email: "r@example.com", passwordHash: "x" } });
    const first = await upsertEvents([fresh({ companyId: company.id })]);
    const [row] = await listEvents({ year: 2025 });
    await reviewEvent(row.id, "done", "확인함", user.id);

    const second = await upsertEvents([fresh({ companyId: company.id, title: "수상 — 대상(갱신)", trust: "needs_review" })]);
    const [after] = await listEvents({ year: 2025 });

    expect(first).toEqual({ created: 1, updated: 0 });
    expect(second).toEqual({ created: 0, updated: 1 });
    expect(after).toMatchObject({ title: "수상 — 대상(갱신)", trust: "needs_review", status: "done", note: "확인함" });
  });

  it("lists by window, kind and status, worst severity first then newest", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const b = await prisma.company.create({ data: { name: "나", year: 2025 } });
    await upsertEvents([
      fresh({ companyId: a.id, kind: "positive_press", severity: "positive", evidenceKey: "p1", occurredAt: new Date("2026-08-20") }),
      fresh({ companyId: b.id, kind: "closure", severity: "alert", evidenceKey: "nts:폐업", occurredAt: new Date("2026-08-01") }),
      fresh({ companyId: a.id, kind: "negative_press", severity: "notice", evidenceKey: "n1", occurredAt: new Date("2026-08-28") }),
      fresh({ companyId: a.id, kind: "award", evidenceKey: "old", occurredAt: new Date("2026-06-01") }),
    ]);

    const rows = await listEvents({ year: 2025, since: new Date("2026-07-31") });
    expect(rows.map((r) => r.kind)).toEqual(["closure", "negative_press", "positive_press"]);
    expect(rows[0].companyName).toBe("나");

    expect((await listEvents({ year: 2025, kinds: ["award"] })).map((r) => r.evidenceKey ?? r.kind)).toHaveLength(1);
    expect(await listEvents({ year: 2025, status: ["done"] })).toEqual([]);
  });

  it("summarises the window for the header sentence", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const b = await prisma.company.create({ data: { name: "나", year: 2025 } });
    await prisma.company.create({ data: { name: "다", year: 2025 } });
    await upsertEvents([
      fresh({ companyId: a.id, evidenceKey: "1" }),
      fresh({ companyId: a.id, kind: "negative_press", severity: "notice", evidenceKey: "2" }),
      fresh({ companyId: b.id, kind: "closure", severity: "alert", evidenceKey: "3" }),
    ]);

    expect(await summariseEvents(2025, new Date("2026-08-01"))).toEqual({ total: 3, companiesWithEvents: 2, bySeverity: { alert: 1, notice: 1, positive: 1, info: 0 }, open: 3 });
  });

  it("refuses an invalid transition without touching the row", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const user = await prisma.user.create({ data: { email: "r@example.com", passwordHash: "x" } });
    await upsertEvents([fresh({ companyId: a.id })]);
    const [row] = await listEvents({ year: 2025 });

    await expect(reviewEvent(row.id, "reopen", null, user.id)).rejects.toThrow();
    expect((await listEvents({ year: 2025 }))[0].status).toBe("open");
  });
});
```

`listEvents` 결과 `EventRow` 에는 `evidenceKey` 가 없다 — 위 두 번째 테스트의 `r.evidenceKey ?? r.kind` 는 `r.kind` 로 단순화한다.

- [ ] **Step 3: 실패 확인** — 두 파일 FAIL

- [ ] **Step 4: 구현**

`src/lib/services/eventReview.ts`:

```ts
export type EventStatus = "open" | "acknowledged" | "done";
export type ReviewAction = "acknowledge" | "done" | "reopen";

export class InvalidTransitionError extends Error {}

export const STATUS_LABEL: Record<EventStatus, string> = { open: "미확인", acknowledged: "확인", done: "조치완료" };

const ALLOWED: Record<`${EventStatus}:${ReviewAction}`, EventStatus | undefined> = {
  "open:acknowledge": "acknowledged", "open:done": "done", "open:reopen": undefined,
  "acknowledged:acknowledge": undefined, "acknowledged:done": "done", "acknowledged:reopen": undefined,
  "done:acknowledge": undefined, "done:done": undefined, "done:reopen": "open",
};

/**
 * 후속 조치 상태를 앞으로만 옮긴다. 되돌리기는 조치완료 → 미확인 하나뿐이다.
 */
export function transition(status: EventStatus, action: ReviewAction): EventStatus {
  const next = ALLOWED[`${status}:${action}`];
  if (!next) throw new InvalidTransitionError(`${status} 상태에서 ${action} 할 수 없습니다.`);
  return next;
}
```

`src/lib/repositories/eventRepository.ts`:

```ts
import { prisma } from "@/lib/db";
import { compareSeverity, type Evidence, type EventKind, type NewEvent, type Severity, type Trust } from "@/lib/services/eventRules";
import { transition, type EventStatus, type ReviewAction } from "@/lib/services/eventReview";

export type EventRow = {
  id: number; companyId: number; companyName: string; kind: EventKind; severity: Severity; occurredAt: string;
  title: string; evidence: Evidence[]; runId: number | null; trust: Trust; status: EventStatus; note: string | null; reviewedAt: string | null;
};

type Stored = { id: number; companyId: number; kind: string; severity: string; occurredAt: Date; title: string; evidenceJson: string; runId: number | null; trust: string | null; status: string; note: string | null; reviewedAt: Date | null; company: { name: string } };

function toRow(row: Stored): EventRow {
  return {
    id: row.id, companyId: row.companyId, companyName: row.company.name, kind: row.kind as EventKind, severity: row.severity as Severity,
    occurredAt: row.occurredAt.toISOString(), title: row.title, evidence: JSON.parse(row.evidenceJson) as Evidence[], runId: row.runId,
    trust: (row.trust as Trust) ?? null, status: row.status as EventStatus, note: row.note, reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

/**
 * 사건을 (기업, 종류, 근거 키) 로 upsert 한다. 담당자의 상태·메모는 재추출이 덮어쓰지 않는다.
 */
export async function upsertEvents(events: NewEvent[]) {
  let created = 0;
  let updated = 0;
  for (const event of events) {
    const where = { companyId_kind_evidenceKey: { companyId: event.companyId, kind: event.kind, evidenceKey: event.evidenceKey } };
    const fields = { severity: event.severity, occurredAt: event.occurredAt, title: event.title, evidenceJson: JSON.stringify(event.evidence), runId: event.runId, trust: event.trust };
    const existing = await prisma.event.findUnique({ where, select: { id: true } });
    if (existing) {
      await prisma.event.update({ where, data: fields });
      updated += 1;
    } else {
      await prisma.event.create({ data: { companyId: event.companyId, kind: event.kind, evidenceKey: event.evidenceKey, ...fields } });
      created += 1;
    }
  }
  return { created, updated };
}

/**
 * 연도의 사건을 심각도 → 최신순으로 낸다. since/until 은 occurredAt 기준이다.
 */
export async function listEvents(input: { year: number; since?: Date; until?: Date; kinds?: EventKind[]; status?: EventStatus[]; companyId?: number }): Promise<EventRow[]> {
  const rows = await prisma.event.findMany({
    where: {
      company: { year: input.year, isActive: true },
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.kinds ? { kind: { in: input.kinds } } : {}),
      ...(input.status ? { status: { in: input.status } } : {}),
      ...(input.since || input.until ? { occurredAt: { ...(input.since ? { gte: input.since } : {}), ...(input.until ? { lte: input.until } : {}) } } : {}),
    },
    include: { company: { select: { name: true } } },
  });
  return rows.map(toRow).sort((a, b) => compareSeverity(a.severity, b.severity) || b.occurredAt.localeCompare(a.occurredAt));
}

/**
 * 담당자 조치를 기록한다. 불허 전이는 저장 전에 던진다.
 */
export async function reviewEvent(id: number, action: ReviewAction, note: string | null, userId: number): Promise<EventRow> {
  const current = await prisma.event.findUniqueOrThrow({ where: { id }, select: { status: true } });
  const status = transition(current.status as EventStatus, action);
  const row = await prisma.event.update({
    where: { id },
    data: { status, note: note ?? undefined, reviewedAt: new Date(), reviewedBy: userId },
    include: { company: { select: { name: true } } },
  });
  return toRow(row);
}

/**
 * 헤더 요약문에 쓸 집계.
 */
export async function summariseEvents(year: number, since: Date) {
  const rows = await listEvents({ year, since });
  const bySeverity: Record<Severity, number> = { alert: 0, notice: 0, positive: 0, info: 0 };
  for (const row of rows) bySeverity[row.severity] += 1;
  return { total: rows.length, companiesWithEvents: new Set(rows.map((r) => r.companyId)).size, bySeverity, open: rows.filter((r) => r.status === "open").length };
}
```

- [ ] **Step 5: 통과 확인** — 두 테스트 파일 PASS, tsc 클린, `npm test`
- [ ] **Step 6: 커밋** — `git add src/lib/services/eventReview.ts src/lib/services/eventReview.test.ts src/lib/repositories/eventRepository.ts src/lib/repositories/eventRepository.test.ts && git commit -m "feat(events): review transitions and event repository"`

---

### Task 4: 파이프라인 훅 + 백필

**Files:**
- Modify: `src/lib/services/analysisPipeline.ts`, `src/lib/services/analysisPipeline.test.ts`
- Modify: `scripts/collect-pension.ts`, `scripts/collect-sources.ts`, `src/app/api/companies/[id]/dart/route.ts`
- Create: `scripts/backfill-events.ts`, `src/lib/services/eventBackfill.ts`, `src/lib/services/eventBackfill.test.ts`

**Interfaces:**
- Consumes: Task 2 추출 함수, Task 3 `upsertEvents`, `listPensionSeries`, `listSourceSnapshots`, `listLatestVerifications`
- Produces: `backfillEvents(year: number, now?: Date): Promise<{ analysis: number; pension: number; source: number }>` (`eventBackfill.ts`)

- [ ] **Step 1: 파이프라인 테스트** — `analysisPipeline.test.ts` 에 추가:

```ts
import { listEvents } from "@/lib/repositories/eventRepository";

describe("runCompanyAnalysis — events", () => {
  beforeEach(resetDatabase);

  it("records award and press events with the verification trust after a verified run", async () => {
    const { company, user } = await seed();
    const awarded = { ...result(), analyses: [
      { news: NEWS[0], isAboutCompany: true, trend: { is_about_company: "Y", news_trend_summary: "요약", sentiment_score: 7, sentiment_label: "긍정적" }, award: { is_award_related: "Y", award_name: "대상", award_reason: "" }, investment: { is_investment_related: "N", investment_name: "", investment_reason: "" } },
    ] };

    await runCompanyAnalysis({ company, userId: user.id, news: NEWS }, deps({ analyze: () => completes(awarded) }));

    const events = await listEvents({ year: 2025, companyId: company.id });
    expect(events.map((e) => [e.kind, e.trust]).sort()).toEqual([["award", "verified"], ["positive_press", "verified"]]);
  });

  it("records nothing when verification failed", async () => {
    const { company, user } = await seed();
    await runCompanyAnalysis({ company, userId: user.id, news: NEWS }, deps({ verify: async () => { throw new Error("judge down"); } }));

    expect(await listEvents({ year: 2025, companyId: company.id })).toEqual([]);
  });
});
```

`seed()` 가 만드는 회사의 `year` 가 2025 인지 확인하고 아니면 맞춘다.

- [ ] **Step 2: 백필 테스트** — `src/lib/services/eventBackfill.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listEvents } from "@/lib/repositories/eventRepository";
import { savePensionSeries } from "@/lib/repositories/pensionSnapshot";
import { saveSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { backfillEvents } from "@/lib/services/eventBackfill";

describe("backfillEvents", () => {
  beforeEach(resetDatabase);

  it("extracts pension and source events for every active company and is idempotent", async () => {
    const company = await prisma.company.create({ data: { name: "알체라", year: 2025 } });
    await savePensionSeries(company.id, { months: [{ ym: "202606", subscribers: 63, noticeAmount: null, hired: null, departed: null }, { ym: "202607", subscribers: 41, noticeAmount: null, hired: null, departed: null }] });
    await saveSourceSnapshots(company.id, [{ source: "nts", status: "found", summary: "폐업 · 2026-07-01", payload: {} }]);

    const first = await backfillEvents(2025, new Date("2026-08-30"));
    const second = await backfillEvents(2025, new Date("2026-08-30"));

    expect(first).toEqual({ analysis: 0, pension: 1, source: 1 });
    expect(second).toEqual({ analysis: 0, pension: 0, source: 0 });
    expect((await listEvents({ year: 2025 })).map((e) => e.kind).sort()).toEqual(["closure", "headcount_down"]);
  });
});
```

- [ ] **Step 3: 실패 확인**

- [ ] **Step 4: 구현**

`analysisPipeline.ts` — import `extractAnalysisEvents` 와 `upsertEvents`; `verified` 분기에서 `saveVerification` 직후:

```ts
        await upsertEvents(extractAnalysisEvents({ companyId: input.company.id, runId: run.id, result: event.result, trust: verification.status }));
```

`src/lib/services/eventBackfill.ts`:

```ts
import { prisma } from "@/lib/db";
import { upsertEvents } from "@/lib/repositories/eventRepository";
import { listPensionSeries } from "@/lib/repositories/pensionSnapshot";
import { listSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import type { AnalysisResult } from "@/lib/services/analyzer";
import { extractAnalysisEvents, extractPensionEvents, extractSourceEvents } from "@/lib/services/eventRules";

/**
 * 기존 데이터에서 사건을 한 번 추출한다. 기업당 최신 검증 실행·전체 연금 시계열·현재 원천 스냅샷이 입력이다. 멱등이다.
 */
export async function backfillEvents(year: number, now = new Date()) {
  const counts = { analysis: 0, pension: 0, source: 0 };

  const runs = await prisma.analysisRun.findMany({
    where: { status: "completed", company: { year, isActive: true }, verification: { isNot: null } },
    orderBy: { createdAt: "desc" }, include: { verification: true },
  });
  const seen = new Set<number>();
  for (const run of runs) {
    if (seen.has(run.companyId) || !run.verification || !run.resultJson) continue;
    seen.add(run.companyId);
    const result = JSON.parse(run.resultJson) as AnalysisResult;
    const trust = run.verification.status === "verified" ? "verified" : "needs_review";
    counts.analysis += (await upsertEvents(extractAnalysisEvents({ companyId: run.companyId, runId: run.id, result, trust }))).created;
  }

  for (const series of await listPensionSeries(year)) {
    counts.pension += (await upsertEvents(extractPensionEvents({ companyId: series.companyId, points: series.points }))).created;
  }

  const companies = await prisma.company.findMany({ where: { year, isActive: true }, select: { id: true } });
  for (const company of companies) {
    const snapshots = await listSourceSnapshots(company.id);
    counts.source += (await upsertEvents(extractSourceEvents({ companyId: company.id, snapshots, now }))).created;
  }
  return counts;
}
```

`listPensionSeries` 의 반환 필드명이 `points` 인지 확인(`dashboardSummary.ts` 의 `CompanySeries` 와 같다).

`scripts/backfill-events.ts`:

```ts
import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { backfillEvents } from "@/lib/services/eventBackfill";

config({ quiet: true });

/**
 * 기존 분석·연금·원천 데이터에서 사건을 추출한다. 사용: npx tsx scripts/backfill-events.ts [연도]
 */
async function main() {
  const year = Number(process.argv[2]) || new Date().getFullYear();
  const counts = await backfillEvents(year);
  console.log(`${year}년 사건 백필 — 분석 ${counts.analysis} · 연금 ${counts.pension} · 원천 ${counts.source} 건 신규`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
```

`scripts/collect-pension.ts` — 루프 뒤, 요약 출력 전에:
```ts
  const { created } = await upsertEvents((await listPensionSeries(year)).flatMap((series) => extractPensionEvents({ companyId: series.companyId, points: series.points })));
  console.log(`인원 사건 ${created}건 신규`);
```
`scripts/collect-sources.ts` — 기업 루프 안, 스냅샷 저장 직후: `await upsertEvents(extractSourceEvents({ companyId: company.id, snapshots: await listSourceSnapshots(company.id), now: new Date() }));`
`src/app/api/companies/[id]/dart/route.ts` — `saveSourceSnapshots` 직후 같은 한 줄.

- [ ] **Step 5: 통과 확인** — 세 테스트 파일 PASS, tsc, `npm test`. 그리고 실데이터 백필: `npx tsx scripts/backfill-events.ts 2025` 실행 결과를 커밋 메시지 본문이 아니라 보고에 남긴다
- [ ] **Step 6: 커밋** — `git add src/lib/services/analysisPipeline.ts src/lib/services/analysisPipeline.test.ts src/lib/services/eventBackfill.ts src/lib/services/eventBackfill.test.ts scripts/backfill-events.ts scripts/collect-pension.ts scripts/collect-sources.ts "src/app/api/companies/[id]/dart/route.ts" && git commit -m "feat(events): extract events after analysis, pension and source collection; backfill script"`

---

### Task 5: 기업 카드 집계 서비스

**Files:**
- Create: `src/lib/services/companyCards.ts`, `src/lib/services/companyCards.test.ts`

**Interfaces:**
- Consumes: `EventRow` (Task 3), `CompanySeries`/`PensionPoint`, `CompanyNews` (`newsCoverage.ts`), `Trust`
- Produces:
  ```ts
  export type CompanyCardData = { id: number; name: string; industry: string | null; businessNo: string | null; headcount: { latest: number | null; delta12m: number | null }; latestArticle: string | null; events30d: Record<Severity, number>; open: number; worstSeverity: Severity | null; trust: Trust };
  export type CardSort = "triage" | "name" | "news";
  export type CardFilter = { noticeOnly?: boolean; positiveOnly?: boolean; missingBusinessNo?: boolean };
  export function buildCompanyCards(input: { companies: Array<{ id; name; industry: string | null; businessNo: string | null }>; events: EventRow[]; series: CompanySeries[]; news: CompanyNews[]; verdicts: Array<{ companyId; verdict: Trust }> }): CompanyCardData[];
  export function sortCards(cards: CompanyCardData[], sort: CardSort): CompanyCardData[];
  export function filterCards(cards: CompanyCardData[], filter: CardFilter): CompanyCardData[];
  ```

- [ ] **Step 1: 실패 테스트** — `companyCards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { buildCompanyCards, filterCards, sortCards } from "@/lib/services/companyCards";

const COMPANIES = [
  { id: 1, name: "딥노이드", industry: "의료AI", businessNo: "1" },
  { id: 2, name: "알체라", industry: null, businessNo: null },
  { id: 3, name: "가", industry: null, businessNo: "3" },
];
function ev(companyId: number, severity: EventRow["severity"], status: EventRow["status"] = "open"): EventRow {
  return { id: Math.random(), companyId, companyName: "", kind: "award", severity, occurredAt: "2026-08-20T00:00:00.000Z", title: "", evidence: [], runId: null, trust: null, status, note: null, reviewedAt: null };
}
const point = (ym: string, subscribers: number) => ({ ym, subscribers, noticeAmount: null, hired: null, departed: null });

describe("buildCompanyCards", () => {
  it("aggregates events, headcount, latest article and trust per company", () => {
    const cards = buildCompanyCards({
      companies: COMPANIES,
      events: [ev(1, "positive"), ev(1, "positive", "done"), ev(2, "notice"), ev(2, "alert")],
      series: [{ companyId: 1, name: "딥노이드", points: [point("202507", 80), point("202607", 89)] }],
      news: [{ companyId: 1, name: "딥노이드", articles: 3, latest: "2026-08-26T00:00:00.000Z" }],
      verdicts: [{ companyId: 1, verdict: "verified" }],
    });
    const deep = cards.find((c) => c.id === 1)!;
    const al = cards.find((c) => c.id === 2)!;

    expect(deep).toMatchObject({ headcount: { latest: 89, delta12m: 0.11 }, latestArticle: "2026-08-26T00:00:00.000Z", events30d: { alert: 0, notice: 0, positive: 2, info: 0 }, open: 1, worstSeverity: "positive", trust: "verified" });
    expect(al).toMatchObject({ headcount: { latest: null, delta12m: null }, worstSeverity: "alert", open: 2, trust: null });
    expect(cards.find((c) => c.id === 3)!.worstSeverity).toBeNull();
  });
});

describe("sortCards / filterCards", () => {
  const cards = buildCompanyCards({ companies: COMPANIES, events: [ev(2, "alert"), ev(1, "positive"), ev(1, "positive")], series: [], news: [{ companyId: 3, name: "가", articles: 1, latest: "2026-08-29T00:00:00.000Z" }], verdicts: [] });

  it("triage puts alert first, then more open events, then name", () => {
    expect(sortCards(cards, "triage").map((c) => c.name)).toEqual(["알체라", "딥노이드", "가"]);
  });

  it("news sorts by latest article, none last", () => {
    expect(sortCards(cards, "news").map((c) => c.name)[0]).toBe("가");
  });

  it("filters notice-only, positive-only and missing business number", () => {
    expect(filterCards(cards, { noticeOnly: true }).map((c) => c.name)).toEqual(["알체라"]);
    expect(filterCards(cards, { positiveOnly: true }).map((c) => c.name)).toEqual(["딥노이드"]);
    expect(filterCards(cards, { missingBusinessNo: true }).map((c) => c.name)).toEqual(["알체라"]);
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — `companyCards.ts`:

```ts
import type { EventRow } from "@/lib/repositories/eventRepository";
import type { CompanySeries } from "@/lib/services/dashboardSummary";
import { compareSeverity, type Severity, type Trust } from "@/lib/services/eventRules";
import type { CompanyNews } from "@/lib/services/newsCoverage";

export type CompanyCardData = {
  id: number; name: string; industry: string | null; businessNo: string | null;
  headcount: { latest: number | null; delta12m: number | null }; latestArticle: string | null;
  events30d: Record<Severity, number>; open: number; worstSeverity: Severity | null; trust: Trust;
};
export type CardSort = "triage" | "name" | "news";
export type CardFilter = { noticeOnly?: boolean; positiveOnly?: boolean; missingBusinessNo?: boolean };

function headcount(series: CompanySeries | undefined) {
  const measured = (series?.points ?? []).filter((p) => p.subscribers !== null);
  const latest = measured.at(-1);
  if (!latest) return { latest: null, delta12m: null };
  const yearAgo = measured.find((p) => p.ym === `${Number(latest.ym.slice(0, 4)) - 1}${latest.ym.slice(4)}`);
  const delta12m = yearAgo && yearAgo.subscribers ? Math.round(((latest.subscribers! - yearAgo.subscribers) / yearAgo.subscribers) * 100) / 100 : null;
  return { latest: latest.subscribers, delta12m };
}

/**
 * 기업 카드 한 장에 필요한 것을 모은다 — 최근 사건, 인원, 최근 보도, 최신 판정.
 */
export function buildCompanyCards(input: {
  companies: Array<{ id: number; name: string; industry: string | null; businessNo: string | null }>;
  events: EventRow[]; series: CompanySeries[]; news: CompanyNews[]; verdicts: Array<{ companyId: number; verdict: Trust }>;
}): CompanyCardData[] {
  const seriesById = new Map(input.series.map((s) => [s.companyId, s]));
  const newsById = new Map(input.news.map((n) => [n.companyId, n]));
  const trustById = new Map(input.verdicts.map((v) => [v.companyId, v.verdict]));

  return input.companies.map((company) => {
    const events = input.events.filter((e) => e.companyId === company.id);
    const events30d: Record<Severity, number> = { alert: 0, notice: 0, positive: 0, info: 0 };
    for (const e of events) events30d[e.severity] += 1;
    const worst = events.map((e) => e.severity).sort(compareSeverity)[0] ?? null;
    return {
      id: company.id, name: company.name, industry: company.industry, businessNo: company.businessNo,
      headcount: headcount(seriesById.get(company.id)), latestArticle: newsById.get(company.id)?.latest ?? null,
      events30d, open: events.filter((e) => e.status === "open").length, worstSeverity: worst, trust: trustById.get(company.id) ?? null,
    };
  });
}

/**
 * 봐야 할 순서(경보 → 미확인 많은 순 → 이름)·이름·최근 보도.
 */
export function sortCards(cards: CompanyCardData[], sort: CardSort): CompanyCardData[] {
  const rank = (s: Severity | null) => (s ? ["alert", "notice", "positive", "info"].indexOf(s) : 9);
  return [...cards].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ko");
    if (sort === "news") return (b.latestArticle ?? "").localeCompare(a.latestArticle ?? "") || a.name.localeCompare(b.name, "ko");
    return rank(a.worstSeverity) - rank(b.worstSeverity) || b.open - a.open || a.name.localeCompare(b.name, "ko");
  });
}

export function filterCards(cards: CompanyCardData[], filter: CardFilter): CompanyCardData[] {
  return cards.filter((c) =>
    (!filter.noticeOnly || c.events30d.alert + c.events30d.notice > 0) &&
    (!filter.positiveOnly || c.events30d.positive > 0) &&
    (!filter.missingBusinessNo || !c.businessNo),
  );
}
```

- [ ] **Step 4: 통과 확인**, tsc, `npm test`
- [ ] **Step 5: 커밋** — `git add src/lib/services/companyCards.ts src/lib/services/companyCards.test.ts && git commit -m "feat(events): company card aggregation, sort and filters"`

---

### Task 6: 대시보드 재조립 — 이달의 사건

**Files:**
- Create: `src/app/dashboard/actions.ts`, `src/components/dashboard/event-table.tsx` (+test), `src/components/dashboard/event-review-buttons.tsx`, `src/components/dashboard/company-chips.tsx` (+test)
- Modify: `src/app/dashboard/page.tsx`, `src/lib/services/freshness.ts` (+test)
- Delete: `src/lib/services/actionItems.ts` + test, `src/components/dashboard/action-list.tsx` + test

**Interfaces:**
- Produces: `reviewEventAction(formData: FormData)` Server Action (fields `id`, `action`, `note?`, `path`); `EventTable({ events: EventRow[]; silence: Array<{ companyId; companyName; latest: string | null }>; pageSize? })` client component with 기간/종류/미확인 controls; `CompanyChips({ items: Array<{ id; name; count }>; empty: string })`

- [ ] **Step 1: 실패 테스트**

`freshness.test.ts`: `"조치 4"` → `"미확인 사건 4"` 로 기대값 교체 (`todo` → `openEvents` 필드명도 함께).

`src/components/dashboard/event-table.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { EventTable } from "@/components/dashboard/event-table";
import type { EventRow } from "@/lib/repositories/eventRepository";

vi.mock("@/app/dashboard/actions", () => ({ reviewEventAction: vi.fn() }));

function row(over: Partial<EventRow>): EventRow {
  return { id: 1, companyId: 1, companyName: "딥노이드", kind: "award", severity: "positive", occurredAt: "2026-08-26T00:00:00.000Z", title: "수상 — 대상", evidence: [{ label: "대상", link: "https://n/1" }], runId: 3, trust: "verified", status: "open", note: null, reviewedAt: null, ...over };
}

describe("EventTable", () => {
  test("lists events with severity, kind, trust and status in words", () => {
    render(<EventTable events={[row({}), row({ id: 2, kind: "negative_press", severity: "notice", trust: "needs_review", title: "부정 보도 — 자본잠식", companyName: "한국첨단소재" })]} silence={[]} />);
    const rows = screen.getAllByRole("row").slice(1);

    expect(rows[0]).toHaveTextContent("주의");
    expect(rows[0]).toHaveTextContent("확인 필요");
    expect(rows[1]).toHaveTextContent("근거 확인");
    expect(rows[1]).toHaveTextContent("미확인");
  });

  test("offers acknowledge and done for open events and nothing for done ones", () => {
    render(<EventTable events={[row({}), row({ id: 2, status: "done" })]} silence={[]} />);
    const rows = screen.getAllByRole("row").slice(1);

    expect(within(rows[0]).getByRole("button", { name: "확인" })).toBeInTheDocument();
    expect(within(rows[0]).getByRole("button", { name: "조치완료" })).toBeInTheDocument();
    expect(within(rows[1]).queryByRole("button")).not.toBeInTheDocument();
  });

  test("filters to open only and by kind", () => {
    render(<EventTable events={[row({}), row({ id: 2, status: "done", kind: "investment" })]} silence={[]} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "미확인만" }));
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(1);
  });

  test("mixes silence in as info rows", () => {
    render(<EventTable events={[]} silence={[{ companyId: 9, companyName: "조용한회사", latest: "2026-06-01T00:00:00.000Z" }]} />);

    expect(screen.getByRole("row", { name: /조용한회사/ })).toHaveTextContent("무보도");
  });

  test("says the last event date when the window is empty", () => {
    render(<EventTable events={[]} silence={[]} lastEventAt="2026-07-14T00:00:00.000Z" />);

    expect(screen.getByText(/지난 30일 사건 없음 · 마지막 사건 07-14/)).toBeInTheDocument();
  });
});
```

`src/components/dashboard/company-chips.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CompanyChips } from "@/components/dashboard/company-chips";

describe("CompanyChips", () => {
  test("links each company with its event count", () => {
    render(<CompanyChips items={[{ id: 1, name: "알체라", count: 2 }]} empty="없음" />);

    expect(screen.getByRole("link", { name: /알체라/ })).toHaveAttribute("href", "/companies/1");
    expect(screen.getByRole("link", { name: /알체라/ })).toHaveTextContent("2");
  });

  test("says empty in words", () => {
    render(<CompanyChips items={[]} empty="주의 기업 없음" />);
    expect(screen.getByText("주의 기업 없음")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: 구현**

`src/app/dashboard/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { reviewEvent } from "@/lib/repositories/eventRepository";
import type { ReviewAction } from "@/lib/services/eventReview";

/**
 * 사건 행의 [확인]/[조치완료]/[되돌리기] — 세션 사용자를 기록하고 호출 화면을 다시 그린다.
 */
export async function reviewEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const id = Number(formData.get("id"));
  const action = String(formData.get("action")) as ReviewAction;
  const note = formData.get("note");
  await reviewEvent(id, action, typeof note === "string" && note.trim() ? note.trim() : null, Number(session.user.id));
  revalidatePath(String(formData.get("path") ?? "/dashboard"));
}
```

`src/components/dashboard/event-review-buttons.tsx` (client):

```tsx
"use client";

import { reviewEventAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import type { EventStatus } from "@/lib/services/eventReview";

/**
 * 상태에 맞는 전이 버튼만 보인다. 미확인 → 확인·조치완료, 확인 → 조치완료, 조치완료 → 되돌리기.
 */
export function EventReviewButtons({ id, status, path }: { id: number; status: EventStatus; path: string }) {
  const actions = status === "open" ? [["acknowledge", "확인"], ["done", "조치완료"]] : status === "acknowledged" ? [["done", "조치완료"]] : [["reopen", "되돌리기"]];
  return (
    <form action={reviewEventAction} className="flex gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="path" value={path} />
      {actions.map(([action, label]) => (
        <Button key={action} type="submit" name="action" value={action} variant="hard-outline" size="xs">
          {label}
        </Button>
      ))}
    </form>
  );
}
```

테스트에서 `조치완료` 상태 행에 버튼이 없어야 하므로 `done` 상태에서는 `되돌리기` 를 **행이 아니라 상세 타임라인에서만** 보이게 한다: `EventReviewButtons` 에 `allowReopen?: boolean` prop 을 두고 대시보드는 `false`.

`src/components/dashboard/event-table.tsx` (client): 컨트롤(기간 30/90 은 페이지 쿼리가 아니라 부모가 90일치를 넘기고 여기서 자름 — `events` 는 90일치, 기본 30일 필터) · 종류 멀티 셀렉트(체크박스 그룹) · `미확인만` 체크박스 · 표(날짜 `MM-DD` mono · 기업 `Link` · 심각도 아이콘+`SEVERITY_LABEL` · `KIND_LABEL` · title · 근거 링크 · 신뢰 배지 `Badge variant="ink"` 텍스트 "근거 확인"/"확인 필요"/"실측" · 상태 `STATUS_LABEL` · `EventReviewButtons`) · 페이지 20행. `silence` 는 `info` 행으로 변환(`title: "무보도 — 최근 보도 {MM-DD 또는 없음}"`, 버튼 없음). 빈 상태는 `lastEventAt` prop 으로 문장 생성. 정렬은 `compareSeverity` → 날짜 desc.

`src/components/dashboard/company-chips.tsx`: `Badge variant="ink"` 를 `Link` 로 감싼 칩, `count` 를 `font-mono` 로.

`freshness.ts`: `todo` → `openEvents`, 라벨 `조치` → `미확인 사건`.

`src/app/dashboard/page.tsx` 재조립:
- 데이터: `listEvents({ year, since: now-90d })` → `events`; `summariseEvents(year, now-30d)`; `buildNewsCoverage` 로 `silence`(latest null 또는 30일 초과) 목록; `lastEventAt` = `listEvents({year})` 첫 행(없으면 null); 판정·매트릭스 데이터는 04 용으로 현행 유지
- 헤더: 킥커 `{year}년 우수기업 · 지난 30일 동향`, h1 `이달의 동향`, 요약 `{총}개사 중 {companiesWithEvents}개사에 사건 · 주의 {notice} · 경보 {alert} · 홍보 후보 {positive} · 미확인 {open}`, 타일 2개 유지, `[월간 문서]` 버튼 자리는 Task 9 에서 채움
- 01 `Panel index="01" title="이달의 사건"` → `EventTable`
- 02/03 2단: `주의 기업`(alert/notice 보유 기업을 `count` 로 집계) · `홍보 후보`(positive) → `CompanyChips`
- 04 `Panel index="04" title="데이터 신선도"` 를 `<details>` 로 감싸 기본 닫힘, 안에 `VerdictBoard` + `CompanyPipelineGrid`
- 삭제: `ActionList`·`RecentArticles` import 와 섹션, `buildActionItems`. 파일 삭제: `actionItems.ts(.test)`, `action-list.tsx(.test)`

- [ ] **Step 4: 통과 확인** — 새 테스트 PASS, `npm test`, tsc, `npm run lint`, `npm run build`
- [ ] **Step 5: 커밋** — `git add -A src/app/dashboard src/components/dashboard src/lib/services/freshness.ts src/lib/services/freshness.test.ts && git rm -q src/lib/services/actionItems.ts src/lib/services/actionItems.test.ts src/components/dashboard/action-list.tsx src/components/dashboard/action-list.test.tsx && git commit -m "feat(dashboard): events of the month with review actions; drop action items"`

---

### Task 7: 기업 카드 페이지

**Files:**
- Create: `src/components/company/company-card.tsx` (+test), `src/components/company/company-card-grid.tsx`, `src/components/company/register-dialog.tsx`
- Modify: `src/app/companies/page.tsx`
- Add via CLI: `npx shadcn@latest add dialog --yes` → `src/components/ui/dialog.tsx`

**Interfaces:**
- Consumes: `CompanyCardData`·`sortCards`·`filterCards` (Task 5), `listEvents`·`listPensionSeries`·`buildNewsCoverage`·`listLatestVerifications`
- Produces: `CompanyCard({ card: CompanyCardData })`, `CompanyCardGrid({ cards: CompanyCardData[] })` (client; 정렬·필터 상태), `RegisterDialog({ year, action })` (기존 `CompanyBulkForm`·`CompanyTable` 을 안에 둠)

- [ ] **Step 1: 실패 테스트** — `company-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CompanyCard } from "@/components/company/company-card";
import type { CompanyCardData } from "@/lib/services/companyCards";

const CARD: CompanyCardData = { id: 1, name: "딥노이드", industry: "의료AI", businessNo: "1", headcount: { latest: 89, delta12m: 0.04 }, latestArticle: "2026-08-26T00:00:00.000Z", events30d: { alert: 0, notice: 0, positive: 1, info: 0 }, open: 1, worstSeverity: "positive", trust: "verified" };

describe("CompanyCard", () => {
  test("links to the company and shows headcount, events and trust in words", () => {
    render(<CompanyCard card={CARD} />);

    expect(screen.getByRole("link", { name: /딥노이드/ })).toHaveAttribute("href", "/companies/1");
    expect(screen.getByText(/가입자 89명/)).toBeInTheDocument();
    expect(screen.getByText("▲4%")).toBeInTheDocument();
    expect(screen.getByText("근거 확인")).toBeInTheDocument();
    expect(screen.getByText("미확인 1")).toBeInTheDocument();
  });

  test("warns about a missing business number and hides a zero open badge", () => {
    render(<CompanyCard card={{ ...CARD, businessNo: null, open: 0, worstSeverity: null, events30d: { alert: 0, notice: 0, positive: 0, info: 0 } }} />);

    expect(screen.getByText("사업자번호 미확보")).toBeInTheDocument();
    expect(screen.queryByText(/미확인/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**
  - `company-card.tsx`: `Card variant="comic"`; 상단 행 = 심각도 아이콘+`SEVERITY_LABEL`(worstSeverity 없으면 생략) · 이름(`Link`) · 신뢰 `Badge variant="ink"`; 2행 업종 · `가입자 {latest}명 {▲/▼pct}`; 3행 `★ 수상·투자·긍정 {positive} · ▲ 주의 {notice+alert}`; 4행 `최근 보도 MM-DD`; 하단 `Badge variant="ink"` `미확인 {open}`(0 이면 생략); 사업자번호 없으면 `text-review` 로 `사업자번호 미확보`
  - `company-card-grid.tsx` (client): `useState` 정렬(`triage|name|news` 세그먼트) · 필터 체크박스 3개 → `sortCards(filterCards(...))` → `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`
  - `register-dialog.tsx` (client): shadcn `Dialog` + `Button variant="hard"` 트리거 `기업 등록`; 내용은 기존 `CompanyBulkForm` 과 `CompanyTable`(관리) 탭 2개. `action` 은 서버 액션을 prop 으로 받음
  - `src/app/companies/page.tsx`: 헤더 h1 `기업`, 오른쪽 `RegisterDialog`; 본문 `CompanyCardGrid`. 카드 데이터는 `buildCompanyCards({ companies: listCompanies({year}), events: listEvents({year, since: now-30d}), series: listPensionSeries(year), news: buildNewsCoverage(...).byCompany, verdicts: listLatestVerifications(year).map(v => ({companyId, verdict: v.status})) })`. 연도 nav·notice 유지
- [ ] **Step 4: 통과 확인** — 새 테스트 + 기존 `company-table.test.tsx`·`company-bulk-form` 테스트 PASS, `npm test`, tsc, lint, build
- [ ] **Step 5: 커밋** — `git add src/components/company src/components/ui/dialog.tsx src/app/companies/page.tsx && git commit -m "feat(companies): company card grid with registration dialog"`

---

### Task 8: 기업 상세 — 사건 이력

**Files:**
- Create: `src/components/company/event-timeline.tsx` (+test)
- Modify: `src/app/companies/[id]/page.tsx`, `src/components/analysis/analysis-runner.tsx`

**Interfaces:**
- Produces: `EventTimeline({ events: EventRow[]; path: string })` — 메모 인라인 편집 + `EventReviewButtons allowReopen`

- [ ] **Step 1: 실패 테스트** — `event-timeline.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { EventTimeline } from "@/components/company/event-timeline";
import type { EventRow } from "@/lib/repositories/eventRepository";

vi.mock("@/app/dashboard/actions", () => ({ reviewEventAction: vi.fn() }));

const ROWS: EventRow[] = [
  { id: 1, companyId: 1, companyName: "알체라", kind: "negative_press", severity: "notice", occurredAt: "2026-08-28T00:00:00.000Z", title: "부정 보도 — 자본잠식", evidence: [{ label: "기사", link: "https://n/1" }], runId: 3, trust: "needs_review", status: "open", note: null, reviewedAt: null },
  { id: 2, companyId: 1, companyName: "알체라", kind: "headcount_down", severity: "notice", occurredAt: "2026-07-31T00:00:00.000Z", title: "인원 63 → 41명 (−35%)", evidence: [], runId: null, trust: null, status: "done", note: "본사 이전 확인(8/5)", reviewedAt: "2026-08-05T00:00:00.000Z" },
];

describe("EventTimeline", () => {
  test("lists events newest first with evidence link, trust, status and note", () => {
    render(<EventTimeline events={ROWS} path="/companies/1" />);
    const items = screen.getAllByRole("listitem");

    expect(items[0]).toHaveTextContent("2026-08-28");
    expect(within(items[0]).getByRole("link", { name: "기사" })).toHaveAttribute("href", "https://n/1");
    expect(items[0]).toHaveTextContent("확인 필요");
    expect(items[1]).toHaveTextContent("조치완료");
    expect(items[1]).toHaveTextContent("본사 이전 확인(8/5)");
  });

  test("lets a done event be reopened here", () => {
    render(<EventTimeline events={ROWS} path="/companies/1" />);
    expect(within(screen.getAllByRole("listitem")[1]).getByRole("button", { name: "되돌리기" })).toBeInTheDocument();
  });

  test("says so when a company has no events", () => {
    render(<EventTimeline events={[]} path="/companies/1" />);
    expect(screen.getByText(/기록된 사건이 없습니다/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — `event-timeline.tsx`(client): `ul` 세로 타임라인, 항목마다 날짜(`YYYY-MM-DD` mono)·심각도 아이콘+kind·title·근거 링크들·신뢰 배지·`STATUS_LABEL`·메모(입력 `name="note"` 가 같은 `form` 안에 있어 전이 시 함께 저장; 메모만 저장하는 버튼은 두지 않는다 — 전이와 함께 기록)·`EventReviewButtons allowReopen`. 상세 페이지: `listEvents({ year: company.year, companyId: company.id })` 를 `공식 원천 대조` 섹션 위에 `Panel index 없이 title="사건 이력"` 로. `analysis-runner.tsx`: 완료 이벤트 수신 후 `router.refresh()` 호출(`useRouter` from `next/navigation`)
- [ ] **Step 4: 통과 확인**, tsc, lint, `npm test`
- [ ] **Step 5: 커밋** — `git add src/components/company/event-timeline.tsx src/components/company/event-timeline.test.tsx "src/app/companies/[id]/page.tsx" src/components/analysis/analysis-runner.tsx && git commit -m "feat(companies): event history with notes on the company page"`

---

### Task 9: 월간 문서

**Files:**
- Create: `src/lib/services/monthlyReport.ts` (+test), `src/app/api/reports/monthly/route.ts`, `scripts/monthly-report.ts`
- Modify: `src/app/dashboard/page.tsx` (버튼)

**Interfaces:**
- Produces:
  ```ts
  export type MonthlyStats = { year; month; total: number; companiesWithEvents: number; events: number; alert: number; notice: number; positive: number; open: number; firstNoticeCompany: string | null };
  export function summaryParagraph(stats: MonthlyStats): string;
  export function buildMonthlyWorkbook(input: { year; month; events: EventRow[]; cards: CompanyCardData[]; freshness: FreshnessInput }): ExcelJS.Workbook;
  export function monthlyReportFileName(year, month): string;   // "2026-08 우수기업 동향.xlsx"
  export function buildYearlyWorkbook(input: { year; events: EventRow[] }): ExcelJS.Workbook;   // 시그니처만: throw new Error("연간 집계는 Task 14 에서 구현한다")
  ```

- [ ] **Step 1: 실패 테스트** — `monthlyReport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EventRow } from "@/lib/repositories/eventRepository";
import type { CompanyCardData } from "@/lib/services/companyCards";
import { buildMonthlyWorkbook, monthlyReportFileName, summaryParagraph } from "@/lib/services/monthlyReport";

const EVENT: EventRow = { id: 1, companyId: 1, companyName: "한국첨단소재", kind: "negative_press", severity: "notice", occurredAt: "2026-08-28T00:00:00.000Z", title: "부정 보도 — 자본잠식", evidence: [{ label: "기사", link: "https://n/1" }], runId: 1, trust: "needs_review", status: "open", note: null, reviewedAt: null };
const CARD: CompanyCardData = { id: 1, name: "한국첨단소재", industry: "소재", businessNo: "1", headcount: { latest: 40, delta12m: -0.1 }, latestArticle: "2026-08-28T00:00:00.000Z", events30d: { alert: 0, notice: 1, positive: 0, info: 0 }, open: 1, worstSeverity: "notice", trust: "needs_review" };
const FRESH = { now: new Date("2026-09-01"), latestNewsAt: "2026-08-30T03:03:00.000Z", latestSourceAt: null, sourcesUpdatedToday: 0, sourcesTotal: 50, pensionYm: "202607", running: 0, openEvents: 1, stale: 0 };

describe("summaryParagraph", () => {
  it("fills the template without inventing anything", () => {
    expect(summaryParagraph({ year: 2026, month: 8, total: 50, companiesWithEvents: 12, events: 18, alert: 0, notice: 3, positive: 7, open: 9, firstNoticeCompany: "한국첨단소재" }))
      .toBe("8월 우수기업 50개사 중 12개사에서 사건 18건. 주의 3건(한국첨단소재 외), 경보 0건, 홍보 후보 7건. 미확인 9건.");
    expect(summaryParagraph({ year: 2026, month: 8, total: 50, companiesWithEvents: 0, events: 0, alert: 0, notice: 0, positive: 0, open: 0, firstNoticeCompany: null }))
      .toBe("8월 우수기업 50개사 중 0개사에서 사건 0건. 주의 0건, 경보 0건, 홍보 후보 0건. 미확인 0건.");
  });
});

describe("buildMonthlyWorkbook", () => {
  it("has the five sheets and puts the event on the event and notice sheets", () => {
    const wb = buildMonthlyWorkbook({ year: 2026, month: 8, events: [EVENT], cards: [CARD], freshness: FRESH });

    expect(wb.worksheets.map((s) => s.name)).toEqual(["요약", "사건", "주의 기업", "홍보 후보", "기업 현황"]);
    expect(wb.getWorksheet("사건")!.getRow(2).getCell(2).value).toBe("한국첨단소재");
    expect(wb.getWorksheet("주의 기업")!.rowCount).toBe(2);
    expect(wb.getWorksheet("홍보 후보")!.rowCount).toBe(1);
    expect(String(wb.getWorksheet("요약")!.getCell("A1").value)).toContain("8월 우수기업");
  });

  it("names the file by month", () => {
    expect(monthlyReportFileName(2026, 8)).toBe("2026-08 우수기업 동향.xlsx");
  });
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — `monthlyReport.ts` 는 `reportExcel.ts` 의 `fitColumns`·색 상수를 export 해서 재사용(해당 파일에서 `export` 만 추가). 시트 열은 스펙 §4-2 표 그대로. `firstNoticeCompany` 는 notice/alert 사건 중 첫 행의 기업. 요약 시트: A1 문단, A3~ 표(지표·값 2열). 사건 시트 헤더 `날짜·기업·종류·심각도·제목·근거 링크·신뢰·상태·메모`.
  - `src/app/api/reports/monthly/route.ts`: `GET ?year=&month=` → 인증 확인 → `listEvents({ year, since: 월초, until: 월말 })`, 카드·freshness 는 대시보드와 같은 조합 → `workbook.xlsx.writeBuffer()` → `Content-Disposition: attachment; filename*=UTF-8''<encoded>`
  - `scripts/monthly-report.ts YYYY-MM` → 같은 빌더로 `data/` 에 저장(`/data/*.xlsx` 는 gitignore)
  - 대시보드 헤더에 `[월간 문서 ▾]` — `<details>` 안에 `이번 달`·`지난 달` 링크(`/api/reports/monthly?year=&month=`)
- [ ] **Step 4: 통과 확인**, tsc, lint, `npm test`, build; `npx tsx scripts/monthly-report.ts 2026-08` 로 파일 생성 확인
- [ ] **Step 5: 커밋** — `git add src/lib/services/monthlyReport.ts src/lib/services/monthlyReport.test.ts src/lib/services/reportExcel.ts src/app/api/reports/monthly/route.ts scripts/monthly-report.ts src/app/dashboard/page.tsx && git commit -m "feat(reports): monthly trend workbook from events"`

---

### Task 10: 메뉴·마무리

**Files:**
- Modify: `src/components/layout/app-shell.tsx`, `src/components/layout/app-shell.test.tsx`, `CLAUDE.md`(프로젝트 절 한 줄)

- [ ] **Step 1: 실패 테스트** — `app-shell.test.tsx` 에서 메뉴 기대값을 `동향`(/dashboard)·`기업`(/companies) 두 개로 교체
- [ ] **Step 2: 구현** — `NAV_ITEMS = [{ href: "/dashboard", label: "동향" }, { href: "/companies", label: "기업" }]`. `CLAUDE.md` 프로젝트 절의 "남은 것" 문장에 "사건 모니터링(대시보드·기업 카드·월간 문서) 완료" 반영
- [ ] **Step 3: 검증** — `npm test`, tsc, lint, `npm run build`. 컨트롤러가 인증 세션으로 `/dashboard`·`/companies`·`/companies/[id]` 캡처
- [ ] **Step 4: 커밋** — `git add src/components/layout/app-shell.tsx src/components/layout/app-shell.test.tsx CLAUDE.md && git commit -m "feat(shell): trends and companies menu"`

---

## Self-Review

**Spec coverage** — §1 사건 9종·임계·dedupe·trust → Task 2 ✓ (`silence` 는 저장하지 않고 Task 6 에서 계산 ✓) · §2 모델·upsert 보존 → Task 1·3 ✓ · §3-1 대시보드 → Task 6 ✓ (월간 문서 버튼은 Task 9) · §3-2 카드·모달 → Task 5·7 ✓ · §3-3 상세 타임라인·메모 → Task 8 ✓ · 항해 → Task 10 ✓ · §4-1 전이 → Task 3 ✓ · §4-2 월간 문서·라우트·스크립트 → Task 9 ✓ · §4-3 연간 시그니처만 → Task 9 ✓ · §4-4 훅 3곳 + 백필 → Task 4 ✓ · 삭제 목록 → Task 6 ✓

**Type consistency** — `NewEvent.evidence` (배열) ↔ 리포지토리가 `evidenceJson` 으로 직렬화 ✓ · `EventRow.occurredAt: string`(ISO) 를 Task 5·6·8·9 가 문자열로 취급 ✓ · `FreshnessInput.todo → openEvents` 로 Task 6 에서 개명, Task 9 픽스처도 `openEvents` ✓ · `Trust` 와 `VerificationStatus` 값 집합 일치 ✓ · `CompanySeries` 는 `dashboardSummary.ts` 의 기존 타입(`{companyId, name, points}`) 재사용 ✓

**Placeholders** — 없음. Task 6·7·8·9 의 컴포넌트 구현은 산문으로 적었으나 props·문구·클래스·데이터 소스를 전부 지정했다.

**주의** — Task 2 Step 1 의 12개월 픽스처 생성식은 가독성이 나쁘다; 구현자는 `["202508", …, "202608"]` 리터럴로 바꿔도 된다(주석에 명시).
