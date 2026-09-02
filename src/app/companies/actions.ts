"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/app/companies/[id]/actions";
import { updateCompany } from "@/lib/repositories/companyRepository";
import { refreshSourcesFor } from "@/lib/services/refreshSources";

async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const id = Number(session?.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function revalidate(companyId: number) {
  revalidatePath("/companies");
  revalidatePath(`/companies/${companyId}`);
}

/**
 * 이름·업종·사업자번호·검색 별칭을 한 번에 고친다.
 * 사업자번호가 새 값으로 바뀌었을 때만 원천을 재조회한다 — 닫혀 있던 국세청·나라장터·금융위가 이 번호로 열린다.
 */
export async function editCompanyAction(input: { companyId: number; name: string; industry: string; businessNo: string; aliases: string[] }): Promise<ActionResult> {
  if (!(await currentUserId())) return { ok: false, message: "unauthorized" };
  const before = await prisma.company.findUnique({ where: { id: input.companyId }, select: { businessNo: true } });
  if (!before) return { ok: false, message: "기업을 찾을 수 없습니다." };

  const updated = await updateCompany(input.companyId, {
    name: input.name,
    industry: input.industry.trim() || null,
    businessNo: input.businessNo.trim() || null,
  });
  if (!updated.ok) return { ok: false, message: updated.message };

  const aliases = [...new Set(input.aliases.map((alias) => alias.trim()).filter((alias) => alias.length > 0))];
  await prisma.company.update({ where: { id: input.companyId }, data: { aliases: aliases.length > 0 ? JSON.stringify(aliases) : null } });

  if (updated.company.businessNo && updated.company.businessNo !== before.businessNo) await refreshSourcesFor(input.companyId);
  revalidate(input.companyId);
  return { ok: true };
}

/**
 * 분석 대상에서 빼거나 되돌린다. 행은 남는다 — AnalysisRun 이 참조한다.
 */
export async function setCompanyActiveAction(input: { companyId: number; isActive: boolean }): Promise<ActionResult> {
  if (!(await currentUserId())) return { ok: false, message: "unauthorized" };
  const updated = await updateCompany(input.companyId, { isActive: input.isActive });
  if (!updated.ok) return { ok: false, message: updated.message };
  revalidate(input.companyId);
  return { ok: true };
}
