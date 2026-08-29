import { describe, it, expect, beforeEach, vi } from "vitest";
import { addressPrecision, geocodeAddress } from "@/lib/services/naverGeocode";

function mapsFetch(payload: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;
}

const FOUND = {
  status: "OK",
  meta: { totalCount: 1 },
  addresses: [
    {
      roadAddress: "서울특별시 관악구 관악로 1 서울대학교",
      jibunAddress: "서울특별시 관악구 신림동 산56-1",
      x: "126.9527",
      y: "37.4602",
    },
  ],
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_NCP_MAP_CLIENT_ID = "client";
  process.env.NCP_MAP_CLIENT_SECRET = "secret";
});

describe("addressPrecision", () => {
  it("calls an address with a building number building-level", () => {
    expect(addressPrecision("서울특별시 관악구 관악로 1")).toBe("building");
    expect(addressPrecision("서울특별시 서초구 서운로26길 3, 2층")).toBe("building");
  });

  it("calls an address that stops at the road road-level — 국민연금은 번지를 주지 않는다", () => {
    expect(addressPrecision("서울특별시 관악구 관악로")).toBe("road");
    expect(addressPrecision("경기도 수원시 영통구 월드컵로")).toBe("road");
  });

  it("calls anything shorter than a road district-level", () => {
    expect(addressPrecision("서울특별시 관악구")).toBe("district");
    expect(addressPrecision("")).toBe("district");
  });
});

describe("geocodeAddress", () => {
  it("returns the coordinate with longitude read from x and latitude from y", async () => {
    const result = await geocodeAddress("서울특별시 관악구 관악로 1", { fetchImpl: mapsFetch(FOUND) });

    expect(result).toMatchObject({ longitude: 126.9527, latitude: 37.4602 });
  });

  it("keeps the address NAVER matched so the pin can be checked against the source", async () => {
    const result = await geocodeAddress("서울특별시 관악구 관악로 1", { fetchImpl: mapsFetch(FOUND) });

    expect(result?.roadAddress).toBe("서울특별시 관악구 관악로 1 서울대학교");
  });

  it("carries the precision of the address it was asked about, not of the answer", async () => {
    const result = await geocodeAddress("서울특별시 관악구 관악로", { fetchImpl: mapsFetch(FOUND) });

    expect(result?.precision).toBe("road");
  });

  it("sends the application key on the headers the Maps gateway expects", async () => {
    const fetchImpl = mapsFetch(FOUND);
    await geocodeAddress("서울특별시 관악구 관악로 1", { fetchImpl });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("maps.apigw.ntruss.com/map-geocode/v2/geocode");
    expect((init as RequestInit).headers).toMatchObject({
      "X-NCP-APIGW-API-KEY-ID": "client",
      "X-NCP-APIGW-API-KEY": "secret",
    });
  });

  it("returns nothing when NAVER matched no address", async () => {
    const empty = { status: "OK", meta: { totalCount: 0 }, addresses: [] };

    expect(await geocodeAddress("없는 주소", { fetchImpl: mapsFetch(empty) })).toBeNull();
  });

  it("reports the gateway refusal rather than silently returning nothing", async () => {
    const denied = { error: { errorCode: "210", message: "Permission Denied" } };

    await expect(geocodeAddress("서울특별시 관악구 관악로 1", { fetchImpl: mapsFetch(denied, 401) })).rejects.toThrow(
      /210|Permission/,
    );
  });

  it("refuses to call without the Maps application key instead of burning a request", async () => {
    delete process.env.NCP_MAP_CLIENT_SECRET;

    await expect(geocodeAddress("서울특별시 관악구 관악로 1", { fetchImpl: mapsFetch(FOUND) })).rejects.toThrow(
      /NCP_MAP_CLIENT_SECRET/,
    );
  });
});
