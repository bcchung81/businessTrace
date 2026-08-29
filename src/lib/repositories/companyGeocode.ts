import { prisma } from "@/lib/db";
import type { Precision } from "@/lib/services/naverGeocode";

export type GeocodeInput = {
  address: string;
  source: string;
  precision: Precision;
  roadAddress: string | null;
  latitude: number;
  longitude: number;
};

export type StoredGeocode = GeocodeInput & { companyId: number; name: string };

/**
 * 기업의 좌표를 한 행으로 갱신한다.
 * 이력을 쌓지 않는다 — 화면이 필요한 것은 "지금 어디로 찍히나"이지 조회 로그가 아니다.
 */
export async function saveGeocode(companyId: number, input: GeocodeInput) {
  const data = { ...input, fetchedAt: new Date() };

  return prisma.companyGeocode.upsert({
    where: { companyId },
    create: { companyId, ...data },
    update: data,
  });
}

/** 해당 연도에서 좌표가 잡힌 기업만 표시순서대로 낸다. */
export async function listGeocodes(year: number): Promise<StoredGeocode[]> {
  const companies = await prisma.company.findMany({
    where: { year, isActive: true, geocode: { isNot: null } },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    include: { geocode: true },
  });

  return companies.flatMap((company) =>
    company.geocode
      ? [
          {
            companyId: company.id,
            name: company.name,
            address: company.geocode.address,
            source: company.geocode.source,
            precision: company.geocode.precision as Precision,
            roadAddress: company.geocode.roadAddress,
            latitude: company.geocode.latitude,
            longitude: company.geocode.longitude,
          },
        ]
      : [],
  );
}
