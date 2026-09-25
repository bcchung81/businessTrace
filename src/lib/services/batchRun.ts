import { advanceBatch, finishBatch, startBatch, type BatchStage } from "@/lib/services/batchRegistry";
import { runCompanyAnalysis, type PipelineDeps, type PipelineEvent, type PipelineOutcome } from "@/lib/services/analysisPipeline";
import { NewsRateLimitError, type CollectResult } from "@/lib/services/newsCollector";
import { logEvent } from "@/lib/services/logger";

export type BatchTarget = { id: number; name: string; year: number; businessNo: string | null; verified: boolean; aliases: string | null };
export type BatchOptions = {
  stage: BatchStage;
  startDate?: string;
  endDate?: string;
  limit: number;
  force: boolean;
  naver: boolean;
  google: boolean;
  /** 동시에 돌릴 기업 수. 없으면 1 — 한 기업의 수집 대기와 다른 기업의 LLM 대기를 겹칠 때 올린다. */
  concurrency?: number;
};
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
  collect: (options: { query: string; aliases: string | null; startDate?: string; endDate?: string; limit: number; naver: boolean; google: boolean }) => Promise<CollectResult>;
  collectOnly: (input: { companyId: number; userId: number; news: CollectResult["items"]; duplicatesRemoved: number }) => Promise<unknown>;
  refreshSources: (company: BatchTarget) => Promise<unknown>;
  /** 첫 기업 전에 한 번 도는 준비 작업 — 20MB corpCode zip 같은 것. 요청 안에서 돌면 프록시 타임아웃과 겹친다. */
  prepare?: () => Promise<unknown>;
  isOpen?: () => boolean;
};

type StepTiming = { collectMs: number | null; pipelineMs: number | null };
type Step = { done: Extract<BatchEvent, { type: "company_done" }>; timing: StepTiming; rateLimited?: boolean };
type Emit = (event: BatchEvent) => void;

/**
 * 비동기 작업 하나를 재고 걸린 밀리초를 기록한다. 던져도 기록은 남긴다 — 느리게 실패한 단계가 가장 궁금한 단계다.
 */
async function timed<T>(record: (ms: number) => void, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    record(Math.round(performance.now() - started));
  }
}

/**
 * 한 기업의 한 단계가 던졌을 때 그 기업만 실패로 닫는다.
 * 감싸지 않으면 17번째 기업의 data.go.kr 500 하나가 남은 39개사를 시도조차 못 하게 만든다.
 */
function failed(target: BatchTarget, step: string, caught: unknown, done: (status: CompanyStatus, extra?: { message?: string; articles?: number }) => Step): Step {
  const message = caught instanceof Error ? caught.message : `${step} 실패`;
  logEvent("error", "batch.company_failed", { companyId: target.id, name: target.name, step, message });
  return done("failed", { message });
}

async function runOne(target: BatchTarget, options: BatchOptions, deps: BatchDeps, open: () => boolean, emit: Emit): Promise<Step> {
  const timing: StepTiming = { collectMs: null, pipelineMs: null };
  const toPipeline = (ms: number) => void (timing.pipelineMs = ms);
  const done = (status: CompanyStatus, extra: { message?: string; articles?: number } = {}): Step => ({
    done: { type: "company_done", companyId: target.id, status, ...extra },
    timing,
  });

  if (options.stage === "sources") {
    try {
      await timed(toPipeline, () => deps.refreshSources(target));
    } catch (caught) {
      return failed(target, "sources", caught, done);
    }
    return done("sources_done");
  }
  if (target.verified && !options.force && options.stage === "full") return done("skipped", { message: "이미 검증됨" });

  let collected: CollectResult;
  try {
    collected = await timed(
      (ms) => void (timing.collectMs = ms),
      () =>
        deps.collect({
          query: target.name,
          aliases: target.aliases,
          startDate: options.startDate,
          endDate: options.endDate,
          limit: options.limit,
          naver: options.naver,
          google: options.google,
        }),
    );
  } catch (caught) {
    if (caught instanceof NewsRateLimitError) return { ...done("rate_limited", { message: caught.message }), rateLimited: true };
    return done("failed", { message: caught instanceof Error ? caught.message : "수집 실패" });
  }
  if (options.stage === "news") {
    try {
      await timed(toPipeline, () =>
        deps.collectOnly({ companyId: target.id, userId: deps.userId, news: collected.items, duplicatesRemoved: collected.duplicatesRemoved }),
      );
    } catch (caught) {
      return failed(target, "store", caught, done);
    }
    return done("collected", { articles: collected.items.length });
  }
  const outcome = await timed(toPipeline, () =>
    runCompanyAnalysis(
      { company: { id: target.id, name: target.name }, userId: deps.userId, news: collected.items, duplicatesRemoved: collected.duplicatesRemoved },
      { ...deps.pipeline, onEvent: (event) => emit({ type: "company_event", companyId: target.id, event }), isOpen: open },
    ),
  );
  return done(outcome.status, { articles: collected.items.length, ...(outcome.message ? { message: outcome.message } : {}) });
}

