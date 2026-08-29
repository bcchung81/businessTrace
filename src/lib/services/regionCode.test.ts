import { describe, it, expect } from "vitest";
import {
  compareRegions,
  gazetteer,
  isKnownRegion,
  parseRegion,
  regionKey,
  resolveRegion,
  shortSido,
} from "@/lib/services/regionCode";

describe("parseRegion", () => {
  it("takes the first token as the province and the second as the district", () => {
    expect(parseRegion("서울특별시 관악구 관악로")).toEqual({ sido: "서울특별시", sigungu: "관악구" });
  });

  it("keeps the ward of a non-metropolitan city with its city so 수원시 영통구 stays one district", () => {
    expect(parseRegion("경기도 수원시 영통구 월드컵로")).toEqual({
      sido: "경기도",
      sigungu: "수원시 영통구",
    });
  });

  it("stops at the county and drops the town below it", () => {
    expect(parseRegion("대구광역시 달성군 다사읍 세천로")).toEqual({
      sido: "대구광역시",
      sigungu: "달성군",
    });
  });

  it("leaves the district empty for a province that has none", () => {
    expect(parseRegion("세종특별자치시 한누리대로")).toEqual({ sido: "세종특별자치시", sigungu: null });
  });

  it("keeps a district it cannot verify rather than dropping the address", () => {
    expect(parseRegion("인천광역시 서해구 정서진로")).toEqual({ sido: "인천광역시", sigungu: "서해구" });
  });

  it("collapses repeated spaces before splitting", () => {
    expect(parseRegion("  경상남도   김해시  분성로 602 ")).toEqual({
      sido: "경상남도",
      sigungu: "김해시",
    });
  });

  it("returns nothing for an address it cannot read", () => {
    expect(parseRegion("")).toBeNull();
    expect(parseRegion(null)).toBeNull();
    expect(parseRegion("서울")).toBeNull();
  });
});

describe("shortSido", () => {
  it("trims the administrative suffix so 17 labels fit on a map", () => {
    expect(shortSido("서울특별시")).toBe("서울");
    expect(shortSido("경기도")).toBe("경기");
    expect(shortSido("전북특별자치도")).toBe("전북");
    expect(shortSido("강원특별자치도")).toBe("강원");
    expect(shortSido("경상북도")).toBe("경북");
  });

  it("leaves a name it does not recognise alone", () => {
    expect(shortSido("전남광주통합특별시")).toBe("전남광주통합특별시");
  });
});

describe("regionKey", () => {
  it("joins the two levels so districts of different provinces never collide", () => {
    expect(regionKey({ sido: "경상북도", sigungu: "포항시 남구" })).toBe("경상북도 포항시 남구");
    expect(regionKey({ sido: "세종특별자치시", sigungu: null })).toBe("세종특별자치시");
  });
});

describe("compareRegions", () => {
  it("reports no conflict when every source lands on the same district", () => {
    expect(
      compareRegions([
        { sido: "서울특별시", sigungu: "관악구" },
        { sido: "서울특별시", sigungu: "관악구" },
      ]),
    ).toBeNull();
  });

  it("flags a province-level conflict — 핀텔 is 군산 in one source and 용인 in the other", () => {
    expect(
      compareRegions([
        { sido: "전북특별자치도", sigungu: "군산시" },
        { sido: "경기도", sigungu: "용인시 기흥구" },
      ]),
    ).toBe("sido");
  });

  it("flags a district-level conflict — 에이트테크 is 서해구 in one source and 서구 in the other", () => {
    expect(
      compareRegions([
        { sido: "인천광역시", sigungu: "서해구" },
        { sido: "인천광역시", sigungu: "서구" },
      ]),
    ).toBe("sigungu");
  });

  it("ignores sources that produced no region at all", () => {
    expect(compareRegions([{ sido: "서울특별시", sigungu: "강남구" }, null])).toBeNull();
  });
});

describe("resolveRegion", () => {
  const atlas = gazetteer(
    ["서울특별시", "인천광역시", "광주광역시", "전라남도", "전라북도", "경기도"],
    [
      { sido: "인천광역시", name: "서구" },
      { sido: "광주광역시", name: "북구" },
      { sido: "전라남도", name: "나주시" },
      { sido: "전라북도", name: "군산시" },
      { sido: "경기도", name: "용인시 기흥구" },
    ],
  );

  it("leaves a region the boundary already knows alone", () => {
    expect(resolveRegion({ sido: "인천광역시", sigungu: "서구" }, atlas)).toEqual({
      sido: "인천광역시",
      sigungu: "서구",
    });
  });

  it("follows a province rename — 전북특별자치도 is the 전라북도 the boundary file draws", () => {
    expect(resolveRegion({ sido: "전북특별자치도", sigungu: "군산시" }, atlas)).toEqual({
      sido: "전라북도",
      sigungu: "군산시",
    });
  });

  it("splits a merged province by the district, so 전남광주통합특별시 북구 lands in 광주", () => {
    expect(resolveRegion({ sido: "전남광주통합특별시", sigungu: "북구" }, atlas)).toEqual({
      sido: "광주광역시",
      sigungu: "북구",
    });
  });

  it("sends the other half of the merged province to 전남 because only it has 나주시", () => {
    expect(resolveRegion({ sido: "전남광주통합특별시", sigungu: "나주시" }, atlas)).toEqual({
      sido: "전라남도",
      sigungu: "나주시",
    });
  });

  it("keeps a district the boundary cannot place rather than guessing a neighbour", () => {
    expect(resolveRegion({ sido: "인천광역시", sigungu: "서해구" }, atlas)).toEqual({
      sido: "인천광역시",
      sigungu: "서해구",
    });
  });

  it("changes nothing when there is no boundary file to check against", () => {
    expect(resolveRegion({ sido: "전북특별자치도", sigungu: "군산시" })).toEqual({
      sido: "전북특별자치도",
      sigungu: "군산시",
    });
  });
});

describe("isKnownRegion", () => {
  const atlas = gazetteer(["인천광역시"], [{ sido: "인천광역시", name: "서구" }]);

  it("accepts a district the boundary draws", () => {
    expect(isKnownRegion({ sido: "인천광역시", sigungu: "서구" }, atlas)).toBe(true);
  });

  it("rejects a district the boundary has never heard of", () => {
    expect(isKnownRegion({ sido: "인천광역시", sigungu: "서해구" }, atlas)).toBe(false);
  });

  it("treats every region as known when no boundary file is given", () => {
    expect(isKnownRegion({ sido: "어딘가", sigungu: "어느구" })).toBe(true);
  });
});
