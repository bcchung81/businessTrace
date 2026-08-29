import type { AnalysisStats, AnalyzeStep, NewsAnalysis } from "@/lib/services/analyzer";
import type { VerificationOutput } from "@/lib/services/verification";

export type RunPhase = "idle" | "analyzing" | "verifying" | "done" | "failed";

export type LogEntry = { level: "info" | "warn" | "error"; text: string };

export type RunState = {
  phase: RunPhase;
  runId: number | null;
  collected: { duplicatesRemoved: number; primaryCount: number } | null;
  step: AnalyzeStep | null;
  current: number;
  total: number;
  analyses: NewsAnalysis[];
  stats: AnalysisStats | null;
  opinion: string | null;
  verification: VerificationOutput | null;
  message: string | null;
  log: LogEntry[];
};

export const INITIAL_RUN: RunState = {
  phase: "idle",
  runId: null,
  collected: null,
  step: null,
  current: 0,
  total: 0,
  analyses: [],
  stats: null,
  opinion: null,
  verification: null,
  message: null,
  log: [],
};

type Event = Record<string, unknown> & { type?: string };

function log(state: RunState, ...entries: LogEntry[]): LogEntry[] {
  return [...state.log, ...entries];
}

/**
 * SSE 이벤트 하나를 진행 상태에 접는다.
 * 검증 실패는 판정을 비워 둔 채 끝낸다 - 검사에 실패한 것을 통과로 읽으면 안 된다.
 */
export function reduceAnalysis(state: RunState, raw: unknown): RunState {
  if (!raw || typeof raw !== "object") return state;
  const event = raw as Event;

  switch (event.type) {
    case "collected": {
      const errors = Array.isArray(event.errors) ? (event.errors as string[]) : [];
      const entries: LogEntry[] = [
        { level: "info", text: `수집 완료 · 중복 ${Number(event.duplicatesRemoved ?? 0)}건 제거` },
        ...errors.map((text): LogEntry => ({ level: "warn", text })),
      ];
      if (event.noNews) entries.push({ level: "warn", text: "수집된 기사가 없습니다." });

      return {
        ...state,
        phase: "analyzing",
        runId: Number(event.runId),
        collected: {
          duplicatesRemoved: Number(event.duplicatesRemoved ?? 0),
          primaryCount: Number(event.primaryCount ?? 0),
        },
        log: log(state, ...entries),
      };
    }

    case "progress":
      return {
        ...state,
        step: event.step as AnalyzeStep,
        current: Number(event.current ?? 0),
        total: Number(event.total ?? 0),
      };

    case "news_done":
      return { ...state, analyses: [...state.analyses, event.analysis as NewsAnalysis] };

    case "complete": {
      const result = event.result as { stats?: AnalysisStats; comprehensiveOpinion?: string };
      return {
        ...state,
        runId: Number(event.runId ?? state.runId),
        stats: result?.stats ?? null,
        opinion: result?.comprehensiveOpinion ?? null,
        log: log(state, { level: "info", text: "분석 완료 · 검증을 시작합니다." }),
      };
    }

    case "verifying":
      return { ...state, phase: "verifying" };

    case "verified": {
      const verification = event.verification as VerificationOutput;
      return {
        ...state,
        phase: "done",
        verification,
        log: log(state, { level: "info", text: `검증 판정 ${verification?.status ?? "미상"}` }),
      };
    }

    case "verification_failed":
      return {
        ...state,
        phase: "done",
        verification: null,
        message: `검증 실패 — ${String(event.message ?? "사유 없음")}`,
        log: log(state, { level: "warn", text: `검증 실패 — ${String(event.message ?? "사유 없음")}` }),
      };

    case "error":
      return {
        ...state,
        phase: "failed",
        message: String(event.message ?? "알 수 없는 오류"),
        log: log(state, { level: "error", text: String(event.message ?? "알 수 없는 오류") }),
      };

    default:
      return state;
  }
}
