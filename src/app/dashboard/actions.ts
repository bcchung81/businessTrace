"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { reviewEvent } from "@/lib/repositories/eventRepository";
import type { ReviewAction } from "@/lib/services/eventReview";

/**
 * 사건 행의 [확인]/[조치완료]/[되돌리기] — 세션 사용자를 기록하고 호출 화면을 다시 그린다.
 */
export async function reviewEventAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const id = Number(formData.get("id"));
  const action = String(formData.get("action")) as ReviewAction;
  const note = formData.get("note");
  await reviewEvent(id, action, typeof note === "string" && note.trim() ? note.trim() : null, Number(session.user.id));
  revalidatePath(String(formData.get("path") ?? "/dashboard"));
}
