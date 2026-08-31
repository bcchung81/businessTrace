"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";
import { saveSelections } from "@/lib/repositories/selectionRecord";
import { toSelectionInputs } from "@/lib/services/awards";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";

export type ConfirmResult = { ok: true; saved: number } | { ok: false; message: string };

/**
 * 지금 화면의 산식 그대로 서버에서 다시 계산해 기간(연·반기·분기) 기록으로 동결한다 — 클라이언트 표는 믿지 않는다.
 */
export async function confirmSelectionAction(input: { year: number; rubricId: string; period: string }): Promise<ConfirmResult> {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, message: "unauthorized" };
  if (!input.period.startsWith(String(input.year))) return { ok: false, message: "기간이 평가 연도와 맞지 않습니다." };

  const book = loadRubrics();
  const forced = input.rubricId === "default" ? undefined : input.rubricId;
  const ranked = rankCompanies(await listBenchmarkInputs(input.year), book, forced);
  const saved = await saveSelections(toSelectionInputs(ranked, { year: input.year, period: input.period, formulaVersion: book.formulaVersion, decidedBy: userId }));
  revalidatePath("/ranking");
  revalidatePath("/history");
  return { ok: true, saved };
}
