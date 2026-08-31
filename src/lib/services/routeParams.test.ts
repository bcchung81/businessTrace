import { describe, expect, it } from "vitest";
import { parseId, parseYear } from "@/lib/services/routeParams";

describe("parseId", () => {
  it("reads a positive integer segment", () => {
    expect(parseId("42")).toBe(42);
  });

  it("refuses anything Prisma would choke on rather than passing NaN down", () => {
    for (const raw of ["abc", "", " ", "1.5", "-3", "0", "1e3", undefined]) {
      expect(parseId(raw)).toBeNull();
    }
  });

  it("refuses a number too large to be a safe integer", () => {
    expect(parseId("99999999999999999999")).toBeNull();
  });
});

describe("parseYear", () => {
  it("reads an integer year", () => {
    expect(parseYear("2026")).toBe(2026);
  });

  it("treats a missing or blank year as absent — Number(null) is 0, which slipped past the guard", () => {
    expect(parseYear(null)).toBeNull();
    expect(parseYear("")).toBeNull();
    expect(parseYear("   ")).toBeNull();
  });

  it("refuses a non-integer year", () => {
    expect(parseYear("abc")).toBeNull();
    expect(parseYear("2026.5")).toBeNull();
  });
});
