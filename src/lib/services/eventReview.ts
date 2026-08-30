export type EventStatus = "open" | "acknowledged" | "done";
export type ReviewAction = "acknowledge" | "done" | "reopen" | "note";

export class InvalidTransitionError extends Error {}

export const STATUS_LABEL: Record<EventStatus, string> = { open: "미확인", acknowledged: "확인", done: "조치완료" };

const ALLOWED: Record<`${EventStatus}:${ReviewAction}`, EventStatus | undefined> = {
  "open:acknowledge": "acknowledged",
  "open:done": "done",
  "open:reopen": undefined,
  "open:note": "open",
  "acknowledged:acknowledge": undefined,
  "acknowledged:done": "done",
  "acknowledged:reopen": undefined,
  "acknowledged:note": "acknowledged",
  "done:acknowledge": undefined,
  "done:done": undefined,
  "done:reopen": "open",
  "done:note": "done",
};

/**
 * 후속 조치 상태를 앞으로만 옮긴다. 되돌리기는 조치완료 → 미확인 하나뿐이다.
 * `note` 는 상태를 바꾸지 않는다 — 메모만 저장하고 싶을 때 모든 상태에서 허용된다.
 */
export function transition(status: EventStatus, action: ReviewAction): EventStatus {
  const next = ALLOWED[`${status}:${action}`];
  if (!next) throw new InvalidTransitionError(`${status} 상태에서 ${action} 할 수 없습니다.`);
  return next;
}
