import { describe, expect, it } from "vitest";
import { resolveAnalyzer } from "@/lib/services/analyzerChoice";

describe("resolveAnalyzer", () => {
  it("defaults to the LLM analyzer until the Jev gate is passed", () => {
    expect(resolveAnalyzer({})).toBe("llm");
  });

  it("accepts jev in any case and surrounding spaces", () => {
    expect(resolveAnalyzer({ ANALYZER: " JEV " })).toBe("jev");
  });

  it("throws on an unknown value instead of silently falling back", () => {
    expect(() => resolveAnalyzer({ ANALYZER: "jevv" })).toThrow(/ANALYZER/);
  });
});
