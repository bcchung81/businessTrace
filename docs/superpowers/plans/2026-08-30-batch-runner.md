# 일괄 분석 실행 (Batch Runner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/companies` 에서 여러 기업을 골라 수집 → 분석 → 검증을 한 번에 돌리고, 기업별 파이프라인 진행을 4단 스테퍼로 보며, 실행 중에는 상단 밴드에 "N개사 분석 중"이 뜨고, 기업을 등록한 직후 그 기업들만 골라 바로 실행할 수 있게 한다.

**Architecture:** 순수 서비스 `batchRun.ts` 가 기업 목록을 순차로 돌며 `BatchEvent` 를 내는 async generator 다(단일 러너의 `runCompanyAnalysis` 를 그대로 재사용). 진행 중인 배치는 프로세스 메모리의 `batchRegistry` 에 하나만 등록되고, `GET /api/analyze/status` 가 그것을 읽어 헤더 배지가 5초마다 확인한다. `POST /api/analyze/batch` 는 SSE 로 이벤트를 흘리고, 클라이언트 `BatchRunner` 가 기업별 `RunState` 를 `reduceAnalysis` 로 누적해 스테퍼·로그·결과 행을 그린다.

**Tech Stack:** Next.js 16 Route Handler + SSE(`createSseSink`/`createSseParser`) · Prisma · vitest + Testing Library

**Spec:** 브리프 `docs/design/2026-08-30-redesign-meta-prompt.md` §4-B [일괄 분석 실행 — screens-preview 화면 C] · 사용자 결정(2026-08-30): 화면 수동 실행, 옵션 = 대상(다중+빠른 선택 3) · 단계(전체/수집만/원천 대조만) · 기간 · 기사 상한 · 재실행 허용 · 수집원, 등록 직후 실행 진입점, 헤더 진행 표기 · 시각 문법 `docs/superpowers/specs/2026-08-30-visual-redesign-design.md`

## Global Constraints

- 실행 중 primary CTA 는 **"중단" 하나**. 설정 폼의 실행 버튼은 "실행", 실행 중엔 사라진다
- 4단 스테퍼 라벨: `수집` · `분석` · `검증` · `리포트`(사건 추출·저장 완료 = 리포트 단계 완료로 표기)
- 동시에 두 배치를 돌리지 않는다 — 두 번째 요청은 409 `이미 실행 중입니다 · N개사`
- 재실행 허용이 꺼져 있으면 검증 결과가 있는 기업은 `skipped` 로 건너뛴다(로그에 남긴다)
- 네이버 레이트리밋(`NewsRateLimitError`)은 계정 단위라 남은 기업을 전부 `aborted` 로 닫고 배치를 끝낸다
- 연결이 끊기면(`isOpen()` false) 현재 기업까지만 닫고 멈춘다 — 아무도 안 보는 LLM 호출을 남기지 않는다
- 라벨: 단계 `전체(수집·분석·검증)` · `수집만` · `원천 대조만`, 빠른 선택 `미분석만` · `주의·경보 있는 기업만` · `사업자번호 미확보 제외`, 헤더 배지 `{N}개사 분석 중 · {done}/{N}`
- 외부 호출 전부 mock. 주석은 JSDoc 만. 새 primary 색 사용처는 "실행/중단" 버튼뿐

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/lib/services/batchRegistry.ts` | 진행 중 배치 하나의 상태(메모리) |
| `src/lib/services/batchRun.ts` | 기업 순차 실행 · 단계 분기 · 이벤트 생성 |
| `src/lib/services/batchProgress.ts` | 클라이언트 리듀서 — 기업별 RunState·스테퍼 단계 |
| `src/app/api/analyze/batch/route.ts` | POST SSE |
| `src/app/api/analyze/status/route.ts` | GET 진행 상태 |
| `src/components/analysis/batch-runner.tsx` | 설정 폼 + 스테퍼 + 기업별 진행 + 로그 |
| `src/components/layout/batch-indicator.tsx` | 헤더 배지(폴링) |
| `src/components/layout/app-shell.tsx` | 배지 삽입 |
| `src/app/companies/page.tsx` | 러너 섹션 · 등록 직후 preselect |
| `src/components/layout/company-bulk-form.tsx` | 등록 안내에 "지금 분석 실행" 링크 |

---

### Task 1: 배치 레지스트리

**Files:** Create `src/lib/services/batchRegistry.ts` · Test `src/lib/services/batchRegistry.test.ts`

**Interfaces:**
```ts
export type BatchStage = "full" | "news" | "sources";
export type BatchStatus = { stage: BatchStage; total: number; done: number; startedAt: string; current: string | null };
export function startBatch(input: { stage: BatchStage; total: number; now?: Date }): BatchStatus;  // throws Error("already_running") if active
export function advanceBatch(update: { done?: number; current?: string | null }): void;
export function finishBatch(): void;
export function readBatch(): BatchStatus | null;
```

- [ ] **Step 1: Failing test**
```ts
// src/lib/services/batchRegistry.test.ts
import { beforeEach, describe, expect, test } from "vitest";
import { advanceBatch, finishBatch, readBatch, startBatch } from "@/lib/services/batchRegistry";

describe("batchRegistry", () => {
  beforeEach(finishBatch);

  test("holds one running batch and refuses a second", () => {
    expect(readBatch()).toBeNull();
    startBatch({ stage: "full", total: 3, now: new Date("2026-08-30T03:00:00Z") });
    expect(readBatch()).toEqual({ stage: "full", total: 3, done: 0, startedAt: "2026-08-30T03:00:00.000Z", current: null });
    expect(() => startBatch({ stage: "news", total: 1 })).toThrow("already_running");
  });

  test("advances and clears", () => {
    startBatch({ stage: "full", total: 2 });
    advanceBatch({ done: 1, current: "㈜가" });
    expect(readBatch()).toMatchObject({ done: 1, current: "㈜가" });
    finishBatch();
    expect(readBatch()).toBeNull();
    expect(() => advanceBatch({ done: 2 })).not.toThrow();
  });
});
```
- [ ] **Step 2: Run → fails (module missing)**
- [ ] **Step 3: Implement**
```ts
// src/lib/services/batchRegistry.ts
export type BatchStage = "full" | "news" | "sources";
export type BatchStatus = { stage: BatchStage; total: number; done: number; startedAt: string; current: string | null };

