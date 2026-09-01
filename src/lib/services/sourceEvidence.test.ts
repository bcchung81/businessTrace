import { describe, it, expect } from "vitest";
import { procurementSnapshot, toSnapshots, ventureSnapshot, type Evidence } from "@/lib/services/sourceEvidence";

function evidence(over: Partial<Evidence> = {}): Evidence {
  return {
    profile: { found: false, reason: "DART 에 등록되지 않은 기업입니다." },
    financial: null,
    outline: null,
    businessStatus: null,
    procurement: null,
    certification: { certified: false, expired: false },
    pension: {
      found: false,
      subscribers: null,
      noticeAmount: null,
      averageBaseIncome: null,
      annualPayroll: null,
      months: [],
      growth: null,
    },
    ...over,
  };
}

function find(rows: ReturnType<typeof toSnapshots>, source: string) {
  const row = rows.find((entry) => entry.source === source);
  if (!row) throw new Error(`${source} 스냅샷이 없습니다.`);
  return row;
}

describe("toSnapshots", () => {
  it("records every source so a missing one is never silently absent from the screen", () => {
    const rows = toSnapshots(evidence());

    expect(rows.map((row) => row.source)).toEqual([
      "dart",
      "dartFinance",
      "fsc",
      "nts",
      "narajangteo",
      "venture",
      "nps",
    ]);
  });

  it("marks a registered DART company as found", () => {
    const rows = toSnapshots(
      evidence({ profile: { found: true, corpCode: "0012", businessNo: "1208824298" } }),
    );

    expect(find(rows, "dart")).toMatchObject({ status: "found" });
  });

  it("marks DART as conflict when only near-miss candidates came back", () => {
    const rows = toSnapshots(
      evidence({
        profile: {
          found: false,
          candidates: [
            { corpCode: "1", corpName: "옥타코리아", stockCode: null },
            { corpCode: "2", corpName: "옥타코", stockCode: null },
          ],
          reason: "기업명이 정확히 일치하지 않습니다.",
        },
      }),
    );

    expect(find(rows, "dart")).toMatchObject({ status: "conflict" });
    expect(find(rows, "dart").summary).toContain("후보 2");
  });

  it("marks an unregistered company as absent, not as a lookup failure", () => {
    expect(find(toSnapshots(evidence()), "dart")).toMatchObject({ status: "absent" });
  });

  it("holds the tax office at pending while the business number is still missing", () => {
    const rows = toSnapshots(evidence());

    expect(find(rows, "nts")).toMatchObject({ status: "pending" });
    expect(find(rows, "nts").summary).toContain("사업자번호");
  });

  it("counts a closed business as found because closure is a confirmed fact", () => {
    const rows = toSnapshots(
      evidence({
        businessStatus: { checked: true, isActive: false, businessNo: "1208824298", status: "폐업자", closedAt: "20260101" },
      }),
    );

    expect(find(rows, "nts")).toMatchObject({ status: "found" });
    expect(find(rows, "nts").summary).toContain("폐업");
  });

  it("calls an unregistered supplier unmeasurable, because not bidding is not missing data", () => {
    const rows = toSnapshots(
      evidence({
        procurement: { found: false, businessNo: "6258700800", employeeCount: null, reason: "조달청에 등록되지 않은 업체입니다." },
      }),
    );

    expect(find(rows, "narajangteo")).toMatchObject({ status: "unmeasurable" });
  });

  it("marks the pension registry as conflict and keeps the candidate count", () => {
    const rows = toSnapshots(
      evidence({
        pension: {
          found: false,
          subscribers: null,
          noticeAmount: null,
          averageBaseIncome: null,
          annualPayroll: null,
          months: [],
          growth: null,
          candidates: [
            { companyName: "주식회사 페어리테크", businessNoPrefix: "115870" },
            { companyName: "주식회사페어리", businessNoPrefix: "145810" },
          ],
          reason: "동명 후보를 하나로 좁히지 못했습니다.",
        },
      }),
    );

    expect(find(rows, "nps")).toMatchObject({ status: "conflict" });
    expect(find(rows, "nps").summary).toContain("후보 2");
  });

  it("summarises a certified company with the expiry the committee has to watch", () => {
    const rows = toSnapshots(
      evidence({
        certification: {
          certified: true,
          expired: false,
          type: "벤처투자유형",
          validUntil: "2028-02-08",
          daysRemaining: 529,
        },
      }),
    );

    expect(find(rows, "venture")).toMatchObject({ status: "found" });
    expect(find(rows, "venture").summary).toContain("2028-02-08");
  });

  it("keeps the raw response so the screen can show what was actually returned", () => {
    const rows = toSnapshots(evidence({ profile: { found: true, businessNo: "1208824298" } }));

    expect(find(rows, "dart").payload).toMatchObject({ businessNo: "1208824298" });
  });

  it("holds a failed pension lookup at pending, because a failed call is not a confirmed absence", () => {
    const rows = toSnapshots(
      evidence({
        pension: {
          found: false,
          failed: true,
          subscribers: null,
          noticeAmount: null,
          averageBaseIncome: null,
          annualPayroll: null,
          months: [],
          growth: null,
          reason: "국민연금 조회 실패: 국민연금 응답 500",
        },
      }),
    );

    expect(find(rows, "nps")).toMatchObject({ status: "pending" });
    expect(find(rows, "nps").summary).toContain("조회 실패");
  });

  it("holds a failed DART lookup at pending rather than declaring the company unregistered", () => {
    const rows = toSnapshots(
      evidence({ profile: { found: false, failed: true, reason: "DART 응답 500" } }),
    );

    expect(find(rows, "dart")).toMatchObject({ status: "pending" });
  });

  it("reports a suspended business as 휴업, not 폐업", () => {
    const rows = toSnapshots(
      evidence({ businessStatus: { checked: true, isActive: false, businessNo: "1234567890", statusCode: "02", status: "휴업자" } }),
    );

    expect(find(rows, "nts")).toMatchObject({ status: "found", summary: "휴업 · 일자 미상" });
  });

  it("keeps a closed business reported as 폐업 with its closure date", () => {
    const rows = toSnapshots(
      evidence({ businessStatus: { checked: true, isActive: false, businessNo: "1234567890", statusCode: "03", status: "폐업자", closedAt: "20260731" } }),
    );

    expect(find(rows, "nts")).toMatchObject({ status: "found", summary: "폐업 · 20260731" });
  });

  it("reads a matching financial-services number as agreement", () => {
    const rows = toSnapshots(
      evidence({ outline: { found: true, corpName: "옥타코", businessNo: "1018162201", employeeCount: null } }),
      "1018162201",
    );

    expect(find(rows, "fsc")).toMatchObject({ status: "found", summary: "옥타코 · 1018162201 번호 일치" });
  });

  it("marks fsc as conflict when its number disagrees with the one already secured", () => {
    const rows = toSnapshots(
      evidence({ outline: { found: true, corpName: "옥타코", businessNo: "9999999999", employeeCount: null } }),
      "1018162201",
    );

    expect(find(rows, "fsc")).toMatchObject({ status: "conflict", summary: "사업자번호 불일치 · 확보 1018162201 ↔ 금융위 9999999999" });
  });

  it("folds a pension number mismatch to absent instead of asking to pick a namesake", () => {
    const rows = toSnapshots(
      evidence({
        pension: {
          found: false,
          numberMismatch: true,
          subscribers: null,
          noticeAmount: null,
          averageBaseIncome: null,
          annualPayroll: null,
          months: [],
          growth: null,
          candidates: [{ companyName: "엘에스디테크", businessNoPrefix: "614029" }],
          reason: "사업자번호와 일치하는 사업장이 없습니다.",
        },
      }),
    );

    expect(find(rows, "nps")).toMatchObject({ status: "absent", summary: "확보 번호와 일치하는 가입 사업장 없음 — 미가입 가능성" });
  });

  it("an operator decision that the fsc record is a namesake folds it to absent", () => {
    const rows = toSnapshots(
      evidence({ outline: { found: true, corpName: "옥타코", businessNo: "9999999999", employeeCount: null } }),
      "1018162201",
      { fsc: "none" },
    );

    expect(find(rows, "fsc")).toMatchObject({ status: "absent", summary: "운영자가 동명 타사로 확정 — 금융위 미등재" });
  });

  it("an operator decision accepting the fsc record keeps it found despite the number gap", () => {
    const rows = toSnapshots(
      evidence({ outline: { found: true, corpName: "옥타코", businessNo: "9999999999", employeeCount: null } }),
      "1018162201",
      { fsc: "9999999999" },
    );

    expect(find(rows, "fsc")).toMatchObject({ status: "found", summary: "옥타코 · 9999999999 운영자 확정" });
  });

  it("holds a failed financial-services lookup at pending", () => {
    const rows = toSnapshots(
      evidence({ outline: { found: false, failed: true, employeeCount: null, reason: "금융위 응답 500" } }),
    );

    expect(find(rows, "fsc")).toMatchObject({ status: "pending" });
  });

  it("never calls a failed procurement lookup unmeasurable — that would claim the company did not bid", () => {
    const rows = toSnapshots(
      evidence({
        procurement: {
          found: false,
          failed: true,
          businessNo: "6258700800",
          employeeCount: null,
          reason: "조달청 조회 실패",
        },
      }),
    );

    expect(find(rows, "narajangteo")).toMatchObject({ status: "pending" });
  });

  it("labels an audit-report-sourced statement so the screen can cite the origin", () => {
    const rows = toSnapshots(
      evidence({
        financial: { found: true, source: "auditReport", fiscalYear: 2025, revenue: 100, operatingIncome: null, netIncome: null, totalAssets: null, totalLiabilities: null, totalEquity: null },
      }),
    );

    expect(find(rows, "dartFinance")).toMatchObject({ status: "found", summary: "2025년 매출 100 · 감사보고서" });
  });

  it("does not call every absent statement 비외감 — audit-only filers were being mislabeled", () => {
    const rows = toSnapshots(
      evidence({
        financial: { found: false, fiscalYear: 2025, revenue: null, operatingIncome: null, netIncome: null, totalAssets: null, totalLiabilities: null, totalEquity: null },
      }),
    );

    expect(find(rows, "dartFinance")).toMatchObject({ status: "absent", summary: "재무제표 미공시 — 정기·감사보고서 없음" });
  });

  it("holds a failed financial statement lookup at pending, not at unpublished", () => {
    const rows = toSnapshots(
      evidence({
        financial: {
          found: false,
          failed: true,
          fiscalYear: 2026,
          revenue: null,
          operatingIncome: null,
          netIncome: null,
          totalAssets: null, totalLiabilities: null, totalEquity: null,
          reason: "DART 조회 실패",
        },
      }),
    );

    expect(find(rows, "dartFinance")).toMatchObject({ status: "pending" });
  });

  it("reads an operator-decided absence as absent with that reason", () => {
    const rows = toSnapshots(evidence({ profile: { found: false, decidedAbsent: true, reason: "운영자가 DART 미등록으로 확정" } }));
    expect(find(rows, "dart")).toMatchObject({ status: "absent", summary: "운영자가 DART 미등록으로 확정" });
  });
});

