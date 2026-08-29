import type { Precision } from "@/lib/services/naverGeocode";
import type { RegionConflict } from "@/lib/services/regionCode";

export type GeocodedCompany = {
  companyId: number;
  name: string;
  latitude: number;
  longitude: number;
  precision: Precision;
  subscribers: number;
  conflict: RegionConflict;
  address: string;
};

export type PinState = "verified" | "review" | "risk";

export type MapPin = {
  companyId: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  exact: boolean;
  state: PinState;
  subscribers: number;
  note: string;
};

const MIN_RADIUS = 8;
const MAX_RADIUS = 34;

const NOTE: Record<Precision, string> = {
  building: "건물 단위",
  road: "도로 단위 — 번지가 없어 도로 대표점입니다",
  district: "행정구역 단위 — 도로도 확인되지 않았습니다",
};

/** 충돌이 있으면 리스크, 번지까지 확인되면 검증, 도로까지만이면 검토 — 제품의 상태 색을 그대로 쓴다. */
function pinState(entry: GeocodedCompany): PinState {
  if (entry.conflict) return "risk";

  return entry.precision === "building" ? "verified" : "review";
}

/**
 * 기업을 지도에 얹을 점으로 옮긴다.
 * 반지름은 제곱근이다 — 선형으로 두면 3,034명 한 곳이 화면을 덮고 나머지 49개사가 점으로 뭉갠다.
 */
export function buildPins(companies: GeocodedCompany[]): MapPin[] {
  const peak = Math.max(1, ...companies.map((entry) => entry.subscribers));

  return companies
    .map((entry) => ({
      companyId: entry.companyId,
      name: entry.name,
      latitude: entry.latitude,
      longitude: entry.longitude,
      radius: Math.round(MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(Math.max(0, entry.subscribers) / peak)),
      exact: entry.precision === "building",
      state: pinState(entry),
      subscribers: entry.subscribers,
      note: entry.conflict ? `${NOTE[entry.precision]} · 원천 주소 충돌` : NOTE[entry.precision],
    }))
    .sort((left, right) => left.subscribers - right.subscribers);
}