let active: BatchStatus | null = null;

/**
 * 진행 중 배치를 프로세스 메모리에 하나만 둔다. 관리자 한 명이 쓰는 도구라 인스턴스 간 공유는 하지 않는다.
 */
export function startBatch(input: { stage: BatchStage; total: number; now?: Date }): BatchStatus {
  if (active) throw new Error("already_running");
  active = { stage: input.stage, total: input.total, done: 0, startedAt: (input.now ?? new Date()).toISOString(), current: null };
  return active;
}

export function advanceBatch(update: { done?: number; current?: string | null }): void {
  if (!active) return;
  active = { ...active, ...update };
}

export function finishBatch(): void {
  active = null;
}

export function readBatch(): BatchStatus | null {
  return active;
}
```
- [ ] **Step 4: Run → 2 pass** · **Step 5: Commit** `feat(batch): in-memory registry for the one running batch`

---

### Task 2: 배치 실행 서비스

**Files:** Create `src/lib/services/batchRun.ts` · Test `src/lib/services/batchRun.test.ts`

**Interfaces:**
- Consumes: `runCompanyAnalysis`, `PipelineDeps`, `PipelineEvent`, `PipelineOutcome` (`@/lib/services/analysisPipeline`), `collectNews`, `NewsRateLimitError`, `CollectResult` (`@/lib/services/newsCollector`), `createCollectionRun` (`@/lib/repositories/analysisRun`), registry (Task 1)
- Produces:
```ts
export type BatchTarget = { id: number; name: string; year: number; businessNo: string | null; verified: boolean };
export type BatchOptions = { stage: BatchStage; startDate?: string; endDate?: string; limit: number; force: boolean; naver: boolean; google: boolean };
export type CompanyStatus = PipelineOutcome["status"] | "skipped" | "collected" | "sources_done" | "rate_limited";
export type BatchEvent =
  | { type: "batch_start"; total: number; stage: BatchStage }
  | { type: "company_start"; companyId: number; name: string; index: number }
  | { type: "company_event"; companyId: number; event: PipelineEvent }
  | { type: "company_done"; companyId: number; status: CompanyStatus; message?: string; articles?: number }
  | { type: "batch_done"; done: number; total: number; aborted: boolean };
export type BatchDeps = {
  userId: number;
  pipeline: PipelineDeps;
  collect: (options: { query: string; startDate?: string; endDate?: string; limit: number; naver: boolean; google: boolean }) => Promise<CollectResult>;
  collectOnly: (input: { companyId: number; userId: number; news: CollectResult["items"] }) => Promise<unknown>;
  refreshSources: (company: BatchTarget) => Promise<unknown>;
  isOpen?: () => boolean;
};
export async function* runBatch(targets: BatchTarget[], options: BatchOptions, deps: BatchDeps): AsyncGenerator<BatchEvent>;
```
`runBatch` 는 `startBatch` 로 등록하고 `finally` 에서 `finishBatch` 한다. 이미 실행 중이면 `Error("already_running")` 을 던진다.

- [ ] **Step 1: Failing tests**
```ts
// src/lib/services/batchRun.test.ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import { finishBatch, readBatch } from "@/lib/services/batchRegistry";
import { runBatch, type BatchDeps, type BatchEvent, type BatchTarget } from "@/lib/services/batchRun";
import { NewsRateLimitError } from "@/lib/services/newsCollector";
import type { NewsItem } from "@/lib/services/newsTypes";

const item: NewsItem = { title: "t", link: "https://n/1", description: "", content: "", published: "2026-08-01", source: "s", provider: "naver", titleMatch: true, mentions: 1, relevance: "primary" };
const targets: BatchTarget[] = [
  { id: 1, name: "㈜가", year: 2026, businessNo: "1", verified: false },
  { id: 2, name: "㈜나", year: 2026, businessNo: null, verified: true },
];
const options = { stage: "full" as const, limit: 20, force: false, naver: true, google: true };

function deps(over: Partial<BatchDeps> = {}): BatchDeps {
  return {
    userId: 1,
    pipeline: { model: "m", analyze: vi.fn(), verify: vi.fn() },
    collect: vi.fn(async () => ({ items: [item], duplicatesRemoved: 0, errors: [] })),
    collectOnly: vi.fn(async () => ({})),
    refreshSources: vi.fn(async () => ({})),
    ...over,
  };
}

async function drain(gen: AsyncGenerator<BatchEvent>) {
  const events: BatchEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

vi.mock("@/lib/services/analysisPipeline", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/services/analysisPipeline")>();
  return {
    ...original,
    runCompanyAnalysis: vi.fn(async (input, pipelineDeps) => {
      pipelineDeps.onEvent?.({ type: "progress", step: "trend", current: 1, total: 1 });
      return { runId: 10 + input.company.id, status: "verified", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 } };
    }),
  };
});

