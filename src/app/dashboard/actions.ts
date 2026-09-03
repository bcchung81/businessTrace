"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { reviewEvent } from "@/lib/repositories/eventRepository";
import { buildReviewItems, type ReviewSummary } from "@/lib/repositories/reviewItems";
import { currentUserId } from "@/lib/services/currentUserId";

export type BulkResult = { ok: true; done: number } | { ok: false; message: string };
export type LoadReviewResult = { ok: true; summary: ReviewSummary | null } | { ok: false; message: string };

const BULK_NOTE = "일괄 검토 완료";

/**
 * 기업 하나의 확인 필요 항목을 불러온다 — 팝업 오른쪽 패널용.
 */
export async function loadReviewItemsAction(companyId: number): Promise<LoadReviewResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  return { ok: true, summary: await buildReviewItems(companyId) };
}

/**
 * 여러 기업의 열린 경보·주의를 한 번에 확인 처리한다. 이미 확인된 건은 건너뛴다.
 */
export async function confirmCompanyEventsAction(companyIds: number[]): Promise<BulkResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  const events = await prisma.event.findMany({
    where: { companyId: { in: companyIds }, severity: { in: ["alert", "notice"] }, status: "open" },
    select: { id: true },
  });
  let done = 0;
  for (const event of events) {
    try {
      await reviewEvent(event.id, "acknowledge", null, userId);
      done += 1;
    } catch (caught) {
      revalidatePath("/dashboard");
      return { ok: false, message: `${done}건 처리 후 실패했습니다 — ${caught instanceof Error ? caught.message : "확인 실패"}` };
    }
  }
  revalidatePath("/dashboard");
  return { ok: true, done };
}

/**
 * 여러 기업의 미검토 검증을 검토 완료로 기록한다 — 메모에 "일괄 검토 완료" 를 남겨 나중에 구분한다.
 * 기업별로 최신 분석 실행 하나만 본다. 상세 화면의 "확인 필요" 가 보는 것과 같은 회차다.
 */
export async function markVerificationsReviewedAction(companyIds: number[]): Promise<BulkResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  const runs = await prisma.analysisRun.findMany({
    where: { companyId: { in: companyIds }, status: { not: "collected" } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, companyId: true, verification: { select: { status: true, reviewedAt: true } } },
  });
  const latest = new Map<number, (typeof runs)[number]>();
  for (const run of runs) if (!latest.has(run.companyId)) latest.set(run.companyId, run);
  let done = 0;
  for (const run of latest.values()) {
    const verification = run.verification;
    if (!verification || verification.status === "verified" || verification.reviewedAt) continue;
    await prisma.verificationResult.update({
      where: { analysisRunId: run.id },
      data: { reviewedAt: new Date(), reviewedBy: userId, reviewNote: BULK_NOTE },
    });
    done += 1;
  }
  revalidatePath("/dashboard");
  return { ok: true, done };
}
