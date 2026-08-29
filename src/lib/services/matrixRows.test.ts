import { describe, expect, it } from "vitest";
import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import { buildMatrixRows, sortMatrixRows } from "@/lib/services/matrixRows";
import type { CompanyNews } from "@/lib/services/newsCoverage";
import type { CompanyVerdict } from "@/lib/services/verdictRollup";

function pipeline(id: number, name: string): CompanyPipelineRow {
  return { id, name, businessNo: null, cells: {} };
}

function verdict(id: number, name: string, over: Partial<CompanyVerdict> = {}): CompanyVerdict {
  return { companyId: id, name, verdict: "verified", faithfulness: 0.9, sourceCoverage: 0.8, evidenceMatch: 0.6, citations: 5, counterEvidence: 0, conflicts: [], runAt: null, ...over };
}

function news(id: number, name: string, latest: string | null): CompanyNews {
  return { companyId: id, name, articles: latest ? 1 : 0, latest };
}

describe("buildMatrixRows", () => {
  it("joins verdict, score, citations and newest article onto the pipeline row", () => {
    const rows = buildMatrixRows(
      [pipeline(1, "크립토랩")],
      [verdict(1, "크립토랩", { verdict: "review", faithfulness: 0.7, citations: 3 })],
      [news(1, "크립토랩", "2026-08-26T00:00:00.000Z")],
    );

    expect(rows[0]).toMatchObject({ id: 1, verdict: "review", faithfulness: 0.7, citations: 3, latestArticle: "2026-08-26T00:00:00.000Z" });
  });

  it("falls back to pending with no score when the company was never analysed", () => {
    const rows = buildMatrixRows([pipeline(2, "옥타코")], [], []);

    expect(rows[0]).toMatchObject({ verdict: "pending", faithfulness: null, citations: 0, latestArticle: null });
  });
});

describe("sortMatrixRows", () => {
  const rows = buildMatrixRows(
    [pipeline(1, "나"), pipeline(2, "가"), pipeline(3, "다")],
    [verdict(1, "나", { verdict: "verified", faithfulness: 0.9 }), verdict(2, "가", { verdict: "risk", faithfulness: 0.4 }), verdict(3, "다", { verdict: "review", faithfulness: 0.7 })],
    [news(1, "나", "2026-08-01T00:00:00.000Z"), news(2, "가", null), news(3, "다", "2026-08-20T00:00:00.000Z")],
  );

  it("triage puts risk first", () => {
    expect(sortMatrixRows(rows, "triage").map((row) => row.name)).toEqual(["가", "다", "나"]);
  });

  it("name sorts in Korean order", () => {
    expect(sortMatrixRows(rows, "name").map((row) => row.name)).toEqual(["가", "나", "다"]);
  });

  it("score sorts by faithfulness ascending with nulls last", () => {
    expect(sortMatrixRows(rows, "score").map((row) => row.name)).toEqual(["가", "다", "나"]);
  });

  it("news sorts oldest article first with none at the top", () => {
    expect(sortMatrixRows(rows, "news").map((row) => row.name)).toEqual(["가", "나", "다"]);
  });
});
