"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueueJudgments, findJudgmentsByLink, saveJudgment, type JudgmentAnswer } from "@/lib/repositories/articleJudgment";
import type { AnalysisResult } from "@/lib/services/analyzer";
import { currentUserId } from "@/lib/services/currentUserId";
import { judgmentPatchSchema, manualEnqueueRow, toJudgmentView, type JudgmentView } from "@/lib/services/judgments";

type Failure = { ok: false; message: string };

const saveSchema = judgmentPatchSchema.extend({ id: z.number().int().positive() });

function revalidate(companyId: number) {
  revalidatePath("/judgments");
  revalidatePath(`/companies/${companyId}`);
}

/**
 * 판정 한 건의 준 필드만 저장하고, 주제 판정이 있으면 그때 분석기의 답을 함께 돌려준다.
 * 판정 화면은 다시 그리지 않는다 — 응답이 저장된 행을 싣고, 반영 대기는 화면이 주제 판정 때만 새로 읽는다.
 */
export async function saveJudgmentAction(input: { id: number } & Partial<JudgmentAnswer>): Promise<{ ok: true; judgment: JudgmentView } | Failure> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "판정 값이 올바르지 않습니다." };

  const { id, ...patch } = parsed.data;
  const exists = await prisma.articleJudgment.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { ok: false, message: "판정할 기사를 찾지 못했습니다." };

  const row = await saveJudgment(id, patch, userId);
  revalidatePath(`/companies/${row.companyId}`);
  return { ok: true, judgment: toJudgmentView(row) };
}

function analysesOf(resultJson: string | null): AnalysisResult["analyses"] {
  if (!resultJson) return [];
  try {
    return (JSON.parse(resultJson) as Partial<AnalysisResult>).analyses ?? [];
  } catch {
    return [];
  }
}

/**
 * 기업 상세에서 고른 기사를 판정 대기열에 올린다. 그 기업의 실행에 실제로 있던 기사만 받는다 — 스냅샷과 분석기 답을 그 실행에서 가져온다.
 */
export async function queueArticleAction(input: { companyId: number; runId: number; link: string }): Promise<{ ok: true; id: number } | Failure> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "unauthorized" };

  const run = await prisma.analysisRun.findFirst({ where: { id: input.runId, companyId: input.companyId }, select: { id: true, formulaVersion: true, resultJson: true } });
  const analysis = run ? analysesOf(run.resultJson).find((entry) => entry.news.link === input.link) : undefined;
  if (!run || !analysis) return { ok: false, message: "그 실행에서 기사를 찾지 못했습니다." };

  await enqueueJudgments([manualEnqueueRow({ companyId: input.companyId, runId: run.id, formulaVersion: run.formulaVersion, analysis })]);
  const queued = (await findJudgmentsByLink(input.companyId)).get(input.link);
  if (!queued) return { ok: false, message: "대기열에 올리지 못했습니다." };
  revalidate(input.companyId);
  return { ok: true, id: queued.id };
}
