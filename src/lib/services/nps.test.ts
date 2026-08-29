import { describe, it, expect, beforeEach, vi } from "vitest";
import { businessNoPrefix, lookupWorkplace } from "@/lib/services/nps";

type Row = Record<string, string | number>;

function envelope(items: Row[] | Row) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_CODE" },
      body: { totalCount: Array.isArray(items) ? items.length : 1, items: { item: items } },
    },
  };
}

/** 오퍼레이션 세 개를 경로로 갈라 응답하는 mock fetch 를 만든다. */
function npsFetch(options: {
  bass: Row[];
  detail?: Record<number, Row>;
  period?: Record<number, Row>;
}) {
  return vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("getBassInfoSearchV2")) {
      return new Response(JSON.stringify(envelope(options.bass)));
    }
    const seq = Number(url.searchParams.get("seq"));
    if (url.pathname.endsWith("getDetailInfoSearchV2")) {
      const row = options.detail?.[seq];
      return new Response(JSON.stringify(envelope(row ? [row] : [])));
    }
    const row = options.period?.[seq];
    return new Response(JSON.stringify(envelope(row ? [row] : [])));
  }) as unknown as typeof fetch;
}

function bassRow(over: Row = {}): Row {
  return {
    seq: 6818460,
    dataCrtYm: "202607",
    wkplNm: "주식회사크립토랩(CryptoLabInc.)",
    bzowrRgstNo: "625870****",
    wkplRoadNmDtlAddr: "서울특별시 관악구 관악로",
    wkplJnngStcd: "1",
    wkplStylDvcd: "1",
    ...over,
  };
}

function detailRow(over: Row = {}): Row {
  return {
    adptDt: "20180601",
    jnngpCnt: 61,
    crrmmNtcAmt: "27000180",
    vldtVlKrnNm: "응용 소프트웨어 개발 및 공급업",
    wkplIntpCd: "722000",
    ...over,
  };
}

const CRYPTOLAB = {
  bass: [bassRow()],
  detail: { 6818460: detailRow() },
  period: { 6818460: { nwAcqzrCnt: 7, lssJnngpCnt: 2 } },
};

beforeEach(() => {
  process.env.NTS_SERVICE_KEY = "decoding-key+with/special";
});

describe("businessNoPrefix", () => {
  it("keeps the first six digits a 10 digit number shares with the pension registry", () => {
    expect(businessNoPrefix("625-87-00800")).toBe("625870");
    expect(businessNoPrefix("6258700800")).toBe("625870");
  });

  it("reads the masked form the registry returns", () => {
    expect(businessNoPrefix("625870****")).toBe("625870");
  });

  it("rejects anything shorter than six digits", () => {
    expect(businessNoPrefix("62587")).toBeNull();
    expect(businessNoPrefix("")).toBeNull();
  });
});