describe("runBatch", () => {
  beforeEach(finishBatch);

  test("runs companies in order, relays pipeline events, skips verified ones without --force", async () => {
    const events = await drain(runBatch(targets, options, deps()));
    expect(events[0]).toEqual({ type: "batch_start", total: 2, stage: "full" });
    expect(events).toContainEqual({ type: "company_start", companyId: 1, name: "㈜가", index: 0 });
    expect(events).toContainEqual({ type: "company_event", companyId: 1, event: { type: "progress", step: "trend", current: 1, total: 1 } });
    expect(events).toContainEqual({ type: "company_done", companyId: 1, status: "verified", articles: 1 });
    expect(events).toContainEqual({ type: "company_done", companyId: 2, status: "skipped", message: "이미 검증됨" });
    expect(events.at(-1)).toEqual({ type: "batch_done", done: 2, total: 2, aborted: false });
    expect(readBatch()).toBeNull();
  });

  test("with force it analyses verified companies too", async () => {
    const events = await drain(runBatch(targets, { ...options, force: true }, deps()));
    expect(events.filter((e) => e.type === "company_done").map((e) => (e as { status: string }).status)).toEqual(["verified", "verified"]);
  });

  test("news stage collects and stores without touching the pipeline", async () => {
    const d = deps();
    const events = await drain(runBatch(targets, { ...options, stage: "news", force: true }, d));
    expect(d.collectOnly).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: "company_done", companyId: 1, status: "collected", articles: 1 });
  });

  test("sources stage refreshes official sources only", async () => {
    const d = deps();
    const events = await drain(runBatch(targets, { ...options, stage: "sources", force: true }, d));
    expect(d.refreshSources).toHaveBeenCalledTimes(2);
    expect(d.collect).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: "company_done", companyId: 2, status: "sources_done" });
  });

  test("a rate limit closes the rest as aborted and ends the batch", async () => {
    const d = deps({ collect: vi.fn(async () => { throw new NewsRateLimitError("한도"); }) });
    const events = await drain(runBatch(targets, { ...options, force: true }, d));
    expect(events).toContainEqual({ type: "company_done", companyId: 1, status: "rate_limited", message: "한도" });
    expect(events).toContainEqual({ type: "company_done", companyId: 2, status: "aborted", message: "레이트리밋으로 중단" });
    expect(events.at(-1)).toMatchObject({ type: "batch_done", aborted: true });
  });

  test("stops after the current company when the client is gone", async () => {
    let open = true;
    const d = deps({ isOpen: () => open, collect: vi.fn(async () => { open = false; return { items: [item], duplicatesRemoved: 0, errors: [] }; }) });
    const events = await drain(runBatch(targets, { ...options, force: true }, d));
    expect(events.filter((e) => e.type === "company_start")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "batch_done", aborted: true, done: 1 });
  });

  test("refuses to start while another batch runs", async () => {
    const first = runBatch(targets, options, deps());
    await first.next();
    await expect(drain(runBatch(targets, options, deps()))).rejects.toThrow("already_running");
    await drain(first);
  });
});
```
- [ ] **Step 2: Run → fails**
- [ ] **Step 3: Implement**
```ts
// src/lib/services/batchRun.ts
import { advanceBatch, finishBatch, startBatch, type BatchStage } from "@/lib/services/batchRegistry";
import { runCompanyAnalysis, type PipelineDeps, type PipelineEvent, type PipelineOutcome } from "@/lib/services/analysisPipeline";
import { NewsRateLimitError, type CollectResult } from "@/lib/services/newsCollector";

export type BatchTarget = { id: number; name: string; year: number; businessNo: string | null; verified: boolean };
export type BatchOptions = { stage: BatchStage; startDate?: string; endDate?: string; limit: number; force: boolean; naver: boolean; google: boolean };
export type CompanyStatus = PipelineOutcome["status"] | "skipped" | "collected" | "sources_done" | "rate_limited";
export type BatchEvent =
  | { type: "batch_start"; total: number; stage: BatchStage }
  | { type: "company_start"; companyId: number; name: string; index: number }
  | { type: "company_event"; companyId: number; event: PipelineEvent }
  | { type: "company_done"; companyId: number; status: CompanyStatus; message?: string; articles?: number }
  | { type: "batch_done"; done: number; total: number; aborted: boolean };
export type BatchDeps = {
  userId: number;
  pipeline: PipelineDeps;
  collect: (options: { query: string; startDate?: string; endDate?: string; limit: number; naver: boolean; google: boolean }) => Promise<CollectResult>;
  collectOnly: (input: { companyId: number; userId: number; news: CollectResult["items"] }) => Promise<unknown>;
  refreshSources: (company: BatchTarget) => Promise<unknown>;
  isOpen?: () => boolean;
};

type Step = { events: BatchEvent[]; done: Extract<BatchEvent, { type: "company_done" }>; rateLimited?: boolean };

async function runOne(target: BatchTarget, options: BatchOptions, deps: BatchDeps, open: () => boolean): Promise<Step> {
  const events: BatchEvent[] = [];
  const done = (status: CompanyStatus, extra: { message?: string; articles?: number } = {}): Step => ({
    events,
    done: { type: "company_done", companyId: target.id, status, ...extra },
  });

  if (options.stage === "sources") {
    await deps.refreshSources(target);
    return done("sources_done");
  }
  if (target.verified && !options.force && options.stage === "full") return done("skipped", { message: "이미 검증됨" });

  let collected: CollectResult;
  try {
    collected = await deps.collect({ query: target.name, startDate: options.startDate, endDate: options.endDate, limit: options.limit, naver: options.naver, google: options.google });
  } catch (caught) {
    if (caught instanceof NewsRateLimitError) return { ...done("rate_limited", { message: caught.message }), rateLimited: true };
    return done("failed", { message: caught instanceof Error ? caught.message : "수집 실패" });
  }
  if (options.stage === "news") {
    await deps.collectOnly({ companyId: target.id, userId: deps.userId, news: collected.items });
    return done("collected", { articles: collected.items.length });
  }
  const outcome = await runCompanyAnalysis(
    { company: { id: target.id, name: target.name }, userId: deps.userId, news: collected.items },
    { ...deps.pipeline, onEvent: (event) => events.push({ type: "company_event", companyId: target.id, event }), isOpen: open },
  );
  return done(outcome.status, { articles: collected.items.length, ...(outcome.message ? { message: outcome.message } : {}) });
}

/**
 * 기업을 순서대로 하나씩 돌린다. 레이트리밋이 나면 남은 기업을 전부 중단으로 닫는다 — 한도는 계정 단위라 다음 기업도 실패한다.
 * 연결이 끊기면 현재 기업까지만 마치고 멈춘다. 진행 상태는 레지스트리에 적어 헤더 배지가 읽게 한다.
 */
export async function* runBatch(targets: BatchTarget[], options: BatchOptions, deps: BatchDeps): AsyncGenerator<BatchEvent> {
  startBatch({ stage: options.stage, total: targets.length });
  const open = () => deps.isOpen?.() ?? true;
  let done = 0;
  let aborted = false;
  try {
    yield { type: "batch_start", total: targets.length, stage: options.stage };
    for (const [index, target] of targets.entries()) {
      if (aborted || !open()) {
        aborted = true;
        yield { type: "company_done", companyId: target.id, status: "aborted", message: open() ? "레이트리밋으로 중단" : "연결 종료로 중단" };
        done += 1;
        continue;
      }
      advanceBatch({ current: target.name });
      yield { type: "company_start", companyId: target.id, name: target.name, index };
      const step = await runOne(target, options, deps, open);
      for (const event of step.events) yield event;
      yield step.done;
      done += 1;
      advanceBatch({ done });
      if (step.rateLimited) aborted = true;
      if (!open()) aborted = true;
    }
    yield { type: "batch_done", done, total: targets.length, aborted };
  } finally {
    finishBatch();
  }
}
```
주의: "연결 종료" 케이스의 테스트는 남은 기업을 `aborted` 로 닫지 않고 멈추기를 기대한다(`company_start` 1회, `done: 1`). 그러므로 루프 머리에서 `!open()` 이면 `break` 하고, 레이트리밋일 때만 남은 기업을 `aborted` 로 닫는다 — 위 코드의 `if (aborted || !open())` 블록을 다음으로 바꾼다:
```ts
      if (!open()) { aborted = true; break; }
      if (aborted) { yield { type: "company_done", companyId: target.id, status: "aborted", message: "레이트리밋으로 중단" }; done += 1; continue; }
