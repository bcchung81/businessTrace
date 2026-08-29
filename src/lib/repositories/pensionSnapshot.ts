import { prisma } from "@/lib/db";

export type PensionPoint = {
  ym: string;
  subscribers: number | null;
  noticeAmount: number | null;
  hired: number | null;
  departed: number | null;
};

export type PensionSeriesInput = {
  businessNoPrefix?: string;
  months: PensionPoint[];
};

/**
 * 기업의 월별 연금 스냅샷을 저장한다.
 * 국민연금은 12개월치만 유지하고 매년 지우므로, 매달 받아 여기에 쌓아야 연 단위 추이가 생긴다.
 */
export async function savePensionSeries(companyId: number, input: PensionSeriesInput) {
  for (const month of input.months) {
    const data = {
      subscribers: month.subscribers,
      noticeAmount: month.noticeAmount,
      hired: month.hired,
      departed: month.departed,
      businessNoPrefix: input.businessNoPrefix ?? null,
      fetchedAt: new Date(),
    };

    await prisma.pensionSnapshot.upsert({
      where: { companyId_ym: { companyId, ym: month.ym } },
      create: { companyId, ym: month.ym, ...data },
      update: data,
    });
  }

  return input.months.length;
}

/**
 * 해당 연도 기업을 표시순서대로, 각자의 월별 스냅샷과 함께 낸다.
 * 스냅샷이 없는 기업도 빈 배열로 남긴다 — 없는 것을 빠뜨리면 커버리지를 셀 수 없다.
 */
export async function listPensionSeries(year: number) {
  const companies = await prisma.company.findMany({
    where: { year, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    include: { pensionSnapshots: { orderBy: { ym: "asc" } } },
  });

  return companies.map((company) => ({
    companyId: company.id,
    name: company.name,
    points: company.pensionSnapshots.map((snapshot) => ({
      ym: snapshot.ym,
      subscribers: snapshot.subscribers,
      noticeAmount: snapshot.noticeAmount,
      hired: snapshot.hired,
      departed: snapshot.departed,
    })),
  }));
}
