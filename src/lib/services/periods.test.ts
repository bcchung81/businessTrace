import { describe, expect, it } from "vitest";
import { periodEndYm, periodKindOf, periodLabel, periodsOfYear, periodYear, prevPeriod } from "@/lib/services/periods";

describe("periods", () => {
  it("recognises year, half and quarter period strings", () => {
    expect(periodKindOf("2025")).toBe("year");
    expect(periodKindOf("2025-H2")).toBe("half");
    expect(periodKindOf("2025-Q3")).toBe("quarter");
  });

  it("maps each period to its end month for a monthly axis", () => {
    expect(periodEndYm("2025")).toBe("202512");
    expect(periodEndYm("2025-H1")).toBe("202506");
    expect(periodEndYm("2025-H2")).toBe("202512");
    expect(periodEndYm("2025-Q1")).toBe("202503");
    expect(periodEndYm("2025-Q4")).toBe("202512");
  });

  it("steps back one period of the same kind, across year boundaries", () => {
    expect(prevPeriod("2026")).toBe("2025");
    expect(prevPeriod("2026-H2")).toBe("2026-H1");
    expect(prevPeriod("2026-H1")).toBe("2025-H2");
    expect(prevPeriod("2026-Q1")).toBe("2025-Q4");
    expect(prevPeriod("2026-Q3")).toBe("2026-Q2");
  });

  it("lists the selectable periods of a year per kind and reads the year back", () => {
    expect(periodsOfYear(2025, "year")).toEqual(["2025"]);
    expect(periodsOfYear(2025, "half")).toEqual(["2025-H1", "2025-H2"]);
    expect(periodsOfYear(2025, "quarter")).toEqual(["2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4"]);
    expect(periodYear("2025-Q3")).toBe(2025);
    expect(periodYear("2026")).toBe(2026);
  });

  it("labels periods in Korean", () => {
    expect(periodLabel("2025")).toBe("2025년");
    expect(periodLabel("2025-H1")).toBe("2025 상반기");
    expect(periodLabel("2025-H2")).toBe("2025 하반기");
    expect(periodLabel("2025-Q3")).toBe("2025 3분기");
  });
});
