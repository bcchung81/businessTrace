import { describe, expect, test } from "vitest";
import { buildPipelineFacts, type PipelineInputs } from "@/lib/services/pipelineFacts";
import { SOURCE_KEYS } from "@/lib/services/sourceEvidence";

const inputs: PipelineInputs = {
  companies: 50,
  articles: 1214,
  analysed: 48,
  noNews: 2,
  running: 0,
  counts: { verified: 42, review: 7, risk: 0, pending: 1 },
  cells: { found: 287, conflict: 4, pending: 51, absent: 8, unmeasurable: 0 },
  staleNews: 31,
  reviewCompanies: 12,
};

describe("buildPipelineFacts", () => {
  test("gives each node one headline number and one line naming what needs a hand", () => {
    const facts = buildPipelineFacts(inputs);
    expect(facts.nodes.map((n) => n.key)).toEqual(["collect", "analyse", "verify", "check"]);
    expect(facts.nodes[0]).toMatchObject({ title: "수집", big: "1,214", unit: "기사", line: "보도 30일 초과 31개사" });
    expect(facts.nodes[1]).toMatchObject({ title: "분석", big: "48", unit: "/50개사", line: "기사 없음 2 → 별칭 필요" });
    expect(facts.nodes[2]).toMatchObject({ title: "검증", big: "42", unit: "통과", line: "검토 필요 7 · 리스크 0 · 미분석 1", active: true });
    expect(facts.nodes[3]).toMatchObject({ title: "대조", big: "287", unit: "/400칸", line: "충돌 4 · 미조회 51" });
  });

  test("drops the lines that only describe what a stage does — the provider, the gate, the tally", () => {
    const facts = buildPipelineFacts(inputs);
    const text = JSON.stringify(facts);

    for (const caption of ["네이버 · 구글", "Anthropic", "감성 · 수상 · 투자", "탈락 사유", "중복 제거", "결측", "primary 기사만", "judge", "월간 문서"]) {
      expect(text).not.toContain(caption);
    }
  });

  test("marks the analysis node active while something runs, otherwise the verify node when it has reviews", () => {
    expect(buildPipelineFacts({ ...inputs, running: 3 }).nodes[1]).toMatchObject({ active: true, line: "실행 중 3 · 기사 없음 2" });
    expect(
      buildPipelineFacts({ ...inputs, counts: { verified: 50, review: 0, risk: 0, pending: 0 } }).nodes[2],
    ).toMatchObject({ active: false, line: "검토 필요 0 · 리스크 0 · 미분석 0" });
  });

  test("keeps the human queue count — the band still has to point somewhere", () => {
    expect(buildPipelineFacts(inputs).reviewCompanies).toBe(12);
  });

  test("dashes an empty cohort instead of dividing by zero", () => {
    const facts = buildPipelineFacts({ ...inputs, companies: 0, articles: 0, analysed: 0, cells: { found: 0, conflict: 0, pending: 0, absent: 0, unmeasurable: 0 } });
    expect(facts.nodes[3].unit).toBe("/0칸");
    expect(facts.nodes[0].big).toBe("0");
  });
});
describe("source count", () => {
  test("counts the sources it actually records instead of repeating the number by hand", () => {
    const facts = buildPipelineFacts({ ...inputs, companies: 10 });

    expect(facts.nodes[3].unit).toBe(`/${10 * SOURCE_KEYS.length}칸`);
  });
});
