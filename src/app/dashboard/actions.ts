"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { reviewEvent } from "@/lib/repositories/eventRepository";
import { buildReviewItems, type ReviewSummary } from "@/lib/repositories/reviewItems";
import { currentUserId } from "@/lib/services/currentUserId";

export type BulkResult = { ok: true; done: number } | { ok: false; message: string };
export type LoadReviewResult = { ok: true; summary: ReviewSummary | null } | { ok: false; message: string };

const BULK_NOTE = "일괄 검토 완료";
const OPENED_NOTE = `${BULK_NOTE} · 근거 열람`;
const UNOPENED_NOTE = `${BULK_NOTE} · 근거 미열람`;

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
 * 동명 충돌 사건은 제외한다 — 확인 처리하면 충돌 해소 시 자동 정리 경로에서 영영 빠진다.
 */
export async function confirmCompanyEventsAction(companyIds: number[]): Promise<BulkResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  const events = await prisma.event.findMany({
    where: { companyId: { in: companyIds }, severity: { in: ["alert", "notice"] }, status: "open", kind: { not: "source_conflict" } },
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
 * 여러 기업의 미검토 검증을 검토 완료로 기록한다 — 기업별로 최신 분석 실행 하나만 본다.
 * `opened` 는 근거를 실제로 펼쳐 본 기업이다. 메모에 열람 여부를 남겨야 나중에 이 기록을 믿을 수 있다.
 */
export async function markVerificationsReviewedAction(companyIds: number[], opened: number[] = []): Promise<BulkResult> {
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
      data: { reviewedAt: new Date(), reviewedBy: userId, reviewNote: opened.includes(run.companyId) ? OPENED_NOTE : UNOPENED_NOTE },
    });
    done += 1;
  }
  revalidatePath("/dashboard");
  return { ok: true, done };
}
