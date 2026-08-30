"use client";

import { reviewEventAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import type { EventStatus, ReviewAction } from "@/lib/services/eventReview";

/**
 * 상태에 맞는 전이 버튼만 보인다. 미확인 → 확인·조치완료, 확인 → 조치완료, 조치완료 → 되돌리기.
 * `allowReopen` 이 false 면 조치완료 행은 아무 버튼도 내지 않는다 — 되돌리기는 상세 타임라인 전용이다.
 */
export function EventReviewButtons({
  id,
  status,
  path,
  allowReopen = true,
}: {
  id: number;
  status: EventStatus;
  path: string;
  allowReopen?: boolean;
}) {
  const actions: Array<[ReviewAction, string]> =
    status === "open"
      ? [["acknowledge", "확인"], ["done", "조치완료"]]
      : status === "acknowledged"
        ? [["done", "조치완료"]]
        : allowReopen
          ? [["reopen", "되돌리기"]]
          : [];

  if (actions.length === 0) return null;

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
