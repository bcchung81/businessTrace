import { describe, it, expect, beforeEach, vi } from "vitest";
import { lookupCorpOutline } from "@/lib/services/fscCorpOutline";

function fscFetch(items: Array<Record<string, string>>, status = 200) {
  const payload = {
    response: {
      header: { resultCode: "00", resultMsg: "정상" },
      body: { totalCount: items.length, items: { item: items } },
    },
  };
  return vi.fn(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;
}

const CRYPTOLAB = {
  crno: "1101116599843",
  corpNm: "주식회사 크립토랩",
  bzno: "6258700800",
  enpEstbDt: "20171215",
  enpEmpeCnt: "55",
  enpBsadr: "서울특별시 관악구 관악로 1",
  enpMainBizNm: "시스템 소프트웨어 개발",
  smenpYn: "Y",
};

beforeEach(() => {
  process.env.NTS_SERVICE_KEY = "decoding-key+with/special";
});

describe("lookupCorpOutline", () => {
  it("finds the business number for a company DART never registered", async () => {
    const outline = await lookupCorpOutline("크립토랩", { fetchImpl: fscFetch([CRYPTOLAB]) });

    expect(outline).toMatchObject({
      found: true,
      businessNo: "6258700800",
      corporateNo: "1101116599843",
      corpName: "주식회사 크립토랩",
      employeeCount: 55,
      establishedAt: "20171215",
    });
  });

  it("passes the decoding key as a query parameter, never inside the url string", async () => {
    const fetchImpl = fscFetch([CRYPTOLAB]);

    await lookupCorpOutline("크립토랩", { fetchImpl });

    const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(new URL(url).searchParams.get("serviceKey")).toBe("decoding-key+with/special");
    expect(url).not.toContain("decoding-key+with/special");
    expect(new URL(url).searchParams.get("corpNm")).toBe("크립토랩");
  });

  it("prefers the exact name when several registered names share a prefix", async () => {
    const outline = await lookupCorpOutline("올림플래닛", {
      fetchImpl: fscFetch([
        { ...CRYPTOLAB, corpNm: "올림플래닛건설", bzno: "1111111111" },
        { ...CRYPTOLAB, corpNm: "올림플래닛", bzno: "1208824298" },
      ]),
    });

    expect(outline.businessNo).toBe("1208824298");
  });

  it("matches a name the registry stores with a corporate prefix", async () => {
    const outline = await lookupCorpOutline("크립토랩", { fetchImpl: fscFetch([CRYPTOLAB]) });

    expect(outline.found).toBe(true);
  });

  it("refuses a longer namesake containing the query — 미타운 must not match 케미타운", async () => {
    const outline = await lookupCorpOutline("미타운", {
      fetchImpl: fscFetch([{ ...CRYPTOLAB, corpNm: "제이더블유케미타운 주식회사", bzno: "2068117321" }]),
    });

    expect(outline).toMatchObject({ found: false });
  });

  it("reports not found when the registry returns nothing", async () => {
    const outline = await lookupCorpOutline("넷록스", { fetchImpl: fscFetch([]) });

    expect(outline).toMatchObject({ found: false });
    expect(outline.reason).toContain("찾지 못했");
  });

  it("treats a zero employee count as unknown rather than a company with no staff", async () => {
    const outline = await lookupCorpOutline("올림플래닛", {
      fetchImpl: fscFetch([{ ...CRYPTOLAB, corpNm: "올림플래닛", enpEmpeCnt: "0" }]),
    });

    expect(outline.employeeCount).toBeNull();
  });

  it("returns no business number when the registry leaves it blank", async () => {
    const outline = await lookupCorpOutline("페어리", {
      fetchImpl: fscFetch([{ ...CRYPTOLAB, corpNm: "페어리", bzno: "" }]),
    });

    expect(outline.found).toBe(true);
    expect(outline.businessNo).toBeUndefined();
  });

  it("reports a missing key instead of calling the API", async () => {
    delete process.env.NTS_SERVICE_KEY;
    const fetchImpl = fscFetch([CRYPTOLAB]);

    const outline = await lookupCorpOutline("크립토랩", { fetchImpl });

    expect(outline.found).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports an API failure as not found rather than throwing", async () => {
    const outline = await lookupCorpOutline("크립토랩", {
      fetchImpl: vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch,
    });

    expect(outline).toMatchObject({ found: false });
    expect(outline.reason).toContain("500");
  });
  it("flags a transport failure so a caller never reads it as an unregistered company", async () => {
    const outline = await lookupCorpOutline("크립토랩", {
      fetchImpl: vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch,
    });

    expect(outline.failed).toBe(true);
  });

  it("does not flag a genuinely empty registry result", async () => {
    const outline = await lookupCorpOutline("넷록스", { fetchImpl: fscFetch([]) });

    expect(outline.failed).toBeUndefined();
  });
});
