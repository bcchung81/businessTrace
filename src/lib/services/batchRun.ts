import { advanceBatch, finishBatch, startBatch, type BatchStage } from "@/lib/services/batchRegistry";
import { runCompanyAnalysis, type PipelineDeps, type PipelineEvent, type PipelineOutcome } from "@/lib/services/analysisPipeline";
import { NewsRateLimitError, type CollectResult } from "@/lib/services/newsCollector";

export type BatchTarget = { id: number; name: string; year: number; businessNo: string | null; verified: boolean; aliases: string | null };
export type BatchOptions = {
  stage: BatchStage;
  startDate?: string;
  endDate?: string;
  limit: number;
  force: boolean;
  naver: boolean;
  google: boolean;
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
    collected = await deps.collect({
      query: target.name,
      aliases: target.aliases,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: options.limit,
      naver: options.naver,
      google: options.google,
    });
  } catch (caught) {
    if (caught instanceof NewsRateLimitError) return { ...done("rate_limited", { message: caught.message }), rateLimited: true };
    return done("failed", { message: caught instanceof Error ? caught.message : "수집 실패" });
  }
  if (options.stage === "news") {
    await deps.collectOnly({ companyId: target.id, userId: deps.userId, news: collected.items, duplicatesRemoved: collected.duplicatesRemoved });
    return done("collected", { articles: collected.items.length });
  }
  const outcome = await runCompanyAnalysis(
    { company: { id: target.id, name: target.name }, userId: deps.userId, news: collected.items, duplicatesRemoved: collected.duplicatesRemoved },
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
  let rateLimited = false;
  try {
    yield { type: "batch_start", total: targets.length, stage: options.stage };
    for (const [index, target] of targets.entries()) {
      if (!open()) {
        aborted = true;
        break;
      }
      if (rateLimited) {
        yield { type: "company_done", companyId: target.id, status: "aborted", message: "레이트리밋으로 중단" };
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
      if (step.rateLimited) {
        rateLimited = true;
        aborted = true;
      }
    }
    yield { type: "batch_done", done, total: targets.length, aborted };
  } finally {
    finishBatch();
  }
}
