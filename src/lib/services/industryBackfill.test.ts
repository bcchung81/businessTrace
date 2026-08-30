import { describe, expect, it } from "vitest";
import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";
import { needsIndustry, pickIndustry } from "@/lib/services/industryBackfill";

function snap(source: StoredSnapshot["source"], status: StoredSnapshot["status"], industry?: string): StoredSnapshot {
  return { source, status, summary: "", payload: industry === undefined ? {} : { industry }, fetchedAt: new Date("2026-08-31T00:00:00.000Z") };
}

describe("needsIndustry", () => {
  it("wants a fill for empty values and bare numeric codes", () => {
    expect(needsIndustry(null)).toBe(true);
    expect(needsIndustry("")).toBe(true);
    expect(needsIndustry("  ")).toBe(true);
    expect(needsIndustry("58222")).toBe(true);
  });

  it("leaves a real industry name alone", () => {
    expect(needsIndustry("SW")).toBe(false);
    expect(needsIndustry("응용 소프트웨어 개발 및 공급업")).toBe(false);
  });
});

describe("pickIndustry", () => {
  it("prefers the venture registry name over the pension one", () => {
    const industry = pickIndustry([
      snap("nps", "found", "요양병원"),
      snap("venture", "found", "응용 소프트웨어 개발 및 공급업"),
    ]);

    expect(industry).toBe("응용 소프트웨어 개발 및 공급업");
  });

  it("falls back to the pension industry name when venture has none", () => {
    expect(pickIndustry([snap("venture", "absent"), snap("nps", "found", "요양병원")])).toBe("요양병원");
  });

  it("ignores placeholder values and snapshots that are not found", () => {
    expect(pickIndustry([snap("nps", "found", "BIZ_NO미존재사업장")])).toBeNull();
    expect(pickIndustry([snap("venture", "conflict", "응용 소프트웨어 개발 및 공급업")])).toBeNull();
    expect(pickIndustry([snap("nps", "found", "  ")])).toBeNull();
    expect(pickIndustry([snap("nps", "found")])).toBeNull();
    expect(pickIndustry([])).toBeNull();
  });
});
