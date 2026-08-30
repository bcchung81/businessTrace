import { INITIAL_RUN, reduceAnalysis, type LogEntry, type RunState } from "@/lib/services/analysisProgress";
import type { BatchStage } from "@/lib/services/batchRegistry";
import type { BatchEvent, CompanyStatus } from "@/lib/services/batchRun";

export type StepKey = "collect" | "analyze" | "verify" | "report";
export const STEP_ORDER: StepKey[] = ["collect", "analyze", "verify", "report"];
export const STEP_LABEL: Record<StepKey, string> = { collect: "수집", analyze: "분석", verify: "검증", report: "리포트" };

export type CompanyProgress = {
  companyId: number;
  name: string;
  index: number;
  run: RunState;
  status: CompanyStatus | null;
  message: string | null;
  articles: number | null;
};
export type BatchState = {
  phase: "idle" | "running" | "done";
  stage: BatchStage | null;
  total: number;
  done: number;
  aborted: boolean;
  companies: CompanyProgress[];
  log: LogEntry[];
};

export const INITIAL_BATCH: BatchState = { phase: "idle", stage: null, total: 0, done: 0, aborted: false, companies: [], log: [] };

export const STATUS_TEXT: Record<CompanyStatus, string> = {
  verified: "검증 통과",
  needs_review: "검토 필요",
  no_news: "기사 없음",
  verification_failed: "검증 실패",
  failed: "실패",
  aborted: "중단",
  skipped: "건너뜀",
  collected: "수집 완료",
  sources_done: "원천 대조 완료",
  rate_limited: "레이트리밋",
};

/**
 * 기업이 지금 어느 단계에 있는지 낸다 — 파이프라인 상태와 최종 상태를 스테퍼 4단으로 접는다.
 */
export function stepOf(progress: CompanyProgress): StepKey | null {
  if (progress.status === "collected") return "collect";
  if (progress.status === "skipped") return null;
  if (progress.status) return "report";
  if (progress.run.phase === "verifying") return "verify";
  if (progress.run.phase === "done") return "report";
  if (progress.run.phase === "analyzing" || progress.run.step !== null) return "analyze";
  return "collect";
}

function log(state: BatchState, level: LogEntry["level"], text: string): BatchState {
  return { ...state, log: [...state.log, { level, text }] };
}

function patch(state: BatchState, companyId: number, fn: (progress: CompanyProgress) => CompanyProgress): BatchState {
  return { ...state, companies: state.companies.map((entry) => (entry.companyId === companyId ? fn(entry) : entry)) };
}

function nameOf(state: BatchState, companyId: number) {
  return state.companies.find((entry) => entry.companyId === companyId)?.name ?? "";
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
      return {
        ...state,
        companies: [...state.companies, { companyId: event.companyId, name: event.name, index: event.index, run: INITIAL_RUN, status: null, message: null, articles: null }],
      };
    case "company_event": {
      const name = nameOf(state, event.companyId);
      const next = patch(state, event.companyId, (progress) => ({ ...progress, run: reduceAnalysis(progress.run, event.event) }));
      const inner = event.event;
      if (inner.type === "verifying") return log(next, "info", `${name} · 검증 시작`);
      if (inner.type === "verified") {
        const verdict = inner.verification.status === "verified" ? "검증 통과" : "검토 필요";
        return log(next, "info", `${name} · ${verdict} · 충실도 ${(inner.verification.faithfulness ?? 0).toFixed(2)}`);
      }
      if (inner.type === "verification_failed" || inner.type === "events_failed" || inner.type === "error") return log(next, "error", `${name} · ${inner.message}`);
      return next;
    }
    case "company_done": {
      const name = nameOf(state, event.companyId);
      const next = patch(state, event.companyId, (progress) => ({ ...progress, status: event.status, message: event.message ?? null, articles: event.articles ?? null }));
      const level: LogEntry["level"] =
        event.status === "skipped" || event.status === "aborted"
          ? "warn"
          : event.status === "failed" || event.status === "rate_limited" || event.status === "verification_failed"
            ? "error"
            : "info";
      const tail = event.message ? ` — ${event.message}` : event.articles !== undefined ? ` · 기사 ${event.articles}건` : "";
      return { ...log(next, level, `${name} · ${STATUS_TEXT[event.status]}${tail}`), done: state.done + 1 };
    }
    case "batch_done":
      return { ...state, phase: "done", done: event.done, aborted: event.aborted };
    default:
      return state;
  }
}
