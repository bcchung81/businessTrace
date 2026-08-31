"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { updateCompany } from "@/lib/repositories/companyRepository";
import { reviewEvent } from "@/lib/repositories/eventRepository";
import { clearSourceDecision, saveSourceDecision } from "@/lib/repositories/sourceDecision";
import { refreshSourcesFor } from "@/lib/services/refreshSources";

export type ActionResult = { ok: true } | { ok: false; message: string };

async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const id = Number(session?.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function done(companyId: number): ActionResult {
  revalidatePath(`/companies/${companyId}`);
  return { ok: true };
}

/**
 * 국민연금 동명 후보를 확정하고 바로 원천을 다시 조회한다 — 고용 규모가 이 결정 하나에 달려 있다.
 */
export async function decideNpsAction(input: { companyId: number; prefix: string; label: string }): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  await saveSourceDecision({ companyId: input.companyId, source: "nps", value: input.prefix, label: input.label, userId });
  await refreshSourcesFor(input.companyId);
  return done(input.companyId);
}

export async function holdNpsAction(input: { companyId: number }): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  await clearSourceDecision(input.companyId, "nps");
  return done(input.companyId);
}

/**
 * DART 후보를 맞다/아니다로 정한다. "none" 은 미등록 확정이다.
 */
export async function decideDartAction(input: { companyId: number; corpCode: string; label?: string }): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  await saveSourceDecision({ companyId: input.companyId, source: "dart", value: input.corpCode, label: input.label ?? null, userId });
  await refreshSourcesFor(input.companyId);
  return done(input.companyId);
}

/**
 * 금융위 번호 불일치를 정리한다 — 맞으면 그 번호로 수용, "none" 이면 동명 타사로 배제하고 바로 재조회한다.
 */
export async function decideFscAction(input: { companyId: number; value: string; label?: string }): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  await saveSourceDecision({ companyId: input.companyId, source: "fsc", value: input.value, label: input.label ?? null, userId });
  await refreshSourcesFor(input.companyId);
  return done(input.companyId);
}

export async function reviewVerificationAction(input: { runId: number; note: string }): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  const stored = await prisma.verificationResult.update({
    where: { analysisRunId: input.runId },
    data: { reviewedAt: new Date(), reviewedBy: userId, reviewNote: input.note.trim() || null },
    include: { analysisRun: { select: { companyId: true } } },
  });
  return done(stored.analysisRun.companyId);
}

export async function confirmEventsAction(input: { companyId: number; eventIds: number[]; action: "acknowledge" | "done" }): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  for (const id of input.eventIds) await reviewEvent(id, input.action, null, userId);
  return done(input.companyId);
}

export async function saveAliasesAction(input: { companyId: number; aliases: string[] }): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  const aliases = [...new Set(input.aliases.map((alias) => alias.trim()).filter((alias) => alias.length > 0))];
  await prisma.company.update({ where: { id: input.companyId }, data: { aliases: aliases.length > 0 ? JSON.stringify(aliases) : null } });
  return done(input.companyId);
}

/**
 * 사업자번호를 10자리로 정리해 저장하고 닫혀 있던 원천(국세청·나라장터·금융위)을 바로 연다.
 */
export async function saveBusinessNoAction(input: { companyId: number; businessNo: string }): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  const digits = input.businessNo.replace(/\D/g, "");
  if (digits.length !== 10) return { ok: false, message: "사업자번호는 숫자 10자리여야 합니다." };
  const updated = await updateCompany(input.companyId, { businessNo: digits });
  if (!updated.ok) return { ok: false, message: updated.message };
  await refreshSourcesFor(input.companyId);
  return done(input.companyId);
}
