import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { refreshVentureList, findCertification } from "@/lib/services/ventureCertification";

const ROWS = [
  {
    업체명: "주식회사 크립토랩",
    벤처확인유형: "벤처투자유형",
    벤처유효시작일: "2025-02-09",
    벤처유효종료일: "2028-02-08",
    "업종명(11차)": "시스템 소프트웨어 개발 및 공급업",
    벤처확인기관: "벤처기업확인기관",
  },
  {
    업체명: "넷록스 주식회사",
    벤처확인유형: "벤처투자유형",
    벤처유효시작일: "2025-12-17",
    벤처유효종료일: "2028-12-16",
    "업종명(11차)": "시스템 소프트웨어 개발 및 공급업",
    벤처확인기관: "벤처기업확인기관",
  },
  {
    업체명: "옥타코 주식회사",
    벤처확인유형: "연구개발유형",
    벤처유효시작일: "2025-05-25",
    벤처유효종료일: "2028-05-24",
    "업종명(11차)": "응용 소프트웨어 개발 및 공급업",
    벤처확인기관: "벤처기업확인기관",
  },
];

function odcloudFetch(rows = ROWS) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const page = Number(new URL(String(input)).searchParams.get("page") ?? "1");
    const body = { currentCount: page === 1 ? rows.length : 0, totalCount: rows.length, data: page === 1 ? rows : [] };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  await resetDatabase();
  process.env.NTS_SERVICE_KEY = "test-key";
});

describe("refreshVentureList", () => {
  it("stores the whole registry so lookup works without another download", async () => {
    const count = await refreshVentureList({ fetchImpl: odcloudFetch() });

    expect(count).toBe(3);
    expect(await prisma.ventureCertification.count()).toBe(3);
  });

  it("keeps a normalised name so 주식회사 prefixes do not break matching", async () => {
    await refreshVentureList({ fetchImpl: odcloudFetch() });

    const stored = await prisma.ventureCertification.findFirst({ where: { normalisedName: "크립토랩" } });
    expect(stored?.companyName).toBe("주식회사 크립토랩");
  });

  it("replaces the previous snapshot instead of accumulating duplicates", async () => {
    await refreshVentureList({ fetchImpl: odcloudFetch() });

    await refreshVentureList({ fetchImpl: odcloudFetch([ROWS[0]]) });

    expect(await prisma.ventureCertification.count()).toBe(1);
  });

  it("refuses to run without a service key", async () => {
    delete process.env.NTS_SERVICE_KEY;

    await expect(refreshVentureList({ fetchImpl: odcloudFetch() })).rejects.toThrow(/NTS_SERVICE_KEY/);
  });
});

describe("findCertification", () => {
  beforeEach(async () => {
    await refreshVentureList({ fetchImpl: odcloudFetch() });
  });

  it("finds a company registered under its full corporate name", async () => {
    const found = await findCertification("크립토랩", new Date("2026-08-28"));

    expect(found).toMatchObject({
      certified: true,
      type: "벤처투자유형",
      validUntil: "2028-02-08",
      companyName: "주식회사 크립토랩",
    });
  });

  it("reports the investment type separately from the R&D type", async () => {
    expect((await findCertification("옥타코", new Date("2026-08-28")))?.type).toBe("연구개발유형");
  });

  it("marks a certification whose validity has run out as expired", async () => {
    const found = await findCertification("크립토랩", new Date("2029-01-01"));

    expect(found).toMatchObject({ certified: false, expired: true });
  });

  it("refuses to attribute a longer-named namesake's certification to the queried company", async () => {
    await refreshVentureList({
      fetchImpl: odcloudFetch([
        {
          업체명: "주식회사 페어리테크",
          벤처확인유형: "벤처투자유형",
          벤처유효시작일: "2025-02-09",
          벤처유효종료일: "2028-02-08",
          "업종명(11차)": "응용 소프트웨어 개발 및 공급업",
          벤처확인기관: "벤처기업확인기관",
        },
      ]),
    });

    const result = await findCertification("페어리", new Date("2026-08-31T00:00:00Z"));

    expect(result).toEqual({ certified: false, expired: false });
  });

  it("returns not certified for a company absent from the registry", async () => {
    const found = await findCertification("존재하지않는회사", new Date("2026-08-28"));

    expect(found).toMatchObject({ certified: false, expired: false });
  });

  it("counts the remaining days so an upcoming expiry can be flagged", async () => {
    const found = await findCertification("크립토랩", new Date("2028-02-01"));

    expect(found?.daysRemaining).toBe(7);
  });
});
