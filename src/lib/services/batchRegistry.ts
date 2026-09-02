export type BatchStage = "full" | "news" | "sources";
export type BatchStatus = { stage: BatchStage; total: number; done: number; startedAt: string; current: string | null; aborting: boolean };

type Listener = (event: unknown | null) => void;

export const RECENT_BATCH_MS = 30 * 60_000;

let active: BatchStatus | null = null;
let events: unknown[] = [];
let streamOpen = false;
let closedAt: number | null = null;
const listeners = new Set<Listener>();

/**
 * 진행 중 배치를 프로세스 메모리에 하나만 둔다. 관리자 한 명이 쓰는 도구라 인스턴스 간 공유는 하지 않는다.
 * 시작하면 이전 배치의 이벤트 버퍼를 비운다 — 재접속 화면이 옛 결과를 새 실행으로 오해하면 안 된다.
 */
export function startBatch(input: { stage: BatchStage; total: number; now?: Date }): BatchStatus {
  if (active) throw new Error("already_running");
  active = { stage: input.stage, total: input.total, done: 0, startedAt: (input.now ?? new Date()).toISOString(), current: null, aborting: false };
  events = [];
  streamOpen = true;
  closedAt = null;
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

/**
 * 리스너 하나가 던져도 나머지와 버퍼는 그대로 둔다 — 끊긴 화면 하나가 배치를 죽이면 안 된다.
 */
function deliver(listener: Listener, event: unknown | null): boolean {
  try {
    listener(event);
    return true;
  } catch {
    listeners.delete(listener);
    return false;
  }
}

/**
 * 이벤트를 버퍼에 쌓고 구독자에게 바로 넘긴다. 버퍼는 늦게 붙은 화면이 처음부터 다시 그리는 데 쓴다.
 */
export function publishBatchEvent(event: unknown): void {
  events.push(event);
  for (const listener of [...listeners]) deliver(listener, event);
}

/**
 * 스트림 끝을 알린다 — 구독자는 null 을 받고 연결을 닫는다. 버퍼는 다음 startBatch 까지 남는다.
 */
export function closeBatchStream(): void {
  streamOpen = false;
  closedAt = Date.now();
  for (const listener of [...listeners]) deliver(listener, null);
  listeners.clear();
}

export function subscribeBatch(listener: Listener): () => void {
  for (const event of events) {
    if (!deliver(listener, event)) return () => {};
  }
  if (!streamOpen) {
    deliver(listener, null);
    return () => {};
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 마감 패널을 다시 열지 판단한다.
 * 스트림이 열려 있으면 버퍼 유무를 그대로 쓰고, 닫힌 지 30분이 지난 결과는 방문마다 재생되지 않도록 거짓을 돌려준다.
 */
export function hasBatchEvents(now: Date = new Date()): boolean {
  if (streamOpen) return events.length > 0;
  if (closedAt !== null && now.getTime() - closedAt > RECENT_BATCH_MS) return false;
  return events.length > 0;
}

export function requestAbort(): boolean {
  if (!active) return false;
  active = { ...active, aborting: true };
  return true;
}

export function abortRequested(): boolean {
  return active?.aborting ?? false;
}
