import {
  compareRegions,
  isKnownRegion,
  parseRegion,
  regionKey,
  resolveRegion,
  type Gazetteer,
  type Region,
  type RegionConflict,
} from "@/lib/services/regionCode";

export type SourceAddress = { source: string; address: string };

export type LocatableCompany = {
  companyId: number;
  name: string;
  subscribers: number | null;
  addresses: SourceAddress[];
};

export type LocatedCompany = {
  companyId: number;
  name: string;
  region: Region;
  conflict: RegionConflict;
  subscribers: number;
  addresses: SourceAddress[];
};

export type SidoRollup = {
  sido: string;
  companies: number;
  subscribers: number;
  conflicts: number;
};

export type SigunguRollup = {
  key: string;
  sido: string;
  sigungu: string;
  companies: number;
  subscribers: number;
  conflicts: number;
  names: string[];
};

export type RegionView = {
  sido: SidoRollup[];
  sigungu: SigunguRollup[];
  companies: LocatedCompany[];
  unlocated: string[];
  located: number;
  total: number;
};

function byWeight<T extends { subscribers: number; companies: number }>(left: T, right: T) {
  return right.subscribers - left.subscribers || right.companies - left.companies;
}

/**
 * 원천 주소를 지역 단위로 접어 지도가 그릴 형태로 만든다.
 * 경계가 그릴 수 있는 지역을 낸 첫 원천을 대표로 삼되, 나머지와 어긋나면 충돌로 세어 둔다 — 조용히 하나를 고르면 오답이 지도에 박힌다.
 */
export function buildRegionView(companies: LocatableCompany[], atlas?: Gazetteer): RegionView {
  const located: LocatedCompany[] = [];
  const unlocated: string[] = [];

  for (const entry of companies) {
    const regions = entry.addresses.map((item) => {
      const parsed = parseRegion(item.address);
      return parsed ? resolveRegion(parsed, atlas) : null;
    });
    const region =
      regions.find((item): item is Region => item !== null && isKnownRegion(item, atlas)) ??
      regions.find((item): item is Region => item !== null);
    if (!region) {
      unlocated.push(entry.name);
      continue;
    }

    located.push({
      companyId: entry.companyId,
      name: entry.name,
      region,
      conflict: compareRegions(regions),
      subscribers: entry.subscribers ?? 0,
      addresses: entry.addresses,
    });
  }

  const sido = new Map<string, SidoRollup>();
  const sigungu = new Map<string, SigunguRollup>();

  for (const entry of located) {
    const province = sido.get(entry.region.sido) ?? {
      sido: entry.region.sido,
      companies: 0,
      subscribers: 0,
      conflicts: 0,
    };
    province.companies += 1;
    province.subscribers += entry.subscribers;
    if (entry.conflict) province.conflicts += 1;
    sido.set(province.sido, province);

    if (!entry.region.sigungu) continue;
    const key = regionKey(entry.region);
    const district = sigungu.get(key) ?? {
      key,
      sido: entry.region.sido,
      sigungu: entry.region.sigungu,
      companies: 0,
      subscribers: 0,
      conflicts: 0,
      names: [],
    };
    district.companies += 1;
    district.subscribers += entry.subscribers;
    if (entry.conflict) district.conflicts += 1;
    district.names.push(entry.name);
    sigungu.set(key, district);
  }

  return {
    sido: [...sido.values()].sort(byWeight),
    sigungu: [...sigungu.values()].sort((left, right) => byWeight(left, right) || left.key.localeCompare(right.key, "ko")),
    companies: located,
    unlocated,
    located: located.length,
    total: companies.length,
  };
}
