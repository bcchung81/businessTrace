import { prisma } from "@/lib/db";
import type { ImportedCompany } from "@/lib/services/companyImport";

/**
 * 선정 명단을 기업 테이블에 반영한다.
 * 같은 (기업명, 연도)는 실패가 아니라 갱신이다 - 명단은 해마다 다시 내려오고 대표자·분야가 바뀐다.
 */
export async function importCompanies(companies: ImportedCompany[]) {
  let created = 0;
  let updated = 0;

  for (const entry of companies) {
    const existing = await prisma.company.findUnique({
      where: { name_year: { name: entry.name, year: entry.year } },
    });

    const data = {
      businessNo: entry.businessNo,
      industry: entry.industry,
      officialName: entry.officialName,
      sector: entry.sector,
      ceoName: entry.ceoName,
    };

    if (existing) {
      await prisma.company.update({ where: { id: existing.id }, data });
      updated += 1;
      continue;
    }

    const displayOrder = await prisma.company.count({ where: { year: entry.year } });
    await prisma.company.create({
      data: { name: entry.name, year: entry.year, displayOrder, ...data },
    });
    created += 1;
  }

  return { created, updated };
}
