import { describe, it, expect, beforeEach, vi } from "vitest";
import { zipSync } from "fflate";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { findCorpCandidates, refreshCorpCodes, CORP_CODE_TTL_MS } from "@/lib/services/dartCorpCode";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<result>
  <list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><stock_code>005930</stock_code><modify_date>20250101</modify_date></list>
  <list><corp_code>01234567</corp_code><corp_name>올림플래닛</corp_name><stock_code> </stock_code><modify_date>20240501</modify_date></list>
  <list><corp_code>07654321</corp_code><corp_name>올림플래닛건설</corp_name><stock_code> </stock_code><modify_date>20240502</modify_date></list>
</result>`;

function zipResponse(xml = XML) {
  const archive = zipSync({ "CORPCODE.xml": new TextEncoder().encode(xml) });
  return new Response(archive as unknown as BodyInit, { status: 200 });
}

function fakeFetch(xml = XML) {
  return vi.fn(async () => zipResponse(xml)) as unknown as typeof fetch;
}

function fakeUnzip(xml = XML) {
  return async () => xml;
}

describe("refreshCorpCodes", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.DART_API_KEY = "test-key";
  });

  it("stores every company in the DART registry so name lookup works offline", async () => {
    const count = await refreshCorpCodes({ fetchImpl: fakeFetch(), unzip: fakeUnzip() });

    expect(count).toBe(3);
    expect(await prisma.dartCorpCode.count()).toBe(3);
  });

  it("keeps the stock code only for listed companies", async () => {
    await refreshCorpCodes({ fetchImpl: fakeFetch(), unzip: fakeUnzip() });

    expect((await prisma.dartCorpCode.findUnique({ where: { corpCode: "00126380" } }))?.stockCode).toBe("005930");
    expect((await prisma.dartCorpCode.findUnique({ where: { corpCode: "01234567" } }))?.stockCode).toBeNull();
  });

  it("does not download again while the cache is still fresh", async () => {
    const fetchImpl = fakeFetch();
    await refreshCorpCodes({ fetchImpl, unzip: fakeUnzip() });

    await refreshCorpCodes({ fetchImpl, unzip: fakeUnzip() });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("downloads again once the cache has aged past its TTL", async () => {
    const fetchImpl = fakeFetch();
    await refreshCorpCodes({ fetchImpl, unzip: fakeUnzip() });
    await prisma.dartCorpCode.updateMany({
      data: { fetchedAt: new Date(Date.now() - CORP_CODE_TTL_MS - 1000) },
    });

    await refreshCorpCodes({ fetchImpl, unzip: fakeUnzip() });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses to run without an API key rather than caching an error page", async () => {
    const previous = process.env.DART_API_KEY;
    delete process.env.DART_API_KEY;

    await expect(refreshCorpCodes({ fetchImpl: fakeFetch(), unzip: fakeUnzip() })).rejects.toThrow(
      /DART_API_KEY/,
    );

    process.env.DART_API_KEY = previous;
  });
});

describe("refreshCorpCodes unzip", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.DART_API_KEY = "test-key";
  });

  it("unzips the real ZIP archive DART serves, not a gzip stream", async () => {
    const count = await refreshCorpCodes({ fetchImpl: fakeFetch() });

    expect(count).toBe(3);
  });
});

describe("findCorpCandidates", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.DART_API_KEY = "test-key";
    await refreshCorpCodes({ fetchImpl: fakeFetch(), unzip: fakeUnzip() });
  });

  it("finds a company by its exact registered name", async () => {
    const candidates = await findCorpCandidates("삼성전자");

    expect(candidates[0]).toMatchObject({ corpCode: "00126380", corpName: "삼성전자" });
  });

  it("returns every company whose name starts with the query so the admin can choose", async () => {
    const candidates = await findCorpCandidates("올림플래닛");

    expect(candidates.map((entry) => entry.corpName)).toEqual(["올림플래닛", "올림플래닛건설"]);
  });

  it("puts the exact match first when several names share a prefix", async () => {
    const candidates = await findCorpCandidates("올림플래닛");

    expect(candidates[0].corpName).toBe("올림플래닛");
  });

  it("returns nothing for a company DART has never heard of", async () => {
    expect(await findCorpCandidates("크립토랩")).toEqual([]);
  });
});
