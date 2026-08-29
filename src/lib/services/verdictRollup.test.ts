import { describe, expect, it } from "vitest";
import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import {
  rollupVerdicts,
  sortForTriage,
  type VerificationRow,
} from "@/lib/services/verdictRollup";

const COMPANIES = [
  { id: 1, name: "크립토랩" },
  { id: 2, name: "옥타코" },
  { id: 3, name: "아크릴" },
  { id: 4, name: "셀바스" },
];

function verification(over: Partial<VerificationRow> & { companyId: number }): VerificationRow {
  return {
    status: "verified",
    faithfulness: 0.9,
    sourceCoverage: 0.8,
    evidenceMatch: 0.6,
    counterEvidence: 0,
    citations: 6,
    runAt: "2026-08-28T13:19:00.000Z",
    ...over,
  };
}

function pipeline(id: number, conflict = false): CompanyPipelineRow {
  return {
    id,
    name: COMPANIES.find((c) => c.id === id)?.name ?? "",
    businessNo: null,
    cells: { dart: { state: conflict ? "conflict" : "ok", value: "", note: "" } },
  };
}

describe("rollupVerdicts", () => {
  it("marks a company with no completed run as pending", () => {
    const summary = rollupVerdicts({ companies: COMPANIES, verifications: [], pipeline: [] });

    expect(summary.counts).toEqual({ verified: 0, review: 0, risk: 0, pending: 4 });
    expect(summary.companies.every((entry) => entry.verdict === "pending")).toBe(true);
  });

  it("passes a verified run through as verified", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 1 })],
      pipeline: [],
    });

    expect(summary.companies.find((entry) => entry.companyId === 1)?.verdict).toBe("verified");
  });

  it("turns needs_review into review", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 1, status: "needs_review", faithfulness: 0.7 })],
      pipeline: [],
    });

    expect(summary.companies.find((entry) => entry.companyId === 1)?.verdict).toBe("review");
  });

  it("raises risk on counter-evidence even when the judge said verified", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 1, counterEvidence: 1 })],
      pipeline: [],
    });

    expect(summary.companies.find((entry) => entry.companyId === 1)?.verdict).toBe("risk");
  });

  it("raises risk on a source conflict and names the stage", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 2 })],
      pipeline: [pipeline(2, true)],
    });
    const entry = summary.companies.find((row) => row.companyId === 2);

    expect(entry?.verdict).toBe("risk");
    expect(entry?.conflicts).toEqual(["dart"]);
  });

  it("does not treat a needs_review verify cell as a source conflict", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 1, status: "needs_review", faithfulness: 0.7 })],
      pipeline: [
        {
          id: 1,
          name: "크립토랩",
          businessNo: null,
          cells: { verify: { state: "conflict", value: "검토 필요", note: "" } },
        },
      ],
    });
    const entry = summary.companies.find((row) => row.companyId === 1);

    expect(entry?.verdict).toBe("review");
    expect(entry?.conflicts).toEqual([]);
  });

  it("collects every conflicting source stage at once", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 2 })],
      pipeline: [
        {
          id: 2,
          name: "옥타코",
          businessNo: null,
          cells: {
            dart: { state: "conflict", value: "", note: "" },
            nps: { state: "conflict", value: "", note: "" },
          },
        },
      ],
    });
    const entry = summary.companies.find((row) => row.companyId === 2);

    expect(entry?.verdict).toBe("risk");
    expect([...(entry?.conflicts ?? [])].sort()).toEqual(["dart", "nps"]);
  });

  it("does not let a conflict alone promote a pending company", () => {
    const summary = rollupVerdicts({ companies: COMPANIES, verifications: [], pipeline: [pipeline(2, true)] });

    expect(summary.companies.find((row) => row.companyId === 2)?.verdict).toBe("pending");
  });

  it("counts gates as a cumulative funnel that never grows", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [
        verification({ companyId: 1 }),
        verification({ companyId: 2, status: "needs_review", faithfulness: 0.7 }),
        verification({ companyId: 3, status: "needs_review", sourceCoverage: 0.2 }),
      ],
      pipeline: [],
    });

    expect(summary.gates).toEqual({ analysed: 3, source: 2, faithfulness: 1, evidence: 1 });
    expect(summary.gateDropouts).toEqual({ source: 1, faithfulness: 1, evidence: 0 });
  });

  it("averages citations over analysed companies only", () => {
    const summary = rollupVerdicts({
      companies: COMPANIES,
      verifications: [verification({ companyId: 1, citations: 4 }), verification({ companyId: 2, citations: 8 })],
      pipeline: [],
    });

    expect(summary.averageCitations).toBe(6);
  });
});

describe("sortForTriage", () => {
  it("orders risk, review, verified, pending and lowest faithfulness first within a group", () => {
    const sorted = sortForTriage([
      { verdict: "verified" as const, faithfulness: 0.9, name: "가" },
      { verdict: "pending" as const, faithfulness: null, name: "나" },
      { verdict: "review" as const, faithfulness: 0.8, name: "다" },
      { verdict: "review" as const, faithfulness: 0.6, name: "라" },
      { verdict: "risk" as const, faithfulness: 0.4, name: "마" },
    ]);

    expect(sorted.map((row) => row.name)).toEqual(["마", "라", "다", "가", "나"]);
  });
});
