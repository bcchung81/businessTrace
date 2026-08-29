const GEOCODE_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";
const REQUEST_TIMEOUT_MS = 10000;

export type Precision = "building" | "road" | "district";

export type GeocodePoint = {
  latitude: number;
  longitude: number;
  roadAddress: string | null;
  precision: Precision;
};

type GeocodeBody = {
  addresses?: Array<{ roadAddress?: string; x?: string; y?: string }>;
  error?: { errorCode?: string; message?: string };
};

const BUILDING = /(로|길)\s?\d/;
const ROAD = /(로|길)$|(로|길)\s/;

/**
 * 주소가 어디까지 짚는지 판정한다.
 * 국민연금은 도로명까지만 주므로 대부분이 road 다 — 핀을 건물로 읽으면 없는 정밀도를 믿게 된다.
 */
export function addressPrecision(address: string): Precision {
  const value = (address ?? "").trim();
  if (BUILDING.test(value)) return "building";
  if (ROAD.test(value)) return "road";

  return "district";
}

/**
 * 네이버 Geocoding 으로 주소를 좌표로 옮긴다.
 * 정밀도는 응답이 아니라 물어본 주소를 기준으로 매긴다 — 네이버는 번지 없는 주소도 대표점을 돌려주기 때문이다.
 */
export async function geocodeAddress(
  address: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<GeocodePoint | null> {
  const keyId = process.env.NEXT_PUBLIC_NCP_MAP_CLIENT_ID;
  const secret = process.env.NCP_MAP_CLIENT_SECRET;
  if (!keyId || !secret) throw new Error("NEXT_PUBLIC_NCP_MAP_CLIENT_ID / NCP_MAP_CLIENT_SECRET 가 필요합니다.");

  const request = deps.fetchImpl ?? fetch;
  const response = await request(`${GEOCODE_URL}?query=${encodeURIComponent(address)}`, {
    headers: { "X-NCP-APIGW-API-KEY-ID": keyId, "X-NCP-APIGW-API-KEY": secret },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = (await response.json()) as GeocodeBody;
  if (body.error) throw new Error(`Maps ${body.error.errorCode}: ${body.error.message}`);

  const [match] = body.addresses ?? [];
  if (!match?.x || !match?.y) return null;

  return {
    latitude: Number(match.y),
    longitude: Number(match.x),
    roadAddress: match.roadAddress ?? null,
    precision: addressPrecision(address),
  };
}