describe("lookupWorkplace", () => {
  it("returns the latest month headcount and notice amount", async () => {
    const workplace = await lookupWorkplace("크립토랩", {}, { fetchImpl: npsFetch(CRYPTOLAB) });

    expect(workplace).toMatchObject({
      found: true,
      companyName: "주식회사크립토랩(CryptoLabInc.)",
      businessNoPrefix: "625870",
      subscribers: 61,
      noticeAmount: 27000180,
      industry: "응용 소프트웨어 개발 및 공급업",
      registeredAt: "20180601",
      isSubscribed: true,
    });
  });

  it("derives the average base income from the notice amount and the 9% rate", async () => {
    const workplace = await lookupWorkplace("크립토랩", {}, { fetchImpl: npsFetch(CRYPTOLAB) });

    expect(workplace.averageBaseIncome).toBe(4918066);
    expect(workplace.annualPayroll).toBe(3600024000);
  });

  it("uses a known business number to reject a namesake the registry ranks first", async () => {
    const fetchImpl = npsFetch({
      bass: [
        bassRow({ seq: 1, wkplNm: "옥타코리아", bzowrRgstNo: "220888****", wkplRoadNmDtlAddr: "서울특별시 강남구" }),
        bassRow({ seq: 2, wkplNm: "옥타코주식회사", bzowrRgstNo: "269810****", wkplRoadNmDtlAddr: "경기도 성남시 수정구 창업로" }),
      ],
      detail: { 1: detailRow({ jnngpCnt: 11 }), 2: detailRow({ jnngpCnt: 13, crrmmNtcAmt: "5449640" }) },
    });

    const workplace = await lookupWorkplace("옥타코", { businessNo: "2698100419" }, { fetchImpl });

    expect(workplace.businessNoPrefix).toBe("269810");
    expect(workplace.subscribers).toBe(13);
  });

  it("uses a region hint to separate companies sharing a name", async () => {
    const fetchImpl = npsFetch({
      bass: [
        bassRow({ seq: 1, wkplNm: "주식회사페어리(PairyCo.,Ltd.)", bzowrRgstNo: "145810****", wkplRoadNmDtlAddr: "서울특별시 관악구 봉천로" }),
        bassRow({ seq: 2, wkplNm: "주식회사 페어리테크", bzowrRgstNo: "115870****", wkplRoadNmDtlAddr: "서울특별시 강남구 역삼로" }),
      ],
      detail: { 1: detailRow({ jnngpCnt: 5 }), 2: detailRow({ jnngpCnt: 8, crrmmNtcAmt: "4072780" }) },
    });

    const workplace = await lookupWorkplace("페어리테크", { region: "서울 강남구" }, { fetchImpl });

    expect(workplace.businessNoPrefix).toBe("115870");
    expect(workplace.subscribers).toBe(8);
  });

  it("sums workplaces of one company so a relocation does not read as a headcount drop", async () => {
    const fetchImpl = npsFetch({
      bass: [
        bassRow({ seq: 10, dataCrtYm: "202607", wkplNm: "논스랩", bzowrRgstNo: "568880****", wkplRoadNmDtlAddr: "서울특별시 마포구 신촌로2안길" }),
        bassRow({ seq: 11, dataCrtYm: "202607", wkplNm: "논스랩", bzowrRgstNo: "568880****", wkplRoadNmDtlAddr: "서울특별시 강서구 마곡중앙8로" }),
      ],
      detail: {
        10: detailRow({ jnngpCnt: 7, crrmmNtcAmt: "1971740" }),
        11: detailRow({ jnngpCnt: 6, crrmmNtcAmt: "1500000" }),
      },
    });

    const workplace = await lookupWorkplace("논스랩", {}, { fetchImpl });

    expect(workplace.subscribers).toBe(13);
    expect(workplace.noticeAmount).toBe(3471740);
    expect(workplace.workplaceCount).toBe(2);
  });

  it("builds the month series and the change across it", async () => {
    const months = ["202605", "202606", "202607"];
    const fetchImpl = npsFetch({
      bass: months.map((ym, index) => bassRow({ seq: 100 + index, dataCrtYm: ym })),
      detail: {
        100: detailRow({ jnngpCnt: 52 }),
        101: detailRow({ jnngpCnt: 54 }),
        102: detailRow({ jnngpCnt: 61 }),
      },
      period: { 102: { nwAcqzrCnt: 7, lssJnngpCnt: 2 } },
    });

    const workplace = await lookupWorkplace("크립토랩", {}, { fetchImpl });

    expect(workplace.months.map((month) => month.ym)).toEqual(months);
    expect(workplace.months.map((month) => month.subscribers)).toEqual([52, 54, 61]);
    expect(workplace.growth).toMatchObject({ from: 52, to: 61, delta: 9 });
    expect(workplace.months.at(-1)).toMatchObject({ hired: 7, departed: 2 });
  });

  it("refuses to pick when two different companies match equally well", async () => {
    const fetchImpl = npsFetch({
      bass: [
        bassRow({ seq: 1, wkplNm: "논스랩", bzowrRgstNo: "568880****", wkplRoadNmDtlAddr: "서울특별시 마포구" }),
        bassRow({ seq: 2, wkplNm: "논스랩", bzowrRgstNo: "111111****", wkplRoadNmDtlAddr: "부산광역시 해운대구" }),
      ],
    });

    const workplace = await lookupWorkplace("논스랩", {}, { fetchImpl });

    expect(workplace.found).toBe(false);
    expect(workplace.reason).toContain("후보");
    expect(workplace.candidates).toHaveLength(2);
    expect(workplace.subscribers).toBeNull();
  });

  it("keeps a missing headcount null rather than zero", async () => {
    const fetchImpl = npsFetch({ bass: [bassRow()], detail: { 6818460: detailRow({ jnngpCnt: 0, crrmmNtcAmt: "" }) } });

    const workplace = await lookupWorkplace("크립토랩", {}, { fetchImpl });

    expect(workplace.subscribers).toBeNull();
    expect(workplace.noticeAmount).toBeNull();
    expect(workplace.averageBaseIncome).toBeNull();
  });

  it("reports a withdrawn workplace instead of hiding it", async () => {
    const fetchImpl = npsFetch({
      bass: [bassRow({ wkplJnngStcd: "2" })],
      detail: { 6818460: detailRow({ scsnDt: "20260101" }) },
    });

    const workplace = await lookupWorkplace("크립토랩", {}, { fetchImpl });

    expect(workplace).toMatchObject({ found: true, isSubscribed: false, withdrawnAt: "20260101" });
  });

  it("reads a single item the API returns unwrapped", async () => {
    const fetchImpl = npsFetch({ bass: [bassRow()], detail: { 6818460: detailRow() } });

    const workplace = await lookupWorkplace("크립토랩", {}, { fetchImpl });

    expect(workplace.found).toBe(true);
  });

  it("passes the decoding key as a query parameter, never inside the url string", async () => {
    const fetchImpl = npsFetch(CRYPTOLAB);

    await lookupWorkplace("크립토랩", {}, { fetchImpl });

    const url = new URL(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]));
    expect(url.searchParams.get("serviceKey")).toBe("decoding-key+with/special");
    expect(url.searchParams.get("wkplNm")).toBe("크립토랩");
    expect(url.searchParams.get("dataType")).toBe("json");
    expect(url.pathname).toContain("/B552015/NpsBplcInfoInqireServiceV2/getBassInfoSearchV2");
  });

  it("reports a missing key instead of calling the API", async () => {
    delete process.env.NTS_SERVICE_KEY;
    const fetchImpl = npsFetch(CRYPTOLAB);

    const workplace = await lookupWorkplace("크립토랩", {}, { fetchImpl });

    expect(workplace.found).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports an API failure as not found rather than throwing", async () => {
    const workplace = await lookupWorkplace("크립토랩", {}, {
      fetchImpl: vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch,
    });

    expect(workplace).toMatchObject({ found: false, subscribers: null });
    expect(workplace.reason).toContain("500");
  });

  it("reports not found when the registry has no such workplace", async () => {
    const workplace = await lookupWorkplace("넷록스", {}, { fetchImpl: npsFetch({ bass: [] }) });

    expect(workplace.found).toBe(false);
    expect(workplace.reason).toContain("찾지 못했");
  });

  it("treats an error result code as a failed lookup, never as an unregistered company", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            response: {
              header: { resultCode: "22", resultMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" },
              body: {},
            },
          }),
        ),
    ) as unknown as typeof fetch;

    const workplace = await lookupWorkplace("넷록스", {}, { fetchImpl });

    expect(workplace).toMatchObject({ found: false, failed: true });
    expect(workplace.reason).toContain("22");
  });

  it("marks a transport failure as failed so it is never stored as a confirmed absence", async () => {
    const workplace = await lookupWorkplace("넷록스", {}, {
      fetchImpl: vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch,
    });

    expect(workplace.failed).toBe(true);
  });

  it("does not call a genuinely empty registry result a failure", async () => {
    const workplace = await lookupWorkplace("없는회사", {}, { fetchImpl: npsFetch({ bass: [] }) });

    expect(workplace.found).toBe(false);
    expect(workplace.failed).toBeUndefined();
  });

  it("retries without spaces when the registry stores the name closed up", async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("getBassInfoSearchV2")) {
        const asked = url.searchParams.get("wkplNm");
        const rows = asked === "코난테크놀로지" ? [bassRow({ wkplNm: "주식회사코난테크놀로지" })] : [];
        return new Response(JSON.stringify(envelope(rows)));
      }
      return new Response(JSON.stringify(envelope([detailRow()])));
    }) as unknown as typeof fetch;

    const workplace = await lookupWorkplace("코난 테크놀로지", {}, { fetchImpl });

    expect(workplace.found).toBe(true);
    expect(workplace.companyName).toBe("주식회사코난테크놀로지");
  });

  it("does not retry when the spaced name already matched", async () => {
    const fetchImpl = npsFetch(CRYPTOLAB);

    await lookupWorkplace("크립토랩", {}, { fetchImpl });

    const searches = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
      String(call[0]).includes("getBassInfoSearchV2"),
    );
    expect(searches).toHaveLength(1);
  });

  it("does not retry a name that has no space to remove", async () => {
    const fetchImpl = npsFetch({ bass: [] });

    await lookupWorkplace("넷록스", {}, { fetchImpl });

    const searches = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
      String(call[0]).includes("getBassInfoSearchV2"),
    );
    expect(searches).toHaveLength(1);
  });

  it("reports no match when a known business number matches none of the namesakes", async () => {
    const fetchImpl = npsFetch({
      bass: [
        bassRow({ seq: 1, wkplNm: "에스디티", bzowrRgstNo: "111111****" }),
        bassRow({ seq: 2, wkplNm: "에스디티", bzowrRgstNo: "222222****" }),
      ],
    });

    const workplace = await lookupWorkplace("SDT", { businessNo: "6308700933" }, { fetchImpl });

    expect(workplace.found).toBe(false);
    expect(workplace.reason).toContain("사업자번호와 일치하는 사업장이 없습니다");
    expect(workplace.reason).not.toContain("지정하세요");
    expect(workplace.candidates).toHaveLength(2);
  });

  it("never calls it ambiguous when the business number settles it", async () => {
    const fetchImpl = npsFetch({
      bass: [
        bassRow({ seq: 1, wkplNm: "같은이름", bzowrRgstNo: "625870****" }),
        bassRow({ seq: 2, wkplNm: "같은이름", bzowrRgstNo: "999999****" }),
      ],
      detail: { 1: detailRow({ jnngpCnt: 61 }) },
    });

    const workplace = await lookupWorkplace("같은이름", { businessNo: "6258700800" }, { fetchImpl });

    expect(workplace).toMatchObject({ found: true, businessNoPrefix: "625870", subscribers: 61 });
  });
});
