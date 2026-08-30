"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { reviewEvent } from "@/lib/repositories/eventRepository";
import type { ReviewAction } from "@/lib/services/eventReview";

/**
 * 사건 행의 [확인]/[조치완료]/[되돌리기]/[메모 저장] — 세션 사용자를 기록하고 호출 화면을 다시 그린다.
 * 메모 필드가 아예 없으면 `null`(기존 메모 유지), 빈 채로 제출되면 `""`(메모 지움)을 넘긴다.
 */
export async function reviewEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const id = Number(formData.get("id"));
  const action = String(formData.get("action")) as ReviewAction;
  const noteField = formData.get("note");
  const note = typeof noteField === "string" ? noteField.trim() : null;
  await reviewEvent(id, action, note, Number(session.user.id));
  revalidatePath(String(formData.get("path") ?? "/dashboard"));
}
