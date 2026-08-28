import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkBusinessStatus, normaliseBusinessNo } from "@/lib/services/nts";

function ntsFetch(payload: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;
}

function body(entry: Record<string, string>) {
  return { status_code: "OK", match_cnt: 1, data: [entry] };
}

const ACTIVE = body({
  b_no: "1248100998",
  b_stt: "계속사업자",
  b_stt_cd: "01",
  tax_type: "부가가치세 일반과세자",
  tax_type_cd: "01",
  end_dt: "",
});

beforeEach(() => {
  process.env.NTS_SERVICE_KEY = "decoding-key+with/special";
});

describe("normaliseBusinessNo", () => {
  it("keeps only the ten digits so hyphenated input works", () => {
    expect(normaliseBusinessNo("120-88-24298")).toBe("1208824298");
  });

  it("rejects anything that is not ten digits", () => {
    expect(normaliseBusinessNo("12345")).toBeNull();
    expect(normaliseBusinessNo("")).toBeNull();
    expect(normaliseBusinessNo("12088242980")).toBeNull();
  });
});

describe("checkBusinessStatus", () => {
  it("reports a trading company as eligible", async () => {
    const result = await checkBusinessStatus("1248100998", { fetchImpl: ntsFetch(ACTIVE) });

    expect(result).toMatchObject({
      checked: true,
      isActive: true,
      statusCode: "01",
      status: "계속사업자",
      taxType: "부가가치세 일반과세자",
    });
  });

  it("reports a closed company as ineligible and keeps the closing date", async () => {
    const result = await checkBusinessStatus("1248100998", {
      fetchImpl: ntsFetch(
        body({ b_no: "1248100998", b_stt: "폐업자", b_stt_cd: "03", tax_type: "", end_dt: "20230630" }),
      ),
    });

    expect(result).toMatchObject({ checked: true, isActive: false, statusCode: "03", closedAt: "20230630" });
  });

  it("treats a suspended company as not currently trading", async () => {
    const result = await checkBusinessStatus("1248100998", {
      fetchImpl: ntsFetch(body({ b_no: "1248100998", b_stt: "휴업자", b_stt_cd: "02", tax_type: "" })),
    });

    expect(result.isActive).toBe(false);
  });

  it("passes the decoding key as a query parameter, never inside the url string", async () => {
    const fetchImpl = ntsFetch(ACTIVE);

    await checkBusinessStatus("1248100998", { fetchImpl });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(new URL(String(url)).searchParams.get("serviceKey")).toBe("decoding-key+with/special");
    expect(String(url)).not.toContain("decoding-key+with/special");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ b_no: ["1248100998"] });
  });

  it("marks an unregistered number as unchecked rather than closed", async () => {
    const result = await checkBusinessStatus("9999999999", {
      fetchImpl: ntsFetch(
        body({
          b_no: "9999999999",
          b_stt: "",
          b_stt_cd: "",
          tax_type: "국세청에 등록되지 않은 사업자등록번호입니다.",
        }),
      ),
    });

    expect(result).toMatchObject({ checked: false, isActive: null });
    expect(result.reason).toContain("등록되지 않은");
  });

  it("refuses an invalid business number without calling the API", async () => {
    const fetchImpl = ntsFetch(ACTIVE);

    const result = await checkBusinessStatus("12345", { fetchImpl });

    expect(result).toMatchObject({ checked: false, isActive: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a missing key instead of pretending the company is ineligible", async () => {
    delete process.env.NTS_SERVICE_KEY;

    const result = await checkBusinessStatus("1248100998", { fetchImpl: ntsFetch(ACTIVE) });

    expect(result).toMatchObject({ checked: false, isActive: null });
    expect(result.reason).toContain("NTS_SERVICE_KEY");
  });

  it("reports an API failure as unchecked, never as a closed business", async () => {
    const result = await checkBusinessStatus("1248100998", {
      fetchImpl: ntsFetch({ message: "unauthorized" }, 401),
    });

    expect(result).toMatchObject({ checked: false, isActive: null });
    expect(result.reason).toContain("401");
  });

  it("reports an empty result set as unchecked", async () => {
    const result = await checkBusinessStatus("1248100998", {
      fetchImpl: ntsFetch({ status_code: "OK", match_cnt: 0, data: [] }),
    });

    expect(result.checked).toBe(false);
  });
});
