import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { getAuditReportFinancials, parseAuditReportFinancials } from "@/lib/services/dartAuditReport";

const AUDIT_XML = `
<TU ALIGN="RIGHT" AUNIT="WON" AUNITVALUE="1" ENG="(Unit: KRW)">(단위 : 원)</TU>
<TABLE ACLASS="FINANCE" AFIXTABLE="N" WIDTH="849">
<TBODY>
<TR><TE ACODE="11200000040000" ADELIM="0" ALEVEL="0">Ⅰ.유동자산</TE><TE ALIGN="RIGHT" ACODE="11200000040000" ADELIM="1"></TE><TE ALIGN="RIGHT" ACODE="11200000040000" ADELIM="2">1,646,100,805</TE><TE ALIGN="RIGHT" ACODE="11200000040000" ADELIM="3"></TE><TE ALIGN="RIGHT" ACODE="11200000040000" ADELIM="4">1,742,936,125</TE></TR>
<TR><TE ACODE="11500000010000" ADELIM="0" ALIGN="CENTER">자      산      총      계</TE><TE ALIGN="RIGHT" ADELIM="1"></TE><TE ALIGN="RIGHT" ADELIM="2">8,112,399,519</TE><TE ALIGN="RIGHT" ADELIM="3"></TE><TE ALIGN="RIGHT" ADELIM="4">7,008,285,176</TE></TR>
</TBODY>
</TABLE>
<TABLE ACLASS="FINANCE" AFIXTABLE="N" WIDTH="849">
<TBODY>
<TR><TE ADELIM="0">Ⅰ.매출액</TE><TE ADELIM="1"></TE><TE ADELIM="2">2,594,589,201</TE><TE ADELIM="3"></TE><TE ADELIM="4">2,551,883,107</TE></TR>
<TR><TE ADELIM="0">Ⅴ.영업손실</TE><TE ADELIM="1"></TE><TE ADELIM="2">4,434,846,147</TE><TE ADELIM="3"></TE><TE ADELIM="4">5,616,259,051</TE></TR>
<TR><TE ADELIM="0">Ⅹ.당기순손실</TE><TE ADELIM="1"></TE><TE ADELIM="2">4,614,521,325</TE><TE ADELIM="3"></TE><TE ADELIM="4">5,619,046,264</TE></TR>
</TBODY>
</TABLE>
<TABLE ACLASS="FINANCE"><TBODY>
<TR><TE ADELIM="0">1.당기순손실</TE><TE ADELIM="1">(999)</TE></TR>
</TBODY></TABLE>`;

