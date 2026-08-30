import { describe, it, expect } from "vitest";
import { toSnapshots, type Evidence } from "@/lib/services/sourceEvidence";

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
          totalAssets: null,
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
