import { describe, it, expect } from "vitest";
import { conflictStages, MATRIX_STAGES } from "@/lib/services/pipelineMatrix";



describe("MATRIX_STAGES", () => {
  it("puts the cheap stages first and the paid ones last", () => {
    expect(MATRIX_STAGES.map((stage) => stage.key)).toEqual([
      "news",
      "nts",
      "nps",
      "narajangteo",
      "venture",
      "dart",
      "dartFinance",
      "fsc",
      "llm",
      "verify",
    ]);
  });

  it("gives every column a short header and the endpoint behind it", () => {
    for (const stage of MATRIX_STAGES) {
      expect(stage.short.length).toBeLessThanOrEqual(5);
      expect(stage.endpoint).not.toBe("");
    }
  });
});

describe("conflictStages", () => {
  it("ignores a conflict state on a non-source stage such as verify", () => {
    expect(conflictStages({ verify: { state: "conflict" } })).toEqual([]);
  });

  it("keeps source stages that are actually in conflict", () => {
    expect(conflictStages({ dart: { state: "conflict" }, nps: { state: "ok" } })).toEqual(["dart"]);
  });
});
