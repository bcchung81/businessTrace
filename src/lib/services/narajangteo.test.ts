import { describe, it, expect, beforeEach, vi } from "vitest";
import { getProcurementProfile } from "@/lib/services/narajangteo";

function apiFetch(payload: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;
}

function body(items: Array<Record<string, string>>) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
      body: { totalCount: items.length, items },
    },
  };
}

const FOUND = body([
  {
    bizno: "1208824298",
    corpNm: "주식회사 올림플래닛",
    ceoNm: "권재현",
    adrs: "서울특별시 강남구",
    telNo: "02-1234-5678",
    hmpgAdrs: "https://olimplanet.com",
    opbizDt: "20150401",
    emplyeNum: "75",
    corpBsnsDivNm: "물품,일반용역,용역",
    mnfctDivNm: "비제조",
  },
]);

beforeEach(() => {
  process.env.NTS_SERVICE_KEY = "decoding-key+with/special";
});

describe("getProcurementProfile", () => {
  it("returns the procurement profile for a registered supplier", async () => {
    const profile = await getProcurementProfile("1208824298", { fetchImpl: apiFetch(FOUND) });

    expect(profile).toMatchObject({
      found: true,
      corpName: "주식회사 올림플래닛",
      ceoName: "권재현",
      employeeCount: 75,
      businessDivision: "물품,일반용역,용역",
      openedAt: "20150401",
    });
  });

  it("calls the 02 service path that actually exists", async () => {
    const fetchImpl = apiFetch(FOUND);

    await getProcurementProfile("1208824298", { fetchImpl });

    const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain("/1230000/ao/UsrInfoService02/getPrcrmntCorpBasicInfo02");
  });

  it("queries by business number, the only lookup this API supports", async () => {
    const fetchImpl = apiFetch(FOUND);

    await getProcurementProfile("120-88-24298", { fetchImpl });

    const url = new URL(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]));
    expect(url.searchParams.get("inqryDiv")).toBe("3");
    expect(url.searchParams.get("bizno")).toBe("1208824298");
    expect(url.searchParams.get("serviceKey")).toBe("decoding-key+with/special");
  });

  it("reports a supplier that is not registered with 조달청 as simply not found", async () => {
    const profile = await getProcurementProfile("1248100998", { fetchImpl: apiFetch(body([])) });

    expect(profile).toMatchObject({ found: false });
    expect(profile.reason).toContain("조달");
  });

  it("distinguishes a wrong service path from an unsubscribed key", async () => {
    const profile = await getProcurementProfile("1208824298", {
      fetchImpl: apiFetch({
        response: { header: { resultCode: "12", resultMsg: "NO_OPENAPI_SERVICE_ERROR" } },
      }),
    });

    expect(profile.reason).toContain("경로");
  });

  it("says the key is unsubscribed when 조달청 says so", async () => {
    const profile = await getProcurementProfile("1208824298", {
      fetchImpl: apiFetch({
        response: {
          header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" },
        },
      }),
    });

    expect(profile.reason).toContain("미구독");
  });

  it("refuses an invalid business number without calling the API", async () => {
    const fetchImpl = apiFetch(FOUND);

    const profile = await getProcurementProfile("12345", { fetchImpl });

    expect(profile.found).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("leaves the employee count null when 조달청 reports it blank", async () => {
    const profile = await getProcurementProfile("1208824298", {
      fetchImpl: apiFetch(body([{ bizno: "1208824298", corpNm: "올림플래닛", emplyeNum: "" }])),
    });

    expect(profile.employeeCount).toBeNull();
  });
});
