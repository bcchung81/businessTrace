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