```
- [ ] **Step 4: Run → 7 pass** · **Step 5: Commit** `feat(batch): sequential batch runner with stage, force, rate-limit and disconnect handling`

---

### Task 3: 클라이언트 리듀서와 스테퍼 단계

**Files:** Create `src/lib/services/batchProgress.ts` · Test `src/lib/services/batchProgress.test.ts`

**Interfaces:**
```ts
export type StepKey = "collect" | "analyze" | "verify" | "report";
export const STEP_ORDER: StepKey[];                                   // collect, analyze, verify, report
export const STEP_LABEL: Record<StepKey, string>;                    // 수집·분석·검증·리포트
export type CompanyProgress = { companyId: number; name: string; index: number; step: StepKey | null; run: RunState; status: CompanyStatus | null; message: string | null; articles: number | null };
export type BatchState = { phase: "idle" | "running" | "done"; stage: BatchStage | null; total: number; done: number; aborted: boolean; companies: CompanyProgress[]; log: LogEntry[] };
export const INITIAL_BATCH: BatchState;
export function reduceBatch(state: BatchState, raw: unknown): BatchState;
export function stepOf(progress: CompanyProgress): StepKey | null;  // 단계 산출: run.phase analyzing→analyze, verifying→verify, done→report, status collected→collect
```
`reduceBatch` 는 `company_event` 를 해당 기업의 `run` 에 `reduceAnalysis` 로 누적하고, `progress`·`news_done`·`verifying`·`verified`·`company_done` 마다 로그 한 줄을 남긴다(`"㈜가 · 수집 12건 (중복 3 제거)"`, `"㈜가 · 검증 0.92"`, `"㈜나 · 건너뜀 — 이미 검증됨"`).

- [ ] **Step 1: Failing tests**
```ts
// src/lib/services/batchProgress.test.ts
import { describe, expect, test } from "vitest";
import { INITIAL_BATCH, reduceBatch, stepOf, STEP_ORDER } from "@/lib/services/batchProgress";

function feed(events: unknown[]) {
  return events.reduce((state, event) => reduceBatch(state, event), INITIAL_BATCH);
}

