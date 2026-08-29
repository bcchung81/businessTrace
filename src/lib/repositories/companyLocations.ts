import { prisma } from "@/lib/db";
import type { LocatableCompany, SourceAddress } from "@/lib/services/regionRollup";

/**
 * 주소를 싣는 원천을 신뢰 순으로 둔다.
 * 국민연금이 앞이다 — 사업장 단위라 고용 실체가 있는 곳을 가리키고, 나라장터·금융위는 등록 주소라 이전이 늦게 반영된다.
 */
const ADDRESS_SOURCES = ["nps", "narajangteo", "fsc"] as const;

function address(payload: string) {
  try {
    const parsed = JSON.parse(payload) as { address?: unknown };
    return typeof parsed?.address === "string" && parsed.address.trim() ? parsed.address.trim() : null;
  } catch {
    return null;
  }
}

/**
 * 해당 연도 기업마다 원천들이 보고한 주소를 모은다.
 * 주소가 하나도 없는 기업도 남긴다 — 지도에서 빠지면 위치를 모른다는 사실 자체가 사라진다.
 */
export async function listCompanyAddresses(year: number): Promise<Omit<LocatableCompany, "subscribers">[]> {
  const companies = await prisma.company.findMany({
    where: { year, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    include: { sourceSnapshots: { select: { source: true, payload: true } } },
  });

  return companies.map((company) => {
    const found = new Map<string, string>();
    for (const snapshot of company.sourceSnapshots) {
      const value = address(snapshot.payload);
      if (value) found.set(snapshot.source, value);
    }

    const addresses: SourceAddress[] = ADDRESS_SOURCES.filter((source) => found.has(source)).map((source) => ({
      source,
      address: found.get(source) as string,
    }));

    return { companyId: company.id, name: company.name, addresses };
  });
}
