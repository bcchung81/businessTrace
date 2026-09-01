import { describe, it, expect, beforeEach, vi } from "vitest";
import { matchAwards, scanAwards, summariseAwards, type ProcurementAward } from "@/lib/services/procurementWins";

function page(items: Array<Record<string, string>>, totalCount = items.length) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
      body: { totalCount, items },
    },
  };
}

function responder(pages: Array<Record<string, unknown>>) {
  let call = 0;
  return vi.fn(async () => {
    const payload = pages[Math.min(call, pages.length - 1)];
    call += 1;
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as unknown as typeof fetch;
}

const ROW = {
  bidNtceNo: "R26BK01550761",
  bidNtceOrd: "000",
  bidClsfcNo: "1",
  rbidNo: "000",
  bidNtceNm: "상용SW 제3자단가계약(옥타코 주식회사, OCTATCO MFA v1.0",
  bidwinnrNm: "옥타코 주식회사",
  bidwinnrBizno: "2698100419",
  sucsfbidAmt: "49500000",
  dminsttNm: "각 수요기관",
  fnlSucsfDate: "2026-06-09",
  rlOpengDt: "2026-06-05 16:00:00",
};

function award(overrides: Partial<ProcurementAward> = {}): ProcurementAward {
  return {
    awardKey: "R26BK01550761-000-1-000",
    bidNoticeNo: "R26BK01550761",
    category: "물품",
    title: "상용SW 제3자단가계약",
    winnerName: "옥타코 주식회사",
    winnerBusinessNo: "2698100419",
    amount: 49500000,
    awardedAt: "2026-06-09",
    agency: "각 수요기관",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.NTS_SERVICE_KEY = "decoding-key+with/special";
});

describe("scanAwards", () => {
  it("calls the as/ prefixed path for goods — the ao/ prefix is a different service", async () => {
    const fetchImpl = responder([page([ROW])]);

    await scanAwards({ from: "20260601", to: "20260630", category: "물품" }, { fetchImpl });

    const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain("/1230000/as/ScsbidInfoService/getScsbidListSttusThngPPSSrch");
  });

  it("calls the service operation for 용역", async () => {
    const fetchImpl = responder([page([])]);

    await scanAwards({ from: "20260601", to: "20260630", category: "용역" }, { fetchImpl });

    const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain("getScsbidListSttusServcPPSSrch");
  });

  it("reads the award into an amount and a date instead of raw strings", async () => {
    const result = await scanAwards(
      { from: "20260601", to: "20260630", category: "물품" },
      { fetchImpl: responder([page([ROW])]) },
    );

    expect(result.awards[0]).toMatchObject({
      awardKey: "R26BK01550761-000-1-000",
      bidNoticeNo: "R26BK01550761",
      category: "물품",
      winnerName: "옥타코 주식회사",
      winnerBusinessNo: "2698100419",
      amount: 49500000,
      awardedAt: "2026-06-09",
      agency: "각 수요기관",
    });
  });

  it("falls back to the opening date when the final award date is blank", async () => {
    const result = await scanAwards(
      { from: "20260601", to: "20260630", category: "물품" },
      { fetchImpl: responder([page([{ ...ROW, fnlSucsfDate: "" }])]) },
    );

    expect(result.awards[0].awardedAt).toBe("2026-06-05");
  });

  it("keeps paging until totalCount is covered", async () => {
    const first = page(
      Array.from({ length: 999 }, (_, i) => ({ ...ROW, bidNtceNo: `A${i}` })),
      1200,
    );
    const second = page(
      Array.from({ length: 201 }, (_, i) => ({ ...ROW, bidNtceNo: `B${i}` })),
      1200,
    );
    const fetchImpl = responder([first, second]);

    const result = await scanAwards({ from: "20260601", to: "20260630", category: "물품" }, { fetchImpl });

    expect(result.awards).toHaveLength(1200);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("reports a wrong service path as a path mismatch, not as an unsubscribed key", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ response: { header: { resultCode: "12", resultMsg: "NO_OPENAPI_SERVICE_ERROR" } } }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const result = await scanAwards({ from: "20260601", to: "20260630", category: "물품" }, { fetchImpl });

    expect(result.failed).toBe(true);
    expect(result.reason).toContain("경로");
  });
});

describe("matchAwards", () => {
  const companies = [
    { id: 1, name: "옥타코", businessNo: "2698100419" },
    { id: 2, name: "크립토랩", businessNo: "6258700800" },
  ];

  it("matches on the ten digit business number", () => {
    const matches = matchAwards([award()], companies);

    expect(matches).toEqual([{ companyId: 1, matchedBy: "bizno", award: award() }]);
  });

  it("does not match a company whose known business number differs", () => {
    const other = award({ winnerName: "옥타코 주식회사", winnerBusinessNo: "1112233444" });

    expect(matchAwards([other], companies)).toEqual([]);
  });

  it("requires the whole normalised name to be equal — 옥타코리아 is not 옥타코", () => {
    const noNumber = [{ id: 1, name: "옥타코", businessNo: null }];
    const other = award({ winnerName: "옥타코리아 주식회사", winnerBusinessNo: null });

    expect(matchAwards([other], noNumber)).toEqual([]);
  });

  it("marks a name-only hit as a candidate rather than a confirmed match", () => {
    const noNumber = [{ id: 1, name: "옥타코", businessNo: null }];
    const hit = award({ winnerBusinessNo: null });

    expect(matchAwards([hit], noNumber)).toEqual([{ companyId: 1, matchedBy: "name", award: hit }]);
  });
});

describe("summariseAwards", () => {
  it("counts only confirmed awards and rolls them up by year", () => {
    const rows = [
      { matchedBy: "bizno" as const, amount: 49500000, awardedAt: "2026-06-09" },
      { matchedBy: "bizno" as const, amount: 10000000, awardedAt: "2026-01-04" },
      { matchedBy: "bizno" as const, amount: 5000000, awardedAt: "2025-11-20" },
      { matchedBy: "name" as const, amount: 99000000, awardedAt: "2026-03-02" },
    ];

    expect(summariseAwards(rows)).toEqual({
      count: 3,
      total: 64500000,
      candidates: 1,
      years: [
        { year: 2026, count: 2, total: 59500000 },
        { year: 2025, count: 1, total: 5000000 },
      ],
    });
  });

  it("reports an empty scan as zero confirmed rather than as missing data", () => {
    expect(summariseAwards([])).toEqual({ count: 0, total: 0, candidates: 0, years: [] });
  });
});
