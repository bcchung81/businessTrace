"use client";

import type { ReactNode } from "react";
import { reviewEventAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import type { EventStatus, ReviewAction } from "@/lib/services/eventReview";

/**
 * 상태에 맞는 전이 버튼만 보인다. 미확인 → 확인·조치완료, 확인 → 조치완료, 조치완료 → 되돌리기.
 * `allowReopen` 이 false 면 조치완료 행은 아무 버튼도 내지 않는다 — 되돌리기는 상세 타임라인 전용이다.
 * `children` 은 버튼 위 같은 `form` 안에 놓인다 — 메모 입력처럼 전이와 함께 저장돼야 하는 필드용이다.
 */
export function EventReviewButtons({
  id,
  status,
  path,
  allowReopen = true,
  children,
}: {
  id: number;
  status: EventStatus;
  path: string;
  allowReopen?: boolean;
  children?: ReactNode;
}) {
  const actions: Array<[ReviewAction, string]> =
    status === "open"
      ? [["acknowledge", "확인"], ["done", "조치완료"]]
      : status === "acknowledged"
        ? [["done", "조치완료"]]
        : allowReopen
          ? [["reopen", "되돌리기"]]
          : [];

  if (actions.length === 0 && !children) return null;

  return (
    <form action={reviewEventAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="path" value={path} />
      {children}
      {actions.length > 0 ? (
        <div className="flex gap-1">
          {actions.map(([action, label]) => (
            <Button key={action} type="submit" name="action" value={action} variant="hard-outline" size="xs">
              {label}
            </Button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
