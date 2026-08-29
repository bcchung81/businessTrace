export type Region = { sido: string; sigungu: string | null };

export type RegionConflict = "sido" | "sigungu" | null;

const SIDO_SHORT: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원도: "강원",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전북특별자치도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
};

/**
 * 표기가 달라진 시도의 후보 이름. 개칭·통합이 계속 일어나 원천과 경계 파일의 이름이 어긋난다.
 * 통합 시도는 구성 시도를 모두 세워두고 시군구로 갈라낸다 — 지도가 그릴 수 있는 이름은 경계 파일 쪽이다.
 */
const SIDO_CANDIDATES: Record<string, string[]> = {
  전북특별자치도: ["전라북도"],
  전라북도: ["전북특별자치도"],
  강원특별자치도: ["강원도"],
  강원도: ["강원특별자치도"],
  제주특별자치도: ["제주도"],
  제주도: ["제주특별자치도"],
  전남광주통합특별시: ["광주광역시", "전라남도"],
};

const DISTRICT = /[시군구]$/;

/**
 * 주소에서 시도와 시군구만 뽑는다.
 * 국민연금 주소는 도로명까지만 오므로 시군구가 원천이 허용하는 최대 해상도다.
 */
export function parseRegion(address: string | null | undefined): Region | null {
  const tokens = (address ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const [sido, second, third] = tokens;
  if (tokens.length === 1) return sido in SIDO_SHORT ? { sido, sigungu: null } : null;
  if (!DISTRICT.test(second)) return { sido, sigungu: null };
  if (second.endsWith("시") && third?.endsWith("구")) return { sido, sigungu: `${second} ${third}` };

  return { sido, sigungu: second };
}

/** 지도 라벨용 두 글자 이름. 모르는 표기는 손대지 않는다 — 통합·개편으로 새 이름이 계속 생긴다. */
export function shortSido(name: string) {
  return SIDO_SHORT[name] ?? name;
}

/** 시도까지 붙인 지역 키. 같은 이름의 구가 여러 시도에 있어 시군구만으로는 섞인다. */
export function regionKey(region: Region) {
  return region.sigungu ? `${region.sido} ${region.sigungu}` : region.sido;
}

/**
 * 여러 원천이 낸 지역이 서로 맞는지 본다.
 * 상호 검색을 쓰는 원천은 동명 타사를 물어올 수 있어, 위치도 두 원천 이상 일치해야 확정이다.
 */
export function compareRegions(regions: Array<Region | null>): RegionConflict {
  const known = regions.filter((region): region is Region => region !== null);
  if (known.length < 2) return null;

  const [first] = known;
  if (known.some((region) => region.sido !== first.sido)) return "sido";
  if (known.some((region) => regionKey(region) !== regionKey(first))) return "sigungu";

  return null;
}

export type Gazetteer = { sido: Set<string>; sigungu: Set<string> };

/** 경계 파일이 실제로 그리는 지역 이름 목록. 지역 정규화의 권위는 여기 하나뿐이다. */
export function gazetteer(sido: string[], sigungu: Array<{ sido: string; name: string }>): Gazetteer {
  return {
    sido: new Set(sido),
    sigungu: new Set(sigungu.map((entry) => `${entry.sido} ${entry.name}`)),
  };
}

/** 경계 파일에 이 지역을 그릴 도형이 있는지. 경계가 없으면 판정할 근거가 없으니 참으로 둔다. */
export function isKnownRegion(region: Region, atlas?: Gazetteer) {
  if (!atlas) return true;
  if (!atlas.sido.has(region.sido)) return false;

  return region.sigungu ? atlas.sigungu.has(regionKey(region)) : true;
}

/**
 * 원천이 쓴 지역 표기를 경계 파일이 아는 이름으로 옮긴다.
 * 옮길 수 없으면 원본을 그대로 둔다 — 이웃 지역으로 추측해 앉히면 지도에 없는 근거가 생긴다.
 */
export function resolveRegion(region: Region, atlas?: Gazetteer): Region {
  if (!atlas || isKnownRegion(region, atlas)) return region;

  for (const sido of SIDO_CANDIDATES[region.sido] ?? []) {
    const moved = { sido, sigungu: region.sigungu };
    if (isKnownRegion(moved, atlas)) return moved;
  }

  return region;
}
