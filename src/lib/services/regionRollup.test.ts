import { describe, it, expect } from "vitest";
import { gazetteer } from "@/lib/services/regionCode";
import { buildRegionView, type LocatableCompany } from "@/lib/services/regionRollup";

function company(overrides: Partial<LocatableCompany> & { name: string }): LocatableCompany {
  return {
    companyId: 1,
    subscribers: null,
    addresses: [],
    ...overrides,
  };
}

describe("buildRegionView", () => {
  it("rolls companies up by province with their latest headcount", () => {
    const view = buildRegionView([
      company({
        companyId: 1,
        name: "크립토랩",
        subscribers: 61,
        addresses: [{ source: "nps", address: "서울특별시 관악구 관악로" }],
      }),
      company({
        companyId: 2,
        name: "아크릴",
        subscribers: 30,
        addresses: [{ source: "nps", address: "서울특별시 강남구 선릉로" }],
      }),
      company({
        companyId: 3,
        name: "미타운",
        subscribers: 12,
        addresses: [{ source: "nps", address: "경기도 안산시 상록구 한양대학로" }],
      }),
    ]);

    expect(view.sido).toEqual([
      { sido: "서울특별시", companies: 2, subscribers: 91, conflicts: 0 },
      { sido: "경기도", companies: 1, subscribers: 12, conflicts: 0 },
    ]);
  });

  it("aggregates districts so one bubble stands for every company in it", () => {
    const view = buildRegionView([
      company({
        companyId: 1,
        name: "딥로딩",
        subscribers: 10,
        addresses: [{ source: "nps", address: "서울특별시 서초구 서초대로" }],
      }),
      company({
        companyId: 2,
        name: "트위그팜",
        subscribers: 5,
        addresses: [{ source: "nps", address: "서울특별시 서초구 서운로26길" }],
      }),
    ]);

    expect(view.sigungu).toEqual([
      {
        key: "서울특별시 서초구",
        sido: "서울특별시",
        sigungu: "서초구",
        companies: 2,
        subscribers: 15,
        conflicts: 0,
        names: ["딥로딩", "트위그팜"],
      },
    ]);
  });

  it("counts a company whose sources disagree as a conflict and keeps the first source's region", () => {
    const view = buildRegionView([
      company({
        companyId: 1,
        name: "핀텔",
        subscribers: 20,
        addresses: [
          { source: "nps", address: "전북특별자치도 군산시 번영로" },
          { source: "narajangteo", address: "경기도 용인시 기흥구 기흥로" },
        ],
      }),
    ]);

    expect(view.companies[0]).toMatchObject({
      name: "핀텔",
      region: { sido: "전북특별자치도", sigungu: "군산시" },
      conflict: "sido",
    });
    expect(view.sido).toEqual([
      { sido: "전북특별자치도", companies: 1, subscribers: 20, conflicts: 1 },
    ]);
  });

  it("keeps a company with no readable address out of the map but names it", () => {
    const view = buildRegionView([
      company({ companyId: 1, name: "SDT", subscribers: 8, addresses: [] }),
      company({
        companyId: 2,
        name: "아크릴",
        subscribers: 30,
        addresses: [{ source: "nps", address: "서울특별시 강남구 선릉로" }],
      }),
    ]);

    expect(view.unlocated).toEqual(["SDT"]);
    expect(view.located).toBe(1);
    expect(view.total).toBe(2);
  });

  it("treats a missing headcount as zero so the company still shows on the map", () => {
    const view = buildRegionView([
      company({
        companyId: 1,
        name: "휴미템",
        subscribers: null,
        addresses: [{ source: "narajangteo", address: "서울특별시 성동구 뚝섬로" }],
      }),
    ]);

    expect(view.sido).toEqual([
      { sido: "서울특별시", companies: 1, subscribers: 0, conflicts: 0 },
    ]);
  });

  it("orders provinces by headcount so the map legend reads top down", () => {
    const view = buildRegionView([
      company({
        companyId: 1,
        name: "가",
        subscribers: 5,
        addresses: [{ source: "nps", address: "대전광역시 유성구 대덕대로" }],
      }),
      company({
        companyId: 2,
        name: "나",
        subscribers: 50,
        addresses: [{ source: "nps", address: "경상북도 포항시 남구 지곡로" }],
      }),
    ]);

    expect(view.sido.map((entry) => entry.sido)).toEqual(["경상북도", "대전광역시"]);
  });
});

describe("buildRegionView against a boundary file", () => {
  const atlas = gazetteer(
    ["인천광역시", "광주광역시", "전라남도", "전라북도", "경기도"],
    [
      { sido: "인천광역시", name: "서구" },
      { sido: "광주광역시", name: "북구" },
      { sido: "전라남도", name: "나주시" },
      { sido: "전라북도", name: "군산시" },
      { sido: "경기도", name: "용인시 기흥구" },
    ],
  );

  it("prefers the source whose district the boundary can actually draw", () => {
    const view = buildRegionView(
      [
        company({
          companyId: 1,
          name: "에이트테크",
          subscribers: 15,
          addresses: [
            { source: "nps", address: "인천광역시 서해구 정서진로" },
            { source: "narajangteo", address: "인천광역시 서구 정서진로" },
          ],
        }),
      ],
      atlas,
    );

    expect(view.companies[0]).toMatchObject({
      region: { sido: "인천광역시", sigungu: "서구" },
      conflict: "sigungu",
    });
  });

  it("breaks a merged province apart so each company lands on the shape that holds it", () => {
    const view = buildRegionView(
      [
        company({
          companyId: 1,
          name: "한국첨단소재",
          subscribers: 40,
          addresses: [{ source: "nps", address: "전남광주통합특별시 북구 첨단과기로" }],
        }),
        company({
          companyId: 2,
          name: "다온플레이스",
          subscribers: 26,
          addresses: [{ source: "nps", address: "전남광주통합특별시 나주시 빛가람로" }],
        }),
      ],
      atlas,
    );

    expect(view.sido.map((entry) => entry.sido)).toEqual(["광주광역시", "전라남도"]);
  });

  it("stops calling a rename a conflict once both sources resolve to the same province", () => {
    const view = buildRegionView(
      [
        company({
          companyId: 1,
          name: "핀텔",
          subscribers: 38,
          addresses: [
            { source: "nps", address: "전북특별자치도 군산시 번영로" },
            { source: "narajangteo", address: "전라북도 군산시 번영로" },
          ],
        }),
      ],
      atlas,
    );

    expect(view.companies[0].conflict).toBeNull();
    expect(view.companies[0].region).toEqual({ sido: "전라북도", sigungu: "군산시" });
  });
});