describe("reduceBatch", () => {
  test("tracks each company through collect → analyze → verify → report", () => {
    let state = feed([
      { type: "batch_start", total: 1, stage: "full" },
      { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
    ]);
    expect(state.phase).toBe("running");
    expect(stepOf(state.companies[0])).toBe("collect");
    state = reduceBatch(state, { type: "company_event", companyId: 1, event: { type: "progress", step: "trend", current: 1, total: 4 } });
    expect(stepOf(state.companies[0])).toBe("analyze");
    state = reduceBatch(state, { type: "company_event", companyId: 1, event: { type: "verifying", runId: 5 } });
    expect(stepOf(state.companies[0])).toBe("verify");
    state = reduceBatch(state, { type: "company_done", companyId: 1, status: "verified", articles: 4 });
    expect(stepOf(state.companies[0])).toBe("report");
    expect(state.companies[0]).toMatchObject({ status: "verified", articles: 4 });
    state = reduceBatch(state, { type: "batch_done", done: 1, total: 1, aborted: false });
    expect(state).toMatchObject({ phase: "done", done: 1, aborted: false });
  });

  test("writes a log line for skips, rate limits and verification scores", () => {
    const state = feed([
      { type: "batch_start", total: 2, stage: "full" },
      { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
      { type: "company_event", companyId: 1, event: { type: "verified", runId: 5, verification: { status: "verified", faithfulness: 0.92, sourceCoverage: 1, evidenceMatch: 0.7, unsupportedClaims: [], counterEvidence: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }, detail: { layer1: { coverage: 1, cited: 1, total: 1, invalid: [] }, layer2: null, layer3: 0.7 } } } },
      { type: "company_done", companyId: 1, status: "verified", articles: 3 },
      { type: "company_start", companyId: 2, name: "㈜나", index: 1 },
      { type: "company_done", companyId: 2, status: "skipped", message: "이미 검증됨" },
    ]);
    const text = state.log.map((entry) => entry.text);
    expect(text).toContainEqual("㈜가 · 검증 통과 · 충실도 0.92");
    expect(text).toContainEqual("㈜나 · 건너뜀 — 이미 검증됨");
    expect(state.log.find((entry) => entry.text.includes("건너뜀"))?.level).toBe("warn");
  });

  test("collect-only and sources-only stages stop at their own step", () => {
    const news = feed([{ type: "batch_start", total: 1, stage: "news" }, { type: "company_start", companyId: 1, name: "㈜가", index: 0 }, { type: "company_done", companyId: 1, status: "collected", articles: 7 }]);
    expect(stepOf(news.companies[0])).toBe("collect");
    const sources = feed([{ type: "batch_start", total: 1, stage: "sources" }, { type: "company_start", companyId: 1, name: "㈜가", index: 0 }, { type: "company_done", companyId: 1, status: "sources_done" }]);
    expect(stepOf(sources.companies[0])).toBe("report");
    expect(STEP_ORDER).toEqual(["collect", "analyze", "verify", "report"]);
  });
});
```
- [ ] **Step 2: Run → fails**
- [ ] **Step 3: Implement**
```ts
// src/lib/services/batchProgress.ts
import { INITIAL_RUN, reduceAnalysis, type LogEntry, type RunState } from "@/lib/services/analysisProgress";
import type { BatchStage } from "@/lib/services/batchRegistry";
import type { BatchEvent, CompanyStatus } from "@/lib/services/batchRun";

export type StepKey = "collect" | "analyze" | "verify" | "report";
export const STEP_ORDER: StepKey[] = ["collect", "analyze", "verify", "report"];
export const STEP_LABEL: Record<StepKey, string> = { collect: "수집", analyze: "분석", verify: "검증", report: "리포트" };

export type CompanyProgress = { companyId: number; name: string; index: number; run: RunState; status: CompanyStatus | null; message: string | null; articles: number | null };
export type BatchState = { phase: "idle" | "running" | "done"; stage: BatchStage | null; total: number; done: number; aborted: boolean; companies: CompanyProgress[]; log: LogEntry[] };

export const INITIAL_BATCH: BatchState = { phase: "idle", stage: null, total: 0, done: 0, aborted: false, companies: [], log: [] };

const STATUS_TEXT: Record<CompanyStatus, string> = {
  verified: "검증 통과", needs_review: "검토 필요", no_news: "기사 없음", verification_failed: "검증 실패", failed: "실패", aborted: "중단",
  skipped: "건너뜀", collected: "수집 완료", sources_done: "원천 대조 완료", rate_limited: "레이트리밋",
};

/**
 * 기업이 지금 어느 단계에 있는지 낸다 — 파이프라인 상태와 최종 상태를 스테퍼 4단으로 접는다.
 */
export function stepOf(progress: CompanyProgress): StepKey | null {
  if (progress.status === "collected") return "collect";
  if (progress.status && progress.status !== "skipped") return "report";
  if (progress.run.phase === "verifying") return "verify";
  if (progress.run.phase === "analyzing" || progress.run.phase === "done") return progress.run.phase === "done" ? "report" : "analyze";
  return progress.status === "skipped" ? null : "collect";
}

function log(state: BatchState, level: LogEntry["level"], text: string): BatchState {
  return { ...state, log: [...state.log, { level, text }] };
}

function patch(state: BatchState, companyId: number, fn: (progress: CompanyProgress) => CompanyProgress): BatchState {
  return { ...state, companies: state.companies.map((entry) => (entry.companyId === companyId ? fn(entry) : entry)) };
}

/**
 * SSE 이벤트를 배치 화면 상태로 누적한다. 기업별 파이프라인 이벤트는 단일 러너의 리듀서를 그대로 쓴다.
 */
export function reduceBatch(state: BatchState, raw: unknown): BatchState {
  const event = raw as BatchEvent;
  switch (event.type) {
    case "batch_start":
      return { ...INITIAL_BATCH, phase: "running", stage: event.stage, total: event.total };
    case "company_start":
      return { ...state, companies: [...state.companies, { companyId: event.companyId, name: event.name, index: event.index, run: INITIAL_RUN, status: null, message: null, articles: null }] };
    case "company_event": {
      const name = state.companies.find((entry) => entry.companyId === event.companyId)?.name ?? "";
      let next = patch(state, event.companyId, (progress) => ({ ...progress, run: reduceAnalysis(progress.run, event.event) }));
      const inner = event.event;
      if (inner.type === "verifying") next = log(next, "info", `${name} · 검증 시작`);
      if (inner.type === "verified") next = log(next, "info", `${name} · ${inner.verification.status === "verified" ? "검증 통과" : "검토 필요"} · 충실도 ${(inner.verification.faithfulness ?? 0).toFixed(2)}`);
      if (inner.type === "verification_failed" || inner.type === "events_failed" || inner.type === "error") next = log(next, "error", `${name} · ${inner.message}`);
      return next;
    }
    case "company_done": {
      const name = state.companies.find((entry) => entry.companyId === event.companyId)?.name ?? "";
      const next = patch(state, event.companyId, (progress) => ({ ...progress, status: event.status, message: event.message ?? null, articles: event.articles ?? null }));
      const level: LogEntry["level"] = event.status === "skipped" || event.status === "aborted" ? "warn" : event.status === "failed" || event.status === "rate_limited" || event.status === "verification_failed" ? "error" : "info";
      const tail = event.message ? ` — ${event.message}` : event.articles !== undefined ? ` · 기사 ${event.articles}건` : "";
      return { ...log(next, level, `${name} · ${STATUS_TEXT[event.status]}${tail}`), done: state.done + 1 };
    }
    case "batch_done":
      return { ...state, phase: "done", done: event.done, aborted: event.aborted };
    default:
      return state;
  }
}
```
- [ ] **Step 4: Run → 3 pass** · **Step 5: Commit** `feat(batch): client reducer folding pipeline events into a four-step per-company progress`

---

### Task 4: Route Handler 2개

**Files:** Create `src/app/api/analyze/batch/route.ts`, `src/app/api/analyze/status/route.ts` · Tests `src/app/api/analyze/batch/route.test.ts`, `src/app/api/analyze/status/route.test.ts`

- [ ] **Step 1: Failing tests**
```ts
// src/app/api/analyze/status/route.test.ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import { finishBatch, startBatch } from "@/lib/services/batchRegistry";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "1" } })) }));
import { GET } from "@/app/api/analyze/status/route";

describe("GET /api/analyze/status", () => {
  beforeEach(finishBatch);
  test("reports null when idle and the running batch otherwise", async () => {
    expect(await (await GET()).json()).toEqual({ batch: null });
    startBatch({ stage: "full", total: 4 });
    expect(await (await GET()).json()).toMatchObject({ batch: { stage: "full", total: 4, done: 0 } });
  });
});
```
```ts
// src/app/api/analyze/batch/route.test.ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { finishBatch, startBatch } from "@/lib/services/batchRegistry";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/services/batchRun", () => ({
  runBatch: vi.fn(async function* (targets: Array<{ id: number }>) {
    yield { type: "batch_start", total: targets.length, stage: "full" };
    for (const target of targets) yield { type: "company_done", companyId: target.id, status: "skipped", message: "이미 검증됨" };
    yield { type: "batch_done", done: targets.length, total: targets.length, aborted: false };
  }),
}));
import { auth } from "@/auth";
import { runBatch } from "@/lib/services/batchRun";
import { POST } from "@/app/api/analyze/batch/route";