/**
 * 한 기업을 돌리고 단계별 소요를 `batch.company_timing` 로그로 남긴다.
 */
async function runTimed(target: BatchTarget, options: BatchOptions, deps: BatchDeps, open: () => boolean, emit: Emit): Promise<Step> {
  const started = performance.now();
  const step = await runOne(target, options, deps, open, emit);
  logEvent("info", "batch.company_timing", {
    companyId: target.id,
    name: target.name,
    stage: options.stage,
    status: step.done.status,
    ...step.timing,
    totalMs: Math.round(performance.now() - started),
  });
  return step;
}

/**
 * 여러 생산자가 밀어 넣은 이벤트를 한 소비자가 도착 순서대로 꺼낸다. 닫힌 뒤 남은 것까지 비우고 끝난다.
 */
function eventChannel<T>() {
  const buffer: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  const notify = () => {
    wake?.();
    wake = null;
  };
  return {
    push(item: T) {
      buffer.push(item);
      notify();
    },
    close() {
      closed = true;
      notify();
    },
    async *drain(): AsyncGenerator<T> {
      while (true) {
        if (buffer.length > 0) {
          yield buffer.shift() as T;
          continue;
        }
        if (closed) return;
        await new Promise<void>((resolve) => (wake = resolve));
      }
    },
  };
}

/**
 * 기업을 `concurrency` 개씩 겹쳐 돌리고, 기업별 이벤트를 생기는 즉시 흘린다(화면 리듀서는 companyId 로 합친다).
 * 레이트리밋이 나면 새 기업을 시작하지 않고 남은 기업을 중단으로 닫는다 — 한도는 계정 단위라 다음 기업도 실패한다.
 * 연결이 끊기면 진행 중인 기업까지만 마친다. `done` 은 실제로 돌린 기업만 센다 — 중단된 기업을 세면 「완료 56/56」이 거짓이 된다.
 */
export async function* runBatch(targets: BatchTarget[], options: BatchOptions, deps: BatchDeps): AsyncGenerator<BatchEvent> {
  startBatch({ stage: options.stage, total: targets.length });
  logEvent("info", "batch.start", { stage: options.stage, total: targets.length, userId: deps.userId, concurrency: options.concurrency ?? 1 });
  const open = () => deps.isOpen?.() ?? true;
  const channel = eventChannel<BatchEvent>();
  const inFlight = new Map<number, string>();
  const currentNames = () => [...inFlight.values()].join(" · ") || null;
  let done = 0;
  let aborted = false;
  let rateLimited = false;
  let cursor = 0;
  try {
    yield { type: "batch_start", total: targets.length, stage: options.stage };
    try {
      await deps.prepare?.();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "준비 단계 실패";
      logEvent("error", "batch.prepare_failed", { stage: options.stage, message });
      yield { type: "batch_done", done: 0, total: targets.length, aborted: true };
      return;
    }

    const worker = async () => {
      while (cursor < targets.length) {
        if (!open()) {
          aborted = true;
          return;
        }
        const index = cursor;
        cursor += 1;
        const target = targets[index];
        if (rateLimited) {
          channel.push({ type: "company_done", companyId: target.id, status: "aborted", message: "레이트리밋으로 중단" });
          continue;
        }
        inFlight.set(target.id, target.name);
        advanceBatch({ current: currentNames() });
        channel.push({ type: "company_start", companyId: target.id, name: target.name, index });
        const step = await runTimed(target, options, deps, open, channel.push);
        channel.push(step.done);
        inFlight.delete(target.id);
        done += 1;
        advanceBatch({ done, current: currentNames() });
        if (step.rateLimited) {
          rateLimited = true;
          aborted = true;
        }
      }
    };
    const width = Math.max(1, Math.min(options.concurrency ?? 1, targets.length));
    const workers = Promise.all(Array.from({ length: width }, worker)).finally(channel.close);
    yield* channel.drain();
    await workers;

    logEvent("info", "batch.done", { stage: options.stage, done, total: targets.length, aborted });
    yield { type: "batch_done", done, total: targets.length, aborted };
  } finally {
    finishBatch();
  }
}
