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

/**
 * 주어진 id 목록을 그 순서 그대로 이름과 함께 낸다 — 큐의 순서는 호출자가 정한 것이지 DB 순서가 아니다.
 */
async function queueRows(ids: number[]) {
  const rows = await prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * 상세 화면의 이전·다음 — 같은 연도의 활성 기업을 등록 순서로 본 이웃이다. 제외된 기업에서 열어도 활성 이웃을 준다.
 * within 을 주면 그 id 목록 안에서만 걷는다 — 할 일 큐를 하나씩 처리하는 경로다.
 * 방금 정리해 큐에서 빠진 기업은 position 이 null 이지만 next 는 준다 — 안 그러면 한 건마다 목록으로 돌아가야 한다.
 */
export async function listNeighbours(companyId: number, within?: number[]) {
  const current = await prisma.company.findUnique({
    where: { id: companyId },
    select: { year: true, displayOrder: true, id: true },
  });
  if (!current) return { prev: null, next: null, position: null, total: 0 };
  const rows = within ? await queueRows(within) : await prisma.company.findMany({
    where: { year: current.year, OR: [{ isActive: true }, { id: companyId }] },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  const index = rows.findIndex((row) => row.id === companyId);
  if (index === -1) return { prev: null, next: rows[0] ?? null, position: null, total: rows.length };
  return { prev: rows[index - 1] ?? null, next: rows[index + 1] ?? null, position: index + 1, total: rows.length };
}