const post = (body: unknown) => POST(new Request("http://localhost/api/analyze/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("POST /api/analyze/batch", () => {
  beforeEach(async () => {
    await resetDatabase();
    finishBatch();
    vi.mocked(auth).mockResolvedValue({ user: { id: "1" } } as never);
  });

  test("401 anonymous, 400 bad body, 409 while a batch runs", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect((await post({ companyIds: [1] })).status).toBe(401);
    expect((await post({ companyIds: [] })).status).toBe(400);
    startBatch({ stage: "news", total: 2 });
    const busy = await post({ companyIds: [1], stage: "full", limit: 20, force: false, naver: true, google: true });
    expect(busy.status).toBe(409);
    expect((await busy.json()).message).toContain("2개사");
  });

  test("streams batch events for the requested companies as SSE", async () => {
    const a = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const b = await prisma.company.create({ data: { name: "㈜나", year: 2026, isActive: false } });
    const response = await post({ companyIds: [a.id, b.id, 999], stage: "full", limit: 20, force: false, naver: true, google: true });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain('"type":"batch_start"');
    expect(text).toContain(`"companyId":${a.id}`);
    expect(text).not.toContain(`"companyId":${b.id}`);
    expect(vi.mocked(runBatch).mock.calls[0][0]).toHaveLength(1);
  });
});
```
- [ ] **Step 2: Run → fails**
- [ ] **Step 3: Implement**
```ts
// src/app/api/analyze/status/route.ts
import { auth } from "@/auth";
import { readBatch } from "@/lib/services/batchRegistry";

