import { describe, expect, it, test } from "vitest";
import { kstDate, kstDateShort, kstMonthDay } from "@/lib/services/kst";

describe("kstDate", () => {
  it("rolls a UTC midnight crossing into the next KST day", () => {
    expect(kstDate("2026-08-31T15:30:00.000Z")).toBe("2026-09-01");
  });

  it("keeps the same day when KST doesn't cross midnight", () => {
    expect(kstDate("2026-08-26T09:00:00.000Z")).toBe("2026-08-26");
  });
});

test("kstDateShort drops the year only inside the current year", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  expect(kstDateShort("2026-03-01T15:00:00Z", now)).toBe("03-02");
  expect(kstDateShort("2025-12-31T15:00:00Z", now)).toBe("01-01");
  expect(kstDateShort("2025-06-01T00:00:00Z", now)).toBe("2025-06-01");
  expect(kstDateShort("2026-12-31T15:00:00Z", now)).toBe("2027-01-01");
});

describe("kstMonthDay", () => {
  it("rolls a UTC midnight crossing into the next KST day", () => {
    expect(kstMonthDay("2026-08-31T15:30:00.000Z")).toBe("09-01");
  });

  it("keeps the same day when KST doesn't cross midnight", () => {
    expect(kstMonthDay("2026-08-26T09:00:00.000Z")).toBe("08-26");
  });
});