describe("procurementSnapshot", () => {
  it("states the confirmed count and total when awards were found", () => {
    const row = procurementSnapshot({ count: 3, total: 64500000, candidates: 0, years: [] });

    expect(row).toMatchObject({ source: "procurement", status: "found" });
    expect(row.summary).toContain("낙찰 3건");
    expect(row.summary).toContain("64,500,000");
  });

  it("calls an empty scan unmeasurable, not absent — 조달 미참여는 실적 0이 아니다", () => {
    const row = procurementSnapshot({ count: 0, total: 0, candidates: 0, years: [] });

    expect(row.status).toBe("unmeasurable");
    expect(row.summary).toContain("미참여");
  });

  it("names name-only hits as unconfirmed rather than counting them", () => {
    const row = procurementSnapshot({ count: 0, total: 0, candidates: 2, years: [] });

    expect(row.status).toBe("unmeasurable");
    expect(row.summary).toContain("상호 일치 후보 2건");
  });
});

describe("procurementSnapshot when the scan did not finish", () => {
  it("refuses to call an incomplete scan 미참여 — that would be a failure read as a fact", () => {
    const row = procurementSnapshot({ count: 0, total: 0, candidates: 0, years: [] }, { complete: false });

    expect(row.status).toBe("pending");
    expect(row.summary).toContain("스캔 미완료");
  });

  it("still reports the awards it did find on an incomplete scan", () => {
    const row = procurementSnapshot({ count: 1, total: 20000000, candidates: 0, years: [] }, { complete: false });

    expect(row.status).toBe("found");
    expect(row.summary).toContain("스캔 미완료");
  });
});

describe("ventureSnapshot", () => {
  it("names the type and the expiry when the certification is live", () => {
    const row = ventureSnapshot({ certified: true, expired: false, type: "벤처투자유형", validUntil: "2028-02-08" });

    expect(row).toMatchObject({ source: "venture", status: "found" });
    expect(row.summary).toContain("2028-02-08");
  });

  it("calls a company that is not on the list absent", () => {
    expect(ventureSnapshot({ certified: false, expired: false }).status).toBe("absent");
  });
});