export async function GET() {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });
  return Response.json({ batch: readBatch() });
}
```
```ts
// src/app/api/analyze/batch/route.ts
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createCollectionRun } from "@/lib/repositories/analysisRun";
import { updateCompany } from "@/lib/repositories/companyRepository";
import { upsertEvents } from "@/lib/repositories/eventRepository";
import { listSourceSnapshots, saveSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { defaultPipelineDeps } from "@/lib/services/analysisPipeline";
import { readBatch } from "@/lib/services/batchRegistry";
import { runBatch, type BatchTarget } from "@/lib/services/batchRun";
import { collectEvidence } from "@/lib/services/collectEvidence";
import { refreshCorpCodes } from "@/lib/services/dartCorpCode";
import { extractSourceEvents } from "@/lib/services/eventRules";
import { collectNews } from "@/lib/services/newsCollector";
import { toSnapshots } from "@/lib/services/sourceEvidence";
import { createSseSink } from "@/lib/services/sse";

const bodySchema = z.object({
  companyIds: z.array(z.number().int()).min(1),
  stage: z.enum(["full", "news", "sources"]).default("full"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  force: z.boolean().default(false),
  naver: z.boolean().default(true),
  google: z.boolean().default(true),
});

/**
 * 원천 대조 한 기업 — 기존 `/api/companies/[id]/dart` 와 같은 순서다.
 */
async function refreshSources(target: BatchTarget) {
  const { evidence, businessNo } = await collectEvidence({ name: target.name, year: target.year, businessNo: target.businessNo });
  const snapshots = toSnapshots(evidence);
  await saveSourceSnapshots(target.id, snapshots);
  await upsertEvents(extractSourceEvents({ companyId: target.id, snapshots: await listSourceSnapshots(target.id), now: new Date() }));
  await updateCompany(target.id, { businessNo: businessNo ?? target.businessNo, industry: evidence.profile.industryCode ?? null });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "잘못된 요청입니다." }, { status: 400 });
  const running = readBatch();
  if (running) return Response.json({ message: `이미 실행 중입니다 · ${running.total}개사` }, { status: 409 });

  const companies = await prisma.company.findMany({
    where: { id: { in: parsed.data.companyIds }, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    include: { analysisRuns: { where: { status: "completed", verification: { isNot: null } }, select: { id: true }, take: 1 } },
  });
  const targets: BatchTarget[] = companies.map((company) => ({ id: company.id, name: company.name, year: company.year, businessNo: company.businessNo, verified: company.analysisRuns.length > 0 }));
  if (targets.length === 0) return Response.json({ message: "실행할 기업이 없습니다." }, { status: 400 });
  if (parsed.data.stage === "sources") await refreshCorpCodes();

  const userId = Number(session.user.id);
  let sink: ReturnType<typeof createSseSink> | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const out = createSseSink(controller);
      sink = out;
      try {
        const events = runBatch(targets, parsed.data, {
          userId,
          pipeline: defaultPipelineDeps(),
          collect: (options) => collectNews(options),
          collectOnly: createCollectionRun,
          refreshSources,
          isOpen: () => out.open,
        });
        for await (const event of events) out.send(event);
      } catch (caught) {
        out.send({ type: "error", message: caught instanceof Error ? caught.message : "배치 실패" });
      } finally {
        out.close();
      }
    },
    cancel() {
      sink?.drop();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
```
`collectNews` 의 옵션 타입에 `naver`·`google` 불리언이 이미 있다(`options.naver === false`). `updateCompany` 의 두 번째 인자 형태는 `src/lib/repositories/companyRepository.ts:87` 을 확인해 맞춘다. `collectEvidence` 반환에 `evidence.profile.industryCode` 가 있는지 `src/lib/services/collectEvidence.ts` 로 확인하고, 없으면 industry 갱신 줄을 뺀다.
- [ ] **Step 4: Run → pass** · **Step 5: Commit** `feat(batch): SSE batch route and status route`

---

### Task 5: 화면 — BatchRunner · 헤더 배지 · 등록 직후 실행

**Files:** Create `src/components/analysis/batch-runner.tsx`, `src/components/layout/batch-indicator.tsx` · Modify `src/components/layout/app-shell.tsx`, `src/app/companies/page.tsx`, `src/components/layout/company-bulk-form.tsx`, `src/components/company/register-dialog.tsx` · Tests `src/components/analysis/batch-runner.test.tsx`, `src/components/layout/batch-indicator.test.tsx`, `src/components/layout/app-shell.test.tsx`(배지), `src/components/layout/company-bulk-form.test.tsx`(링크)

**Interfaces:**
```tsx
export type BatchCandidate = { id: number; name: string; verified: boolean; hasWarning: boolean; businessNo: string | null };
export function BatchRunner({ candidates, preselected, fetchImpl }: { candidates: BatchCandidate[]; preselected?: number[]; fetchImpl?: typeof fetch }): JSX.Element;
export function BatchIndicator({ initial, fetchImpl, intervalMs }: { initial: BatchStatus | null; fetchImpl?: typeof fetch; intervalMs?: number }): JSX.Element | null;
```
- `BatchRunner`: 설정 폼(대상 체크 목록 + 빠른 선택 3 · 단계 라디오 3 · 시작일·종료일 · 기사 상한 select(10/20/50/100) · 재실행 허용 체크 · 수집원 체크 2) → "실행"(primary). 실행 중: 폼 비활성, primary "중단" 하나, 4단 스테퍼(각 단계에 그 단계에 있는 기업 수), 기업별 행(이름 · 현재 단계 · `현재/전체` · 상태), 로그 목록. `preselected` 가 있으면 그 기업만 체크된 채로 시작하고 폼이 펼쳐진다.
- `BatchIndicator`: `initial` 이 있으면 즉시 표시, 이후 `intervalMs`(기본 5000) 마다 `/api/analyze/status` 를 읽어 `null` 이면 숨긴다. `initial` 이 `null` 이어도 첫 폴링은 한다(다른 탭에서 시작한 배치).

- [ ] **Step 1: Failing tests**
```tsx
// src/components/analysis/batch-runner.test.tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BatchRunner, type BatchCandidate } from "@/components/analysis/batch-runner";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const CANDIDATES: BatchCandidate[] = [
  { id: 1, name: "㈜가", verified: false, hasWarning: true, businessNo: "1" },
  { id: 2, name: "㈜나", verified: true, hasWarning: false, businessNo: null },
  { id: 3, name: "㈜다", verified: true, hasWarning: true, businessNo: "3" },
];

function sse(events: unknown[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("BatchRunner", () => {
  test("quick picks select the right companies", () => {
    render(<BatchRunner candidates={CANDIDATES} />);
    fireEvent.click(screen.getByRole("button", { name: "미분석만" }));
    expect(screen.getByRole("checkbox", { name: "㈜가" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "㈜나" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "주의·경보 있는 기업만" }));
    expect(screen.getByRole("checkbox", { name: "㈜다" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "㈜나" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "사업자번호 미확보 제외" }));
    expect(screen.getByRole("checkbox", { name: "㈜나" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "㈜가" })).toBeChecked();
  });

  test("starts preselected companies checked", () => {
    render(<BatchRunner candidates={CANDIDATES} preselected={[2]} />);
    expect(screen.getByRole("checkbox", { name: "㈜나" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "㈜가" })).not.toBeChecked();
  });

  test("posts the options, then shows the stepper, per-company progress and log; the only primary action while running is 중단", async () => {
    const fetchImpl = vi.fn(async () =>
      sse([
        { type: "batch_start", total: 1, stage: "full" },
        { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
        { type: "company_event", companyId: 1, event: { type: "progress", step: "trend", current: 2, total: 5 } },
        { type: "company_done", companyId: 1, status: "verified", articles: 5 },
        { type: "batch_done", done: 1, total: 1, aborted: false },
      ]),
    );
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("radio", { name: "수집만" }));
    fireEvent.change(screen.getByLabelText("기사 상한"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "재실행 허용" }));
    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ companyIds: [1], stage: "news", limit: 50, force: true, naver: true, google: true });

    await waitFor(() => expect(screen.getByRole("list", { name: "파이프라인 단계" })).toBeInTheDocument());
    const steps = within(screen.getByRole("list", { name: "파이프라인 단계" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(steps[0]).toContain("수집");
    expect(steps[3]).toContain("리포트");
    await waitFor(() => expect(screen.getByRole("row", { name: /㈜가/ })).toHaveTextContent("검증 통과"));
    expect(screen.getByRole("log")).toHaveTextContent("㈜가 · 검증 통과 · 기사 5건");
    expect(screen.queryByRole("button", { name: "중단" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
  });

  test("shows 중단 alone while streaming and aborts on click", async () => {
    let release: () => void = () => {};
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "batch_start", total: 1, stage: "full" })}\n\n`)); release = () => controller.close(); } });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "중단" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "실행" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "중단" }));
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument());
  });

  test("surfaces a 409 as a message instead of a stepper", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ message: "이미 실행 중입니다 · 3개사" }, { status: 409 }));
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("이미 실행 중입니다 · 3개사"));
  });
});
```
```tsx
// src/components/layout/batch-indicator.test.tsx
import { act, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BatchIndicator } from "@/components/layout/batch-indicator";

describe("BatchIndicator", () => {
  test("shows the running batch and hides once the status says none", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ batch: { stage: "full", total: 4, done: 1, startedAt: "x", current: "㈜나" } }))
      .mockResolvedValueOnce(Response.json({ batch: null }));
    render(<BatchIndicator initial={{ stage: "full", total: 4, done: 0, startedAt: "x", current: null }} fetchImpl={fetchImpl as unknown as typeof fetch} intervalMs={1000} />);
    expect(screen.getByRole("status")).toHaveTextContent("4개사 분석 중 · 0/4");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByRole("status")).toHaveTextContent("4개사 분석 중 · 1/4");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  test("renders nothing when idle but still polls once", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ batch: null }));
    render(<BatchIndicator initial={null} fetchImpl={fetchImpl as unknown as typeof fetch} intervalMs={1000} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchImpl).toHaveBeenCalledWith("/api/analyze/status", expect.anything());
    vi.useRealTimers();
  });
});
```
app-shell 테스트에 한 줄: `render(<AppShell batch={{ stage: "full", total: 2, done: 0, startedAt: "x", current: null }}>본문</AppShell>)` 후 `within(screen.getByRole("banner")).getByRole("status")` 가 `"2개사 분석 중"` 을 담는다. `AppShell` 은 `batch?: BatchStatus | null` prop 을 받고(기본 `null`), `layout.tsx` 가 `readBatch()` 를 넘긴다 — layout 은 서버 컴포넌트라 직접 읽을 수 있다.

company-bulk-form 테스트에 한 줄: `notice="2건 등록"` 과 `runHref="/companies?year=2026&run=5,6"` 를 주면 `getByRole("link", { name: "지금 분석 실행" })` 의 href 가 그 값이다. `register` 액션은 `createCompanies` 가 돌려주는 생성 id 를 `run=` 으로 붙여 리다이렉트한다 — `createCompanies` 가 id 를 돌려주도록 `createdIds: number[]` 를 반환에 추가한다(기존 테스트 `companyRepository.test.ts` 의 `toEqual({created, skipped})` 가 있으면 `toMatchObject` 로 바꾼다).

- [ ] **Step 2: Run → fails**
- [ ] **Step 3: Implement BatchIndicator**
```tsx
// src/components/layout/batch-indicator.tsx
"use client";

import { useEffect, useState } from "react";
import type { BatchStatus } from "@/lib/services/batchRegistry";

/**
 * 상단 밴드의 진행 배지 — 배치가 도는 동안만 보이고, 주기적으로 상태를 읽어 끝나면 사라진다.
 * 다른 탭에서 시작한 배치도 잡아야 하므로 초기값이 없어도 한 번은 묻는다.
 */
export function BatchIndicator({ initial, fetchImpl = fetch, intervalMs = 5000 }: { initial: BatchStatus | null; fetchImpl?: typeof fetch; intervalMs?: number }) {
  const [batch, setBatch] = useState<BatchStatus | null>(initial);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const response = await fetchImpl("/api/analyze/status", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { batch: BatchStatus | null };
        if (alive) setBatch(body.batch);
      } catch {
        /* 네트워크 오류는 다음 주기에 다시 본다 */
      }
    };
    const timer = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(timer); };
  }, [fetchImpl, intervalMs]);

  if (!batch) return null;
  return (
    <span role="status" className="ml-auto flex items-center gap-2 border border-primary bg-primary/15 px-2.5 py-1 text-[11.5px] font-bold text-band-foreground">
      <span aria-hidden className="h-2 w-2 animate-pulse bg-primary" />
      {batch.total}개사 분석 중 · {batch.done}/{batch.total}
      {batch.current ? <span className="font-medium text-band-foreground/70">{batch.current}</span> : null}
    </span>
  );
}
```
`/* */` 주석은 CLAUDE.md 규칙(줄 주석 금지)에 걸린다 — catch 블록은 비워 두고 위 JSDoc 에 이유를 적는다.

- [ ] **Step 4: Implement BatchRunner** (`"use client"`). 상태: `selected: Set<number>`, `stage`, `startDate`, `endDate`, `limit`, `force`, `naver`, `google`, `busy`, `error`, `state: BatchState`, `running: useRef<AbortController>`. `run()` 은 단일 러너와 같은 fetch/SSE 루프이되 `reduceBatch` 를 쓴다. 완료 시 `router.refresh()`. 렌더:
  - 설정 폼 `<fieldset disabled={busy}>`: 빠른 선택 버튼 3(`signal-outline`, `size="sm"`) · 기업 체크 목록(`grid grid-cols-3`, 각 `<label><input type="checkbox" aria-label={name}/>…</label>`, 미확보는 이름 옆 review 색 "미확보", 검증됨은 muted "검증됨") · 단계 라디오 3(`name="stage"`, 라벨 문구 상수) · 시작일·종료일 `<Input type="date">` · `<select aria-label="기사 상한">` 10/20/50/100 · `<label><input type="checkbox"/>재실행 허용</label>` · 수집원 `<label><input type="checkbox"/>네이버</label><label>…구글 RSS</label>`
  - 액션 줄: busy 면 `<Button variant="signal" onClick={abort}>중단</Button>` 만, 아니면 `<Button variant="signal" disabled={selected.size === 0}>실행</Button>` + `"{n}개사 선택"`. 오류는 `<p role="alert">`.
  - `state.phase !== "idle"` 이면: 스테퍼 `<ol aria-label="파이프라인 단계" className="grid grid-cols-4">` — 각 `<li>` 에 `STEP_LABEL[key]` 와 그 단계에 있는 기업 수(`companies.filter(c => stepOf(c) === key).length`), 현재 단계가 있으면 `border-t-4 border-primary`, 완료면 `border-ink`, 대기면 `border-hairline`. 기업별 표 `<table>`: 이름 · 단계(`STEP_LABEL[stepOf(c)] ?? "대기"`) · 진행(`run.current/run.total` 또는 "—") · 상태(`STATUS_TEXT` 는 batchProgress 에서 export 해 재사용) · 메시지. 로그 `<ul role="log">` (warn 은 review 색, error 는 risk 색). 마지막에 `done/total · 중단 여부`.
- [ ] **Step 5: Wire** — `AppShell({ children, batch = null })` 밴드 안 워드마크 오른쪽에 `<BatchIndicator initial={batch} />`; `layout.tsx` 에서 `import { readBatch } from "@/lib/services/batchRegistry"` 후 `<AppShell batch={readBatch()}>`. `/companies` 페이지: `run` 파라미터(`"5,6"`) 를 숫자 배열로 파싱해 `preselected` 로, 후보는 `cards` 에서 `{ id, name, verified: trust === "verified" || trust === "needs_review", hasWarning: events30d.notice + events30d.alert > 0, businessNo }` 로 만든다. 헤더 아래·목록 위에 `<Panel index="01" title="일괄 분석 실행" tag="실측"><BatchRunner …/></Panel>`, 목록은 `<Panel index="02" title="기업 목록" tag="실측">` 로 감싼다. `register` 액션: `const { created, skipped, createdIds } = …; redirect(\`/companies?year=${targetYear}&notice=…&run=${createdIds.join(",")}\`)`; `RegisterDialog` → `CompanyBulkForm` 에 `runHref` 를 넘기고, 폼은 notice 아래 `<a href={runHref}>지금 분석 실행</a>` 를 그린다(`runHref` 가 있을 때만).
- [ ] **Step 6: Run all four test files, then** `npx vitest run && npm run lint && npm run build`
- [ ] **Step 7: Commit** `feat: batch analysis runner with pipeline stepper, header progress badge and run-after-register`

---

### Task 6: 문서

- [ ] 브리프 §4-B [일괄 분석 실행] 항목 끝에 "구현 2026-08-30 — 옵션: 대상(다중+빠른 선택 3)·단계 3·기간·기사 상한·재실행·수집원 2 / 헤더 배지 / 등록 직후 실행" 한 줄. CLAUDE.md §프로젝트 "분석 실행 UI(배치 스크립트)" → "분석 실행 UI(일괄 실행 화면 + 배치 스크립트)". 로드맵 Task 목록에 "Task C 일괄 분석 실행 — 완료 2026-08-30, 플랜 `2026-08-30-batch-runner.md`" 추가.
- [ ] Commit `docs: record the batch runner as done`