describe("parseAuditReportFinancials", () => {
  it("extracts the four figures, negating loss accounts, with prior-year values", () => {
    expect(parseAuditReportFinancials(AUDIT_XML)).toEqual({
      revenue: 2_594_589_201,
      operatingIncome: -4_434_846_147,
      netIncome: -4_614_521_325,
      totalAssets: 8_112_399_519,
      previous: {
        revenue: 2_551_883_107,
        operatingIncome: -5_616_259_051,
        netIncome: -5_619_046_264,
        totalAssets: 7_008_285_176,
      },
    });
  });

  it("applies the unit multiplier the document declares", () => {
    const xml = `<TU AUNIT="THOUSANDWON" AUNITVALUE="1000">(단위 : 천원)</TU>
<TABLE ACLASS="FINANCE"><TBODY><TR><TE ADELIM="0">자산총계</TE><TE ADELIM="1">2,500</TE></TR></TBODY></TABLE>`;
    expect(parseAuditReportFinancials(xml)?.totalAssets).toBe(2_500_000);
  });

  it("reads a plain-TD statement — some filers use NORMAL tables without ADELIM cells", () => {
    const xml = `<P>Ⅰ. 재무상태표 ······ 6</P>
<P>(단위 : 원)</P>
<TABLE ACLASS="NORMAL" WIDTH="773">
<TBODY>
<TR><TD ALIGN="CENTER">자산 총계</TD><TD>　</TD><TD ALIGN="RIGHT">16,224,847,148</TD><TD ALIGN="RIGHT">18,779,561,759</TD></TR>
<TR><TD>매 출 액</TD><TD>　</TD><TD ALIGN="RIGHT">5,000</TD><TD ALIGN="RIGHT">4,000</TD></TR>
<TR><TD>당기순손실</TD><TD>　</TD><TD ALIGN="RIGHT">(1,200)</TD><TD ALIGN="RIGHT">900</TD></TR>
</TBODY>
</TABLE>`;
    expect(parseAuditReportFinancials(xml)).toMatchObject({
      totalAssets: 16_224_847_148,
      revenue: 5_000,
      netIncome: -1_200,
      previous: { totalAssets: 18_779_561_759, revenue: 4_000, netIncome: -900 },
    });
  });

  it("applies a textual thousand-won unit on plain-TD statements", () => {
    const xml = `<P>(단위 : 천원)</P>
<TABLE ACLASS="NORMAL"><TBODY><TR><TD>자산총계</TD><TD ALIGN="RIGHT">2,500</TD><TD ALIGN="RIGHT">2,000</TD></TR><TR><TD>부채총계</TD><TD ALIGN="RIGHT">1,000</TD><TD ALIGN="RIGHT">900</TD></TR></TBODY></TABLE>`;
    expect(parseAuditReportFinancials(xml)?.totalAssets).toBe(2_500_000);
  });

  it("finds the income statement past a two-table balance sheet, stripping 주석 suffixes", () => {
    const xml = `<TU AUNITVALUE="1">(단위 : 원)</TU>
<TABLE ACLASS="FINANCE"><TBODY><TR><TE ADELIM="0">자산총계</TE><TE ADELIM="1">100</TE></TR></TBODY></TABLE>
<TABLE ACLASS="FINANCE"><TBODY><TR><TE ADELIM="0">부채총계</TE><TE ADELIM="1">40</TE></TR></TBODY></TABLE>
<TABLE ACLASS="FINANCE"><TBODY><TR><TE ADELIM="0">매출액(주석18)</TE><TE ADELIM="1">77</TE></TR></TBODY></TABLE>`;
    expect(parseAuditReportFinancials(xml)).toMatchObject({ totalAssets: 100, revenue: 77 });
  });

  it("skips the note-reference column and reads the last two numeric cells", () => {
    const xml = `<P>(단위 : 원)</P>
<TABLE ACLASS="NORMAL"><TBODY>
<TR><TD>영업수익</TD><TD>26</TD><TD ALIGN="RIGHT">38,636,540,096</TD><TD ALIGN="RIGHT">33,591,928,536</TD></TR>
<TR><TD>영업이익</TD><TD></TD><TD ALIGN="RIGHT">4,676,247,721</TD><TD ALIGN="RIGHT">7,722,984,919</TD></TR>
</TBODY></TABLE>`;
    expect(parseAuditReportFinancials(xml)).toMatchObject({
      revenue: 38_636_540_096,
      operatingIncome: 4_676_247_721,
      previous: { revenue: 33_591_928_536, operatingIncome: 7_722_984_919 },
    });
  });

  it("ignores a table that merely mentions one account — tables of contents and notes are not statements", () => {
    const xml = `<P>(단위 : 원)</P>
<TABLE ACLASS="NORMAL"><TBODY><TR><TD>매출액</TD><TD>15</TD></TR></TBODY></TABLE>
<TABLE ACLASS="NORMAL"><TBODY>
<TR><TD>매출액</TD><TD ALIGN="RIGHT">7,000</TD><TD ALIGN="RIGHT">6,000</TD></TR>
<TR><TD>당기순이익</TD><TD ALIGN="RIGHT">500</TD><TD ALIGN="RIGHT">400</TD></TR>
</TBODY></TABLE>`;
    expect(parseAuditReportFinancials(xml)).toMatchObject({ revenue: 7_000, netIncome: 500 });
  });

  it("keeps a parenthesised negative under a profit-named account — 영업이익 rows can hold losses", () => {
    const xml = `<P>(단위 : 원)</P>
<TABLE ACLASS="NORMAL"><TBODY>
<TR><TD>매출액</TD><TD>24,31</TD><TD ALIGN="RIGHT">14,200,823,617</TD><TD ALIGN="RIGHT">11,399,040,785</TD></TR>
<TR><TD>영업이익</TD><TD></TD><TD ALIGN="RIGHT">(6,452,668,803)</TD><TD ALIGN="RIGHT">(9,444,750,388)</TD></TR>
</TBODY></TABLE>`;
    expect(parseAuditReportFinancials(xml)).toMatchObject({
      revenue: 14_200_823_617,
      operatingIncome: -6_452_668_803,
      previous: { operatingIncome: -9_444_750_388 },
    });
  });

  it("strips short note references like (주23) from account names", () => {
    const xml = `<P>(단위 : 원)</P>
<TABLE ACLASS="NORMAL"><TBODY>
<TR><TD>매출액(주23)</TD><TD ALIGN="RIGHT">16,132,878,567</TD><TD ALIGN="RIGHT">9,217,705,833</TD></TR>
<TR><TD>매출총이익</TD><TD ALIGN="RIGHT">8,781,328,923</TD><TD ALIGN="RIGHT">3,830,091,999</TD></TR>
</TBODY></TABLE>`;
    expect(parseAuditReportFinancials(xml)?.revenue).toBe(16_132_878_567);
  });

  it("returns null when the document has no finance table", () => {
    expect(parseAuditReportFinancials("<TABLE><TBODY><TR><TD>목차</TD></TR></TBODY></TABLE>")).toBeNull();
  });
});

describe("getAuditReportFinancials", () => {
  const zip = zipSync({ "report.xml": strToU8(AUDIT_XML) });

  function dartFetch() {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/list.json")) {
        return new Response(
          JSON.stringify({
            status: "000",
            list: [
              { rcept_no: "consolidated", report_nm: "연결감사보고서 (2025.12)" },
              { rcept_no: "20260401002388", report_nm: "감사보고서 (2025.12)" },
              { rcept_no: "older", report_nm: "감사보고서 (2024.12)" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/document.xml")) return new Response(zip.slice().buffer as ArrayBuffer, { status: 200 });
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
  }

  it("picks the standalone audit report for the fiscal year and parses its statements", async () => {
    process.env.DART_API_KEY = "test-key";
    const fetchImpl = dartFetch();

    const result = await getAuditReportFinancials("01884074", 2025, { fetchImpl });

    expect(result).toMatchObject({ rceptNo: "20260401002388", revenue: 2_594_589_201, totalAssets: 8_112_399_519 });
    const documentCall = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0])).find((url) => url.includes("document.xml"));
    expect(documentCall).toContain("rcept_no=20260401002388");
  });

  it("returns null when the year has no audit report", async () => {
    process.env.DART_API_KEY = "test-key";
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "013", message: "없음" }), { status: 200 })) as unknown as typeof fetch;

    expect(await getAuditReportFinancials("01884074", 2025, { fetchImpl })).toBeNull();
  });
});
