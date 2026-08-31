import { prisma } from "@/lib/db";
import type { CompanyModel } from "@/generated/prisma/models";

export type CompanyResult = { ok: true; company: CompanyModel } | { ok: false; message: string };

export type CompanyInput = {
  name: string;
  year: number;
  businessNo?: string | null;
  industry?: string | null;
};

function normaliseBusinessNo(businessNo: string | null | undefined) {
  if (businessNo === undefined || businessNo === null || businessNo === "") return null;
  const digits = businessNo.replace(/\D/g, "");
  return digits.length === 10 ? digits : undefined;
}

/**
 * 분석 대상 기업을 평가연도와 함께 등록한다.
 */
export async function createCompany(input: CompanyInput): Promise<CompanyResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, message: "기업명을 입력해주세요." };

  const businessNo = normaliseBusinessNo(input.businessNo);
  if (businessNo === undefined) {
    return { ok: false, message: "사업자번호는 숫자 10자리여야 합니다." };
  }

  if (await prisma.company.findUnique({ where: { name_year: { name, year: input.year } } })) {
    return { ok: false, message: "이미 등록된 기업입니다." };
  }

  const displayOrder = await prisma.company.count({ where: { year: input.year } });
  const company = await prisma.company.create({
    data: { name, year: input.year, businessNo, industry: input.industry ?? null, displayOrder },
  });

  return { ok: true, company };
}

/**
 * 붙여넣은 기업명 목록을 한 번에 등록하고 건너뛴 항목을 알려준다.
 */
export async function createCompanies(input: { year: number; entries: Array<{ name: string; businessNo?: string | null }> }) {
  const skipped: string[] = [];
  const createdIds: number[] = [];
  let created = 0;

  for (const entry of input.entries) {
    const name = entry.name.trim();
    if (!name) continue;

    const result = await createCompany({ name, year: input.year, businessNo: entry.businessNo ?? null });
    if (result.ok) {
      created += 1;
      createdIds.push(result.company.id);
    } else skipped.push(name);
  }

  return { created, skipped, createdIds };
}

/**
 * 해당 연도의 기업을 등록 순서대로 조회한다.
 */
export async function listCompanies(options: { year: number; includeInactive?: boolean }) {
  return prisma.company.findMany({
    where: { year: options.year, ...(options.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
  });
}

/**
 * 기업이 등록된 평가연도를 최신순으로 조회한다.
 */
export async function listYears() {
  const rows = await prisma.company.findMany({
    distinct: ["year"],
    select: { year: true },
    orderBy: { year: "desc" },
  });
  return rows.map((row) => row.year);
}

/**
 * 기업 정보를 수정한다. 같은 연도 안에서 이름이 겹치면 거부한다.
 */
export async function updateCompany(
  id: number,
  patch: Partial<CompanyInput> & { isActive?: boolean },
): Promise<CompanyResult> {
  const current = await prisma.company.findUnique({ where: { id } });
  if (!current) return { ok: false, message: "기업을 찾을 수 없습니다." };

  const name = patch.name === undefined ? current.name : patch.name.trim();
  if (!name) return { ok: false, message: "기업명을 입력해주세요." };

  const year = patch.year ?? current.year;

  const businessNo =
    patch.businessNo === undefined ? current.businessNo : normaliseBusinessNo(patch.businessNo);
  if (businessNo === undefined) {
    return { ok: false, message: "사업자번호는 숫자 10자리여야 합니다." };
  }

  if (name !== current.name || year !== current.year) {
    const clash = await prisma.company.findUnique({ where: { name_year: { name, year } } });
    if (clash && clash.id !== id) return { ok: false, message: "이미 등록된 기업입니다." };
  }

  const company = await prisma.company.update({
    where: { id },
    data: {
      name,
      year,
      businessNo,
      industry: patch.industry === undefined ? current.industry : patch.industry,
      isActive: patch.isActive ?? current.isActive,
    },
  });

  return { ok: true, company };
}

/**
 * 기업을 분석 대상에서 제외한다.
 * 행을 지우지 않는다. AnalysisRun 이 참조하므로 삭제하면 이력이 끊긴다.
 */
export async function deactivateCompany(id: number) {
  return updateCompany(id, { isActive: false });
}
