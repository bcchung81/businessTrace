import { describe, expect, test } from "vitest";
import { buildPipelineFacts, type PipelineInputs } from "@/lib/services/pipelineFacts";
import { SOURCE_KEYS } from "@/lib/services/sourceEvidence";

const inputs: PipelineInputs = {
  companies: 50,
  articles: 1214,
  duplicatesRemoved: 312,
  analysed: 48,
  noNews: 2,
  running: 0,
  latestRunAt: "2026-08-30T03:31:00.000Z",
  counts: { verified: 42, review: 7, risk: 0, pending: 1 },
  gateDropouts: { source: 1, faithfulness: 5, evidence: 1 },
  cells: { found: 287, conflict: 4, pending: 51, absent: 8, unmeasurable: 0 },
  events30: 18,
  staleNews: 31,
  reviewCompanies: 12,
  monthLabel: "2026-08",
};

describe("buildPipelineFacts", () => {
  test("lays the four nodes out with their own headline number and two support lines", () => {
    const facts = buildPipelineFacts(inputs);
    expect(facts.nodes.map((n) => n.key)).toEqual(["collect", "analyse", "verify", "check"]);
    expect(facts.nodes[0]).toMatchObject({ title: "수집", sub: "네이버 · 구글", big: "1,214", unit: "기사", lines: ["50/50개사 · 중복 제거 312", "최근 보도 30일 초과 31개사"] });
    expect(facts.nodes[1]).toMatchObject({ title: "분석", sub: "Anthropic", big: "48", unit: "/50개사", lines: ["감성 · 수상 · 투자 · 종합의견", "기사 없음 2 → 별칭 필요"] });
    expect(facts.nodes[2]).toMatchObject({ title: "검증", sub: "4층", big: "42", unit: "통과", lines: ["검토 필요 7 · 리스크 0 · 미분석 1", "탈락 사유 1위 근거 충실도"], active: true });
    expect(facts.nodes[3]).toMatchObject({ title: "대조", sub: "원천 8", big: "287", unit: "/400칸", lines: ["충돌 4 · 미조회 51", "결측 8 · 측정 불가 0"] });
  });

  test("labels the links between nodes with what passes through", () => {
    expect(buildPipelineFacts(inputs).links).toEqual(["primary 기사만", "judge", "사업자번호"]);
  });

  test("names the outputs and the human queue", () => {
    const facts = buildPipelineFacts(inputs);
    expect(facts.outputs).toEqual(["사건 18건 (30일)", "랭킹 50개사", "월간 문서 2026-08"]);
    expect(facts.reviewCompanies).toBe(12);
  });

  test("marks the analysis node active while something runs, otherwise the verify node when it has reviews", () => {
    expect(buildPipelineFacts({ ...inputs, running: 3 }).nodes[1]).toMatchObject({ active: true, lines: ["감성 · 수상 · 투자 · 종합의견", "실행 중 3 · 기사 없음 2"] });
    expect(buildPipelineFacts({ ...inputs, counts: { verified: 50, review: 0, risk: 0, pending: 0 }, gateDropouts: { source: 0, faithfulness: 0, evidence: 0 } }).nodes[2]).toMatchObject({ active: false, lines: ["검토 필요 0 · 리스크 0 · 미분석 0", "탈락 없음"] });
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

    expect(facts.nodes[3].sub).toBe(`원천 ${SOURCE_KEYS.length}`);
    expect(facts.nodes[3].unit).toBe(`/${10 * SOURCE_KEYS.length}칸`);
  });
});
