import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDatabase } from "@/lib/test-support/db";
import { prisma } from "@/lib/db";
import { getCompanyProfile, getFinancialSummary } from "@/lib/services/dart";

function jsonFetch(payload: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;
}

const PROFILE_OK = {
  status: "000",
  message: "정상",
  corp_name: "올림플래닛",
  bizr_no: "1208824298",
  jurir_no: "1101110000000",
  ceo_nm: "전강훈",
  induty_code: "62010",
};

const FINANCE_OK = {
  status: "000",
  message: "정상",
  list: [
    { account_nm: "매출액", fs_div: "CFS", thstrm_amount: "300,870,903,000,000", bsns_year: "2024" },
    { account_nm: "영업이익", fs_div: "CFS", thstrm_amount: "32,725,961,000,000", bsns_year: "2024" },
    { account_nm: "당기순이익", fs_div: "CFS", thstrm_amount: "34,451,351,000,000", bsns_year: "2024" },
    { account_nm: "자산총계", fs_div: "CFS", thstrm_amount: "514,531,948,000,000", bsns_year: "2024" },
  ],
};

beforeEach(async () => {
  await resetDatabase();
  process.env.DART_API_KEY = "test-key";
  await prisma.dartCorpCode.create({
    data: { corpCode: "01234567", corpName: "올림플래닛", modifyDate: "20240501" },
  });
});

describe("getCompanyProfile", () => {
  it("returns the business number DART holds so 국세청 lookup becomes possible", async () => {
    const profile = await getCompanyProfile("올림플래닛", { fetchImpl: jsonFetch(PROFILE_OK) });

    expect(profile).toMatchObject({
      found: true,
      corpCode: "01234567",
      businessNo: "1208824298",
      ceoName: "전강훈",
    });
  });

  it("passes the key as a query parameter, never inside the url string", async () => {
    const fetchImpl = jsonFetch(PROFILE_OK);

    await getCompanyProfile("올림플래닛", { fetchImpl });

    const url = new URL(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]));
    expect(url.searchParams.get("crtfc_key")).toBe("test-key");
    expect(url.searchParams.get("corp_code")).toBe("01234567");
  });

  it("reports a company DART has never registered as not found, not as an error", async () => {
    const profile = await getCompanyProfile("크립토랩", { fetchImpl: jsonFetch(PROFILE_OK) });

    expect(profile).toMatchObject({ found: false, reason: "DART 에 등록되지 않은 기업입니다." });
  });

  it("returns the candidates when several registered names share the prefix", async () => {
    await prisma.dartCorpCode.create({
      data: { corpCode: "07654321", corpName: "올림플래닛건설", modifyDate: "20240502" },
    });

    const profile = await getCompanyProfile("올림플래닛건", { fetchImpl: jsonFetch(PROFILE_OK) });

    expect(profile.found).toBe(false);
    expect(profile.candidates?.map((entry) => entry.corpName)).toEqual(["올림플래닛건설"]);
  });

  it("surfaces a DART status code instead of pretending the lookup worked", async () => {
    const profile = await getCompanyProfile("올림플래닛", {
      fetchImpl: jsonFetch({ status: "013", message: "조회된 데이타가 없습니다." }),
    });

    expect(profile).toMatchObject({ found: false });
    expect(profile.reason).toContain("013");
  });
});

describe("getFinancialSummary", () => {
  it("extracts the four headline figures as numbers", async () => {
    const summary = await getFinancialSummary("올림플래닛", 2024, { fetchImpl: jsonFetch(FINANCE_OK) });

    expect(summary).toMatchObject({
      found: true,
      revenue: 300870903000000,
      operatingIncome: 32725961000000,
      netIncome: 34451351000000,
      totalAssets: 514531948000000,
    });
  });

  it("asks for the annual report rather than a quarterly one", async () => {
    const fetchImpl = jsonFetch(FINANCE_OK);

    await getFinancialSummary("올림플래닛", 2024, { fetchImpl });

    const url = new URL(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]));
    expect(url.searchParams.get("reprt_code")).toBe("11011");
    expect(url.searchParams.get("bsns_year")).toBe("2024");
  });

  it("treats an unlisted company with no statements as a normal outcome", async () => {
    const summary = await getFinancialSummary("올림플래닛", 2024, {
      fetchImpl: jsonFetch({ status: "013", message: "조회된 데이타가 없습니다." }),
    });

    expect(summary).toMatchObject({ found: false });
    expect(summary.reason).toContain("013");
  });

  it("returns the figures it could find rather than failing on a partial statement", async () => {
    const summary = await getFinancialSummary("올림플래닛", 2024, {
      fetchImpl: jsonFetch({
        status: "000",
        list: [{ account_nm: "매출액", fs_div: "CFS", thstrm_amount: "1,000", bsns_year: "2024" }],
      }),
    });

    expect(summary).toMatchObject({ found: true, revenue: 1000, operatingIncome: null });
  });

  it("ignores an amount DART reports as a dash", async () => {
    const summary = await getFinancialSummary("올림플래닛", 2024, {
      fetchImpl: jsonFetch({
        status: "000",
        list: [{ account_nm: "매출액", fs_div: "CFS", thstrm_amount: "-", bsns_year: "2024" }],
      }),
    });

    expect(summary.revenue).toBeNull();
  });

  it("does not call DART at all for a company it cannot resolve", async () => {
    const fetchImpl = jsonFetch(FINANCE_OK);

    const summary = await getFinancialSummary("크립토랩", 2024, { fetchImpl });

    expect(summary.found).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("flags a transport failure so it is never read as a company DART does not have", async () => {
    const profile = await getCompanyProfile("올림플래닛", {
      fetchImpl: vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });

    expect(profile.failed).toBe(true);
  });

  it("flags a failed financial lookup so it is not filed as an unpublished statement", async () => {
    const summary = await getFinancialSummary("올림플래닛", 2024, {
      fetchImpl: vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch,
    });

    expect(summary.failed).toBe(true);
  });
});
