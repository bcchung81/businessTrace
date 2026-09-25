import type { BatchOptions } from "@/lib/services/batchRun";

export const SCHEDULED_JOBS = ["news", "pension", "procurement", "venture"] as const;
export type ScheduledJob = (typeof SCHEDULED_JOBS)[number];
export type NewsStage = "off" | "news" | "full";

const WINDOW_DAYS = 90;
const ARTICLE_LIMIT = 20;
const NEWS_CONCURRENCY = 2;

/**
 * systemd 가 넘긴 작업 이름을 읽는다. 오타를 조용히 넘기면 timer 는 초록불인데 아무것도 돌지 않는다.
 */
export function parseJob(raw: string | undefined): ScheduledJob {
  const job = (raw ?? "").trim().toLowerCase();
  if ((SCHEDULED_JOBS as readonly string[]).includes(job)) return job as ScheduledJob;
  throw new Error(`알 수 없는 정기 작업입니다: ${raw} (${SCHEDULED_JOBS.join("|")})`);
}

/**
 * 야간 뉴스 작업이 어디까지 돌지 정한다. 기본은 수집만 — 기본 분석기가 llm 인 동안 LLM 비용을 매일 쓰지 않는다.
 */
export function resolveNewsStage(env: Record<string, string | undefined> = process.env): NewsStage {
  const raw = (env.SCHEDULE_NEWS_STAGE ?? "news").trim().toLowerCase();
  if (raw === "off" || raw === "news" || raw === "full") return raw;
  throw new Error(`알 수 없는 SCHEDULE_NEWS_STAGE 입니다: ${env.SCHEDULE_NEWS_STAGE} (off|news|full)`);
}

/**
 * 뉴스 작업은 웹 배치와 같은 잠금을 쓴다 — 같은 기업을 두 곳에서 동시에 수집·분석하면 레이트리밋과 실행 기록이 엉킨다.
 */
export function lockNameFor(job: ScheduledJob): string {
  return job === "news" ? "batch" : job;
}

/**
 * 수집 작업을 이미 검증된 스크립트 호출로 옮긴다. 연금 스크립트만 연도를 받아 평가연도마다 한 번씩 돈다.
 */
export function collectCommands(job: ScheduledJob, years: number[]): string[][] {
  if (job === "pension") return years.map((year) => ["scripts/collect-pension.ts", String(year)]);
  if (job === "procurement") return [["scripts/collect-procurement.ts", "12"]];
  if (job === "venture") return [["scripts/collect-venture.ts"]];
  return [];
}

/**
 * 배치 화면의 기본값(최근 90일·기사 20건)으로 돈다. full 이면 검증된 기업도 다시 분석한다 — 아니면 전부 건너뛴다.
 */
export function newsBatchOptions(stage: Exclude<NewsStage, "off">, now = new Date()): BatchOptions {
  return {
    stage,
    startDate: new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10),
    limit: ARTICLE_LIMIT,
    force: stage === "full",
    naver: true,
    google: true,
    concurrency: NEWS_CONCURRENCY,
  };
}
